const API = window.ADMIN_API_URL || window.location.origin;
let adminKey = sessionStorage.getItem('admin_key');
let users = [], complaints = [], orgs = [], orgMembers = {}, stats = null, system = null;

function $(s, p) { return (p || document).querySelector(s); }
function $$(s, p) { return [...(p || document).querySelectorAll(s)]; }

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

function render() {
  if (!adminKey) return renderKeyPrompt();
  renderDashboard();
}

function renderKeyPrompt() {
  document.title = 'Admin Console — Hisab Pata';
  $('#app').innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <h1>🔐 Admin Console</h1>
        <p>Hisab Pata — enter admin key to continue</p>
        <label>Admin Key</label>
        <input id="keyInput" type="password" placeholder="Enter admin key..." autocomplete="off">
        <button onclick="setKey()">Access Dashboard</button>
        <div class="login-error" id="keyErr"></div>
      </div>
    </div>`;
  $('#keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') setKey(); });
  $('#keyInput').focus();
}

async function setKey() {
  const k = $('#keyInput').value.trim();
  if (!k) return;
  const btn = $('#keyInput + button');
  const err = $('#keyErr');
  btn.disabled = true;
  btn.textContent = 'Validating...';
  err.textContent = '';
  adminKey = k;
  try {
    const res = await fetch(API + '/api/admin/users', {
      headers: { 'x-admin-key': k }
    });
    if (!res.ok) {
      err.textContent = 'Invalid admin key';
      btn.disabled = false;
      btn.textContent = 'Access Dashboard';
      adminKey = null;
      return;
    }
    sessionStorage.setItem('admin_key', k);
    render();
  } catch (e) {
    err.textContent = 'Server unreachable. Check connection.';
    btn.disabled = false;
    btn.textContent = 'Access Dashboard';
    adminKey = null;
  }
}

function logout() {
  adminKey = null;
  sessionStorage.removeItem('admin_key');
  render();
}

async function loadData() {
  const results = await Promise.allSettled([
    api('GET', '/api/admin/users').then(d => users = d).catch(e => { console.error(e); users = []; }),
    api('GET', '/api/admin/complaints').then(d => complaints = d).catch(e => { console.error(e); complaints = []; }),
    api('GET', '/api/admin/orgs').then(d => orgs = d).catch(e => { console.error(e); orgs = []; }),
    api('GET', '/api/admin/stats').then(d => stats = d).catch(e => { console.error(e); stats = null; }),
    api('GET', '/api/admin/system').then(d => system = d).catch(e => { console.error(e); system = null; }),
  ]);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function renderDashboard() {
  document.title = 'Dashboard — Admin Console';
  loadData().then(() => {
    const openCount = complaints.filter(c => c.status === 'open').length;
    $('#app').innerHTML = `
      <div class="dashboard">
        <aside class="sidebar">
          <div class="brand">Hisab Pata <small>Admin Console</small></div>
          <nav>
            <a class="active" data-tab="users"><span>👥</span><span>Users</span><span class="badge">${users.length}</span></a>
            <a data-tab="orgs"><span>🏢</span><span>Orgs</span><span class="badge">${orgs.length}</span></a>
            <a data-tab="complaints"><span>📋</span><span>Complaints</span><span class="badge">${openCount}</span></a>
            <a data-tab="analytics"><span>📊</span><span>Analytics</span></a>
            <a data-tab="system"><span>⚙️</span><span>System</span></a>
          </nav>
          <div class="logout"><a onclick="logout()"><span>🚪</span><span> Sign Out</span></a></div>
        </aside>
        <div class="main" id="mainContent"></div>
      </div>`;
    $$('.sidebar nav a').forEach(a => a.addEventListener('click', () => {
      $$('.sidebar nav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      showTab(a.dataset.tab);
    }));
    showTab('users');
  });
}

function showTab(tab) {
  if (tab === 'users') renderUsers();
  else if (tab === 'orgs') renderOrgs();
  else if (tab === 'complaints') renderComplaints();
  else if (tab === 'analytics') renderAnalytics();
  else if (tab === 'system') renderSystem();
}

// ─── USERS TAB ─────────────────────────────────────────────
function renderUsers() {
  const main = $('#mainContent');
  main.innerHTML = `
    <header><h2>Users</h2><p>${users.length} registered users</p></header>
    <div class="stats">
      <div class="stat-card"><div class="label">Total Users</div><div class="value">${users.length}</div></div>
      <div class="stat-card"><div class="label">Admins</div><div class="value">${users.filter(u=>u.isAdmin).length}</div></div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Admin</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td><div class="user-cell"><div class="avatar">${(u.name||'?')[0].toUpperCase()}</div><span class="name">${esc(u.name)}</span></div></td>
          <td>${esc(u.email||'-')}</td>
          <td>${esc(u.phoneNumber||'-')}</td>
          <td>${u.isAdmin?'<span class="badge-admin">Admin</span>':'<span class="text-muted">—</span>'}</td>
          <td class="text-muted">${new Date(u.createdAt).toLocaleDateString()}</td>
          <td><button class="btn-danger btn-sm" onclick="deleteUser('${u.id}','${esc(u.name)}')">Delete</button></td>
        </tr>`).join('')}</tbody></table>
    </div>`;
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"?\n\nThis will permanently delete the user, their personal org, and all their transactions. This cannot be undone.`)) return;
  if (!confirm(`⚠️ ARE YOU SURE?\n\nAll data for "${name}" will be lost forever.`)) return;
  try {
    await api('DELETE', `/api/admin/users/${id}`);
    users = users.filter(u => u.id !== id);
    renderUsers();
  } catch (e) { alert('Failed: ' + e.message); }
}

