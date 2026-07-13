let notelabEditorInstance = null;
/** PDF 뷰어/크롭용 경로 (캐시 PDF 또는 원본 PDF) */
let currentOpenedDocPath = "";
/** 원본 소스 경로 목록 (텍스트 추출·패치용 — HWP/HWPX 유지) */
let currentOpenedDocPaths = [];
/** 패치/비교에 쓸 단일 원본 소스 경로 (.hwp/.hwpx 우선, PDF면 패치 불가) */
let currentOpenedSourcePath = "";
/** 마지막으로 저장/불러온 마크다운 노트 경로 (저장 대화상자 기본 이름용) */
let currentNoteMdPath = "";
let systemPreflightStatus = { kordoc: false, ocr_korean: false };

function isHwpFamilyPath(path) {
    if (!path || typeof path !== "string") return false;
    const lower = path.toLowerCase();
    return lower.endsWith(".hwp") || lower.endsWith(".hwpx");
}

function getPatchSourcePath() {
    // Prefer explicit source; fall back to multi-list first HWP; never use bare PDF cache for patch
    if (isHwpFamilyPath(currentOpenedSourcePath)) return currentOpenedSourcePath;
    if (Array.isArray(currentOpenedDocPaths)) {
        const found = currentOpenedDocPaths.find(p => isHwpFamilyPath(p));
        if (found) return found;
    }
    if (isHwpFamilyPath(currentOpenedDocPath)) return currentOpenedDocPath;
    return "";
}

// Global resizing states for NoteLab splitter to prevent multiple event listener binding conflicts
let isNoteLabSplitterResizing = false;
let isNoteLabSplitterListenersBound = false;

document.addEventListener("DOMContentLoaded", () => {
    initLabWorkflowHelp();
    initNoteLabOnboarding();

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
                    } else {
                        // [FIX] Force refresh size/layout calculation on tab activation to prevent preview sizing break
                        if (notelabEditorInstance.eventEmitter) {
                            notelabEditorInstance.eventEmitter.emit('resize');
                        } else if (notelabEditorInstance.eventManager) {
                            notelabEditorInstance.eventManager.emit('resize');
                        }
                    }
                    // Refresh dependency chips when entering Note Lab
                    checkSystemPreflightStatus();
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
            previewStyle: 'tab', // Start with editor only by setting previewStyle to 'tab' (custom CSS hides the tabs container)
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

function getDefaultNoteFilename() {
    if (currentNoteMdPath) {
        return currentNoteMdPath.split(/[\\/]/).pop() || "note.md";
    }
    const src = currentOpenedSourcePath || currentOpenedDocPath || "";
    if (src) {
        const base = src.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "") || "note";
        return base + "_note.md";
    }
    return "note.md";
}

/** 뷰어 문서명 + 저장 중인 노트명을 상단 제목에 표시 */
function updateNoteLabTitleBar() {
    const titleEl = document.querySelector(".notelab-file-title");
    if (!titleEl) return;
    const docSrc = currentOpenedSourcePath || "";
    const docName = docSrc ? docSrc.split(/[\\/]/).pop() : "";
    const noteName = currentNoteMdPath ? currentNoteMdPath.split(/[\\/]/).pop() : "";
    if (docName && noteName) {
        titleEl.innerText = docName + " · 📝 " + noteName;
    } else if (noteName) {
        titleEl.innerText = "📝 " + noteName;
    } else if (docName) {
        titleEl.innerText = docName;
    } else {
        titleEl.innerText = "선택된 문서 없음";
    }
}

