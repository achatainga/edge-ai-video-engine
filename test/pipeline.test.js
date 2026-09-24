import test from 'node:test';
import assert from 'node:assert/strict';
import { convertVttToDynamicAss, chunkWords, formatAssTime } from '../src/subtitleGenerator.js';
import { buildScenePrompts, detectThemeCategory } from '../src/sceneVisuals.js';
import { buildMultiScenePipeline } from '../src/backgroundProvider.js';

test('formatAssTime: accurately formats seconds into ASS centisecond timestamp', () => {
  assert.equal(formatAssTime(0), '0:00:00.00');
  assert.equal(formatAssTime(65.5), '0:01:05.50');
  assert.equal(formatAssTime(3661.25), '1:01:01.25');
});

test('chunkWords: divides word array into 1-3 word kinetic bursts', () => {
  const words = ['Tu', 'asistente', 'de', 'ventas', 'en', 'WhatsApp'];
  const chunks = chunkWords(words, 3);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every(c => c.length <= 3));
});

test('convertVttToDynamicAss: generates valid ASS script with kinetic subtitles and accent badges', () => {
  const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
Tu WhatsApp responde clientes al instante con Inteligencia Artificial.
`;

  const ass = convertVttToDynamicAss(vtt, 'Montserrat Black');
  assert.ok(ass.includes('[Script Info]'));
  assert.ok(ass.includes('PlayResX: 720'));
  assert.ok(ass.includes('PlayResY: 1280'));
  assert.ok(ass.includes('Style: Kinetic'));
  assert.ok(ass.includes('Style: Accent'));
  assert.ok(ass.includes('Dialogue: 0,'));
  assert.ok(ass.includes('Dialogue: 1,'));
  assert.ok(ass.includes('[ WHATSAPP CON IA ]'));
});

test('buildScenePrompts: generates enriched prompts for narrative scenes', () => {
  const scenes = buildScenePrompts('Test voiceover');
  assert.equal(scenes.length, 4);
  assert.ok(scenes[0].prompt.includes('photorealistic'));
  assert.ok(scenes[0].prompt.includes('vertical 9:16'));
  assert.ok(scenes[0].fallbackUrl.startsWith('https://images.unsplash.com'));
});

test('buildMultiScenePipeline: produces valid filtergraph and input arguments', () => {
  const scenes = [
    { type: 'fallback', filePath: null, durationSec: 5, motionType: 'zoom-in' }
  ];
  const { inputArgs, filterGraph } = buildMultiScenePipeline({
    scenes,
    title: 'Automatización IA',
    totalDuration: 5,
  });

  assert.ok(inputArgs.length > 0);
  assert.ok(filterGraph.includes('drawbox'));
  assert.ok(filterGraph.includes('overlay'));
  assert.ok(filterGraph.includes('outv'));
});

test('detectThemeCategory: accurately classifies spiritual, wellness, nature, and business', () => {
  assert.equal(detectThemeCategory('versículo bíblico del día y paz de Dios'), 'spiritual');
  assert.equal(detectThemeCategory('rutina de ejercicio y receta saludable para el gym'), 'wellness');
  assert.equal(detectThemeCategory('viaje a las montañas y playas paradisíacas'), 'nature');
  assert.equal(detectThemeCategory('automatización de ventas y clientes en WhatsApp'), 'business');
});

test('buildScenePrompts: spiritual themes generate sacred and serene prompts', () => {
  const scenes = buildScenePrompts('Un versículo bíblico sobre la paz de Dios que supera todo entendimiento');
  assert.equal(scenes.length, 4);
  assert.equal(scenes[0].theme, 'spiritual');
  assert.ok(scenes[0].prompt.toLowerCase().includes('bible') || scenes[0].prompt.toLowerCase().includes('peace'));
});

test('buildKenBurnsFilter: generates correct expressions for diverse camera motions', async () => {
  const { buildKenBurnsFilter } = await import('../src/backgroundProvider.js');
  const punchIn = buildKenBurnsFilter('punch-in', 3);
  assert.ok(punchIn.includes('zoom+0.0035'), 'punch-in should have fast zoom acceleration');
  assert.ok(punchIn.includes('1.28'), 'punch-in should ramp up to 1.28');

  const panLeft = buildKenBurnsFilter('pan-left', 4);
  assert.ok(panLeft.includes('iw-iw/zoom'), 'pan-left should track horizontally');

  const tiltUp = buildKenBurnsFilter('tilt-up', 4);
  assert.ok(tiltUp.includes('ih-ih/zoom'), 'tilt-up should track vertically');

  const pulse = buildKenBurnsFilter('dynamic-pulse', 3);
  assert.ok(pulse.includes('sin('), 'dynamic-pulse should modulate with sine function');
});

test('buildMultiScenePipeline: includes vibrant color grading and eliminates dulling full-screen veil', () => {
  const scenes = [
    { type: 'fallback', filePath: null, durationSec: 3, motionType: 'punch-in' }
  ];
  const { filterGraph } = buildMultiScenePipeline({
    scenes,
    title: 'Prueba Vibrante',
    totalDuration: 3,
  });

  // Must have saturation and contrast boost
  assert.ok(filterGraph.includes('eq=saturation='), 'Filtergraph must include color grading');
  assert.ok(filterGraph.includes('contrast='), 'Filtergraph must include contrast adjustment');

  // Must NOT have the old dulling full-screen black@0.40 overlay
  assert.ok(!filterGraph.includes('color=black@0.40:t=fill'), 'Must eliminate full-screen dulling black veil');
});

test('buildScenePrompts: preserves LLM-directed mediaType, searchQuery, and motionType', () => {
  const rawScenes = [
    {
      title: 'Gancho Viral',
      mediaType: 'video',
      searchQuery: 'drone shot city sunset',
      visualPrompt: 'Cinematic drone shot of sunset over skyline',
      motionType: 'punch-in',
      colorMood: 'neon',
    },
    {
      title: 'Solución Visual',
      mediaType: 'image',
      searchQuery: 'smiling barista latte art',
      visualPrompt: 'Barista smiling holding fresh coffee latte',
      motionType: 'pan-right',
      colorMood: 'warm',
    },
  ];

  const processed = buildScenePrompts('Locución sobre cafetería', rawScenes);
  assert.equal(processed.length, 2);

  assert.equal(processed[0].mediaType, 'video');
  assert.equal(processed[0].searchQuery, 'drone shot city sunset');
  assert.equal(processed[0].motionType, 'punch-in');
  assert.ok(processed[0].prompt.includes('neon') || processed[0].prompt.includes('saturated'));

  assert.equal(processed[1].mediaType, 'image');
  assert.equal(processed[1].searchQuery, 'smiling barista latte art');
  assert.equal(processed[1].motionType, 'pan-right');
});

test('detectThemeCategory: classifies tech correctly alongside other themes', () => {
  assert.equal(detectThemeCategory('desarrollo de software y código cloud'), 'tech');
  assert.equal(detectThemeCategory('inteligencia artificial y modelos neuronales'), 'tech');
});

test('getColorGradingFilter: outputs tailored saturation and contrast expressions per mood', async () => {
  const { getColorGradingFilter } = await import('../src/backgroundProvider.js');
  const neon = getColorGradingFilter('neon');
  assert.ok(neon.includes('saturation=1.30'), 'neon should have high punchy saturation');

  const warm = getColorGradingFilter('warm');
  assert.ok(warm.includes('saturation=1.22'), 'warm should have rich warm saturation');

  const def = getColorGradingFilter('vibrant');
  assert.ok(def.includes('saturation=1.20'), 'default vibrant should have vibrant saturation');
});

test('buildMultiScenePipeline: pre-scales images to 1080:1920 to prevent distortion and clone-pads videos to prevent desync', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const tmpImg = path.join(os.tmpdir(), 'test_sample_scene.jpg');
  const tmpVid = path.join(os.tmpdir(), 'test_sample_scene.mp4');
  fs.writeFileSync(tmpImg, 'fake_img');
  fs.writeFileSync(tmpVid, 'fake_vid');

  try {
    const { buildMultiScenePipeline } = await import('../src/backgroundProvider.js');
    const { filterGraph } = buildMultiScenePipeline({
      scenes: [
        { type: 'image', filePath: tmpImg, durationSec: 3, motionType: 'punch-in' },
        { type: 'video', filePath: tmpVid, durationSec: 4, motionType: 'pan-left' },
      ],
      title: 'Test Distortion & Padding',
      totalDuration: 7,
    });

    assert.ok(filterGraph.includes('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'), 'Image scene must be pre-scaled and cropped to 9:16 to prevent distortion');
    assert.ok(filterGraph.includes('tpad=stop_mode=clone:stop_duration=4'), 'Video scene must be clone-padded to prevent audio desync');
  } finally {
    try { fs.unlinkSync(tmpImg); } catch {}
    try { fs.unlinkSync(tmpVid); } catch {}
  }
});

test('THEMED_VERTICAL_VIDEOS: verifies curated fallback videos contain no multi-gigabyte or 3-hour files', async () => {
  const { THEMED_VERTICAL_VIDEOS } = await import('../src/sceneVisuals.js');
  for (const [cat, urls] of Object.entries(THEMED_VERTICAL_VIDEOS)) {
    assert.ok(Array.isArray(urls) && urls.length >= 1, `Category ${cat} must have at least one curated video`);
    for (const url of urls) {
      assert.ok(url.startsWith('https://'), `Video URL must be HTTPS: ${url}`);
      assert.ok(!url.toLowerCase().includes('3_hour'), `Curated video must not be a bloated 3-hour video: ${url}`);
      assert.ok(!url.toLowerCase().includes('bulusan'), `Must not include unverified rate-limited assets: ${url}`);
    }
  }
});

