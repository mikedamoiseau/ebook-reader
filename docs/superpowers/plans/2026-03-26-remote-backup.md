# Remote Backup with Incremental Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incremental remote backup of library data to S3, FTP, or WebDAV using OpenDAL, with a dynamic settings UI per provider.

**Architecture:** OpenDAL's `Operator` provides a unified file API across all storage backends. The sync engine sits above it — collects entities modified since last sync, serializes them as JSON, and uploads to remote paths. Book files are uploaded by content hash for deduplication. Each provider's config is stored as a JSON blob in the SQLite `settings` table. The frontend renders a dynamic form based on the provider's config schema.

**Tech Stack:** Rust (OpenDAL, serde_json, rusqlite), React 19 (TypeScript), Tauri v2 IPC.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/Cargo.toml` | Modify | Add `opendal` with feature flags |
| `src-tauri/src/backup.rs` | Create | Sync engine: provider setup, incremental push/pull, manifest tracking |
| `src-tauri/src/lib.rs` | Modify | Register `backup` module and new Tauri commands |
| `src-tauri/src/commands.rs` | Modify | New commands: `get_backup_providers`, `save_backup_config`, `run_backup`, `run_restore`, `get_backup_status`, `list_remote_backups` |
| `src-tauri/src/db.rs` | Modify | Add `updated_at` column to tables that lack it (books, bookmarks, highlights) |
| `src/components/SettingsPanel.tsx` | Modify | Remote backup section: provider dropdown, dynamic config form, backup/restore buttons |

---

### Task 1: Add `updated_at` tracking to all entity tables

For incremental sync to work, every entity needs a timestamp we can compare against `last_sync_at`. Currently only `collections` has `updated_at`. We need it on `books`, `bookmarks`, and `highlights` too. (`reading_progress` already has `last_read_at` which serves the same purpose.)

**Files:**
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Write tests for updated_at columns**

Add to the existing `#[cfg(test)] mod tests` block in `db.rs`:

```rust
#[test]
fn test_books_have_updated_at() {
    let dir = tempfile::tempdir().unwrap();
    let conn = init_db(dir.path().join("test.db").as_path()).unwrap();
    // Verify the column exists by querying it
    let result: i64 = conn
        .query_row(
            "SELECT updated_at FROM books LIMIT 0",
            [],
            |_row| Ok(0i64),
        )
        .unwrap_or_else(|_| {
            // Table is empty, but column must exist — try inserting and reading
            conn.execute(
                "INSERT INTO books (id, title, author, file_path, total_chapters, added_at, format, updated_at) VALUES ('t1', 'T', 'A', '/t', 0, 100, 'epub', 100)",
                [],
            ).unwrap();
            conn.query_row("SELECT updated_at FROM books WHERE id = 't1'", [], |row| row.get(0)).unwrap()
        });
    assert_eq!(result, 100);
}

#[test]
fn test_bookmarks_have_updated_at() {
    let dir = tempfile::tempdir().unwrap();
    let conn = init_db(dir.path().join("test.db").as_path()).unwrap();
    conn.execute(
        "INSERT INTO books (id, title, author, file_path, total_chapters, added_at, format, updated_at) VALUES ('b1', 'T', 'A', '/t', 0, 100, 'epub', 100)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO bookmarks (id, book_id, chapter_index, scroll_position, created_at, updated_at) VALUES ('bm1', 'b1', 0, 0.0, 100, 100)",
        [],
    ).unwrap();
    let val: i64 = conn.query_row("SELECT updated_at FROM bookmarks WHERE id = 'bm1'", [], |row| row.get(0)).unwrap();
    assert_eq!(val, 100);
}

#[test]
fn test_highlights_have_updated_at() {
    let dir = tempfile::tempdir().unwrap();
    let conn = init_db(dir.path().join("test.db").as_path()).unwrap();
    conn.execute(
        "INSERT INTO books (id, title, author, file_path, total_chapters, added_at, format, updated_at) VALUES ('b1', 'T', 'A', '/t', 0, 100, 'epub', 100)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO highlights (id, book_id, chapter_index, text, color, start_offset, end_offset, created_at, updated_at) VALUES ('h1', 'b1', 0, 'hi', '#fff', 0, 2, 100, 100)",
        [],
    ).unwrap();
    let val: i64 = conn.query_row("SELECT updated_at FROM highlights WHERE id = 'h1'", [], |row| row.get(0)).unwrap();
    assert_eq!(val, 100);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_books_have_updated_at test_bookmarks_have_updated_at test_highlights_have_updated_at -- --nocapture 2>&1`

