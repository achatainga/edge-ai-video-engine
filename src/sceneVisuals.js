/**
 * sceneVisuals.js
 * Multi-Tiered Hybrid Visual Engine:
 * - Tier 1: Pexels Vertical Video B-roll (if PEXELS_API_KEY is configured)
 * - Tier 2: Dynamic 9:16 AI Image Generation via Pollinations (Fast Default + Turbo, ~1-2s, 0 rate limit)
 * - Tier 3: Live Royalty-Free Stock Photo Search via Wikimedia Commons / Wikipedia API (100% free, dynamic, context-aware)
 * - Tier 4: Themed Curated Vertical Photography (Faith/Spiritual, Health/Wellness, Nature, Business)
 * - Tier 5: Procedural Ambient Mesh
 */

import fs from 'fs';
import path from 'path';

// Curated high-res vertical (9:16) photography categorized by topic
export const THEMED_VERTICAL_COLLECTIONS = {
  spiritual: [
    'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=720&h=1280&q=80', // Open holy bible with light
    'https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?auto=format&fit=crop&w=720&h=1280&q=80', // Majestic sunrise over mountains
    'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=720&h=1280&q=80', // Peaceful reading & coffee
    'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=720&h=1280&q=80', // Serene clouds and golden sunlight
  ],
  wellness: [
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=720&h=1280&q=80', // Meditation yoga sunrise
    'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=720&h=1280&q=80', // Fresh colorful healthy food
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=720&h=1280&q=80', // Running outdoors
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=720&h=1280&q=80', // Fitness training
  ],
  nature: [
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=720&h=1280&q=80', // Misty green forest
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=720&h=1280&q=80', // Mountain landscape
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=720&h=1280&q=80', // Tropical calm ocean
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=720&h=1280&q=80', // Starry night sky
  ],
  business: [
    'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=720&h=1280&q=80', // Smartphone in hand at night
    'https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=720&h=1280&q=80', // Customer store counter
    'https://images.unsplash.com/photo-1556656793-08538906a9f8?auto=format&fit=crop&w=720&h=1280&q=80', // Modern smartphone tech interface
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=720&h=1280&q=80', // Smiling entrepreneur
  ],
};

/**
 * Detects the thematic category based on narrative text
 */
export function detectThemeCategory(text) {
  const norm = String(text || '').toLowerCase();
  if (/bibl|dios|fe\b|paz\b|oraci|esp[ií]rit|vers[ií]cul|jes[uú]s|cristo|iglesia|religi|se[ñn]or|salmo|evang|devocion/i.test(norm)) {
    return 'spiritual';
  }
  if (/salud|nutrici|ejercici|fitn|gym|comida|receta|diet|medita|bienestar|cuerpo|mente/i.test(norm)) {
    return 'wellness';
  }
  if (/paisaj|viaje|naturalez|playa|monta[ñn]a|cielo|bosque|turism|aventura|oc[eé]ano/i.test(norm)) {
    return 'nature';
  }
  return 'business';
}

/**
 * Builds rich scene configurations matching narrative beats
 */
