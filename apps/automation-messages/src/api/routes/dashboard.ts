import { FastifyInstance } from 'fastify';

export function createDashboardRoute() {
  return async function (fastify: FastifyInstance) {
    fastify.get('/', async (_req, reply) => {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(HTML);
    });
  };
}

const HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>לוח בקרה — אוטומציה Profix</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; color: #1a1a2e; min-height: 100vh; }

  header {
    background: #006d43;
    color: white;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  }
  header h1 { font-size: 1.3rem; font-weight: 800; }
  header .subtitle { font-size: 0.8rem; opacity: 0.75; margin-top: 2px; }
  .refresh-btn {
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.35);
    color: white;
    padding: 8px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: background 0.2s;
  }
  .refresh-btn:hover { background: rgba(255,255,255,0.3); }
  .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .container { max-width: 1000px; margin: 0 auto; padding: 28px 20px; }

  /* Status bar */
  .status-bar {
    border-radius: 14px;
    padding: 18px 22px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
    border: 1px solid;
  }
  .status-bar.ok { background: #f0fdf4; border-color: #86efac; }
  .status-bar.error { background: #fff1f2; border-color: #fca5a5; }
  .status-icon { font-size: 1.8rem; flex-shrink: 0; }
  .status-text h2 { font-size: 1.05rem; font-weight: 700; }
  .status-text.ok h2 { color: #15803d; }
  .status-text.error h2 { color: #b91c1c; }
  .status-text p { font-size: 0.82rem; margin-top: 3px; }
  .status-text.ok p { color: #16a34a; }
  .status-text.error p { color: #dc2626; }
  .status-time { margin-right: auto; font-size: 0.78rem; color: #9ca3af; white-space: nowrap; }

  /* KPI grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .kpi-card {
    background: white;
    border-radius: 14px;
    padding: 20px 22px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  }
  .kpi-icon { font-size: 1.6rem; margin-bottom: 10px; }
  .kpi-label { font-size: 0.78rem; color: #9ca3af; margin-bottom: 4px; }
  .kpi-value { font-size: 1.9rem; font-weight: 900; color: #111827; direction: ltr; text-align: right; }
  .kpi-sub { font-size: 0.75rem; margin-top: 4px; }

  /* Card */
  .card {
    background: white;
    border-radius: 14px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    margin-bottom: 20px;
    overflow: hidden;
  }
  .card-header {
    padding: 16px 20px;
    border-bottom: 1px solid #f3f4f6;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .card-header h3 { font-size: 0.95rem; font-weight: 700; color: #374151; }
  .card-header .badge {
    margin-right: auto;
    background: #f3f4f6;
    color: #6b7280;
    font-size: 0.72rem;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 600;
  }
  .card-body { padding: 16px 20px; }

  /* Queue stats */
  .queue-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
  .queue-stat-row { display: flex; gap: 8px; justify-content: space-around; padding: 8px 0; }
  .queue-stat { text-align: center; flex: 1; }
  .queue-stat .val { font-size: 1.6rem; font-weight: 900; }
  .queue-stat .lbl { font-size: 0.72rem; color: #9ca3af; margin-top: 2px; }
  .val.yellow { color: #d97706; }
  .val.blue { color: #2563eb; }
  .val.green { color: #16a34a; }
  .val.red { color: #dc2626; }

  /* Alert */
  .alert {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: 14px;
    padding: 18px 22px;
    margin-bottom: 20px;
  }
  .alert h3 { font-size: 0.95rem; font-weight: 700; color: #c2410c; margin-bottom: 10px; }
  .alert-item {
    background: white;
    border: 1px solid #fed7aa;
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .alert-item .name { font-weight: 600; font-size: 0.88rem; }
  .alert-item .tag { font-size: 0.78rem; color: #ea580c; font-weight: 600; }
  .alert-note { font-size: 0.75rem; color: #ea580c; margin-top: 8px; }

  /* Conversations */
  .conv-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 8px;
    border-radius: 10px;
    transition: background 0.15s;
  }
  .conv-row:hover { background: #f9fafb; }
  .conv-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: #dcfce7; color: #006d43; font-weight: 800; font-size: 0.75rem;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .conv-main { flex: 1; min-width: 0; }
  .conv-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .conv-name { font-weight: 600; font-size: 0.88rem; }
  .conv-store { font-size: 0.75rem; color: #9ca3af; }
  .conv-msg { font-size: 0.76rem; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; }
  .conv-time { font-size: 0.72rem; color: #9ca3af; white-space: nowrap; margin-top: 3px; flex-shrink: 0; }
  .badge-status { font-size: 0.7rem; padding: 2px 9px; border-radius: 20px; font-weight: 600; margin-right: auto; }
  .badge-new { background: #dcfce7; color: #15803d; }
  .badge-open { background: #dbeafe; color: #1d4ed8; }
  .badge-closed { background: #f3f4f6; color: #6b7280; }

  .empty { text-align: center; color: #9ca3af; padding: 24px; font-size: 0.85rem; }
  .loading { display: flex; align-items: center; justify-content: center; padding: 60px; }
  .spinner { width: 36px; height: 36px; border: 3px solid #e5e7eb; border-top-color: #006d43; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .last-refresh { text-align: center; color: #d1d5db; font-size: 0.72rem; padding-bottom: 30px; }
</style>
</head>
<body>

<header>
  <div>
    <h1>🤖 לוח בקרה — אוטומציה</h1>
    <div class="subtitle">Profix · מצב מערכת בזמן אמת</div>
  </div>
  <button class="refresh-btn" id="refreshBtn" onclick="loadData(true)">🔄 רענן</button>
</header>

<div class="container">
  <div id="root"><div class="loading"><div class="spinner"></div></div></div>
  <div class="last-refresh" id="lastRefresh"></div>
</div>

<script>
const API = '/api/status';

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'כרגע';
  if (m < 60) return 'לפני ' + m + ' דק\\'';
  const h = Math.floor(m / 60);
  if (h < 24) return 'לפני ' + h + ' שע\\'';
  return 'לפני ' + Math.floor(h / 24) + ' ימים';
}

function formatUptime(s) {
  if (s < 60) return s + ' שניות';
  if (s < 3600) return Math.floor(s / 60) + ' דקות';
  if (s < 86400) return Math.floor(s / 3600) + ' שעות';
  return Math.floor(s / 86400) + ' ימים';
}

function statusBadge(s) {
  const map = { new: ['badge-new','חדש'], open: ['badge-open','פתוח'], closed: ['badge-closed','סגור'] };
  const [cls, lbl] = map[s] || ['badge-closed', s];
  return '<span class="badge-status ' + cls + '">' + lbl + '</span>';
}

function render(d) {
  const ok = d.status === 'ok';
  let html = '';

  // Status bar
  html += '<div class="status-bar ' + (ok ? 'ok' : 'error') + '">';
  html += '<div class="status-icon">' + (ok ? '✅' : '❌') + '</div>';
  html += '<div class="status-text ' + (ok ? 'ok' : 'error') + '">';
  html += '<h2>' + (ok ? 'האוטומציה פעילה ותקינה' : 'האוטומציה לא מגיבה') + '</h2>';
  if (ok) html += '<p>זמן פעולה רצוף: ' + formatUptime(d.uptime) + '</p>';
  html += '</div>';
  html += '<div class="status-time">' + new Date(d.timestamp).toLocaleTimeString('he-IL') + '</div>';
  html += '</div>';

  // KPI
  const totalFailed = d.queues.sync.failed + d.queues.reply.failed;
  html += '<div class="kpi-grid">';
  html += kpi('🏪', 'חנויות פעילות', d.stores.active + ' / ' + d.stores.total,
    d.stores.needs_reauth > 0 ? '⚠️ ' + d.stores.needs_reauth + ' דורשות כניסה' : 'הכל תקין',
    d.stores.needs_reauth > 0 ? '#ea580c' : '#16a34a');
  html += kpi('💬', 'שיחות סה"כ', d.conversations.total,
    d.conversations.updated_24h + ' פעילות ב-24 שע\\'', '#6b7280');
  html += kpi('📥', 'הודעות סונכרנו', d.messages.synced_24h, 'ב-24 השעות האחרונות', '#6b7280');
  html += kpi('⚡', 'תורי עבודה פעילים', d.queues.sync.active + d.queues.reply.active,
    totalFailed > 0 ? totalFailed + ' נכשלו' : 'אין כשלונות',
    totalFailed > 0 ? '#dc2626' : '#16a34a');
  html += '</div>';

  // Queues
  html += '<div class="queue-grid">';
  html += '<div class="card"><div class="card-header"><span>📋</span><h3>תור סנכרון שיחות</h3></div><div class="card-body"><div class="queue-stat-row">';
  html += queueStat(d.queues.sync.waiting, 'ממתין', 'yellow');
  html += queueStat(d.queues.sync.active, 'פעיל', 'blue');
  html += queueStat(d.queues.sync.completed, 'הושלם', 'green');
  html += queueStat(d.queues.sync.failed, 'נכשל', 'red');
  html += '</div></div></div>';
  html += '<div class="card"><div class="card-header"><span>📤</span><h3>תור שליחת תגובות</h3></div><div class="card-body"><div class="queue-stat-row">';
  html += queueStat(d.queues.reply.waiting, 'ממתין', 'yellow');
  html += queueStat(d.queues.reply.active, 'פעיל', 'blue');
  html += queueStat(d.queues.reply.failed, 'נכשל', 'red');
  html += '</div></div></div>';
  html += '</div>';

  // Needs reauth alert
  if (d.stores.needs_reauth > 0) {
    html += '<div class="alert"><h3>⚠️ חנויות שדורשות כניסה מחדש ל-Etsy (' + d.stores.needs_reauth + ')</h3>';
    d.stores.needs_reauth_list.forEach(s => {
      html += '<div class="alert-item"><span class="name">חנות ' + s.store_number + (s.store_name ? ' — ' + s.store_name : '') + '</span><span class="tag">נדרשת התחברות</span></div>';
    });
    html += '<p class="alert-note">פתח AdsPower עבור הפרופיל של כל חנות, היכנס ל-Etsy, וחדש את הסנכרון</p>';
    html += '</div>';
  }

  // Recent conversations
  html += '<div class="card"><div class="card-header"><span>🕐</span><h3>פעילות אחרונה — שיחות</h3><span class="badge">' + d.conversations.new_count + ' חדשות</span></div><div class="card-body">';
  if (!d.conversations.recent.length) {
    html += '<div class="empty">אין שיחות עדיין</div>';
  } else {
    d.conversations.recent.forEach(c => {
      html += '<div class="conv-row">';
      html += '<div class="conv-avatar">' + c.store_number + '</div>';
      html += '<div class="conv-main">';
      html += '<div class="conv-top"><span class="conv-name">' + (c.customer_name || 'לקוח') + '</span>';
      if (c.store_name) html += '<span class="conv-store">· ' + c.store_name + '</span>';
      html += statusBadge(c.status);
      html += '</div>';
      if (c.last_message_text) html += '<div class="conv-msg">' + escHtml(c.last_message_text) + '</div>';
      html += '</div>';
      html += '<div class="conv-time">' + timeAgo(c.updated_at) + '</div>';
      html += '</div>';
    });
  }
  html += '</div></div>';

  document.getElementById('root').innerHTML = html;
}

function kpi(icon, label, value, sub, subColor) {
  return '<div class="kpi-card"><div class="kpi-icon">' + icon + '</div>' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-value">' + value + '</div>' +
    '<div class="kpi-sub" style="color:' + subColor + '">' + sub + '</div>' +
    '</div>';
}

function queueStat(val, lbl, color) {
  return '<div class="queue-stat"><div class="val ' + color + '">' + val + '</div><div class="lbl">' + lbl + '</div></div>';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadData(manual) {
  const btn = document.getElementById('refreshBtn');
  if (manual) { btn.disabled = true; btn.textContent = '⏳ טוען...'; }
  try {
    const res = await fetch(API + '?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    render(d);
    const now = new Date().toLocaleTimeString('he-IL');
    document.getElementById('lastRefresh').textContent = 'עודכן בשעה ' + now + ' · מתרענן אוטומטית כל 30 שניות';
  } catch(e) {
    document.getElementById('root').innerHTML =
      '<div class="status-bar error" style="margin:0">' +
      '<div class="status-icon">❌</div>' +
      '<div class="status-text error"><h2>שגיאת חיבור</h2><p>' + e.message + '</p></div></div>';
  } finally {
    if (manual) { btn.disabled = false; btn.textContent = '🔄 רענן'; }
  }
}

loadData(false);
setInterval(() => loadData(false), 30000);
</script>
</body>
</html>`;
