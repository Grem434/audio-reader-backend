import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import booksRoutes from "./routes/books.routes";
import authRoutes from "./routes/auth.routes";
import bookmarksRoutes from "./routes/bookmarks.routes";
import continueRoutes from "./routes/continue.routes";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Servir audios generados
app.use("/audio", express.static(path.join(process.cwd(), "audios")));

app.get("/", (_, res) => {
  res.send("Audio Reader API running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/books", bookmarksRoutes);
app.use("/api/books", continueRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
