# Note Lab UX & 레이아웃 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Note Lab의 버튼 짤림 방지 배치 최적화, 마크다운 에디터 2분할 뷰의 WYSIWYG 단일 통합 및 CSS 미리보기 토글, PDF.js 텍스트 드래그 정제 복사 및 사각형 이미지 크롭과의 토글 인터랙션 조화를 구현합니다.

**Architecture:** 
- PDF.js의 `selection-overlay` 마우스 이벤트를 기본 해제(`pointer-events: none`)하여 텍스트 드래그를 허용하고, 드래그 상태에서 우클릭/마우스업 시 팝업을 띄워 정제 복사/에디터 전송을 처리합니다.
- `[✂️ 영역 크롭]` 클릭 시에만 오버레이를 켜서(`pointer-events: auto`) 사각형 크롭을 1회 수행하도록 조화시킵니다.
- 에디터를 WYSIWYG 스타일로 기본 렌더링하고, CSS 클래스(`notelab-editor-only` vs `notelab-preview-only`) 토글 방식을 통해 에디터와 미리보기 패널을 하나의 영역에서 100% 폭으로 편리하게 전환합니다.

**Tech Stack:** HWP/PDF Parser, fitz, SQLite, Vanilla JS/CSS

---

### Task 1: CSS 클래스 및 스타일 정의
**Files:**
- Modify: [style.css](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/style.css)

- [ ] **Step 1: style.css 수정**
  에디터 단일 패널 전환 및 PDF 뷰어 내 플로팅 미니 컨텍스트 메뉴 스타일 추가

  ```css
  /* style.css 하단에 추가 */
  /* 에디터 단일 패널 및 미리보기 토글 */
  .notelab-editor-only .toastui-editor-md-container {
      width: 100% !important;
      display: block !important;
  }
  .notelab-editor-only .toastui-editor-md-preview {
      display: none !important;
  }

  .notelab-preview-only .toastui-editor-md-container {
      display: none !important;
  }
  .notelab-preview-only .toastui-editor-md-preview {
      width: 100% !important;
      display: block !important;
  }

  /* 플로팅 미니 컨텍스트 메뉴 (Iframe 내부에서 사용되나 부모 CSS에도 일관성 유지차 선언) */
  .fl-mini-menu {
      position: absolute;
      display: none;
      background: #ffffff;
      border: 1px solid #dcdcdc;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-radius: 4px;
      padding: 4px 0;
      z-index: 10000;
      flex-direction: column;
      min-width: 130px;
  }
  .fl-mini-menu-item {
      padding: 6px 12px;
      font-size: 12px;
      color: #333;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 6px;
  }
  .fl-mini-menu-item:hover {
      background: #f3f2f1;
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add frontend/style.css
  git commit -m "style: define css styles for single editor panel toggle and floating mini menu"
  ```

---

### Task 2: index.html 마크업 및 버튼 분산 배치
**Files:**
- Modify: [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html)

- [ ] **Step 1: 뷰어 헤더 및 에디터 헤더 버튼 수정**
  `frontend/index.html` 내의 Note Lab 헤더 버튼들을 분산시키고, 새로운 토글 단축키 버튼 추가
  - 뷰어 헤더(263-267라인 부근): `[✂️ 영역 크롭]` 버튼 추가
  - 에디터 헤더(277-282라인 부근): `[👁️ 미리보기]` 버튼 추가 및 `[전체 텍스트 가져오기]` 확인

  ```html
  <!-- 뷰어 헤더 영역 수정 -->
  <div class="notelab-viewer-header">
    <button id="notelab-open-doc-btn" class="btn btn-primary">문서 열기</button>
    <button id="notelab-toggle-crop-btn" class="btn">✂️ 영역 크롭</button>
    <span class="notelab-file-title" style="margin-left: 8px; font-weight: bold;">선택된 문서 없음</span>
    <button id="notelab-close-doc-btn" class="btn" style="margin-left: auto;">닫기</button>
  </div>
  ```

  ```html
  <!-- 에디터 헤더 영역 수정 -->
  <div class="notelab-editor-header">
    <button id="notelab-save-btn" class="btn btn-primary">저장 (.md)</button>
    <button id="notelab-patch-btn" class="btn">한글(HWPX) 패치 저장</button>
    <button id="notelab-compare-btn" class="btn">신구 비교</button>
    <button id="notelab-parse-all-btn" class="btn">전체 텍스트 가져오기</button>
    <button id="notelab-toggle-preview-btn" class="btn">👁️ 미리보기</button>
    <button id="notelab-ai-btn" class="btn">🤖 AI 분석</button>
  </div>
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add frontend/index.html
  git commit -m "markup: distribute header buttons and add toggle crop and preview buttons"
  ```

