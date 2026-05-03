import fitz  # PyMuPDF
import base64
import os

class PdfProcessor:
    @staticmethod
    def extract_thumbnails(pdf_path: str, dpi: int = 72) -> list:
        """
        Extracts all pages from a PDF and returns them as a list of base64 encoded strings.
        This allows the frontend to easily display them as thumbnails.
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"File not found: {pdf_path}")
            
        doc = fitz.open(pdf_path)
        thumbnails = []
        
        # Increase dpi for better zoom preview quality, default 72 is standard web res
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        
        for page_index in range(len(doc)):
            page = doc[page_index]
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PNG format in memory
            png_data = pix.tobytes("png")
            # Convert to base64 for direct HTML embedding
            b64_str = base64.b64encode(png_data).decode("utf-8")
            
            thumbnails.append({
                "page_index": page_index,
                "data_url": f"data:image/png;base64,{b64_str}"
            })
            
        doc.close()
        return thumbnails

    @staticmethod
    def merge_and_export(export_instructions: dict, output_dir: str) -> str:
        """
        Takes instructions from the frontend to assemble a new PDF.
        export_instructions format example:
        {
            "group_name": "영수증",
            "pages": [
                {"file_path": "C:/docs/receipt1.pdf", "page_index": 0, "rotation": 0},
                {"file_path": "C:/docs/receipt2.pdf", "page_index": 2, "rotation": 90},
                {"is_blank": True}
            ]
        }
        Returns the path of the saved PDF.
        """
        group_name = export_instructions.get("group_name", "Exported")
        pages_info = export_instructions.get("pages", [])
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        output_pdf_path = os.path.join(output_dir, f"{group_name}.pdf")
        
        # Create a new blank PDF document
        new_doc = fitz.open()
        
        # We need to keep track of opened source documents to close them later
        opened_docs = {}
        
        try:
            for p_info in pages_info:
                if p_info.get("is_blank"):
                    # Insert a standard A4 blank page
                    new_doc.new_page(width=595, height=842)
                    continue
                    
                file_path = p_info.get("file_path")
                page_index = p_info.get("page_index", 0)
                rotation = p_info.get("rotation", 0)
                
                if not file_path or not os.path.exists(file_path):
                    continue
                    
                if file_path not in opened_docs:
                    opened_docs[file_path] = fitz.open(file_path)
                    
                src_doc = opened_docs[file_path]
                
                # Insert the specific page from the source document
                new_doc.insert_pdf(src_doc, from_page=page_index, to_page=page_index)
                
                # Apply rotation if needed
                if rotation != 0:
                    # The page we just inserted is the last page in the new document
                    last_page = new_doc[-1]
                    last_page.set_rotation(rotation)
                    
            # Save the final merged document
            new_doc.save(output_pdf_path)
            
        finally:
            # Clean up all opened source documents
            for doc in opened_docs.values():
                doc.close()
            new_doc.close()
            
        return output_pdf_path
