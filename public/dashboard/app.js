'use strict';

// Admin dashboard: plain JS, consumes the /auth and /admin routes of the gateway
const state = { token: null, user: null, apps: [], appId: null };
const STATUSES = ['pending', 'transmitted', 'delivered', 'failed', 'cancelled'];

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (value) => (value ? new Date(value).toLocaleString('fr-FR') : '—');
const badge = (status) => `<span class="badge ${esc(status)}">${esc(status)}</span>`;
const isRoot = () => state.user?.role === 'ROOT';

function storage(action, value) {
  try {
    if (action === 'get') return sessionStorage.getItem('sms-gateway-token');
    if (action === 'set') sessionStorage.setItem('sms-gateway-token', value);
    if (action === 'clear') sessionStorage.removeItem('sms-gateway-token');
  } catch {
    return null;
  }
}

function toast(message, type = 'success') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 4500);
}

async function api(method, path, body, { idempotent = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && path !== '/auth/login') {
    logout(false);
    throw new Error('Session expirée, veuillez vous reconnecter');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data ? `${data.code} — ${data.message}` : `HTTP ${res.status}`);
  return data;
}

// Wraps an async handler: errors become toasts
const guarded = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (error) {
    toast(error.message, 'error');
  }
};

// ---------- Session ----------

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const data = await api('POST', '/auth/login', { email: form.get('email'), password: form.get('password') });
  state.token = data.token;
  storage('set', data.token);
  await start();
}

async function logout(callApi = true) {
  if (callApi && state.token) await api('POST', '/auth/logout').catch(() => undefined);
  state.token = null;
  state.user = null;
  storage('clear');
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
}

async function start() {
  state.user = await api('GET', '/auth/me');
  await loadApps();
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#user-email').textContent = state.user.email;
  $('#user-role').textContent = isRoot() ? 'Administrateur root' : "Administrateur d'application";
  renderNav();
  if (!location.hash) location.hash = isRoot() ? '#overview' : '#sms';
  else route();
}

async function loadApps() {
  state.apps = await api('GET', '/admin/applications');
  if (!state.apps.some((a) => a.id === state.appId)) state.appId = state.apps[0]?.id ?? null;
  $('#app-select').innerHTML = state.apps
    .map((a) => `<option value="${esc(a.id)}" ${a.id === state.appId ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`)
    .join('');
}

// ---------- Routing ----------

const pages = {
  overview: { title: "Vue d'ensemble", root: true, render: renderOverview },
  applications: { title: 'Applications', root: true, render: renderApplications },
  users: { title: 'Administrateurs', root: true, render: renderUsers },
  sms: { title: 'SMS', perApp: true, render: renderSms },
  campaigns: { title: 'Campagnes', perApp: true, render: renderCampaigns },
  send: { title: 'Envoyer un test', perApp: true, render: renderSend },
};

function renderNav() {
  $('#nav').innerHTML = Object.entries(pages)
    .filter(([, page]) => !page.root || isRoot())
    .map(([key, page]) => `<a href="#${key}" data-page="${key}">${page.title}</a>`)
    .join('');
}

const route = guarded(async () => {
  if (!state.user) return;
  const key = location.hash.slice(1).split('?')[0];
  const page = pages[key] && (!pages[key].root || isRoot()) ? key : isRoot() ? 'overview' : 'sms';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  $('#page-title').textContent = pages[page].title;
  $('#app-picker').hidden = !pages[page].perApp;
  const content = $('#content');
  if (pages[page].perApp && !state.appId) {
    content.innerHTML = '<div class="card muted">Aucune application ne vous est attribuée.</div>';
    return;
  }
  content.innerHTML = '<div class="card muted">Chargement…</div>';
  await pages[page].render(content);
});

// ---------- Overview (root) ----------

