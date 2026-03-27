import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type ColorMode,
  type ColorTokens,
  TOKEN_NAMES,
  isValidColorMode,
  SEPIA_TOKENS,
  DEFAULT_CUSTOM_TOKENS,
  applyTokensToRoot,
  clearRootTokens,
} from "../lib/themes";

export type { ColorMode, ColorTokens };

type ResolvedTheme = "light" | "dark";
type FontFamily = "serif" | "sans-serif" | "dyslexic";

interface ThemeContextValue {
  mode: ColorMode;
  resolved: ResolvedTheme;
  setMode: (mode: ColorMode) => void;
  customColors: ColorTokens;
  setCustomColors: (colors: ColorTokens) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: FontFamily;
  setFontFamily: (family: FontFamily) => void;
}

const STORAGE_KEYS = {
  theme: "ebook-reader-theme",
  customColors: "ebook-reader-custom-colors",
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

function loadStoredMode(): ColorMode {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  if (stored && isValidColorMode(stored)) return stored;
  return "system";
}

function loadStoredCustomColors(): ColorTokens {
  const stored = localStorage.getItem(STORAGE_KEYS.customColors);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        // Merge against defaults so partial saves don't produce undefined tokens
        const merged = { ...DEFAULT_CUSTOM_TOKENS };
        for (const name of TOKEN_NAMES) {
          if (typeof parsed[name] === "string") merged[name] = parsed[name];
        }
        return merged;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEYS.customColors);
    }
  }
  return DEFAULT_CUSTOM_TOKENS;
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
  if (stored === "serif" || stored === "sans-serif" || stored === "dyslexic") return stored;
  return "serif";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(loadStoredMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [customColors, setCustomColorsState] = useState<ColorTokens>(loadStoredCustomColors);
  const [fontSize, setFontSizeState] = useState(loadStoredFontSize);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(loadStoredFontFamily);

  // For dark: variant purposes, sepia and custom resolve to "light"
  const resolved: ResolvedTheme =
    mode === "dark" ? "dark"
    : mode === "system" ? systemTheme
    : "light";

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply theme to <html>: dark class + inline CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    const effectivelyDark =
      mode === "dark" || (mode === "system" && systemTheme === "dark");

    if (effectivelyDark) {
      root.classList.add("dark");
      clearRootTokens();
    } else {
      root.classList.remove("dark");
      if (mode === "sepia") {
        applyTokensToRoot(SEPIA_TOKENS);
      } else if (mode === "custom") {
        applyTokensToRoot(customColors);
      } else {
        // light or system-light: clear overrides, let :root CSS handle it
        clearRootTokens();
      }
    }
  }, [mode, systemTheme, customColors]);

  const setMode = useCallback((m: ColorMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEYS.theme, m);
  }, []);

  const setCustomColors = useCallback((colors: ColorTokens) => {
    setCustomColorsState(colors);
    localStorage.setItem(STORAGE_KEYS.customColors, JSON.stringify(colors));
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
      value={{
        mode, resolved, setMode,
        customColors, setCustomColors,
        fontSize, setFontSize,
        fontFamily, setFontFamily,
      }}
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
