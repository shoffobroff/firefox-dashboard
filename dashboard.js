const ext = typeof browser !== 'undefined' ? browser : chrome;

// ── Defaults ───────────────────────────────────────────

const DEFAULT_LINKS = [
  { id: 1, name: 'GitHub',       url: 'https://github.com' },
  { id: 2, name: 'Gmail',        url: 'https://mail.google.com' },
  { id: 3, name: 'YouTube',      url: 'https://youtube.com' },
  { id: 4, name: 'Reddit',       url: 'https://reddit.com' },
  { id: 5, name: 'Hacker News',  url: 'https://news.ycombinator.com' },
  { id: 6, name: 'Twitter / X',  url: 'https://x.com' },
];

const DEFAULT_SETTINGS = {
  name:          '',
  theme:         'dark',
  accent:        '#7c6aff',
  use24Hour:     false,
  showSeconds:   true,
  searchEngine:  'google',
  searchNewTab:  false,
  tempUnit:      'c',
  linkCols:      2,
  maxTabs:       10,
};

const DEFAULT_LAYOUT = {
  sectionOrder: ['search', 'cards', 'tabs'],
  cardOrder:    ['links', 'weather', 'todo'],
  hidden:       [],          // widget IDs that are hidden
};

const WMO = {
  0:  ['Clear sky',          '☀️'],  1:  ['Mainly clear',       '🌤️'],
  2:  ['Partly cloudy',      '⛅'],  3:  ['Overcast',           '☁️'],
  45: ['Foggy',              '🌫️'], 48: ['Icy fog',            '🌫️'],
  51: ['Light drizzle',      '🌦️'], 53: ['Drizzle',            '🌧️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain',         '🌧️'], 63: ['Rain',               '🌧️'], 65: ['Heavy rain',    '🌧️'],
  71: ['Light snow',         '🌨️'], 73: ['Snow',               '❄️'],  75: ['Heavy snow',    '❄️'],
  80: ['Rain showers',       '🌦️'], 81: ['Rain showers',       '🌧️'], 82: ['Heavy showers', '⛈️'],
  85: ['Snow showers',       '🌨️'], 86: ['Heavy snow showers', '🌨️'],
  95: ['Thunderstorm',       '⛈️'], 96: ['Thunderstorm',       '⛈️'], 99: ['Thunderstorm',  '⛈️'],
};

// ── State ──────────────────────────────────────────────

const state = {
  links:    [],
  todos:    [],
  settings: { ...DEFAULT_SETTINGS },
  layout:   JSON.parse(JSON.stringify(DEFAULT_LAYOUT)),
  editMode: false,
};

// ── Storage ────────────────────────────────────────────

async function loadStorage() {
  const d = await ext.storage.local.get(['links', 'todos', 'settings', 'layout']);
  state.links    = d.links    ?? DEFAULT_LINKS;
  state.todos    = d.todos    ?? [];
  state.settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
  state.layout   = {
    sectionOrder: d.layout?.sectionOrder ?? [...DEFAULT_LAYOUT.sectionOrder],
    cardOrder:    d.layout?.cardOrder    ?? [...DEFAULT_LAYOUT.cardOrder],
    hidden:       d.layout?.hidden       ?? [],
  };
}

const saveLinks    = () => ext.storage.local.set({ links:    state.links });
const saveTodos    = () => ext.storage.local.set({ todos:    state.todos });
const saveSettings = () => ext.storage.local.set({ settings: state.settings });
const saveLayout   = () => ext.storage.local.set({ layout:   state.layout });

// ── Bootstrap ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadStorage();

  applyTheme();
  applyAccent(state.settings.accent);
  applyLayout();

  initClock();
  initSearch();
  renderLinks();
  initWeather();
  initTodos();
  initTabs();

  initEditMode();
  initDnD();
  initSettings();
  initAddLinkModal();
  initBookmarkModal();
  initResetModal();

  // Hide widget buttons wire-up
  document.querySelectorAll('.hide-widget-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleHideWidget(btn.dataset.widget));
  });
});

// ── Theme ──────────────────────────────────────────────

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);
}

