import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure backend can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.document_parser import DocumentParser

class TestHwpParser(unittest.TestCase):
    @patch('olefile.isOleFile')
    @patch('olefile.OleFileIO')
    def test_hwp_decompression_fallback(self, mock_ole_class, mock_is_ole):
        mock_is_ole.return_value = True
        mock_ole = MagicMock()
        mock_ole_class.return_value.__enter__.return_value = mock_ole
        
        # Scenario: No PrvText stream exists, only BodyText/Section0 exists
        mock_ole.exists.return_value = False
        mock_ole.listdir.return_value = [['BodyText', 'Section0']]
        
        # Mock compressed data for zlib. Tag ID = 67 (HWPRCD_PARA_TEXT), Length = 12
        # Header for tag 67, level 0, length 12: 12 << 20 | 0 << 10 | 67 = 12582979
        # In little-endian bytes: 12582979 -> b'\x43\x00\xc0\x00'
        # Followed by UTF-16LE representation of "Hello": b'H\x00e\x00l\x00l\x00o\x00' (10 bytes) + padding (2 bytes) = 12 bytes
        import zlib
        decompressed_payload = b'\x43\x00\xc0\x00' + b'H\x00e\x00l\x00l\x00o\x00\x00\x00'
        # Compress using raw deflate (wbits = -15)
        compressor = zlib.compressobj(wbits=-15)
        compressed_data = compressor.compress(decompressed_payload) + compressor.flush()
        
        mock_stream = MagicMock()
        mock_stream.read.return_value = compressed_data
        mock_ole.openstream.return_value = mock_stream
        
        extracted = DocumentParser._extract_hwp("dummy.hwp")
        self.assertEqual(extracted.strip(), "Hello")

if __name__ == '__main__':
    unittest.main()
