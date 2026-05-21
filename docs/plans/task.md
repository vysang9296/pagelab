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

- [ ] **Task 5: HWP Parser Fallback Decompression**
  - [ ] Step 1: Create a failing test for HWP fallback parser
  - [ ] Step 2: Run test to verify it fails
  - [ ] Step 3: Implement decompression and record parsing fallback in `document_parser.py`
  - [ ] Step 4: Run the test to verify it passes
  - [ ] Step 5: Commit changes

- [ ] **Task 6: Fix Right-Click Context Menu Dismissal**
  - [ ] Step 1: Set up global dismissal handler and modify menu trigger logic in `folderlab.js`
  - [ ] Step 2: Commit changes

- [ ] **Task 7: Add File Type Filter Dropdown UI**
  - [ ] Step 1: Inject select dropdown in `index.html`
  - [ ] Step 2: Commit changes

- [ ] **Task 8: Implement File Type Filtering Logic**
  - [ ] Step 1: Declare global filter state and define helper functions in `folderlab.js`
  - [ ] Step 2: Apply filter checks during node creation
  - [ ] Step 3: Commit changes