function applyAccent(color) {
  state.settings.accent = color;
  document.documentElement.style.setProperty('--accent', color);
  // Derive a lighter tint by mixing with white at 20%
  document.documentElement.style.setProperty('--accent-light', lightenHex(color, 0.2));
  document.documentElement.style.setProperty('--accent-dim',   hexToRgba(color, 0.12));
  document.documentElement.style.setProperty('--accent-bdr',   hexToRgba(color, 0.35));
}

function lightenHex(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255-r)*t)},${Math.round(g + (255-g)*t)},${Math.round(b + (255-b)*t)})`;
}
function hexToRgba(hex, a) {
  const [r,g,b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}

// ── Layout ─────────────────────────────────────────────

function applyLayout() {
  // Section order via CSS `order`
  state.layout.sectionOrder.forEach((id, i) => {
    const el = document.querySelector(`.section-wrapper[data-section="${id}"]`);
    if (el) el.style.order = i;
  });

  // Card order via CSS `order`
  state.layout.cardOrder.forEach((id, i) => {
    const el = document.querySelector(`.card-wrapper[data-card="${id}"]`);
    if (el) el.style.order = i;
  });

  // Hidden widgets
  const allWidgets = ['search', 'tabs', 'links', 'weather', 'todo'];
  allWidgets.forEach(id => {
    const el = document.querySelector(
      `.section-wrapper[data-section="${id}"], .card-wrapper[data-card="${id}"]`
    );
    if (el) el.style.display = state.layout.hidden.includes(id) ? 'none' : '';
  });

  // Hide the cards section wrapper if all three cards are hidden
  const cardsSection = document.querySelector('.section-wrapper[data-section="cards"]');
  if (cardsSection) {
    const allHidden = ['links','weather','todo'].every(id => state.layout.hidden.includes(id));
    cardsSection.style.display = allHidden ? 'none' : '';
  }

  // Sync link columns
  document.getElementById('links-grid').style.gridTemplateColumns =
    `repeat(${state.settings.linkCols}, 1fr)`;

  syncSettingsWidgetToggles();
}

function toggleHideWidget(id) {
  if (state.layout.hidden.includes(id)) {
    state.layout.hidden = state.layout.hidden.filter(h => h !== id);
  } else {
    state.layout.hidden.push(id);
  }
  saveLayout();
  applyLayout();
}

// ── Clock ──────────────────────────────────────────────

function initClock() {
  tick();
  setInterval(tick, 1000);
}

function tick() {
  const now = new Date();
  const { use24Hour, showSeconds, name } = state.settings;

  const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: !use24Hour };
  if (showSeconds) timeOpts.second = '2-digit';

  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', timeOpts);
  document.getElementById('date').textContent  = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const h = now.getHours();
  const base = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
  document.getElementById('greeting').textContent = name ? `${base}, ${name}` : base;
}

// ── Search ─────────────────────────────────────────────

function initSearch() {
  const input  = document.getElementById('search-input');
  const btn    = document.getElementById('search-btn');
  const select = document.getElementById('search-engine');

  const engines = {
    google: 'https://www.google.com/search?q=',
    ddg:    'https://duckduckgo.com/?q=',
    bing:   'https://www.bing.com/search?q=',
  };

  select.value = state.settings.searchEngine;
  select.addEventListener('change', async () => {
    state.settings.searchEngine = select.value;
    document.getElementById('cfg-engine').value = select.value;
    await saveSettings();
  });

  const go = () => {
    const q = input.value.trim();
    if (!q) return;
    const url = engines[state.settings.searchEngine] + encodeURIComponent(q);
    if (state.settings.searchNewTab) window.open(url, '_blank');
    else window.location.href = url;
  };

  btn.addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  input.focus();
}

// ── Quick Links ────────────────────────────────────────

function renderLinks() {
  const grid = document.getElementById('links-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${state.settings.linkCols}, 1fr)`;

  state.links.forEach(link => {
    const item = document.createElement('div');
    item.className = 'link-item';
    item.title = link.url;

    let hostname = '';
    try { hostname = new URL(link.url).hostname; } catch {}

    const img = document.createElement('img');
    img.className = 'link-favicon';
    img.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    img.alt = '';
    img.onerror = () => img.replaceWith(makeFallback(link.name));

    const name = document.createElement('span');
    name.className = 'link-name';
    name.textContent = link.name;

    const del = document.createElement('button');
    del.className = 'link-delete';
    del.textContent = '×';
    del.title = 'Remove';
    del.addEventListener('click', async e => {
      e.stopPropagation();
      state.links = state.links.filter(l => l.id !== link.id);
      await saveLinks();
      renderLinks();
    });

    item.append(img, name, del);
    item.addEventListener('click', () => window.open(link.url, '_blank'));
    grid.appendChild(item);
  });
}

