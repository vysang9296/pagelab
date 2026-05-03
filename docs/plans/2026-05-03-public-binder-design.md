# Design Document: Public Binder (퍼블릭 바인더)

## 1. 개요 (Overview)
*   **목적:** 공공기관 등에서 다수의 전문가가 제출하는 문서(HWP, PDF)를 취합하여 손쉽게 페이지별로 쪼개고, 그룹화하고, 최종 PDF로 병합하는 로컬 데스크톱 프로그램.
*   **핵심 철학:** 망분리 환경을 고려한 100% 로컬 구동, Python 미설치 환경을 위한 단일 실행 파일(.exe) 배포, 직관적인 Drag & Drop UI.
*   **단계별 개발:** 
    *   1단계: **Page Lab (페이지 랩)** - 문서 내 페이지 취합 및 분할 (본 설계의 핵심)
    *   2단계: **Folder Lab (폴더 랩)** - 로컬 파일/디렉토리 구조 리팩토링 (추후 확장)

## 2. 아키텍처 및 기술 스택 (Architecture)
*   **실행 환경:** 단일 실행 파일 (`.exe`) - `PyInstaller`를 사용해 모든 의존성을 패키징.
*   **백엔드 로직 (Python):**
    *   **HWP 처리:** `pywin32` (Windows COM Automation). 한글 프로그램이 설치된 환경에서 백그라운드로 HWP/HWPX를 완벽하게 PDF로 변환.
    *   **PDF 처리:** `PyMuPDF` (페이지 추출, 렌더링, 병합, 회전 등).
*   **프론트엔드 (UI):** 
    *   HTML, CSS, Vanilla JS 기반 (Google AI Studio 스타일의 모던한 테마).
*   **창 관리 (Windowing):** 
    *   `PyWebView`: 브라우저 URL 창 없이 독립된 네이티브 데스크톱 앱처럼 HTML UI를 띄움. (인터넷 접속 방지)

## 3. 핵심 기능: Page Lab (Core Features)
*   **드래그 앤 드롭 업로드:** HWP, HWPX, PDF 파일을 뷰어에 던져넣으면 자동 로드.
*   **자동 변환 엔진:** HWP 포맷 인식 시 백그라운드에서 한글 엔진을 호출하여 임시 폴더에 PDF로 변환 (원본 훼손 없음).
*   **썸네일 뷰어:** 각 문서의 페이지를 시각화된 카드(Thumbnail) 형태로 바둑판 배열.
*   **페이지 편집:** 
    *   페이지 단위 회전 (90도, 180도)
    *   페이지 순서 변경 (Drag & Drop)
*   **그룹 분류 기능:**
    *   사용자가 커스텀 그룹(예: '영수증', '서약서') 생성 가능.
    *   특정 페이지를 선택하여 원하는 그룹이나 '삭제(제외)' 버킷으로 이동.
*   **내보내기 (Export):**
    *   그룹별 취합된 페이지들을 각각 하나의 PDF로 병합.
    *   결과물을 하나의 ZIP 파일 또는 지정된 폴더에 저장.

## 4. 데이터 흐름 (Data Flow)
1.  **Input:** User Drops `File.hwp` and `File2.pdf`.
2.  **Processing:**
    *   Python Backend detects `File.hwp` -> Invokes COM -> Saves `File_temp.pdf`.
    *   PyMuPDF reads `File_temp.pdf` and `File2.pdf` -> Generates base64 thumbnails for each page.
3.  **UI Render:** Frontend displays thumbnails in the Main Viewer.
4.  **Interaction:** User drags Page 1 to "Group A", Page 2 to "Group B". Frontend maintains a state JSON mapped to original files/pages.
5.  **Output:** User clicks "Export". Frontend sends JSON state to Backend. Backend uses PyMuPDF to extract requested pages, merges them, and saves as `GroupA.pdf` and `GroupB.pdf`.

## 5. 예외 처리 (Error Handling)
*   **한글 미설치 환경:** HWP 파일 업로드 시 `pywin32`가 HwpObject를 찾지 못하면, 사용자에게 명확한 경고 팝업을 띄우고 해당 파일만 로드를 취소함 (나머지 PDF는 정상 동작).
*   **암호화된 문서:** 암호가 걸려 열 수 없는 PDF/HWP에 대해 에러 메시지 표출.
