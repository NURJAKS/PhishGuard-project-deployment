using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PhishGuard.Data.Models;

[Table("invoice_checks")]
public class InvoiceCheck
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string AnalysisId { get; set; } = string.Empty;
    
    [MaxLength(500)]
    public string? Filename { get; set; }
    
    [Required]
    [MaxLength(64)]
    public string DocHash { get; set; } = string.Empty; // SHA256 hash
    
    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = string.Empty; // accepted, suspicious, rejected
    
    [Required]
    [Column(TypeName = "REAL")]
    public double Score { get; set; } // 0-100
    
    [Column(TypeName = "TEXT")]
    public string? InvoiceData { get; set; } // JSON string with invoice details
    
    [Column(TypeName = "TEXT")]
    public string? Checks { get; set; } // JSON string with check results
    
    [Column(TypeName = "TEXT")]
    public string? Reasons { get; set; } // JSON string with reasons
    
    [Column(TypeName = "TEXT")]
    public string? Recommendations { get; set; } // JSON string with recommendations
    
    [MaxLength(100)]
    public string? UserId { get; set; } // For future user tracking
    
    [MaxLength(50)]
    public string? Decision { get; set; } // User decision: approved, rejected, pending
    
    [Column(TypeName = "TEXT")]
    public string? Comments { get; set; } // User comments
    
    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    public Dictionary<string, object?> ToDictionary()
    {
        return new Dictionary<string, object?>
        {
            ["id"] = Id,
            ["analysis_id"] = AnalysisId,
            ["filename"] = Filename,
            ["doc_hash"] = DocHash,
            ["status"] = Status,
            ["score"] = Score,
            ["invoice_data"] = InvoiceData != null ? System.Text.Json.JsonSerializer.Deserialize<object>(InvoiceData) : null,
            ["checks"] = Checks != null ? System.Text.Json.JsonSerializer.Deserialize<object>(Checks) : null,
            ["reasons"] = Reasons != null ? System.Text.Json.JsonSerializer.Deserialize<object>(Reasons) : null,
            ["recommendations"] = Recommendations != null ? System.Text.Json.JsonSerializer.Deserialize<object>(Recommendations) : null,
            ["user_id"] = UserId,
            ["decision"] = Decision,
            ["comments"] = Comments,
            ["timestamp"] = Timestamp.ToString("O")
        };
    }
}

