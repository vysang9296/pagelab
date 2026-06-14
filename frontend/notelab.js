let notelabEditorInstance = null;
let currentOpenedDocPath = "";
let systemPreflightStatus = { kordoc: false, ocr_korean: false };

document.addEventListener("DOMContentLoaded", () => {
    // Add event listeners to nav tabs
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            if (target === "notelab") {
                // Introduce a 150ms delay to allow DOM transition / repaint before measuring height
                setTimeout(() => {
                    if (!notelabEditorInstance) {
                        initNoteLabEditor();
                    }
                }, 150);
            }
        });
    });

    initNoteLabResizer();
    initNoteLabButtons();
    initNoteLabPostMessageListener();
    
    // Check preflight status if pywebview is ready
    if (window.pywebview && window.pywebview.api) {
        checkSystemPreflightStatus();
    } else {
        window.addEventListener("pywebviewready", () => {
            checkSystemPreflightStatus();
        });
    }
});

function initNoteLabEditor() {
    const editorEl = document.querySelector('#notelab-markdown-editor');
    if (editorEl && typeof toastui !== 'undefined') {
        notelabEditorInstance = new toastui.Editor({
            el: editorEl,
            height: '100%',
            initialEditType: 'markdown',
            previewStyle: 'vertical',
            events: {
                change: () => {
                    bindPreviewLinks();
                }
            }
        });
    }
}

function initNoteLabResizer() {
    const resizer = document.getElementById("notelab-resizer");
    const viewer = document.getElementById("notelab-viewer");
    const editor = document.getElementById("notelab-editor");
    
    if (!resizer || !viewer || !editor) return;
    
    let isResizing = false;
    
    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        // Prevent iframe from capturing mouse events during resize
        const iframe = document.getElementById("notelab-pdf-iframe");
        if (iframe) iframe.style.pointerEvents = "none";
    });
    
    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const container = document.querySelector(".notelab-workspace");
        if (!container) return;
        const containerWidth = container.clientWidth;
        const newViewerWidth = e.clientX - container.getBoundingClientRect().left;
        const newEditorWidth = containerWidth - newViewerWidth - 6;
        
        if (newViewerWidth > 200 && newEditorWidth > 200) {
            viewer.style.flex = "none";
            viewer.style.width = `${newViewerWidth}px`;
            editor.style.width = `${newEditorWidth}px`;
        }
    });
    
    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = "default";
            const iframe = document.getElementById("notelab-pdf-iframe");
            if (iframe) iframe.style.pointerEvents = "auto";
        }
    });
}

