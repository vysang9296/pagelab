# Option 1 Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HWP parser decompression fallback, auto-dismissible right-click context menu, and a file type filtering select box inside FolderLab's local navigator.

**Architecture:** 
1. Modify backend `DocumentParser._extract_hwp` to search for OLE `BodyText/Section*` streams, decompress them using `zlib.decompress(data, -15)`, and decode UTF-16LE text records.
2. Register a global document click listener in `folderlab.js` and call stopPropagation/preventDefault in the menu show handler to fix the context menu dismiss behavior.
3. Add a select dropdown inside `index.html`'s navigator panel, map its change event to a new tree filtering function, and update `flCreateTreeNode` in `folderlab.js` to dynamically filter files by extension.

**Tech Stack:** Python 3 (zlib, olefile), Vanilla JS (DOM event listeners), HTML5.

---

### Task 1: HWP Parser Fallback Decompression

**Files:**
*   Modify: [document_parser.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/backend/document_parser.py)
*   Create: [test_hwp_parser.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/tests/test_hwp_parser.py)

- [ ] **Step 1: Create a simple test file structure and a failing test for HWP fallback parser**

Write a test file `c:\Users\kyung\AppData\Local\Temp\empty_preview.hwp` using `olefile` that has no `PrvText` but has compressed `BodyText/Section0`. Or mock `olefile`'s behavior in unit tests.
Create [test_hwp_parser.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/tests/test_hwp_parser.py):
```python
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.document_parser import DocumentParser

class TestHwpParser(unittest.TestCase):
    @patch('olefile.isOleFile')
    @patch('olefile.OleFileIO')
    def test_hwp_decompression_fallback(self, mock_ole_class, mock_is_ole):
        mock_is_ole.return_value = True
        mock_ole = MagicMock()
        mock_ole_class.return_value.__enter__.return_value = mock_ole
        
        # Scenario: No PrvText stream exists, only BodyText/Section0 exists
        mock_ole.exists.return_value = False
        mock_ole.listdir.return_value = [['BodyText', 'Section0']]
        
        # Mock compressed data for zlib. Tag ID = 67 (HWPRCD_PARA_TEXT), Length = 12
        # Header for tag 67, level 0, length 12: 12 << 20 | 0 << 10 | 67 = 12582979
        # In little-endian bytes: 12582979 -> b'\x43\x00\xc0\x00'
        # Followed by UTF-16LE representation of "Hello": b'H\x00e\x00l\x00l\x00o\x00' (10 bytes) + padding (2 bytes) = 12 bytes
        import zlib
        decompressed_payload = b'\x43\x00\xc0\x00' + b'H\x00e\x00l\x00l\x00o\x00\x00\x00'
        # Compress using raw deflate (wbits = -15)
        compressor = zlib.compressobj(wbits=-15)
        compressed_data = compressor.compress(decompressed_payload) + compressor.flush()
        
        mock_stream = MagicMock()
        mock_stream.read.return_value = compressed_data
        mock_ole.openstream.return_value = mock_stream
        
        extracted = DocumentParser._extract_hwp("dummy.hwp")
        self.assertEqual(extracted.strip(), "Hello")

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests/test_hwp_parser.py`
Expected: FAIL (returns empty string because fallback code is not written yet)

- [ ] **Step 3: Implement the decompression and record parsing fallback in document_parser.py**

Modify the `_extract_hwp` method in [document_parser.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/backend/document_parser.py#L79-L96):
```python
    @staticmethod
    def _extract_hwp(file_path: str) -> str:
        """HWP 5.0 is an OLE container. We extract PrvText or BodyText if possible."""
        if not olefile or not olefile.isOleFile(file_path):
            return ""
        try:
            with olefile.OleFileIO(file_path) as ole:
                # First try PrvText (Preview Text stream, fast and clean)
                if ole.exists('PrvText'):
                    try:
                        stream = ole.openstream('PrvText')
                        data = stream.read()
                        return data.decode('utf-16le', errors='ignore')
                    except Exception as prv_err:
                        print(f"PrvText extraction failed, falling back to BodyText: {prv_err}")
                
                # Fallback to BodyText/SectionN
                import zlib
                text_parts = []
                dirs = ole.listdir()
                sections = []
                for d in dirs:
                    if len(d) == 2 and d[0] == 'BodyText' and d[1].startswith('Section'):
                        sections.append(d)
                
                # Sort sections by number
                sections.sort(key=lambda x: int(x[1].replace('Section', '')) if x[1].replace('Section', '').isdigit() else 0)
                
                for sec in sections:
                    try:
                        stream = ole.openstream(sec)
                        compressed_data = stream.read()
                        try:
                            decompressed = zlib.decompress(compressed_data, -15)
                        except zlib.error:
                            decompressed = zlib.decompress(compressed_data)
                        
                        idx = 0
                        stream_len = len(decompressed)
                        while idx < stream_len:
                            if idx + 4 > stream_len:
                                break
                            
                            header = int.from_bytes(decompressed[idx:idx+4], byteorder='little')
                            tag_id = header & 0x3FF
                            level = (header >> 10) & 0x3FF
                            length = (header >> 20) & 0xFFF
                            idx += 4
                            
                            if length == 0xFFF:
                                if idx + 4 > stream_len:
                                    break
                                length = int.from_bytes(decompressed[idx:idx+4], byteorder='little')
                                idx += 4
                                
                            if idx + length > stream_len:
                                break
                            
                            record_data = decompressed[idx:idx+length]
                            idx += length
                            
                            # Tag ID 67 is HWPRCD_PARA_TEXT (Paragraph text)
                            if tag_id == 67:
                                try:
                                    text_val = record_data.decode('utf-16le', errors='ignore')
                                    clean_chars = []
                                    char_idx = 0
                                    while char_idx < len(text_val):
                                        c = text_val[char_idx]
                                        ord_c = ord(c)
                                        if ord_c < 32:
                                            # Skip HWP inline control bytes
                                            pass
                                        else:
                                            clean_chars.append(c)
                                        char_idx += 1
                                    text_parts.append("".join(clean_chars))
                                except Exception as dec_err:
                                    print(f"Record decode error in {sec}: {dec_err}")
                    except Exception as sec_err:
                        print(f"Error parsing section {sec}: {sec_err}")
                
                if text_parts:
                    return "\n".join(text_parts)
        except Exception as e:
            print(f"HWP OLE Extract Error: {e}")
        return ""
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m unittest tests/test_hwp_parser.py`
Expected: PASS

- [ ] **Step 5: Commit HWP Parser Changes**

```bash
git add backend/document_parser.py tests/test_hwp_parser.py
git commit -m "feat: add decompress fallback parsing for HWP document files"
```

---

### Task 2: Fix Right-Click Context Menu Dismissal

**Files:**
*   Modify: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)

