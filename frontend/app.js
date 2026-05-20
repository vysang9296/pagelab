// -------------------------
// Global State
// -------------------------
let filesData = {}; // Original backend info
let pagePool = {};  // pageId -> { id, fileId, pageIndex, dataUrl, isBlank, rotation, excluded }
let sourceFiles = {}; // fileId -> [pageId, ...] (Order of unassigned pages)
let groups = { 'group_1': { name: '1페이지 그룹', pageIds: [] } };

let viewMode = 'source'; // 'source' or 'group'
let currentActiveId = null; // fileId or groupId

let sortableInstance = null;
let blankCounter = 0;

// Multi-select state
let lastClickedThumbId = null;
let selectedGroupIds = new Set(); // For right panel multi-select
let lastClickedGroupId = null;

// Context Menu
const contextMenu = document.getElementById('context-menu');
document.addEventListener('click', () => contextMenu.style.display = 'none');

// -------------------------
// Initialization
// -------------------------
window.addEventListener('pywebviewready', function() {
    pywebview.api.log("Frontend JS loaded successfully");
    setTimeout(() => {
        addGroup(); // Provide some default groups
        updateGroupSidebar();
    }, 500); // Delay DOM/Sortable initialization to prevent WebView2 Accessibility crash on Windows
});

function showLoading(text) { document.getElementById('loading-text').innerText = text; document.getElementById('loading-overlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }

// -------------------------
// 1. Upload & State
// -------------------------
async function uploadFiles() {
    try {
        showLoading("파일 처리 및 변환 중...");
        const newFiles = await pywebview.api.upload_files();
        hideLoading();

        if (newFiles && newFiles.length > 0) {
            processNewFiles(newFiles);
        }
    } catch (e) { hideLoading(); console.error(e); }
}

function processNewFiles(newFiles) {
    document.getElementById('file-list').innerHTML = '';
    newFiles.forEach(file => {
        const fileId = 'file_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        filesData[fileId] = file;
        sourceFiles[fileId] = [];

        file.thumbnails.forEach(thumb => {
            const pageId = `page_${fileId}_${thumb.page_index}`;
            pagePool[pageId] = {
                id: pageId, fileId: fileId, pageIndex: thumb.page_index,
                dataUrl: thumb.data_url, isBlank: false, rotation: 0, excluded: false,
                customName: null
            };
            sourceFiles[fileId].push(pageId);
        });
    });
    renderSidebar();
    if(!currentActiveId || viewMode !== 'source') selectSource(Object.keys(sourceFiles)[0]);
}

window.addEventListener('dragover', e => {
    e.preventDefault();
});

window.addEventListener('drop', async e => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        showLoading("파일 업로드 및 처리 중...");
        try {
            const files = Array.from(e.dataTransfer.files);
            const uploadPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const base64data = event.target.result.split(',')[1];
                        try {
                            const result = await pywebview.api.upload_dropped_file_bytes(file.name, base64data);
                            resolve(result);
                        } catch(err) { reject(err); }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });
            
            const resultsArrays = await Promise.all(uploadPromises);
            const newFiles = [];
            resultsArrays.forEach(arr => { if(arr && arr.length) newFiles.push(arr[0]); });
            
            if (newFiles.length > 0) processNewFiles(newFiles);
        } catch (err) {
            console.error(err);
            alert("드래그 앤 드롭 업로드 중 오류가 발생했습니다.\\n" + err);
        } finally {
            hideLoading();
        }
    }
});

// -------------------------
// 2. Sidebar Navigation
// -------------------------
function renderSidebar() {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    if (Object.keys(sourceFiles).length === 0) {
        list.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 20px;">파일을 업로드해주세요.</div>';
        return;
    }
    Object.keys(sourceFiles).forEach(fileId => {
        const item = document.createElement('div');
        item.className = 'file-item';
        if(viewMode === 'source' && currentActiveId === fileId) item.classList.add('active');
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.innerText = filesData[fileId].filename;
        nameSpan.title = filesData[fileId].filename;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'file-del-btn';
        delBtn.innerText = '✖';
        delBtn.title = '파일 제거';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSourceFile(fileId);
        };
        
        item.appendChild(nameSpan);
        item.appendChild(delBtn);
        
        item.onclick = () => selectSource(fileId);
        item.oncontextmenu = (e) => { e.preventDefault(); showSourceContextMenu(e, fileId); };
        
        list.appendChild(item);
    });
}

