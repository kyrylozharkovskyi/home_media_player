const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath  = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { upsertMovie, updateThumbnail, markFilesDeleted, THUMBS_DIR } = require('./db');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv',
  '.m4v', '.ts', '.m2ts', '.webm', '.ogv', '.3gp', '.rmvb', '.divx'
]);

function isVideo(fp) { return VIDEO_EXT.has(path.extname(fp).toLowerCase()); }

function thumbKey(fp) {
  return crypto.createHash('md5').update(fp).digest('hex') + '.jpg';
}

function probeFile(fp) {
  return new Promise((res, rej) => {
    ffmpeg.ffprobe(fp, (err, meta) => err ? rej(err) : res(meta));
  });
}

function makeThumbnail(fp, outPath, duration) {
  return new Promise(resolve => {
    const seekSec = Math.max(1, Math.min(duration * 0.1, 60));
    ffmpeg(fp)
      .inputOptions([`-ss ${seekSec}`])
      .outputOptions(['-vframes 1', '-vf scale=320:-1'])
      .output(outPath)
      .on('end',   () => resolve(outPath))
      .on('error', () => resolve(null))
      .run();
  });
}

// ── NFO metadata (Kodi/Plex format) ──────────────────────────────────────────
function getNFOPath(fp) {
  const candidates = [
    fp.replace(/\.\w+$/, '.nfo'),
    path.join(path.dirname(fp), 'movie.nfo'),
    path.join(path.dirname(fp), 'Movie.nfo'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function parseNFO(nfoPath) {
  try {
    const txt = fs.readFileSync(nfoPath, 'utf8');
    const get = tag => {
      const m = txt.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };
    const getAll = tag => {
      const re = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'gi');
      const results = []; let m;
      while ((m = re.exec(txt)) !== null) results.push(m[1].trim());
      return results;
    };
    return {
      title:    get('title'),
      year:     get('year')   ? parseInt(get('year'))  : null,
      genre:    getAll('genre').join(', ') || null,
      director: getAll('director').join(', ') || null,
      plot:     get('plot') || get('outline') || null,
      rating:   get('rating') ? parseFloat(get('rating')) : null,
    };
  } catch { return null; }
}

// ── Year extraction from filename ─────────────────────────────────────────────
function extractYear(filename) {
  // Match 4-digit year in common patterns: (2020) [2020] .2020. 2020.mkv
  const m = filename.match(/[(\[. ](\d{4})[)\]. ]/) ||
            filename.match(/[._-](\d{4})[._-]/) ||
            filename.match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1]);
  return (y >= 1900 && y <= new Date().getFullYear() + 2) ? y : null;
}

// ── Genre detection from directory names ──────────────────────────────────────
const KNOWN_GENRES = new Set([
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Science Fiction',
  'Thriller', 'Western', 'War', 'Biography', 'Sport', 'Musical', 'History',
  'Бойовик', 'Пригоди', 'Анімація', 'Комедія', 'Криміналдрама', 'Документальний',
  'Драма', 'Фентезі', 'Жахи', 'Містика', 'Романтика', 'Фантастика',
  'Трилер', 'Вестерн', 'Біографія'
]);

function genreFromDir(filePath, baseFolder) {
  const rel = path.relative(baseFolder, path.dirname(filePath));
  const parts = rel.split(path.sep);
  for (const part of parts) {
    const clean = part.trim();
    if (KNOWN_GENRES.has(clean)) return clean;
    // case-insensitive check
    for (const g of KNOWN_GENRES) {
      if (g.toLowerCase() === clean.toLowerCase()) return g;
    }
  }
  return null;
}

// ── Series detection ──────────────────────────────────────────────────────────
function detectSeries(fp, base) {
  const rel = path.relative(base, fp);
  const parts = rel.split(path.sep);

  if (parts.length >= 3) {
    const seriesName = parts[0];
    const seasonMatch = parts[1].match(/season\s*(\d+)|^s(\d+)$/i);
    if (seasonMatch) {
      const season = parseInt(seasonMatch[1] || seasonMatch[2]);
      const epMatch = path.basename(fp).match(/[se](\d{1,2})[ex](\d{1,2})|ep?\.?\s*(\d+)|(\d{2,3})\b/i);
      const episode = epMatch ? parseInt(epMatch[1] || epMatch[3] || epMatch[4]) : null;
      return { isSeries: true, seriesName, season, episode };
    }
  }

  if (parts.length >= 2) {
    const seriesName = parts[0];
    const base = path.basename(fp, path.extname(fp));
    const m = base.match(/S(\d+)E(\d+)/i) || base.match(/(\d+)x(\d+)/i);
    if (m) return { isSeries: true, seriesName, season: parseInt(m[1]), episode: parseInt(m[2]) };
  }

  return { isSeries: false, seriesName: null, season: null, episode: null };
}

