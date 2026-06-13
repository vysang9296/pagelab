# 가상 스테이징 폴더/파일 복제 기능 설계서 (Staging Folder Duplication Spec)

이 문서는 Public Binder의 Folder Lab 모듈에 속한 가상 스테이징 작업 영역에서 폴더 및 파일 노드를 동일 위치에 복제하는 기능에 대한 설계 스펙을 정의합니다.

## 1. 목적 (Goal)
사용자가 이미 구성해둔 가상 분류 폴더 구조나 파일들을 간편하게 동일 위치에 복제(참조 딥클론)할 수 있도록 지원합니다. 이를 통해 유사한 문서 분류 세트를 반복해서 수집하는 피로도를 해소합니다.

## 2. 요구사항 및 상세 사양 (Requirements)

### 2.1 UI/UX 연동
- [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html)의 가상 컨텍스트 메뉴인 `#fl-context-menu`에 다음 항목을 추가합니다:
  ```html
  <div id="fl-ctx-duplicate" class="fl-context-menu-item" onclick="flExecuteContextMenu('duplicate')">👯 복제 (Duplicate)</div>
  ```
- 이 항목은 우클릭 대상 노드가 가상 스테이징 영역(`treeType === 'staging'`) 내에 존재할 때만 활성화되어 보입니다. (`treeType === 'local'` 등 다른 영역에서는 숨김 처리)

### 2.2 이름 생성 규칙
- 원본 이름이 `A`인 노드를 복제하면 복제본 이름은 `A (복사본)`이 됩니다.
- 이미 `A (복사본)`인 노드를 다시 복제하면 `A (복사본 2)`가 되며, 이후 `A (복사본 3)` 등 순차적으로 증가합니다.
- 정규식 매칭을 통해 `\s\(복사본(?:\s\d+)?\)$` 형식을 파악하여 중첩되지 않고 깔끔하게 이름이 생성되도록 처리합니다.

### 2.3 데이터 구조 및 고유 ID 처리
- 가상 스테이징 폴더 트리 데이터(`flStagingFolders` 배열)는 JSON 기반으로 관리되는 가상 참조 모델입니다.
- 복제 대상 노드를 찾으면, 하위 노드까지 완전히 포함하는 깊은 복사(Deep Clone)를 수행합니다.
- **가장 중요한 보안 및 정합성 조치**: 딥클론된 모든 하위 객체들에 대해 기존 ID를 그대로 유지하면 렌더링 및 조작 상 충돌이 발생합니다. 따라서 복제된 노드와 그 하위 노드 전체를 탐색하며 새로운 고유 ID(`id`)를 재발급합니다.
  - 디렉터리: `sfolder_` + 타임스탬프 + 난수
  - 파일: `sfile_` + 타임스탬프 + 난수

### 2.4 배치 (Insertion Location)
- 복제된 노드는 원본 노드가 속한 부모 노드의 하위 목록(`children` 배열) 내에서 원본 노드 바로 다음 인덱스에 나란히 배치됩니다.
- 만약 부모 노드가 없는 최상위(Root) 레벨 노드라면, `flStagingFolders` 배열 내에서 원본 노드 바로 뒤에 삽입됩니다.

---

## 3. 코드 수정 영역 제안 (Proposed Code Modifications)

### 3.1 [index.html](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/index.html)
- `#fl-context-menu` 컨테이너 내부에 `fl-ctx-duplicate` 추가.

### 3.2 [folderlab.js](file:///c:/Users/kyung/.gemini/antigravity/Lab/frontend/folderlab.js)
- `flShowContextMenu` 함수 내부: `treeType === 'staging'`인 경우 `fl-ctx-duplicate` 항목이 `display: block` 처리되도록 추가.
- `flExecuteContextMenu` 함수 내부: `action === 'duplicate'` 액션 추가 및 `flDuplicateStagingNode(id)` 호출 연동.
- `flDuplicateStagingNode(id)` 신규 함수 구현:
  - `flStagingFolders` 탐색을 통해 복제 타겟 노드와 부모 노드(또는 부모 배열) 정보 탐색.
  - 이름 중복 방지 접미사 생성 로직 구현.
  - 하위 ID를 전부 재할당하는 재귀적 딥클론 함수 구현.
  - 부모 노드의 `children` 또는 최상위 `flStagingFolders` 배열 내 원본 노드 바로 다음 인덱스에 삽입 처리.
  - `flRenderStagingTree()`를 호출하여 UI 즉각 갱신.

---

## 4. 검증 계획 (Verification Plan)

### 수동 검증 시나리오
1. Folder Lab 탭으로 진입하여 가상 스테이징 영역에 새 폴더를 생성하고 파일 여러 개를 드래그 앤 드롭해 담습니다.
2. 해당 폴더를 우클릭하고 컨텍스트 메뉴에 `👯 복제 (Duplicate)` 항목이 나타나는지 확인합니다.
3. `복제` 클릭 시 바로 아래에 `[폴더명] (복사본)` 폴더가 생성되고, 그 하위의 파일 목록과 가상 폴더 구조가 완벽하게 복제되어 있는지 확인합니다.
4. 새로 복제된 폴더를 다시 한 번 복제하여 이름이 `[폴더명] (복사본 2)`가 되는지 확인합니다.
5. 복제된 폴더 내의 파일을 개별 삭제하거나 이름을 변경했을 때, 원본 폴더의 파일에 영향이 없는지(ID 및 참조 분리 여부) 확인합니다.
6. 복제된 가상 구조에 대해서도 `ZIP 내보내기` 및 `로컬 동기화`가 정상 동작하는지 검증합니다.
