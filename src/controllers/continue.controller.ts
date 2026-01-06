import { Request, Response } from "express";
import { supabase } from "../services/supabase";

export async function getContinue(req: Request, res: Response) {
  try {
    const userId = req.header("x-user-id");
    const { bookId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Falta userId (x-user-id) para pruebas" });
    }

    // 1) Leer bookmark
    const { data: bookmark, error: bmError } = await supabase
      .from("bookmarks")
      .select("id, book_id, chapter_id, position_seconds, updated_at")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (bmError) {
      console.error(bmError);
      return res.status(500).json({ error: "Error leyendo bookmark" });
    }

    if (!bookmark) {
      return res.json({
        bookmark: null,
        chapter: null,
        message: "No hay punto de lectura guardado para este libro."
      });
    }

    // 2) Leer capítulo del bookmark
    const { data: chapter, error: chError } = await supabase
      .from("chapters")
      .select("id, book_id, index_in_book, title, audio_path, duration_seconds")
      .eq("id", bookmark.chapter_id)
      .single();

    if (chError || !chapter) {
      console.error(chError);
      return res.status(500).json({
        error: "Bookmark existe pero no se ha podido cargar el capítulo asociado."
      });
    }

    return res.json({
      bookmark,
      chapter
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno en continue" });
  }
}
