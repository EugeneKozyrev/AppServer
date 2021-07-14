/*
 *
 * (c) Copyright Ascensio System Limited 2010-2020
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/


using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Authentication;
using System.Threading;
using System.Threading.Tasks;

using ASC.Common.Logging;
using ASC.Core;
using ASC.Core.Common.Caching;
using ASC.Core.Notify.Signalr;
using ASC.Core.Users;
using ASC.Data.Storage;
using ASC.Mail.Clients.Imap;
using ASC.Mail.Configuration;
using ASC.Mail.Core.Dao;
using ASC.Mail.Core.Dao.Expressions.Message;
using ASC.Mail.Core.Engine;
using ASC.Mail.Core.Entities;
using ASC.Mail.Enums;
using ASC.Mail.Extensions;
using ASC.Mail.Models;
using ASC.Mail.Storage;
using ASC.Mail.Utils;

using MailKit;
using MailKit.Net.Imap;
using MailKit.Security;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

using MimeKit;

using MailFolder = ASC.Mail.Models.MailFolder;

namespace ASC.Mail.ImapSync
{
    public class MailImapClient : IDisposable
    {
        public ConcurrentDictionary<string, List<MailSieveFilterData>> Filters { get; set; }

        private const int SIGNALR_WAIT_SECONDS = 30;

        private readonly MailEnginesFactory _mailEnginesFactory;
        private readonly MailSettings _mailSettings;
        private readonly MailInfoDao _mailInfoDao;
        private readonly StorageFactory _storageFactory;
        private readonly FolderEngine _folderEngine;
        private readonly UserManager _userManager;
        private readonly SignalrServiceClient _signalrServiceClient;

        const MessageSummaryItems SummaryItems = MessageSummaryItems.UniqueId | MessageSummaryItems.Flags | MessageSummaryItems.Envelope | MessageSummaryItems.BodyStructure;

        readonly bool crmAvailable;

        public MailBoxData Account { get; private set; }
        public ILog Log { get; set; }

        protected ImapClient Imap { get; private set; }

        private CancellationTokenSource DoneToken { get; set; }
        private CancellationToken CancelToken { get; set; }
        private CancellationTokenSource StopTokenSource { get; set; }

        private readonly SemaphoreSlim ImapSemaphore;

        private Dictionary<IMailFolder, MailFolder> foldersDictionary;

        private bool ClientIsReadyToWork = false;

        private ConcurrentQueue<IMailFolder> imapFoldersToUpdate;

        private ConcurrentQueue<int> imapMessagesToUpdate;

        public IMailFolder WorkFolder;

        private Timer _deathTimer;

        public event EventHandler DeleteClient;

        private void ImapMessageFlagsChanged(object sender, MessageFlagsChangedEventArgs e)
        {
            if (sender is IMailFolder imap_folder)
            {
                Log.Debug($"ImapMessageFlagsChanged. Folder={imap_folder.FullName} Index={e.Index} Flags={e.Flags}. imapMessagesToUpdate.Count={imapMessagesToUpdate.Count}");

                imapMessagesToUpdate.Enqueue(e.Index);

                DoneTokenUpdate();
            }
        }

        private void ImapCountChanged(object sender, EventArgs e)
        {
            if (sender is IMailFolder imap_folder)
            {
                Log.Debug($"ImapCountChanged. Folder={imap_folder.FullName} Count={imap_folder.Count}.");

                imapFoldersToUpdate.Enqueue(imap_folder);

                DoneTokenUpdate();
            }
        }

        public async void CheckRedis(int folderActivity, IEnumerable<int> tags, RedisClient _redisClient)
        {
            var activFolder = (FolderType)folderActivity;

            if (foldersDictionary == null) return;

            var folderFromDictionary = foldersDictionary.FirstOrDefault(x => x.Value.Folder == activFolder);

            //if (folderFromDictionary. == null) return;

            var activFolderImap = folderFromDictionary.Key;

            if (activFolderImap != null && WorkFolder != activFolderImap)
            {
                WorkFolder = activFolderImap;
                Log.Debug($"CheckRedis. WorkFolder change to {WorkFolder.FullName} Count={WorkFolder.Count}.");
            }

            if (ClientIsReadyToWork)
            {
                await ProcessActionFromRedis(_redisClient);
            }

            DoneTokenUpdate();
        }

        public MailImapClient(MailBoxData mailbox, CancellationToken cancelToken, MailSettings mailSettings, IServiceProvider serviceProvider, ILog log = null)
        {
            _mailSettings = mailSettings;

            var clientScope = serviceProvider.CreateScope().ServiceProvider;

            var protocolLogger = !string.IsNullOrEmpty(_mailSettings.ProtocolLogPath)
                ? (IProtocolLogger)
                    new ProtocolLogger(_mailSettings.ProtocolLogPath + $"\\imap_{mailbox.MailBoxId}_{Thread.CurrentThread.ManagedThreadId}.log", true)
                : new NullProtocolLogger();

            imapMessagesToUpdate = new ConcurrentQueue<int>();
            imapFoldersToUpdate = new ConcurrentQueue<IMailFolder>();

            Filters = new ConcurrentDictionary<string, List<MailSieveFilterData>>();

            var tenantManager = clientScope.GetService<TenantManager>();

            tenantManager.SetCurrentTenant(mailbox.TenantId);

            var securityContext = clientScope.GetService<SecurityContext>();
            securityContext.AuthenticateMe(new Guid(mailbox.UserId));

            _mailEnginesFactory = clientScope.GetService<MailEnginesFactory>();
            _mailInfoDao = clientScope.GetService<MailInfoDao>();
            _storageFactory = clientScope.GetService<StorageFactory>();
            _folderEngine = clientScope.GetService<FolderEngine>();
            _userManager = clientScope.GetService<UserManager>();
            _signalrServiceClient = clientScope.GetService<IOptionsSnapshot<SignalrServiceClient>>().Get("mail");

            Account = mailbox;

            Log = log ?? new NullLog();

            crmAvailable = false;// mailbox.IsCrmAvailable(_mailSettings.DefaultApiSchema, Log);

            StopTokenSource = new CancellationTokenSource();

            CancelToken = CancellationTokenSource.CreateLinkedTokenSource(cancelToken, StopTokenSource.Token).Token;

            Imap = new ImapClient(protocolLogger)
            {
                Timeout = _mailSettings.TcpTimeout
            };


            //if (certificatePermit)
            //    Imap.ServerCertificateValidationCallback = (sender, certificate, chain, errors) => true;

            Imap.Disconnected += Imap_Disconnected;

            ImapSemaphore = new SemaphoreSlim(1, 1);

            _deathTimer = new Timer(_deathTimer_Elapsed, this, _mailSettings.ImapClienLifeTimeSecond, -1);

            _ = CreateConnection();
        }

        private void _deathTimer_Elapsed(object state)
        {
            Log.Debug($"Client {Imap}: Death timer elapsed.");

            DoneToken?.Cancel();

            StopTokenSource?.Cancel();

            DeleteClient?.Invoke(this, EventArgs.Empty);
        }

        private async Task CreateConnection(int workFolder = 1)
        {
            await ImapSemaphore.WaitAsync();

            try
            {
                if (!Imap.IsConnected || !Imap.IsAuthenticated) await LoginImap();

                await LoadFoldersFromIMAP(workFolder);

                foreach (var foldersDictionaryItem in foldersDictionary)
                {
                    await SynchronizeMailFolderFromImap(foldersDictionaryItem.Key, foldersDictionaryItem.Value);
                }
            }
            catch (Exception ex)
            {
                Log.Error($"CreateConnection->Error: {ex.Message}");
            }
            finally
            {
                ImapSemaphore.Release();
            }

            ClientIsReadyToWork = true;

            SetIdleState();
        }

        private void Imap_Disconnected(object sender, DisconnectedEventArgs e)
        {
            ClientIsReadyToWork = false;

            Log.Debug($"Client {Imap} disconected.");

            Imap.Inbox.MessageFlagsChanged -= ImapMessageFlagsChanged;
            Imap.Inbox.CountChanged -= ImapCountChanged;

            if (e.IsRequested)
            {
                _ = CreateConnection();
            }
            else
            {
                Log.Info("MailClient->Dispose()");

                DoneToken?.Cancel();

                StopTokenSource.Cancel();

                Dispose();
            }
        }

        public void Dispose()
        {
            Log.Info("MailClient->Dispose()");

            ClientIsReadyToWork = false;

            DoneToken?.Cancel();

            try
            {
                if (Imap.IsConnected)
                {
                    Imap.Disconnected -= Imap_Disconnected;

                    Imap.Disconnect(true);
                }

                Imap?.Dispose();

                StopTokenSource?.Dispose();

                DoneToken?.Dispose();
            }
            catch (Exception ex)
            {
                Log.ErrorFormat("MailClient->Dispose(Mb_Id={0} Mb_Addres: '{1}') Exception: {2}", Account.MailBoxId,
                    Account.EMail.Address, ex.Message);
            }
        }

        public async Task LoginImap(bool enableUtf8 = true)
        {
            if (Imap.IsAuthenticated) return;

            var secureSocketOptions = SecureSocketOptions.Auto;
            var sslProtocols = SslProtocols.Default;

            switch (Account.Encryption)
            {
                case EncryptionType.StartTLS:
                    secureSocketOptions = SecureSocketOptions.StartTlsWhenAvailable;
                    sslProtocols = SslProtocols.Tls | SslProtocols.Tls11 | SslProtocols.Tls12;
                    break;
                case EncryptionType.SSL:
                    secureSocketOptions = SecureSocketOptions.SslOnConnect;
                    sslProtocols = SslProtocols.Tls | SslProtocols.Tls11 | SslProtocols.Tls12;
                    break;
                case EncryptionType.None:
                    secureSocketOptions = SecureSocketOptions.None;
                    sslProtocols = SslProtocols.None;
                    break;
            }

            Log.DebugFormat("Imap.Connect({0}:{1}, {2})", Account.Server, Account.Port,
                Enum.GetName(typeof(SecureSocketOptions), secureSocketOptions));

            Imap.SslProtocols = sslProtocols;

            if (!Imap.IsConnected) await Imap.ConnectAsync(Account.Server, Account.Port, secureSocketOptions, CancelToken);

            try
            {
                if (enableUtf8 && (Imap.Capabilities & ImapCapabilities.UTF8Accept) != ImapCapabilities.None)
                {
                    Log.Debug("Imap.EnableUTF8");

                    await Imap.EnableUTF8Async(CancelToken);
                }

                if (string.IsNullOrEmpty(Account.OAuthToken))
                {
                    Log.DebugFormat("Imap.Authentication({0})", Account.Account);

                    await Imap.AuthenticateAsync(Account.Account, Account.Password, CancelToken);
                }
                else
                {
                    Log.DebugFormat("Imap.AuthenticationByOAuth({0})", Account.Account);

                    var oauth2 = new SaslMechanismOAuth2(Account.Account, Account.AccessToken);

                    await Imap.AuthenticateAsync(oauth2, CancelToken);
                }

                Imap.Inbox.MessageFlagsChanged += ImapMessageFlagsChanged;
                Imap.Inbox.CountChanged += ImapCountChanged;

                SetMailboxAuthError(false);
            }
            catch (AggregateException aggEx)
            {
                SetMailboxAuthError(true);

                if (aggEx.InnerException != null)
                {
                    throw aggEx.InnerException;
                }
                throw new Exception("LoginImap failed", aggEx);
            }
        }

        public async Task LoadFoldersFromIMAP(int workFolder = 1)
        {
            if (foldersDictionary == null) foldersDictionary = new Dictionary<IMailFolder, MailFolder>();
            else return;

            try
            {
                var rootFolder = await Imap.GetFolderAsync(Imap.PersonalNamespaces[0].Path);

                var subfolders = await GetImapSubFolders(rootFolder);

                var foldersIMAP = subfolders.Where(x => !_mailSettings.SkipImapFlags.Contains(x.Name.ToLowerInvariant()))
                    .Where(x => !x.Attributes.HasFlag(FolderAttributes.NoSelect))
                    .Where(x => !x.Attributes.HasFlag(FolderAttributes.NonExistent))
                    .ToList();

                WorkFolder = Imap.Inbox;

                foreach (var folderIMAP in foldersIMAP)
                {
                    if (CancelToken.IsCancellationRequested) return;

                    var dbFolder = DetectFolder(folderIMAP);

                    if (dbFolder == null)
                    {
                        Log.Debug($"{folderIMAP.Name}-> skipped");
                        continue;
                    }

                    foldersDictionary.Add(folderIMAP, dbFolder);
                }

                var inboxFolders = foldersDictionary.Where(x => x.Value.Folder == FolderType.Inbox && x.Key != WorkFolder).ToList();

                //foreach(var inboxFolder in inboxFolders)
                //{
                //    var log = LogManager.GetLogger($"ASC.Mail.ImapSyncService.Mbox_{Account.MailBoxId}_{inboxFolder.Key.FullName}");

                //    SimpleImapClient simpleImapClient = new SimpleImapClient(Account, inboxFolder.Value, CancelToken, tasksConfig,
                //            Account.IsTeamlab || tasksConfig.SslCertificateErrorsPermit, tasksConfig.ProtocolLogPath, log);

                //    if (simpleImapClient != null) simpleImapClients.Add(simpleImapClient);
                //}

            }
            catch (AggregateException aggEx)
            {
                if (aggEx.InnerException != null)
                {
                    throw aggEx.InnerException;
                }
                throw new Exception("LoadFoldersFromIMAP failed", aggEx);
            }
        }

        private async Task<IEnumerable<IMailFolder>> GetImapSubFolders(IMailFolder folder)
        {
            var result = new List<IMailFolder>();
            try
            {
                result = (await folder.GetSubfoldersAsync(true, CancelToken)).ToList();

                if (result.Any())
                {
                    var resultWithSubfolders = result.Where(x => x.Attributes.HasFlag(FolderAttributes.HasChildren)).ToList();

                    foreach (var subfolder in resultWithSubfolders)
                    {
                        result.AddRange(await GetImapSubFolders(subfolder));
                    }

                    return result;
                }
            }
            catch (Exception ex)
            {
                Log.Error($"GetImapSubFolders: {folder.Name} Exception: {ex.Message}");
            }

            return new List<IMailFolder>();
        }

        private async Task ProcessActionFromRedis(RedisClient _redisClient)
        {
            var cache = _redisClient;

            if (cache == null) return;

            var key = cache.CreateQueueKey(Account.MailBoxId);

            Log.Debug($"ProcessActionFromRedis->Begin with key: {key}");

            int iterationCount = 0;

            while (true)
            {
                var actionFromCache = await cache.PopFromQueue<CashedMailUserAction>(key);

                if (actionFromCache == null) break;

                var actionSplittedList = actionFromCache.Uidls.Select(x => new SplittedUidl(x)).ToList();

                if (!actionSplittedList.Any()) continue;

                iterationCount++;

                if (actionFromCache.Action == MailUserAction.MoveTo)
                {
                    await MoveMessageInImap(actionSplittedList, actionFromCache.Destination);
                }
                else
                {
                    if (await SetFlagsInImap(actionSplittedList, actionFromCache.Action))
                    {
                        Log.Debug($"ProcessActionFromRedis->{Account.MailBoxId} SetFlag {actionFromCache.Uidls} {actionFromCache.Action}");
                    }
                    else
                    {
                        Log.Debug($"ProcessActionFromRedis->{Account.MailBoxId} Can`t setFlag {actionFromCache.Uidls} {actionFromCache.Action}");
                    }
                }
            }

            Log.Debug($"ProcessActionFromRedis->End: read {iterationCount} keys.");
        }

        public async Task<List<int>> UpdateMessageFlagInDb(List<int> indexes, IMailFolder imapFolder)
        {
            if (indexes.Count == 0) return new List<int>();

            try
            {
                await ChangeWorkFolderIMAP(imapFolder);

                var imap_messages = await imapFolder.FetchAsync(indexes, SummaryItems);

                FolderType folder = foldersDictionary[imapFolder].Folder;

                var imap_SplittedUids = imap_messages.Select(x => new SplittedUidl(folder, x.UniqueId)).ToList();

                var exp = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                    .SetMessageUids(imap_SplittedUids.Select(x => x.Uidl).ToList())
                    .SetMailboxId(Account.MailBoxId);

                var db_messages = _mailInfoDao.GetMailInfoList(exp.Build()).ToList();

                foreach (var imap_message in imap_messages)
                {
                    var db_message = db_messages.Where(x => x.Uidl.StartsWith(imap_message.UniqueId.ToString())).FirstOrDefault();

                    if (db_message == null) continue;

                    SynchronizeMessageFlagsFromImap(imap_message, db_message);
                }


            }
            catch (Exception ex)
            {
                Log.Error($"UpdateMessageFlagInDb({imapFolder.FullName}, Message.Count={indexes.Count})->{ex.Message}");
            }

            return indexes;
        }

        public async Task<bool> SynchronizeMailFolderFromImap(IMailFolder imapFolder, MailFolder dbFolder)
        {
            if (imapFolder == null || dbFolder == null) return false;

            await ChangeWorkFolderIMAP(imapFolder);

            try
            {
                var imap_messages = (await imapFolder.FetchAsync(1, -1, SummaryItems)).OrderBy(x=>x.UniqueId.Id).Take(_mailSettings.ImapMessagePerFolder);

                var imap_SplittedUids = imap_messages.Select(x => new SplittedUidl(dbFolder.Folder, x.UniqueId)).ToList();

                var exp = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                    .SetMessageUids(imap_SplittedUids.Select(x => x.Uidl).ToList())
                    .SetMailboxId(Account.MailBoxId);

                var db_messages = _mailInfoDao.GetMailInfoList(exp.Build()).ToList();

                Log.Debug($"SynchronizeMailFolderFromImap is Begin: imap_messages={imap_messages.Count()}, db_messages={db_messages.Count}");

                foreach (var imap_message in imap_messages)
                {
                    var db_message = db_messages.FirstOrDefault(x => x.Uidl == SplittedUidl.ToUidl(dbFolder.Folder, imap_message.UniqueId));

                    if (db_message != null)
                    {
                        SynchronizeMessageFlagsFromImap(imap_message, db_message);

                        if (db_message.Folder != dbFolder.Folder)
                        {
                            _mailEnginesFactory.MessageEngine.SetFolder(new List<int>() { db_message.Id }, dbFolder.Folder);
                        }

                        db_messages.Remove(db_message);

                        continue;
                    }

                    string md5 = await GetMessageMD5FromIMAP(imap_message, imapFolder);

                    var expMd5 = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                        .SetMd5(md5)
                        .SetMailboxId(Account.MailBoxId);

                    db_message = _mailInfoDao.GetMailInfoList(expMd5.Build()).FirstOrDefault();

                    if (db_message == null)
                    {
                        expMd5 = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId, true)
                            .SetMd5(md5)
                            .SetMailboxId(Account.MailBoxId);

                        db_message = _mailInfoDao.GetMailInfoList(expMd5.Build()).FirstOrDefault();
                        if (db_message == null)
                        {
                            Log.Debug($"SynchronizeMailFolderFromImap: message {imap_message.UniqueId.Id} not found in DB. md5={expMd5}");

                            await CreateMessageInDB(imap_message, imapFolder);

                            continue;
                        }

                    }

                    if (db_message.IsRemoved)
                    {
                        Log.Debug($"SynchronizeMailFolderFromImap: message {imap_message.UniqueId.Id} was remove in DB. md5={expMd5}");

                        var restoreQuery = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                            .SetMessageId(db_message.Id)
                            .Build();

                        //_mailInfoDao.SetFieldValue(restoreQuery, MailTable.Columns.IsRemoved, false);

                        _mailEnginesFactory.MessageEngine.Restore(new List<int>() { db_message.Id });
                    }

                    if (db_message.Folder != dbFolder.Folder)
                    {
                        _mailEnginesFactory.MessageEngine.SetFolder(new List<int>() { db_message.Id }, dbFolder.Folder);
                    }

                    var updateQuery = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                            .SetMessageId(db_message.Id)
                            .Build();

                    _mailInfoDao.SetFieldValue(updateQuery, "Uidl", SplittedUidl.ToUidl(dbFolder.Folder, imap_message.UniqueId));

                    SynchronizeMessageFlagsFromImap(imap_message, db_message);
                }

                var messageToRemove = db_messages.Select(x => x.Id).ToList();

                if (messageToRemove.Any()) _mailEnginesFactory.MessageEngine.SetRemoved(messageToRemove);

            }
            catch (Exception ex)
            {
                Log.Error($"SynchronizeMailFolderFromImap(IMailFolder={imapFolder.Name}, MailFolder={dbFolder.Name})->{ex.Message}");

                return false;
            }

            return true;
        }

        public bool SynchronizeMessageFlagsFromImap(IMessageSummary imap_message, MailInfo db_message)
        {
            if (imap_message == null || db_message == null) return false;
            try
            {
                bool unread = !imap_message.Flags.Value.HasFlag(MessageFlags.Seen);
                bool important = imap_message.Flags.Value.HasFlag(MessageFlags.Flagged);
                bool removed = imap_message.Flags.Value.HasFlag(MessageFlags.Deleted);

                if (db_message.IsNew ^ unread) _mailEnginesFactory.MessageEngine.SetUnread(new List<int>() { db_message.Id }, unread, true);
                if (db_message.Importance ^ important) _mailEnginesFactory.MessageEngine.SetImportant(new List<int>() { db_message.Id }, important);
                if (removed) _mailEnginesFactory.MessageEngine.SetRemoved(new List<int>() { db_message.Id });

                return true;
            }
            catch (Exception ex)
            {
                Log.Error($"SynchronizeMessageFlagsFromImap({imap_message.UniqueId},{db_message})->{ex.Message}");

                return false;
            }
        }

        public async Task<bool> MoveMessageInImap(List<SplittedUidl> uidlListSplitted, int destination)
        {
            if (uidlListSplitted.Count == 0) return false;

            DoneToken?.Cancel();

            await ImapSemaphore.WaitAsync();

            try
            {
                var imapFolder = foldersDictionary.Where(x => x.Value.Folder == uidlListSplitted[0].FolderType).Select(x => x.Key).FirstOrDefault();

                if (imapFolder == null) return false;

                var imapFolderDestination = foldersDictionary.Where(x => x.Value.Folder == (FolderType)destination).Select(x => x.Key).FirstOrDefault();

                if (imapFolderDestination == null) return false;

                await ChangeWorkFolderIMAP(imapFolder);

                Imap.Inbox.CountChanged -= ImapCountChanged;
                Imap.Inbox.MessageFlagsChanged -= ImapMessageFlagsChanged;


                var returnedUidl = await imapFolder.MoveToAsync(uidlListSplitted.Select(x => x.UniqueId).ToList(), imapFolderDestination);

                var exp = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                    .SetMessageUids(uidlListSplitted.Select(x => x.Uidl).ToList())
                    .SetMailboxId(Account.MailBoxId);

                var db_messages = _mailInfoDao.GetMailInfoList(exp.Build()).ToList();

                foreach (var item in returnedUidl)
                {
                    var db_message = db_messages.FirstOrDefault(x => x.Uidl.StartsWith(item.Key.ToString()));

                    if (db_message == null) continue;

                    var updateQuery = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                        .SetMessageId(db_message.Id)
                        .Build();

                    _mailInfoDao.SetFieldValue(updateQuery, "uidl", SplittedUidl.ToUidl((FolderType)destination, item.Value));
                }

                Log.Debug($"MoveMessageInImap->{Account.MailBoxId} MoveTo {imapFolder}. MessagesCount={uidlListSplitted.Count}, MessagesMoved.Count: {returnedUidl.Count}");

            }
            catch (Exception ex)
            {
                Log.Error($"MoveMessageInImap(messageCount={uidlListSplitted.Count}, destination={destination})->{ex.Message}");

                return false;
            }
            finally
            {
                ImapSemaphore.Release();

                Imap.Inbox.CountChanged += ImapCountChanged;
                Imap.Inbox.MessageFlagsChanged += ImapMessageFlagsChanged;
            }

            SetIdleState();

            return true;
        }

        public async Task<bool> SetFlagsInImap(List<SplittedUidl> uidlListSplitted, MailUserAction mailUserAction)
        {
            if (uidlListSplitted.Count == 0) return false;

            DoneToken?.Cancel();

            await ImapSemaphore.WaitAsync();

            try
            {
                var folders = uidlListSplitted.GroupBy(x => x.FolderType).Select(y => y.Key).ToList();

                foreach (var folder in folders)
                {
                    var uids = uidlListSplitted.Where(x => x.FolderType == folder).Select(x => x.UniqueId).ToList();

                    if (uids.Count == 0) continue;

                    IMailFolder imapFolder = foldersDictionary.Where(x => x.Value.Folder == folder).Select(x => x.Key).FirstOrDefault();

                    if (imapFolder == null) continue;

                    await SetFlagsInImap(imapFolder, uids, mailUserAction);
                }
            }
            catch (Exception ex)
            {
                Log.Error($"SetMessageFlagIMAP->{Account.MailBoxId}, {mailUserAction}->{ex.Message}");

                return false;
            }
            finally
            {
                ImapSemaphore.Release();
            }

            SetIdleState();

            return true;
        }

        public async Task SetFlagsInImap(IMailFolder imapFolder, List<UniqueId> uids, MailUserAction mailUserAction)
        {
            try
            {
                await ChangeWorkFolderIMAP(imapFolder);

                switch (mailUserAction)
                {
                    case MailUserAction.MoveTo:
                    case MailUserAction.Nothing:
                    case MailUserAction.StartImapClient:
                        break;
                    case MailUserAction.SetAsRead:
                        await imapFolder.AddFlagsAsync(uids, MessageFlags.Seen, true);
                        break;
                    case MailUserAction.SetAsUnread:
                        await imapFolder.RemoveFlagsAsync(uids, MessageFlags.Seen, true);
                        break;
                    case MailUserAction.SetAsImportant:
                        await imapFolder.AddFlagsAsync(uids, MessageFlags.Flagged, true);
                        break;
                    case MailUserAction.SetAsNotImpotant:
                        await imapFolder.RemoveFlagsAsync(uids, MessageFlags.Flagged, true);
                        break;
                    case MailUserAction.SetAsDeleted:
                        await imapFolder.AddFlagsAsync(uids, MessageFlags.Deleted, true);
                        break;
                }
                Log.Debug($"SetMessageFlagIMAP->{Account.MailBoxId}.{imapFolder.FullName} MessageCount={uids.Count}, {mailUserAction}");
            }
            catch (Exception ex)
            {
                Log.Error($"SetMessageFlagIMAP->{Account.MailBoxId}.{imapFolder.FullName} MessageCount={uids.Count}, {mailUserAction}->{ex.Message}");
            }
        }

        public List<MailInfo> GetMessageFromDB(MailFolder dbFolder, string md5 = "")
        {
            try
            {
                var exp = SimpleMessagesExp.CreateBuilder(Account.TenantId, Account.UserId)
                    .SetMailboxId(Account.MailBoxId)
                    .SetFolder((int)dbFolder.Folder);

                if (!String.IsNullOrEmpty(md5))
                {
                    exp = exp.SetMd5(md5);
                }

                return _mailInfoDao.GetMailInfoList(exp.Build()).ToList();
            }
            catch (Exception ex)
            {
                Log.Error($"GetMessageFromDB(MailFolder={dbFolder.Name})->{ex.Message}");

                return new List<MailInfo>();
            }
        }

        private async Task<bool> CreateMessageInDB(IMessageSummary imap_message, IMailFolder imapFolder)
        {
            bool result = true;

            var message = await imapFolder.GetMessageAsync(imap_message.UniqueId, CancelToken);

            message.FixDateIssues(imap_message?.InternalDate, Log);

            bool unread = false, important = false;

            if ((imap_message != null) && imap_message.Flags.HasValue)
            {
                unread = !imap_message.Flags.Value.HasFlag(MessageFlags.Seen);
                important = imap_message.Flags.Value.HasFlag(MessageFlags.Flagged);
            }

            message.FixEncodingIssues(Log);

            var uid = imap_message.UniqueId.ToString();
            var folder = foldersDictionary[imapFolder];

            Stopwatch watch = null;

            if (_mailSettings.CollectStatistics)
            {
                watch = new Stopwatch();
                watch.Start();
            }

            try
            {
                var uidl = string.Format("{0}-{1}", uid, (int)folder.Folder);

                Log.Info($"Get message (UIDL: '{uidl}', MailboxId = {Account.MailBoxId}, Address = '{Account.EMail}')");

                var messageDB = _mailEnginesFactory.MessageEngine.Save(Account, message, uidl, folder, null, unread, Log);

                if (messageDB == null || messageDB.Id <= 0)
                {
                    result = false;
                    return result;
                }

                Log.Info($"Message saved (id: {messageDB.Id}, From: '{messageDB.From}', Subject: '{messageDB.Subject}', Unread: {messageDB.IsNew})");

                Log.Info("DoOptionalOperations->START");

                DoOptionalOperations(messageDB, message, Account, folder, Log);

                Log.Info("DoOptionalOperations->END");
            }
            catch (Exception ex)
            {
                Log.Error($"CreateMessageInDB Exception:{ex.Message}");

                result = false;
            }
            finally
            {
                if (_mailSettings.CollectStatistics && watch != null)
                {
                    watch.Stop();

                    LogStat("CreateMessageInDB", watch.Elapsed, result);
                }
            }

            return result;
        }

        public async Task<string> GetMessageMD5FromIMAP(IMessageSummary message, IMailFolder imapFolder)
        {
            await ChangeWorkFolderIMAP(imapFolder);

            var mimeMessage = await imapFolder.GetMessageAsync(message.UniqueId);

            var md5 = string.Format("{0}|{1}|{2}|{3}",
                mimeMessage.From.Mailboxes.Any() ? mimeMessage.From.Mailboxes.First().Address : "",
                mimeMessage.Subject,
                mimeMessage.Date.UtcDateTime,
                mimeMessage.MessageId).GetMd5();

            return md5;
        }

        private MailFolder DetectFolder(IMailFolder folder)
        {
            var folderName = folder.Name.ToLowerInvariant();

            if (_mailSettings.SkipImapFlags != null &&
                _mailSettings.SkipImapFlags.Any() &&
                _mailSettings.SkipImapFlags.Contains(folderName))
            {
                return null;
            }

            FolderType folderId;

            if ((folder.Attributes & FolderAttributes.Inbox) != 0)
            {
                return new MailFolder(FolderType.Inbox, folder.Name);
            }
            if ((folder.Attributes & FolderAttributes.Sent) != 0)
            {
                return new MailFolder(FolderType.Sent, folder.Name);
            }
            if ((folder.Attributes & FolderAttributes.Junk) != 0)
            {
                return new MailFolder(FolderType.Spam, folder.Name);
            }
            if ((folder.Attributes &
                 (FolderAttributes.All |
                  FolderAttributes.NoSelect |
                  FolderAttributes.NonExistent |
                  FolderAttributes.Trash |
                  FolderAttributes.Archive |
                  FolderAttributes.Drafts |
                  FolderAttributes.Flagged)) != 0)
            {
                return null; // Skip folders
            }

            if (_mailSettings.ImapFlags != null &&
                _mailSettings.ImapFlags.Any() &&
                _mailSettings.ImapFlags.ContainsKey(folderName))
            {
                folderId = (FolderType)_mailSettings.ImapFlags[folderName];
                return new MailFolder(folderId, folder.Name);
            }

            if (_mailSettings.SpecialDomainFolders.Any() &&
                _mailSettings.SpecialDomainFolders.ContainsKey(Account.Server))
            {
                var domainSpecialFolders = _mailSettings.SpecialDomainFolders[Account.Server];

                if (domainSpecialFolders.Any() &&
                    domainSpecialFolders.ContainsKey(folderName))
                {
                    var info = domainSpecialFolders[folderName];
                    return info.skip ? null : new MailFolder(info.folder_id, folder.Name);
                }
            }

            if (_mailSettings.DefaultFolders == null || !_mailSettings.DefaultFolders.ContainsKey(folderName))
                return new MailFolder(FolderType.Inbox, folder.Name, new[] { folder.FullName });

            folderId = (FolderType)_mailSettings.DefaultFolders[folderName];
            return new MailFolder(folderId, folder.Name);
        }

        private async Task ChangeWorkFolderIMAP(IMailFolder imapFolder)
        {
            if (imapFolder.IsOpen) return;

            try
            {
                await imapFolder.OpenAsync(FolderAccess.ReadWrite);

                Log.Debug($"ChangeWorkFolder -> OpenImapFolders({imapFolder.Name})");
            }
            catch (Exception ex)
            {
                Log.Error($"ChangeWorkFolder(IMailFolder={imapFolder.Name})->{ex.Message}");
            }
        }

        public void DoneTokenUpdate()
        {
            if (imapFoldersToUpdate.Any() || imapMessagesToUpdate.Any())
            {
                if ((DoneToken != null) && ClientIsReadyToWork)
                {
                    DoneToken?.Cancel();
                    SetIdleState();
                }
            }
        }

        public async void SetIdleState()
        {
            Log.Debug("SetClientTask->Wait for Semaphore");

            await ImapSemaphore.WaitAsync();

            Log.Debug("SetClientTask->Catch Semaphore");

            while (imapFoldersToUpdate.TryDequeue(out IMailFolder imapFolderToUpdate))
            {
                if (foldersDictionary.TryGetValue(imapFolderToUpdate, out MailFolder db_folder))
                {
                    await SynchronizeMailFolderFromImap(imapFolderToUpdate, db_folder);
                }
            }
            var indexList = new List<int>();

            while (imapMessagesToUpdate.TryDequeue(out int index))
            {
                indexList.Add(index);
            }
            await UpdateMessageFlagInDb(indexList, WorkFolder);

            try
            {
                await ChangeWorkFolderIMAP(WorkFolder);

                if (Imap.Capabilities.HasFlag(ImapCapabilities.Idle))
                {
                    _deathTimer.Change(_mailSettings.ImapClienLifeTimeSecond, -1);

                    DoneToken = new CancellationTokenSource(new TimeSpan(0, 10, 0));

                    Log.Debug($"Go to Idle.");

                    Imap.Idle(DoneToken.Token);
                }
                else
                {
                    await Task.Delay(new TimeSpan(0, 10, 0));
                    await Imap.NoOpAsync();
                }
            }
            catch (Exception ex)
            {
                Log.Error($"SetClientTask, Error:{ex.Message}");
            }
            finally
            {
                DoneToken?.Dispose();

                DoneToken = null;

                if (ImapSemaphore.CurrentCount == 0)
                {
                    ImapSemaphore.Release();

                    Log.Debug($"Return from SetClientTask, ImapSemaphore release.");
                }
                else
                {
                    Log.Debug($"Return from SetClientTask without ImapSemaphore release.");
                }
            }
        }

        private void LogStat(string method, TimeSpan duration, bool failed)
        {
            if (!_mailSettings.CollectStatistics)
                return;

            Log.DebugWithProps(method,
                new KeyValuePair<string, object>("duration", duration.TotalMilliseconds),
                new KeyValuePair<string, object>("mailboxId", Account.MailBoxId),
                new KeyValuePair<string, object>("address", Account.EMail.ToString()),
                new KeyValuePair<string, object>("isFailed", failed));
        }

        private void DoOptionalOperations(MailMessageData message, MimeMessage mimeMessage, MailBoxData mailbox, MailFolder folder, ILog log)
        {
            try
            {
                var tagIds = new List<int>();

                if (folder.Tags.Any())
                {
                    log.Debug("DoOptionalOperations->GetOrCreateTags()");

                    tagIds = _mailEnginesFactory.TagEngine.GetOrCreateTags(mailbox.TenantId, mailbox.UserId, folder.Tags);
                }

                log.Debug("DoOptionalOperations->IsCrmAvailable()");

                //if (IsCrmAvailable(mailbox, log))
                //{
                //    log.Debug("DoOptionalOperations->GetCrmTags()");

                //    var crmTagIds = mailFactory.TagEngine.GetCrmTags(message.FromEmail);

                //    if (crmTagIds.Any())
                //    {
                //        if (tagIds == null)
                //            tagIds = new List<int>();

                //        tagIds.AddRange(crmTagIds.Select(t => t.Id));
                //    }
                //}

                if (tagIds.Any())
                {
                    if (message.TagIds == null || !message.TagIds.Any())
                        message.TagIds = tagIds;
                    else
                        message.TagIds.AddRange(tagIds);

                    message.TagIds = message.TagIds.Distinct().ToList();
                }

                log.Debug("DoOptionalOperations->AddMessageToIndex()");

                var wrapper = message.ToMailWrapper(mailbox.TenantId, new Guid(mailbox.UserId));

                _mailEnginesFactory.IndexEngine.Add(wrapper);

                foreach (var tagId in tagIds)
                {
                    try
                    {
                        log.DebugFormat("DoOptionalOperations->SetMessagesTag(tagId: {0})", tagId);

                        _mailEnginesFactory.TagEngine.SetMessagesTag(new List<int> { message.Id }, tagId);
                    }
                    catch (Exception e)
                    {
                        log.ErrorFormat(
                            "SetMessagesTag(tenant={0}, userId='{1}', messageId={2}, tagid = {3}) Exception:\r\n{4}\r\n",
                            mailbox.TenantId, mailbox.UserId, message.Id, e.ToString(),
                            tagIds != null ? string.Join(",", tagIds) : "null");
                    }
                }

                log.Debug("DoOptionalOperations->AddRelationshipEventForLinkedAccounts()");

                _mailEnginesFactory.CrmLinkEngine.AddRelationshipEventForLinkedAccounts(mailbox, message, _mailSettings.DefaultApiSchema);

                log.Debug("DoOptionalOperations->SaveEmailInData()");

                _mailEnginesFactory.EmailInEngine.SaveEmailInData(mailbox, message, _mailSettings.DefaultApiSchema);

                log.Debug("DoOptionalOperations->SendAutoreply()");

                _mailEnginesFactory.AutoreplyEngine.SendAutoreply(mailbox, message, _mailSettings.DefaultApiSchema, log);

                log.Debug("DoOptionalOperations->UploadIcsToCalendar()");

                if (folder.Folder != Enums.FolderType.Spam)
                {
                    _mailEnginesFactory
                        .CalendarEngine
                        .UploadIcsToCalendar(mailbox, message.CalendarId, message.CalendarUid, message.CalendarEventIcs,
                            message.CalendarEventCharset, message.CalendarEventMimeType, mailbox.EMail.Address,
                            _mailSettings.DefaultApiSchema);
                }

                if (_mailSettings.SaveOriginalMessage)
                {
                    log.Debug("DoOptionalOperations->StoreMailEml()");
                    StoreMailEml(mailbox.TenantId, mailbox.UserId, message.StreamId, mimeMessage, log);
                }

                log.Debug("DoOptionalOperations->ApplyFilters()");

                var filters = GetFilters(_mailEnginesFactory, log);

                _mailEnginesFactory.FilterEngine.ApplyFilters(message, mailbox, folder, filters);

                log.Debug("DoOptionalOperations->NotifySignalrIfNeed()");

                SendUnreadUser();
            }
            catch (Exception ex)
            {
                log.ErrorFormat("DoOptionalOperations() Exception:\r\n{0}\r\n", ex.ToString());
            }
        }

        private void SendUnreadUser()
        {
            try
            {
                var mailFolderInfos = _folderEngine.GetFolders();

                var count = (from mailFolderInfo in mailFolderInfos
                             where mailFolderInfo.id == FolderType.Inbox
                             select mailFolderInfo.unreadMessages)
                    .FirstOrDefault();

                if (Account.UserId != Constants.LostUser.ID.ToString())
                {
                    _signalrServiceClient.SendUnreadUser(Account.TenantId, Account.UserId, count);
                }
            }
            catch (Exception e)
            {
                Log.ErrorFormat("Unknown Error. {0}, {1}", e.ToString(),
                    e.InnerException != null ? e.InnerException.Message : string.Empty);
            }
        }


        private List<MailSieveFilterData> GetFilters(MailEnginesFactory factory, ILog log)
        {
            var user = factory.UserId;

            if (string.IsNullOrEmpty(user))
                return new List<MailSieveFilterData>();

            try
            {
                if (Filters.ContainsKey(user)) return Filters[user];

                var filters = factory.FilterEngine.GetList();

                Filters.TryAdd(user, filters);

                return filters;
            }
            catch (Exception ex)
            {
                log.Error("GetFilters failed", ex);
            }

            return new List<MailSieveFilterData>();
        }

        public string StoreMailEml(int tenant, string user, string streamId, MimeMessage message, ILog log)
        {
            if (message == null)
                return string.Empty;

            // Using id_user as domain in S3 Storage - allows not to add quota to tenant.
            var savePath = MailStoragePathCombiner.GetEmlKey(user, streamId);

            var storage = _storageFactory.GetMailStorage(tenant);

            try
            {
                using (var stream = new MemoryStream())
                {
                    message.WriteTo(stream);

                    var res = storage.Save(savePath, stream, MailStoragePathCombiner.EML_FILE_NAME).ToString();

                    log.InfoFormat("StoreMailEml() tenant='{0}', user_id='{1}', save_eml_path='{2}' Result: {3}", tenant, user, savePath, res);

                    return res;
                }
            }
            catch (Exception ex)
            {
                log.ErrorFormat("StoreMailEml Exception: {0}", ex.ToString());
            }

            return string.Empty;
        }

        private void SetMailboxAuthError(bool state)
        {
            if (Account.AuthErrorDate.HasValue) return;
            try
            {
                if (state)
                {
                    Account.AuthErrorDate = DateTime.UtcNow;
                    _mailEnginesFactory.MailboxEngine.SetMaiboxAuthError(Account.MailBoxId, DateTime.UtcNow);
                }
                else
                {
                    Account.AuthErrorDate = null;
                    _mailEnginesFactory.MailboxEngine.SetMaiboxAuthError(Account.MailBoxId, null);
                }
            }
            catch (Exception ex)
            {
                Log.Error($"SetMailboxAuthError({Account.EMail}): Exception: {ex.Message}");
            }
        }
    }
}