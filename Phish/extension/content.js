// PhishGuard Content Script
console.log('PhishGuard content script loaded');

function isEmailWebHost() {
  const h = (location.hostname || '').toLowerCase();
  if (h === 'mail.google.com') return true;
  if (h.includes('outlook.office.com')) return true;
  if (h.includes('outlook.office365.com')) return true;
  if (h.includes('outlook.live.com')) return true;
  if (h.includes('office.com') && location.pathname.includes('/mail')) return true;
  return false;
}

const EMAIL_AUTO_KEY = 'emailAutoEnabled';
let EMAIL_AUTO_STARTED = false;
let EMAIL_AUTO_OBSERVER = null;

async function isEmailAutoEnabled() {
  try {
    const stored = await chrome.storage.local.get([EMAIL_AUTO_KEY]);
    return stored[EMAIL_AUTO_KEY] === true;
  } catch (_) {
    return false;
  }
}

function stopEmailAutoCheck() {
  try {
    if (EMAIL_AUTO_OBSERVER) {
      EMAIL_AUTO_OBSERVER.disconnect();
      EMAIL_AUTO_OBSERVER = null;
    }
  } catch (_) { }
  EMAIL_AUTO_STARTED = false;
  try {
    const p = document.getElementById('phishguard-email-panel');
    if (p) p.remove();
  } catch (_) { }
}

function startEmailAutoCheck() {
  if (EMAIL_AUTO_STARTED) return;
  EMAIL_AUTO_STARTED = true;
  try {
    initEmailAutoCheck();
  } catch (e) {
    console.warn('[PhishGuard][Email] start failed:', e);
  }
}
// ===================== Email Auto-Check (Gmail / Outlook Web) =====================
// MVP: best-effort metadata + links only, no attachments download, no JS execution.
const EMAIL_SCAN_STATE = {
  lastKey: null,
  lastBodyHash: null,
  timer: null,
  inFlight: false,
};

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function sha1(text) {
  // lightweight hash for debounce; crypto is not required here
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function stripScripts(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

function extractUrlsFromText(text) {
  const out = new Set();
  const re = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  const matches = String(text || '').match(re) || [];
  for (const m of matches) out.add(m);
  return Array.from(out);
}

function normalizeEmail(s) {
  const m = String(s || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

function getGmailMessageKey() {
  // Gmail uses hash routing, stable enough for debouncing within session
  const h = String(location.hash || '');
  if (h.includes('#')) return h;
  return '';
}

function getOutlookMessageKey() {
  // Outlook uses SPA routes, best-effort on URL + selected item id in DOM
  const urlKey = `${location.pathname}${location.search}${location.hash}`;
  const sel = document.querySelector('[aria-label][aria-selected="true"][data-convid], [aria-label][aria-selected="true"][data-item-id], [data-convid][aria-selected="true"]');
  const domKey = sel ? (sel.getAttribute('data-convid') || sel.getAttribute('data-item-id') || '') : '';
  return domKey ? `${urlKey}::${domKey}` : urlKey;
}

function findGmailBodyRoot() {
  // Common Gmail message body container
  return (
    document.querySelector('div.a3s.aiL, div.a3s') ||
    // Fallbacks for layout changes
    document.querySelector('div.adn div[dir="ltr"]') ||
    document.querySelector('div[role="main"] div[dir="ltr"]')
  );
}

function extractGmail() {
  const bodyRoot = findGmailBodyRoot();

  const subjectEl = document.querySelector('h2.hP');
  const subject = subjectEl ? subjectEl.textContent.trim() : '';

  // From: span.gD usually contains display name, attribute "email" holds address
  const fromEl = document.querySelector('span.gD[email]') || document.querySelector('span.gD');
  const fromEmail = fromEl ? (fromEl.getAttribute('email') || normalizeEmail(fromEl.getAttribute('title') || fromEl.textContent)) : '';
  const fromName = fromEl ? (fromEl.textContent || '').trim() : '';

  // Reply-To / Return-Path are not reliably accessible without "Show original". Best-effort only.
  const headers = {
    from: { name: fromName, email: fromEmail },
    replyTo: null,
    returnPath: null,
    messageId: null,
    received: null
  };

  const html = bodyRoot ? stripScripts(bodyRoot.innerHTML || '') : '';
  const text = bodyRoot ? ((bodyRoot.textContent || '').trim()) : '';

  // Links: anchor hrefs + plain URLs
  const links = new Set();
  if (bodyRoot) {
    bodyRoot.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http://') || href.startsWith('https://')) links.add(href);
    });
  }
  extractUrlsFromText(text).forEach(u => links.add(u));

  // Attachments: best-effort from visible attachment chips
  const attachments = [];
  document.querySelectorAll('div.aQH span.aV3, span.aV3').forEach(el => {
    const name = (el.textContent || '').trim();
    if (name && name.length < 256) attachments.push({ name, mime: null, size: null });
  });

  return {
    platform: 'gmail',
    messageKey: getGmailMessageKey() || `${location.pathname}${location.search}${location.hash}::${fromEmail}::${subject}`.slice(0, 180),
    subject,
    headers,
    body: { text: text.slice(0, 4000), html: html.slice(0, 8000) },
    links: Array.from(links).slice(0, 30).map(url => ({ url })),
    attachments: attachments.slice(0, 10)
  };
}

function findOutlookBodyRoot() {
  // Outlook reading pane often uses role="document" or data attributes; best-effort selectors
  return document.querySelector('div[role="document"]') ||
    document.querySelector('div[data-testid="message-body"]') ||
    document.querySelector('div[aria-label="Message body"]');
}

function extractOutlook() {
  const bodyRoot = findOutlookBodyRoot();

  const subjectEl = document.querySelector('div[role="heading"][aria-level="2"], div[role="heading"], h1');
  const subject = subjectEl ? (subjectEl.textContent || '').trim() : '';

  // From field: heuristic
  const fromCandidate = document.querySelector('[data-testid="message-header"] [title*="@"]') ||
    document.querySelector('span[title*="@"]') ||
    document.querySelector('div[aria-label*="From"] span');
  const fromEmail = fromCandidate ? normalizeEmail(fromCandidate.getAttribute('title') || fromCandidate.textContent) : '';
  const fromName = fromCandidate ? (fromCandidate.textContent || '').trim() : '';

  const headers = {
    from: { name: fromName, email: fromEmail },
    replyTo: null,
    returnPath: null,
    messageId: null,
    received: null
  };

  const html = bodyRoot ? stripScripts(bodyRoot.innerHTML || '') : '';
  const text = bodyRoot ? ((bodyRoot.textContent || '').trim()) : '';

  const links = new Set();
  if (bodyRoot) {
    bodyRoot.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http://') || href.startsWith('https://')) links.add(href);
    });
  }
  extractUrlsFromText(text).forEach(u => links.add(u));

  const attachments = [];
  document.querySelectorAll('[data-testid="attachments"] [title], [aria-label*="Attachment"] [title]').forEach(el => {
    const name = (el.getAttribute('title') || el.textContent || '').trim();
    if (name && name.length < 256) attachments.push({ name, mime: null, size: null });
  });

  return {
    platform: 'outlook',
    messageKey: getOutlookMessageKey() || `${location.pathname}${location.search}${location.hash}::${fromEmail}::${subject}`.slice(0, 180),
    subject,
    headers,
    body: { text: text.slice(0, 4000), html: html.slice(0, 8000) },
    links: Array.from(links).slice(0, 30).map(url => ({ url })),
    attachments: attachments.slice(0, 10)
  };
}