function deleteSourceFile(fileId) {
    if(!confirm("이 파일과 관련된 모든 페이지(분류 폴더에 담긴 페이지 포함)를 작업 공간에서 제거하시겠습니까?")) return;
    
    // 1. Remove from groups
    Object.keys(groups).forEach(gId => {
        groups[gId].pageIds = groups[gId].pageIds.filter(pId => pagePool[pId]?.fileId !== fileId);
    });
    
    // 2. Remove from pagePool
    if (sourceFiles[fileId]) {
        sourceFiles[fileId].forEach(pId => { delete pagePool[pId]; });
    }
    
    // 3. Remove from sourceFiles and filesData
    delete sourceFiles[fileId];
    delete filesData[fileId];
    
    // 4. Update active view if needed
    if (currentActiveId === fileId) {
        const remainingFiles = Object.keys(sourceFiles);
        if (remainingFiles.length > 0) {
            selectSource(remainingFiles[0]);
        } else {
            currentActiveId = null;
            document.getElementById('context-name').innerText = '대기 중';
        }
    }
    
    renderSidebar();
    updateGroupSidebar();
    renderCenterViewer();
}

function updateGroupSidebar() {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    
    Object.keys(groups).forEach(gId => {
        const folder = document.createElement('div');
        folder.className = 'group-folder';
        folder.dataset.gid = gId;
        
        if(viewMode === 'group' && currentActiveId === gId) folder.classList.add('active');
        if(selectedGroupIds.has(gId)) folder.classList.add('multi-selected');
        
        folder.onclick = (e) => handleGroupClick(e, gId);
        folder.oncontextmenu = (e) => { e.preventDefault(); showGroupContextMenu(e, gId); };
        
        // Drag over for copy-on-drag
        folder.ondragover = (e) => { e.preventDefault(); folder.classList.add('drag-over'); };
        folder.ondragleave = (e) => { folder.classList.remove('drag-over'); };
        folder.ondrop = (e) => { e.preventDefault(); folder.classList.remove('drag-over'); handleDropToGroup(gId); };

        const icon = document.createElement('span'); icon.className = 'folder-icon'; icon.innerText = '📁';
        const input = document.createElement('input'); input.type = 'text'; input.className = 'group-name-input';
        input.value = groups[gId].name;
        
        // Double click to edit name
        input.ondblclick = (e) => { e.stopPropagation(); input.classList.add('editing'); input.focus(); };
        input.onblur = () => { input.classList.remove('editing'); groups[gId].name = input.value; };
        input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
        
        const badge = document.createElement('span'); badge.className = 'badge'; badge.innerText = groups[gId].pageIds.length;
        
        folder.appendChild(icon); folder.appendChild(input); folder.appendChild(badge);
        container.appendChild(folder);
    });
}

function handleGroupClick(e, gId) {
    if(e.shiftKey && lastClickedGroupId) {
        const keys = Object.keys(groups);
        const start = keys.indexOf(lastClickedGroupId);
        const end = keys.indexOf(gId);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for(let i=min; i<=max; i++) selectedGroupIds.add(keys[i]);
    } else if (e.ctrlKey || e.metaKey) {
        if(selectedGroupIds.has(gId)) selectedGroupIds.delete(gId);
        else selectedGroupIds.add(gId);
    } else {
        selectedGroupIds.clear();
        selectedGroupIds.add(gId);
    }
    lastClickedGroupId = gId;
    viewMode = 'group';
    currentActiveId = gId;
    
    renderSidebar(); updateGroupSidebar();
    document.getElementById('context-name').innerText = `${groups[gId].name} (그룹)`;
    renderCenterViewer();
}

function selectSource(fileId) {
    viewMode = 'source'; currentActiveId = fileId;
    selectedGroupIds.clear(); lastClickedGroupId = null;
    renderSidebar(); updateGroupSidebar();
    document.getElementById('context-name').innerText = `${filesData[fileId].filename} (원본)`;
    renderCenterViewer();
}

