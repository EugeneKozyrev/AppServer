﻿// <auto-generated> This file has been auto generated by EF Core Power Tools. </auto-generated>
using ASC.Core.Common.EF;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ASC.Calendar.Core.Dao.Models
{
    [Table("calendar_todos")]
    public partial class CalendarTodos : BaseEntity
    {
        [Key]
        [Column("id", TypeName = "int(10)")]
        public int Id { get; set; }
        [Column("tenant", TypeName = "int(11)")]
        public int Tenant { get; set; }
        [Required]
        [Column("name", TypeName = "varchar(255)")]
        public string Name { get; set; }
        [Required]
        [Column("description", TypeName = "text")]
        public string Description { get; set; }
        [Column("calendar_id", TypeName = "int(11)")]
        public int CalendarId { get; set; }
        [Column("start_date", TypeName = "datetime")]
        public DateTime? StartDate { get; set; }
        [Column("completed", TypeName = "datetime")]
        public DateTime? Completed { get; set; }
        [Required]
        [Column("owner_id", TypeName = "char(38)")]
        public Guid OwnerId { get; set; }
        [Column("uid", TypeName = "varchar(255)")]
        public string Uid { get; set; }

        public override object[] GetKeys() => new object[] { Id };
    }
}