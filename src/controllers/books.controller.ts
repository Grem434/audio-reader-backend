import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { supabase } from "../services/supabase";
import { detectFileType } from "../services/parser/filetype";
import { parsePdf } from "../services/parser/pdf.parser";
import { parseEpub } from "../services/parser/epub.parser";
import type { ParsedChapter } from "../types/parser";
import { synthesizeChapter, TtsStyle } from "../services/tts";
import { estimateTextBatch } from "../utils/ttsEstimate";
import { MAX_OPERATION_COST_USD } from "../config/billing";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SUBIR LIBRO
============================ */
export async function uploadBook(req: Request, res: Response) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "No se ha subido ningún archivo" });
    }

    const userId = req.header("x-user-id");
    if (!userId) {
      return res.status(401).json({ error: "Falta userId (x-user-id) para pruebas" });
    }

    const fileType = detectFileType(file.originalname, file.mimetype);
    if (!fileType) {
      return res.status(400).json({ error: "Tipo de archivo no soportado (solo PDF o EPUB)" });
    }

    const localPath = file.path;
    const originalFilename = file.originalname;

    let bookTitle = originalFilename;
    let parsedChapters: ParsedChapter[] = [];

    if (fileType === "pdf") {
      const parsed = await parsePdf(localPath);
      bookTitle = parsed.title || bookTitle;
      parsedChapters = parsed.chapters;
    } else if (fileType === "epub") {
      const parsed = await parseEpub(localPath);
      bookTitle = parsed.title || bookTitle;
      parsedChapters = parsed.chapters;
    }

    if (!parsedChapters.length) {
      return res.status(400).json({ error: "No se han detectado capítulos en el libro" });
    }

    const { data: bookData, error: bookError } = await supabase
      .from("books")
      .insert({
        user_id: userId,
        title: bookTitle,
        original_filename: originalFilename,
        file_path: localPath
      })
      .select()
      .single();

    if (bookError || !bookData) {
      console.error(bookError);
      return res.status(500).json({ error: "Error guardando el libro en la BD" });
    }

    const bookId = bookData.id;

    const chaptersRows = parsedChapters.map((c) => ({
      book_id: bookId,
      index_in_book: c.index,
      title: c.title,
      text: c.text
    }));

    const { error: chaptersError } = await supabase.from("chapters").insert(chaptersRows);
    if (chaptersError) {
      console.error(chaptersError);
      return res.status(500).json({ error: "Error guardando capítulos en la BD" });
    }

    return res.json({
      id: bookId,
      title: bookTitle,
      chaptersCount: parsedChapters.length
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Error subiendo libro", details: err?.message });
  }
}

/* ============================
   LISTAR LIBROS (biblioteca común)
============================ */
export async function listBooks(req: Request, res: Response) {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({
      error: "Error cargando libros",
      details: error.message
    });
  }

  return res.json(data ?? []);
}

