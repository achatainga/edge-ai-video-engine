/**
 * sceneVisuals.js
 * Multi-Tiered Hybrid Visual Engine:
 * - Tier 1: Dynamic B-roll Video Search via Pexels (if PEXELS_API_KEY is configured)
 * - Tier 2: Dynamic B-roll Video Search via Pixabay (if PIXABAY_API_KEY is configured)
 * - Tier 3: Live Royalty-Free Video Search via Wikimedia Commons (Keyless, 100% free, CC/Public Domain)
 * - Tier 4: Themed Curated Vertical Video Library (High-def B-roll clips for spiritual, wellness, nature, business, tech)
 * - Tier 5: Dynamic 9:16 AI Image Generation via Pollinations (Fast Default + Turbo, enhanced vibrant aesthetics)
 * - Tier 6: Pexels Stock Photo Search (if PEXELS_API_KEY is configured)
 * - Tier 7: Pixabay Stock Photo Search (if PIXABAY_API_KEY is configured)
 * - Tier 8: Live Royalty-Free Stock Photo Search via Wikipedia / Wikimedia Commons (Keyless, 100% free)
 * - Tier 9: Themed Curated Vertical Photography (Faith/Spiritual, Health/Wellness, Nature, Business, Tech)
 * - Tier 10: Procedural Dynamic Ambient Mesh Fallback
 */

import fs from 'fs';
import path from 'path';

// Curated high-res vertical (9:16) photography categorized by topic
export const THEMED_VERTICAL_COLLECTIONS = {
  spiritual: [
    'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=720&h=1280&q=80', // Open holy bible with morning light
    'https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?auto=format&fit=crop&w=720&h=1280&q=80', // Majestic sunrise over mountains
    'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=720&h=1280&q=80', // Peaceful reading & coffee
    'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=720&h=1280&q=80', // Serene clouds and golden sunlight
    'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=720&h=1280&q=80', // Peaceful dawn prayer
  ],
  wellness: [
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=720&h=1280&q=80', // Meditation yoga sunrise
    'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=720&h=1280&q=80', // Fresh colorful healthy food
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=720&h=1280&q=80', // Running outdoors
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=720&h=1280&q=80', // Fitness training
    'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=720&h=1280&q=80', // Fresh green organic salad bowl
  ],
  nature: [
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=720&h=1280&q=80', // Misty green forest
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=720&h=1280&q=80', // Mountain landscape
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=720&h=1280&q=80', // Tropical calm ocean
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=720&h=1280&q=80', // Starry night sky
    'https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=720&h=1280&q=80', // Lush jungle waterfall
  ],
  business: [
    'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=720&h=1280&q=80', // Smartphone in hand at night
    'https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=720&h=1280&q=80', // Customer store counter
    'https://images.unsplash.com/photo-1556656793-08538906a9f8?auto=format&fit=crop&w=720&h=1280&q=80', // Modern smartphone tech interface
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=720&h=1280&q=80', // Smiling entrepreneur
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=720&h=1280&q=80', // Bright clean modern corporate office
  ],
  tech: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=720&h=1280&q=80', // Microchip technology motherboard
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=720&h=1280&q=80', // Cyber neon server room
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=720&h=1280&q=80', // Matrix digital code stream
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=720&h=1280&q=80', // Ultra-sleek laptop with glowing keyboard
  ],
};

