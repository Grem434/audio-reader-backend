export interface Chapter {
  id: string;
  book_id: string;
  index_in_book: number;
  title: string | null;
  text: string;
  audio_path?: string | null;
  duration_seconds?: number | null;
  created_at: string;
}
