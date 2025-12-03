using System.Text.Json;

namespace PhishGuard.Services.Services;

public class RulesService
{
    private readonly string _rulesPath;
    private Dictionary<string, object>? _cachedRules;

    public RulesService()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        _rulesPath = Path.Combine(baseDir, "rules.json");
    }

    public Dictionary<string, object> LoadRules()
    {
        if (_cachedRules != null)
            return _cachedRules;

        try
        {
            if (File.Exists(_rulesPath))
            {
                var json = File.ReadAllText(_rulesPath);
                _cachedRules = JsonSerializer.Deserialize<Dictionary<string, object>>(json) 
                    ?? GetDefaultRules();
            }
            else
            {
                _cachedRules = GetDefaultRules();
                SaveRules(_cachedRules);
            }
        }
        catch
        {
            _cachedRules = GetDefaultRules();
        }

        return _cachedRules;
    }

    public bool SaveRules(Dictionary<string, object> rules)
    {
        try
        {
            var json = JsonSerializer.Serialize(rules, new JsonSerializerOptions 
            { 
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            });
            File.WriteAllText(_rulesPath, json);
            _cachedRules = rules;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private Dictionary<string, object> GetDefaultRules()
    {
        return new Dictionary<string, object>
        {
            ["blacklist_domains"] = new List<object>(),
            ["whitelist_domains"] = new List<object>(),
            ["suspicious_keywords"] = new List<object>(),
            ["trusted_domains"] = new List<object>(),
            ["suspicious_tlds"] = new List<object>(),
            ["http_allowlist"] = new List<object>()
        };
    }
}

