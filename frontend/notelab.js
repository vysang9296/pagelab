let notelabEditorInstance = null;
let currentOpenedDocPath = "";
let currentOpenedDocPaths = [];
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
            hideModeSwitch: true,
            previewStyle: 'vertical',
            events: {
                change: () => {
                    bindPreviewLinks();
                },
                keyup: (editorType, ev) => {
                    handleWysiwygKeyup(editorType, ev);
                },
                keydown: (editorType, ev) => {
                    handleWysiwygKeydown(editorType, ev);
                }
            }
        });
    }
}

function handleWysiwygKeyup(editorType, ev) {
    if (editorType !== 'wysiwyg') return;
    if (!notelabEditorInstance) return;
    
    // Space 키 입력 시 마크다운 문법 변환
    if (ev.key === ' ' || ev.code === 'Space') {
        const wysiwygEditor = notelabEditorInstance.getCurrentModeEditor();
        if (!wysiwygEditor || !wysiwygEditor.view) return;
        
        const view = wysiwygEditor.view;
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;
        const parentNode = $from.parent;
        
        if (parentNode && parentNode.type.name === 'paragraph') {
            const text = parentNode.textContent;
            const offset = $from.parentOffset;
            const textBeforeCursor = text.substring(0, offset);
            
            // 1. 제목 (Heading): #, ##, ###, ####, #####, ###### + Space
            const headingMatch = textBeforeCursor.match(/^(#{1,6})\s$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const startPos = $from.start();
                const tr = state.tr.delete(startPos, startPos + offset);
                view.dispatch(tr);
                
                notelabEditorInstance.exec('heading', { level: level });
                ev.preventDefault();
                return;
            }
            
            // 2. 인용구 (BlockQuote): > + Space
            if (textBeforeCursor === '> ') {
                const startPos = $from.start();
                const tr = state.tr.delete(startPos, startPos + offset);
                view.dispatch(tr);
                
                notelabEditorInstance.exec('blockQuote');
                ev.preventDefault();
                return;
            }
            
            // 3. 순서 없는 목록 (Unordered List): * 또는 - + Space
            if (textBeforeCursor === '* ' || textBeforeCursor === '- ') {
                const startPos = $from.start();
                const tr = state.tr.delete(startPos, startPos + offset);
                view.dispatch(tr);
                
                notelabEditorInstance.exec('ul');
                ev.preventDefault();
                return;
            }
            
            // 4. 순서 있는 목록 (Ordered List): 1. + Space
            if (textBeforeCursor === '1. ') {
                const startPos = $from.start();
                const tr = state.tr.delete(startPos, startPos + offset);
                view.dispatch(tr);
                
                notelabEditorInstance.exec('ol');
                ev.preventDefault();
                return;
            }
            
            // 5. 할 일 목록 (Task List): [ ] 또는 - [ ] 또는 * [ ] + Space
            if (textBeforeCursor === '[ ] ' || textBeforeCursor === '- [ ] ' || textBeforeCursor === '* [ ] ') {
                const startPos = $from.start();
                const tr = state.tr.delete(startPos, startPos + offset);
                view.dispatch(tr);
                
                notelabEditorInstance.exec('task');
                ev.preventDefault();
                return;
            }
        }
    }
}

function handleWysiwygKeydown(editorType, ev) {
    if (editorType !== 'wysiwyg') return;
    if (!notelabEditorInstance) return;
    
    // Enter 키 입력 시 가로줄(hr) 변환
    if (ev.key === 'Enter') {
        const wysiwygEditor = notelabEditorInstance.getCurrentModeEditor();
        if (!wysiwygEditor || !wysiwygEditor.view) return;
        
        const view = wysiwygEditor.view;
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;
        const parentNode = $from.parent;
        
        if (parentNode && parentNode.type.name === 'paragraph') {
            const text = parentNode.textContent.trim();
            if (text === '---' || text === '***' || text === '___') {
                const startPos = $from.start();
                const endPos = $from.end();
                const tr = state.tr.delete(startPos, endPos);
                view.dispatch(tr);
                
                notelabEditorInstance.exec('hr');
                ev.preventDefault();
                return;
            }
        }
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
            currentOpenedDocPaths = [];
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

    const parseAllBtn = document.getElementById("notelab-parse-all-btn");
    if (parseAllBtn) {
        parseAllBtn.addEventListener("click", () => {
            if (currentOpenedDocPaths.length === 0) {
                alert("텍스트를 추출할 문서가 열려있지 않습니다.");
                return;
            }
            showLoading("전체 텍스트 파싱 및 변환 중...");
            
            const promise = currentOpenedDocPaths.length === 1
                ? window.pywebview.api.notelab_parse_to_markdown(currentOpenedDocPaths[0])
                : window.pywebview.api.notelab_parse_multiple_to_markdown(currentOpenedDocPaths);
                
            promise.then(res => {
                hideLoading();
                if (res && res.success) {
                    if (notelabEditorInstance) {
                        notelabEditorInstance.setMarkdown(res.markdown);
                    }
                    alert("전체 텍스트 가져오기가 완료되었습니다.");
                } else {
                    alert("텍스트 추출 실패: " + (res ? (res.error || res.markdown) : "알 수 없는 오류"));
                }
            }).catch(err => {
                hideLoading();
                alert("텍스트 추출 중 오류 발생: " + err);
            });
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
    
    // [✂️ 영역 크롭] & [👁️ 미리보기] 버튼 리스너 바인딩
    const cropBtn = document.getElementById("notelab-toggle-crop-btn");
    if (cropBtn) {
        cropBtn.addEventListener("click", () => {
            const isActive = cropBtn.classList.contains("active");
            setCropOverlayMode(!isActive);
        });
    }
    
    const previewBtn = document.getElementById("notelab-toggle-preview-btn");
    if (previewBtn) {
        previewBtn.addEventListener("click", () => {
            if (notelabEditorInstance && notelabEditorInstance.isWysiwygMode()) {
                return;
            }
            const editorWrapper = document.getElementById("notelab-markdown-editor");
            if (editorWrapper) {
                const isPreview = editorWrapper.classList.contains("notelab-preview-only");
                if (isPreview) {
                    editorWrapper.classList.remove("notelab-preview-only");
                    editorWrapper.classList.add("notelab-editor-only");
                    previewBtn.style.background = "";
                    previewBtn.style.color = "";
                } else {
                    editorWrapper.classList.remove("notelab-editor-only");
                    editorWrapper.classList.add("notelab-preview-only");
                    previewBtn.style.background = "#1a73e8";
                    previewBtn.style.color = "white";
                }
            }
        });
    }
}

function setCropOverlayMode(enabled) {
    const iframe = document.getElementById("notelab-pdf-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: "SET_CROP_MODE",
            enabled: enabled
        }, "*");
    }
    
    const cropBtn = document.getElementById("notelab-toggle-crop-btn");
    if (cropBtn) {
        if (enabled) {
            cropBtn.classList.add("active");
            cropBtn.style.background = "#d83b01";
            cropBtn.style.color = "white";
        } else {
            cropBtn.classList.remove("active");
            cropBtn.style.background = "";
            cropBtn.style.color = "";
        }
    }
}

function initNoteLabPostMessageListener() {
    window.addEventListener("message", (event) => {
        if (event.data && event.data.type === "CROP_SELECTION") {
            const { pageIndex, coords } = event.data;
            triggerOcrOrCrop(pageIndex, coords);
            // 크롭 시작하므로 오버레이 끎
            setCropOverlayMode(false);
        } else if (event.data && event.data.type === "INSERT_TEXT") {
            insertMarkdownContent(event.data.text);
        }
    });
}

function triggerOcrOrCrop(pageIndex, coords) {
    if (!currentOpenedDocPath) {
        setCropOverlayMode(false);
        return;
    }
    
    if (window.pywebview && window.pywebview.api) {
        showLoading(coords.mode === "ocr" ? "OCR 텍스트 추출 중..." : "이미지 영역 크롭 중...");
        window.pywebview.api.notelab_crop_pdf_page(currentOpenedDocPath, pageIndex, coords.x, coords.y, coords.w, coords.h, "frontend").then(res => {
            if (res && res.success) {
                if (coords.mode === "ocr") {
                    const relativeImagePath = "attachments/" + res.filename;
                    window.pywebview.api.notelab_ocr_image(relativeImagePath).then(ocrRes => {
                        hideLoading();
                        setCropOverlayMode(false);
                        if (ocrRes && ocrRes.success) {
                            window.pywebview.api.notelab_refine_text(ocrRes.text).then(refineRes => {
                                const textToInsert = refineRes && refineRes.success ? refineRes.refined_text : ocrRes.text;
                                insertMarkdownContent("\n" + textToInsert + "\n");
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
                        setCropOverlayMode(false);
                        alert("OCR 실행 오류: " + err);
                    });
                } else {
                    hideLoading();
                    setCropOverlayMode(false);
                    const mdImage = `\n![crop](${res.relative_path})\n`;
                    insertMarkdownContent(mdImage);
                }
            } else {
                hideLoading();
                setCropOverlayMode(false);
                alert("크롭 처리 실패: " + (res ? res.error : "알 수 없는 오류"));
            }
        }).catch(err => {
            hideLoading();
            setCropOverlayMode(false);
            alert("크롭 실행 오류: " + err);
        });
    } else {
        setCropOverlayMode(false);
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
    if (window.pywebview && window.pywebview.api && window.pywebview.api.notelab_get_pdf_base64) {
        showLoading("PDF 데이터를 불러오는 중...");
        window.pywebview.api.notelab_get_pdf_base64(pdfPath).then(res => {
            hideLoading();
            if (res && res.success) {
                renderPdfInIframeWithBase64(pdfPath, res.base64);
            } else {
                alert("PDF 로드 실패: " + (res ? res.error : "알 수 없는 오류"));
                const iframe = document.getElementById("notelab-pdf-iframe");
                if (iframe) {
                    iframe.src = "about:blank";
                }
            }
        }).catch(err => {
            hideLoading();
            alert("PDF 로드 중 에러 발생: " + err);
        });
    } else {
        alert("API가 준비되지 않았습니다.");
    }
}

function renderPdfInIframeWithBase64(pdfPath, base64) {
    const iframe = document.getElementById("notelab-pdf-iframe");
    if (!iframe) return;
    
    const viewerUrl = "pdf_viewer.html?v=" + new Date().getTime();
    
    const sendPdfData = () => {
        iframe.contentWindow.postMessage({
            type: "LOAD_PDF",
            base64: base64
        }, "*");
    };
    
    if (!iframe.src.includes("pdf_viewer.html")) {
        iframe.onload = () => {
            sendPdfData();
            iframe.onload = null;
        };
        iframe.src = viewerUrl;
    } else {
        sendPdfData();
    }
}

function openInNoteLab(filePath) {
    currentOpenedDocPath = filePath;
    currentOpenedDocPaths = [filePath];
    const filename = filePath.split(/[\\/]/).pop();
    
    const titleEl = document.querySelector('.notelab-file-title');
    if (titleEl) {
        titleEl.innerText = filename;
    }
    
    // Switch to notelab tab
    const notelabTabBtn = document.querySelector('[data-tab="notelab"]');
    if (notelabTabBtn) {
        notelabTabBtn.click();
    }
    
    // Initialize editor with title only as user requested (do not populate text instantly)
    if (notelabEditorInstance) {
        notelabEditorInstance.setMarkdown(`# ${filename}\n\n`);
    }
    
    if (window.pywebview && window.pywebview.api) {
        showLoading("문서 로딩 중...");
        window.pywebview.api.notelab_parse_to_markdown(filePath).then(res => {
            hideLoading();
            if (res && res.success) {
                if (res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            } else {
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown(`# ${filename}\n\n# 파싱 실패\n` + (res ? res.markdown : ""));
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
    currentOpenedDocPaths = filePaths;
    
    // Switch to notelab tab
    const notelabTabBtn = document.querySelector('[data-tab="notelab"]');
    if (notelabTabBtn) {
        notelabTabBtn.click();
    }
    
    const titleEl = document.querySelector('.notelab-file-title');
    if (titleEl) {
        titleEl.innerText = `${filePaths.length}개 문서 병합본`;
    }
    
    // Initialize editor with title only as user requested
    if (notelabEditorInstance) {
        notelabEditorInstance.setMarkdown(`# 문서 병합본\n\n`);
    }
    
    if (window.pywebview && window.pywebview.api) {
        showLoading("다중 문서 병합 중...");
        window.pywebview.api.notelab_parse_multiple_to_markdown(filePaths).then(res => {
            hideLoading();
            if (res && res.success) {
                // 다중 문서에서는 크롭/OCR을 위해 병합된 PDF 경로를 currentOpenedDocPath로 사용합니다.
                currentOpenedDocPath = res.pdf_path; 
                if (res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            } else {
                currentOpenedDocPath = "";
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown(`# 문서 병합본\n\n# 병합 파싱 실패\n` + (res ? (res.error || res.markdown) : ""));
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

function insertMarkdownContent(markdown) {
    if (!notelabEditorInstance) return;
    
    if (notelabEditorInstance.isWysiwygMode()) {
        const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
        let match;
        let lastIdx = 0;
        let hasImage = false;
        
        while ((match = imageRegex.exec(markdown)) !== null) {
            hasImage = true;
            const textBefore = markdown.substring(lastIdx, match.index);
            if (textBefore) {
                const html = markdownToHtmlSimple(textBefore);
                notelabEditorInstance.exec('insertHTML', html);
            }
            
            const altText = match[1] || 'image';
            const imageUrl = match[2];
            notelabEditorInstance.exec('addImage', {
                altText: altText,
                imageUrl: imageUrl
            });
            
            lastIdx = imageRegex.lastIndex;
        }
        
        if (hasImage) {
            const remainingText = markdown.substring(lastIdx);
            if (remainingText) {
                const html = markdownToHtmlSimple(remainingText);
                notelabEditorInstance.exec('insertHTML', html);
            }
        } else {
            const html = markdownToHtmlSimple(markdown);
            notelabEditorInstance.exec('insertHTML', html);
        }
    } else {
        notelabEditorInstance.insertText(markdown);
    }
}

function markdownToHtmlSimple(markdown) {
    let lines = markdown.split('\n');
    let htmlLines = lines.map(line => {
        let trimmed = line.trim();
        
        if (trimmed === '---' || trimmed === '***') {
            return '<hr />';
        }
        
        const headerMatch = line.match(/^(#{1,6})\s+(.*?)$/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const content = headerMatch[2];
            return `<h${level}>${content}</h${level}>`;
        }
        
        let processed = line;
        processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        return processed;
    });
    
    return htmlLines.join('<br />');
}

