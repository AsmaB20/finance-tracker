/* ─────────────────────────────────────────
   SpendWise — app.js
   Single-page app logic (vanilla JS)
   ───────────────────────────────────────── */

// ── App State ──────────────────────────────
const state = {
  user: null,
  currentView: 'dashboard',
  currentMonth: todayMonth(),
  historyMonth: todayMonth(),
  historyCategory: 'all',
  expenses: [],
  chart: null,
};

const CATEGORY_META = {
  'Food':          { icon: '🍕', color: '#FF6B6B' },
  'Rent':          { icon: '🏠', color: '#4ECDC4' },
  'Transport':     { icon: '🚗', color: '#45B7D1' },
  'Shopping':      { icon: '🛍️', color: '#F7DC6F' },
  'Subscriptions': { icon: '📱', color: '#BB8FCE' },
  'Going Out':     { icon: '🎉', color: '#F0A500' },
  'Health':        { icon: '💊', color: '#58D68D' },
  'Other':         { icon: '📦', color: '#AEB6BF' },
};

// ── Helpers ────────────────────────────────
function todayMonth() {
  // Use local time (not UTC) to avoid off-by-one near midnight.
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function todayDate() {
  // Use local time (not UTC) to avoid off-by-one near midnight.
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysLeftInMonth() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return last.getDate() - now.getDate();
}

function fmt(amount, currency) {
  const c = currency || state.user?.currency || 'QAR';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: c,
  }).format(amount);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

async function api(path, options = {}) {
  try {
    const headers = { ...(options.headers || {}) };
    const hasBody = Object.prototype.hasOwnProperty.call(options, 'body');

    const res = await fetch(path, {
      ...options,
      headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : {};

    if (!res.ok) {
      const msg = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
      return { error: msg };
    }

    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return { error: 'Network error. Please try again.' };
  }
}

function show(el)  { el?.classList.remove('hidden'); }
function hide(el)  { el?.classList.add('hidden'); }
function $(sel)    { return document.querySelector(sel); }
function $$(sel)   { return document.querySelectorAll(sel); }

// ── Boot ───────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const loader = $('#page-loader');

  // Set today's date defaults
  $('#exp-date').value = todayDate();
  $('#dash-month-picker').value = todayMonth();
  $('#hist-month-picker').value = todayMonth();
  $('#budget-month-input').value = todayMonth();

  await checkAuth();
  hide(loader);
});

async function checkAuth() {
  const data = await api('/api/auth/me');
  if (data.user) {
    state.user = data.user;
    showApp();
  } else {
    showAuthScreen();
  }
}

// ── Auth Screen ────────────────────────────
function showAuthScreen() {
  show($('#auth-screen'));
  hide($('#app'));
}

function showApp() {
  hide($('#auth-screen'));
  show($('#app'));
  updateSidebar();
  navigateTo('dashboard');
}

// Auth tabs
$$('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const t = tab.dataset.tab;
    $$('.auth-tab').forEach(b => b.classList.remove('active'));
    tab.classList.add('active');
    if (t === 'login') {
      show($('#login-form')); hide($('#register-form'));
    } else {
      hide($('#login-form')); show($('#register-form'));
    }
    hide($('#login-error')); hide($('#reg-error'));
  });
});

// Login
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#login-error');
  hide(errEl);

  const data = await api('/api/auth/login', {
    method: 'POST',
    body: { email: $('#login-email').value, password: $('#login-password').value },
  });

  if (data.error) {
    errEl.textContent = data.error;
    show(errEl);
  } else {
    state.user = data.user;
    showApp();
  }
});

// Register
$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#reg-error');
  hide(errEl);

  const data = await api('/api/auth/register', {
    method: 'POST',
    body: {
      name: $('#reg-name').value,
      email: $('#reg-email').value,
      password: $('#reg-password').value,
      currency: $('#reg-currency').value,
    },
  });

  if (data.error) {
    errEl.textContent = data.error;
    show(errEl);
  } else {
    state.user = data.user;
    showApp();
  }
});