function initNoteLabButtons() {
    const openDocBtn = document.getElementById("notelab-open-doc-btn");
    const saveBtn = document.getElementById("notelab-save-btn");
    const patchBtn = document.getElementById("notelab-patch-btn");
    const compareBtn = document.getElementById("notelab-compare-btn");
    const closeBtn = document.getElementById("notelab-close-doc-btn");

    if (openDocBtn) {
        openDocBtn.addEventListener("click", () => {
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
                window.pywebview.api.choose_file().then(filePath => {
                    if (filePath) {
                        openInNoteLab(filePath);
                    }
                });
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            if (!notelabEditorInstance || !currentOpenedDocPath) {
                alert("저장할 문서가 열려있지 않습니다.");
                return;
            }
            const content = notelabEditorInstance.getMarkdown();
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_dir) {
                window.pywebview.api.choose_dir().then(dir => {
                    if (dir) {
                        const filename = currentOpenedDocPath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
                        const savePath = dir + "\\" + filename + "_note.md";
                        // Save file via backend API
                        if (window.pywebview.api.notelab_save_markdown) {
                            window.pywebview.api.notelab_save_markdown(savePath, content).then(res => {
                                if (res && res.success) {
                                    alert("노트가 성공적으로 저장되었습니다:\n" + savePath);
                                } else {
                                    alert("노트 저장 실패: " + (res.error || "알 수 없는 오류"));
                                }
                            });
                        } else {
                            // Fallback mock
                            alert("노트가 저장되었습니다(Mock):\n" + savePath);
                        }
                    }
                });
            }
        });
    }

    if (patchBtn) {
        patchBtn.addEventListener("click", () => {
            if (!notelabEditorInstance || !currentOpenedDocPath) {
                alert("역패치할 원본 문서가 없습니다.");
                return;
            }
            const markdown = notelabEditorInstance.getMarkdown();
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_dir) {
                window.pywebview.api.choose_dir().then(dir => {
                    if (dir) {
                        const originalFilename = currentOpenedDocPath.split(/[\\/]/).pop();
                        const outputPath = dir + "\\" + originalFilename;
                        showLoading("한글(HWPX) 역패치 적용 중...");
                        window.pywebview.api.notelab_patch_document(currentOpenedDocPath, markdown, outputPath).then(res => {
                            hideLoading();
                            if (res && res.success) {
                                alert("한글(HWPX) 역패치 저장이 완료되었습니다.\n(원본 보존을 위해 기존 폴더에 .bak 백업본이 자동 생성되었습니다)\n\n위치: " + outputPath);
                            } else {
                                alert("역패치 저장 실패: " + (res.error || "알 수 없는 오류"));
                            }
                        }).catch(err => {
                            hideLoading();
                            alert("역패치 실행 오류: " + err);
                        });
                    }
                });
            }
        });
    }

    if (compareBtn) {
        compareBtn.addEventListener("click", () => {
            if (!currentOpenedDocPath) {
                alert("비교 기준이 되는 현재 문서가 없습니다.");
                return;
            }
            if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_file) {
                window.pywebview.api.choose_file().then(filePath => {
                    if (filePath) {
                        showLoading("두 문서 신구대조표 비교 분석 중...");
                        window.pywebview.api.notelab_compare_documents(currentOpenedDocPath, filePath).then(res => {
                            hideLoading();
                            if (res && res.success) {
                                // Open compare results
                                if (notelabEditorInstance) {
                                    notelabEditorInstance.setMarkdown(res.compare_result);
                                }
                                alert("비교 완료! 마크다운 에디터에 신구대조 결과가 로드되었습니다.");
                            } else {
                                alert("비교 실패: " + (res.error || "알 수 없는 오류"));
                            }
                        }).catch(err => {
                            hideLoading();
                            alert("비교 실행 오류: " + err);
                        });
                    }
                });
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            currentOpenedDocPath = "";
            document.querySelector('.notelab-file-title').innerText = "선택된 문서 없음";
            if (notelabEditorInstance) {
                notelabEditorInstance.setMarkdown("");
            }
            const iframe = document.getElementById("notelab-pdf-iframe");
            if (iframe) {
                iframe.src = "about:blank";
            }
        });
    }

    const aiBtn = document.getElementById("notelab-ai-btn");
    if (aiBtn) {
        aiBtn.addEventListener("click", () => {
            if (!notelabEditorInstance) {
                alert("에디터가 초기화되지 않았습니다.");
                return;
            }
            const markdown = notelabEditorInstance.getMarkdown();
            if (!markdown.trim()) {
                alert("분석할 본문 내용이 없습니다.");
                return;
            }
            showLoading("AI 분석 중...");
            window.pywebview.api.notelab_analyze_text(markdown).then(res => {
                hideLoading();
                if (res && res.success) {
                    const keywordsStr = res.keywords && res.keywords.length > 0 ? res.keywords.join(", ") : "없음";
                    const summaryStr = res.summary || "요약 없음";
                    
                    const aiReport = `\n\n---\n🤖 **AI 요약 및 키워드 분석**\n- **주요 키워드**: ${keywordsStr}\n- **요약**: ${summaryStr}\n`;
                    notelabEditorInstance.insertText(aiReport);
                    alert("AI 분석이 완료되었습니다. 결과가 문서 끝에 추가되었습니다.");
                } else {
                    alert("AI 분석 실패: " + (res.error || "알 수 없는 오류"));
                }
            }).catch(err => {
                hideLoading();
                alert("AI 분석 중 오류 발생: " + err);
            });
        });
    }
}

