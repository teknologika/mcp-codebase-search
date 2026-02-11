// Theme toggle
function setTheme(theme) {
    if (theme === 'carbon') {
        document.documentElement.classList.add('carbon');
        document.body.classList.add('carbon');
    } else {
        document.documentElement.classList.remove('carbon');
        document.body.classList.remove('carbon');
    }
    localStorage.setItem('codebase-theme', theme);
    
    // Update button states
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.theme-btn-${theme}`).classList.add('active');
}

// Copy to clipboard
function copyToClipboard(button, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.background = 'rgba(34, 197, 94, 0.1)';
        button.style.color = 'var(--success)';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
            button.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Auto-dismiss alerts
document.addEventListener('DOMContentLoaded', () => {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    });
    
    // Set theme on load
    const savedTheme = localStorage.getItem('codebase-theme') || 'snow';
    if (savedTheme === 'carbon') {
        document.querySelector('.theme-btn-carbon')?.classList.add('active');
        document.querySelector('.theme-btn-snow')?.classList.remove('active');
    }
});


// Rename modal functions
function showRenameModal(codebaseName) {
    const modal = document.getElementById('renameModal');
    const oldNameInput = document.getElementById('renameOldName');
    const currentNameInput = document.getElementById('renameCurrentName');
    const newNameInput = document.getElementById('renameNewName');
    
    oldNameInput.value = codebaseName;
    currentNameInput.value = codebaseName;
    newNameInput.value = '';
    newNameInput.focus();
    
    modal.style.display = 'flex';
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    modal.style.display = 'none';
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeRenameModal();
    }
});

// Close modal on background click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('renameModal');
    if (e.target === modal) {
        closeRenameModal();
    }
});


// Folder picker functionality
let currentBrowsePath = null;

async function selectFolder() {
    // Show folder browser modal
    showFolderBrowserModal();
}

async function showFolderBrowserModal() {
    const modal = document.getElementById('folderBrowserModal');
    if (!modal) {
        console.error('Folder browser modal not found');
        return;
    }
    
    modal.style.display = 'flex';
    
    // Load initial directory (home directory)
    await loadFolderList();
}

function closeFolderBrowserModal() {
    const modal = document.getElementById('folderBrowserModal');
    modal.style.display = 'none';
}

async function loadFolderList(path = null) {
    const folderList = document.getElementById('folderList');
    const currentPathDisplay = document.getElementById('currentPathDisplay');
    const loadingIndicator = document.getElementById('folderLoadingIndicator');
    
    try {
        loadingIndicator.style.display = 'block';
        folderList.innerHTML = '';
        
        const url = path ? `/browse-folders?path=${encodeURIComponent(path)}` : '/browse-folders';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to load folders');
        }
        
        const data = await response.json();
        currentBrowsePath = data.currentPath;
        currentPathDisplay.textContent = data.currentPath;
        
        // Add parent directory option if available
        if (data.parentPath) {
            const parentItem = document.createElement('div');
            parentItem.className = 'folder-item';
            parentItem.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
                <span>..</span>
            `;
            parentItem.onclick = () => loadFolderList(data.parentPath);
            folderList.appendChild(parentItem);
        }
        
        // Add directories
        data.directories.forEach(dir => {
            const item = document.createElement('div');
            item.className = 'folder-item';
            item.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
                <span>${dir.name}</span>
            `;
            item.onclick = () => loadFolderList(dir.path);
            folderList.appendChild(item);
        });
        
        if (data.directories.length === 0 && !data.parentPath) {
            folderList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--text-secondary);">No folders found</p>';
        }
        
    } catch (error) {
        console.error('Error loading folders:', error);
        folderList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--danger);">Error loading folders</p>';
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function selectCurrentFolder() {
    if (currentBrowsePath) {
        const pathInput = document.getElementById('pathInput');
        pathInput.value = currentBrowsePath;
        closeFolderBrowserModal();
    }
}

// Check if folder picker is supported and update UI
document.addEventListener('DOMContentLoaded', () => {
    const pickerBtn = document.getElementById('folderPickerBtn');
    const helpText = document.getElementById('folderPickerHelp');
    
    // Always show the browse button since we have server-side browsing
    if (pickerBtn) {
        pickerBtn.style.display = 'inline-flex';
        helpText.textContent = 'Click "Browse..." to select a folder, or enter path manually';
    }
});


// Ingest form visibility
function showIngestForm() {
    const container = document.getElementById('ingestFormContainer');
    const codebasesList = document.getElementById('codebasesList');
    const codebasesHeader = document.getElementById('codebasesHeader');
    
    container.style.display = 'block';
    if (codebasesList) {
        codebasesList.style.display = 'none';
    }
    if (codebasesHeader) {
        codebasesHeader.style.display = 'none';
    }
    
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Focus on the name input
    setTimeout(() => {
        document.getElementById('codebaseName').focus();
    }, 300);
}

function hideIngestForm() {
    const container = document.getElementById('ingestFormContainer');
    const codebasesList = document.getElementById('codebasesList');
    const codebasesHeader = document.getElementById('codebasesHeader');
    
    container.style.display = 'none';
    if (codebasesList) {
        codebasesList.style.display = 'block';
    }
    if (codebasesHeader) {
        codebasesHeader.style.display = 'flex';
    }
    
    // Reset form
    document.getElementById('ingestForm').reset();
    
    // Hide progress if showing
    document.getElementById('ingestionProgress').style.display = 'none';
}

// Normalize codebase name (spaces to hyphens, lowercase, alphanumeric only)
function normalizeCodebaseName(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')  // Replace spaces with hyphens
        .replace(/[^a-z0-9-_]/g, '')  // Remove invalid characters
        .replace(/-+/g, '-')  // Replace multiple hyphens with single
        .replace(/^-|-$/g, '');  // Remove leading/trailing hyphens
}

// Display name (hyphens/underscores to spaces, title case)
function displayName(name) {
    return name
        .replace(/[-_]/g, ' ')  // Replace hyphens and underscores with spaces
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Auto-normalize codebase name as user types
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('codebaseName');
    const renameInput = document.getElementById('renameNewName');
    
    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            const normalized = normalizeCodebaseName(e.target.value);
            if (normalized !== e.target.value) {
                const cursorPos = e.target.selectionStart;
                e.target.value = normalized;
                e.target.setSelectionRange(cursorPos, cursorPos);
            }
        });
    }
    
    if (renameInput) {
        renameInput.addEventListener('input', (e) => {
            const normalized = normalizeCodebaseName(e.target.value);
            if (normalized !== e.target.value) {
                const cursorPos = e.target.selectionStart;
                e.target.value = normalized;
                e.target.setSelectionRange(cursorPos, cursorPos);
            }
        });
    }
});

// Ingestion progress simulation (will be replaced with real SSE later)
function showIngestionProgress(codebaseName) {
    const progressContainer = document.getElementById('ingestionProgress');
    const progressBar = document.getElementById('progressBar');
    const progressPhase = document.getElementById('progressPhase');
    const progressPercent = document.getElementById('progressPercent');
    const progressDetails = document.getElementById('progressDetails');
    
    progressContainer.style.display = 'block';
    
    // Disable form
    document.getElementById('ingestForm').querySelectorAll('input, button').forEach(el => {
        el.disabled = true;
    });
    
    // Simulate progress (replace with real SSE implementation)
    let progress = 0;
    const phases = [
        { name: 'Scanning files', duration: 2000 },
        { name: 'Parsing code', duration: 3000 },
        { name: 'Generating embeddings', duration: 4000 },
        { name: 'Storing in database', duration: 2000 }
    ];
    
    let currentPhase = 0;
    
    function updateProgress() {
        if (currentPhase >= phases.length) {
            progressBar.style.width = '100%';
            progressPercent.textContent = '100%';
            progressPhase.textContent = 'Complete!';
            progressDetails.textContent = `Successfully ingested ${codebaseName}`;
            
            setTimeout(() => {
                window.location.reload();
            }, 1500);
            return;
        }
        
        const phase = phases[currentPhase];
        progressPhase.textContent = phase.name;
        
        const phaseProgress = (currentPhase / phases.length) * 100;
        progressBar.style.width = phaseProgress + '%';
        progressPercent.textContent = Math.round(phaseProgress) + '%';
        progressDetails.textContent = `${phase.name}...`;
        
        setTimeout(() => {
            currentPhase++;
            updateProgress();
        }, phase.duration);
    }
    
    updateProgress();
}


// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.tab-btn').classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'search') {
        document.getElementById('searchTab').classList.add('active');
    } else if (tabName === 'manage') {
        document.getElementById('manageTab').classList.add('active');
    }
}

// Auto-switch to manage tab if there's a flash message (after add/rename/delete)
document.addEventListener('DOMContentLoaded', () => {
    const alert = document.querySelector('.alert');
    if (alert && !document.querySelector('#searchTab .search-result')) {
        // If there's an alert but no search results, switch to manage tab
        switchTab('manage');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
    }
});