// ─── ORGS TAB ──────────────────────────────────────────────
async function loadOrgMembers(orgId) {
  if (orgMembers[orgId]) return;
  try {
    orgMembers[orgId] = await api('GET', `/api/admin/orgs/${orgId}/members`);
  } catch (e) { orgMembers[orgId] = []; }
}

function renderOrgs() {
  const main = $('#mainContent');
  main.innerHTML = `
    <header><h2>Organizations</h2><p>${orgs.length} organizations (${orgs.filter(o=>!o.isPersonal).length} group, ${orgs.filter(o=>o.isPersonal).length} personal)</p></header>
    <div class="table-wrap">
      <table><thead><tr><th>Name</th><th>Type</th><th>Members</th><th>Books</th><th>Approval</th><th>Admins</th><th>Created</th></tr></thead>
      <tbody>${orgs.map(o => `
        <tr class="org-row" onclick="toggleOrgMembers('${o.id}', this)">
          <td><strong>${esc(o.name)}</strong></td>
          <td>${o.isPersonal?'<span class="badge-personal">Personal</span>':'<span class="badge-group">Group</span>'}</td>
          <td>${o.memberCount}</td>
          <td>${o.bookCount}</td>
          <td><span class="badge-policy ${o.approvalPolicy}">${o.approvalPolicy.replace(/_/g,' ')}</span></td>
          <td>${o.admins.map(a => esc(a.name)).join(', ')||'—'}</td>
          <td class="text-muted">${new Date(o.createdAt).toLocaleDateString()}</td>
        </tr>
        <tr class="members-row" id="members-${o.id}" style="display:none">
          <td colspan="7"><div class="members-container"><div class="members-loading">Loading members...</div></div></td>
        </tr>`).join('')}</tbody></table>
    </div>`;
}

async function toggleOrgMembers(orgId, row) {
  const membersRow = document.getElementById('members-' + orgId);
  if (!membersRow) return;
  const isHidden = membersRow.style.display === 'none';
  membersRow.style.display = isHidden ? 'table-row' : 'none';
  if (isHidden) {
    const container = membersRow.querySelector('.members-container');
    await loadOrgMembers(orgId);
    const members = orgMembers[orgId] || [];
    container.innerHTML = members.length === 0
      ? '<div class="text-muted">No members</div>'
      : `<table class="members-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead>
          <tbody>${members.map(m => `
            <tr>
              <td><div class="user-cell"><div class="avatar sm">${(m.user.name||'?')[0].toUpperCase()}</div><span class="name">${esc(m.user.name)}</span></div></td>
              <td>${esc(m.user.email||'-')}</td>
              <td>${esc(m.user.phoneNumber||'-')}</td>
              <td><span class="badge-role ${m.role}">${m.role}</span></td>
              <td><span class="badge-status ${m.status}">${m.status}</span></td>
              <td class="text-muted">${(m.permissions||[]).join(', ')||'—'}</td>
              <td>${m.role !== 'admin' ? `<button class="btn-danger btn-sm" onclick="removeMember('${orgId}','${m.id}','${esc(m.user.name)}')">Remove</button>` : '<span class="text-muted">—</span>'}</td>
            </tr>`).join('')}</tbody></table>`;
  }
}

