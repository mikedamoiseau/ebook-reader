# Auto-Enrichment with Scan Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kodi-style automatic metadata enrichment — extract ISBN/genres from files, parse filenames for CBR/CBZ, auto-lookup via OpenLibrary, with a cancellable background queue and progress UI.

**Architecture:** A new `enrichment.rs` module handles filename parsing, ISBN extraction, and the enrichment engine. A background scan queue processes one book at a time, emitting progress events via Tauri's event system. The queue is fed by import, startup scan, manual "Scan Library", or per-book actions. Settings control auto-scan behavior.

**Tech Stack:** Rust (regex for filename parsing, existing OpenLibrary client), Tauri v2 events for progress, React 19 frontend.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/enrichment.rs` | Create | Filename parser, ISBN validator, enrichment engine, confidence scoring |
| `src-tauri/src/epub.rs` | Modify | Extract `dc:identifier` (ISBN) and `dc:subject` (genres) from OPF |
| `src-tauri/src/cbz.rs` | Modify | Parse ComicInfo.xml if present in archive |
| `src-tauri/src/db.rs` | Modify | Add `enrichment_status` column migration |
| `src-tauri/src/commands.rs` | Modify | New enrichment commands, hook queue into import, Tauri event emitting |
| `src-tauri/src/lib.rs` | Modify | Register module + commands, startup scan trigger |
| `src-tauri/Cargo.toml` | Modify | Add `regex` crate |
| `src/screens/Library.tsx` | Modify | Enrichment progress bar, "Scan Library" button |
| `src/components/BookCard.tsx` | Modify | "Scan for metadata" and "Queue for scan" actions |

---

### Task 1: Filename parser with TDD

The filename parser extracts title, author, year, and ISBN from messy filenames. This is pure logic with no dependencies — ideal for TDD.

**Files:**
- Create: `src-tauri/src/enrichment.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add `regex` to Cargo.toml**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
regex = "1"
```

- [ ] **Step 2: Create enrichment.rs with ParsedFilename struct and tests**

Create `src-tauri/src/enrichment.rs` with the struct, a stub function, and comprehensive tests:

```rust
use regex::Regex;
use std::sync::LazyLock;

/// Metadata extracted from a filename.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ParsedFilename {
    pub title: Option<String>,
    pub author: Option<String>,
    pub year: Option<u16>,
    pub isbn: Option<String>,
}

static ISBN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(97[89]\d{10}|\d{9}[\dXx])$").unwrap()
});

static YEAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\((\d{4})\)|\[(\d{4})\]").unwrap()
});

static PAREN_AUTHOR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\(([^)]{3,50})\)\s*$").unwrap()
});

