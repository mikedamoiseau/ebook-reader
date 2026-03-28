# Series Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group books by series in the sidebar (click to filter) and in the library grid (series sort option with group headers).

**Architecture:** Add a `list_series` DB query and `get_series` Tauri command returning series with 2+ books. Sidebar gets a "Series" section below collections. Library sort options gain a "Series" entry that groups books under series headers. All uses existing `series`/`volume` columns — no schema changes.

**Tech Stack:** Rust (SQLite, Tauri commands), React 19, TypeScript, Tailwind CSS v4

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/models.rs` | Add `SeriesInfo` struct |
| Modify | `src-tauri/src/db.rs` | Add `list_series` query |
| Modify | `src-tauri/src/commands.rs` | Add `get_series` command |
| Modify | `src-tauri/src/lib.rs` | Register `get_series` in invoke_handler |
| Modify | `src/components/CollectionsSidebar.tsx` | Add series section with props |
| Modify | `src/screens/Library.tsx` | Add series state, sort option, grouped rendering |

---

### Task 1: Add `SeriesInfo` model and `list_series` DB function (TDD)

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Write failing test for `list_series`**

Add to the `#[cfg(test)]` module in `src-tauri/src/db.rs`:

```rust
    #[test]
    fn test_list_series() {
        let (_dir, conn) = setup();

        // Insert books with series
        let mut book1 = sample_book("s1");
        book1.series = Some("Dune".to_string());
        book1.volume = Some(1);
        insert_book(&conn, &book1).unwrap();

        let mut book2 = sample_book("s2");
        book2.series = Some("Dune".to_string());
        book2.volume = Some(2);
        insert_book(&conn, &book2).unwrap();

        let mut book3 = sample_book("s3");
        book3.series = Some("Foundation".to_string());
        book3.volume = Some(1);
        insert_book(&conn, &book3).unwrap();

        // Single book in series — should NOT appear (threshold is 2+)
        let mut book4 = sample_book("s4");
        book4.series = Some("Neuromancer".to_string());
        book4.volume = Some(1);
        insert_book(&conn, &book4).unwrap();

        // Book without series
        let book5 = sample_book("s5");
        insert_book(&conn, &book5).unwrap();

        let series = list_series(&conn).unwrap();
        assert_eq!(series.len(), 1); // Only "Dune" has 2+ books
        assert_eq!(series[0].name, "Dune");
        assert_eq!(series[0].count, 2);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test test_list_series -- --nocapture 2>&1 | tail -10`

Expected: compile error — `SeriesInfo` and `list_series` not found.

- [ ] **Step 3: Add `SeriesInfo` struct to models.rs**

Add after the `CustomFont` struct (after line 152) in `src-tauri/src/models.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesInfo {
    pub name: String,
    pub count: i64,
}
```

- [ ] **Step 4: Add `list_series` function to db.rs**

Add before `#[cfg(test)]` in `src-tauri/src/db.rs`. Also add `SeriesInfo` to the `use crate::models::` import.

```rust
pub fn list_series(conn: &Connection) -> Result<Vec<SeriesInfo>> {
    let mut stmt = conn.prepare(
        "SELECT series, COUNT(*) as count FROM books
         WHERE series IS NOT NULL AND series != ''
         GROUP BY series HAVING count >= 2
         ORDER BY series ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(SeriesInfo {
            name: row.get(0)?,
            count: row.get(1)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 5: Run test**

Run: `cd src-tauri && cargo test test_list_series -- --nocapture 2>&1`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/db.rs
git commit -m "feat(series): add SeriesInfo model and list_series DB function"
```

---

### Task 2: Add `get_series` Tauri command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `get_series` command**

Add after `remove_custom_font` in `src-tauri/src/commands.rs`. Also add `SeriesInfo` to the `use crate::models::` import.

```rust
#[tauri::command]
pub async fn get_series(
    state: State<'_, AppState>,
) -> Result<Vec<SeriesInfo>, String> {
    let conn = state.active_db()?.get().map_err(|e| e.to_string())?;
    db::list_series(&conn).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register in invoke_handler**

In `src-tauri/src/lib.rs`, add after `commands::remove_custom_font,`:

```rust
            commands::get_series,
```

- [ ] **Step 3: Verify compilation and run tests**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`

Expected: no errors.

