import re
from typing import List

class AIServiceInterface:
    def extract_keywords(self, text: str) -> List[str]:
        raise NotImplementedError
    def summarize(self, text: str) -> str:
        raise NotImplementedError

class DefaultLightAnalyzer(AIServiceInterface):
    def extract_keywords(self, text: str) -> List[str]:
        if not text: return []
        # Extracts Korean and alphanumeric words of at least 2 letters
        words = re.findall(r'[가-힣\w]{2,}', text)
        stop_words = {"이것", "저것", "그것", "의한", "위한", "대한", "통한"}
        candidates = [w for w in words if w not in stop_words]
        
        # Calculate frequency
        freq = {}
        for c in candidates:
            freq[c] = freq.get(c, 0) + 1
        
        # Sort by frequency descending
        sorted_kvs = sorted(freq.items(), key=lambda x: x[1], reverse=True)
        return [k for k, v in sorted_kvs[:5]]

    def summarize(self, text: str) -> str:
        if not text: return ""
        sentences = text.split('.')
        clean_sentences = [s.strip() for s in sentences if s.strip()]
        if not clean_sentences: return ""
        
        # Heuristic summarizer: takes the first and last sentence
        if len(clean_sentences) <= 2:
            return text
        return f"{clean_sentences[0]}. ... {clean_sentences[-1]}."
