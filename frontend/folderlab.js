// folderlab.js
// Frontend logic for FolderLab 3-Pane Masterpiece Workspace

let flLocalTreeData = [];
let flStagingFolders = [
    { id: 'sfolder_1', name: '스테이징 폴더 1', isDir: true, children: [] }
];
let flActiveStagingFolderId = 'sfolder_1';

let flRightMode = 'staging'; // 'staging' or 'real'
let flRealRootPath = null;
let flRealTreeData = [];
let flLastCheckedIndex = null;

let flSelectedPreviewDoc = null;
let flSearchTimeout = null;
let flCurrentLocalRoot = null;
let flContextMenuTarget = null; // { path, type }

// Initialize FolderLab workspace
function flInit() {
    console.log("FolderLab Initializing 3-Pane Masterpiece...");
    
    // Setup Search Input Debounce (300ms)
    const searchInput = document.getElementById('fl-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (flSearchTimeout) clearTimeout(flSearchTimeout);
            flSearchTimeout = setTimeout(() => {
                flSearchDocuments();
            }, 300);
        });
    }

    flRenderVirtualTree();
    flInitSplitter();

    if (window.pywebview && window.pywebview.api) {
        flLoadLocalTree();
    } else {
        window.addEventListener('pywebviewready', () => {
            flLoadLocalTree();
        });
    }

    // Close context menu on click outside
    document.addEventListener('click', () => {
        const menu = document.getElementById('fl-context-menu');
        if (menu) menu.style.display = 'none';
    });
}

// 1. Local Explorer Tree
async function flLoadLocalTree(rootPath = null) {
    const treeContainer = document.getElementById('fl-local-tree');
    treeContainer.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 20px;"><div class="spinner" style="margin: 0 auto 12px;"></div>로컬 디렉토리 비동기 탐색 중... (UI 멈춤 없음)</div>';
    
    try {
        if (pywebview && pywebview.api && pywebview.api.get_local_tree) {
            const res = await pywebview.api.get_local_tree(rootPath);
            if (res.status === 'success') {
                flRenderLocalTreeAsync(res.root_path, res.tree);
            } else {
                throw new Error("Local tree scan failed or returned error.");
            }
        }
    } catch (e) {
        console.error("Local Tree Load Error:", e);
        treeContainer.innerHTML = `<div style="color: var(--danger-red); font-size: 13px; text-align: center; margin-top: 20px;">로컬 디렉토리 로드 실패: ${e}</div>`;
    }
}

function flRenderLocalTreeAsync(rootPath, treeData) {
    flCurrentLocalRoot = rootPath;
    flLocalTreeData = treeData;
    const rootLabel = document.getElementById('fl-local-root-label');
    if(rootLabel) rootLabel.innerText = flCurrentLocalRoot;
    flRenderLocalTree(flLocalTreeData);
}

async function flChangeLocalRoot() {
    if (!pywebview || !pywebview.api || !pywebview.api.choose_dir) return;
    const selectedDir = await pywebview.api.choose_dir();
    if (selectedDir) {
        flLoadLocalTree(selectedDir);
    }
}

function flRenderLocalTree(treeData) {
    const container = document.getElementById('fl-local-tree');
    container.innerHTML = '';
    
    if (!treeData || treeData.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 20px;">탐색된 파일/폴더가 없습니다.</div>';
        return;
    }

    treeData.forEach(node => {
        container.appendChild(flCreateTreeNode(node, 0, 'local'));
    });
}

