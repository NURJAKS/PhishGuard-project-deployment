// PhishGuard Popup Script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('PhishGuard popup loaded');

    // Элементы DOM
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const mainContent = document.getElementById('main-content');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const statusCard = document.getElementById('status-card-main');
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
    const upgradePlanBtn = document.getElementById('upgrade-plan-btn');
    const sqlScanBtn = document.getElementById('sql-scan');
    const crawlerScanBtn = document.getElementById('crawler-scan');
    const phpScanBtn = document.getElementById('php-scan');
    const jsdirbusterBtn = document.getElementById('jsdirbuster-scan');
    if (!jsdirbusterBtn) console.warn('Button jsdirbuster-scan not found in HTML');
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

    // Localization
    const langSwitch = document.getElementById('lang-switch');
    const langText = document.getElementById('lang-text');
    let currentLang = 'EN';

    const translations = {
        EN: {
            subtitle: 'Advanced Protection',
            dashboard: 'Dashboard',
            documents: 'Documents',
            siteScan: 'Site Scan',
            dnsScan: 'DNS Scan',
            aiScan: 'AI-Scan',
            webScan: 'Web Scan',
            cleanup: 'Cleanup',
            exit: 'Safe Exit',
            paymentAnalysis: 'Payment Analysis...',
            siteScanning: 'Site Scanning...',
            aiScanning: 'AI Scanning...',
            dnsScanning: 'DNS Scanning...',
            webScanning: 'Starting WEB scan...',
            siteChecked: '✓ Site checked - all good',
            foundSuspicious: '⚠️ Found {count} suspicious elements',
            failedScan: '❌ Failed to scan page',
            dnsComplete: '✓ DNS scan complete',
            dnsError: '❌ DNS check error',
            webComplete: '✓ WEB scan complete',
            safePayment: '✓ Safe payment',
            riskPayment: '⚠️ Payment risks detected',
            upgradePlan: 'Upgrade Plan',
            labelPlan: 'Plan:',
            labelDailyScans: 'Scans today:',
            logout: 'Logout',
            loginTitle: 'Login to PhishGuard',
            loginSubtitle: 'Login to use AI-scan and reports',
            usernamePlaceholder: 'Username',
            passwordPlaceholder: 'Password',
            loginBtn: 'Login',
            noAccount: 'No account?',
            registerLink: 'Register',
            registerTitle: 'Registration',
            optPublic: 'Regular User',
            optBusiness: 'Business (Company)',
            optGovernment: 'Government',
            createAccountBtn: 'Create Account',
            hasAccount: 'Already have an account?',
            loginLink: 'Login',
            syncing: 'Syncing...',
            emailAutoTitle: 'Email: automatic check',
            emailAutoDesc: 'Analysis of metadata and links when opening mail',
            labelBlocked: 'Blocked',
            labelWarned: 'Warnings'
        },
        RU: {
            subtitle: 'Продвинутая защита',
            dashboard: 'Панель',
            documents: 'Файлы',
            siteScan: 'Сайт',
            dnsScan: 'DNS',
            aiScan: 'AI-Скан',
            webScan: 'Веб-Скан',
            cleanup: 'Очистка',
            exit: 'Выход',
            paymentAnalysis: 'Анализ оплаты...',
            siteScanning: 'Проверка сайта...',
            aiScanning: 'ИИ-сканирование...',
            dnsScanning: 'Проверка DNS...',
            webScanning: 'Запуск WEB-скана...',
            siteChecked: '✓ Сайт проверен - всё чисто',
            foundSuspicious: '⚠️ Найдено {count} подозрительных элементов',
            failedScan: '❌ Ошибка проверки страницы',
            dnsComplete: '✓ DNS проверка завершена',
            dnsError: '❌ Ошибка DNS проверки',
            webComplete: '✓ WEB скан завершен',
            safePayment: '✓ Оплата безопасна',
            riskPayment: '⚠️ Риски при оплате',
            upgradePlan: 'Улучшить план',
            labelPlan: 'План:',
            labelDailyScans: 'Сканирований сегодня:',
            logout: 'Выйти',
            loginTitle: 'Вход в PhishGuard',
            loginSubtitle: 'Войдите, чтобы использовать AI-скан и отчеты',
            usernamePlaceholder: 'Имя пользователя',
            passwordPlaceholder: 'Пароль',
            loginBtn: 'Войти',
            noAccount: 'Нет аккаунта?',
            registerLink: 'Зарегистрироваться',
            registerTitle: 'Регистрация',
            optPublic: 'Обычный пользователь',
            optBusiness: 'Бизнес (Компания)',
            optGovernment: 'Государство',
            createAccountBtn: 'Создать аккаунт',
            hasAccount: 'Уже есть аккаунт?',
            loginLink: 'Войти',
            syncing: 'Синхронизация...',
            emailAutoTitle: 'Email: автоматическая проверка',
            emailAutoDesc: 'Анализ метаданных и ссылок при открытии письма',
            labelBlocked: 'Заблокировано',
            labelWarned: 'Предупреждений'
        },
        KK: {
            subtitle: 'Кеңейтілген қорғаныс',
            dashboard: 'Басқару панелі',
            documents: 'Құжаттар',
            siteScan: 'Сайтты сканерлеу',
            dnsScan: 'DNS сканерлеу',
            aiScan: 'AI-сканерлеу',
            webScan: 'Веб-сканерлеу',
            cleanup: 'Тазалау',
            exit: 'Қауіпсіз шығу',
            paymentAnalysis: 'Төлемді талдау...',
            siteScanning: 'Сайтты тексеру...',
            aiScanning: 'ИИ-сканирлеу...',
            dnsScanning: 'DNS тексеру...',
            webScanning: 'ВЕБ-сканерлеуді бастау...',
            siteChecked: '✓ Сайт тексерілді - бәрі таза',
            foundSuspicious: '⚠️ {count} күдікті элемент табылды',
            failedScan: '❌ Бетті сканерлеу қатесі',
            dnsComplete: '✓ DNS тексеру аяқталды',
            dnsError: '❌ DNS тексеру қатесі',
            webComplete: '✓ ВЕБ-сканерлеу аяқталды',
            safePayment: '✓ Төлем қауіпсіз',
            riskPayment: '⚠️ Төлем тәуекелдері анықталды',
            upgradePlan: 'Жоспарды жаңарту',
            labelPlan: 'Жоспар:',
            labelDailyScans: 'Бүгінгі сканерлеу:',
            logout: 'Шығу',
            loginTitle: 'PhishGuard-қа кіру',
            loginSubtitle: 'AI-сканерлеу мен есептерді пайдалану үшін жүйеге кіріңіз',
            usernamePlaceholder: 'Пайдаланушы аты',
            passwordPlaceholder: 'Құпия сөз',
            loginBtn: 'Кіру',
            noAccount: 'Аккаунтыңыз жоқ па?',
            registerLink: 'Тіркелу',
            registerTitle: 'Тіркелу',
            optPublic: 'Жай пайдаланушы',
            optBusiness: 'Бизнес (Компания)',
            optGovernment: 'Мемлекет',
            createAccountBtn: 'Аккаунт жасау',
            hasAccount: 'Аккаунтыңыз бар ма?',
            loginLink: 'Кіру',
            syncing: 'Синхрондау...',
            emailAutoTitle: 'Email: автоматты түрде тексеру',
            emailAutoDesc: 'Хатты ашқанда метадеректер мен сілтемелерді талдау',
            labelBlocked: 'Блокталған',
            labelWarned: 'Ескертулер'
        }
    };

    function t(key, params = {}) {
        let text = translations[currentLang][key] || key;
        for (const p in params) {
            text = text.replace(`{${p}}`, params[p]);
        }
        return text;
    }

    function updateUIStrings() {
        if (langText) langText.textContent = currentLang;
        const sub = document.querySelector('.header .subtitle');
        if (sub) sub.textContent = t('subtitle');
        if (openDashboardBtn) openDashboardBtn.textContent = t('dashboard');
        if (openDocumentsBtn) openDocumentsBtn.textContent = t('documents');
        if (scanSecretsBtn) scanSecretsBtn.textContent = t('siteScan');
        if (checkDnsBtn) checkDnsBtn.textContent = t('dnsScan');
        if (aiScanBtn) aiScanBtn.textContent = t('aiScan');
        if (vulnScanBtn) vulnScanBtn.textContent = t('webScan');
        if (clearCacheBtn) clearCacheBtn.textContent = t('cleanup');
        if (paymentBackBtn) paymentBackBtn.textContent = t('exit');
        if (upgradePlanBtn) upgradePlanBtn.textContent = t('upgradePlan');

        // New elements
        const labelPlan = document.getElementById('label-plan');
        if (labelPlan) labelPlan.textContent = t('labelPlan');
        const labelDailyScans = document.getElementById('label-daily-scans');
        if (labelDailyScans) labelDailyScans.textContent = t('labelDailyScans');
        const logoutBtnText = document.getElementById('logout-btn');
        if (logoutBtnText) logoutBtnText.textContent = t('logout');

        const loginTitle = document.getElementById('login-title');
        if (loginTitle) loginTitle.textContent = t('loginTitle');
        const loginSubtitle = document.getElementById('login-subtitle');
        if (loginSubtitle) loginSubtitle.textContent = t('loginSubtitle');
        if (loginUsernameInput) loginUsernameInput.placeholder = t('usernamePlaceholder');
        if (loginPasswordInput) loginPasswordInput.placeholder = t('passwordPlaceholder');
        if (loginBtn) loginBtn.textContent = t('loginBtn');
        const noAccountText = document.getElementById('no-account-text');
        if (noAccountText) noAccountText.textContent = t('noAccount');
        if (showRegisterLink) showRegisterLink.textContent = t('registerLink');

        const registerTitle = document.getElementById('register-title');
        if (registerTitle) registerTitle.textContent = t('registerTitle');
        if (regUsernameInput) regUsernameInput.placeholder = t('usernamePlaceholder');
        if (regPasswordInput) regPasswordInput.placeholder = t('passwordPlaceholder');
        const optPublic = document.getElementById('opt-public');
        if (optPublic) optPublic.textContent = t('optPublic');
        const optBusiness = document.getElementById('opt-business');
        if (optBusiness) optBusiness.textContent = t('optBusiness');
        const optGovernment = document.getElementById('opt-government');
        if (optGovernment) optGovernment.textContent = t('optGovernment');
        if (doRegisterBtn) doRegisterBtn.textContent = t('createAccountBtn');
        const hasAccountText = document.getElementById('has-account-text');
        if (hasAccountText) hasAccountText.textContent = t('hasAccount');
        if (showLoginLink) showLoginLink.textContent = t('loginLink');

        const syncText = document.getElementById('sync-text');
        if (syncText) syncText.textContent = t('syncing');

        const emailAutoTitle = document.getElementById('email-auto-title');
        if (emailAutoTitle) emailAutoTitle.textContent = t('emailAutoTitle');
        const emailAutoDesc = document.getElementById('email-auto-desc');
        if (emailAutoDesc) emailAutoDesc.textContent = t('emailAutoDesc');

        const labelBlocked = document.getElementById('label-blocked');
        if (labelBlocked) labelBlocked.textContent = t('labelBlocked');
        const labelWarned = document.getElementById('label-warned');
        if (labelWarned) labelWarned.textContent = t('labelWarned');
    }

    function translateNiktoOutput(output) {
        if (!output) return '';
        let lines = output.split('\n');
        let filteredLines = [];
        let serverLine = '';

        lines.forEach(line => {
            const trimmed = line.trim();
            // Скрываем техническую информацию
            if (trimmed.startsWith('- Версия Nikto v') || trimmed.startsWith('- Nikto v')) return;
            if (trimmed.includes('-----------------------')) return;
            if (trimmed.includes('Scan terminated') || trimmed.includes('host(s) tested')) return;
            if (trimmed.includes('Host maximum execution time')) return;
            if (trimmed.includes('Время начала') || trimmed.includes('Время завершения')) return;
            if (trimmed.includes('Start Time') || trimmed.includes('End Time')) return;
            if (trimmed.includes('Root page') && trimmed.includes('redirects to')) return;

            // Буферизуем Server
            if (trimmed.includes('Server:') || trimmed.includes('Сервер:')) {
                serverLine = line;
                return;
            }

            // Переводы основных меток
            let res = line;
            if (currentLang === 'RU') {
                res = res.replace(/\+ Target IP:\s+/g, currentLang === 'KK' ? '+ Нысана IP: ' : '+ Целевой IP: ');
                res = res.replace(/\+ Target Hostname:\s+/g, currentLang === 'KK' ? '+ Хост: ' : '+ Хост: ');
                res = res.replace(/\+ Target Port:\s+/g, currentLang === 'KK' ? '+ Порт: ' : '+ Порт: ');
                res = res.replace(/\+ SSL Info:/g, currentLang === 'KK' ? '+ SSL инфо:' : '+ SSL инфо:');
            }

            // Обработка SSL подразделов (Subject, Altnames, Ciphers, Issuer)
            const sslLabels = ['Subject', 'Altnames', 'Ciphers', 'Issuer'];
            let isSslSubline = false;

            for (const label of sslLabels) {
                if (trimmed.includes(label + ':')) {
                    const colonIdx = line.indexOf(label + ':');
                    const val = line.substring(colonIdx + label.length + 1).trim();

                    let displayLabel = label;
                    if (currentLang === 'RU' || currentLang === 'KK') {
                        if (label === 'Subject') displayLabel = currentLang === 'KK' ? 'Субъект' : 'Субъект';
                        if (label === 'Altnames') displayLabel = currentLang === 'KK' ? 'Альт. атаулар' : 'Альт. имена';
                        if (label === 'Ciphers') displayLabel = currentLang === 'KK' ? 'Шифрлар' : 'Шифры';
                        if (label === 'Issuer') displayLabel = currentLang === 'KK' ? 'Шығарушы' : 'Издатель';
                    }

                    res = `${displayLabel}: ${val}`;
                    isSslSubline = true;
                    break;
                }
            }

            if (!isSslSubline) {
                // Если это заголовок SSL инфо без данных, пропускаем его
                if (trimmed.startsWith('+ SSL Info:') || trimmed.startsWith('+ SSL инфо:')) {
                    if (trimmed.includes('Subject:')) {
                        const subjIdx = trimmed.indexOf('Subject:');
                        const subjVal = trimmed.substring(subjIdx + 8).trim();
                        const disp = currentLang === 'RU' ? 'Субъект' : 'Subject';
                        res = `${disp}: ${subjVal}`;
                    } else {
                        return; // Пропускаем строку заголовок
                    }
                }
                res = res.trim();
            }

            if (res) filteredLines.push(res);
        });

        let finalLines = [];
        let portIdx = -1;
        filteredLines.forEach((line) => {
            finalLines.push(line);
            if (line.includes('Port:') || line.includes('Порт:')) {
                portIdx = finalLines.length;
            }
        });

        if (serverLine && portIdx !== -1) {
            let translatedServer = serverLine;
            if (currentLang === 'RU') {
                translatedServer = translatedServer.replace(/\+ Server:\s+/g, '+ Сервер: ');
            }
            finalLines.splice(portIdx, 0, translatedServer);

            // ОДИН пустой абзац ПЕРЕД результатами (Субъект)
            let sslIdx = -1;
            for (let i = 0; i < finalLines.length; i++) {
                if (finalLines[i].includes('Субъект:') || finalLines[i].includes('Subject:')) {
                    sslIdx = i;
                    break;
                }
            }
            if (sslIdx !== -1) {
                finalLines.splice(sslIdx, 0, '');
            }
        }

        return finalLines.join('\n').trim();
    }

    if (langSwitch) {
        langSwitch.addEventListener('click', async () => {
            if (currentLang === 'EN') {
                currentLang = 'RU';
            } else if (currentLang === 'RU') {
                currentLang = 'KK';
            } else {
                currentLang = 'EN';
            }
            await chrome.storage.local.set({ appLanguage: currentLang });
            updateUIStrings();
        });
    }

    // Load saved language
    chrome.storage.local.get(['appLanguage'], (res) => {
        if (res.appLanguage) {
            currentLang = res.appLanguage;
            updateUIStrings();
        }
    });

    // Email auto-check toggle
    const emailAutoToggle = document.getElementById('email-auto-toggle');
    const EMAIL_AUTO_KEY = 'emailAutoEnabled';
    const AUTH_TOKEN_KEY = 'auth_token';

    // Auth Elements
    const userProfileSection = document.getElementById('user-profile');
    const loginSection = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');
    const profileUsername = document.getElementById('profile-username');
    const profileRole = document.getElementById('profile-role');
    const profilePlan = document.getElementById('profile-plan');
    const dailyCount = document.getElementById('daily-count');
    const dailyLimit = document.getElementById('daily-limit');

    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');

    const regUsernameInput = document.getElementById('reg-username');
    const regPasswordInput = document.getElementById('reg-password');
    const regSectorSelect = document.getElementById('reg-sector');
    const doRegisterBtn = document.getElementById('do-register-btn');

    let currentTab = null;
    let currentUser = null;

    async function getApiBase() {
        return 'http://127.0.0.1:8002'; // Default for extension
    }

    async function updateAuthUI() {
        const token = (await chrome.storage.local.get([AUTH_TOKEN_KEY]))[AUTH_TOKEN_KEY];

        if (!token) {
            userProfileSection.style.display = 'none';
            loginSection.style.display = 'block';
            registerSection.style.display = 'none';
            mainContent.style.opacity = '0.3';
            mainContent.style.pointerEvents = 'none';
            // Не показываем ошибку здесь, чтобы не мешать входу
            errorDiv.style.display = 'none';
            return;
        }

        loginSection.style.display = 'none';
        registerSection.style.display = 'none';
        userProfileSection.style.display = 'block';
        mainContent.style.opacity = '1';
        mainContent.style.pointerEvents = 'auto';

        if (!currentUser) {
            await fetchUserProfile(token);
        }

        if (currentUser) {
            profileUsername.textContent = currentUser.username;
            if (profileRole) profileRole.textContent = currentUser.role_name || 'User';
            profilePlan.textContent = currentUser.plan_name || 'Free';
            dailyCount.textContent = currentUser.daily_scans_count || 0;
            // Limit mapping for UI (fallback if not in user object)
            const limits = { 'Free': '∞', 'Pro': '∞', 'Business': '∞', 'Gov': '∞' };
            dailyLimit.textContent = limits[currentUser.plan_name] || '∞';

            // Apply Role-Based Visibility
            applyRbacVisibility(currentUser.role_name);
        }
    }

    function applyRbacVisibility(role) {
        const isFree = role === 'User_Free';
        const isBusiness = role === 'Business';
        const isAdmin = role === 'admin_gov';

        // 0. Upgrade Button - Hide for Admin/Gov
        if (upgradePlanBtn) {
            upgradePlanBtn.style.display = isAdmin ? 'none' : 'block';
        }

        // 1. AI Scan - Visible for everyone
        if (aiScanBtn) {
            aiScanBtn.parentElement.style.display = (isFree || isBusiness || isAdmin) ? 'flex' : 'none';
            aiScanBtn.style.display = (isFree || isBusiness || isAdmin) ? 'block' : 'none';
        }

        // 2. Dashboard - Available for Business, Free, and Admin
        if (openDashboardBtn) {
            openDashboardBtn.style.display = (isFree || isBusiness || isAdmin) ? 'block' : 'none';
        }

        // 3. Documents - Available for Business and Admin
        if (openDocumentsBtn) {
            openDocumentsBtn.style.display = (isBusiness || isAdmin) ? 'block' : 'none';
        }

        // 4. Website Check (JS Scan) - Available for Business and Admin
        if (scanSecretsBtn) {
            scanSecretsBtn.style.display = (isBusiness || isAdmin) ? 'block' : 'none';
        }

        // 5. DNS Check - Available for Business and Admin (and Free as per original code)
        if (checkDnsBtn) {
            checkDnsBtn.style.display = (isFree || isBusiness || isAdmin) ? 'block' : 'none';
        }

        // 6. Vuln Scan - Available for Business and Admin
        if (vulnScanBtn) {
            vulnScanBtn.style.display = (isBusiness || isAdmin) ? 'block' : 'none';
        }

        // 7. Email Auto Check - Visible for everyone
        const emailAutoCard = document.getElementById('email-auto-card');
        if (emailAutoCard) {
            emailAutoCard.style.display = (isFree || isBusiness || isAdmin) ? 'block' : 'none';
        }

        // --- Hiding other tools for Business ---

        // SQL, Crawler, PHP, JS Dirbuster - ONLY for Admin
        if (sqlScanBtn) sqlScanBtn.style.display = isAdmin ? 'block' : 'none';
        if (crawlerScanBtn) crawlerScanBtn.style.display = isAdmin ? 'block' : 'none';
        if (phpScanBtn) phpScanBtn.style.display = isAdmin ? 'block' : 'none';
        if (jsdirbusterBtn) jsdirbusterBtn.style.display = isAdmin ? 'block' : 'none';

        // Clear Cache - Admin AND Business
        if (clearCacheBtn) clearCacheBtn.style.display = (isBusiness || isAdmin) ? 'block' : 'none';

        // Admin Panel - ONLY for Admin
        if (openAdminPanelBtn) openAdminPanelBtn.style.display = isAdmin ? 'block' : 'none';

        // Back to Safety (Payment) - Available for everyone
        if (paymentBackBtn) {
            paymentBackBtn.style.display = (isFree || isBusiness || isAdmin) ? 'block' : 'none';
        }

        // Handle parent containers of grouped buttons
        // Group: Dashboard, Documents
        if (openDashboardBtn && openDashboardBtn.parentElement) {
            const hasVisible = Array.from(openDashboardBtn.parentElement.children).some(child => child.style.display !== 'none');
            openDashboardBtn.parentElement.style.display = hasVisible ? 'flex' : 'none';
        }

        // Group: scanSecretsBtn, checkDnsBtn
        if (scanSecretsBtn && scanSecretsBtn.parentElement) {
            const hasVisible = Array.from(scanSecretsBtn.parentElement.children).some(child => child.style.display !== 'none');
            scanSecretsBtn.parentElement.style.display = hasVisible ? 'flex' : 'none';
        }

        // Group: AI Scan
        if (aiScanBtn && aiScanBtn.parentElement) {
            const hasVisible = Array.from(aiScanBtn.parentElement.children).some(child => child.style.display !== 'none');
            aiScanBtn.parentElement.style.display = hasVisible ? 'flex' : 'none';
        }

        // Group: vulnScanBtn, clearCacheBtn
        if (vulnScanBtn && vulnScanBtn.parentElement) {
            const hasVisible = Array.from(vulnScanBtn.parentElement.children).some(child => child.style.display !== 'none');
            vulnScanBtn.parentElement.style.display = hasVisible ? 'flex' : 'none';
        }

        // Group: Admin tools (SQL, Crawler, etc)
        if (sqlScanBtn && sqlScanBtn.parentElement) {
            const hasVisible = Array.from(sqlScanBtn.parentElement.children).some(child => child.style.display !== 'none');
            sqlScanBtn.parentElement.style.display = hasVisible ? 'flex' : 'none';
        }

        // Group: Back to safety
        if (paymentBackBtn && paymentBackBtn.parentElement) {
            const hasVisible = Array.from(paymentBackBtn.parentElement.children).some(child => child.style.display !== 'none');
            paymentBackBtn.parentElement.style.display = hasVisible ? 'flex' : 'none';
        }
    }

    async function fetchUserProfile(token) {
        try {
            const apiBase = await getApiBase();
            const resp = await fetch(`${apiBase}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                currentUser = await resp.json();
            } else if (resp.status === 401) {
                await logoutUser();
            }
        } catch (e) {
            console.error('Fetch profile error:', e);
        }
    }

    async function loginUser() {
        const username = loginUsernameInput.value;
        const password = loginPasswordInput.value;
        if (!username || !password) return;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Вход...';

        try {
            const apiBase = await getApiBase();
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const resp = await fetch(`${apiBase}/auth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            if (resp.ok) {
                const data = await resp.json();
                await chrome.storage.local.set({ [AUTH_TOKEN_KEY]: data.access_token });
                currentUser = null;
                await updateAuthUI();
                await loadStats(); // Refresh stats with new token
                if (currentTab && isAnalyzableUrl(currentTab.url)) {
                    await checkCurrentUrl(true); // Re-check current URL
                }
            } else {
                const err = await resp.json();
                showError('Ошибка входа: ' + (err.detail || 'Неверные данные'));
            }
        } catch (e) {
            showError('Ошибка сети: ' + e.message);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Войти';
        }
    }

    async function registerUser() {
        const username = regUsernameInput.value;
        const password = regPasswordInput.value;
        const sector = regSectorSelect.value;
        if (!username || !password) return;

        doRegisterBtn.disabled = true;
        doRegisterBtn.textContent = 'Создание...';

        try {
            const apiBase = await getApiBase();
            const resp = await fetch(`${apiBase}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, sector, email: `${username}@placeholder.com` })
            });

            if (resp.ok) {
                showSuccess('Аккаунт создан! Теперь войдите.');
                registerSection.style.display = 'none';
                loginSection.style.display = 'block';
            } else {
                const err = await resp.json();
                showError('Ошибка регистрации: ' + (err.detail || 'Попробуйте другое имя'));
            }
        } catch (e) {
            showError('Ошибка сети: ' + e.message);
        } finally {
            doRegisterBtn.disabled = false;
            doRegisterBtn.textContent = 'Создать аккаунт';
        }
    }

    async function logoutUser() {
        await chrome.storage.local.remove([AUTH_TOKEN_KEY]);
        currentUser = null;
        await updateAuthUI();
    }

    // Attach Auth Event Listeners
    if (loginBtn) loginBtn.addEventListener('click', loginUser);
    if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);
    if (showRegisterLink) showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginSection.style.display = 'none';
        registerSection.style.display = 'block';
    });
    if (showLoginLink) showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerSection.style.display = 'none';
        loginSection.style.display = 'block';
    });
    if (doRegisterBtn) doRegisterBtn.addEventListener('click', registerUser);

    // Initial Auth Check
    await updateAuthUI();
    function isAnalyzableUrl(url) {
        if (!url) return false;
        const lower = url.toLowerCase();
        const blockedSchemes = ['chrome://', 'edge://', 'about:', 'brave://', 'opera://'];
        if (blockedSchemes.some(p => lower.startsWith(p))) return false;
        if (lower.startsWith('chrome-extension://')) return false;
        return lower.startsWith('http://') || lower.startsWith('https://');
    }


    function showError(msg) {
        if (!errorDiv) return;
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        errorDiv.style.background = 'rgba(244, 67, 54, 0.2)';
        errorDiv.style.borderColor = '#f44336';
        errorDiv.style.color = '#ff8a80';

        // Автоматически скрываем через 5 секунд
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    function showSuccess(msg) {
        if (!errorDiv) return;
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        errorDiv.style.background = 'rgba(76, 175, 80, 0.2)';
        errorDiv.style.borderColor = '#4CAF50';
        errorDiv.style.color = '#a5d6a7';

        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
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

    if (upgradePlanBtn) {
        upgradePlanBtn.addEventListener('click', () => {
            // Аналогично Dashboard, пробуем сначала Streamlit
            try {
                chrome.tabs.create({ url: 'http://localhost:8501' });
            } catch (e) {
                const localDashboardUrl = chrome.runtime.getURL('dashboard.html');
                chrome.tabs.create({ url: localDashboardUrl });
            }
        });
    }

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

            const token = (await chrome.storage.local.get(['auth_token'])).auth_token;
            const resp = await fetch(`${base}/analyze_payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
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
                message: data.safe ? t('safePayment') : t('riskPayment')
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
        secretText.textContent = t('siteScanning');
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
            const token = (await chrome.storage.local.get(['auth_token'])).auth_token;
            const resp = await fetch(`${base}/v1/scan/secrets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ url: currentTab.url, use_pinkerton: true })
            });

            if (resp.status === 401) {
                secretScanStatus.style.display = 'none';
                updateAuthUI();
                return;
            }

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const total = data.total_findings || 0;
            const scripts = data.scanned_scripts || 0;
            const elements = data.scanned_elements || scripts || 0;
            const results = data.results || [];

            // Упрощенный результат для пользователя
            if (total > 0) {
                secretText.textContent = t('foundSuspicious', { count: total });
                secretDot.className = 'status-dot';
                secretDot.style.background = '#ffaa00';
                secretSummary.textContent = `На странице найдены подозрительные элементы. Рекомендуем быть осторожными и не вводить свои личные данные на этом сайте.`;
            } else {
                secretText.textContent = t('siteChecked');
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
            const errorMsg = e.message || e.toString();
            console.error('Secret scan error:', errorMsg);

            if (errorMsg.includes('401') || errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('status: 401')) {
                secretScanStatus.style.display = 'none';
                updateAuthUI();
                return;
            }

            secretText.textContent = t('failedScan');
            secretDot.className = 'status-dot inactive';
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
        aiText.textContent = t('aiScanning');
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

            const token = (await chrome.storage.local.get(['auth_token'])).auth_token;
            const resp = await fetch(`${base}/analyze_payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(payload)
            });

            if (resp.status === 401) {
                aiScanStatus.style.display = 'none';
                updateAuthUI();
                return;
            }

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
                statusText = '❓ UNKNOWN';
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
                detailsLines.push(`${provider === 'google' ? 'Google AI' : provider}`);
            }

            if (detailsLines.length === 0) {
                detailsLines.push('Детальный анализ недоступен');
            }

            aiDetails.textContent = detailsLines.join('\n');
        } catch (e) {
            const errorMsg = e.message || e.toString();
            console.error('AI scan error:', errorMsg);

            if (errorMsg.includes('401') || errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('status: 401')) {
                aiScanStatus.style.display = 'none';
                updateAuthUI();
                return;
            }

            aiText.textContent = '❌ Failed to scan site';
            aiDot.className = 'status-dot inactive';
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
        vulnText.textContent = t('webScanning');
        vulnDot.className = 'status-dot';
        vulnDot.style.background = '#666666';
        vulnDetails.textContent = '';
        try {
            const resp = await directApiCall('/v1/vuln/nikto', { url: currentTab.url });

            if (resp?.status && resp.status.startsWith('error:')) {
                vulnText.textContent = resp.status === 'error:not_installed' ? '⚠️ Nikto не установлен' : '⚠️ Ошибка сканирования';
                vulnDot.className = 'status-dot';
                vulnDot.style.background = '#ffaa00';
                vulnDetails.textContent = resp?.output || 'Неизвестная ошибка';
            } else {
                vulnText.textContent = t('webComplete');
                vulnDot.className = 'status-dot';
                vulnDot.style.background = '#4CAF50';
                vulnDot.classList.add('active');

                const outputRaw = resp?.output || 'No data.';
                const output = translateNiktoOutput(outputRaw);
                vulnDetails.textContent = output;
            }
        } catch (e) {
            const msg = e?.message || e.toString();
            console.error('Vuln scan error:', msg);

            if (msg.includes('401') || msg.includes('UNAUTHORIZED') || msg.includes('status: 401')) {
                vulnScanStatus.style.display = 'none';
                updateAuthUI();
                return;
            }

            vulnText.textContent = '❌ Error';
            vulnDot.className = 'status-dot inactive';
            vulnDetails.textContent = `Error: ${msg}`;
            showError(msg);
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
            dnsText.textContent = t('dnsScanning');
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
            dnsText.textContent = t('dnsComplete');
            dnsDot.className = 'status-dot';
            dnsDot.classList.add('active');
            dnsContent.style.display = 'block';

        } catch (e) {
            console.error('DNS check error:', e);
            dnsText.textContent = t('dnsError');
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

            // Auto-trigger AI scan for Free users or if requested
            if (currentUser && (currentUser.plan_name === 'Free' || currentUser.role_name === 'User_Free')) {
                console.log('Auto-triggering AI scan for Free user');
                // We use a small delay to let the basic UI update first
                setTimeout(() => {
                    if (aiScanBtn && isAnalyzableUrl(currentTab.url)) {
                        aiScanBtn.click();
                    }
                }, 500);
            }

        } catch (error) {
            console.error('Error checking URL:', error);

            const errorMsg = error.message || error.toString();

            // Если ошибка авторизации (401) - скрываем ошибку и переходим в режим логина
            if (errorMsg.includes('401') || errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('Сессия истекла')) {
                setStatus('', 'hidden');
                updateAuthUI();
                return;
            }

            setStatus('❌ Не удалось проверить страницу', 'error');
            // Проверяем, является ли ошибка проблемой подключения к локальному серверу
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
                if (statusCard) statusCard.style.display = 'block';
                break;
            case 'inactive':
            case 'blocked':
            case 'error':
                statusDot.classList.add('inactive');
                if (statusCard) statusCard.style.display = 'block';
                break;
            case 'warning':
                statusDot.style.background = '#ffaa00';
                if (statusCard) statusCard.style.display = 'block';
                break;
            case 'hidden':
                if (statusCard) statusCard.style.display = 'none';
                break;
            default:
                // Для loading и других состояний
                if (statusCard) statusCard.style.display = 'block';
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
            const token = (await chrome.storage.local.get(['auth_token'])).auth_token;
            const options = {
                method: data ? 'POST' : 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
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

            if (response.status === 401) {
                await logoutUser();
                throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
            }

            if (response.status === 402) {
                const err = await response.json();
                throw new Error(err.detail || 'Лимит сканирований исчерпан. Обновите план.');
            }

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Refresh profile/count after scans
            if (endpoint.includes('/check/url') || endpoint.includes('/ai/scan')) {
                setTimeout(updateAuthUI, 500);
            }

            return result;
        } catch (error) {
            console.error('Direct API call error:', error);
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('fetch failed')) {
                throw new Error('BACKEND_NOT_RUNNING');
            }
            throw error;
        }
    }

    async function initializePopup() {
        try {
            loadingDiv.style.display = 'none';

            // 1. Проверяем авторизацию
            const tokenResponse = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
            const token = tokenResponse[AUTH_TOKEN_KEY];
            await updateAuthUI();

            if (!token) {
                // Если нет токена, показываем только секцию входа (остальное будет прозрачным через updateAuthUI)
                mainContent.style.display = 'block';
                return;
            }

            // 2. Если авторизован, загружаем данные
            mainContent.style.display = 'block';
            await loadStats();

            // 3. Проверяем текущий URL
            if (!currentTab) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                currentTab = tabs[0];
            }

            if (currentTab && isAnalyzableUrl(currentTab.url)) {
                currentUrlDiv.textContent = currentTab.url;
                await checkCurrentUrl(false);
            }

        } catch (error) {
            console.error('Initialization error:', error);
            loadingDiv.style.display = 'none';
            mainContent.style.display = 'block';
            showError('Ошибка загрузки расширения. Убедитесь, что бэкенд запущен.');
        }
    }

    // Запускаем инициализацию
    initializePopup();

    // Обновляем статистику каждые 30 секунд
    setInterval(loadStats, 30000);
});
