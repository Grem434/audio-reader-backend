import { Router } from "express";
import { getContinue } from "../controllers/continue.controller";

const router = Router();

// GET /api/books/:bookId/continue
router.get("/:bookId/continue", getContinue);

export default router;
