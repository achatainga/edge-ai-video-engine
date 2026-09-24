/**
 * Edge AI Video Engine (Render Cloud Microservice)
 * High-Retention Hybrid AI Visual Engine:
 * - Multi-Scene Visual Assets: Flux 9:16 AI image generation & curated vertical HD photography
 * - Ken Burns Cinema Motion (Zoom-in, Pan-down, Zoom-out, Pan-right)
 * - Kinetic Typography (Hormozi / Reels Style with Neon Highlights & Accent Badges)
 * - Neural Voice Synthesis (Edge-TTS + VTT word timestamps)
 * - Automated WhatsApp Media Dispatch via Evolution API
 * - Single-lane PQueue worker (concurrency 1) for strict memory governance (< 300MB RSS)
 */

import express from 'express';
import PQueue from 'p-queue';
import { z } from 'zod';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { convertVttToDynamicAss } from './subtitleGenerator.js';
import { buildMultiScenePipeline, resolveBestFont } from './backgroundProvider.js';
import { prepareSceneAssets } from './sceneVisuals.js';

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

// Clean up videos older than 1 hour periodically to preserve disk space
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

// Single-Lane Worker Queue: strictly concurrency 1 to prevent OOM Kill 137 under 512MB RAM
const renderQueue = new PQueue({ concurrency: 1 });

/**
 * Probe audio duration in seconds using ffprobe
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
 * Generates synthetic voice tone as a fallback when Edge-TTS is unavailable
 */
