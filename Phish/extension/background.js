// PhishGuard Background Service Worker
console.log('PhishGuard background service worker loaded');

// Конфигурация
const API_BASE_CANDIDATES = [
  'http://127.0.0.1:8002',
  'http://localhost:8002'
];
let RESOLVED_API_BASE = null;
async function resolveApiBase() {
  if (RESOLVED_API_BASE) return RESOLVED_API_BASE;
  for (const base of API_BASE_CANDIDATES) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1000);
      await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(t);
      RESOLVED_API_BASE = base;
      return base;
    } catch (_) { }
  }
  // fallback по умолчанию
  RESOLVED_API_BASE = API_BASE_CANDIDATES[0];
  return RESOLVED_API_BASE;
}

// Кэш для избежания повторных проверок одного URL
const urlCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

function isEmailWebUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const h = u.hostname.toLowerCase();
    // MVP: Gmail Web + Outlook Web
    if (h === 'mail.google.com') return true;
    if (h.includes('outlook.office.com')) return true;
    if (h.includes('outlook.office365.com')) return true;
    if (h.includes('outlook.live.com')) return true;
    if (h.includes('office.com') && u.pathname.includes('/mail')) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

async function resolveRedirects(urls, max = 5) {
  const unique = Array.from(new Set((urls || []).filter(Boolean))).slice(0, max);
  const out = [];
  for (const u of unique) {
    // Some endpoints reject HEAD; we fall back to GET with small timeouts.
    let finalUrl = u;
    let error = null;
    try {
      const t1 = timeoutSignal(2500);
      try {
        const resp = await fetch(u, { method: 'HEAD', redirect: 'follow', credentials: 'omit', signal: t1.signal });
        finalUrl = resp.url || u;
      } finally { t1.cancel(); }
    } catch (e) {
      error = e?.message || String(e);
      try {
        const t2 = timeoutSignal(3500);
        try {
          const resp2 = await fetch(u, { method: 'GET', redirect: 'follow', credentials: 'omit', signal: t2.signal });
          finalUrl = resp2.url || u;
        } finally { t2.cancel(); }
        error = null;
      } catch (e2) {
        error = e2?.message || error || String(e2);
      }
    }
    out.push({ url: u, finalUrl, error });
  }
  return out;
}

function getDomainFromEmail(email) {
  const m = String(email || '').toLowerCase().match(/@([^>\s]+)/);
  return m ? m[1] : '';
}

function getDomainFromUrl(rawUrl) {
  try { return new URL(rawUrl).hostname.toLowerCase(); } catch { return ''; }
}

