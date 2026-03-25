import { useEffect, useRef } from "react";
import { useTheme, MIN_FONT_SIZE, MAX_FONT_SIZE } from "../context/ThemeContext";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { mode, setMode, fontSize, setFontSize, fontFamily, setFontFamily } =
    useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement as HTMLElement;
    requestAnimationFrame(() => panelRef.current?.focus());

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Reading settings"
        aria-modal="true"
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 w-80 max-w-[90vw] bg-surface border-l border-warm-border z-50 flex flex-col shadow-[-4px_0_24px_-4px_rgba(44,34,24,0.12)] outline-none animate-slide-in-right"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-warm-border flex items-center justify-between">
          <h2 className="font-serif text-base font-semibold text-ink">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink transition-colors rounded"
            aria-label="Close settings"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-7">
          {/* Theme */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
              Appearance
            </h3>
            <div className="flex gap-1 bg-warm-subtle rounded-xl p-1">
              {(["light", "dark", "system"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setMode(option)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg capitalize transition-all duration-150 ${
                    mode === option
                      ? "bg-surface text-ink shadow-sm font-medium"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>

          {/* Font size */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
              Font Size
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFontSize(fontSize - 1)}
                disabled={fontSize <= MIN_FONT_SIZE}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-warm-subtle text-ink-muted hover:text-ink hover:bg-warm-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
                aria-label="Decrease font size"
              >
                −
              </button>
              <div className="flex-1 flex flex-col items-center gap-1">
                <input
                  type="range"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-accent"
                  aria-label="Font size"
                />
                <span className="text-xs text-ink-muted tabular-nums">
                  {fontSize}px
                </span>
              </div>
              <button
                onClick={() => setFontSize(fontSize + 1)}
                disabled={fontSize >= MAX_FONT_SIZE}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-warm-subtle text-ink-muted hover:text-ink hover:bg-warm-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
                aria-label="Increase font size"
              >
                +
              </button>
            </div>
          </section>

          {/* Font family */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
              Reading Font
            </h3>
            <div className="flex gap-1 bg-warm-subtle rounded-xl p-1">
              {(["serif", "sans-serif"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setFontFamily(option)}
                  className={`flex-1 px-3 py-2.5 text-sm rounded-lg transition-all duration-150 ${
                    fontFamily === option
                      ? "bg-surface text-ink shadow-sm font-medium"
                      : "text-ink-muted hover:text-ink"
                  }`}
                  style={{
                    fontFamily:
                      option === "serif"
                        ? '"Lora", Georgia, serif'
                        : '"DM Sans", system-ui, sans-serif',
                  }}
                >
                  {option === "serif" ? "Lora" : "DM Sans"}
                </button>
              ))}
            </div>
            <p
              className="mt-3 text-sm text-ink-muted leading-relaxed"
              style={{
                fontFamily:
                  fontFamily === "serif"
                    ? '"Lora", Georgia, serif'
                    : '"DM Sans", system-ui, sans-serif',
              }}
            >
              The quick brown fox jumps over the lazy dog.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
