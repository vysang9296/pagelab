import unittest
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.ai_analyzer import DefaultLightAnalyzer

class TestAiAnalyzer(unittest.TestCase):
    def test_default_analyzer(self):
        analyzer = DefaultLightAnalyzer()
        text = "한글 문서 안의 핵심 키워드를 추출하는 로컬 인공지능 모듈 테스트입니다."
        keywords = analyzer.extract_keywords(text)
        # Check that we extracted keywords longer than 2 letters
        self.assertTrue(any(len(kw) >= 2 for kw in keywords))
        
        # Test summarizer
        summary = analyzer.summarize(text)
        self.assertTrue(len(summary) > 0)

    @patch('backend.ai_analyzer.DefaultLightAnalyzer.extract_keywords')
    @patch('backend.ai_analyzer.DefaultLightAnalyzer.summarize')
    def test_api_ai_analyzer(self, mock_summarize, mock_extract):
        mock_extract.return_value = ["한글", "핵심"]
        mock_summarize.return_value = "요약 테스트."
        from main import Api
        api = Api()
        res = api.notelab_analyze_text("테스트 본문", mode="keywords")
        self.assertTrue(res["success"])
        self.assertEqual(res["keywords"], ["한글", "핵심"])
        self.assertEqual(res["summary"], "요약 테스트.")

if __name__ == '__main__':
    unittest.main()
