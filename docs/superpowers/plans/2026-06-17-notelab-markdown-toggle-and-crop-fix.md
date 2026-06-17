# Note Lab Markdown Toggle and Crop Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Note Lab to a clean Markdown-based editor with a single-pane preview toggle button (Option A) and fix the TypeError during crop area selection.

**Architecture:** Change the default Toast UI Editor mode to markdown, add the `#notelab-toggle-preview-btn` to index.html toolbar, bind the click listener in notelab.js to toggle classes `.notelab-editor-only` and `.notelab-preview-only`, and fix `getEditType` usage in `insertMarkdownContent`.

**Tech Stack:** Vanilla JavaScript, HTML5, Toast UI Editor v3, CSS.

---

### Task 1: Restore Preview Toggle Button in Layout

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add the preview button markup back to the editor toolbar**

In `frontend/index.html` around line 285, add `<button id="notelab-toggle-preview-btn" class="btn">👁️ 미리보기</button>` next to AI 분석.

```html
          <div class="notelab-editor-header">
            <button id="notelab-save-btn" class="btn btn-primary">💾 저장</button>
            <button id="notelab-patch-btn" class="btn">📝 HWPX 패치</button>
            <button id="notelab-compare-btn" class="btn">🔍 비교</button>
            <button id="notelab-parse-all-btn" class="btn">📥 텍스트 추출</button>
            <button id="notelab-toggle-preview-btn" class="btn">👁️ 미리보기</button>
            <button id="notelab-ai-btn" class="btn">🤖 AI 분석</button>
          </div>
```

- [ ] **Step 2: Add class `notelab-editor-only` to the markdown editor container**

In `frontend/index.html` around line 292, add the class `notelab-editor-only` to `#notelab-markdown-editor`.

```html
          <div id="notelab-markdown-editor" class="notelab-editor-only" style="flex: 1; min-height: 0;"></div>
```

---

### Task 2: Configure Editor Mode and Bind Toggle Button Logic

**Files:**
- Modify: `frontend/notelab.js`

- [ ] **Step 1: Set default editor mode to markdown in initialization**

In `frontend/notelab.js` line 43, change `initialEditType: 'wysiwyg'` to `initialEditType: 'markdown'`.

```javascript
function initNoteLabEditor() {
    const editorEl = document.querySelector('#notelab-markdown-editor');
    if (editorEl && typeof toastui !== 'undefined') {
        notelabEditorInstance = new toastui.Editor({
            el: editorEl,
            height: '100%',
            initialEditType: 'markdown',
            hideModeSwitch: true,
            previewStyle: 'vertical',
            events: {
                change: () => {
                    bindPreviewLinks();
                },
                keyup: (editorType, ev) => {
                    handleWysiwygKeyup(editorType, ev);
                },
                keydown: (editorType, ev) => {
                    handleWysiwygKeydown(editorType, ev);
                }
            }
        });
    }
}
```

- [ ] **Step 2: Bind the preview toggle button click listener**

In `frontend/notelab.js` inside `initNoteLabButtons()`, add the listener logic for `notelab-toggle-preview-btn`.

```javascript
    const previewBtn = document.getElementById("notelab-toggle-preview-btn");
    if (previewBtn) {
        previewBtn.addEventListener("click", () => {
            if (notelabEditorInstance && notelabEditorInstance.isWysiwygMode()) {
                return;
            }
            const editorWrapper = document.getElementById("notelab-markdown-editor");
            if (editorWrapper) {
                const isPreview = editorWrapper.classList.contains("notelab-preview-only");
                if (isPreview) {
                    editorWrapper.classList.remove("notelab-preview-only");
                    editorWrapper.classList.add("notelab-editor-only");
                    previewBtn.style.background = "";
                    previewBtn.style.color = "";
                } else {
                    editorWrapper.classList.remove("notelab-editor-only");
                    editorWrapper.classList.add("notelab-preview-only");
                    previewBtn.style.background = "#1a73e8";
                    previewBtn.style.color = "white";
                }
            }
        });
    }
```

---

### Task 3: Fix TypeError inside insertMarkdownContent

**Files:**
- Modify: `frontend/notelab.js`

- [ ] **Step 1: Replace getEditType check with isWysiwygMode**

In `frontend/notelab.js` around line 783, change `getEditType() === 'wysiwyg'` to `isWysiwygMode()`.

```javascript
function insertMarkdownContent(markdown) {
    if (!notelabEditorInstance) return;
    
    if (notelabEditorInstance.isWysiwygMode()) {
        const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
        // ... rest of the code
```

---

### Task 4: Verify and Commit

- [ ] **Step 1: Run project unit tests to verify no regressions**

Run command: `python -m unittest discover -s tests`
Expected: PASS with 30 tests OK.

- [ ] **Step 2: Git status check and commit changes**

Run command: `git add frontend/index.html frontend/notelab.js`
Run command: `git commit -m "fix: change default edit mode to markdown, restore preview toggle, and fix getEditType error"`
