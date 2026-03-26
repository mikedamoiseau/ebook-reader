# Team Review Report
**Date:** 2026-03-26
**Mode:** code (full codebase)
**Branch:** main
**Base:** main
**Files reviewed:** 16 source files (~3300 lines)
---

## Team Review: main (Full Codebase)

### Quick Reference
| Reviewer | Verdict | Critical | Warnings | Suggestions |
|----------|---------|----------|----------|-------------|
| Frontend/UX | concerns | 4 | 6 | 10 |
| Architecture | issues | 3 | 5 | 7 |
| Devil's Advocate | issues | 3 | 6 | 8 |
| End User | concerns | 3 | 7 | 5 |
| Product Manager | issues | 3 | 4 | 6 |

---

### Critical Findings
| ID | Details | Flagged By | Handling | Status | Resolution |
|----|---------|-----------|----------|--------|------------|
| R2-1 | **ZIP Slip / path traversal in cover extraction.** `cover_href` from OPF metadata is unsanitized. Malicious EPUB could write files outside app data dir via `../` in href. `epub.rs:394-395`: ext and path derived directly from untrusted input. (also R3-17) | R2-Architecture, R3-Advocate | FIX | DONE | Added `sanitize_cover_href()` — rejects null bytes, absolute paths, Windows drive letters, and traversal above root. Integrated before any filesystem write in `extract_cover`. (`66adc29`) |
| R2-2 | **Arbitrary file extension in cover extraction.** Extension derived from href without allowlist — malicious EPUB could create `.exe`/`.sh` files on disk. `epub.rs:394` | R2-Architecture | FIX | DONE | Added `sanitize_cover_ext()` allowlist (jpg/jpeg/png/gif/webp/svg). Non-image extensions default to "jpg". (`531b20a`) |
| R3-1 | **Base64 image encoding creates memory bomb.** All chapter images base64-encoded into HTML string. 10 high-res images -> 20-30MB string, then DOMPurify processes it again. Crashes on illustrated/graphic novel EPUBs. `epub.rs:538-612`, `Reader.tsx:426` (also R5-4) | R3-Advocate, R5-PM | FIX | DONE | Replaced `rewrite_img_srcs_to_data_uris` with `rewrite_img_srcs_to_asset_urls`. Images extracted to disk at `{data_dir}/images/{book_id}/{chapter}/`, referenced via `asset://localhost/` URLs. Cached on disk for reuse. DOMPurify also removed (R2-3). (`1538d0b`) |
| R2-3 | **Double HTML sanitization causes data loss.** ammonia (backend, `epub.rs:458`) + DOMPurify (frontend, `Reader.tsx:426`) sanitize same HTML with different rules. ammonia may strip valid content DOMPurify would preserve. Pick one. (also R3-6) | R2-Architecture, R3-Advocate | FIX | DONE | Removed DOMPurify entirely — uninstalled packages, removed import and `.sanitize()` call from Reader.tsx. Backend ammonia is now the sole sanitizer. (`92cd4b1`) |
| R3-2 | **EPUB zip reopened for every operation.** `import_book` opens zip 3x (metadata, cover, chapters). `get_chapter_content` opens zip on every page turn. Slow on USB/network drives, risks file descriptor exhaustion with large libraries. `epub.rs:341,372,404,433` | R3-Advocate | FIX | DONE | Import path: refactored to `_from_archive` variants, opens zip once (`1ce4d5d`). Reading path: added `CachedEpubArchive` struct with pre-parsed OPF metadata, cached in AppState (LRU, 5 entries). Page turns now reuse cached archive. (`latest commit`) |
| R3-3 | **File existence not validated when reading.** If EPUB deleted/moved after import, reader shows cryptic error. No library validation or recovery. Ghost books persist in library. `commands.rs:96-109` | R3-Advocate | FIX | DONE | Added `validate_file_exists()` check before format-specific parsers in 6 commands (`get_chapter_content`, `get_toc`, comic/PDF page commands). Returns clear message with path. Combined with `friendlyError()` (R4-3) for frontend display. (`addbc51`) |
| R4-3 | **Error messages are raw backend strings.** "Failed to import: file not found" — no user-friendly mapping, no actionable guidance, no recovery suggestions. `Library.tsx:64,101,130`, `Reader.tsx:415` (also R5-2) | R4-EndUser, R5-PM | FIX | DONE | Created `src/lib/errors.ts` with `friendlyError()` mapping layer. Integrated into all user-facing error setters in Library.tsx (9 sites) and Reader.tsx (2 sites). (`59d5373`) |
| R5-1 | **Bookmarks fully implemented in backend (models, DB schema, CRUD, 3 Tauri commands) but zero UI.** Half-finished feature shipping silently. Either add UI or remove backend code. `commands.rs:162-204`, `db.rs:217-254` | R5-PM | FIX | DONE | Added `BookmarksPanel.tsx` sidebar (matches TOC/Highlights pattern). Lists bookmarks grouped by chapter, click to navigate, delete on hover. Toast on `b` shortcut. Toggle button in reader header. (`27f38ed`) |
| R5-3 | **No text selection, copy, or highlighting in reader.** Core ebook reader feature missing. `dangerouslySetInnerHTML` renders content but no selection handlers. `Reader.tsx:426` | R5-PM | FIX | N/A | FALSE POSITIVE: Text selection, highlighting, and color picker are fully implemented (selection popup, highlight CRUD, mark rendering in Reader.tsx). Review finding was based on outdated code state. |
| R1-3 | **Focus outlines missing on critical Reader buttons** (back, TOC toggle, settings). Violates WCAG 2.1 S2.4.7. Keyboard-only users can't see focused element. `Reader.tsx:342,352,390`, `Library.tsx:200` | R1-Frontend | FIX | DONE | Added `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` to 12 buttons in Reader.tsx and 3 in SettingsPanel.tsx. (`9063b71`) |
| R1-2 | **Disabled buttons use opacity-30 on already-muted text.** Fails WCAG AA contrast ratio (4.5:1 min). Present across Reader nav and Settings controls. `Reader.tsx:369,435,448`, `SettingsPanel.tsx:122,144` | R1-Frontend | FIX | DONE | Replaced `opacity-30` with `opacity-50 cursor-not-allowed` on all disabled buttons in Reader.tsx and SettingsPanel.tsx. (`9063b71`) |
| R4-1 | **Delete confirmation overlay covers entire card, hiding title/author/cover.** User confirms deletion based on memory alone. High risk of deleting wrong book in large library. `BookCard.tsx:113-138` | R4-EndUser | FIX | DONE | Overlay now shows `Delete "[title]"?` with `line-clamp-2` for long titles. (`0e2ec54`) |
| R1-1 | **Keyboard handler conflicts between TOC and SettingsPanel.** Both bind to window keydown. Pressing Escape while Settings open may close TOC instead. Arrow keys fire even when panels are open. `Reader.tsx:232-244`, `SettingsPanel.tsx:21-44` | R1-Frontend | FIX | DONE | Added guards: Escape/Tab deferred to SettingsPanel when open; ArrowLeft/Right suppressed when any panel is open. `settingsOpen` passed as prop from App.tsx. (`12e790f`) |
| R4-2 | **Long titles/authors truncate with no tooltip or expand.** Single-line `truncate` with no `title` attribute. Users can't identify books with similar long names. `BookCard.tsx:143-147`, `Reader.tsx:360` | R4-EndUser | DEFER | DONE | Added `title` attribute with full text to truncated title/author elements in BookCard.tsx and Reader.tsx. (`b2f2799`) |