// Symmetrical Tree Node Creator (Used for Local & Real Staging Trees)
function flCreateTreeNode(node, depth, treeType = 'local') {
    const wrapper = document.createElement('div');
    wrapper.className = 'fl-node-wrapper';

    const item = document.createElement('div');
    item.className = 'fl-tree-item';
    item.style.paddingLeft = `${depth * 16 + 8}px`;
    item.draggable = true;
    item.dataset.path = node.path;
    item.dataset.name = node.name;
    item.dataset.isdir = node.isDir;
    item.dataset.treetype = treeType;

    // Checkbox for Multi-select with Shift-Click & Cascading logic
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'fl-tree-checkbox';
    chk.onclick = (e) => {
        e.stopPropagation();

        const allChks = Array.from(document.querySelectorAll(`.fl-${treeType}-tree .fl-tree-checkbox`));
        const currentIndex = allChks.indexOf(chk);

        if (e.shiftKey && flLastCheckedIndex !== null && flLastCheckedIndex !== currentIndex) {
            const start = Math.min(flLastCheckedIndex, currentIndex);
            const end = Math.max(flLastCheckedIndex, currentIndex);
            const targetState = chk.checked;
            for (let i = start; i <= end; i++) {
                allChks[i].checked = targetState;
            }
        }
        flLastCheckedIndex = currentIndex;

        if (node.isDir && !e.shiftKey) {
            const childChks = wrapper.querySelectorAll('.fl-tree-children .fl-tree-checkbox');
            childChks.forEach(c => c.checked = chk.checked);
        }
        if(treeType === 'staging') flCheckMultiDelState();
    };

    // Toggle Button for Directories
    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'fl-toggle-btn';
    toggleBtn.style.width = '14px'; toggleBtn.style.display = 'inline-block'; toggleBtn.style.cursor = 'pointer';
    toggleBtn.innerText = node.isDir ? '▶' : '';
    toggleBtn.style.color = 'var(--text-secondary)'; toggleBtn.style.fontSize = '10px';

    const icon = document.createElement('span');
    icon.className = 'fl-item-icon';
    icon.innerText = node.isDir ? '📁' : '📄';

    const name = document.createElement('span');
    name.className = 'fl-item-name';
    name.innerText = node.name;
    name.title = node.path;

    // Metadata Columns (Size & Modified Date)
    const meta = document.createElement('span');
    meta.className = 'fl-item-meta';
    const sizeSpan = document.createElement('span'); sizeSpan.className = 'fl-item-size'; sizeSpan.innerText = node.size || '';
    const mtimeSpan = document.createElement('span'); mtimeSpan.className = 'fl-item-mtime'; mtimeSpan.innerText = node.mtime || '';
    meta.appendChild(sizeSpan); meta.appendChild(mtimeSpan);

    item.appendChild(chk);
    item.appendChild(toggleBtn);
    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(meta);
    wrapper.appendChild(item);

    const childContainer = document.createElement('div');
    childContainer.className = 'fl-tree-children';
    childContainer.style.display = 'none';
    wrapper.appendChild(childContainer);

    // Directory Toggle Logic (Lazy Loading)
    if (node.isDir) {
        let isExpanded = false;
        let isLoaded = false;

        const toggleFunc = async (e) => {
            e.stopPropagation();
            if (!isExpanded) {
                toggleBtn.innerText = '▼'; icon.innerText = '📂';
                childContainer.style.display = 'block';
                isExpanded = true;

                if (!isLoaded) {
                    childContainer.innerHTML = `<div style="padding-left:${(depth+1)*16+8}px; color:var(--text-secondary); font-size:11px;">로딩 중...</div>`;
                    try {
                        if (pywebview && pywebview.api && pywebview.api.get_local_tree) {
                            const res = await pywebview.api.get_local_tree(node.path);
                            childContainer.innerHTML = '';
                            if (res.tree && res.tree.length > 0) {
                                res.tree.forEach(childNode => {
                                    childContainer.appendChild(flCreateTreeNode(childNode, depth + 1, treeType));
                                });
                            } else {
                                childContainer.innerHTML = `<div style="padding-left:${(depth+1)*16+8}px; color:var(--text-secondary); font-size:11px;">(비어 있음)</div>`;
                            }
                            isLoaded = true;
                        }
                    } catch (err) { childContainer.innerHTML = `<div style="padding-left:${(depth+1)*16+8}px; color:var(--danger-red); font-size:11px;">로드 실패</div>`; }
                }
            } else {
                toggleBtn.innerText = '▶'; icon.innerText = '📁';
                childContainer.style.display = 'none';
                isExpanded = false;
            }
        };
        toggleBtn.onclick = toggleFunc;
        icon.onclick = toggleFunc;
    }

    // Drag & Click Selection
    item.ondragstart = (e) => {
        if (chk.checked) {
            const checkedItems = document.querySelectorAll(`.fl-${treeType}-tree .fl-tree-checkbox:checked`);
            const dataArr = Array.from(checkedItems).map(c => {
                const iEl = c.closest('.fl-tree-item');
                return {
                    type: treeType === 'local' ? 'local_file' : 'real_file',
                    path: iEl.dataset.path, name: iEl.dataset.name, isDir: iEl.dataset.isdir === 'true',
                    source_tree: treeType
                };
            });
            e.dataTransfer.setData('text/plain', JSON.stringify(dataArr));
        } else {
            e.dataTransfer.setData('text/plain', JSON.stringify([{
                type: treeType === 'local' ? 'local_file' : 'real_file',
                path: node.path, name: node.name, isDir: node.isDir,
                source_tree: treeType
            }]));
        }
    };
    
    if (treeType === 'real' && node.isDir) {
        item.ondragover = (e) => { e.preventDefault(); item.style.backgroundColor = '#e8f0fe'; };
        item.ondragleave = (e) => { item.style.backgroundColor = ''; };
        item.ondrop = (e) => { 
            e.preventDefault(); e.stopPropagation(); item.style.backgroundColor = ''; 
            flHandleDropToReal(node.path, e.dataTransfer); 
        };
        childContainer.ondragover = (e) => { e.preventDefault(); item.style.backgroundColor = '#e8f0fe'; };
        childContainer.ondragleave = (e) => { item.style.backgroundColor = ''; };
        childContainer.ondrop = (e) => { 
            e.preventDefault(); e.stopPropagation(); item.style.backgroundColor = ''; 
            flHandleDropToReal(node.path, e.dataTransfer); 
        };
    }

    item.onclick = (e) => {
        e.stopPropagation();
        chk.checked = !chk.checked; // Clicking row toggles checkbox
        document.querySelectorAll(`.fl-${treeType}-tree .fl-tree-item`).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
    };

    item.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        flShowContextMenu(e, node.path, node.isDir === true || node.isDir === 'true');
    };

    return wrapper;
}


// 2. Checkbox & Multi-Transfer Action Bar Management
function flToggleAllCheckboxes(treeType, checkState) {
    let targetType = treeType;
    if (treeType === 'right') {
        targetType = flRightMode; // 'staging' or 'real'
    }
    const chks = document.querySelectorAll(`.fl-${targetType}-tree .fl-tree-checkbox`);
    chks.forEach(chk => chk.checked = checkState);
    if(targetType === 'staging') flCheckMultiDelState();
}

function flCheckMultiDelState() {
    const targetType = flRightMode; // 'staging' or 'real'
    const checked = document.querySelectorAll(`.fl-${targetType}-tree .fl-tree-checkbox:checked`);
    const delBtn = document.getElementById('fl-multi-del-btn');
    if(delBtn) delBtn.style.display = checked.length > 0 ? 'inline-block' : 'none';
}
document.addEventListener('change', (e) => { if(e.target.classList.contains('fl-tree-checkbox')) flCheckMultiDelState(); });

