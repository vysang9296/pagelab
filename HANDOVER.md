# HANDOVER

프로젝트 개발 및 실행을 위한 인수인계 요약 시트입니다.

---

## 1. 개발 환경 구축 (Quick Start)
- 루트 폴더의 [setup.bat](file:///c:/Users/kyung/.gemini/antigravity/Lab/setup.bat)을 더블 클릭해 실행하면 라이브러리 설치와 앱 기동이 한 번에 진행됩니다.

## 2. 필수 연동 세팅 (Windows)
1. **한글 COM 개체 연동**: PC에 한컴 오피스가 설치되어 있어야 하며, `FilePathCheckDLL` 레지스트리가 등록되어 있어야 COM 오류 없이 HWP/HWPX 문서 로드 및 PDF 변환이 가능합니다.
2. **한국어 OCR 언어팩**: Windows 설정 > '시간 및 언어' > '기능 추가'에서 **한국어 OCR(광학 문자 인식)** 팩을 설치해야 이미지 글자 추출이 기능 제한 없이 작동합니다.
3. **kordoc.exe**: `backend/bin/kordoc.exe` 바이너리가 누락되지 않아야 한글(HWP) 파일의 마크다운 심층 분석 및 역패치(Patch)/비교(Compare) 엔진이 실행됩니다. (바이너리 부재 시 정제 텍스트 기반 Fallback 파서로 자동 전환)

## 3. 핵심 아키텍처 및 검증
- **Page Lab (문서 편집)**: PDF/HWP/이미지 업로드 -> PyMuPDF 변환 캐싱 및 base64 썸네일 노출 -> 결합 및 내보내기.
- **Folder Lab (파일 탐색)**: SQLite FTS5 기반 본문 심층 검색 + Watchdog 백그라운드 색인 (300개 초과 폴더 색인 생략 안전장치 내장).
- **Note Lab (마크다운 노트)**: Obsidian 양방향 연계 및 PDF.js SOP 보안 에러 완화(postMessage API) 결합.
- **검증**: `python -m unittest discover -s tests` 실행 시 30개 단위 테스트가 전부 통과하며, 워크스페이스 내에 더 이상 불필요한 임시 파일이 생성되지 않습니다.