function addGroup() {
    const gId = 'group_' + Date.now();
    groups[gId] = { name: `새 폴더 ${Object.keys(groups).length + 1}`, pageIds: [] };
    selectedGroupIds.clear(); selectedGroupIds.add(gId); lastClickedGroupId = gId;
    viewMode = 'group'; currentActiveId = gId;
    renderSidebar(); updateGroupSidebar();
    document.getElementById('context-name').innerText = `${groups[gId].name} (그룹)`;
    renderCenterViewer();
}

// -------------------------
// 3. Center Viewer & Multi-select
// -------------------------
function renderCenterViewer() {
    const viewer = document.getElementById('main-viewer');
    viewer.innerHTML = '';
    
    let activePageIds = [];
    if(viewMode === 'source' && currentActiveId) activePageIds = sourceFiles[currentActiveId];
    else if (viewMode === 'group' && currentActiveId) activePageIds = groups[currentActiveId].pageIds;
    
    if (activePageIds.length === 0) {
        viewer.innerHTML = `<div class="empty-state"><h2>비어 있습니다.</h2><p>${viewMode === 'group' ? '원본에서 페이지를 드래그해 담으세요.' : '문서가 없습니다.'}</p></div>`;
    } else {
        activePageIds.forEach((pId, idx) => {
            viewer.appendChild(createPageCard(pagePool[pId], idx, activePageIds));
        });
    }
    initSortable();
}

