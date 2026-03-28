# Custom User Fonts

## Overview

Allow users to load their own TTF/OTF/WOFF2 font files and use them as the reading font in EPUBs. Custom fonts appear alongside the 3 built-in options (Lora, DM Sans, OpenDyslexic) in a single flat list in settings.

## Data Model & Storage

### Font files

User selects a font file via Tauri's file dialog (`.ttf`, `.otf`, `.woff2`). The app copies the font into `{app_data_dir}/fonts/{uuid}.{ext}` — same copy-on-import pattern as books.

### Database

New table in `db.rs::run_schema()`:

```sql
CREATE TABLE IF NOT EXISTS custom_fonts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

- `id`: UUID
- `name`: Display name derived from filename. Strip the file extension, then strip a trailing hyphen-separated style token if it matches a known suffix (Regular, Bold, Italic, Light, Medium, SemiBold, ExtraBold, Thin, Black, BoldItalic). Examples: "Merriweather-Regular.ttf" → "Merriweather", "Fira Code.otf" → "Fira Code", "MyFont-Bold.woff2" → "MyFont".
- `file_name`: Original filename (for reference)
- `file_path`: Absolute path to the copied font file in the app data dir
- `created_at`: Unix timestamp

No font parsing or metadata extraction — the filename is the display name.

## Backend Commands

### `import_custom_font`

1. Opens a file picker dialog filtered to `.ttf`, `.otf`, `.woff2`
2. Copies the selected file to `{app_data_dir}/fonts/{uuid}.{ext}`
3. Derives the display name from the filename
4. Inserts a row into `custom_fonts`
5. Returns the `CustomFont` record

### `get_custom_fonts`

Returns all rows from `custom_fonts` ordered by `created_at ASC`.

### `remove_custom_font(font_id)`

1. Looks up the font by ID to get the file path
2. Deletes the file from disk
3. Deletes the DB row

### Rust struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomFont {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub file_path: String,
    pub created_at: i64,
}
```

## Frontend: Font Loading

On app start and whenever fonts are added/removed, fetch `get_custom_fonts()` and inject `@font-face` rules into a `<style>` tag in `<head>`:

```css
@font-face {
    font-family: "CustomFont-{id}";
    src: url("asset://localhost/{file_path}");
    font-display: swap;
}
```

Uses the Tauri asset protocol to serve font files from the app data directory. The asset protocol is already configured with scope `$APPDATA/**`.

## Frontend: ThemeContext Changes

### FontFamily type

Expand from `"serif" | "sans-serif" | "dyslexic"` to `string`. The value is one of:
- `"serif"` — Lora (built-in)
- `"sans-serif"` — DM Sans (built-in)
- `"dyslexic"` — OpenDyslexic (built-in)
- `"custom:{font_id}"` — a user-added font

### Font CSS mapping

In `Reader.tsx`, the `fontFamilyCss` mapping adds a branch: if `fontFamily` starts with `"custom:"`, extract the ID and use `"CustomFont-{id}", serif` as the CSS font-family.

### Fallback on deletion

If the currently selected font is a custom font that gets deleted, reset `fontFamily` to `"serif"` (the default). Check this in the remove handler.

## Frontend: Settings UI

### Font picker

Replace the current 3-button layout with a scrollable list:

1. **Built-in fonts first**: Lora, DM Sans, OpenDyslexic — displayed as today (button with font preview)
2. **Custom fonts after**: Each row shows the font name in that font, with a small delete button (X) that appears on hover. Delete requires confirmation (inline "Delete?" / "Cancel" pattern, same as collection delete).
3. **"Add font..." button** at the bottom: triggers `import_custom_font`, refreshes the list on success
4. **Hint text** below the button: "Adding many fonts may slow down the app" in muted small text

The font preview sentence ("The quick brown fox...") below the picker continues to show the selected font.

### Layout

Each font option is a horizontal row (not a button grid) to accommodate longer font names and the delete action on custom fonts. Built-in fonts have no delete button.

## Scope Exclusions

- No font metadata parsing (no reading font tables for the real font family name)
- No per-book font assignment (global reading font only)
- No font weight/style variants management (user adds one file, it's used as-is)
- No font renaming in the UI
- Per-profile font storage not changed (font preference remains global via localStorage)
