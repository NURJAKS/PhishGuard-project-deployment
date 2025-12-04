'use strict';

const API_BASE_URL = 'http://localhost:8002';

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('tbody');
  const statTotal = document.getElementById('stat-total');
  const statAllow = document.getElementById('stat-allow');
  const statWarn = document.getElementById('stat-warn');
  const statBlock = document.getElementById('stat-block');
  const barAllow = document.getElementById('bar-allow');
  const barWarn = document.getElementById('bar-warn');
  const barBlock = document.getElementById('bar-block');
  const refreshBtn = document.getElementById('refresh');
  const searchInput = document.getElementById('search');
  const actionFilter = document.getElementById('actionFilter');
  const details = document.getElementById('details');
  const detailsContent = document.getElementById('detailsContent');
  const apiUrlSpan = document.getElementById('api-url');
  const trendChartCanvas = document.getElementById('trendChart');

  // Функция для установки правильных размеров canvas
  function setupCanvas(canvas) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // Canvas еще не отрендерен
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  // Инициализация размеров canvas при загрузке
  function initCanvas() {
    if (trendChartCanvas) {
      setupCanvas(trendChartCanvas);
    }
  }

  // Вызываем инициализацию после небольшой задержки для гарантии рендеринга
  setTimeout(initCanvas, 200);

  // Обновление размеров при изменении размера окна
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      initCanvas();
      // Перерисовываем график после изменения размера
      if (incidentsCache.length > 0) {
        drawTrendChart(incidentsCache);
      }
    }, 250);
  });

  apiUrlSpan.textContent = `API: ${API_BASE_URL}`;

  function tag(action) {
    const map = { allow: 'allow', warn: 'warn', block: 'block' };
    const cls = map[action] || 'allow';
    return `<span class="tag tag-${cls}"><span class="status-dot dot-${cls}"></span>${action.toUpperCase()}</span>`;
  }

  function pct(n, total) {
    if (!total) return 0;
    return Math.round((n / total) * 100);
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = await res.json();
      const total = s.total_incidents || 0;
      statTotal.textContent = total;
      statAllow.textContent = s.allowed || 0;
      statWarn.textContent = s.warned || 0;
      statBlock.textContent = s.blocked || 0;
      barAllow.style.width = pct(s.allowed || 0, total) + '%';
      barWarn.style.width = pct(s.warned || 0, total) + '%';
      barBlock.style.width = pct(s.blocked || 0, total) + '%';
    } catch (e) {
      console.error('stats error', e);
    }
  }

  let incidentsCache = [];

  function drawTrendChart(list) {
    if (!trendChartCanvas) return;
    
    // Убеждаемся, что canvas правильно инициализирован
    setupCanvas(trendChartCanvas);
    
    const ctx = trendChartCanvas.getContext('2d');
    const rect = trendChartCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    
    if (w === 0 || h === 0) {
      console.warn('Canvas not ready, skipping draw');
      return;
    }
    
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, trendChartCanvas.width, trendChartCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    
    const padding = 40;
    const paddingBottom = 35;
    const paddingTop = 20;
    const usableHeight = h - paddingTop - paddingBottom;
    const usableWidth = w - padding * 2;
    
    // Подготовим 24 точки (последние 24 часа)
    const now = Date.now();
    const hours = Array.from({ length: 24 }, (_, i) => new Date(now - (23 - i) * 3600 * 1000));
    const series = {
      allow: new Array(24).fill(0),
      warn: new Array(24).fill(0),
      block: new Array(24).fill(0)
    };
    list.forEach(it => {
      if (!it.timestamp) return;
      const t = new Date(it.timestamp).getTime();
      const diffH = Math.floor((now - t) / 3600_000);
      if (diffH >= 0 && diffH < 24) {
        const idx = 23 - diffH;
        const a = (it.action || '').toLowerCase();
        if (a === 'allow' || a === 'warn' || a === 'block') {
          series[a][idx]++;
        }
      }
    });
    
    // Улучшенное масштабирование - добавляем небольшой отступ сверху для лучшей визуализации
    const maxVal = Math.max(1, ...series.allow, ...series.warn, ...series.block);
    const scaleMax = maxVal > 0 ? maxVal * 1.15 : 1; // Добавляем 15% отступа сверху
    
    // Рисуем сетку на фоне
    ctx.strokeStyle = '#1e1f3a';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = paddingTop + (usableHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
    }
    
    // Оси
    ctx.strokeStyle = '#2a2c55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, h - paddingBottom);
    ctx.lineTo(w - padding, h - paddingBottom);
    ctx.moveTo(padding, paddingTop);
    ctx.lineTo(padding, h - paddingBottom);
    ctx.stroke();
    
    // Функция для рисования линии с заливкой и точками
    function drawLineWithFill(data, color, lineColor) {
      const stepX = usableWidth / (data.length - 1 || 1);
      const points = [];
      
      // Собираем точки
      data.forEach((v, i) => {
        const x = padding + i * stepX;
        const y = h - paddingBottom - (v / scaleMax) * usableHeight;
        points.push({ x, y, value: v });
      });
      
      // Рисуем заливку под линией (градиент)
      if (points.length > 0) {
        const gradient = ctx.createLinearGradient(0, paddingTop, 0, h - paddingBottom);
        gradient.addColorStop(0, color + '40'); // 25% прозрачности
        gradient.addColorStop(1, color + '00'); // 0% прозрачности
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, h - paddingBottom);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, h - paddingBottom);
        ctx.closePath();
        ctx.fill();
      }
      
      // Рисуем линию
      ctx.strokeStyle = lineColor || color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      
      // Рисуем точки на линии
      ctx.fillStyle = lineColor || color;
      points.forEach(p => {
        if (p.value > 0) { // Рисуем точки только там, где есть данные
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
          // Внешний круг для лучшей видимости
          ctx.strokeStyle = '#0f1020';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
    
    // Рисуем линии с заливкой
    drawLineWithFill(series.allow, '#2ecc71', '#2ecc71');
    drawLineWithFill(series.warn, '#f39c12', '#f39c12');
    drawLineWithFill(series.block, '#e74c3c', '#e74c3c');
    
    // Подписи по X (каждые 6 часов)
    ctx.fillStyle = '#9fb7ff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const stepX = usableWidth / (hours.length - 1 || 1);
    hours.forEach((d, i) => {
      if (i % 6 === 0 || i === hours.length - 1) {
        const x = padding + i * stepX;
        ctx.fillText(d.getHours().toString().padStart(2, '0'), x, h - paddingBottom + 18);
      }
    });
    
    // Подписи по Y (максимальное значение)
    if (maxVal > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#6b7a9f';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(Math.ceil(scaleMax).toString(), padding - 8, paddingTop + 12);
      ctx.fillText('0', padding - 8, h - paddingBottom + 4);
    }
    
    ctx.restore();
  }

  function applyFilters(list) {
    const q = (searchInput.value || '').toLowerCase().trim();
    const act = (actionFilter.value || '').toLowerCase();
    return list.filter(it => {
      let ok = true;
      if (q) ok = ok && (it.url || '').toLowerCase().includes(q);
      if (act) ok = ok && (it.action || '').toLowerCase() === act;
      return ok;
    });
  }

  function renderTable(list) {
    tbody.innerHTML = '';
    list.forEach(it => {
      const tr = document.createElement('tr');
      const ts = it.timestamp ? new Date(it.timestamp).toLocaleString() : '-';
      const score = typeof it.score === 'number' ? `${Math.round(it.score * 100)}%` : '-';
      const urlShort = it.url && it.url.length > 80 ? it.url.slice(0, 77) + '…' : (it.url || '-');
      const rowCls = (it.action || '').toLowerCase();
      if (rowCls === 'allow' || rowCls === 'warn' || rowCls === 'block') {
        tr.classList.add(`row-${rowCls}`);
      }
      tr.innerHTML = `
        <td>${ts}</td>
        <td title="${it.url || ''}"><a href="${it.url || '#'}" target="_blank" rel="noopener">${urlShort}</a></td>
        <td>${tag(it.action || 'allow')}</td>
        <td>${score}</td>
        <td class="muted">${it.reason || ''}</td>
      `;
      tr.addEventListener('click', () => {
        detailsContent.innerHTML = `
          <div class="label">URL</div>
          <div style="word-break:break-all; margin-bottom:8px;">${it.url || ''}</div>
          <div class="label">Действие</div>
          <div style="margin-bottom:8px;">${(it.action || '').toUpperCase()}</div>
          <div class="label">Уверенность</div>
          <div style="margin-bottom:8px;">${score}</div>
          <div class="label">Причина</div>
          <div style="margin-bottom:8px;">${it.reason || ''}</div>
          <div class="label">Время</div>
          <div style="margin-bottom:8px;">${ts}</div>
          <div class="label">Incident ID</div>
          <div style="margin-bottom:8px;">${it.id ?? '-'}</div>
        `;
      });
      tbody.appendChild(tr);
    });
  }

  async function loadIncidents() {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents?limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      incidentsCache = await res.json();
      renderTable(applyFilters(incidentsCache));
      // Рисуем график после загрузки данных
      setTimeout(() => {
        initCanvas();
        drawTrendChart(incidentsCache);
      }, 100);
    } catch (e) {
      console.error('incidents error', e);
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Не удалось загрузить данные. Убедитесь, что backend запущен.</td></tr>`;
    }
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadIncidents()]);
    // Обновляем размеры canvas перед перерисовкой
    initCanvas();
    // Рисуем график тренда
    drawTrendChart(incidentsCache);
  }

  refreshBtn.addEventListener('click', refreshAll);
  searchInput.addEventListener('input', () => renderTable(applyFilters(incidentsCache)));
  actionFilter.addEventListener('change', () => renderTable(applyFilters(incidentsCache)));
  // Streamlit отделён; локальный dashboard работает автономно

  refreshAll();
});