export function buildScenePrompts(voiceoverText, rawScenes = []) {
  const combinedContext = voiceoverText + ' ' + (rawScenes.map(s => s.visualPrompt || s.title || s.query).join(' '));
  const theme = detectThemeCategory(combinedContext);
  const fallbackList = THEMED_VERTICAL_COLLECTIONS[theme] || THEMED_VERTICAL_COLLECTIONS.business;

  if (Array.isArray(rawScenes) && rawScenes.length >= 2) {
    return rawScenes.map((s, idx) => ({
      title: s.title || `Escena ${idx + 1}`,
      prompt: enrichPrompt(s.visualPrompt || s.title || s.query || voiceoverText),
      query: s.query || s.visualPrompt || s.title || voiceoverText || 'cinematic portrait',
      motionType: getMotionForIndex(idx),
      fallbackUrl: fallbackList[idx % fallbackList.length],
      theme,
    }));
  }

  if (theme === 'spiritual') {
    return [
      {
        title: 'Gancho / Versículo y Fe',
        prompt: enrichPrompt('Cinematic close-up of open Holy Bible with glowing morning sun rays on rustic wooden table, spiritual peace, 8k vertical 9:16 portrait'),
        query: 'open bible morning light',
        motionType: 'zoom-in',
        fallbackUrl: fallbackList[0],
        theme,
      },
      {
        title: 'Reflexión / Promesa Divina',
        prompt: enrichPrompt('Peaceful mountain range at sunrise with soft golden mist, divine tranquility and contemplation, cinematic 9:16 vertical portrait'),
        query: 'peaceful mountain sunrise faith',
        motionType: 'pan-down',
        fallbackUrl: fallbackList[1],
        theme,
      },
      {
        title: 'Esperanza y Calma',
        prompt: enrichPrompt('Serene peaceful atmosphere with warm sunlit rays and quiet prayer, peaceful feeling, 8k 9:16 vertical'),
        query: 'serene sunlight peace prayer',
        motionType: 'zoom-out',
        fallbackUrl: fallbackList[2],
        theme,
      },
      {
        title: 'Bendición y Cierre',
        prompt: enrichPrompt('Golden hour sunset over majestic calm clouds and glowing horizon, divine blessing, cinematic photorealistic 9:16 portrait'),
        query: 'golden sunset clouds blessing',
        motionType: 'pan-right',
        fallbackUrl: fallbackList[3],
        theme,
      },
    ];
  }

  return [
    {
      title: 'Gancho / Hook',
      prompt: enrichPrompt('Cinematic close-up of a smartphone on a dark executive desk, screen glowing with multiple unread WhatsApp chat notifications, moody neon green accents, photorealistic 8k, vertical 9:16 portrait'),
      query: 'smartphone unread messages night',
      motionType: 'zoom-in',
      fallbackUrl: fallbackList[0],
      theme,
    },
    {
      title: 'Problema / Negocio sin responder',
      prompt: enrichPrompt('Stressed small business owner at physical retail counter looking frustrated at missed customer sales, dramatic cinematic lighting, photorealistic, 9:16 portrait'),
      query: 'busy retail store counter',
      motionType: 'pan-down',
      fallbackUrl: fallbackList[1],
      theme,
    },
    {
      title: 'Solución con IA (WhatsApp Mockup)',
      prompt: enrichPrompt('Modern smartphone displaying emerald green WhatsApp chat conversation interface, automated instant AI booking assistant reply with checkmark, ultra crisp UI, 8k, 9:16 vertical'),
      query: 'mobile app messaging ai interface',
      motionType: 'zoom-out',
      fallbackUrl: fallbackList[2],
      theme,
    },
    {
      title: 'Llamado a la Acción / Éxito',
      prompt: enrichPrompt('Smiling successful entrepreneur working on laptop, relaxed and happy with automatic bookings, bright clean modern office, warm lighting, 9:16 vertical portrait'),
      query: 'smiling professional entrepreneur',
      motionType: 'pan-right',
      fallbackUrl: fallbackList[3],
      theme,
    },
  ];
}

function enrichPrompt(base) {
  const clean = base.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu, '').trim();
  return `${clean}, cinematic lighting, photorealistic, 8k resolution, vertical 9:16 aspect ratio, commercial photography, masterpiece, sharp focus`;
}

function getMotionForIndex(index) {
  const motions = ['zoom-in', 'pan-down', 'zoom-out', 'pan-right'];
  return motions[index % motions.length];
}

/**
 * Tier 2: Downloads a vertical 9:16 image generated with Pollinations AI
 * Fast, reliable, no 429 choking, zero watermarks.
 */