function levenshtein(a, b) {
  a = (a || '').toLowerCase();
  b = (b || '').toLowerCase();
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function looksLikeTyposquat(senderDomain, linkDomain) {
  if (!senderDomain || !linkDomain) return false;
  if (senderDomain === linkDomain) return false;
  // Only compare eTLD-ish by last 2 labels (simple MVP).
  const s = senderDomain.split('.').slice(-2).join('.');
  const l = linkDomain.split('.').slice(-2).join('.');
  if (s === l) return false;
  const dist = levenshtein(s, l);
  return dist > 0 && dist <= 2;
}

function computeLocalEmailSignals(payload) {
  const fromEmail = payload?.headers?.from?.email || '';
  const replyToEmail = payload?.headers?.replyTo?.email || '';
  const returnPathEmail = payload?.headers?.returnPath?.email || '';
  const senderDomain = getDomainFromEmail(fromEmail);
  const replyDomain = getDomainFromEmail(replyToEmail);
  const returnDomain = getDomainFromEmail(returnPathEmail);

  const links = payload?.links || [];
  const linkDomains = Array.from(new Set(links.map(l => getDomainFromUrl(l.finalUrl || l.url)).filter(Boolean)));

  const identityWarnings = [];
  if (fromEmail && replyToEmail && senderDomain && replyDomain && senderDomain !== replyDomain) {
    identityWarnings.push('From и Reply-To указывают на разные домены');
  }
  if (fromEmail && returnPathEmail && senderDomain && returnDomain && senderDomain !== returnDomain) {
    identityWarnings.push('From и Return-Path указывают на разные домены');
  }

  const linkWarnings = [];
  if (senderDomain && linkDomains.length) {
    const different = linkDomains.filter(d => d !== senderDomain);
    if (different.length) {
      linkWarnings.push('Домен отправителя не совпадает с доменом ссылок');
    }
    const typo = linkDomains.find(d => looksLikeTyposquat(senderDomain, d));
    if (typo) {
      linkWarnings.push(`Возможное сходство доменов (typosquatting): ${senderDomain} ↔ ${typo}`);
    }
  }

  // Urgency/pressure heuristic (RU/EN basic)
  const text = String(payload?.body?.text || '').toLowerCase();
  const urgencyTokens = ['срочно', 'немедленно', 'в течение', 'последнее предупреждение', 'аккаунт', 'блок', 'подтвердите', 'перейдите по ссылке', 'обновите', 'security alert', 'urgent', 'immediately', 'verify', 'reset', 'your account'];
  const hits = urgencyTokens.filter(t => text.includes(t)).slice(0, 6);

  return {
    senderDomain,
    linkDomains,
    identityWarnings,
    linkWarnings,
    urgencyHits: hits,
  };
}

const EMAIL_AUTO_KEY = 'emailAutoEnabled';
const EMAIL_REPORTS_KEY = 'emailReports';
const EMAIL_REPORTS_ORDER_KEY = 'emailReportsOrder';
const EMAIL_LAST_REPORT_KEY = 'emailLastReport';
const EMAIL_NOTIF_PREFIX = 'phishguard_email_';
const EMAIL_NOTIF_MAP = new Map(); // notifId -> reportId (best-effort, SW may restart)

async function isEmailAutoEnabled() {
  try {
    const stored = await chrome.storage.local.get([EMAIL_AUTO_KEY]);
    return stored[EMAIL_AUTO_KEY] === true;
  } catch (_) {
    return false;
  }
}

function safeText(s, max = 180) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function storeEmailReport(report) {
  const id = report.id;
  const stored = await chrome.storage.local.get([EMAIL_REPORTS_KEY, EMAIL_REPORTS_ORDER_KEY]);
  const reports = stored[EMAIL_REPORTS_KEY] || {};
  let order = stored[EMAIL_REPORTS_ORDER_KEY] || [];

  reports[id] = report;
  order = [id, ...order.filter(x => x !== id)].slice(0, 20);

  // prune removed ids
  const keep = new Set(order);
  for (const k of Object.keys(reports)) {
    if (!keep.has(k)) delete reports[k];
  }

  await chrome.storage.local.set({
    [EMAIL_REPORTS_KEY]: reports,
    [EMAIL_REPORTS_ORDER_KEY]: order,
    [EMAIL_LAST_REPORT_KEY]: report
  });
}

async function notifyEmailReport(report) {
  try {
    const enabled = await isEmailAutoEnabled();
    if (!enabled) return;
  } catch (_) { return; }

  const risk = report.risk_level || 'Medium';
  const score = report.risk_score ?? 0;
  const title = `PhishGuard — Email: ${risk === 'Low' ? 'Low' : (risk === 'Medium' ? 'Medium' : 'High')} (${score}%)`;
  const message = safeText(report.summary || (report.reasons && report.reasons[0]) || 'Отчёт готов. Нажмите, чтобы открыть подробности.', 180);

  const notifId = `${EMAIL_NOTIF_PREFIX}${report.id}`;
  EMAIL_NOTIF_MAP.set(notifId, report.id);

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message
  });
}

chrome.notifications.onClicked.addListener((notifId) => {
  try {
    if (!String(notifId || '').startsWith(EMAIL_NOTIF_PREFIX)) return;
    const reportId = EMAIL_NOTIF_MAP.get(notifId) || notifId.replace(EMAIL_NOTIF_PREFIX, '') || 'latest';
    const url = chrome.runtime.getURL(`email-report.html?id=${encodeURIComponent(reportId)}`);
    chrome.tabs.create({ url });
  } catch (e) {
    console.warn('Email notification click handler error:', e);
  }
});