function makeFallback(name) {
  const el = document.createElement('div');
  el.className = 'link-favicon-fallback';
  el.textContent = (name?.[0] ?? '?').toUpperCase();
  return el;
}

// ── Weather ────────────────────────────────────────────

function initWeather() {
  document.getElementById('weather-unit-toggle').textContent =
    state.settings.tempUnit === 'c' ? '°C' : '°F';

  document.getElementById('weather-unit-toggle').addEventListener('click', async () => {
    state.settings.tempUnit = state.settings.tempUnit === 'c' ? 'f' : 'c';
    document.getElementById('weather-unit-toggle').textContent =
      state.settings.tempUnit === 'c' ? '°C' : '°F';
    syncSettingsSegmented();
    await saveSettings();
    // Re-render from cache if available
    const raw = sessionStorage.getItem('wx');
    if (raw) renderWeather(document.getElementById('weather-content'), JSON.parse(raw).data);
    else loadWeather();
  });

  loadWeather();
}

function loadWeather() {
  const el = document.getElementById('weather-content');
  const raw = sessionStorage.getItem('wx');
  if (raw) {
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < 30 * 60 * 1000) { renderWeather(el, data); return; }
  }

  el.innerHTML = '<p class="loading-text">Fetching location&hellip;</p>';

  if (!navigator.geolocation) {
    el.innerHTML = '<p class="weather-error">Geolocation not supported.</p>'; return;
  }

  navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lon } }) => {
    try {
      const [wRes, gRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m`),
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`),
      ]);
      const wj = await wRes.json();
      const gj = await gRes.json();
      const c  = wj.current;
      const addr = gj.address ?? {};
      const data = {
        code:    c.weather_code,
        tempC:   c.temperature_2m,
        feelsC:  c.apparent_temperature,
        hum:     c.relative_humidity_2m,
        wind:    c.wind_speed_10m,
        city:    addr.city || addr.town || addr.village || addr.county || 'Unknown',
      };
      sessionStorage.setItem('wx', JSON.stringify({ ts: Date.now(), data }));
      renderWeather(el, data);
    } catch {
      el.innerHTML = '<p class="weather-error">Failed to load weather.</p>';
    }
  }, () => {
    el.innerHTML = '<p class="weather-error">Location access denied.</p>';
  });
}

function renderWeather(el, d) {
  const u = state.settings.tempUnit;
  const cv = c => u === 'f' ? Math.round(c * 9/5 + 32) : Math.round(c);
  const sym = u === 'f' ? '°F' : '°C';
  const [label, icon] = WMO[d.code] ?? ['Unknown', '🌡️'];

  el.innerHTML = `
    <div class="weather-main">
      <span class="weather-icon">${icon}</span>
      <div>
        <div class="weather-temp">${cv(d.tempC)}${sym}</div>
        <span class="weather-condition">${label}</span>
      </div>
    </div>
    <div class="weather-location">📍 ${d.city}</div>
    <div class="weather-details">
      <span class="weather-detail">🌡️ Feels ${cv(d.feelsC)}${sym}</span>
      <span class="weather-detail">💧 ${d.hum}%</span>
      <span class="weather-detail">💨 ${Math.round(d.wind)} km/h</span>
    </div>`;
}

// ── To-Do ──────────────────────────────────────────────

function initTodos() {
  renderTodos();
  const input = document.getElementById('todo-input');
  const add = async () => {
    const text = input.value.trim();
    if (!text) return;
    state.todos.unshift({ id: Date.now(), text, done: false });
    input.value = '';
    await saveTodos();
    renderTodos();
  };
  document.getElementById('add-todo-btn').addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';

  const remaining = state.todos.filter(t => !t.done).length;
  const badge = document.getElementById('todo-count');
  badge.textContent = remaining > 0 ? remaining : '';
  badge.style.display = remaining > 0 ? '' : 'none';

  if (!state.todos.length) {
    list.innerHTML = '<p class="empty-state">No tasks yet</p>'; return;
  }

  state.todos.forEach(todo => {
    const item = document.createElement('div');
    item.className = `todo-item${todo.done ? ' done' : ''}`;

    const box = document.createElement('button');
    box.className = `todo-checkbox${todo.done ? ' checked' : ''}`;
    box.textContent = todo.done ? '✓' : '';
    box.addEventListener('click', async () => {
      todo.done = !todo.done;
      await saveTodos();
      renderTodos();
    });

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.textContent = '×';
    del.addEventListener('click', async () => {
      state.todos = state.todos.filter(t => t.id !== todo.id);
      await saveTodos();
      renderTodos();
    });

    item.append(box, text, del);
    list.appendChild(item);
  });
}

