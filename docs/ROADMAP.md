# Ebook Reader — Feature Roadmap

## Phase 1: Foundation (Storage & Organization)

These features fix core limitations and unlock future work.

### 1. Copy-on-Import with Configurable Library Folder
- On import, copy the file into an app-managed library directory
- Add a setting for the destination folder (default: `~/Documents/Folio Library/` or platform equivalent)
- Allow changing the folder in settings — existing files should be migrated when the folder changes
- Existing books imported by path-reference should be migrated on first run (or offer a one-time prompt)
- This is the foundation for remote files, backup/export, and general reliability
- *Prerequisite for: Remote Files, Library Export/Backup*

### 2. Collections *(ticket already written)*
- Manual and automated collections, sidebar, drag-and-drop, icons/colors

### 3. Sort & Filter Options
- Sort library by: date added, last read, author, title, progress, format
- Filter by: format, reading status (unread/in progress/finished)
- Pairs naturally with collections — filters in the main view, collections in the sidebar

### 4. Tags
- Lightweight freeform labels orthogonal to collections (e.g., "to-read", "favorites", "borrowed", "lent-to-sarah")
- Autocomplete from existing tags when assigning
- Filterable in library view

## Phase 2: Reading Experience

Improve the core activity — actually reading books.

### 5. Annotations & Highlights
- Inline text highlighting with color choices
- Notes attached to highlights
- Highlights panel/sidebar in reader
- Export annotations as Markdown or plain text

### 6. Book Metadata Editing
- Edit title, author, and cover image for any book
- Useful for poorly-formatted EPUBs or CBZ files with no metadata

### 7. Keyboard Shortcuts
- Library: navigate grid, open book, search, toggle sidebar
- Reader: page navigation, toggle TOC, create bookmark
- Display shortcut hints or a help overlay (e.g., `?` key)

### 8. Dictionary / Word Lookup
- Select a word in the reader to get a definition
- Use an offline dictionary or system dictionary API
- Optional: link to online dictionaries

### 9. Text-to-Speech
- Read current chapter aloud using system TTS
- Play/pause, skip forward/back, speed control
- Highlight current sentence as it's read

## Phase 3: Import & Sync

Expand where books come from and how they persist.

### 10. Remote Files
- Google Drive, Dropbox integration (OAuth flows)
- Direct URL import (paste a link, app downloads the file)
- OPDS catalog browsing (many free ebook sources use this protocol)
- Downloads into the library folder from Phase 1

### 11. Bulk Import
- Scan a folder recursively for supported formats (.epub, .cbz, .cbr, .pdf)
- Preview what will be imported, skip duplicates
- Progress indicator for large imports

### 12. Library Export / Backup
- Export full library: DB + book files as a zip archive
- Import from a backup archive
- Useful for migration between machines

### 13. Book Discovery & Catalog Search
- Search free/legal ebook catalogs directly from the app and one-click import into library
- Two search modes:
  - **Browse by catalog:** select a source (e.g., Project Gutenberg, Standard Ebooks), then browse/search within it
  - **Unified search:** search by title/author across all configured catalogs at once, see aggregated results
- One-click download & import: book goes straight into the library folder
- Built on OPDS (Open Publication Distribution System) — the standard protocol used by most free ebook sources
- Known OPDS-compatible sources: Project Gutenberg, Standard Ebooks, Internet Archive, ManyBooks, Feedbooks
- Allow users to add custom OPDS catalog URLs (for self-hosted Calibre servers, etc.)
- Show available formats per result, prefer EPUB when available
- *Depends on: Copy-on-Import*

### 14. Reading Position Sync
- Sync progress, bookmarks, and highlights across devices
- Needs a sync backend (could piggyback on Google Drive / Dropbox, or a lightweight custom server)
- Conflict resolution for divergent progress
- *Depends on: Remote Files*

## Phase 4: Discovery & Social

### 15. Reading Stats / Dashboard
- Time spent reading (track session duration)
- Pages/chapters per day, books finished per month
- Reading streaks, yearly goal
- Visual dashboard with charts

### 16. Goodreads / OpenLibrary Integration
- Pull richer metadata: descriptions, genres, ratings, cover art
- Auto-match books by ISBN or title+author
- Optional: sync reading status to Goodreads

### 17. Recently Opened
- Quick-access section at the top of the library: last 3-5 books read
- One-click to resume where you left off
- Low effort, nice quality-of-life win (could be moved earlier if desired)

### 18. Share Collections
- Export a collection as a shareable reading list (title, author, optional notes)
- Format: Markdown, JSON, or a shareable link
- Import a shared list to see which books you have/are missing

### 19. Book Recommendations
- "If you liked X" suggestions based on your library and reading patterns
- Could use OpenLibrary subjects/genres or an LLM-based approach
- Lower priority — needs a critical mass of books to be useful

## Phase 5: Multi-User

### 20. Multiple Libraries / Profiles
- Separate libraries for different users or contexts (work vs. personal)
- Each profile has its own library folder, collections, settings, progress
- Profile switcher in the app

## Summary

| Phase | Features | Theme |
|-------|----------|-------|
| 1 | Copy-on-Import, Collections, Sort/Filter, Tags | Storage & organization |
| 2 | Highlights, Metadata Edit, Keyboard Shortcuts, Dictionary, TTS | Reading experience |
| 3 | Remote Files, Bulk Import, Backup, Book Discovery, Position Sync | Import & sync |
| 4 | Stats, Goodreads, Recents, Share, Recommendations | Discovery & social |
| 5 | Multiple Profiles | Multi-user |