Run: `cd src-tauri && cargo clippy -- -D warnings 2>&1 | tail -5`

Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(series): add get_series Tauri command"
```

---

### Task 3: Add series section to CollectionsSidebar

**Files:**
- Modify: `src/components/CollectionsSidebar.tsx`

- [ ] **Step 1: Add series props to the component**

Update the `CollectionsSidebarProps` interface (lines 32-42) to add series-related props:

```typescript
interface CollectionsSidebarProps {
  open: boolean;
  collections: Collection[];
  activeCollectionId: string | null;
  activeSeries: string | null;
  seriesList: Array<{ name: string; count: number }>;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onSelectSeries: (name: string | null) => void;
  onCreate: (data: CreateCollectionData) => void | Promise<void>;
  onEdit: (id: string, data: CreateCollectionData) => void | Promise<void>;
  onDelete: (id: string) => void;
  onDropBook: (bookId: string, collectionId: string) => void;
}
```

Update the destructured props in the component function signature to include `activeSeries`, `seriesList`, and `onSelectSeries`.

- [ ] **Step 2: Update "All Books" to clear both collection and series**

In the "All Books" button (around line 651-669), update the `onClick` and active state:

```tsx
<button
  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
    activeCollectionId === null && activeSeries === null
      ? "bg-accent-light text-accent font-medium"
      : "text-ink-muted hover:text-ink hover:bg-warm-subtle"
  }`}
  onClick={() => { onSelect(null); onSelectSeries(null); }}
>
```

- [ ] **Step 3: Add series section after collections**

After the collections list and before the closing `</aside>` or the create collection form, add:

```tsx
{/* Series section */}
{seriesList.length > 0 && (
  <>
    <div className="mx-3 my-1 border-t border-warm-border" />
    <div className="px-3 pt-2 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Series
      </span>
    </div>
    {seriesList.map((s) => (
      <button
        key={s.name}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
          activeSeries === s.name
            ? "bg-accent-light text-accent font-medium"
            : "text-ink-muted hover:text-ink hover:bg-warm-subtle"
        }`}
        onClick={() => {
          onSelect(null);
          onSelectSeries(s.name);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
          <path d="M4 4h3v12H4zM9 4h3v12H9zM14 6h3v8h-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 text-left truncate">{s.name}</span>
        <span className="text-[10px] text-ink-muted/60 tabular-nums">{s.count}</span>
      </button>
    ))}
  </>
)}
```

- [ ] **Step 4: Make collection clicks clear series selection**

In the collection row rendering (where `onSelect` is called for a collection), ensure clicking a collection also clears the series. This is handled in Library.tsx (the parent), not here — the sidebar just calls `onSelect(collectionId)` which the parent uses to clear series state.

No change needed in the sidebar — the parent (Library.tsx) handles mutual exclusivity.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check 2>&1 | tail -10`

Expected: errors about missing props on `CollectionsSidebar` usage in Library.tsx — this is expected and will be fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/components/CollectionsSidebar.tsx
git commit -m "feat(series): add series section to CollectionsSidebar"
```

---

### Task 4: Add series state, sort option, and grouped rendering to Library

**Files:**
- Modify: `src/screens/Library.tsx`

- [ ] **Step 1: Add series state and data loading**

Near the existing `activeCollectionId` state (around line 76), add:

```typescript
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<Array<{ name: string; count: number }>>([]);
```

Add a loader function near other data loaders:

```typescript
  const loadSeries = useCallback(async () => {
    try {
      const list = await invoke<Array<{ name: string; count: number }>>("get_series");
      setSeriesList(list);
    } catch {
      // non-fatal
    }
  }, []);
```

Call `loadSeries()` alongside `loadBooks()` in the existing load effects (where `loadBooks` is called on mount/profile change). Find the main useEffect that calls `loadBooks()` and add `loadSeries()` there.

- [ ] **Step 2: Add "series" to sort options**

Update the sort state type (line 34) to include `"series"`:

```typescript
const [sortBy, setSortBy] = useState<"date_added" | "last_read" | "title" | "author" | "progress" | "rating" | "series">(() => {
  const stored = localStorage.getItem("folio-library-sort-by");
  if (stored === "date_added" || stored === "last_read" || stored === "title" || stored === "author" || stored === "progress" || stored === "rating" || stored === "series") return stored;
  return "date_added";
});
```

Add `"series"` to the sort button array (around line 553) and the labels object:

In the array: `{(["date_added", "title", "author", "last_read", "progress", "rating", "series"] as const).map(...)}`

In the labels: add `series: "Series"`.

- [ ] **Step 3: Handle series filtering when a series is selected in the sidebar**

In the filtering logic (around lines 306-324), add series filtering. After the existing filters, add:

```typescript
    // Series filter (sidebar)
    .filter((book) => {
      if (!activeSeries) return true;
      return book.series === activeSeries;
    })
