/**
 * sceneVisuals.js
 * Multi-Tiered Hybrid Visual Engine:
 * - Tier 1: Pexels Video B-roll (if API key present)
 * - Tier 2: Flux 9:16 AI Image Generation (with sequential pacing to avoid 429s)
 * - Tier 3: Curated High-Definition Vertical Stock Photography (instant, 100% reliable fallback)
 * - Tier 4: Procedural Ambient Gradient Mesh
 */

import fs from 'fs';
import path from 'path';

// Curated high-res vertical (9:16) photography for guaranteed instant fallback
const CURATED_VERTICAL_FALLBACKS = [
  'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=720&h=1280&q=80', // Phone in hand
  'https://images.unsplash.com/photo-1556742049-0a67e55722c3?auto=format&fit=crop&w=720&h=1280&q=80', // Customer store counter
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=720&h=1280&q=80', // Futuristic AI technology
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=720&h=1280&q=80', // Smiling entrepreneur
];

/**
 * Builds rich scene configurations matching narrative beats
 */
export function buildScenePrompts(voiceoverText, rawScenes = []) {
  if (Array.isArray(rawScenes) && rawScenes.length >= 2) {
    return rawScenes.map((s, idx) => ({
      title: s.title || `Escena ${idx + 1}`,
      prompt: enrichPrompt(s.visualPrompt || s.title || s.query || voiceoverText),
      query: s.query || s.visualPrompt || 'business technology',
      motionType: getMotionForIndex(idx),
      fallbackUrl: CURATED_VERTICAL_FALLBACKS[idx % CURATED_VERTICAL_FALLBACKS.length],
    }));
  }

  return [
    {
      title: 'Gancho / Hook',
      prompt: enrichPrompt('Close up of a smartphone glowing at night in a dark modern office with unread WhatsApp notification messages, dramatic moody lighting, photorealistic, 8k, vertical 9:16 portrait photography'),
      query: 'smartphone notifications office',
      motionType: 'zoom-in',
      fallbackUrl: CURATED_VERTICAL_FALLBACKS[0],
    },
    {
      title: 'Problema / Dolor',
      prompt: enrichPrompt('A frustrated customer turning away from a store counter looking disappointed at phone, dramatic cinematic lighting, photorealistic, 9:16 vertical portrait'),
      query: 'frustrated customer phone',
      motionType: 'pan-down',
      fallbackUrl: CURATED_VERTICAL_FALLBACKS[1],
    },
    {
      title: 'Solución con IA',
      prompt: enrichPrompt('Futuristic sleek AI chatbot interface on modern smartphone automatically responding to customer inquiries with emerald green glowing checkmarks, clean tech aesthetic, photorealistic, 9:16 vertical portrait'),
      query: 'ai technology automation',
      motionType: 'zoom-out',
      fallbackUrl: CURATED_VERTICAL_FALLBACKS[2],
    },
    {
      title: 'Cierre y Acción',
      prompt: enrichPrompt('Successful confident entrepreneur smiling in modern bright sunlit office holding phone as clients book appointments automatically, photorealistic, 9:16 vertical portrait'),
      query: 'successful business entrepreneur',
      motionType: 'pan-right',
      fallbackUrl: CURATED_VERTICAL_FALLBACKS[3],
    },
  ];
}

function enrichPrompt(base) {
  const clean = base.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu, '').trim();
  return `${clean}, cinematic lighting, photorealistic, 8k resolution, vertical 9:16 aspect ratio, commercial advertising photography, masterpiece, sharp focus`;
}

function getMotionForIndex(index) {
  const motions = ['zoom-in', 'pan-down', 'zoom-out', 'pan-right'];
  return motions[index % motions.length];
}

/**
 * Downloads a vertical 9:16 image generated with Flux (Pollinations)
 */
async function downloadFluxImage(prompt, outputPath, seed) {
  const encoded = encodeURIComponent(prompt.slice(0, 260));
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&nologo=true&model=flux&seed=${seed}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Flux HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5000) {
    throw new Error('Downloaded image buffer too small');
  }
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Downloads a curated vertical fallback image
 */