Expected: FAIL — columns don't exist yet.

- [ ] **Step 3: Add schema migrations for updated_at columns**

In `db.rs`, inside `run_schema()`, after the existing OpenLibrary enrichment migrations, add:

```rust
    // Incremental backup: ensure updated_at columns exist
    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;");
    let _ = conn.execute_batch("ALTER TABLE bookmarks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;");
    let _ = conn.execute_batch("ALTER TABLE highlights ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;");
    // Backfill: set updated_at = added_at or created_at for existing rows
    let _ = conn.execute_batch("UPDATE books SET updated_at = added_at WHERE updated_at = 0;");
    let _ = conn.execute_batch("UPDATE bookmarks SET updated_at = created_at WHERE updated_at = 0;");
    let _ = conn.execute_batch("UPDATE highlights SET updated_at = created_at WHERE updated_at = 0;");
```

Also update `insert_book` to set `updated_at` to `book.added_at` (add it to the INSERT statement — add `updated_at` as the 15th column, using `book.added_at` as the value).

Update `insert_bookmark` to set `updated_at = bookmark.created_at`.

Update `insert_highlight` to set `updated_at = highlight.created_at`.

Update `update_book` to set `updated_at` to the current Unix timestamp.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_books_have_updated_at test_bookmarks_have_updated_at test_highlights_have_updated_at -- --nocapture 2>&1`

Expected: PASS

- [ ] **Step 5: Run full test suite and commit**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings && cargo test`

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): add updated_at columns for incremental backup sync"
```

---

### Task 2: Add OpenDAL dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add opendal to Cargo.toml**

Add under `[dependencies]`:

```toml
opendal = { version = "0.55", features = ["services-s3", "services-fs", "services-ftp", "services-webdav"] }
```

Note: `services-fs` is included for testing (local filesystem as a "remote" backend).

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1`

Expected: compiles successfully (may take a while first time to download crates).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add opendal dependency for remote backup"
```

---

### Task 3: Create backup module — provider config and operator construction

**Files:**
- Create: `src-tauri/src/backup.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write tests for provider config serialization and operator construction**

Create `src-tauri/src/backup.rs`:

