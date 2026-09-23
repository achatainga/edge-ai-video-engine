/**
 * Edge Video Engine (Render Cloud Microservice)
 * 100% Free Video Rendering with FFmpeg, Edge-TTS, and Evolution API WhatsApp Dispatch
 */

import express from 'express';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

  res.json({
    status: 'ok',
    service: 'edge-video-engine',
    ffmpeg: ffmpegInstalled,
    edgeTts: edgeTtsInstalled,
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
      fontsList = fs.readdirSync('/usr/share/fonts', { recursive: true }).slice(0, 30);
    }

    res.json({
      status: 'ok',
      hasSubtitles: ffmpegFilters.includes('subtitles'),
      hasDrawtext: ffmpegFilters.includes('drawtext'),
      hasDrawbox: ffmpegFilters.includes('drawbox'),
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
 * Full End-to-End Test probe: TTS + Subtitles + Video compilation
 */
app.get('/test-full', async (req, res) => {
  const testDir = path.join('/tmp', `test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const audio = path.join(testDir, 'a.mp3');
  const vtt = path.join(testDir, 's.vtt');
  const srt = path.join(testDir, 's.srt');
  const out = path.join(PUBLIC_DIR, 'test_full.mp4');

  try {
    const t0 = Date.now();
    await execAsync(`edge-tts --voice "es-VE-SebastianNeural" --text "Prueba de video con Inteligencia Artificial." --write-media "${audio}" --write-subtitles "${vtt}"`);
    const srtData = vttToSrt(fs.readFileSync(vtt, 'utf-8'));
    fs.writeFileSync(srt, srtData, 'utf-8');

    const dejavuBold = '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf';
    const fontFileOpt = fs.existsSync(dejavuBold) ? `:fontfile=${dejavuBold}` : '';
    const escapedSrt = srt.replace(/\\/g, '/').replace(/:/g, '\\:');

    const filterGraph = `[0:v]drawbox=x=40:y=120:w=640:h=90:color=cyan@0.18:t=fill,drawtext=text='Video Demo'${fontFileOpt}:fontcolor=white:fontsize=28:x=(w-text_w)/2:y=155:expansion=none,subtitles='${escapedSrt}':force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=120'[outv]`;

    const ffmpegCmd = [
      '-y',
      '-threads', '2',
      '-f', 'lavfi',
      '-i', 'color=c=#0B132B:s=720x1280:r=30',
      '-i', audio,
      '-filter_complex', filterGraph,
      '-map', '[outv]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      out
    ];

    await execFileAsync('ffmpeg', ffmpegCmd);
    const durationMs = Date.now() - t0;
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    res.json({ success: true, durationMs, size, outUrl: `https://edge-ai-video-engine.onrender.com/videos/test_full.mp4` });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack, stderr: err.stderr });
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
});

/**
 * Helper: formats VTT timestamps (HH:MM:SS.mmm or MM:SS.mmm) into SRT format (HH:MM:SS,mmm)
 */
function formatSrtTimestamp(ts) {
  const parts = ts.trim().split(':');
  if (parts.length === 2) {
    return '00:' + parts[0].padStart(2, '0') + ':' + parts[1].replace('.', ',');
  } else if (parts.length === 3) {
    return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0') + ':' + parts[2].replace('.', ',');
  }
  return ts.replace('.', ',');
}

/**
 * Helper: converts VTT subtitles to SRT format for FFmpeg compatibility
 */
function vttToSrt(vttContent) {
  const lines = vttContent.replace(/\r\n/g, '\n').split('\n');
  const srtLines = [];
  let counter = 1;
  let inCue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      inCue = true;
      srtLines.push(String(counter++));
      const times = line.split('-->');
      if (times.length === 2) {
        const start = formatSrtTimestamp(times[0].trim());
        const endPart = times[1].trim().split(/\s+/)[0];
        const end = formatSrtTimestamp(endPart);
        srtLines.push(`${start} --> ${end}`);
      } else {
        srtLines.push(line.replace(/\./g, ','));
      }
    } else if (inCue && line === '') {
      inCue = false;
      srtLines.push('');
    } else if (inCue && !line.startsWith('NOTE') && !line.startsWith('STYLE')) {
      srtLines.push(line);
    }
  }
  return srtLines.join('\n');
}

