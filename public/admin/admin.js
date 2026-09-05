'use strict';

const state = { page: 1, limit: 10, search: '', status: 'all', messages: [], selected: null, token: sessionStorage.getItem('adminToken') || '' };
const $ = id => document.getElementById(id);

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function formatDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(); }

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { state.token = ''; sessionStorage.removeItem('adminToken'); showLogin(); }
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

function showLogin() { $('loginScreen')?.classList.remove('hidden'); $('dashboard')?.classList.add('hidden'); }
function showDashboard(user) { $('loginScreen')?.classList.add('hidden'); $('dashboard')?.classList.remove('hidden'); if ($('adminEmail')) $('adminEmail').textContent = user?.email || ''; loadOverview(); }

$('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('loginEmail')?.value.trim() || '';
  const password = $('loginPassword')?.value || '';
  if ($('loginError')) $('loginError').textContent = 'Signing in...';
  try {
    const data = await api('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email, password }) });
    state.token = data.token;
    sessionStorage.setItem('adminToken', state.token);
    $('loginForm')?.reset();
    if ($('loginError')) $('loginError').textContent = '';
    showDashboard(data.user);
  } catch (error) { if ($('loginError')) $('loginError').textContent = error.message; }
});

async function checkSession() { if (!state.token) return showLogin(); try { const data = await api('/api/admin/me'); showDashboard(data.user); } catch { showLogin(); } }

function switchPage(page) {
  const overview = page === 'overview';
  $('overviewPage')?.classList.toggle('hidden', !overview);
  $('messagesPage')?.classList.toggle('hidden', overview);
  if ($('pageTitle')) $('pageTitle').textContent = overview ? 'Overview' : 'Messages';
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (overview) loadOverview(); else loadMessages();
}

document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
$('viewMessages')?.addEventListener('click', () => switchPage('messages'));
$('refreshButton')?.addEventListener('click', () => switchPage($('messagesPage')?.classList.contains('hidden') ? 'overview' : 'messages'));

async function loadOverview() {
  try {
    const { stats } = await api('/api/admin/stats');
    $('totalMessages').textContent = stats.total;
    $('unreadMessages').textContent = stats.unread;
    $('readMessages').textContent = stats.read;
    $('recentMessages').textContent = stats.recent;
    renderChart(stats.daily || []);
    const recent = await api('/api/admin/messages?page=1&limit=5');
    state.messages = recent.messages || [];
    renderRecent(state.messages);
  } catch (e) { if ($('recentMessages')) $('recentMessages').innerHTML = `<p>${escapeHtml(e.message)}</p>`; }
}

function renderChart(daily) {
  const map = Object.fromEntries(daily.map(x => [x._id, x.count]));
  const days = [];
  for (let i=6;i>=0;i--) { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i); const key = d.toISOString().slice(0,10); days.push({ label:d.toLocaleDateString([], {weekday:'short'}), count:map[key]||0 }); }
  const max = Math.max(...days.map(x => x.count), 1);
  if ($('chart')) $('chart').innerHTML = days.map(d => `<div class="chart-item"><div class="bar-area"><div class="bar" style="height:${d.count?Math.max(8,d.count/max*100):2}%"></div></div><div class="chart-label">${escapeHtml(d.label)}</div></div>`).join('');
}

function renderRecent(messages) {
  const el = $('recentMessages'); if (!el) return;
  if (!messages.length) { el.innerHTML = '<p>No messages yet.</p>'; return; }
  el.innerHTML = messages.map(m => `<div class="recent" data-id="${escapeHtml(m._id)}"><div><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(String(m.message).slice(0,100))}${String(m.message).length>100?'…':''}</small></div><span class="status status-${escapeHtml(m.status)}">${escapeHtml(m.status)}</span></div>`).join('');
  el.querySelectorAll('.recent').forEach(x => x.addEventListener('click', () => openMessage(x.dataset.id)));
}

async function loadMessages() {
  const params = new URLSearchParams({ page:String(state.page), limit:String(state.limit), q:state.search, status:state.status });
  try {
    const data = await api(`/api/admin/messages?${params}`);
    state.messages = data.messages || [];
    renderMessages(state.messages);
    $('paginationText').textContent = `${data.pagination.total} messages`;
    $('prevButton').disabled = data.pagination.page <= 1;
    $('nextButton').disabled = data.pagination.page >= data.pagination.pages;
  } catch (e) { $('messagesTable').innerHTML = `<tr><td colspan="6">${escapeHtml(e.message)}</td></tr>`; }
}

function renderMessages(messages) {
  if (!messages.length) { $('messagesTable').innerHTML = '<tr><td colspan="6">No messages found.</td></tr>'; return; }
  $('messagesTable').innerHTML = messages.map(m => `<tr><td><strong>${escapeHtml(m.name)}</strong></td><td><a class="email" href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td><td class="message-preview">${escapeHtml(m.message)}</td><td><span class="status status-${escapeHtml(m.status)}">${escapeHtml(m.status)}</span></td><td>${escapeHtml(formatDate(m.createdAt))}</td><td><button class="secondary view-message" data-id="${escapeHtml(m._id)}">View</button></td></tr>`).join('');
  $('messagesTable').querySelectorAll('.view-message').forEach(b => b.addEventListener('click', () => openMessage(b.dataset.id)));
}

$('searchInput')?.addEventListener('input', () => { clearTimeout(window.searchTimer); window.searchTimer=setTimeout(() => { state.search=$('searchInput').value.trim(); state.page=1; loadMessages(); },300); });
$('statusFilter')?.addEventListener('change', () => { state.status=$('statusFilter').value; state.page=1; loadMessages(); });
$('prevButton')?.addEventListener('click', () => { if (state.page>1) { state.page--; loadMessages(); } });
$('nextButton')?.addEventListener('click', () => { state.page++; loadMessages(); });

function openMessage(id) {
  const m = state.messages.find(x => x._id === id); if (!m) return; state.selected = m;
  $('modalName').textContent=m.name; $('modalEmail').textContent=m.email; $('modalEmail').href=`mailto:${m.email}`; $('modalDate').textContent=formatDate(m.createdAt); $('modalMessage').textContent=m.message;
  $('readButton').style.display = m.status==='read' ? 'none' : ''; $('archiveButton').style.display = m.status==='archived' ? 'none' : ''; $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); state.selected=null; }
$('closeModal')?.addEventListener('click', closeModal);
$('modal')?.addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

async function updateStatus(status) { if (!state.selected) return; try { await api(`/api/admin/messages/${state.selected._id}/status`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); closeModal(); await loadMessages(); await loadOverview(); } catch(e) { alert(e.message); } }
$('readButton')?.addEventListener('click', () => updateStatus('read'));
$('archiveButton')?.addEventListener('click', () => updateStatus('archived'));
$('deleteButton')?.addEventListener('click', async () => { if (!state.selected || !confirm('Delete this message permanently?')) return; try { await api(`/api/admin/messages/${state.selected._id}`, {method:'DELETE'}); closeModal(); await loadMessages(); await loadOverview(); } catch(e) { alert(e.message); } });

$('logoutButton')?.addEventListener('click', async () => { try { await api('/api/admin/logout',{method:'POST'}); } catch {} state.token=''; sessionStorage.removeItem('adminToken'); showLogin(); });

checkSession();
