# backend/virtual_fs.py
import os
import shutil
import traceback
from backend.file_manager import get_file_manager

class VirtualFS:
    @staticmethod
    def export_virtual_tree(virtual_folders: list, save_path: str, export_mode: str = 'zip') -> bool:
        """
        virtual_folders: [{'id': '...', 'name': '...', 'children': [{'path': '...', 'name': '...'}, ...]}]
        save_path: Destination zip file path OR destination folder path.
        export_mode: 'zip' or 'copy'
        """
        fm = get_file_manager()
        temp_dir = fm.get_temp_path("virtual_staging_" + os.urandom(4).hex())
        os.makedirs(temp_dir, exist_ok=True)

        try:
            files_to_zip = []

            # 1. Build virtual structure inside temp_dir
            for folder in virtual_folders:
                folder_name = folder.get('name', 'Folder').strip()
                # Clean invalid chars
                folder_name = "".join([c for c in folder_name if c not in r'\/:*?"<>|'])
                folder_dir = os.path.join(temp_dir, folder_name)
                os.makedirs(folder_dir, exist_ok=True)

                for child in folder.get('children', []):
                    src_path = child.get('path')
                    dest_name = child.get('name', os.path.basename(src_path))
                    dest_name = "".join([c for c in dest_name if c not in r'\/:*?"<>|'])
                    
                    if src_path and os.path.exists(src_path):
                        dest_path = os.path.join(folder_dir, dest_name)
                        # Handle duplicate names in the same virtual folder
                        base, ext = os.path.splitext(dest_name)
                        counter = 1
                        while os.path.exists(dest_path):
                            dest_path = os.path.join(folder_dir, f"{base}({counter}){ext}")
                            counter += 1

                        shutil.copy2(src_path, dest_path)

            # 2. Final Export
            if export_mode == 'zip':
                import zipfile
                with zipfile.ZipFile(save_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                    for root, dirs, files in os.walk(temp_dir):
                        for d in dirs:
                            dir_path = os.path.join(root, d)
                            arcname = os.path.relpath(dir_path, temp_dir) + '/'
                            zf.write(dir_path, arcname)
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, temp_dir)
                            zf.write(file_path, arcname)
            elif export_mode == 'copy':
                # Copy entire temp_dir structure to save_path
                if os.path.exists(save_path):
                    shutil.rmtree(save_path)
                shutil.copytree(temp_dir, save_path)

            return True

        except Exception as e:
            print(f"[VirtualFS] Export Error: {traceback.format_exc()}")
            raise RuntimeError(f"가상 폴더 내보내기 실패: {e}")
