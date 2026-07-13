# PUBLIC BINDER AGENT ONBOARDING

## WHO WE ARE
* ME: CAVE AGENT. YOU: NEW AGENT.
* READ THIS FILE FIRST. VERY IMPORT.

## WHAT APP DO (MAIN FEATURES)
* PUBLIC BINDER = 100% LOCAL DOCUMENT TOOL. WINDOWS OS.
* NO WEB. NO CLOUD. NO LEAK DATA.
* MODULE 1: PAGE LAB (DOCUMENT CHOP CHOP)
  * DRAG PDF, HWP, PNG.
  * HWP TO PDF USING COM AUTOMATION (OFFICE HWP INSTALLED ON WINDOWS REQUIRED).
  * IMAGE (PNG/JPG) TO PDF USING PyMuPDF.
  * USER CAN ROTATE PAGE, EXCLUDE PAGE, CHANGE ORDER.
  * EXPORT: ONE BIG PDF OR ONE ZIP WITH INDIVIDUAL PDFS OR NESTED ZIP FOR MULTIPLE FOLDERS.
* MODULE 2: FOLDER LAB (FILE LOOK LOOK & GO DEEP)
  * LEFT SIDE: LOCAL FILE SYSTEM EXPAND / COLLAPSE (LAZY LOAD).
  * MIDDLE: SEND SELECTED FILES TO RIGHT.
  * RIGHT SIDE: VIRTUAL STAGING (CREATE FOLDER, MOVE FILE, NO TOUCH REAL DISK) OR REAL DISK WORKSPACE (REAL WORK).
  * BOTTOM SIDE: SEARCH DEEP (SQLITE FTS5 SEARCH TEXT INSIDE HWP, PDF, OFFICE).
  * TRIGRAM FTS5 PREVENT 2-LETTER KOREAN SEARCH. WE BYPASS WITH SQL "LIKE" + PYTHON SNIPPET HIGHLIGHT.
  * SEARCH FILTER: TYPE (HWP/PDF/EXCEL/ETC), DATE (1W/1M/1Y), SIZE.
  * AUTO INDEXER: WATCHDOG MONITORS CURRENT LOCAL FOLDER. INDEXES TEXT IN BACKGOUND.
  * SAFEGUARD: DRIVE ROOT OR FOLDER WITH > 300 ITEMS NO AUTO INDEX (PREVENT FREEZE). IF > 5000 ITEMS STOP INDEX.

## IMPORTANT BUGS FIXED (SO FAR)
* BUG 1: CONTEXT MENU ReferenceError (`contextMenu is not defined`).
  * FIXED: DECLARE `const contextMenu` AT TOP OF `frontend/app.js`.
* BUG 2: INITIALIZATION ReferenceError (`flRenderVirtualTree is not defined`).
  * FIXED: RENAMED TO `flRenderStagingTree()` IN `frontend/folderlab.js`.
* BUG 3: NEW FOLDER REAL-TIME UI SYNC AND WINDOWS BACKSLASH BUG.
  * PROBLEM: REFRESH DIRECTORY NODE CLOSED TRIED DIRECTORIES. WINDOWS BACKSLASH RENDERED BAD.
  * FIXED: IN `folderlab.js` ACTION `new_folder`, USE `flExpandedRealPaths.add(path)` AND RELOAD DUAL TREES.
* BUG 4: ROTATION VALIDATION IN EXPORT PAYLOAD.
  * PROBLEM: BAD EXPORT ROTATION VALUES CRASHED backend.
  * FIXED: RECURSIVELY VALIDATE ALL PAGE ROTATION VALUES (FORCE 0, 90, 180, 270) IN `main.py` BEFORE EXPORT.
