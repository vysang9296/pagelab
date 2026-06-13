# Folder Lab - Page Lab 연계 기능 구현 계획서 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) to implement this plan task-by-task.

**Goal:** Folder Lab의 모든 영역(로컬, 실시간, 가상, 검색)에서 PDF/HWP 문서를 우클릭하여 Page Lab의 원본 파일로 즉시 가져와 편집할 수 있는 연계 기능 구현.

---

### Task 1: index.html에 연계 컨텍스트 메뉴 추가
- **파일**: [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html)
- [ ] **Step 1: 공통 컨텍스트 메뉴 마크업 수정**
  - `#fl-context-menu` 영역(대략 249-258라인) 하단에 연계 항목을 추가합니다.
  ```html
  <div id="fl-ctx-open-pagelab" class="fl-context-menu-item" onclick="flExecuteContextMenu('open_pagelab')">📄 Page Lab에서 편집하기</div>
  ```

---

### Task 2: 컨텍스트 메뉴 노출 분기 제어
- **파일**: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)
- [ ] **Step 1: flShowContextMenu 내 노출 로직 수정**
  - `flShowContextMenu` 함수(대략 1313라인 부근)의 요소 초기화 배열에 `fl-ctx-open-pagelab` 요소를 추가합니다.
  - 우클릭한 타겟의 경로(`path`) 확장자가 `.pdf`, `.hwp`, `.hwpx`인지 검사하는 헬퍼 판단식을 넣습니다.
  - 가상 스테이징(`staging`) 폴더 노드인 경우에도 해당 항목이 노출되도록 `display = 'block'` 처리합니다.

---

### Task 3: 재귀적 파일 경로 수집 및 연계 전송 로직 구현
- **파일**: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)
- [ ] **Step 1: open_pagelab 액션 핸들러 구현**
  - `flExecuteContextMenu` 함수(대략 1384라인 부근) 내부에 `action === 'open_pagelab'` 케이스를 생성합니다.
  - 타겟이 가상 폴더인 경우, `id`를 기준으로 `flStagingFolders` 트리를 탐색하여 그 하위에 매핑된 모든 실제 파일 절대 경로(`path`)를 재귀적으로 모아 `paths` 배열을 구성합니다.
  - 타겟이 단일 파일인 경우, `paths = [path]` 단일 경로 배열을 구성합니다.
  - `paths` 배열에 원소가 존재하면, 로딩바(`showLoading`)를 구동하고 백엔드 API인 `pywebview.api.process_files(paths)`를 비동기로 호출합니다.
  - 로드 작업 완료 시 `switchTab('pagelab')` 함수를 호출해 Page Lab 워크스페이스로 즉시 전환한 후 로딩바를 닫습니다.

---

### Task 4: 자동 단위 테스트 및 수동 교차 검증
- **파일**: [tests/test_export_improvements.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/tests/test_export_improvements.py)
- [ ] **Step 1: 단위 테스트 실행 및 코드 정합성 검토**
  - 전체 단위 테스트를 구동하여 정상 통과를 보장합니다.
  - 명령: `python -m unittest discover -s tests`
- [ ] **Step 2: 수동 검증 시나리오 테스트**
  - 1. 검색 결과창에 노출된 문서 우클릭 후 Page Lab 전송 동작 검증.
  - 2. 좌측 탐색기 문서 우클릭 후 Page Lab 전송 동작 검증.
  - 3. 우측 가상 스테이징 내부의 개별 가상 문서 및 가상 폴더 우클릭 후 일괄 전송 및 자동 탭 전환 동작 검증.
