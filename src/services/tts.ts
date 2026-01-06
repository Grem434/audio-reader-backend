import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

export type TtsStyle = "narrative" | "learning";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Nota:
 * - La API de audio tiene límite de input (a ti te está saltando 2000 tokens).
 * - Troceamos texto y generamos audio por partes.
 * - Luego concatenamos buffers MP3 (funciona bien en la práctica).
 */

function buildInstructions(style: TtsStyle): string {
  if (style === "learning") {
    // Mantén esto corto (también cuenta en tokens).
    return "Español neutro. Ritmo claro y pausado. Pronuncia con claridad. Pausas naturales.";
  }
  return "Español neutro. Tono narrativo fluido y natural. Entonación agradable. Pausas naturales.";
}

/**
 * Aproximación: 1 token ~ 4 caracteres (varía, pero sirve para ir sobrado).
 * Usamos margen: 1600 tokens para estar por debajo de 2000 contando instrucciones.
 */
function splitTextIntoChunks(text: string, maxTokensApprox = 1600): string[] {
  const maxChars = maxTokensApprox * 4;

  const cleaned = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return [];

  if (cleaned.length <= maxChars) return [cleaned];

  // Intento 1: separar por párrafos
  const paragraphs = cleaned.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = "";
  };

  const addPiece = (piece: string) => {
    if (!piece) return;

    // Si cabe en el chunk actual, lo añadimos
    if ((current.length ? current.length + 2 : 0) + piece.length <= maxChars) {
      current = current ? `${current}\n\n${piece}` : piece;
      return;
    }

    // Si el chunk actual tiene algo, lo cerramos
    if (current) pushCurrent();

    // Si el párrafo sigue siendo enorme, lo partimos por frases
    if (piece.length > maxChars) {
      const sentenceChunks = splitLargePieceBySentences(piece, maxChars);
      for (const sc of sentenceChunks) chunks.push(sc);
      return;
    }

    // Si cabe solo, lo ponemos como chunk nuevo
    current = piece;
  };

  for (const p of paragraphs) addPiece(p);
  if (current) pushCurrent();

  return chunks;
}

function splitLargePieceBySentences(piece: string, maxChars: number): string[] {
  // Separador de frases (simple y efectivo).
  const sentences = piece
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?¿¡…])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/g)
    .map(s => s.trim())
    .filter(Boolean);

  // Si no detecta frases, hacemos hard-split.
  if (sentences.length <= 1) return hardSplit(piece, maxChars);

  const out: string[] = [];
  let cur = "";

  const push = () => {
    const t = cur.trim();
    if (t) out.push(t);
    cur = "";
  };

  for (const s of sentences) {
    if ((cur.length ? cur.length + 1 : 0) + s.length <= maxChars) {
      cur = cur ? `${cur} ${s}` : s;
    } else {
      if (cur) push();
      if (s.length > maxChars) {
        // frase gigante => hard split
        out.push(...hardSplit(s, maxChars));
      } else {
        cur = s;
      }
    }
  }
  if (cur) push();

  return out;
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + maxChars).trim());
    i += maxChars;
  }
  return out.filter(Boolean);
}

type SynthesizeArgs = {
  bookId: string;
  chapterIndex: number;
  text: string;
  voice: string; // ej: "marin", "alloy", "nova", "shimmer"
  style: TtsStyle;
};

export async function synthesizeChapter(args: SynthesizeArgs): Promise<{ filePath: string }> {
  const { bookId, chapterIndex, text, voice, style } = args;

  const instructions = buildInstructions(style);

  // Troceamos texto del capítulo
  const chunks = splitTextIntoChunks(text, 1600);

  if (chunks.length === 0) {
    // Generar “silencio” no tiene sentido; devolvemos error controlado.
    throw new Error(`Capítulo vacío (index=${chapterIndex})`);
  }

  // Modelo TTS: usa el tuyo si lo tienes en env. Si no, uno razonable.
  // IMPORTANTE: el límite de 2000 tokens te lo está imponiendo el modelo actual.
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

  const buffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];

    // Muy importante: NO metas instrucciones largas ni prompts gigantes.
    // Puedes “prefijar” instrucciones de forma ligera:
    const input = `${instructions}\n\n${chunkText}`;

    const mp3 = await openai.audio.speech.create({
      model,
      voice: voice as any,
      input
    });

    const buf = Buffer.from(await mp3.arrayBuffer());
    buffers.push(buf);
  }

  const finalBuffer = Buffer.concat(buffers);

  // Ruta “antigua” (el controller pro luego puede moverlo o registrar en chapter_audios)
  const outDir = path.join("audios", bookId);
  await fs.mkdir(outDir, { recursive: true });

  const filename = `chapter-${chapterIndex}.mp3`;
  const filePath = path.join(outDir, filename);

  await fs.writeFile(filePath, finalBuffer);

  return { filePath };
}
