'use strict';

const API_BASE_URL = 'http://localhost:8002';

// Known hosting/cloud providers for risk analysis
const KNOWN_HOSTING_PROVIDERS = [
  'amazon', 'aws', 'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner',
  'google', 'gcp', 'azure', 'microsoft', 'cloudflare', 'fastly', 'akamai',
  'godaddy', 'hostgator', 'bluehost', 'namecheap', 'dreamhost', 'hostinger',
  'ionos', 'contabo', 'scaleway', 'upcloud', 'kamatera', 'rackspace',
  'alibaba', 'tencent', 'oracle', 'ibm', 'softlayer', 'leaseweb',
  'choopa', 'psychz', 'phoenixnap', 'quadranet', 'colocrossing',
  'datacamp', 'selectel', 'vdsina', 'timeweb', 'reg.ru', 'firstbyte',
  'beget', 'sprinthost', 'hostland', 'sweb', 'majordomo'
];

// Known residential/ISP providers
const KNOWN_ISP_PROVIDERS = [
  'comcast', 'verizon', 'at&t', 'spectrum', 'cox', 'centurylink',
  'frontier', 'windstream', 'mediacom', 'suddenlink', 'optimum',
  'rostelecom', 'beeline', 'megafon', 'mts', 'tele2', 'yota',
  'kazakhtelecom', 'kcell', 'activ', 'altel', 'tele2.kz',
  'deutsche telekom', 'vodafone', 'orange', 'telefonica', 'bt',
  'virgin media', 'sky broadband', 'talktalk', 'plusnet'
];

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
  
  // Quick action buttons
  const checkSiteBtn = document.getElementById('checkSiteBtn');
  const checkDnsBtn = document.getElementById('checkDnsBtn');
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  
  // DNS results elements
  const dnsResults = document.getElementById('dnsResults');
  const dnsLoading = document.getElementById('dnsLoading');
  const dnsContent = document.getElementById('dnsContent');
  const dnsDomain = document.getElementById('dnsDomain');
  const dnsIPs = document.getElementById('dnsIPs');
  const dnsMxSection = document.getElementById('dnsMxSection');
  const dnsMX = document.getElementById('dnsMX');
  const dnsGeoSection = document.getElementById('dnsGeoSection');
  const dnsGeo = document.getElementById('dnsGeo');
  const dnsHostingSection = document.getElementById('dnsHostingSection');
  const dnsHosting = document.getElementById('dnsHosting');
  const dnsRiskBadge = document.getElementById('dnsRiskBadge');
  const dnsRiskDetails = document.getElementById('dnsRiskDetails');

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

  // ==================== Quick Action Functions ====================
  
  // Get current tab domain
  async function getCurrentTabDomain() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url) {
        const url = new URL(tabs[0].url);
        return url.hostname;
      }
    } catch (e) {
      console.error('Error getting current tab:', e);
    }
    return null;
  }
  
  // Cloudflare DNS-over-HTTPS query
  async function queryCloudflare(domain, type = 'A') {
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/dns-json'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      console.error(`Cloudflare DNS query error (${type}):`, e);
      return null;
    }
  }
  
  // Google DNS fallback
  async function queryGoogleDns(domain, type = 'A') {
    try {
      const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      console.error(`Google DNS query error (${type}):`, e);
      return null;
    }
  }
  
  // Query DNS with fallback
  async function queryDns(domain, type = 'A') {
    let result = await queryCloudflare(domain, type);
    if (!result || result.Status !== 0) {
      result = await queryGoogleDns(domain, type);
    }
    return result;
  }
  
  // Get IP geolocation from ipinfo.io
  async function getIpInfo(ip) {
    try {
      const response = await fetch(`https://ipinfo.io/${ip}/json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      console.error('ipinfo.io error:', e);
      return null;
    }
  }
  
  // Analyze risk based on IP info
  function analyzeRisk(ipInfo, domain) {
    const risks = [];
    let riskLevel = 'low'; // low, medium, high
    let riskScore = 0;
    
    if (!ipInfo) {
      return {
        level: 'medium',
        badge: '⚠️ Неизвестно',
        details: 'Не удалось получить информацию о сервере'
      };
    }
    
    const org = (ipInfo.org || '').toLowerCase();
    const hostname = (ipInfo.hostname || '').toLowerCase();
    const asn = ipInfo.org || '';
    
    // Check if it's a known hosting provider
    const isHosting = KNOWN_HOSTING_PROVIDERS.some(provider => 
      org.includes(provider) || hostname.includes(provider)
    );
    
    // Check if it's a known ISP (residential)
    const isResidential = KNOWN_ISP_PROVIDERS.some(provider => 
      org.includes(provider) || hostname.includes(provider)
    );
    
    if (isHosting) {
      risks.push('✓ Размещен на профессиональном хостинге');
    } else if (isResidential) {
      risks.push('⚠️ IP принадлежит домашнему провайдеру (ISP)');
      riskScore += 30;
    }
    
    // Check for VPN/Proxy indicators
    if (org.includes('vpn') || org.includes('proxy') || org.includes('tunnel')) {
      risks.push('⚠️ Возможно использование VPN/Proxy');
      riskScore += 20;
    }
    
    // Check if hostname matches domain
    if (hostname && !hostname.includes(domain.split('.')[0])) {
      risks.push('ℹ️ Hostname сервера отличается от домена');
    }
    
    // Check country
    const country = ipInfo.country || '';
    const suspiciousCountries = ['RU', 'CN', 'KP', 'IR', 'BY'];
    if (country && suspiciousCountries.includes(country)) {
      risks.push(`ℹ️ Сервер расположен в ${country}`);
    }
    
    // Check if IP is in a datacenter
    if (ipInfo.hosting === true) {
      risks.push('✓ Размещен в дата-центре');
    }
    
    // Determine risk level
    if (riskScore >= 40) {
      riskLevel = 'high';
    } else if (riskScore >= 20) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }
    
    // Generate badge and summary
    let badge, summary;
    switch (riskLevel) {
      case 'high':
        badge = '🔴 Высокий риск';
        summary = 'Обнаружены признаки потенциально опасного сайта';
        break;
      case 'medium':
        badge = '🟡 Средний риск';
        summary = 'Есть некоторые подозрительные признаки';
        break;
      default:
        badge = '🟢 Низкий риск';
        summary = 'Сайт размещен на надежной инфраструктуре';
    }
    
    return {
      level: riskLevel,
      badge: badge,
      summary: summary,
      details: risks.length > 0 ? risks : ['✓ Подозрительных признаков не обнаружено'],
      isHosting: isHosting,
      isResidential: isResidential
    };
  }
  
  // Format IP address with badge
  function formatIP(ip) {
    const isIPv6 = ip.includes(':');
    const type = isIPv6 ? 'ipv6' : 'ipv4';
    const label = isIPv6 ? 'IPv6' : 'IPv4';
    return `<span class="ip-tag ${type}">${label}: ${ip}</span>`;
  }
  
  // Main DNS check function
  async function performDnsCheck() {
    const domain = await getCurrentTabDomain();
    
    if (!domain) {
      showMessage('Не удалось определить домен текущей страницы', 'error');
      return;
    }
    
    // Skip browser internal pages
    if (domain === 'newtab' || domain.includes('chrome') || domain.includes('extension')) {
      showMessage('DNS проверка недоступна для внутренних страниц браузера', 'error');
      return;
    }
    
    // Show results panel and loading state
    dnsResults.style.display = 'block';
    dnsLoading.style.display = 'block';
    dnsContent.style.display = 'none';
    
    try {
      // Query A records (IPv4)
      const aRecords = await queryDns(domain, 'A');
      
      // Query AAAA records (IPv6)
      const aaaaRecords = await queryDns(domain, 'AAAA');
      
      // Query MX records
      const mxRecords = await queryDns(domain, 'MX');
      
      // Collect all IPs
      const ipv4List = aRecords?.Answer?.filter(r => r.type === 1).map(r => r.data) || [];
      const ipv6List = aaaaRecords?.Answer?.filter(r => r.type === 28).map(r => r.data) || [];
      const allIPs = [...ipv4List, ...ipv6List];
      
      // Get MX records
      const mxList = mxRecords?.Answer?.filter(r => r.type === 15).map(r => {
        const parts = r.data.split(' ');
        return { priority: parts[0], server: parts[1] || r.data };
      }) || [];
      
      // Update domain display
      dnsDomain.textContent = domain;
      
      // Update IPs display
      if (allIPs.length > 0) {
        const ipHtml = allIPs.map(ip => formatIP(ip)).join(' ');
        dnsIPs.innerHTML = ipHtml;
      } else {
        dnsIPs.innerHTML = '<span style="opacity: 0.6;">Не найдено</span>';
      }
      
      // Update MX records
      if (mxList.length > 0) {
        dnsMxSection.style.display = 'block';
        dnsMX.innerHTML = mxList.map(mx => 
          `<div style="margin: 2px 0;"><span style="color: #3b3ee5;">[${mx.priority}]</span> ${mx.server}</div>`
        ).join('');
      } else {
        dnsMxSection.style.display = 'none';
      }
      
      // Get geolocation for first IPv4 IP
      let ipInfo = null;
      if (ipv4List.length > 0) {
        ipInfo = await getIpInfo(ipv4List[0]);
      }
      
      // Update geolocation
      if (ipInfo) {
        dnsGeoSection.style.display = 'block';
        const geoDetails = [];
        if (ipInfo.city) geoDetails.push(ipInfo.city);
        if (ipInfo.region) geoDetails.push(ipInfo.region);
        if (ipInfo.country) geoDetails.push(ipInfo.country);
        const location = geoDetails.join(', ') || 'Неизвестно';
        const coords = ipInfo.loc ? ` (${ipInfo.loc})` : '';
        dnsGeo.innerHTML = `📍 ${location}${coords}`;
        
        // Update hosting info
        if (ipInfo.org) {
          dnsHostingSection.style.display = 'block';
          dnsHosting.innerHTML = `🏢 ${ipInfo.org}`;
        } else {
          dnsHostingSection.style.display = 'none';
        }
      } else {
        dnsGeoSection.style.display = 'none';
        dnsHostingSection.style.display = 'none';
      }
      
      // Analyze risks
      const riskAnalysis = analyzeRisk(ipInfo, domain);
      
      // Update risk badge
      dnsRiskBadge.textContent = riskAnalysis.badge;
      dnsRiskBadge.className = `risk-${riskAnalysis.level}`;
      
      // Update risk details
      const detailsHtml = [
        `<div style="margin-bottom: 8px; opacity: 0.9;">${riskAnalysis.summary}</div>`,
        ...riskAnalysis.details.map(d => `<div style="margin: 4px 0;">• ${d}</div>`)
      ].join('');
      dnsRiskDetails.innerHTML = detailsHtml;
      
      // Show content, hide loading
      dnsLoading.style.display = 'none';
      dnsContent.style.display = 'block';
      
      showMessage(`DNS проверка завершена для ${domain}`, 'success');
      
    } catch (e) {
      console.error('DNS check error:', e);
      dnsLoading.style.display = 'none';
      dnsContent.style.display = 'block';
      dnsDomain.textContent = domain;
      dnsIPs.innerHTML = '<span style="color: #e74c3c;">Ошибка запроса DNS</span>';
      dnsRiskBadge.textContent = '❌ Ошибка';
      dnsRiskBadge.className = 'risk-high';
      dnsRiskDetails.innerHTML = `Не удалось выполнить DNS проверку: ${e.message}`;
      showMessage('Ошибка DNS проверки: ' + e.message, 'error');
    }
  }
  
  // Check site function (redirects to popup check)
  async function checkCurrentSite() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url) {
        const url = tabs[0].url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const response = await fetch(`${API_BASE_URL}/v1/check/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          
          const actionEmoji = result.action === 'block' ? '🚫' : result.action === 'warn' ? '⚠️' : '✅';
          const actionText = result.action === 'block' ? 'ЗАБЛОКИРОВАН' : result.action === 'warn' ? 'ПРЕДУПРЕЖДЕНИЕ' : 'БЕЗОПАСЕН';
          showMessage(`${actionEmoji} ${actionText}: ${result.reason}`, result.action === 'allow' ? 'success' : 'error');
        } else {
          showMessage('Проверка доступна только для HTTP/HTTPS страниц', 'error');
        }
      }
    } catch (e) {
      showMessage('Ошибка проверки сайта: ' + e.message, 'error');
    }
  }
  
  // Clear cache function
  async function clearAllCache() {
    try {
      // Clear cache via background script
      chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, (response) => {
        console.log('Cache cleared:', response);
      });
      
      // Clear database incidents
      const response = await fetch(`${API_BASE_URL}/incidents/clear`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      showMessage(`Очищено ${result.deleted} записей`, 'success');
    } catch (e) {
      showMessage('Ошибка очистки кэша: ' + e.message, 'error');
    }
  }
  
  // Event listeners for quick action buttons
  if (checkSiteBtn) {
    checkSiteBtn.addEventListener('click', checkCurrentSite);
  }
  
  if (checkDnsBtn) {
    checkDnsBtn.addEventListener('click', performDnsCheck);
  }
  
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      if (confirm('Вы уверены, что хотите очистить весь кэш и историю инцидентов?')) {
        await clearAllCache();
      }
    });
  }

  // Инициализация
  loadAutoScanStatus();
  loadBlacklist();
  loadWhitelist();
});

