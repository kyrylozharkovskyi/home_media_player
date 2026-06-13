/* global api, i18n, videojs */

const params  = new URLSearchParams(location.search);
const movieId = parseInt(params.get('id'));

let PORT            = 3847;
let movie           = null;
let player          = null;
let audioTracks     = [];
let subtitleTracks  = [];
let currentAudio    = 0;
let basePosition    = 0;
let isSeekReloading = false;
let hideTimer       = null;
let saveTimer       = null;

const playerWrap  = document.getElementById('player-wrap');
const titleEl     = document.getElementById('player-title');
const backBtn     = document.getElementById('back-btn');
const btnCloseApp = document.getElementById('btn-close-app');
const btnCC       = document.getElementById('btn-cc');
const btnFS       = document.getElementById('btn-fs');
const fsIcon      = document.getElementById('fs-icon');
const fsLabel     = document.getElementById('fs-label');
const movaLabel   = document.getElementById('mova-label');
const movaPopup   = document.getElementById('mova-popup');
const btnMova     = document.getElementById('btn-mova');

// ── Back ─────────────────────────────────────────────────────────────────────
function goBack() {
  try { if (player) api.saveWatchProgress(movieId, Math.floor(actualTime())); } catch {}
  api.closePlayer();
}

backBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  e.preventDefault();
  goBack();
}, true);

btnCloseApp.addEventListener('click', () => api.closePlayer());

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  PORT = await api.getServerPort();

  const savedLang = await api.getSettings('ui_lang');
  if (savedLang) i18n.setLang(savedLang);
  applyPlayerTranslations();

  movie = await api.getMovieInfo(movieId);
  if (!movie) { titleEl.textContent = i18n.t('not_found'); return; }

  titleEl.textContent = movie.title;
  document.title      = movie.title + ' – ' + i18n.t('app_title');

  audioTracks    = tryParse(movie.audio_tracks,    []);
  subtitleTracks = tryParse(movie.subtitle_tracks, []);

  player = videojs('vid', {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fill: true,
    fluid: false,
    responsive: false,
    playbackRates: [0.5, 1, 1.25, 1.5, 2],
    userActions: { hotkeys: false },
    controlBar: { pictureInPictureToggle: false },
  });

  const saved    = await api.getWatchProgress(movieId);
  const startPos = (saved && saved.position > 5) ? saved.position : 0;
  loadVideo(startPos);

  player.on('seeking',          onSeek);
  player.on('timeupdate',       onTimeUpdate);
  player.on('ended',            () => api.saveWatchProgress(movieId, 0));
  player.on('fullscreenchange', syncFSButton);

  setupMova();
  setupCC();
  setupFSButton();
  setupKeyboard();
  setupUIHide();
  setupSeekbar();
  setupScrollVolume();
})();

// ── Native format check ───────────────────────────────────────────────────────
function isNativeFormat() {
  const ext = (movie.file_path.split('.').pop() || '').toLowerCase();
  return ['mp4', 'webm', 'ogv', 'm4v'].includes(ext) && currentAudio === 0;
}

// ── Load source ───────────────────────────────────────────────────────────────
function loadVideo(seekSec) {
  if (isNativeFormat()) {
    basePosition = 0;
    const ext  = movie.file_path.split('.').pop().toLowerCase();
    const type = ext === 'webm' ? 'video/webm' : 'video/mp4';
    player.src({ src: `http://127.0.0.1:${PORT}/stream/${movieId}`, type });
    if (seekSec > 0) {
      player.one('loadedmetadata', () => { player.currentTime(seekSec); player.play().catch(()=>{}); });
    } else {
      player.one('canplay', () => player.play().catch(()=>{}));
    }
    return;
  }
  basePosition    = seekSec;
  isSeekReloading = true;
  player.src({ src: `http://127.0.0.1:${PORT}/stream/${movieId}?seek=${Math.floor(seekSec)}&audio=${currentAudio}`, type: 'video/mp4' });
  player.one('loadstart', () => setTimeout(() => { isSeekReloading = false; }, 300));
  player.one('canplay',   () => player.play().catch(()=>{}));
}

function actualTime()  { return basePosition + (player ? player.currentTime() : 0); }

function seek(targetSec) {
  const dur = movie.duration || 9999;
  targetSec = Math.max(0, Math.min(targetSec, dur - 1));
  isNativeFormat() ? player.currentTime(targetSec) : loadVideo(targetSec);
}

function onSeek() {
  if (isSeekReloading || isNativeFormat()) return;
  loadVideo(basePosition + player.currentTime());
}

function onTimeUpdate() {
  updateSeekUI(actualTime());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const pos = actualTime();
    if (pos > 5) api.saveWatchProgress(movieId, pos);
  }, 5000);
}

// ── Мова (audio) popup — opens upward ────────────────────────────────────────
function setupMova() {
  if (audioTracks.length <= 1) {
    document.getElementById('pcr-mova').classList.add('disabled');
    return;
  }

  renderMovaPopup();

  btnMova.addEventListener('click', e => {
    e.stopPropagation();
    movaPopup.classList.toggle('open');
    showUI();
  });

  document.addEventListener('click', () => movaPopup.classList.remove('open'));
}

function renderMovaPopup() {
  movaPopup.innerHTML = audioTracks.map((t, i) => {
    const label = t.title || t.lang || ('Доріжка ' + (i + 1));
    const extra = t.codec ? ` (${t.codec})` : '';
    return `<button class="mova-opt ${i === currentAudio ? 'active' : ''}" data-idx="${i}">${label}${extra}</button>`;
  }).join('');

  movaPopup.querySelectorAll('.mova-opt').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      currentAudio = parseInt(btn.dataset.idx);
      loadVideo(actualTime());
      movaPopup.classList.remove('open');
      renderMovaPopup();
    });
  });
}

