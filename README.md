# 📄 Page Lab (페이지 랩)

**Page Lab**은 HWP, HWPX, PDF 등 다양한 문서 포맷을 하나의 작업 공간에 불러와, 원본을 훼손하지 않으면서 자유롭게 페이지를 재배치하고 병합 및 분할할 수 있는 강력한 로컬 데스크톱 애플리케이션입니다. 

서버 통신 없이 100% 로컬 환경에서 구동되어 기업의 망분리 환경이나 민감한 보안 문서 작업에 최적화되어 있습니다.

---

## 🚀 주요 기능 (Features)

### 1. 다양한 포맷 호환 & 자동 변환
* **PDF, HWP, HWPX 완벽 지원:** 여러 포맷의 문서를 드래그 앤 드롭으로 한 번에 업로드할 수 있습니다.
* **백그라운드 자동 변환:** 한글(HWP/HWPX) 파일 업로드 시, 사용자 PC에 설치된 한컴오피스 엔진을 활용하여 백그라운드에서 자동으로 PDF로 변환 및 렌더링합니다.

### 2. 비파괴적 원본 편집 (Non-destructive Editing)
* **원본 보호:** 문서를 자르거나 회전, 삭제(제외)하더라도 원본 파일은 전혀 훼손되지 않습니다.
* **시각적 편집:** 썸네일을 보며 페이지 삭제(블라인드 처리), 90도 회전, 순서 변경(Drag & Drop)을 수행할 수 있습니다.

### 3. 강력한 다중 선택 및 그룹화
* **OS 표준 다중 선택:** `Shift` 키를 통한 연속 범위 선택, `Ctrl(Cmd)` 키를 통한 개별 추가/제외 기능을 지원하여 수백 장의 페이지도 쉽게 관리할 수 있습니다.
* **분류 폴더(그룹) 관리:** 새 폴더를 무한정 생성하여 용도별로 페이지를 분류하고 모아둘 수 있습니다. (예: 서명서 모음, 영수증 모음 등)

### 4. 세밀한 내보내기 (Export)
* **통합 다운로드 (PDF):** 분류된 페이지들을 모아 하나의 깔끔한 PDF 파일로 병합하여 저장합니다.
* **개별 파일별 다운로드 (ZIP):** 모아둔 페이지들을 각각 낱장의 PDF 파일로 쪼개어 하나의 ZIP 압축 파일로 저장합니다.
* **다중 그룹 이중 압축:** 여러 개의 분류 폴더를 동시에 선택하고 다운로드하면, 폴더 구조가 유지된 상태로 이중 압축(ZIP 안의 ZIP)되어 저장됩니다.

### 5. 개별 페이지 커스텀 네이밍 (Context Menu)
* **이름 변경:** 내보내기 전, 우클릭을 통해 개별 페이지(예: 영수증, 서명서)의 파일명을 미리 지정할 수 있습니다.
* 다운로드 시, 지정한 이름 그대로 낱장 파일이 생성되어 윈도우에서 일일이 이름을 다시 바꾸는 번거로움이 사라집니다.

---

## 🛠️ 기술 스택 (Tech Stack)

* **Backend:** Python 3, PyMuPDF (fitz), win32com (한컴오피스 자동화), Pywebview
* **Frontend:** Vanilla JavaScript, HTML5, CSS3, SortableJS (Drag & Drop)
* **Packaging:** PyInstaller (Standalone Windows Executable)

---

## 💻 실행 및 빌드 방법

### 1. 사전 요구사항 (Requirements)
* Windows 10 또는 11
* Python 3.10+
* **한글(Hancom Office) 프로그램 설치 필수** (HWP/HWPX 변환 기능 사용 시)

### 2. 개발 모드 실행
```bash
pip install -r requirements.txt
python main.py
```

### 3. 배포용 파일(.exe) 만들기
```bash
pip install pyinstaller
pyinstaller --noconfirm --onedir --windowed --add-data "frontend;frontend" --name "PageLab" main.py
```
빌드가 완료되면 `dist/PageLab` 폴더 내의 파일을 ZIP으로 압축하여 배포합니다.

---

## 📝 라이선스
MIT License
