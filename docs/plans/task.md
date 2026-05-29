# Task Tracker: FolderLab UX Improvements

- [x] **Task 1: Backend Renaming API**
  - [x] Step 1: Add `fl_real_rename` API to `Api` class in `main.py`
  - [x] Step 2: Validate `fl_real_rename` on mock/local file structures

- [x] **Task 2: Extend Context Menu HTML Structure**
  - [x] Step 1: Add new options to `#fl-context-menu` in `index.html`

- [x] **Task 3: Context Menu Logic and Dynamic Hiding/Showing**
  - [x] Step 1: Add `oncontextmenu` handler to virtual staging tree items in `folderlab.js`
  - [x] Step 2: Add `oncontextmenu` handler to the virtual staging panel background in `folderlab.js`
  - [x] Step 3: Refactor `flShowContextMenu` to receive `treeType` and `id`, updating element visibility dynamically
  - [x] Step 4: Ensure all explorer trees call `flShowContextMenu` with correct treeType

- [x] **Task 4: Context Menu Execution Logic**
  - [x] Step 1: Refactor `flExecuteContextMenu` to handle 'rename', 'new_folder' for staging, 'delete', 'export_zip', and 'export_sync'
  - [x] Step 2: Implement dynamic tree refreshing in frontend

## Option 1 Improvements

- [x] **Task 5: HWP Parser Fallback Decompression**
  - [x] Step 1: Create a failing test for HWP fallback parser
  - [x] Step 2: Run test to verify it fails
  - [x] Step 3: Implement decompression and record parsing fallback in `document_parser.py`
  - [x] Step 4: Run the test to verify it passes
  - [x] Step 5: Commit changes

- [x] **Task 6: Fix Right-Click Context Menu Dismissal**
  - [x] Step 1: Set up global dismissal handler and modify menu trigger logic in `folderlab.js`
  - [x] Step 2: Commit changes

- [x] **Task 7: Add File Type Filter Dropdown UI**
  - [x] Step 1: Inject select dropdown in `index.html`
  - [x] Step 2: Commit changes

- [x] **Task 8: Implement File Type Filtering Logic**
  - [x] Step 1: Declare global filter state and define helper functions in `folderlab.js`
  - [x] Step 2: Apply filter checks during node creation
  - [x] Step 3: Commit changes

## UI/UX Improvements & Bug Fixes

- [x] **Task 9: Preserve Folder Expansion State (Issue 1)**
  - [x] Step 1: Add global tracking sets `flExpandedLocalPaths` and `flExpandedRealPaths`
  - [x] Step 2: Update folder toggle logic to update tracking sets
  - [x] Step 3: Auto-expand nodes on render if path is in tracking sets
- [x] **Task 10: Filter Descendant Items on Transfer (Issue 2)**
  - [x] Step 1: Implement `flFilterDescendantItems` path utility in `folderlab.js`
  - [x] Step 2: Filter transfers inside `flTransferSelected` and `flHandleDropToReal`
- [x] **Task 11: Local Explorer Header Layout Fix (Issue 3)**
  - [x] Step 1: Restructure header in `index.html` to prevent line wrapping
- [x] **Task 12: Strengthen Context Menu Dismissal (Issue 4)**
  - [x] Step 1: Upgrade click listener in `folderlab.js` and `app.js` with capture and mousedown
- [x] **Task 13: Align Staging and Real Tree Styles (Issue 5)**
  - [x] Step 1: Standardize `.group-name-input` size to 12px in `style.css`
  - [x] Step 2: Bold directory names in `folderlab.js` `flCreateTreeNode`
  - [x] Step 3: Align container background colors to #fafbfc in `index.html`