```

- [ ] **Step 4: Handle mutual exclusivity between collection and series selection**

When setting `activeCollectionId`, clear `activeSeries`:

Find where `setActiveCollectionId` is called from the sidebar's `onSelect` callback and add `setActiveSeries(null)` alongside it.

When setting `activeSeries`, clear `activeCollectionId`:

The `onSelectSeries` callback should set `setActiveSeries(name)` and `setActiveCollectionId(null)`. When a series is selected, also reload books without collection filter:

```typescript
  const handleSelectSeries = useCallback((name: string | null) => {
    setActiveSeries(name);
    setActiveCollectionId(null);
    loadBooks(null); // Load all books (no collection filter)
  }, [loadBooks]);
```

- [ ] **Step 5: Update sorting implementation for "series" mode**

In the `.sort()` callback (around lines 325-336), the "series" case doesn't need special sorting because the grouped rendering handles display order. But we need to sort for the non-grouped case too. Add:

```typescript
    case "series": {
      // Sort by series name, then volume, then title
      const sa = a.series ?? "";
      const sb = b.series ?? "";
      if (sa !== sb) return sa.localeCompare(sb);
      const va = a.volume ?? 9999;
      const vb = b.volume ?? 9999;
      if (va !== vb) return va - vb;
      return a.title.localeCompare(b.title);
    }
```

Note: `sortAsc` direction is not applied here because the grouped rendering handles its own ordering. Books without series sort to the end (empty string sorts first alphabetically, but we handle this in rendering).

- [ ] **Step 6: Update book grid rendering for series grouping**

Replace the book grid rendering section. When `sortBy === "series"`, render grouped; otherwise render flat as today.

The grid rendering (around lines 781-823) should be wrapped:

```tsx
{sortBy === "series" ? (
  // Grouped by series
  (() => {
    const seriesBooks = filtered.filter((b) => b.series);
    const nonSeriesBooks = filtered.filter((b) => !b.series);

    // Group by series name
    const groups: Record<string, typeof filtered> = {};
    for (const book of seriesBooks) {
      const key = book.series!;
      (groups[key] ??= []).push(book);
    }

    // Sort within each group by volume then title
    for (const books of Object.values(groups)) {
      books.sort((a, b) => {
        const va = a.volume ?? 9999;
        const vb = b.volume ?? 9999;
        if (va !== vb) return va - vb;
        return a.title.localeCompare(b.title);
      });
    }

    // Sort group names alphabetically
    const sortedGroupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

    return (
      <>
        {sortedGroupNames.map((seriesName) => (
          <div key={seriesName}>
            <div className="col-span-full flex items-center gap-2 pt-4 pb-2">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
                {seriesName}
              </span>
              <span className="text-[10px] text-ink-muted/50">
                {groups[seriesName].length} books
              </span>
              <div className="flex-1 border-t border-warm-border/50" />
            </div>
            {groups[seriesName].map((book) => (
              <div
                key={book.id}
                onMouseDown={() => startDrag(book.id, book.cover_path ? convertFileSrc(book.cover_path) : undefined)}
                onMouseUp={() => endDrag()}
                onDragStart={(e) => e.preventDefault()}
              >
                <BookCard
                  id={book.id}
                  title={book.title}
                  author={book.author}
                  coverPath={book.cover_path}
                  totalChapters={book.total_chapters}
                  format={book.format}
                  progress={progressMap[book.id] ?? 0}
                  language={book.language}
                  publishYear={book.publish_year}
                  series={book.series}
                  volume={book.volume}
                  rating={book.rating}
                  onClick={() => navigate(`/reader/${book.id}`)}
                  onDelete={handleRemoveBook}
                  onInfo={(id) => {
                    const b = books.find((bk) => bk.id === id);
                    if (b) setDetailBook(b);
                  }}
                  onRemoveFromCollection={
                    isManualCollectionView && activeCollectionId
                      ? async () => {
                          await invoke("remove_book_from_collection", {
                            bookId: book.id,
                            collectionId: activeCollectionId,
                          });
                          await loadBooks(activeCollectionId);
                        }
                      : undefined
                  }
                  isScanning={scanningBookId === book.id}
                />
              </div>
            ))}
          </div>
        ))}
        {nonSeriesBooks.length > 0 && sortedGroupNames.length > 0 && (
          <div className="col-span-full flex items-center gap-2 pt-4 pb-2">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Other Books
            </span>
            <span className="text-[10px] text-ink-muted/50">
              {nonSeriesBooks.length} books
            </span>
            <div className="flex-1 border-t border-warm-border/50" />
          </div>
        )}
        {nonSeriesBooks.map((book) => (
          <div
            key={book.id}
            onMouseDown={() => startDrag(book.id, book.cover_path ? convertFileSrc(book.cover_path) : undefined)}
            onMouseUp={() => endDrag()}
            onDragStart={(e) => e.preventDefault()}
          >
            <BookCard
              id={book.id}
              title={book.title}
              author={book.author}
              coverPath={book.cover_path}
              totalChapters={book.total_chapters}
              format={book.format}
              progress={progressMap[book.id] ?? 0}
              language={book.language}
              publishYear={book.publish_year}
              series={book.series}
              volume={book.volume}
              rating={book.rating}
              onClick={() => navigate(`/reader/${book.id}`)}
              onDelete={handleRemoveBook}
              onInfo={(id) => {
                const b = books.find((bk) => bk.id === id);
                if (b) setDetailBook(b);
              }}
              onRemoveFromCollection={undefined}
              isScanning={scanningBookId === book.id}
            />
          </div>
        ))}
      </>
    );
  })()
) : (
  /* Existing flat grid rendering — keep as-is */
  filtered.map((book) => (
    <div
      key={book.id}
      onMouseDown={() => startDrag(book.id, book.cover_path ? convertFileSrc(book.cover_path) : undefined)}
      onMouseUp={() => endDrag()}
      onDragStart={(e) => e.preventDefault()}
    >
      <BookCard
        id={book.id}
        title={book.title}
        author={book.author}
        coverPath={book.cover_path}
        totalChapters={book.total_chapters}
        format={book.format}
        progress={progressMap[book.id] ?? 0}
        language={book.language}
        publishYear={book.publish_year}
        series={book.series}
        volume={book.volume}
        rating={book.rating}
        onClick={() => navigate(`/reader/${book.id}`)}
        onDelete={handleRemoveBook}
        onInfo={(id) => {
          const b = books.find((bk) => bk.id === id);
          if (b) setDetailBook(b);
        }}
        onRemoveFromCollection={
          isManualCollectionView && activeCollectionId
            ? async () => {
                await invoke("remove_book_from_collection", {
                  bookId: book.id,
                  collectionId: activeCollectionId,
                });
                await loadBooks(activeCollectionId);
              }
            : undefined
        }
        isScanning={scanningBookId === book.id}
      />
    </div>
  ))
)}
```

- [ ] **Step 7: Pass series props to CollectionsSidebar**

Update the `<CollectionsSidebar>` rendering to pass the new props:

```tsx
<CollectionsSidebar
  open={sidebarOpen}
  collections={collections}
  activeCollectionId={activeCollectionId}
  activeSeries={activeSeries}
  seriesList={seriesList}
  onClose={() => setSidebarOpen(false)}
  onSelect={handleSelectCollection}
  onSelectSeries={handleSelectSeries}
  onCreate={handleCreateCollection}
  onEdit={handleEditCollection}
  onDelete={handleDeleteCollection}
  onDropBook={handleDropBook}
