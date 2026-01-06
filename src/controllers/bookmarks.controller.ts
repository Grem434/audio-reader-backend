import { Request, Response } from "express";
import { supabase } from "../services/supabase";

/**
 * GET /api/books/:bookId/bookmark
 * Devuelve el bookmark (si existe) para el usuario+libro.
 */
export async function getBookmark(req: Request, res: Response) {
  try {
    const userId = req.header("x-user-id");
    const { bookId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Falta userId (x-user-id) para pruebas" });
    }

    const { data, error } = await supabase
      .from("bookmarks")
      .select("id, book_id, chapter_id, position_seconds, updated_at")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Error leyendo bookmark" });
    }

    return res.json(data ?? null);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno leyendo bookmark" });
  }
}

/**
 * POST /api/books/:bookId/bookmark
 * Body: { chapterId: string, positionSeconds: number }
 * Guarda/actualiza el bookmark para el usuario+libro.
 */
export async function upsertBookmark(req: Request, res: Response) {
  try {
    const userId = req.header("x-user-id");
    const { bookId } = req.params;
    const { chapterId, positionSeconds } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: "Falta userId (x-user-id) para pruebas" });
    }

    if (!chapterId || typeof chapterId !== "string") {
      return res.status(400).json({ error: "chapterId es obligatorio" });
    }

    const pos = Number(positionSeconds);
    if (Number.isNaN(pos) || pos < 0) {
      return res.status(400).json({ error: "positionSeconds debe ser un número >= 0" });
    }

    // Upsert usando el índice único (user_id, book_id)
    const { data, error } = await supabase
      .from("bookmarks")
      .upsert(
        {
          user_id: userId,
          book_id: bookId,
          chapter_id: chapterId,
          position_seconds: Math.floor(pos),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,book_id" }
      )
      .select("id, book_id, chapter_id, position_seconds, updated_at")
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Error guardando bookmark" });
    }

    return res.json({ message: "Bookmark guardado", bookmark: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno guardando bookmark" });
  }
}

/**
 * GET /api/books/:bookId/continue?voice=marin&style=learning
 * Devuelve bookmark + capítulo correspondiente, añadiendo audio_path para la voz/estilo seleccionados (modo PRO).
 */
export async function getContinue(req: Request, res: Response) {
  try {
    const userId = req.header("x-user-id");
    const { bookId } = req.params;

    const voice = String(req.query.voice || "marin");
    const style = String(req.query.style || "learning");

    if (!userId) {
      return res.status(401).json({ error: "Falta userId (x-user-id) para pruebas" });
    }

    // 1) Bookmark
    const { data: bookmark, error: bmErr } = await supabase
      .from("bookmarks")
      .select("id, book_id, chapter_id, position_seconds, updated_at")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (bmErr) {
      console.error(bmErr);
      return res.status(500).json({ error: "Error leyendo bookmark" });
    }

    if (!bookmark) {
      return res.json({ bookmark: null, chapter: null, voice, style });
    }

    // 2) Capítulo
    const { data: chapter, error: chErr } = await supabase
      .from("chapters")
      .select("id, book_id, index_in_book, title")
      .eq("id", bookmark.chapter_id)
      .eq("book_id", bookId)
      .single();

    if (chErr) {
      console.error(chErr);
      return res.status(500).json({ error: "Error leyendo capítulo del bookmark" });
    }

    // 3) Audio según voz/estilo (tabla chapter_audios)
    const { data: audioRow, error: aErr } = await supabase
      .from("chapter_audios")
      .select("audio_path")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("chapter_id", chapter.id)
      .eq("voice", voice)
      .eq("style", style)
      .maybeSingle();

    if (aErr) {
      console.error(aErr);
      return res.status(500).json({ error: "Error leyendo audio del capítulo" });
    }

    return res.json({
      bookmark,
      chapter: {
        ...chapter,
        audio_path: audioRow?.audio_path ?? null
      },
      voice,
      style
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno en continue" });
  }
}