// Curated royalty-free vertical / cinematic B-roll video clips categorized by topic (< 8MB verified lightweight clips)
export const THEMED_VERTICAL_VIDEOS = {
  spiritual: [
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Timelapse_of_the_sky_at_night_and_in_the_day.webm', // 7.5MB day/night sky
    'https://upload.wikimedia.org/wikipedia/commons/d/d6/Timelapse_Noche_en_el_Museo_W%C3%BCrth_La_Rioja.webm', // 6.0MB starry night timelapse
  ],
  wellness: [
    'https://upload.wikimedia.org/wikipedia/commons/2/27/Side_view_video_of_Kawaida_Waterfall_cascading%2C_Cianda%2C_Kiambu_County.webm', // 2.3MB serene waterfall
    'https://upload.wikimedia.org/wikipedia/commons/2/28/Front_view_video_of_Kawaida_Waterfall%2C_Cianda%2C_Kiambu_County.webm', // 3.4MB calm nature water
  ],
  nature: [
    'https://upload.wikimedia.org/wikipedia/commons/e/e6/Video_from_behind_Kawaida_Waterfall_through_hanging_roots%2C_Kiambu_County.webm', // 1.8MB lush green waterfall
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Timelapse_of_the_sky_at_night_and_in_the_day.webm', // 7.5MB outdoor sky
  ],
  business: [
    'https://upload.wikimedia.org/wikipedia/commons/3/31/Cyclist-controlled_traffic_light_phases.webm', // 1.4MB active city transit/movement
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Timelapse_of_the_sky_at_night_and_in_the_day.webm', // 7.5MB timelapse skyline
  ],
  tech: [
    'https://upload.wikimedia.org/wikipedia/commons/8/89/Inauguration_of_the_2nd_China_%28Mianyang%29_Science_%26_Technology_City_International_Hi-Tech_Expo_12.webm', // 6.4MB dynamic tech showcase
    'https://upload.wikimedia.org/wikipedia/commons/d/d6/Timelapse_Noche_en_el_Museo_W%C3%BCrth_La_Rioja.webm', // 6.0MB modern architecture
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
  if (/paisaj|viaje|naturalez|playa|monta[ñn]a|cielo|bosque|turism|aventura|oc[eé]ano|cascada/i.test(norm)) {
    return 'nature';
  }
  if (/software|tecnolog|ia\b|inteligencia\s*artificial|bot\b|c[oó]digo|programaci|servidor|cloud|algoritm/i.test(norm)) {
    return 'tech';
  }
  return 'business';
}

/**
 * Builds rich scene configurations matching narrative beats.
 * Supports LLM-directed media types (video vs image), English search queries, and camera motions.
 */
export function buildScenePrompts(voiceoverText, rawScenes = []) {
  const combinedContext = voiceoverText + ' ' + (rawScenes.map(s => s.visualPrompt || s.title || s.searchQuery || s.query).join(' '));
  const theme = detectThemeCategory(combinedContext);
  const fallbackList = THEMED_VERTICAL_COLLECTIONS[theme] || THEMED_VERTICAL_COLLECTIONS.business;
  const fallbackVideoList = THEMED_VERTICAL_VIDEOS[theme] || THEMED_VERTICAL_VIDEOS.business;

  if (Array.isArray(rawScenes) && rawScenes.length >= 2) {
    return rawScenes.map((s, idx) => {
      const motionType = s.motionType || s.motion?.motionType || getMotionForIndex(idx);
      const mediaType = s.mediaType || (idx % 2 === 0 ? 'video' : 'image');
      const searchQuery = (s.searchQuery || s.query || s.visualPrompt || s.title || voiceoverText || 'cinematic portrait')
        .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, ' ')
        .trim();

      return {
        title: s.title || s.onScreenText || `Escena ${idx + 1}`,
        prompt: enrichPrompt(s.visualPrompt || s.title || s.query || voiceoverText, s.colorMood),
        query: searchQuery,
        searchQuery,
        mediaType,
        motionType,
        colorMood: s.colorMood || 'vibrant',
        fallbackUrl: fallbackList[idx % fallbackList.length],
        fallbackVideoUrl: fallbackVideoList[idx % fallbackVideoList.length],
        theme,
      };
    });
  }

  // Curated theme-specific narrative storyboards with dynamic video & photo variety
  if (theme === 'spiritual') {
    return [
      {
        title: 'Gancho / Versículo y Fe',
        prompt: enrichPrompt('Cinematic close-up of open Holy Bible with glowing morning sun rays on rustic wooden table, spiritual peace, 8k vertical 9:16 portrait, photorealistic'),
        query: 'open holy bible morning sun light',
        searchQuery: 'open holy bible morning sun light',
        mediaType: 'video',
        motionType: 'punch-in',
        fallbackUrl: fallbackList[0],
        fallbackVideoUrl: fallbackVideoList[0],
        theme,
      },
      {
        title: 'Reflexión / Promesa Divina',
        prompt: enrichPrompt('Peaceful mountain range at sunrise with soft golden mist, divine tranquility and contemplation, cinematic 9:16 vertical portrait, photorealistic'),
        query: 'peaceful mountain sunrise faith clouds',
        searchQuery: 'peaceful mountain sunrise faith clouds',
        mediaType: 'video',
        motionType: 'pan-left',
        fallbackUrl: fallbackList[1],
        fallbackVideoUrl: fallbackVideoList[1 % fallbackVideoList.length],
        theme,
      },
      {
        title: 'Esperanza y Calma',
        prompt: enrichPrompt('Serene peaceful atmosphere with warm sunlit rays and quiet prayer, peaceful feeling, 8k 9:16 vertical, photorealistic'),
        query: 'serene sunlight peace prayer meditation',
        searchQuery: 'serene sunlight peace prayer meditation',
        mediaType: 'image',
        motionType: 'zoom-out',
        fallbackUrl: fallbackList[2],
        fallbackVideoUrl: fallbackVideoList[2 % fallbackVideoList.length],
        theme,
      },
      {
        title: 'Bendición y Cierre',
        prompt: enrichPrompt('Golden hour sunset over majestic calm clouds and glowing horizon, divine blessing, cinematic photorealistic 9:16 portrait'),
        query: 'golden sunset clouds blessing horizon',
        searchQuery: 'golden sunset clouds blessing horizon',
        mediaType: 'image',
        motionType: 'zoom-in',
        fallbackUrl: fallbackList[3],
        fallbackVideoUrl: fallbackVideoList[0],
        theme,
      },
    ];
  }

  return [
    {
      title: 'Gancho / Hook',
      prompt: enrichPrompt('Cinematic close-up of a modern smartphone on a dark executive desk, screen glowing with multiple unread WhatsApp notifications, moody neon green accents, photorealistic 8k, vertical 9:16 portrait'),
      query: 'smartphone glowing notifications night desk',
      searchQuery: 'smartphone glowing notifications night desk',
      mediaType: 'video',
      motionType: 'punch-in',
      fallbackUrl: fallbackList[0],
      fallbackVideoUrl: fallbackVideoList[0],
      theme,
    },
    {
      title: 'Problema / Negocio sin responder',
      prompt: enrichPrompt('Stressed small business owner at physical retail counter looking frustrated at missed customer sales, dramatic cinematic lighting, photorealistic, 9:16 portrait'),
      query: 'busy retail cashier customer store counter',
      searchQuery: 'busy retail cashier customer store counter',
      mediaType: 'video',
      motionType: 'pan-left',
      fallbackUrl: fallbackList[1],
      fallbackVideoUrl: fallbackVideoList[1 % fallbackVideoList.length],
      theme,
    },
    {
      title: 'Solución con IA (WhatsApp Mockup)',
      prompt: enrichPrompt('Modern smartphone displaying emerald green WhatsApp chat conversation interface, automated instant AI booking assistant reply with checkmark, ultra crisp UI, photorealistic 8k, 9:16 vertical'),
      query: 'modern smartphone messaging interface screen',
      searchQuery: 'modern smartphone messaging interface screen',
      mediaType: 'image',
      motionType: 'zoom-out',
      fallbackUrl: fallbackList[2],
      fallbackVideoUrl: fallbackVideoList[0],
      theme,
    },
    {
      title: 'Llamado a la Acción / Éxito',
      prompt: enrichPrompt('Smiling successful entrepreneur working on laptop, relaxed and happy with automatic bookings, bright clean modern office, warm lighting, photorealistic 9:16 vertical portrait'),
      query: 'smiling successful entrepreneur office laptop',
      searchQuery: 'smiling successful entrepreneur office laptop',
      mediaType: 'image',
      motionType: 'zoom-in',
      fallbackUrl: fallbackList[3],
      fallbackVideoUrl: fallbackVideoList[0],
      theme,
    },
  ];
}

