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

  // Focus trap and escape key
  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement as HTMLElement;

    // Focus the panel
    requestAnimationFrame(() => panelRef.current?.focus());

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Trap focus within the panel
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
        className="fixed inset-0 bg-black/30 z-40"
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
        className="fixed right-0 top-0 bottom-0 w-80 max-w-[90vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col shadow-xl outline-none transition-transform"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            aria-label="Close settings"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Theme */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Theme
            </h3>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {(["light", "dark", "system"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setMode(option)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                    mode === option
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>

          {/* Font size */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Font Size
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFontSize(fontSize - 1)}
                disabled={fontSize <= MIN_FONT_SIZE}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
                aria-label="Decrease font size"
              >
                −
              </button>
              <div className="flex-1 flex flex-col items-center">
                <input
                  type="range"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-blue-500"
                  aria-label="Font size"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                  {fontSize}px
                </span>
              </div>
              <button
                onClick={() => setFontSize(fontSize + 1)}
                disabled={fontSize >= MAX_FONT_SIZE}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
                aria-label="Increase font size"
              >
                +
              </button>
            </div>
          </section>

          {/* Font family */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Font Family
            </h3>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {(["serif", "sans-serif"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setFontFamily(option)}
                  className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                    fontFamily === option
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  }`}
                  style={{ fontFamily: option === "serif" ? "Georgia, serif" : "system-ui, sans-serif" }}
                >
                  {option === "serif" ? "Serif" : "Sans-serif"}
                </button>
              ))}
            </div>
            <p
              className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed"
              style={{
                fontFamily:
                  fontFamily === "serif"
                    ? "Georgia, serif"
                    : "system-ui, sans-serif",
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
