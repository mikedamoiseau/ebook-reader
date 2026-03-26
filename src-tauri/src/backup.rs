use opendal::blocking::Operator;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    S3,
    Ftp,
    Webdav,
    Fs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigField {
    pub key: String,
    pub label: String,
    pub field_type: String,
    pub required: bool,
    pub placeholder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub provider_type: ProviderType,
    pub label: String,
    pub fields: Vec<ConfigField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub provider_type: ProviderType,
    pub values: std::collections::HashMap<String, String>,
}

pub fn provider_schemas() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            provider_type: ProviderType::S3,
            label: "Amazon S3".to_string(),
            fields: vec![
                ConfigField {
                    key: "bucket".into(),
                    label: "Bucket".into(),
                    field_type: "text".into(),
                    required: true,
                    placeholder: "my-folio-backups".into(),
                },
                ConfigField {
                    key: "region".into(),
                    label: "Region".into(),
                    field_type: "text".into(),
                    required: true,
                    placeholder: "us-east-1".into(),
                },
                ConfigField {
                    key: "access_key_id".into(),
                    label: "Access Key ID".into(),
                    field_type: "password".into(),
                    required: true,
                    placeholder: "".into(),
                },
                ConfigField {
                    key: "secret_access_key".into(),
                    label: "Secret Access Key".into(),
                    field_type: "password".into(),
                    required: true,
                    placeholder: "".into(),
                },
                ConfigField {
                    key: "root".into(),
                    label: "Path prefix".into(),
                    field_type: "text".into(),
                    required: false,
                    placeholder: "/folio-backup".into(),
                },
            ],
        },
        ProviderInfo {
            provider_type: ProviderType::Ftp,
            label: "FTP Server".to_string(),
            fields: vec![
                ConfigField {
                    key: "endpoint".into(),
                    label: "Server".into(),
                    field_type: "text".into(),
                    required: true,
                    placeholder: "ftp.example.com".into(),
                },
                ConfigField {
                    key: "user".into(),
                    label: "Username".into(),
                    field_type: "text".into(),
                    required: false,
                    placeholder: "anonymous".into(),
                },
                ConfigField {
                    key: "password".into(),
                    label: "Password".into(),
                    field_type: "password".into(),
                    required: false,
                    placeholder: "".into(),
                },
                ConfigField {
                    key: "root".into(),
                    label: "Remote path".into(),
                    field_type: "text".into(),
                    required: false,
                    placeholder: "/folio-backup".into(),
                },
            ],
        },
        ProviderInfo {
            provider_type: ProviderType::Webdav,
            label: "WebDAV (Nextcloud, etc.)".to_string(),
            fields: vec![
                ConfigField {
                    key: "endpoint".into(),
                    label: "URL".into(),
                    field_type: "text".into(),
                    required: true,
                    placeholder: "https://cloud.example.com/remote.php/dav/files/user/".into(),
                },
                ConfigField {
                    key: "username".into(),
                    label: "Username".into(),
                    field_type: "text".into(),
                    required: true,
                    placeholder: "".into(),
                },
                ConfigField {
                    key: "password".into(),
                    label: "Password".into(),
                    field_type: "password".into(),
                    required: true,
                    placeholder: "".into(),
                },
                ConfigField {
                    key: "root".into(),
                    label: "Remote path".into(),
                    field_type: "text".into(),
                    required: false,
                    placeholder: "/folio-backup".into(),
                },
            ],
        },
    ]
}