/**
 * Enriches base visual prompts with aesthetic descriptors for maximum visual punch & saturation
 */
export function enrichPrompt(base, colorMood = 'vibrant') {
  const clean = base.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu, '').trim();
  const moodDesc = colorMood === 'warm'
    ? 'warm golden hour sunlight, rich amber tones'
    : colorMood === 'neon'
    ? 'vivid neon lighting, electric lime and cyan highlights, moody contrast'
    : colorMood === 'cool'
    ? 'cool crisp cinematic tones, clean modern aesthetic'
    : 'vibrant saturated colors, vivid lighting, punchy high contrast';

  return `${clean}, ${moodDesc}, cinematic lighting, photorealistic, 8k resolution, vertical 9:16 aspect ratio, commercial photography, masterpiece, sharp focus, crisp details`;
}

/**
 * Returns dynamic, diverse camera motion sequence
 */
export function getMotionForIndex(index) {
  const motions = ['punch-in', 'pan-right', 'zoom-out', 'pan-left', 'zoom-in', 'tilt-up'];
  return motions[index % motions.length];
}

/**
 * Tier 5: Downloads a vertical 9:16 image generated with Pollinations AI
 * Fast, reliable, with aesthetic vibrant composition and timeout guard.
 */
export async function downloadAiImage(prompt, outputPath, seed) {
  const cleanPrompt = encodeURIComponent(
    `${prompt}, vibrant saturated colors, 8k, no text, clean composition`.slice(0, 240)
  );

  // Attempt 1: Fast Default model (finishes in ~700ms - 2s)
  const primaryUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=720&height=1280&nologo=true&private=true&seed=${seed}`;
  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(6000) });
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
  try {
    const turboUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=720&height=1280&nologo=true&private=true&model=turbo&seed=${seed}`;
    const resTurbo = await fetch(turboUrl, { signal: AbortSignal.timeout(6000) });
    if (resTurbo.ok) {
      const buf = Buffer.from(await resTurbo.arrayBuffer());
      if (buf.length >= 5000) {
        fs.writeFileSync(outputPath, buf);
        return outputPath;
      }
    }
  } catch (err) {
    console.warn(`[SceneVisuals] Turbo AI failed: ${err.message}`);
  }

  throw new Error('AI image generation unavailable');
}