function createPageCard(pageData, index, currentList) {
    const card = document.createElement('div');
    card.className = 'page-card';
    if(pageData.excluded) card.classList.add('excluded');
    card.id = `dom_${pageData.id}_${index}`; // unique ID for DOM
    card.dataset.pid = pageData.id;
    card.draggable = true;

    // Drag Start
    card.ondragstart = (e) => {
        if(!card.classList.contains('selected')) {
            document.querySelectorAll('.page-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        }
        e.dataTransfer.setData('text/plain', 'pages'); 
    };

    const imgCont = document.createElement('div'); imgCont.className = 'page-image-container';
    const img = document.createElement('img'); img.className = 'page-image';
    img.src = pageData.dataUrl; img.style.transform = `rotate(${pageData.rotation}deg)`;
    img.ondblclick = () => openZoom(pageData.dataUrl);
    imgCont.appendChild(img); card.appendChild(imgCont);

    // Dynamic Labels
    const label = document.createElement('div'); label.className = 'page-meta';
    if (pageData.isBlank) {
        label.innerText = pageData.customName ? `${pageData.customName} (간지)` : "빈 페이지 (간지)"; 
        label.style.color = "var(--primary-blue)";
    } else {
        const baseName = viewMode === 'group' ? `p.${pageData.pageIndex + 1} (${filesData[pageData.fileId].filename})` : `p.${pageData.pageIndex + 1}`;
        label.innerText = pageData.customName ? `${pageData.customName} (${baseName})` : baseName;
    }
    card.appendChild(label);

    // Context Menu for Page Rename
    card.oncontextmenu = (e) => { 
        e.preventDefault(); 
        e.stopPropagation();
        
        // If it's not selected, make it the only selection before showing menu
        if(!card.classList.contains('selected')) {
            document.querySelectorAll('.page-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        }
        showPageContextMenu(e, pageData.id); 
    };

    // Overlays
    const overlay = document.createElement('div'); overlay.className = 'card-overlay';
    const rotBtn = document.createElement('button'); rotBtn.className = 'icon-btn'; rotBtn.innerText = '↻';
    rotBtn.onclick = (e) => { e.stopPropagation(); rotatePage(pageData.id); };
    
    const delBtn = document.createElement('button'); delBtn.className = 'icon-btn delete-btn';
    delBtn.innerText = '✖';
    delBtn.onclick = (e) => { e.stopPropagation(); deletePage(pageData.id, index); };

    overlay.appendChild(rotBtn); overlay.appendChild(delBtn); card.appendChild(overlay);

    // Shift/Ctrl Select Logic
    card.onclick = (e) => handleThumbClick(e, card, index, currentList);

    return card;
}

function handleThumbClick(e, card, index, currentList) {
    if(e.shiftKey && lastClickedThumbId) {
        const lastIdx = currentList.findIndex(id => id === lastClickedThumbId);
        if(lastIdx !== -1) {
            const min = Math.min(lastIdx, index);
            const max = Math.max(lastIdx, index);
            document.querySelectorAll('.page-card').forEach((c, i) => {
                if(i >= min && i <= max) c.classList.add('selected');
            });
        }
    } else if (e.ctrlKey || e.metaKey) {
        card.classList.toggle('selected');
    } else {
        document.querySelectorAll('.page-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
    }
    lastClickedThumbId = card.dataset.pid;
}

// -------------------------
// 4. Actions (Drag, Delete, Rotate)
// -------------------------
function initSortable() {
    if(sortableInstance) sortableInstance.destroy();
    const viewer = document.getElementById('main-viewer');
    sortableInstance = new Sortable(viewer, {
        animation: 150, ghostClass: 'sortable-ghost',
        onEnd: function () {
            const newOrder = Array.from(viewer.querySelectorAll('.page-card')).map(el => el.dataset.pid);
            if(viewMode === 'source') sourceFiles[currentActiveId] = newOrder;
            else groups[currentActiveId].pageIds = newOrder;
        }
    });
}

function handleDropToGroup(targetGroupId) {
    const selectedCards = document.querySelectorAll('.page-card.selected');
    if(selectedCards.length === 0) return;
    
    const pIdsToAdd = Array.from(selectedCards).map(c => c.dataset.pid);
    
    // Copy-on-drag: We DO NOT remove from source.
    // If we are dragging from another group, we DO remove from source group.
    if (viewMode === 'group' && currentActiveId !== targetGroupId) {
        groups[currentActiveId].pageIds = groups[currentActiveId].pageIds.filter(id => !pIdsToAdd.includes(id));
    }
    
    // Add to target group (allow duplicates if desired, but here we just append)
    groups[targetGroupId].pageIds.push(...pIdsToAdd);
    
    updateGroupSidebar();
    renderCenterViewer();
}

function rotatePage(pId) {
    pagePool[pId].rotation = (pagePool[pId].rotation + 90) % 360;
    renderCenterViewer();
}
function rotateSelected() {
    const selectedIds = Array.from(document.querySelectorAll('.page-card.selected')).map(c => c.dataset.pid);
    if(selectedIds.length === 0) return;
    
    selectedIds.forEach(id => {
        pagePool[id].rotation = (pagePool[id].rotation + 90) % 360;
    });
    renderCenterViewer();
    
    // Restore selection
    selectedIds.forEach(id => {
        const card = document.querySelector(`.page-card[data-pid="${id}"]`);
        if(card) card.classList.add('selected');
    });
}

function deletePage(pId, index) {
    if(viewMode === 'source') {
        pagePool[pId].excluded = !pagePool[pId].excluded;
    } else {
        // Group mode: Remove completely
        groups[currentActiveId].pageIds.splice(index, 1);
        updateGroupSidebar();
    }
    renderCenterViewer();
}
function deleteSelected() {
    const selected = document.querySelectorAll('.page-card.selected');
    if(selected.length === 0) return;
    
    if(viewMode === 'source') {
        selected.forEach(c => { pagePool[c.dataset.pid].excluded = !pagePool[c.dataset.pid].excluded; });
    } else {
        const idsToRemove = Array.from(selected).map(c => c.dataset.pid);
        groups[currentActiveId].pageIds = groups[currentActiveId].pageIds.filter(id => !idsToRemove.includes(id));
        updateGroupSidebar();
    }
    renderCenterViewer();
}

function addBlankPage() {
    const pId = `blank_${blankCounter++}`;
    const blankImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
    pagePool[pId] = { id: pId, isBlank: true, dataUrl: blankImg, rotation: 0, excluded: false, customName: null };
    
    if(viewMode === 'source' && currentActiveId) sourceFiles[currentActiveId].unshift(pId);
    else if (viewMode === 'group' && currentActiveId) groups[currentActiveId].pageIds.unshift(pId);
    renderCenterViewer();
}

function resetWorkspace() {
    if(!confirm("모든 업로드된 파일과 편집 내용을 초기화하시겠습니까?")) return;
    
    filesData = {};
    pagePool = {};
    sourceFiles = {};
    groups = { 'group_1': { name: '1페이지 그룹', pageIds: [] } };
    
    viewMode = 'source';
    currentActiveId = null;
    selectedGroupIds.clear();
    lastClickedGroupId = null;
    lastClickedThumbId = null;
    
    document.getElementById('context-name').innerText = '대기 중';
    renderSidebar();
    updateGroupSidebar();
    renderCenterViewer();
}
function openZoom(src) { document.getElementById('zoom-img').src = src; document.getElementById('zoom-modal').style.display = 'block'; }

// -------------------------
// 5. Context Menus & Export Logic
// -------------------------
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag] || tag));
}

function showMenu(e, htmlItems) {
    contextMenu.innerHTML = htmlItems;
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
}

function showSourceContextMenu(e, fileId) {
    if(viewMode !== 'source' || currentActiveId !== fileId) selectSource(fileId);
    const fname = escapeHTML(filesData[fileId].filename);
    
    const html = `
        <div class="context-menu-item" style="font-weight:bold; color:#888; cursor:default;">${fname}</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="exportSourceOriginal('${fileId}')">📥 원본 다운로드</div>
        <div class="context-menu-item" onclick="exportSourceEdited('${fileId}')">✂️ 편집본 다운로드</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="deleteSourceFile('${fileId}')" style="color:var(--danger-red);">🗑️ 파일 목록에서 제거</div>
    `;
    showMenu(e, html);
}

function showGroupContextMenu(e, groupId) {
    if(!selectedGroupIds.has(groupId)) handleGroupClick(e, groupId);
    
    const isMulti = selectedGroupIds.size > 1;
    let html = '';
    
    if(!isMulti) {
        const safeName = escapeHTML(groups[groupId].name);
        html = `
            <div class="context-menu-item" style="font-weight:bold; color:#888; cursor:default;">${safeName}</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" onclick="renameGroup('${groupId}')">✏️ 폴더 이름 변경</div>
            <div class="context-menu-item" onclick="exportGroupMerge()">🗂️ 통합 다운로드 (PDF)</div>
            <div class="context-menu-item" onclick="exportGroupSeparate()">📑 파일별 다운로드 (ZIP)</div>
        `;
    } else {
        html = `
            <div class="context-menu-item" style="font-weight:bold; color:#888; cursor:default;">${selectedGroupIds.size}개 폴더 선택됨</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" onclick="exportMultiMerge()">🗂️ 다중 통합 다운로드 (통합PDF 모음 ZIP)</div>
            <div class="context-menu-item" onclick="exportMultiSeparate()">📑 다중 파일별 다운로드 (이중 ZIP)</div>
        `;
    }
    showMenu(e, html);
}

function renameGroup(gId) {
    const folder = document.querySelector(`.group-folder[data-gid="${gId}"]`);
    if(folder) {
        const input = folder.querySelector('.group-name-input');
        input.classList.add('editing');
        input.focus();
        input.select();
    }
}

function showPageContextMenu(e, pId) {
    const html = `
        <div class="context-menu-item" onclick="renamePage('${pId}')">✏️ 페이지 이름 지정</div>
    `;
    showMenu(e, html);
}

function renamePage(pId) {
    const currentName = pagePool[pId].customName || '';
    const newName = prompt("이 페이지의 이름을 지정하세요 (내보낼 파일명이 됩니다):", currentName);
    if(newName !== null) {
        pagePool[pId].customName = newName.trim();
        renderCenterViewer();
    }
}

// ---- Dropped files logic is now handled in window drop event above ----

// ---- Export API Wrappers ----
function getGroupPayload(gId) {
    const pages = groups[gId].pageIds.map(pId => pagePool[pId]).filter(p => !p.excluded);
    if(pages.length === 0) return null;
    return {
        group_name: groups[gId].name,
        pages: pages.map(p => ({
            is_blank: p.isBlank, file_path: p.isBlank ? null : filesData[p.fileId].pdf_path,
            page_index: p.pageIndex, rotation: p.rotation, customName: p.customName
        }))
    };
}

async function exportSourceOriginal(fileId) {
    const defaultName = `원본_${filesData[fileId].filename}`;
    const savePath = await pywebview.api.choose_save_path(defaultName);
    if(savePath) {
        showLoading("저장 중...");
        await pywebview.api.export_original(filesData[fileId].original_path, savePath);
        hideLoading();
    }
}

async function exportSourceEdited(fileId) {
    const defaultName = `편집_${filesData[fileId].filename.replace(/\.[^/.]+$/, "")}.pdf`;
    const savePath = await pywebview.api.choose_save_path(defaultName);
    if(savePath) {
        const pages = sourceFiles[fileId].map(pId => pagePool[pId]).filter(p => !p.excluded);
        if(pages.length === 0) { alert("제외되지 않은 페이지가 없습니다."); return; }
        
        const payload = {
            group_name: "Edited",
            pages: pages.map(p => ({
                is_blank: p.isBlank, file_path: p.isBlank ? null : filesData[p.fileId].pdf_path,
                page_index: p.pageIndex, rotation: p.rotation
            }))
        };
        showLoading("편집본 PDF 생성 중...");
        await pywebview.api.export_data('single_pdf', savePath, payload);
        hideLoading();
    }
}

// Single Group
async function exportGroupMerge() {
    const gId = Array.from(selectedGroupIds)[0];
    const payload = getGroupPayload(gId);
    if(!payload) { alert("내보낼 페이지가 없습니다."); return; }
    
    const savePath = await pywebview.api.choose_save_path(`${groups[gId].name}.pdf`);
    if(savePath) {
        showLoading("PDF 생성 중...");
        await pywebview.api.export_data('single_pdf', savePath, payload);
        hideLoading();
    }
}

async function exportGroupSeparate() {
    const gId = Array.from(selectedGroupIds)[0];
    const payload = getGroupPayload(gId);
    if(!payload) { alert("내보낼 페이지가 없습니다."); return; }
    
    const savePath = await pywebview.api.choose_save_path(`${groups[gId].name}.zip`);
    if(savePath) {
        // payload is one group. We want each page as a separate PDF.
        const zipItems = payload.pages.map((p, idx) => ({
            type: 'pdf',
            data: { group_name: p.customName || `${idx+1}_page`, pages: [p] }
        }));
        showLoading("ZIP 생성 중...");
        await pywebview.api.export_data('single_zip', savePath, zipItems);
        hideLoading();
    }
}

// Multi Group
async function exportMultiMerge() {
    const savePath = await pywebview.api.choose_save_path(`분류폴더_통합.zip`);
    if(savePath) {
        const zipItems = [];
        selectedGroupIds.forEach(gId => {
            const p = getGroupPayload(gId);
            if(p) zipItems.push({ type: 'pdf', data: p });
        });
        if(zipItems.length === 0) { alert("내보낼 페이지가 없습니다."); return; }
        
        showLoading("다중 PDF 및 ZIP 생성 중...");
        await pywebview.api.export_data('single_zip', savePath, zipItems);
        hideLoading();
    }
}

async function exportMultiSeparate() {
    const savePath = await pywebview.api.choose_save_path(`분류폴더_개별.zip`);
    if(savePath) {
        const zipItems = [];
        selectedGroupIds.forEach(gId => {
            const p = getGroupPayload(gId);
            if(p) {
                // p is a group. We make a sub-zip item
                const subPdfs = p.pages.map((page, idx) => ({
                    group_name: page.customName || `${idx+1}_page`, pages: [page]
                }));
                zipItems.push({ type: 'zip', name: groups[gId].name, data: subPdfs });
            }
        });
        if(zipItems.length === 0) { alert("내보낼 페이지가 없습니다."); return; }
        
        showLoading("이중 ZIP 압축 중...");
        await pywebview.api.export_data('single_zip', savePath, zipItems);
        hideLoading();
    }
}
