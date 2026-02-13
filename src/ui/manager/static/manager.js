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

// Auto-normalize codebase name as user types (removed - let server handle normalization)
document.addEventListener('DOMContentLoaded', () => {
    // Removed auto-normalization to allow users to type freely
    // Server will normalize the name when form is submitted
});

// Ingestion form submission with real-time progress
document.addEventListener('DOMContentLoaded', function() {
    const ingestForm = document.getElementById('ingestForm');
    if (ingestForm) {
        ingestForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(ingestForm);
            const name = formData.get('name');
            const path = formData.get('path');
            
            console.log('Form submission:', { name, path });
            
            if (!name || !path) {
                alert('Please provide both name and path');
                return;
            }
            
            try {
                // Create URLSearchParams properly
                const params = new URLSearchParams();
                params.append('name', String(name));
                params.append('path', String(path));
                
                console.log('Sending request with params:', params.toString());
                
                // Start ingestion and get job ID
                const response = await fetch('/ingest', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: params.toString()
                });
                
                console.log('Response status:', response.status);
                
                if (!response.ok) {
                    let error;
                    try {
                        error = await response.json();
                    } catch (e) {
                        const text = await response.text();
                        console.error('Server returned non-JSON error:', text);
                        alert('Failed to start ingestion: ' + text);
                        return;
                    }
                    console.error('Server error:', error);
                    alert('Failed to start ingestion: ' + (error.error || 'Unknown error'));
                    return;
                }
                
                let result;
                try {
                    const responseText = await response.text();
                    console.log('Response body:', responseText);
                    result = JSON.parse(responseText);
                } catch (e) {
                    console.error('Failed to parse response as JSON:', e);
                    alert('Server returned invalid response. Check console for details.');
                    return;
                }
                
                console.log('Got job ID:', result.jobId);
                
                // Show progress and connect to SSE
                showIngestionProgress(result.jobId, name);
                
            } catch (error) {
                console.error('Failed to start ingestion:', error);
                alert('Failed to start ingestion: ' + (error instanceof Error ? error.message : String(error)));
            }
        });
    }
});

// Real-time ingestion progress using Server-Sent Events
function showIngestionProgress(jobId, codebaseName) {
    const progressContainer = document.getElementById('ingestionProgress');
    const progressBar = document.getElementById('progressBar');
    const progressPhase = document.getElementById('progressPhase');
    const progressPercent = document.getElementById('progressPercent');
    const progressDetails = document.getElementById('progressDetails');
    
    if (!progressContainer || !progressBar || !progressPhase || !progressPercent || !progressDetails) {
        console.error('Progress elements not found');
        return;
    }
    
    progressContainer.style.display = 'block';
    
    // Disable form
    const ingestForm = document.getElementById('ingestForm');
    if (ingestForm) {
        ingestForm.querySelectorAll('input, button').forEach(function(el) {
            el.disabled = true;
        });
    }
    
    // Connect to SSE endpoint
    const eventSource = new EventSource('/ingest-progress/' + jobId);
    
    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Update progress UI
            const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
            progressBar.style.width = percent + '%';
            progressPercent.textContent = percent + '%';
            progressPhase.textContent = data.phase;
            progressDetails.textContent = data.phase + ' (' + data.current + '/' + data.total + ')';
            
            // Handle completion
            if (data.status === 'completed') {
                progressBar.style.width = '100%';
                progressPercent.textContent = '100%';
                progressPhase.textContent = 'Complete!';
                progressDetails.textContent = 'Successfully ingested ' + codebaseName;
                
                eventSource.close();
                
                // Reload page after 1.5 seconds
                setTimeout(function() {
                    window.location.href = '/?tab=manage';
                }, 1500);
            } else if (data.status === 'failed') {
                progressPhase.textContent = 'Failed';
                progressDetails.textContent = 'Error: ' + (data.error || 'Unknown error');
                progressBar.style.background = 'var(--danger)';
                
                eventSource.close();
                
                // Re-enable form after 3 seconds
                setTimeout(function() {
                    if (ingestForm) {
                        ingestForm.querySelectorAll('input, button').forEach(function(el) {
                            el.disabled = false;
                        });
                    }
                    progressContainer.style.display = 'none';
                    progressBar.style.background = '';
                }, 3000);
            }
            
        } catch (error) {
            console.error('Failed to parse SSE data:', error);
        }
    };
    
    eventSource.onerror = function(error) {
        console.error('SSE connection error:', error);
        progressPhase.textContent = 'Connection Error';
        progressDetails.textContent = 'Lost connection to server';
        progressBar.style.background = 'var(--danger)';
        eventSource.close();
        
        // Re-enable form after 3 seconds
        setTimeout(function() {
            if (ingestForm) {
                ingestForm.querySelectorAll('input, button').forEach(function(el) {
                    el.disabled = false;
                });
            }
            progressContainer.style.display = 'none';
            progressBar.style.background = '';
        }, 3000);
    };
}