### Warnings
| ID | Details | Flagged By | Handling | Status | Resolution |
|----|---------|-----------|----------|--------|------------|
| R1-4 | **DOMPurify used with default config on untrusted EPUB content.** Default allows `data:` URIs and permissive tags. If keeping DOMPurify (per R2-3 resolution), restrict allowed tags/attrs. `Reader.tsx:426` | R1-Frontend | FIX | N/A | DOMPurify was fully removed (R2-3). No config to tighten. |
| R1-5 | **TOC sidebar has no focus trap.** Keyboard users can Tab out of sidebar into content behind it. No `role="dialog"` or `aria-modal`. `Reader.tsx:287-332` | R1-Frontend | FIX | DONE | Added `role="dialog"`, `aria-modal="true"`, `aria-label` to sidebar. Added focus trap `useEffect` that wraps Tab within focusable elements and auto-focuses first item on open. (`da0eb8d`) |
| R1-7 | **Font size range slider missing aria-valuetext and value feedback.** Screen reader users don't hear current value when dragging. `SettingsPanel.tsx:128-136` | R1-Frontend | FIX | DONE | Added `aria-valuetext={\`${fontSize} pixels\`}` to the range input. `aria-label` was already present. (`0e16787`) |
| R1-9 | **No loading overlay during import.** Library grid still interactive while importing. User can trigger race conditions by clicking books or re-importing. `Library.tsx:86-105` | R1-Frontend | FIX | DONE | Added fixed-position blocking overlay with spinner and "Importing books..." text when `importing` is true. Prevents all interaction during import. (`248bc72`) |
| R1-10 | **Chapter nav disabled state too subtle.** opacity-30 on muted text is nearly invisible. Users click disabled Previous/Next expecting response. `Reader.tsx:432-454` (also R4-8) | R1-Frontend, R4-EndUser | FIX | DONE | Replaced `opacity-30` with `opacity-50 cursor-not-allowed` on disabled chapter nav buttons. (`9063b71`) |
| R2-4 | **Missing index on `bookmarks.book_id` foreign key.** Causes full table scan on `list_bookmarks()` and cascade deletes. Scales poorly. `db.rs:34-42` | R2-Architecture | FIX | DONE | Added `CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks(book_id)` in additive migrations. (`737b60b`) |
| R2-5 | **`chapter_index` not validated in `save_reading_progress`.** Frontend can save progress for non-existent chapters. Corrupted progress breaks reader on reopen. `commands.rs:140-158` (also R3-7) | R2-Architecture, R3-Advocate | FIX | DONE | `save_reading_progress` now looks up the book and validates `chapter_index < total_chapters`. (`12358b7`) |
| R2-6 | **No validation on `scroll_position` bounds.** Could store NaN, negative, or >1.0 values. Causes erratic scroll on restore. `commands.rs:143` | R2-Architecture | FIX | DONE | Added `validate_scroll_position()` — rejects NaN/Infinity, clamps to [0.0, 1.0]. (`12358b7`) |
| R2-7 | **Connection pool uses defaults (likely 10 connections) with no timeout config.** Could hang under concurrent chapter loads. `lib.rs:16` | R2-Architecture | DEFER | DONE | Configured `Pool::builder()` with `.max_size(5)` and `.connection_timeout(Duration::from_secs(5))`. (`8d07f7d`) |
| R2-8 | **Image rewriting uses string matching, not HTML parser.** Breaks on nested quotes, case-sensitive attribute matching, malformed HTML. `epub.rs:538-612` | R2-Architecture | DEFER | OPEN | |
| R2-10 | **Cover extraction failures silently swallowed.** `match ... _ => None` discards all errors. No logging, hard to debug. `commands.rs:37-43` (also R3-9) | R2-Architecture, R3-Advocate | FIX | DONE | Added `log` crate. Replaced silent `_ => None` / `.ok()?` with `log::warn!` in all 5 cover extraction paths (EPUB, CBZ, CBR, PDF, `save_cover_from_data_uri`). (`a94dd8e`) |
| R3-5 | **Scroll restoration race: saved position from chapter N applied to chapter N+1 if user navigates quickly.** `restoringScroll.current` not tied to specific chapter. `Reader.tsx:145-160` | R3-Advocate | FIX | DONE | Changed `restoringScroll` from `useRef(false)` to `useRef<number \| null>(null)`. Now stores the target chapter index and only suppresses scroll events for that specific chapter. (`222eddc`) |
| R3-8 | **No timeout on EPUB import.** Corrupted/huge EPUB can hang the app indefinitely. UI freezes with no feedback. `commands.rs:15-73` | R3-Advocate | FIX | DONE | Added 500MB file size guard at import entry point. Files exceeding limit rejected with clear message. (`c8a0e0d`) |
| R4-4 | **No auto-save feedback.** Progress saves silently; users don't know their position is preserved. Silent failure means lost progress. `Reader.tsx:162-207` (also R1-19) | R4-EndUser, R1-Frontend | FIX | DONE | Added "Progress saved" indicator (bottom-right, 1.5s fade) on success and "Progress not saved" warning (2s) on failure. (`c0aa47c`) |
| R4-6 | **Search state persists after deleting all matching books.** Shows "No results for X" instead of clearing search or showing empty state. `Library.tsx:229-238` | R4-EndUser | DEFER | DONE | Added `useEffect` that clears search query when filtered results become empty but books exist. (`b2f2799`) |
| R4-7 | **Multiple rapid imports can race.** Boolean `importing` flag doesn't account for concurrent drag-drop + button import. `Library.tsx:86-143` | R4-EndUser | DEFER | DONE | Fully mitigated: the import loading overlay (R1-9) blocks all UI interaction during imports, preventing concurrent triggers. |
| R4-9 | **TOC sidebar can't handle books with hundreds of chapters.** No search, no virtual scroll, all entries rendered at once. `Reader.tsx:318-331` | R4-EndUser | DEFER | OPEN | |
| R5-5 | **Chapter title fallback is generic "Chapter N".** Doesn't extract `<h1>`/`<h2>` from chapter HTML. 20-30% of EPUBs have sparse TOCs. `epub.rs:420` | R5-PM | DEFER | OPEN | |
| R5-6 | **`BookMetadata` includes language and description but neither is displayed in UI.** Book info underutilized. `models.rs:44-50`, Library/BookCard | R5-PM | DEFER | OPEN | |
| R5-7 | **Progress tracking is chapter-only, not paragraph or element-level.** Scroll position is viewport-relative (0.0-1.0), breaks if font/window size changes. `models.rs:15-20` | R5-PM | DEFER | OPEN | |
| R1-6 | **Search input focus border at 40% opacity barely visible** on warm background. `Library.tsx:185` | R1-Frontend | DEFER | DONE | Changed `focus:border-accent/40` to `focus:border-accent` for full opacity. (`b2f2799`) |
| R1-8 | **BookCard delete overlay missing `role="dialog"` and `aria-modal`.** No Escape key handling, no screen reader context. `BookCard.tsx:112-138` | R1-Frontend | DEFER | DONE | Added `role="alertdialog"`, `aria-modal="true"`, `aria-label`, and Escape key handler. (`b2f2799`) |

