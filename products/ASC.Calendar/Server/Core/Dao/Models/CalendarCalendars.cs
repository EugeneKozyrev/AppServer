﻿// <auto-generated> This file has been auto generated by EF Core Power Tools. </auto-generated>
using ASC.Core.Common.EF;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ASC.Calendar.Core.Dao.Models
{
    [Table("calendar_calendars")]
    public partial class CalendarCalendars : BaseEntity
    {
        [Column("id", TypeName = "int(10)")]
        public int Id { get; set; }

        [Required]
        [Column("owner_id", TypeName = "char(38)")]
        public string OwnerId { get; set; }
        [Required]
        [Column("name", TypeName = "varchar(255)")]
        public string Name { get; set; }
        [Column("description", TypeName = "varchar(255)")]
        public string Description { get; set; }
        [Column("tenant", TypeName = "int(10)")]
        public int Tenant { get; set; }
        [Required]
        [Column("text_color", TypeName = "varchar(50)")]
        public string TextColor { get; set; }
        [Required]
        [Column("background_color", TypeName = "varchar(50)")]
        public string BackgroundColor { get; set; }
        [Column("alert_type", TypeName = "smallint(6)")]
        public int AlertType { get; set; }
        [Required]
        [Column("time_zone", TypeName = "varchar(255)")]
        public string TimeZone { get; set; }
        [Column("ical_url", TypeName = "mediumtext")]
        public string IcalUrl { get; set; }
        [Column("caldav_guid", TypeName = "char(38)")]
        public string CaldavGuid { get; set; }
        [Column("is_todo", TypeName = "int(11)")]
        public int? IsTodo { get; set; }

        public override object[] GetKeys() => new object[] { Id };
    }
}