```rust
use opendal::Operator;
use serde::{Deserialize, Serialize};

/// Supported remote backup provider types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    S3,
    Ftp,
    Webdav,
    Fs, // local filesystem — used for testing
}

/// A single config field descriptor for the frontend to render dynamically.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigField {
    pub key: String,
    pub label: String,
    pub field_type: String, // "text", "password", "number"
    pub required: bool,
    pub placeholder: String,
}

/// Full backup provider definition (type + config schema + current values).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub provider_type: ProviderType,
    pub label: String,
    pub fields: Vec<ConfigField>,
}

/// Stored config for the active backup provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub provider_type: ProviderType,
    pub values: std::collections::HashMap<String, String>,
}

/// Returns the config schema for each supported provider.
pub fn provider_schemas() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            provider_type: ProviderType::S3,
            label: "Amazon S3".to_string(),
            fields: vec![
                ConfigField { key: "bucket".into(), label: "Bucket".into(), field_type: "text".into(), required: true, placeholder: "my-folio-backups".into() },
                ConfigField { key: "region".into(), label: "Region".into(), field_type: "text".into(), required: true, placeholder: "us-east-1".into() },
                ConfigField { key: "access_key_id".into(), label: "Access Key ID".into(), field_type: "password".into(), required: true, placeholder: "".into() },
                ConfigField { key: "secret_access_key".into(), label: "Secret Access Key".into(), field_type: "password".into(), required: true, placeholder: "".into() },
                ConfigField { key: "root".into(), label: "Path prefix".into(), field_type: "text".into(), required: false, placeholder: "/folio-backup".into() },
            ],
        },
        ProviderInfo {
            provider_type: ProviderType::Ftp,
            label: "FTP Server".to_string(),
            fields: vec![
                ConfigField { key: "endpoint".into(), label: "Server".into(), field_type: "text".into(), required: true, placeholder: "ftp.example.com".into() },
                ConfigField { key: "user".into(), label: "Username".into(), field_type: "text".into(), required: false, placeholder: "anonymous".into() },
                ConfigField { key: "password".into(), label: "Password".into(), field_type: "password".into(), required: false, placeholder: "".into() },
                ConfigField { key: "root".into(), label: "Remote path".into(), field_type: "text".into(), required: false, placeholder: "/folio-backup".into() },
            ],
        },
        ProviderInfo {
            provider_type: ProviderType::Webdav,
            label: "WebDAV (Nextcloud, etc.)".to_string(),
            fields: vec![
                ConfigField { key: "endpoint".into(), label: "URL".into(), field_type: "text".into(), required: true, placeholder: "https://cloud.example.com/remote.php/dav/files/user/".into() },
                ConfigField { key: "username".into(), label: "Username".into(), field_type: "text".into(), required: true, placeholder: "".into() },
                ConfigField { key: "password".into(), label: "Password".into(), field_type: "password".into(), required: true, placeholder: "".into() },
                ConfigField { key: "root".into(), label: "Remote path".into(), field_type: "text".into(), required: false, placeholder: "/folio-backup".into() },
            ],
        },
    ]
}

/// Build an OpenDAL Operator from a BackupConfig.
pub fn build_operator(config: &BackupConfig) -> Result<Operator, String> {
    match config.provider_type {
        ProviderType::S3 => {
            let mut builder = opendal::services::S3::default();
            if let Some(v) = config.values.get("bucket") { builder = builder.bucket(v); }
            if let Some(v) = config.values.get("region") { builder = builder.region(v); }
            if let Some(v) = config.values.get("access_key_id") { builder = builder.access_key_id(v); }
            if let Some(v) = config.values.get("secret_access_key") { builder = builder.secret_access_key(v); }
            if let Some(v) = config.values.get("root") {
                if !v.is_empty() { builder = builder.root(v); }
            }
            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| format!("Failed to create S3 operator: {e}"))
        }
        ProviderType::Ftp => {
            let mut builder = opendal::services::Ftp::default();
            if let Some(v) = config.values.get("endpoint") { builder = builder.endpoint(v); }
            if let Some(v) = config.values.get("user") { builder = builder.user(v); }
            if let Some(v) = config.values.get("password") { builder = builder.password(v); }
            if let Some(v) = config.values.get("root") {
                if !v.is_empty() { builder = builder.root(v); }
            }
            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| format!("Failed to create FTP operator: {e}"))
        }
        ProviderType::Webdav => {
            let mut builder = opendal::services::Webdav::default();
            if let Some(v) = config.values.get("endpoint") { builder = builder.endpoint(v); }
            if let Some(v) = config.values.get("username") { builder = builder.username(v); }
            if let Some(v) = config.values.get("password") { builder = builder.password(v); }
            if let Some(v) = config.values.get("root") {
                if !v.is_empty() { builder = builder.root(v); }
            }
            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| format!("Failed to create WebDAV operator: {e}"))
        }
        ProviderType::Fs => {
            let mut builder = opendal::services::Fs::default();
            if let Some(v) = config.values.get("root") { builder = builder.root(v); }
            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| format!("Failed to create FS operator: {e}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_schemas_returns_three_providers() {
        let schemas = provider_schemas();
        assert_eq!(schemas.len(), 3);
        assert_eq!(schemas[0].provider_type, ProviderType::S3);
        assert_eq!(schemas[1].provider_type, ProviderType::Ftp);
        assert_eq!(schemas[2].provider_type, ProviderType::Webdav);
    }

    #[test]
    fn s3_schema_has_required_fields() {
        let schemas = provider_schemas();
        let s3 = &schemas[0];
        let keys: Vec<&str> = s3.fields.iter().map(|f| f.key.as_str()).collect();
        assert!(keys.contains(&"bucket"));
        assert!(keys.contains(&"region"));
        assert!(keys.contains(&"access_key_id"));
        assert!(keys.contains(&"secret_access_key"));
    }

    #[test]
    fn backup_config_serde_roundtrip() {
        let config = BackupConfig {
            provider_type: ProviderType::S3,
            values: [("bucket".to_string(), "test".to_string())].into(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let back: BackupConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.provider_type, ProviderType::S3);
        assert_eq!(back.values.get("bucket").unwrap(), "test");
    }

    #[test]
    fn build_fs_operator_succeeds() {
        let dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [("root".to_string(), dir.path().to_string_lossy().to_string())].into(),
        };
        let op = build_operator(&config);
        assert!(op.is_ok());
    }

    #[test]
    fn build_s3_operator_succeeds_with_config() {
        // This only tests operator construction, not actual S3 connectivity
        let config = BackupConfig {
            provider_type: ProviderType::S3,
            values: [
                ("bucket".to_string(), "test-bucket".to_string()),
                ("region".to_string(), "us-east-1".to_string()),
                ("access_key_id".to_string(), "AKID".to_string()),
                ("secret_access_key".to_string(), "SECRET".to_string()),
            ].into(),
        };
        let op = build_operator(&config);
        assert!(op.is_ok());
    }
}
```

