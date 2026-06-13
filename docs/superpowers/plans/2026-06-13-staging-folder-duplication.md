# 가상 스테이징 폴더/파일 복제 기능 구현 계획서 (Staging Folder Duplication Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Folder Lab의 가상 스테이징 영역에서 폴더나 파일을 우클릭하여 동일 레벨 위치에 복제(참조 딥클론 및 고유 ID 재발급)하는 기능을 추가합니다.

**Architecture:** 
1. HTML 컨텍스트 메뉴에 복제 버튼을 추가합니다.
2. `folderlab.js`에서 복제 액션을 수신하면 가상 트리 배열(`flStagingFolders`)을 탐색하여 타겟 노드를 찾습니다.
3. 타겟 노드를 재귀적으로 복제하되 새 고유 ID를 발급하고, 이름 규칙(`(복사본)`, `(복사본 N)`)에 따라 새 이름을 지정한 뒤 원래 노드의 바로 다음 인덱스에 삽입하고 트리를 다시 렌더링합니다.

**Tech Stack:** Vanilla HTML, Vanilla JavaScript, SQLite FTS5 (하위 검색 엔진), PyWebView (데스크톱 프레임워크)

---

### Task 1: UI 마크업 수정

**Files:**
- Modify: [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html#L248-L257)

- [ ] **Step 1: `#fl-context-menu` 컨텍스트 메뉴에 복제 버튼 마크업 추가**

  [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html) 파일의 `#fl-context-menu` 내부에 복제 항목 `<div id="fl-ctx-duplicate"...>`를 추가합니다.

  수정할 코드 블록:
  ```html
      <!-- Right Click Context Menu -->
      <div id="fl-context-menu" class="fl-context-menu">
          <div id="fl-ctx-open-file" class="fl-context-menu-item" onclick="flExecuteContextMenu('open_file')">🚀 파일 즉시 실행</div>
          <div id="fl-ctx-open-folder" class="fl-context-menu-item" onclick="flExecuteContextMenu('open_folder')">📁 폴더 위치 열기 (탐색기)</div>
          <div id="fl-ctx-new-folder" class="fl-context-menu-item" onclick="flExecuteContextMenu('new_folder')">➕ 새 폴더 만들기</div>
          <div id="fl-ctx-rename" class="fl-context-menu-item" onclick="flExecuteContextMenu('rename')">✏️ 이름 변경</div>
          <div id="fl-ctx-duplicate" class="fl-context-menu-item" onclick="flExecuteContextMenu('duplicate')">👯 복제 (Duplicate)</div>
          <div id="fl-ctx-export-zip" class="fl-context-menu-item" onclick="flExecuteContextMenu('export_zip')">📦 이 폴더 ZIP으로 내보내기</div>
          <div id="fl-ctx-export-sync" class="fl-context-menu-item" onclick="flExecuteContextMenu('export_sync')">🔄 이 폴더 로컬 동기화 (Commit)</div>
          <div id="fl-ctx-delete" class="fl-context-menu-item" onclick="flExecuteContextMenu('delete')">✖ 삭제</div>
      </div>
  ```

- [ ] **Step 2: 로컬 테스트용 브라우저 테스트 및 Git 커밋**
  ```bash
  git add frontend/index.html
  git commit -m "feat: add duplicate item to fl-context-menu markup"
  ```

---

### Task 2: 복제 비즈니스 로직 구현

**Files:**
- Modify: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)

- [ ] **Step 1: `flShowContextMenu` 함수에서 `fl-ctx-duplicate` 보이도록 제어**

  `flShowContextMenu` 함수에서 `duplicateItem` 요소를 가져와 초기화 목록에 추가하고, `treeType === 'staging'` 일 때 활성화합니다.

  대상 범위: [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)의 `flShowContextMenu` 함수 내부.
  TargetContent 예시:
  ```javascript
      const exportSync = document.getElementById('fl-ctx-export-sync');
      const deleteItem = document.getElementById('fl-ctx-delete');
      const duplicateItem = document.getElementById('fl-ctx-duplicate');

      // Reset all to none
      [openFile, openFolder, newFolder, renameItem, exportZip, exportSync, deleteItem, duplicateItem].forEach(el => {
          if (el) el.style.display = 'none';
      });
  ```
  그리고 `treeType === 'staging'` 섹션 내부에 노출 추가:
  ```javascript
      } else if (treeType === 'staging') {
          if (isDir) {
              if (newFolder) newFolder.style.display = 'block';
              if (exportZip) exportZip.style.display = 'block';
              if (exportSync) exportSync.style.display = 'block';
          }
          if (renameItem) renameItem.style.display = 'block';
          if (deleteItem) deleteItem.style.display = 'block';
          if (duplicateItem) duplicateItem.style.display = 'block';
      }
  ```

