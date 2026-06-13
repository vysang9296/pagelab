# Page Lab 사용성 및 내보내기 개선 구현 계획서 (Page Lab Usability Improvements Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page Lab의 다중 선택 편의성을 높이기 위해 페이지 카드 클릭 시 체크박스 연동 선택 및 Shift 범위 선택 기능을 개발하고, 우클릭 분류 폴더 보내기 서브메뉴 추가 및 명시적인 내보내기 버튼을 구현합니다. 또한 요구사항에 맞춰 백엔드 단위 테스트 케이스를 대폭 강화합니다.

**Architecture:** 
1. HTML/CSS 마크업을 변경하여 페이지 카드 체크박스 및 돋보기 버튼, 툴바의 전체 선택/해제 단추, 그리고 서브메뉴 CSS를 스타일링합니다.
2. `app.js`에서 페이지 선택 상태(`selected`)와 체크박스 상태를 연동하고, Shift+Click 범위 선택 알고리즘을 개선합니다.
3. 페이지 카드 우클릭 시 생성된 폴더 목록 서브메뉴를 동적으로 구성하여 일괄 복사(`sendSelectedPagesToGroup`)를 구현합니다.
4. 우측 그룹 패널 상단에 내보내기 단추를 생성하고 클릭 시 옵션 다이얼로그 모달을 띄워 내보내기 API를 매핑합니다.
5. `tests/test_export_improvements.py`에 경로 탈취 방지, Windows 예약어 보안, 다양한 회전값 변환, 빈 페이로드 예외 방지, 중첩 ZIP 가공 등 총 5가지의 강화된 단위 테스트를 구현합니다.

**Tech Stack:** Vanilla HTML, Vanilla CSS, Vanilla JavaScript, Python unittest

---

### Task 1: HTML & CSS 마크업 및 스타일링

**Files:**
- Modify: [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html)
- Modify: [style.css](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/style.css)

- [ ] **Step 1: index.html 툴바 및 내보내기 마크업 수정**
  
  [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html) 파일의 Page Lab 센터 뷰어 툴바(65-71라인 부근) 및 우측 패널 헤더(81-88라인 부근)를 수정합니다.
  
  툴바 부분 수정 예시:
  ```html
                  <div style="margin-left: auto; display: flex; gap: 8px;">
                      <button class="secondary-btn" onclick="selectAllPages()">☑ 전체 선택</button>
                      <button class="secondary-btn" onclick="deselectAllPages()">☐ 선택 해제</button>
                      <button class="secondary-btn" onclick="addBlankPage()">+ 간지 추가</button>
                      <button class="secondary-btn" onclick="rotateSelected()">선택 회전</button>
                      <button class="danger-btn" onclick="deleteSelected()">선택 제외(삭제)</button>
                  </div>
  ```

  우측 그룹 패널 헤더 수정 예시:
  ```html
              <div class="panel-header">
                  <h3>분류 폴더 (Groups)</h3>
                  <div style="display:flex; gap:4px;">
                      <button class="secondary-btn" style="padding: 4px 8px; font-size: 12px;" onclick="showPageLabExportDialog()">📤 내보내기</button>
                      <button class="primary-btn" style="padding: 4px 8px; font-size: 12px;" onclick="addGroup()">+ 폴더</button>
                  </div>
              </div>
  ```

- [ ] **Step 2: style.css 스타일 추가**

  [style.css](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/style.css) 하단에 체크박스, 돋보기 오버레이 및 컨텍스트 서브메뉴용 스타일을 추가합니다.

  ```css
  /* Page Lab Page Checkbox & Zoom overlay styling */
  .page-card-checkbox-container {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 6;
  }
  .page-card-checkbox {
      width: 18px;
      height: 18px;
      cursor: pointer;
  }
  .zoom-hover-btn {
      display: none;
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(26, 115, 232, 0.9);
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      z-index: 5;
  }
  .page-card:hover .zoom-hover-btn {
      display: block;
  }

  /* Context Submenu styling */
  .send-to-group-trigger {
      position: relative;
  }
  .context-submenu {
      display: none;
      position: absolute;
      left: 100%;
      top: 0;
      background: white;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-md);
      border-radius: 4px;
      min-width: 150px;
      padding: 4px 0;
      z-index: 2000;
  }
  .send-to-group-trigger:hover .context-submenu {
      display: block;
  }
  ```

