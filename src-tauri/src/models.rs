use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub file_path: String,
    pub cover_path: Option<String>,
    pub total_chapters: u32,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub book_id: String,
    pub chapter_index: u32,
    pub scroll_position: f64,
    pub last_read_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub chapter_index: u32,
    pub scroll_position: f64,
    pub note: Option<String>,
    pub created_at: i64,
}
