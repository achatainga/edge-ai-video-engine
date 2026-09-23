/**
 * subtitleGenerator.js
 * Transforms standard VTT subtitles into High-Retention Kinetic ASS Subtitles (Hormozi / Reels Style).
 * - 1 to 3 words per burst for rapid kinetic rhythm.
 * - Dynamic color highlighting for key trigger words (Neon Green / Yellow / Cyan).
 * - Calibrated vertical positioning (MarginV=260) to avoid Instagram Reel UI overlays.
 * - Utilizes modern viral typography (Montserrat Black with fallback).
 */

const IMPACT_KEYWORDS = new Set([
  'WHATSAPP', 'IA', 'INTELIGENCIA', 'ARTIFICIAL', 'CLIENTES', 'VENTAS', 'DINERO',
  'NEGOCIO', 'RESPONDE', 'RESPUESTAS', 'PROSPECTOS', 'CITAS', 'AHORA', 'HOY',
  'AUTOMÁTICO', 'INSTANTE', 'PIERDAS', 'EDGE', 'BOT', 'CHAT', 'COMPETENCIA',
  'GRATIS', 'RÁPIDO', 'AUMENTA', 'CONVIERTE', 'SOLUCIONES', 'DUERMES', 'PRIMERO'
]);

// ASS Color codes (&HBBGGRR& in ASS format)
const COLOR_WHITE = '&H00FFFFFF&';
const COLOR_NEON_GREEN = '&H0000FF88&'; // Electric Lime/Green
const COLOR_NEON_YELLOW = '&H0000FFFF&'; // Bright Amber/Yellow
const COLOR_NEON_CYAN = '&H00FFFF00&';   // High-voltage Cyan

/**
 * Format seconds into ASS timestamp format: H:MM:SS.cs (centiseconds)
 */
export function formatAssTime(seconds) {
  const safeSec = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const cs = Math.floor((safeSec % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Parse VTT timestamp string into seconds
 */
export function parseVttTimestamp(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(':');
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseFloat(m) * 60 + parseFloat(s);
  } else if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
  }
  return 0;
}

/**
 * Splits an array of words into compact 2-3 word chunks
 */
export function chunkWords(words, maxWordsPerChunk = 3) {
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    if (remaining === 4) {
      chunks.push(words.slice(i, i + 2));
      chunks.push(words.slice(i + 2, i + 4));
      break;
    }
    const take = Math.min(maxWordsPerChunk, remaining);
    chunks.push(words.slice(i, i + take));
    i += take;
  }
  return chunks;
}

/**
 * Formats a chunk of words with kinetic color highlights
 */
function formatChunkText(words) {
  let hasHighlight = false;
  const formattedWords = words.map((w, index) => {
    const upper = w.toUpperCase();
    const clean = upper.replace(/[^A-ZÁÉÍÓÚÑ0-9]/g, '');

    if (IMPACT_KEYWORDS.has(clean)) {
      hasHighlight = true;
      return `{\\c${COLOR_NEON_GREEN}}${upper}{\\c${COLOR_WHITE}}`;
    }
    return upper;
  });

  // If no predefined impact keyword was in this chunk, highlight the most significant word in neon yellow/cyan
  if (!hasHighlight && words.length > 0) {
    let longestIdx = 0;
    let maxLen = 0;
    words.forEach((w, idx) => {
      const len = w.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '').length;
      if (len > maxLen) {
        maxLen = len;
        longestIdx = idx;
      }
    });

    const highlightColor = longestIdx % 2 === 0 ? COLOR_NEON_YELLOW : COLOR_NEON_CYAN;
    formattedWords[longestIdx] = `{\\c${highlightColor}}${words[longestIdx].toUpperCase()}{\\c${COLOR_WHITE}}`;
  }

  return `{\\c${COLOR_WHITE}}` + formattedWords.join(' ');
}

