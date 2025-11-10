// PhishGuard Popup Script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('PhishGuard popup loaded');
    
    // Элементы DOM
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const mainContent = document.getElementById('main-content');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const currentUrlDiv = document.getElementById('current-url');
    const totalBlocked = document.getElementById('total-blocked');
    const totalWarned = document.getElementById('total-warned');
    
    // Кнопки
    const openDashboardBtn = document.getElementById('open-dashboard');
    const openAdminPanelBtn = document.getElementById('open-admin-panel');
    const openDocumentsBtn = document.getElementById('open-documents');
    const paymentBackBtn = document.getElementById('paymentBack');
    const paymentStatus = document.getElementById('paymentStatus');
    const paymentDot = document.getElementById('payment-dot');
    const paymentText = document.getElementById('payment-text');
    const paymentReasons = document.getElementById('payment-reasons');
    const paymentConsequences = document.getElementById('payment-consequences');
    const paymentRecommendations = document.getElementById('payment-recommendations');
    const clearCacheBtn = document.getElementById('clear-cache');
    const settingsLink = document.getElementById('settings-link');
    const scanSecretsBtn = document.getElementById('scan-secrets');
    const secretScanStatus = document.getElementById('secretScanStatus');
    const secretDot = document.getElementById('secret-dot');
    const secretText = document.getElementById('secret-text');
    const secretSummary = document.getElementById('secret-summary');
    const secretLinksSection = document.getElementById('secret-links-section');
    const secretLinks = document.getElementById('secret-links');
    const aiScanBtn = document.getElementById('ai-scan');
    const aiScanStatus = document.getElementById('aiScanStatus');
    const aiDot = document.getElementById('ai-dot');
    const aiText = document.getElementById('ai-text');
    const aiDetails = document.getElementById('ai-details');
    let currentTab = null;
    function isAnalyzableUrl(url) {
        if (!url) return false;
        const lower = url.toLowerCase();
        const blockedSchemes = ['chrome://', 'edge://', 'about:', 'brave://', 'opera://'];
        if (blockedSchemes.some(p => lower.startsWith(p))) return false;
        if (lower.startsWith('chrome-extension://')) return false;
        return lower.startsWith('http://') || lower.startsWith('https://');
    }
    
    // Получаем текущую вкладку
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tabs[0];
        
        if (currentTab) {
            currentUrlDiv.textContent = currentTab.url;
            // Проверяем только сайты
            if (isAnalyzableUrl(currentTab.url)) {
                await checkCurrentUrl(false);  // Автоматическая проверка - используем кэш
            }
        }
    } catch (error) {
        showError('Не удалось получить информацию о странице');
    }
    
    // Загружаем статистику
    await loadStats();
    
    // Обработчики событий
    openDashboardBtn.addEventListener('click', async () => {
        // Сначала пытаемся открыть Streamlit (если запущен)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            await fetch('http://localhost:8501/healthz', { method: 'GET', mode: 'no-cors', signal: controller.signal });
            clearTimeout(timeoutId);
            chrome.tabs.create({ url: 'http://localhost:8501' });
            return;
        } catch (e) {
            // Фоллбэк: локальная страница внутри расширения
            const localDashboardUrl = chrome.runtime.getURL('dashboard.html');
            chrome.tabs.create({ url: localDashboardUrl });
        }
    });
    
    openAdminPanelBtn.addEventListener('click', () => {
        const adminPanelUrl = chrome.runtime.getURL('admin-panel.html');
        chrome.tabs.create({ url: adminPanelUrl });
    });
    
    openDocumentsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'http://localhost:8000/documents' });
    });
    
    clearCacheBtn.addEventListener('click', clearCache);
    // Маскирование PAN-подобных чисел
    function maskPan(text) {
        try {
            return text.replace(/\b\d{13,19}\b/g, '****');
        } catch (_) {
            return text;
        }
    }

    function setPaymentStatus(text, state, details = null) {
        paymentStatus.style.display = 'block';
        paymentText.textContent = text;
        paymentDot.className = 'status-dot';
        if (state === 'safe') {
            paymentDot.classList.add('active');
            paymentConsequences.style.display = 'none';
            paymentRecommendations.style.display = 'none';
        } else if (state === 'warn') {
            paymentDot.style.background = '#ffaa00';
        } else if (state === 'block' || state === 'error') {
            paymentDot.classList.add('inactive');
        } else {
            paymentDot.style.background = '#666666';
        }
        
        // Показываем детали рисков если они есть
        if (details && state !== 'safe') {
            if (details.consequences) {
                paymentConsequences.style.display = 'block';
                paymentConsequences.innerHTML = details.consequences;
            }
            if (details.recommendations) {
                paymentRecommendations.style.display = 'block';
                paymentRecommendations.innerHTML = details.recommendations;
            }
        }
    }

    async function getPageHtml(tabId) {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                try {
                    const form = document.querySelector('form');
                    const html = form ? form.outerHTML : document.documentElement.outerHTML;
                    return html || '';
                } catch (e) { return ''; }
            }
        });
        return result || '';
    }

    // Локальный быстрый анализ HTML формы (fallback, если backend недоступен)
    function clientAnalyzeHtml(html, pageUrl) {
        const reasons = [];
        const explain = {};
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html || '', 'text/html');
            const forms = Array.from(doc.querySelectorAll('form'));
            explain.form_count = forms.length;
            // HTTPS проверка
            try {
                const u = new URL(pageUrl);
                if (u.protocol !== 'https:') reasons.push('no_https');
            } catch (_) {}
            const tokens = ['card','cardnumber','card_number','pan','cvv','cvc','expiry','mm/yy','name_on_card','visa','mastercard','paypal'];
            let containsCard = false;
            let suspiciousAction = false;
            forms.forEach(f => {
                const action = (f.getAttribute('action')||'').trim();
                if (!action || action.startsWith('mailto:') || action.startsWith('data:')) suspiciousAction = true;
                try {
                    const a = new URL(action, pageUrl);
                    const p = new URL(pageUrl);
                    if (a.host && p.host && a.host !== p.host) suspiciousAction = true;
                } catch (_) {}
                const inputs = Array.from(f.querySelectorAll('input,select,textarea'));
                for (const inp of inputs) {
                    const v = ((inp.name||'')+' '+(inp.id||'')+' '+(inp.placeholder||'')+' '+(inp.type||'')).toLowerCase();
                    if (tokens.some(t => v.includes(t))) { containsCard = true; break; }
                }
            });
            if (containsCard) reasons.push('contains_card_fields');
            if (suspiciousAction) reasons.push('suspicious_form_action');
            const weights = { no_https:0.3, contains_card_fields:0.4, suspicious_form_action:0.25 };
            let score = 0; reasons.forEach(r => score += (weights[r]||0));
            score = Math.min(1, score);
            const safe = score < 0.6;
            return { safe, score, reasons, explain };
        } catch (e) {
            return { safe: false, score: 0.6, reasons: ['analyze_error'], explain: { error: String(e) } };
        }
    }

    // Функция для анализа платежной системы
    async function analyzePaymentForm() {
        if (!currentTab || !isAnalyzableUrl(currentTab.url)) {
            return { hasPaymentForm: false, safe: true, message: 'Оплата безопасна - платежная форма не обнаружена' };
        }
        
        try {
            const htmlFull = await getPageHtml(currentTab.id);
            const snippet = maskPan(htmlFull).slice(0, 30000);
            const candidates = ['http://localhost:8000', 'http://127.0.0.1:8000'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) {}
            }
            
            const payload = {
                request_id: crypto.randomUUID(),
                url: currentTab.url,
                html_snippet: snippet,
                meta: { user_agent: navigator.userAgent }
            };
            
            const resp = await fetch(`${base}/analyze_payment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!resp.ok) {
                // Если backend недоступен, делаем локальную проверку
                const local = clientAnalyzeHtml(snippet, currentTab.url);
                const hasPaymentForm = local.reasons && local.reasons.includes('contains_card_fields');
                return {
                    hasPaymentForm: hasPaymentForm,
                    safe: local.safe,
                    score: local.score || 0,
                    reasons: local.reasons || [],
                    message: local.safe ? 'Оплата безопасна' : 'Обнаружены риски при оплате'
                };
            }
            
            const data = await resp.json();
            const hasPaymentForm = data.reasons && data.reasons.includes('contains_card_fields');
            
            return {
                hasPaymentForm: hasPaymentForm,
                safe: data.safe,
                score: data.score || 0,
                reasons: data.reasons || [],
                message: data.safe ? '✓ Оплата безопасна' : '⚠️ Обнаружены риски при оплате'
            };
        } catch (e) {
            // Fallback: локальная проверка
            try {
                const htmlFull = await getPageHtml(currentTab.id);
                const snippet = maskPan(htmlFull).slice(0, 30000);
                const local = clientAnalyzeHtml(snippet, currentTab.url);
                const hasPaymentForm = local.reasons && local.reasons.includes('contains_card_fields');
                return {
                    hasPaymentForm: hasPaymentForm,
                    safe: local.safe,
                    score: local.score || 0,
                    reasons: local.reasons || [],
                    message: local.safe ? 'Оплата безопасна' : 'Обнаружены риски при оплате'
                };
            } catch (ee) {
                return { hasPaymentForm: false, safe: true, message: 'Оплата безопасна - платежная форма не обнаружена' };
            }
        }
    }
    scanSecretsBtn.addEventListener('click', async () => {
        if (!currentTab || !isAnalyzableUrl(currentTab.url)) return;
        secretScanStatus.style.display = 'block';
        secretText.textContent = 'Проверка сайта...';
        secretDot.className = 'status-dot';
        secretDot.style.background = '#666666';
        secretSummary.textContent = '';
        secretLinksSection.style.display = 'none';
        secretLinks.textContent = '';
        try {
            const candidates = ['http://localhost:8000', 'http://127.0.0.1:8000'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) {}
            }
            const resp = await fetch(`${base}/v1/scan/secrets`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: currentTab.url, use_pinkerton: true })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const total = data.total_findings || 0;
            const scripts = data.scanned_scripts || 0;
            const results = data.results || [];
            
            // Упрощенный результат для пользователя
            if (total > 0) {
                secretText.textContent = `⚠️ Найдено ${total} подозрительных элементов`;
                secretDot.className = 'status-dot';
                secretDot.style.background = '#ffaa00';
                secretSummary.textContent = `На странице найдены подозрительные элементы. Рекомендуем быть осторожными и не вводить свои личные данные на этом сайте.`;
            } else {
                secretText.textContent = `✓ Сайт проверен - все в порядке`;
                secretDot.className = 'status-dot';
                secretDot.classList.add('active');
                secretSummary.textContent = `Проверено ${scripts} элементов на странице. Ничего подозрительного не найдено.`;
            }
            
            // Отдельный раздел со ссылками (показываем только если есть результаты)
            if (results.length > 0) {
                const linksHtml = results.map((r, idx) => {
                    const fullUrl = r.script_url;
                    const shortUrl = fullUrl.length > 55 ? fullUrl.substring(0, 55) + '...' : fullUrl;
                    return `<div style="margin-bottom:8px; padding:6px; background:rgba(255,255,255,0.05); border-radius:4px; border:1px solid rgba(255,255,255,0.1);">
                        <div style="font-weight:500; margin-bottom:4px; word-break:break-all;">
                            ${idx + 1}. <a href="${fullUrl}" target="_blank" style="color:#9fb7ff; text-decoration:none; cursor:pointer;" title="${fullUrl}">${shortUrl}</a>
                        </div>
                        <div style="opacity:0.7; font-size:10px;">Найдено: ${r.num_findings} подозрительных элементов</div>
                    </div>`;
                }).join('');
                secretLinks.innerHTML = linksHtml;
                secretLinksSection.style.display = 'block';
            } else {
                secretLinksSection.style.display = 'none';
            }
        } catch (e) {
            secretText.textContent = '❌ Не удалось проверить страницу';
            secretDot.className = 'status-dot inactive';
            const errorMsg = e.message || e.toString();
            if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                secretSummary.textContent = '⚠️ Backend сервер не запущен! Запустите сервер на http://localhost:8000';
            } else {
                secretSummary.textContent = 'Попробуйте позже или проверьте подключение к интернету';
            }
            secretLinksSection.style.display = 'none';
        }
    });

    aiScanBtn.addEventListener('click', async () => {
        if (!currentTab || !isAnalyzableUrl(currentTab.url)) return;
        aiScanStatus.style.display = 'block';
        aiText.textContent = 'Сканирование...';
        aiDot.className = 'status-dot';
        aiDot.style.background = '#666666';
        aiDetails.textContent = '';
        try {
            const candidates = ['http://localhost:8000', 'http://127.0.0.1:8000'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) {}
            }
            const resp = await fetch(`${base}/v1/ai/scan`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: [currentTab.url] })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const items = data.items || [];
            
            if (items.length === 0) {
                aiText.textContent = '❌ Не удалось получить результаты проверки';
                aiDot.className = 'status-dot inactive';
                aiDetails.textContent = 'Попробуйте позже';
                return;
            }
            
            const item = items[0];
            const risk = (item.risk || item.RiskLevel || 'LOW').toString().toUpperCase();
            const reasons = item.reasons || [];
            
            // Формируем краткий отчет
            let statusText = '';
            let dotColor = '#4CAF50'; // green by default
            
            if (risk === 'HIGH') {
                statusText = '⚠️ ОПАСНО';
                dotColor = '#f44336'; // red
            } else if (risk === 'MEDIUM') {
                statusText = '⚠️ ПРЕДУПРЕЖДЕНИЕ';
                dotColor = '#ffaa00'; // orange
            } else {
                statusText = '✓ БЕЗОПАСНО';
                dotColor = '#4CAF50'; // green
            }
            
            aiText.textContent = statusText;
            aiDot.className = 'status-dot';
            aiDot.style.background = dotColor;
            
            // Формируем детали с причинами
            const detailsLines = [];
            if (reasons.length > 0) {
                detailsLines.push('Причины:');
                reasons.forEach((reason, idx) => {
                    detailsLines.push(`${idx + 1}. ${reason}`);
                });
            } else {
                detailsLines.push('Детальный анализ недоступен');
            }
            
            aiDetails.textContent = detailsLines.join('\n');
        } catch (e) {
            aiText.textContent = '❌ Не удалось проверить сайт';
            aiDot.className = 'status-dot inactive';
            const errorMsg = e.message || e.toString();
            if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                aiDetails.textContent = '⚠️ Backend сервер не запущен! Запустите сервер на http://localhost:8000';
            } else {
                aiDetails.textContent = 'Попробуйте позже или проверьте подключение к интернету';
            }
        }
    });
    paymentBackBtn.addEventListener('click', async () => {
        try {
            // Получаем текущую активную вкладку
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs[0]) {
                // Перенаправляем текущую вкладку на безопасную страницу
                await chrome.tabs.update(tabs[0].id, { url: 'https://www.google.com' });
            } else {
                showError('Не удалось найти открытую страницу');
            }
        } catch (error) {
            console.error('Error redirecting to safety:', error);
            showError('Не удалось перейти на безопасную страницу');
        }
    });
    
    settingsLink.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    // Функция проверки текущего URL
    async function checkCurrentUrl(forceRefresh = true) {
        if (!currentTab) {
            // Получаем текущую вкладку заново
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    currentTab = tabs[0];
                    currentUrlDiv.textContent = currentTab.url;
                } else {
                    setStatus('Нет открытой страницы', 'warning');
                    return;
                }
            } catch (e) {
                setStatus('Не удалось найти страницу', 'error');
                return;
            }
        }
        
        if (!isAnalyzableUrl(currentTab.url)) {
            setStatus('Это внутренняя страница браузера - проверка не нужна', 'warning');
            return;
        }
        
        setStatus('Проверяю страницу...', 'loading');
        
        try {
            // Сначала пробуем через background script с принудительным обновлением
            let result;
            try {
                result = await sendMessageToBackground({
                    type: 'CHECK_URL',
                    url: currentTab.url,
                    forceRefresh: forceRefresh !== false  // По умолчанию принудительно при явной проверке
                });
                
                if (result.error) {
                    throw new Error(result.error);
                }
            } catch (bgError) {
                console.log('Background script error, using direct API:', bgError);
                // Fallback к прямому обращению к API
                result = await directApiCall('/v1/check/url', { url: currentTab.url });
            }
            
            updateStatus(result);
            
        } catch (error) {
            console.error('Error checking URL:', error);
            setStatus('❌ Не удалось проверить страницу', 'error');
            // Проверяем, является ли ошибка проблемой подключения к локальному серверу
            const errorMsg = error.message || error.toString();
            if (errorMsg.includes('BACKEND_NOT_RUNNING') || 
                (errorMsg.includes('Failed to fetch') && errorMsg.includes('localhost')) ||
                (errorMsg.includes('Failed to fetch') && errorMsg.includes('127.0.0.1'))) {
                showError('⚠️ Backend сервер не запущен!\n\nЗапустите сервер в терминале:\ncd Agro_Phish/backend\npython3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000\n\nИли используйте скрипт: ./start_backend.sh');
            } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                showError('⚠️ Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:8000');
            } else {
                showError('Попробуйте позже или проверьте подключение к интернету');
            }
        }
    }
    
    // Функция загрузки статистики
    async function loadStats() {
        try {
            // Сначала пробуем через background script
            let stats;
            try {
                stats = await sendMessageToBackground({
                    type: 'GET_STATS'
                });
                
                if (stats.error) {
                    throw new Error(stats.error);
                }
            } catch (bgError) {
                console.log('Background script error for stats, using direct API:', bgError);
                // Fallback к прямому обращению к API
                stats = await directApiCall('/incidents/stats');
            }
            
            totalBlocked.textContent = stats.blocked || 0;
            totalWarned.textContent = stats.warned || 0;
            
        } catch (error) {
            // Не показываем всплывающую ошибку статистики, чтобы не мешать UX
            console.warn('Stats unavailable:', error?.message || error);
            // Устанавливаем значения по умолчанию
            totalBlocked.textContent = '-';
            totalWarned.textContent = '-';
        }
    }
    
    // Функция очистки кэша
    async function clearCache() {
        try {
            // Очищаем кэш в background script
            const cacheResult = await sendMessageToBackground({ type: 'CLEAR_CACHE' });
            const cacheCleared = (cacheResult && cacheResult.cleared) || 0;
            
            // Очищаем базу данных incidents
            const candidates = ['http://localhost:8000', 'http://127.0.0.1:8000'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) {}
            }
            
            let dbCleared = 0;
            try {
                const dbResp = await fetch(`${base}/incidents/clear`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (dbResp.ok) {
                    const dbData = await dbResp.json();
                    dbCleared = dbData.deleted || 0;
                }
            } catch (dbError) {
                console.warn('Failed to clear database:', dbError);
            }
            
            const totalCleared = cacheCleared + dbCleared;
            setStatus(`✓ Очищено: ${totalCleared} записей`, 'safe');
            
            // Обновляем статистику и проверяем текущий URL
            await Promise.all([
                loadStats(),
                currentTab && isAnalyzableUrl(currentTab.url) ? checkCurrentUrl(true) : Promise.resolve()
            ]);
        } catch (error) {
            console.error('Error clearing cache:', error);
            showError('Не удалось очистить данные');
            setStatus('❌ Ошибка очистки', 'error');
        }
    }
    
    // Функция для упрощения технических терминов в причинах
    function simplifyReason(reason) {
        if (!reason) return '';
        
        const simpleMap = {
            'незащищенный протокол http': 'Соединение не защищено - это может быть опасно',
            'незащищенный протокол': 'Соединение не защищено',
            'http': 'Соединение не защищено',
            'https': 'Соединение защищено',
            'домен в черном списке': 'Этот сайт в списке опасных',
            'подозрительный домен': 'Адрес сайта выглядит подозрительно',
            'подозрительные ключевые слова': 'На странице найдены подозрительные слова',
            'подозрительные паттерны': 'На странице найдены подозрительные элементы',
            'доверенный домен': 'Это официальный сайт',
            'url выглядит безопасно': 'Сайт выглядит безопасным',
            'ошибка при анализе': 'Не удалось проверить сайт',
            'ошибка при проверке url': 'Не удалось проверить сайт'
        };
        
        const lowerReason = reason.toLowerCase();
        for (const [tech, simple] of Object.entries(simpleMap)) {
            if (lowerReason.includes(tech)) {
                return simple;
            }
        }
        
        // Если не найдено в мапе, упрощаем вручную
        let simplified = reason
            .replace(/https?/gi, 'защищенное соединение')
            .replace(/домен/gi, 'адрес сайта')
            .replace(/протокол/gi, 'соединение')
            .replace(/ssl/gi, 'защита')
            .replace(/tls/gi, 'защита')
            .replace(/url/gi, 'ссылка')
            .replace(/скрипт/gi, 'программа')
            .replace(/метаданные/gi, 'информация о странице');
        
        return simplified || reason;
    }
    
    // Функция обновления статуса
    function updateStatus(result) {
        const { action, score, reason } = result;
        
        let statusClass, statusMessage, dotClass;
        
        switch (action) {
            case 'block':
                statusClass = 'blocked';
                statusMessage = '⚠️ ЭТА ССЫЛКА ОПАСНА';
                dotClass = 'inactive';
                break;
            case 'warn':
                statusClass = 'warning';
                statusMessage = '⚠️ БУДЬТЕ ОСТОРОЖНЫ';
                dotClass = 'warning';
                break;
            case 'allow':
                statusClass = 'safe';
                statusMessage = '✓ ССЫЛКА БЕЗОПАСНА';
                dotClass = 'active';
                break;
            default:
                statusClass = 'unknown';
                statusMessage = '❓ НЕ УДАЛОСЬ ПРОВЕРИТЬ';
                dotClass = 'inactive';
        }
        
        // Показываем упрощенную причину под статусом
        const simplifiedReason = simplifyReason(reason);
        const displayText = simplifiedReason ? `${statusMessage}\n${simplifiedReason}` : statusMessage;
        
        setStatus(displayText, statusClass);
        
        // Обновляем статистику после проверки
        loadStats();
    }
    
    // Функция установки статуса
    function setStatus(text, type = 'loading') {
        // Поддерживаем многострочный текст
        statusText.style.whiteSpace = 'pre-wrap';
        statusText.textContent = text;
        
        // Удаляем все классы
        statusDot.className = 'status-dot';
        
        // Добавляем соответствующий класс
        switch (type) {
            case 'active':
            case 'safe':
                statusDot.classList.add('active');
                break;
            case 'inactive':
            case 'blocked':
            case 'error':
                statusDot.classList.add('inactive');
                break;
            case 'warning':
                statusDot.style.background = '#ffaa00';
                break;
            default:
                // Для loading и других состояний
                statusDot.style.background = '#666666';
        }
    }
    
    // Функция показа ошибки
    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
    
    // Функция отправки сообщения в background script
    function sendMessageToBackground(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    // Fallback функция для прямого обращения к API
    async function directApiCall(endpoint, data = null) {
        try {
            const candidates = ['http://localhost:8000', 'http://127.0.0.1:8000'];
            let baseOk = null;
            for (const base of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${base}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    baseOk = base;
                    break;
                } catch (_) {}
            }
            const base = baseOk || candidates[0];
            const url = `${base}${endpoint}`;
            const options = {
                method: data ? 'POST' : 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }
            
            console.log('Making direct API call to:', url);
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Direct API response:', result);
            return result;
            
        } catch (error) {
            console.error('Direct API call error:', error);
            
            // Если это ошибка сети, проверяем, это локальный сервер или внешний
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('fetch failed')) {
                throw new Error('BACKEND_NOT_RUNNING');
            }
            
            throw error;
        }
    }
    
    // Инициализация с обработкой ошибок
    async function initializePopup() {
        try {
            // Загружаем статистику
            await loadStats();
            
            // Проверяем текущий URL если есть вкладка
            if (currentTab) {
                await checkCurrentUrl(false);  // Автоматическая проверка - используем кэш
            } else {
                setStatus('Нет открытой страницы', 'warning');
            }
            
            // Скрываем загрузку и показываем основной контент
            loadingDiv.style.display = 'none';
            mainContent.style.display = 'block';
            
        } catch (error) {
            console.error('Initialization error:', error);
            loadingDiv.style.display = 'none';
            mainContent.style.display = 'block';
            const errorMsg = error.message || error.toString();
            if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                showError('⚠️ Backend сервер не запущен! Запустите сервер на http://localhost:8000');
            } else {
                showError('Не удалось загрузить расширение. Проверьте подключение к интернету.');
            }
            setStatus('❌ Ошибка загрузки', 'error');
        }
    }
    
    // Запускаем инициализацию
    initializePopup();
    
    // Обновляем статистику каждые 30 секунд
    setInterval(loadStats, 30000);
});
