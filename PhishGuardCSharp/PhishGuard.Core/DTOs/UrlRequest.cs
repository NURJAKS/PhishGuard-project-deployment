namespace PhishGuard.Core.DTOs;

public class UrlRequest
{
    public string Url { get; set; } = string.Empty;
}

public class UrlResponse
{
    public string Action { get; set; } = string.Empty; // allow, warn, block
    public double Score { get; set; } // 0-1
    public string Reason { get; set; } = string.Empty;
    public int? IncidentId { get; set; }
}

public class IncidentResponse
{
    public int Id { get; set; }
    public string Url { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public double Score { get; set; }
    public string? Reason { get; set; }
    public string Timestamp { get; set; } = string.Empty;
}

