// PhishGuard Background Service Worker
console.log('PhishGuard background service worker loaded');

// Конфигурация
const API_BASE_CANDIDATES = ['http://127.0.0.1:8002', 'http://localhost:8002'];
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
    } catch (_) {}
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
    // Пытаемся обратиться к каждому кандидату; первый успешный ответ используем
    for (const base of API_BASE_CANDIDATES) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2500);
        const resp = await fetch(`${base}/v1/check/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });
        clearTimeout(t);
        if (!resp.ok) continue;
        result = await resp.json();
        break;
      } catch (_) { /* пробуем следующий base */ }
    }
    if (!result) throw new Error('API not reachable');

    // Кэшируем результат
    urlCache.set(url, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error('Error checking URL:', error);
    return { action: 'warn', score: 0.5, reason: 'Ошибка при проверке URL', error: error.message };
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
      } catch (_) {}
    }
    
    // По умолчанию включено, если API недоступен
    return true;
  } catch (error) {
    console.error('Error checking auto-scan status:', error);
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
      } catch (_) {}
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
    console.error('Error in auto AI scan:', error);
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
      console.error('Error in navigation handler:', error);
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

// Обработка сообщений от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.type === 'CHECK_URL') {
    const forceRefresh = message.forceRefresh || false;
    checkUrl(message.url, forceRefresh).then(result => {
      console.log(`URL check result (force=${forceRefresh}):`, result);
      sendResponse(result);
    }).catch(error => {
      console.error('URL check error:', error);
      sendResponse({
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
      for (const base of API_BASE_CANDIDATES) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2500);
          const resp = await fetch(`${base}/incidents/stats`, { signal: controller.signal });
          clearTimeout(t);
          if (!resp.ok) continue;
          const stats = await resp.json();
          console.log('Stats loaded:', stats);
          sendResponse(stats);
          return;
        } catch (_) { /* пробуем следующий base */ }
      }
      sendResponse({ error: 'API not reachable' });
    })();
    return true;
  }
  
  if (message.type === 'CLEAR_CACHE') {
    const clearedCount = urlCache.size;
    urlCache.clear();
    // Сбрасываем кеш выбора доступной API-базы, чтобы перепроверить /health при следующем запросе
    RESOLVED_API_BASE = null;
    console.log('Cache cleared, entries:', clearedCount);
    sendResponse({ success: true, cleared: clearedCount });
    return true;
  }
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
