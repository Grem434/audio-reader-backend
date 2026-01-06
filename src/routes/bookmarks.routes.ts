import { Router } from "express";
import { getBookmark, upsertBookmark } from "../controllers/bookmarks.controller";

const router = Router();

// /api/books/:bookId/bookmark
router.get("/:bookId/bookmark", getBookmark);
router.post("/:bookId/bookmark", upsertBookmark);

export default router;