// Logout
async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  showAuthScreen();
}
$('#logout-btn').addEventListener('click', logout);
$('#settings-logout-btn').addEventListener('click', logout);

// ── Navigation ────────────────────────────
function updateSidebar() {
  const u = state.user;
  if (!u) return;
  $('#sidebar-name').textContent = u.name;
  $('#sidebar-currency').textContent = u.currency;
  $('#sidebar-avatar').textContent = u.name.charAt(0).toUpperCase();
  $$('.modal-currency').forEach(el => el.textContent = u.currency);
  $('#settings-currency-label').textContent = u.currency;
}

$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.view));
});

$$('[data-view]').forEach(el => {
  if (!el.classList.contains('nav-item')) {
    el.addEventListener('click', () => navigateTo(el.dataset.view));
  }
});

function navigateTo(view) {
  state.currentView = view;

  // Update nav
  $$('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  // Show/hide views
  $$('.view').forEach(v => {
    v.id === `view-${view}` ? show(v) : hide(v);
  });

  // Load data
  if (view === 'dashboard') loadDashboard();
  if (view === 'history')   loadHistory();
  if (view === 'settings')  loadSettings();
}

// ── Dashboard ─────────────────────────────
async function loadDashboard() {
  const month = state.currentMonth;
  const data = await api(`/api/summary?month=${month}`);

  // Greeting
  $('#dash-greeting').textContent = `${greeting()}, ${state.user.name.split(' ')[0]} 👋`;

  const currency = state.user.currency;
  const spent = data.totalSpent || 0;
  const budget = data.budget;
  const remaining = budget != null ? budget - spent : null;

  // Metrics
  $('#metric-spent').textContent = fmt(spent, currency);
  $('#metric-budget').textContent = budget != null ? fmt(budget, currency) : 'Not set';

  if (remaining != null) {
    const remEl = $('#metric-remaining');
    remEl.textContent = fmt(Math.abs(remaining), currency);
    remEl.className = 'metric-value' + (remaining < 0 ? ' danger' : remaining < budget * 0.1 ? ' warning' : '');
  } else {
    $('#metric-remaining').textContent = '—';
  }

  const daysEl = $('#metric-days');
  if (month === todayMonth()) {
    daysEl.textContent = daysLeftInMonth();
  } else {
    daysEl.textContent = '—';
  }

  // Budget progress
  if (budget != null && budget > 0) {
    const pct = Math.min((spent / budget) * 100, 100);
    const fill = $('#progress-fill');
    fill.style.width = pct + '%';
    fill.className = 'progress-bar-fill' +
      (pct >= 90 ? ' danger' : pct >= 75 ? ' warn' : '');
    $('#budget-pct-label').textContent = Math.round(pct) + '%';
    $('#budget-hint').textContent =
      remaining >= 0
        ? `You've used ${Math.round(pct)}% of your budget.`
        : `You're ${fmt(Math.abs(remaining), currency)} over budget!`;
  } else {
    $('#progress-fill').style.width = '0%';
    $('#budget-pct-label').textContent = '—';
    $('#budget-hint').textContent = 'Set a monthly budget in Settings to track your progress.';
  }

  // Chart
  renderCategoryChart(data.byCategory || [], data.totalSpent || 0, currency);

  // Category breakdown
  renderCategoryBreakdown(data.byCategory || [], data.totalSpent || 0, currency);

  // Recent transactions
  renderTransactions(
    data.recentExpenses || [],
    '#recent-transactions',
    currency,
    true // no delete button on dashboard
  );
}

$('#dash-month-picker').addEventListener('change', (e) => {
  state.currentMonth = e.target.value;
  loadDashboard();
});

// ── Category Chart ─────────────────────────
function renderCategoryChart(byCategory, total, currency) {
  const canvas = $('#category-chart');
  const emptyEl = $('#chart-empty');

  if (!byCategory.length) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    show(emptyEl); return;
  }
  hide(emptyEl);

  const labels  = byCategory.map(c => c.category);
  const amounts = byCategory.map(c => c.total);
  const colors  = byCategory.map(c => CATEGORY_META[c.category]?.color || '#AEB6BF');

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total > 0 ? ` (${Math.round((ctx.raw / total) * 100)}%)` : '';
              return ` ${fmt(ctx.raw, currency)}${pct}`;
            },
          },
        },
      },
      animation: { animateRotate: true, duration: 600 },
    },
  });
}

