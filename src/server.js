/**
 * Edge AI Video Engine (Render Cloud Microservice)
 * Frugal In-Memory Video Rendering Engine with @napi-rs/canvas, Ken Burns,
 * Kinetic Captions, Audio Ducking, and Evolution API WhatsApp Dispatch.
 */

import express from 'express';
import PQueue from 'p-queue';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { composeVideoToBuffer } from './composer.js';

const execAsync = promisify(exec);
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

const RenderVideoSchema = z.object({
  title: z.string().min(1).default('Video Promocional con IA'),
  voiceoverText: z.string().min(1),
  recipientPhone: z.string().min(7),
  evolutionUrl: z.string().optional(),
  evolutionApiKey: z.string().optional(),
  evolutionInstance: z.string().default('default'),
  socialCopy: z.string().optional().default(''),
  hashtags: z.array(z.string()).optional().default([]),
  visualStoryboard: z.array(z.any()).optional().default([]),
  kineticCaptions: z.array(z.any()).optional().default([]),
  subtitles: z.array(z.any()).optional().default([]),
  audioConfig: z
    .object({
      voiceoverLoudness: z
        .object({
          targetLufs: z.number().default(-14),
          maxTruePeak: z.number().default(-1.0),
          loudnessRange: z.number().default(7.0),
        })
        .default({ targetLufs: -14, maxTruePeak: -1.0, loudnessRange: 7.0 }),
      musicDucking: z
        .object({
          duckingDb: z.number().default(-18),
          attackMs: z.number().default(150),
          releaseMs: z.number().default(350),
          voiceHoldMs: z.number().default(400),
        })
        .default({ duckingDb: -18, attackMs: 150, releaseMs: 350, voiceHoldMs: 400 }),
      backgroundMusicGenre: z.string().default('modern_ambient_lofi'),
    })
    .default({
      voiceoverLoudness: { targetLufs: -14, maxTruePeak: -1.0, loudnessRange: 7.0 },
      musicDucking: { duckingDb: -18, attackMs: 150, releaseMs: 350, voiceHoldMs: 400 },
      backgroundMusicGenre: 'modern_ambient_lofi',
    }),
  renderProfile: z.any().optional(),
});

/**
 * Generates synthetic voiceover tone as a fallback when Edge-TTS CLI is not installed
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
 * Synthesizes neural voiceover using Edge-TTS CLI in the Docker container,
 * falling back gracefully to synthetic PCM if edge-tts is unavailable.
 */
async function synthesizeVoiceoverAudio(text, voiceName = 'es-VE-SebastianNeural') {
  const tmpId = crypto.randomUUID();
  const tmpScript = path.join('/tmp', `tts_script_${tmpId}.txt`);
  const tmpAudio = path.join('/tmp', `tts_audio_${tmpId}.mp3`);

  try {
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();
    fs.writeFileSync(tmpScript, cleanText, 'utf-8');

    await execAsync(
      `edge-tts --rate="+18%" --voice "${voiceName}" -f "${tmpScript}" --write-media "${tmpAudio}"`,
      { timeout: 30000 }
    );

    if (fs.existsSync(tmpAudio)) {
      const audioBuf = fs.readFileSync(tmpAudio);
      return audioBuf;
    }
  } catch (ttsErr) {
    console.warn('[Voiceover] Edge-TTS CLI not available or timed out, using synthetic PCM carrier:', ttsErr.message);
  } finally {
    try { if (fs.existsSync(tmpScript)) fs.unlinkSync(tmpScript); } catch {}
    try { if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio); } catch {}
  }

  return generateSyntheticVoiceTone(text);
}

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'edge-ai-video-engine',
    queuePending: renderQueue.pending,
    queueSize: renderQueue.size,
    memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Diagnostic probe endpoint to inspect ffmpeg, edge-tts and system capabilities
 */
