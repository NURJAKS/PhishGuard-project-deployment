function q(id) { return document.getElementById(id); }

function fmtTs(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch (_) { return String(ts || ''); }
}

function setList(el, items) {
  if (!el) return;
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) {
    el.innerHTML = '<li class="muted">—</li>';
    return;
  }
  el.innerHTML = arr.slice(0, 10).map(x => `<li>${escapeHtml(String(x))}</li>`).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadReport() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || 'latest';

  const stored = await chrome.storage.local.get(['emailLastReport', 'emailReports', 'emailReportsOrder']);
  let report = null;

  if (id === 'latest') {
    report = stored.emailLastReport || null;
  } else {
    report = (stored.emailReports && stored.emailReports[id]) ? stored.emailReports[id] : null;
  }

  if (!report) {
    q('riskLine').textContent = 'Оценка доверия письма: —';
    q('summary').textContent = 'Отчёт не найден. Откройте письмо в Gmail/Outlook при включенной автопроверке.';
    return;
  }

  const palette = { Low: '#94A3B8', Medium: '#F59E0B', High: '#9A3412' };
  const risk = report.risk_level || 'Medium';
  const score = report.risk_score ?? 0;

  q('riskDot').style.background = palette[risk] || palette.Medium;
  q('riskLine').textContent = `Оценка доверия письма: ${risk === 'Low' ? 'Низкий' : (risk === 'Medium' ? 'Средний' : 'Высокий')} риск (${score}%)`;
  q('ts').textContent = fmtTs(report.ts);
  q('platform').textContent = report.platform || '—';
  q('summary').textContent = report.summary || '—';

  setList(q('reasons'), report.reasons);
  setList(q('recs'), report.recommendations);
}

loadReport().catch((e) => {
  console.warn('Email report load error:', e);
  q('summary').textContent = 'Не удалось загрузить отчёт. Откройте письмо заново или повторите позже.';
});