// Функция для проверки URL
async function checkUrl(url, forceRefresh = false) {
  try {
    // Проверяем кэш (если не принудительное обновление)
    if (!forceRefresh && urlCache.has(url)) {
      const cached = urlCache.get(url);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Using cached result for ${url}`);
        return cached.result;
      }
    }

    console.log(`Checking URL: ${url}`);

    let result = null;
    let lastError = null;

    // Пытаемся обратиться к каждому кандидату; первый успешный ответ используем
    for (const base of API_BASE_CANDIDATES) {
      try {
        const controller = new AbortController();
        // Увеличиваем таймаут до 5 секунд, так как локальный сервер может отвечать не сразу
        const t = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${base}/v1/check/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });
        clearTimeout(t);
        if (!resp.ok) {
          lastError = `HTTP ${resp.status}`;
          continue;
        }
        result = await resp.json();
        break;
      } catch (e) {
        lastError = e.message;
        /* пробуем следующий base */
      }
    }

    if (!result) {
      // Если API недоступен, не, возвращаем нейтральный результат, чтобы не блокировать работу
      console.warn(`API unavailable (${lastError}). Skipping check for: ${url}`);
      return { action: 'allow', score: 0, reason: 'Сервер недоступен (local mode)' };
    }

    // Кэшируем результат
    urlCache.set(url, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    // Используем warn вместо error, чтобы не засорять консоль ошибок расширения при сбоях сети
    console.warn('Warning checking URL:', error.message);
    return { action: 'allow', score: 0, reason: 'Ошибка проверки', error: error.message };
  }
}

// Функция для проверки статуса автосканирования
async function isAutoScanEnabled() {
  try {
    // Сначала проверяем chrome.storage (быстрый доступ)
    const stored = await chrome.storage.local.get(['autoScanEnabled']);
    if (stored.autoScanEnabled !== undefined) {
      return stored.autoScanEnabled;
    }

    // Если нет в storage, проверяем через API
    for (const base of API_BASE_CANDIDATES) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 1000);
        const resp = await fetch(`${base}/admin/auto-scan`, { signal: controller.signal });
        clearTimeout(t);
        if (resp.ok) {
          const data = await resp.json();
          const enabled = data.enabled !== false;
          // Сохраняем в storage для быстрого доступа
          chrome.storage.local.set({ autoScanEnabled: enabled });
          return enabled;
        }
      } catch (_) { }
    }

    // По умолчанию включено, если API недоступен
    return true;
  } catch (error) {
    console.warn('Warning checking auto-scan status:', error.message);
    return true; // По умолчанию включено
  }
}

// Функция для автоматического AI-скана
async function performAutoAiScan(url) {
  try {
    // Проверяем, включено ли автосканирование
    const enabled = await isAutoScanEnabled();
    if (!enabled) {
      console.log('Auto AI scan skipped: disabled by admin');
      return;
    }

    // Проверяем, что это обычный HTTP/HTTPS URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return;
    }

    // Находим доступный API endpoint
    let apiBase = null;
    for (const base of API_BASE_CANDIDATES) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 1000);
        await fetch(`${base}/health`, { signal: controller.signal });
        clearTimeout(t);
        apiBase = base;
        break;
      } catch (_) { }
    }

    if (!apiBase) {
      console.log('AI scan skipped: API not available');
      return;
    }

    // Выполняем AI-скан в фоне (не блокируем пользователя)
    fetch(`${apiBase}/v1/ai/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] })
    }).then(resp => {
      if (resp.ok) {
        return resp.json();
      }
      return null;
    }).then(data => {
      if (data && data.items && data.items.length > 0) {
        const item = data.items[0];
        const risk = (item.risk || '').toUpperCase();

        // Показываем уведомление только для высокого риска
        if (risk === 'HIGH') {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '⚠️ PhishGuard - Высокий риск фишинга',
            message: `Обнаружен высокий риск на сайте:\n${url}\nПричины: ${(item.reasons || []).slice(0, 2).join(', ')}`
          });
        }
        console.log(`Auto AI scan for ${url}: risk=${risk}`);
      }
    }).catch(err => {
      console.log('Auto AI scan error:', err);
    });
  } catch (error) {
    console.warn('Warning in auto AI scan:', error.message);
  }
}