- [ ] **Step 3: Git 커밋**
  ```bash
  git add frontend/index.html frontend/style.css
  git commit -m "feat: add markup and CSS styling for checkboxes, zoom, and submenus in Page Lab"
  ```

---

### Task 2: Page Lab 페이지 카드 체크박스 및 선택 토글 로직 구현

**Files:**
- Modify: [app.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/app.js)

- [ ] **Step 1: `createPageCard` 함수 내부 체크박스 및 돋보기(Zoom) 버튼 추가**

  [app.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/app.js)의 `createPageCard` 함수(297라인 부근) 내부에 체크박스 컨테이너와 돋보기 줌 버튼을 생성하고 삽입합니다.

  ```javascript
      // Checkbox container at top-left
      const chkCont = document.createElement('div');
      chkCont.className = 'page-card-checkbox-container';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'page-card-checkbox';
      chk.checked = card.classList.contains('selected'); // sync check status
      chk.onclick = (e) => {
          e.stopPropagation();
          card.classList.toggle('selected');
          lastClickedThumbId = pageData.id;
      };
      chkCont.appendChild(chk);
      card.appendChild(chkCont);
  ```
  그리고 줌 오버레이 버튼 생성:
  ```javascript
      const zoomBtn = document.createElement('button');
      zoomBtn.className = 'zoom-hover-btn';
      zoomBtn.innerText = '🔍 크게 보기';
      zoomBtn.onclick = (e) => { e.stopPropagation(); openZoom(pageData.dataUrl); };
      card.appendChild(zoomBtn);
  ```

- [ ] **Step 2: `handleThumbClick` 선택 연동 및 Shift+Click 범위 선택 구현**

  마우스 클릭 및 Shift 범위 선택 시 체크박스 속성도 정상 연동되도록 수정합니다.

  ```javascript
  function handleThumbClick(e, card, index, currentList) {
      if(e.shiftKey && lastClickedThumbId) {
          const lastIdx = currentList.findIndex(id => id === lastClickedThumbId);
          if(lastIdx !== -1) {
              const min = Math.min(lastIdx, index);
              const max = Math.max(lastIdx, index);
              document.querySelectorAll('.page-card').forEach((c, i) => {
                  if(i >= min && i <= max) {
                      c.classList.add('selected');
                      const checkbox = c.querySelector('.page-card-checkbox');
                      if (checkbox) checkbox.checked = true;
                  }
              });
          }
      } else if (e.ctrlKey || e.metaKey) {
          card.classList.toggle('selected');
          const checkbox = card.querySelector('.page-card-checkbox');
          if (checkbox) checkbox.checked = card.classList.contains('selected');
      } else {
          document.querySelectorAll('.page-card').forEach(c => {
              c.classList.remove('selected');
              const checkbox = c.querySelector('.page-card-checkbox');
              if (checkbox) checkbox.checked = false;
          });
          card.classList.add('selected');
          const checkbox = card.querySelector('.page-card-checkbox');
          if (checkbox) checkbox.checked = true;
      }
      lastClickedThumbId = card.dataset.pid;
  }
  ```

- [ ] **Step 3: 전체 선택(`selectAllPages`) 및 전체 해제(`deselectAllPages`) 함수 구현**

  ```javascript
  function selectAllPages() {
      document.querySelectorAll('.page-card').forEach(c => {
          c.classList.add('selected');
          const checkbox = c.querySelector('.page-card-checkbox');
          if (checkbox) checkbox.checked = true;
      });
  }

  function deselectAllPages() {
      document.querySelectorAll('.page-card').forEach(c => {
          c.classList.remove('selected');
          const checkbox = c.querySelector('.page-card-checkbox');
          if (checkbox) checkbox.checked = false;
      });
  }
  ```

