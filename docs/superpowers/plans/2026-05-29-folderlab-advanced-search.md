# FolderLab Advanced Search & Auto-Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement detailed search filters (format and modification date) and background auto-indexing with safety guardrails in Folder Lab.

**Architecture:**
- Inject select elements for filters in `index.html`.
- Pass selected filters from `folderlab.js` to `main.py` API.
- Execute SQL LIKE filtering for document formats inside the SQLite FTS5 query in `search_engine.py`.
- Filter matched results by file modification date (`os.path.getmtime`) in Python.
- Trigger background indexing automatically when a directory is loaded, checking if it is a root drive or too large (over 300 children) to bypass auto-indexing safely.

**Tech Stack:** HTML/CSS, Vanilla JS, Python, SQLite3.

---

### Task 1: Update Frontend UI with Select Filters

Add file format and date dropdown filters to the search box panel.

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Inject select filters**
  Add select dropdowns inside `.search-box` in `frontend/index.html` around line 201.
  Replace:
  ```html
                  <div class="search-box" style="display:flex; flex-grow:1; max-width:50%; gap:4px;">
                      <input type="text" id="fl-search-input" placeholder="현재 탐색 중인 폴더 내 문서 본문 심층 검색 (HWP, PDF, PPTX 등)..." style="flex-grow:1; padding:6px 12px; border:1px solid var(--border-color); border-radius:4px; font-size:13px;">
                      <button class="secondary-btn" style="padding:6px 12px;" onclick="flSearchDocuments()">검색</button>
                  </div>
  ```
  with:
  ```html
                  <div class="search-box" style="display:flex; flex-grow:1; max-width:55%; gap:4px;">
                      <select id="fl-search-ext-filter" style="padding:6px; font-size:12px; border:1px solid var(--border-color); border-radius:4px; background:#fff; cursor:pointer;">
                          <option value="all">📂 전체 포맷</option>
                          <option value="hwp">📝 워드 문서</option>
                          <option value="pdf">📕 PDF 문서</option>
                          <option value="xls">📊 엑셀 문서</option>
                          <option value="etc">🗒️ 기타 문서</option>
                      </select>
                      <select id="fl-search-date-filter" style="padding:6px; font-size:12px; border:1px solid var(--border-color); border-radius:4px; background:#fff; cursor:pointer;">
                          <option value="all">📅 전체 기간</option>
                          <option value="week">📅 최근 1주</option>
                          <option value="month">📅 최근 1달</option>
                          <option value="year">📅 최근 1년</option>
                      </select>
                      <input type="text" id="fl-search-input" placeholder="문서 본문 심층 검색..." style="flex-grow:1; padding:6px 12px; border:1px solid var(--border-color); border-radius:4px; font-size:13px;">
                      <button class="secondary-btn" style="padding:6px 12px;" onclick="flSearchDocuments()">검색</button>
                  </div>
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add frontend/index.html
  git commit -m "ui: add search filter dropdowns to index.html"
  ```

---

### Task 2: Pass Filters from JS to Backend

Update search trigger method in JS to pass the filter choices.

**Files:**
- Modify: `frontend/folderlab.js`