async function removeMember(orgId, memberId, name) {
  if (!confirm(`Remove member "${name}" from org?\n\nThis cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/admin/orgs/${orgId}/members/${memberId}`);
    orgMembers[orgId] = (orgMembers[orgId] || []).filter(m => m.id !== memberId);
    const membersRow = document.getElementById('members-' + orgId);
    if (membersRow) {
      const container = membersRow.querySelector('.members-container');
      const members = orgMembers[orgId] || [];
      container.innerHTML = members.length === 0
        ? '<div class="text-muted">No members</div>'
        : container.innerHTML; // simple re-render by re-toggling
      // Re-render the members table
      const row = document.querySelector(`[onclick*="toggleOrgMembers('${orgId}'"]`);
      if (membersRow.style.display !== 'none') {
        membersRow.style.display = 'none';
        toggleOrgMembers(orgId, row);
      }
    }
    // Update org list count
    const org = orgs.find(o => o.id === orgId);
    if (org) org.memberCount = Math.max(0, org.memberCount - 1);
    renderOrgs();
  } catch (e) { alert('Failed: ' + e.message); }
}

// ─── COMPLAINTS TAB ────────────────────────────────────────
function renderComplaints() {
  const main = $('#mainContent');
  const byStatus = s => complaints.filter(c => c.status === s);
  main.innerHTML = `
    <header><h2>Complaints</h2><p>${complaints.length} total · ${byStatus('open').length} open</p></header>
    <div class="stats">
      <div class="stat-card"><div class="label">Open</div><div class="value" style="color:#d97706">${byStatus('open').length}</div></div>
      <div class="stat-card"><div class="label">Resolved</div><div class="value" style="color:#059669">${byStatus('resolved').length}</div></div>
      <div class="stat-card"><div class="label">Closed</div><div class="value">${byStatus('closed').length}</div></div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>User</th><th>Subject</th><th>Priority</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${complaints.map(c => `
        <tr id="c-${c.id}">
          <td><div class="user-cell"><div class="avatar">${(c.user?.name||'?')[0].toUpperCase()}</div><span class="name">${esc(c.user?.name||'Unknown')}</span></div></td>
          <td><strong>${esc(c.subject)}</strong>${c.category?`<br><span class="text-muted">${esc(c.category)}</span>`:''}</td>
          <td><span class="badge-priority ${c.priority}">${c.priority}</span></td>
          <td><span class="badge-status ${c.status}">${c.status}</span></td>
          <td class="text-muted">${new Date(c.createdAt).toLocaleDateString()}</td>
          <td>
            <div class="actions" id="actions-${c.id}">
              <select onchange="updateComplaint('${c.id}','status',this.value)">
                <option value="open" ${c.status==='open'?'selected':''}>Open</option>
                <option value="resolved" ${c.status==='resolved'?'selected':''}>Resolved</option>
                <option value="closed" ${c.status==='closed'?'selected':''}>Closed</option>
              </select>
              <select onchange="updateComplaint('${c.id}','priority',this.value)">
                <option value="low" ${c.priority==='low'?'selected':''}>Low</option>
                <option value="medium" ${c.priority==='medium'?'selected':''}>Medium</option>
                <option value="high" ${c.priority==='high'?'selected':''}>High</option>
              </select>
              ${c.response?`<br><div class="text-muted" style="margin:4px 0">Response: ${esc(c.response)}</div>`:''}
              <textarea placeholder="Write response..." id="resp-${c.id}">${c.response||''}</textarea>
              <button onclick="updateComplaint('${c.id}','response',document.getElementById('resp-${c.id}').value)">Save Response</button>
            </div>
          </td>
        </tr>`).join('')}</tbody></table>
    </div>`;
}

async function updateComplaint(id, field, value) {
  try {
    await api('PUT', `/api/admin/complaints/${id}`, { [field]: value });
    await loadData();
    renderComplaints();
  } catch (e) { alert('Failed: ' + e.message); }
}