/* ============================
   OBTENER LIBRO + CAPÍTULOS
   (SIN filtrar por user_id)
============================ */
export async function getBook(req: Request, res: Response) {
  try {
    const userId = req.header("x-user-id");
    const { bookId } = req.params;

    const voice = String(req.query.voice || "marin");
    const style = String(req.query.style || "learning");

    if (!userId) return res.status(401).json({ error: "Falta x-user-id" });

    // 🔴 CLAVE: NO filtramos por user_id (biblioteca común)
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
      .select("id, book_id, index_in_book, title")
      .eq("book_id", bookId)
      .order("index_in_book", { ascending: true });

    if (chErr) {
      return res.status(500).json({ error: "Error cargando capítulos" });
    }

    let estimateUsd = 0;
    try {
      estimateUsd = await estimateTextBatch({
        bookId,
        voice,
        style: style as TtsStyle
      });
    } catch {}

    return res.json({
      ...book,
      chapters: chapters ?? [],
      tts: {
        voice,
        style,
        estimateUsd,
        maxUsd: MAX_OPERATION_COST_USD
      }
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Error cargando libro", details: err?.message });
  }
}

/* ============================
   BORRAR LIBRO (solo uploader)
============================ */
export async function deleteBook(req: Request, res: Response) {
  try {
    const { bookId } = req.params;
    const userId = req.header("x-user-id");
    if (!userId) return res.status(401).json({ error: "Falta x-user-id" });

    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("id, user_id, file_path")
      .eq("id", bookId)
      .eq("user_id", userId)
      .single();

    if (bookErr || !book) return res.status(404).json({ error: "Libro no encontrado" });

    await supabase.from("bookmarks").delete().eq("book_id", bookId);
    await supabase.from("chapter_audios").delete().eq("book_id", bookId).eq("user_id", userId);
    await supabase.from("chapters").delete().eq("book_id", bookId);
    await supabase.from("books").delete().eq("id", bookId).eq("user_id", userId);

    try {
      if (book.file_path && fs.existsSync(book.file_path)) {
        fs.unlinkSync(book.file_path);
      }
    } catch {}

    try {
      const baseDir = path.join(process.cwd(), "data", "audio", userId, bookId);
      if (fs.existsSync(baseDir)) {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    } catch {}

    return res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Error borrando libro", details: err?.message });
  }
}

/* ============================
   CAPÍTULO (solo uploader)
============================ */
export async function getChapter(req: Request, res: Response) {
  try {
    const { bookId, chapterId } = req.params;
    const userId = req.header("x-user-id");

    if (!userId) return res.status(401).json({ error: "Falta x-user-id" });

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, user_id, title")
      .eq("id", bookId)
      .single();

    if (bookError || !book) return res.status(404).json({ error: "Libro no encontrado" });
    if ((book as any).user_id !== userId) return res.status(403).json({ error: "No tienes acceso a este libro" });

    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id, title, index_in_book, text, book_id")
      .eq("id", chapterId)
      .eq("book_id", bookId)
      .single();

    if (chapterError || !chapter) {
      return res.status(404).json({ error: "Capítulo no encontrado" });
    }

    return res.json(chapter);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Error cargando capítulo", details: err?.message });
  }
}

/* ============================
   AUDIO
============================ */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveAudioPath(bookId: string, userId: string, chapterIndex: number) {
  const base = path.join(process.cwd(), "data", "audio", userId, bookId);
  ensureDir(base);
  return path.join(base, `chapter-${chapterIndex}.mp3`);
}

function ensureFileExists(from: string) {
  if (!fs.existsSync(from)) {
    throw new Error(`No se encontró el MP3 generado en disco: ${from}`);
  }
}

export async function generateAudio(req: Request, res: Response) {
  try {
    const { bookId } = req.params;
    const userId = req.header("x-user-id");

    if (!userId) {
      return res.status(401).json({ error: "Falta userId (x-user-id) para pruebas" });
    }

    const voice = String(req.query.voice || "marin");
    const style = String(req.query.style || "learning") as TtsStyle;

    const { data: book, error: bookErr } = await supabase
      .from("books")
      .select("id, user_id, title")
      .eq("id", bookId)
      .single();

    if (bookErr || !book) return res.status(404).json({ error: "Libro no encontrado" });
    if ((book as any).user_id !== userId) return res.status(403).json({ error: "No tienes acceso a este libro" });

    const { data: chapters, error: chErr } = await supabase
      .from("chapters")
      .select("id, book_id, index_in_book, title, text")
      .eq("book_id", bookId)
      .order("index_in_book", { ascending: true });

    if (chErr || !chapters?.length) return res.status(404).json({ error: "No hay capítulos" });

    const estUsd = await estimateTextBatch({ bookId, voice, style });

    if (estUsd > MAX_OPERATION_COST_USD) {
      return res.status(402).json({
        error: "Coste estimado demasiado alto",
        estimateUsd: estUsd,
        maxUsd: MAX_OPERATION_COST_USD
      });
    }

    const created: any[] = [];
    for (const c of chapters) {
      const outPath = resolveAudioPath(bookId, userId, c.index_in_book);

      const audioBuffer = await synthesizeChapter({
        text: c.text,
        voice,
        style
      });

      fs.writeFileSync(outPath, audioBuffer);

      const { data: row, error: rowErr } = await supabase
        .from("chapter_audios")
        .upsert({
          user_id: userId,
          book_id: bookId,
          index_in_book: c.index_in_book,
          file_path: outPath,
          voice,
          style
        })
        .select()
        .single();

      if (rowErr) {
        console.error(rowErr);
        return res.status(500).json({ error: "Error guardando audio en BD" });
      }

      created.push(row);
    }

    return res.json({
      ok: true,
      estimateUsd: estUsd,
      createdCount: created.length
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Error generando audio", details: err?.message });
  }
}

export async function getChapterAudio(req: Request, res: Response) {
  try {
    const { bookId, chapterIndex } = req.params;
    const userId = req.header("x-user-id");
    if (!userId) return res.status(401).json({ error: "Falta x-user-id" });

    const idx = Number(chapterIndex);
    if (Number.isNaN(idx)) return res.status(400).json({ error: "chapterIndex inválido" });

    const { data, error } = await supabase
      .from("chapter_audios")
      .select("*")
      .eq("book_id", bookId)
      .eq("user_id", userId)
      .eq("index_in_book", idx)
      .single();

    if (error || !data) return res.status(404).json({ error: "Audio no encontrado" });

    ensureFileExists((data as any).file_path);

    res.setHeader("Content-Type", "audio/mpeg");
    return fs.createReadStream((data as any).file_path).pipe(res);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Error devolviendo audio", details: err?.message });
  }
}