/**
 * Tier 6-8: Dynamic Royalty-Free Stock Photo Search
 * Checks Pexels Photo API, Pixabay Photo API, and Wikipedia / Wikimedia Commons API.
 */
export async function downloadRoyaltyFreeStock(query, outputPath) {
  if (!query) return null;
  const cleanQuery = query
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');

  // 1. Try Pexels Photos if configured
  if (process.env.PEXELS_API_KEY) {
    try {
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(cleanQuery)}&orientation=portrait&per_page=5`;
      const res = await fetch(pexelsUrl, {
        headers: { Authorization: process.env.PEXELS_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const photos = data.photos || [];
        if (photos.length > 0 && photos[0].src) {
          const imgUrl = photos[0].src.large2x || photos[0].src.large || photos[0].src.original;
          const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(6000) });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            if (buf.length > 10000) {
              fs.writeFileSync(outputPath, buf);
              return outputPath;
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[SceneVisuals] Pexels photo search warning: ${err.message}`);
    }
  }

  // 2. Try Pixabay Photos if configured
  if (process.env.PIXABAY_API_KEY) {
    try {
      const pixabayUrl = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(cleanQuery)}&image_type=photo&orientation=vertical&per_page=5`;
      const res = await fetch(pixabayUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const hits = data.hits || [];
        if (hits.length > 0 && hits[0].largeImageURL) {
          const imgRes = await fetch(hits[0].largeImageURL, { signal: AbortSignal.timeout(6000) });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            if (buf.length > 10000) {
              fs.writeFileSync(outputPath, buf);
              return outputPath;
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[SceneVisuals] Pixabay photo search warning: ${err.message}`);
    }
  }

  // 3. Dynamic Royalty-Free Wikimedia Commons Media Search (Keyless, 100% Free)
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime|dimensions&format=json`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0 (multimedia@victoryhomes.com)' },
      signal: AbortSignal.timeout(5000),
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      const pages = Object.values(data?.query?.pages || {});
      const imageCandidates = pages
        .map(p => p.imageinfo?.[0])
        .filter(info => {
          if (!info || !info.url) return false;
          const mime = info.mime || '';
          const isImg = mime.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(info.url);
          const validSize = (info.size || 0) < 15 * 1024 * 1024 && (info.size || 0) > 20000;
          return isImg && validSize;
        });

      // Sort candidates prioritizing portrait orientation (height >= width)
      imageCandidates.sort((a, b) => {
        const aPortrait = (a.height || 0) >= (a.width || 0) ? 1 : 0;
        const bPortrait = (b.height || 0) >= (b.width || 0) ? 1 : 0;
        return bPortrait - aPortrait;
      });

      for (const cand of imageCandidates) {
        try {
          const imgRes = await fetch(cand.url, {
            headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0' },
            signal: AbortSignal.timeout(6000),
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
    }
  } catch (err) {
    console.warn(`[SceneVisuals] Wikimedia Commons stock photo error: ${err.message}`);
  }

  return null;
}

/**
 * Downloads a curated vertical fallback image
 */
export async function downloadCuratedFallback(url, outputPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    throw new Error(`Fallback HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Downloads a vertical B-roll video from Pexels if API key is configured
 */
