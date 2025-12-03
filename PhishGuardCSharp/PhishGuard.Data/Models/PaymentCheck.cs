using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PhishGuard.Data.Models;

[Table("payment_checks")]
public class PaymentCheck
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }
    
    [MaxLength(100)]
    public string? RequestId { get; set; }
    
    [MaxLength(2048)]
    public string? Url { get; set; }
    
    [MaxLength(255)]
    public string? Domain { get; set; }
    
    [Required]
    public int Safe { get; set; } = 0; // 1 safe, 0 unsafe
    
    [Required]
    [Column(TypeName = "REAL")]
    public double Score { get; set; } = 0.0;
    
    [Column(TypeName = "TEXT")]
    public string? Reasons { get; set; } // JSON string
    
    [Column(TypeName = "TEXT")]
    public string? Meta { get; set; } // JSON string
    
    [MaxLength(64)]
    public string? HtmlHash { get; set; }
    
    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

