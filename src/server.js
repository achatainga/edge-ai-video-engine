/**
 * Edge Video Engine (Render Cloud Microservice)
 * 100% Free Video Rendering with FFmpeg, Edge-TTS, and Evolution API WhatsApp Dispatch
 * Redesigned for High Retention (Kinetic ASS Subtitles, Procedural Ambient Motion, Progress Bar)
 */

import express from 'express';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { convertVttToDynamicAss } from './subtitleGenerator.js';
import { buildFilterGraph, fetchPexelsBroll, resolveBestFont } from './backgroundProvider.js';

process.on('uncaughtException', (err) => console.error('[FATAL] Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('[FATAL] Unhandled Rejection:', reason));

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// Static public directory for serving rendered MP4 videos
const PUBLIC_DIR = path.resolve('/tmp/public_videos');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
app.use('/videos', express.static(PUBLIC_DIR));

// Clean up videos older than 1 hour periodically
setInterval(() => {
  try {
    const files = fs.readdirSync(PUBLIC_DIR);
    const now = Date.now();
    for (const f of files) {
      const fullPath = path.join(PUBLIC_DIR, f);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > 3600 * 1000) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.warn('[Cleanup Warning]:', err);
  }
}, 600 * 1000);

/**
 * Helper: Probe audio duration in seconds
 */
async function probeAudioDuration(audioPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const d = parseFloat(stdout.trim());
    if (!isNaN(d) && d > 0) return d;
  } catch {}
  return 30;
}

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  let ffmpegInstalled = false;
  let edgeTtsInstalled = false;

  try {
    const { stdout } = await execAsync('ffmpeg -version');
    ffmpegInstalled = stdout.includes('ffmpeg version');
  } catch {}

  try {
    const { stdout } = await execAsync('edge-tts --version');
    edgeTtsInstalled = stdout.length > 0;
  } catch {}

  const bestFont = resolveBestFont();

  res.json({
    status: 'ok',
    service: 'edge-video-engine',
    ffmpeg: ffmpegInstalled,
    edgeTts: edgeTtsInstalled,
    activeFont: bestFont,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Diagnostic probe to inspect filters, fonts, and environment
 */
app.get('/diag', async (req, res) => {
  try {
    const { stdout: ffmpegFilters } = await execAsync('ffmpeg -filters');
    const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version');
    let fontsList = [];
    if (fs.existsSync('/usr/share/fonts')) {
      fontsList = fs.readdirSync('/usr/share/fonts', { recursive: true }).slice(0, 40);
    }

    res.json({
      status: 'ok',
      hasSubtitles: ffmpegFilters.includes('subtitles'),
      hasDrawtext: ffmpegFilters.includes('drawtext'),
      hasDrawbox: ffmpegFilters.includes('drawbox'),
      bestFont: resolveBestFont(),
      version: ffmpegVersion.split('\n')[0],
      fonts: fontsList,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Test render probe (2-second synthetic video)
 */
app.get('/test-render', async (req, res) => {
  const testOutput = path.join(PUBLIC_DIR, 'probe_test.mp4');
  try {
    const args = [
      '-y',
      '-threads', '2',
      '-f', 'lavfi',
      '-i', 'color=c=#0B132B:s=720x1280:d=2:r=30',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '2',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      testOutput
    ];
    const { stdout, stderr } = await execAsync(`ffmpeg ${args.join(' ')}`);
    const size = fs.existsSync(testOutput) ? fs.statSync(testOutput).size : 0;
    res.json({ success: true, size, stdout, stderr });
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr, stdout: err.stdout });
  }
});

/**
 * Full End-to-End Test probe: TTS + Kinetic ASS Subtitles + Animated Background
 */
app.get('/test-full', async (req, res) => {
  const testDir = path.join('/tmp', `test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const audio = path.join(testDir, 'a.mp3');
  const vtt = path.join(testDir, 's.vtt');
  const ass = path.join(testDir, 's.ass');
  const out = path.join(PUBLIC_DIR, 'test_full.mp4');

  try {
    const t0 = Date.now();
    await execAsync(`edge-tts --voice "es-VE-SebastianNeural" --text "Prueba de alta retención. Tu WhatsApp responde clientes al instante con Inteligencia Artificial." --write-media "${audio}" --write-subtitles "${vtt}"`);

    const bestFont = resolveBestFont();
    const assContent = convertVttToDynamicAss(fs.readFileSync(vtt, 'utf-8'), bestFont.name);
    fs.writeFileSync(ass, assContent, 'utf-8');

    const duration = await probeAudioDuration(audio);
    const filterGraph = buildFilterGraph({
      title: 'Demo Alta Retención',
      totalDuration: duration,
      assPath: ass,
    });

    const ffmpegCmd = [
      '-y',
      '-threads', '2',
      '-f', 'lavfi',
      '-i', 'color=c=#0B132B:s=64x64:r=24',
      '-i', audio,
      '-filter_complex', filterGraph,
      '-map', '[outv]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'fastdecode',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      out
    ];

    await execFileAsync('ffmpeg', ffmpegCmd);
    const durationMs = Date.now() - t0;
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    res.json({
      success: true,
      durationMs,
      size,
      activeFont: bestFont,
      outUrl: `https://edge-ai-video-engine.onrender.com/videos/test_full.mp4`
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack, stderr: err.stderr });
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
});

/**
 * Main Video Render Endpoint
 * POST /render-video
 */
app.post('/render-video', async (req, res) => {
  const {
    title = 'Video Promocional con IA',
    voiceoverText,
    voiceName = 'es-VE-SebastianNeural',
    scenes = [],
    recipientPhone,
    evolutionUrl,
    evolutionApiKey,
    evolutionInstance = 'default',
    socialCopy,
    hashtags = [],
    appOrigin,
  } = req.body;

  if (!voiceoverText || !recipientPhone) {
    return res.status(400).json({
      error: 'Missing required fields: voiceoverText and recipientPhone are required.',
    });
  }

  const renderId = crypto.randomUUID();
  const workDir = path.join('/tmp', `render-${renderId}`);
  fs.mkdirSync(workDir, { recursive: true });

  const scriptPath = path.join(workDir, 'script.txt');
  const audioPath = path.join(workDir, 'speech.mp3');
  const vttPath = path.join(workDir, 'subtitles.vtt');
  const assPath = path.join(workDir, 'subtitles.ass');
  const outputFileName = `reel_${renderId}.mp4`;
  const outputPath = path.join(PUBLIC_DIR, outputFileName);

  console.log(`[Render ${renderId}] Starting high-retention video production for ${recipientPhone}...`);

  // Run asynchronously and respond 202 Accepted immediately
  res.status(202).json({
    status: 'processing',
    renderId,
    message: 'High-retention video rendering queued successfully in Render cloud.',
  });

  (async () => {
    try {
      // 1. Synthesize neural voice and subtitles using edge-tts
      console.log(`[Render ${renderId}] 1/4 Synthesizing voice with Edge-TTS (${voiceName})...`);
      const cleanVoiceover = voiceoverText
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim();
      fs.writeFileSync(scriptPath, cleanVoiceover, 'utf-8');

      await execAsync(
        `edge-tts --voice "${voiceName}" -f "${scriptPath}" --write-media "${audioPath}" --write-subtitles "${vttPath}"`
      );

      // 2. Generate Kinetic ASS Subtitles
      console.log(`[Render ${renderId}] 2/4 Converting VTT to Kinetic ASS Subtitles...`);
      const bestFont = resolveBestFont();
      if (fs.existsSync(vttPath)) {
        const vttData = fs.readFileSync(vttPath, 'utf-8');
        const assData = convertVttToDynamicAss(vttData, bestFont.name);
        fs.writeFileSync(assPath, assData, 'utf-8');
      }

      // 3. Audio duration & optional Pexels B-roll
      const totalDuration = await probeAudioDuration(audioPath);
      let brollVideoPath = null;
      if (scenes && scenes.length > 0) {
        const query = scenes[0].visualPrompt || scenes[0].title || 'business phone technology';
        brollVideoPath = await fetchPexelsBroll(query, workDir);
      }

      // 4. Build FilterGraph & Compile 9:16 Vertical Video with FFmpeg
      console.log(`[Render ${renderId}] 3/4 Compiling 9:16 vertical video with FFmpeg...`);
      const filterGraph = buildFilterGraph({
        title,
        totalDuration,
        assPath: fs.existsSync(assPath) ? assPath : null,
        brollVideoPath,
      });

      const inputArgs = brollVideoPath
        ? ['-stream_loop', '-1', '-i', brollVideoPath]
        : ['-f', 'lavfi', '-i', 'color=c=#0B132B:s=64x64:r=24'];

      const ffmpegCmd = [
        '-y',
        '-threads', '1',
        ...inputArgs,
        '-i', audioPath,
        '-filter_complex', filterGraph,
        '-map', '[outv]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        outputPath
      ];

      await new Promise((resolve, reject) => {
        const proc = spawn('nice', ['-n', '19', 'ffmpeg', ...ffmpegCmd]);
        let lastErr = '';
        proc.stderr.on('data', (d) => {
          const msg = d.toString();
          lastErr = msg;
          if (msg.includes('Error') || msg.includes('Invalid') || msg.includes('failed') || msg.includes('Cannot')) {
            console.error(`[Render ${renderId} FFmpeg Err]:`, msg.trim());
          }
        });
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            console.error(`[Render ${renderId} FFmpeg Exit ${code}]:`, lastErr.trim());
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });
        proc.on('error', (err) => {
          console.warn(`[Render ${renderId}] nice invocation failed, spawning ffmpeg directly:`, err.message);
          const fbProc = spawn('ffmpeg', ffmpegCmd);
          fbProc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`FFmpeg code ${c}`))));
          fbProc.on('error', reject);
        });
      });
      console.log(`[Render ${renderId}] Video compiled successfully: ${outputPath}`);

      // 5. Send video to WhatsApp via Evolution API
      if (evolutionUrl && evolutionApiKey && recipientPhone) {
        console.log(`[Render ${renderId}] 4/4 Dispatching video to WhatsApp (+${recipientPhone})...`);
        const cleanBaseUrl = evolutionUrl.replace(/\/+$/, '');
        const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');

        const engineBaseUrl = appOrigin || process.env.RENDER_EXTERNAL_URL || 'https://edge-ai-video-engine.onrender.com';
        const downloadUrl = `${engineBaseUrl.replace(/\/+$/, '')}/videos/${outputFileName}`;

        const captionText =
          `🎬 *${title}*\n\n` +
          (socialCopy ? `${socialCopy}\n\n` : '') +
          (hashtags.length ? `${hashtags.join(' ')}\n\n` : '') +
          `🔗 *Descarga directa (HD):* ${downloadUrl}\n\n` +
          `✨ *Video de alta retención generado 100% con IA a costo $0* con subtítulos cinéticos, barra de progreso y diseño dinámico.`;

        const sendMediaUrl = `${cleanBaseUrl}/message/sendMedia/${evolutionInstance}`;
        const evoRes = await fetch(sendMediaUrl, {
          method: 'POST',
          headers: {
            apikey: evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: cleanPhone,
            mediatype: 'video',
            mimetype: 'video/mp4',
            caption: captionText,
            media: downloadUrl,
            fileName: `${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
          }),
        });

        if (evoRes.ok) {
          console.log(`[Render ${renderId}] ✅ Video dispatched to WhatsApp successfully!`);
        } else {
          const errText = await evoRes.text().catch(() => '');
          console.warn(`[Render ${renderId}] ⚠️ Evolution API sendMedia returned HTTP ${evoRes.status}:`, errText);
        }
      }
    } catch (pipelineErr) {
      console.error(`[Render ${renderId}] ❌ Pipeline failed:`, pipelineErr);
    } finally {
      // Clean up workdir
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  })();
});

app.listen(PORT, () => {
  console.log(`🚀 Edge Video Engine running on port ${PORT}`);
});
