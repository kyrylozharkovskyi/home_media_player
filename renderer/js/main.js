/* global api, i18n */

let PORT          = 3847;
let allMovies     = [];
let allFilms      = [];
let allGenres     = [];
let activeGenre   = '';
let watchProgress = {};
let scanFolders   = [];
let mamaFolders   = [];
let groupFolders  = [];
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function t(key) { return i18n.t(key); }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  // Language button: shows icon + "Мова/Mowa" in current language
  const labelEl = document.getElementById('lang-label-text');
  if (labelEl) labelEl.textContent = t('mova');
  document.documentElement.lang = i18n.getLang();
}

// ── Language toggle ───────────────────────────────────────────────────────────
async function initLang() {
  const saved = await api.getSettings('ui_lang');
  if (saved && saved !== i18n.getLang()) i18n.setLang(saved);
  applyTranslations();
}

document.getElementById('lang-btn').addEventListener('click', async () => {
  const next = i18n.getLang() === 'uk' ? 'pl' : 'uk';
  i18n.setLang(next);
  await api.saveSettings('ui_lang', next);
  applyTranslations();
  renderContinue(lastWatched);
  renderRecent(lastRecent);
  renderMovies(allFilms);
  renderSeries(lastSeries);
  renderGenreChips();
  renderFilms();
  renderMama();
  renderHistory();
  groupFolders.forEach(fp => renderGroup(fp));
});

// ── Mama ──────────────────────────────────────────────────────────────────────
async function renderMama() {
  const [mamaMovies, mamaRecent] = await Promise.all([
    api.getMamaMovies(),
    api.getMamaRecent(),
  ]);

  // New additions row
  const newSec = document.getElementById('mama-new-section');
  const newRow = document.getElementById('mama-new-row');
  const newCnt = document.getElementById('mama-new-count');
  if (mamaRecent.length) {
    newSec.style.display = 'block';
    newCnt.textContent   = mamaRecent.length;
    newRow.innerHTML     = mamaRecent.map(m => movieCardHTML(m, true)).join('');
    bindCardClicks(newRow);
    syncCarousel('mama-new-row');
  } else {
    newSec.style.display = 'none';
  }

  // All mama movies grid
  const grid = document.getElementById('mama-grid');
  if (!mamaMovies.length) {
    grid.innerHTML = emptyState('fas fa-heart', t('mama_empty'));
    return;
  }
  grid.innerHTML = mamaMovies.map(m => movieCardHTML(m, false)).join('');
  bindCardClicks(grid);
}

// ── Window controls ───────────────────────────────────────────────────────────
document.getElementById('btn-min').addEventListener('click',   () => api.windowControls.minimize());
document.getElementById('btn-max').addEventListener('click',   () => api.windowControls.maximize());
document.getElementById('btn-close').addEventListener('click', () => api.windowControls.close());

// ── State ─────────────────────────────────────────────────────────────────────
let lastWatched = null;
let lastRecent  = [];
let lastSeries  = [];

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  PORT = await api.getServerPort();
  await initLang();

  // Pre-load group folders so tabs exist before bindNav attaches delegation
  const rawGroup = await api.getSettings('group_folders');
  groupFolders = rawGroup ? JSON.parse(rawGroup) : [];
  renderGroupTabs();

  await refresh();
  bindNav();
  bindSearch();
  bindSettings();
  bindWheelScroll();
  bindCarousels();
  bindHistory();
  api.onScanComplete(() => {
    showToast(t('scan_complete_toast'));
    refresh();
  });
})();

async function refresh() {
  const [movies, recent, last, series, genres] = await Promise.all([
    api.getMovies(),
    api.getRecent(),
    api.getLastWatched(),
    api.getSeries(),
    api.getGenres(),
  ]);

  allMovies  = movies;
  allFilms   = movies.filter(m => !m.is_series);
  allGenres  = genres;
  lastWatched = last;
  lastSeries  = series;

  // Filter recent to last 7 days only
  lastRecent = recent.filter(m => Date.now() - (m.file_mtime || 0) < ONE_WEEK_MS);

  watchProgress = {};
  await Promise.all(movies.map(async m => {
    const p = await api.getWatchProgress(m.id);
    if (p && p.position > 0) watchProgress[m.id] = p;
  }));

  renderContinue(last);
  renderRecent(lastRecent);
  renderMovies(allFilms);
  renderSeries(series);
  renderGenreChips();
  renderFilms();
  renderMama();
  renderHistory();
  groupFolders.forEach(fp => renderGroup(fp));

  const sfEl  = document.getElementById('stat-films');
  const ssEl  = document.getElementById('stat-series');
  const sfiEl = document.getElementById('stat-files');
  if (sfEl)  sfEl.textContent  = allFilms.length;
  if (ssEl)  ssEl.textContent  = series.length;
  if (sfiEl) api.getTotalCount().then(n => { sfiEl.textContent = n; });
}