- [ ] **Step 4: Git 커밋**
  ```bash
  git add frontend/app.js
  git commit -m "feat: implement page card checkbox toggle, shift range select, and select all/none"
  ```

---

### Task 3: 페이지 우클릭 "분류 폴더로 보내기" 메뉴 구현

**Files:**
- Modify: [app.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/app.js)

- [ ] **Step 1: `showPageContextMenu` 서브메뉴 마크업 생성**

  `showPageContextMenu(e, pId)` 함수를 변경하여 마우스 호버 시 현재 생성된 폴더 목록 서브메뉴를 동적으로 렌더링하도록 구현합니다.

  ```javascript
  function showPageContextMenu(e, pId) {
      const groupItems = Object.keys(groups).map(gId => `
          <div class="context-menu-item" onclick="sendSelectedPagesToGroup('${gId}')">${escapeHTML(groups[gId].name)}</div>
      `).join('');

      const html = `
          <div class="context-menu-item" onclick="renamePage('${pId}')">✏️ 페이지 이름 지정</div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item send-to-group-trigger">📁 분류 폴더로 보내기 ▸
              <div class="context-submenu">
                  ${groupItems || '<div class="context-menu-item" style="color:#888; cursor:default;">(폴더 없음)</div>'}
              </div>
          </div>
      `;
      showMenu(e, html);
  }
  ```

- [ ] **Step 2: `sendSelectedPagesToGroup` 함수 구현**

  선택된 페이지들을 그룹 폴더로 복사하고 사이드바 배지를 갱신합니다.

  ```javascript
  function sendSelectedPagesToGroup(targetGroupId) {
      const selectedCards = document.querySelectorAll('.page-card.selected');
      let pIdsToAdd = [];
      if (selectedCards.length > 0) {
          pIdsToAdd = Array.from(selectedCards).map(c => c.dataset.pid);
      } else if (lastClickedThumbId) {
          pIdsToAdd = [lastClickedThumbId];
      }

      if (pIdsToAdd.length === 0) return;

      // Duplicate check: Add only if not already present in the target group
      pIdsToAdd.forEach(pId => {
          if (!groups[targetGroupId].pageIds.includes(pId)) {
              groups[targetGroupId].pageIds.push(pId);
          }
      });

      updateGroupSidebar();
      renderCenterViewer();
      
      const menu = document.getElementById('context-menu');
      if (menu) menu.style.display = 'none';
  }
  ```

- [ ] **Step 3: Git 커밋**
  ```bash
  git commit -am "feat: implement right click send to group submenu in page lab"
  ```

---

### Task 4: 명시적 그룹 내보내기 버튼 및 팝업 대화상자 구현

**Files:**
- Modify: [app.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/app.js)

