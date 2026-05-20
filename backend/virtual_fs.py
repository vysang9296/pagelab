# backend/virtual_fs.py
import os
import shutil
import traceback
from backend.file_manager import get_file_manager

class VirtualFS:
    @staticmethod
    def export_virtual_tree(virtual_folders: list, save_path: str, export_mode: str = 'zip') -> bool:
        """
        virtual_folders: Nested recursive tree structure containing folders and files.
        save_path: Destination zip file path OR destination folder path.
        export_mode: 'zip' or 'copy'
        """
        fm = get_file_manager()
        temp_dir = fm.get_temp_path("virtual_staging_" + os.urandom(4).hex())
        os.makedirs(temp_dir, exist_ok=True)

        try:
            def copy_node_recursive(node, current_dest_dir):
                name = node.get('name', '').strip()
                name = "".join([c for c in name if c not in r':*?"<>|'])
                if not name:
                    name = "Folder" if node.get('isDir') else "File"
                
                is_dir = node.get('isDir', False)
                if is_dir:
                    dir_path = os.path.join(current_dest_dir, name)
                    os.makedirs(dir_path, exist_ok=True)
                    for child in node.get('children', []):
                        copy_node_recursive(child, dir_path)
                else:
                    src_path = node.get('path')
                    if src_path and os.path.exists(src_path):
                        dest_path = os.path.join(current_dest_dir, name)
                        base, ext = os.path.splitext(name)
                        counter = 1
                        while os.path.exists(dest_path):
                            dest_path = os.path.join(current_dest_dir, f"{base}({counter}){ext}")
                            counter += 1
                        shutil.copy2(src_path, dest_path)

            for item in virtual_folders:
                copy_node_recursive(item, temp_dir)

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
                if os.path.exists(save_path):
                    shutil.rmtree(save_path)
                shutil.copytree(temp_dir, save_path)

            return True

        except Exception as e:
            print(f"[VirtualFS] Export Error: {traceback.format_exc()}")
            raise RuntimeError(f"가상 폴더 내보내기 실패: {e}")