function initNoteLabPostMessageListener() {
    window.addEventListener("message", (event) => {
        if (event.data && event.data.type === "CROP_SELECTION") {
            const { pageIndex, coords } = event.data;
            triggerOcrOrCrop(pageIndex, coords);
        }
    });
}

function triggerOcrOrCrop(pageIndex, coords) {
    if (!currentOpenedDocPath) return;
    
    // Convert currentOpenedDocPath backslash to slash or keep it
    if (window.pywebview && window.pywebview.api) {
        showLoading(coords.mode === "ocr" ? "OCR 텍스트 추출 중..." : "이미지 영역 크롭 중...");
        window.pywebview.api.notelab_crop_pdf_page(currentOpenedDocPath, pageIndex, coords.x, coords.y, coords.w, coords.h, "frontend").then(res => {
            if (res && res.success) {
                if (coords.mode === "ocr") {
                    const relativeImagePath = "attachments/" + res.filename;
                    // Trigger OCR on backend
                    window.pywebview.api.notelab_ocr_image(relativeImagePath).then(ocrRes => {
                        hideLoading();
                        if (ocrRes && ocrRes.success) {
                            // Refine extracted text
                            window.pywebview.api.notelab_refine_text(ocrRes.text).then(refineRes => {
                                const textToInsert = refineRes && refineRes.success ? refineRes.refined_text : ocrRes.text;
                                if (notelabEditorInstance) {
                                    notelabEditorInstance.insertText("\n" + textToInsert + "\n");
                                }
                            });
                        } else {
                            if (ocrRes && ocrRes.error_code === "ko-language-pack-missing") {
                                showOcrLanguagePackModal();
                            } else {
                                alert("OCR 추출 실패: " + (ocrRes ? ocrRes.error_code : "알 수 없는 오류"));
                            }
                        }
                    }).catch(err => {
                        hideLoading();
                        alert("OCR 실행 오류: " + err);
                    });
                } else {
                    hideLoading();
                    const mdImage = `\n![crop](${res.relative_path})\n`;
                    if (notelabEditorInstance) {
                        notelabEditorInstance.insertText(mdImage);
                    }
                }
            } else {
                hideLoading();
                alert("크롭 처리 실패: " + (res ? res.error : "알 수 없는 오류"));
            }
        }).catch(err => {
            hideLoading();
            alert("크롭 실행 오류: " + err);
        });
    }
}

function checkSystemPreflightStatus() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.notelab_get_preflight_status) {
        window.pywebview.api.notelab_get_preflight_status().then(status => {
            if (status) {
                systemPreflightStatus = status;
                if (!status.ocr_korean || !status.kordoc) {
                    showSystemRestrictionBanner(status);
                }
            }
        });
    }
}

function showSystemRestrictionBanner(status) {
    if (document.getElementById("notelab-system-banner")) return;
    
    let message = "⚠️ <strong>시스템 알림:</strong> ";
    let showGuideBtn = false;
    
    if (!status.kordoc && !status.ocr_korean) {
        message += "kordoc.exe 미탐지 및 한국어 OCR 언어팩이 활성화되지 않아 기능이 일부 제한됩니다.";
        showGuideBtn = true;
    } else if (!status.kordoc) {
        message += "kordoc.exe 바이너리가 존재하지 않아 HWP 문서 파싱 및 역패치 기능이 제한됩니다.";
    } else if (!status.ocr_korean) {
        message += "Windows 10/11 한국어 OCR 언어팩이 설치되지 않아 이미지 글자 추출(OCR)이 제한됩니다.";
        showGuideBtn = true;
    }
    
    const guideBtnHtml = showGuideBtn ? `<button class="btn" style="padding:2px 8px; font-size:11px; margin-left:12px;" onclick="showOcrLanguagePackModal()">해결 방법 보기</button>` : "";
    
    const bannerHtml = `
        <div id="notelab-system-banner" style="background:#fff4ce; color:#323130; padding:10px 16px; border-bottom:1px solid #f3f2f1; font-size:12px; display:flex; align-items:center; justify-content:space-between; z-index:1000; width:100%; box-sizing:border-box;">
            <span>${message}</span>
            ${guideBtnHtml}
        </div>
    `;
    const workspace = document.getElementById("notelab-workspace");
    if (workspace) {
        workspace.insertAdjacentHTML("afterbegin", bannerHtml);
    }
}