function flSwitchRightMode(mode) {
    flRightMode = mode;
    const tabStaging = document.getElementById('fl-tab-staging'); const tabReal = document.getElementById('fl-tab-real');
    const actionsStaging = document.getElementById('fl-staging-actions'); const actionsReal = document.getElementById('fl-real-actions');
    const treeStaging = document.getElementById('fl-staging-tree'); const treeReal = document.getElementById('fl-real-tree');

    if (mode === 'staging') {
        tabStaging.className = 'fl-mode-btn active'; tabStaging.style.background = '#fff'; tabStaging.style.color = 'var(--primary-blue)'; tabStaging.style.boxShadow = 'var(--shadow-sm)';
        tabReal.className = 'fl-mode-btn'; tabReal.style.background = 'transparent'; tabReal.style.color = 'var(--text-secondary)'; tabReal.style.boxShadow = 'none';
        actionsStaging.style.display = 'flex'; actionsReal.style.display = 'none';
        treeStaging.style.display = 'block'; treeReal.style.display = 'none';
    } else if (mode === 'real') {
        tabReal.className = 'fl-mode-btn active'; tabReal.style.background = '#fff'; tabReal.style.color = 'var(--primary-blue)'; tabReal.style.boxShadow = 'var(--shadow-sm)';
        tabStaging.className = 'fl-mode-btn'; tabStaging.style.background = 'transparent'; tabStaging.style.color = 'var(--text-secondary)'; tabStaging.style.boxShadow = 'none';
        actionsStaging.style.display = 'none'; actionsReal.style.display = 'flex';
        treeStaging.style.display = 'none'; treeReal.style.display = 'block';
        if (flRealRootPath) flLoadRealTree(flRealRootPath);
    }
    flCheckMultiDelState();
}

async function flTransferSelected(direction) {
    let sourceTree = direction === 'local_to_right' ? 'local' : flRightMode;
    let checkedItems = document.querySelectorAll(`.fl-${sourceTree}-tree .fl-tree-checkbox:checked`);
    
    if (checkedItems.length === 0) { alert("전송할 항목을 체크박스로 선택해주세요."); return; }

    if (direction === 'local_to_right') {
        if (flRightMode === 'staging') {
            const targetFolder = flStagingFolders.find(f => f.id === flActiveStagingFolderId);
            if (!targetFolder) { alert("스테이징 폴더를 선택해주세요."); return; }
            
            showLoading("항목 전송 및 하위 구조 스캔 중...");
            for (const chk of checkedItems) {
                const itemEl = chk.closest('.fl-tree-item');
                await flAddDataToStaging(targetFolder.id, {
                    path: itemEl.dataset.path, name: itemEl.dataset.name, isDir: itemEl.dataset.isdir === 'true'
                });
            }
            hideLoading();
            flRenderStagingTree();
            flToggleAllCheckboxes('local', false);
        } else if (flRightMode === 'real') {
            if (!flRealRootPath) { alert("먼저 실제 로컬 폴더를 열어주세요."); return; }
            const transferItems = Array.from(checkedItems).map(chk => {
                const itemEl = chk.closest('.fl-tree-item');
                return {
                    path: itemEl.dataset.path,
                    isDir: itemEl.dataset.isdir === 'true'
                };
            });
            flExecuteRealTransfer(transferItems, flRealRootPath);
        }
    } else if (direction === 'right_to_local') {
        alert("탐색기 간 복사는 로컬->오른쪽 방향만 현재 지원됩니다.");
    }
}