// ── Open Tabs ──────────────────────────────────────────

function initTabs() {
  loadTabs();
  document.getElementById('refresh-tabs-btn').addEventListener('click', loadTabs);
}

async function loadTabs() {
  const grid = document.getElementById('tabs-grid');
  grid.innerHTML = '';
  try {
    const all  = await ext.tabs.query({});
    const max  = parseInt(state.settings.maxTabs) || 0;
    let tabs = all.filter(t => t.url && !t.url.startsWith('about:newtab') &&
      !t.url.startsWith('about:blank') && !t.url.startsWith('moz-extension') &&
      !t.url.startsWith('chrome-extension'));
    if (max > 0) tabs = tabs.slice(0, max);

    if (!tabs.length) { grid.innerHTML = '<p class="empty-state">No other open tabs</p>'; return; }

    tabs.forEach(tab => {
      const item = document.createElement('div');
      item.className = 'tab-item';
      item.title = tab.url;

      if (tab.favIconUrl) {
        const img = document.createElement('img');
        img.className = 'tab-favicon';
        img.src = tab.favIconUrl;
        img.alt = '';
        img.onerror = () => img.remove();
        item.appendChild(img);
      }

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || tab.url;
      item.appendChild(title);

      item.addEventListener('click', () => {
        ext.tabs.update(tab.id, { active: true });
        try { ext.windows.update(tab.windowId, { focused: true }); } catch {}
      });
      grid.appendChild(item);
    });
  } catch {
    grid.innerHTML = '<p class="empty-state">Could not load tabs</p>';
  }
}

// ── Edit Mode ──────────────────────────────────────────

function initEditMode() {
  document.getElementById('edit-btn').addEventListener('click', () => {
    state.editMode ? exitEditMode() : enterEditMode();
  });
  document.getElementById('edit-done-btn').addEventListener('click', exitEditMode);
}

function enterEditMode() {
  state.editMode = true;
  document.body.classList.add('edit-mode');
  document.getElementById('edit-bar').classList.remove('hidden');
  document.getElementById('edit-btn').textContent = 'Done';

  document.querySelectorAll('.section-wrapper[data-section]').forEach(el => {
    el.draggable = true;
  });
  document.querySelectorAll('.card-wrapper[data-card]').forEach(el => {
    el.draggable = true;
  });
}

function exitEditMode() {
  state.editMode = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('edit-bar').classList.add('hidden');
  document.getElementById('edit-btn').textContent = 'Edit';

  document.querySelectorAll('[draggable="true"]').forEach(el => el.removeAttribute('draggable'));
  clearDragClasses();
}

function clearDragClasses() {
  document.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(el => {
    el.classList.remove('dragging', 'drop-before', 'drop-after');
  });
}

// ── Drag & Drop ────────────────────────────────────────

