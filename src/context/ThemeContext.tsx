import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
type FontFamily = "serif" | "sans-serif";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: FontFamily;
  setFontFamily: (family: FontFamily) => void;
}

const STORAGE_KEYS = {
  theme: "ebook-reader-theme",
  fontSize: "ebook-reader-font-size",
  fontFamily: "ebook-reader-font-family",
} as const;

export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 18;

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function loadStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  if (stored === "light" || stored === "dark" || stored === "system")
    return stored;
  return "system";
}

function loadStoredFontSize(): number {
  const stored = localStorage.getItem(STORAGE_KEYS.fontSize);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE)
      return parsed;
  }
  return DEFAULT_FONT_SIZE;
}

function loadStoredFontFamily(): FontFamily {
  const stored = localStorage.getItem(STORAGE_KEYS.fontFamily);
  if (stored === "serif" || stored === "sans-serif") return stored;
  return "serif";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadStoredMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [fontSize, setFontSizeState] = useState(loadStoredFontSize);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(loadStoredFontFamily);

  const resolved: ResolvedTheme = mode === "system" ? systemTheme : mode;

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply dark class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEYS.theme, m);
  }, []);

  const setFontSize = useCallback((size: number) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    setFontSizeState(clamped);
    localStorage.setItem(STORAGE_KEYS.fontSize, String(clamped));
  }, []);

  const setFontFamily = useCallback((family: FontFamily) => {
    setFontFamilyState(family);
    localStorage.setItem(STORAGE_KEYS.fontFamily, family);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ mode, resolved, setMode, fontSize, setFontSize, fontFamily, setFontFamily }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