### Suggestions
| ID | Details | Flagged By | Handling | Status | Resolution |
|----|---------|-----------|----------|--------|------------|
| R1-11 | Footer progress text uses `text-[11px]`, unreadable on small screens. `Reader.tsx:460` | R1-Frontend | SKIP | OPEN | |
| R1-12 | No "clear search" button when results are empty. `Library.tsx:229-238` | R1-Frontend | SKIP | OPEN | |
| R1-13 | Book cover images lack `loading="lazy"` and show no placeholder while loading. `BookCard.tsx:52` | R1-Frontend | SKIP | OPEN | |
| R1-15 | No keyboard shortcut help/legend in reader. Arrow keys and Escape undiscoverable. `Reader.tsx:231-244` (also R4-14) | R1-Frontend, R4-EndUser | SKIP | OPEN | |
| R1-16 | Grid uses `auto-fill minmax(148px)` — suboptimal on very small or very wide screens. `Library.tsx:214` | R1-Frontend | SKIP | OPEN | |
| R1-17 | Font preview uses generic "quick brown fox" instead of actual book content. `SettingsPanel.tsx:178-188` (also R4-10) | R1-Frontend, R4-EndUser | SKIP | OPEN | |
| R1-18 | Drag-drop overlay disappears on drop with no import confirmation. No file count shown. `Library.tsx:241-259` (also R4-13) | R1-Frontend, R4-EndUser | SKIP | OPEN | |
| R1-20 | TOC sidebar doesn't auto-scroll to active chapter item. `Reader.tsx:318-331` | R1-Frontend | SKIP | OPEN | |
| R2-9 | `update_book()` defined but never called anywhere — dead code. `db.rs:155-170` | R2-Architecture | SKIP | OPEN | |
| R2-15 | No structured logging anywhere in Rust backend. All errors converted to strings. Hard to debug. All Rust files | R2-Architecture, R5-PM | DEFER | OPEN | |
| R3-10 | No pagination/streaming for very large chapters. Entire chapter loaded and sanitized at once. `epub.rs:433-471` | R3-Advocate | DEFER | OPEN | |
| R3-11 | `TocEntry.children` field exists but is never populated. TOC is always flat despite EPUB supporting nested structure. `epub.rs:60-64,757,860` (also R5-9) | R3-Advocate, R5-PM | DEFER | OPEN | |
| R3-12 | No debouncing on font size buttons. Rapid clicks trigger multiple re-renders of entire chapter. `Reader.tsx:367,378` | R3-Advocate | SKIP | OPEN | |
| R3-16 | No import progress feedback beyond spinner. Large EPUB imports show no parsing/extracting status. `commands.rs:15-73` | R3-Advocate | SKIP | OPEN | |
| R4-12 | Search input doesn't auto-focus when library opens. No Cmd+K shortcut. `Library.tsx:180` | R4-EndUser | SKIP | OPEN | |
| R4-15 | Font size range 14-24px may be too narrow for accessibility needs. Consider 12-32px. `ThemeContext.tsx:30-31` | R4-EndUser | SKIP | OPEN | |
| R5-11 | No full-text search — library search only matches title/author. `Library.tsx:145-152` | R5-PM | DEFER | OPEN | |
| R5-13 | README/CHANGELOG incomplete: no feature roadmap, no known limitations, no EPUB compatibility notes, CHANGELOG says v1.0.0 but package.json says v0.1.0 | R5-PM | DEFER | OPEN | |