// ─── ANALYTICS TAB ─────────────────────────────────────────
function renderAnalytics() {
  const main = $('#mainContent');
  if (!stats) {
    main.innerHTML = '<header><h2>Analytics</h2><p class="text-muted">Failed to load analytics data.</p></header>';
    return;
  }
  const netFlow = stats.totalIncome - stats.totalExpense;
  main.innerHTML = `
    <header><h2>Analytics</h2><p>System-wide aggregate statistics</p></header>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">👥 Total Users</div><div class="value">${stats.totalUsers}</div></div>
      <div class="stat-card"><div class="label">🏢 Total Orgs</div><div class="value">${stats.totalOrganizations} <small class="text-muted">(${stats.groupOrgs} group, ${stats.personalOrgs} personal)</small></div></div>
      <div class="stat-card"><div class="label">📚 Total Books</div><div class="value">${stats.totalBooks}</div></div>
      <div class="stat-card"><div class="label">📝 Total Transactions</div><div class="value">${stats.totalTransactions}</div></div>
      <div class="stat-card"><div class="label">💰 Total Expense (approved)</div><div class="value">${Number(stats.totalExpense).toLocaleString()} ৳</div></div>
      <div class="stat-card"><div class="label">💵 Total Income (approved)</div><div class="value">${Number(stats.totalIncome).toLocaleString()} ৳</div></div>
      <div class="stat-card"><div class="label">📊 Net Flow</div><div class="value" style="color:${netFlow >= 0 ? '#059669' : '#dc2626'}">${netFlow >= 0 ? '+' : ''}${Number(netFlow).toLocaleString()} ৳</div></div>
      <div class="stat-card"><div class="label">✅ Active Members</div><div class="value">${stats.activeMembers}</div></div>
      <div class="stat-card"><div class="label">⏳ Pending Members</div><div class="value">${stats.pendingMembers}</div></div>
    </div>`;
}

// ─── SYSTEM TAB ────────────────────────────────────────────
function renderSystem() {
  const main = $('#mainContent');
  if (!system) {
    main.innerHTML = '<header><h2>System Status</h2><p class="text-muted">Failed to load system info.</p></header>';
    return;
  }
  const uptimeStr = formatUptime(system.uptime);
  main.innerHTML = `
    <header><h2>System Status</h2><p>Server health and information</p></header>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Status</div><div class="value"><span class="badge-status ${system.status}">${system.status}</span></div></div>
      <div class="stat-card"><div class="label">Database</div><div class="value"><span class="badge-status ${system.database === 'connected' ? 'active' : 'error'}">${system.database}</span></div></div>
      <div class="stat-card"><div class="label">Node Version</div><div class="value">${system.nodeVersion}</div></div>
      <div class="stat-card"><div class="label">Platform</div><div class="value">${system.platform}</div></div>
      <div class="stat-card"><div class="label">Environment</div><div class="value">${system.env}</div></div>
      <div class="stat-card"><div class="label">Uptime</div><div class="value">${uptimeStr}</div></div>
      <div class="stat-card"><div class="label">Memory RSS</div><div class="value">${system.memory.rss} MB</div></div>
      <div class="stat-card"><div class="label">Heap Used</div><div class="value">${system.memory.heapUsed} MB / ${system.memory.heapTotal} MB</div></div>
      <div class="stat-card"><div class="label">Last Updated</div><div class="value" style="font-size:0.85rem">${new Date(system.timestamp).toLocaleString()}</div></div>
    </div>
    <div class="danger-zone">
      <h3>⚠️ Danger Zone</h3>
      <p>These actions are irreversible. Use with extreme caution.</p>
      <button class="btn-danger" onclick="resetDatabase()">🗑️ Reset Database (Delete All Data)</button>
    </div>`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0) parts.push(h + 'h');
  if (m > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

async function resetDatabase() {
  if (!confirm('⚠️ DANGER: This will delete ALL data in the database!\n\nUsers, organizations, transactions, books, complaints — everything will be permanently deleted. The seed account will be recreated on restart.')) return;
  if (!confirm('🚨 FINAL WARNING: Are you absolutely sure? There is no undo.')) return;
  try {
    await api('POST', '/api/admin/reset');
    alert('Database reset complete! The system will recreate the seed account on next restart. Refreshing data...');
    await loadData();
    renderDashboard();
  } catch (e) { alert('Failed: ' + e.message); }
}

render();
