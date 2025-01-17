/*
 *
 * (c) Copyright Ascensio System Limited 2010-2018
 *
 * This program is freeware. You can redistribute it and/or modify it under the terms of the GNU 
 * General Public License (GPL) version 3 as published by the Free Software Foundation (https://www.gnu.org/copyleft/gpl.html). 
 * In accordance with Section 7(a) of the GNU GPL its Section 15 shall be amended to the effect that 
 * Ascensio System SIA expressly excludes the warranty of non-infringement of any third-party rights.
 *
 * THIS PROGRAM IS DISTRIBUTED WITHOUT ANY WARRANTY; WITHOUT EVEN THE IMPLIED WARRANTY OF MERCHANTABILITY OR
 * FITNESS FOR A PARTICULAR PURPOSE. For more details, see GNU GPL at https://www.gnu.org/copyleft/gpl.html
 *
 * You can contact Ascensio System SIA by email at sales@onlyoffice.com
 *
 * The interactive user interfaces in modified source and object code versions of ONLYOFFICE must display 
 * Appropriate Legal Notices, as required under Section 5 of the GNU GPL version 3.
 *
 * Pursuant to Section 7 § 3(b) of the GNU GPL you must retain the original ONLYOFFICE logo which contains 
 * relevant author attributions when distributing the software. If the display of the logo in its graphic 
 * form is not reasonably feasible for technical reasons, you must include the words "Powered by ONLYOFFICE" 
 * in every copy of the program you distribute. 
 * Pursuant to Section 7 § 3(e) we decline to grant you any rights under trademark law for use of our trademarks.
 *
*/


using System;
using System.Collections.Generic;
using System.Linq;

using ASC.Common;
using ASC.Common.Utils;
using ASC.Core.Common.Configuration;
using ASC.FederatedLogin.Profile;
using ASC.Security.Cryptography;

using Microsoft.AspNetCore.Http;

namespace ASC.FederatedLogin.LoginProviders
{
    [Scope]
    public class ProviderManager
    {
        public static List<string> AuthProviders = new List<string>
            {
                ProviderConstants.Google,
                ProviderConstants.Facebook,
                ProviderConstants.Twitter,
                ProviderConstants.LinkedIn,
                ProviderConstants.MailRu,
                ProviderConstants.VK,
                ProviderConstants.Yandex,
                ProviderConstants.GosUslugi
            };

        private Signature Signature { get; }
        private InstanceCrypto InstanceCrypto { get; }
        private ConsumerFactory ConsumerFactory { get; }

        public ProviderManager(Signature signature, InstanceCrypto instanceCrypto, ConsumerFactory consumerFactory)
        {
            Signature = signature;
            InstanceCrypto = instanceCrypto;
            ConsumerFactory = consumerFactory;
        }

        public ILoginProvider GetLoginProvider(string providerType)
        {
            return providerType == ProviderConstants.OpenId
                ? new OpenIdLoginProvider(Signature, InstanceCrypto, ConsumerFactory)
                : ConsumerFactory.GetByKey(providerType) as ILoginProvider;
        }

        public LoginProfile Process(string providerType, HttpContext context, IDictionary<string, string> @params, IDictionary<string, string> additionalStateArgs = null)
        {
            return GetLoginProvider(providerType).ProcessAuthoriztion(context, @params, additionalStateArgs);
        }

        public LoginProfile GetLoginProfile(string providerType, string accessToken)
        {
            var consumer = GetLoginProvider(providerType);
            if (consumer == null) throw new ArgumentException("Unknown provider type", "providerType");

            try
            {
                return consumer.GetLoginProfile(accessToken);
            }
            catch (Exception ex)
            {
                return LoginProfile.FromError(Signature, InstanceCrypto, ex);
            }
        }

        public bool IsNotEmpty
        {
            get
            {
                return AuthProviders
                    .Select(GetLoginProvider)
                    .Any(loginProvider => loginProvider != null && loginProvider.IsEnabled);
            }
        }
    }
}