"""
공문서형 본문 구조 복원기 (로컬 휴리스틱, 네트워크 불필요).

본문 가져오기 결과가 한 줄로 붙거나 개조식 번호(1. / 1) / 가. / 가) / Ⅰ 등)가
문장 중간에 끼인 경우, 줄바꿈·공백을 재배치합니다.
"""
from __future__ import annotations

import os
import re
import unicodedata
from typing import List, Optional, Tuple


# 괄호형(1)(가)을 숫자/한글 단독 1) 가) 보다 먼저 두어 내부 오분절 방지
MARKER_PATTERN = (
    r"(?:"
    r"제\s*\d+\s*(?:장|절|관|조|항|호)"
    r"|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+"
    r"|[IVXLC]{1,4}\."
    r"|\(\s*\d{1,3}\s*\)"       # (1) before 1)
    r"|\(\s*[가-힣]\s*\)"       # (가) before 가)
    r"|\d{1,3}\.(?!\d)"
    r"|(?<!\()\d{1,3}\)"        # 1) not part of (1)
    r"|[가-힣]\."
    r"|(?<!\()[가-힣]\)"        # 가) not part of (가)
    r"|[①-⑳]"
    r"|[㉮-㉻]"
    r"|[ㄱ-ㅎ]\."
    r"|(?<!\()[ㄱ-ㅎ]\)"
    r"|[□○●■◇◆▷▶※★☆•·ㆍ]"
    r")"
)

RE_INLINE_MARKER = re.compile(
    r"(?<=[^\s\n])"
    r"[ \t]*"
    r"(" + MARKER_PATTERN + r")"
    r"(?=\s|[가-힣A-Za-z(「『\"'【]|$)"
)

RE_LINE_MARKER_STUCK = re.compile(
    r"^([ \t]*)(" + MARKER_PATTERN + r")(?=[가-힣A-Za-z(「『\"'【])",
    re.MULTILINE,
)

RE_TOP_LEVEL = re.compile(
    r"^([ \t]*)((?:제\s*\d+\s*(?:장|절|관)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[IVXLC]{1,4}\.)[ \t]*)",
    re.MULTILINE,
)

RE_DECIMAL_FALSE = re.compile(r"(\d)\.\n+(\d)")
RE_MULTI_BLANK = re.compile(r"\n{3,}")