// ── Horizontal scroll (wheel + carousel arrows) ───────────────────────────────
function bindWheelScroll() {
  ['new-row', 'mama-new-row'].forEach(id => {
    const row = document.getElementById(id);
    if (!row) return;
    row.addEventListener('wheel', e => {
      if (e.deltaY !== 0) { e.preventDefault(); row.scrollLeft += e.deltaY * 1.2; }
    }, { passive: false });
  });
}

function bindCarousels() {
  [
    { row: 'new-row',      prev: 'new-prev',       next: 'new-next' },
    { row: 'mama-new-row', prev: 'mama-new-prev',  next: 'mama-new-next' },
  ].forEach(({ row: rowId, prev: prevId, next: nextId }) => {
    const row  = document.getElementById(rowId);
    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    if (!row || !prev || !next) return;

    const STEP = 460;
    prev.addEventListener('click', () => row.scrollBy({ left: -STEP, behavior: 'smooth' }));
    next.addEventListener('click', () => row.scrollBy({ left:  STEP, behavior: 'smooth' }));

    const sync = () => {
      const atStart = row.scrollLeft <= 2;
      const atEnd   = row.scrollLeft >= row.scrollWidth - row.clientWidth - 2;
      prev.classList.toggle('hidden', atStart);
      next.classList.toggle('hidden', atEnd);
    };
    row.addEventListener('scroll', sync, { passive: true });
    // re-sync after cards are painted
    new ResizeObserver(sync).observe(row);
  });
}

function syncCarousel(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.dispatchEvent(new Event('scroll'));
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function bindNav() {
  // Event delegation so dynamically added group tabs also work
  document.querySelector('.nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const page = document.getElementById(`page-${btn.dataset.page}`);
    if (page) page.classList.add('active');
  });
}

// ── Group tabs ────────────────────────────────────────────────────────────────
function groupTabId(fp) {
  return 'group-' + fp.replace(/[^a-zA-Z0-9]/g, '_');
}

function renderGroupTabs() {
  // Remove previously inserted group tabs and pages
  document.querySelectorAll('.nav-btn-group').forEach(b => b.remove());
  document.querySelectorAll('.page-group').forEach(p => p.remove());

  const nav      = document.querySelector('.nav');
  const settBtn  = nav.querySelector('[data-page="settings"]');
  const content  = document.querySelector('.content');

  groupFolders.forEach(fp => {
    const id    = groupTabId(fp);
    const label = fp.split(/[\\/]/).filter(Boolean).pop() || fp;

    const btn = document.createElement('button');
    btn.className    = 'nav-btn nav-btn-group';
    btn.dataset.page = id;
    btn.innerHTML    = `<i class="fas fa-layer-group"></i> <span>${esc(label)}</span>`;
    nav.insertBefore(btn, settBtn);

    const page = document.createElement('div');
    page.className = 'page page-group';
    page.id        = `page-${id}`;
    page.innerHTML = `
      <div class="section-title">
        <i class="fas fa-layer-group"></i>
        <span>${esc(label)}</span>
      </div>
      <div id="${id}-content"></div>`;
    content.appendChild(page);
  });
}

