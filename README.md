# Narrative Writer

A fast, lightweight, distraction-free local studio for fiction writers and worldbuilders. Features block-based structured writing, bidirectional `[[wikilinks]]`, visual plot idea trees/boards, and offline browser storage with direct local file mirroring.

---

## Features

* **Block-Based Prose Editor:** Divide chapters into distinct prose, dialogue, action, thought, scene, image, and custom blocks. Supports typewriter scrolling and split-at-caret operations.
* **Bidirectional Wikilinks:** Connect characters, locations, items, and plot nodes using `[[Name]]` or `[[id|Label]]` syntax with real-time autocompletion.
* **Plot Idea Workspace:** Organize story outlines in hierarchical Tree, Board (Kanban), or Timeline views with drag-and-drop support.
* **Local Storage & Auto-Backup:** Runs locally in the browser using IndexedDB / LocalStorage with direct mirroring to a local `.json` backup file via the File System Access API.
* **Exporting & Workers:** Background web workers handle real-time full-text search and export text compilation.

---

## Getting Started & Setup

Since Narrative Writer runs completely in the browser, no server build step or database installation is required.

1. **Clone or Download the Repository:**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```
2. **Launch the Application:**
   * Open `index.html` directly in any modern Web Browser (Chrome, Edge, Firefox, Brave).
   * Alternatively, serve using a lightweight HTTP server (e.g., Python's built-in server or Live Server extension in VS Code):
     ```bash
     python -m http.server 8000
     ```
     Navigate to `http://localhost:8000`.

---

## Basic Usage

### Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Ctrl` + `S`** / **`Cmd` + `S`** | Manual save to browser storage / mirror file |
| **`Ctrl` + `K`** / **`Cmd` + `K`** | Open global search menu |
| **`Ctrl` + `Z`** / **`Cmd` + `Z`** | Undo |
| **`Ctrl` + `Shift` + `Z`** / **`Cmd` + `Y`** | Redo |
| **`Ctrl` + `B`** / **`Cmd` + `B`** | Bold selected text (`**text**`) |
| **`Ctrl` + `I`** / **`Cmd` + `I`** | Italicize selected text (`*text*`) |
| **`Enter`** | Split current block or plot idea at caret into a new entry |
| **`Escape`** | Close open overlays, search windows, or confirmation popups |

### Backup Setup

1. Click **Connect local backup** in the interface.
2. Choose or create a local `.json` file on disk.
3. All subsequent changes will automatically mirror directly to your local file.

---

## Repository Structure

```text
js/
  workers/
    app-worker.js       # Web worker for search indexing and compile tasks
  app.js                # Core event listeners, typewriter behavior, and UI loops
  blocks.js             # Block management (add, split, delete, reorder)
  core.js               # State management, data persistence, and undo/redo stacks
  dialogs.js            # Confirmation popups and modal dialogues
  editor.js             # Inline markdown parser and [[wikilink]] autocompletion
  plot.js               # Plot workspace engine (trees, boards, tags, colors)
  renderer.js           # DOM rendering engine and virtual scrolling
  search.js             # Global search handling
  settings-export.js   # Import/export logic (.json, .txt) and settings panel
  sidebar.js            # Collection and chapter hierarchy navigation
  stats.js              # Word count and writing target statistics
index.html              # Main application entry point
styles.css             # Application styling and view modes
```

## License

Copyright (c) 2026 Epeon. All rights reserved. 
Available under a custom non-commercial, non-repackaging license. See [LICENSE](LICENSE.md) for full details.