---

### Task 3: 뷰어 내 텍스트 드래그 및 오버레이 토글 구현
**Files:**
- Modify: [notelab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/notelab.js)

- [ ] **Step 1: loadPdfInIframe 내부 styles & overlay 마우스 이벤트 제어**
  `loadPdfInIframe` 내부에 인젝트되는 iframe HTML에서 selection-overlay의 `pointer-events: none`을 기본값으로 수정하여 텍스트 드래그를 활성화하고, 영역 크롭 모드 전환 메시지를 청취하도록 수정.

  ```javascript
  /* loadPdfInIframe의 style 블록 내 수정 */
  /* Selection Overlay Canvas */
  .selection-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      cursor: crosshair;
      z-index: 10;
      pointer-events: none; /* 기본값: 마우스 이벤트 투과로 글자 선택 가능 */
  }
  ```

- [ ] **Step 2: loadPdfInIframe 내부에 플로팅 미니 메뉴 추가 및 드래그 감지 스크립트 작성**
  Iframe의 body에 `#fl-mini-menu` 마크업을 심고, `mouseup` 이벤트 감지를 통해 텍스트가 드래그 선택되었을 때 미니 메뉴를 포지셔닝하여 노출하는 스크립트 작성.

  ```javascript
  /* iframe body 내부 마크업 */
  <div id="viewer-container"></div>
  
  <div id="fl-mini-menu" class="fl-mini-menu" style="position: absolute; display: none; background: #ffffff; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0,0,0,0.2); border-radius: 4px; padding: 4px 0; z-index: 10000; flex-direction: column; min-width: 130px;">
      <div class="fl-mini-menu-item" id="btn-mini-copy" style="padding: 6px 12px; font-size: 12px; color: #333; cursor: pointer; text-align: left;">📋 단순 복사</div>
      <div class="fl-mini-menu-item" id="btn-mini-refine-copy" style="padding: 6px 12px; font-size: 12px; color: #333; cursor: pointer; text-align: left;">✨ 띄어쓰기 정리 복사</div>
      <div class="fl-mini-menu-item" id="btn-mini-send" style="padding: 6px 12px; font-size: 12px; color: #333; cursor: pointer; text-align: left;">📝 에디터로 보내기</div>
  </div>
  ```

  ```javascript
  /* iframe 내 loadPdf 함수 아래에 드래그 감지 핸들러 구현 */
  let selectedText = "";
  
  document.addEventListener("mouseup", (e) => {
      // 영역 크롭 오버레이가 켜져 있으면 일반 텍스트 팝업은 스킵
      const overlay = document.querySelector('.selection-overlay');
      if (overlay && window.getComputedStyle(overlay).pointerEvents !== 'none') {
          return;
      }
      
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      const menu = document.getElementById("fl-mini-menu");
      if (text) {
          selectedText = text;
          // 포지션 세팅
          menu.style.display = "flex";
          menu.style.left = (e.pageX + 10) + "px";
          menu.style.top = (e.pageY + 10) + "px";
      } else {
          // 메뉴 밖 클릭 시 숨김
          if (!menu.contains(e.target)) {
              menu.style.display = "none";
          }
      }
  });
  
  // 미니 메뉴 이벤트 핸들러 바인딩
  document.getElementById("btn-mini-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(selectedText);
      document.getElementById("fl-mini-menu").style.display = "none";
  });
  
  document.getElementById("btn-mini-refine-copy").addEventListener("click", () => {
      const refined = selectedText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      navigator.clipboard.writeText(refined);
      document.getElementById("fl-mini-menu").style.display = "none";
  });
  
  document.getElementById("btn-mini-send").addEventListener("click", () => {
      const refined = selectedText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      window.parent.postMessage({
          type: "INSERT_TEXT",
          text: "\n" + refined + "\n"
      }, "*");
      document.getElementById("fl-mini-menu").style.display = "none";
      window.getSelection().removeAllRanges();
  });
  
  // 부모로부터 수신하는 크롭 오버레이 활성화 메시지 리스너 추가
  window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "SET_CROP_MODE") {
          const overlay = document.querySelector('.selection-overlay');
          if (overlay) {
              overlay.style.pointerEvents = event.data.enabled ? "auto" : "none";
          }
      }
  });
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/notelab.js
  git commit -m "feat: implement text selection mini menu in iframe and drag listeners"
  ```

