# PageLab Image Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:single-flow-task-execution (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native support for image formats (.png, .jpg, .jpeg) in Page Lab, converting them to PDF on-the-fly via PyMuPDF (fitz) so they can be merged seamlessly with other documents.

**Architecture:**
- Extend the file dialog filter to allow image formats.
- Detect images in `process_files` and convert them to temporary PDF documents using `fitz.open()` and `doc.convert_to_pdf()`.
- Save the PDF bytes and feed the path to the thumbnail extraction and merge engine.

**Tech Stack:** Python 3.10+, PyMuPDF, pywebview.

---

### Task 1: Update Upload File Types Filter

Extend the file picker dialog to display and accept PNG, JPG, and JPEG files.

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Modify upload_files file types**
  Change file types filter in `upload_files` method of `Api` class in `main.py` around line 512.
  Replace:
  ```python
          file_types = ('Document Files (*.pdf;*.hwp;*.hwpx)', 'All files (*.*)')
  ```
  with:
  ```python
          file_types = ('Supported Files (*.pdf;*.hwp;*.hwpx;*.png;*.jpg;*.jpeg)', 'All files (*.*)')
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add main.py
  git commit -m "feat: add image file formats to file dialog filter"
  ```

---

### Task 2: Implement Backend Image-to-PDF Conversion

Handle PNG, JPG, and JPEG files by converting them to PDF before generating thumbnails and merging.

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Add image detection and conversion**
  Modify `process_files` in `main.py` around line 533 to detect image extensions and convert using PyMuPDF.
  Add after `.hwp` and `.hwpx` block:
  ```python
                  elif ext in ['.png', '.jpg', '.jpeg']:
                      self.log(f"Converting image {file_path} to PDF...")
                      temp_pdf_name = f"{uuid.uuid4()}.pdf"
                      pdf_path = self._fm.get_temp_path(temp_pdf_name)
                      
                      img_doc = fitz.open(file_path)
                      pdf_bytes = img_doc.convert_to_pdf()
                      img_doc.close()
                      
                      with open(pdf_path, "wb") as f_pdf:
                          f_pdf.write(pdf_bytes)
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add main.py
  git commit -m "feat: implement image-to-pdf conversion in process_files"
  ```

---

### Task 3: Verify and Test Image Support

Verify image file processing, rendering, and export operations.

- [ ] **Step 1: Run unit tests**
  Make sure existing parser tests pass.
  Command: `python -m unittest discover -s tests`

- [ ] **Step 2: Verify drag-and-drop and upload manually**
  We will verify by launching or mocking file processing.

- [ ] **Step 3: Commit all changes**
  ```bash
  git add main.py
  git commit -m "test: verify image conversion and integration"
  ```
