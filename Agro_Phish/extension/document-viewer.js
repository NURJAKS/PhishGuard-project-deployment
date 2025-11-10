'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('content');
    const errorDiv = document.getElementById('error');
    const backBtn = document.getElementById('back-btn');
    
    // Получаем данные из URL параметров
    const urlParams = new URLSearchParams(window.location.search);
    const analysisId = urlParams.get('id');
    
    backBtn.addEventListener('click', () => {
        window.close();
    });
    
    async function loadAnalysis() {
        if (!analysisId) {
            showError('ID анализа не указан');
            return;
        }
        
        try {
            const candidates = ['http://localhost:8000', 'http://127.0.0.1:8000'];
            let base = candidates[0];
            for (const b of candidates) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 1000);
                    await fetch(`${b}/health`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    base = b;
                    break;
                } catch (_) {}
            }
            
            const resp = await fetch(`${base}/v1/document/analysis/${analysisId}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            
            const data = await resp.json();
            displayResults(data);
            
        } catch (error) {
            console.error('Error loading analysis:', error);
            showError('Не удалось загрузить результаты анализа. Попробуйте позже.');
        }
    }
    
    function displayResults(data) {
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';
        
        // Информация о документе
        const docInfo = document.getElementById('document-info');
        docInfo.innerHTML = `
            <div class="info-item">
                <div class="info-label">Имя файла</div>
                <div class="info-value">${data.filename || 'Неизвестно'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Тип файла</div>
                <div class="info-value">${data.file_type || 'Неизвестно'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Размер</div>
                <div class="info-value">${formatFileSize(data.file_size || 0)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Дата анализа</div>
                <div class="info-value">${new Date(data.analyzed_at || Date.now()).toLocaleString('ru-RU')}</div>
            </div>
        `;
        
        // Оценка риска
        const riskAssessment = document.getElementById('risk-assessment');
        const risk = (data.risk || 'LOW').toUpperCase();
        const riskClass = risk === 'HIGH' ? 'risk-high' : (risk === 'MEDIUM' ? 'risk-medium' : 'risk-low');
        const riskText = risk === 'HIGH' ? 'ВЫСОКИЙ РИСК' : (risk === 'MEDIUM' ? 'СРЕДНИЙ РИСК' : 'НИЗКИЙ РИСК');
        
        let riskHtml = `<div style="margin-bottom:15px;">
            <span style="font-size:20px; font-weight:700;">Уровень риска:</span>
            <span class="risk-badge ${riskClass}">${riskText}</span>
        </div>`;
        
        if (data.phishing_analysis) {
            if (data.phishing_analysis.is_phishing) {
                riskHtml += `<div class="phishing-warning">
                    <h3>🚨 Обнаружены признаки фишинга!</h3>
                    <p>В документе найдены подозрительные элементы, которые могут указывать на мошенничество:</p>
                    <ul>
                        ${(data.phishing_analysis.reasons || []).map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>`;
            } else {
                riskHtml += `<div class="safe-message">
                    ✓ Документ не содержит явных признаков фишинга или социальной инженерии
                </div>`;
            }
        }
        
        riskAssessment.innerHTML = riskHtml;
        
        // Извлеченные данные
        const extractedData = document.getElementById('extracted-data');
        if (data.extracted_data && Object.keys(data.extracted_data).length > 0) {
            let extractedHtml = '';
            const fields = {
                'bank_name': 'Название банка',
                'account_number': 'Номер счета',
                'card_number': 'Номер карты',
                'contract_number': 'Номер договора',
                'amount': 'Сумма',
                'date': 'Дата',
                'client_name': 'Имя клиента',
                'iban': 'IBAN',
                'bik': 'БИК',
                'inn': 'ИНН',
                'phone': 'Телефон',
                'email': 'Email'
            };
            
            for (const [key, value] of Object.entries(data.extracted_data)) {
                const label = fields[key] || key;
                extractedHtml += `
                    <div class="extracted-data-item">
                        <div class="extracted-data-label">${label}</div>
                        <div class="extracted-data-value">${value}</div>
                    </div>
                `;
            }
            
            extractedData.innerHTML = extractedHtml;
        } else {
            extractedData.innerHTML = '<div style="opacity:0.7; padding:20px; text-align:center;">Банковские данные не найдены в документе</div>';
        }
        
        // Предварительный просмотр текста
        const textPreview = document.getElementById('text-preview');
        if (data.text_content) {
            const preview = data.text_content.length > 2000 
                ? data.text_content.substring(0, 2000) + '...\n\n[Текст обрезан для предварительного просмотра]'
                : data.text_content;
            textPreview.textContent = preview;
        } else {
            textPreview.textContent = 'Текст документа недоступен';
        }
    }
    
    function showError(message) {
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = message;
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // Загружаем анализ при загрузке страницы
    loadAnalysis();
});

