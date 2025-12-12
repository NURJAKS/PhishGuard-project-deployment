// PhishGuard Background Service Worker
console.log('PhishGuard background service worker loaded');

// Конфигурация
const API_BASE_CANDIDATES = ['http://127.0.0.1:8000', 'http://localhost:8000'];
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

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === "runGobuster") {

        const domain = msg.domain;

        // Это пример — позже заменим реальным gobuster CLI
        const output = `
  Запуск Gobuster...
  Домен: ${domain}
  
  [200] /admin
  [403] /secret
  [404] /backup
  
  Скан завершён.
          `;

        sendResponse({ output });
      }

      return true;
    });


    // Показываем результат в уведомлении
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'PhishGuard',
      message: `URL: ${result.action.toUpperCase()}\nПричина: ${result.reason}`
    });
  }
});