// Tab switching
function switchTab(tabName, clickedButton) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // If called from a button click, mark that button as active
    if (clickedButton) {
        clickedButton.classList.add('active');
    } else {
        // If called programmatically, find the right button based on tabName
        const buttons = document.querySelectorAll('.tab-btn');
        if (tabName === 'search' && buttons[0]) {
            buttons[0].classList.add('active');
        } else if (tabName === 'manage' && buttons[1]) {
            buttons[1].classList.add('active');
        }
    }
    
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
// or if tab parameter is in URL
document.addEventListener('DOMContentLoaded', () => {
    // Check URL parameter for tab
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    
    if (tabParam === 'manage') {
        switchTab('manage');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
    } else {
        const alert = document.querySelector('.alert');
        if (alert && !document.querySelector('#searchTab .search-result')) {
            // If there's an alert but no search results, switch to manage tab
            switchTab('manage');
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-btn')[1].classList.add('active');
        }
    }
});


// Actions menu functions
function toggleActionsMenu(event, codebaseName) {
    event.stopPropagation();
    const menu = document.getElementById('actions-menu-' + codebaseName);
    const isVisible = menu.style.display === 'block';
    
    // Close all other menus
    document.querySelectorAll('.actions-menu').forEach(function(m) {
        m.style.display = 'none';
    });
    
    // Toggle this menu
    menu.style.display = isVisible ? 'none' : 'block';
}

function closeActionsMenu(codebaseName) {
    const menu = document.getElementById('actions-menu-' + codebaseName);
    if (menu) {
        menu.style.display = 'none';
    }
}

// Close menus when clicking outside
document.addEventListener('click', function() {
    document.querySelectorAll('.actions-menu').forEach(function(menu) {
        menu.style.display = 'none';
    });
});

// Confirm remove with better messaging
function confirmRemove(codebaseName, displayName) {
    if (confirm('Remove ' + displayName + '?\n\nThis will remove all indexed data for this codebase. This cannot be undone.')) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/delete';
        
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'name';
        input.value = codebaseName;
        
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
    }
}


// Toggle search result expand/collapse
function toggleSearchResult(element) {
    const isExpanded = element.getAttribute('data-expanded') === 'true';
    element.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
}

// Quit manager with confirmation
function quitManager() {
    if (confirm('Quit Codebase Manager?\n\nThis will shut down the manager server and close this tab.')) {
        // Call shutdown endpoint
        fetch('/api/shutdown', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        })
        .then(function() {
            // Close the tab after a short delay
            setTimeout(function() {
                window.close();
                // If window.close() doesn't work (some browsers block it), show a message
                setTimeout(function() {
                    document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, -apple-system, sans-serif;"><div style="text-align: center;"><h1 style="font-size: 2rem; margin-bottom: 1rem;">Manager Stopped</h1><p style="color: #666;">You can close this tab now.</p></div></div>';
                }, 100);
            }, 300);
        })
        .catch(function(error) {
            alert('Failed to shut down server: ' + error.message);
        });
    }
}

// File management functions
const expandedCodebases = new Set();

async function toggleFiles(event, codebaseName) {
    event.stopPropagation();
    
    const filesRow = document.getElementById('files-row-' + codebaseName);
    const expandIcon = event.currentTarget.querySelector('.expand-icon');
    
    if (!filesRow) return;
    
    // Toggle visibility
    if (filesRow.style.display === 'none') {
        // Expand
        filesRow.style.display = 'table-row';
        expandIcon.style.transform = 'rotate(90deg)';
        
        // Load files if not already loaded
        if (!expandedCodebases.has(codebaseName)) {
            await loadFiles(codebaseName);
            expandedCodebases.add(codebaseName);
        }
    } else {
        // Collapse
        filesRow.style.display = 'none';
        expandIcon.style.transform = 'rotate(0deg)';
    }
}