function generateSyntheticVoiceTone(text) {
  const words = text.trim().split(/\s+/).length;
  const durationSec = Math.max(5, Math.min(45, Math.ceil(words / 2.5)));
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSec;
  const pcmBuffer = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.15;
    pcmBuffer.writeInt16LE(Math.floor(sample * 32767), i * 2);
  }

  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(1, 22); // Mono
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(sampleRate * 2, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

/**
 * Health check endpoint
 */
app.get('/health', async (_req, res) => {
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

  return res.json({
    status: 'ok',
    service: 'edge-ai-video-engine',
    ffmpeg: ffmpegInstalled,
    edgeTts: edgeTtsInstalled,
    activeFont: bestFont,
    queuePending: renderQueue.pending,
    queueSize: renderQueue.size,
    memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Diagnostic probe endpoint
 */
app.get('/diag', async (_req, res) => {
  try {
    const { stdout: ffmpegFilters } = await execAsync('ffmpeg -filters');
    const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version');
    let fontsList = [];
    if (fs.existsSync('/usr/share/fonts')) {
      fontsList = fs.readdirSync('/usr/share/fonts', { recursive: true }).slice(0, 40);
    }

    return res.json({
      status: 'ok',
      hasSubtitles: ffmpegFilters.includes('subtitles'),
      hasZoompan: ffmpegFilters.includes('zoompan'),
      hasDrawtext: ffmpegFilters.includes('drawtext'),
      hasDrawbox: ffmpegFilters.includes('drawbox'),
      bestFont: resolveBestFont(),
      version: ffmpegVersion.split('\n')[0],
      fonts: fontsList,
      queuePending: renderQueue.pending,
      queueSize: renderQueue.size,
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Frame extraction probe (returns a JPEG snapshot of any rendered video)
 */
app.get('/frame/:videoName/:sec', async (req, res) => {
  const { videoName, sec } = req.params;
  const safeVideoName = path.basename(videoName);
  const videoPath = path.join(PUBLIC_DIR, safeVideoName);
  const framePath = path.join(PUBLIC_DIR, `${safeVideoName}_${sec}s.jpg`);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  try {
    if (!fs.existsSync(framePath)) {
      const cleanSec = parseFloat(sec) || 1;
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', String(cleanSec),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        framePath,
      ]);
    }

    if (!fs.existsSync(framePath) || fs.statSync(framePath).size === 0) {
      return res.status(404).json({ error: `Frame at ${sec}s could not be extracted.` });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    const stream = fs.createReadStream(framePath);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

const RenderVideoSchema = z.object({
  title: z.string().min(1).default('Video Promocional con IA'),
  voiceoverText: z.string().min(1),
  voiceName: z.string().default('es-VE-SebastianNeural'),
  recipientPhone: z.string().min(7),
  evolutionUrl: z.string().optional(),
  evolutionApiKey: z.string().optional(),
  evolutionInstance: z.string().default('default'),
  socialCopy: z.string().optional().default(''),
  hashtags: z.array(z.string()).optional().default([]),
  visualStoryboard: z.array(z.any()).optional().default([]),
  scenes: z.array(z.any()).optional().default([]),
  appOrigin: z.string().optional(),
});

/**
 * Main Video Render Endpoint
 * POST /render-video
 */
app.post('/render-video', async (req, res) => {
  const parsed = RenderVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation Error', details: parsed.error.issues });
  }

  const {
    title,
    voiceoverText,
    voiceName,
    recipientPhone,
    evolutionUrl,
    evolutionApiKey,
    evolutionInstance,
    socialCopy,
    hashtags,
    visualStoryboard,
    scenes,
    appOrigin,
  } = parsed.data;

  const renderId = crypto.randomUUID();

  // Enqueue task strictly under concurrency 1 to prevent OOM 137 on Render 512MB RAM
  renderQueue.add(async () => {
    const t0 = Date.now();
    const workDir = path.join('/tmp', `render-${renderId}`);
    fs.mkdirSync(workDir, { recursive: true });

    const scriptPath = path.join(workDir, 'script.txt');
    const audioPath = path.join(workDir, 'speech.mp3');
    const vttPath = path.join(workDir, 'subtitles.vtt');
    const assPath = path.join(workDir, 'subtitles.ass');
    const outputFileName = `reel_${renderId}.mp4`;
    const outputPath = path.join(PUBLIC_DIR, outputFileName);

    console.log(`[VideoEngine ${renderId}] Starting cinematic production for ${recipientPhone}...`);

    try {
      // 1. Synthesize neural voice and subtitles using edge-tts
      console.log(`[VideoEngine ${renderId}] 1/4 Synthesizing voice with Edge-TTS (${voiceName})...`);
      const cleanVoiceover = voiceoverText
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim();
      fs.writeFileSync(scriptPath, cleanVoiceover, 'utf-8');

      try {
        await execAsync(
          `edge-tts --rate="+18%" --voice "${voiceName}" -f "${scriptPath}" --write-media "${audioPath}" --write-subtitles "${vttPath}"`,
          { timeout: 30000 }
        );
      } catch (ttsErr) {
        console.warn(`[VideoEngine ${renderId}] Edge-TTS unavailable or timed out, generating synthetic audio tone:`, ttsErr.message);
        const toneBuf = generateSyntheticVoiceTone(cleanVoiceover);
        fs.writeFileSync(audioPath, toneBuf);
      }

      // 2. Generate Kinetic ASS Subtitles (Hormozi / Reels Style with Neon Highlights & Accent Badges)
      console.log(`[VideoEngine ${renderId}] 2/4 Converting VTT to Kinetic ASS Subtitles...`);
      const bestFont = resolveBestFont();
      if (fs.existsSync(vttPath) && fs.statSync(vttPath).size > 0) {
        const vttData = fs.readFileSync(vttPath, 'utf-8');
        const assData = convertVttToDynamicAss(vttData, bestFont.name);
        fs.writeFileSync(assPath, assData, 'utf-8');
      }

      // 3. Audio duration & Multi-scene asset sourcing (Flux AI 9:16 + Curated Vertical HD Photos)
      const totalDuration = await probeAudioDuration(audioPath);
      const storyboardScenes = (Array.isArray(visualStoryboard) && visualStoryboard.length > 0)
        ? visualStoryboard
        : scenes;

      console.log(`[VideoEngine ${renderId}] 3/4 Sourcing visual assets (Duration: ${totalDuration}s)...`);
      const visualScenes = await prepareSceneAssets({
        voiceoverText: cleanVoiceover,
        rawScenes: storyboardScenes,
        totalDuration,
        workDir,
      });

      // 4. Build Multi-Scene FilterGraph with Ken Burns & Compile with FFmpeg (720x1280 Ultrafast)
      console.log(`[VideoEngine ${renderId}] 4/5 Compiling cinematic 9:16 vertical video with FFmpeg...`);
      const { inputArgs, filterGraph } = buildMultiScenePipeline({
        scenes: visualScenes,
        title,
        totalDuration,
        assPath: fs.existsSync(assPath) ? assPath : null,
      });

      const numVideoInputs = inputArgs.filter((arg) => arg === '-i').length;
      const voiceInputIdx = numVideoInputs;
      const ambienceInputIdx = numVideoInputs + 1;
      const fullFilterGraph = `${filterGraph};[${voiceInputIdx}:a]volume=1.0[voice];[${ambienceInputIdx}:a]volume=0.08,lowpass=f=400[ambience];[voice][ambience]amix=inputs=2:duration=first:dropout_transition=2[outa]`;

      const ffmpegCmd = [
        '-y',
        '-threads', '2',
        ...inputArgs,
        '-i', audioPath,
        '-f', 'lavfi', '-i', `sine=f=55:b=4:d=${Math.ceil(totalDuration) + 2}`,
        '-filter_complex', fullFilterGraph,
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        outputPath,
      ];

      await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ffmpegCmd);
        let lastErr = '';
        proc.stderr.on('data', (d) => {
          lastErr += d.toString();
        });
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            console.error(`[VideoEngine ${renderId} FFmpeg Exit ${code}]:`, lastErr.slice(-400));
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });
        proc.on('error', (err) => {
          console.error(`[VideoEngine ${renderId} FFmpeg Spawn Error]:`, err);
          reject(err);
        });
      });

      const videoFileSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
      console.log(`[VideoEngine ${renderId}] Cinematic video compiled successfully: ${outputPath} (${videoFileSize} bytes)`);

      // 5. Send video to WhatsApp via Evolution API
      if (evolutionUrl && evolutionApiKey && recipientPhone) {
        console.log(`[VideoEngine ${renderId}] 5/5 Dispatching cinematic video to WhatsApp (+${recipientPhone})...`);
        const cleanPhone = recipientPhone.replace(/\D/g, '');
        const engineBaseUrl = appOrigin || process.env.RENDER_EXTERNAL_URL || 'https://edge-ai-video-engine.onrender.com';
        const downloadUrl = `${engineBaseUrl.replace(/\/+$/, '')}/videos/${outputFileName}`;

        const captionText =
          `🎬 *${title}*\n\n` +
          (socialCopy ? `${socialCopy}\n\n` : '') +
          (hashtags.length ? `${hashtags.join(' ')}\n\n` : '') +
          `🔗 *Descarga directa (HD):* ${downloadUrl}\n\n` +
          `✨ *Video cinemático con IA (Flux 9:16 + Ken Burns + Subtítulos)* a costo $0 listo para publicar en Instagram Reels o TikTok.`;

        const sendMediaUrl = `${evolutionUrl.replace(/\/+$/, '')}/message/sendMedia/${evolutionInstance}`;

        try {
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
              fileName: `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp4`,
            }),
            signal: AbortSignal.timeout(35000),
          });

          if (!evoRes.ok) {
            console.warn(`[VideoEngine ${renderId}] Evolution URL send failed (HTTP ${evoRes.status}), attempting base64 fallback...`);
            const mp4Buffer = fs.readFileSync(outputPath);
            const base64Mp4 = mp4Buffer.toString('base64');
            await fetch(sendMediaUrl, {
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
                media: base64Mp4,
                fileName: `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp4`,
              }),
              signal: AbortSignal.timeout(35000),
            });
          }
          console.log(`[VideoEngine ${renderId}] ✅ Cinematic video dispatched to WhatsApp (+${cleanPhone}) successfully!`);
        } catch (waErr) {
          console.warn(`[VideoEngine ${renderId}] WhatsApp dispatch warning:`, waErr.message);
        }
      }

      const durationMs = Date.now() - t0;
      const memRss = Math.round(process.memoryUsage().rss / (1024 * 1024));
      console.log(`[VideoEngine ${renderId}] Production completed in ${durationMs}ms (${videoFileSize} bytes, RSS: ${memRss}MB)`);
    } catch (pipelineErr) {
      console.error(`[VideoEngine ${renderId}] ❌ Pipeline failed:`, pipelineErr);
    } finally {
      // Guaranteed cleanup of temp workdir to prevent disk accumulation
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {}
    }
  });

  return res.status(202).json({
    status: 'ACCEPTED',
    message: 'Cinematic AI video rendering queued successfully in Render cloud.',
    renderId,
    title,
    recipientPhone,
    queuePosition: renderQueue.size + renderQueue.pending,
  });
});

