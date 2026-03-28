# Bookmark Naming & Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to name bookmarks at creation time (via expand-in-place toast) and edit names later (inline in bookmarks panel).

**Architecture:** Add a `name` column to bookmarks, a new `update_bookmark` Tauri command, a `BookmarkToast` component with expand-in-place naming, and inline editing in `BookmarksPanel`. TDD for all backend changes; frontend tested via component extraction and manual verification.

**Tech Stack:** Rust (SQLite, Tauri commands), React 19, TypeScript, Tailwind CSS v4

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/models.rs` | Add `name` field to `Bookmark` struct |
| Modify | `src-tauri/src/db.rs` | Schema migration, update `insert_bookmark`/`list_bookmarks`, add `update_bookmark` |
| Modify | `src-tauri/src/commands.rs` | Add `update_bookmark` command, update `add_bookmark` struct init |
| Modify | `src-tauri/src/lib.rs` | Register `update_bookmark` in invoke_handler |
| Create | `src/components/BookmarkToast.tsx` | Toast with expand-in-place naming |
| Modify | `src/components/BookmarksPanel.tsx` | Add `name` to interface, inline editing, display changes |
| Modify | `src/screens/Reader.tsx` | Use `BookmarkToast`, store created bookmark for naming |

---

### Task 1: Add `name` field to Bookmark model

**Files:**
- Modify: `src-tauri/src/models.rs:69-77`

- [ ] **Step 1: Add `name` field to Bookmark struct**

In `src-tauri/src/models.rs`, add `name` between `scroll_position` and `note`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub chapter_index: u32,
    pub scroll_position: f64,
    pub name: Option<String>,
    pub note: Option<String>,
    pub created_at: i64,
}
```

- [ ] **Step 2: Fix all compile errors from the new field**

Run: `cd src-tauri && cargo check 2>&1 | head -50`

This will show errors in `db.rs` (tests and CRUD functions) and `commands.rs` where `Bookmark` structs are constructed without `name`. We'll fix these in subsequent tasks, but note the locations now.

- [ ] **Step 3: Commit model change**

```bash
git add src-tauri/src/models.rs
git commit -m "feat(bookmarks): add name field to Bookmark struct"
```

---

### Task 2: Schema migration and update DB functions (TDD)

**Files:**
- Modify: `src-tauri/src/db.rs:151-164` (migration), `463-501` (CRUD), `1305-1327` (tests)

- [ ] **Step 1: Write failing test for `update_bookmark`**

Add this test after the existing `test_bookmark_crud` test (after line 1327) in `src-tauri/src/db.rs`:

```rust
    #[test]
    fn test_update_bookmark_name() {
        let (_dir, conn) = setup();
        let book = sample_book("book-bm-name");
        insert_book(&conn, &book).unwrap();

        let bookmark = Bookmark {
            id: "bm-name-1".to_string(),
            book_id: "book-bm-name".to_string(),
            chapter_index: 1,
            scroll_position: 0.5,
            name: None,
            note: None,
            created_at: 1700000400,
        };
        insert_bookmark(&conn, &bookmark).unwrap();

        // Verify name is None initially
        let bookmarks = list_bookmarks(&conn, "book-bm-name").unwrap();
        assert_eq!(bookmarks[0].name, None);

        // Update name
        update_bookmark_name(&conn, "bm-name-1", Some("Important passage")).unwrap();
        let bookmarks = list_bookmarks(&conn, "book-bm-name").unwrap();
        assert_eq!(bookmarks[0].name, Some("Important passage".to_string()));

        // Clear name
        update_bookmark_name(&conn, "bm-name-1", None).unwrap();
        let bookmarks = list_bookmarks(&conn, "book-bm-name").unwrap();
        assert_eq!(bookmarks[0].name, None);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_update_bookmark_name -- --nocapture 2>&1 | tail -20`

Expected: compile error — `update_bookmark_name` not found, `Bookmark` missing `name` field in test structs.

- [ ] **Step 3: Add schema migration**

In `src-tauri/src/db.rs`, after the existing `updated_at` migration for bookmarks (after line 152), add:

```rust
    let _ = conn.execute_batch("ALTER TABLE bookmarks ADD COLUMN name TEXT;");
```

- [ ] **Step 4: Update `insert_bookmark` to include `name`**

Replace the `insert_bookmark` function (lines 463-478):

```rust
pub fn insert_bookmark(conn: &Connection, bookmark: &Bookmark) -> Result<()> {
    conn.execute(
        "INSERT INTO bookmarks (id, book_id, chapter_index, scroll_position, name, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            bookmark.id,
            bookmark.book_id,
            bookmark.chapter_index,
            bookmark.scroll_position,
            bookmark.name,
            bookmark.note,
            bookmark.created_at,
            bookmark.created_at,
        ],
    )?;
    Ok(())
}
```