// 3. Unified Staging Tree (Recursive Nested Tree)
function flRenderStagingTree() {
    const container = document.getElementById('fl-staging-tree');
    container.innerHTML = '';

    if (!flStagingFolders || flStagingFolders.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="position:static; transform:none; margin-top:40px;">
                <h2>스테이징 폴더 구성</h2>
                <p>좌측 탐색기나 하단 검색 결과를 드래그 앤 드롭하여 문서를 모으고 구조화하세요.<br>이후 <b>[ZIP 내보내기]</b> 또는 <b>[로컬 동기화]</b>를 실행할 수 있습니다.</p>
            </div>`;
        return;
    }

    flStagingFolders.forEach(node => {
        container.appendChild(flCreateStagingTreeNode(node, 0, null));
    });
}

function flCreateStagingTreeNode(node, depth, parentNode = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'fl-node-wrapper';
    wrapper.dataset.id = node.id;

    const item = document.createElement('div');
    item.className = 'fl-tree-item';
    if (node.id === flActiveStagingFolderId && node.isDir) {
        item.classList.add('active');
    }
    item.style.paddingLeft = `${depth * 16 + 8}px`;
    item.draggable = true;
    item.dataset.id = node.id;
    item.dataset.name = node.name;
    item.dataset.isdir = node.isDir;
    item.dataset.treetype = 'staging';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'fl-tree-checkbox';
    chk.onclick = (e) => {
        e.stopPropagation();
        if (node.isDir) {
            const childChks = wrapper.querySelectorAll('.fl-tree-children .fl-tree-checkbox');
            childChks.forEach(c => c.checked = chk.checked);
        }
        flCheckMultiDelState();
    };

    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'fl-toggle-btn';
    toggleBtn.style.width = '14px'; toggleBtn.style.display = 'inline-block'; toggleBtn.style.cursor = 'pointer';
    toggleBtn.innerText = node.isDir ? '▼' : '';
    toggleBtn.style.color = 'var(--text-secondary)'; toggleBtn.style.fontSize = '10px';

    const icon = document.createElement('span');
    icon.className = 'fl-item-icon';
    icon.innerText = node.isDir ? '📂' : '📄';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'fl-item-name';
    
    if (node.isDir) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'group-name-input';
        input.value = node.name;
        input.style.border = 'none';
        input.style.background = 'transparent';
        input.style.fontWeight = 'bold';
        input.style.width = '150px';
        input.ondblclick = (e) => { e.stopPropagation(); input.classList.add('editing'); input.focus(); };
        input.onblur = () => { input.classList.remove('editing'); node.name = input.value; };
        input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
        
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.innerText = '✏️';
        editBtn.title = '이름 변경';
        editBtn.style.border = 'none';
        editBtn.style.background = 'transparent';
        editBtn.style.cursor = 'pointer';
        editBtn.style.marginLeft = '4px';
        editBtn.onclick = (e) => { e.stopPropagation(); input.classList.add('editing'); input.focus(); };

        nameSpan.appendChild(input);
        nameSpan.appendChild(editBtn);
    } else {
        nameSpan.innerText = node.name;
        nameSpan.title = node.path;
    }

    const meta = document.createElement('span');
    meta.className = 'fl-item-meta';
    
    if (node.isDir) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.innerText = node.children ? node.children.length : 0;
        badge.style.background = 'var(--primary-blue)';
        badge.style.color = '#fff';
        badge.style.padding = '1px 6px';
        badge.style.borderRadius = '10px';
        badge.style.fontSize = '10px';
        badge.style.marginLeft = '8px';
        meta.appendChild(badge);
    } else {
        const sizeSpan = document.createElement('span'); 
        sizeSpan.className = 'fl-item-size'; 
        sizeSpan.innerText = node.size || '';
        meta.appendChild(sizeSpan);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'file-del-btn';
    delBtn.innerText = '✖';
    delBtn.style.border = 'none';
    delBtn.style.background = 'transparent';
    delBtn.style.cursor = 'pointer';
    delBtn.style.color = 'var(--danger-red)';
    delBtn.style.marginLeft = 'auto';
    delBtn.style.fontWeight = 'bold';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        flRemoveNodeFromStaging(node.id);
    };

    item.appendChild(chk);
    item.appendChild(toggleBtn);
    item.appendChild(icon);
    item.appendChild(nameSpan);
    item.appendChild(meta);
    item.appendChild(delBtn);
    wrapper.appendChild(item);

    const childContainer = document.createElement('div');
    childContainer.className = 'fl-tree-children';
    childContainer.style.display = 'block';
    wrapper.appendChild(childContainer);

    if (node.isDir) {
        let isExpanded = true;
        
        const toggleFunc = (e) => {
            e.stopPropagation();
            if (!isExpanded) {
                toggleBtn.innerText = '▼'; 
                icon.innerText = '📂';
                childContainer.style.display = 'block';
                isExpanded = true;
            } else {
                toggleBtn.innerText = '▶'; 
                icon.innerText = '📁';
                childContainer.style.display = 'none';
                isExpanded = false;
            }
        };
        toggleBtn.onclick = toggleFunc;
        icon.onclick = toggleFunc;

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                childContainer.appendChild(flCreateStagingTreeNode(child, depth + 1, node));
            });
        } else {
            const emptyEl = document.createElement('div');
            emptyEl.style.paddingLeft = `${(depth + 1) * 16 + 8}px`;
            emptyEl.style.color = 'var(--text-secondary)';
            emptyEl.style.fontSize = '11px';
            emptyEl.style.fontStyle = 'italic';
            emptyEl.innerText = '(비어 있음)';
            childContainer.appendChild(emptyEl);
        }

        item.ondragover = (e) => { e.preventDefault(); item.style.backgroundColor = '#e8f0fe'; };
        item.ondragleave = (e) => { item.style.backgroundColor = ''; };
        item.ondrop = (e) => {
            e.preventDefault(); e.stopPropagation(); item.style.backgroundColor = '';
            flHandleDropToStagingFolder(node.id, e.dataTransfer);
        };
        childContainer.ondragover = (e) => { e.preventDefault(); item.style.backgroundColor = '#e8f0fe'; };
        childContainer.ondragleave = (e) => { item.style.backgroundColor = ''; };
        childContainer.ondrop = (e) => {
            e.preventDefault(); e.stopPropagation(); item.style.backgroundColor = '';
            flHandleDropToStagingFolder(node.id, e.dataTransfer);
        };
    }

    item.ondragstart = (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', JSON.stringify({
            source_tree: 'staging',
            id: node.id,
            name: node.name,
            isDir: node.isDir,
            path: node.path
        }));
    };

    item.onclick = (e) => {
        e.stopPropagation();
        if (node.isDir) {
            flActiveStagingFolderId = node.id;
            document.querySelectorAll('.fl-staging-tree .fl-tree-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    };

    return wrapper;
}

function flRemoveNodeFromStaging(id) {
    function removeRecursive(arr) {
        const idx = arr.findIndex(item => item.id === id);
        if (idx > -1) {
            arr.splice(idx, 1);
            return true;
        }
        for (const item of arr) {
            if (item.isDir && item.children) {
                if (removeRecursive(item.children)) return true;
            }
        }
        return false;
    }
    removeRecursive(flStagingFolders);
    flRenderStagingTree();
    flCheckMultiDelState();
}

function flAddStagingFolder() {
    const sId = 'sfolder_' + Date.now();
    const newFolder = { id: sId, name: `새 폴더 ${flStagingFolders.length + 1}`, isDir: true, children: [] };
    
    let added = false;
    if (flActiveStagingFolderId) {
        function addRecursive(arr) {
            const folder = arr.find(item => item.id === flActiveStagingFolderId && item.isDir);
            if (folder) {
                folder.children.push(newFolder);
                return true;
            }
            for (const item of arr) {
                if (item.isDir && item.children) {
                    if (addRecursive(item.children)) return true;
                }
            }
            return false;
        }
        added = addRecursive(flStagingFolders);
    }
    
    if (!added) {
        flStagingFolders.push(newFolder);
    }
    flActiveStagingFolderId = sId;
    flRenderStagingTree();
}

async function flAddDataToStaging(targetFolderId, dataItem) {
    let targetFolder = null;
    function findFolderRecursive(arr) {
        const f = arr.find(item => item.id === targetFolderId && item.isDir);
        if (f) { targetFolder = f; return; }
        for (const item of arr) {
            if (item.isDir && item.children) {
                findFolderRecursive(item.children);
                if (targetFolder) return;
            }
        }
    }
    findFolderRecursive(flStagingFolders);
    if (!targetFolder) return;

    if (dataItem.isDir) {
        if (pywebview && pywebview.api && pywebview.api.get_local_tree_recursive) {
            const res = await pywebview.api.get_local_tree_recursive(dataItem.path);
            if (res && res.status === 'success') {
                targetFolder.children.push(res.tree);
                if (res.truncated) {
                    alert("항목이 너무 많아 일부(최대 2000개)만 스테이징 폴더에 추가되었습니다.");
                }
            }
        }
    } else {
        if (!targetFolder.children.some(c => c.path === dataItem.path)) {
            targetFolder.children.push({
                id: 'sfile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: dataItem.name,
                isDir: false,
                path: dataItem.path,
                size: dataItem.size || '',
                mtime: dataItem.mtime || ''
            });
        }
    }
}

async function flHandleDropToStagingFolder(targetFolderId, dataTransfer) {
    try {
        const dataStr = dataTransfer.getData('text/plain'); if (!dataStr) return;
        const dataArr = JSON.parse(dataStr);
        const items = Array.isArray(dataArr) ? dataArr : [dataArr];

        showLoading("파일/폴더 병합 중...");
        for (const data of items) {
            if (data.source_tree === 'staging') {
                if (data.id === targetFolderId) continue;
                
                let movedNode = null;
                function removeRecursive(arr) {
                    const idx = arr.findIndex(item => item.id === data.id);
                    if (idx > -1) {
                        [movedNode] = arr.splice(idx, 1);
                        return true;
                    }
                    for (const item of arr) {
                        if (item.isDir && item.children) {
                            if (removeRecursive(item.children)) return true;
                        }
                    }
                    return false;
                }
                removeRecursive(flStagingFolders);

                if (movedNode) {
                    let targetFolder = null;
                    function findFolderRecursive(arr) {
                        const f = arr.find(item => item.id === targetFolderId && item.isDir);
                        if (f) { targetFolder = f; return; }
                        for (const item of arr) {
                            if (item.isDir && item.children) {
                                findFolderRecursive(item.children);
                                if (targetFolder) return;
                            }
                        }
                    }
                    findFolderRecursive(flStagingFolders);
                    if (targetFolder) {
                        targetFolder.children.push(movedNode);
                    } else {
                        flStagingFolders.push(movedNode);
                    }
                }
            } else if (data.path) {
                await flAddDataToStaging(targetFolderId, data);
            }
        }
        hideLoading();
        flRenderStagingTree();
    } catch (e) { console.error(e); hideLoading(); }
}

function flGetFilteredStagingTree() {
    const checkedBoxes = Array.from(document.querySelectorAll('.fl-staging-tree .fl-tree-checkbox:checked'));
    if (checkedBoxes.length === 0) {
        return JSON.parse(JSON.stringify(flStagingFolders));
    }

    const checkedIds = new Set(checkedBoxes.map(cb => cb.closest('.fl-node-wrapper').dataset.id));

    function filterNode(node) {
        if (checkedIds.has(node.id)) {
            return JSON.parse(JSON.stringify(node));
        }

        if (node.isDir && node.children) {
            const filteredChildren = [];
            for (const child of node.children) {
                const fChild = filterNode(child);
                if (fChild) {
                    filteredChildren.push(fChild);
                }
            }
            if (filteredChildren.length > 0) {
                const cloned = JSON.parse(JSON.stringify(node));
                cloned.children = filteredChildren;
                return cloned;
            }
        }
        return null;
    }

    const result = [];
    for (const rootNode of flStagingFolders) {
        const fRoot = filterNode(rootNode);
        if (fRoot) {
            result.push(fRoot);
        }
    }
    return result;
}

async function flCommitStagingLocal() {
    const filteredTree = flGetFilteredStagingTree();
    if (filteredTree.length === 0) { 
        alert("로컬에 동기화할 파일/폴더가 스테이징 작업 공간에 없습니다."); 
        return; 
    }
    
    if (pywebview && pywebview.api && pywebview.api.choose_dir) {
        const targetDir = await pywebview.api.choose_dir();
        if(!targetDir) return; // Cancelled
        
        if (!confirm(`현재 스테이징된 폴더 구조와 파일들을 다음 로컬 드라이브 경로에 일괄 복사(생성)하시겠습니까?\n목적지: ${targetDir}`)) return;

        showLoading("실제 로컬 디렉토리 동기화 생성 중...");
        await pywebview.api.fl_commit_real_staging(targetDir, filteredTree);
        hideLoading();
    } else {
        alert("백엔드 API 연결 대기 중입니다.");
    }
}

async function flMultiDeleteStaging() {
    const checkedBoxes = Array.from(document.querySelectorAll('.fl-staging-tree .fl-tree-checkbox:checked'));
    if (checkedBoxes.length === 0) return;
    
    const checkedIds = new Set(checkedBoxes.map(cb => cb.closest('.fl-node-wrapper').dataset.id));
    
    function removeCheckedNodes(arr) {
        for (let i = arr.length - 1; i >= 0; i--) {
            const item = arr[i];
            if (checkedIds.has(item.id)) {
                arr.splice(i, 1);
            } else if (item.isDir && item.children) {
                removeCheckedNodes(item.children);
            }
        }
    }
    removeCheckedNodes(flStagingFolders);
    
    if (flStagingFolders.length === 0) flAddStagingFolder();
    flRenderStagingTree();
    flCheckMultiDelState();
}

function flShowExportStagingDialog() {
    if (flStagingFolders.length === 0) { alert("내보낼 스테이징 폴더가 없습니다."); return; }
    
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';

    const dialog = document.createElement('div');
    dialog.style.background = '#fff';
    dialog.style.padding = '24px';
    dialog.style.borderRadius = '8px';
    dialog.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
    dialog.style.width = '420px';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'system-ui, sans-serif';

    const title = document.createElement('h3');
    title.innerText = '가상 스테이징 내보내기';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.color = '#333';

    const desc = document.createElement('p');
    desc.innerText = '구성한 가상 폴더 구조를 어떤 형식으로 내보내시겠습니까?';
    desc.style.fontSize = '13px';
    desc.style.color = '#666';
    desc.style.margin = '0 0 20px 0';

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    btnContainer.style.justifyContent = 'center';

    const zipBtn = document.createElement('button');
    zipBtn.innerText = 'ZIP 압축파일';
    zipBtn.style.padding = '8px 16px';
    zipBtn.style.border = 'none';
    zipBtn.style.background = '#1a73e8';
    zipBtn.style.color = '#fff';
    zipBtn.style.borderRadius = '4px';
    zipBtn.style.cursor = 'pointer';
    zipBtn.style.fontWeight = 'bold';
    zipBtn.onclick = () => {
        document.body.removeChild(modal);
        flExportStagingZip();
    };

    const folderBtn = document.createElement('button');
    folderBtn.innerText = '실제 폴더 구조 (동기화)';
    folderBtn.style.padding = '8px 16px';
    folderBtn.style.border = '1px solid #ccc';
    folderBtn.style.background = '#f5f5f5';
    folderBtn.style.borderRadius = '4px';
    folderBtn.style.cursor = 'pointer';
    folderBtn.onclick = () => {
        document.body.removeChild(modal);
        flCommitStagingLocal();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = '취소';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #ccc';
    cancelBtn.style.background = '#fff';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => {
        document.body.removeChild(modal);
    };

    btnContainer.appendChild(zipBtn);
    btnContainer.appendChild(folderBtn);
    btnContainer.appendChild(cancelBtn);
    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(btnContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

async function flMultiDeleteSelected() {
    if (flRightMode === 'staging') {
        await flMultiDeleteStaging();
    } else if (flRightMode === 'real') {
        const checkedChks = document.querySelectorAll('.fl-real-tree .fl-tree-checkbox:checked');
        if (checkedChks.length === 0) return;
        
        const paths = Array.from(checkedChks).map(chk => {
            const itemEl = chk.closest('.fl-tree-item');
            return itemEl ? itemEl.dataset.path : null;
        }).filter(p => p);
        
        if (paths.length === 0) return;
        
        if (!confirm(`⚠️ 선택한 파일/폴더를 휴지통으로 보내시겠습니까?\n대상 항목 수: ${paths.length}개`)) return;
        
        showLoading("파일을 휴지통으로 보내는 중...");
        if (pywebview && pywebview.api && pywebview.api.fl_real_delete_multi) {
            const success = await pywebview.api.fl_real_delete_multi(paths);
            if (success) {
                flLoadRealTree(flRealRootPath); // Refresh right tree
                if (flCurrentLocalRoot) flLoadLocalTree(flCurrentLocalRoot); // Refresh left tree
            }
        }
        hideLoading();
        flCheckMultiDelState();
    }
}

// --- Real Local Workspace ---
async function flChangeRealRoot() {
    if (!pywebview || !pywebview.api || !pywebview.api.choose_dir) return;
    const selectedDir = await pywebview.api.choose_dir();
    if (selectedDir) {
        flLoadRealTree(selectedDir);
    }
}

async function flLoadRealTree(rootPath) {
    const treeContainer = document.getElementById('fl-real-tree');
    treeContainer.innerHTML = '<div style="text-align: center; margin-top: 20px;"><div class="spinner"></div>로컬 디렉토리 비동기 탐색 중...</div>';
    try {
        if (pywebview && pywebview.api && pywebview.api.get_local_tree) {
            const res = await pywebview.api.get_local_tree(rootPath);
            if (res.status === 'success') {
                flRealRootPath = res.root_path;
                flRealTreeData = res.tree;
                const rootLabel = document.getElementById('fl-real-root-label');
                if(rootLabel) { rootLabel.innerText = flRealRootPath; rootLabel.style.color = 'var(--primary-blue)'; rootLabel.style.background = '#e8f0fe'; }
                flRenderRealTree();
            }
        }
    } catch (e) { treeContainer.innerHTML = '로드 실패'; }
}

function flRenderRealTree() {
    const container = document.getElementById('fl-real-tree');
    container.innerHTML = '';
    if (!flRealTreeData || flRealTreeData.length === 0) return;

    flRealTreeData.forEach(node => {
        container.appendChild(flCreateTreeNode(node, 0, 'real'));
    });

    container.ondragover = (e) => { e.preventDefault(); };
    container.ondrop = (e) => { e.preventDefault(); flHandleDropToReal(flRealRootPath, e.dataTransfer); };
}

function flShowTransferDialog(srcPaths, destDir, callback) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';

    const dialog = document.createElement('div');
    dialog.style.background = '#fff';
    dialog.style.padding = '24px';
    dialog.style.borderRadius = '8px';
    dialog.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
    dialog.style.width = '420px';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'system-ui, sans-serif';

    const title = document.createElement('h3');
    title.innerText = '실시간 로컬 전송 선택';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.color = '#333';

    const desc = document.createElement('p');
    desc.innerText = `선택한 ${srcPaths.length}개 항목을 대상 폴더로 전송합니다.\n목적지: ${destDir}`;
    desc.style.fontSize = '13px';
    desc.style.color = '#666';
    desc.style.lineHeight = '1.5';
    desc.style.margin = '0 0 20px 0';
    desc.style.wordBreak = 'break-all';

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    btnContainer.style.justifyContent = 'center';

    const moveBtn = document.createElement('button');
    moveBtn.innerText = '이동 (Move)';
    moveBtn.style.padding = '8px 16px';
    moveBtn.style.border = 'none';
    moveBtn.style.background = '#1a73e8';
    moveBtn.style.color = '#fff';
    moveBtn.style.borderRadius = '4px';
    moveBtn.style.cursor = 'pointer';
    moveBtn.style.fontWeight = 'bold';
    moveBtn.onclick = () => {
        document.body.removeChild(modal);
        callback('move');
    };

    const copyBtn = document.createElement('button');
    copyBtn.innerText = '복사 (Copy)';
    copyBtn.style.padding = '8px 16px';
    copyBtn.style.border = '1px solid #ccc';
    copyBtn.style.background = '#f5f5f5';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => {
        document.body.removeChild(modal);
        callback('copy');
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = '취소';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #ccc';
    cancelBtn.style.background = '#fff';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        callback('cancel');
    };

    btnContainer.appendChild(moveBtn);
    btnContainer.appendChild(copyBtn);
    btnContainer.appendChild(cancelBtn);
    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(btnContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

async function flHandleDropToReal(destPath, dataTransfer) {
    try {
        const dataStr = dataTransfer.getData('text/plain'); if (!dataStr) return; 
        const dataArr = JSON.parse(dataStr); 
        const items = Array.isArray(dataArr) ? dataArr : [dataArr];
        
        const transferItems = items.map(item => ({
            path: item.path,
            isDir: item.isDir === true || item.isDir === "true"
        })).filter(item => item.path);
        
        if (transferItems.length > 0) {
            flExecuteRealTransfer(transferItems, destPath);
        }
    } catch (e) { console.error(e); }
}

async function flExecuteRealTransfer(transferItems, destDir) {
    const paths = transferItems.map(item => item.path);
    flShowTransferDialog(paths, destDir, async (mode) => {
        if (mode === 'cancel') return;
        showLoading(mode === 'move' ? "실시간 로컬 이동 중..." : "실시간 로컬 복사 중...");
        if (pywebview && pywebview.api && pywebview.api.fl_transfer_items) {
            const success = await pywebview.api.fl_transfer_items(transferItems, destDir, mode);
            if (success) {
                flLoadRealTree(flRealRootPath); // Refresh right tree
                if (flCurrentLocalRoot) flLoadLocalTree(flCurrentLocalRoot); // Refresh left tree
                flToggleAllCheckboxes('local', false);
            }
        }
        hideLoading();
    });
}


// 4. Bottom 3rd Panel: Permanent Deep Search & Extended Snippet Drawer
async function flSearchDocuments() {
    const query = document.getElementById('fl-search-input').value.trim();
    const container = document.getElementById('fl-search-results-container');
    const titleEl = document.getElementById('fl-preview-doc-title');
    const contentEl = document.getElementById('fl-preview-content');

    if (!query) {
        container.innerHTML = '<div style="color:var(--text-secondary); font-size:13px; text-align:center; margin-top:30px;">상단에서 검색어를 입력하면 일치하는 문서 목록이 표시됩니다.</div>';
        titleEl.innerHTML = '📄 문서를 선택하세요'; contentEl.innerHTML = '키워드가 포함된 앞뒤 본문 문맥이 이곳에 넓게 펼쳐집니다.';
        return;
    }

    container.innerHTML = `<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 30px;"><div class="spinner" style="margin: 0 auto 12px;"></div>"${query}" 심층 검색 중...</div>`;

    try {
        let results = [];
        if (pywebview && pywebview.api && pywebview.api.search_documents) { results = await pywebview.api.search_documents(query); }

        container.innerHTML = '';
        if (results.length === 0) { container.innerHTML = `<div style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-top: 30px;">"${query}"에 대한 검색 결과가 없습니다.</div>`; return; }

        results.forEach(res => {
            const item = document.createElement('div'); item.className = 'fl-search-result-item';
            item.draggable = true; // Draggable for staging curation!
            item.dataset.path = res.path;
            
            item.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'search_file', path: res.path, name: res.title, source_tree: 'search'
                }));
            };

            item.onclick = () => {
                document.querySelectorAll('.fl-search-result-item').forEach(el => el.classList.remove('active')); item.classList.add('active');
                titleEl.innerHTML = `📄 ${res.title}`; contentEl.innerHTML = res.snippet;
            };

            // Right Click Context Menu
            item.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation();
                flShowContextMenu(e, res.path, false);
            };

            const titleBox = document.createElement('div'); titleBox.className = 'fl-search-title';
            titleBox.innerHTML = `📄 ${res.title} <span class="fl-search-path">(${res.path})</span>`;
            
            const snippetBox = document.createElement('div'); snippetBox.className = 'fl-search-snippet'; snippetBox.innerHTML = res.snippet;
            
            item.appendChild(titleBox); item.appendChild(snippetBox); container.appendChild(item);
        });
    } catch (e) { container.innerHTML = `<div style="color: var(--danger-red); font-size: 13px; text-align: center; margin-top: 30px;">검색 오류: ${e}</div>`; }
}