/**
 * Main Video Render Endpoint
 * POST /render-video
 */
app.post('/render-video', async (req, res) => {
  const {
    title = 'Video Promocional con IA',
    voiceoverText,
    voiceName = 'es-VE-SebastianNeural', // Excellent Spanish neural voice
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
  const srtPath = path.join(workDir, 'subtitles.srt');
  const outputFileName = `reel_${renderId}.mp4`;
  const outputPath = path.join(PUBLIC_DIR, outputFileName);

  console.log(`[Render ${renderId}] Starting video production for ${recipientPhone}...`);

  // Run in background and respond 202 Accepted so caller doesn't timeout
  res.status(202).json({
    status: 'processing',
    renderId,
    message: 'Video rendering queued successfully in Render cloud.',
  });

  (async () => {
    try {
      // 1. Synthesize neural voice and subtitles using edge-tts
      console.log(`[Render ${renderId}] 1/4 Synthesizing voice with Edge-TTS (${voiceName})...`);
      // Clean emojis and symbols for speech synthesis
      const cleanVoiceover = voiceoverText
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim();
      fs.writeFileSync(scriptPath, cleanVoiceover, 'utf-8');

      await execAsync(
        `edge-tts --voice "${voiceName}" -f "${scriptPath}" --write-media "${audioPath}" --write-subtitles "${vttPath}"`
      );

      // 2. Convert subtitles to SRT
      if (fs.existsSync(vttPath)) {
        const vttData = fs.readFileSync(vttPath, 'utf-8');
        const srtData = vttToSrt(vttData);
        fs.writeFileSync(srtPath, srtData, 'utf-8');
      }

      // 3. Render 9:16 Vertical Video with FFmpeg
      console.log(`[Render ${renderId}] 2/4 Compiling 9:16 vertical video with FFmpeg...`);
      
      // Escape title and subtitle path for FFmpeg
      const safeTitle = (title || 'Video Promocional').replace(/[':\\]/g, ' ').trim();
      const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

      // Check available fonts
      const dejavuBold = '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf';
      const dejavuRegular = '/usr/share/fonts/dejavu/DejaVuSans.ttf';
      const fontFileOpt = fs.existsSync(dejavuBold)
        ? `:fontfile=${dejavuBold}`
        : (fs.existsSync(dejavuRegular) ? `:fontfile=${dejavuRegular}` : '');

      const filterGraph = fs.existsSync(srtPath)
        ? `[0:v]drawbox=x=40:y=120:w=640:h=90:color=cyan@0.18:t=fill,drawtext=text='${safeTitle}'${fontFileOpt}:fontcolor=white:fontsize=28:x=(w-text_w)/2:y=155:expansion=none,subtitles='${escapedSrtPath}':force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=120'[outv]`
        : `[0:v]drawbox=x=40:y=120:w=640:h=90:color=cyan@0.18:t=fill,drawtext=text='${safeTitle}'${fontFileOpt}:fontcolor=white:fontsize=28:x=(w-text_w)/2:y=155:expansion=none[outv]`;

      const ffmpegCmd = [
        '-y',
        '-threads', '1',
        '-f', 'lavfi',
        '-i', 'color=c=#0B132B:s=720x1280:r=24',
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
      console.log(`[Render ${renderId}] 3/4 Video compiled successfully: ${outputPath}`);

      // 4. Send video to WhatsApp via Evolution API
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
          `✨ *Video generado 100% con IA a costo $0* listo para descargar y subir a Instagram Reels o TikTok.`;

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
