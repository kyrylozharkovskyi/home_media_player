const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const NATIVE_EXT = new Set(['.mp4', '.webm', '.ogv', '.m4v', '.mov']);
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#1a1a2e"/>
  <polygon points="120,60 120,120 200,90" fill="#4f8ef7" opacity="0.7"/>
</svg>`.trim();

let server;

function startServer(port) {
  return new Promise(resolve => {
    const app = express();
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });

    // ── Thumbnail ────────────────────────────────────────────────────────────
    app.get('/thumb/:id', (req, res) => {
      const { getMovieById } = require('./db');
      const movie = getMovieById(parseInt(req.params.id));
      if (movie?.thumbnail_path && fs.existsSync(movie.thumbnail_path)) {
        return res.sendFile(movie.thumbnail_path);
      }
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(PLACEHOLDER_SVG);
    });

    // ── Video stream ─────────────────────────────────────────────────────────
    app.get('/stream/:id', (req, res) => {
      const { getMovieById } = require('./db');
      const movie = getMovieById(parseInt(req.params.id));
      if (!movie) return res.status(404).send('Not found');

      const fp = movie.file_path;
      if (!fs.existsSync(fp)) return res.status(404).send('File missing');

      const ext = path.extname(fp).toLowerCase();
      const seekSec = parseFloat(req.query.seek || 0);
      const audioIdx = parseInt(req.query.audio || 0);

      if (NATIVE_EXT.has(ext) && seekSec === 0 && audioIdx === 0) {
        return serveNative(fp, req, res);
      }
      return serveTranscode(fp, seekSec, audioIdx, res, req);
    });

    // ── Subtitle (WebVTT) ────────────────────────────────────────────────────
    app.get('/subtitle/:id/:idx', (req, res) => {
      const { getMovieById } = require('./db');
      const movie = getMovieById(parseInt(req.params.id));
      if (!movie) return res.status(404).send('');

      const fp = movie.file_path;
      const trackIdx = parseInt(req.params.idx);

      // Try external .srt first
      const extSrt = fp.replace(path.extname(fp), '.srt');
      if (fs.existsSync(extSrt)) {
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        const cmd = ffmpeg(extSrt)
          .outputOptions(['-f webvtt'])
          .on('error', () => res.end('WEBVTT\n\n'));
        return cmd.pipe(res, { end: true });
      }

      // Extract embedded subtitle
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      const cmd = ffmpeg(fp)
        .outputOptions([`-map 0:s:${trackIdx}`, '-f webvtt'])
        .on('error', () => { if (!res.headersSent) res.end('WEBVTT\n\n'); });
      cmd.pipe(res, { end: true });
    });

    server = app.listen(port, '127.0.0.1', resolve);
    server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} already in use — close the previous instance first.`);
        // Resolve anyway so the app can still open (player won't work but app won't crash)
        resolve();
      }
    });
  });
}

function serveNative(fp, req, res) {
  const stat = fs.statSync(fp);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4'
    });
    fs.createReadStream(fp, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(fp).pipe(res);
  }
}

function serveTranscode(fp, seekSec, audioIdx, res, req) {
  res.setHeader('Content-Type', 'video/mp4');

  const inputOpts = seekSec > 0 ? [`-ss ${seekSec}`] : [];

  const cmd = ffmpeg(fp)
    .inputOptions(inputOpts)
    .outputOptions([
      `-map 0:v:0`,
      `-map 0:a:${audioIdx}`,
      '-c:v libx264',
      '-preset ultrafast',
      '-tune zerolatency',
      '-crf 22',
      '-c:a aac',
      '-b:a 192k',
      '-movflags frag_keyframe+empty_moov',
      '-f mp4'
    ])
    .on('error', err => {
      if (!res.headersSent) res.status(500).end();
    });

  req.on('close', () => { try { cmd.kill('SIGKILL'); } catch {} });
  cmd.pipe(res, { end: true });
}

function stopServer() {
  if (server) server.close();
}

module.exports = { startServer, stopServer };