function initDnD() {
  // ── Sections (vertical) ──────────────────────────────
  const sc = document.getElementById('sections-container');
  let dragSection = null;

  sc.addEventListener('dragstart', e => {
    const w = e.target.closest('.section-wrapper[data-section]');
    if (!w || !state.editMode) return;
    dragSection = w.dataset.section;
    w.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSection);
    e.stopPropagation();
  });

  sc.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragSection) return;
    const w = e.target.closest('.section-wrapper[data-section]');
    if (!w || w.dataset.section === dragSection) return;

    sc.querySelectorAll('.section-wrapper').forEach(el => {
      el.classList.remove('drop-before', 'drop-after');
    });
    const rect = w.getBoundingClientRect();
    w.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
  });

  sc.addEventListener('dragleave', e => {
    if (!sc.contains(e.relatedTarget)) clearDragClasses();
  });

  sc.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragSection) return;
    const w = e.target.closest('.section-wrapper[data-section]');
    if (!w || w.dataset.section === dragSection) return;

    const order = state.layout.sectionOrder;
    const from  = order.indexOf(dragSection);
    const rect  = w.getBoundingClientRect();
    let to = order.indexOf(w.dataset.section);
    if (e.clientY >= rect.top + rect.height / 2) to++;
    if (to > from) to--;
    order.splice(from, 1);
    order.splice(to, 0, dragSection);

    dragSection = null;
    clearDragClasses();
    saveLayout();
    applyLayout();
  });

  sc.addEventListener('dragend', () => { dragSection = null; clearDragClasses(); });

  // ── Cards (horizontal grid) ───────────────────────────
  const cc = document.getElementById('cards-container');
  let dragCard = null;

  cc.addEventListener('dragstart', e => {
    const w = e.target.closest('.card-wrapper[data-card]');
    if (!w || !state.editMode) return;
    dragCard = w.dataset.card;
    w.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragCard);
    e.stopPropagation();
  });

  cc.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragCard) return;
    const w = e.target.closest('.card-wrapper[data-card]');
    if (!w || w.dataset.card === dragCard) return;

    cc.querySelectorAll('.card-wrapper').forEach(el => {
      el.classList.remove('drop-before', 'drop-after');
    });
    const rect = w.getBoundingClientRect();
    w.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after');
  });

  cc.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragCard) return;
    const w = e.target.closest('.card-wrapper[data-card]');
    if (!w || w.dataset.card === dragCard) return;

    const order = state.layout.cardOrder;
    const from  = order.indexOf(dragCard);
    const rect  = w.getBoundingClientRect();
    let to = order.indexOf(w.dataset.card);
    if (e.clientX >= rect.left + rect.width / 2) to++;
    if (to > from) to--;
    order.splice(from, 1);
    order.splice(to, 0, dragCard);

    dragCard = null;
    clearDragClasses();
    saveLayout();
    applyLayout();
  });

  cc.addEventListener('dragend', () => { dragCard = null; clearDragClasses(); });
}

// ── Settings Panel ─────────────────────────────────────

function initSettings() {
  const panel   = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');

  const open  = () => { panel.classList.add('open'); overlay.classList.add('open'); };
  const close = () => { panel.classList.remove('open'); overlay.classList.remove('open'); };

  document.getElementById('settings-btn').addEventListener('click', open);
  document.getElementById('settings-close').addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Populate initial values
  syncSettingsPanel();

  // Name
  const nameIn = document.getElementById('cfg-name');
  nameIn.addEventListener('input', async () => {
    state.settings.name = nameIn.value;
    await saveSettings();
    tick();
  });

  // Segmented buttons (theme, tempUnit, linkCols)
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cfg = btn.dataset.cfg;
      const val = btn.dataset.val;
      state.settings[cfg] = cfg === 'linkCols' ? parseInt(val) : val;
      syncSettingsSegmented();
      await saveSettings();
      if (cfg === 'theme')    applyTheme();
      if (cfg === 'tempUnit') {
        document.getElementById('weather-unit-toggle').textContent =
          state.settings.tempUnit === 'c' ? '°C' : '°F';
        const raw = sessionStorage.getItem('wx');
        if (raw) renderWeather(document.getElementById('weather-content'), JSON.parse(raw).data);
      }
      if (cfg === 'linkCols') renderLinks();
    });
  });

  // Accent swatches
  document.querySelectorAll('.swatch').forEach(s => {
    s.addEventListener('click', async () => {
      applyAccent(s.dataset.color);
      syncSwatches();
      await saveSettings();
    });
  });
  const customColor = document.getElementById('cfg-accent-custom');
  customColor.addEventListener('input', async () => {
    applyAccent(customColor.value);
    syncSwatches();
    await saveSettings();
  });

  // Toggle switches (24h, seconds, searchNewTab)
  const toggleBindings = [
    ['cfg-24h',           'use24Hour',    () => tick()],
    ['cfg-seconds',       'showSeconds',  () => tick()],
    ['cfg-search-newtab', 'searchNewTab', null],
  ];
  toggleBindings.forEach(([id, key, cb]) => {
    document.getElementById(id).addEventListener('change', async e => {
      state.settings[key] = e.target.checked;
      await saveSettings();
      if (cb) cb();
    });
  });

  // Search engine select
  document.getElementById('cfg-engine').addEventListener('change', async e => {
    state.settings.searchEngine = e.target.value;
    document.getElementById('search-engine').value = e.target.value;
    await saveSettings();
  });

  // Max tabs select
  document.getElementById('cfg-max-tabs').addEventListener('change', async e => {
    state.settings.maxTabs = parseInt(e.target.value);
    await saveSettings();
    loadTabs();
  });

  // Widget toggles
  ['search','links','weather','todo','tabs'].forEach(id => {
    document.getElementById(`widget-${id}`).addEventListener('change', e => {
      if (e.target.checked) {
        state.layout.hidden = state.layout.hidden.filter(h => h !== id);
      } else {
        if (!state.layout.hidden.includes(id)) state.layout.hidden.push(id);
      }
      saveLayout();
      applyLayout();
    });
  });

  // Import bookmarks button
  document.getElementById('import-bookmarks-btn').addEventListener('click', () => {
    close();
    openBookmarkModal();
  });
}