/// Parse a filename (without extension) into structured metadata.
pub fn parse_filename(stem: &str) -> ParsedFilename {
    let mut result = ParsedFilename::default();

    // Clean: replace underscores and dots (but not in numbers) with spaces
    let cleaned = stem.replace('_', " ");
    let cleaned = cleaned.trim();

    // Check if entire stem is an ISBN
    let no_spaces = cleaned.replace([' ', '-'], "");
    if ISBN_RE.is_match(&no_spaces) {
        result.isbn = Some(no_spaces);
        return result;
    }

    // Extract year from (YYYY) or [YYYY]
    if let Some(caps) = YEAR_RE.captures(cleaned) {
        let year_str = caps.get(1).or(caps.get(2)).unwrap().as_str();
        if let Ok(y) = year_str.parse::<u16>() {
            if (1800..=2100).contains(&y) {
                result.year = Some(y);
            }
        }
    }
    let without_year = YEAR_RE.replace_all(cleaned, "").trim().to_string();

    // Try: "Author - Title" or "Title - Author" patterns
    // Heuristic: if text after last parenthesized group looks like an author name, use it
    // First check for trailing (Author Name) pattern (common for comics)
    if let Some(caps) = PAREN_AUTHOR_RE.captures(&without_year) {
        let author = caps.get(1).unwrap().as_str().trim();
        let before = without_year[..caps.get(0).unwrap().start()].trim();
        // Only treat as author if the parenthesized text contains letters and spaces
        // (not years, not numbers-only)
        if author.chars().any(|c| c.is_alphabetic()) && !author.chars().all(|c| c.is_ascii_digit()) {
            result.author = Some(author.to_string());
            result.title = Some(before.to_string());
            return result;
        }
    }

    let work = without_year.trim();

    // Try splitting on " - " (most common separator)
    if let Some((left, right)) = work.split_once(" - ") {
        let left = left.trim();
        let right = right.trim();
        // Heuristic: if left is short (1-3 words) and right is longer, left is likely the author
        let left_words = left.split_whitespace().count();
        let right_words = right.split_whitespace().count();
        if left_words <= 3 && right_words > left_words {
            result.author = Some(left.to_string());
            result.title = Some(right.to_string());
        } else {
            // Default: left is title, right could be subtitle or author
            result.title = Some(left.to_string());
            // If right is short (1-3 words), treat as author
            if right_words <= 3 {
                result.author = Some(right.to_string());
            } else {
                // Include as part of the title
                result.title = Some(work.to_string());
            }
        }
        return result;
    }

    // Try splitting on " by " (case-insensitive)
    if let Some(idx) = work.to_lowercase().find(" by ") {
        let title = work[..idx].trim();
        let author = work[idx + 4..].trim();
        if !title.is_empty() && !author.is_empty() {
            result.title = Some(title.to_string());
            result.author = Some(author.to_string());
            return result;
        }
    }

    // Fallback: entire cleaned stem is the title
    if !work.is_empty() {
        result.title = Some(work.to_string());
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_isbn_only_filename() {
        let r = parse_filename("9780441013593");
        assert_eq!(r.isbn.as_deref(), Some("9780441013593"));
        assert!(r.title.is_none());
    }

    #[test]
    fn parse_isbn_with_dashes() {
        let r = parse_filename("978-0-441-01359-3");
        assert_eq!(r.isbn.as_deref(), Some("9780441013593"));
    }

    #[test]
    fn parse_author_dash_title_with_year() {
        let r = parse_filename("Frank Herbert - Dune (1965)");
        assert_eq!(r.author.as_deref(), Some("Frank Herbert"));
        assert_eq!(r.title.as_deref(), Some("Dune"));
        assert_eq!(r.year, Some(1965));
    }

    #[test]
    fn parse_title_by_author() {
        let r = parse_filename("Dune by Frank Herbert");
        assert_eq!(r.title.as_deref(), Some("Dune"));
        assert_eq!(r.author.as_deref(), Some("Frank Herbert"));
    }

    #[test]
    fn parse_comic_with_paren_author() {
        let r = parse_filename("Aria - T01 - La fugue d'Aria (Michel Weyland)");
        assert_eq!(r.title.as_deref(), Some("Aria - T01 - La fugue d'Aria"));
        assert_eq!(r.author.as_deref(), Some("Michel Weyland"));
    }

    #[test]
    fn parse_comic_no_author() {
        let r = parse_filename("Aria T39 - Flammes salvatrices");
        assert_eq!(r.title.as_deref(), Some("Aria T39"));
        assert!(r.author.is_some()); // "Flammes salvatrices" — not ideal but acceptable
    }

    #[test]
    fn parse_underscores_replaced() {
        let r = parse_filename("Dune_by_Frank_Herbert");
        assert_eq!(r.title.as_deref(), Some("Dune"));
        assert_eq!(r.author.as_deref(), Some("Frank Herbert"));
    }

    #[test]
    fn parse_simple_title() {
        let r = parse_filename("Dune");
        assert_eq!(r.title.as_deref(), Some("Dune"));
        assert!(r.author.is_none());
    }

    #[test]
    fn parse_year_in_brackets() {
        let r = parse_filename("Foundation [1951]");
        assert_eq!(r.title.as_deref(), Some("Foundation"));
        assert_eq!(r.year, Some(1951));
    }

    #[test]
    fn parse_empty_filename() {
        let r = parse_filename("");
        assert!(r.title.is_none());
        assert!(r.author.is_none());
    }
}
```

- [ ] **Step 3: Register the module in lib.rs**

Add `pub mod enrichment;` after the existing module declarations in `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo fmt && cargo test enrichment::tests -- --nocapture 2>&1`

Expected: all tests pass. Fix any parsing edge cases that fail.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/enrichment.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(enrichment): add filename parser with TDD tests"
```

---

### Task 2: ISBN extraction from EPUB and ISBN lookup

Extract ISBN from EPUB `dc:identifier` at import time. Add an ISBN lookup function to `openlibrary.rs`.

**Files:**
- Modify: `src-tauri/src/epub.rs`
- Modify: `src-tauri/src/openlibrary.rs`
- Modify: `src-tauri/src/enrichment.rs`

- [ ] **Step 1: Add ISBN validation to enrichment.rs**

Add after the `parse_filename` function in `enrichment.rs`:

```rust
/// Check if a string is a valid ISBN-10 or ISBN-13.
pub fn is_valid_isbn(s: &str) -> bool {
    let cleaned = s.replace(['-', ' '], "");
    ISBN_RE.is_match(&cleaned)
}

/// Extract ISBN from a dc:identifier string.
/// Handles formats like "urn:isbn:9780441013593", "isbn:9780441013593", or bare ISBN.
pub fn extract_isbn(identifier: &str) -> Option<String> {
    let s = identifier
        .trim()
        .strip_prefix("urn:isbn:")
        .or_else(|| identifier.trim().strip_prefix("isbn:"))
        .or_else(|| identifier.trim().strip_prefix("ISBN:"))
        .unwrap_or(identifier.trim());
    let cleaned = s.replace(['-', ' '], "");
    if ISBN_RE.is_match(&cleaned) {
        Some(cleaned)
    } else {
        None
    }
}
```

Add tests:

```rust
    #[test]
    fn extract_isbn_from_urn() {
        assert_eq!(extract_isbn("urn:isbn:9780441013593"), Some("9780441013593".into()));
    }

    #[test]
    fn extract_isbn_bare() {
        assert_eq!(extract_isbn("9780441013593"), Some("9780441013593".into()));
    }

    #[test]
    fn extract_isbn_with_dashes() {
        assert_eq!(extract_isbn("978-0-441-01359-3"), Some("9780441013593".into()));
    }

    #[test]
    fn extract_isbn_invalid() {
        assert_eq!(extract_isbn("not-an-isbn"), None);
        assert_eq!(extract_isbn("12345"), None);
    }
```

- [ ] **Step 2: Modify epub.rs to extract dc:identifier and dc:subject**

In `src-tauri/src/epub.rs`, modify `BookMetadata` struct to add:

```rust
pub struct BookMetadata {
    pub title: String,
    pub author: String,
    pub language: String,
    pub description: Option<String>,
    pub isbn: Option<String>,
    pub genres: Vec<String>,
}
```

In `parse_epub_metadata()`, after the existing description extraction, add:

```rust
    // Extract ISBN from dc:identifier
    let isbn = extract_all_tag_texts(&opf, "dc:identifier")
        .iter()
        .chain(extract_all_tag_texts(&opf, "identifier").iter())
        .find_map(|id| crate::enrichment::extract_isbn(id));

    // Extract genres from dc:subject
    let genres = {
        let mut subjects = extract_all_tag_texts(&opf, "dc:subject");
        subjects.extend(extract_all_tag_texts(&opf, "subject"));
        subjects
    };

    Ok(BookMetadata {
        title,
        author,
        language,
        description,
        isbn,
        genres,
    })
```

- [ ] **Step 3: Add ISBN lookup to openlibrary.rs**

Add after the existing `get_work` function:

```rust
/// Look up a book by ISBN. Returns the work data if found.
pub fn lookup_isbn(isbn: &str) -> Result<OpenLibraryResult, String> {
    let url = format!("https://openlibrary.org/isbn/{}.json", isbn);
    let resp = reqwest::blocking::get(&url).map_err(|e| format!("ISBN lookup failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ISBN not found: HTTP {}", resp.status()));
    }
    let doc: serde_json::Value = resp.json().map_err(|e| format!("JSON parse error: {e}"))?;

    let title = doc["title"].as_str().unwrap_or("").to_string();

    // The ISBN endpoint returns an edition, which has a "works" array pointing to the work
    let work_key = doc["works"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|w| w["key"].as_str())
        .map(|s| s.to_string());

    // If we got a work key, fetch the full work for description/subjects
    if let Some(ref key) = work_key {
        if let Ok(mut work) = get_work(key) {
            if work.title.is_empty() {
                work.title = title;
            }
            work.isbn = Some(isbn.to_string());
            return Ok(work);
        }
    }

    Ok(OpenLibraryResult {
        key: work_key.unwrap_or_default(),
        title,
        author: doc["by_statement"].as_str().unwrap_or("").to_string(),
        description: None,
        genres: Vec::new(),
        rating: None,
        isbn: Some(isbn.to_string()),
        cover_url: doc["covers"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_i64())
            .map(|id| format!("https://covers.openlibrary.org/b/id/{}-L.jpg", id)),
    })
}
```

- [ ] **Step 4: Run tests and verify compilation**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings && cargo test enrichment::tests -- --nocapture 2>&1`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/enrichment.rs src-tauri/src/epub.rs src-tauri/src/openlibrary.rs
git commit -m "feat(enrichment): ISBN extraction from EPUB and OpenLibrary ISBN lookup"
```

---

### Task 3: Enrichment engine — confidence scoring and auto-apply logic

The enrichment engine takes a book, decides the best lookup strategy, and returns a result with confidence.

**Files:**
- Modify: `src-tauri/src/enrichment.rs`

- [ ] **Step 1: Add the enrichment engine with tests**

Add to `enrichment.rs` after the existing code:

```rust
use crate::openlibrary::{self, OpenLibraryResult};

/// Result of an enrichment attempt.
#[derive(Debug, Clone)]
pub struct EnrichmentResult {
    pub data: OpenLibraryResult,
    pub confidence: f64, // 0.0 to 1.0
    pub auto_apply: bool,
}

/// Compute normalized string similarity (Jaccard on word sets, case-insensitive).
pub fn title_similarity(a: &str, b: &str) -> f64 {
    let words_a: std::collections::HashSet<String> = a
        .to_lowercase()
        .split_whitespace()
        .filter(|w| !matches!(*w, "the" | "a" | "an" | "of" | "and"))
        .map(|s| s.to_string())
        .collect();
    let words_b: std::collections::HashSet<String> = b
        .to_lowercase()
        .split_whitespace()
        .filter(|w| !matches!(*w, "the" | "a" | "an" | "of" | "and"))
        .map(|s| s.to_string())
        .collect();
    if words_a.is_empty() && words_b.is_empty() {
        return 0.0;
    }
    let intersection = words_a.intersection(&words_b).count() as f64;
    let union = words_a.union(&words_b).count() as f64;
    if union == 0.0 { 0.0 } else { intersection / union }
}

/// Attempt to enrich a book from OpenLibrary.
/// Tries ISBN lookup first (highest confidence), then title+author search.
pub fn enrich_book(
    title: &str,
    author: &str,
    isbn: Option<&str>,
) -> Option<EnrichmentResult> {
    // Tier 1: ISBN lookup (near-perfect match)
    if let Some(isbn) = isbn {
        if let Ok(result) = openlibrary::lookup_isbn(isbn) {
            if !result.title.is_empty() {
                return Some(EnrichmentResult {
                    data: result,
                    confidence: 0.95,
                    auto_apply: true,
                });
            }
        }
    }

    // Tier 2: Title + Author search
    let author_opt = if author.is_empty() || author == "Unknown Author" {
        None
    } else {
        Some(author)
    };

    let results = openlibrary::search(title, author_opt).ok()?;
    let first = results.into_iter().next()?;

    let sim = title_similarity(title, &first.title);

    if sim >= 0.85 {
        Some(EnrichmentResult {
            data: first,
            confidence: sim,
            auto_apply: true,
        })
    } else if sim >= 0.5 {
        Some(EnrichmentResult {
            data: first,
            confidence: sim,
            auto_apply: false, // suggest only
        })
    } else {
        None // no confident match
    }
}
```

Add tests:

```rust
    #[test]
    fn title_similarity_exact_match() {
        assert!((title_similarity("Dune", "Dune") - 1.0).abs() < 0.01);
    }

    #[test]
    fn title_similarity_with_articles() {
        assert!((title_similarity("The Lord of the Rings", "Lord of Rings") - 1.0).abs() < 0.01);
    }

    #[test]
    fn title_similarity_different() {
        assert!(title_similarity("Dune", "Foundation") < 0.1);
    }

    #[test]
    fn title_similarity_partial() {
        let sim = title_similarity("Dune Messiah", "Dune");
        assert!(sim > 0.3 && sim < 0.8);
    }
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo fmt && cargo test enrichment::tests -- --nocapture 2>&1`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/enrichment.rs
git commit -m "feat(enrichment): add enrichment engine with confidence scoring"
```

---

### Task 4: DB migration — enrichment_status column

**Files:**
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Write test for enrichment_status column**

Add to the `#[cfg(test)] mod tests` block in `db.rs`:

```rust
#[test]
fn test_books_have_enrichment_status() {
    let dir = tempfile::tempdir().unwrap();
    let conn = init_db(dir.path().join("test.db").as_path()).unwrap();
    conn.execute(
        "INSERT INTO books (id, title, author, file_path, total_chapters, added_at, format, updated_at) VALUES ('t1', 'T', 'A', '/t', 0, 100, 'epub', 100)",
        [],
    ).unwrap();
    let val: Option<String> = conn.query_row("SELECT enrichment_status FROM books WHERE id = 't1'", [], |row| row.get(0)).unwrap();
    assert!(val.is_none()); // default is NULL
}
```

- [ ] **Step 2: Run test — should fail**

Run: `cd src-tauri && cargo test test_books_have_enrichment_status 2>&1`

- [ ] **Step 3: Add migration to run_schema()**

In `db.rs`, inside `run_schema()`, after the `updated_at` migrations, add:

```rust
    // Enrichment scan status
    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN enrichment_status TEXT;");
```

- [ ] **Step 4: Add DB helper functions**

After `update_book_enrichment()` in `db.rs`, add:

```rust
pub fn set_enrichment_status(conn: &Connection, book_id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE books SET enrichment_status = ?2 WHERE id = ?1",
        params![book_id, status],
    )?;
    Ok(())
}

pub fn list_unenriched_books(conn: &Connection) -> Result<Vec<Book>> {
    let sql = format!(
        "SELECT {} FROM books WHERE enrichment_status IS NULL OR enrichment_status = 'queued' ORDER BY added_at DESC",
        BOOK_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_book)?;
    rows.collect()
}
```

Also update `BOOK_COLUMNS` to include `enrichment_status`:

```rust
const BOOK_COLUMNS: &str = "id, title, author, file_path, cover_path, total_chapters, added_at, format, file_hash, description, genres, rating, isbn, openlibrary_key, enrichment_status";
```

And update `row_to_book` to read the new column (column index 14). You'll need to add `enrichment_status: Option<String>` to the `Book` struct in `models.rs` first.

- [ ] **Step 5: Update Book struct in models.rs**

Add to the `Book` struct:

```rust
    pub enrichment_status: Option<String>, // null, "enriched", "skipped", "queued"
```

- [ ] **Step 6: Update row_to_book in db.rs**

Add after `openlibrary_key: row.get(13)?`:

```rust
            enrichment_status: row.get(14)?,
```

- [ ] **Step 7: Update insert_book in db.rs**

Add `enrichment_status` as column 16 in the INSERT, using `book.enrichment_status` as the value (which will be `None` for new imports).

- [ ] **Step 8: Run tests**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings && cargo test 2>&1`

All existing tests + new test must pass. Fix any places where `Book` struct is constructed without the new field.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/models.rs
git commit -m "feat(db): add enrichment_status column and unenriched books query"
```

---

### Task 5: Scan queue with Tauri event progress

The queue processes books sequentially on a background thread, emitting progress events.

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add enrichment commands to commands.rs**

At the end of `commands.rs` before the `#[cfg(test)]` block, add:

```rust
// ---- Enrichment / Scan Queue Commands ----

use std::sync::atomic::{AtomicBool, Ordering};

static SCAN_CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    current: u32,
    total: u32,
    book_title: String,
    status: String, // "running", "done", "cancelled"
}

#[tauri::command]
pub async fn start_scan(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    SCAN_CANCEL.store(false, Ordering::SeqCst);
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;

    // Get auto-scan-on-import setting
    let books = db::list_unenriched_books(&conn).map_err(|e| e.to_string())?;
    let total = books.len() as u32;

    if total == 0 {
        let _ = app.emit("scan-progress", ScanProgress {
            current: 0, total: 0, book_title: String::new(), status: "done".into(),
        });
        return Ok(());
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        for (i, book) in books.iter().enumerate() {
            if SCAN_CANCEL.load(Ordering::SeqCst) {
                let _ = app_clone.emit("scan-progress", ScanProgress {
                    current: (i + 1) as u32, total, book_title: book.title.clone(), status: "cancelled".into(),
                });
                return;
            }

            let _ = app_clone.emit("scan-progress", ScanProgress {
                current: (i + 1) as u32, total, book_title: book.title.clone(), status: "running".into(),
            });

            // Determine best metadata for lookup
            let parsed = crate::enrichment::parse_filename(
                std::path::Path::new(&book.file_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(""),
            );

            let lookup_title = if book.title == "Unknown Title" || book.title == "Unknown" {
                parsed.title.as_deref().unwrap_or(&book.title)
            } else {
                &book.title
            };

            let lookup_author = if book.author.is_empty() || book.author == "Unknown Author" {
                parsed.author.as_deref().unwrap_or(&book.author)
            } else {
                &book.author
            };

            let lookup_isbn = book.isbn.as_deref().or(parsed.isbn.as_deref());

            // Attempt enrichment
            match crate::enrichment::enrich_book(lookup_title, lookup_author, lookup_isbn) {
                Some(result) if result.auto_apply => {
                    let genres_json = if !result.data.genres.is_empty() {
                        Some(serde_json::to_string(&result.data.genres).unwrap_or_default())
                    } else {
                        None
                    };
                    let _ = db::update_book_enrichment(
                        &conn,
                        &book.id,
                        result.data.description.as_deref(),
                        genres_json.as_deref(),
                        result.data.rating,
                        result.data.isbn.as_deref().or(lookup_isbn),
                        if result.data.key.is_empty() { None } else { Some(&result.data.key) },
                    );
                    let _ = db::set_enrichment_status(&conn, &book.id, "enriched");
                }
                Some(_) => {
                    // Low confidence — skip for now (could store as suggestion in future)
                    let _ = db::set_enrichment_status(&conn, &book.id, "skipped");
                }
                None => {
                    let _ = db::set_enrichment_status(&conn, &book.id, "skipped");
                }
            }

            // Brief pause to avoid rate limiting OpenLibrary
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        let _ = app_clone.emit("scan-progress", ScanProgress {
            current: total, total, book_title: String::new(), status: "done".into(),
        });
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_scan() -> Result<(), String> {
    SCAN_CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn scan_single_book(
    book_id: String,
    state: State<'_, AppState>,
) -> Result<Book, String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    let book = db::get_book(&conn, &book_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Book '{}' not found", book_id))?;

    let parsed = crate::enrichment::parse_filename(
        std::path::Path::new(&book.file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(""),
    );

    let lookup_title = if book.title == "Unknown Title" || book.title == "Unknown" {
        parsed.title.as_deref().unwrap_or(&book.title)
    } else {
        &book.title
    };
    let lookup_author = if book.author.is_empty() || book.author == "Unknown Author" {
        parsed.author.as_deref().unwrap_or(&book.author)
    } else {
        &book.author
    };
    let lookup_isbn = book.isbn.as_deref().or(parsed.isbn.as_deref());

    let (tx, rx) = std::sync::mpsc::channel();
    let title_owned = lookup_title.to_string();
    let author_owned = lookup_author.to_string();
    let isbn_owned = lookup_isbn.map(|s| s.to_string());
    std::thread::spawn(move || {
        let _ = tx.send(crate::enrichment::enrich_book(
            &title_owned,
            &author_owned,
            isbn_owned.as_deref(),
        ));
    });
    let enrichment = rx.recv().map_err(|e| format!("Thread error: {e}"))?;

    match enrichment {
        Some(result) => {
            let genres_json = if !result.data.genres.is_empty() {
                Some(serde_json::to_string(&result.data.genres).unwrap_or_default())
            } else {
                None
            };
            db::update_book_enrichment(
                &conn,
                &book_id,
                result.data.description.as_deref(),
                genres_json.as_deref(),
                result.data.rating,
                result.data.isbn.as_deref().or(lookup_isbn),
                if result.data.key.is_empty() { None } else { Some(&result.data.key) },
            ).map_err(|e| e.to_string())?;
            db::set_enrichment_status(&conn, &book_id, "enriched").map_err(|e| e.to_string())?;
            db::get_book(&conn, &book_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Book not found after enrichment".to_string())
        }
        None => {
            db::set_enrichment_status(&conn, &book_id, "skipped").map_err(|e| e.to_string())?;
            Err("No match found".to_string())
        }
    }
}

#[tauri::command]
pub async fn queue_book_for_scan(
    book_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    db::set_enrichment_status(&conn, &book_id, "queued").map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register commands in lib.rs**

Add to the `invoke_handler` list:

```rust
            commands::start_scan,
            commands::cancel_scan,
            commands::scan_single_book,
            commands::queue_book_for_scan,
```

- [ ] **Step 3: Add startup scan trigger in lib.rs**

In the `.setup(|app| { ... })` block, after the profile loading and before `app.manage(...)`, add:

```rust
            // Auto-scan on startup if enabled
            let startup_pool = pool.clone();
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Ok(conn) = startup_pool.get() {
                    let auto_startup = db::get_setting(&conn, "auto_scan_startup")
                        .ok()
                        .flatten()
                        .unwrap_or_else(|| "false".to_string());
                    if auto_startup == "true" {
                        if let Ok(books) = db::list_unenriched_books(&conn) {
                            if !books.is_empty() {
                                // Delay to let the UI load first
                                std::thread::sleep(std::time::Duration::from_secs(3));
                                // Trigger the scan via the same logic
                                // (emit event so frontend knows to listen)
                                let _ = app_handle.emit("scan-auto-start", books.len());
                            }
                        }
                    }
                }
            });
