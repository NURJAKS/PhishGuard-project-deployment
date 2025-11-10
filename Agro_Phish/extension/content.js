// PhishGuard Content Script
console.log('PhishGuard content script loaded');

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
    
    console.log('URL check result:', result);
    
    // Показываем уведомление только если это не заблокированная страница
    if (result.action !== 'block') {
      showNotification(result.action, result.reason, result.score);
    }
  }
});

// Проверяем текущую страницу при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Проверяем URL текущей страницы
    chrome.runtime.sendMessage({
      type: 'CHECK_URL',
      url: window.location.href
    }, (response) => {
      if (response && response.action) {
        if (response.action === 'block') {
          showBlockedPage(window.location.href, response.reason);
        } else {
          showNotification(response.action, response.reason, response.score);
        }
      }
    });
  });
} else {
  // Страница уже загружена
  chrome.runtime.sendMessage({
    type: 'CHECK_URL',
    url: window.location.href
  }, (response) => {
    if (response && response.action) {
      if (response.action === 'block') {
        showBlockedPage(window.location.href, response.reason);
      } else {
        showNotification(response.action, response.reason, response.score);
      }
    }
  });
}