* BUG 5: ZIP PATH BACKSLASH ESCAPING.
  * PROBLEM: WINDOWS PATHS IN ZIP FILE USED `\` WHICH CRASHED UNIX ZIP EXTRACTORS.
  * FIXED: REPLACE WINDOWS `\` WITH STANDARD ZIP `/` IN `backend/virtual_fs.py`.
* BUG 6: NOTE LAB PDF IFRAME LOADING AND CORS BLOCKS.
  * PROBLEM: DYNAMIC `doc.write()` IFRAME ACCESSING `window.parent.pywebview.api` FOR PDF FETCH THREW CROSS-ORIGIN/SOP BLOCKED ERRORS. INJECTING WINDOWS PATHS DIRECTLY INTO THE IFRAME SCRIPT THREW ESCAPE SYNTAX ERRORS (UNEXPECTED UNICODE ESCAPES).
  * FIXED: PARENT RETRIEVES BASE64 DATA FIRST AND WRITES IT DIRECTLY INTO IFRAME HTML STRING. PARENT CODES LOAD PDF.JS AND CHILD USES `window.parent.pdfjsLib`. DELETED PATH DECLARATIONS INSIDE THE IFRAME SCRIPT.
* BUG 7: NOTE LAB EDITOR OUT OF VIEW OVERFLOW AND WYSIWYG INTERFERENCE.
  * PROBLEM: CHANGING TO WYSIWYG MODE COLLIDED WITH MARKDOWN SPLIT OVERRIDES (`display: block !important`), HIDING TAB BARS AND HEADER BUTTONS. UNCONSTRAINED FLEXBOX EXPANDED THE EDITOR CONTAINER OUT OF WINDOW VIEW.
  * FIXED: SET WRAPPER TO `flex: 1; min-height: 0;` (FLEX SHRINK/FIT POLICY). HOOKED INTO TOAST UI `changeMode` LIFECYCLE EVENT TO CLEAR OVERRIDE CLASSES (`notelab-editor-only`) WHEN IN WYSIWYG MODE.
* BUG 8: NOTE LAB MARKDOWN PREVIEW TOGGLE CRASH AND SPLITTER LOSS.
  * PROBLEM: Calling `notelabEditorInstance.getPreviewStyle()` threw a TypeError because the method does not exist in Toast UI Editor v3 API. Additionally, manual DOM injection and `!important` CSS overrides on preview elements caused the splitter (vertical divider) to get lost or fail to render when toggled multiple times.
  * FIXED: Replaced `getPreviewStyle()` call with a DOM class checker (`classList.contains('notelab-split-view')`). Shifted layout control to the editor's native API `changePreviewStyle('tab' | 'vertical')` so Toast UI Editor manages its own DOM nodes, splitters, and drag dimensions properly.

## CODEBASE MAP
* ROOT:
  * `main.py` -> BACKEND API ENTRY (pywebview / Api class).
  * `PageLab.spec` -> BUILD APP TO SINGLE EXE (PyInstaller).
  * `README.md` -> KOREAN USER MANUAL.
  * `AGENTS.md` -> THIS FILE. READ FIRST.
* `/backend`:
  * `document_parser.py` -> EXTRACT TEXT FROM PDF, HWP, OFFICE. HWP HAS OLE OLE STRUCTURE. BODYTEXT DECOMPRESSED BY ZLIB.
  * `search_engine.py` -> SQLite FTS5 TRIGRAM DB (FTS + LIKE).
  * `virtual_fs.py` -> 가상 파일 시스템 내보내기 & ZIP PACKAGING.
  * `local_nav.py` -> LOCAL DIR LAZY LOADER.
  * `hwp_converter.py` -> CALL HWP COM OBJECT.
  * `pdf_processor.py` -> MERGE, SPLIT, ROTATE PDF PAGE.
* `/frontend`:
  * `index.html` -> MAIN APP LAYOUT.
  * `app.js` -> PAGE LAB FRONTEND LOGIC.
  * `folderlab.js` -> FOLDER LAB FRONTEND LOGIC.
  * `style.css` -> STYLE SHEET.
* `/tests`:
  * `test_export_improvements.py` -> TEST EXPORT BUG FIXES.
  * RUN TESTS WITH: `python -m unittest discover -s tests`

## RULES FOR AGENT
* NO `cd` IN POWERSHELL.
* RUN TESTS BEFORE DONE (`python -m unittest discover -s tests`).
* SECURITY:
  * BACKEND: USE `safe_filename()` FOR WRITE FILE. PREVENT PATH TRAVERSAL.
  * FRONTEND: USE `escapeHTML()` FOR RENDER TEXT. PREVENT XSS.
* JS ALERT & WINDOWS PATH:
  * NO CALL `self._window.evaluate_js` DIRECT. USE `self.evaluate_js()` OR `self.js_alert()`.
  * WINDOWS PATH HAS `\`. JS CRASH. MUST ESCAPE PATH IN JS.
* KOREAN SEARCH:
  * SQLITE FTS5 TRIGRAM NO SEARCH 1 OR 2 LETTERS.
  * IF QUERY < 3 LETTERS, MUST FALLBACK TO SQL `LIKE` AND PYTHON HIGHLIGHTER. NO CHANGE THIS.
* NOTE LAB RULES:
  * IFRAME SECURITY: Child iframe (`notelab-pdf-iframe`) MUST remain decoupled from `window.parent.pywebview.api` to bypass CORS. Load PDF.js in the parent and pass base64 directly into `doc.write()`. Never write raw Windows file paths into the iframe scripts to prevent escape syntax errors.
  * EDITOR OVERFLOWS: Keep `#notelab-markdown-editor` wrapper styling at `flex: 1; min-height: 0;` and headers at `flex-shrink: 0`. Always use Toast UI Editor's `changeMode` event listener to toggle `.notelab-editor-only` classes dynamically.
  * NATIVE PREVIEW SYSTEM: Do not override Markdown Editor preview elements using `!important` CSS values. Always use Toast UI Editor's native API `changePreviewStyle('tab' | 'vertical')` to toggle the preview window. When switching style, always trigger a slight `setTimeout` delay and dispatch `resize` event to prevent viewport sizing calculation mismatch.