- [ ] **Step 1: `showPageLabExportDialog` 대화상자 생성 함수 구현**

  상단 `내보내기` 단추 클릭 시 다이얼로그 모달을 띄워 사용자에게 세 가지 옵션을 제시하고 기존 API 핸들러로 매핑합니다.

  ```javascript
  function showPageLabExportDialog() {
      // Find checked group folders
      const selectedGIds = Array.from(selectedGroupIds);
      if (selectedGIds.length === 0) {
          alert("내보낼 분류 폴더를 우측 목록에서 한 개 이상 선택(클릭)해주세요.");
          return;
      }

      const modal = document.createElement('div');
      modal.style.position = 'fixed'; modal.style.top = '0'; modal.style.left = '0';
      modal.style.width = '100%'; modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
      modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center';
      modal.style.zIndex = '9999';

      const dialog = document.createElement('div');
      dialog.style.background = '#fff'; dialog.style.padding = '24px'; dialog.style.borderRadius = '8px';
      dialog.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; dialog.style.width = '420px'; dialog.style.textAlign = 'center';

      const title = document.createElement('h3');
      title.innerText = '문서 분류 결합 내보내기';
      title.style.margin = '0 0 12px 0'; title.style.fontSize = '16px';

      const desc = document.createElement('p');
      desc.innerText = `선택한 ${selectedGIds.length}개 분류 폴더를 어떤 형태로 다운로드하시겠습니까?`;
      desc.style.fontSize = '13px'; desc.style.color = '#666'; desc.style.margin = '0 0 20px 0';

      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex'; btnContainer.style.flexDirection = 'column'; btnContainer.style.gap = '8px';

      // Button 1: Merge selected to single PDF (for single group) or multiple ZIP
      const mergeBtn = document.createElement('button');
      mergeBtn.className = 'primary-btn';
      mergeBtn.innerText = selectedGIds.length === 1 ? '🗂️ 단일 PDF 파일로 결합 저장' : '🗂️ 각 폴더별 통합 PDF 모음 (ZIP)';
      mergeBtn.onclick = () => {
          document.body.removeChild(modal);
          if (selectedGIds.length === 1) exportGroupMerge();
          else exportMultiMerge();
      };

      // Button 2: Separate pages to ZIP
      const sepBtn = document.createElement('button');
      sepBtn.className = 'secondary-btn';
      sepBtn.innerText = selectedGIds.length === 1 ? '📑 페이지별 개별 PDF로 분할 저장 (ZIP)' : '📑 다중 폴더 개별 페이지 압축 (이중 ZIP)';
      sepBtn.onclick = () => {
          document.body.removeChild(modal);
          if (selectedGIds.length === 1) exportGroupSeparate();
          else exportMultiSeparate();
      };

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary-btn';
      cancelBtn.innerText = '취소';
      cancelBtn.style.marginTop = '8px';
      cancelBtn.onclick = () => { document.body.removeChild(modal); };

      btnContainer.appendChild(mergeBtn);
      btnContainer.appendChild(sepBtn);
      btnContainer.appendChild(cancelBtn);
      dialog.appendChild(title);
      dialog.appendChild(desc);
      dialog.appendChild(btnContainer);
      modal.appendChild(dialog);
      document.body.appendChild(modal);
  }
  ```

- [ ] **Step 2: Git 커밋**
  ```bash
  git commit -am "feat: implement visible export dialog for Page Lab groups"
  ```

---

### Task 5: 단위 테스트 강화 (`tests/test_export_improvements.py` 수정)