- [ ] **Step 2: Register the module in lib.rs**

In `src-tauri/src/lib.rs`, add after the existing module declarations:

```rust
pub mod backup;
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd src-tauri && cargo fmt && cargo test backup::tests -- --nocapture 2>&1`

Expected: all 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/backup.rs src-tauri/src/lib.rs
git commit -m "feat(backup): add provider config schemas and operator construction"
```

---

### Task 4: Implement the sync engine — manifest, incremental push, incremental pull

This is the core logic. The sync engine:
1. Reads a remote `manifest.json` to get `last_sync_at` timestamps
2. Queries the local DB for entities modified after those timestamps
3. Uploads changed metadata files and any new book files
4. On restore, downloads remote metadata and merges into local DB

**Files:**
- Modify: `src-tauri/src/backup.rs`

- [ ] **Step 1: Write tests for manifest and sync logic using Fs operator**

Add to `backup.rs` after the existing code (before `#[cfg(test)]`):

```rust
/// Manifest tracks the last sync time per entity type.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncManifest {
    pub last_sync_at: i64,
    pub device_id: String,
}

/// Summary returned after a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub books_pushed: u32,
    pub progress_pushed: u32,
    pub bookmarks_pushed: u32,
    pub highlights_pushed: u32,
    pub collections_pushed: u32,
    pub files_pushed: u32,
}

/// Read the remote manifest, or return a default (first sync).
pub fn read_manifest(op: &Operator) -> SyncManifest {
    let result = op.blocking().read("manifest.json");
    match result {
        Ok(data) => serde_json::from_slice(&data.to_vec()).unwrap_or_default(),
        Err(_) => SyncManifest::default(),
    }
}

/// Write the manifest back to remote.
pub fn write_manifest(op: &Operator, manifest: &SyncManifest) -> Result<(), String> {
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    op.blocking()
        .write("manifest.json", json.into_bytes())
        .map_err(|e| format!("Failed to write manifest: {e}"))
}

/// Push a JSON entity file to remote storage.
pub fn push_json(op: &Operator, path: &str, data: &impl Serialize) -> Result<(), String> {
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    op.blocking()
        .write(path, json.into_bytes())
        .map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Read a JSON entity file from remote storage.
pub fn pull_json<T: serde::de::DeserializeOwned>(op: &Operator, path: &str) -> Result<T, String> {
    let data = op.blocking().read(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    serde_json::from_slice(&data.to_vec()).map_err(|e| format!("Failed to parse {path}: {e}"))
}

/// Push a binary file (book or cover) if it doesn't already exist remotely.
pub fn push_file_if_missing(op: &Operator, remote_path: &str, local_path: &str) -> Result<bool, String> {
    // Check if file already exists
    if op.blocking().stat(remote_path).is_ok() {
        return Ok(false);
    }
    let data = std::fs::read(local_path).map_err(|e| format!("Cannot read {local_path}: {e}"))?;
    op.blocking()
        .write(remote_path, data)
        .map_err(|e| format!("Failed to upload {remote_path}: {e}"))?;
    Ok(true)
}

/// Run an incremental backup: push all entities modified since last sync.
pub fn run_incremental_backup(
    op: &Operator,
    conn: &rusqlite::Connection,
) -> Result<SyncResult, String> {
    let mut manifest = read_manifest(op);
    let since = manifest.last_sync_at;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let mut result = SyncResult {
        books_pushed: 0,
        progress_pushed: 0,
        bookmarks_pushed: 0,
        highlights_pushed: 0,
        collections_pushed: 0,
        files_pushed: 0,
    };

    // Books modified since last sync
    let books: Vec<crate::models::Book> = {
        let mut stmt = conn.prepare(
            "SELECT id, title, author, file_path, cover_path, total_chapters, added_at, format, file_hash, description, genres, rating, isbn, openlibrary_key FROM books WHERE updated_at > ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![since], |row| {
            let format_str: String = row.get(7)?;
            Ok(crate::models::Book {
                id: row.get(0)?,
                title: row.get(1)?,
                author: row.get(2)?,
                file_path: row.get(3)?,
                cover_path: row.get(4)?,
                total_chapters: row.get(5)?,
                added_at: row.get(6)?,
                format: format_str.parse().unwrap_or(crate::models::BookFormat::Epub),
                file_hash: row.get(8)?,
                description: row.get(9)?,
                genres: row.get(10)?,
                rating: row.get(11)?,
                isbn: row.get(12)?,
                openlibrary_key: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !books.is_empty() {
        result.books_pushed = books.len() as u32;
        push_json(op, "metadata/books.json", &books)?;

        // Push book files by content hash
        for book in &books {
            if let Some(ref hash) = book.file_hash {
                let ext = std::path::Path::new(&book.file_path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("epub");
                let remote_path = format!("files/{}.{}", hash, ext);
                if push_file_if_missing(op, &remote_path, &book.file_path)? {
                    result.files_pushed += 1;
                }
            }
            // Push cover
            if let Some(ref cover) = book.cover_path {
                let ext = std::path::Path::new(cover)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("jpg");
                let remote_path = format!("covers/{}.{}", book.id, ext);
                let _ = push_file_if_missing(op, &remote_path, cover);
            }
        }
    }

    // Reading progress
    let progress: Vec<crate::models::ReadingProgress> = {
        let mut stmt = conn.prepare(
            "SELECT book_id, chapter_index, scroll_position, last_read_at FROM reading_progress WHERE last_read_at > ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![since], |row| {
            Ok(crate::models::ReadingProgress {
                book_id: row.get(0)?,
                chapter_index: row.get(1)?,
                scroll_position: row.get(2)?,
                last_read_at: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !progress.is_empty() {
        result.progress_pushed = progress.len() as u32;
        push_json(op, "metadata/progress.json", &progress)?;
    }

    // Bookmarks
    let bookmarks: Vec<crate::models::Bookmark> = {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, chapter_index, scroll_position, note, created_at FROM bookmarks WHERE updated_at > ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![since], |row| {
            Ok(crate::models::Bookmark {
                id: row.get(0)?,
                book_id: row.get(1)?,
                chapter_index: row.get(2)?,
                scroll_position: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !bookmarks.is_empty() {
        result.bookmarks_pushed = bookmarks.len() as u32;
        push_json(op, "metadata/bookmarks.json", &bookmarks)?;
    }

    // Highlights
    let highlights: Vec<crate::models::Highlight> = {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, chapter_index, text, color, note, start_offset, end_offset, created_at FROM highlights WHERE updated_at > ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![since], |row| {
            Ok(crate::models::Highlight {
                id: row.get(0)?,
                book_id: row.get(1)?,
                chapter_index: row.get(2)?,
                text: row.get(3)?,
                color: row.get(4)?,
                note: row.get(5)?,
                start_offset: row.get(6)?,
                end_offset: row.get(7)?,
                created_at: row.get(8)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !highlights.is_empty() {
        result.highlights_pushed = highlights.len() as u32;
        push_json(op, "metadata/highlights.json", &highlights)?;
    }

    // Collections (always push full set — small data, complex relationships)
    let collections = crate::db::list_collections(conn).map_err(|e| e.to_string())?;
    if !collections.is_empty() {
        result.collections_pushed = collections.len() as u32;
        push_json(op, "metadata/collections.json", &collections)?;
    }

    // Update manifest
    manifest.last_sync_at = now;
    if manifest.device_id.is_empty() {
        manifest.device_id = uuid::Uuid::new_v4().to_string();
    }
    write_manifest(op, &manifest)?;

    Ok(result)
}
```