async function renderOverview(content, range = {}) {
  const query = new URLSearchParams();
  if (range.from) query.set('from', new Date(range.from).toISOString());
  if (range.to) query.set('to', new Date(range.to).toISOString());
  const stats = await api('GET', `/admin/stats?${query}`);
  const byStatus = Object.fromEntries(stats.byStatus.map((s) => [s.status, s.count]));
  const bars = (rows, label) => {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.length
      ? rows.map((r) => `<div class="bar-row"><span>${esc(r[label])}</span><div class="bar" style="width:${(r.count / max) * 100}%"></div><strong>${r.count}</strong></div>`).join('')
      : '<p class="muted">Aucun SMS sur la période.</p>';
  };

  content.innerHTML = `
    <form id="range" class="card form-grid">
      <label>Du<input type="datetime-local" name="from" value="${esc(range.from ?? '')}"></label>
      <label>Au<input type="datetime-local" name="to" value="${esc(range.to ?? '')}"></label>
      <div><button class="primary">Filtrer</button> <span class="muted">Par défaut : aujourd'hui (GMT+1)</span></div>
    </form>
    <div class="grid">
      <div class="stat"><div class="muted">Total</div><div class="value">${stats.total}</div></div>
      ${STATUSES.map((s) => `<div class="stat"><div>${badge(s)}</div><div class="value">${byStatus[s] ?? 0}</div></div>`).join('')}
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="card"><h3>Par application</h3>
        <div class="table-wrap"><table><thead><tr><th>Application</th><th>SMS</th><th>Segments</th></tr></thead><tbody>
        ${stats.byApplication.map((r) => `<tr><td>${esc(r.code)}</td><td>${r.count}</td><td>${r.segments}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">—</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card"><h3>Par opérateur</h3>${bars(stats.byOperator, 'operator')}</div>
    </div>`;
  $('#range').onsubmit = guarded(async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await renderOverview(content, { from: form.get('from'), to: form.get('to') });
  });
}

// ---------- Applications (root) ----------

async function renderApplications(content, created) {
  await loadApps();
  content.innerHTML = `
    ${created ? `<div class="notice"><strong>Application ${esc(created.code)} créée.</strong> Conservez ces secrets, ils ne seront plus affichés :<br>
      API key : <code>${esc(created.apiKey)}</code>${created.webhookSecret ? `<br>Secret webhook : <code>${esc(created.webhookSecret)}</code>` : ''}</div>` : ''}
    <form id="create-app" class="card">
      <h3>Nouvelle application</h3>
      <div class="form-grid">
        <label>Code<input name="code" required pattern="[A-Z0-9_]{2,30}" placeholder="IMPOTS"></label>
        <label>Nom<input name="name" required></label>
        <label>Quota journalier (segments)<input name="dailyQuota" type="number" min="1" required value="100"></label>
        <label>URL de webhook (optionnelle)<input name="webhookUrl" type="url" placeholder="https://…"></label>
      </div>
      <div class="form-actions"><button class="primary">Créer</button></div>
    </form>
    <div class="card table-wrap"><table>
      <thead><tr><th>Code</th><th>Nom</th><th>Statut</th><th>Quota</th><th>Consommé aujourd'hui</th><th>Webhook</th><th></th></tr></thead>
      <tbody>${state.apps.map((a) => `<tr>
        <td><strong>${esc(a.code)}</strong></td><td>${esc(a.name)}</td><td>${badge(a.status)}</td>
        <td>${a.dailyQuota}</td><td>${a.usedToday}</td><td class="muted">${esc(a.webhookUrl ?? '—')}</td>
        <td class="actions">
          <button class="small ${a.status === 'active' ? 'danger' : ''}" data-status="${a.id}" data-next="${a.status === 'active' ? 'suspended' : 'active'}">${a.status === 'active' ? 'Suspendre' : 'Réactiver'}</button>
          <button class="small" data-history="${a.id}">Historique</button>
        </td></tr>`).join('')}</tbody>
    </table></div>
    <div id="history"></div>`;

  $('#create-app').onsubmit = guarded(async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const body = { code: form.get('code'), name: form.get('name'), dailyQuota: Number(form.get('dailyQuota')) };
    if (form.get('webhookUrl')) body.webhookUrl = form.get('webhookUrl');
    const result = await api('POST', '/admin/applications', body);
    toast(`Application ${result.code} créée`);
    await renderApplications(content, result);
  });
  content.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = guarded(async () => {
      const reason = prompt('Motif (optionnel)') ?? undefined;
      await api('PATCH', `/admin/applications/${button.dataset.status}/status`, { status: button.dataset.next, reason: reason || undefined });
      toast('Statut mis à jour');
      await renderApplications(content);
    });
  });
  content.querySelectorAll('[data-history]').forEach((button) => {
    button.onclick = guarded(async () => {
      const data = await api('GET', `/admin/applications/${button.dataset.history}/status-history`);
      $('#history').innerHTML = `<div class="card"><h3>Historique — ${esc(data.code)}</h3><table>
        <thead><tr><th>Date</th><th>Statut</th><th>Motif</th></tr></thead>
        <tbody>${data.history.map((h) => `<tr><td>${fmtDate(h.changedAt)}</td><td>${badge(h.status)}</td><td>${esc(h.reason ?? '—')}</td></tr>`).join('')}</tbody>
      </table></div>`;
    });
  });
}

// ---------- Users (root) ----------

async function renderUsers(content) {
  await loadApps();
  const users = await api('GET', '/admin/users');
  const appChecks = (name, selected = []) =>
    state.apps.map((a) => `<label><input type="checkbox" name="${name}" value="${esc(a.id)}" ${selected.includes(a.id) ? 'checked' : ''}> ${esc(a.code)}</label>`).join('');

  content.innerHTML = `
    <form id="create-user" class="card">
      <h3>Ajouter un administrateur d'application</h3>
      <div class="form-grid">
        <label>Email<input name="email" type="email" required></label>
        <label>Mot de passe initial<input name="password" type="text" minlength="8" required></label>
      </div>
      <p class="muted">Transmettez ce mot de passe à l'administrateur. Applications attribuées :</p>
      <div class="checks">${appChecks('apps')}</div>
      <div class="form-actions"><button class="primary">Ajouter</button></div>
    </form>
    <div class="card table-wrap"><table>
      <thead><tr><th>Email</th><th>Rôle</th><th>Statut</th><th>Applications</th><th></th></tr></thead>
      <tbody>${users.map((u) => `<tr>
        <td>${esc(u.email)}</td><td>${u.role === 'ROOT' ? 'Root' : 'Admin app'}</td><td>${badge(u.status)}</td>
        <td>${u.role === 'ROOT' ? '<span class="muted">Toutes</span>' : `<div class="checks" data-user-apps="${u.id}">${appChecks(`apps-${u.id}`, u.applications.map((a) => a.id))}</div>`}</td>
        <td class="actions">${u.role === 'ROOT' ? '' : `
          <button class="small" data-save="${u.id}">Enregistrer les apps</button>
          <button class="small ${u.status === 'active' ? 'danger' : ''}" data-user-status="${u.id}" data-next="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? 'Désactiver' : 'Réactiver'}</button>`}
        </td></tr>`).join('')}</tbody>
    </table></div>`;

  const checked = (name) => [...content.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  $('#create-user').onsubmit = guarded(async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await api('POST', '/admin/users', { email: form.get('email'), password: form.get('password'), applicationIds: checked('apps') });
    toast('Administrateur ajouté');
    await renderUsers(content);
  });
  content.querySelectorAll('[data-save]').forEach((button) => {
    button.onclick = guarded(async () => {
      await api('PUT', `/admin/users/${button.dataset.save}/applications`, { applicationIds: checked(`apps-${button.dataset.save}`) });
      toast('Applications mises à jour');
    });
  });
  content.querySelectorAll('[data-user-status]').forEach((button) => {
    button.onclick = guarded(async () => {
      await api('PATCH', `/admin/users/${button.dataset.userStatus}/status`, { status: button.dataset.next });
      toast('Statut mis à jour');
      await renderUsers(content);
    });
  });
}

// ---------- SMS (per application) ----------

async function usageCard() {
  const usage = await api('GET', `/admin/applications/${state.appId}/usage`);
  return `<div class="grid" style="margin-bottom:16px">
    <div class="stat"><div class="muted">Quota du jour (${esc(usage.day)})</div><div class="value">${usage.quota}</div></div>
    <div class="stat"><div class="muted">Consommé</div><div class="value">${usage.used}</div></div>
    <div class="stat"><div class="muted">Restant</div><div class="value">${usage.remaining}</div></div>
  </div>`;
}

async function renderSms(content, filters = { page: 1 }) {
  const query = new URLSearchParams({ page: filters.page, limit: 20 });
  if (filters.status) query.set('status', filters.status);
  if (filters.category) query.set('category', filters.category);
  const [usage, list] = await Promise.all([usageCard(), api('GET', `/admin/applications/${state.appId}/sms?${query}`)]);
  const pages = Math.max(1, Math.ceil(list.total / list.limit));

  content.innerHTML = `${usage}
    <form id="sms-filters" class="card form-grid">
      <label>Statut<select name="status"><option value="">Tous</option>${STATUSES.map((s) => `<option ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Catégorie<select name="category"><option value="">Toutes</option>${['OTP', 'INFO'].map((c) => `<option ${filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <div><button class="primary">Filtrer</button> <button type="button" id="refresh">Rafraîchir</button></div>
    </form>
    <div class="card table-wrap"><table>
      <thead><tr><th>Créé le</th><th>Destinataire</th><th>Opérateur</th><th>Catégorie</th><th>Texte</th><th>Seg.</th><th>Statut</th><th>Tentatives</th><th></th></tr></thead>
      <tbody>${list.items.map((s) => `<tr>
        <td>${fmtDate(s.createdAt)}</td><td>${esc(s.recipient)}</td><td>${esc(s.operator)}</td><td>${esc(s.category)}</td>
        <td>${s.category === 'OTP' ? '<span class="muted">masqué</span>' : esc(s.text ?? '—')}</td>
        <td>${s.segments}</td><td>${badge(s.status)}${s.failureReason ? `<div class="muted">${esc(s.failureReason)}</div>` : ''}</td><td>${s.attempts}</td>
        <td class="actions">
          ${s.status === 'pending' ? `<button class="small danger" data-cancel="${s.id}">Annuler</button>` : ''}
          ${s.status === 'failed' ? `<button class="small" data-retry="${s.id}">Relancer</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucun SMS.</td></tr>'}</tbody>
    </table>
    <div class="pager"><span class="muted">${list.total} SMS · page ${list.page}/${pages}</span>
      <button id="prev" ${list.page <= 1 ? 'disabled' : ''}>←</button><button id="next" ${list.page >= pages ? 'disabled' : ''}>→</button></div>
    </div>`;

  const reload = (changes = {}) => renderSms(content, { ...filters, ...changes });
  $('#sms-filters').onsubmit = guarded(async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await reload({ status: form.get('status'), category: form.get('category'), page: 1 });
  });
  $('#refresh').onclick = guarded(() => reload());
  $('#prev').onclick = guarded(() => reload({ page: filters.page - 1 }));
  $('#next').onclick = guarded(() => reload({ page: filters.page + 1 }));
  content.querySelectorAll('[data-cancel]').forEach((button) => {
    button.onclick = guarded(async () => {
      await api('POST', `/admin/applications/${state.appId}/sms/${button.dataset.cancel}/cancel`);
      toast('SMS annulé, quota rendu');
      await reload();
    });
  });
  content.querySelectorAll('[data-retry]').forEach((button) => {
    button.onclick = guarded(async () => {
      await api('POST', `/admin/applications/${state.appId}/sms/${button.dataset.retry}/retry`);
      toast('SMS relancé');
      await reload();
    });
  });
}

// ---------- Campaigns (per application) ----------

async function renderCampaigns(content) {
  const [usage, list] = await Promise.all([usageCard(), api('GET', `/admin/applications/${state.appId}/campaigns?limit=50`)]);
  content.innerHTML = `${usage}
    <form id="create-campaign" class="card">
      <h3>Lancer une campagne (INFO, 500 destinataires max)</h3>
      <div class="form-grid">
        <label style="grid-column:1/-1">Destinataires (un par ligne ou séparés par des virgules)<textarea name="recipients" required placeholder="0150000000&#10;0140000000"></textarea></label>
        <label style="grid-column:1/-1">Texte<textarea name="text" required></textarea></label>
        <label>Référence<input name="reference" maxlength="100"></label>
        <label>Envoi programmé (optionnel)<input name="scheduledAt" type="datetime-local"></label>
      </div>
      <div class="form-actions"><button class="primary">Lancer</button><span class="muted">Hors 07h–21h (GMT+1), l'envoi part à 07h.</span></div>
    </form>
    <div class="card table-wrap"><table>
      <thead><tr><th>Créée le</th><th>Texte</th><th>Destinataires</th><th>Seg./SMS</th>${STATUSES.map((s) => `<th>${s}</th>`).join('')}</tr></thead>
      <tbody>${list.items.map((c) => `<tr>
        <td>${fmtDate(c.createdAt)}</td><td>${esc(c.text)}${c.reference ? `<div class="muted">${esc(c.reference)}</div>` : ''}</td>
        <td>${c.recipientCount}</td><td>${c.segmentsPerSms}</td>
        ${STATUSES.map((s) => `<td>${c.countsByStatus[s]}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9" class="muted">Aucune campagne.</td></tr>'}</tbody>
    </table></div>`;

  $('#create-campaign').onsubmit = guarded(async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const recipients = [...new Set(String(form.get('recipients')).split(/[\s,;]+/).filter(Boolean))];
    const body = { recipients, text: form.get('text') };
    if (form.get('reference')) body.reference = form.get('reference');
    if (form.get('scheduledAt')) body.scheduledAt = new Date(form.get('scheduledAt')).toISOString();
    const result = await api('POST', `/admin/applications/${state.appId}/campaigns`, body, { idempotent: true });
    toast(`Campagne lancée : ${result.recipientCount} SMS, ${result.totalSegments} segments`);
    await renderCampaigns(content);
  });
}

// ---------- Send a test SMS (per application) ----------

function segmentsOf(text) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const length = Array.from(text).length;
  return { unicode, length, segments: length ? Math.ceil(length / (unicode ? 70 : 160)) : 0 };
}

async function renderSend(content) {
  content.innerHTML = `${await usageCard()}
    <form id="send" class="card">
      <div class="form-grid">
        <label>Destinataire<input name="to" required pattern="01[0-9]{8}" placeholder="0150000000"></label>
        <label>Catégorie<select name="category"><option>INFO</option><option>OTP</option></select></label>
        <label>Référence<input name="reference" maxlength="100"></label>
        <label>Envoi programmé (INFO)<input name="scheduledAt" type="datetime-local"></label>
        <label style="grid-column:1/-1">Texte<textarea name="text" required></textarea></label>
      </div>
      <div class="form-actions"><button class="primary">Envoyer</button><span id="segments" class="muted"></span></div>
      <p class="muted">Simulation : un numéro finissant par 7 → échec temporaire (3 retries), 8 → échec définitif, 9 → opérateur indisponible.</p>
    </form>
    <div id="sent"></div>`;

  const text = content.querySelector('textarea[name="text"]');
  const counter = () => {
    const info = segmentsOf(text.value);
    $('#segments').textContent = `${info.length} caractères · ${info.unicode ? 'Unicode (70/segment)' : 'ASCII (160/segment)'} · ${info.segments} segment(s)${info.segments > 6 ? ' — maximum 6 !' : ''}`;
  };
  text.oninput = counter;
  counter();

  $('#send').onsubmit = guarded(async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const body = { to: form.get('to'), text: form.get('text'), category: form.get('category') };
    if (form.get('reference')) body.reference = form.get('reference');
    if (form.get('scheduledAt')) body.scheduledAt = new Date(form.get('scheduledAt')).toISOString();
    const result = await api('POST', `/admin/applications/${state.appId}/sms`, body, { idempotent: true });
    toast(`SMS accepté : ${result.segments} segment(s)`);
    const poll = async () => {
      const sms = await api('GET', `/admin/applications/${state.appId}/sms/${result.id}`);
      $('#sent').innerHTML = `<div class="card"><h3>Suivi du SMS</h3>
        <p>${badge(sms.status)} ${sms.failureReason ? esc(sms.failureReason) : ''} · tentatives : ${sms.attempts} · envoi prévu : ${fmtDate(sms.sendAt)}</p>
        <p class="muted">Transmis : ${fmtDate(sms.transmittedAt)} · Livré : ${fmtDate(sms.deliveredAt)} · Échec : ${fmtDate(sms.failedAt)}</p></div>`;
      return ['delivered', 'failed', 'cancelled'].includes(sms.status);
    };
    for (let i = 0; i < 20 && !(await poll()); i++) await new Promise((r) => setTimeout(r, 1000));
  });
}

// ---------- Boot ----------

$('#login-form').onsubmit = guarded(login);
$('#logout').onclick = guarded(() => logout());
$('#app-select').onchange = (event) => {
  state.appId = event.target.value;
  route();
};
window.addEventListener('hashchange', route);

(async () => {
  state.token = storage('get');
  if (state.token) {
    try {
      await start();
      return;
    } catch {
      await logout(false);
    }
  }
  $('#login-view').hidden = false;
})();