function syncSettingsPanel() {
  const s = state.settings;
  document.getElementById('cfg-name').value = s.name;
  document.getElementById('cfg-engine').value = s.searchEngine;
  document.getElementById('cfg-max-tabs').value = String(s.maxTabs);
  document.getElementById('cfg-24h').checked = s.use24Hour;
  document.getElementById('cfg-seconds').checked = s.showSeconds;
  document.getElementById('cfg-search-newtab').checked = s.searchNewTab;
  syncSettingsSegmented();
  syncSwatches();
  syncSettingsWidgetToggles();
}

function syncSettingsSegmented() {
  const s = state.settings;
  document.querySelectorAll('.seg-btn').forEach(btn => {
    const val = btn.dataset.cfg === 'linkCols'
      ? String(s[btn.dataset.cfg])
      : s[btn.dataset.cfg];
    btn.classList.toggle('active', val === btn.dataset.val);
  });
}

function syncSwatches() {
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === state.settings.accent);
  });
  document.getElementById('cfg-accent-custom').value = state.settings.accent;
}

function syncSettingsWidgetToggles() {
  ['search','links','weather','todo','tabs'].forEach(id => {
    const el = document.getElementById(`widget-${id}`);
    if (el) el.checked = !state.layout.hidden.includes(id);
  });
}

// ── Reset Settings ─────────────────────────────────────

function initResetModal() {
  const modal = document.getElementById('reset-modal');
  document.getElementById('reset-settings-btn').addEventListener('click', () => {
    modal.classList.add('open');
  });
  document.getElementById('cancel-reset-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  document.getElementById('confirm-reset-btn').addEventListener('click', async () => {
    state.settings = { ...DEFAULT_SETTINGS };
    state.layout   = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    await saveSettings();
    await saveLayout();
    applyTheme();
    applyAccent(state.settings.accent);
    applyLayout();
    syncSettingsPanel();
    renderLinks();
    tick();
    modal.classList.remove('open');
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
}

// ── Add Link Modal ─────────────────────────────────────

function initAddLinkModal() {
  const modal   = document.getElementById('add-link-modal');
  const nameIn  = document.getElementById('link-name-input');
  const urlIn   = document.getElementById('link-url-input');

  const open  = () => { modal.classList.add('open'); nameIn.focus(); };
  const close = () => {
    modal.classList.remove('open');
    nameIn.value = '';
    urlIn.value  = '';
  };

  document.getElementById('add-link-btn').addEventListener('click', open);
  document.getElementById('add-link-inline-btn').addEventListener('click', open);
  document.getElementById('cancel-link-btn').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  const save = async () => {
    const name = nameIn.value.trim();
    let   url  = urlIn.value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    state.links.push({ id: Date.now(), name, url });
    await saveLinks();
    renderLinks();
    close();
  };

  document.getElementById('save-link-btn').addEventListener('click', save);
  [nameIn, urlIn].forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  save();
      if (e.key === 'Escape') close();
    });
  });
}

// ── Bookmark Import ────────────────────────────────────

