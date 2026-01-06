export type SupportedFileType = "pdf" | "epub";

export function detectFileType(
  filename: string | undefined,
  mimetype: string | undefined
): SupportedFileType | null {
  if (!filename && !mimetype) return null;

  const lowerName = (filename || "").toLowerCase();

  if (lowerName.endsWith(".pdf")) return "pdf";
  if (lowerName.endsWith(".epub")) return "epub";

  if (mimetype) {
    if (mimetype === "application/pdf") return "pdf";
    if (mimetype === "application/epub+zip") return "epub";
  }

  return null;
}