async function renderGroup(fp) {
  const id   = groupTabId(fp);
  const cont = document.getElementById(`${id}-content`);
  if (!cont) return;

  const { groups, standalones } = await api.getGroupData(fp);

  if (!groups.length && !standalones.length) {
    cont.innerHTML = emptyState('fas fa-layer-group', t('group_empty'));
    return;
  }

  let html = groups.map(g => `
    <div class="series-group open" data-series="${esc(g.name)}">
      <div class="series-header">
        <span class="series-chevron"><i class="fas fa-chevron-right"></i></span>
        <span class="series-name">${esc(g.name)}</span>
        <span class="series-count">${g.episodes.length} ${t('episodes')}</span>
      </div>
      <div class="series-body">
        <div class="grid">${g.episodes.map(m => movieCardHTML(m, false)).join('')}</div>
      </div>
    </div>`).join('');

  if (standalones.length) {
    html += `
      <div class="section-title" style="margin-top:${groups.length ? '24px' : '0'}">
        <i class="fas fa-film"></i>
        <span>${t('movies_title')}</span>
      </div>
      <div class="grid">${standalones.map(m => movieCardHTML(m, false)).join('')}</div>`;
  }

  cont.innerHTML = html;
  cont.querySelectorAll('.series-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
  bindCardClicks(cont);
}

// ── Search ────────────────────────────────────────────────────────────────────
function bindSearch() {
  const input = document.getElementById('search');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const results = q ? await api.getMovies(q) : allMovies;
      renderMovies(results.filter(m => !m.is_series));
    }, 200);
  });
}

// ── Continue Watching ─────────────────────────────────────────────────────────
function renderContinue(last) {
  const sec       = document.getElementById('continue-section');
  const container = document.getElementById('continue-card');
  if (!last || last.position < 5) { sec.style.display = 'none'; return; }

  sec.style.display = 'block';
  const el = sec.querySelector('[data-i18n="continue_title"]');
  if (el) el.textContent = t('continue_title');

  const pct      = last.duration > 0 ? Math.min((last.position / last.duration) * 100, 100) : 0;
  const timeLeft = last.duration > 0 ? formatTime(last.duration - last.position) : '';

  container.innerHTML = `
    <div class="continue-card" data-id="${last.id}">
      <img class="continue-thumb"
           src="http://127.0.0.1:${PORT}/thumb/${last.id}"
           alt="${esc(last.title)}" loading="lazy">
      <div class="continue-info">
        <div class="continue-title">${esc(last.title)}</div>
        <div class="continue-progress-bar">
          <div class="continue-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="continue-time">${t('time_left')} ${timeLeft}</div>
      </div>
      <div class="continue-play"><i class="fas fa-play"></i></div>
    </div>`;

  container.querySelector('.continue-card').addEventListener('click', () => openPlayer(last.id));
}

// ── Recent — only movies from last 7 days ─────────────────────────────────────
function renderRecent(movies) {
  const sec = document.getElementById('new-section');
  const row = document.getElementById('new-row');
  const cnt = document.getElementById('new-count');
  if (!movies.length) { sec.style.display = 'none'; return; }

  sec.style.display = 'block';
  const titleEl = sec.querySelector('[data-i18n="new_title"]');
  if (titleEl) titleEl.textContent = t('new_title');
  cnt.textContent = movies.length;

  row.innerHTML = movies.map(m => movieCardHTML(m, true)).join('');
  bindCardClicks(row);
  syncCarousel('new-row');
}

// ── Movies Grid (home page) ───────────────────────────────────────────────────
function renderMovies(movies) {
  const grid    = document.getElementById('movies-grid');
  const titleEl = document.querySelector('[data-i18n="movies_title"]');
  if (titleEl) titleEl.textContent = t('movies_title');

  if (!movies.length) {
    grid.innerHTML = emptyState('fas fa-film', t('empty_movies'));
    return;
  }
  grid.innerHTML = movies.map(m => movieCardHTML(m, false)).join('');
  bindCardClicks(grid);
}

// ── Genre chips ───────────────────────────────────────────────────────────────
function renderGenreChips() {
  const container = document.getElementById('genre-chips');
  if (!container) return;

  container.innerHTML = `
    <button class="genre-chip ${activeGenre === '' ? 'active' : ''}" data-genre="">
      <i class="fas fa-border-all"></i>
      <span>${t('all_genres')}</span>
    </button>
    ${allGenres.map(g => `
      <button class="genre-chip ${activeGenre === g ? 'active' : ''}" data-genre="${esc(g)}">
        ${genreIcon(g)} ${esc(g)}
      </button>`).join('')}`;

  container.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeGenre = chip.dataset.genre;
      renderGenreChips();
      renderFilms();
    });
  });
}

