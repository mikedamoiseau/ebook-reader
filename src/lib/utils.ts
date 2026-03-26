/**
 * Pure utility functions extracted for testability.
 */

/** Format seconds into human-readable duration (e.g. "5s", "12m", "2h 30m"). */
export function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export interface BookLike {
  id: string;
  title: string;
  author: string;
  format: string;
  added_at: number;
}

/** Filter books by search query, format, and reading status. */
export function filterBooks<T extends BookLike>(
  books: T[],
  search: string,
  filterFormat: string,
  filterStatus: string,
  progressMap: Record<string, number>,
): T[] {
  return books.filter((book) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !book.title.toLowerCase().includes(q) &&
        !book.author.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterFormat !== "all" && book.format !== filterFormat) return false;
    if (filterStatus !== "all") {
      const pct = progressMap[book.id] ?? 0;
      if (filterStatus === "unread" && pct !== 0) return false;
      if (filterStatus === "in_progress" && (pct === 0 || pct >= 100))
        return false;
      if (filterStatus === "finished" && pct < 100) return false;
    }
    return true;
  });
}

export type SortField =
  | "title"
  | "author"
  | "last_read"
  | "progress"
  | "date_added";

/** Sort books by the given field and direction. */
export function sortBooks<T extends BookLike>(
  books: T[],
  sortBy: SortField,
  sortAsc: boolean,
  progressMap: Record<string, number>,
  lastReadMap: Record<string, number>,
): T[] {
  const dir = sortAsc ? 1 : -1;
  return [...books].sort((a, b) => {
    switch (sortBy) {
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "author":
        return dir * a.author.localeCompare(b.author);
      case "last_read":
        return (
          dir * ((lastReadMap[a.id] ?? 0) - (lastReadMap[b.id] ?? 0))
        );
      case "progress":
        return (
          dir * ((progressMap[a.id] ?? 0) - (progressMap[b.id] ?? 0))
        );
      case "date_added":
      default:
        return dir * (a.added_at - b.added_at);
    }
  });
}

/** Group items by a key extracted from each item. */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string | number,
): Record<string | number, T[]> {
  return items.reduce<Record<string | number, T[]>>((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
}

/** Clamp a number between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const SUPPORTED_EXTENSIONS = [".epub", ".cbz", ".cbr", ".pdf"];

/** Check if a filename has a supported ebook extension. */
export function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
