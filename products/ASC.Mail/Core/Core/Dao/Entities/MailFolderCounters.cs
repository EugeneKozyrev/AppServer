﻿// <auto-generated> This file has been auto generated by EF Core Power Tools. </auto-generated>
using ASC.Core.Common.EF;
using ASC.Mail.Enums;
using Microsoft.EntityFrameworkCore;
using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ASC.Mail.Core.Dao.Entities
{
    [Table("mail_folder_counters")]
    public partial class MailFolderCounters : BaseEntity
    {
        [Key]
        [Column("tenant", TypeName = "int(11)")]
        public int Tenant { get; set; }

        [Key]
        [Column("id_user", TypeName = "varchar(255)")]
        public string IdUser { get; set; }

        [Key]
        [Column("folder", TypeName = "smallint(5) unsigned")]
        public FolderType Folder { get; set; }

        [Column("unread_messages_count", TypeName = "int(10) unsigned")]
        public uint UnreadMessagesCount { get; set; }

        [Column("total_messages_count", TypeName = "int(10) unsigned")]
        public uint TotalMessagesCount { get; set; }

        [Column("unread_conversations_count", TypeName = "int(10) unsigned")]
        public uint UnreadConversationsCount { get; set; }

        [Column("total_conversations_count", TypeName = "int(10) unsigned")]
        public uint TotalConversationsCount { get; set; }

        [Column("time_modified", TypeName = "timestamp")]
        public DateTime TimeModified { get; set; }

        public override object[] GetKeys()
        {
            return new object[] { Tenant, IdUser, Folder };
        }
    }

    public static class MailFolderCountersExtension
    {
        public static ModelBuilder AddMailFolderCounters(this ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<MailFolderCounters>(entity =>
            {
                entity.HasKey(e => new { e.Tenant, e.IdUser, e.Folder })
                    .HasName("PRIMARY");

                entity.Property(e => e.IdUser)
                    .HasCharSet("utf8")
                    .HasCollation("utf8_general_ci");

                entity.Property(e => e.TimeModified)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP")
                    .ValueGeneratedOnAddOrUpdate();
            });

            return modelBuilder;
        }
    }
}