function ensureEmailPanel() {
  const existing = document.getElementById('phishguard-email-panel');
  if (existing) return existing;

  // Gmail/Outlook SPA can run content script very early (document_start).
  // Avoid throwing before <body> exists.
  if (!document.body) {
    setTimeout(() => {
      try { ensureEmailPanel(); } catch (_) { /* ignore */ }
    }, 300);
    return null;
  }

  const panel = document.createElement('div');
  panel.id = 'phishguard-email-panel';
  panel.attachShadow({ mode: 'open' });

  panel.shadowRoot.innerHTML = `
    <style>
      :host { all: initial; display: block; }
      .wrap {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        border: 1px solid rgba(0,0,0,0.14);
        background: rgba(0,0,0,0.03);
        color: #111827;
        border-radius: 10px;
        padding: 10px 12px;
        margin: 10px 0;
        position: sticky;
        top: 0;
        z-index: 9999;
      }
      .row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .left { display:flex; align-items:center; gap:10px; min-width:0; }
      .bar { width: 3px; height: 34px; border-radius: 999px; background:#94A3B8; flex:0 0 auto; }
      .title { font-weight:700; font-size:12px; white-space:nowrap; }
      .meta { color:#9AA2AD; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .btn {
        border: 1px solid rgba(84,157,255,0.28);
        background: rgba(84,157,255,0.14);
        color: #dfe8ff;
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .details { margin-top:10px; display:none; color:#cfd4db; font-size:12px; line-height:1.45; }
      .details ul { margin: 6px 0 0 18px; color:#9AA2AD; }
      .muted { color:#9AA2AD; }
    </style>
    <div class="wrap">
      <div class="row">
        <div class="left">
          <div class="bar" id="riskBar"></div>
          <div style="min-width:0;">
            <div class="title" id="riskTitle">Оценка доверия письма: —</div>
            <div class="meta" id="riskMeta">Ожидание письма…</div>
          </div>
        </div>
        <button class="btn" id="toggleBtn">Подробнее</button>
      </div>
      <div class="details" id="details"></div>
    </div>
  `;

  panel.shadowRoot.getElementById('toggleBtn').addEventListener('click', () => {
    const d = panel.shadowRoot.getElementById('details');
    d.style.display = d.style.display === 'block' ? 'none' : 'block';
  });

  // Insert deterministically right before message body (or fallback to body).
  try {
    if (location.hostname === 'mail.google.com') {
      const body = findGmailBodyRoot();
      const anchor = body || document.querySelector('div[role="main"]') || document.body;
      if (body && body.parentElement) {
        body.parentElement.insertBefore(panel, body);
      } else if (anchor && anchor.insertBefore) {
        anchor.insertBefore(panel, anchor.firstChild);
      } else {
        document.body.prepend(panel);
      }
    } else {
      const body = findOutlookBodyRoot();
      const anchor = body || document.querySelector('div[role="main"]') || document.body;
      if (body && body.parentElement) {
        body.parentElement.insertBefore(panel, body);
      } else if (anchor && anchor.insertBefore) {
        anchor.insertBefore(panel, anchor.firstChild);
      } else {
        document.body.prepend(panel);
      }
    }
    console.log('[PhishGuard][Email] panel inserted');
  } catch (e) {
    console.warn('[PhishGuard][Email] panel insert failed, fallback to body:', e);
    try {
      document.body.prepend(panel);
      console.log('[PhishGuard][Email] panel inserted (fallback)');
    } catch (_) { /* ignore */ }
  }
  return panel;
}