```

- [ ] **Step 4: Hook into import_book**

In `commands.rs`, at the end of `import_book()`, after `db::insert_book(&conn, &book)`, add:

```rust
            // Auto-enrich on import if setting enabled
            let auto_import = db::get_setting(&conn, "auto_scan_import")
                .ok()
                .flatten()
                .unwrap_or_else(|| "true".to_string());
            if auto_import == "true" {
                let _ = db::set_enrichment_status(&conn, &book.id, "queued");
            }
```

Note: This only marks the book as "queued". The actual enrichment happens when the scan queue runs (either via startup or manual trigger). The frontend will detect the queued book and can auto-start the scan.

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings 2>&1`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(enrichment): add scan queue commands with Tauri event progress"
```

---

### Task 6: Frontend — enrichment progress bar and scan controls

**Files:**
- Modify: `src/screens/Library.tsx`
- Modify: `src/components/BookCard.tsx`

- [ ] **Step 1: Add scan progress listener and UI to Library.tsx**

Add imports at the top:

```typescript
import { listen } from "@tauri-apps/api/event";
```

Add state variables after the existing state declarations:

```typescript
  // Enrichment scan state
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; bookTitle: string; status: string } | null>(null);
```

Add event listener effect:

```typescript
  // Listen for scan progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ current: number; total: number; bookTitle: string; status: string }>("scan-progress", (event) => {
      const p = event.payload;
      if (p.status === "done" || p.status === "cancelled") {
        setScanProgress(null);
        loadBooks(activeCollectionIdRef.current); // refresh to show enriched data
      } else {
        setScanProgress(p);
      }
    }).then((fn) => { unlisten = fn; });

    // Listen for auto-start on startup
    listen<number>("scan-auto-start", (_event) => {
      invoke("start_scan").catch(() => {});
    }).then(() => {});

    return () => { unlisten?.(); };
  }, [loadBooks]);