// Обработка навигации по страницам
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId === 0) { // Только главная страница
    const url = details.url;

    // Пропускаем chrome:// и другие внутренние URL
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return;
    }
    // Не мешаем webmail (там работает отдельный in-email анализ)
    if (isEmailWebUrl(url)) return;

    try {
      const result = await checkUrl(url);

      // Отправляем результат в content script
      chrome.tabs.sendMessage(details.tabId, {
        type: 'URL_CHECK_RESULT',
        url: url,
        result: result
      }).catch(() => {
        // Игнорируем ошибки если content script не готов
      });

      // Если URL заблокирован, показываем предупреждение
      if (result.action === 'block') {
        // Показываем уведомление о блокировке
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'PhishGuard - Доступ заблокирован',
          message: `Сайт заблокирован: ${url}\nПричина: ${result.reason}`
        });

        // Перенаправляем на безопасную страницу
        chrome.tabs.update(details.tabId, {
          url: 'https://www.google.com'
        });
      }
    } catch (error) {
      console.warn('Warning in navigation handler:', error.message);
    }
  }
});

// Автоматический AI-скан после загрузки страницы
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId === 0) { // Только главная страница
    const url = details.url;

    // Пропускаем chrome:// и другие внутренние URL
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return;
    }
    if (isEmailWebUrl(url)) return;

    // Выполняем автоматический AI-скан
    performAutoAiScan(url);
  }
});

// Слушаем изменения в storage для автосканирования
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.autoScanEnabled) {
    console.log('Auto-scan setting changed:', changes.autoScanEnabled.newValue);
  }
});


// ==================== Gobuster Utilities ====================

// Нормализация URL: оставляет только схему и домен (корень сайта)
function normalizeTargetUrl(url) {
  try {
    const u = new URL(url);
    // Всегда возвращаем корень http(s)://domain.com/
    return `${u.protocol}//${u.host}/`;
  } catch (e) {
    return url;
  }
}

// Выбор оптимального словаря на основе домена
function selectOptimalWordlist(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();

    // Тестовые и уязвимые сайты (heavy testing)
    if (hostname.includes('test') || hostname.includes('demo') || hostname.includes('vuln') || hostname.includes('bwapp') || hostname.includes('hack')) {
      return 'raft-large-directories-lowercase.txt';
    }

    // Для остальных - small или wordlist (быстрый скан)
    // Мы убрали medium для коротких доменов, так как пользователь предпочитает wordlist.txt
    return 'wordlist.txt';
  } catch (e) {
    return 'wordlist.txt';
  }
}
// =============================================================