function flShowContextMenu(event, path, isDir) {
    flContextMenuTarget = { path, isDir };
    const menu = document.getElementById('fl-context-menu');
    if (!menu) return;

    const openFile = document.getElementById('fl-ctx-open-file');
    const openFolder = document.getElementById('fl-ctx-open-folder');
    const newFolder = document.getElementById('fl-ctx-new-folder');

    if (isDir) {
        if (openFile) openFile.style.display = 'none';
        if (openFolder) openFolder.style.display = 'block';
        if (newFolder) newFolder.style.display = 'block';
    } else {
        if (openFile) openFile.style.display = 'block';
        if (openFolder) openFolder.style.display = 'block';
        if (newFolder) newFolder.style.display = 'none';
    }

    menu.style.display = 'block';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
}

async function flExecuteContextMenu(action) {
    const menu = document.getElementById('fl-context-menu'); if (menu) menu.style.display = 'none';
    if (!flContextMenuTarget || !flContextMenuTarget.path) return;

    if (action === 'open_file') {
        if(pywebview && pywebview.api && pywebview.api.fl_open_file) await pywebview.api.fl_open_file(flContextMenuTarget.path);
    } else if (action === 'open_folder') {
        if(pywebview && pywebview.api && pywebview.api.fl_open_folder_in_explorer) await pywebview.api.fl_open_folder_in_explorer(flContextMenuTarget.path);
    } else if (action === 'new_folder') {
        const folderName = prompt("생성할 새 폴더명을 입력하세요:");
        if (!folderName || !folderName.trim()) return;
        
        showLoading("새 폴더 생성 중...");
        if (pywebview && pywebview.api && pywebview.api.fl_real_mkdir) {
            const success = await pywebview.api.fl_real_mkdir(flContextMenuTarget.path, folderName.trim());
            if (success) {
                await flRefreshDirectoryNode(flContextMenuTarget.path);
            }
        }
        hideLoading();
    }
}