/>
```

- [ ] **Step 8: Activate series sort when sidebar series is clicked**

In the `handleSelectSeries` callback, also set `sortBy` to `"series"` when a series is selected, so the grid shows the series-grouped view:

```typescript
  const handleSelectSeries = useCallback((name: string | null) => {
    setActiveSeries(name);
    setActiveCollectionId(null);
    if (name) setSortBy("series");
    loadBooks(null);
  }, [loadBooks]);
```

- [ ] **Step 9: Run type-check**

Run: `npm run type-check 2>&1 | tail -10`

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/screens/Library.tsx
git commit -m "feat(series): add series sort, sidebar integration, and grouped grid rendering"
```

---

### Task 5: Final verification and roadmap update

**Files:** None (verification only) + `docs/ROADMAP.md`

- [ ] **Step 1: Run full Rust test suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`

Expected: all tests pass.

- [ ] **Step 2: Run clippy and fmt**

Run: `cd src-tauri && cargo clippy -- -D warnings 2>&1 | tail -5 && cargo fmt --check`

Expected: clean.

- [ ] **Step 3: Run frontend checks**

Run: `npm run type-check 2>&1 | tail -5 && npm run test 2>&1 | tail -5`

Expected: all pass.

- [ ] **Step 4: Update ROADMAP.md**

Update feature 32 from:

```markdown
#### 32. Series Grouping
- Automatically group books that share series metadata (from OpenLibrary enrichment)
- Display series books in order within the library
- Lightweight extension of existing collections + OpenLibrary integration
```

to:

```markdown
#### 32. Series Grouping — **Done**
- ~~Automatically group books that share series metadata~~
- ~~Series section in sidebar: click to filter library to a series~~
- ~~"Series" sort option in library grid: groups books under series headers, sorted by volume~~
- ~~Series with 2+ books shown; non-series books displayed after series groups~~
```

Also update the Phase 8 summary table from `11 done` to `12 done`.

- [ ] **Step 5: Update user guide**

Add a brief section about series grouping in `docs/USER_GUIDE.md` near the collections/sort documentation.

- [ ] **Step 6: Commit**

```bash
git add docs/ROADMAP.md docs/USER_GUIDE.md
git commit -m "docs: mark series grouping as done, update user guide"
```