// ── CC (subtitles) ────────────────────────────────────────────────────────────
function setupCC() {
  if (!movie.has_subtitles) return;
  btnCC.classList.add('available');

  player.addRemoteTextTrack({
    kind: 'subtitles',
    src: `http://127.0.0.1:${PORT}/subtitle/${movieId}/0`,
    label: subtitleTracks[0]?.lang || 'Subtitles',
    default: false,
  }, false);

  btnCC.addEventListener('click', () => {
    btnCC.classList.toggle('on');
    const on     = btnCC.classList.contains('on');
    const tracks = player.remoteTextTracks();
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = on ? 'showing' : 'hidden';
  });
}

// ── Fullscreen button ─────────────────────────────────────────────────────────
function setupFSButton() {
  btnFS.addEventListener('click', () => {
    player.isFullscreen() ? player.exitFullscreen() : player.requestFullscreen();
  });
}

function syncFSButton() {
  const fs = player.isFullscreen();
  fsIcon.className  = fs ? 'fas fa-compress' : 'fas fa-expand';
  fsLabel.textContent = fs ? i18n.t('exit_fs') || 'Вихід' : i18n.t('fullscreen') || 'Повний екран';
  btnCloseApp.style.display = fs ? 'none' : '';
}

// ── Seekbar ───────────────────────────────────────────────────────────────────
const seekTrack = document.getElementById('seek-track');
const seekFill  = document.getElementById('seek-fill');
const seekBuff  = document.getElementById('seek-buffer');
const seekThumb = document.getElementById('seek-thumb');
const seekTip   = document.getElementById('seek-tooltip');
let isDragging  = false;

function updateSeekUI(pos) {
  if (!movie || !movie.duration) return;
  const pct = Math.min(pos / movie.duration * 100, 100);
  seekFill.style.width = pct + '%';
  seekThumb.style.left = pct + '%';
  try {
    const vid = player.el().querySelector('video');
    if (vid && vid.buffered.length) {
      const bufPct = Math.min((basePosition + vid.buffered.end(vid.buffered.length - 1)) / movie.duration * 100, 100);
      seekBuff.style.width = bufPct + '%';
    }
  } catch {}
}

function seekPct(e) {
  const rect = seekTrack.getBoundingClientRect();
  return Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
}

function setupSeekbar() {
  seekTrack.addEventListener('mousedown', e => {
    isDragging = true; previewSeek(e); e.preventDefault(); showUI();
  });
  seekTrack.addEventListener('mousemove', previewSeek);
  document.addEventListener('mousemove', e => { if (isDragging) { previewSeek(e); showUI(); } });
  document.addEventListener('mouseup',   e => {
    if (!isDragging) return;
    isDragging = false;
    seek(seekPct(e) * (movie.duration || 0));
  });
  document.getElementById('custom-seekbar').addEventListener('mouseleave', () => {
    seekTip.style.opacity = '0';
  });
}

function previewSeek(e) {
  if (!movie || !movie.duration) return;
  const pct = seekPct(e);
  seekTip.textContent   = formatTime(pct * movie.duration);
  seekTip.style.left    = (pct * 100) + '%';
  seekTip.style.opacity = '1';
  if (isDragging) {
    seekFill.style.width = (pct * 100) + '%';
    seekThumb.style.left = (pct * 100) + '%';
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (!player || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    switch (e.code) {
      case 'Space':      e.preventDefault(); player.paused() ? player.play().catch(()=>{}) : player.pause(); break;
      case 'ArrowLeft':  e.preventDefault(); seek(actualTime() - 10); break;
      case 'ArrowRight': e.preventDefault(); seek(actualTime() + 10); break;
      case 'KeyF':       player.isFullscreen() ? player.exitFullscreen() : player.requestFullscreen(); break;
      case 'KeyM':       player.muted(!player.muted()); break;
      case 'Escape':     if (!player.isFullscreen()) goBack(); break;
    }
    showUI();
  });
}

// ── UI hide/show ──────────────────────────────────────────────────────────────
// ── Mouse wheel → volume ──────────────────────────────────────────────────────
function setupScrollVolume() {
  playerWrap.addEventListener('wheel', e => {
    if (!player) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    player.volume(Math.max(0, Math.min(1, player.volume() + delta)));
    showUI();
  }, { passive: false });
}

function setupUIHide() {
  document.addEventListener('mousemove', showUI);
  player.on('useractive',   showUI);
  player.on('userinactive', () => { clearTimeout(hideTimer); playerWrap.classList.remove('show-ui'); document.body.classList.remove('show-ui-body'); });
  showUI();
}

function showUI() {
  playerWrap.classList.add('show-ui');
  document.body.classList.add('show-ui-body');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { playerWrap.classList.remove('show-ui'); document.body.classList.remove('show-ui-body'); }, 3500);
}

// ── i18n ─────────────────────────────────────────────────────────────────────
function applyPlayerTranslations() {
  document.querySelectorAll('[data-i18n-player]').forEach(el => {
    el.textContent = i18n.t(el.dataset.i18nPlayer);
  });
  if (movaLabel) movaLabel.textContent = i18n.t('mova');
  document.documentElement.lang = i18n.getLang();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryParse(v, d) { try { return JSON.parse(v); } catch { return d; } }

function formatTime(secs) {
  secs = Math.floor(secs || 0);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}