function renderCategoryBreakdown(byCategory, total, currency) {
  const el = $('#category-breakdown');
  if (!byCategory.length) {
    el.innerHTML = '<p class="empty-state">No expenses this month.</p>';
    return;
  }

  const sorted = [...byCategory].sort((a, b) => b.total - a.total);
  el.innerHTML = sorted.map(c => {
    const meta = CATEGORY_META[c.category] || { icon: '📦', color: '#AEB6BF' };
    const pct  = total > 0 ? Math.round((c.total / total) * 100) : 0;
    return `
      <div class="cat-row">
        <div class="cat-dot" style="background:${meta.color}"></div>
        <span class="cat-row-name">${meta.icon} ${c.category}</span>
        <span class="cat-row-amount">${fmt(c.total, currency)}</span>
        <span class="cat-row-pct">${pct}%</span>
      </div>
    `;
  }).join('');
}

// ── Transaction Rendering ─────────────────
function renderTransactions(expenses, containerSel, currency, readOnly = false) {
  const el = $(containerSel);
  if (!expenses.length) {
    el.innerHTML = '<p class="empty-state">No transactions found. Add your first expense!</p>';
    return;
  }

  el.innerHTML = expenses.map(exp => {
    const meta = CATEGORY_META[exp.category] || { icon: '📦', color: '#AEB6BF' };
    const actions = readOnly ? '' : `
      <button class="tx-edit" data-id="${exp.id}" title="Edit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>
      <button class="tx-delete" data-id="${exp.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    `;
    return `
      <div class="transaction-item" data-id="${exp.id}">
        <div class="tx-icon" style="background:${meta.color}22">${meta.icon}</div>
        <div class="tx-body">
          <div class="tx-category">${exp.category}</div>
          <div class="tx-note">${exp.note || formatDate(exp.date)}</div>
        </div>
        <div class="tx-date">${formatDate(exp.date)}</div>
        <div class="tx-amount">${fmt(exp.amount, currency)}</div>
        ${actions}
      </div>
    `;
  }).join('');

  // Bind action buttons
  if (!readOnly) {
    el.querySelectorAll('.tx-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditExpense(btn.dataset.id));
    });
    el.querySelectorAll('.tx-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteExpense(btn.dataset.id));
    });
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await api(`/api/expenses/${id}`, { method: 'DELETE' });
  if (state.currentView === 'dashboard') loadDashboard();
  if (state.currentView === 'history')   loadHistory();
}

// ── History View ──────────────────────────
async function loadHistory() {
  const month = state.historyMonth;
  const cat   = state.historyCategory;

  let url = `/api/expenses?month=${month}`;
  if (cat !== 'all') url += `&category=${encodeURIComponent(cat)}`;

  const data = await api(url);
  state.expenses = data.expenses || [];
  renderTransactions(state.expenses, '#history-list', state.user.currency);
}

$('#hist-month-picker').addEventListener('change', (e) => {
  state.historyMonth = e.target.value;
  loadHistory();
});

$('#hist-add-btn').addEventListener('click', openModal);

$('#hist-filters').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  $$('#hist-filters .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  state.historyCategory = pill.dataset.cat;
  loadHistory();
});

// ── Settings View ─────────────────────────
async function loadSettings() {
  const u = state.user;
  $('#settings-name').value     = u.name;
  $('#settings-currency').value = u.currency;
  if (!$('#budget-month-input').value) $('#budget-month-input').value = todayMonth();

  // Load current budget
  const data = await api(`/api/budget?month=${$('#budget-month-input').value}`);
  if (data.budget) $('#budget-input').value = data.budget.amount;
}

$('#budget-month-input').addEventListener('change', async (e) => {
  const month = e.target.value;
  const data = await api(`/api/budget?month=${month}`);
  $('#budget-input').value = data.budget ? data.budget.amount : '';
});

