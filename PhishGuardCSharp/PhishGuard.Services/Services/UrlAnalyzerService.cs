using System.Text.RegularExpressions;
using PhishGuard.Core.DTOs;

namespace PhishGuard.Services.Services;

public class UrlAnalyzerService
{
    private readonly RulesService _rulesService;

    public UrlAnalyzerService(RulesService rulesService)
    {
        _rulesService = rulesService;
    }

    public UrlResponse AnalyzeUrl(string url)
    {
        try
        {
            var uri = new Uri(url);
            var domain = uri.Host.ToLower();
            var path = uri.AbsolutePath.ToLower();
            var fullUrl = url.ToLower();
            var scheme = uri.Scheme.ToLower();

            var rules = _rulesService.LoadRules();

            // Проверка белого списка (высший приоритет)
            var whitelistDomains = rules.GetValueOrDefault("whitelist_domains", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToList();

            foreach (var whitelisted in whitelistDomains)
            {
                if (domain == whitelisted || domain.EndsWith('.' + whitelisted))
                {
                    return new UrlResponse
                    {
                        Action = "allow",
                        Score = 0.05,
                        Reason = $"Домен в белом списке (разрешен): {whitelisted}"
                    };
                }
            }

            // Блокировка HTTP (кроме localhost и allowlist)
            var httpAllowlist = rules.GetValueOrDefault("http_allowlist", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToHashSet();

            var allowedHttpHosts = new[] { "localhost", "127.", "0.0.0.0" };
            if (scheme == "http")
            {
                var isLocal = allowedHttpHosts.Any(h => domain.StartsWith(h));
                if (!isLocal && !httpAllowlist.Contains(domain))
                {
                    return new UrlResponse
                    {
                        Action = "block",
                        Score = 0.92,
                        Reason = "Незащищенный протокол HTTP"
                    };
                }
            }

            // Проверка доверенных доменов
            var trustedDomains = rules.GetValueOrDefault("trusted_domains", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToHashSet();

            if (trustedDomains.Contains(domain))
            {
                return new UrlResponse
                {
                    Action = "allow",
                    Score = 0.05,
                    Reason = "Доверенный домен"
                };
            }

            // Проверка черного списка
            var blacklistDomains = rules.GetValueOrDefault("blacklist_domains", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToList();

            foreach (var blacklisted in blacklistDomains)
            {
                if (domain.Contains(blacklisted))
                {
                    return new UrlResponse
                    {
                        Action = "block",
                        Score = 0.99,
                        Reason = $"Домен в черном списке: {blacklisted}"
                    };
                }
            }

            // Проверка подозрительных TLD
            var suspiciousTlds = rules.GetValueOrDefault("suspicious_tlds", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToList();

            foreach (var suspiciousTld in suspiciousTlds)
            {
                if (domain.EndsWith(suspiciousTld))
                {
                    return new UrlResponse
                    {
                        Action = "warn",
                        Score = 0.7,
                        Reason = $"Подозрительный домен верхнего уровня: {suspiciousTld}"
                    };
                }
            }

            // Проверка подозрительных ключевых слов
            var suspiciousKeywords = rules.GetValueOrDefault("suspicious_keywords", new List<object>())
                .Select(d => d.ToString()?.ToLower().Trim())
                .Where(d => !string.IsNullOrEmpty(d))
                .ToList();

            var suspiciousCount = 0;
            var foundKeywords = new List<string>();

            foreach (var keyword in suspiciousKeywords)
            {
                if (fullUrl.Contains(keyword))
                {
                    suspiciousCount++;
                    foundKeywords.Add(keyword);
                }
            }

            if (suspiciousCount > 0)
            {
                var score = Math.Min(0.3 + (suspiciousCount * 0.2), 0.9);
                return new UrlResponse
                {
                    Action = score < 0.8 ? "warn" : "block",
                    Score = score,
                    Reason = $"Найдены подозрительные ключевые слова: {string.Join(", ", foundKeywords)}"
                };
            }

            // Проверка подозрительных паттернов
            var suspiciousPatterns = new[] { "bit.ly", "tinyurl", "short.link", "free-", "win-", "prize-", "money-", "verify", "confirm", "urgent" };
            var patternMatches = suspiciousPatterns.Where(pattern => fullUrl.Contains(pattern)).ToList();

            if (patternMatches.Any())
            {
                return new UrlResponse
                {
                    Action = "warn",
                    Score = 0.6,
                    Reason = $"Подозрительные паттерны: {string.Join(", ", patternMatches)}"
                };
            }

            // Безопасный URL
            return new UrlResponse
            {
                Action = "allow",
                Score = 0.1,
                Reason = "URL выглядит безопасно"
            };
        }
        catch (Exception e)
        {
            return new UrlResponse
            {
                Action = "warn",
                Score = 0.5,
                Reason = $"Ошибка при анализе URL: {e.Message}"
            };
        }
    }
}