export async function downloadPexelsVideo(query, outputPath) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !query) return null;

  try {
    const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=6`;
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
    if (buffer.length > 30000) {
      fs.writeFileSync(outputPath, buffer);
      return outputPath;
    }
    return null;
  } catch (err) {
    console.warn(`[Pexels Video Warning]: ${err.message}`);
    return null;
  }
}

/**
 * Downloads a vertical B-roll video from Pixabay if API key is configured
 */
export async function downloadPixabayVideo(query, outputPath) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey || !query) return null;

  try {
    const searchUrl = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&orientation=vertical&per_page=5`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.hits || data.hits.length === 0) return null;

    const hit = data.hits[0];
    const videoStream = hit.videos?.medium?.url || hit.videos?.small?.url || hit.videos?.large?.url;
    if (!videoStream) return null;

    const downloadRes = await fetch(videoStream, { signal: AbortSignal.timeout(8000) });
    if (!downloadRes.ok) return null;

    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    if (buffer.length > 30000) {
      fs.writeFileSync(outputPath, buffer);
      return outputPath;
    }
    return null;
  } catch (err) {
    console.warn(`[Pixabay Video Warning]: ${err.message}`);
    return null;
  }
}

/**
 * Downloads an open video from Wikimedia Commons API (keyless & 100% free)
 */
