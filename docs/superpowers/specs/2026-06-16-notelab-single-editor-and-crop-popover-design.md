# Note Lab 단일 WYSIWYG 에디터 고정 및 크롭 팝업 레이아웃 보정 설계서

본 설계서는 Note Lab의 영역 크롭 시 발생하는 팝업 오정렬 버그를 해결하고, 오른쪽 편집기 영역을 Obsidian Live Preview 스타일의 단일 WYSIWYG 모드로 일원화하여 에디터 사용성을 극대화하기 위한 상세 구조를 명세합니다.

---

## 🛠️ 세부 요구사항 및 해결 방안

### 1. 영역 크롭 팝업 메뉴 (`#popover-menu`) 오정렬 및 칸 깨짐 해결
- **현상**:
  - 영역 크롭 드래그 종료 시 팝업되는 메뉴가 엉뚱한 위치(스크롤에 따라 화면 밖이나 아주 아래쪽)에 노출되었습니다.
  - 버튼들이 정렬되지 않고 칸 배치가 깨지는 문제가 발생했습니다.
- **해결**:
  - 마우스 좌표 지정 시 화면 뷰포트 기준인 `clientX`/`clientY` 대신 스크롤 절대 위치를 포함하는 `pageX`/`pageY`로 일원화합니다.
  - `.action-popover` 및 `.popover-btn` CSS 규칙을 보정하여 Flexbox 정렬(가로 정렬 및 수직 중앙 정렬)과 줄바꿈 방지(`white-space: nowrap`)를 확실하게 세팅합니다.

### 2. Obsidian 스타일 단일 WYSIWYG 에디터 고정
- **현상**:
  - 기존 Markdown과 WYSIWYG 탭을 나눠 두어 사용자가 편집 시 두 화면을 왕래해야 하는 번거로움이 있었습니다.
- **해결**:
  - Toast UI Editor v3 초기화 인스턴스 옵션에 `hideModeSwitch: true`와 `initialEditType: 'wysiwyg'`를 부여하여 하단 탭 바를 원천 제거하고 단일 편집 인터페이스로 고정합니다.
  - 상단 헤더 영역에서 더 이상 사용성이 없어진 `👁️ 미리보기` 버튼(`notelab-toggle-preview-btn`)을 완전히 제거하고 관련 클릭 리스너 코드도 정리합니다.

---

## 📅 변경 대상 파일 및 코드 명세

### 1. `frontend/pdf_viewer.html`
- **CSS 스타일 수정**: `#popover-menu`와 연동되는 `.action-popover` 및 `.popover-btn` 스타일을 가로형 버튼 바 구조로 다듬습니다.
- **JS 마우스업 핸들러 수정**: `setupSelectionDrawing` 내 마우스업 이벤트에서 `showPopover(e.clientX, e.clientY + ...)` 구조를 `showPopover(e.pageX, e.pageY)`로 간소화합니다.

### 2. `frontend/index.html`
- **미리보기 버튼 삭제**: `#notelab-toggle-preview-btn` 마크업을 툴바에서 완전히 제거합니다.

### 3. `frontend/notelab.js`
- **에디터 설정 보정**: `initNoteLabEditor()` 내 생성자 옵션에 `hideModeSwitch: true`를 지정하고, 기존 `changeMode` 이벤트에 묶여 있던 클래스 변경 핸들러를 단순화합니다.
- **미리보기 버튼 리스너 제거**: `notelab-toggle-preview-btn`에 매핑되어 있던 이벤트 리스너 코드를 제거합니다.

---

## 🧪 검증 계획

### 1. 수동 기능 검증
1. **영역 크롭 팝업 포지션**: PDF를 연 뒤 마우스 스크롤을 끝까지 내린 상태에서 영역 크롭을 시도하여, 드래그 완료 시 마우스 뗀 위치 바로 옆에 정확히 팝업이 노출되는지 확인합니다.
2. **팝업 정렬**: 이미지 크롭, 글자 추출(OCR), 취소 버튼 세 개가 줄바꿈 없이 미려한 가로형 버튼 바 형태로 깨짐 없이 나오는지 확인합니다.
3. **단일 WYSIWYG 모드**: 에디터 하단의 Markdown/WYSIWYG 탭이 아예 보이지 않는지 확인하고, 본문 입력 중 마크다운 구문을 치면 Obsidian처럼 실시간 렌더링 카드(이미지 등)가 표시되는지 확인합니다.
4. **미리보기 버튼 배제**: 헤더에서 `👁️ 미리보기` 버튼이 완전히 사라졌는지 확인합니다.
