// src/config/billing.ts

// Parámetros aproximados para estimar coste.
// Ajusta estos valores si cambian los precios oficiales.

export const TTS_WORDS_PER_MINUTE = 160;        // velocidad media de lectura
export const TTS_PRICE_PER_MINUTE_USD = 0.0065; // precio aproximado gpt-4o-mini-tts

// Límite de coste por operación de "generar audio" (en USD)
// Por ejemplo: 2 USD ~ 2 € aprox.
export const MAX_OPERATION_COST_USD = 2.0;