// Обработка сообщений от content script и popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  // Флаг для отслеживания, был ли отправлен ответ
  let responseSent = false;

  const safeSendResponse = (data) => {
    if (!responseSent) {
      responseSent = true;
      try {
        sendResponse(data);
      } catch (e) {
        console.warn('Warning sending response:', e);
      }
    }
  };

  if (message.type === 'CHECK_URL') {
    const forceRefresh = message.forceRefresh || false;
    checkUrl(message.url, forceRefresh).then(result => {
      console.log(`URL check result (force=${forceRefresh}):`, result);
      safeSendResponse(result);
    }).catch(error => {
      console.warn('Warning URL check error:', error.message);
      safeSendResponse({
        action: 'error',
        score: 0,
        reason: 'Ошибка проверки',
        error: error.message
      });
    });
    return true; // Указываем что ответ будет асинхронным
  }

  if (message.type === 'EMAIL_AUTO_ANALYZE') {
    (async () => {
      try {
        const enabled = await isEmailAutoEnabled();
        if (!enabled) {
          safeSendResponse({ ok: false, error: 'Email auto-check выключен в расширении' });
          return;
        }

        const apiBase = await resolveApiBase();
        const payload = message.payload || {};

        // Resolve redirects in background (no content download/JS exec).
        const resolved = await resolveRedirects((payload.links || []).map(l => l.url), 5);
        const links = resolved.map(r => ({
          url: r.url,
          finalUrl: r.finalUrl,
          finalDomain: getDomainFromUrl(r.finalUrl || r.url),
          error: r.error || null
        }));

        const localSignals = computeLocalEmailSignals({ ...payload, links });

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 12000);
        const resp = await fetch(`${apiBase}/v1/email/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: payload.platform,
            message_key: payload.messageKey,
            headers: payload.headers || {},
            subject: payload.subject || '',
            body: { text: payload.body?.text || '', html: payload.body?.html || '' },
            links,
            attachments: payload.attachments || [],
            local_signals: localSignals,
          }),
          signal: controller.signal
        });
        clearTimeout(t);

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          safeSendResponse({ ok: false, error: txt || `HTTP ${resp.status}` });
          return;
        }
        const data = await resp.json();

        // Store + notify (neutral). Keep payload minimal (metadata only).
        const reportId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
        const report = {
          id: reportId,
          ts: Date.now(),
          platform: payload.platform || '',
          message_key: payload.messageKey || '',
          from: payload?.headers?.from?.email || payload?.headers?.from?.name || '',
          subject: payload.subject || '',
          risk_level: data?.risk_level || 'Medium',
          risk_score: data?.risk_score ?? 0,
          summary: data?.summary || '',
          reasons: Array.isArray(data?.reasons) ? data.reasons.slice(0, 6) : [],
          recommendations: Array.isArray(data?.recommendations) ? data.recommendations.slice(0, 6) : [],
          links: Array.isArray(links) ? links.slice(0, 6) : []
        };
        await storeEmailReport(report);
        await notifyEmailReport(report);

        safeSendResponse({ ok: true, data });
      } catch (e) {
        safeSendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (message.type === 'GET_STATS') {
    (async () => {
      try {
        for (const base of API_BASE_CANDIDATES) {
          try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 2500);
            const resp = await fetch(`${base}/incidents/stats`, { signal: controller.signal });
            clearTimeout(t);
            if (!resp.ok) continue;
            const stats = await resp.json();
            console.log('Stats loaded:', stats);
            safeSendResponse(stats);
            return;
          } catch (_) { /* пробуем следующий base */ }
        }
        safeSendResponse({ error: 'API not reachable' });
      } catch (error) {
        safeSendResponse({ error: error.message || 'Unknown error' });
      }
    })();
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    const clearedCount = urlCache.size;
    urlCache.clear();
    RESOLVED_API_BASE = null;
    console.log('Cache cleared, entries:', clearedCount);
    safeSendResponse({ success: true, cleared: clearedCount });
    return true;
  }

  if (message.type === 'RUN_GOBUSTER') {
    (async () => {
      try {
        console.log('Original URL for Gobuster:', message.url);

        // 1. Нормализация URL
        const targetUrl = normalizeTargetUrl(message.url);
        console.log('Normalized Target URL:', targetUrl);

        // 2. Выбор словаря (если не передан явно)
        // Используем жестко заданный 'wordlist.txt' если не задано иное, но функция selectOptimalWordlist уже это делает
        const wordlist = message.wordlist || selectOptimalWordlist(targetUrl);
        console.log('Selected Wordlist:', wordlist);

        const apiBase = await resolveApiBase();
        console.log('Using API base:', apiBase);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 минуты таймаут

        const resp = await fetch(`${apiBase}/v1/vuln/gobuster`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, wordlist: wordlist }), // Используем нормализованный URL и выбранный словарь
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errorText = '';
          try {
            errorText = await resp.text();
          } catch (_) {
            errorText = `HTTP ${resp.status}`;
          }
          safeSendResponse({ error: `HTTP ${resp.status}: ${errorText}` });
          return;
        }

        const data = await resp.json();
        console.log('Gobuster result:', data);
        safeSendResponse({ success: true, data });
      } catch (error) {
        console.error('Gobuster error:', error);
        safeSendResponse({
          error: error.message || error.toString() || 'Unknown error',
          details: error.name
        });
      }
    })();
    return true; // ВАЖНО: возвращаем true для асинхронного ответа
  }

  if (message.type === 'RUN_PORT_SCAN') {
    (async () => {
      try {
        console.log('Running Port Scan for URL:', message.url);
        
        // Нормализация URL для получения домена
        const targetUrl = normalizeTargetUrl(message.url);
        console.log('Normalized Target URL:', targetUrl);
        
        const apiBase = await resolveApiBase();
        console.log('Using API base:', apiBase);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 минуты таймаут

        const resp = await fetch(`${apiBase}/v1/vuln/portscan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errorText = '';
          try {
            errorText = await resp.text();
          } catch (_) {
            errorText = `HTTP ${resp.status}`;
          }
          safeSendResponse({ error: `HTTP ${resp.status}: ${errorText}` });
          return;
        }

        const data = await resp.json();
        console.log('Port Scan result:', data);
        safeSendResponse({ success: true, data });
      } catch (error) {
        console.error('Port Scan error:', error);
        safeSendResponse({
          error: error.message || error.toString() || 'Unknown error',
          details: error.name
        });
      }
    })();
    return true; // ВАЖНО: возвращаем true для асинхронного ответа
  }

  if (message.type === 'RUN_JSDIRBUSTER') {
    (async () => {
      try {
        console.log('Running JSDirbuster for URL:', message.url);
        const apiBase = await resolveApiBase();
        console.log('Using API base:', apiBase);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 минуты таймаут

        const resp = await fetch(`${apiBase}/v1/vuln/jsdirbuster`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: message.url, wordlist: message.wordlist || null }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errorText = '';
          try {
            errorText = await resp.text();
          } catch (_) {
            errorText = `HTTP ${resp.status}`;
          }
          safeSendResponse({ error: `HTTP ${resp.status}: ${errorText}` });
          return;
        }

        const data = await resp.json();
        console.log('JSDirbuster result:', data);
        safeSendResponse({ success: true, data });
      } catch (error) {
        console.error('JSDirbuster error:', error);
        safeSendResponse({
          error: error.message || error.toString() || 'Unknown error',
          details: error.name
        });
      }
    })();
    return true; // ВАЖНО: возвращаем true для асинхронного ответа
  }

  if (message.type === 'RUN_PHP_SCAN') {
    (async () => {
      try {
        const apiBase = await resolveApiBase();
        console.log('Using API base:', apiBase);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const resp = await fetch(`${apiBase}/v1/tools/rips/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errorText = '';
          try {
            errorText = await resp.text();
          } catch (_) {
            errorText = `HTTP ${resp.status}`;
          }
          safeSendResponse({ error: `HTTP ${resp.status}: ${errorText}` });
          return;
        }

        const data = await resp.json();
        safeSendResponse({ success: true, data });
      } catch (error) {
        console.error('PHP scan error:', error);
        safeSendResponse({
          error: error.message || error.toString() || 'Unknown error',
          details: error.name
        });
      }
    })();
    return true;
  }

  if (message.type === 'RUN_SQL_SCAN') {
    (async () => {
      try {
        const apiBase = await resolveApiBase();
        console.log('Using API base:', apiBase);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const resp = await fetch(`${apiBase}/v1/tools/jsql/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errorText = '';
          try {
            errorText = await resp.text();
          } catch (_) {
            errorText = `HTTP ${resp.status}`;
          }
          safeSendResponse({ error: `HTTP ${resp.status}: ${errorText}` });
          return;
        }

        const data = await resp.json();
        safeSendResponse({ success: true, data });
      } catch (error) {
        console.error('SQL scan error:', error);
        safeSendResponse({
          error: error.message || error.toString() || 'Unknown error',
          details: error.name
        });
      }
    })();
    return true;
  }

  if (message.type === 'RUN_CRAWLER_SCAN') {
    (async () => {
      try {
        const apiBase = await resolveApiBase();
        console.log('Using API base:', apiBase);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200000);

        const resp = await fetch(`${apiBase}/v1/tools/siteone/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: message.url, mode: message.mode || 'fast' }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errorText = '';
          try {
            errorText = await resp.text();
          } catch (_) {
            errorText = `HTTP ${resp.status}`;
          }
          safeSendResponse({ error: `HTTP ${resp.status}: ${errorText}` });
          return;
        }

        const data = await resp.json();
        safeSendResponse({ success: true, data });
      } catch (error) {
        console.error('Crawler error:', error);
        safeSendResponse({
          error: error.message || error.toString() || 'Unknown error',
          details: error.name
        });
      }
    })();
    return true;
  }

  // Если тип сообщения не распознан
  console.warn('Unknown message type:', message.type);
  return false;
});

// Инициализация при установке расширения
chrome.runtime.onInstalled.addListener(() => {
  console.log('PhishGuard extension installed');

  // Создаем контекстное меню
  chrome.contextMenus.create({
    id: 'checkUrl',
    title: 'Проверить URL с PhishGuard',
    contexts: ['link']
  });
});

// Обработка клика по контекстному меню
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'checkUrl' && info.linkUrl) {
    const result = await checkUrl(info.linkUrl);

    // Показываем результат в уведомлении
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'PhishGuard',
      message: `URL: ${result.action.toUpperCase()}\nПричина: ${result.reason}`
    });
  }
});