$('#save-budget-btn').addEventListener('click', async () => {
  const amount = parseFloat($('#budget-input').value);
  const month  = $('#budget-month-input').value;
  const successEl = $('#budget-success');
  hide(successEl);

  if (!amount || amount <= 0) return alert('Please enter a valid budget amount.');

  const data = await api('/api/budget', {
    method: 'POST', body: { amount, month },
  });

  if (data.budget) {
    show(successEl);
    setTimeout(() => hide(successEl), 3000);
    // Refresh dashboard if visible
    if (state.currentView === 'dashboard') loadDashboard();
  }
});

$('#save-profile-btn').addEventListener('click', async () => {
  const name     = $('#settings-name').value.trim();
  const currency = $('#settings-currency').value;
  const successEl = $('#profile-success');
  hide(successEl);

  if (!name) return alert('Please enter your name.');

  const data = await api('/api/auth/profile', {
    method: 'PUT', body: { name, currency },
  });

  if (data.user) {
    state.user = data.user;
    updateSidebar();
    show(successEl);
    setTimeout(() => hide(successEl), 3000);
  }
});

// ── Add Expense Modal ─────────────────────
let selectedCategory = 'Food';
let editingExpenseId = null;

function setModalMode(mode) {
  const titleEl = $('#expense-modal .modal-header h3');
  const submitBtn = $('#exp-submit');
  if (mode === 'edit') {
    titleEl.textContent = 'Edit Expense';
    submitBtn.textContent = 'Save Changes';
  } else {
    titleEl.textContent = 'Add Expense';
    submitBtn.textContent = 'Add Expense';
  }
}

function openModal() {
  editingExpenseId = null;
  setModalMode('add');
  show($('#expense-modal'));
  $('#exp-amount').focus();
  $('#exp-date').value = todayDate();
  hide($('#exp-error'));
}

function openEditExpense(id) {
  const exp = state.expenses.find(e => String(e.id) === String(id));
  if (!exp) return alert('Could not find this transaction. Please refresh and try again.');

  editingExpenseId = exp.id;
  setModalMode('edit');
  show($('#expense-modal'));
  hide($('#exp-error'));

  $('#exp-amount').value = exp.amount;
  $('#exp-date').value = exp.date;
  $('#exp-note').value = exp.note || '';

  selectedCategory = exp.category;
  $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === selectedCategory));
  $('#exp-amount').focus();
}

function closeModal() {
  hide($('#expense-modal'));
  $('#expense-form').reset();
  $('#exp-date').value = todayDate();
  editingExpenseId = null;
  setModalMode('add');
  selectedCategory = 'Food';
  $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === 'Food'));
}

$('#add-expense-btn').addEventListener('click', openModal);
$('#modal-close').addEventListener('click', closeModal);

$('#expense-modal').addEventListener('click', (e) => {
  if (e.target === $('#expense-modal')) closeModal();
});

// Category selector
$('#category-selector').addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  $$('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedCategory = btn.dataset.cat;
});

// Submit expense
$('#expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#exp-error');
  hide(errEl);

  const body = {
    amount:   parseFloat($('#exp-amount').value),
    category: selectedCategory,
    date:     $('#exp-date').value,
    note:     $('#exp-note').value,
  };

  const submitBtn = $('#exp-submit');
  submitBtn.textContent = 'Saving...';
  submitBtn.disabled = true;

  const data = editingExpenseId
    ? await api(`/api/expenses/${editingExpenseId}`, { method: 'PUT', body })
    : await api('/api/expenses', { method: 'POST', body });

  submitBtn.textContent = editingExpenseId ? 'Save Changes' : 'Add Expense';
  submitBtn.disabled = false;

  if (data.error) {
    errEl.textContent = data.error;
    show(errEl);
  } else {
    closeModal();
    if (state.currentView === 'dashboard') loadDashboard();
    if (state.currentView === 'history')   loadHistory();
  }
});

// Keyboard: Escape closes modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