export async function downloadCommonsVideo(query, outputPath) {
  if (!query) return null;
  const cleanQuery = query
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');

  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery + ' filetype:video')}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&format=json`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const pages = Object.values(data?.query?.pages || {});
    // Filter videos with size strictly between 200KB and 20MB to protect memory & prevent OOM
    const videoPages = pages.filter(p => {
      const info = p.imageinfo?.[0];
      if (!info) return false;
      const mime = info.mime || '';
      const isVideo = mime.startsWith('video/') || /\.(mp4|webm)$/i.test(info.url || '');
      const validSize = info.size > 200000 && info.size < 20 * 1024 * 1024;
      return isVideo && validSize;
    });

    if (!videoPages.length) return null;

    for (const vp of videoPages) {
      const videoUrl = vp.imageinfo?.[0]?.url;
      if (!videoUrl) continue;

      try {
        const downloadRes = await fetch(videoUrl, {
          headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (downloadRes.ok) {
          const cl = Number(downloadRes.headers.get('content-length') || 0);
          if (cl > 20 * 1024 * 1024) continue; // Skip oversized streams
          const buf = Buffer.from(await downloadRes.arrayBuffer());
          if (buf.length > 40000) {
            fs.writeFileSync(outputPath, buf);
            return outputPath;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn(`[Commons Video Warning]: ${err.message}`);
  }

  return null;
}

/**
 * Sourcing pipeline for royalty-free vertical B-roll video:
 * 1. Pexels Video (if key configured)
 * 2. Pixabay Video (if key configured)
 * 3. Wikimedia Commons Open Video (keyless, 100% free)
 * 4. Themed Curated Vertical Video Library
 */
export async function downloadRoyaltyFreeVideo(query, outputPath, theme = 'business', sceneIdx = 0) {
  // 1. Pexels
  try {
    const pexelsPath = await downloadPexelsVideo(query, outputPath);
    if (pexelsPath && fs.existsSync(pexelsPath) && fs.statSync(pexelsPath).size > 30000) {
      return pexelsPath;
    }
  } catch {}

  // 2. Pixabay
  try {
    const pixabayPath = await downloadPixabayVideo(query, outputPath);
    if (pixabayPath && fs.existsSync(pixabayPath) && fs.statSync(pixabayPath).size > 30000) {
      return pixabayPath;
    }
  } catch {}

  // 3. Wikimedia Commons dynamic open video search
  try {
    const commonsPath = await downloadCommonsVideo(query, outputPath);
    if (commonsPath && fs.existsSync(commonsPath) && fs.statSync(commonsPath).size > 30000) {
      return commonsPath;
    }
  } catch {}

  // 4. Themed Curated Vertical Video fallback
  try {
    const videoList = THEMED_VERTICAL_VIDEOS[theme] || THEMED_VERTICAL_VIDEOS.business;
    const fallbackUrl = videoList[sceneIdx % videoList.length];
    if (fallbackUrl) {
      const res = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'EdgeAiVideoEngine/2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 30000) {
          fs.writeFileSync(outputPath, buf);
          return outputPath;
        }
      }
    }
  } catch (err) {
    console.warn(`[Themed Video Fallback Warning]: ${err.message}`);
  }

  return null;
}

/**
 * Prepares all scene visual assets.
 * Uses AI reasoning to select between vertical B-roll video clips and high-impact photographs.
 * Never settles for static defaults; dynamically queries open video and stock APIs.
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

    // A. If scene requests Video B-roll (or dynamic alternation)
    if (cfg.mediaType === 'video') {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Sourcing vertical B-roll video clip (Query: "${cfg.query}")...`);
        const videoFile = await downloadRoyaltyFreeVideo(cfg.query, sceneVideoPath, cfg.theme, idx);
        if (videoFile && fs.existsSync(videoFile)) {
          console.log(`[SceneVisuals] Scene ${idx} vertical B-roll video ready: ${videoFile}`);
          preparedScenes.push({
            type: 'video',
            filePath: videoFile,
            durationSec: sceneDuration,
            motionType: cfg.motionType,
            colorMood: cfg.colorMood,
          });
          assetReady = true;
        }
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} video sourcing failed (${err.message}), falling back to photo pipeline`);
      }
    }

    // B. If scene requests Image or if Video search fell back to Image:
    // If scene specifically requested 'ai_image', prioritize generative AI:
    if (!assetReady && cfg.mediaType === 'ai_image') {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Generating 9:16 AI image ("${cfg.title}")...`);
        const imgFile = await downloadAiImage(cfg.prompt, sceneImagePath, seed);
        console.log(`[SceneVisuals] Scene ${idx} AI image ready: ${imgFile}`);
        preparedScenes.push({
          type: 'image',
          filePath: imgFile,
          durationSec: sceneDuration,
          motionType: cfg.motionType,
          colorMood: cfg.colorMood,
        });
        assetReady = true;
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} AI image error (${err.message}), trying live stock photo search...`);
      }
    }

    // 1. Dynamic Royalty-Free Stock Photo Search (Pexels / Pixabay / Wikimedia Commons Media)
    // Sourced via AI reasoning keywords so real photos are prioritized over synthetic defaults
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Searching royalty-free stock photo ("${cfg.query}")...`);
        const stockFile = await downloadRoyaltyFreeStock(cfg.query, sceneImagePath);
        if (stockFile && fs.existsSync(stockFile)) {
          console.log(`[SceneVisuals] Scene ${idx} dynamic stock image ready: ${stockFile}`);
          preparedScenes.push({
            type: 'image',
            filePath: stockFile,
            durationSec: sceneDuration,
            motionType: cfg.motionType,
            colorMood: cfg.colorMood,
          });
          assetReady = true;
        }
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} stock photo error (${err.message}), using curated photo fallback`);
      }
    }

    // 2. Themed Curated Vertical Photography Fallback (Unsplash 9:16 high-res collections)
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Downloading themed curated photo (${cfg.theme})...`);
        const fallbackFile = await downloadCuratedFallback(cfg.fallbackUrl, sceneImagePath);
        console.log(`[SceneVisuals] Scene ${idx} themed photo fallback ready: ${fallbackFile}`);
        preparedScenes.push({
          type: 'image',
          filePath: fallbackFile,
          durationSec: sceneDuration,
          motionType: cfg.motionType,
          colorMood: cfg.colorMood,
        });
        assetReady = true;
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} curated photo fallback error (${err.message}), trying AI generation fallback`);
      }
    }

    // 3. Dynamic 9:16 AI Image Generation Fallback (Pollinations with vibrant saturation)
    if (!assetReady) {
      try {
        console.log(`[SceneVisuals] Scene ${idx}: Generating 9:16 AI image ("${cfg.title}")...`);
        const imgFile = await downloadAiImage(cfg.prompt, sceneImagePath, seed);
        console.log(`[SceneVisuals] Scene ${idx} AI image fallback ready: ${imgFile}`);
        preparedScenes.push({
          type: 'image',
          filePath: imgFile,
          durationSec: sceneDuration,
          motionType: cfg.motionType,
          colorMood: cfg.colorMood,
        });
        assetReady = true;
      } catch (err) {
        console.warn(`[SceneVisuals] Scene ${idx} AI image fallback error (${err.message}), using procedural`);
      }
    }

    // 4. Procedural animated gradient mesh (zero-network safety net)
    if (!assetReady) {
      preparedScenes.push({
        type: 'fallback',
        filePath: null,
        durationSec: sceneDuration,
        motionType: cfg.motionType,
        colorMood: cfg.colorMood,
      });
    }
  }

  return preparedScenes;
}