### Filtered
| Finding | Reason |
|---------|--------|
| R2-11 (Missing auth) | Single-user desktop app — auth not needed. [FALSE POSITIVE] |
| R2-12 (usize vs number mismatch) | TypeScript `number` handles u32 range fine; not a real issue. [FALSE POSITIVE] |
| R3-4 (Progress race condition) | Mitigated by SQLite FOREIGN KEY constraint + Tauri single-threaded event loop. [LOW CONFIDENCE] |
| R4-5 (Back button confirmation) | Desktop readers universally allow instant back navigation; confirmation would add friction. [SKIP — pattern mismatch] |
| R3-14 (No disk space check) | OS handles this with standard IO error; explicit check adds no value. [FALSE POSITIVE] |
| R3-15 (No CSP violation logging) | Debug-only concern, not a user-facing issue. [LOW PRIORITY] |

---

### Recommendation
**All Critical and most Warnings resolved** — 14/14 Critical done (13 fixed, 1 false positive), 17/22 Warnings done. 23 commits on `main`.

**Resolved (2026-03-26):**
- **Security:** Path traversal (R2-1), extension allowlist (R2-2) — cover extraction hardened
- **Sanitization:** DOMPurify removed, ammonia sole sanitizer (R2-3, R1-4 N/A)
- **Performance:** Base64 replaced with asset protocol (R3-1), zip opened once during import (R3-2), pool config (R2-7), import size guard (R3-8)
- **Accessibility:** Focus outlines (R1-3), disabled contrast (R1-2, R1-10), TOC focus trap (R1-5), slider aria (R1-7), keyboard conflicts (R1-1), search focus (R1-6), delete overlay a11y (R1-8)
- **UX:** Friendly errors (R4-3), delete overlay with title (R4-1), import overlay (R1-9), bookmarks UI (R5-1), save feedback (R4-4), search state cleanup (R4-6), import race prevention (R4-7), title tooltips (R4-2)
- **Backend:** DB index (R2-4), progress validation (R2-5, R2-6), cover error logging (R2-10), scroll race fix (R3-5), file existence check (R3-3)
- **Reclassified:** R5-3 (text selection) confirmed as false positive — feature already exists

**Remaining Warnings (5 OPEN — deferred, larger scope):**
- R2-8 — Image rewriting uses string matching, not HTML parser
- R4-9 — TOC sidebar needs virtual scroll for books with hundreds of chapters
- R5-5 — Chapter title fallback should extract headings from chapter HTML
- R5-6 — Book language/description fields not displayed in UI
- R5-7 — Progress tracking is viewport-relative, breaks on font/window size changes
