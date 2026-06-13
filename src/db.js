/**
 * JSON-based persistence — no native compilation required.
 * movies.json      — array of movie objects
 * progress.json    — { "<id>": { position, lastWatched } }
 * settings.json    — { "<key>": "<value>" }
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_DIR   = path.join(app.getPath('userData'), 'films-portal');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbnails');
const MOVIES_F   = path.join(DATA_DIR, 'movies.json');
const PROGRESS_F = path.join(DATA_DIR, 'progress.json');
const SETTINGS_F = path.join(DATA_DIR, 'settings.json');

let movies   = [];   // array of movie objects
let byPath   = {};   // file_path → movie (lookup)
let progress = {};   // id → { position, lastWatched }
let settings = {};   // key → value
let nextId   = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}

function saveMovies()   { fs.writeFileSync(MOVIES_F,   JSON.stringify({ nextId, movies }),  'utf8'); }
function saveProgress() { fs.writeFileSync(PROGRESS_F, JSON.stringify(progress), 'utf8'); }
function saveSettings() { fs.writeFileSync(SETTINGS_F, JSON.stringify(settings), 'utf8'); }

// ── Init ──────────────────────────────────────────────────────────────────────
function initDB() {
  for (const dir of [DATA_DIR, THUMBS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const raw = loadJSON(MOVIES_F, { nextId: 1, movies: [] });
  nextId   = raw.nextId || 1;
  movies   = raw.movies || [];
  byPath   = Object.fromEntries(movies.map(m => [m.file_path, m]));
  progress = loadJSON(PROGRESS_F, {});
  settings = loadJSON(SETTINGS_F, {});
}

// ── Group folder helpers ──────────────────────────────────────────────────────
function _groupNormalized() {
  try {
    const arr = settings['group_folders'] ? JSON.parse(settings['group_folders']) : [];
    return arr.map(f => { const n = path.normalize(f); return n.endsWith(path.sep) ? n : n + path.sep; });
  } catch { return []; }
}

function _inGroup(m, groupFolders) {
  const n = path.normalize(m.file_path);
  return groupFolders.some(f => n.startsWith(f));
}

// ── Movies ────────────────────────────────────────────────────────────────────
function getMovies(filter) {
  const gf = _groupNormalized();
  const base = m => !m.file_deleted && !_inGroup(m, gf);

  let list;
  if (filter) {
    const q = filter.toLowerCase();
    list = movies.filter(m => base(m) && (
      (m.title || '').toLowerCase().includes(q) ||
      (m.series_name || '').toLowerCase().includes(q)
    ));
  } else {
    list = movies.filter(base);
  }
  return list.slice().sort((a, b) => {
    const ka = (a.series_name || a.title || '').toLowerCase();
    const kb = (b.series_name || b.title || '').toLowerCase();
    if (ka !== kb) return ka < kb ? -1 : 1;
    if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
    return (a.episode || 0) - (b.episode || 0);
  });
}

function getSeries() {
  const gf  = _groupNormalized();
  const map = {};
  for (const m of movies) {
    if (!m.is_series || !m.series_name || m.file_deleted) continue;
    if (_inGroup(m, gf)) continue;
    if (!map[m.series_name]) map[m.series_name] = { name: m.series_name, seasons: new Set(), episodes: [] };
    map[m.series_name].seasons.add(m.season);
    map[m.series_name].episodes.push(m);
  }
  return Object.values(map)
    .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)
    .map(s => ({
      name: s.name,
      seasons: [...s.seasons].filter(Boolean).sort((a, b) => a - b),
      episodes: s.episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode))
    }));
}

function getRecentMovies(limit = 12) {
  const gf = _groupNormalized();
  return movies
    .filter(m => !m.file_deleted && !_inGroup(m, gf))
    .slice().sort((a, b) => (b.file_mtime || 0) - (a.file_mtime || 0))
    .slice(0, limit);
}

function getTotalCount() {
  return movies.filter(m => !m.file_deleted).length;
}

function getMovieById(id) {
  return movies.find(m => m.id === parseInt(id)) || null;
}

function upsertMovie(m) {
  const existing = byPath[m.file_path];
  if (existing) {
    Object.assign(existing, m);
    if (!m.thumbnail_path) existing.thumbnail_path = existing.thumbnail_path || null;
    saveMovies();
    return existing;
  } else {
    const movie = { id: nextId++, ...m };
    movies.push(movie);
    byPath[m.file_path] = movie;
    saveMovies();
    return movie;
  }
}

function updateThumbnail(filePath, thumbPath) {
  const m = byPath[filePath];
  if (m) { m.thumbnail_path = thumbPath; saveMovies(); }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function getSettings(key) { return settings[key] ?? null; }

function saveSettings(key, value) {
  settings[key] = value;
  const sf = saveSettingsFile;
  sf();
}
function saveSettingsFile() { fs.writeFileSync(SETTINGS_F, JSON.stringify(settings), 'utf8'); }

// ── Watch progress ────────────────────────────────────────────────────────────
function getWatchProgress(movieId) {
  const p = progress[String(movieId)];
  return p ? { movie_id: movieId, position: p.position, last_watched: p.lastWatched } : null;
}

function saveWatchProgress(movieId, position) {
  progress[String(movieId)] = { position, lastWatched: Date.now() };
  saveProgress();
}

function getLastWatched() {
  const entries = Object.entries(progress);
  if (!entries.length) return null;
  const [id, p] = entries.sort((a, b) => (b[1].lastWatched || 0) - (a[1].lastWatched || 0))[0];
  const movie = getMovieById(parseInt(id));
  if (!movie) return null;
  return { ...movie, position: p.position, last_watched: p.lastWatched };
}

function getGenres() {
  const genres = new Set();
  for (const m of movies) {
    if (m.genre) {
      String(m.genre).split(',').forEach(g => {
        const trimmed = g.trim();
        if (trimmed) genres.add(trimmed);
      });
    }
  }
  return [...genres].sort();
}

// ── Mama collection ───────────────────────────────────────────────────────────
function _mamaNormalized() {
  try {
    const raw = settings['mama_folders'];
    const arr = raw ? JSON.parse(raw) : [];
    return arr.map(f => {
      const n = path.normalize(f);
      return n.endsWith(path.sep) ? n : n + path.sep;
    });
  } catch { return []; }
}

function getMamaMovies() {
  const folders = _mamaNormalized();
  if (!folders.length) return [];
  return movies
    .filter(m => !m.file_deleted && folders.some(f => path.normalize(m.file_path).startsWith(f)))
    .sort((a, b) => (a.title || '').toLowerCase() < (b.title || '').toLowerCase() ? -1 : 1);
}

function getMamaRecent(limit = 12) {
  const folders = _mamaNormalized();
  if (!folders.length) return [];
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return movies
    .filter(m =>
      !m.file_deleted &&
      (m.file_mtime || 0) >= cutoff &&
      folders.some(f => path.normalize(m.file_path).startsWith(f))
    )
    .sort((a, b) => (b.file_mtime || 0) - (a.file_mtime || 0))
    .slice(0, limit);
}

// ── History ───────────────────────────────────────────────────────────────────
function getHistory() {
  // All movies (including deleted) where progress >= 70% of duration
  return movies.filter(m => {
    const p = progress[String(m.id)];
    if (!p || !p.position) return false;
    const dur = m.duration || 0;
    return dur > 0 && p.position >= dur * 0.7;
  }).map(m => ({
    ...m,
    position:     progress[String(m.id)].position,
    last_watched: progress[String(m.id)].lastWatched || 0
  })).sort((a, b) => b.last_watched - a.last_watched);
}

function getUnwatched() {
  // Movies started (<70% watched) that still exist
  return movies.filter(m => {
    if (m.file_deleted) return false;
    const p = progress[String(m.id)];
    if (!p || !p.position || p.position <= 0) return false;
    const dur = m.duration || 0;
    return dur <= 0 || p.position < dur * 0.7;
  }).map(m => ({
    ...m,
    position:     progress[String(m.id)].position,
    last_watched: progress[String(m.id)].lastWatched || 0
  })).sort((a, b) => b.last_watched - a.last_watched);
}

function factoryReset() {
  movies = [];
  byPath = {};
  nextId = 1;
  progress = {};
  settings = {};
  saveMovies();
  saveProgress();
  saveSettingsFile();
}

function markFolderDeleted(folderPath) {
  const norm = path.normalize(folderPath);
  const base = norm.endsWith(path.sep) ? norm : norm + path.sep;
  let changed = false;
  for (const m of movies) {
    if (!m.file_deleted && path.normalize(m.file_path).startsWith(base)) {
      m.file_deleted = true;
      changed = true;
    }
  }
  if (changed) saveMovies();
}

function clearHistory() {
  progress = {};
  saveProgress();
}

function markFilesDeleted(foundPaths, scannedFolders) {
  const pathSet   = new Set(foundPaths.map(p => path.normalize(p)));
  const normFolders = scannedFolders.map(f => {
    const n = path.normalize(f);
    return n.endsWith(path.sep) ? n : n + path.sep;
  });
  let changed = false;
  for (const m of movies) {
    const norm = path.normalize(m.file_path);
    const inScope = normFolders.some(f => norm.startsWith(f));
    if (!inScope) continue;
    const exists = pathSet.has(norm);
    if (!exists && !m.file_deleted) { m.file_deleted = true;  changed = true; }
    if (exists  &&  m.file_deleted) { m.file_deleted = false; changed = true; }
  }
  if (changed) saveMovies();
}

// ── Group collection — grouped by immediate subdirectory ─────────────────────
function getGroupData(folderPath) {
  const norm = path.normalize(folderPath);
  const base = norm.endsWith(path.sep) ? norm : norm + path.sep;

  const inFolder = movies.filter(m =>
    !m.file_deleted && path.normalize(m.file_path).startsWith(base)
  );

  // Split by first subdirectory level
  const subgroupMap = {};
  const standalones = [];
  for (const m of inFolder) {
    const rel   = path.normalize(m.file_path).slice(base.length);
    const parts = rel.split(path.sep);
    if (parts.length > 1) {
      const key = parts[0];
      if (!subgroupMap[key]) subgroupMap[key] = [];
      subgroupMap[key].push(m);
    } else {
      standalones.push(m);
    }
  }

  const groups = Object.entries(subgroupMap)
    .sort(([a], [b]) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
    .map(([name, items]) => ({
      name,
      episodes: items.sort((a, b) => {
        if ((a.season || 0) !== (b.season || 0)) return (a.season || 0) - (b.season || 0);
        if ((a.episode || 0) !== (b.episode || 0)) return (a.episode || 0) - (b.episode || 0);
        return (a.title || '').toLowerCase() < (b.title || '').toLowerCase() ? -1 : 1;
      })
    }));

  return {
    groups,
    standalones: standalones.sort((a, b) =>
      (a.title || '').toLowerCase() < (b.title || '').toLowerCase() ? -1 : 1
    )
  };
}

module.exports = {
  initDB, getMovies, getSeries, getRecentMovies, getMovieById,
  upsertMovie, updateThumbnail, getSettings, saveSettings, getGenres,
  getMamaMovies, getMamaRecent,
  getWatchProgress, saveWatchProgress, getLastWatched,
  getHistory, getUnwatched, markFilesDeleted,
  getGroupData, getTotalCount,
  markFolderDeleted, clearHistory, factoryReset,
  DATA_DIR, THUMBS_DIR
};
