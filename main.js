const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');

let mainWindow;
let splashWin = null;
const SERVER_PORT = 3847;

function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 560,
    height: 640,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: '#0a0a0a',
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWin.loadFile('renderer/splash.html');
}

function closeSplash() {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.close();
    splashWin = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    backgroundColor: '#0f0f0f',
    show: false,
    title: 'Домашній кінотеатр'
  });

  mainWindow.loadFile('renderer/index.html');

  // Close splash and show main window once rendered
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });
  // 8-second fallback in case ready-to-show never fires
  setTimeout(() => {
    closeSplash();
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  }, 8000);

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('Renderer failed to load:', code, desc);
    closeSplash();
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  });
}

app.whenReady().then(async () => {
  createSplashWindow();

  const { initDB } = require('./src/db');
  const { startServer } = require('./src/streamServer');
  const { scanFolders } = require('./src/scanner');
  const { getSettings } = require('./src/db');

  initDB();
  await startServer(SERVER_PORT);

  const raw = getSettings('scan_folders');
  const folders = raw ? JSON.parse(raw) : [];
  if (folders.length > 0) {
    scanFolders(folders, () => {
      if (mainWindow) mainWindow.webContents.send('scan-complete');
    }).catch(console.error);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  const { stopServer } = require('./src/streamServer');
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-server-port', () => SERVER_PORT);

ipcMain.handle('get-movies', (_e, filter) => {
  const { getMovies } = require('./src/db');
  return getMovies(filter);
});

ipcMain.handle('get-series', () => {
  const { getSeries } = require('./src/db');
  return getSeries();
});

ipcMain.handle('get-recent', () => {
  const { getRecentMovies } = require('./src/db');
  return getRecentMovies(12);
});

ipcMain.handle('get-movie-info', (_e, id) => {
  const { getMovieById } = require('./src/db');
  return getMovieById(id);
});

ipcMain.handle('get-settings', (_e, key) => {
  const { getSettings } = require('./src/db');
  return getSettings(key);
});

ipcMain.handle('save-settings', (_e, key, value) => {
  const { saveSettings } = require('./src/db');
  saveSettings(key, value);
});

ipcMain.handle('scan-now', async () => {
  const { getSettings } = require('./src/db');
  const { scanFolders } = require('./src/scanner');
  const folders = JSON.parse(getSettings('scan_folders') || '[]');
  await scanFolders(folders, () => {
    if (mainWindow) mainWindow.webContents.send('scan-complete');
  });
  return true;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-watch-progress', (_e, movieId) => {
  const { getWatchProgress } = require('./src/db');
  return getWatchProgress(movieId);
});

ipcMain.handle('save-watch-progress', (_e, movieId, position) => {
  const { saveWatchProgress } = require('./src/db');
  saveWatchProgress(movieId, position);
});

ipcMain.handle('get-last-watched', () => {
  const { getLastWatched } = require('./src/db');
  return getLastWatched();
});

ipcMain.handle('get-genres', () => {
  const { getGenres } = require('./src/db');
  return getGenres();
});

ipcMain.handle('get-mama-movies', () => {
  const { getMamaMovies } = require('./src/db');
  return getMamaMovies();
});

ipcMain.handle('get-mama-recent', () => {
  const { getMamaRecent } = require('./src/db');
  return getMamaRecent();
});

ipcMain.handle('open-player', (_e, movieId) => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width:  Math.min(1440, width),
    height: Math.min(900,  height),
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    backgroundColor: '#000000',
    show: false,
    title: 'Домашній кінотеатр',
  });
  win.loadFile('renderer/player.html', { query: { id: String(movieId) } });
  win.once('ready-to-show', () => { win.show(); win.maximize(); });
});

ipcMain.on('close-player', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('get-history', () => {
  const { getHistory } = require('./src/db');
  return getHistory();
});

ipcMain.handle('get-unwatched', () => {
  const { getUnwatched } = require('./src/db');
  return getUnwatched();
});

ipcMain.handle('get-group-data', (_e, folderPath) => {
  const { getGroupData } = require('./src/db');
  return getGroupData(folderPath);
});

ipcMain.handle('get-total-count', () => {
  const { getTotalCount } = require('./src/db');
  return getTotalCount();
});

// ── Navigation ────────────────────────────────────────────────────────────────
ipcMain.on('go-home', () => {
  if (mainWindow) mainWindow.loadFile('renderer/index.html');
});

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
