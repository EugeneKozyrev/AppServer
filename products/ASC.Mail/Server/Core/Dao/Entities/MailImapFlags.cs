﻿// <auto-generated> This file has been auto generated by EF Core Power Tools. </auto-generated>
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ASC.Mail.Core.Dao.Entities
{
    [Table("mail_imap_flags")]
    public partial class MailImapFlags
    {
        [Key]
        [Column("name", TypeName = "varchar(50)")]
        public string Name { get; set; }
        [Column("folder_id", TypeName = "int(11)")]
        public int FolderId { get; set; }
        [Column("skip", TypeName = "int(11)")]
        public bool Skip { get; set; }
    }
}