function showOcrLanguagePackModal() {
    if (document.getElementById('ocr-guide-modal')) return;
    const modalHtml = `
        <div id="ocr-guide-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div style="background:#fff; padding:20px; border-radius:8px; width:450px; box-shadow:0 4px 15px rgba(0,0,0,0.2); font-family:system-ui, sans-serif;">
                <h3 style="margin-top:0; color:#d83b01;">⚠️ Windows 한국어 OCR 기능 활성화 필요</h3>
                <p style="font-size:14px; line-height:1.6; color:#333;">Windows 내장 광학 문자 인식(OCR) 엔진에 <strong>한국어 팩</strong>이 설치되어 있지 않습니다.</p>
                <div style="background:#f3f2f1; padding:12px; border-radius:4px; font-size:13px; margin:15px 0; text-align:left; line-height:1.6;">
                    <strong>[해결 방법]</strong><br>
                    1. Windows 설정 &gt; '시간 및 언어' &gt; '언어' 메뉴 이동<br>
                    2. '기본 설정 언어'에 '한국어'가 없으면 추가<br>
                    3. 한국어의 '옵션' 클릭 &gt; '손글씨 및 광학 문자 인식(OCR)' 팩 다운로드<br>
                    4. 완료 후 앱을 재기동해 주세요.
                </div>
                <div style="text-align:right;">
                    <button class="btn btn-primary" onclick="document.getElementById('ocr-guide-modal').remove()">확인</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// -------------------------------------------------------------
// Task 7: postMessage Navigation & SOP Mitigation
// -------------------------------------------------------------
function bindPreviewLinks() {
    const previewEl = document.querySelector('.toastui-editor-contents');
    if (!previewEl) return;
    
    const links = previewEl.querySelectorAll('a');
    links.forEach(link => {
        if (link.dataset.hasHook) return;
        link.dataset.hasHook = "true";
        
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.includes('#page=')) {
                e.preventDefault();
                const parts = href.split('#page=');
                const filePath = parts[0];
                const pageNum = parseInt(parts[1], 10);
                
                if (filePath && pageNum) {
                    navigateToDocumentPage(filePath, pageNum);
                }
            }
        });
    });
}

function navigateToDocumentPage(filePath, pageNum) {
    if (currentOpenedDocPath !== filePath) {
        window.openInNoteLab(filePath);
    }
    
    const iframe = document.getElementById("notelab-pdf-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: "NAVIGATE_PAGE",
            page: pageNum
        }, "*");
    }
}

// -------------------------------------------------------------
// Dynamic Local PDF.js Viewer Generator for Iframe (SOP Bypass)
// -------------------------------------------------------------
function loadPdfInIframe(pdfPath) {
    const iframe = document.getElementById("notelab-pdf-iframe");
    if (!iframe) return;
    
    // We escape windows path backslashes for JS strings
    const escapedPdfPath = pdfPath.replace(/\\/g, '\\\\');
    
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    margin: 0;
                    background-color: #525659;
                    font-family: sans-serif;
                    overflow-y: auto;
                    height: 100vh;
                }
                #viewer-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 20px 0;
                }
                .page-container {
                    position: relative;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                    background-color: white;
                    user-select: none;
                }
                canvas {
                    display: block;
                }
                /* Selection Overlay Canvas */
                .selection-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    cursor: crosshair;
                    z-index: 10;
                }
                /* Popover action menu */
                .action-popover {
                    position: absolute;
                    display: none;
                    background: #ffffff;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    border-radius: 4px;
                    padding: 4px;
                    z-index: 999;
                    flex-direction: row;
                    gap: 4px;
                }
                .popover-btn {
                    padding: 4px 8px;
                    font-size: 11px;
                    background: #1a73e8;
                    color: white;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .popover-btn:hover {
                    background: #1557b0;
                }
                .popover-btn.cancel {
                    background: #aaa;
                }
                .popover-btn.cancel:hover {
                    background: #888;
                }
            </style>
            <!-- Load PDF.js from CDN -->
            <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.12.313/pdf.min.js"></script>
            <script>
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.12.313/pdf.worker.min.js';
            </script>
        </head>
        <body>
            <div id="viewer-container"></div>
            
            <div id="popover-menu" class="action-popover">
                <button class="popover-btn" id="btn-crop">✂️ 이미지 크롭</button>
                <button class="popover-btn" id="btn-ocr">🔍 글자 추출(OCR)</button>
                <button class="popover-btn cancel" id="btn-cancel">취소</button>
            </div>

            <script>
                const pdfUrl = 'file:///${escapedPdfPath.replace(/\\\\/g, '/')}';
                let pdfDoc = null;
                let activeSelection = null; // { pageIndex, startX, startY, endX, endY, canvas }
                
                async function loadPdf() {
                    try {
                        const loadingTask = pdfjsLib.getDocument(pdfUrl);
                        pdfDoc = await loadingTask.promise;
                        renderAllPages();
                    } catch (e) {
                        console.error("Failed to load PDF in iframe: ", e);
                        document.getElementById('viewer-container').innerHTML = 
                            '<div style="color:white; padding:20px; text-align:center;">PDF 파일을 불러오지 못했습니다. <br>' + e.message + '</div>';
                    }
                }
                
                async function renderAllPages() {
                    const container = document.getElementById('viewer-container');
                    container.innerHTML = '';
                    
                    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                        const page = await pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });
                        
                        const pageDiv = document.createElement('div');
                        pageDiv.className = 'page-container';
                        pageDiv.id = 'page-container-' + pageNum;
                        pageDiv.style.width = viewport.width + 'px';
                        pageDiv.style.height = viewport.height + 'px';
                        
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        
                        const renderContext = {
                            canvasContext: context,
                            viewport: viewport
                        };
                        await page.render(renderContext).promise;
                        
                        // Selection overlay
                        const overlay = document.createElement('div');
                        overlay.className = 'selection-overlay';
                        overlay.dataset.pageIndex = pageNum - 1;
                        
                        setupSelectionDrawing(overlay, canvas, page, viewport);
                        
                        pageDiv.appendChild(canvas);
                        pageDiv.appendChild(overlay);
                        container.appendChild(pageDiv);
                    }
                }
                
                function setupSelectionDrawing(overlay, canvas, page, viewport) {
                    let isDrawing = false;
                    let startX = 0, startY = 0;
                    let currentSelectionDiv = null;
                    
                    overlay.addEventListener('mousedown', (e) => {
                        // Clear active selection popover
                        hidePopover();
                        
                        isDrawing = true;
                        const rect = overlay.getBoundingClientRect();
                        startX = e.clientX - rect.left;
                        startY = e.clientY - rect.top;
                        
                        // Create visual selection div
                        if (currentSelectionDiv) {
                            currentSelectionDiv.remove();
                        }
                        
                        currentSelectionDiv = document.createElement('div');
                        currentSelectionDiv.style.position = 'absolute';
                        currentSelectionDiv.style.border = '2px dashed #1a73e8';
                        currentSelectionDiv.style.background = 'rgba(26, 115, 232, 0.15)';
                        currentSelectionDiv.style.left = startX + 'px';
                        currentSelectionDiv.style.top = startY + 'px';
                        overlay.appendChild(currentSelectionDiv);
                    });
                    
                    overlay.addEventListener('mousemove', (e) => {
                        if (!isDrawing) return;
                        const rect = overlay.getBoundingClientRect();
                        const currentX = e.clientX - rect.left;
                        const currentY = e.clientY - rect.top;
                        
                        const width = currentX - startX;
                        const height = currentY - startY;
                        
                        currentSelectionDiv.style.width = Math.abs(width) + 'px';
                        currentSelectionDiv.style.height = Math.abs(height) + 'px';
                        currentSelectionDiv.style.left = (width < 0 ? currentX : startX) + 'px';
                        currentSelectionDiv.style.top = (height < 0 ? currentY : startY) + 'px';
                    });
                    
                    overlay.addEventListener('mouseup', (e) => {
                        if (!isDrawing) return;
                        isDrawing = false;
                        
                        const rect = overlay.getBoundingClientRect();
                        const endX = e.clientX - rect.left;
                        const endY = e.clientY - rect.top;
                        
                        const pageIndex = parseInt(overlay.dataset.pageIndex, 10);
                        
                        const x = Math.min(startX, endX);
                        const y = Math.min(startY, endY);
                        const w = Math.abs(startX - endX);
                        const h = Math.abs(startY - endY);
                        
                        if (w > 5 && h > 5) {
                            activeSelection = {
                                pageIndex,
                                canvasX: x,
                                canvasY: y,
                                canvasW: w,
                                canvasH: h,
                                page,
                                viewport,
                                overlayDiv: currentSelectionDiv
                            };
                            
                            showPopover(e.clientX, e.clientY + overlay.getBoundingClientRect().top);
                        } else {
                            if (currentSelectionDiv) {
                                currentSelectionDiv.remove();
                                currentSelectionDiv = null;
                            }
                        }
                    });
                }
                
                function showPopover(clientX, clientY) {
                    const popover = document.getElementById('popover-menu');
                    popover.style.display = 'flex';
                    popover.style.left = (clientX + 10) + 'px';
                    popover.style.top = (clientY + 10) + 'px';
                }
                
                function hidePopover() {
                    const popover = document.getElementById('popover-menu');
                    popover.style.display = 'none';
                    if (activeSelection && activeSelection.overlayDiv) {
                        activeSelection.overlayDiv.remove();
                    }
                    activeSelection = null;
                }
                
                document.getElementById('btn-crop').addEventListener('click', () => {
                    sendSelection("crop");
                });
                
                document.getElementById('btn-ocr').addEventListener('click', () => {
                    sendSelection("ocr");
                });
                
                document.getElementById('btn-cancel').addEventListener('click', () => {
                    hidePopover();
                });
                
                function sendSelection(mode) {
                    if (!activeSelection) return;
                    
                    const { pageIndex, canvasX, canvasY, canvasW, canvasH, page, viewport } = activeSelection;
                    
                    // Convert canvas pixels to PDF User Space points via convertToPdfPoint
                    const pdfPoint1 = viewport.convertToPdfPoint(canvasX, canvasY);
                    const pdfPoint2 = viewport.convertToPdfPoint(canvasX + canvasW, canvasY + canvasH);
                    
                    // PDF.js coordinate: bottom-left origin
                    // PyMuPDF coordinate: top-left origin
                    // page.view has [x0, y0, width, height] at scale 1.0 (unrotated, unscaled points)
                    const pageHeight = page.view[3];
                    
                    // We must convert PDF.js bottom-left coordinate to fitz top-left coordinate.
                    // pdfPoint[0] is X (same origin).
                    // pdfPoint[1] is Y from bottom. So fitzY = pageHeight - Y.
                    const fitzY1 = pageHeight - pdfPoint1[1];
                    const fitzY2 = pageHeight - pdfPoint2[1];
                    
                    const finalX = Math.min(pdfPoint1[0], pdfPoint2[0]);
                    const finalY = Math.min(fitzY1, fitzY2);
                    const finalW = Math.abs(pdfPoint1[0] - pdfPoint2[0]);
                    const finalH = Math.abs(fitzY1 - fitzY2);
                    
                    window.parent.postMessage({
                        type: "CROP_SELECTION",
                        pageIndex: pageIndex,
                        coords: {
                            x: finalX,
                            y: finalY,
                            w: finalW,
                            h: finalH,
                            mode: mode
                        }
                    }, "*");
                    
                    hidePopover();
                }
                
                // postMessage Navigation Page scroll
                window.addEventListener("message", (event) => {
                    if (event.data && event.data.type === "NAVIGATE_PAGE") {
                        const pageNum = event.data.page;
                        const el = document.getElementById('page-container-' + pageNum);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                });
                
                // Load PDF on startup
                loadPdf();
            </script>
        </body>
        </html>
    `);
    doc.close();
}

