# Note Lab UX & 레이아웃 개선 디자인 스펙

본 스펙은 Note Lab의 버튼 짤림 버그를 근본적으로 해소하고, PDF 일반 텍스트 드래그 정제 복사 및 사각형 이미지 크롭 기능 간의 조작 충돌을 해결하며, 마크다운 에디터의 2분할 뷰 공간 부족 문제를 옵시디언 스타일의 단일 패널 및 미리보기 토글 방식으로 개선하기 위한 상세 설계입니다.

---

## 1. 개요 및 변경 목적
- **헤더 버튼 짤림 방지**: 버튼들의 역할에 따른 분산 배치 및 에디터 영역 100% 폭 확장에 힘입어 짤림 현상을 완벽히 해결합니다.
- **마크다운 2분할 화면 협소 문제 해결**: 에디터와 미리보기가 좌우로 쪼개져 답답하던 화면을 100% 단일 폭 에디터로 확장하고, 상단에 `[👁️ 미리보기]` 토글 버튼을 추가해 CSS 클래스 조작만으로 에디터 뷰와 렌더링된 프리뷰를 간편하게 토글합니다.
- **텍스트 드래그 및 영역 이미지 크롭의 조작 충돌 해소**: 평소에는 일반 텍스트 선택이 기본이 되도록 오버레이를 해제하고, `[✂️ 영역 크롭]` 버튼을 누를 때만 일회성 십자커서 캡처 오버레이를 켜서 충돌을 방지합니다.

---

## 2. 세부 UI 및 기능 설계

### 2.1. 버튼 배치 구조 개선
헤더 가로폭 균형을 위해 다음과 같이 버튼들을 좌우 헤더로 재분배합니다.
- **왼쪽 문서 뷰어 헤더**:
  - `[문서 열기] (notelab-open-doc-btn)`
  - `[✂️ 영역 크롭] (notelab-toggle-crop-btn)` - 신설
  - `[닫기] (notelab-close-doc-btn)`
- **오른쪽 마크다운 에디터 헤더**:
  - `[저장 (.md)] (notelab-save-btn)`
  - `[한글(HWPX) 패치 저장] (notelab-patch-btn)`
  - `[신구 비교] (notelab-compare-btn)`
  - `[전체 텍스트 가져오기] (notelab-parse-all-btn)`
  - `[👁️ 미리보기] (notelab-toggle-preview-btn)` - 신설 (토글형)
  - `[🤖 AI 분석] (notelab-ai-btn)`

---

### 2.2. 마크다운 에디터 & 미리보기 토글 (CSS 제어)
에디터 컨테이너에 `.notelab-editor-only` 클래스가 기본 부여되며, 미리보기 활성화 시 `.notelab-preview-only` 클래스로 토글됩니다.
- **CSS 스타일 구성 (`style.css`)**:
  ```css
  /* 기본: 에디터 100% 채움, 프리뷰 가림 */
  .notelab-editor-only .toastui-editor-md-container {
      width: 100% !important;
      display: block !important;
  }
  .notelab-editor-only .toastui-editor-md-preview {
      display: none !important;
  }

  /* 토글: 프리뷰 100% 채움, 에디터 가림 */
  .notelab-preview-only .toastui-editor-md-container {
      display: none !important;
  }
  .notelab-preview-only .toastui-editor-md-preview {
      width: 100% !important;
      display: block !important;
  }
  ```
- **JS 토글 처리 (`notelab.js`)**:
  `[👁️ 미리보기]` 버튼 클릭 시 아래 클래스 전환을 트리거합니다.
  ```javascript
  const editorWrapper = document.getElementById("notelab-markdown-editor");
  editorWrapper.classList.toggle("notelab-editor-only");
  editorWrapper.classList.toggle("notelab-preview-only");
  ```

---

### 2.3. PDF 텍스트 드래그 선택 및 미니 컨텍스트 메뉴
- **텍스트 레이어 투과 해제**:
  기본 상태에서 `selection-overlay` 엘리먼트에 `pointer-events: none`을 부여하여 마우스 드래그가 하단의 PDF.js 텍스트 레이어로 전달되도록 설정합니다.
- **미니 컨텍스트 메뉴 팝업 (Iframe 내부 구현)**:
  사용자가 텍스트를 선택하고 마우스를 뗄 때(또는 선택 후 우클릭 시) 선택 텍스트 바로 옆에 플로팅 팝업 메뉴를 노출합니다:
  1. **📋 단순 복사**: 선택 텍스트 클립보드 복사.
  2. **✨ 띄어쓰기 정리 복사**: 줄바꿈 문자 제거 및 한글 띄어쓰기 정제 복사.
  3. **📝 에디터로 보내기**: 정제한 텍스트를 `window.parent`를 거쳐 Toast UI Editor 현재 커서 위치에 바로 삽입(`insertText`).

---

### 2.4. 영역 이미지 크롭 모드 전환 시나리오
- 사용자가 뷰어 헤더의 **`[✂️ 영역 크롭]`** 버튼을 클릭하면 `selection-overlay`에 `pointer-events: auto`를 일시 부여하고, 커서를 `crosshair`로 변경하여 캡처 대기 상태를 만듭니다.
- 드래그하여 영역을 선택하고 크롭/OCR 작업을 개시하거나 팝업에서 `취소`를 누르면 즉시 `pointer-events: none` 상태로 돌려놓아 글자 드래그 선택 모드로 복구합니다.

---

## 3. 검증 계획
- **수동 기능 검증**:
  - PDF 뷰어 내에서 일반 텍스트 드래그가 부드럽게 동작하고, 미니 팝업 메뉴가 뜨는지 검증합니다.
  - 미니 팝업에서 `[에디터로 보내기]` 클릭 시 띄어쓰기와 줄바꿈이 깔끔하게 정제되어 에디터에 삽입되는지 확인합니다.
  - `[✂️ 영역 크롭]` 버튼 클릭 시 일회성으로 영역 캡처 모드로 정상 전환되고 종료 후 원래 상태로 돌아오는지 점검합니다.
  - `[👁️ 미리보기]` 토글 버튼이 작동하여 분할선 없이 100% 폭으로 화면이 시원하게 교차 전환되는지 확인합니다.
