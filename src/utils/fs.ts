import fs from "fs";

/**
 * Ensure a directory exists (mkdir -p)
 */
export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}
