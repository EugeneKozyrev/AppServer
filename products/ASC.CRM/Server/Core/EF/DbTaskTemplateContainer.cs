﻿// <auto-generated> This file has been auto generated by EF Core Power Tools. </auto-generated>
using ASC.CRM.Core.Enums;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ASC.CRM.Core.EF
{
    [Table("crm_task_template_container")]
    public partial class DbTaskTemplateContainer : IDbCrm
    {
        [Key]
        [Column("id", TypeName = "int(10)")]
        public int Id { get; set; }

        [Required]
        [Column("title", TypeName = "varchar(256)")]
        public string Title { get; set; }
        
        [Column("entity_type", TypeName = "int(10)")]
        public EntityType EntityType { get; set; }
        
        [Column("tenant_id", TypeName = "int(10)")]
        public int TenantId { get; set; }
        
        [Column("create_on", TypeName = "datetime")]
        public DateTime CreateOn { get; set; }
        
        [Required]
        [Column("create_by", TypeName = "char(38)")]
        public Guid CreateBy { get; set; }
        
        [Column("last_modifed_on", TypeName = "datetime")]
        public DateTime LastModifedOn { get; set; }
        
        [Required]
        [Column("last_modifed_by", TypeName = "char(38)")]
        public Guid LastModifedBy { get; set; }
    }
}