// Accent badge definitions (Layer 2 Editorial Cards in upper third inspired by reels-af)
const ACCENT_TRIGGERS = [
  { test: /\b(WHATSAPP)\b/i, badge: '⚡ WHATSAPP CON IA' },
  { test: /\b(CLIENTES?|VENTAS?|COMPETENCIA|PIERDAS?)\b/i, badge: '🚨 NO PIERDAS CLIENTES' },
  { test: /\b(INSTANTE|SEGUNDOS?|R[AÁ]PIDO)\b/i, badge: '⏱️ RESPUESTA EN SEGUNDOS' },
  { test: /\b(CITAS?|AGENDA|RESERVAS?)\b/i, badge: '📅 AGENDAMIENTO AUTOMÁTICO' },
  { test: /\b(GRATIS|0\$|\$0)\b/i, badge: '🎁 PRUEBA 100% GRATIS' },
  { test: /\b(EDGE\s*AI|SOLUCIONES?)\b/i, badge: '🚀 EDGE AI SOLUCIONES' },
  { test: /\b(DUERMES?|AUTOM[AÁ]TICO)\b/i, badge: '🤖 PILOTO AUTOMÁTICO 24/7' },
];

function buildAccentEvents(cues) {
  const accentEvents = [];
  let lastAccentEnd = -10;

  for (const cue of cues) {
    if (cue.startSec - lastAccentEnd < 2.5) continue;

    for (const rule of ACCENT_TRIGGERS) {
      if (rule.test.test(cue.text)) {
        const start = cue.startSec;
        const dur = Math.min(3.0, Math.max(1.8, cue.endSec - cue.startSec + 0.5));
        const end = start + dur;

        const assStart = formatAssTime(start);
        const assEnd = formatAssTime(end);

        // Layer 1, Top-Center (Alignment 8) in upper third
        accentEvents.push(
          `Dialogue: 1,${assStart},${assEnd},Accent,,0,0,0,,{\\b1}${rule.badge}`
        );
        lastAccentEnd = end;
        break;
      }
    }
  }

  return accentEvents;
}

/**
 * Converts standard VTT subtitle content into an Advanced SubStation Alpha (.ass) script
 * Features:
 * - Layer 0: Kinetic word-burst subtitles at bottom-center (Alignment 2, MarginV=280)
 * - Layer 1: Uppercase editorial accent cards at top-center (Alignment 8, MarginV=210)
 */
export function convertVttToDynamicAss(vttContent, fontName = 'Montserrat Black') {
  const lines = vttContent.replace(/\r\n/g, '\n').split('\n');
  const cues = [];

  let currentCue = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const times = line.split('-->');
      const startSec = parseVttTimestamp(times[0].trim());
      const endSec = parseVttTimestamp(times[1].trim().split(/\s+/)[0]);
      currentCue = { startSec, endSec, text: '' };
    } else if (currentCue && line === '') {
      if (currentCue.text.trim()) {
        cues.push(currentCue);
      }
      currentCue = null;
    } else if (currentCue && !line.startsWith('NOTE') && !line.startsWith('STYLE') && !line.startsWith('WEBVTT')) {
      const cleanLine = line.replace(/<[^>]+>/g, '').trim();
      currentCue.text = (currentCue.text ? currentCue.text + ' ' : '') + cleanLine;
    }
  }
  if (currentCue && currentCue.text.trim()) {
    cues.push(currentCue);
  }

  // Build Layer 0 ASS dialogue events (Kinetic Subtitles)
  const dialogueEvents = [];

  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    const chunks = chunkWords(words, 3);
    const cueDuration = Math.max(0.3, cue.endSec - cue.startSec);

    // Calculate proportional weights based on characters
    const weights = chunks.map(chunk =>
      chunk.reduce((sum, w) => sum + Math.max(w.length, 2), 0)
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

    let chunkStart = cue.startSec;
    for (let c = 0; c < chunks.length; c++) {
      const chunkDuration = (weights[c] / totalWeight) * cueDuration;
      const chunkEnd = (c === chunks.length - 1) ? cue.endSec : (chunkStart + chunkDuration);

      const assStart = formatAssTime(chunkStart);
      const assEnd = formatAssTime(chunkEnd);
      const assText = formatChunkText(chunks[c]);

      dialogueEvents.push(
        `Dialogue: 0,${assStart},${assEnd},Kinetic,,0,0,0,,${assText}`
      );

      chunkStart = chunkEnd;
    }
  }

  // Build Layer 1 ASS dialogue events (Editorial Accent Badges in upper third)
  const accentEvents = buildAccentEvents(cues);
  const allEvents = dialogueEvents.concat(accentEvents);

  // Assemble full ASS document
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Kinetic,${fontName},44,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,1,0,1,4.5,2,2,40,40,280,1
Style: Accent,${fontName},32,&H0000FF88,&H000000FF,&H00000000,&HB00B0F19,-1,0,0,0,100,100,2,0,1,3.5,0,8,40,40,210,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${allEvents.join('\n')}
`;
}