function initBookmarkModal() {
  const modal = document.getElementById('bookmark-modal');

  document.getElementById('cancel-bookmark-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  document.getElementById('bookmark-search').addEventListener('input', e => {
    filterBookmarkTree(e.target.value.toLowerCase());
    updateBookmarkCount();
  });

  document.getElementById('bookmark-select-all').addEventListener('click', () => {
    modal.querySelectorAll('.bm-item input[type="checkbox"]').forEach(cb => {
      if (!cb.closest('.bm-item').classList.contains('filtered-out')) cb.checked = true;
    });
    updateBookmarkCount();
  });

  document.getElementById('bookmark-deselect-all').addEventListener('click', () => {
    modal.querySelectorAll('.bm-item input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateBookmarkCount();
  });

  document.getElementById('import-bookmark-btn').addEventListener('click', async () => {
    const checked = modal.querySelectorAll('.bm-item input[type="checkbox"]:checked');
    checked.forEach(cb => {
      const url  = cb.dataset.url;
      const name = cb.dataset.name || new URL(url).hostname;
      if (!state.links.some(l => l.url === url)) {
        state.links.push({ id: Date.now() + Math.random(), name, url });
      }
    });
    await saveLinks();
    renderLinks();
    modal.classList.remove('open');
  });
}

async function openBookmarkModal() {
  const modal = document.getElementById('bookmark-modal');
  const tree  = document.getElementById('bookmark-tree');
  tree.innerHTML = '<p class="loading-text" style="padding:12px">Loading bookmarks&hellip;</p>';
  document.getElementById('bookmark-search').value = '';
  document.getElementById('bookmark-selected-count').textContent = '';
  modal.classList.add('open');

  try {
    if (!ext.bookmarks) throw new Error('No bookmarks API');
    const roots = await ext.bookmarks.getTree();
    tree.innerHTML = '';
    // roots[0] is the root node; its children are Toolbar, Menu, Other
    (roots[0]?.children ?? []).forEach(node => {
      const el = renderBookmarkNode(node, 0);
      if (el) tree.appendChild(el);
    });

    // Count updates on checkbox change
    tree.addEventListener('change', updateBookmarkCount);
    updateBookmarkCount();
  } catch {
    tree.innerHTML = '<p class="weather-error" style="padding:12px">Could not load bookmarks. Make sure the <code>bookmarks</code> permission is granted.</p>';
  }
}

function renderBookmarkNode(node, depth) {
  if (node.url) {
    // Bookmark item
    const row = document.createElement('label');
    row.className = 'bm-item';
    row.dataset.title = (node.title || node.url).toLowerCase();

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.url  = node.url;
    cb.dataset.name = node.title || '';

    let hostname = '';
    try { hostname = new URL(node.url).hostname; } catch {}
    const img = document.createElement('img');
    img.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
    img.alt = '';
    img.onerror = () => img.remove();

    const span = document.createElement('span');
    span.textContent = node.title || node.url;
    span.title = node.url;

    row.append(cb, img, span);
    return row;
  }

  if (node.children && node.children.length > 0) {
    const folder = document.createElement('div');
    folder.className = 'bm-folder';

    if (node.title) {
      const header = document.createElement('div');
      header.className = 'bm-folder-header';
      header.style.paddingLeft = `${depth * 14 + 10}px`;
      header.innerHTML = `<span class="fold-icon">▾</span><span>📁 ${esc(node.title)}</span>`;
      header.addEventListener('click', () => folder.classList.toggle('collapsed'));
      folder.appendChild(header);
    }

    const children = document.createElement('div');
    children.className = 'bm-children';
    let hasItems = false;
    node.children.forEach(child => {
      const el = renderBookmarkNode(child, node.title ? depth + 1 : depth);
      if (el) { children.appendChild(el); hasItems = true; }
    });

    if (!hasItems) return null;
    folder.appendChild(children);
    return folder;
  }

  return null;
}

function filterBookmarkTree(query) {
  document.querySelectorAll('.bm-item').forEach(item => {
    const match = !query || item.dataset.title?.includes(query);
    item.classList.toggle('filtered-out', !match);
  });
}

function updateBookmarkCount() {
  const total = document.querySelectorAll('.bm-item input[type="checkbox"]:checked').length;
  const el = document.getElementById('bookmark-selected-count');
  el.textContent = total > 0 ? `${total} selected` : '';
}

// ── Utilities ──────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
