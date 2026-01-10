import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { supabase } from "../services/supabase";
import { detectFileType } from "../services/parser/filetype";
import { parsePdf } from "../services/parser/pdf.parser";
import { parseEpub } from "../services/parser/epub.parser";
import type { ParsedChapter } from "../types/parser";
import { synthesizeChapter } from "../services/tts";
import { ensureDir } from "../utils/fs";
import { getSafeUserId } from "../utils/auth";

/**
 * NOTA IMPORTANTE (modelo actual):
 * - Libros/Capítulos: se pueden tratar como "comunes" (sin filtrar por user_id al leer libro).
 * - Audios y bookmarks: por usuario (filtrados por user_id).
 *
 * El header x-user-id sigue siendo "modo pruebas".
 */

export async function listBooks(req: Request, res: Response) {
  try {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Error obteniendo los libros de la BD" });
    }

    return res.json(data || []);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno listBooks" });
  }
}

export async function uploadBook(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const file = (req as any).file;

    if (!file) return res.status(400).json({ error: "Falta archivo" });

    const fileType = detectFileType(file.originalname, file.mimetype);
    if (!fileType) return res.status(400).json({ error: "Tipo de archivo no soportado (PDF/EPUB)" });

    const filePath = file.path;

    let parsed: any = null;

    if (fileType === "pdf") parsed = await parsePdf(filePath);
    if (fileType === "epub") parsed = await parseEpub(filePath);

    if (!parsed) return res.status(400).json({ error: "No se pudo parsear el archivo" });

    const title = parsed.title || file.originalname;
    const chapters: ParsedChapter[] = parsed.chapters || [];

    const { data: book, error: bookErr } = await supabase
      .from("books")
      .insert({
        title,
        original_filename: file.originalname,
        file_path: filePath,
        user_id: userId
      })
      .select("*")
      .single();

if (bookErr || !book) {
  console.error("UPLOAD_BOOK insert error:", bookErr);
  return res.status(500).json({
    error: "Error guardando el libro en la BD",
    supabase: bookErr,
  });
}

    const bookId = book.id;

    if (chapters.length > 0) {
      const chapterRows = chapters.map((c) => ({
        book_id: bookId,
        index_in_book: c.index,
        title: c.title,
        text: c.text
      }));

      const { error: chErr } = await supabase.from("chapters").insert(chapterRows);
      if (chErr) {
        console.error(chErr);
        return res.status(500).json({ error: "Error guardando capítulos en BD" });
      }
    }

    return res.json({ bookId, title, chaptersCount: chapters.length });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Error interno uploadBook" });
  }
}

export async function getBook(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const { bookId } = req.params;

    const voice = String(req.query.voice || "alloy");
    const style = String(req.query.style || "neutral");

    // ✅ CLAVE: NO filtramos por user_id aquí (biblioteca común)
    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookErr || !book) {
      return res.status(404).json({ error: "Libro no encontrado" });
    }

    const { data: chapters, error: chErr } = await supabase
      .from("chapters")
      .select("id, title, index_in_book")
      .eq("book_id", bookId)
      .order("index_in_book", { ascending: true });

    if (chErr) {
      console.error(chErr);
      return res.status(500).json({ error: "Error cargando capítulos" });
    }

    // Audios por usuario (bien filtrado)
    const { data: audios, error: audErr } = await supabase
      .from("chapter_audios")
      .select("chapter_id, audio_path")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("voice", voice)
      .eq("style", style);

    if (audErr) {
      console.error(audErr);
      // no bloqueamos si falla
    }

    const audioMap = new Map<string, string>();
    for (const a of audios || []) audioMap.set(a.chapter_id, a.audio_path);

    const chaptersWithAudio = (chapters || []).map((c: any) => ({
      ...c,
      audio_path: audioMap.get(c.id) || null
    }));

    return res.json({ book, chapters: chaptersWithAudio, voice, style });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno getBook" });
  }
}

