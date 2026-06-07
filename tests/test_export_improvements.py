import unittest
import os
import shutil
from unittest.mock import MagicMock, patch
from main import Api
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
        # Since type validation overrides rotation, rotation of 45 should become 0
        api.export_data('single_zip', 'dummy.zip', payload)
        self.assertEqual(payload[0]['data'][0]['pages'][0]['rotation'], 0)

    def test_zip_path_standardization(self):
        # Test virtual tree creates output zip correctly
        virtual_folders = [
            {
                "name": "folder\\subfolder",
                "isDir": True,
                "children": []
            }
        ]
        # Ensure no error and creates zip file
        success = VirtualFS.export_virtual_tree(virtual_folders, "test_out.zip", export_mode="zip")
        self.assertTrue(success)
        self.assertTrue(os.path.exists("test_out.zip"))
        if os.path.exists("test_out.zip"):
            os.remove("test_out.zip")

if __name__ == '__main__':
    unittest.main()
