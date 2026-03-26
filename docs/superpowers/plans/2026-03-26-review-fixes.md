# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 14 critical findings and high-priority warnings from the 2026-03-26 team review, prioritized by security > correctness > UX.

**Architecture:** Security fixes are isolated to `epub.rs` (path sanitization, extension allowlist). Sanitization consolidation removes DOMPurify from the frontend and tightens ammonia config in the backend. Progress validation adds bounds checks in `commands.rs`. DB index is a one-line schema migration. Frontend fixes are localized to individual components.

**Tech Stack:** Rust (ammonia, zip, r2d2, rusqlite), React 19, TypeScript, Tailwind CSS v4, DOMPurify (to be removed)

---

### Task 1: Fix path traversal in cover extraction (R2-1)

**Files:**
- Modify: `src-tauri/src/epub.rs:408-438`
- Test: `src-tauri/src/epub.rs` (tests module at line 934+)

- [ ] **Step 1: Write failing test for path traversal in `resolve_zip_path`**

Add to the `#[cfg(test)] mod tests` block in `epub.rs`:

```rust
#[test]
fn resolve_zip_path_prevents_traversal_above_root() {
    // "../../../etc/passwd" from "OEBPS/Text/" should not escape root
    let result = resolve_zip_path("OEBPS/Text/", "../../../etc/passwd");
    assert!(!result.contains(".."), "path must not contain '..' segments");
    assert!(!result.starts_with('/'));
}

#[test]
fn resolve_zip_path_normal_relative() {
    let result = resolve_zip_path("OEBPS/Text/", "../images/cover.jpg");
    assert_eq!(result, "OEBPS/images/cover.jpg");
}
```

- [ ] **Step 2: Run tests to verify the traversal test fails**