- [ ] **Step 1: Read select filters and pass them to api**
  Modify `flSearchDocuments` in `frontend/folderlab.js` around line 1175.
  Replace:
  ```javascript
  async function flSearchDocuments() {
      const query = document.getElementById('fl-search-input').value.trim();
      const container = document.getElementById('fl-search-results-container');
      const titleEl = document.getElementById('fl-preview-doc-title');
      const contentEl = document.getElementById('fl-preview-content');
  
      if (!query) {
          container.innerHTML = '<div style="color:var(--text-secondary); font-size:13px; text-align:center; margin-top:30px;">상단에서 검색어를 입력하면 일치하는 문서 목록이 표시됩니다.</div>';
          titleEl.innerHTML = '📄 문서를 선택하세요'; contentEl.innerHTML = '키워드가 포함된 앞뒤 본문 문맥이 이곳에 넓게 펼쳐집니다.';
          return;
      }
  
      container.innerHTML = `<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 30px;"><div class="spinner" style="margin: 0 auto 12px;"></div>"${query}" 심층 검색 중...</div>`;
  
      try {
          let results = [];
          if (pywebview && pywebview.api && pywebview.api.search_documents) { results = await pywebview.api.search_documents(query); }
  ```
  with:
  ```javascript
  async function flSearchDocuments() {
      const query = document.getElementById('fl-search-input').value.trim();
      const container = document.getElementById('fl-search-results-container');
      const titleEl = document.getElementById('fl-preview-doc-title');
      const contentEl = document.getElementById('fl-preview-content');
      
      const extFilter = document.getElementById('fl-search-ext-filter')?.value || 'all';
      const dateFilter = document.getElementById('fl-search-date-filter')?.value || 'all';
  
      if (!query) {
          container.innerHTML = '<div style="color:var(--text-secondary); font-size:13px; text-align:center; margin-top:30px;">상단에서 검색어를 입력하면 일치하는 문서 목록이 표시됩니다.</div>';
          titleEl.innerHTML = '📄 문서를 선택하세요'; contentEl.innerHTML = '키워드가 포함된 앞뒤 본문 문맥이 이곳에 넓게 펼쳐집니다.';
          return;
      }
  
      container.innerHTML = `<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 30px;"><div class="spinner" style="margin: 0 auto 12px;"></div>"${query}" 심층 검색 중...</div>`;
  
      try {
          let results = [];
          if (pywebview && pywebview.api && pywebview.api.search_documents) { 
              results = await pywebview.api.search_documents(query, extFilter, dateFilter); 
          }
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add frontend/folderlab.js
  git commit -m "feat: read and pass select filters in flSearchDocuments"
  ```

---

### Task 3: Implement Backend Search Filters (SQL + Python)

Update the backend API and SearchEngine to support SQL path-based extension matching and Python modification date filtering.

**Files:**
- Modify: `main.py`, `backend/search_engine.py`

- [ ] **Step 1: Update main.py search API**
  Update `search_documents` in `main.py` around line 251.
  Replace:
  ```python
      def search_documents(self, query):
  
          self.log(f"Searching documents for query: {query}")
          try:
              results = self._search_engine.search(query)
              self.log(f"Found {len(results)} matches.")
              return results
          except Exception as e:
              self.log(f"Search API Error: {e}")
              return []
  ```
  with:
  ```python
      def search_documents(self, query, ext_filter='all', date_filter='all'):
          self.log(f"Searching documents (Query: {query}, Ext: {ext_filter}, Date: {date_filter})")
          try:
              results = self._search_engine.search(query, ext_filter, date_filter)
              self.log(f"Found {len(results)} matches after filtering.")
              return results
          except Exception as e:
              self.log(f"Search API Error: {e}")
              return []
  ```

- [ ] **Step 2: Update backend/search_engine.py search logic**
  Modify `search` in `backend/search_engine.py` around line 109 to handle `ext_filter` in SQL and `date_filter` in Python.
  Replace `search` method with the updated version supporting LIKE bindings and `os.path.getmtime`.

- [ ] **Step 3: Commit changes**
  ```bash
  git add main.py backend/search_engine.py
  git commit -m "feat: implement SQL extension filter and Python date filter"
  ```

---

### Task 4: Implement Background Auto-indexing with Safety Guardrails

Automatically index the current directory on folder load in Folder Lab. Apply safety bypasses for drive roots or folder counts above 300.

**Files:**
- Modify: `main.py`, `frontend/folderlab.js`

- [ ] **Step 1: Support silent indexing in main.py**
  Modify `fl_index_current_folder` in `main.py` around line 214.
  Replace:
  ```python
      def fl_index_current_folder(self, folder_path):
          """Explicit on-demand indexing triggered by user button."""
          if not folder_path or not os.path.exists(folder_path): return False
          self.log(f"Starting explicit on-demand indexing for: {folder_path}")
          
          def _progress(count, filename):
              if self._window:
                  import json
                  safe_name = json.dumps(filename)
                  self._window.evaluate_js(f"flUpdateIndexStatus({count}, {safe_name})")
  
          def _bg():
              try:
                  count, was_cancelled, truncated = self._search_engine.index_target_folder(folder_path, progress_callback=_progress)
                  self.log(f"On-demand indexing finished. Indexed {count} docs. Cancelled: {was_cancelled}")
                  if self._window:
                      cancel_str = "true" if was_cancelled else "false"
                      trunc_str = "true" if truncated else "false"
                      self._window.evaluate_js(f"flCompleteIndexStatus({count}, {cancel_str}, {trunc_str})")
              except Exception as e:
                  self.log(f"On-demand indexing error: {e}")
                  if self._window:
                      self._window.evaluate_js("flErrorIndexStatus()")
  ```
  with:
  ```python
      def fl_index_current_folder(self, folder_path, silent=False):
          """Indexes folder in the background. silent=True bypasses frontend update callbacks."""
          if not folder_path or not os.path.exists(folder_path): return False
          self.log(f"Starting indexing for: {folder_path} (Silent: {silent})")
          
          def _progress(count, filename):
              if not silent and self._window:
                  import json
                  safe_name = json.dumps(filename)
                  self._window.evaluate_js(f"flUpdateIndexStatus({count}, {safe_name})")
  
          def _bg():
              try:
                  count, was_cancelled, truncated = self._search_engine.index_target_folder(folder_path, progress_callback=_progress)
                  self.log(f"Indexing finished. Indexed {count} docs. Cancelled: {was_cancelled}")
                  if not silent and self._window:
                      cancel_str = "true" if was_cancelled else "false"
                      trunc_str = "true" if truncated else "false"
                      self._window.evaluate_js(f"flCompleteIndexStatus({count}, {cancel_str}, {trunc_str})")
              except Exception as e:
                  self.log(f"Indexing error: {e}")
                  if not silent and self._window:
                      self._window.evaluate_js("flErrorIndexStatus()")
  ```

- [ ] **Step 2: Trigger silent indexing in folderlab.js on folder load**
  Update `flRenderLocalTreeAsync` in `frontend/folderlab.js` around line 107 to trigger background indexing, checking guardrails (drive roots and direct child count).
  We will implement:
  ```javascript
  // If drive root (e.g. C:\ or D:\) or if direct children count > 300, skip auto-indexing.
  ```

- [ ] **Step 3: Commit changes**
  ```bash
  git add main.py frontend/folderlab.js
  git commit -m "feat: implement background auto-indexing on folder load with guardrails"
  ```

---

### Task 5: Verification & Testing

Verify search filters and auto-indexing logic.

- [ ] **Step 1: Verify tests and run mock searches**
  Run the test suite and a test script verifying filtering and background indexing.
