/**
 * sceneVisuals.js
 * Hybrid AI Visual Engine (Flux 9:16 AI Generation + Pexels B-Roll Downloader)
 * Prepares scene-by-scene visual assets with cinematic camera movement configurations.
 */

import fs from 'fs';
import path from 'path';

/**
 * Generates rich English prompts for Flux 9:16 vertical generation based on script beats
 */
export function buildScenePrompts(voiceoverText, rawScenes = []) {
  // If the orchestrator already sent storyboard scenes with prompts, use them
  if (Array.isArray(rawScenes) && rawScenes.length >= 2) {
    return rawScenes.map((s, idx) => ({
      title: s.title || `Escena ${idx + 1}`,
      prompt: enrichPrompt(s.visualPrompt || s.title || s.query || voiceoverText),
      query: s.query || s.visualPrompt || 'business technology',
      motionType: getMotionForIndex(idx),
    }));
  }

  // Default 4-beat advertising narrative structure for business/AI videos
  return [
    {
      title: 'Gancho / Hook',
      prompt: enrichPrompt('Close up of a smartphone glowing at night in a dark modern office with dozens of unread WhatsApp message notifications piling up on screen, dramatic moody lighting, hyper-realistic, 8k resolution, vertical 9:16 portrait photography'),
      query: 'smartphone notifications office',
      motionType: 'zoom-in',
    },
    {
      title: 'Problema / Dolor',
      prompt: enrichPrompt('A frustrated customer turning away from a store counter looking disappointed at phone, competitor store in background, dramatic cinematic lighting, photorealistic, 9:16 vertical portrait'),
      query: 'frustrated customer phone',
      motionType: 'pan-down',
    },
    {
      title: 'Solución con IA',
      prompt: enrichPrompt('Futuristic sleek AI chatbot interface on modern smartphone automatically responding to customer inquiries with luminous emerald green checkmarks, clean tech aesthetic, photorealistic, 9:16 vertical portrait'),
      query: 'ai technology automation',
      motionType: 'zoom-out',
    },
    {
      title: 'Cierre y Acción',
      prompt: enrichPrompt('Successful confident entrepreneur smiling in modern bright sunlit office holding phone as clients book appointments automatically, clean aesthetic, photorealistic, 9:16 vertical portrait'),
      query: 'successful business entrepreneur',
      motionType: 'pan-right',
    },
  ];
}

/**
 * Enriches any prompt with cinematic vertical portrait styling tags for Flux
 */
function enrichPrompt(base) {
  const clean = base.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu, '').trim();
  return `${clean}, cinematic lighting, photorealistic, 8k resolution, vertical 9:16 aspect ratio, mobile wallpaper format, professional commercial photography, masterpiece, sharp focus`;
}

/**
 * Alternates camera motion types for visual rhythm
 */
function getMotionForIndex(index) {
  const motions = ['zoom-in', 'pan-down', 'zoom-out', 'pan-right'];
  return motions[index % motions.length];
}

/**
 * Downloads a vertical 9:16 image generated with Flux from Pollinations (100% Free, No API key)
 */
async function downloadFluxImage(prompt, outputPath, seed = 42) {
  const encoded = encodeURIComponent(prompt.slice(0, 300));
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&nologo=true&model=flux&seed=${seed}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`Flux image fetch returned HTTP ${res.status}`);
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

    const downloadRes = await fetch(verticalFile.link, { signal: AbortSignal.timeout(10000) });
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
 * Prepares all scene visual assets in parallel.
 * Combines Pexels B-roll clips and Flux 9:16 AI images with graceful fallbacks.
 */
export async function prepareSceneAssets({
  voiceoverText,
  rawScenes = [],
  totalDuration = 30,
  workDir,
}) {
  const sceneConfigs = buildScenePrompts(voiceoverText, rawScenes);
  const count = sceneConfigs.length;

  // Distribute total duration across scenes proportionally
  // Hook is faster (~15%), problem (~25%), solution (~35%), CTA (~25%)
  const proportions = count === 4 ? [0.16, 0.26, 0.32, 0.26] : sceneConfigs.map(() => 1 / count);
  const durations = proportions.map(p => Math.max(2.5, Math.round(totalDuration * p * 10) / 10));

  // Adjust last scene so sum matches totalDuration
  const sumD = durations.reduce((a, b) => a + b, 0);
  const diff = totalDuration - sumD;
  durations[durations.length - 1] = Math.max(2.5, durations[durations.length - 1] + diff);

  console.log(`[SceneVisuals] Sourcing visual assets for ${count} scenes in parallel...`);

  // Download all scenes concurrently
  const assetPromises = sceneConfigs.map(async (cfg, idx) => {
    const sceneDuration = durations[idx];
    const sceneVideoPath = path.join(workDir, `scene_${idx}.mp4`);
    const sceneImagePath = path.join(workDir, `scene_${idx}.jpg`);
    const seed = Math.floor(Math.random() * 90000) + 1000;

    // 1. Try Pexels video clip for scenes 1 or 3 (Dolor or CTA) if API key available
    if (process.env.PEXELS_API_KEY && (idx === 1 || idx === 3)) {
      try {
        const pexelsFile = await downloadPexelsVideo(cfg.query, sceneVideoPath);
        if (pexelsFile && fs.existsSync(pexelsFile)) {
          console.log(`[SceneVisuals] Scene ${idx} loaded from Pexels video: ${cfg.query}`);
          return {
            type: 'video',
            filePath: pexelsFile,
            durationSec: sceneDuration,
            motionType: cfg.motionType,
          };
        }
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} Pexels fallback:`, err.message);
      }
    }

    // 2. Generate Flux 9:16 AI image
    try {
      console.log(`[SceneVisuals] Generating Scene ${idx} AI image (Flux 9:16)...`);
      const imgFile = await downloadFluxImage(cfg.prompt, sceneImagePath, seed);
      console.log(`[SceneVisuals] Scene ${idx} Flux image ready: ${imgFile}`);
      return {
        type: 'image',
        filePath: imgFile,
        durationSec: sceneDuration,
        motionType: cfg.motionType,
      };
    } catch (err) {
      console.warn(`[SceneVisuals] Scene ${idx} Flux download failed (${err.message}), falling back to procedural`);
      return {
        type: 'fallback',
        filePath: null,
        durationSec: sceneDuration,
        motionType: cfg.motionType,
      };
    }
  });

  const results = await Promise.allSettled(assetPromises);

  return results.map((r, idx) => {
    if (r.status === 'fulfilled' && r.value) {
      return r.value;
    }
    return {
      type: 'fallback',
      filePath: null,
      durationSec: durations[idx] || 5,
      motionType: getMotionForIndex(idx),
    };
  });
}
