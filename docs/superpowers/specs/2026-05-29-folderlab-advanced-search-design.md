# Folder Lab 상세 검색 필터 및 자동 색인 설계서 (Design Specification)

## 1. 개요 (Overview)
* **목적**: 대규모 과거 사업 산출물 및 이력 문서 탐색 시 사용자가 원하는 문서를 보다 정확하고 빠르게 발견할 수 있도록 검색 조건을 다변화하고, 매번 수동으로 색인하는 번거로움을 자동화합니다.
* **적용 범위**: Folder Lab 하단 드로어 검색 영역 UI 추가, 백엔드 SQL 검색 쿼리 고도화(확장자 필터), 백엔드 Python 파일수정일 필터링, 비동기 백그라운드 자동 색인 및 대용량 진입 차단 안전장치.

## 2. 상세 설계 (Detailed Design)

### 2.1 UI 구성 변경
* **파일**: `frontend/index.html` (하단 드로어 `#fl-bottom-drawer` 내부)
* **설계**: 검색창 좌측 혹은 검색 영역 내에 확장자 및 기간 선택 셀렉트 박스 추가.
  * **확장자 필터 (`#fl-search-ext-filter`)**:
    * `All` (전체 포맷)
    * `hwp` (워드 문서: `.hwp`, `.hwpx`, `.docx`, `.doc`)
    * `pdf` (PDF 문서: `.pdf`)
    * `xls` (엑셀 스프레드시트: `.xlsx`, `.xls`, `.xlsm`)
    * `etc` (기타 문서: `.pptx`, `.ppt`, `.txt`, `.md`)
  * **기간 필터 (`#fl-search-date-filter`)**:
    * `All` (전체 기간)
    * `week` (최근 1주일)
    * `month` (최근 1개월)
    * `year` (최근 1년)

### 2.2 검색 API 연동 및 SQL/Python 하이브리드 필터링
* **파일**: `frontend/folderlab.js`, `main.py`, `backend/search_engine.py`
* **동작 흐름**:
  1. `folderlab.js`의 `flSearchDocuments()`에서 필터의 선택값을 읽고, `pywebview.api.search_documents(query, ext_filter, date_filter)` 호출.
  2. `main.py`는 이를 `search_engine.py`의 `search(query, ext_filter, date_filter)` 메서드로 전달.
  3. `search_engine.py`는 SQL FTS5 쿼리에 확장자 조건(`LIKE` 구문)을 결합하여 매칭 대상 한계를 설정 (누락 방지 및 DB 내 고속 필터링).
     * `ext_filter == 'hwp'`: `documents MATCH ? AND (path LIKE '%.hwp' OR path LIKE '%.hwpx' OR path LIKE '%.docx' OR path LIKE '%.doc')`
     * `ext_filter == 'pdf'`: `documents MATCH ? AND path LIKE '%.pdf'`
     * `ext_filter == 'xls'`: `documents MATCH ? AND (path LIKE '%.xlsx' OR path LIKE '%.xls' OR path LIKE '%.xlsm')`
     * `ext_filter == 'etc'`: `documents MATCH ? AND (path LIKE '%.pptx' OR path LIKE '%.ppt' OR path LIKE '%.txt' OR path LIKE '%.md')`
  4. SQL 결과 리스트(최대 50개)를 반환받은 후, `date_filter`에 맞게 파일 수정 시간(`os.path.getmtime(path)`)을 판별하여 필터 기준 시점(현재 - 7일 / 30일 / 365일) 이전 문서들을 배제하고 반환.

### 2.3 비동기 자동 색인 및 3중 안전장치
* **자동 색인**:
  * `folderlab.js`에서 로컬 폴더 로드가 완료되는 시점(`flRenderLocalTreeAsync`)에 백엔드 자동 색인 API `fl_index_current_folder(path, silent=true)`를 비동기로 즉시 호출합니다.
  * `silent=True` 인자를 넘기면 상태 바가 보이지 않고 조용히 백그라운드 색인 스레드만 구동됩니다.
* **대용량 방어용 3중 안전장치 (Guardrails)**:
  * 1단계 (경로 배제): `Windows`, `Program Files`, `System Volume Information` 등의 폴더는 탐색기에서 진입을 차단 또는 탐색 제외합니다.
  * 2단계 (색인 개수 제한): 폴더 내 문서 개수가 5,000개를 초과하는 순간 색인을 즉시 멈추고 안전하게 완료 처리합니다.
  * 3단계 (자동 색인 차단): 진입 경로가 드라이브 루트(예: `C:\`, `D:\`)이거나 하위 항목이 너무 많은 경우(하위 노드 300개 초과), 자동 백그라운드 색인을 건너뛰고 하단 상태 표시줄에 다음과 같은 경고 문구를 표시합니다.
    * `"⚠️ 대형 폴더 또는 드라이브 루트입니다. 자동 색인을 건너뛰었으니 필요한 경우 수동 색인을 클릭하세요."`

---

## 3. 검증 계획 (Verification Plan)
1. **검색 필터 정확성 검증**:
   * 동일 검색어에 대해 확장자 필터(워드/PDF/엑셀/기타)를 걸어 관련 포맷 파일만 정상 필터링되어 출력되는지 검증.
   * 기간 필터를 지정하여 1주일, 1개월 기준 시점 이내 파일만 검출되는지 검증.
2. **자동 색인 구동 및 안전장치 검증**:
   * 소형 폴더 변경 시 백그라운드 색인이 정상 작동하여 로그 상에 완료됨을 확인.
   * 드라이브 루트(`C:\`) 또는 거대 폴더 진입 시 자동 색인이 무시되고 상태창에 경고 메시지가 은은하게 노출되는지 검증.