function setPanelState(panel, state) {
  const bar = panel.shadowRoot.getElementById('riskBar');
  const title = panel.shadowRoot.getElementById('riskTitle');
  const meta = panel.shadowRoot.getElementById('riskMeta');
  const details = panel.shadowRoot.getElementById('details');

  if (state.kind === 'loading') {
    bar.style.background = '#94A3B8';
    title.textContent = 'Оценка доверия письма: выполняется анализ…';
    meta.textContent = state.text || 'Сбор метаданных и ссылок…';
    details.innerHTML = `<div class="muted">Проверка запускается автоматически при открытии письма.</div>`;
    return;
  }

  if (state.kind === 'error') {
    bar.style.background = '#9A3412';
    title.textContent = 'Оценка доверия письма: недоступна';
    meta.textContent = state.text || 'Не удалось выполнить анализ';
    details.innerHTML = `<div class="muted">${state.text || ''}</div>`;
    return;
  }

  // done
  const risk = state.data?.risk_level || 'Medium';
  const score = state.data?.risk_score ?? 0;
  const reasons = state.data?.reasons || [];
  const recs = state.data?.recommendations || [];

  const palette = { Low: '#94A3B8', Medium: '#F59E0B', High: '#9A3412' };
  bar.style.background = palette[risk] || '#94A3B8';
  title.textContent = `Оценка доверия письма: ${risk === 'Low' ? 'Низкий' : (risk === 'Medium' ? 'Средний' : 'Высокий')} риск (${score}%)`;
  meta.textContent = 'Вывод основан на анализе структуры, метаданных и ссылок. Может потребоваться ручная проверка.';

  const reasonsHtml = reasons.slice(0, 5).map(r => `<li>${r}</li>`).join('');
  const recsHtml = recs.slice(0, 4).map(r => `<li>${r}</li>`).join('');
  details.innerHTML = `
    <div><strong>Краткое резюме:</strong> ${state.data?.summary || ''}</div>
    <div style="margin-top:8px;"><strong>Причины:</strong><ul>${reasonsHtml || '<li class="muted">Нет</li>'}</ul></div>
    <div style="margin-top:8px;"><strong>Рекомендации:</strong><ul>${recsHtml || '<li class="muted">Нет</li>'}</ul></div>
  `;
}

async function runEmailScan(extracted) {
  const panel = ensureEmailPanel();
  if (!panel) return;
  setPanelState(panel, { kind: 'loading', text: 'Анализ ссылок и признаков доверия…' });

  chrome.runtime.sendMessage({ type: 'EMAIL_AUTO_ANALYZE', payload: extracted }, (resp) => {
    if (!resp || resp.ok !== true) {
      setPanelState(panel, { kind: 'error', text: (resp && resp.error) ? resp.error : 'Не удалось получить ответ от PhishGuard backend' });
      return;
    }
    setPanelState(panel, { kind: 'done', data: resp.data });
  });
}

