import os
import win32com.client

class HwpConverter:
    def __init__(self):
        self.hwp = None

    def initialize(self):
        """Initialize the HWP COM object if not already initialized."""
        if self.hwp is None:
            try:
                # 'HWPFrame.HwpObject' is the standard COM class for Hancom Office
                self.hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
                # Register Module is required to bypass security popups in newer versions
                # Note: "FilePathCheckDLL" needs to be registered in OS, but standard conversion 
                # often works without it if we just save as PDF.
                self.hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
                # Make HWP visible so the user can click the security 'Allow' popup if it appears.
                self.hwp.XHwpWindows.Item(0).Visible = True
            except Exception as e:
                raise RuntimeError(f"Failed to initialize Hancom Office. Is it installed? Error: {e}")

    def convert_to_pdf(self, hwp_path: str, output_pdf_path: str) -> bool:
        """
        Converts an HWP or HWPX file to PDF.
        """
        if not os.path.exists(hwp_path):
            raise FileNotFoundError(f"File not found: {hwp_path}")

        # Ensure paths are absolute
        hwp_path = os.path.abspath(hwp_path)
        output_pdf_path = os.path.abspath(output_pdf_path)

        self.initialize()

        try:
            # Open the document with auto-detect format ("") to support both HWP and HWPX
            self.hwp.Open(hwp_path, "", "forceopen:true")
            
            # SaveAs requires 3 parameters in some HWP versions
            self.hwp.SaveAs(output_pdf_path, "PDF", "")
            
            # Close the document
            self.hwp.Run("FileClose")
            
            # Hide the HWP window so the blank window doesn't linger on the user's screen
            self.hwp.XHwpWindows.Item(0).Visible = False
            
            return True
        except Exception as e:
            # Force close if something goes wrong
            try:
                self.hwp.Run("FileClose")
            except:
                pass
            raise RuntimeError(f"Failed to convert HWP to PDF: {e}")

    def quit(self):
        """Properly close the Hancom process."""
        if self.hwp is not None:
            self.hwp.Quit()
            self.hwp = None

# Singleton instance for easy usage
_converter_instance = None

def get_hwp_converter():
    global _converter_instance
    if _converter_instance is None:
        _converter_instance = HwpConverter()
    return _converter_instance