app.get('/diag', async (_req, res) => {
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

  return res.json({
    status: 'ok',
    service: 'edge-ai-video-engine',
    ffmpeg: ffmpegInstalled,
    edgeTts: edgeTtsInstalled,
    queuePending: renderQueue.pending,
    queueSize: renderQueue.size,
    memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Video Render Endpoint
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
    recipientPhone,
    evolutionUrl,
    evolutionApiKey,
    evolutionInstance,
    socialCopy,
    hashtags,
    visualStoryboard,
    kineticCaptions,
    subtitles,
    audioConfig,
  } = parsed.data;

  // Use kineticCaptions or fallback to subtitles
  const captionsToUse = (Array.isArray(kineticCaptions) && kineticCaptions.length > 0)
    ? kineticCaptions
    : subtitles;

  const renderId = crypto.randomUUID();

  // Enqueue task strictly under concurrency 1 to prevent OOM 137 on Render 512MB RAM
  renderQueue.add(async () => {
    const t0 = Date.now();
    try {
      console.log(`[VideoEngine ${renderId}] Starting composition for ${recipientPhone}...`);

      const voiceoverBuffer = await synthesizeVoiceoverAudio(voiceoverText);
      const words = voiceoverText.trim().split(/\s+/).length;
      const estimatedDurationSec = Math.max(5, Math.min(45, Math.ceil(words / 2.5)));

      const mp4Buffer = await composeVideoToBuffer({
        title,
        voiceoverBuffer,
        visualStoryboard,
        kineticCaptions: captionsToUse,
        audioConfig,
        durationSec: estimatedDurationSec,
        fps: 30,
        width: 1080,
        height: 1920,
      });

      // Persist rendered video in PUBLIC_DIR for web inspection & direct download
      const outFileName = `reel_${renderId}.mp4`;
      const outFilePath = path.join(PUBLIC_DIR, outFileName);
      fs.writeFileSync(outFilePath, mp4Buffer);

      // Dispatch MP4 directly to WhatsApp if credentials are provided
      if (evolutionUrl && evolutionApiKey && recipientPhone) {
        const cleanPhone = recipientPhone.replace(/\D/g, '');
        const engineBaseUrl = process.env.RENDER_EXTERNAL_URL || 'https://edge-ai-video-engine.onrender.com';
        const downloadUrl = `${engineBaseUrl.replace(/\/+$/, '')}/videos/${outFileName}`;

        const captionText =
          `🎬 *${title}*\n\n` +
          (socialCopy ? `${socialCopy}\n\n` : '') +
          (hashtags.length ? `${hashtags.join(' ')}\n\n` : '') +
          `🔗 *Descarga directa (HD):* ${downloadUrl}\n\n` +
          `✨ *Video vertical 9:16 con IA* listo para publicar en Instagram Reels o TikTok.`;

        // Send URL-based media first for optimal performance, fallback to base64 if needed
        try {
          const evoRes = await fetch(`${evolutionUrl.replace(/\/+$/, '')}/message/sendMedia/${evolutionInstance}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: evolutionApiKey,
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
            // Fallback to Base64 binary payload if Evolution could not reach the external URL
            const base64Mp4 = mp4Buffer.toString('base64');
            await fetch(`${evolutionUrl.replace(/\/+$/, '')}/message/sendMedia/${evolutionInstance}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: evolutionApiKey,
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
        } catch (waErr) {
          console.warn('[VideoEngine] WhatsApp dispatch failed:', waErr.message);
        }
      }

      const durationMs = Date.now() - t0;
      const memRss = Math.round(process.memoryUsage().rss / (1024 * 1024));
      console.log(
        `[VideoEngine ${renderId}] Render completed in ${durationMs}ms (${mp4Buffer.length} bytes, RSS: ${memRss}MB)`
      );
    } catch (renderErr) {
      console.error(`[VideoEngine ${renderId} Render Error]:`, renderErr);
    }
  });

  return res.status(202).json({
    status: 'ACCEPTED',
    message: 'Video job enqueued for in-memory composition',
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
  console.log(`🚀 edge-ai-video-engine running on port ${PORT} with concurrency: 1 (< 512MB RAM target)`);
  startKeepAlive();
});
