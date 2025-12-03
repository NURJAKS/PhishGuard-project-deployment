using System.Text.Json.Serialization;

namespace PhishGuard.Core.DTOs;

public class PaymentAnalysisRequest
{
    [JsonPropertyName("request_id")]
    public string? RequestId { get; set; }
    
    public string? Url { get; set; }
    
    [JsonPropertyName("html_snippet")]
    public string HtmlSnippet { get; set; } = string.Empty;
    
    [JsonPropertyName("html_hash")]
    public string? HtmlHash { get; set; }
    
    public Dictionary<string, object>? Meta { get; set; }
}

public class PaymentAnalysisResponse
{
    [JsonPropertyName("request_id")]
    public string? RequestId { get; set; }
    
    public bool Safe { get; set; }
    
    public double Score { get; set; }
    
    public List<string> Reasons { get; set; } = new();
    
    public Dictionary<string, object> Explain { get; set; } = new();
}