- [ ] **Step 5: Update `list_bookmarks` to read `name`**

Replace the `list_bookmarks` function (lines 480-496):

```rust
pub fn list_bookmarks(conn: &Connection, book_id: &str) -> Result<Vec<Bookmark>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, chapter_index, scroll_position, name, note, created_at
         FROM bookmarks WHERE book_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![book_id], |row| {
        Ok(Bookmark {
            id: row.get(0)?,
            book_id: row.get(1)?,
            chapter_index: row.get(2)?,
            scroll_position: row.get(3)?,
            name: row.get(4)?,
            note: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 6: Add `update_bookmark_name` function**

Add after `delete_bookmark` (after line 501):

```rust
pub fn update_bookmark_name(conn: &Connection, id: &str, name: Option<&str>) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "UPDATE bookmarks SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now, id],
    )?;
    Ok(())
}
```

- [ ] **Step 7: Fix existing test `test_bookmark_crud` — add `name` field**

In the existing `test_bookmark_crud` test (line 1310-1317), add `name: None,` to the Bookmark struct:

```rust
        let bookmark = Bookmark {
            id: "bm-1".to_string(),
            book_id: "book-3".to_string(),
            chapter_index: 2,
            scroll_position: 0.3,
            name: None,
            note: Some("Great quote".to_string()),
            created_at: 1700000200,
        };
```

- [ ] **Step 8: Fix `test_delete_book_cascades_to_related_rows` — add `name` field**

In the cascade test (around line 1335), add `name: None,` to the Bookmark struct:

```rust
        let bookmark = Bookmark {
            id: "bm-cascade".to_string(),
            book_id: "book-cascade".to_string(),
            chapter_index: 1,
            scroll_position: 0.1,
            name: None,
            note: None,
            created_at: 1700000300,
        };
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_bookmark -- --nocapture 2>&1`

Expected: `test_bookmark_crud` and `test_update_bookmark_name` both PASS.

Run: `cd src-tauri && cargo test test_delete_book_cascades -- --nocapture 2>&1`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(bookmarks): add name column, migration, and update_bookmark_name"
```

---

### Task 3: Add `update_bookmark` Tauri command (TDD)

**Files:**
- Modify: `src-tauri/src/commands.rs:949-973`
- Modify: `src-tauri/src/lib.rs:148`

- [ ] **Step 1: Update `add_bookmark` command to include `name` in struct**

In `src-tauri/src/commands.rs`, update the `add_bookmark` command (lines 957-967). Add `name: None,` to the Bookmark struct construction:

```rust
    let bookmark = Bookmark {
        id: Uuid::new_v4().to_string(),
        book_id,
        chapter_index,
        scroll_position,
        name: None,
        note,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    };
```

- [ ] **Step 2: Add `update_bookmark` command**

Add after the `remove_bookmark` command (after line 982):

```rust
#[tauri::command]
pub async fn update_bookmark(
    bookmark_id: String,
    name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let name_ref = name.as_deref().filter(|s| !s.trim().is_empty());
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    db::update_bookmark_name(&conn, &bookmark_id, name_ref).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Register in invoke_handler**

In `src-tauri/src/lib.rs`, add `commands::update_bookmark,` after line 148 (`commands::remove_bookmark,`):

```rust
            commands::remove_bookmark,
            commands::update_bookmark,
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`

Expected: no errors.

- [ ] **Step 5: Run all bookmark tests**

Run: `cd src-tauri && cargo test test_bookmark -- --nocapture 2>&1`

Expected: all bookmark tests PASS.

- [ ] **Step 6: Run clippy**

Run: `cd src-tauri && cargo clippy -- -D warnings 2>&1 | tail -10`

Expected: no warnings.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(bookmarks): add update_bookmark Tauri command"
```

---

### Task 4: Create `BookmarkToast` component

**Files:**
- Create: `src/components/BookmarkToast.tsx`
- Modify: `src/screens/Reader.tsx:62-63, 654-667, 913-920`

- [ ] **Step 1: Create BookmarkToast component**