- [ ] **Step 1: Set up the global dismissal handler and modify menu trigger logic**

At the top of [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js), add:
```javascript
document.addEventListener('click', (e) => {
    const menu = document.getElementById('fl-context-menu');
    if (menu) {
        menu.style.display = 'none';
    }
});
```

And update `flShowContextMenu` in [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js#L1133-L1136) to prevent bubbling and default behaviors:
```javascript
function flShowContextMenu(event, path, isDir, treeType = 'local', id = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    flContextMenuTarget = { path, isDir, treeType, id };
    const menu = document.getElementById('fl-context-menu');
    if (!menu) return;
```

- [ ] **Step 2: Commit Context Menu changes**

```bash
git add frontend/folderlab.js
git commit -m "fix: dismiss FolderLab context menu on background clicks and stop propagation"
```

---

### Task 3: Add File Type Filter Dropdown UI

**Files:**
*   Modify: [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html)

- [ ] **Step 1: Inject select dropdown next to "Change Folder" button**

In [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html#L106-L108), replace:
```html
                            <span id="fl-local-root-label" style="font-size:11px; color:var(--primary-blue); background:#e8f0fe; padding:2px 6px; border-radius:4px; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">내 문서</span>
                            <button class="secondary-btn" style="padding:4px 8px; font-size:12px;" onclick="flChangeLocalRoot()">📁 폴더 변경</button>
```
With:
```html
                            <span id="fl-local-root-label" style="font-size:11px; color:var(--primary-blue); background:#e8f0fe; padding:2px 6px; border-radius:4px; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">내 문서</span>
                            <button class="secondary-btn" style="padding:4px 8px; font-size:12px;" onclick="flChangeLocalRoot()">📁 폴더 변경</button>
                            <select id="fl-file-type-filter" onchange="flApplyFileTypeFilter(this.value)" style="padding:4px 8px; font-size:12px; border-radius:4px; border:1px solid var(--border-color); background:#fff; color:var(--text-primary); cursor:pointer;">
                                <option value="all">📂 전체 파일</option>
                                <option value="hwp">📄 한글 (.hwp/.hwpx)</option>
                                <option value="pdf">📕 PDF (.pdf)</option>
                                <option value="zip">📦 압축파일 (.zip)</option>
                                <option value="docs">📝 기타 문서</option>
                            </select>
```

- [ ] **Step 2: Commit UI changes**

```bash
git add frontend/index.html
git commit -m "feat: add file type filter select box to local explorer header"
```

---

### Task 4: Implement File Type Filtering Logic

**Files:**
*   Modify: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)

- [ ] **Step 1: Declare global filter state and define helper functions**

In [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js), add near top global variables:
```javascript
let flActiveFilter = 'all';

function flApplyFileTypeFilter(filterValue) {
    flActiveFilter = filterValue;
    if (typeof flLocalTreeData !== 'undefined' && flLocalTreeData) {
        flRenderLocalTree(flLocalTreeData);
    }
    if (typeof flRealTreeData !== 'undefined' && flRealTreeData) {
        flRenderRealTree(flRealTreeData);
    }
}
```

- [ ] **Step 2: Apply filter checks during node creation**

In [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js#L114-L120), insert the check at the start of `flCreateTreeNode`:
```javascript
function flCreateTreeNode(node, depth, treeType = 'local') {
    // Apply file type filtering if it is a file
    if (treeType === 'local' || treeType === 'real') {
        if (node.isDir === false || node.isDir === 'false') {
            const dotIdx = node.name.lastIndexOf('.');
            const ext = dotIdx !== -1 ? node.name.substring(dotIdx).toLowerCase() : '';
            
            let isMatched = false;
            if (flActiveFilter === 'all') {
                isMatched = true;
            } else if (flActiveFilter === 'hwp') {
                isMatched = (ext === '.hwp' || ext === '.hwpx');
            } else if (flActiveFilter === 'pdf') {
                isMatched = (ext === '.pdf');
            } else if (flActiveFilter === 'zip') {
                isMatched = (ext === '.zip');
            } else if (flActiveFilter === 'docs') {
                isMatched = ['.docx', '.xlsx', '.pptx', '.txt', '.md', '.doc', '.xls', '.ppt'].includes(ext);
            }
            
            if (!isMatched) {
                // Return empty fragment to skip rendering
                return document.createDocumentFragment();
            }
        }
    }

    const wrapper = document.createElement('div');
```

- [ ] **Step 3: Commit filtering JS logic**

```bash
git add frontend/folderlab.js
git commit -m "feat: implement extension-based client-side filtering in tree renderer"
```