Add these tests to the existing `#[cfg(test)] mod tests`:

```rust
    #[test]
    fn manifest_roundtrip_via_fs_operator() {
        let dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [("root".to_string(), dir.path().to_string_lossy().to_string())].into(),
        };
        let op = build_operator(&config).unwrap();

        // No manifest yet — should return default
        let m = read_manifest(&op);
        assert_eq!(m.last_sync_at, 0);

        // Write and read back
        let m2 = SyncManifest { last_sync_at: 12345, device_id: "dev1".into() };
        write_manifest(&op, &m2).unwrap();
        let m3 = read_manifest(&op);
        assert_eq!(m3.last_sync_at, 12345);
        assert_eq!(m3.device_id, "dev1");
    }

    #[test]
    fn push_and_pull_json() {
        let dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [("root".to_string(), dir.path().to_string_lossy().to_string())].into(),
        };
        let op = build_operator(&config).unwrap();

        let data = vec!["hello", "world"];
        push_json(&op, "test.json", &data).unwrap();
        let back: Vec<String> = pull_json(&op, "test.json").unwrap();
        assert_eq!(back, vec!["hello", "world"]);
    }

    #[test]
    fn push_file_if_missing_uploads_once() {
        let dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [("root".to_string(), dir.path().to_string_lossy().to_string())].into(),
        };
        let op = build_operator(&config).unwrap();

        // Create a local file
        let local = dir.path().join("local.txt");
        std::fs::write(&local, b"hello").unwrap();
        let local_str = local.to_string_lossy().to_string();

        // First push — should upload
        assert!(push_file_if_missing(&op, "remote.txt", &local_str).unwrap());
        // Second push — should skip
        assert!(!push_file_if_missing(&op, "remote.txt", &local_str).unwrap());
    }

    #[test]
    fn incremental_backup_with_fs_operator() {
        let remote_dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [("root".to_string(), remote_dir.path().to_string_lossy().to_string())].into(),
        };
        let op = build_operator(&config).unwrap();

        // Set up a test database
        let db_dir = tempfile::tempdir().unwrap();
        let conn = crate::db::init_db(db_dir.path().join("test.db").as_path()).unwrap();

        // Insert a book
        conn.execute(
            "INSERT INTO books (id, title, author, file_path, total_chapters, added_at, format, updated_at) VALUES ('b1', 'Test Book', 'Author', '/nonexistent.epub', 5, 100, 'epub', 100)",
            [],
        ).unwrap();

        // Run backup
        let result = run_incremental_backup(&op, &conn).unwrap();
        assert_eq!(result.books_pushed, 1);

        // Verify metadata was written
        let remote_books: Vec<crate::models::Book> = pull_json(&op, "metadata/books.json").unwrap();
        assert_eq!(remote_books.len(), 1);
        assert_eq!(remote_books[0].title, "Test Book");

        // Manifest should be updated
        let manifest = read_manifest(&op);
        assert!(manifest.last_sync_at > 0);

        // Run again — nothing changed, so 0 pushed (updated_at hasn't changed)
        let result2 = run_incremental_backup(&op, &conn).unwrap();
        assert_eq!(result2.books_pushed, 0);
    }
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd src-tauri && cargo fmt && cargo test backup::tests -- --nocapture 2>&1`

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/backup.rs
git commit -m "feat(backup): implement sync engine with manifest tracking and incremental push"
```

---

### Task 5: Add Tauri commands for backup operations

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add backup commands to commands.rs**

At the end of `commands.rs`, before the `#[cfg(test)]` block, add:

```rust
// ---- Remote Backup Commands ----

#[tauri::command]
pub async fn get_backup_providers() -> Result<Vec<crate::backup::ProviderInfo>, String> {
    Ok(crate::backup::provider_schemas())
}

#[tauri::command]
pub async fn save_backup_config(
    config: crate::backup::BackupConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "backup_config", &json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_backup_config(
    state: State<'_, AppState>,
) -> Result<Option<crate::backup::BackupConfig>, String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    let json = crate::db::get_setting(&conn, "backup_config").map_err(|e| e.to_string())?;
    match json {
        Some(j) => {
            let config: crate::backup::BackupConfig =
                serde_json::from_str(&j).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn run_backup(state: State<'_, AppState>) -> Result<crate::backup::SyncResult, String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    let json = crate::db::get_setting(&conn, "backup_config")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No backup provider configured".to_string())?;
    let config: crate::backup::BackupConfig =
        serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let op = crate::backup::build_operator(&config)?;

    // Run on a background thread to avoid blocking
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(crate::backup::run_incremental_backup(&op, &conn));
    });
    rx.recv().map_err(|e| format!("Thread error: {e}"))?
}

#[tauri::command]
pub async fn get_backup_status(state: State<'_, AppState>) -> Result<Option<crate::backup::SyncManifest>, String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    let json = match crate::db::get_setting(&conn, "backup_config").map_err(|e| e.to_string())? {
        Some(j) => j,
        None => return Ok(None),
    };
    let config: crate::backup::BackupConfig =
        serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let op = crate::backup::build_operator(&config)?;

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(crate::backup::read_manifest(&op));
    });
    let manifest = rx.recv().map_err(|e| format!("Thread error: {e}"))?;
    Ok(Some(manifest))
}
```