Run: `cd src-tauri && cargo test resolve_zip_path -- --nocapture`
Expected: `resolve_zip_path_prevents_traversal_above_root` FAILS (path will be `etc/passwd` or similar — though currently `..` pops above root to empty, it doesn't contain `..` literally). Verify the current behavior.

Note: `resolve_zip_path` currently uses `parts.pop()` for `..` which can pop all segments but won't produce `..` in output. The real risk is in `extract_cover` where `cover_href` containing `../` is passed to `find_zip_entry_name` and then used to derive the output file extension. The path traversal is in the *output path*, not the zip path. Adjust approach:

- [ ] **Step 3: Write test for cover extraction path sanitization**

```rust
#[test]
fn cover_href_with_traversal_is_rejected() {
    // A cover_href like "../../etc/passwd" should not be used as-is
    let sanitized = sanitize_cover_href("../../etc/passwd");
    assert!(sanitized.is_none());
}

#[test]
fn cover_href_normal_is_accepted() {
    let sanitized = sanitize_cover_href("images/cover.jpg");
    assert_eq!(sanitized, Some("images/cover.jpg".to_string()));
}

#[test]
fn cover_href_with_null_bytes_is_rejected() {
    let sanitized = sanitize_cover_href("images/cover\0.jpg");
    assert!(sanitized.is_none());
}
```

- [ ] **Step 4: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test cover_href -- --nocapture`
Expected: FAIL — `sanitize_cover_href` doesn't exist yet.

- [ ] **Step 5: Implement `sanitize_cover_href` and integrate into `extract_cover`**

Add before `extract_cover` in `epub.rs`:

```rust
/// Validate and sanitize a cover href from OPF metadata.
/// Returns None if the href is suspicious (traversal, null bytes, etc).
fn sanitize_cover_href(href: &str) -> Option<String> {
    // Reject null bytes
    if href.contains('\0') {
        return None;
    }
    // Reject absolute paths
    if href.starts_with('/') || href.starts_with('\\') {
        return None;
    }
    // Reject Windows drive letters
    if href.len() >= 2 && href.as_bytes()[1] == b':' {
        return None;
    }
    // Resolve the path and reject if it tries to escape
    let resolved = resolve_zip_path("", href);
    // After resolution, should not be empty (that means all segments were ..)
    if resolved.is_empty() {
        return None;
    }
    Some(resolved)
}
```

Then in `extract_cover`, after getting `cover_href`, add validation:

```rust
let cover_href = match find_cover_href(&opf) {
    Some(h) => h,
    None => return Ok(None),
};

// Validate the href is safe before using it for file operations
let cover_href = match sanitize_cover_href(&cover_href) {
    Some(h) => h,
    None => return Ok(None),
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo test cover_href -- --nocapture`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/epub.rs
git commit -m "fix(security): sanitize cover href to prevent path traversal (R2-1)"
```

---

### Task 2: Fix arbitrary file extension in cover extraction (R2-2)

**Files:**
- Modify: `src-tauri/src/epub.rs:430-431`
- Test: `src-tauri/src/epub.rs` (tests module)

- [ ] **Step 1: Write failing test for extension allowlist**

```rust
#[test]
fn cover_ext_allowlist_accepts_valid() {
    assert_eq!(sanitize_cover_ext("jpg"), Some("jpg"));
    assert_eq!(sanitize_cover_ext("jpeg"), Some("jpeg"));
    assert_eq!(sanitize_cover_ext("png"), Some("png"));
    assert_eq!(sanitize_cover_ext("gif"), Some("gif"));
    assert_eq!(sanitize_cover_ext("webp"), Some("webp"));
    assert_eq!(sanitize_cover_ext("svg"), Some("svg"));
}

#[test]
fn cover_ext_allowlist_rejects_invalid() {
    assert_eq!(sanitize_cover_ext("exe"), None);
    assert_eq!(sanitize_cover_ext("sh"), None);
    assert_eq!(sanitize_cover_ext("bat"), None);
    assert_eq!(sanitize_cover_ext("html"), None);
    assert_eq!(sanitize_cover_ext(""), None);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test cover_ext_allowlist -- --nocapture`
Expected: FAIL — `sanitize_cover_ext` doesn't exist yet.

- [ ] **Step 3: Implement `sanitize_cover_ext` and integrate**

Add in `epub.rs`:

```rust
/// Validate cover image extension against an allowlist.
fn sanitize_cover_ext(ext: &str) -> Option<&str> {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" => Some(ext),
        _ => None,
    }
}
```

Update the extension derivation in `extract_cover`:

```rust
// Derive extension from href, restricted to image types
let ext = cover_href.rsplit('.').next().unwrap_or("jpg");
let ext = sanitize_cover_ext(ext).unwrap_or("jpg");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test cover_ext -- --nocapture`
Expected: All PASS.

- [ ] **Step 5: Run full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/epub.rs
git commit -m "fix(security): allowlist cover image extensions (R2-2)"
```

---

### Task 3: Remove double sanitization — drop DOMPurify, keep ammonia (R2-3)

**Files:**
- Modify: `src/screens/Reader.tsx:328-329` — remove DOMPurify.sanitize() call
- Modify: `src-tauri/src/epub.rs:495` — tighten ammonia config
- Test: `src-tauri/src/epub.rs` (tests module)

- [ ] **Step 1: Write test for ammonia sanitization preserving safe content**

Add to `epub.rs` tests:

```rust
#[test]
fn ammonia_preserves_basic_html() {
    let input = r#"<p>Hello <em>world</em></p><img src="test.jpg"/>"#;
    let result = clean(input);
    assert!(result.contains("<p>"));
    assert!(result.contains("<em>"));
}

#[test]
fn ammonia_strips_script_tags() {
    let input = r#"<p>Safe</p><script>alert('xss')</script>"#;
    let result = clean(input);
    assert!(!result.contains("<script"));
    assert!(result.contains("Safe"));
}
```

- [ ] **Step 2: Run tests to verify they pass** (ammonia already does this)

Run: `cd src-tauri && cargo test ammonia -- --nocapture`
Expected: PASS — this confirms ammonia's baseline behavior.

- [ ] **Step 3: Remove DOMPurify from Reader.tsx**

In `Reader.tsx`, the `highlightedHtml` memo currently does:
```typescript
const html = DOMPurify.sanitize(chapterHtml);
```

Change to:
```typescript
const html = chapterHtml;
```

The backend already sanitizes via ammonia before sending content to the frontend.

- [ ] **Step 4: Remove DOMPurify import if no longer used elsewhere in Reader.tsx**

Check if DOMPurify is used anywhere else in `Reader.tsx`. If the only usage was line 329, remove the import:
```typescript
// Remove: import DOMPurify from "dompurify";
```

Check other files for DOMPurify usage — if it's only in Reader.tsx, also uninstall the package:
```bash
npm uninstall dompurify @types/dompurify
```

- [ ] **Step 5: Run type check and frontend tests**

Run: `npm run type-check && npm run test`
Expected: PASS — no type errors, no test failures.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Reader.tsx package.json package-lock.json
git commit -m "fix: remove redundant DOMPurify sanitization, keep ammonia backend-only (R2-3)"
```

---

### Task 4: Add bookmarks.book_id index (R2-4)

**Files:**
- Modify: `src-tauri/src/db.rs:106-107` (after schema batch, in migrations section)

- [ ] **Step 1: Write failing test for index existence**

Add to `db.rs` tests:

```rust
#[test]
fn bookmarks_book_id_index_exists() {
    let conn = setup_test_db();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_bookmarks_book_id'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "idx_bookmarks_book_id index should exist");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test bookmarks_book_id_index -- --nocapture`
Expected: FAIL — index doesn't exist.

- [ ] **Step 3: Add index migration**

In `db.rs`, after the existing additive migrations (around line 119), add:

```rust
let _ = conn.execute_batch(
    "CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks(book_id);",
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test bookmarks_book_id_index -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "fix(db): add index on bookmarks.book_id for query performance (R2-4)"
```

---

### Task 5: Validate reading progress inputs (R2-5, R2-6)

**Files:**
- Modify: `src-tauri/src/commands.rs:527-546`
- Test: `src-tauri/src/commands.rs` (tests module at line 2106+)

- [ ] **Step 1: Write failing tests for progress validation**

Add to `commands.rs` tests (or create a standalone test if the test module uses integration-style tests):

```rust
#[test]
fn validate_scroll_position_rejects_nan() {
    assert!(validate_scroll_position(f64::NAN).is_err());
}

#[test]
fn validate_scroll_position_rejects_negative() {
    assert!(validate_scroll_position(-0.1).is_err());
}

#[test]
fn validate_scroll_position_rejects_above_one() {
    assert!(validate_scroll_position(1.1).is_err());
}

#[test]
fn validate_scroll_position_accepts_valid() {
    assert!(validate_scroll_position(0.0).is_ok());
    assert!(validate_scroll_position(0.5).is_ok());
    assert!(validate_scroll_position(1.0).is_ok());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test validate_scroll -- --nocapture`
Expected: FAIL — function doesn't exist.

- [ ] **Step 3: Implement validation and add to `save_reading_progress`**

Add helper in `commands.rs`:

```rust
fn validate_scroll_position(pos: f64) -> Result<f64, String> {
    if pos.is_nan() || pos.is_infinite() {
        return Err("scroll_position must be a finite number".to_string());
    }
    Ok(pos.clamp(0.0, 1.0))
}
```

Update `save_reading_progress`:

```rust
#[tauri::command]
pub async fn save_reading_progress(
    book_id: String,
    chapter_index: u32,
    scroll_position: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let scroll_position = validate_scroll_position(scroll_position)?;

    // Validate chapter_index against book's total_chapters
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    let book = db::get_book(&conn, &book_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Book '{book_id}' not found"))?;
    if chapter_index >= book.total_chapters {
        return Err(format!(
            "chapter_index {} out of range (book has {} chapters)",
            chapter_index, book.total_chapters
        ));
    }

    let progress = ReadingProgress {
        book_id,
        chapter_index,
        scroll_position,
        last_read_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    };

    db::upsert_reading_progress(&conn, &progress).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test validate_scroll -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Run full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: All tests pass (ensure the extra DB call doesn't break existing tests).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "fix: validate chapter_index and scroll_position in save_reading_progress (R2-5, R2-6)"
```

---

### Task 6: Log cover extraction failures (R2-10)

**Files:**
- Modify: `src-tauri/src/commands.rs` — wherever cover extraction errors are silently swallowed

- [ ] **Step 1: Find all silent cover error swallowing**

Search for places where cover extraction returns None/Ok(None) without logging. Key locations in `commands.rs` around the import flow where `extract_cover` or `save_cover_from_data_uri` failures are discarded.

- [ ] **Step 2: Add `log` crate usage if not already present**

Check `src-tauri/Cargo.toml` for `log` dependency. If missing:
```bash
cd src-tauri && cargo add log
```

- [ ] **Step 3: Replace silent swallowing with warn-level logs**

In `commands.rs`, wherever cover extraction is done, change patterns like:

```rust
// Before (silent):
let cover_path = epub::extract_cover(&file_path, &cover_dir).unwrap_or(None);

// After (logged):
let cover_path = match epub::extract_cover(&file_path, &cover_dir) {
    Ok(path) => path,
    Err(e) => {
        log::warn!("Failed to extract cover for {}: {}", book_id, e);
        None
    }
};
```

Do the same for `save_cover_from_data_uri` calls.

- [ ] **Step 4: Run Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/Cargo.toml
git commit -m "fix: log cover extraction failures instead of silently swallowing (R2-10)"
```

---

### Task 7: Fix scroll restoration race condition (R3-5)

**Files:**
- Modify: `src/screens/Reader.tsx:145-160` — tie scroll restoration to specific chapter

- [ ] **Step 1: Read current scroll restoration code**

Read `Reader.tsx` lines 145-200 to understand the current `restoringScroll` logic.

- [ ] **Step 2: Fix by tying restoration to specific chapter index**

The current `restoringScroll.current` is a boolean that doesn't track which chapter it belongs to. Change it to track the chapter index:

```typescript
// Before:
const restoringScroll = useRef(false);

// After:
const restoringScroll = useRef<number | null>(null);
```

When starting restoration:
```typescript
restoringScroll.current = chapterIndex;
```

When checking during scroll handler:
```typescript
if (restoringScroll.current === chapterIndex) {
    restoringScroll.current = null;
    return;
}
```

This ensures a restoration started for chapter N doesn't suppress/interfere with chapter N+1 if the user navigates quickly.

- [ ] **Step 3: Run frontend tests**

Run: `npm run type-check && npm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Reader.tsx
git commit -m "fix: tie scroll restoration to specific chapter index to prevent race (R3-5)"
```

---

### Task 8: Fix keyboard handler conflicts (R1-1)

**Files:**
- Modify: `src/screens/Reader.tsx:452-479`
- Modify: `src/components/SettingsPanel.tsx` — keyboard handler

- [ ] **Step 1: Read SettingsPanel keyboard handler**

Read `SettingsPanel.tsx` lines 144-179 to understand what keys it binds.

- [ ] **Step 2: Guard Reader keyboard handler against open panels**

In Reader.tsx, the `handleKeyDown` function should early-return when SettingsPanel or TOC is open and the event is handled by those panels. The key conflict is:
- Escape: both Reader and SettingsPanel listen for it
- Arrow keys: fire even when panels are open

Fix by adding guards at the top of Reader's `handleKeyDown`:

```typescript
function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Let SettingsPanel handle its own keyboard events
    if (settingsOpen && (e.key === "Escape" || e.key === "Tab")) return;

    // Don't process navigation keys when panels are open
    if ((settingsOpen || tocOpen) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;

    // ... rest of handler
}
```

- [ ] **Step 3: Run type-check and tests**

Run: `npm run type-check && npm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Reader.tsx
git commit -m "fix: prevent keyboard handler conflicts between Reader and panels (R1-1)"
```

---

### Task 9: Fix focus outlines on Reader buttons (R1-3) and disabled button contrast (R1-2, R1-10)

**Files:**
- Modify: `src/screens/Reader.tsx` — button classes
- Modify: `src/components/SettingsPanel.tsx` — disabled state classes

- [ ] **Step 1: Read the relevant button elements**

Read `Reader.tsx` around lines 342, 352, 390 for back/TOC/settings buttons, and lines 369, 432-454 for chapter nav disabled states.

- [ ] **Step 2: Add focus-visible outlines to interactive buttons**

For each button missing focus styles, add `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` (or the project's existing focus ring pattern).

- [ ] **Step 3: Fix disabled button contrast**

Replace `opacity-30` on disabled buttons with a more visible disabled state:

```typescript
// Before:
className="... opacity-30"

// After:
className="... opacity-50 cursor-not-allowed"
```

`opacity-50` provides better contrast while still looking disabled.

- [ ] **Step 4: Run type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Reader.tsx src/components/SettingsPanel.tsx
git commit -m "fix(a11y): add focus outlines and improve disabled button contrast (R1-2, R1-3, R1-10)"
```

---

### Task 10: Fix delete confirmation overlay hiding book info (R4-1)

**Files:**
- Modify: `src/components/BookCard.tsx:113-138`

- [ ] **Step 1: Read the current delete overlay implementation**

Read `BookCard.tsx` lines 100-150 to see how the overlay works.

- [ ] **Step 2: Redesign overlay to show book title**

Instead of a full-card overlay that hides everything, show the book title in the confirmation overlay:

```tsx
{showDeleteConfirm && (
  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 p-3 rounded-lg z-10">
    <p className="text-white text-xs text-center line-clamp-2 font-medium">
      Delete "{title}"?
    </p>
    <div className="flex gap-2">
      <button onClick={handleConfirmDelete} className="...">
        Delete
      </button>
      <button onClick={() => setShowDeleteConfirm(false)} className="...">
        Cancel
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/BookCard.tsx
git commit -m "fix(ux): show book title in delete confirmation overlay (R4-1)"
```

---

### Task 11: Tighten DOMPurify config as fallback (R1-4)

> **Note:** If Task 3 fully removes DOMPurify, skip this task. If DOMPurify is kept anywhere else in the codebase, tighten its config here.

**Files:**
- Modify: any remaining DOMPurify usage

- [ ] **Step 1: Check if DOMPurify still exists after Task 3**

Run: `grep -r "DOMPurify" src/`

If no results, mark this task as SKIP.

If still present, configure with restricted allowlist:

```typescript
DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'em', 'strong', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'sup', 'sub', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'id'],
    ALLOW_DATA_ATTR: false,
});
```

- [ ] **Step 2: Commit if changes were made**

```bash
git add src/
git commit -m "fix(security): tighten DOMPurify config with restricted tag allowlist (R1-4)"
```

---

### Task 12: Improve error messages for user-facing errors (R4-3)

**Files:**
- Create: `src/lib/errors.ts`
- Modify: `src/screens/Library.tsx` — error display
- Modify: `src/screens/Reader.tsx` — error display

- [ ] **Step 1: Create error mapping utility**

Create `src/lib/errors.ts`:

```typescript
const ERROR_MAP: Record<string, string> = {
    "not found": "This book file could not be found. It may have been moved or deleted.",
    "permission denied": "Permission denied. Check that the file is accessible.",
    "invalid format": "This file format is not supported.",
    "duplicate": "This book is already in your library.",
    "chapter index": "Could not load this chapter. Try restarting the reader.",
    "corrupt": "This file appears to be damaged and cannot be opened.",
};

export function friendlyError(raw: string): string {
    const lower = raw.toLowerCase();
    for (const [key, message] of Object.entries(ERROR_MAP)) {
        if (lower.includes(key)) return message;
    }
    return "Something went wrong. Please try again.";
}
```

- [ ] **Step 2: Write test for error mapping**

Create `src/lib/__tests__/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { friendlyError } from "../errors";

describe("friendlyError", () => {
    it("maps 'not found' errors", () => {
        expect(friendlyError("Failed to import: file not found")).toContain("could not be found");
    });

    it("maps duplicate errors", () => {
        expect(friendlyError("Book is a duplicate")).toContain("already in your library");
    });

    it("returns generic message for unknown errors", () => {
        expect(friendlyError("something unknown")).toBe("Something went wrong. Please try again.");
    });
});
```

- [ ] **Step 3: Run the test**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 4: Integrate into Library.tsx and Reader.tsx**

In `Library.tsx`, wherever error strings are shown to the user (e.g., in toast/alert), wrap with `friendlyError()`:

```typescript
import { friendlyError } from "../lib/errors";

// In catch blocks:
setError(friendlyError(err as string));
```

Do the same in `Reader.tsx` for chapter load failures.

- [ ] **Step 5: Run type-check and tests**

Run: `npm run type-check && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/errors.ts src/lib/__tests__/errors.test.ts src/screens/Library.tsx src/screens/Reader.tsx
git commit -m "fix(ux): map raw backend errors to user-friendly messages (R4-3)"
```

---

### Task 13: Add TOC focus trap (R1-5)

**Files:**
- Modify: `src/screens/Reader.tsx` — TOC sidebar

- [ ] **Step 1: Read the TOC sidebar code**

Read `Reader.tsx` around lines 287-332 to understand the sidebar structure.

- [ ] **Step 2: Add focus trap and ARIA attributes**

Add `role="dialog"` and `aria-modal="true"` to the TOC sidebar container. Implement a focus trap using a `useEffect` that captures Tab key events when `tocOpen` is true:

```typescript
// In the tocOpen useEffect or a dedicated one:
useEffect(() => {
    if (!tocOpen) return;
    const sidebar = document.getElementById("toc-sidebar");
    if (!sidebar) return;

    const focusable = sidebar.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function trapFocus(e: KeyboardEvent) {
        if (e.key !== "Tab") return;
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        }
    }

    first?.focus();
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
}, [tocOpen]);
```

Add to the sidebar JSX:
```tsx
<div id="toc-sidebar" role="dialog" aria-modal="true" aria-label="Table of Contents">
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Reader.tsx
git commit -m "fix(a11y): add focus trap and ARIA attributes to TOC sidebar (R1-5)"
```

---

### Task 14: Add loading state during import (R1-9)

**Files:**
- Modify: `src/screens/Library.tsx`

- [ ] **Step 1: Read the current import flow**

Read `Library.tsx` around lines 86-143 to understand the importing state.

- [ ] **Step 2: Add import overlay/indicator**

When `importing` is true, overlay the library grid with a loading indicator that also blocks interaction:

```tsx
{importing && (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-600 dark:text-gray-300">Importing books...</p>
        </div>
    </div>
)}
```

This prevents clicking books or re-importing during an active import.

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Library.tsx
git commit -m "fix(ux): show loading overlay during book import to prevent race conditions (R1-9)"
```

---

### Task 15: Add aria-valuetext to font size slider (R1-7)

**Files:**
- Modify: `src/components/SettingsPanel.tsx:128-136`

- [ ] **Step 1: Read the font size slider code**

Read `SettingsPanel.tsx` around lines 128-136.

- [ ] **Step 2: Add accessibility attributes**

Add `aria-valuetext` and `aria-label` to the range input:

```tsx
<input
    type="range"
    min={MIN_FONT_SIZE}
    max={MAX_FONT_SIZE}
    value={fontSize}
    onChange={(e) => setFontSize(Number(e.target.value))}
    aria-label="Font size"
    aria-valuetext={`${fontSize} pixels`}
/>
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx
git commit -m "fix(a11y): add aria-valuetext to font size slider (R1-7)"
```

---

### Task 16: Run full CI checks

- [ ] **Step 1: Run Rust checks**

```bash
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```
Expected: All pass.

- [ ] **Step 2: Run frontend checks**

```bash
npm run type-check && npm run test
```
Expected: All pass.

- [ ] **Step 3: Fix any failures found**

If any check fails, fix and re-run until clean.
