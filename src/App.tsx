import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import SettingsPanel from "./components/SettingsPanel";
import Library from "./screens/Library";
import Reader from "./screens/Reader";

function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
        <Link to="/" className="hover:text-gray-300 font-medium">
          Library
        </Link>
        <div className="flex-1" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 text-gray-400 hover:text-white transition-colors"
          aria-label="Open settings"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M16.2 12.3a1.3 1.3 0 00.26 1.43l.05.05a1.58 1.58 0 11-2.23 2.23l-.05-.05a1.3 1.3 0 00-1.43-.26 1.3 1.3 0 00-.79 1.19v.14a1.58 1.58 0 01-3.16 0v-.07a1.3 1.3 0 00-.85-1.19 1.3 1.3 0 00-1.43.26l-.05.05a1.58 1.58 0 11-2.23-2.23l.05-.05a1.3 1.3 0 00.26-1.43 1.3 1.3 0 00-1.19-.79h-.14a1.58 1.58 0 010-3.16h.07a1.3 1.3 0 001.19-.85 1.3 1.3 0 00-.26-1.43l-.05-.05a1.58 1.58 0 112.23-2.23l.05.05a1.3 1.3 0 001.43.26h.06a1.3 1.3 0 00.79-1.19v-.14a1.58 1.58 0 013.16 0v.07a1.3 1.3 0 00.79 1.19 1.3 1.3 0 001.43-.26l.05-.05a1.58 1.58 0 112.23 2.23l-.05.05a1.3 1.3 0 00-.26 1.43v.06a1.3 1.3 0 001.19.79h.14a1.58 1.58 0 010 3.16h-.07a1.3 1.3 0 00-1.19.79z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </nav>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route
            path="/reader/:bookId"
            element={
              <Reader
                onOpenSettings={() => setSettingsOpen(true)}
              />
            }
          />
        </Routes>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
