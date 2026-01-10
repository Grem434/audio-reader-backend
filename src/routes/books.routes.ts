import { Router } from "express";
import multer from "multer";

import {
  listBooks,
  uploadBook,
  getBook,
  generateAudio,
  recapChapter,
  deleteBook,
  deleteAudios
} from "../controllers/books.controller";

const router = Router();
const upload = multer({ dest: "uploads/" });

/**
 * LIBRERÍA PÚBLICA:
 * - Listar / subir / borrar libro: permitido SIN x-user-id
 * - Audios / recap / borrar audios: requiere x-user-id (porque es “por usuario”)
 */

// Público
router.get("/", listBooks);
router.post("/upload", upload.single("file"), uploadBook);
router.get("/:bookId", getBook);
router.delete("/:bookId", deleteBook);

// Privado por usuario
router.post("/:bookId/generate-audio", generateAudio);
router.post("/:bookId/recap", recapChapter);
router.delete("/:bookId/audios", deleteAudios);

export default router;
