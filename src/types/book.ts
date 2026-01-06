export interface Book {
  id: string;
  user_id: string;
  title: string;
  original_filename: string;
  file_path: string;
  cover_path?: string | null;
  created_at: string;
}