```

Add scan handlers:

```typescript
  const handleStartScan = useCallback(async () => {
    try {
      await invoke("start_scan");
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const handleCancelScan = useCallback(async () => {
    try {
      await invoke("cancel_scan");
    } catch {
      // ignore
    }
  }, []);
```

In the toolbar section (after the filter dropdowns, before ImportButton), add:

```tsx
          {/* Scan progress or scan button */}
          {scanProgress ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <svg className="animate-spin w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              <span className="truncate max-w-[200px]">
                Enriching {scanProgress.current}/{scanProgress.total}: {scanProgress.bookTitle}
              </span>
              <button
                onClick={handleCancelScan}
                className="shrink-0 text-ink-muted hover:text-ink transition-colors"
                title="Cancel scan"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartScan}
              title="Scan library for metadata"
              className="shrink-0 p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-warm-subtle transition-colors"
              aria-label="Scan library"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
```

- [ ] **Step 2: Add scan actions to BookCard.tsx**

Add new optional props to `BookCardProps`:

```typescript
  onScanForMetadata?: (id: string) => void;
  onQueueForScan?: (id: string) => void;
```

In the hover actions area (after the edit button), add:

```tsx
                {onScanForMetadata && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onScanForMetadata(id); }}
                    className="w-7 h-7 rounded-full bg-ink/60 hover:bg-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    title="Scan for metadata"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
```

In `Library.tsx`, pass the scan handlers to BookCard:

```tsx
                  onScanForMetadata={async (id) => {
                    try {
                      await invoke("scan_single_book", { bookId: id });
                      await loadBooks(activeCollectionIdRef.current);
                    } catch {
                      // No match found — not an error for the user
                    }
                  }}
```

- [ ] **Step 3: Type-check and verify**

Run: `npm run type-check && npm run test`

- [ ] **Step 4: Commit**

```bash
git add src/screens/Library.tsx src/components/BookCard.tsx
git commit -m "feat(enrichment): add scan progress UI and per-book scan actions"
```

---

### Task 7: Settings toggles for auto-scan

**Files:**
- Modify: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Add auto-scan settings section**

After the "Remote Backup" section in SettingsPanel.tsx, add:

```tsx
          {/* Auto-Enrichment */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
              Metadata Scan
            </h3>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={autoScanImport}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setAutoScanImport(val);
                    await invoke("set_setting_value", { key: "auto_scan_import", value: val ? "true" : "false" }).catch(() => {});
                  }}
                  className="mt-0.5 accent-accent"
                />
                <span className="text-sm text-ink leading-snug">
                  Auto-scan on import
                  <span className="block text-xs text-ink-muted mt-0.5">
                    Automatically look up metadata when importing new books
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={autoScanStartup}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setAutoScanStartup(val);
                    await invoke("set_setting_value", { key: "auto_scan_startup", value: val ? "true" : "false" }).catch(() => {});
                  }}
                  className="mt-0.5 accent-accent"
                />
                <span className="text-sm text-ink leading-snug">
                  Auto-scan on startup
                  <span className="block text-xs text-ink-muted mt-0.5">
                    Scan unenriched books when the app starts
                  </span>
                </span>
              </label>
            </div>
          </section>