const scheduleEmailScan = debounce(() => {
  if (EMAIL_SCAN_STATE.inFlight) return;

  // Ensure panel exists even if message DOM is still loading.
  const p = ensureEmailPanel();
  if (p) setPanelState(p, { kind: 'loading', text: 'Ожидание открытия письма…' });

  const extracted = (location.hostname === 'mail.google.com') ? extractGmail() : extractOutlook();
  if (!extracted || !extracted.messageKey) return;

  // Stable body hash to avoid repeated scans while DOM is still mutating
  const bodyHash = sha1(`${extracted.subject}::${extracted.headers?.from?.email}::${extracted.body?.text}`);
  const key = extracted.messageKey;

  if (EMAIL_SCAN_STATE.lastKey === key && EMAIL_SCAN_STATE.lastBodyHash === bodyHash) return;
  EMAIL_SCAN_STATE.lastKey = key;
  EMAIL_SCAN_STATE.lastBodyHash = bodyHash;

  EMAIL_SCAN_STATE.inFlight = true;
  runEmailScan(extracted);
  setTimeout(() => { EMAIL_SCAN_STATE.inFlight = false; }, 4000);
}, 900);

function initEmailAutoCheck() {
  console.log('[PhishGuard][Email] init');
  EMAIL_AUTO_OBSERVER = new MutationObserver(() => scheduleEmailScan());
  EMAIL_AUTO_OBSERVER.observe(document.documentElement, { childList: true, subtree: true });
  // Always show panel so user sees feature is active (even if message DOM not fully detected yet).
  const panel = ensureEmailPanel();
  if (panel) setPanelState(panel, { kind: 'loading', text: 'Ожидание открытия письма…' });

  // initial attempt + bounded periodic retries for SPA transitions
  scheduleEmailScan();
  let tries = 0;
  const t = setInterval(() => {
    tries += 1;
    scheduleEmailScan();
    if (tries >= 20) clearInterval(t); // ~40s
  }, 2000);
}

// Создаем уведомление на странице
function showNotification(action, reason, score) {
  // Удаляем предыдущие уведомления
  const existingNotification = document.getElementById('phishguard-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  // Определяем стиль уведомления
  let backgroundColor, borderColor, icon;
  switch (action) {
    case 'block':
      backgroundColor = '#ff4444';
      borderColor = '#cc0000';
      icon = '🚫';
      break;
    case 'warn':
      backgroundColor = '#ffaa00';
      borderColor = '#ff8800';
      icon = '⚠️';
      break;
    case 'allow':
      backgroundColor = '#44ff44';
      borderColor = '#00cc00';
      icon = '✅';
      break;
    default:
      backgroundColor = '#666666';
      borderColor = '#444444';
      icon = '❓';
  }

  // Создаем элемент уведомления
  const notification = document.createElement('div');
  notification.id = 'phishguard-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${backgroundColor};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      border: 2px solid ${borderColor};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 350px;
      cursor: pointer;
      transition: all 0.3s ease;
    ">
      <div style="display: flex; align-items: center; margin-bottom: 5px;">
        <span style="font-size: 20px; margin-right: 10px;">${icon}</span>
        <strong>PhishGuard</strong>
        <button id="close-notification" style="
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          margin-left: auto;
          cursor: pointer;
          padding: 0;
          width: 20px;
          height: 20px;
        ">×</button>
      </div>
      <div style="margin-bottom: 5px;">
        <strong>Статус:</strong> ${action.toUpperCase()}
      </div>
      <div style="margin-bottom: 5px;">
        <strong>Причина:</strong> ${reason}
      </div>
      <div>
        <strong>Уверенность:</strong> ${Math.round(score * 100)}%
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  // Добавляем обработчик закрытия
  const closeBtn = document.getElementById('close-notification');
  closeBtn.addEventListener('click', () => {
    notification.remove();
  });

  // Автоматически скрываем через 10 секунд для allow, 30 для warn/block
  const hideDelay = action === 'allow' ? 10000 : 30000;
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }
  }, hideDelay);
}

