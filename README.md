# Ebook Reader

[![CI](https://github.com/mikedamoiseau/ebook-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/mikedamoiseau/ebook-reader/actions/workflows/ci.yml)

A desktop ebook reader built with Tauri v2, React, TypeScript, Vite, and Tailwind CSS.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri prerequisites for your OS: https://tauri.app/start/prerequisites/

## Setup

```bash
npm install
```

## Development

```bash
npm run tauri dev
```

This launches the desktop app with hot-reload for the frontend.

## Build

```bash
npm run tauri build
```

## Project Structure

```
src/                    # React frontend
  screens/
    Library.tsx         # Ebook library screen
    Reader.tsx          # Ebook reader screen
  App.tsx               # Root component with routing
  main.tsx              # Entry point
src-tauri/              # Tauri/Rust backend
  src/
    lib.rs              # Tauri commands
  Cargo.toml
  tauri.conf.json
```