/// Build a blocking OpenDAL operator from a BackupConfig.
///
/// The blocking::Operator wraps the async Operator and requires a tokio runtime
/// to be active. In tests we spin up a dedicated runtime; in Tauri commands
/// the Tauri runtime satisfies this requirement.
pub fn build_operator(config: &BackupConfig) -> Result<Operator, String> {
    // Helper: enter the current tokio handle if one exists, otherwise spin up a
    // temporary single-threaded runtime so that blocking::Operator::new succeeds
    // from any context (including unit tests with no ambient runtime).
    fn make_blocking(async_op: opendal::Operator) -> Result<Operator, String> {
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            let _guard = handle.enter();
            Operator::new(async_op).map_err(|e| format!("Failed to create blocking operator: {e}"))
        } else {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| format!("Failed to build tokio runtime: {e}"))?;
            let _guard = rt.enter();
            let op = Operator::new(async_op)
                .map_err(|e| format!("Failed to create blocking operator: {e}"))?;
            // Leak the runtime so the handle stays valid for the lifetime of the
            // returned operator (acceptable for desktop-app / test usage).
            std::mem::forget(rt);
            Ok(op)
        }
    }

    match config.provider_type {
        ProviderType::S3 => {
            let mut builder = opendal::services::S3::default();
            if let Some(v) = config.values.get("bucket") {
                builder = builder.bucket(v);
            }
            if let Some(v) = config.values.get("region") {
                builder = builder.region(v);
            }
            if let Some(v) = config.values.get("access_key_id") {
                builder = builder.access_key_id(v);
            }
            if let Some(v) = config.values.get("secret_access_key") {
                builder = builder.secret_access_key(v);
            }
            if let Some(v) = config.values.get("root") {
                if !v.is_empty() {
                    builder = builder.root(v);
                }
            }
            let async_op = opendal::Operator::new(builder)
                .map(|b| b.finish())
                .map_err(|e| format!("Failed to create S3 operator: {e}"))?;
            make_blocking(async_op)
        }
        ProviderType::Ftp => {
            let mut builder = opendal::services::Ftp::default();
            if let Some(v) = config.values.get("endpoint") {
                builder = builder.endpoint(v);
            }
            if let Some(v) = config.values.get("user") {
                builder = builder.user(v);
            }
            if let Some(v) = config.values.get("password") {
                builder = builder.password(v);
            }
            if let Some(v) = config.values.get("root") {
                if !v.is_empty() {
                    builder = builder.root(v);
                }
            }
            let async_op = opendal::Operator::new(builder)
                .map(|b| b.finish())
                .map_err(|e| format!("Failed to create FTP operator: {e}"))?;
            make_blocking(async_op)
        }
        ProviderType::Webdav => {
            let mut builder = opendal::services::Webdav::default();
            if let Some(v) = config.values.get("endpoint") {
                builder = builder.endpoint(v);
            }
            if let Some(v) = config.values.get("username") {
                builder = builder.username(v);
            }
            if let Some(v) = config.values.get("password") {
                builder = builder.password(v);
            }
            if let Some(v) = config.values.get("root") {
                if !v.is_empty() {
                    builder = builder.root(v);
                }
            }
            let async_op = opendal::Operator::new(builder)
                .map(|b| b.finish())
                .map_err(|e| format!("Failed to create WebDAV operator: {e}"))?;
            make_blocking(async_op)
        }
        ProviderType::Fs => {
            let mut builder = opendal::services::Fs::default();
            if let Some(v) = config.values.get("root") {
                builder = builder.root(v);
            }
            let async_op = opendal::Operator::new(builder)
                .map(|b| b.finish())
                .map_err(|e| format!("Failed to create FS operator: {e}"))?;
            make_blocking(async_op)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncManifest {
    pub last_sync_at: i64,
    pub device_id: String,
}

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

pub fn read_manifest(op: &Operator) -> SyncManifest {
    match op.read("manifest.json") {
        Ok(data) => serde_json::from_slice(&data.to_vec()).unwrap_or_default(),
        Err(_) => SyncManifest::default(),
    }
}

pub fn write_manifest(op: &Operator, manifest: &SyncManifest) -> Result<(), String> {
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    op.write("manifest.json", json.into_bytes())
        .map(|_| ())
        .map_err(|e| format!("Failed to write manifest: {e}"))
}

pub fn push_json(op: &Operator, path: &str, data: &impl Serialize) -> Result<(), String> {
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    op.write(path, json.into_bytes())
        .map(|_| ())
        .map_err(|e| format!("Failed to write {path}: {e}"))
}

pub fn pull_json<T: serde::de::DeserializeOwned>(op: &Operator, path: &str) -> Result<T, String> {
    let data = op
        .read(path)
        .map_err(|e| format!("Failed to read {path}: {e}"))?;
    serde_json::from_slice(&data.to_vec()).map_err(|e| format!("Failed to parse {path}: {e}"))
}

pub fn push_file_if_missing(
    op: &Operator,
    remote_path: &str,
    local_path: &str,
) -> Result<bool, String> {
    if op.stat(remote_path).is_ok() {
        return Ok(false);
    }
    let data = std::fs::read(local_path).map_err(|e| format!("Cannot read {local_path}: {e}"))?;
    op.write(remote_path, data)
        .map_err(|e| format!("Failed to upload {remote_path}: {e}"))?;
    Ok(true)
}

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

    // Books
    let books: Vec<crate::models::Book> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, author, file_path, cover_path, total_chapters, added_at, format, file_hash, description, genres, rating, isbn, openlibrary_key FROM books WHERE updated_at > ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![since], |row| {
                let format_str: String = row.get(7)?;
                Ok(crate::models::Book {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    author: row.get(2)?,
                    file_path: row.get(3)?,
                    cover_path: row.get(4)?,
                    total_chapters: row.get(5)?,
                    added_at: row.get(6)?,
                    format: format_str
                        .parse()
                        .unwrap_or(crate::models::BookFormat::Epub),
                    file_hash: row.get(8)?,
                    description: row.get(9)?,
                    genres: row.get(10)?,
                    rating: row.get(11)?,
                    isbn: row.get(12)?,
                    openlibrary_key: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !books.is_empty() {
        result.books_pushed = books.len() as u32;
        push_json(op, "metadata/books.json", &books)?;
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
        let mut stmt = conn
            .prepare(
                "SELECT book_id, chapter_index, scroll_position, last_read_at FROM reading_progress WHERE last_read_at > ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![since], |row| {
                Ok(crate::models::ReadingProgress {
                    book_id: row.get(0)?,
                    chapter_index: row.get(1)?,
                    scroll_position: row.get(2)?,
                    last_read_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !progress.is_empty() {
        result.progress_pushed = progress.len() as u32;
        push_json(op, "metadata/progress.json", &progress)?;
    }

    // Bookmarks
    let bookmarks: Vec<crate::models::Bookmark> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, chapter_index, scroll_position, note, created_at FROM bookmarks WHERE updated_at > ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![since], |row| {
                Ok(crate::models::Bookmark {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    chapter_index: row.get(2)?,
                    scroll_position: row.get(3)?,
                    note: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !bookmarks.is_empty() {
        result.bookmarks_pushed = bookmarks.len() as u32;
        push_json(op, "metadata/bookmarks.json", &bookmarks)?;
    }

    // Highlights
    let highlights: Vec<crate::models::Highlight> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, chapter_index, text, color, note, start_offset, end_offset, created_at FROM highlights WHERE updated_at > ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![since], |row| {
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
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !highlights.is_empty() {
        result.highlights_pushed = highlights.len() as u32;
        push_json(op, "metadata/highlights.json", &highlights)?;
    }

    // Collections (always push full set)
    let collections = crate::db::list_collections(conn).map_err(|e| e.to_string())?;
    if !collections.is_empty() {
        result.collections_pushed = collections.len() as u32;
        push_json(op, "metadata/collections.json", &collections)?;
    }

    manifest.last_sync_at = now;
    if manifest.device_id.is_empty() {
        manifest.device_id = uuid::Uuid::new_v4().to_string();
    }
    write_manifest(op, &manifest)?;

    Ok(result)
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
        assert!(build_operator(&config).is_ok());
    }

    #[test]
    fn build_s3_operator_succeeds_with_config() {
        let config = BackupConfig {
            provider_type: ProviderType::S3,
            values: [
                ("bucket".to_string(), "test-bucket".to_string()),
                ("region".to_string(), "us-east-1".to_string()),
                ("access_key_id".to_string(), "AKID".to_string()),
                ("secret_access_key".to_string(), "SECRET".to_string()),
            ]
            .into(),
        };
        assert!(build_operator(&config).is_ok());
    }

    #[test]
    fn manifest_roundtrip_via_fs_operator() {
        let dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [("root".to_string(), dir.path().to_string_lossy().to_string())].into(),
        };
        let op = build_operator(&config).unwrap();
        let m = read_manifest(&op);
        assert_eq!(m.last_sync_at, 0);
        let m2 = SyncManifest {
            last_sync_at: 12345,
            device_id: "dev1".into(),
        };
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
        let local = dir.path().join("local.txt");
        std::fs::write(&local, b"hello").unwrap();
        let local_str = local.to_string_lossy().to_string();
        assert!(push_file_if_missing(&op, "remote.txt", &local_str).unwrap());
        assert!(!push_file_if_missing(&op, "remote.txt", &local_str).unwrap());
    }

    #[test]
    fn incremental_backup_with_fs_operator() {
        let remote_dir = tempfile::tempdir().unwrap();
        let config = BackupConfig {
            provider_type: ProviderType::Fs,
            values: [(
                "root".to_string(),
                remote_dir.path().to_string_lossy().to_string(),
            )]
            .into(),
        };
        let op = build_operator(&config).unwrap();
        let db_dir = tempfile::tempdir().unwrap();
        let conn = crate::db::init_db(db_dir.path().join("test.db").as_path()).unwrap();
        conn.execute(
            "INSERT INTO books (id, title, author, file_path, total_chapters, added_at, format, updated_at) VALUES ('b1', 'Test Book', 'Author', '/nonexistent.epub', 5, 100, 'epub', 100)",
            [],
        )
        .unwrap();
        let result = run_incremental_backup(&op, &conn).unwrap();
        assert_eq!(result.books_pushed, 1);
        let remote_books: Vec<crate::models::Book> = pull_json(&op, "metadata/books.json").unwrap();
        assert_eq!(remote_books.len(), 1);
        assert_eq!(remote_books[0].title, "Test Book");
        let manifest = read_manifest(&op);
        assert!(manifest.last_sync_at > 0);
        let result2 = run_incremental_backup(&op, &conn).unwrap();
        assert_eq!(result2.books_pushed, 0);
    }
}
