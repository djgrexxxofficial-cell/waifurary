# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Waifurary is a desktop application for collecting and managing waifu illustrations with metadata support. Built with Tauri (Rust backend) + React (TypeScript frontend).

## Essential Commands

### Development
```bash
npm run dev          # Start development server (Vite + Tauri dev)
npm run build        # Build for production (TypeScript + Vite build)
npm run preview      # Preview production build
npm run tauri        # Direct Tauri commands
```

### Build Process
- Frontend: Vite builds React/TypeScript to `dist/`
- Backend: Rust compiles to native binary
- Full build: `npm run build` (runs `tsc && vite build`)

## Architecture

### Frontend (`src/`)
- **Single-file React app**: `App.tsx` (~1870 lines) contains the entire UI
- **State management**: React hooks (useState, useEffect) - no external state library
- **Key features**: Grid/list views, fullscreen viewer, metadata editing, bulk operations
- **Tauri integration**: Uses `@tauri-apps/api` to invoke Rust commands

### Backend (`src-tauri/src/`)
- **Main logic**: `lib.rs` contains all Tauri commands and business logic
- **Commands**: Image folder scanning, metadata CRUD, file system operations
- **Data storage**:
  - Images: `~/.config/waifurary/images/{folder}/`
  - Metadata: `~/.config/waifurary/metadata/{folder}/{image}.json`

### Key Tauri Commands
- `get_image_folders()` - Scan image directories
- `get_images_in_folder(folder)` - List images in folder
- `save_image_metadata()` / `load_image_metadata()` - Metadata CRUD
- `get_metadata_groups()` - Group images by tags/source/author
- `get_all_tags_with_count()` - Tag management with usage counts

### Data Flow
1. App loads folders from `~/.config/waifurary/images/`
2. User selects folder → loads images and metadata
3. Metadata stored as JSON files, indexed by image filename
4. Browse modes: folders, metadata grouping (tags/source/author), favorites

## File Structure
```
src/
├── App.tsx          # Main application (UI + logic)
├── App.css          # All styles
└── main.tsx         # React entry point

src-tauri/src/
├── lib.rs           # Tauri commands + business logic
├── main.rs          # App entry point
└── plugins/         # Custom plugins
```

## Development Notes
- **No external UI library** - custom CSS styling throughout
- **No state management library** - all state in App component
- **File organization**: Metadata stored separately from images for clean separation
- **Supported formats**: PNG, JPG, JPEG, GIF, WebP, BMP, SVG
- **Platform**: Currently macOS-focused (uses `.config` path)