class StructureRefiner:
    def format(
        self,
        text: str,
        pdf_text: Optional[str] = None,
        preserve_markdown_blocks: bool = True,
    ) -> str:
        if not text:
            return ""

        ends_with_nl = text.endswith("\n")
        text = unicodedata.normalize("NFC", text)
        text = text.replace("\r\n", "\n").replace("\r", "\n")

        if preserve_markdown_blocks:
            result = self._format_with_protection(text, pdf_text)
        else:
            result = self._format_plain(text, pdf_text)

        result = RE_DECIMAL_FALSE.sub(r"\1.\2", result)
        result = RE_MULTI_BLANK.sub("\n\n", result)
        result = result.strip()
        if ends_with_nl:
            result += "\n"
        return result

    def _format_with_protection(self, text: str, pdf_text: Optional[str]) -> str:
        segments = self._split_protected(text)
        out: List[str] = []
        for kind, chunk in segments:
            if kind == "protect":
                out.append(chunk)
            else:
                out.append(self._format_plain(chunk, pdf_text))
        return "".join(out)

    def _format_plain(self, text: str, pdf_text: Optional[str]) -> str:
        if not text:
            return text

        t = re.sub(r"[ \t]+", " ", text)
        t = re.sub(r" *\n *", "\n", t)

        prev = None
        for _ in range(10):
            if t == prev:
                break
            prev = t
            t = RE_INLINE_MARKER.sub(r"\n\1", t)

        t = RE_LINE_MARKER_STUCK.sub(r"\1\2 ", t)
        # 문장 종결 뒤 줄바꿈 — 개조식 "1." / "가." 의 점은 제외
        t = re.sub(
            r"(?<!\d)(?<![가-힣ㄱ-ㅎ])([!?。])[ \t]*(?=[가-힣A-Z「『(])",
            r"\1\n",
            t,
        )
        # 마침표: 숫자·한글 한 글자 개조식 마커 직후가 아닐 때만
        t = re.sub(
            r"(?<!\d)(?<![가-힣ㄱ-ㅎ])(\.)[ \t]*(?=[가-힣A-Z「『(])",
            r"\1\n",
            t,
        )

        if pdf_text:
            t = self._apply_pdf_line_hints(t, pdf_text)

        t = RE_TOP_LEVEL.sub(r"\n\n\1\2", t)
        lines = [ln.rstrip() for ln in t.split("\n")]
        t = "\n".join(lines)
        return RE_MULTI_BLANK.sub("\n\n", t)

    def _apply_pdf_line_hints(self, text: str, pdf_text: str) -> str:
        pdf_text = unicodedata.normalize("NFC", pdf_text.replace("\r\n", "\n"))
        line_start = re.compile(
            r"^("
            r"제\s*\d+\s*(?:장|절|관|조|항|호)"
            r"|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+"
            r"|\d{1,3}\.(?!\d)"
            r"|\d{1,3}\)"
            r"|[가-힣]\."
            r"|[가-힣]\)"
            r"|[①-⑳]"
            r"|[□○●■]"
            r")"
        )
        hints: List[str] = []
        for raw in pdf_text.split("\n"):
            line = raw.strip()
            if len(line) < 2:
                continue
            m = line_start.match(line)
            if not m:
                continue
            token = m.group(1)
            rest = line[m.end() : m.end() + 6].strip()
            hint = (token + (rest[:4] if rest else "")).strip()
            if len(hint) >= 2:
                hints.append(hint)

        seen = set()
        unique: List[str] = []
        for h in sorted(hints, key=len, reverse=True):
            if h in seen:
                continue
            seen.add(h)
            unique.append(h)
            if len(unique) >= 80:
                break

        t = text
        for h in unique:
            esc = re.escape(h)
            t = re.sub(rf"(?<![ \t\n])({esc})", r"\n\1", t, count=2)
        return t

    def _split_protected(self, text: str) -> List[Tuple[str, str]]:
        """
        코드펜스·표·이미지·헤딩 줄은 protect, 나머지는 plain.
        plain/protect 청크는 원문 부분 문자열을 그대로 유지 (개행 포함).
        """
        lines = text.split("\n")
        # rebuild with separators
        parts: List[Tuple[str, str]] = []
        plain: List[str] = []
        in_fence = False

        def flush_plain():
            nonlocal plain
            if not plain:
                return
            # rejoin lines with \n; trailing \n if this block had line breaks
            chunk = "\n".join(plain)
            parts.append(("plain", chunk))
            plain = []

        for idx, line in enumerate(lines):
            is_last = idx == len(lines) - 1
            stripped = line.strip()
            line_with_nl = line if is_last and not text.endswith("\n") else (line + "\n" if not is_last else line + ("\n" if text.endswith("\n") else ""))

            # Fix line_with_nl more carefully:
            if idx < len(lines) - 1:
                raw_piece = line + "\n"
            else:
                raw_piece = line + ("\n" if text.endswith("\n") else "")

            if stripped.startswith("```"):
                flush_plain()
                in_fence = not in_fence
                parts.append(("protect", raw_piece))
                continue
            if in_fence:
                parts.append(("protect", raw_piece))
                continue
            if (
                stripped.startswith("|")
                or re.match(r"^\s*!\[[^\]]*\]\([^)]+\)\s*$", line)
                or re.match(r"^\s*#{1,6}\s", line)
            ):
                flush_plain()
                parts.append(("protect", raw_piece))
                continue
            plain.append(line)

        # flush remaining plain without forcing extra newline logic
        if plain:
            # reconstruct from original indices
            # plain holds line contents without \n; rebuild
            start_idx = len(lines) - len(plain)
            rebuilt = []
            for j, pl in enumerate(plain):
                global_idx = start_idx + j
                if global_idx < len(lines) - 1:
                    rebuilt.append(pl + "\n")
                else:
                    rebuilt.append(pl + ("\n" if text.endswith("\n") else ""))
            parts.append(("plain", "".join(rebuilt)))

        if not parts:
            return [("plain", text)]
        return parts


def extract_pdf_text_for_structure(pdf_path: str, max_pages: int = 40) -> str:
    try:
        import fitz

        if not pdf_path or not os.path.exists(pdf_path):
            return ""
        doc = fitz.open(pdf_path)
        chunks: List[str] = []
        try:
            n = min(len(doc), max_pages)
            for pi in range(n):
                chunks.append(doc.load_page(pi).get_text("text") or "")
        finally:
            doc.close()
        return "\n".join(chunks)
    except Exception:
        return ""
