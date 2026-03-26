/**
 * Shared drag state for book-to-collection drag operations.
 * Uses a module-level variable so both Library and CollectionsSidebar
 * can access it without React context overhead.
 */
let draggedBookId: string | null = null;

export function startDrag(bookId: string) {
  draggedBookId = bookId;
}

export function endDrag() {
  draggedBookId = null;
}

export function getDraggedBookId(): string | null {
  return draggedBookId;
}