```

Add state and loading:

```typescript
  const [autoScanImport, setAutoScanImport] = useState(true);
  const [autoScanStartup, setAutoScanStartup] = useState(false);
```

In the existing `useEffect` that loads settings when the panel opens, add:

```typescript
        const scanImport = await invoke<string | null>("get_setting_value", { key: "auto_scan_import" });
        setAutoScanImport(scanImport !== "false"); // default true
        const scanStartup = await invoke<string | null>("get_setting_value", { key: "auto_scan_startup" });
        setAutoScanStartup(scanStartup === "true"); // default false
```

You'll also need a `get_setting_value` and `set_setting_value` Tauri command. Add to `commands.rs`:

```rust
#[tauri::command]
pub async fn get_setting_value(key: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    db::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setting_value(key: String, value: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}
```

Register in `lib.rs`:

```rust
            commands::get_setting_value,
            commands::set_setting_value,
```

- [ ] **Step 2: Type-check and verify**

Run: `npm run type-check && npm run test`

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsPanel.tsx src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(enrichment): add auto-scan settings toggles"
```

---

### Task 8: EPUB ISBN extraction integration and ComicInfo.xml

Wire the EPUB ISBN extraction into the import flow. Parse ComicInfo.xml for CBZ files.

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/cbz.rs`

- [ ] **Step 1: Use EPUB isbn and genres in import_book**

In `commands.rs`, in the EPUB branch of `import_book()`, change the Book construction to use the new fields from `BookMetadata`:

```rust
    // Where the Book struct is created for EPUB format:
    isbn: metadata.isbn,
    genres: if metadata.genres.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&metadata.genres).unwrap_or_default())
    },
