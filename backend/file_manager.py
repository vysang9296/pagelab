import os
import zipfile
import shutil
import tempfile

class FileManager:
    def __init__(self):
        # Create a persistent temporary directory for the session
        self.temp_dir = tempfile.mkdtemp(prefix="public_binder_")
        
    def get_temp_path(self, filename: str) -> str:
        """Returns a path inside the session's temp directory."""
        return os.path.join(self.temp_dir, filename)
        
    def create_zip_archive(self, file_paths: list, output_zip_path: str) -> bool:
        """
        Zips a list of files into the output_zip_path.
        """
        try:
            with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in file_paths:
                    if os.path.exists(file_path):
                        # Add file to zip using just its basename
                        zipf.write(file_path, os.path.basename(file_path))
            return True
        except Exception as e:
            raise RuntimeError(f"Failed to create ZIP archive: {e}")

    def cleanup(self):
        """Removes the temporary directory and all its contents."""
        try:
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
        except Exception as e:
            print(f"Cleanup failed: {e}")

# Singleton instance
_file_manager_instance = None

def get_file_manager():
    global _file_manager_instance
    if _file_manager_instance is None:
        _file_manager_instance = FileManager()
    return _file_manager_instance