function openInNoteLab(filePath) {
    currentOpenedDocPath = filePath;
    const titleEl = document.querySelector('.notelab-file-title');
    if (titleEl) {
        titleEl.innerText = filePath.split(/[\\/]/).pop();
    }
    
    // Switch to notelab tab
    const notelabTabBtn = document.querySelector('[data-tab="notelab"]');
    if (notelabTabBtn) {
        notelabTabBtn.click();
    }
    
    if (window.pywebview && window.pywebview.api) {
        showLoading("문서 파싱 및 로딩 중...");
        window.pywebview.api.notelab_parse_to_markdown(filePath).then(res => {
            hideLoading();
            if (res && res.success) {
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown(res.markdown);
                }
                if (res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            } else {
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown("# 파싱 실패\n" + (res ? res.markdown : ""));
                }
                if (res && res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            }
        }).catch(err => {
            hideLoading();
            alert("문서 로딩 중 오류 발생: " + err);
        });
    }
}

window.openInNoteLab = openInNoteLab;
window.triggerOcrForArea = function(imagePath) {
    if (window.pywebview && window.pywebview.api) {
        showLoading("OCR 이미지 판독 중...");
        window.pywebview.api.notelab_ocr_image(imagePath).then(res => {
            hideLoading();
            if (res && res.success) {
                // Refine text
                window.pywebview.api.notelab_refine_text(res.text).then(refineRes => {
                    const final = refineRes && refineRes.success ? refineRes.refined_text : res.text;
                    if (notelabEditorInstance) {
                        notelabEditorInstance.insertText("\n" + final + "\n");
                    }
                });
            } else {
                if (res.error_code === "ko-language-pack-missing") {
                    showOcrLanguagePackModal();
                } else {
                    alert("OCR 처리 오류: " + (res.error_code || "unknown"));
                }
            }
        }).catch(err => {
            hideLoading();
            alert("OCR 오류: " + err);
        });
    }
};