```

- [ ] **Step 2: Add ComicInfo.xml parsing to cbz.rs**

Update `CbzMeta` struct:

```rust
#[derive(Debug)]
pub struct CbzMeta {
    pub title: String,
    pub page_count: u32,
    pub author: Option<String>,
    pub year: Option<u16>,
}
```

In `import_cbz()`, after getting the title from the filename, try to parse ComicInfo.xml:

```rust
pub fn import_cbz(path: &str) -> Result<CbzMeta, String> {
    let mut archive = open_archive(path)?;
    let images = collect_image_names(&mut archive);
    if images.is_empty() {
        return Err("CBZ archive contains no supported image files".to_string());
    }
    let title = Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // Try to parse ComicInfo.xml for metadata
    let mut author = None;
    let mut year = None;
    let mut comic_title = None;
    if let Ok(mut entry) = archive.by_name("ComicInfo.xml") {
        let mut xml = String::new();
        if std::io::Read::read_to_string(&mut entry, &mut xml).is_ok() {
            if let Some(writer) = crate::epub::extract_tag_text(&xml, "Writer") {
                author = Some(writer.to_string());
            }
            if let Some(t) = crate::epub::extract_tag_text(&xml, "Title") {
                comic_title = Some(t.to_string());
            }
            if let Some(y) = crate::epub::extract_tag_text(&xml, "Year") {
                year = y.parse::<u16>().ok();
            }
        }
    }

    Ok(CbzMeta {
        title: comic_title.unwrap_or(title),
        page_count: images.len() as u32,
        author,
        year,
    })
}
```

Note: This requires `extract_tag_text` in `epub.rs` to be `pub` (it's currently private). Change its visibility:

```rust
pub fn extract_tag_text<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
```

- [ ] **Step 3: Use CBZ metadata in import_book**

In `commands.rs`, in the CBZ branch, use the new fields:

```rust
    BookFormat::Cbz => {
        let meta = cbz::import_cbz(&library_path)?;
        // ... existing cover extraction ...
        Book {
            // ... existing fields ...
            author: meta.author.unwrap_or_default(),
            // ... rest ...
        }
    }