async function flRefreshDirectoryNode(parentPath) {
    const items = document.querySelectorAll(`.fl-tree-item[data-path="${parentPath}"]`);
    for (const item of items) {
        const wrapper = item.parentElement;
        const childContainer = wrapper.querySelector('.fl-tree-children');
        const toggleBtn = item.querySelector('.fl-toggle-btn');
        const icon = item.querySelector('.fl-item-icon');
        const treeType = item.dataset.treetype;

        toggleBtn.innerText = '▼';
        icon.innerText = '📂';
        childContainer.style.display = 'block';

        const currentPadding = parseInt(item.style.paddingLeft) || 8;
        const depth = Math.round((currentPadding - 8) / 16) + 1;

        childContainer.innerHTML = `<div style="padding-left:${depth * 16 + 8}px; color:var(--text-secondary); font-size:11px;">로딩 중...</div>`;
        try {
            if (pywebview && pywebview.api && pywebview.api.get_local_tree) {
                const res = await pywebview.api.get_local_tree(parentPath);
                childContainer.innerHTML = '';
                if (res.tree && res.tree.length > 0) {
                    res.tree.forEach(childNode => {
                        childContainer.appendChild(flCreateTreeNode(childNode, depth, treeType));
                    });
                } else {
                    childContainer.innerHTML = `<div style="padding-left:${depth * 16 + 8}px; color:var(--text-secondary); font-size:11px;">(비어 있음)</div>`;
                }
            }
        } catch (err) {
            childContainer.innerHTML = `<div style="padding-left:${depth * 16 + 8}px; color:var(--danger-red); font-size:11px;">로드 실패</div>`;
        }
    }
}