async function downloadAiImage(prompt, outputPath, seed) {
  const cleanPrompt = encodeURIComponent(
    `${prompt}, no text, clean composition`.slice(0, 240)
  );

  // Attempt 1: Fast Default model (finishes in ~700ms - 2s)
  const primaryUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=720&height=1280&nologo=true&private=true&seed=${seed}`;
  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(9000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length >= 5000) {
        fs.writeFileSync(outputPath, buffer);
        return outputPath;
      }
    }
  } catch (err) {
    console.warn(`[SceneVisuals] Fast AI attempt 1 failed (${err.message}), trying turbo...`);
  }

  // Attempt 2: Turbo engine fallback
  const turboUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=720&height=1280&nologo=true&private=true&model=turbo&seed=${seed}`;
  const resTurbo = await fetch(turboUrl, { signal: AbortSignal.timeout(8000) });
  if (!resTurbo.ok) {
    throw new Error(`AI HTTP ${resTurbo.status}`);
  }
  const buf = Buffer.from(await resTurbo.arrayBuffer());
  if (buf.length < 5000) {
    throw new Error('AI buffer too small');
  }
  fs.writeFileSync(outputPath, buf);
  return outputPath;
}

/**
 * Tier 3: Dynamic Royalty-Free Stock Photo Search (Wikimedia Commons / Wikipedia API)
 * 100% free, public domain / CC license, zero API key required, completely dynamic.
 */
async function downloadRoyaltyFreeStock(query, outputPath) {
  if (!query) return null;
  const cleanQuery = query
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');

  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=5&prop=pageimages&piprop=original&format=json`;

  try {
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0 (multimedia@victoryhomes.com)' },
      signal: AbortSignal.timeout(6000),
    });

    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const pages = Object.values(data?.query?.pages || {});
    const candidateUrls = pages
      .map(p => p.original?.source)
      .filter(u => typeof u === 'string' && /\.(jpe?g|png|webp)($|\?)/i.test(u));

    if (!candidateUrls.length) return null;

    for (const imgUrl of candidateUrls) {
      try {
        const imgRes = await fetch(imgUrl, {
          headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 10000) {
            fs.writeFileSync(outputPath, buf);
            return outputPath;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn(`[SceneVisuals] Stock search error: ${err.message}`);
  }

  return null;
}

/**
 * Downloads a curated vertical fallback image
 */
async function downloadCuratedFallback(url, outputPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
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
 * Combines Pexels clips, AI generation, dynamic royalty-free stock search, and themed fallbacks.
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

  console.log(`[SceneVisuals] Sourcing visual assets for ${count} scenes (Theme: ${sceneConfigs[0]?.theme || 'business'})...`);

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

    // 2. Dynamic 9:16 AI image generation (Fast Default + Turbo)
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Generating 9:16 AI image ("${cfg.title}")...`);
        const imgFile = await downloadAiImage(cfg.prompt, sceneImagePath, seed);
        console.log(`[SceneVisuals] Scene ${idx} AI image ready: ${imgFile}`);
        preparedScenes.push({
          type: 'image',
          filePath: imgFile,
          durationSec: sceneDuration,
          motionType: cfg.motionType,
        });
        assetReady = true;
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} AI error (${err.message}), trying live stock search...`);
      }
    }

    // 3. Dynamic Royalty-Free Stock Photo Search (Wikimedia Commons)
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Searching royalty-free stock ("${cfg.query}")...`);
        const stockFile = await downloadRoyaltyFreeStock(cfg.query, sceneImagePath);
        if (stockFile && fs.existsSync(stockFile)) {
          console.log(`[SceneVisuals] Scene ${idx} dynamic stock image ready: ${stockFile}`);
          preparedScenes.push({
            type: 'image',
            filePath: stockFile,
            durationSec: sceneDuration,
            motionType: cfg.motionType,
          });
          assetReady = true;
        }
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} stock search error (${err.message}), using themed fallback`);
      }
    }

    // 4. Themed Curated Vertical Photography Fallback
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Downloading themed curated fallback (${cfg.theme})...`);
        const fallbackFile = await downloadCuratedFallback(cfg.fallbackUrl, sceneImagePath);
        console.log(`[SceneVisuals] Scene ${idx} themed fallback ready: ${fallbackFile}`);
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

    // 5. Procedural gradient fallback (if network is completely offline)
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
