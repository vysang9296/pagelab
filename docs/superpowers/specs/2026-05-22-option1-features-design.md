# Design Specification: Option 1 Improvements

This document outlines the design specification for improving the HWP/HWPX document parser, fixing the persistent context menu bug, and adding file type filtering to FolderLab's navigators.

## 1. Architectural Changes

We are modifying the document parser module and the FolderLab frontend to handle robust local parsing and user navigation improvements.

### 1.1 Components Involved
*   [document_parser.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/backend/document_parser.py): Enhanced parsing fallback using zlib decompress to extract body text from HWP files lacking preview streams.
*   [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html): Added dropdown filter selector to the Local Explorer panel.
*   [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js): Updated tree node rendering logic to apply file filters and bound a global click handler to dismiss the right-click menu.

---

## 2. Component Design & Changes

### 2.1 HWP Parser Fallback
If the standard `PrvText` stream is not found inside the HWP OLE storage, the parser will:
1.  Enumerate all OLE streams matching `BodyText/Section*`.
2.  Decompress the stream data using `zlib.decompress(data, -15)`.
3.  Traverse the decompressed binary stream by reading HWP 5.0 record headers:
    *   **Record Header Format (4 bytes)**:
        *   `Tag ID` (bits 0-9)
        *   `Level` (bits 10-19)
        *   `Length` (bits 20-31). If length is `4095`, the next 4 bytes represent the actual record size.
    *   If `Tag ID` is `67` (representing `HWPRCD_PARA_TEXT`), read the record data.
    *   Decode the data as UTF-16LE, skip control characters, and append the text.
4.  Join all extracted paragraphs with spaces and return.

### 2.2 Context Menu Close UX
*   Register a click event listener on the global `document` in [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js) to set `display = 'none'` on `#fl-context-menu`.
*   Ensure that `flShowContextMenu` calls `event.preventDefault()` and `event.stopPropagation()` to stop immediate bubble dismissal.

### 2.3 Local Explorer File Filter
*   Add a dropdown in [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html) under left panel:
    *   `all`: All files.
    *   `hwp`: HWP and HWPX document files.
    *   `pdf`: PDF document files.
    *   `zip`: ZIP archive files.
    *   `docs`: Office documents (Word, Excel, PowerPoint, Text, Markdown).
*   Add `flActiveFilter` state in [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js).
*   Modify `flCreateTreeNode`:
    *   If node is not a directory (`node.isDir` is false) and does not match the active filter, skip inserting it into the parent container.
    *   When the user changes the filter option, trigger `flRenderLocalTree(flLocalTreeData)`. If in `real` mode, trigger `flRenderRealTree(flRealTreeData)`.

---

## 3. Verification Plan

### 3.1 Verification Cases
*   **HWP Parse Test**: Index an HWP file generated without preview images. Verify it appears in Deep Search.
*   **Menu Auto-Close Test**: Open right-click context menu, click white-space outside menu, verify menu closes.
*   **Filter Toggle Test**: Select "PDF" filter. Verify only PDF files and subfolders are shown. Select "All", verify all files reappear.
