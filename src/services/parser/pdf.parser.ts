import fs from "fs";
import * as pdfParse from "pdf-parse";
import type { ParsedChapter } from "../../types/parser";

function splitTextIntoChapters(rawText: string): ParsedChapter[] {
  const text = rawText.replace(/\r\n/g, "\n");

  const chapterRegex = /(cap[ií]tulo\s+\d+.*)/gi;
  const parts = text.split(chapterRegex).filter((p) => p.trim().length > 0);

  const chapters: ParsedChapter[] = [];

  if (parts.length > 1) {
    let currentIndex = 0;
    for (let i = 0; i < parts.length; ) {
      const maybeTitle = parts[i].trim();
      const maybeBody = parts[i + 1]?.trim() ?? "";

      if (
        maybeTitle.toLowerCase().startsWith("capítulo") ||
        maybeTitle.toLowerCase().startsWith("capitulo") ||
        maybeTitle.length < 80
      ) {
        chapters.push({
          index: currentIndex,
          title: maybeTitle,
          text: maybeBody
        });
        currentIndex++;
        i += 2;
      } else {
        if (chapters.length === 0) {
          chapters.push({
            index: 0,
            title: null,
            text: maybeTitle
          });
        } else {
          chapters[chapters.length - 1].text += "\n\n" + maybeTitle;
        }
        i += 1;
      }
    }
  } else {
    const blockSize = 5000;
    const total = text.length;
    let index = 0;
    for (let start = 0; start < total; start += blockSize) {
      const end = Math.min(start + blockSize, total);
      const chunk = text.slice(start, end);
      chapters.push({
        index,
        title: null,
        text: chunk
      });
      index++;
    }
  }

  return chapters;
}

export async function parsePdf(filePath: string): Promise<ParsedChapter[]> {
  const buffer = fs.readFileSync(filePath);
  const result = await (pdfParse as any)(buffer);
  const rawText = result.text;

  const chapters = splitTextIntoChapters(rawText);
  return chapters;
}
