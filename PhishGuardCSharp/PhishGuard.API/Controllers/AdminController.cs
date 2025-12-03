using Microsoft.AspNetCore.Mvc;
using PhishGuard.Services.Services;

namespace PhishGuard.API.Controllers;

[ApiController]
[Route("admin")]
public class AdminController : ControllerBase
{
    private readonly RulesService _rulesService;

    public AdminController(RulesService rulesService)
    {
        _rulesService = rulesService;
    }

    [HttpGet("blacklist")]
    public ActionResult<object> GetBlacklist()
    {
        var rules = _rulesService.LoadRules();
        var domains = rules.GetValueOrDefault("blacklist_domains", new List<object>())
            .Select(d => d.ToString())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

        return Ok(new { domains });
    }

    [HttpPost("blacklist")]
    public ActionResult<object> AddToBlacklist([FromBody] AddDomainRequest request)
    {
        var rules = _rulesService.LoadRules();
        var blacklist = rules.GetValueOrDefault("blacklist_domains", new List<object>())
            .Select(d => d.ToString()?.ToLower().Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToHashSet();

        var domain = request.Domain.ToLower().Trim();

        if (blacklist.Contains(domain))
        {
            return BadRequest(new { detail = $"Домен {domain} уже в черном списке" });
        }

        blacklist.Add(domain);
        rules["blacklist_domains"] = blacklist.Cast<object>().ToList();
        _rulesService.SaveRules(rules);

        return Ok(new
        {
            success = true,
            message = $"Домен {domain} добавлен в черный список",
            domains = blacklist.ToList()
        });
    }

    [HttpDelete("blacklist/{domain}")]
    public ActionResult<object> RemoveFromBlacklist(string domain)
    {
        var rules = _rulesService.LoadRules();
        var blacklist = rules.GetValueOrDefault("blacklist_domains", new List<object>())
            .Select(d => d.ToString()?.ToLower().Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

        var domainLower = Uri.UnescapeDataString(domain).ToLower().Trim();
        var found = blacklist.FirstOrDefault(d => d == domainLower || d.Contains(domainLower));

        if (found == null)
        {
            return NotFound(new { detail = $"Домен {domainLower} не найден в черном списке" });
        }

        blacklist.Remove(found);
        rules["blacklist_domains"] = blacklist.Cast<object>().ToList();
        _rulesService.SaveRules(rules);

        return Ok(new
        {
            success = true,
            message = $"Домен {found} удален из черного списка",
            domains = blacklist
        });
    }

    [HttpGet("whitelist")]
    public ActionResult<object> GetWhitelist()
    {
        var rules = _rulesService.LoadRules();
        var domains = rules.GetValueOrDefault("whitelist_domains", new List<object>())
            .Select(d => d.ToString())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

        return Ok(new { domains });
    }

    [HttpPost("whitelist")]
    public ActionResult<object> AddToWhitelist([FromBody] AddDomainRequest request)
    {
        var rules = _rulesService.LoadRules();
        var whitelist = rules.GetValueOrDefault("whitelist_domains", new List<object>())
            .Select(d => d.ToString()?.ToLower().Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToHashSet();

        var domain = request.Domain.ToLower().Trim();

        if (whitelist.Contains(domain))
        {
            return BadRequest(new { detail = $"Домен {domain} уже в белом списке" });
        }

        whitelist.Add(domain);
        rules["whitelist_domains"] = whitelist.Cast<object>().ToList();
        _rulesService.SaveRules(rules);

        return Ok(new
        {
            success = true,
            message = $"Домен {domain} добавлен в белый список",
            domains = whitelist.ToList()
        });
    }

    [HttpDelete("whitelist/{domain}")]
    public ActionResult<object> RemoveFromWhitelist(string domain)
    {
        var rules = _rulesService.LoadRules();
        var whitelist = rules.GetValueOrDefault("whitelist_domains", new List<object>())
            .Select(d => d.ToString()?.ToLower().Trim())
            .Where(d => !string.IsNullOrEmpty(d))
            .ToList();

        var domainLower = Uri.UnescapeDataString(domain).ToLower().Trim();
        var found = whitelist.FirstOrDefault(d => d == domainLower || d.Contains(domainLower));

        if (found == null)
        {
            return NotFound(new { detail = $"Домен {domainLower} не найден в белом списке" });
        }

        whitelist.Remove(found);
        rules["whitelist_domains"] = whitelist.Cast<object>().ToList();
        _rulesService.SaveRules(rules);

        return Ok(new
        {
            success = true,
            message = $"Домен {found} удален из белого списка",
            domains = whitelist
        });
    }
}

public class AddDomainRequest
{
    public string Domain { get; set; } = string.Empty;
}