Create `src/components/BookmarkToast.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BookmarkToastProps {
  bookmarkId: string;
  onDismiss: () => void;
}

export default function BookmarkToast({
  bookmarkId,
  onDismiss,
}: BookmarkToastProps) {
  const [mode, setMode] = useState<"confirmed" | "naming">("confirmed");
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-dismiss after 3s if still in confirmed mode
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (mode === "confirmed") onDismiss();
    }, 3000);
    return () => clearTimeout(timerRef.current);
  }, [mode, onDismiss]);

  const handleAddName = () => {
    clearTimeout(timerRef.current);
    setMode("naming");
  };

  useEffect(() => {
    if (mode === "naming") {
      inputRef.current?.focus();
    }
  }, [mode]);

  const saveName = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed) {
      try {
        await invoke("update_bookmark", {
          bookmarkId,
          name: trimmed,
        });
      } catch {
        // non-fatal
      }
    }
    onDismiss();
  }, [name, bookmarkId, onDismiss]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  };

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-ink/90 text-white text-sm rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      {mode === "confirmed" ? (
        <>
          Bookmark saved
          <button
            onClick={handleAddName}
            className="text-blue-300 hover:text-blue-200 text-xs ml-1 transition-colors"
          >
            Add name...
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveName}
            placeholder="Bookmark name..."
            className="bg-white/10 border border-white/20 text-white placeholder-white/40 px-2 py-0.5 rounded text-sm w-44 outline-none focus:border-blue-400"
          />
          <span className="text-white/30 text-[10px]">↵</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update Reader.tsx — replace toast state with bookmark reference**

In `src/screens/Reader.tsx`, replace the bookmark toast state (line 63):

```tsx
  const [bookmarkToast, setBookmarkToast] = useState(false);
```

with:

```tsx
  const [toastBookmarkId, setToastBookmarkId] = useState<string | null>(null);
```

- [ ] **Step 3: Update Reader.tsx — import BookmarkToast**

Add to the imports at the top of `src/screens/Reader.tsx`:

```tsx
import BookmarkToast from "../components/BookmarkToast";
```

- [ ] **Step 4: Update `addBookmarkAtCurrentPosition` to store bookmark id**

Replace the function (lines 654-667):

```tsx
  const addBookmarkAtCurrentPosition = useCallback(async () => {
    if (!bookId) return;
    try {
      const bookmark = await invoke<{ id: string }>("add_bookmark", {
        bookId,
        chapterIndex,
        scrollPosition: scrollProgress,
      });
      setToastBookmarkId(bookmark.id);
    } catch {
      // silently fail
    }
  }, [bookId, chapterIndex, scrollProgress]);
```

- [ ] **Step 5: Replace toast rendering**

Replace the old toast JSX (lines 913-920):

```tsx
      {bookmarkToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-ink/90 text-white text-sm rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Bookmark saved
        </div>
      )}
```

with:

```tsx
      {toastBookmarkId && (
        <BookmarkToast
          bookmarkId={toastBookmarkId}
          onDismiss={() => setToastBookmarkId(null)}
        />
      )}
```

- [ ] **Step 6: Run type-check**

Run: `npm run type-check 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/BookmarkToast.tsx src/screens/Reader.tsx
git commit -m "feat(bookmarks): add BookmarkToast with expand-in-place naming"
```

---

### Task 5: Add inline editing to BookmarksPanel

**Files:**
- Modify: `src/components/BookmarksPanel.tsx`

- [ ] **Step 1: Add `name` to Bookmark interface**

In `src/components/BookmarksPanel.tsx`, update the `Bookmark` interface (lines 4-11):

```tsx
interface Bookmark {
  id: string;
  book_id: string;
  chapter_index: number;
  scroll_position: number;
  name: string | null;
  note: string | null;
  created_at: number;
}
```

- [ ] **Step 2: Add editing state and save handler**

Inside the `BookmarksPanel` component, after the `handleDelete` function (after line 52), add:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const startEditing = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditValue(bookmark.name ?? "");
  };

  const saveEdit = async (bookmarkId: string) => {
    const trimmed = editValue.trim();
    try {
      await invoke("update_bookmark", {
        bookmarkId,
        name: trimmed || null,
      });
      await loadBookmarks();
    } catch {
      // non-fatal
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };
```

Add `useRef` to the import on line 1:

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
```

- [ ] **Step 3: Add focus effect for edit input**

After the save/cancel handlers, add:

```tsx
  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);