async function flIndexCurrentFolder() {
    if (!flCurrentLocalRoot) { alert("먼저 로컬 탐색기에서 폴더를 선택해주세요."); return; }
    if (!confirm(`현재 열려있는 폴더의 문서를 검색 엔진에 수동으로 색인하시겠습니까?\\n경로: ${flCurrentLocalRoot}`)) return;
    
    const statusEl = document.getElementById('fl-index-status');
    if(statusEl) {
        statusEl.className = 'fl-index-status indexing';
        statusEl.innerHTML = '<div class="spinner" style="width:10px;height:10px;border-width:1px;"></div><span>⏳ 색인 준비 중...</span>';
    }

    if (pywebview && pywebview.api && pywebview.api.fl_index_current_folder) {
        if (pywebview.api.fl_is_trigram_supported) {
            const isTrigram = await pywebview.api.fl_is_trigram_supported();
            if (!isTrigram) {
                alert("⚠️ 현재 환경에서는 검색 엔진의 한글 형태소 분석(Trigram)이 완벽히 지원되지 않아 검색 품질이 저하될 수 있습니다.");
            }
        }
        const cancelBtn = document.getElementById('fl-index-cancel-btn');
        if(cancelBtn) cancelBtn.style.display = 'inline-block';
        
        await pywebview.api.fl_index_current_folder(flCurrentLocalRoot);
    } else { alert("백엔드 API 연결 대기 중입니다."); }
}