- [ ] **Step 2: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, add before the closing `])`:

```rust
            commands::get_backup_providers,
            commands::save_backup_config,
            commands::get_backup_config,
            commands::run_backup,
            commands::get_backup_status,
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings 2>&1`

Expected: compiles with no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(backup): add Tauri commands for remote backup config and sync"
```

---

### Task 6: Build the remote backup UI in SettingsPanel

**Files:**
- Modify: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Add remote backup section after the existing Backup & Restore section**

Add TypeScript interfaces and state at the top of the component, then render a new section. The UI should:

1. Show a provider dropdown (S3, FTP, WebDAV)
2. Render config fields dynamically from the schema
3. Save config on change
4. Show a "Backup Now" button
5. Show last sync timestamp from the manifest

Add these interfaces near the top of `SettingsPanel.tsx`:

```typescript
interface ConfigField {
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  placeholder: string;
}

interface ProviderInfo {
  providerType: string;
  label: string;
  fields: ConfigField[];
}

interface BackupConfig {
  providerType: string;
  values: Record<string, string>;
}

interface SyncResult {
  booksPushed: number;
  progressPushed: number;
  bookmarksPushed: number;
  highlightsPushed: number;
  collectionsPushed: number;
  filesPushed: number;
}

interface SyncManifest {
  lastSyncAt: number;
  deviceId: string;
}
```

Add state variables inside the component:

```typescript
  // Remote backup state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
```

Add a `useEffect` to load providers and existing config:

```typescript
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const p = await invoke<ProviderInfo[]>("get_backup_providers");
        setProviders(p);
        const cfg = await invoke<BackupConfig | null>("get_backup_config");
        if (cfg) {
          setBackupConfig(cfg);
          setSelectedProvider(cfg.providerType);
          setConfigValues(cfg.values);
        }
        const status = await invoke<SyncManifest | null>("get_backup_status");
        if (status) setLastSync(status.lastSyncAt);
      } catch {
        // non-fatal
      }
    })();
  }, [open]);