function openMultipleInNoteLab(filePaths) {
    if (!filePaths || filePaths.length === 0) return;
    
    // Switch to notelab tab
    const notelabTabBtn = document.querySelector('[data-tab="notelab"]');
    if (notelabTabBtn) {
        notelabTabBtn.click();
    }
    
    const titleEl = document.querySelector('.notelab-file-title');
    if (titleEl) {
        titleEl.innerText = `${filePaths.length}개 문서 병합본`;
    }
    
    if (window.pywebview && window.pywebview.api) {
        showLoading("다중 문서 병합 및 파싱 중...");
        window.pywebview.api.notelab_parse_multiple_to_markdown(filePaths).then(res => {
            hideLoading();
            if (res && res.success) {
                // 다중 문서에서는 크롭/OCR을 위해 병합된 PDF 경로를 currentOpenedDocPath로 사용합니다.
                currentOpenedDocPath = res.pdf_path; 
                
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown(res.markdown);
                }
                if (res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            } else {
                currentOpenedDocPath = "";
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown("# 병합 파싱 실패\n" + (res ? (res.error || res.markdown) : ""));
                }
                if (res && res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            }
        }).catch(err => {
            hideLoading();
            currentOpenedDocPath = "";
            alert("다중 문서 로딩 중 오류 발생: " + err);
        });
    }
}

window.openMultipleInNoteLab = openMultipleInNoteLab;