async function flCancelIndex() {
    if (pywebview && pywebview.api && pywebview.api.fl_cancel_index) {
        await pywebview.api.fl_cancel_index();
    }
}

function flUpdateIndexStatus(count, filename) {
    const statusEl = document.getElementById('fl-index-status');
    if(statusEl) {
        statusEl.className = 'fl-index-status indexing';
        statusEl.innerHTML = `<div class="spinner" style="width:10px;height:10px;border-width:1px;"></div><span>⏳ 색인 진행 중: ${count}개 본문 추출 (${filename})</span>`;
    }
}

function flCompleteIndexStatus(count, wasCancelled = false, truncated = false) {
    const statusEl = document.getElementById('fl-index-status');
    const cancelBtn = document.getElementById('fl-index-cancel-btn');
    if(cancelBtn) cancelBtn.style.display = 'none';

    if(statusEl) {
        statusEl.className = wasCancelled ? 'fl-index-status error' : 'fl-index-status success';
        statusEl.innerHTML = wasCancelled ? `⚠️ 색인 취소됨 (총 ${count}개 등록)` : `✅ 색인 완료 (총 ${count}개 문서 등록)`;
        setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
    }
    if (!wasCancelled) {
        if (truncated) {
            alert(`색인 완료: ${count}개의 새 문서가 등록되었으나, 파일이 너무 많아 일부(최대 5000개)만 처리되었습니다.`);
        } else {
            alert(`색인 완료: ${count}개의 새 문서 본문이 검색 엔진에 등록되었습니다.`);
        }
    }
}

function flErrorIndexStatus() {
    const statusEl = document.getElementById('fl-index-status');
    const cancelBtn = document.getElementById('fl-index-cancel-btn');
    if(cancelBtn) cancelBtn.style.display = 'none';

    if(statusEl) {
        statusEl.className = 'fl-index-status error';
        statusEl.innerHTML = '❌ 색인 중 오류 발생';
        setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
    }
}

function flInitSplitter() {
    const splitter = document.getElementById('fl-splitter'); const topContainer = document.querySelector('.dual-pane-container'); const bottomDrawer = document.getElementById('fl-bottom-drawer');
    let isResizing = false;
    splitter.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'row-resize'; });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const totalHeight = document.getElementById('folderlab-workspace').clientHeight;
        const topHeight = e.clientY - 45; const bottomHeight = totalHeight - e.clientY - 6;
        if (topHeight > 150 && bottomHeight > 150) { topContainer.style.height = `${topHeight}px`; bottomDrawer.style.height = `${bottomHeight}px`; }
    });
    document.addEventListener('mouseup', () => { if (isResizing) { isResizing = false; document.body.style.cursor = 'default'; } });
}

function resetFolderLabWorkspace() {
    if(!confirm("구성 중인 스테이징 폴더 구조를 초기화하시겠습니까?")) return;
    flStagingFolders = [{ id: 'sfolder_1', name: '스테이징 폴더 1', isDir: true, children: [] }]; flActiveStagingFolderId = 'sfolder_1'; flRenderStagingTree();
}

async function flExportStagingZip() {
    if (flStagingFolders.length === 0) { alert("내보낼 스테이징 폴더가 없습니다."); return; }
    if (pywebview && pywebview.api && pywebview.api.export_virtual_folder) { 
        showLoading("스테이징 폴더 ZIP 패키징 중..."); 
        const filteredTree = flGetFilteredStagingTree();
        if (filteredTree.length === 0) { alert("선택된 파일/폴더가 없습니다."); hideLoading(); return; }
        await pywebview.api.export_virtual_folder(filteredTree); 
        hideLoading(); 
    } else { alert("API 연결 대기 중입니다."); }
}
