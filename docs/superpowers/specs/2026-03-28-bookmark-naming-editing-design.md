# Bookmark Naming & Editing

## Overview

Add the ability to name bookmarks — optionally at creation time via an expand-in-place toast, and later via inline editing in the bookmarks panel. Unnamed bookmarks continue to work exactly as today.

## Data Model

Add a `name` column to the `bookmarks` table:

```sql
ALTER TABLE bookmarks ADD COLUMN name TEXT;
```

Update the `Bookmark` struct:

```rust
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub chapter_index: u32,
    pub scroll_position: f64,
    pub name: Option<String>,    // NEW
    pub note: Option<String>,
    pub created_at: i64,
}
```

The `note` field is left untouched for potential future use (annotating bookmarks with longer notes). `name` is the short label shown in the panel and toast.

No data migration needed — the app is not in use yet.

## Backend Changes

### New Command: `update_bookmark`

```rust
#[tauri::command]
pub async fn update_bookmark(
    bookmark_id: String,
    name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String>
```

- Updates `name` and `updated_at` on the bookmark row
- Empty string treated as `None` (clears the name)

### Modified: `add_bookmark`

No signature change. The `name` field is not set at creation time — the bookmark is created unnamed, then updated via `update_bookmark` if the user chooses to name it from the toast.

### Modified: `list_bookmarks`

Add `name` to the SELECT query so it's returned to the frontend.

### New DB function: `update_bookmark`

```rust
pub fn update_bookmark(conn: &Connection, id: &str, name: Option<&str>) -> Result<()>
```

Updates `name` and `updated_at` columns.

## Frontend: Toast with Expand-in-Place Naming

### Creation flow

1. User presses `b` — bookmark saved instantly, toast appears
2. Toast shows: **bookmark icon + "Bookmark saved" + "Add name..."** link
3. Toast auto-dismisses after **3 seconds** if no interaction (up from 1.5s)
4. If user clicks "Add name..." — the toast morphs:
   - "Bookmark saved · Add name..." text is replaced by a text input
   - Input is auto-focused
   - Small hint: "↵" shown to indicate Enter saves
5. **Enter** — saves the name via `update_bookmark(id, name)`, toast dismisses
6. **Escape** — dismisses toast without saving a name
7. After successful name save, toast briefly shows confirmation then dismisses

### State management

The `addBookmarkAtCurrentPosition` function already receives the created `Bookmark` object from the backend. Store it in state so the toast can reference the bookmark `id` when calling `update_bookmark`.

### Toast component

Extract the bookmark toast into its own component (currently inline JSX in Reader.tsx) to manage the expand/collapse state cleanly:

```
BookmarkToast({ bookmark, onDismiss, onNameSaved })
```

States: `confirmed` (showing "Bookmark saved") → `naming` (showing input) → dismissed.

## Frontend: Bookmarks Panel Inline Editing

### Display changes

- **Named bookmarks**: Name shown as primary text, "X% through" as secondary muted text below
- **Unnamed bookmarks**: Current display unchanged — "X% through" as primary text

### Inline editing

- Hover over a bookmark shows a subtle edit affordance (cursor changes to text cursor, or a small pencil icon)
- **Click** the bookmark's name/text area → text becomes an input field
  - Pre-filled with current name (or empty for unnamed bookmarks)
  - Auto-focused, text selected
- **Enter** or **blur** → saves via `update_bookmark(id, name)`
  - Empty input clears the name (reverts to showing "X% through")
- **Escape** → cancels edit, reverts to previous display
- Click event must not trigger navigation — editing and navigating are separate click targets (name area = edit, rest of row = navigate)

### Click target separation

The bookmark row needs two distinct click zones:
- **Name/text area** (left portion): triggers inline edit
- **Rest of the row** or a dedicated "Go" area: triggers navigation to bookmark position

Implementation: the name/text is wrapped in its own clickable element with `stopPropagation`. The row's `onClick` handles navigation. The delete button already uses `stopPropagation`.

## Keyboard Shortcuts

No new shortcuts. `b` continues to work as today (instant save). Naming is an optional mouse/touch interaction from the toast or panel.

Update the keyboard shortcuts help text if currently says just "Add bookmark" — no change needed, the description is still accurate.

## Scope Exclusions

- Per-book CSS override for bookmarks (out of scope)
- Bookmark search/filter within the panel (not needed yet)
- Bulk bookmark operations (not needed yet)
- Note editing (the `note` field exists but no UI for it in this feature)
