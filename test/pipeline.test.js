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