function genreIcon(genre) {
  const g = genre.toLowerCase();
  if (g.includes('horror') || g.includes('жах'))   return '<i class="fas fa-ghost"></i>';
  if (g.includes('comedy') || g.includes('комед'))  return '<i class="fas fa-laugh"></i>';
  if (g.includes('action') || g.includes('бойов'))  return '<i class="fas fa-fist-raised"></i>';
  if (g.includes('drama')  || g.includes('драм'))   return '<i class="fas fa-masks-theater"></i>';
  if (g.includes('sci')    || g.includes('фант'))   return '<i class="fas fa-rocket"></i>';
  if (g.includes('crime')  || g.includes('крим'))   return '<i class="fas fa-user-secret"></i>';
  if (g.includes('doc')    || g.includes('докум'))  return '<i class="fas fa-book-open"></i>';
  if (g.includes('anim'))                            return '<i class="fas fa-dragon"></i>';
  if (g.includes('thriller') || g.includes('трил')) return '<i class="fas fa-eye"></i>';
  if (g.includes('romance')  || g.includes('роман')) return '<i class="fas fa-heart"></i>';
  if (g.includes('western')  || g.includes('вест')) return '<i class="fas fa-hat-cowboy"></i>';
  if (g.includes('war')    || g.includes('вій'))    return '<i class="fas fa-medal"></i>';
  return '<i class="fas fa-film"></i>';
}

// ── Films tab ─────────────────────────────────────────────────────────────────
function renderFilms() {
  const grid = document.getElementById('films-grid');
  if (!grid) return;

  const movies = activeGenre
    ? allFilms.filter(m => m.genre &&
        String(m.genre).split(',').map(g => g.trim()).includes(activeGenre))
    : allFilms;

  if (!movies.length) {
    grid.innerHTML = emptyState('fas fa-film', t('empty_movies'));
    return;
  }
  grid.innerHTML = movies.map(m => movieCardHTML(m, false)).join('');
  bindCardClicks(grid);
}