async function downloadCuratedFallback(url, outputPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`Fallback HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Downloads a free vertical B-roll video from Pexels if API key is configured
 */
async function downloadPexelsVideo(query, outputPath) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !query) return null;

  try {
    const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=4`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.videos || data.videos.length === 0) return null;

    const video = data.videos[0];
    const verticalFile = video.video_files.find(f => f.height > f.width && f.quality === 'hd')
      || video.video_files.find(f => f.height > f.width)
      || video.video_files[0];

    if (!verticalFile || !verticalFile.link) return null;

    const downloadRes = await fetch(verticalFile.link, { signal: AbortSignal.timeout(8000) });
    if (!downloadRes.ok) return null;

    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    console.warn(`[Pexels Warning]: ${err.message}`);
    return null;
  }
}

/**
 * Prepares all scene visual assets.
 * Combines Pexels clips, Flux AI images, and curated vertical photography with zero failure rate.
 */
export async function prepareSceneAssets({
  voiceoverText,
  rawScenes = [],
  totalDuration = 30,
  workDir,
}) {
  const sceneConfigs = buildScenePrompts(voiceoverText, rawScenes);
  const count = sceneConfigs.length;

  const proportions = count === 4 ? [0.16, 0.26, 0.32, 0.26] : sceneConfigs.map(() => 1 / count);
  const durations = proportions.map(p => Math.max(2.5, Math.round(totalDuration * p * 10) / 10));

  const sumD = durations.reduce((a, b) => a + b, 0);
  const diff = totalDuration - sumD;
  durations[durations.length - 1] = Math.max(2.5, durations[durations.length - 1] + diff);

  console.log(`[SceneVisuals] Sourcing visual assets for ${count} scenes sequentially...`);

  const preparedScenes = [];

  for (let idx = 0; idx < count; idx++) {
    const cfg = sceneConfigs[idx];
    const sceneDuration = durations[idx];
    const sceneVideoPath = path.join(workDir, `scene_${idx}.mp4`);
    const sceneImagePath = path.join(workDir, `scene_${idx}.jpg`);
    const seed = Math.floor(Math.random() * 90000) + 1000;

    let assetReady = false;

    // 1. Try Pexels video clip if configured
    if (process.env.PEXELS_API_KEY && (idx === 1 || idx === 3)) {
      try {
        const pexelsFile = await downloadPexelsVideo(cfg.query, sceneVideoPath);
        if (pexelsFile && fs.existsSync(pexelsFile)) {
          console.log(`[SceneVisuals] Scene ${idx} loaded from Pexels video`);
          preparedScenes.push({
            type: 'video',
            filePath: pexelsFile,
            durationSec: sceneDuration,
            motionType: cfg.motionType,
          });
          assetReady = true;
        }
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} Pexels fallback: ${err.message}`);
      }
    }

    // 2. Try Flux 9:16 AI image generation
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Generating Flux 9:16 AI image...`);
        const imgFile = await downloadFluxImage(cfg.prompt, sceneImagePath, seed);
        console.log(`[SceneVisuals] Scene ${idx} Flux image ready: ${imgFile}`);
        preparedScenes.push({
          type: 'image',
          filePath: imgFile,
          durationSec: sceneDuration,
          motionType: cfg.motionType,
        });
        assetReady = true;
        // Small delay between Flux requests to prevent 429 rate limit
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} Flux error (${err.message}), using curated vertical HD asset`);
      }
    }

    // 3. Guaranteed High-Res Vertical Photography Fallback
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Downloading curated vertical asset...`);
        const fallbackFile = await downloadCuratedFallback(cfg.fallbackUrl, sceneImagePath);
        console.log(`[SceneVisuals] Scene ${idx} curated fallback ready: ${fallbackFile}`);
        preparedScenes.push({
          type: 'image',
          filePath: fallbackFile,
          durationSec: sceneDuration,
          motionType: cfg.motionType,
        });
        assetReady = true;
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} curated fallback error (${err.message}), using procedural`);
      }
    }

    // 4. Procedural gradient fallback (if network is completely offline)
    if (!assetReady) {
      preparedScenes.push({
        type: 'fallback',
        filePath: null,
        durationSec: sceneDuration,
        motionType: cfg.motionType,
      });
    }
  }

  return preparedScenes;
}
