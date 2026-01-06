// src/utils/ttsEstimate.ts
import {
  TTS_WORDS_PER_MINUTE,
  TTS_PRICE_PER_MINUTE_USD
} from "../config/billing";

export interface TtsEstimate {
  words: number;
  minutes: number;
  costUsd: number;
}

/**
 * Cuenta palabras de forma sencilla.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/\s+/);
  return parts.length;
}

/**
 * Estima duración y coste para un solo texto.
 */
export function estimateText(text: string): TtsEstimate {
  const words = countWords(text);
  const minutes = words / TTS_WORDS_PER_MINUTE;
  const costUsd = minutes * TTS_PRICE_PER_MINUTE_USD;

  return { words, minutes, costUsd };
}

/**
 * Estima duración y coste para un conjunto de textos.
 */
export function estimateTextBatch(texts: string[]): TtsEstimate {
  let totalWords = 0;
  for (const t of texts) {
    totalWords += countWords(t);
  }
  const minutes = totalWords / TTS_WORDS_PER_MINUTE;
  const costUsd = minutes * TTS_PRICE_PER_MINUTE_USD;

  return {
    words: totalWords,
    minutes,
    costUsd
  };
}