```

Add handler functions:

```typescript
  const handleSaveBackupConfig = async () => {
    const config: BackupConfig = { providerType: selectedProvider, values: configValues };
    try {
      await invoke("save_backup_config", { config });
      setBackupConfig(config);
      setSyncMessage("Configuration saved.");
    } catch (err) {
      setSyncMessage(`Error: ${err}`);
    }
  };

  const handleRunBackup = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await invoke<SyncResult>("run_backup");
      const total = result.booksPushed + result.progressPushed + result.bookmarksPushed + result.highlightsPushed + result.filesPushed;
      setSyncMessage(total > 0 ? `Synced ${total} items.` : "Already up to date.");
      const status = await invoke<SyncManifest | null>("get_backup_status");
      if (status) setLastSync(status.lastSyncAt);
    } catch (err) {
      setSyncMessage(`Backup failed: ${err}`);
    } finally {
      setSyncing(false);
    }
  };
```

Add the JSX section after the existing "Backup & Restore" `</section>`:

```tsx
          {/* Remote Backup */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
              Remote Backup
            </h3>
            <div className="space-y-3">
              <select
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setConfigValues({});
                  setSyncMessage(null);
                }}
                className="w-full h-9 px-3 bg-warm-subtle rounded-lg text-sm text-ink border border-transparent focus:border-accent/40 focus:outline-none"
              >
                <option value="">Select a provider…</option>
                {providers.map((p) => (
                  <option key={p.providerType} value={p.providerType}>{p.label}</option>
                ))}
              </select>

              {selectedProvider && providers.find(p => p.providerType === selectedProvider)?.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-ink-muted mb-1">{field.label}{field.required && " *"}</label>
                  <input
                    type={field.fieldType === "password" ? "password" : "text"}
                    value={configValues[field.key] ?? ""}
                    onChange={(e) => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full h-9 px-3 bg-warm-subtle rounded-lg text-sm text-ink placeholder-ink-muted/50 border border-transparent focus:border-accent/40 focus:outline-none"
                  />
                </div>
              ))}

              {selectedProvider && (
                <>
                  <button
                    onClick={handleSaveBackupConfig}
                    className="w-full px-3 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-xl transition-colors"
                  >
                    Save Configuration
                  </button>
                  {backupConfig && (
                    <button
                      onClick={handleRunBackup}
                      disabled={syncing}
                      className="w-full px-3 py-2 text-sm text-ink-muted hover:text-ink bg-warm-subtle hover:bg-warm-border rounded-xl transition-colors disabled:opacity-40"
                    >
                      {syncing ? "Syncing…" : "Backup Now"}
                    </button>
                  )}
                </>
              )}

              {lastSync != null && lastSync > 0 && (
                <p className="text-xs text-ink-muted">
                  Last backup: {new Date(lastSync * 1000).toLocaleString()}
                </p>
              )}
              {syncMessage && (
                <p className="text-xs text-ink-muted">{syncMessage}</p>
              )}
            </div>
          </section>
```

- [ ] **Step 2: Type-check and verify**

Run: `npm run type-check && npm run test`

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsPanel.tsx
git commit -m "feat(backup): add remote backup settings UI with dynamic provider config"
```

---

### Task 7: Full integration test and CI checks

- [ ] **Step 1: Run full Rust test suite**

Run: `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test`

Expected: all pass (70+ existing + new backup tests).

- [ ] **Step 2: Run full frontend checks**

Run: `npm run type-check && npm run test`

Expected: 28 tests pass.

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "feat: remote backup with incremental sync via OpenDAL (S3, FTP, WebDAV)"
git push
```

---

## What's NOT in this plan (Phase 2)

- **Restore from remote** — pulling remote metadata and merging into local DB (reverse of push). The `pull_json` helper is already implemented; the merge logic needs conflict resolution.
- **Dropbox / Google Drive** — require OAuth browser flow via Tauri.
- **Scheduled automatic backup** — background timer that runs sync periodically.
- **Encryption** — encrypting backup data at rest.
- **Book file download on restore** — downloading book files from remote `files/{hash}.{ext}` paths.
