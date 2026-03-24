import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Library from "./screens/Library";
import Reader from "./screens/Reader";

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen">
        <nav className="bg-gray-900 text-white px-6 py-3 flex gap-6">
          <Link to="/" className="hover:text-gray-300 font-medium">Library</Link>
          <Link to="/reader" className="hover:text-gray-300 font-medium">Reader</Link>
        </nav>
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/reader" element={<Reader />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