// Создаем предупреждение о блокировке
function showBlockedPage(originalUrl, reason) {
  document.body.innerHTML = `
    <div style="
      font-family: Arial, sans-serif;
      text-align: center;
      padding: 50px;
      background: linear-gradient(135deg, #ff4444, #cc0000);
      color: white;
      min-height: 100vh;
      margin: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    ">
      <div style="font-size: 80px; margin-bottom: 20px;">🚫</div>
      <h1 style="font-size: 36px; margin-bottom: 20px;">Доступ заблокирован</h1>
      <h2 style="font-size: 24px; margin-bottom: 30px;">PhishGuard защитил вас от потенциальной угрозы</h2>
      
      <div style="
        background: rgba(255,255,255,0.1);
        padding: 30px;
        border-radius: 15px;
        margin-bottom: 30px;
        max-width: 600px;
      ">
        <h3 style="margin-bottom: 15px;">Заблокированный URL:</h3>
        <p style="word-break: break-all; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px;">
          ${originalUrl}
        </p>
        
        <h3 style="margin-top: 20px; margin-bottom: 15px;">Причина блокировки:</h3>
        <p style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px;">
          ${reason}
        </p>
      </div>
      
      <div style="margin-top: 30px;">
        <button onclick="history.back()" style="
          background: rgba(255,255,255,0.2);
          border: 2px solid white;
          color: white;
          padding: 15px 30px;
          font-size: 16px;
          border-radius: 8px;
          cursor: pointer;
          margin: 0 10px;
          transition: all 0.3s ease;
        " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
          ← Вернуться назад
        </button>
        
        <button onclick="window.location.href='https://www.google.com'" style="
          background: rgba(255,255,255,0.2);
          border: 2px solid white;
          color: white;
          padding: 15px 30px;
          font-size: 16px;
          border-radius: 8px;
          cursor: pointer;
          margin: 0 10px;
          transition: all 0.3s ease;
        " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
          Перейти на Google
        </button>
      </div>
      
      <div style="margin-top: 40px; font-size: 14px; opacity: 0.8;">
        Защищено PhishGuard • <a href="#" onclick="chrome.runtime.openOptionsPage()" style="color: white; text-decoration: underline;">Настройки</a>
      </div>
    </div>
  `;
}

// Обработка сообщений от background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'URL_CHECK_RESULT') {
    const { url, result } = message;
    
    console.log('[PhishGuard] URL check result from background:', result);
    
    // Проверяем, что результат относится к текущей странице
    if (url === window.location.href) {
      if (result.action === 'block') {
        showBlockedPage(url, result.reason);
      } else if (result.action !== 'error') {
      showNotification(result.action, result.reason, result.score);
      }
    }
  }
  
  return false;
});

// Проверяем текущую страницу при загрузке
if (isEmailWebHost()) {
  // Email platforms: controlled by user toggle.
  const boot = async () => {
    const enabled = await isEmailAutoEnabled();
    if (enabled) startEmailAutoCheck();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Live-toggle support (enable/disable without reload)
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!changes[EMAIL_AUTO_KEY]) return;
      const v = changes[EMAIL_AUTO_KEY].newValue === true;
      if (v) startEmailAutoCheck();
      else stopEmailAutoCheck();
    });
  } catch (_) { }
} else {
  // Функция для проверки текущего URL
  function checkCurrentPage() {
    const url = window.location.href;
    console.log('[PhishGuard] Checking URL:', url);
    
    // Пропускаем внутренние страницы браузера
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
      return;
    }
    
    chrome.runtime.sendMessage({ type: 'CHECK_URL', url: url }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[PhishGuard] Error checking URL:', chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.action) {
        console.log('[PhishGuard] URL check result:', response);
        if (response.action === 'block') {
          showBlockedPage(url, response.reason);
        } else if (response.action !== 'error') {
          showNotification(response.action, response.reason, response.score);
        }
      }
    });
  }
  
  // Проверяем при загрузке
  let lastCheckedUrl = window.location.href;
  
  const performCheck = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastCheckedUrl) {
      lastCheckedUrl = currentUrl;
      checkCurrentPage();
    } else {
      checkCurrentPage();
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      performCheck();
  });
} else {
    performCheck();
  }
  
  // Отслеживаем изменения URL для SPA (Single Page Applications)
  let urlCheckInterval = null;
  const startUrlMonitoring = () => {
    if (urlCheckInterval) return;
    urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastCheckedUrl) {
        lastCheckedUrl = currentUrl;
        checkCurrentPage();
      }
    }, 1000); // Проверяем каждую секунду
  };
  
  // Запускаем мониторинг после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startUrlMonitoring);
  } else {
    startUrlMonitoring();
  }
  
  // Также отслеживаем события popstate (навигация назад/вперед)
  window.addEventListener('popstate', () => {
    setTimeout(performCheck, 100);
  });
  
  // Отслеживаем pushState/replaceState для SPA
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(performCheck, 100);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(performCheck, 100);
  };
}