**Files:**
- Modify: [tests/test_export_improvements.py](file:///c:/Users/kyung/.gemini/antigravity/Lab/tests/test_export_improvements.py)

- [ ] **Step 1: tests/test_export_improvements.py에 강화된 5가지 테스트 구현**

  1. 경로 탈취 방지 (`test_safe_filename_path_traversal`)
  2. Windows 예약어 보안 (`test_safe_filename_reserved_words`)
  3. 다양한 회전값 가공 (`test_rotation_validation_edge_cases`)
  4. 빈 페이로드 예외 방지 (`test_export_data_empty_payload`)
  5. 복잡한 중첩 구조 가공 (`test_export_data_nested_zip_structure`)

  ```python
  import unittest
  import os
  import shutil
  from unittest.mock import MagicMock, patch
  from main import Api, safe_filename
  from backend.virtual_fs import VirtualFS

  class TestExportImprovements(unittest.TestCase):
      @patch('backend.pdf_processor.PdfProcessor.merge_and_export')
      def test_rotation_validation(self, mock_merge_export):
          mock_merge_export.return_value = 'dummy_path.pdf'
          api = Api()
          api._fm = MagicMock()
          
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
          api.export_data('single_zip', 'dummy.zip', payload)
          self.assertEqual(payload[0]['data'][0]['pages'][0]['rotation'], 0)

      def test_zip_path_standardization(self):
          virtual_folders = [
              {
                  "name": "folder\\subfolder",
                  "isDir": True,
                  "children": []
              }
          ]
          success = VirtualFS.export_virtual_tree(virtual_folders, "test_out.zip", export_mode="zip")
          self.assertTrue(success)
          self.assertTrue(os.path.exists("test_out.zip"))
          if os.path.exists("test_out.zip"):
              os.remove("test_out.zip")

      def test_safe_filename_path_traversal(self):
          # 경로 탈취 페이로드가 들어오는 경우 디렉터리 경로 문자를 정화하는지 검증
          self.assertEqual(safe_filename("../../../etc/passwd"), "___etc_passwd")
          self.assertEqual(safe_filename("..\\..\\windows\\system32.dll"), "___windows_system32.dll")
          self.assertEqual(safe_filename("a/b/c/test.pdf"), "a_b_c_test.pdf")

      def test_safe_filename_reserved_words(self):
          # Windows 특수문자 및 예약어 필터링 검증
          self.assertEqual(safe_filename("test*file?.pdf"), "test_file_.pdf")
          self.assertEqual(safe_filename(""), "Export")

      def test_rotation_validation_edge_cases(self):
          api = Api()
          api._fm = MagicMock()
          
          # 다양한 비정상 회전값 검사 (360 -> 0, -90 -> 0, 9999 -> 0, 정상 90 -> 90)
          payload = {
              "group_name": "Edited",
              "pages": [
                  {"file_path": "a.pdf", "page_index": 0, "rotation": 360},
                  {"file_path": "b.pdf", "page_index": 1, "rotation": -90},
                  {"file_path": "c.pdf", "page_index": 2, "rotation": 90},
                  {"file_path": "d.pdf", "page_index": 3, "rotation": 9999}
              ]
          }
          api.export_data('single_pdf', 'dummy.pdf', payload)
          self.assertEqual(payload['pages'][0]['rotation'], 0)
          self.assertEqual(payload['pages'][1]['rotation'], 0)
          self.assertEqual(payload['pages'][2]['rotation'], 90)
          self.assertEqual(payload['pages'][3]['rotation'], 0)

      def test_export_data_empty_payload(self):
          api = Api()
          # 빈 페이로드 입력 시 예외를 방지하고 정상적으로 False 반환하는지 테스트
          self.assertFalse(api.export_data('single_pdf', 'dummy.pdf', None))
          self.assertFalse(api.export_data('invalid_type', 'dummy.pdf', {}))

      @patch('backend.pdf_processor.PdfProcessor.merge_and_export')
      def test_export_data_nested_zip_structure(self, mock_merge_export):
          mock_merge_export.return_value = 'dummy.pdf'
          api = Api()
          api._fm = MagicMock()

          # 복잡한 다중 이중 ZIP 압축 Payload 가공 검증
          payload = [
              {
                  "type": "zip",
                  "name": "NestedFolder",
                  "data": [
                      {
                          "group_name": "InnerMerge",
                          "pages": [
                              {"file_path": "sub1.pdf", "page_index": 0, "rotation": 180},
                              {"file_path": "sub2.pdf", "page_index": 1, "rotation": 120}  # -> 0으로 변환되어야 함
                          ]
                      }
                  ]
              }
          ]
          api.export_data('single_zip', 'dummy.zip', payload)
          self.assertEqual(payload[0]['data'][0]['pages'][0]['rotation'], 180)
          self.assertEqual(payload[0]['data'][0]['pages'][1]['rotation'], 0)

  if __name__ == '__main__':
      unittest.main()
  ```

- [ ] **Step 2: 전체 단위 테스트 실행**

  Run: `python -m unittest discover -s tests`
  Expected: 기존 9개 + 신규 5개 = **총 14개 테스트 케이스가 성공 (`OK`)**

- [ ] **Step 3: Git 커밋**
  ```bash
  git add tests/test_export_improvements.py
  git commit -m "test: add comprehensive test cases for path traversal, reserved words, and rotation edge cases"
  ```