// ── Series — open by default ──────────────────────────────────────────────────
function renderSeries(seriesList) {
  const container = document.getElementById('series-list');
  const titleEl   = document.querySelector('[data-i18n="nav_series"]');
  if (titleEl) titleEl.textContent = t('nav_series');

  if (!seriesList.length) {
    container.innerHTML = emptyState('fas fa-tv', t('empty_series'));
    return;
  }

  container.innerHTML = seriesList.map(series => {
    const episodeCount = series.episodes.length;
    const bySeasons    = groupBy(series.episodes, e => e.season);

    const seasonsHTML = Object.entries(bySeasons).map(([season, eps]) => `
      <div class="season-label">${t('season')} ${season}</div>
      <div class="grid">${eps.map(m => movieCardHTML(m, false)).join('')}</div>
    `).join('');

    return `
      <div class="series-group open" data-series="${esc(series.name)}">
        <div class="series-header">
          <span class="series-chevron"><i class="fas fa-chevron-right"></i></span>
          <span class="series-name">${esc(series.name)}</span>
          <span class="series-count">${episodeCount} ${t('episodes')} · ${series.seasons.length} ${t('seasons')}</span>
        </div>
        <div class="series-body">${seasonsHTML}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.series-header').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
  bindCardClicks(container);
}

// ── Watched check ────────────────────────────────────────────────────────────
function isWatched(m) {
  const p = watchProgress[m.id];
  return p && m.duration > 0 && p.position >= m.duration * 0.7;
}

// ── Card HTML ─────────────────────────────────────────────────────────────────
function movieCardHTML(m, isNew) {
  const prog    = watchProgress[m.id];
  const pct     = (prog && m.duration > 0) ? Math.min((prog.position / m.duration) * 100, 100) : 0;
  const watched = isWatched(m);
  const isNewFile = Date.now() - (m.file_mtime || 0) < ONE_WEEK_MS;
  const dur  = m.duration ? formatTime(m.duration) : '';
  const meta = [m.year, dur].filter(Boolean).join(' · ');

  return `
  <div class="card ${watched ? 'is-watched' : ''}" data-id="${m.id}">
    <div class="card-thumb-wrap">
      <img class="card-thumb" src="http://127.0.0.1:${PORT}/thumb/${m.id}"
           alt="${esc(m.title)}" loading="lazy">
      <div class="card-overlay">
        <div class="play-icon"><i class="fas fa-play"></i></div>
      </div>
      <div class="card-badges">
        ${isNewFile ? `<span class="badge-new">${t('badge_new')}</span>` : ''}
        ${m.has_subtitles ? `<span class="badge-sub">${t('badge_sub')}</span>` : ''}
        ${watched ? `<span class="badge-watched"><i class="fas fa-check"></i></span>` : ''}
      </div>
      ${pct > 2 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
    <div class="card-info">
      <div class="card-title">${esc(m.title)}</div>
      <div class="card-meta">${esc(meta)}</div>
    </div>
  </div>`;
}

function bindCardClicks(parent) {
  parent.querySelectorAll('.card[data-id]').forEach(card => {
    card.addEventListener('click', () => openPlayer(card.dataset.id));
  });
}

// ── History ───────────────────────────────────────────────────────────────────
async function renderHistory() {
  const [watched, unwatched] = await Promise.all([
    api.getHistory(),
    api.getUnwatched(),
  ]);

  const uwList = document.getElementById('hist-unwatched-list');
  const wList  = document.getElementById('hist-watched-list');
  if (!uwList || !wList) return;

  uwList.innerHTML = unwatched.length
    ? `<div class="grid">${unwatched.map(m => historyCardHTML(m, false)).join('')}</div>`
    : emptyState('fas fa-clock', t('hist_empty_unwatched'));

  wList.innerHTML = watched.length
    ? `<div class="grid">${watched.map(m => historyCardHTML(m, true)).join('')}</div>`
    : emptyState('fas fa-check-circle', t('hist_empty_watched'));

  bindHistoryClicks(uwList);
  bindHistoryClicks(wList);
}

function historyCardHTML(m, watched) {
  const pct = (m.position && m.duration > 0) ? Math.min((m.position / m.duration) * 100, 100) : 0;
  const dur  = m.duration ? formatTime(m.duration) : '';
  const meta = [m.year, dur].filter(Boolean).join(' · ');
  const deletedBadge = m.file_deleted
    ? `<span class="badge-deleted"><i class="fas fa-trash-alt"></i></span>` : '';
  const watchedBadge = watched
    ? `<span class="badge-watched"><i class="fas fa-check"></i></span>` : '';

  return `
  <div class="card hist-card ${m.file_deleted ? 'card-deleted' : ''} ${watched ? 'is-watched' : ''}"
       data-id="${m.id}" data-deleted="${m.file_deleted ? '1' : '0'}">
    <div class="card-thumb-wrap">
      <img class="card-thumb" src="http://127.0.0.1:${PORT}/thumb/${m.id}"
           alt="${esc(m.title)}" loading="lazy">
      <div class="card-overlay">
        <div class="play-icon">
          <i class="fas ${m.file_deleted ? 'fa-trash-alt' : 'fa-play'}"></i>
        </div>
      </div>
      <div class="card-badges">${deletedBadge}${watchedBadge}</div>
      ${pct > 2 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
    <div class="card-info">
      <div class="card-title">${esc(m.title)}</div>
      <div class="card-meta">${esc(meta)}</div>
    </div>
  </div>`;
}

function bindHistoryClicks(parent) {
  parent.querySelectorAll('.hist-card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.deleted === '1') { showToast(t('hist_file_deleted')); return; }
      openPlayer(card.dataset.id);
    });
  });
}

function bindHistory() {
  const btns = document.querySelectorAll('.hist-tab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const list = btn.dataset.list;
      document.getElementById('hist-unwatched-list').style.display = list === 'unwatched' ? '' : 'none';
      document.getElementById('hist-watched-list').style.display   = list === 'watched'   ? '' : 'none';
    });
  });

  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (!window.confirm(t('clear_history_confirm'))) return;
    await api.clearHistory();
    watchProgress = {};
    await refresh();
    showToast(t('clear_history'));
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const [raw, rawMama, rawGroup] = await Promise.all([
    api.getSettings('scan_folders'),
    api.getSettings('mama_folders'),
    api.getSettings('group_folders'),
  ]);
  scanFolders  = raw      ? JSON.parse(raw)      : [];
  mamaFolders  = rawMama  ? JSON.parse(rawMama)  : [];
  groupFolders = rawGroup ? JSON.parse(rawGroup) : [];
  renderFolderList();
}

function renderFolderList() {
  const list = document.getElementById('folder-list');
  if (!scanFolders.length) {
    list.innerHTML = `<div style="color:var(--muted);font-size:12px">${t('no_folders')}</div>`;
    return;
  }
  list.innerHTML = scanFolders.map((f, i) => {
    const isMama  = mamaFolders.includes(f);
    const isGroup = groupFolders.includes(f);
    return `
    <div class="folder-item">
      <i class="fas fa-folder" style="color:var(--accent);flex-shrink:0"></i>
      <span class="folder-path">${esc(f)}</span>
      <button class="mama-toggle-btn ${isMama ? 'active' : ''}" data-path="${esc(f)}" title="Мама"><i class="fas fa-heart"></i> ${t('mama_label')}</button>
      <button class="group-toggle-btn ${isGroup ? 'active' : ''}" data-path="${esc(f)}" title="${t('group_label')}"><i class="fas fa-layer-group"></i> ${t('group_label')}</button>
      <button class="folder-remove" data-idx="${i}" title="Видалити"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');

  list.querySelectorAll('.mama-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.path;
      if (mamaFolders.includes(p)) {
        mamaFolders = mamaFolders.filter(x => x !== p);
      } else {
        mamaFolders.push(p);
      }
      await api.saveSettings('mama_folders', JSON.stringify(mamaFolders));
      renderFolderList();
      renderMama();
    });
  });

  list.querySelectorAll('.group-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.path;
      if (groupFolders.includes(p)) {
        groupFolders = groupFolders.filter(x => x !== p);
      } else {
        groupFolders.push(p);
      }
      await api.saveSettings('group_folders', JSON.stringify(groupFolders));
      renderFolderList();
      renderGroupTabs();
      groupFolders.forEach(fp => renderGroup(fp));
    });
  });

  list.querySelectorAll('.folder-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const removed = scanFolders[parseInt(btn.dataset.idx)];
      scanFolders.splice(parseInt(btn.dataset.idx), 1);
      mamaFolders  = mamaFolders.filter(x => x !== removed);
      groupFolders = groupFolders.filter(x => x !== removed);
      await Promise.all([
        api.markFolderDeleted(removed),
        api.saveSettings('scan_folders',  JSON.stringify(scanFolders)),
        api.saveSettings('mama_folders',  JSON.stringify(mamaFolders)),
        api.saveSettings('group_folders', JSON.stringify(groupFolders)),
      ]);
      renderFolderList();
      await refresh();
      renderGroupTabs();
      groupFolders.forEach(fp => renderGroup(fp));
    });
  });
}

