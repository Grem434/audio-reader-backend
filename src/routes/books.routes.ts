import { Router } from "express";
import multer from "multer";

import {
  listBooks,
  uploadBook,
  getBook,
  generateAudio,
  recapChapter,
  deleteBook,
  deleteAudios,
  getContinue,
  saveBookmark,
} from "../controllers/books.controller";

const router = Router();
const upload = multer({ dest: "uploads/" });

/**
 * Rutas /api/books
 *
 * Modelo actual:
 * - Libros: públicos (lista/leer/borrar por ahora sin RLS dura)
 * - Audios + bookmarks: por usuario (x-user-id)
 */

// Públicos
router.get("/", listBooks);
router.post("/upload", upload.single("file"), uploadBook);

// ⚠️ Endpoints por usuario (deben tener x-user-id)
router.get("/:bookId/continue", getContinue);
router.post("/:bookId/bookmark", saveBookmark);
router.post("/:bookId/generate-audio", generateAudio);
router.post("/:bookId/recap", recapChapter);
router.delete("/:bookId/audios", deleteAudios);

// Detalle / borrar libro
router.get("/:bookId", getBook);
router.delete("/:bookId", deleteBook);

export default router;
