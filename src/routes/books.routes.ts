import { Router } from "express";
import multer from "multer";
import {
  uploadBook,
  listBooks,
  getBook,
  generateAudio,
  deleteBook,
  deleteAudios,
  recapChapter
} from "../controllers/books.controller";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.get("/", listBooks);
router.get("/:bookId", getBook);

router.post("/upload", upload.single("file"), uploadBook);
router.post("/:bookId/generate-audio", generateAudio);
router.post("/:bookId/recap", recapChapter);

// borrar
router.delete("/:bookId/audios", deleteAudios);
router.delete("/:bookId", deleteBook);

export default router;
