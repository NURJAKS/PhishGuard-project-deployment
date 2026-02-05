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
    const vulnScanBtn = document.getElementById('vuln-scan');
    const vulnScanStatus = document.getElementById('vulnScanStatus');
    const vulnDot = document.getElementById('vuln-dot');
    const vulnText = document.getElementById('vuln-text');
    const vulnDetails = document.getElementById('vuln-details');
    const sqlScanBtn = document.getElementById('sql-scan');
    const crawlerScanBtn = document.getElementById('crawler-scan');
    const phpScanBtn = document.getElementById('php-scan');
    const jsdirbusterBtn = document.getElementById('jsdirbuster-scan');
    const checkDnsBtn = document.getElementById('check-dns');
    const dnsCheckStatus = document.getElementById('dnsCheckStatus');
    const dnsDot = document.getElementById('dns-dot');
    const dnsText = document.getElementById('dns-text');
    const dnsDomain = document.getElementById('dns-domain');
    const dnsContent = document.getElementById('dns-content');
    const dnsIps = document.getElementById('dns-ips');
    const dnsMx = document.getElementById('dns-mx');
    const dnsGeo = document.getElementById('dns-geo');
    const dnsHosting = document.getElementById('dns-hosting');

    // Email auto-check toggle
    const emailAutoToggle = document.getElementById('email-auto-toggle');
    const EMAIL_AUTO_KEY = 'emailAutoEnabled';
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

    // Init email auto-check toggle UI
    try {
        if (emailAutoToggle) {
            const stored = await chrome.storage.local.get([EMAIL_AUTO_KEY]);
            const enabled = stored[EMAIL_AUTO_KEY] === true;
            emailAutoToggle.checked = enabled;

            emailAutoToggle.addEventListener('change', async () => {
                const v = emailAutoToggle.checked === true;
                await chrome.storage.local.set({ [EMAIL_AUTO_KEY]: v });
            });
        }
    } catch (e) {
        console.warn('Email toggle init error:', e);
    }

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
        chrome.tabs.create({ url: 'http://localhost:8002/documents' });
    });

    // SQL button handler - через background.js
    if (sqlScanBtn) {
        sqlScanBtn.addEventListener('click', () => {
            if (!currentTab || !isAnalyzableUrl(currentTab.url)) {
                showError('Не удалось получить URL для сканирования');
                return;
            }
            vulnScanStatus.style.display = 'block';
            vulnText.textContent = 'Запуск SQL инструмента...';
            vulnDot.className = 'status-dot';
            vulnDot.style.background = '#666666';
            vulnDetails.textContent = 'Подключение к backend...';

            new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage({
                        type: 'RUN_SQL_SCAN',
                        url: currentTab.url
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message || 'Ошибка связи с background script'));
                            return;
                        }
                        if (response === undefined || response === null) {
                            reject(new Error('Не получен ответ от background script. Возможно, порт закрылся.'));
                            return;
                        }
                        resolve(response);
                    });
                } catch (e) {
                    reject(e);
                }
            }).then((response) => {
                if (response && response.error) {
                    vulnText.textContent = '❌ SQL инструмент не запустился';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = response.error || 'Неизвестная ошибка';
                    return;
                }

                if (response && response.success && response.data) {
                    const data = response.data;
                    vulnText.textContent = '✓ SQL инструмент запущен';
                    vulnDot.className = 'status-dot';
                    vulnDot.style.background = '#4CAF50';
                    vulnDetails.textContent = data.message || 'jSQL Injection запущен (GUI).';
                } else {
                    vulnText.textContent = '❌ Неверный формат ответа';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = 'Ответ от сервера не содержит ожидаемых данных';
                }
            }).catch((error) => {
                console.error('SQL scan error:', error);
                vulnText.textContent = '❌ SQL инструмент не запустился';
                vulnDot.className = 'status-dot inactive';
                const errorMsg = error.message || error.toString() || 'Неизвестная ошибка';
                vulnDetails.textContent = errorMsg;
            });
        });
    }

    // Crawler button handler - через background.js
    if (crawlerScanBtn) {
        crawlerScanBtn.addEventListener('click', () => {
            if (!currentTab || !isAnalyzableUrl(currentTab.url)) {
                showError('Не удалось получить URL для сканирования');
                return;
            }
            vulnScanStatus.style.display = 'block';
            vulnText.textContent = 'Запуск Crawler (быстрый режим)...';
            vulnDot.className = 'status-dot';
            vulnDot.style.background = '#666666';
            vulnDetails.textContent = 'Подключение к backend...';

            new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage({
                        type: 'RUN_CRAWLER_SCAN',
                        url: currentTab.url,
                        mode: 'fast'
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message || 'Ошибка связи с background script'));
                            return;
                        }
                        if (response === undefined || response === null) {
                            reject(new Error('Не получен ответ от background script. Возможно, порт закрылся.'));
                            return;
                        }
                        resolve(response);
                    });
                } catch (e) {
                    reject(e);
                }
            }).then((response) => {
                if (response && response.error) {
                    vulnText.textContent = '❌ Crawler не запустился';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = response.error || 'Неизвестная ошибка';
                    return;
                }

                if (response && response.success && response.data) {
                    const data = response.data;
                    vulnText.textContent = data.status === 'ok' ? '✓ Crawler завершен' : `Crawler статус: ${data.status}`;
                    vulnDot.className = 'status-dot';
                    vulnDot.style.background = data.status === 'ok' ? '#4CAF50' : '#ffaa00';
                    vulnDetails.textContent = data.summary || 'Отчет готов.';
                    if (data.report_url) {
                        chrome.tabs.create({ url: data.report_url });
                    }
                } else {
                    vulnText.textContent = '❌ Неверный формат ответа';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = 'Ответ от сервера не содержит ожидаемых данных';
                }
            }).catch((error) => {
                console.error('Crawler error:', error);
                vulnText.textContent = '❌ Crawler не запустился';
                vulnDot.className = 'status-dot inactive';
                const errorMsg = error.message || error.toString() || 'Неизвестная ошибка';
                vulnDetails.textContent = errorMsg;
            });
        });
    }

    // PHP (RIPS) button handler - через background.js
    if (phpScanBtn) {
        phpScanBtn.addEventListener('click', () => {
            vulnScanStatus.style.display = 'block';
            vulnText.textContent = 'Запуск PHP анализатора...';
            vulnDot.className = 'status-dot';
            vulnDot.style.background = '#666666';
            vulnDetails.textContent = 'Подключение к backend...';

            new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage({
                        type: 'RUN_PHP_SCAN'
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message || 'Ошибка связи с background script'));
                            return;
                        }
                        if (response === undefined || response === null) {
                            reject(new Error('Не получен ответ от background script. Возможно, порт закрылся.'));
                            return;
                        }
                        resolve(response);
                    });
                } catch (e) {
                    reject(e);
                }
            }).then((response) => {
                if (response && response.error) {
                    vulnText.textContent = '❌ PHP анализатор не запустился';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = response.error || 'Неизвестная ошибка';
                    return;
                }

                if (response && response.success && response.data) {
                    const data = response.data;
                    vulnText.textContent = '✓ PHP анализатор готов';
                    vulnDot.className = 'status-dot';
                    vulnDot.style.background = '#4CAF50';
                    vulnDetails.textContent = data.message || 'RIPS запущен. Откройте интерфейс для анализа PHP.';
                    if (data.url) {
                        chrome.tabs.create({ url: data.url });
                    }
                } else {
                    vulnText.textContent = '❌ Неверный формат ответа';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = 'Ответ от сервера не содержит ожидаемых данных';
                }
            }).catch((error) => {
                console.error('PHP scan error:', error);
                vulnText.textContent = '❌ PHP анализатор не запустился';
                vulnDot.className = 'status-dot inactive';
                const errorMsg = error.message || error.toString() || 'Неизвестная ошибка';
                vulnDetails.textContent = errorMsg;
            });
        });
    }

    // JSDirbuster button handler - через background.js
    if (jsdirbusterBtn) {
        jsdirbusterBtn.addEventListener('click', () => {
            if (!currentTab || !isAnalyzableUrl(currentTab.url)) {
                showError('Не удалось получить URL для сканирования');
                return;
            }
            vulnScanStatus.style.display = 'block';
            vulnText.textContent = 'Запуск JSDirbuster...';
            vulnDot.className = 'status-dot';
            vulnDot.style.background = '#666666';
            vulnDetails.textContent = 'Подключение к backend...';

            // Используем промис для обработки ответа
            new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage({
                        type: 'RUN_JSDIRBUSTER',
                        url: currentTab.url
                    }, (response) => {
                        // Проверяем ошибки Chrome runtime
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message || 'Ошибка связи с background script'));
                            return;
                        }
                        // Проверяем что ответ получен
                        if (response === undefined || response === null) {
                            reject(new Error('Не получен ответ от background script. Возможно, порт закрылся.'));
                            return;
                        }
                        resolve(response);
                    });
                } catch (e) {
                    reject(e);
                }
            }).then((response) => {
                // Обработка успешного ответа
                if (response && response.error) {
                    vulnText.textContent = '❌ JSDirbuster не удалось запустить';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = response.error || 'Неизвестная ошибка';
                    return;
                }

                if (response && response.success && response.data) {
                    const data = response.data;
                    vulnText.textContent = data.status === 'ok' ? '✓ JSDirbuster завершен' : `JSDirbuster статус: ${data.status}`;
                    vulnDot.className = 'status-dot';
                    vulnDot.style.background = data.status === 'ok' ? '#4CAF50' : '#ffaa00';
                    vulnDetails.textContent = data.output || 'Нет вывода';
                } else {
                    vulnText.textContent = '❌ Неверный формат ответа';
                    vulnDot.className = 'status-dot inactive';
                    vulnDetails.textContent = 'Ответ от сервера не содержит ожидаемых данных';
                }
            }).catch((error) => {
                // Обработка ошибок
                console.error('JSDirbuster error:', error);
                vulnText.textContent = '❌ JSDirbuster не удалось запустить';
                vulnDot.className = 'status-dot inactive';
                const errorMsg = error.message || error.toString() || 'Неизвестная ошибка';
                vulnDetails.textContent = errorMsg;
            });
        });
    }

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
            } catch (_) { }
            const tokens = ['card', 'cardnumber', 'card_number', 'pan', 'cvv', 'cvc', 'expiry', 'mm/yy', 'name_on_card', 'visa', 'mastercard', 'paypal'];
            let containsCard = false;
            let suspiciousAction = false;
            forms.forEach(f => {
                const action = (f.getAttribute('action') || '').trim();
                if (!action || action.startsWith('mailto:') || action.startsWith('data:')) suspiciousAction = true;
                try {
                    const a = new URL(action, pageUrl);
                    const p = new URL(pageUrl);
                    if (a.host && p.host && a.host !== p.host) suspiciousAction = true;
                } catch (_) { }
                const inputs = Array.from(f.querySelectorAll('input,select,textarea'));
                for (const inp of inputs) {
                    const v = ((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.placeholder || '') + ' ' + (inp.type || '')).toLowerCase();
                    if (tokens.some(t => v.includes(t))) { containsCard = true; break; }
                }
            });
            if (containsCard) reasons.push('contains_card_fields');
            if (suspiciousAction) reasons.push('suspicious_form_action');
            const weights = { no_https: 0.3, contains_card_fields: 0.4, suspicious_form_action: 0.25 };
            let score = 0; reasons.forEach(r => score += (weights[r] || 0));
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
            const candidates = ['http://localhost:8002', 'http://127.0.0.1:8002'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) { }
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
            const candidates = ['http://localhost:8002', 'http://127.0.0.1:8002'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) { }
            }
            const resp = await fetch(`${base}/v1/scan/secrets`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: currentTab.url, use_pinkerton: true })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const total = data.total_findings || 0;
            const scripts = data.scanned_scripts || 0;
            const elements = data.scanned_elements || scripts || 0;
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
                if (elements > 0) {
                    secretSummary.textContent = `Проверено ${elements} элементов на странице (${scripts} внешних JS файлов). Ничего подозрительного не найдено.`;
                } else {
                    secretSummary.textContent = `Проверка завершена. На странице не обнаружено внешних JavaScript файлов для анализа.`;
                }
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
                secretSummary.textContent = '⚠️ Backend сервер не запущен! Запустите сервер на http://localhost:8002';
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
            const candidates = ['http://localhost:8002', 'http://127.0.0.1:8002'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) { }
            }

            // Получаем HTML страницы для анализа
            const htmlFull = await getPageHtml(currentTab.id);
            const snippet = maskPan(htmlFull).slice(0, 30000);

            // Вызываем /analyze_payment который использует Google AI
            const payload = {
                request_id: crypto.randomUUID(),
                url: currentTab.url,
                html_snippet: snippet,
                meta: { user_agent: navigator.userAgent }
            };

            const resp = await fetch(`${base}/analyze_payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();

            // Извлекаем AI анализ из explain.ai_analysis
            const aiAnalysis = data.explain?.ai_analysis;

            if (!aiAnalysis) {
                aiText.textContent = '❌ AI анализ недоступен';
                aiDot.className = 'status-dot inactive';
                aiDetails.textContent = 'Не удалось выполнить AI анализ. Проверьте подключение к интернету и настройки API ключа.\n\nДля использования Google AI:\n1. Получите новый API ключ на https://aistudio.google.com/\n2. Установите переменную окружения:\n   export GOOGLE_API_KEY="ваш_новый_ключ"\n3. Перезапустите backend сервер';
                return;
            }

            // Проверяем, есть ли ошибка в анализе
            if (aiAnalysis.error || (aiAnalysis.provider === 'none' && aiAnalysis.verdict === 'неизвестно')) {
                aiText.textContent = '⚠️ AI анализ не выполнен';
                aiDot.className = 'status-dot inactive';
                const errorMsg = aiAnalysis.error || 'Не удалось выполнить AI анализ';
                aiDetails.textContent = `Ошибка: ${errorMsg}\n\nДля использования Google AI:\n1. Получите новый API ключ на https://aistudio.google.com/\n2. Установите переменную окружения:\n   export GOOGLE_API_KEY="ваш_новый_ключ"\n3. Перезапустите backend сервер`;
                return;
            }

            // Определяем статус на основе вердикта и процента риска
            const verdict = (aiAnalysis.verdict || 'неизвестно').toLowerCase();
            const riskPercent = aiAnalysis.risk_percent || 0;
            const provider = aiAnalysis.provider || 'unknown';

            let statusText = '';
            let dotColor = '#4CAF50'; // green by default

            if (verdict === 'опасно' || riskPercent >= 70) {
                statusText = '⚠️ ОПАСНО';
                dotColor = '#f44336'; // red
            } else if (verdict === 'подозрительно' || (riskPercent >= 40 && riskPercent < 70)) {
                statusText = '⚠️ ПРЕДУПРЕЖДЕНИЕ';
                dotColor = '#ffaa00'; // orange
            } else if (verdict === 'безопасно' || riskPercent < 40) {
                statusText = '✓ БЕЗОПАСНО';
                dotColor = '#4CAF50'; // green
            } else {
                statusText = '❓ НЕИЗВЕСТНО';
                dotColor = '#666666'; // gray
            }

            aiText.textContent = statusText;
            aiDot.className = 'status-dot';
            aiDot.style.background = dotColor;

            // Формируем детали с AI анализом
            const detailsLines = [];

            // Добавляем риски, если есть
            const risks = aiAnalysis.risks || [];
            if (risks.length > 0) {
                detailsLines.push('Причины:');
                risks.forEach((risk, idx) => {
                    detailsLines.push(`${idx + 1}. ${risk}`);
                });
            }

            // Добавляем объяснение
            if (aiAnalysis.explanation) {
                if (detailsLines.length > 0) detailsLines.push('');
                detailsLines.push('Объяснение:');
                detailsLines.push(aiAnalysis.explanation);
            }

            // Добавляем пункты безопасности
            const safetyPoints = aiAnalysis.safety_points || [];
            if (safetyPoints.length > 0) {
                if (detailsLines.length > 0) detailsLines.push('');
                detailsLines.push('Проверка безопасности:');
                safetyPoints.forEach((point, idx) => {
                    detailsLines.push(`${idx + 1}. ${point}`);
                });
            }

            // Добавляем заключение
            if (aiAnalysis.conclusion) {
                if (detailsLines.length > 0) detailsLines.push('');
                detailsLines.push('Заключение:');
                detailsLines.push(aiAnalysis.conclusion);
            }

            // Добавляем информацию о статусе соединения и проверке адреса
            if (aiAnalysis.connection_status || aiAnalysis.address_check) {
                if (detailsLines.length > 0) detailsLines.push('');
                detailsLines.push('Детали проверки:');
                if (aiAnalysis.connection_status && aiAnalysis.connection_status !== 'неизвестно') {
                    detailsLines.push(`Соединение: ${aiAnalysis.connection_status}`);
                }
                if (aiAnalysis.address_check && aiAnalysis.address_check !== 'неизвестно') {
                    detailsLines.push(`Адрес: ${aiAnalysis.address_check}`);
                }
                if (aiAnalysis.redirects && aiAnalysis.redirects !== 'неизвестно') {
                    detailsLines.push(`Переходы: ${aiAnalysis.redirects}`);
                }
            }

            // Добавляем процент риска и провайдера
            if (detailsLines.length > 0) detailsLines.push('');
            detailsLines.push(`Риск: ${riskPercent}%`);
            if (provider !== 'none') {
                detailsLines.push(`AI: ${provider === 'google' ? 'Google AI' : provider}`);
            }

            if (detailsLines.length === 0) {
                detailsLines.push('Детальный анализ недоступен');
            }

            aiDetails.textContent = detailsLines.join('\n');
        } catch (e) {
            aiText.textContent = '❌ Не удалось проверить сайт';
            aiDot.className = 'status-dot inactive';
            const errorMsg = e.message || e.toString();
            if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('fetch failed')) {
                aiDetails.textContent = '⚠️ Backend сервер не запущен! Запустите сервер на http://localhost:8002';
            } else if (errorMsg.includes('HTTP error! status: 500')) {
                aiDetails.textContent = '⚠️ Ошибка на сервере (500). Проверьте логи backend сервера или попробуйте позже.';
            } else if (errorMsg.includes('HTTP error! status: 400')) {
                aiDetails.textContent = '⚠️ Некорректный запрос (400). Проверьте, что URL валиден.';
            } else {
                aiDetails.textContent = `Ошибка: ${errorMsg}. Попробуйте позже или проверьте подключение к интернету.`;
            }
        }
    });

    vulnScanBtn.addEventListener('click', async () => {
        if (!currentTab || !isAnalyzableUrl(currentTab.url)) {
            showError('Vuln Scan доступен только для HTTP/HTTPS страниц');
            return;
        }
        vulnScanStatus.style.display = 'block';
        vulnText.textContent = 'Запуск Nikto...';
        vulnDot.className = 'status-dot';
        vulnDot.style.background = '#666666';
        vulnDetails.textContent = '';
        try {
            const resp = await directApiCall('/v1/vuln/nikto', { url: currentTab.url });
            
            // Проверяем статус ответа
            if (resp?.status && resp.status.startsWith('error:')) {
                // Если Nikto не установлен или другая ошибка, показываем информационное сообщение
                vulnText.textContent = resp.status === 'error:not_installed' ? '⚠️ Nikto не установлен' : '⚠️ Ошибка сканирования';
                vulnDot.className = 'status-dot';
                vulnDot.style.background = '#ffaa00'; // Оранжевый для предупреждения
                vulnDetails.textContent = resp?.output || 'Неизвестная ошибка';
            } else {
                // Успешное выполнение
                vulnText.textContent = '✓ Nikto scan завершен';
                vulnDot.className = 'status-dot';
                vulnDot.style.background = '#4CAF50'; // Зеленый для успеха
                vulnDot.classList.add('active');
                const statusLine = resp?.status ? `Статус: ${resp.status}\n` : '';
                const output = resp?.output || 'Нет данных от Nikto.';
                vulnDetails.textContent = statusLine + output;
            }
        } catch (e) {
            vulnText.textContent = '❌ Не удалось запустить Nikto';
            vulnDot.className = 'status-dot inactive';
            const msg = e?.message || e.toString();
            if (msg === 'BACKEND_NOT_RUNNING' || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                vulnDetails.textContent = '⚠️ Backend не запущен. Стартуйте backend на http://localhost:8002';
            } else if (msg.includes('HTTP error! status: 500')) {
                vulnDetails.textContent = '⚠️ Ошибка на сервере. Проверьте логи backend сервера.';
            } else {
                vulnDetails.textContent = `Ошибка: ${msg}`;
            }
            showError(vulnDetails.textContent);
        }
    });

    // ==================== DNS Check Functions ====================

    // Known hosting/cloud providers
    const KNOWN_HOSTING_PROVIDERS = [
        'amazon', 'aws', 'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner',
        'google', 'gcp', 'azure', 'microsoft', 'cloudflare', 'fastly', 'akamai',
        'godaddy', 'hostgator', 'bluehost', 'namecheap', 'dreamhost', 'hostinger',
        'ionos', 'contabo', 'scaleway', 'upcloud', 'kamatera', 'rackspace'
    ];

    // Known residential/ISP providers
    const KNOWN_ISP_PROVIDERS = [
        'comcast', 'verizon', 'at&t', 'spectrum', 'cox', 'centurylink',
        'rostelecom', 'beeline', 'megafon', 'mts', 'tele2', 'yota',
        'kazakhtelecom', 'kcell', 'activ', 'altel', 'tele2.kz'
    ];

    // Cloudflare DNS-over-HTTPS query
    async function queryCloudflare(domain, type = 'A') {
        try {
            const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/dns-json' }
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
        let riskScore = 0;

        if (!ipInfo) {
            return {
                level: 'medium',
                badge: '⚠️ Неизвестно',
                details: ['Не удалось получить информацию о сервере']
            };
        }

        const org = (ipInfo.org || '').toLowerCase();
        const hostname = (ipInfo.hostname || '').toLowerCase();

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

        // Determine risk level
        let riskLevel = 'low';
        if (riskScore >= 40) {
            riskLevel = 'high';
        } else if (riskScore >= 20) {
            riskLevel = 'medium';
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

    // Format IP address
    function formatIP(ip) {
        const isIPv6 = ip.includes(':');
        const label = isIPv6 ? 'IPv6' : 'IPv4';
        return `<span style="display:inline-block; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:3px; margin:2px 4px 2px 0; font-size:11px; font-family:monospace;">${label}: ${ip}</span>`;
    }

    // Main DNS check function
    checkDnsBtn.addEventListener('click', async () => {
        if (!currentTab || !isAnalyzableUrl(currentTab.url)) {
            showError('DNS проверка доступна только для HTTP/HTTPS страниц');
            return;
        }

        try {
            const url = new URL(currentTab.url);
            const domain = url.hostname;

            // Show DNS check panel
            dnsCheckStatus.style.display = 'block';
            dnsText.textContent = 'Проверка DNS...';
            dnsDot.className = 'status-dot';
            dnsDot.style.background = '#666666';
            dnsDomain.textContent = domain;
            dnsContent.style.display = 'none';
            dnsIps.innerHTML = '';
            dnsMx.style.display = 'none';
            dnsGeo.style.display = 'none';
            dnsHosting.style.display = 'none';

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

            // Update IPs display
            if (allIPs.length > 0) {
                dnsIps.innerHTML = '<strong style="opacity:0.8;">IP адреса:</strong><br>' +
                    allIPs.map(ip => formatIP(ip)).join(' ');
            } else {
                dnsIps.innerHTML = '<span style="opacity:0.6;">IP адреса не найдены</span>';
            }

            // Update MX records
            if (mxList.length > 0) {
                dnsMx.style.display = 'block';
                dnsMx.innerHTML = '<strong style="opacity:0.8;">MX записи:</strong><br>' +
                    mxList.map(mx => `<span style="font-size:11px; font-family:monospace;">[${mx.priority}] ${mx.server}</span>`).join('<br>');
            }

            // Get geolocation for first IPv4 IP
            let ipInfo = null;
            if (ipv4List.length > 0) {
                ipInfo = await getIpInfo(ipv4List[0]);
            }

            // Update geolocation
            if (ipInfo) {
                dnsGeo.style.display = 'block';
                const geoDetails = [];
                if (ipInfo.city) geoDetails.push(ipInfo.city);
                if (ipInfo.region) geoDetails.push(ipInfo.region);
                if (ipInfo.country) geoDetails.push(ipInfo.country);
                const location = geoDetails.join(', ') || 'Неизвестно';
                dnsGeo.innerHTML = `<strong style="opacity:0.8;">Геолокация:</strong> 📍 ${location}`;

                // Update hosting info
                if (ipInfo.org) {
                    dnsHosting.style.display = 'block';
                    dnsHosting.innerHTML = `<strong style="opacity:0.8;">Провайдер:</strong> 🏢 ${ipInfo.org}`;
                }
            }


            // Update status
            dnsText.textContent = '✓ DNS проверка завершена';
            dnsDot.className = 'status-dot';
            dnsDot.classList.add('active');
            dnsContent.style.display = 'block';

        } catch (e) {
            console.error('DNS check error:', e);
            dnsText.textContent = '❌ Ошибка DNS проверки';
            dnsDot.className = 'status-dot inactive';
            dnsContent.style.display = 'block';
            showError('Ошибка DNS проверки: ' + e.message);
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
                showError('⚠️ Backend сервер не запущен!\n\nЗапустите сервер в терминале:\ncd Phish/backend\npython3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8002\n\nИли используйте скрипт: ./start_backend.sh');
            } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                showError('⚠️ Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:8002');
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
            const candidates = ['http://localhost:8002', 'http://127.0.0.1:8002'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b; break;
                } catch (_) { }
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

        // Удаляем все классы и inline стили
        statusDot.className = 'status-dot';
        statusDot.style.background = '';

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
            const candidates = ['http://localhost:8002', 'http://127.0.0.1:8002'];
            let baseOk = null;
            for (const base of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${base}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    baseOk = base;
                    break;
                } catch (_) { }
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
            
            // Стандартный таймаут для всех запросов
            const timeoutDuration = 60000; // 60 секунд
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

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
                showError('⚠️ Backend сервер не запущен! Запустите сервер на http://localhost:8002');
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