```

- [ ] **Step 4: Update bookmark item rendering for display and inline editing**

Replace the bookmark item rendering (lines 126-179) with:

```tsx
                  {chapterBookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="group px-5 py-2.5 hover:bg-warm-subtle transition-colors cursor-pointer"
                      onClick={() =>
                        editingId !== bm.id &&
                        onNavigate(bm.chapter_index, bm.scroll_position)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-accent shrink-0"
                        >
                          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          {editingId === bm.id ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveEdit(bm.id);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                              onBlur={() => saveEdit(bm.id)}
                              placeholder="Bookmark name..."
                              className="text-sm text-ink bg-transparent border-b border-accent outline-none w-full py-0.5"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <p
                                className="text-sm text-ink leading-snug hover:text-accent transition-colors cursor-text"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(bm);
                                }}
                                title="Click to edit name"
                              >
                                {bm.name || `${Math.round(bm.scroll_position * 100)}% through`}
                              </p>
                              {bm.name && (
                                <p className="text-xs text-ink-muted mt-0.5">
                                  {Math.round(bm.scroll_position * 100)}% through
                                </p>
                              )}
                              {bm.note && (
                                <p className="text-xs text-ink-muted mt-0.5 italic truncate">
                                  {bm.note}
                                </p>
                              )}
                            </>
                          )}
                          <p className="text-[10px] text-ink-muted/60 mt-0.5">
                            {formatDate(bm.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(bm.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-muted hover:text-red-500 transition-all shrink-0"
                          aria-label="Delete bookmark"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 20 20"
                            fill="none"
                          >
                            <path
                              d="M15 5L5 15M5 5l10 10"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
```

- [ ] **Step 5: Run type-check**

Run: `npm run type-check 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/BookmarksPanel.tsx
git commit -m "feat(bookmarks): add inline name editing in bookmarks panel"
```

---

### Task 6: Refresh bookmarks panel after naming from toast

**Files:**
- Modify: `src/components/BookmarksPanel.tsx`
- Modify: `src/screens/Reader.tsx`

When a user names a bookmark from the toast while the panel is open, the panel should reflect the new name.

- [ ] **Step 1: Add `refreshKey` prop to BookmarksPanel**

In `src/components/BookmarksPanel.tsx`, add to the props interface:

```tsx
interface BookmarksPanelProps {
  bookId: string;
  currentChapterIndex: number;
  toc: Array<{ label: string; chapter_index: number }>;
  onClose: () => void;
  onNavigate: (chapterIndex: number, scrollPosition: number) => void;
  refreshKey?: number;
}
```

Update the function signature:

```tsx
export default function BookmarksPanel({
  bookId,
  currentChapterIndex,
  toc,
  onClose,
  onNavigate,
  refreshKey,
}: BookmarksPanelProps) {
```

Update the `useEffect` that triggers `loadBookmarks` (lines 41-43) to include `refreshKey`:

```tsx
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks, refreshKey]);
```

- [ ] **Step 2: Add refresh trigger in Reader.tsx**

In `src/screens/Reader.tsx`, add state for the refresh key near the other bookmark state:

```tsx
  const [bookmarkRefreshKey, setBookmarkRefreshKey] = useState(0);
```

Update the `BookmarkToast` `onDismiss` to bump the key:

```tsx
      {toastBookmarkId && (
        <BookmarkToast
          bookmarkId={toastBookmarkId}
          onDismiss={() => {
            setToastBookmarkId(null);
            setBookmarkRefreshKey((k) => k + 1);
          }}
        />
      )}
```

Pass `refreshKey` to `BookmarksPanel`:

```tsx
      {bookmarksOpen && (
        <BookmarksPanel
          bookId={bookId!}
          currentChapterIndex={chapterIndex}
          toc={toc}
          onClose={() => setBookmarksOpen(false)}
          onNavigate={navigateToBookmark}
          refreshKey={bookmarkRefreshKey}
        />
      )}
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/BookmarksPanel.tsx src/screens/Reader.tsx
git commit -m "feat(bookmarks): refresh panel when bookmark named from toast"
```

---

### Task 7: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full Rust test suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`

Expected: all tests pass.

- [ ] **Step 2: Run clippy**

Run: `cd src-tauri && cargo clippy -- -D warnings 2>&1 | tail -10`

Expected: no warnings.

- [ ] **Step 3: Run cargo fmt check**

Run: `cd src-tauri && cargo fmt --check 2>&1`

Expected: no formatting issues.

- [ ] **Step 4: Run frontend type-check**

Run: `npm run type-check 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 5: Run frontend tests**

Run: `npm run test 2>&1 | tail -20`

Expected: all tests pass.

- [ ] **Step 6: Update ROADMAP.md**

In `docs/ROADMAP.md`, update feature 35 heading from:

```markdown
#### 35. Bookmark Naming & Editing
```

to:

```markdown
#### 35. Bookmark Naming & Editing — **Done**
```

And wrap the completed items with strikethrough:

```markdown
#### 35. Bookmark Naming & Editing — **Done**
- ~~Edit an existing bookmark to change its name~~
- ~~Two-step toast flow: quick-create unnamed via `b`, then optionally name from expanding toast~~
- ~~Inline editing in bookmarks panel: click name to edit, Enter/blur saves, Escape cancels~~
- ~~New `name` column in bookmarks table; `note` field preserved for future use~~
- Research how other readers handle this: Kindle names by highlight/page, Apple Books uses page number, Calibre uses typed labels, browser-style bookmarks prompt for a name on creation
- UX question: should `b` stay instant (name later) or show an inline input? Consider both power users (speed) and casual users (discoverability)
```

- [ ] **Step 7: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark bookmark naming & editing as done"
```
