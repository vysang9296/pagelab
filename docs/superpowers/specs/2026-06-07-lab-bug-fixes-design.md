# Spec: Page Lab & Folder Lab Bug Fixes

## Goal
Fix context menu, export, and real-time folder creation bugs in Page Lab and Folder Lab.

## Proposed Changes

### [PageLab]
- File: [app.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/app.js)
  - Declare `const contextMenu = document.getElementById('context-menu');` inside the script to resolve the `contextMenu is not defined` ReferenceError.

### [FolderLab]
- File: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)
  - Change `flRenderVirtualTree()` to `flRenderStagingTree()` at line 65 to fix the ReferenceError during workspace initialization.
  - In context menu action `new_folder` (when `treeType === 'real'`), replace `flRefreshDirectoryNode` with `flExpandedRealPaths.add(path)` followed by reloading the trees via `flLoadRealTree` and `flLoadLocalTree` to avoid backslash escaping issues on Windows.

### [Backend]
- File: [main.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/main.py)
  - Recursively validate all page rotation values in `export_data` when handling list-based `single_zip` payload types (e.g. multi-folder separate exports).
- File: [virtual_fs.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/backend/virtual_fs.py)
  - Standardize ZIP archive path separators in `export_virtual_tree` by replacing Windows-style backslashes `\` with standard zip forward slashes `/`.