export async function deleteBook(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const { bookId } = req.params;

    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("id, user_id, file_path")
      .eq("id", bookId)
      .eq("user_id", userId)
      .single();

    if (bookErr || !book) return res.status(404).json({ error: "Libro no encontrado" });

    // Borrado capítulos + libro
    await supabase.from("chapters").delete().eq("book_id", bookId);
    await supabase.from("books").delete().eq("id", bookId).eq("user_id", userId);

    // Borrado audios del usuario
    await supabase.from("chapter_audios").delete().eq("book_id", bookId).eq("user_id", userId);

    // Borrado archivo local si existe
    if (book.file_path && fs.existsSync(book.file_path)) {
      try {
        fs.unlinkSync(book.file_path);
      } catch (e) {
        console.warn("No se pudo borrar el archivo:", e);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno deleteBook" });
  }
}

export async function recapChapter(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const { bookId, chapterId } = req.params;

    // (Tu lógica actual aquí)
    // ...
    return res.status(501).json({ error: "recapChapter no implementado en este snippet" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno recapChapter" });
  }
}

export async function deleteAudios(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const { bookId } = req.params;

    const { error } = await supabase
      .from("chapter_audios")
      .delete()
      .eq("book_id", bookId)
      .eq("user_id", userId);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Error borrando audios" });
    }

    // Borrar también carpeta local si procede
    const baseDir = path.join(process.cwd(), "data", "audio", userId, bookId);
    if (fs.existsSync(baseDir)) {
      try {
        fs.rmSync(baseDir, { recursive: true, force: true });
      } catch (e) {
        console.warn("No se pudo borrar carpeta de audios:", e);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno deleteAudios" });
  }
}

export async function generateAudio(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const { bookId, chapterId } = req.params;

    const voice = String(req.query.voice || "alloy");
    const style = String(req.query.style || "neutral");

    // Leer capítulo
    const { data: chapter, error: chErr } = await supabase
      .from("chapters")
      .select("id, book_id, index_in_book, text")
      .eq("id", chapterId)
      .eq("book_id", bookId)
      .single();

    if (chErr || !chapter) return res.status(404).json({ error: "Capítulo no encontrado" });

    // Generar audio
    const outDir = path.join(process.cwd(), "data", "audio", userId, bookId);
    ensureDir(outDir);
    const audioPath = path.join(outDir, `chapter-${chapter.index_in_book}-${voice}-${style}.mp3`);

    const audioBuffer = await synthesizeChapter({
      userId,
      bookId,
      chapterIndex: chapter.index_in_book,
      text: chapter.text,
      voice,
      style
    });

    fs.writeFileSync(audioPath, audioBuffer);

    // Upsert
    const { error: upErr } = await supabase
      .from("chapter_audios")
      .upsert({
        user_id: userId,
        book_id: bookId,
        chapter_id: chapter.id,
        audio_path: audioPath,
        voice,
        style
      });

    if (upErr) {
      console.error(upErr);
      return res.status(500).json({ error: "Error guardando audio en BD" });
    }

    return res.json({ ok: true, audio_path: audioPath });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno generateAudio" });
  }
}

export async function streamChapterAudio(req: Request, res: Response) {
  try {
    const userId = getSafeUserId(req);
    const { bookId, chapterId } = req.params;

    const voice = String(req.query.voice || "alloy");
    const style = String(req.query.style || "neutral");

    const { data, error } = await supabase
      .from("chapter_audios")
      .select("audio_path")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("chapter_id", chapterId)
      .eq("voice", voice)
      .eq("style", style)
      .single();

    if (error || !data) return res.status(404).json({ error: "Audio no encontrado" });

    const p = data.audio_path;
    if (!p || !fs.existsSync(p)) return res.status(404).json({ error: "Archivo de audio no encontrado" });

    res.setHeader("Content-Type", "audio/mpeg");
    return fs.createReadStream(p).pipe(res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno streamChapterAudio" });
  }
}
