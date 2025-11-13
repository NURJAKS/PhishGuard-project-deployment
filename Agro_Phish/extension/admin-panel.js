'use strict';

const API_BASE_URL = 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  const blacklistTableBody = document.getElementById('blacklistTableBody');
  const whitelistTableBody = document.getElementById('whitelistTableBody');
  const refreshBlacklistBtn = document.getElementById('refreshBlacklist');
  const refreshWhitelistBtn = document.getElementById('refreshWhitelist');
  const addDomainBtn = document.getElementById('addDomainBtn');
  const addDomainInput = document.getElementById('addDomainInput');
  const addWhitelistDomainBtn = document.getElementById('addWhitelistDomainBtn');
  const addWhitelistDomainInput = document.getElementById('addWhitelistDomainInput');
  const autoScanToggle = document.getElementById('autoScanToggle');
  const autoScanStatus = document.getElementById('autoScanStatus');
  const autoScanText = document.getElementById('autoScanText');
  const messageDiv = document.getElementById('message');
  const apiUrlSpan = document.getElementById('api-url');

  apiUrlSpan.textContent = `API: ${API_BASE_URL}`;

  // Функция показа сообщения
  function showMessage(text, type = 'success') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 5000);
  }

  // Загрузка статуса автосканирования
  async function loadAutoScanStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auto-scan`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const enabled = data.enabled !== false; // по умолчанию включено
      autoScanToggle.checked = enabled;
      updateAutoScanUI(enabled);
    } catch (e) {
      console.error('Error loading auto-scan status:', e);
      // По умолчанию включено
      autoScanToggle.checked = true;
      updateAutoScanUI(true);
    }
  }

  // Обновление UI автосканирования
  function updateAutoScanUI(enabled) {
    if (enabled) {
      autoScanStatus.className = 'status-indicator active';
      autoScanText.textContent = 'Автосканирование: Включено';
    } else {
      autoScanStatus.className = 'status-indicator inactive';
      autoScanText.textContent = 'Автосканирование: Выключено';
    }
  }

  // Переключение автосканирования
  autoScanToggle.addEventListener('change', async () => {
    const enabled = autoScanToggle.checked;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auto-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      updateAutoScanUI(enabled);
      showMessage(`Автосканирование ${enabled ? 'включено' : 'выключено'}`, 'success');
      
      // Сохраняем также в chrome.storage для быстрого доступа
      chrome.storage.local.set({ autoScanEnabled: enabled });
    } catch (e) {
      console.error('Error updating auto-scan:', e);
      autoScanToggle.checked = !enabled; // Откатываем изменение
      showMessage('Ошибка обновления настроек автосканирования', 'error');
    }
  });

  // Загрузка списка заблокированных доменов
  async function loadBlacklist() {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/blacklist`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderBlacklist(data.domains || []);
    } catch (e) {
      console.error('Error loading blacklist:', e);
      blacklistTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted" style="text-align: center; padding: 20px;">
            Ошибка загрузки. Убедитесь, что backend запущен.
          </td>
        </tr>
      `;
    }
  }

  // Отображение списка заблокированных доменов
  function renderBlacklist(domains) {
    if (domains.length === 0) {
      blacklistTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted" style="text-align: center; padding: 20px;">
            Черный список пуст
          </td>
        </tr>
      `;
      return;
    }

    // Очищаем таблицу
    blacklistTableBody.innerHTML = '';
    
    // Создаем строки с обработчиками событий
    domains.forEach(domain => {
      const tr = document.createElement('tr');
      
      const tdDomain = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = domain;
      tdDomain.appendChild(strong);
      
      const tdStatus = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'tag tag-block';
      tag.textContent = 'ЗАБЛОКИРОВАН';
      tdStatus.appendChild(tag);

      // Новая кнопка подачи жалобы
      const tdActions = document.createElement('td');
      // Старое: deleteBtn
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Удалить из списка';
      deleteBtn.dataset.domain = domain;
      deleteBtn.addEventListener('click', () => removeDomain(domain));
      tdActions.appendChild(deleteBtn);
      // Новое: reportBtn
      const reportBtn = document.createElement('button');
      reportBtn.className = 'success';
      reportBtn.textContent = 'Подать жалобу';
      reportBtn.style.marginLeft = '10px';
      reportBtn.addEventListener('click', async () => {
        reportBtn.disabled = true;
        reportBtn.textContent = 'Отправка...';
        try {
          const payload = {
            domain: domain,
            reason: 'В черном списке из-за угрозы безопасности'
          };
          const res = await fetch(`${API_BASE_URL}/admin/telegram/report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          const result = await res.json();
          if (result.success) {
            showMessage('Жалоба отправлена в Telegram', 'success');
            reportBtn.textContent = 'Жалоба отправлена';
            setTimeout(() => {
              reportBtn.disabled = false;
              reportBtn.textContent = 'Подать жалобу';
            }, 3000);
          } else {
            showMessage('Не удалось отправить жалобу: ' + (result.error || ''), 'error');
            reportBtn.disabled = false;
            reportBtn.textContent = 'Подать жалобу';
          }
        } catch (e) {
          showMessage('Ошибка при отправке жалобы: ' + (e.message || e), 'error');
          reportBtn.disabled = false;
          reportBtn.textContent = 'Подать жалобу';
        }
      });
      tdActions.appendChild(reportBtn);

      tr.appendChild(tdDomain);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);
      
      blacklistTableBody.appendChild(tr);
    });
  }

  // Удаление домена из черного списка
  async function removeDomain(domain) {
    if (!confirm(`Вы уверены, что хотите удалить "${domain}" из черного списка?`)) {
      return;
    }

    try {
      // Правильно кодируем домен для URL
      const encodedDomain = encodeURIComponent(domain);
      console.log('Deleting domain:', domain, 'Encoded:', encodedDomain);
      
      const res = await fetch(`${API_BASE_URL}/admin/blacklist/${encodedDomain}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Delete response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.detail || `HTTP ${res.status}`;
        throw new Error(errorMsg);
      }
      
      const result = await res.json();
      console.log('Delete result:', result);
      showMessage(result.message || `Домен "${domain}" удален из черного списка`, 'success');
      await loadBlacklist(); // Перезагружаем список
    } catch (e) {
      console.error('Error removing domain:', e);
      showMessage(`Ошибка удаления домена: ${e.message}`, 'error');
    }
  }
  
  // Делаем функцию доступной глобально на случай необходимости
  window.removeDomain = removeDomain;

  // Добавление домена в черный список
  addDomainBtn.addEventListener('click', async () => {
    const domain = addDomainInput.value.trim();
    if (!domain) {
      showMessage('Введите домен', 'error');
      return;
    }

    // Простая валидация домена
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*\.[a-zA-Z]{2,}$/.test(domain) && 
        domain !== 'localhost' && !domain.startsWith('127.')) {
      showMessage('Некорректный формат домена', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}`);
      }
      showMessage(`Домен "${domain}" добавлен в черный список`, 'success');
      addDomainInput.value = '';
      await loadBlacklist(); // Перезагружаем список
    } catch (e) {
      console.error('Error adding domain:', e);
      showMessage(`Ошибка добавления домена: ${e.message}`, 'error');
    }
  });

  // Добавление по Enter
  addDomainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addDomainBtn.click();
    }
  });

  // Обновление списка
  refreshBlacklistBtn.addEventListener('click', loadBlacklist);

  // ==================== Whitelist Functions ====================
  
  // Загрузка списка разрешенных доменов (белый список)
  async function loadWhitelist() {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/whitelist`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderWhitelist(data.domains || []);
    } catch (e) {
      console.error('Error loading whitelist:', e);
      whitelistTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted" style="text-align: center; padding: 20px;">
            Ошибка загрузки. Убедитесь, что backend запущен.
          </td>
        </tr>
      `;
    }
  }

  // Отображение списка разрешенных доменов
  function renderWhitelist(domains) {
    if (domains.length === 0) {
      whitelistTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted" style="text-align: center; padding: 20px;">
            Белый список пуст
          </td>
        </tr>
      `;
      return;
    }

    // Очищаем таблицу
    whitelistTableBody.innerHTML = '';
    
    // Создаем строки с обработчиками событий
    domains.forEach(domain => {
      const tr = document.createElement('tr');
      
      const tdDomain = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = domain;
      tdDomain.appendChild(strong);
      
      const tdStatus = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'tag tag-allow';
      tag.textContent = 'РАЗРЕШЕН';
      tdStatus.appendChild(tag);
      
      const tdActions = document.createElement('td');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Удалить из списка';
      deleteBtn.dataset.domain = domain;
      deleteBtn.addEventListener('click', () => removeWhitelistDomain(domain));
      tdActions.appendChild(deleteBtn);
      
      tr.appendChild(tdDomain);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);
      
      whitelistTableBody.appendChild(tr);
    });
  }

  // Удаление домена из белого списка
  async function removeWhitelistDomain(domain) {
    if (!confirm(`Вы уверены, что хотите удалить "${domain}" из белого списка?`)) {
      return;
    }

    try {
      const encodedDomain = encodeURIComponent(domain);
      console.log('Deleting domain from whitelist:', domain, 'Encoded:', encodedDomain);
      
      const res = await fetch(`${API_BASE_URL}/admin/whitelist/${encodedDomain}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Delete response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.detail || `HTTP ${res.status}`;
        throw new Error(errorMsg);
      }
      
      const result = await res.json();
      console.log('Delete result:', result);
      showMessage(result.message || `Домен "${domain}" удален из белого списка`, 'success');
      await loadWhitelist();
      
      // Очищаем кэш расширения, чтобы применить изменения немедленно
      try {
        chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
          console.log('Cache cleared after removing from whitelist');
        });
      } catch (e) {
        console.log('Could not clear cache:', e);
      }
    } catch (e) {
      console.error('Error removing domain from whitelist:', e);
      showMessage(`Ошибка удаления домена: ${e.message}`, 'error');
    }
  }
  
  // Добавление домена в белый список
  addWhitelistDomainBtn.addEventListener('click', async () => {
    const domain = addWhitelistDomainInput.value.trim();
    if (!domain) {
      showMessage('Введите домен', 'error');
      return;
    }

    // Простая валидация домена
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*\.[a-zA-Z]{2,}$/.test(domain) && 
        domain !== 'localhost' && !domain.startsWith('127.')) {
      showMessage('Некорректный формат домена', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}`);
      }
      showMessage(`Домен "${domain}" добавлен в белый список`, 'success');
      addWhitelistDomainInput.value = '';
      await loadWhitelist();
      
      // Очищаем кэш расширения, чтобы применить изменения немедленно
      try {
        chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
          console.log('Cache cleared after adding to whitelist');
        });
      } catch (e) {
        console.log('Could not clear cache:', e);
      }
    } catch (e) {
      console.error('Error adding domain to whitelist:', e);
      showMessage(`Ошибка добавления домена: ${e.message}`, 'error');
    }
  });

  // Добавление по Enter для whitelist
  addWhitelistDomainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addWhitelistDomainBtn.click();
    }
  });

  // Обновление списка whitelist
  refreshWhitelistBtn.addEventListener('click', loadWhitelist);

  // Инициализация
  loadAutoScanStatus();
  loadBlacklist();
  loadWhitelist();
});

