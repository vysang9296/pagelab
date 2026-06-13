import unittest
import os
import shutil
from unittest.mock import MagicMock, patch
from main import Api, safe_filename
from backend.virtual_fs import VirtualFS

class TestExportImprovements(unittest.TestCase):
    @patch('backend.pdf_processor.PdfProcessor.merge_and_export')
    def test_rotation_validation(self, mock_merge_export):
        mock_merge_export.return_value = 'dummy_path.pdf'
        api = Api()
        api._fm = MagicMock()
        
        payload = [
            {
                "type": "zip",
                "name": "TestFolder",
                "data": [
                    {
                        "group_name": "SubPDF",
                        "pages": [
                            {"file_path": "test.pdf", "page_index": 0, "rotation": 45}
                        ]
                    }
                ]
            }
        ]
        api.export_data('single_zip', 'dummy.zip', payload)
        self.assertEqual(payload[0]['data'][0]['pages'][0]['rotation'], 0)

    def test_zip_path_standardization(self):
        virtual_folders = [
            {
                "name": "folder\\subfolder",
                "isDir": True,
                "children": []
            }
        ]
        success = VirtualFS.export_virtual_tree(virtual_folders, "test_out.zip", export_mode="zip")
        self.assertTrue(success)
        self.assertTrue(os.path.exists("test_out.zip"))
        if os.path.exists("test_out.zip"):
            os.remove("test_out.zip")

    def test_safe_filename_path_traversal(self):
        # 경로 탈취 페이로드가 들어오는 경우 디렉터리 경로 문자를 정화하는지 검증
        self.assertEqual(safe_filename("../../../etc/passwd"), "______etc_passwd")
        self.assertEqual(safe_filename("..\\..\\windows\\system32.dll"), "____windows_system32.dll")
        self.assertEqual(safe_filename("a/b/c/test.pdf"), "a_b_c_test.pdf")

    def test_safe_filename_reserved_words(self):
        # Windows 특수문자 및 예약어 필터링 검증
        self.assertEqual(safe_filename("test*file?.pdf"), "test_file_.pdf")
        self.assertEqual(safe_filename(""), "Export")

    def test_rotation_validation_edge_cases(self):
        api = Api()
        api._fm = MagicMock()
        
        # 다양한 비정상 회전값 검사 (360 -> 0, -90 -> 0, 9999 -> 0, 정상 90 -> 90)
        payload = {
            "group_name": "Edited",
            "pages": [
                {"file_path": "a.pdf", "page_index": 0, "rotation": 360},
                {"file_path": "b.pdf", "page_index": 1, "rotation": -90},
                {"file_path": "c.pdf", "page_index": 2, "rotation": 90},
                {"file_path": "d.pdf", "page_index": 3, "rotation": 9999}
            ]
        }
        api.export_data('single_pdf', 'dummy.pdf', payload)
        self.assertEqual(payload['pages'][0]['rotation'], 0)
        self.assertEqual(payload['pages'][1]['rotation'], 0)
        self.assertEqual(payload['pages'][2]['rotation'], 90)
        self.assertEqual(payload['pages'][3]['rotation'], 0)

    def test_export_data_empty_payload(self):
        api = Api()
        # 빈 페이로드 입력 시 예외를 방지하고 정상적으로 False 반환하는지 테스트
        self.assertFalse(api.export_data('single_pdf', 'dummy.pdf', None))
        self.assertFalse(api.export_data('invalid_type', 'dummy.pdf', {}))

    @patch('backend.pdf_processor.PdfProcessor.merge_and_export')
    def test_export_data_nested_zip_structure(self, mock_merge_export):
        mock_merge_export.return_value = 'dummy.pdf'
        api = Api()
        api._fm = MagicMock()

        # 복잡한 다중 이중 ZIP 압축 Payload 가공 검증
        payload = [
            {
                "type": "zip",
                "name": "NestedFolder",
                "data": [
                    {
                        "group_name": "InnerMerge",
                        "pages": [
                            {"file_path": "sub1.pdf", "page_index": 0, "rotation": 180},
                            {"file_path": "sub2.pdf", "page_index": 1, "rotation": 120}  # -> 0으로 변환되어야 함
                        ]
                    }
                ]
            }
        ]
        api.export_data('single_zip', 'dummy.zip', payload)
        self.assertEqual(payload[0]['data'][0]['pages'][0]['rotation'], 180)
        self.assertEqual(payload[0]['data'][0]['pages'][1]['rotation'], 0)

if __name__ == '__main__':
    unittest.main()