function initNoteLabButtons() {
    const openDocBtn = document.getElementById("notelab-open-doc-btn");
    const openMdBtn = document.getElementById("notelab-open-md-btn");
    const saveBtn = document.getElementById("notelab-save-btn");
    const patchBtn = document.getElementById("notelab-patch-btn");
    const compareBtn = document.getElementById("notelab-compare-btn");
    const closeBtn = document.getElementById("notelab-close-doc-btn");

    if (openDocBtn) {
        openDocBtn.addEventListener("click", () => {
            const api = window.pywebview && window.pywebview.api;
            if (!api) return;
            // Prefer filtered Note Lab picker; fall back to generic choose_file
            const picker = api.notelab_choose_source_file || api.choose_file;
            picker.call(api).then(filePath => {
                if (filePath) {
                    openInNoteLab(filePath);
                }
            });
        });
    }

    if (openMdBtn) {
        openMdBtn.addEventListener("click", () => {
            const api = window.pywebview && window.pywebview.api;
            if (!api) {
                alert("API가 준비되지 않았습니다.");
                return;
            }
            const picker = api.notelab_choose_markdown_open || api.choose_file;
            picker.call(api).then(filePath => {
                if (!filePath) return;
                // .md가 아니면 안내
                if (!/\.(md|markdown|txt)$/i.test(filePath) && api.notelab_choose_markdown_open) {
                    // dialog already filtered
                }
                if (!api.notelab_load_markdown) {
                    alert("마크다운 불러오기 API가 없습니다.");
                    return;
                }
                showLoading("마크다운 불러오는 중...");
                api.notelab_load_markdown(filePath).then(res => {
                    hideLoading();
                    if (!res || !res.success) {
                        alert("불러오기 실패: " + (res && res.error ? res.error : "알 수 없는 오류"));
                        return;
                    }
                    if (!notelabEditorInstance) {
                        initNoteLabEditor();
                    }
                    if (notelabEditorInstance) {
                        notelabEditorInstance.setMarkdown(res.content || "");
                    }
                    currentNoteMdPath = res.path || filePath;
                    updateNoteLabTitleBar();
                    alert("마크다운을 불러왔습니다.\n" + (res.path || filePath));
                }).catch(err => {
                    hideLoading();
                    alert("불러오기 오류: " + err);
                });
            });
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            if (!notelabEditorInstance) {
                alert("에디터가 준비되지 않았습니다.");
                return;
            }
            const api = window.pywebview && window.pywebview.api;
            if (!api) {
                alert("API가 준비되지 않았습니다.");
                return;
            }
            const content = notelabEditorInstance.getMarkdown();
            const defaultName = getDefaultNoteFilename();

            const savePicker = api.notelab_choose_markdown_save_path
                ? () => api.notelab_choose_markdown_save_path(defaultName)
                : (api.choose_save_path
                    ? () => api.choose_save_path(defaultName)
                    : null);

            if (!savePicker) {
                alert("저장 대화상자를 열 수 없습니다.");
                return;
            }

            savePicker().then(savePath => {
                if (!savePath) return;
                if (!api.notelab_save_markdown) {
                    alert("저장 API가 없습니다.");
                    return;
                }
                showLoading("노트 저장 중...");
                api.notelab_save_markdown(savePath, content).then(res => {
                    hideLoading();
                    if (res && res.success) {
                        const finalPath = res.path || savePath;
                        currentNoteMdPath = finalPath;
                        updateNoteLabTitleBar();
                        alert("노트가 저장되었습니다.\n" + finalPath);
                    } else {
                        alert("노트 저장 실패: " + (res && res.error ? res.error : "알 수 없는 오류"));
                    }
                }).catch(err => {
                    hideLoading();
                    alert("노트 저장 오류: " + err);
                });
            });
        });
    }

    if (patchBtn) {
        patchBtn.addEventListener("click", () => {
            if (!notelabEditorInstance) {
                alert("에디터가 준비되지 않았습니다.");
                return;
            }
            const markdown = notelabEditorInstance.getMarkdown();
            if (!markdown || !markdown.trim()) {
                alert("반영할 마크다운 내용이 비어 있습니다.\n먼저 문서를 열고 [본문 가져오기]로 내용을 채운 뒤 편집하세요.");
                return;
            }

            if (systemPreflightStatus && systemPreflightStatus.kordoc === false) {
                alert(
                    "한글로 반영 저장에 필요한 kordoc.exe를 찾을 수 없습니다.\n\n" +
                    "해결: backend/bin/kordoc.exe 가 프로그램과 함께 배포되었는지 확인하세요.\n" +
                    "(망분리 PC에서는 외부 다운로드 없이 배포 패키지에 포함되어야 합니다.)"
                );
                return;
            }

            const sourcePath = getPatchSourcePath();
            const api = window.pywebview && window.pywebview.api;
            if (!api) {
                alert("API가 준비되지 않았습니다.");
                return;
            }

            const runPatch = (originalPath) => {
                if (!isHwpFamilyPath(originalPath)) {
                    alert(
                        "[한글로 반영 저장]은 .hwp / .hwpx 원본만 가능합니다.\n" +
                        "현재 원본: " + (originalPath || "(없음)") + "\n\n" +
                        "한글 문서를 [문서 열기]로 연 뒤, [본문 가져오기] → 편집 → 다시 저장하세요.\n" +
                        "(PDF만 연 상태에서는 한글로 되돌릴 수 없습니다.)"
                    );
                    return;
                }

                const baseName = originalPath.split(/[\\/]/).pop();
                const defaultName = baseName.replace(/(\.hwpx?)$/i, "_patched$1");

                const confirmed = confirm(
                    "【원본 보호 안내】\n\n" +
                    "• 원본 파일은 직접 덮어쓰지 않습니다.\n" +
                    "• 원본 옆에 .bak 백업이 생성됩니다.\n" +
                    "• 다음에 지정하는 경로에 새 한글 파일로 저장됩니다.\n\n" +
                    "원본:\n" + originalPath + "\n\n" +
                    "계속하시겠습니까?"
                );
                if (!confirmed) return;

                const savePicker = api.notelab_choose_patch_save_path
                    ? () => api.notelab_choose_patch_save_path(defaultName)
                    : null;

                const afterPath = (outputPath) => {
                    if (!outputPath) return;
                    showLoading("한글로 반영 저장 중...");
                    api.notelab_patch_document(originalPath, markdown, outputPath).then(res => {
                        hideLoading();
                        if (res && res.success) {
                            const out = res.output_path || outputPath;
                            const bak = res.backup_path || (originalPath + ".bak");
                            alert(
                                "한글로 반영 저장이 완료되었습니다.\n\n" +
                                "저장 위치 (새 파일):\n" + out + "\n\n" +
                                "원본 백업 (.bak):\n" + bak + "\n\n" +
                                "원본 파일 자체는 수정되지 않았습니다."
                            );
                        } else {
                            alert(
                                "한글로 반영 저장 실패:\n" +
                                (res && res.error ? res.error : "알 수 없는 오류") +
                                "\n\n• kordoc 상태와 원본이 .hwp/.hwpx 인지 확인하세요.\n" +
                                "• 본문 가져오기로 만든 마크다운과 구조가 크게 다르면 일부만 반영될 수 있습니다."
                            );
                        }
                    }).catch(err => {
                        hideLoading();
                        alert("한글로 반영 저장 오류: " + err);
                    });
                };

                if (savePicker) {
                    savePicker().then(afterPath);
                } else if (api.choose_dir) {
                    api.choose_dir().then(dir => {
                        if (!dir) return;
                        afterPath(dir + "\\" + defaultName);
                    });
                }
            };

            if (sourcePath) {
                runPatch(sourcePath);
            } else {
                const pick = api.notelab_choose_hwp_file || api.choose_file;
                alert(
                    "현재 세션에 HWP/HWPX 원본 경로가 없습니다.\n" +
                    "다음 창에서 반영할 원본 한글 파일을 선택하세요."
                );
                pick.call(api).then(picked => {
                    if (!picked) return;
                    if (!isHwpFamilyPath(picked)) {
                        alert("선택한 파일이 .hwp / .hwpx 가 아닙니다:\n" + picked);
                        return;
                    }
                    currentOpenedSourcePath = picked;
                    runPatch(picked);
                });
            }
        });
    }

    if (compareBtn) {
        compareBtn.addEventListener("click", () => {
            const basePath = getPatchSourcePath() || currentOpenedSourcePath || currentOpenedDocPath;
            if (!basePath) {
                alert("비교 기준이 되는 현재 문서가 없습니다.\n먼저 문서를 열어 주세요.");
                return;
            }
            const api = window.pywebview && window.pywebview.api;
            if (!api) return;
            const picker = api.notelab_choose_hwp_file || api.choose_file;
            picker.call(api).then(filePath => {
                if (!filePath) return;
                showLoading("두 문서 신구대조표 비교 분석 중...");
                api.notelab_compare_documents(basePath, filePath).then(res => {
                    hideLoading();
                    if (res && res.success) {
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
            });
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            currentOpenedDocPath = "";
            currentOpenedDocPaths = [];
            currentOpenedSourcePath = "";
            currentNoteMdPath = "";
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
            if (systemPreflightStatus && systemPreflightStatus.kordoc === false) {
                const cont = confirm(
                    "한글엔진(kordoc)이 없습니다.\n" +
                    "기본 텍스트 추출(품질 제한)으로 시도합니다.\n\n계속할까요?"
                );
                if (!cont) return;
            }
            showLoading("본문 가져오는 중...");
            
            const promise = currentOpenedDocPaths.length === 1
                ? window.pywebview.api.notelab_parse_to_markdown(currentOpenedDocPaths[0])
                : window.pywebview.api.notelab_parse_multiple_to_markdown(currentOpenedDocPaths);
                
            promise.then(res => {
                hideLoading();
                if (res && res.success) {
                    if (notelabEditorInstance) {
                        notelabEditorInstance.setMarkdown(res.markdown);
                        // Force sync preview rendering after populating editor content
                        const editorWrapper = document.getElementById("notelab-editor");
                        if (editorWrapper && editorWrapper.classList.contains("notelab-split-view")) {
                            setTimeout(() => {
                                if (notelabEditorInstance.eventEmitter) {
                                    notelabEditorInstance.eventEmitter.emit('change');
                                } else if (notelabEditorInstance.eventManager) {
                                    notelabEditorInstance.eventManager.emit('change');
                                }
                            }, 50);
                        }
                    }
                    const via = res.metadata && res.metadata.fallback
                        ? "\n\n(기본 추출기 사용 — 표·서식 품질이 제한될 수 있습니다)"
                        : "";
                    alert("본문 가져오기가 완료되었습니다." + via);
                } else {
                    alert(
                        "본문 가져오기 실패:\n" +
                        (res ? (res.error || res.markdown) : "알 수 없는 오류") +
                        "\n\n• 한글 문서는 한컴 설치·kordoc.exe 상태를 확인하세요.\n" +
                        "• PDF는 스캔본이면 영역 크롭+OCR을 사용하세요."
                    );
                }
            }).catch(err => {
                hideLoading();
                alert("본문 가져오기 오류: " + err);
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
                alert("정리할 본문이 없습니다.\n먼저 [본문 가져오기]로 내용을 채운 뒤 사용해 주세요.");
                return;
            }
            if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.notelab_analyze_text) {
                alert("API가 준비되지 않았습니다.");
                return;
            }

            // 1=문단·개조식 정리(권장), 2=키워드·요약만, 3=둘 다
            const choice = prompt(
                "로컬 분석 (외부 전송 없음)\n\n" +
                "1 — 문단·개조식 정리 (1. / 1) / 가. / 가) / Ⅰ 등 줄바꿈·띄어쓰기)\n" +
                "2 — 키워드·요약만 (문서 끝에 추가)\n" +
                "3 — 정리 후 키워드·요약까지\n\n" +
                "번호를 입력하세요:",
                "1"
            );
            if (choice === null) return;
            const c = String(choice).trim();
            let mode = "structure";
            if (c === "2") mode = "keywords";
            else if (c === "3") mode = "both";
            else mode = "structure";

            if (mode === "structure" || mode === "both") {
                const ok = confirm(
                    "【문단·개조식 정리】\n\n" +
                    "• 본문 가져오기 결과가 한 줄로 붙었을 때 줄바꿈을 복원합니다.\n" +
                    "• 1.  1)  가.  가)  Ⅰ  제1장  ①  □  등을 인식합니다.\n" +
                    "• 뷰어 PDF가 있으면 줄 시작 힌트로 참고합니다 (완벽 대조 아님).\n" +
                    "• 에디터 본문이 정리본으로 바뀝니다. (원본 파일은 그대로)\n\n" +
                    "계속할까요?"
                );
                if (!ok) return;
            }

            // 뷰어용 PDF 경로 (HWP 캐시 PDF 또는 원본 PDF) — 구조 힌트
            const pdfHintPath = (currentOpenedDocPath && /\.pdf$/i.test(currentOpenedDocPath))
                ? currentOpenedDocPath
                : null;

            showLoading(mode === "keywords" ? "키워드·요약 분석 중..." : "문단·개조식 정리 중...");
            window.pywebview.api.notelab_analyze_text(markdown, pdfHintPath, mode).then(res => {
                hideLoading();
                if (!res || !res.success) {
                    alert("분석 실패: " + (res && res.error ? res.error : "알 수 없는 오류"));
                    return;
                }

                if ((mode === "structure" || mode === "both") && res.structured_text != null) {
                    notelabEditorInstance.setMarkdown(res.structured_text);
                }

                if (mode === "keywords" || mode === "both") {
                    const keywordsStr = res.keywords && res.keywords.length > 0 ? res.keywords.join(", ") : "없음";
                    const summaryStr = res.summary || "요약 없음";
                    const aiReport =
                        `\n\n---\n🤖 **로컬 키워드·요약**\n` +
                        `- **주요 키워드**: ${keywordsStr}\n` +
                        `- **요약**: ${summaryStr}\n`;
                    notelabEditorInstance.setMarkdown(
                        (notelabEditorInstance.getMarkdown() || "") + aiReport
                    );
                }

                let msg = "완료되었습니다.";
                if (mode === "structure" || mode === "both") {
                    msg = "문단·개조식 정리가 적용되었습니다.\n(에디터 본문이 교체됨 · 파일 원본은 변경 없음)";
                    if (res.used_pdf_hint) {
                        msg += "\n· 뷰어 PDF 줄 정보를 참고했습니다.";
                    } else if (pdfHintPath) {
                        msg += "\n· PDF 힌트 추출 실패 — 마크다운 규칙만 적용했습니다.";
                    } else {
                        msg += "\n· PDF 없음 — 마크다운 규칙만 적용했습니다.";
                    }
                    msg += "\n\n완벽하지 않을 수 있으니 미리보기로 확인 후 수정하세요.";
                }
                if (mode === "keywords") {
                    msg = "키워드·요약이 문서 끝에 추가되었습니다.";
                }
                if (mode === "both") {
                    msg += "\n키워드·요약도 문서 끝에 추가되었습니다.";
                }
                alert(msg);
            }).catch(err => {
                hideLoading();
                alert("분석 중 오류: " + err);
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
            if (!notelabEditorInstance) return;
            if (notelabEditorInstance.isWysiwygMode()) return;
            
            const editorWrapper = document.getElementById("notelab-editor");
            const isSplit = editorWrapper ? editorWrapper.classList.contains("notelab-split-view") : false;
            const targetStyle = isSplit ? 'tab' : 'vertical';
            
            notelabEditorInstance.changePreviewStyle(targetStyle);
            
            if (targetStyle === 'vertical') {
                previewBtn.style.background = "#1a73e8";
                previewBtn.style.color = "white";
                if (editorWrapper) {
                    editorWrapper.classList.remove("notelab-editor-only");
                    editorWrapper.classList.add("notelab-split-view");
                }
                
                // Force sync preview, then install splitter AFTER Toast UI finishes re-layout.
                // Installing earlier is wiped by setMarkdown / changePreviewStyle DOM rebuild.
                setTimeout(() => {
                    if (!notelabEditorInstance) return;
                    const currentMd = notelabEditorInstance.getMarkdown();
                    notelabEditorInstance.setMarkdown(currentMd, false);
                    if (notelabEditorInstance.eventEmitter) {
                        notelabEditorInstance.eventEmitter.emit('resize');
                        notelabEditorInstance.eventEmitter.emit('change');
                    } else if (notelabEditorInstance.eventManager) {
                        notelabEditorInstance.eventManager.emit('resize');
                        notelabEditorInstance.eventManager.emit('change');
                    }
                    // Wait one more frame so .toastui-editor-md-preview exists, then enable drag-resize
                    setTimeout(() => {
                        applyNoteLabSplitPaneWidths();
                        initNoteLabSplitterResizer();
                        window.dispatchEvent(new Event('resize'));
                    }, 30);
                }, 50);
            } else {
                previewBtn.style.background = "";
                previewBtn.style.color = "";
                if (editorWrapper) {
                    editorWrapper.classList.remove("notelab-split-view");
                    editorWrapper.classList.add("notelab-editor-only");
                    
                    const container = editorWrapper.querySelector('.toastui-editor-md-container');
                    if (container) {
                        const { editorPane, previewPane } = getNoteLabSplitPanes(container);
                        if (editorPane) {
                            editorPane.style.removeProperty('width');
                            editorPane.style.removeProperty('flex');
                            editorPane.style.removeProperty('min-width');
                        }
                        if (previewPane) {
                            previewPane.style.removeProperty('width');
                            previewPane.style.removeProperty('flex');
                            previewPane.style.removeProperty('min-width');
                        }
                        // Do not remove native Toast UI splitter node; just leave it hidden in tab mode
                    }
                }
            }
        });
    }
}

/**
 * Resolve Toast UI markdown editor / preview panes.
 * Note: Toast UI uses `.toastui-editor` (not `.toastui-editor-md-editor`) for the MD editor pane.
 */
function getNoteLabSplitPanes(container) {
    if (!container) return { editorPane: null, previewPane: null };
    const previewPane = container.querySelector('.toastui-editor-md-preview');
    // Prefer direct child editor; fallback for nested layouts
    let editorPane = container.querySelector(':scope > .toastui-editor');
    if (!editorPane) {
        editorPane = container.querySelector('.toastui-editor:not(.toastui-editor-md-preview)');
    }
    // Guard: never treat the preview (or a node inside it) as the editor
    if (editorPane && previewPane && (editorPane === previewPane || previewPane.contains(editorPane))) {
        editorPane = null;
    }
    return { editorPane, previewPane };
}

/** Apply saved (or default 50/50) editor/preview widths in split view */
function applyNoteLabSplitPaneWidths() {
    const editorWrapper = document.getElementById("notelab-editor");
    if (!editorWrapper || !editorWrapper.classList.contains("notelab-split-view")) return;
    
    const container = editorWrapper.querySelector('.toastui-editor-md-container');
    if (!container) return;
    
    const { editorPane, previewPane } = getNoteLabSplitPanes(container);
    if (!editorPane || !previewPane) return;
    
    const rawPct = parseFloat(editorWrapper.dataset.lastEditorPct);
    const editorPct = (!isNaN(rawPct) && rawPct > 0 && rawPct < 100) ? rawPct : 50;
    
    // Splitter is 8px; split remainder between the two panes
    editorPane.style.setProperty('width', `calc(${editorPct}% - 4px)`, 'important');
    editorPane.style.setProperty('flex', 'none', 'important');
    editorPane.style.setProperty('min-width', '0', 'important');
    previewPane.style.setProperty('width', `calc(${100 - editorPct}% - 4px)`, 'important');
    previewPane.style.setProperty('flex', 'none', 'important');
    previewPane.style.setProperty('min-width', '0', 'important');
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
    // Prevent duplicate listeners
    if (window.__notelabPostMessageBound) return;
    window.__notelabPostMessageBound = true;

    window.addEventListener("message", (event) => {
        if (!event.data || !event.data.type) return;
        if (event.data.type === "CROP_SELECTION") {
            const { pageIndex, coords } = event.data;
            triggerOcrOrCrop(pageIndex, coords);
            setCropOverlayMode(false);
        } else if (event.data.type === "INSERT_TEXT") {
            if (!notelabEditorInstance) {
                setTimeout(() => {
                    if (notelabEditorInstance) insertMarkdownContent(event.data.text);
                }, 100);
                return;
            }
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

function initLabWorkflowHelp() {
    const openBtn = document.getElementById("lab-workflow-help-btn");
    const modal = document.getElementById("lab-workflow-modal");
    const closeBtn = document.getElementById("lab-workflow-modal-close");
    if (!modal) return;

    const open = () => { modal.style.display = "flex"; };
    const close = () => { modal.style.display = "none"; };

    if (openBtn) openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
    });
}

function initNoteLabOnboarding() {
    const box = document.getElementById("notelab-onboarding");
    const dismiss = document.getElementById("notelab-onboarding-dismiss");
    if (!box) return;

    let dismissed = false;
    try {
        dismissed = localStorage.getItem("notelab_onboarding_dismissed") === "1";
    } catch (e) { /* ignore */ }

    if (!dismissed) {
        box.style.display = "flex";
    }
    if (dismiss) {
        dismiss.addEventListener("click", () => {
            box.style.display = "none";
            try {
                localStorage.setItem("notelab_onboarding_dismissed", "1");
            } catch (e) { /* ignore */ }
        });
    }
}

function updateNoteLabPreflightUI(status) {
    const chipK = document.getElementById("notelab-chip-kordoc");
    const chipO = document.getElementById("notelab-chip-ocr");
    const helpBtn = document.getElementById("notelab-preflight-help-btn");
    const parseBtn = document.getElementById("notelab-parse-all-btn");
    const patchBtn = document.getElementById("notelab-patch-btn");

    if (chipK) {
        if (status.kordoc) {
            chipK.className = "notelab-status-chip ok";
            chipK.textContent = "한글엔진(kordoc): 정상";
            chipK.title = "본문 가져오기 · 한글로 반영 저장 사용 가능";
        } else {
            chipK.className = "notelab-status-chip bad";
            chipK.textContent = "한글엔진(kordoc): 없음";
            chipK.title = "backend/bin/kordoc.exe 가 필요합니다. 본문 가져오기·한글로 반영 저장이 제한됩니다.";
        }
    }
    if (chipO) {
        if (status.ocr_korean) {
            chipO.className = "notelab-status-chip ok";
            chipO.textContent = "한국어 OCR: 정상";
            chipO.title = "영역 크롭 후 글자 인식 가능";
        } else {
            chipO.className = "notelab-status-chip warn";
            chipO.textContent = "한국어 OCR: 미설치";
            chipO.title = "Windows 한국어 OCR 언어팩이 필요합니다. [해결 방법]을 누르세요.";
        }
    }
    if (helpBtn) {
        const needHelp = !status.kordoc || !status.ocr_korean;
        helpBtn.style.display = needHelp ? "inline-block" : "none";
        helpBtn.onclick = () => {
            if (!status.ocr_korean) {
                showOcrLanguagePackModal();
            } else if (!status.kordoc) {
                alert(
                    "【kordoc.exe 없음】\n\n" +
                    "다음 기능이 제한됩니다.\n" +
                    "• 본문 가져오기 (HWP/HWPX 고품질 파싱)\n" +
                    "• 한글로 반영 저장\n" +
                    "• 문서 비교\n\n" +
                    "해결 방법:\n" +
                    "1. 배포 패키지에 backend/bin/kordoc.exe 포함 여부 확인\n" +
                    "2. 프로그램 설치 폴더에서 해당 파일이 빠지지 않았는지 확인\n" +
                    "3. 망분리 PC는 외부 npm 설치 없이 번들 exe를 사용합니다"
                );
            }
        };
    }
    // Soft-disable labels via title (buttons still clickable for fallback paths)
    if (parseBtn && !status.kordoc) {
        parseBtn.title = "kordoc 없음 — 기본 텍스트 추출(품질 제한)으로 시도합니다";
    }
    if (patchBtn && !status.kordoc) {
        patchBtn.title = "kordoc 없음 — 한글로 반영 저장 불가";
        patchBtn.style.opacity = "0.55";
    } else if (patchBtn) {
        patchBtn.style.opacity = "";
        patchBtn.title = "편집한 마크다운을 원본 한글 서식에 반영해 새 파일로 저장";
    }
}

function checkSystemPreflightStatus() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.notelab_get_preflight_status) {
        window.pywebview.api.notelab_get_preflight_status().then(status => {
            if (status) {
                systemPreflightStatus = status;
                updateNoteLabPreflightUI(status);
            }
        }).catch(() => {
            updateNoteLabPreflightUI({ kordoc: false, ocr_korean: false });
        });
    } else {
        // API not ready yet — leave pending chips
        setTimeout(checkSystemPreflightStatus, 800);
    }
}

function showOcrLanguagePackModal() {
    if (document.getElementById('ocr-guide-modal')) return;
    
    // Define helper scripts on window scope to communicate with pywebview and clipboards safely
    window.copyOcrInstallCmd = function() {
        const cmd = 'Add-WindowsCapability -Online -Name "Language.OCR~~~ko-KR~0.0.1.0"';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cmd).then(() => {
                alert('설치 명령어가 클립보드에 복사되었습니다. PowerShell(관리자 권한)에 붙여넣기 하세요.');
            }).catch(() => {
                fallbackCopy(cmd);
            });
        } else {
            fallbackCopy(cmd);
        }
    };

    function fallbackCopy(text) {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.left = '0';
        document.body.appendChild(el);
        el.select();
        try {
            document.execCommand('copy');
            alert('설치 명령어가 클립보드에 복사되었습니다. PowerShell(관리자 권한)에 붙여넣기 하세요.');
        } catch(e) {
            alert('복사에 실패했습니다. 수동으로 복사해주세요.');
        }
        document.body.removeChild(el);
    }

    window.openWindowsOcrSettings = function() {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.notelab_open_system_settings) {
            window.pywebview.api.notelab_open_system_settings('ms-settings:regionlanguage');
        } else {
            alert('설정 창을 자동으로 열 수 없습니다. Windows 설정 > 시간 및 언어 > 언어 및 지역 메뉴로 이동해 직접 설정해주세요.');
        }
    };

    const modalHtml = `
        <div id="ocr-guide-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter: blur(4px);">
            <div style="background:#fff; padding:24px; border-radius:12px; width:480px; box-shadow:0 8px 30px rgba(0,0,0,0.15); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <h3 style="margin-top:0; color:#d83b01; display:flex; align-items:center; gap:8px; font-size:18px;">
                    <svg style="width:22px; height:22px; fill:currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    Windows 한국어 OCR 기능 활성화 필요
                </h3>
                <p style="font-size:14px; line-height:1.6; color:#505050; margin:12px 0;">
                    Windows 내장 광학 문자 인식(OCR) 엔진에 <strong>한국어 팩</strong>이 활성화되어 있지 않습니다. 아래 두 가지 방법 중 하나로 해결할 수 있습니다.
                </p>
                
                <!-- 방법 1: PowerShell 원클릭 설치 -->
                <div style="background:#f8f9fa; border:1px solid #e9ecef; padding:12px 16px; border-radius:8px; margin-bottom:12px; text-align:left;">
                    <div style="font-size:13px; font-weight:600; color:#212529; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
                        <span>방법 1: PowerShell로 자동 설치 (권장)</span>
                        <button onclick="copyOcrInstallCmd()" style="background:#fff; border:1px solid #ced4da; padding:3px 8px; border-radius:4px; font-size:11px; cursor:pointer; display:inline-flex; align-items:center; font-weight:normal; transition: background 0.2s;">
                            명령어 복사
                        </button>
                    </div>
                    <code style="display:block; background:#212529; color:#f8f9fa; padding:8px 12px; border-radius:6px; font-size:11px; font-family:Consolas, Monaco, monospace; word-break:break-all; user-select:all;">Add-WindowsCapability -Online -Name "Language.OCR~~~ko-KR~0.0.1.0"</code>
                    <span style="font-size:11px; color:#868e96; display:block; margin-top:4px;">* PowerShell을 '관리자 권한'으로 열고 붙여넣기(우클릭)하세요.</span>
                </div>

                <!-- 방법 2: 윈도우 설정에서 추가 -->
                <div style="background:#f8f9fa; border:1px solid #e9ecef; padding:12px 16px; border-radius:8px; margin-bottom:20px; text-align:left;">
                    <div style="font-size:13px; font-weight:600; color:#212529; margin-bottom:6px;">방법 2: Windows 수동 설정</div>
                    <div style="font-size:12px; color:#495057; line-height:1.5; margin-bottom:8px;">
                        설정 페이지로 이동하여 한국어 기본 옵션 > '광학 문자 인식(OCR)' 팩을 수동 추가하세요.
                    </div>
                    <button onclick="openWindowsOcrSettings()" style="background:#0078d4; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer; font-weight:600;">
                        윈도우 설정 열기
                    </button>
                </div>

                <div style="text-align:right; border-top:1px solid #dee2e6; padding-top:16px; display:flex; justify-content:flex-end; gap:8px;">
                    <button class="btn" style="padding:6px 16px; font-size:13px; background:#f1f3f5; border:1px solid #ced4da; border-radius:4px; cursor:pointer;" onclick="document.getElementById('ocr-guide-modal').remove()">닫기</button>
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
    
    // Always reload viewer HTML so mini-menu / selection fixes are not stuck on stale iframe
    const viewerUrl = "pdf_viewer.html?v=20260713_send_fix&t=" + new Date().getTime();
    
    const sendPdfData = () => {
        if (!iframe.contentWindow) return;
        iframe.contentWindow.postMessage({
            type: "LOAD_PDF",
            base64: base64
        }, "*");
    };
    
    iframe.onload = () => {
        sendPdfData();
    };
    iframe.src = viewerUrl;
}

function openInNoteLab(filePath) {
    // Keep original source for patch/compare (HWP stays HWP even after PDF cache for viewer)
    currentOpenedSourcePath = filePath;
    currentOpenedDocPaths = [filePath];
    // Viewer path starts as source; may switch to cached PDF after parse
    currentOpenedDocPath = filePath;
    // 새 문서 열면 이전 노트 저장 경로는 유지하지 않음 (다른 작업으로 전환)
    currentNoteMdPath = "";
    const filename = filePath.split(/[\\/]/).pop();
    
    updateNoteLabTitleBar();
    
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
                    // PDF path is for viewer/crop only — do not overwrite source path
                    currentOpenedDocPath = res.pdf_path;
                    loadPdfInIframe(res.pdf_path);
                }
            } else {
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown(`# ${filename}\n\n# 파싱 실패\n` + (res ? res.markdown : ""));
                }
                if (res && res.pdf_path) {
                    currentOpenedDocPath = res.pdf_path;
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
function openMultipleInNoteLab(filePaths) {
    if (!filePaths || filePaths.length === 0) return;
    currentOpenedDocPaths = filePaths.slice();
    // Prefer first HWP/HWPX as patch source; multi-patch of merge is not supported
    currentOpenedSourcePath = filePaths.find(p => isHwpFamilyPath(p)) || filePaths[0] || "";
    
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
                // Viewer/crop uses merged PDF; source path stays original HWP for single-file patch
                currentOpenedDocPath = res.pdf_path || "";
                if (res.pdf_path) {
                    loadPdfInIframe(res.pdf_path);
                }
            } else {
                currentOpenedDocPath = "";
                if (notelabEditorInstance) {
                    notelabEditorInstance.setMarkdown(`# 문서 병합본\n\n# 병합 파싱 실패\n` + (res ? (res.error || res.markdown) : ""));
                }
                if (res && res.pdf_path) {
                    currentOpenedDocPath = res.pdf_path;
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

/**
 * PDF 뷰어/OCR 등에서 마크다운 에디터로 텍스트 삽입.
 * Toast UI insertText는 포커스·커서 없으면 2회차부터 무반응인 경우가 있어
 * 포커스 복구 + 길이 검증 후 setMarkdown 폴백을 사용한다.
 */
function insertMarkdownContent(markdown) {
    if (!notelabEditorInstance || markdown == null || markdown === "") return;

    const runInsert = () => {
        try {
            if (typeof notelabEditorInstance.focus === "function") {
                notelabEditorInstance.focus();
            }
        } catch (e) { /* ignore */ }

        if (notelabEditorInstance.isWysiwygMode()) {
            try {
                const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
                let match;
                let lastIdx = 0;
                let hasImage = false;

                while ((match = imageRegex.exec(markdown)) !== null) {
                    hasImage = true;
                    const textBefore = markdown.substring(lastIdx, match.index);
                    if (textBefore) {
                        const html = markdownToHtmlSimple(textBefore);
                        notelabEditorInstance.exec("insertHTML", html);
                    }

                    const altText = match[1] || "image";
                    const imageUrl = match[2];
                    notelabEditorInstance.exec("addImage", {
                        altText: altText,
                        imageUrl: imageUrl
                    });

                    lastIdx = imageRegex.lastIndex;
                }

                if (hasImage) {
                    const remainingText = markdown.substring(lastIdx);
                    if (remainingText) {
                        const html = markdownToHtmlSimple(remainingText);
                        notelabEditorInstance.exec("insertHTML", html);
                    }
                } else {
                    const html = markdownToHtmlSimple(markdown);
                    notelabEditorInstance.exec("insertHTML", html);
                }
            } catch (e) {
                // WYSIWYG 실패 시 마크다운 모드로 폴백 삽입
                forceAppendMarkdown(markdown);
            }
            return;
        }

        // Markdown 모드
        const before = notelabEditorInstance.getMarkdown() || "";
        let inserted = false;
        try {
            if (typeof notelabEditorInstance.insertText === "function") {
                notelabEditorInstance.insertText(markdown);
                const after = notelabEditorInstance.getMarkdown() || "";
                // 포커스 유실 시 insertText가 조용히 no-op → 길이 변화로 감지
                if (after.length > before.length) {
                    inserted = true;
                }
            }
        } catch (e) {
            inserted = false;
        }

        if (!inserted) {
            forceAppendMarkdown(markdown, before);
        }

        try {
            if (notelabEditorInstance.eventEmitter) {
                notelabEditorInstance.eventEmitter.emit("change");
            } else if (notelabEditorInstance.eventManager) {
                notelabEditorInstance.eventManager.emit("change");
            }
        } catch (e) { /* ignore */ }
    };

    // iframe 클릭 직후 포커스 쟁탈을 피하기 위해 한 틱 지연
    setTimeout(runInsert, 0);
}

function forceAppendMarkdown(markdown, beforeOpt) {
    if (!notelabEditorInstance) return;
    const before = beforeOpt != null ? beforeOpt : (notelabEditorInstance.getMarkdown() || "");
    const sep = !before ? "" : (before.endsWith("\n") ? "" : "\n");
    try {
        notelabEditorInstance.setMarkdown(before + sep + markdown, false);
    } catch (e) {
        try {
            notelabEditorInstance.setMarkdown(before + sep + markdown);
        } catch (e2) { /* ignore */ }
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

let splitterInitRetryCount = 0;
const NOTELAB_SPLITTER_MIN_PX = 80; // Allow narrow panes; fixed 200px blocked resize on small editor widths

function styleNoteLabSplitter(splitter) {
    // Override Toast UI's native absolute 1px decorative line into a draggable flex handle
    splitter.style.setProperty('display', 'block', 'important');
    splitter.style.setProperty('cursor', 'col-resize', 'important');
    splitter.style.setProperty('flex', '0 0 8px', 'important');
    splitter.style.setProperty('width', '8px', 'important');
    splitter.style.setProperty('min-width', '8px', 'important');
    splitter.style.setProperty('max-width', '8px', 'important');
    splitter.style.setProperty('align-self', 'stretch', 'important');
    splitter.style.setProperty('height', 'auto', 'important');
    splitter.style.setProperty('left', 'auto', 'important');
    splitter.style.setProperty('top', 'auto', 'important');
    splitter.style.setProperty('right', 'auto', 'important');
    splitter.style.setProperty('bottom', 'auto', 'important');
    splitter.style.setProperty('position', 'relative', 'important');
    splitter.style.setProperty('z-index', '100', 'important');
    splitter.style.setProperty('background', '#e8eaed', 'important');
    splitter.style.setProperty('border-left', '1px solid #dadce0', 'important');
    splitter.style.setProperty('border-right', '1px solid #dadce0', 'important');
    splitter.style.setProperty('box-sizing', 'border-box', 'important');
    splitter.style.setProperty('transition', 'background 0.15s, border-color 0.15s', 'important');
    splitter.style.setProperty('margin', '0', 'important');
    splitter.style.setProperty('padding', '0', 'important');
    splitter.title = '드래그하여 미리보기 크기 조절';
}

function initNoteLabSplitterResizer() {
    const editorWrapper = document.getElementById("notelab-editor");
    if (!editorWrapper || !editorWrapper.classList.contains("notelab-split-view")) return;
    
    const container = editorWrapper.querySelector('.toastui-editor-md-container');
    if (!container) {
        if (splitterInitRetryCount < 15) {
            splitterInitRetryCount++;
            setTimeout(initNoteLabSplitterResizer, 200);
        }
        return;
    }
    
    const { editorPane, previewPane } = getNoteLabSplitPanes(container);
    
    if (!editorPane || !previewPane) {
        if (splitterInitRetryCount < 15) {
            splitterInitRetryCount++;
            setTimeout(initNoteLabSplitterResizer, 200);
        }
        return;
    }
    
    // Ensure md-container lays out as a horizontal flex row
    container.style.setProperty('display', 'flex', 'important');
    container.style.setProperty('flex-direction', 'row', 'important');
    container.style.setProperty('align-items', 'stretch', 'important');
    container.style.setProperty('overflow', 'hidden', 'important');
    container.style.setProperty('position', 'relative', 'important');
    
    // Reuse Toast UI's native .toastui-editor-md-splitter (decorative line) as our drag handle
    let splitter = container.querySelector('.toastui-editor-md-splitter');
    if (!splitter) {
        splitter = document.createElement('div');
        splitter.className = 'toastui-editor-md-splitter';
        container.insertBefore(splitter, previewPane);
    } else if (splitter.nextElementSibling !== previewPane) {
        // Keep splitter between editor and preview in flex order
        container.insertBefore(splitter, previewPane);
    }
    
    splitterInitRetryCount = 0;
    styleNoteLabSplitter(splitter);
    applyNoteLabSplitPaneWidths();
    
    // Use property handlers to avoid stacking duplicate listeners on re-init
    splitter.onmouseenter = () => {
        splitter.style.setProperty('background', '#1a73e8', 'important');
        splitter.style.setProperty('border-left-color', '#1557b0', 'important');
        splitter.style.setProperty('border-right-color', '#1557b0', 'important');
    };
    splitter.onmouseleave = () => {
        if (!isNoteLabSplitterResizing) {
            styleNoteLabSplitter(splitter);
        }
    };
    
    splitter.onmousedown = (e) => {
        isNoteLabSplitterResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
        
        splitter.style.setProperty('background', '#1a73e8', 'important');
        
        // Prevent PDF iframe from eating mouse events during drag
        const iframe = document.getElementById("notelab-pdf-iframe");
        if (iframe) iframe.style.pointerEvents = "none";
    };
    
    // Document-level move/up: bind only once
    if (!isNoteLabSplitterListenersBound) {
        document.addEventListener('mousemove', (e) => {
            if (!isNoteLabSplitterResizing) return;
            
            const freshWrapper = document.getElementById("notelab-editor");
            if (!freshWrapper || !freshWrapper.classList.contains("notelab-split-view")) return;
            const freshContainer = freshWrapper.querySelector('.toastui-editor-md-container');
            if (!freshContainer) return;
            const { editorPane: freshEditorPane, previewPane: freshPreviewPane } = getNoteLabSplitPanes(freshContainer);
            if (!freshEditorPane || !freshPreviewPane) return;
            
            const containerRect = freshContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;
            if (containerWidth < NOTELAB_SPLITTER_MIN_PX * 2 + 8) return;
            
            let offsetLeft = e.clientX - containerRect.left;
            
            // Soft mins so narrow Note Lab editor panes can still be resized
            const minSide = Math.min(NOTELAB_SPLITTER_MIN_PX, Math.floor(containerWidth * 0.15));
            const minPx = Math.max(60, minSide);
            if (offsetLeft < minPx) offsetLeft = minPx;
            if (containerWidth - offsetLeft < minPx) offsetLeft = containerWidth - minPx;
            
            const editorPct = (offsetLeft / containerWidth) * 100;
            freshWrapper.dataset.lastEditorPct = String(editorPct);
            
            freshEditorPane.style.setProperty('width', `calc(${editorPct}% - 4px)`, 'important');
            freshEditorPane.style.setProperty('flex', 'none', 'important');
            freshEditorPane.style.setProperty('min-width', '0', 'important');
            
            freshPreviewPane.style.setProperty('width', `calc(${100 - editorPct}% - 4px)`, 'important');
            freshPreviewPane.style.setProperty('flex', 'none', 'important');
            freshPreviewPane.style.setProperty('min-width', '0', 'important');
        });
        
        document.addEventListener('mouseup', () => {
            if (!isNoteLabSplitterResizing) return;
            
            isNoteLabSplitterResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            const freshWrapper = document.getElementById("notelab-editor");
            if (freshWrapper) {
                const freshSplitter = freshWrapper.querySelector('.toastui-editor-md-splitter');
                if (freshSplitter) styleNoteLabSplitter(freshSplitter);
            }
            
            // Force Toast UI to reflow after drag
            if (notelabEditorInstance) {
                if (notelabEditorInstance.eventEmitter) {
                    notelabEditorInstance.eventEmitter.emit('resize');
                } else if (notelabEditorInstance.eventManager) {
                    notelabEditorInstance.eventManager.emit('resize');
                }
            }
            window.dispatchEvent(new Event('resize'));
            
            const iframe = document.getElementById("notelab-pdf-iframe");
            if (iframe) iframe.style.pointerEvents = "auto";
        });
        
        isNoteLabSplitterListenersBound = true;
    }
}