async function loadFiles(codebaseName) {
    const container = document.getElementById('files-container-' + codebaseName);
    if (!container) return;
    
    try {
        const response = await fetch('/api/codebases/' + encodeURIComponent(codebaseName) + '/files');
        
        if (!response.ok) {
            throw new Error('Failed to load files');
        }
        
        const data = await response.json();
        const files = data.files || [];
        
        if (files.length === 0) {
            container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary);">No files found</div>';
            return;
        }
        
        // Build files list HTML
        let html = '<div style="padding: 1rem;">';
        
        files.forEach(function(file) {
            const icon = getFileIcon(file.language);
            const testBadge = file.isTestFile ? '<span class="badge badge-orange" style="margin-left: 0.5rem;">Test</span>' : '';
            const libBadge = file.isLibraryFile ? '<span class="badge" style="margin-left: 0.5rem; background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">Library</span>' : '';
            
            html += '<div class="file-item">';
            html += '  <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0;">';
            html += '    ' + icon;
            html += '    <code style="font-size: 0.8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + escapeHtml(file.filePath) + '</code>';
            html += '    <span class="badge badge-green">' + file.language + '</span>';
            html += '    ' + testBadge;
            html += '    ' + libBadge;
            html += '  </div>';
            html += '  <div style="display: flex; align-items: center; gap: 1rem;">';
            html += '    <span style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap;">' + file.chunkCount + ' chunks</span>';
            html += '    <button type="button" class="btn btn-ghost btn-sm" onclick="confirmDeleteFile(\'' + escapeJs(codebaseName) + '\', \'' + escapeJs(file.filePath) + '\', this)" style="color: var(--danger);">';
            html += '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">';
            html += '        <polyline points="3 6 5 6 21 6"/>';
            html += '        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
            html += '      </svg>';
            html += '      Delete';
            html += '    </button>';
            html += '  </div>';
            html += '</div>';
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Failed to load files:', error);
        container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--danger);">Failed to load files</div>';
    }
}

function getFileIcon(language) {
    const icons = {
        'typescript': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: #3178c6; flex-shrink: 0;"><path d="M9 7h11M9 12h11M9 17h11M5 7h0M5 12h0M5 17h0"/></svg>',
        'javascript': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: #f7df1e; flex-shrink: 0;"><path d="M9 7h11M9 12h11M9 17h11M5 7h0M5 12h0M5 17h0"/></svg>',
        'python': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: #3776ab; flex-shrink: 0;"><path d="M9 7h11M9 12h11M9 17h11M5 7h0M5 12h0M5 17h0"/></svg>',
        'java': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: #007396; flex-shrink: 0;"><path d="M9 7h11M9 12h11M9 17h11M5 7h0M5 12h0M5 17h0"/></svg>',
        'csharp': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: #239120; flex-shrink: 0;"><path d="M9 7h11M9 12h11M9 17h11M5 7h0M5 12h0M5 17h0"/></svg>'
    };
    
    return icons[language.toLowerCase()] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: var(--text-secondary); flex-shrink: 0;"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
}

async function confirmDeleteFile(codebaseName, filePath, buttonElement) {
    if (!confirm('Delete this file?\n\n' + filePath + '\n\nThis will remove all chunks for this file. This cannot be undone.')) {
        return;
    }
    
    // Disable button and show loading
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Deleting...';
    
    try {
        const response = await fetch('/api/codebases/' + encodeURIComponent(codebaseName) + '/files', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filePath: filePath })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete file');
        }
        
        // Show success toast
        showToast('File deleted successfully', 'success');
        
        // Fade out and remove the file item
        const fileItem = buttonElement.closest('.file-item');
        if (fileItem) {
            fileItem.style.transition = 'opacity 0.3s ease';
            fileItem.style.opacity = '0';
            setTimeout(function() {
                fileItem.remove();
                
                // Check if there are any files left
                const container = document.getElementById('files-container-' + codebaseName);
                const remainingFiles = container ? container.querySelectorAll('.file-item').length : 0;
                
                if (remainingFiles === 0) {
                    container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary);">No files found</div>';
                }
            }, 300);
        }
        
        // Reload page after a short delay to update chunk counts
        setTimeout(function() {
            window.location.href = '/?tab=manage';
        }, 1500);
        
    } catch (error) {
        console.error('Failed to delete file:', error);
        showToast('Failed to delete file: ' + error.message, 'error');
        
        // Re-enable button
        buttonElement.disabled = false;
        buttonElement.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete';
    }
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = 'position: fixed; bottom: 2rem; right: 2rem; padding: 1rem 1.5rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; z-index: 2000; animation: slideIn 0.3s ease, fadeOut 0.3s ease 2.7s; box-shadow: var(--shadow-md);';
    
    if (type === 'success') {
        toast.style.background = 'rgba(34, 197, 94, 0.9)';
        toast.style.color = 'white';
    } else if (type === 'error') {
        toast.style.background = 'rgba(239, 68, 68, 0.9)';
        toast.style.color = 'white';
    }
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.remove();
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeJs(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
