import EPub from "epub";
import type { ParsedChapter } from "../../types/parser";

export interface ParsedEpub {
  title: string;
  chapters: ParsedChapter[];
}

export async function parseEpub(filePath: string): Promise<ParsedEpub> {
  const epub = new EPub(filePath);

  await new Promise<void>((resolve, reject) => {
    epub.on("end", () => resolve());
    epub.on("error", (err: any) => reject(err));
    epub.parse();
  });

  const bookTitle = epub.metadata?.title || "Libro sin título";

  const spine = epub.flow;
  const chapters: ParsedChapter[] = [];

  let index = 0;

  for (const item of spine) {
    const id = item.id;
    const title = item.title || null;

    const chapterText: string = await new Promise((resolve, reject) => {
      epub.getChapter(id, (err: any, text: string) => {
        if (err) return reject(err);

        const cleanText = text
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\r\n/g, "\n")
          .trim();

        resolve(cleanText);
      });
    });

    if (chapterText.length === 0) continue;

    chapters.push({
      index,
      title,
      text: chapterText
    });

    index++;
  }

  return {
    title: bookTitle,
    chapters
  };
}
