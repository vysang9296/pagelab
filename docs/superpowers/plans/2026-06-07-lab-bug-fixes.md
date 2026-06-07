# Page Lab & Folder Lab Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ReferenceErrors, querySelector backslash escape crashes, rotation verification gaps, and ZIP folder extraction compatibility.

**Architecture:** Initialize `contextMenu` globally in app.js, fix the typo in folderlab.js, reload trees on Windows real-time mkdir to avoid backslash escaping issues, expand rotation checks recursively in main.py, and standardize zip file paths in virtual_fs.py.

**Tech Stack:** JavaScript (ES6+), Python 3.10+, PyMuPDF, zipfile, pywebview.

---

### Task 1: Page Lab Context Menu Fix

**Files:**
- Modify: [app.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/app.js)

- [ ] **Step 1: Declare contextMenu globally**
  Add `const contextMenu = document.getElementById('context-menu');` at the top of the file to fix ReferenceErrors.
  ```javascript
  // Line 20 (before dismissContextMenu)
  const contextMenu = document.getElementById('context-menu');
  ```
- [ ] **Step 2: Commit**
  ```bash
  git add frontend/app.js
  git commit -m "fix(pagelab): declare contextMenu globally to fix ReferenceError"
  ```

---

### Task 2: Folder Lab Init Typo Fix

**Files:**
- Modify: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)

- [ ] **Step 1: Fix Render Typo**
  Change `flRenderVirtualTree()` to `flRenderStagingTree()` inside `flInit()` (line 65) so initialization executes fully.
  ```javascript
  // Replace:
  flRenderVirtualTree();
  // With:
  flRenderStagingTree();
  ```
- [ ] **Step 2: Commit**
  ```bash
  git add frontend/folderlab.js
  git commit -m "fix(folderlab): fix flRenderVirtualTree typo to allow initialization"
  ```

---

### Task 3: Real-Time Folder Creation UI Sync Fix

**Files:**
- Modify: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)

- [ ] **Step 1: Replace partial refresh with tree reload**
  In the `new_folder` action handler, change the `treeType === 'real'` block to reload the trees and ensure the parent path remains expanded.
  ```javascript
  // Replace:
  if (treeType === 'real') {
      showLoading("새 폴더 생성 중...");
      if (pywebview && pywebview.api && pywebview.api.fl_real_mkdir) {
          const success = await pywebview.api.fl_real_mkdir(path, trimmedName);
          if (success) {
              await flRefreshDirectoryNode(path);
          }
      }
      hideLoading();
  }
  // With:
  if (treeType === 'real') {
      showLoading("새 폴더 생성 중...");
      if (pywebview && pywebview.api && pywebview.api.fl_real_mkdir) {
          const success = await pywebview.api.fl_real_mkdir(path, trimmedName);
          if (success) {
              flExpandedRealPaths.add(path);
              await flLoadRealTree(flRealRootPath);
              if (flCurrentLocalRoot) await flLoadLocalTree(flCurrentLocalRoot);
          }
      }
      hideLoading();
  }
  ```
- [ ] **Step 2: Commit**
  ```bash
  git add frontend/folderlab.js
  git commit -m "fix(folderlab): reload tree on real-time new_folder creation to avoid Windows backslash selector errors"
  ```

---

### Task 4: Backend Rotation and ZIP Standard Path Fixes

**Files:**
- Modify: [main.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/main.py)
- Modify: [backend/virtual_fs.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/backend/virtual_fs.py)

- [ ] **Step 1: Improve rotation validation in main.py**
  Modify `export_data` validation in `main.py` (lines 628-636) to check rotations recursively under nested zip type items.
  ```python
  # Replace validation logic with:
          def validate_rotation(p_list):
              for p in p_list:
                  if isinstance(p, dict) and p.get('rotation') not in (0, 90, 180, 270):
                      p['rotation'] = 0

          if isinstance(payload, dict):
              if 'pages' in payload:
                  validate_rotation(payload['pages'])
          elif isinstance(payload, list):
              for item in payload:
                  if isinstance(item, dict):
                      if item.get('type') == 'pdf' and isinstance(item.get('data'), dict) and 'pages' in item['data']:
                          validate_rotation(item['data']['pages'])
                      elif item.get('type') == 'zip' and isinstance(item.get('data'), list):
                          for sub_pdf in item['data']:
                              if isinstance(sub_pdf, dict) and 'pages' in sub_pdf:
                                  validate_rotation(sub_pdf['pages'])
  ```
- [ ] **Step 2: Standardize ZIP paths in virtual_fs.py**
  Replace backslashes in ZIP member `arcname` paths in `backend/virtual_fs.py` (lines 46-57).
  ```python
  # Inside if export_mode == 'zip':
  # Replace:
                          arcname = os.path.relpath(dir_path, temp_dir) + '/'
  # With:
                          arcname = os.path.relpath(dir_path, temp_dir).replace('\\', '/') + '/'
  # And replace:
                          arcname = os.path.relpath(file_path, temp_dir)
  # With:
                          arcname = os.path.relpath(file_path, temp_dir).replace('\\', '/')
  ```
- [ ] **Step 3: Commit**
  ```bash
  git add main.py backend/virtual_fs.py
  git commit -m "fix(backend): enhance rotation validation and standardize zip archive path separators"
  ```

---

### Task 5: Add Unit Tests and Verify

**Files:**
- Create: `tests/test_export_improvements.py`

- [ ] **Step 1: Write test for rotation validation and zip path helper**
  Create a test script `tests/test_export_improvements.py` that validates `export_data` validation logic and `VirtualFS` path mapping.
  ```python
  import unittest
  import os
  import shutil
  from main import Api
  from backend.virtual_fs import VirtualFS

  class TestExportImprovements(unittest.TestCase):
      def test_rotation_validation(self):
          api = Api()
          payload = [
              {
                  "type": "zip",
                  "name": "TestFolder",
                  "data": [
                      {
                          "group_name": "SubPDF",
                          "pages": [
                              {"file_path": "test.pdf", "page_index": 0, "rotation": 45}
                          ]
                      }
                  ]
              }
          ]
          # Since type validation overrides rotation, rotation of 45 should become 0
          api.export_data('single_zip', 'dummy.zip', payload)
          self.assertEqual(payload[0]['data'][0]['pages'][0]['rotation'], 0)

      def test_zip_path_standardization(self):
          # Test virtual tree creates output zip correctly
          virtual_folders = [
              {
                  "name": "folder\\subfolder",
                  "isDir": True,
                  "children": []
              }
          ]
          # Ensure no error and creates zip file
          success = VirtualFS.export_virtual_tree(virtual_folders, "test_out.zip", export_mode="zip")
          self.assertTrue(success)
          self.assertTrue(os.path.exists("test_out.zip"))
          if os.path.exists("test_out.zip"):
              os.remove("test_out.zip")

  if __name__ == '__main__':
      unittest.main()
  ```
- [ ] **Step 2: Run all unit tests**
  Run: `python -m unittest discover -s tests`
  Expected: All 9 tests pass successfully.
- [ ] **Step 3: Commit**
  ```bash
  git add tests/test_export_improvements.py
  git commit -m "test: add unit tests for rotation validation and zip export"
  ```