---

### Task 4: 부모창 크롭 모드 토글 및 뷰어/에디터 단일 패널 스위칭 연동
**Files:**
- Modify: [notelab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/notelab.js)

- [ ] **Step 1: notelab.js의 parent-level 포스트 메시지 리스너 확장**
  `initNoteLabPostMessageListener` 함수에서 `INSERT_TEXT` 타입을 감지하여 에디터에 꽂아주는 핸들러 추가.

  ```javascript
  function initNoteLabPostMessageListener() {
      window.addEventListener("message", (event) => {
          if (event.data && event.data.type === "CROP_SELECTION") {
              const { pageIndex, coords } = event.data;
              triggerOcrOrCrop(pageIndex, coords);
              
              // 크롭이 끝났으므로 뷰어 오버레이를 다시 비활성화 상태로 원복
              setCropOverlayMode(false);
          } else if (event.data && event.data.type === "INSERT_TEXT") {
              if (notelabEditorInstance) {
                  notelabEditorInstance.insertText(event.data.text);
              }
          }
      });
  }
  
  function setCropOverlayMode(enabled) {
      const iframe = document.getElementById("notelab-pdf-iframe");
      if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
              type: "SET_CROP_MODE",
              enabled: enabled
          }, "*");
      }
      
      const cropBtn = document.getElementById("notelab-toggle-crop-btn");
      if (cropBtn) {
          if (enabled) {
              cropBtn.classList.add("active");
              cropBtn.style.background = "#d83b01";
              cropBtn.style.color = "white";
          } else {
              cropBtn.classList.remove("active");
              cropBtn.style.background = "";
              cropBtn.style.color = "";
          }
      }
  }
  ```

- [ ] **Step 2: 버튼 이벤트 리스너 바인딩 및 에디터 기본 속성 세팅**
  `initNoteLabButtons`에 `[✂️ 영역 크롭]` 및 `[👁️ 미리보기]` 버튼 리스너 바인딩.
  에디터 초기화 (`initNoteLabEditor`) 시 클래스에 `notelab-editor-only` 기본 바인딩 적용.

  ```javascript
  // initNoteLabEditor 수정
  function initNoteLabEditor() {
      const editorEl = document.querySelector('#notelab-markdown-editor');
      if (editorEl && typeof toastui !== 'undefined') {
          notelabEditorInstance = new toastui.Editor({
              el: editorEl,
              height: '100%',
              initialEditType: 'markdown',
              previewStyle: 'vertical',
              events: {
                  change: () => {
                      bindPreviewLinks();
                  }
              }
          });
          // 기본적으로 에디터만 100% 보이고 프리뷰를 숨김
          editorEl.classList.add("notelab-editor-only");
      }
  }
  ```

  ```javascript
  // initNoteLabButtons 내부에 리스너 추가
  const cropBtn = document.getElementById("notelab-toggle-crop-btn");
  if (cropBtn) {
      cropBtn.addEventListener("click", () => {
          const isActive = cropBtn.classList.contains("active");
          setCropOverlayMode(!isActive);
      });
  }
  
  const previewBtn = document.getElementById("notelab-toggle-preview-btn");
  if (previewBtn) {
      previewBtn.addEventListener("click", () => {
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

- [ ] **Step 3: triggerOcrOrCrop 실패/취소 시 오버레이 복구 보완**
  `triggerOcrOrCrop`의 backend promise 성공/실패 `.then` 및 `.catch` 파이프라인에서 오버레이 캡처 모드가 항상 해제되도록 `setCropOverlayMode(false)`를 안전 장치로 삽입.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/notelab.js
  git commit -m "feat: implement parent communication for text insertion and crop overlay toggle hooks"
  ```

---

### Task 5: 단위 테스트 및 최종 수동 검증
**Files:**
- Test: [test_kordoc_adapter.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/tests/test_kordoc_adapter.py)

- [ ] **Step 1: 전체 유닛 테스트 구동**
  Run: `python -m unittest discover -s tests`
  Expected: PASS (30/30)

- [ ] **Step 2: Commit**
  ```bash
  git commit --allow-empty -m "test: execute integration tests and confirm all green status"
  ```
