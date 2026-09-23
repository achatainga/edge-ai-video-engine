/**
 * backgroundProvider.js
 * Generates dynamic, high-retention visual backgrounds and overlay filters for FFmpeg.
 * - Ultra-lightweight procedural animated gradient mesh (64x64 math scaled to 720x1280 bicubic, <2s render time on 0.1 CPU).
 * - Optional Pexels B-roll vertical video downloader if PEXELS_API_KEY is available.
 * - Dynamic retention progress bar at top of video using color + overlay.
 * - Modern translucent header card badge with top accent.
 */

import fs from 'fs';
import path from 'path';

/**
 * Escapes strings for safe use inside FFmpeg filter graphs
 */
export function escapeFfmpegText(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .trim();
}

/**
 * Escapes file paths for the FFmpeg subtitles filter
 */
export function escapeFilterPath(filePath) {
  if (!filePath) return '';
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Checks for the best available font on the system
 */
export function resolveBestFont() {
  const montserratBlack = '/usr/share/fonts/montserrat/Montserrat-Black.ttf';
  const montserratBold = '/usr/share/fonts/montserrat/Montserrat-Bold.ttf';
  const dejavuBold = '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf';
  const dejavuRegular = '/usr/share/fonts/dejavu/DejaVuSans.ttf';

  if (fs.existsSync(montserratBold)) {
    return { path: montserratBold, name: 'Montserrat' };
  }
  if (fs.existsSync(montserratBlack)) {
    return { path: montserratBlack, name: 'Montserrat Black' };
  }
  if (fs.existsSync(dejavuBold)) {
    return { path: dejavuBold, name: 'DejaVu Sans' };
  }
  if (fs.existsSync(dejavuRegular)) {
    return { path: dejavuRegular, name: 'DejaVu Sans' };
  }
  return { path: null, name: 'Sans' };
}

/**
 * Attempts to download a free vertical B-roll video from Pexels if API key is configured
 */
export async function fetchPexelsBroll(query, targetDir) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !query) return null;

  try {
    const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`;
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

    const brollPath = path.join(targetDir, 'broll.mp4');
    const downloadRes = await fetch(verticalFile.link, { signal: AbortSignal.timeout(10000) });
    if (!downloadRes.ok) return null;

    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    fs.writeFileSync(brollPath, buffer);
    return brollPath;
  } catch (err) {
    console.warn('[Pexels B-Roll Warning]: Could not fetch video B-roll, using procedural animated gradient:', err.message);
    return null;
  }
}

/**
 * Builds the complete FFmpeg filtergraph for high-retention video rendering
 */
export function buildFilterGraph({
  title = 'Video Promocional',
  totalDuration = 30,
  assPath = null,
  brollVideoPath = null,
}) {
  const bestFont = resolveBestFont();
  const fontFileOpt = bestFont.path ? `:fontfile=${bestFont.path}` : '';
  const safeTitle = escapeFfmpegText(title.slice(0, 40));
  const safeDuration = Math.max(1, Number(totalDuration) || 30);

  const filters = [];

  if (brollVideoPath && fs.existsSync(brollVideoPath)) {
    filters.push(
      `[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,drawbox=x=0:y=0:w=720:h=1280:color=black@0.55:t=fill[bg]`
    );
  } else {
    // Ultra-lightweight procedural gradient mesh in RGB space, then scaled bicubic and converted to YUV420p
    filters.push(
      `[0:v]format=rgb24,geq=r='20+15*sin(2*PI*(X/64+T/6))':g='22+18*cos(2*PI*(Y/64-T/5))':b='65+35*sin(2*PI*(X/64+Y/64+T/7))',scale=720:1280:flags=bicubic,format=yuv420p[bg]`
    );
  }

  // Header Card: Translucent slate badge with electric neon green top accent line
  filters.push(
    `[bg]drawbox=x=60:y=80:w=600:h=85:color=0x111827@0.82:t=fill,drawbox=x=60:y=80:w=600:h=3:color=0x00FF88@1:t=fill[vhdr]`
  );

  // Header Title Text: Centered, clean typography
  filters.push(
    `[vhdr]drawtext=text='${safeTitle}'${fontFileOpt}:fontcolor=white:fontsize=26:x=(w-text_w)/2:y=110:expansion=none[vtxt]`
  );

  // Retention Progress Bar: Color source overlaid at top with x moving from -w to 0 based on time t
  filters.push(
    `color=c=0x00FF88:s=720x10:r=24[bar]`
  );
  filters.push(
    `[vtxt][bar]overlay=x='-w+(w/${safeDuration})*t':y=0:shortest=1[vbar]`
  );

  // Subtitles overlay: Libass renderer using the dynamic kinetic ASS file
  if (assPath && fs.existsSync(assPath)) {
    const escapedAss = escapeFilterPath(assPath);
    filters.push(
      `[vbar]subtitles='${escapedAss}'[outv]`
    );
  } else {
    filters.push(
      `[vbar]copy[outv]`
    );
  }

  return filters.join(';');
}