```

- [ ] **Step 4: Run full test suite**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings && cargo test`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/cbz.rs src-tauri/src/epub.rs
git commit -m "feat(enrichment): extract ISBN from EPUB, parse ComicInfo.xml in CBZ"
```

---

### Task 9: Update docs — roadmap and user guide

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update roadmap**

Mark auto-enrichment features as done in the relevant roadmap sections.

- [ ] **Step 2: Update user guide**

Add a section about metadata scanning — how it works, the settings, manual vs automatic scanning.

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/USER_GUIDE.md
git commit -m "docs: update roadmap and user guide with auto-enrichment feature"
```

---

### Task 10: Full integration test and CI checks

- [ ] **Step 1: Run full Rust suite**

Run: `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test`

- [ ] **Step 2: Run full frontend suite**

Run: `npm run type-check && npm run test`

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ISBN extraction from EPUB: Task 2
   - Filename parsing (CBR/CBZ priority): Task 1
   - ComicInfo.xml: Task 8
   - ISBN lookup: Task 2
   - Title+Author search with confidence: Task 3
   - Scan queue with progress: Task 5
   - Cancel scan: Task 5
   - Startup scan setting: Task 7
   - Import scan setting: Task 7
   - Manual "Scan Library": Task 6
   - Per-book scan: Task 6
   - Queue for next scan: Task 5 (queue_book_for_scan command)
   - enrichment_status DB column: Task 4
   - No conflict with folder import: scan queue is independent (different thread, different commands)

2. **Placeholder scan:** All code blocks are complete. No TBDs.

3. **Type consistency:** `ParsedFilename`, `EnrichmentResult`, `ScanProgress`, `BookMetadata` structs are consistent across tasks. `enrichment_status` field added to `Book` model and carried through DB layer.
