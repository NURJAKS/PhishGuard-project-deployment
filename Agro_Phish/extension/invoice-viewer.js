'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const resultDiv = document.getElementById('result');
    const backBtn = document.getElementById('back-btn');
    
    backBtn.addEventListener('click', () => {
        window.close();
    });
    
    // Получаем данные файла из URL параметров или storage
    const urlParams = new URLSearchParams(window.location.search);
    const fileData = urlParams.get('file');
    
    // Если файл передан через storage (для больших файлов)
    let file = null;
    
    if (fileData) {
        // Файл передан через URL (base64 или blob URL)
        try {
            // Пробуем получить из storage
            const stored = await chrome.storage.local.get(['invoice_file_data', 'invoice_file_name']);
            if (stored.invoice_file_data && stored.invoice_file_name) {
                // Конвертируем base64 обратно в File
                const byteCharacters = atob(stored.invoice_file_data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                file = new File([byteArray], stored.invoice_file_name, { type: stored.invoice_file_type || 'application/octet-stream' });
                
                // Очищаем storage
                chrome.storage.local.remove(['invoice_file_data', 'invoice_file_name', 'invoice_file_type']);
            }
        } catch (e) {
            console.error('Error loading file from storage:', e);
        }
    }
    
    // Если файл не найден, показываем ошибку
    if (!file) {
        showError('Файл не найден. Пожалуйста, попробуйте загрузить файл снова.');
        return;
    }
    
    // Загружаем и проверяем файл
    await verifyInvoice(file);
    
    async function verifyInvoice(file) {
        try {
            // Проверяем тип файла
            const fileName = file.name.toLowerCase();
            const validExtensions = ['.pdf', '.xml', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'];
            const isValid = validExtensions.some(ext => fileName.endsWith(ext));
            
            if (!isValid) {
                showError('Поддерживаются только файлы PDF, XML, JPG, PNG, DOC, DOCX, XLS, XLSX');
                return;
            }
            
            // Проверяем размер файла
            if (file.size > 10 * 1024 * 1024) {
                showError('Размер файла не должен превышать 10MB');
                return;
            }
            
            // Отправляем файл на сервер
            const formData = new FormData();
            formData.append('file', file);
            
            const candidates = ['http://localhost:8002', 'http://127.0.0.1:8002'];
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
            
            const resp = await fetch(`${base}/v1/invoice/verify`, {
                method: 'POST',
                body: formData
            });
            
            if (!resp.ok) {
                let errorDetail = `HTTP ${resp.status}`;
                try {
                    const errorData = await resp.json();
                    errorDetail = errorData.detail || errorData.message || errorDetail;
                } catch (e) {
                    // Если не удалось распарсить JSON, используем текст ответа
                    try {
                        const text = await resp.text();
                        if (text) errorDetail = text.substring(0, 200);
                    } catch (e2) {
                        // Игнорируем ошибку парсинга
                    }
                }
                throw new Error(errorDetail);
            }
            
            const result = await resp.json();
            displayResults(result);
            
        } catch (error) {
            console.error('Error verifying invoice:', error);
            let errorMessage = 'Не удалось проверить счёт-фактуру. ';
            
            if (error.message) {
                errorMessage += error.message;
            } else {
                errorMessage += String(error);
            }
            
            errorMessage += '\n\nПроверьте:\n';
            errorMessage += '1. Подключение к интернету\n';
            errorMessage += '2. Backend сервер запущен (http://localhost:8002)\n';
            errorMessage += '3. Формат файла поддерживается (PDF, XML, DOC, DOCX, XLS, XLSX)';
            
            showError(errorMessage);
        }
    }
    
    function showError(message) {
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = message;
    }
    
    function displayResults(result) {
        loadingDiv.style.display = 'none';
        resultDiv.style.display = 'block';
        
        const statusEmoji = result.status === 'accepted' ? '✅' : result.status === 'suspicious' ? '⚠️' : '❌';
        const statusText = result.status === 'accepted' ? 'Принят' : result.status === 'suspicious' ? 'Подозрительно' : 'Отклонён';
        const statusColor = result.status === 'accepted' ? '#4CAF50' : result.status === 'suspicious' ? '#ff9800' : '#f44336';
        
        let html = `
            <div class="result-card">
                <div class="status-header">
                    <div class="status-badge" style="color: ${statusColor};">
                        ${statusEmoji} ${statusText}
                    </div>
                </div>
                
                <div class="score" style="color: ${statusColor};">
                    ${result.score}/100
                </div>
        `;
        
        // Реквизиты
        if (result.invoice) {
            html += `
                <div class="invoice-details">
                    <div class="section-title">Реквизиты счёта-фактуры</div>
            `;
            
            if (result.invoice.number) {
                html += `<div class="detail-row"><span class="detail-label">Номер:</span><span class="detail-value">${result.invoice.number}</span></div>`;
            }
            if (result.invoice.issue_date) {
                html += `<div class="detail-row"><span class="detail-label">Дата выдачи:</span><span class="detail-value">${result.invoice.issue_date}</span></div>`;
            }
            if (result.invoice.total_amount) {
                html += `<div class="detail-row"><span class="detail-label">Сумма:</span><span class="detail-value">${result.invoice.total_amount.toLocaleString('ru-RU')} ₽</span></div>`;
            }
            if (result.invoice.seller) {
                if (result.invoice.seller.name) {
                    html += `<div class="detail-row"><span class="detail-label">Продавец:</span><span class="detail-value">${result.invoice.seller.name}</span></div>`;
                }
                if (result.invoice.seller.inn) {
                    html += `<div class="detail-row"><span class="detail-label">ИНН продавца:</span><span class="detail-value">${result.invoice.seller.inn}</span></div>`;
                }
                if (result.invoice.seller.kpp) {
                    html += `<div class="detail-row"><span class="detail-label">КПП продавца:</span><span class="detail-value">${result.invoice.seller.kpp}</span></div>`;
                }
            }
            
            html += `</div>`;
        }
        
        // Проверки
        if (result.checks && result.checks.length > 0) {
            html += `
                <div class="checks-list">
                    <div class="section-title">Результаты проверок</div>
            `;
            
            result.checks.forEach(check => {
                const checkClass = check.ok ? 'ok' : 'fail';
                const checkIcon = check.ok ? '✓' : '✗';
                html += `
                    <div class="check-item ${checkClass}">
                        <span class="check-name">${checkIcon} ${check.name}</span>
                    </div>
                `;
            });
            
            html += `</div>`;
        }
        
        // Причины
        if (result.reasons && result.reasons.length > 0) {
            html += `
                <div class="reasons-list">
                    <div class="section-title" style="color: #ffcccc;">Причины</div>
                    <ul>
                        ${result.reasons.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        // Рекомендации
        if (result.recommendations && result.recommendations.length > 0) {
            html += `
                <div class="recommendations-list">
                    <div class="section-title" style="color: #ffd700;">Рекомендации</div>
                    <ul>
                        ${result.recommendations.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        html += `</div>`;
        
        resultDiv.innerHTML = html;
    }
});