function buildTitle(fp, info) {
  const base = path.basename(fp, path.extname(fp));
  if (!info.isSeries) return base;
  const s = String(info.season  || 0).padStart(2, '0');
  const e = String(info.episode || 0).padStart(2, '0');
  return `S${s}E${e} – ${base}`;
}

// ── Main file processor ───────────────────────────────────────────────────────
async function processFile(fp, baseFolder) {
  const stat = fs.statSync(fp);
  const info = detectSeries(fp, baseFolder);

  // Probe with FFmpeg
  let duration = 0, audioTracks = [], subtitleTracks = [], hasSubtitles = false;
  try {
    const meta  = await probeFile(fp);
    duration = meta.format.duration || 0;
    const streams = meta.streams || [];
    audioTracks = streams
      .filter(s => s.codec_type === 'audio')
      .map((s, i) => ({
        streamIndex: s.index, trackIndex: i,
        lang:  s.tags?.language || s.tags?.LANGUAGE || `Track ${i + 1}`,
        codec: s.codec_name,
        title: s.tags?.title || s.tags?.TITLE || null
      }));
    subtitleTracks = streams
      .filter(s => s.codec_type === 'subtitle')
      .map((s, i) => ({
        streamIndex: s.index, trackIndex: i,
        lang:  s.tags?.language || s.tags?.LANGUAGE || `Sub ${i + 1}`,
        codec: s.codec_name,
        title: s.tags?.title || s.tags?.TITLE || null
      }));
    hasSubtitles = subtitleTracks.length > 0;
  } catch { /* probe failed, continue */ }

  // External subtitles
  const extSubs = ['.srt', '.vtt', '.ass', '.ssa']
    .map(ext => fp.replace(path.extname(fp), ext))
    .filter(p => fs.existsSync(p));
  if (extSubs.length > 0) hasSubtitles = true;

  // NFO metadata
  const nfoMeta = (() => {
    const nfo = getNFOPath(fp);
    return nfo ? parseNFO(nfo) : null;
  })();

  // Year: NFO → filename → null
  const year = nfoMeta?.year || extractYear(path.basename(fp, path.extname(fp))) || null;

  // Genre: NFO → directory name → null
  const genre = nfoMeta?.genre || genreFromDir(fp, baseFolder) || null;

  const director = nfoMeta?.director || null;
  const plot     = nfoMeta?.plot     || null;
  const rating   = nfoMeta?.rating   || null;

  // Thumbnail
  const thumbOut = path.join(THUMBS_DIR, thumbKey(fp));

  const saved = upsertMovie({
    title:           nfoMeta?.title || buildTitle(fp, info),
    file_path:       fp,
    file_size:       stat.size,
    duration,
    thumbnail_path:  fs.existsSync(thumbOut) ? thumbOut : null,
    added_at:        Date.now(),
    file_mtime:      Math.floor(stat.mtimeMs),
    is_series:       info.isSeries ? 1 : 0,
    series_name:     info.seriesName,
    season:          info.season,
    episode:         info.episode,
    has_subtitles:   hasSubtitles ? 1 : 0,
    audio_tracks:    JSON.stringify(audioTracks),
    subtitle_tracks: JSON.stringify(subtitleTracks),
    year, genre, director, plot, rating
  });

  // Generate thumbnail in background
  if (!fs.existsSync(thumbOut) && duration > 2) {
    makeThumbnail(fp, thumbOut, duration)
      .then(out => { if (out) updateThumbnail(fp, out); })
      .catch(() => {});
  }
}

async function walkDir(dir, base, foundPaths) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fp, base, foundPaths);
    } else if (entry.isFile() && isVideo(fp)) {
      foundPaths.push(fp);
      try { await processFile(fp, base); }
      catch (e) { console.warn(`skip ${fp}: ${e.message}`); }
    }
  }
}

async function scanFolders(folders, onComplete) {
  const foundPaths = [];
  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    await walkDir(folder, folder, foundPaths);
  }
  markFilesDeleted(foundPaths, folders);
  if (onComplete) onComplete();
}

module.exports = { scanFolders, thumbKey, THUMBS_DIR };
