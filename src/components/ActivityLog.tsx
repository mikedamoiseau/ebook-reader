import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ActivityEntry {
  id: string;
  timestamp: number; // Unix seconds
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  detail: string | null;
}

interface ActivityLogProps {
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  book_imported: "Book Imported",
  book_deleted: "Book Deleted",
  book_updated: "Book Updated",
  book_enriched: "Book Enriched",
  book_scanned: "Metadata Scan",
  collection_created: "Collection Created",
  collection_deleted: "Collection Deleted",
  collection_modified: "Collection Modified",
  library_exported: "Library Exported",
  library_imported: "Library Imported",
  backup_completed: "Backup Completed",
  profile_switched: "Profile Switched",
};

const ACTION_ICONS: Record<string, string> = {
  book_imported: "+",
  book_deleted: "−",
  book_updated: "✎",
  book_enriched: "✦",
  book_scanned: "◈",
  collection_created: "+",
  collection_deleted: "−",
  collection_modified: "✎",
  library_exported: "↑",
  library_imported: "↓",
  backup_completed: "☁",
  profile_switched: "⇄",
};

const FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "book_imported", label: "Book Imported" },
  { value: "book_deleted", label: "Book Deleted" },
  { value: "book_updated", label: "Book Updated" },
  { value: "book_enriched", label: "Book Enriched" },
  { value: "book_scanned", label: "Metadata Scan" },
  { value: "collection_created", label: "Collection Created" },
  { value: "collection_deleted", label: "Collection Deleted" },
  { value: "collection_modified", label: "Collection Modified" },
  { value: "library_exported", label: "Library Exported" },
  { value: "library_imported", label: "Library Imported" },
  { value: "backup_completed", label: "Backup Completed" },
  { value: "profile_switched", label: "Profile Switched" },
];

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;

  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const LIMIT = 50;

export default function ActivityLog({ onClose }: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const loadEntries = useCallback(
    async (filter: string, currentOffset: number, append: boolean) => {
      setLoading(true);
      try {
        const results = await invoke<ActivityEntry[]>("get_activity_log", {
          limit: LIMIT,
          offset: currentOffset,
          actionFilter: filter || null,
        });
        if (append) {
          setEntries((prev) => [...prev, ...results]);
        } else {
          setEntries(results);
        }
        setHasMore(results.length === LIMIT);
      } catch (e) {
        console.error("Failed to load activity log:", e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setOffset(0);
    loadEntries(actionFilter, 0, false);
  }, [actionFilter, loadEntries]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    loadEntries(actionFilter, newOffset, true);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 z-[60]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        role="dialog"
        aria-label="Activity Log"
        aria-modal="true"
      >
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg border border-warm-border flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between shrink-0">
            <h2 className="font-serif text-base font-semibold text-ink">
              Activity Log
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-ink-muted hover:text-ink transition-colors rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="Close activity log"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path
                  d="M15 5L5 15M5 5l10 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Filter */}
          <div className="px-5 py-3 border-b border-warm-border shrink-0">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full bg-warm-subtle text-sm text-ink rounded-xl px-3 py-2 border border-warm-border focus:outline-none focus:border-accent cursor-pointer"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-y-auto">
            {loading && entries.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-ink-muted text-sm">
                Loading…
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-ink-muted text-sm">
                No activity recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-warm-border">
                {entries.map((entry) => {
                  const icon = ACTION_ICONS[entry.action] ?? "·";
                  const label =
                    ACTION_LABELS[entry.action] ?? entry.action;
                  const timeStr = formatRelativeTime(entry.timestamp);

                  return (
                    <li
                      key={entry.id}
                      className="px-5 py-3 flex items-start gap-3 hover:bg-warm-subtle transition-colors"
                    >
                      {/* Icon */}
                      <span
                        className="mt-0.5 w-6 h-6 flex items-center justify-center rounded-full bg-warm-subtle text-ink-muted text-xs shrink-0"
                        aria-hidden="true"
                      >
                        {icon}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-ink">
                            {label}
                          </span>
                          <span className="text-xs text-ink-muted shrink-0 tabular-nums">
                            {timeStr}
                          </span>
                        </div>
                        {entry.entityName && (
                          <p className="text-xs text-ink-muted mt-0.5 truncate">
                            {entry.entityName}
                          </p>
                        )}
                        {entry.detail && (
                          <p className="text-xs text-ink-muted/70 mt-0.5 truncate">
                            {entry.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Load more */}
            {hasMore && !loading && (
              <div className="px-5 py-3 border-t border-warm-border">
                <button
                  onClick={handleLoadMore}
                  className="w-full px-3 py-2 text-sm text-ink-muted hover:text-ink bg-warm-subtle hover:bg-warm-border rounded-xl transition-colors"
                >
                  Load more
                </button>
              </div>
            )}

            {loading && entries.length > 0 && (
              <div className="px-5 py-3 text-center text-xs text-ink-muted">
                Loading…
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