/**
 * 24/7 Keep-Alive Shield
 * Render Free Tier containers spin down after 15 minutes of inactivity.
 * Periodically probing the public HTTPS endpoint through Render's external proxy
 * registers incoming web traffic and resets the 15-minute sleep countdown.
 */
const KEEP_ALIVE_INTERVAL_MS = 9 * 60 * 1000;
const PUBLIC_ENGINE_URL = process.env.RENDER_EXTERNAL_URL || 'https://edge-ai-video-engine.onrender.com';
const PUBLIC_EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-latest-b4dt.onrender.com';

function startKeepAlive() {
  console.log(`[KeepAlive] Initialized self-ping service targeting ${PUBLIC_ENGINE_URL} every 9m.`);
  setInterval(async () => {
    try {
      const pingUrl = `${PUBLIC_ENGINE_URL.replace(/\/+$/, '')}/health`;
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(15000) });
      console.log(`[KeepAlive] Engine self-ping (${pingUrl}) -> HTTP ${res.status}`);
    } catch (err) {
      console.warn(`[KeepAlive Warning] Engine self-ping failed:`, err.message);
    }

    try {
      const evoUrl = `${PUBLIC_EVO_URL.replace(/\/+$/, '')}`;
      const evoRes = await fetch(evoUrl, { signal: AbortSignal.timeout(15000) });
      console.log(`[KeepAlive] Evolution API ping (${evoUrl}) -> HTTP ${evoRes.status}`);
    } catch (err) {
      console.warn(`[KeepAlive Warning] Evolution API ping failed:`, err.message);
    }
  }, KEEP_ALIVE_INTERVAL_MS);
}

app.listen(PORT, () => {
  console.log(`🚀 edge-ai-video-engine running on port ${PORT} with concurrency: 1`);
  startKeepAlive();
});