- [ ] **Step 2: `flExecuteContextMenu` 함수에 `duplicate` 액션 라우팅 추가**

  `flExecuteContextMenu` 함수 내부에 `duplicate` 케이스를 추가하여 신규 작성할 `flDuplicateStagingNode(id)`를 호출하도록 연동합니다.

  TargetContent 예시:
  ```javascript
      } else if (action === 'delete') {
          // ...기존 코드...
      } else if (action === 'duplicate') {
          if (treeType === 'staging' && id) {
              flDuplicateStagingNode(id);
          }
      } else if (action === 'export_zip') {
  ```

- [ ] **Step 3: 복제 핵심 함수 `flDuplicateStagingNode` 및 헬퍼 함수 구현**

  `folderlab.js` 파일 하단 또는 적절한 위치에 복제 로직을 수행할 신규 함수들을 정의합니다.

  ```javascript
  // 복제본의 새 이름 생성 규칙
  function flGenerateCopyName(originalName) {
      const match = originalName.match(/(.*)\s\(복사본(?:\s(\d+))?\)$/);
      if (match) {
          const baseName = match[1];
          const num = match[2] ? parseInt(match[2], 10) : 1;
          return `${baseName} (복사본 ${num + 1})`;
      } else {
          return `${originalName} (복사본)`;
      }
  }

  // 노드 재귀 딥클론 및 ID 재발급
  function flCloneStagingNode(node) {
      const sId = (node.isDir ? 'sfolder_' : 'sfile_') + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const cloned = {
          id: sId,
          name: node.name,
          isDir: node.isDir,
          path: node.path,
          size: node.size,
          mtime: node.mtime
      };
      if (node.isDir && node.children) {
          cloned.children = node.children.map(child => flCloneStagingNode(child));
      }
      return cloned;
  }

  // 타겟 노드의 부모 리스트와 인덱스 찾기
  function flFindStagingNodeAndParent(arr, targetId) {
      for (let i = 0; i < arr.length; i++) {
          if (arr[i].id === targetId) {
              return { parentArray: arr, index: i };
          }
          if (arr[i].isDir && arr[i].children) {
              const result = flFindStagingNodeAndParent(arr[i].children, targetId);
              if (result) return result;
          }
      }
      return null;
  }

  // 가상 스테이징 복제 진입점
  function flDuplicateStagingNode(id) {
      const res = flFindStagingNodeAndParent(flStagingFolders, id);
      if (!res) {
          console.error("[FolderLab] Duplicate target not found: " + id);
          return;
      }
      const { parentArray, index } = res;
      const originalNode = parentArray[index];
      
      const clonedNode = flCloneStagingNode(originalNode);
      clonedNode.name = flGenerateCopyName(originalNode.name);
      
      // 원래 위치 바로 뒤에 삽입
      parentArray.splice(index + 1, 0, clonedNode);
      
      flRenderStagingTree();
      flCheckMultiDelState();
  }
  ```

- [ ] **Step 4: Git 커밋**
  ```bash
  git add frontend/folderlab.js
  git commit -m "feat: implement duplicate virtual staging node logic in folderlab.js"
  ```

---

### Task 3: 검증 및 회귀 테스트 실행

- [ ] **Step 1: 파이썬 전체 백엔드 단위 테스트 실행**

  백엔드 로직에 회귀(Regression) 문제가 발생하지 않았는지 검증합니다.

  Run: `python -m unittest discover -s tests`
  Expected: 모든 9개 테스트 케이스가 성공 (`Ran 9 tests ... OK`)

- [ ] **Step 2: 최종 Git 상태 확인 및 커밋 완료**
  ```bash
  git status
  ```
