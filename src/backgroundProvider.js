/**
 * backgroundProvider.js
 * Multi-Scene Ken Burns Cinema Engine & Dynamic Overlay Pipeline
 * - Multi-scene assembly with cinematic camera motion (Zoom In, Pan Down, Zoom Out, Pan Right).
 * - Video B-roll trimming and scaling (Pexels).
 * - Procedural gradient mesh fallback.
 * - Cinematic dark contrast tint layer (black@0.35).
 * - Modern translucent header card badge.
 * - Dynamic retention progress bar.
 * - Libass kinetic subtitles overlay.
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
 * Builds the Ken Burns zoom/pan expression for a single image scene
 */
function buildKenBurnsFilter(motionType, durationSec) {
  const frames = Math.max(24, Math.round(durationSec * 24));

  switch (motionType) {
    case 'pan-down':
      // Slight constant zoom with slow downward tilt/pan
      return `zoompan=z='1.15':x='iw/2-(iw/zoom/2)':y='if(lte(on,1),(ih-ih/zoom)/2,max(0,y-0.8))':d=${frames}:s=720x1280:fps=24,setsar=1`;

    case 'zoom-out':
      // Smooth reveal: starts zoomed in at 1.20 and slowly expands out
      return `zoompan=z='if(lte(zoom,1.0),1.20,max(1.001,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=24,setsar=1`;

    case 'pan-right':
      // Slight constant zoom with horizontal tracking pan
      return `zoompan=z='1.15':x='if(lte(on,1),0,min(iw-iw/zoom,x+0.8))':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=24,setsar=1`;

    case 'zoom-in':
    default:
      // Standard cinematic hook zoom-in (1.0 to 1.20)
      return `zoompan=z='min(zoom+0.0012,1.20)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=24,setsar=1`;
  }
}

/**
 * Builds multi-scene inputs and complete FFmpeg filtergraph
 */
export function buildMultiScenePipeline({
  scenes = [],
  title = 'Video Promocional',
  totalDuration = 30,
  assPath = null,
}) {
  const bestFont = resolveBestFont();
  const fontFileOpt = bestFont.path ? `:fontfile=${bestFont.path}` : '';
  const safeTitle = escapeFfmpegText(title.slice(0, 40));
  const safeDuration = Math.max(1, Number(totalDuration) || 30);

  const inputArgs = [];
  const sceneFilterBlocks = [];
  const concatInputs = [];

  // Filter out invalid scenes and ensure at least 1 visual scene exists
  const validScenes = scenes.filter(s => s && s.durationSec > 0);

  if (validScenes.length === 0) {
    // Fallback: Single procedural gradient mesh
    inputArgs.push('-f', 'lavfi', '-i', 'color=c=#0B132B:s=64x64:r=24');
    sceneFilterBlocks.push(
      `[0:v]format=rgb24,geq=r='20+15*sin(2*PI*(X/64+T/6))':g='22+18*cos(2*PI*(Y/64-T/5))':b='65+35*sin(2*PI*(X/64+Y/64+T/7))',scale=720:1280:flags=bicubic,format=yuv420p,setsar=1[raw_bg]`
    );
  } else {
    // Multi-scene Ken Burns & B-roll assembly with micro-fades
    const fadeDur = 0.25;

    validScenes.forEach((scene, idx) => {
      const dur = Math.max(1, Number(scene.durationSec) || 4);
      const safeFadeOutStart = Math.max(0, dur - fadeDur);

      if (scene.type === 'video' && scene.filePath && fs.existsSync(scene.filePath)) {
        // Video B-roll clip: scale, crop to 9:16 portrait, trim duration, micro-fade
        inputArgs.push('-i', scene.filePath);
        sceneFilterBlocks.push(
          `[${idx}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,trim=0:${dur},setpts=PTS-STARTPTS,` +
          `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${safeFadeOutStart}:d=${fadeDur}[v${idx}]`
        );
        concatInputs.push(`[v${idx}]`);
      } else if (scene.type === 'image' && scene.filePath && fs.existsSync(scene.filePath)) {
        // AI image: Ken Burns camera motion + micro-fade
        inputArgs.push('-i', scene.filePath);
        const kbFilter = buildKenBurnsFilter(scene.motionType, dur);
        sceneFilterBlocks.push(
          `[${idx}:v]${kbFilter},fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${safeFadeOutStart}:d=${fadeDur}[v${idx}]`
        );
        concatInputs.push(`[v${idx}]`);
      } else {
        // Fallback procedural for this individual scene + micro-fade
        inputArgs.push('-f', 'lavfi', '-t', String(dur), '-i', 'color=c=#0B132B:s=64x64:r=24');
        sceneFilterBlocks.push(
          `[${idx}:v]format=rgb24,geq=r='20+15*sin(2*PI*(X/64+T/6))':g='22+18*cos(2*PI*(Y/64-T/5))':b='65+35*sin(2*PI*(X/64+Y/64+T/7))',scale=720:1280:flags=bicubic,format=yuv420p,setsar=1,` +
          `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${safeFadeOutStart}:d=${fadeDur}[v${idx}]`
        );
        concatInputs.push(`[v${idx}]`);
      }
    });

    if (concatInputs.length > 1) {
      sceneFilterBlocks.push(
        `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[raw_bg]`
      );
    } else {
      sceneFilterBlocks.push(`${concatInputs[0]}copy[raw_bg]`);
    }
  }

  // Common Overlays:
  // 1. Cinematic dark contrast layer (40% opacity) for subtitle readability
  sceneFilterBlocks.push(
    `[raw_bg]drawbox=x=0:y=0:w=720:h=1280:color=black@0.40:t=fill[bg]`
  );

  // 2. Anti-watermark safety vignette (blanks out bottom 60px where external logos could be placed)
  sceneFilterBlocks.push(
    `[bg]drawbox=x=0:y=1220:w=720:h=60:color=black@0.85:t=fill[clean_bg]`
  );

  // 3. Translucent header badge with neon top accent line
  sceneFilterBlocks.push(
    `[clean_bg]drawbox=x=50:y=75:w=620:h=80:color=0x0B0F19@0.85:t=fill,drawbox=x=50:y=75:w=620:h=3:color=0x00FF88@1:t=fill[vhdr]`
  );

  // 4. Header Title Text
  sceneFilterBlocks.push(
    `[vhdr]drawtext=text='${safeTitle}'${fontFileOpt}:fontcolor=white:fontsize=24:x=(w-text_w)/2:y=102:expansion=none[vtxt]`
  );

  // 5. Dynamic retention progress bar at top of video
  sceneFilterBlocks.push(
    `color=c=0x00FF88:s=720x8:r=24[bar]`
  );
  sceneFilterBlocks.push(
    `[vtxt][bar]overlay=x='-w+(w/${safeDuration})*t':y=0:shortest=1[vbar]`
  );

  // 6. Kinetic Subtitles overlay
  if (assPath && fs.existsSync(assPath)) {
    const escapedAss = escapeFilterPath(assPath);
    sceneFilterBlocks.push(
      `[vbar]subtitles='${escapedAss}'[outv]`
    );
  } else {
    sceneFilterBlocks.push(
      `[vbar]copy[outv]`
    );
  }

  return {
    inputArgs,
    filterGraph: sceneFilterBlocks.join(';'),
  };
}
