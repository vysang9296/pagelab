// tab_manager.js
// Handles GNB tab switching between PageLab and FolderLab workspaces

let flInitialized = false;

function switchTab(tabId) {
    const pagelabWorkspace = document.getElementById('pagelab-workspace');
    const folderlabWorkspace = document.getElementById('folderlab-workspace');
    const pagelabResetBtn = document.getElementById('pagelab-reset-btn');
    const folderlabResetBtn = document.getElementById('folderlab-reset-btn');
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));

    if (tabId === 'pagelab') {
        pagelabWorkspace.style.display = 'flex';
        folderlabWorkspace.style.display = 'none';
        pagelabResetBtn.style.display = 'inline-block';
        folderlabResetBtn.style.display = 'none';
        
        // Activate button
        const btn = Array.from(tabBtns).find(b => b.innerText.includes('Page Lab'));
        if(btn) btn.classList.add('active');
    } else if (tabId === 'folderlab') {
        pagelabWorkspace.style.display = 'none';
        folderlabWorkspace.style.display = 'flex';
        pagelabResetBtn.style.display = 'none';
        folderlabResetBtn.style.display = 'inline-block';
        
        // Activate button
        const btn = Array.from(tabBtns).find(b => b.innerText.includes('Folder Lab'));
        if(btn) btn.classList.add('active');
        
        // Initialize FolderLab if not already done
        if (!flInitialized && typeof flInit === 'function') {
            flInitialized = true;
            flInit();
        }
    }
}