function bindSettings() {
  loadSettings();

  document.getElementById('btn-add-folder').addEventListener('click', async () => {
    const folder = await api.selectFolder();
    if (!folder) return;
    if (!scanFolders.includes(folder)) {
      scanFolders.push(folder);
      await api.saveSettings('scan_folders', JSON.stringify(scanFolders));
      renderFolderList();
      showToast(t('folder_added'));
    }
  });

  document.getElementById('btn-scan').addEventListener('click', async () => {
    const btn    = document.getElementById('btn-scan');
    const status = document.getElementById('scan-status');
    btn.disabled = true;
    btn.querySelector('span').textContent = t('scanning');
    status.textContent = '';
    try {
      await api.scanNow();
      status.textContent = t('scan_done');
      await refresh();
    } catch {
      status.textContent = t('scan_err');
    }
    btn.disabled = false;
    btn.querySelector('span').textContent = t('scan_btn');
  });
}

// ── Player ────────────────────────────────────────────────────────────────────
function openPlayer(movieId) {
  api.openPlayer(movieId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyState(icon, msg) {
  return `<div class="empty-state">
    <div class="icon"><i class="${icon}"></i></div>
    <p>${esc(msg)}</p>
  </div>`;
}

function formatTime(secs) {
  secs = Math.floor(secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const k = fn(item) ?? 'Інше';
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
