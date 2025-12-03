using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PhishGuard.Data.Models;

[Table("incidents")]
public class Incident
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(2048)]
    public string Url { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(20)]
    public string Action { get; set; } = string.Empty; // allow, warn, block
    
    [Required]
    [Column(TypeName = "REAL")]
    public double Score { get; set; } // confidence score 0-1
    
    [Column(TypeName = "TEXT")]
    public string? Reason { get; set; }
    
    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    public Dictionary<string, object?> ToDictionary()
    {
        return new Dictionary<string, object?>
        {
            ["id"] = Id,
            ["url"] = Url,
            ["action"] = Action,
            ["score"] = Score,
            ["reason"] = Reason,
            ["timestamp"] = Timestamp.ToString("O")
        };
    }
}

