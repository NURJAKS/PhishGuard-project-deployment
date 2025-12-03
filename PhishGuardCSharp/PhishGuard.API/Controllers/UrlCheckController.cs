using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PhishGuard.Core.DTOs;
using PhishGuard.Data;
using PhishGuard.Data.Models;
using PhishGuard.Services.Services;

namespace PhishGuard.API.Controllers;

[ApiController]
[Route("v1/check")]
public class UrlCheckController : ControllerBase
{
    private readonly PhishGuardDbContext _db;
    private readonly UrlAnalyzerService _analyzer;
    private readonly RulesService _rulesService;

    public UrlCheckController(PhishGuardDbContext db, UrlAnalyzerService analyzer, RulesService rulesService)
    {
        _db = db;
        _analyzer = analyzer;
        _rulesService = rulesService;
    }

    [HttpPost("url")]
    public async Task<ActionResult<UrlResponse>> CheckUrl([FromBody] UrlRequest request)
    {
        // Перезагружаем правила
        _rulesService.LoadRules();

        // Анализируем URL
        var analysis = _analyzer.AnalyzeUrl(request.Url);

        // Сохраняем инцидент в базу данных
        var incident = new Incident
        {
            Url = request.Url,
            Action = analysis.Action,
            Score = analysis.Score,
            Reason = analysis.Reason,
            Timestamp = DateTime.UtcNow
        };

        _db.Incidents.Add(incident);
        await _db.SaveChangesAsync();

        // Автоматически добавляем в blacklist если заблокирован
        if (analysis.Action == "block")
        {
            var uri = new Uri(request.Url);
            var domain = uri.Host.ToLower();
            var rules = _rulesService.LoadRules();
            var blacklist = rules.GetValueOrDefault("blacklist_domains", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToHashSet();

            if (!blacklist.Contains(domain))
            {
                blacklist.Add(domain);
                rules["blacklist_domains"] = blacklist.Cast<object>().ToList();
                _rulesService.SaveRules(rules);
            }
        }

        return Ok(new UrlResponse
        {
            Action = analysis.Action,
            Score = analysis.Score,
            Reason = analysis.Reason,
            IncidentId = incident.Id
        });
    }

    [HttpGet("incidents")]
    public async Task<ActionResult<List<IncidentResponse>>> GetIncidents(
        [FromQuery] int limit = 100,
        [FromQuery] int offset = 0,
        [FromQuery] string? action = null)
    {
        var query = _db.Incidents.AsQueryable();

        if (!string.IsNullOrEmpty(action))
        {
            query = query.Where(i => i.Action == action);
        }

        var incidents = await query
            .OrderByDescending(i => i.Timestamp)
            .Skip(offset)
            .Take(limit)
            .ToListAsync();

        var result = incidents.Select(i => new IncidentResponse
        {
            Id = i.Id,
            Url = i.Url,
            Action = i.Action,
            Score = i.Score,
            Reason = i.Reason,
            Timestamp = i.Timestamp.ToString("O")
        }).ToList();

        return Ok(result);
    }

    [HttpGet("incidents/stats")]
    public async Task<ActionResult<object>> GetIncidentStats()
    {
        var total = await _db.Incidents.CountAsync();
        var blocked = await _db.Incidents.CountAsync(i => i.Action == "block");
        var warned = await _db.Incidents.CountAsync(i => i.Action == "warn");
        var allowed = await _db.Incidents.CountAsync(i => i.Action == "allow");

        return Ok(new
        {
            total_incidents = total,
            blocked = blocked,
            warned = warned,
            allowed = allowed,
            block_rate = total > 0 ? Math.Round(blocked / (double)total * 100, 2) : 0,
            warn_rate = total > 0 ? Math.Round(warned / (double)total * 100, 2) : 0
        });
    }

    [HttpDelete("incidents/clear")]
    public async Task<ActionResult<object>> ClearIncidents()
    {
        var count = await _db.Incidents.CountAsync();
        _db.Incidents.RemoveRange(_db.Incidents);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            deleted = count,
            message = $"Удалено {count} записей из базы данных"
        });
    }

    [HttpGet("health")]
    public ActionResult<object> HealthCheck()
    {
        return Ok(new
        {
            status = "healthy",
            timestamp = DateTime.UtcNow.ToString("O")
        });
    }
}

