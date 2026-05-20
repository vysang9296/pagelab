# backend/document_parser.py
import os
import zipfile
import xml.etree.ElementTree as ET
import traceback

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import olefile
except ImportError:
    olefile = None

class DocumentParser:
    @staticmethod
    def extract_text(file_path: str) -> str:
        """
        Extracts plain text from various document formats for full-text indexing.
        Supported: .pdf, .hwpx, .hwp, .docx, .pptx, .xlsx
        """
        if not os.path.exists(file_path):
            return ""

        ext = os.path.splitext(file_path)[1].lower()
        try:
            if ext == '.pdf':
                return DocumentParser._extract_pdf(file_path)
            elif ext == '.hwpx':
                return DocumentParser._extract_hwpx(file_path)
            elif ext == '.hwp':
                return DocumentParser._extract_hwp(file_path)
            elif ext in ['.docx', '.pptx', '.xlsx']:
                return DocumentParser._extract_openxml(file_path, ext)
            elif ext in ['.txt', '.md', '.csv']:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
        except Exception as e:
            print(f"[DocumentParser] Error parsing {file_path}: {e}")
            
        return ""

    @staticmethod
    def _extract_pdf(file_path: str) -> str:
        if not fitz:
            raise ImportError("PDF 파서 라이브러리(PyMuPDF / fitz)가 설치되어 있지 않습니다. pip install PyMuPDF를 실행해 주세요.")
        text_parts = []
        try:
            with fitz.open(file_path) as doc:
                for page in doc:
                    text_parts.append(page.get_text())
            return "\n".join(text_parts)
        except Exception as e:
            print(f"PDF Extract Error: {e}")
            return ""

    @staticmethod
    def _extract_hwpx(file_path: str) -> str:
        """HWPX is a ZIP archive containing XML files (Contents/section0.xml etc)"""
        text_parts = []
        try:
            with zipfile.ZipFile(file_path, 'r') as zf:
                for name in zf.namelist():
                    if name.startswith('Contents/section') and name.endswith('.xml'):
                        xml_content = zf.read(name)
                        root = ET.fromstring(xml_content)
                        # Extract all text from hp:t tags (Hancom text tags)
                        for elem in root.iter():
                            if elem.tag.endswith('t') and elem.text:
                                text_parts.append(elem.text)
            return " ".join(text_parts)
        except Exception as e:
            print(f"HWPX Extract Error: {e}")
            return ""

    @staticmethod
    def _extract_hwp(file_path: str) -> str:
        """HWP 5.0 is an OLE container. We extract PrvText or BodyText if possible."""
        if not olefile or not olefile.isOleFile(file_path):
            return ""
        try:
            with olefile.OleFileIO(file_path) as ole:
                # First try PrvText (Preview Text stream, fast and clean)
                if ole.exists('PrvText'):
                    stream = ole.openstream('PrvText')
                    data = stream.read()
                    # PrvText is utf-16le encoded usually
                    return data.decode('utf-16le', errors='ignore')
                
                # If PrvText missing, we could parse BodyText/SectionN (zlib compressed)
                # For safety and speed in MVP, return basic info or require pywin32 COM fallback
        except Exception as e:
            print(f"HWP OLE Extract Error: {e}")
        return ""

    @staticmethod
    def _extract_openxml(file_path: str, ext: str) -> str:
        """DOCX, PPTX, XLSX are ZIP archives containing XML files."""
        text_parts = []
        try:
            with zipfile.ZipFile(file_path, 'r') as zf:
                if ext == '.docx':
                    # word/document.xml
                    if 'word/document.xml' in zf.namelist():
                        root = ET.fromstring(zf.read('word/document.xml'))
                        for elem in root.iter():
                            if elem.tag.endswith('t') and elem.text:
                                text_parts.append(elem.text)
                elif ext == '.pptx':
                    # ppt/slides/slideN.xml
                    for name in zf.namelist():
                        if name.startswith('ppt/slides/slide') and name.endswith('.xml'):
                            root = ET.fromstring(zf.read(name))
                            for elem in root.iter():
                                if elem.tag.endswith('t') and elem.text:
                                    text_parts.append(elem.text)
                elif ext == '.xlsx':
                    # xl/sharedStrings.xml contains all string data
                    if 'xl/sharedStrings.xml' in zf.namelist():
                        root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
                        for elem in root.iter():
                            if elem.tag.endswith('t') and elem.text:
                                text_parts.append(elem.text)
            return " ".join(text_parts)
        except Exception as e:
            print(f"OpenXML Extract Error ({ext}): {e}")
            return ""
