/**
 * Video Downloader - Frontend JavaScript
 * Handles all client-side functionality
 */

// State Management
const state = {
    currentTab: 'download',
    videoInfo: null,
    selectedFormat: 'video',
    selectedQuality: 'best',
    selectedAudioFormat: 'mp3',
    activeDownloads: new Map(),
    currentUrl: '',
    // Subtitle options
    downloadSubs: false,
    embedSubs: false,
    subtitleLang: 'en',
    // Playlist state
    isPlaylist: false,
    playlistVideos: [],
    selectedPlaylistIndices: [],
    // Batch state
    batchFormat: 'video',
    batchQuality: 'best',
    batchAudioFormat: 'mp3',
    batchDownloadSubs: false,
    // History state
    historyPage: 0,
    historyLimit: 20,
    historySearch: ''
};

// DOM Elements
const elements = {
    // Navigation
    navLinks: document.querySelectorAll('.nav-link'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Download Tab
    urlInput: document.getElementById('url-input'),
    fetchBtn: document.getElementById('fetch-btn'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    
    // Video Info
    videoInfo: document.getElementById('video-info'),
    videoThumbnail: document.getElementById('video-thumbnail'),
    videoDuration: document.getElementById('video-duration'),
    videoTitle: document.getElementById('video-title'),
    videoUploader: document.getElementById('video-uploader'),
    videoViews: document.getElementById('video-views'),
    videoDescription: document.getElementById('video-description'),
    
    // Download Options
    downloadOptions: document.getElementById('download-options'),
    formatBtns: document.querySelectorAll('.format-btn:not(.batch-format-btn)'),
    videoOptions: document.getElementById('video-options'),
    audioOptions: document.getElementById('audio-options'),
    qualityBtns: document.querySelectorAll('.quality-btn'),
    audioFormatBtns: document.querySelectorAll('.audio-format-btn'),
    downloadBtn: document.getElementById('download-btn'),
    
    // Subtitle Options
    downloadSubsCheckbox: document.getElementById('download-subs'),
    embedSubsCheckbox: document.getElementById('embed-subs'),
    subtitleLangGroup: document.getElementById('subtitle-lang-group'),
    subtitleLangSelect: document.getElementById('subtitle-lang'),
    availableSubs: document.getElementById('available-subs'),
    subsList: document.getElementById('subs-list'),
    
    // Playlist
    playlistNotice: document.getElementById('playlist-notice'),
    playlistCount: document.getElementById('playlist-count'),
    selectPlaylistVideosBtn: document.getElementById('select-playlist-videos'),
    playlistSelection: document.getElementById('playlist-selection'),
    playlistItems: document.getElementById('playlist-items'),
    selectAllPlaylist: document.getElementById('select-all-playlist'),
    deselectAllPlaylist: document.getElementById('deselect-all-playlist'),
    
    // Active Downloads
    activeDownloads: document.getElementById('active-downloads'),
    downloadsList: document.getElementById('downloads-list'),
    
    // Batch Tab
    batchUrls: document.getElementById('batch-urls'),
    urlCount: document.getElementById('url-count'),
    batchFormatBtns: document.querySelectorAll('.batch-format-btn'),
    batchQuality: document.getElementById('batch-quality'),
    batchAudioFormat: document.getElementById('batch-audio-format'),
    batchAudioFormatRow: document.querySelector('.batch-audio-format'),
    batchDownloadSubs: document.getElementById('batch-download-subs'),
    batchDownloadBtn: document.getElementById('batch-download-btn'),
    batchQueue: document.getElementById('batch-queue'),
    batchQueueList: document.getElementById('batch-queue-list'),
    
    // History Tab
    historySearch: document.getElementById('history-search'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    historyEmpty: document.getElementById('history-empty'),
    historyList: document.getElementById('history-list'),
    historyPagination: document.getElementById('history-pagination'),
    historyPrev: document.getElementById('history-prev'),
    historyNext: document.getElementById('history-next'),
    historyPageInfo: document.getElementById('history-page-info'),
    
    // Library Tab
    refreshLibraryBtn: document.getElementById('refresh-library'),
    libraryEmpty: document.getElementById('library-empty'),
    libraryFiles: document.getElementById('library-files'),
    
    // About Tab
    supportedSitesList: document.getElementById('supported-sites-list'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// Utility Functions
function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

function isAudioFile(filename) {
    const audioExts = ['mp3', 'm4a', 'wav', 'flac', 'opus', 'ogg', 'aac'];
    return audioExts.includes(getFileExtension(filename));
}

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Tab Navigation
function switchTab(tabName) {
    state.currentTab = tabName;
    
    elements.navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.tab === tabName);
    });
    
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    
    // Load content for specific tabs
    if (tabName === 'library') {
        loadLibrary();
    } else if (tabName === 'about') {
        loadSupportedSites();
    } else if (tabName === 'history') {
        loadHistory();
    }
}

// Fetch Video Info
async function fetchVideoInfo() {
    const url = elements.urlInput.value.trim();
    
    if (!url) {
        showToast('Please enter a video URL', 'warning');
        return;
    }
    
    // Validate URL
    try {
        new URL(url);
    } catch {
        showToast('Please enter a valid URL', 'error');
        return;
    }
    
    state.currentUrl = url;
    
    // Show loading state
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.videoInfo.classList.add('hidden');
    elements.downloadOptions.classList.add('hidden');
    elements.fetchBtn.disabled = true;
    
    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch video info');
        }
        
        state.videoInfo = data;
        displayVideoInfo(data);
        
    } catch (error) {
        showError(error.message);
    } finally {
        elements.loadingState.classList.add('hidden');
        elements.fetchBtn.disabled = false;
    }
}

function displayVideoInfo(info) {
    // Set thumbnail
    elements.videoThumbnail.src = info.thumbnail || '/static/img/placeholder.png';
    elements.videoThumbnail.onerror = () => {
        elements.videoThumbnail.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225"><rect fill="%23334155" width="400" height="225"/><text x="50%" y="50%" fill="%2394a3b8" font-family="sans-serif" font-size="16" text-anchor="middle" dy=".3em">No Thumbnail</text></svg>';
    };
    
    // Set duration
    elements.videoDuration.textContent = formatDuration(info.duration);
    
    // Set title
    elements.videoTitle.textContent = info.title;
    
    // Set uploader
    elements.videoUploader.querySelector('span').textContent = info.uploader || 'Unknown';
    
    // Set views
    elements.videoViews.querySelector('span').textContent = formatNumber(info.view_count) + ' views';
    
    // Set description
    elements.videoDescription.textContent = info.description || 'No description available';
    
    // Handle playlist info
    state.isPlaylist = info.is_playlist || false;
    state.playlistVideos = info.playlist_videos || [];
    state.selectedPlaylistIndices = state.playlistVideos.map((_, i) => i); // Select all by default
    
    if (state.isPlaylist && state.playlistVideos.length > 0) {
        elements.playlistNotice.classList.remove('hidden');
        elements.playlistCount.textContent = state.playlistVideos.length;
        renderPlaylistSelection();
    } else {
        elements.playlistNotice.classList.add('hidden');
        elements.playlistSelection.classList.add('hidden');
    }
    
    // Handle available subtitles
    if (info.available_subtitles && info.available_subtitles.length > 0) {
        elements.availableSubs.classList.remove('hidden');
        elements.subsList.textContent = info.available_subtitles.slice(0, 10).join(', ') + 
            (info.available_subtitles.length > 10 ? '...' : '');
    } else {
        elements.availableSubs.classList.add('hidden');
    }
    
    // Show elements
    elements.videoInfo.classList.remove('hidden');
    elements.downloadOptions.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorState.classList.remove('hidden');
    elements.videoInfo.classList.add('hidden');
    elements.downloadOptions.classList.add('hidden');
}

// Format Selection
function selectFormat(format) {
    state.selectedFormat = format;
    
    elements.formatBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
    
    elements.videoOptions.classList.toggle('hidden', format === 'audio');
    elements.audioOptions.classList.toggle('hidden', format === 'video');
}

// Quality Selection
function selectQuality(quality) {
    state.selectedQuality = quality;
    
    elements.qualityBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.quality === quality);
    });
}

// Audio Format Selection
function selectAudioFormat(format) {
    state.selectedAudioFormat = format;
    
    elements.audioFormatBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

// Start Download
async function startDownload() {
    if (!state.currentUrl) {
        showToast('Please fetch a video first', 'warning');
        return;
    }
    
    elements.downloadBtn.disabled = true;
    
    try {
        // Check if this is a playlist with specific selection
        if (state.isPlaylist && state.selectedPlaylistIndices.length > 0) {
            // Use playlist download endpoint
            const response = await fetch('/api/playlist-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: state.currentUrl,
                    quality: state.selectedQuality,
                    audio_only: state.selectedFormat === 'audio',
                    audio_format: state.selectedAudioFormat,
                    selected_indices: state.selectedPlaylistIndices,
                    download_subs: state.downloadSubs,
                    sub_lang: state.subtitleLang,
                    embed_subs: state.embedSubs
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start playlist download');
            }
            
            showToast(`Started downloading ${data.download_ids.length} videos!`, 'success');
            
            // Track all downloads
            data.download_ids.forEach((downloadId, idx) => {
                const videoInfo = state.playlistVideos[state.selectedPlaylistIndices[idx]];
                addActiveDownload(downloadId, videoInfo?.title || `Video ${idx + 1}`);
                trackDownloadProgress(downloadId);
            });
            
        } else {
            // Single video download
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: state.currentUrl,
                    quality: state.selectedQuality,
                    audio_only: state.selectedFormat === 'audio',
                    audio_format: state.selectedAudioFormat,
                    download_subs: state.downloadSubs,
                    sub_lang: state.subtitleLang,
                    embed_subs: state.embedSubs
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to start download');
            }
            
            showToast('Download started!', 'success');
            
            // Add to active downloads
            addActiveDownload(data.download_id, state.videoInfo?.title || 'Video');
            
            // Start tracking progress
            trackDownloadProgress(data.download_id);
        }
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.downloadBtn.disabled = false;
    }
}

// Active Downloads Management
function addActiveDownload(id, title) {
    state.activeDownloads.set(id, {
        id,
        title,
        status: 'pending',
        progress: 0
    });
    
    renderActiveDownloads();
}

function renderActiveDownloads() {
    if (state.activeDownloads.size === 0) {
        elements.activeDownloads.classList.add('hidden');
        return;
    }
    
    elements.activeDownloads.classList.remove('hidden');
    
    elements.downloadsList.innerHTML = Array.from(state.activeDownloads.values())
        .map(download => {
            const isMerging = download.is_merging || download.status === 'processing';
            const statusIcon = download.status === 'completed' ? 'fa-check-circle' : 
                              download.status === 'error' ? 'fa-exclamation-circle' : 
                              isMerging ? 'fa-cog fa-spin' : 'fa-download';
            const progressText = isMerging ? 'Merging video & audio...' : `${download.progress.toFixed(1)}%`;
            
            // Show retry button for failed downloads
            const retryButton = download.status === 'error' && download.can_retry ? 
                `<button class="btn btn-retry" data-id="${download.id}" onclick="retryDownload('${download.id}')">
                    <i class="fas fa-redo"></i> Retry${download.retry_count > 0 ? ` (${download.retry_count}/3)` : ''}
                </button>` : '';
            
            // Show error message if failed
            const errorMessage = download.status === 'error' && download.error ? 
                `<div class="download-error"><i class="fas fa-exclamation-triangle"></i> ${download.error}</div>` : '';
            
            // Show warning message (e.g., subtitle download failed)
            const warningMessage = download.warning ? 
                `<div class="download-warning"><i class="fas fa-exclamation-circle"></i> ${download.warning}</div>` : '';
            
            return `
                <div class="download-item ${download.status === 'error' ? 'has-error' : ''}" data-id="${download.id}">
                    <div class="download-header">
                        <div class="download-title">
                            <i class="fas ${statusIcon}"></i>
                            <span>${download.title}</span>
                        </div>
                        <div class="download-actions">
                            ${retryButton}
                            <span class="download-status ${download.status}">${formatStatus(download.status, download.is_merging)}</span>
                        </div>
                    </div>
                    <div class="download-progress">
                        <div class="download-progress-bar ${isMerging ? 'merging' : ''}" style="width: ${download.progress}%"></div>
                    </div>
                    <div class="download-info">
                        <span><i class="fas fa-percentage"></i> ${progressText}</span>
                        <span><i class="fas fa-tachometer-alt"></i> ${download.speed || '--'}</span>
                        <span><i class="fas fa-clock"></i> ${download.eta || '--'}</span>
                        <span><i class="fas fa-file"></i> ${download.filesize || '--'}</span>
                    </div>
                    ${warningMessage}
                    ${errorMessage}
                </div>
            `;
        }).join('');
}

function formatStatus(status, isMerging = false) {
    if (isMerging) return 'Merging';
    const statusMap = {
        pending: 'Pending',
        starting: 'Starting',
        downloading: 'Downloading',
        processing: 'Processing',
        completed: 'Completed',
        error: 'Error'
    };
    return statusMap[status] || status;
}

// Track Download Progress
function trackDownloadProgress(downloadId) {
    let retryCount = 0;
    const maxRetries = 10;
    
    const checkProgress = async () => {
        try {
            const response = await fetch(`/api/progress/${downloadId}`);
            const data = await response.json();
            
            // Handle "Download not found" - the download might still be initializing
            if (data.error === 'Download not found') {
                retryCount++;
                if (retryCount < maxRetries) {
                    // Keep retrying - the download thread might not have started yet
                    console.log(`Progress not found yet, retry ${retryCount}/${maxRetries}`);
                    setTimeout(checkProgress, 1000);
                    return;
                } else {
                    console.error('Progress error after max retries:', data.error);
                    // Mark as error in UI
                    const download = state.activeDownloads.get(downloadId);
                    if (download) {
                        download.status = 'error';
                        download.error = 'Download tracking lost. Check library for completed files.';
                        renderActiveDownloads();
                    }
                    return;
                }
            }
            
            // Reset retry count on successful response
            retryCount = 0;
            
            // Update state
            const download = state.activeDownloads.get(downloadId);
            if (download) {
                Object.assign(download, {
                    status: data.status,
                    progress: data.progress || 0,
                    speed: data.speed || '',
                    eta: data.eta || '',
                    filesize: data.filesize || '',
                    title: data.title || download.title,
                    is_merging: data.is_merging || false,
                    can_retry: data.can_retry || false,
                    retry_count: data.retry_count || 0,
                    error: data.error || '',
                    warning: data.warning || '',
                    url: data.url || download.url
                });
                
                renderActiveDownloads();
                
                // Continue polling if not finished
                if (data.status !== 'completed' && data.status !== 'error') {
                    // Use shorter interval during active download, longer during processing
                    const interval = data.status === 'processing' ? 1000 : 500;
                    setTimeout(checkProgress, interval);
                } else if (data.status === 'completed') {
                    showToast(`Download completed: ${data.title || 'Video'}`, 'success');
                    // Refresh library if on library tab
                    if (state.currentTab === 'library') {
                        loadLibrary();
                    }
                } else if (data.status === 'error') {
                    showToast(`Download failed: ${data.error || 'Unknown error'}. ${data.can_retry ? 'Click Retry to try again.' : ''}`, 'error');
                }
            } else {
                // Download was removed from UI but might still be running
                if (data.status !== 'completed' && data.status !== 'error') {
                    setTimeout(checkProgress, 1000);
                }
            }
        } catch (error) {
            console.error('Failed to check progress:', error);
            retryCount++;
            if (retryCount < maxRetries) {
                setTimeout(checkProgress, 1500);
            }
        }
    };
    
    checkProgress();
}

// Retry a failed download
async function retryDownload(downloadId) {
    try {
        const download = state.activeDownloads.get(downloadId);
        if (!download) {
            showToast('Download not found', 'error');
            return;
        }
        
        showToast('Retrying download...', 'info');
        
        const response = await fetch(`/api/retry/${downloadId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to retry download');
        }
        
        // Reset local state
        download.status = 'pending';
        download.progress = 0;
        download.error = '';
        download.retry_count = data.retry_count;
        renderActiveDownloads();
        
        // Resume progress tracking
        trackDownloadProgress(downloadId);
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Make retryDownload available globally for onclick handler
window.retryDownload = retryDownload;

// Library Functions
async function loadLibrary() {
    try {
        const response = await fetch('/api/downloads');
        const files = await response.json();
        
        if (files.error) {
            throw new Error(files.error);
        }
        
        if (files.length === 0) {
            elements.libraryEmpty.classList.remove('hidden');
            elements.libraryFiles.classList.add('hidden');
            return;
        }
        
        elements.libraryEmpty.classList.add('hidden');
        elements.libraryFiles.classList.remove('hidden');
        
        elements.libraryFiles.innerHTML = files.map(file => `
            <div class="file-item" data-filename="${file.filename}">
                <div class="file-icon ${isAudioFile(file.filename) ? 'audio' : ''}">
                    <i class="fas ${isAudioFile(file.filename) ? 'fa-music' : 'fa-video'}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.filename}">${file.filename}</div>
                    <div class="file-meta">
                        <span><i class="fas fa-file"></i> ${formatFileSize(file.size)}</span>
                        <span><i class="fas fa-calendar"></i> ${formatDate(file.modified)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-primary btn-download-file" data-filename="${file.filename}">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-danger btn-delete-file" data-filename="${file.filename}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        elements.libraryFiles.querySelectorAll('.btn-download-file').forEach(btn => {
            btn.addEventListener('click', () => downloadFile(btn.dataset.filename));
        });
        
        elements.libraryFiles.querySelectorAll('.btn-delete-file').forEach(btn => {
            btn.addEventListener('click', () => deleteFile(btn.dataset.filename));
        });
        
    } catch (error) {
        showToast('Failed to load library: ' + error.message, 'error');
    }
}

function downloadFile(filename) {
    const link = document.createElement('a');
    link.href = `/api/download/file/${encodeURIComponent(filename)}`;
    link.download = filename;
    link.click();
    showToast('Download started', 'success');
}

async function deleteFile(filename) {
    if (!confirm(`Delete "${filename}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/delete/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete file');
        }
        
        showToast('File deleted successfully', 'success');
        loadLibrary();
        
    } catch (error) {
        showToast('Failed to delete: ' + error.message, 'error');
    }
}

// Supported Sites
async function loadSupportedSites() {
    if (elements.supportedSitesList.children.length > 0) {
        return; // Already loaded
    }
    
    try {
        const response = await fetch('/api/supported-sites');
        const sites = await response.json();
        
        elements.supportedSitesList.innerHTML = sites.slice(0, 50)
            .map(site => `<span class="site-badge">${site}</span>`)
            .join('');
        
    } catch (error) {
        console.error('Failed to load supported sites:', error);
    }
}

// Event Listeners
function initializeEventListeners() {
    // Navigation
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(link.dataset.tab);
        });
    });
    
    // URL Input
    elements.fetchBtn.addEventListener('click', fetchVideoInfo);
    elements.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchVideoInfo();
        }
    });
    
    // Retry button
    elements.retryBtn.addEventListener('click', fetchVideoInfo);
    
    // Format toggle
    elements.formatBtns.forEach(btn => {
        btn.addEventListener('click', () => selectFormat(btn.dataset.format));
    });
    
    // Quality selection
    elements.qualityBtns.forEach(btn => {
        btn.addEventListener('click', () => selectQuality(btn.dataset.quality));
    });
    
    // Audio format selection
    elements.audioFormatBtns.forEach(btn => {
        btn.addEventListener('click', () => selectAudioFormat(btn.dataset.format));
    });
    
    // Download button
    elements.downloadBtn.addEventListener('click', startDownload);
    
    // Refresh library
    elements.refreshLibraryBtn.addEventListener('click', loadLibrary);
    
    // Handle paste
    elements.urlInput.addEventListener('paste', (e) => {
        // Auto-fetch after paste
        setTimeout(() => {
            if (elements.urlInput.value.trim()) {
                fetchVideoInfo();
            }
        }, 100);
    });
    
    // ==================== SUBTITLE OPTIONS ====================
    if (elements.downloadSubsCheckbox) {
        elements.downloadSubsCheckbox.addEventListener('change', (e) => {
            state.downloadSubs = e.target.checked;
            elements.subtitleLangGroup.classList.toggle('hidden', !e.target.checked);
        });
    }
    
    if (elements.embedSubsCheckbox) {
        elements.embedSubsCheckbox.addEventListener('change', (e) => {
            state.embedSubs = e.target.checked;
        });
    }
    
    if (elements.subtitleLangSelect) {
        elements.subtitleLangSelect.addEventListener('change', (e) => {
            state.subtitleLang = e.target.value;
        });
    }
    
    // ==================== PLAYLIST OPTIONS ====================
    if (elements.selectPlaylistVideosBtn) {
        elements.selectPlaylistVideosBtn.addEventListener('click', () => {
            elements.playlistSelection.classList.toggle('hidden');
        });
    }
    
    if (elements.selectAllPlaylist) {
        elements.selectAllPlaylist.addEventListener('click', () => {
            state.selectedPlaylistIndices = state.playlistVideos.map((_, i) => i);
            renderPlaylistSelection();
            updateDownloadButtonText();
        });
    }
    
    if (elements.deselectAllPlaylist) {
        elements.deselectAllPlaylist.addEventListener('click', () => {
            state.selectedPlaylistIndices = [];
            renderPlaylistSelection();
            updateDownloadButtonText();
        });
    }
    
    // ==================== BATCH DOWNLOAD ====================
    if (elements.batchUrls) {
        elements.batchUrls.addEventListener('input', updateUrlCount);
    }
    
    if (elements.batchFormatBtns) {
        elements.batchFormatBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                state.batchFormat = btn.dataset.format;
                elements.batchFormatBtns.forEach(b => b.classList.toggle('active', b === btn));
                if (elements.batchAudioFormatRow) {
                    elements.batchAudioFormatRow.classList.toggle('hidden', state.batchFormat !== 'audio');
                }
            });
        });
    }
    
    if (elements.batchQuality) {
        elements.batchQuality.addEventListener('change', (e) => {
            state.batchQuality = e.target.value;
        });
    }
    
    if (elements.batchAudioFormat) {
        elements.batchAudioFormat.addEventListener('change', (e) => {
            state.batchAudioFormat = e.target.value;
        });
    }
    
    if (elements.batchDownloadSubs) {
        elements.batchDownloadSubs.addEventListener('change', (e) => {
            state.batchDownloadSubs = e.target.checked;
        });
    }
    
    if (elements.batchDownloadBtn) {
        elements.batchDownloadBtn.addEventListener('click', startBatchDownload);
    }
    
    // ==================== HISTORY ====================
    if (elements.historySearch) {
        let searchTimeout;
        elements.historySearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.historySearch = e.target.value.trim();
                state.historyPage = 0;
                loadHistory();
            }, 300);
        });
    }
    
    if (elements.clearHistoryBtn) {
        elements.clearHistoryBtn.addEventListener('click', clearAllHistory);
    }
    
    if (elements.historyPrev) {
        elements.historyPrev.addEventListener('click', () => {
            if (state.historyPage > 0) {
                state.historyPage--;
                loadHistory();
            }
        });
    }
    
    if (elements.historyNext) {
        elements.historyNext.addEventListener('click', () => {
            state.historyPage++;
            loadHistory();
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    
    // Focus on URL input
    elements.urlInput.focus();
});

// ==================== PLAYLIST FUNCTIONS ====================

function renderPlaylistSelection() {
    elements.playlistItems.innerHTML = state.playlistVideos.map((video, index) => `
        <div class="playlist-item" data-index="${index}">
            <label class="checkbox-label">
                <input type="checkbox" class="playlist-checkbox" data-index="${index}" 
                    ${state.selectedPlaylistIndices.includes(index) ? 'checked' : ''}>
                <div class="playlist-item-info">
                    <span class="playlist-item-num">${index + 1}</span>
                    <span class="playlist-item-title">${video.title || 'Unknown'}</span>
                    <span class="playlist-item-duration">${formatDuration(video.duration)}</span>
                </div>
            </label>
        </div>
    `).join('');
    
    // Add event listeners for checkboxes
    elements.playlistItems.querySelectorAll('.playlist-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (e.target.checked) {
                if (!state.selectedPlaylistIndices.includes(index)) {
                    state.selectedPlaylistIndices.push(index);
                }
            } else {
                state.selectedPlaylistIndices = state.selectedPlaylistIndices.filter(i => i !== index);
            }
            updateDownloadButtonText();
        });
    });
}

function updateDownloadButtonText() {
    if (state.isPlaylist && state.selectedPlaylistIndices.length > 0) {
        elements.downloadBtn.innerHTML = `
            <i class="fas fa-download"></i>
            <span>Download ${state.selectedPlaylistIndices.length} Video${state.selectedPlaylistIndices.length > 1 ? 's' : ''}</span>
        `;
    } else {
        elements.downloadBtn.innerHTML = `
            <i class="fas fa-download"></i>
            <span>Download</span>
        `;
    }
}

// ==================== BATCH DOWNLOAD FUNCTIONS ====================

function updateUrlCount() {
    const urls = elements.batchUrls.value.trim().split('\n').filter(url => url.trim().length > 0);
    elements.urlCount.textContent = urls.length;
}

async function startBatchDownload() {
    const urlsText = elements.batchUrls.value.trim();
    const urls = urlsText.split('\n').filter(url => url.trim().length > 0).map(url => url.trim());
    
    if (urls.length === 0) {
        showToast('Please enter at least one URL', 'warning');
        return;
    }
    
    // Validate URLs
    const validUrls = [];
    for (const url of urls) {
        try {
            new URL(url);
            validUrls.push(url);
        } catch {
            showToast(`Invalid URL skipped: ${url.substring(0, 50)}...`, 'warning');
        }
    }
    
    if (validUrls.length === 0) {
        showToast('No valid URLs found', 'error');
        return;
    }
    
    elements.batchDownloadBtn.disabled = true;
    
    try {
        const response = await fetch('/api/batch-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls: validUrls,
                quality: state.batchQuality,
                audio_only: state.batchFormat === 'audio',
                audio_format: state.batchAudioFormat,
                download_subs: state.batchDownloadSubs,
                sub_lang: 'en',
                embed_subs: false
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to start batch download');
        }
        
        showToast(`Started ${data.download_ids.length} downloads!`, 'success');
        
        // Show batch queue
        elements.batchQueue.classList.remove('hidden');
        
        // Track all downloads
        data.download_ids.forEach((downloadId, idx) => {
            addActiveDownload(downloadId, `Video ${idx + 1} of ${data.download_ids.length}`);
            trackDownloadProgress(downloadId);
        });
        
        // Clear the textarea
        elements.batchUrls.value = '';
        updateUrlCount();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.batchDownloadBtn.disabled = false;
    }
}

// ==================== HISTORY FUNCTIONS ====================

async function loadHistory() {
    try {
        const params = new URLSearchParams({
            limit: state.historyLimit,
            offset: state.historyPage * state.historyLimit
        });
        
        if (state.historySearch) {
            params.append('search', state.historySearch);
        }
        
        const response = await fetch(`/api/history?${params}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        const history = data.history || [];
        const total = data.total || 0;
        
        if (history.length === 0) {
            elements.historyEmpty.classList.remove('hidden');
            elements.historyList.classList.add('hidden');
            elements.historyPagination.classList.add('hidden');
            return;
        }
        
        elements.historyEmpty.classList.add('hidden');
        elements.historyList.classList.remove('hidden');
        
        elements.historyList.innerHTML = history.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-thumbnail">
                    ${item.thumbnail ? 
                        `<img src="${item.thumbnail}" alt="Thumbnail" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 68%22><rect fill=%22%23334155%22 width=%22120%22 height=%2268%22/><text x=%2250%%22 y=%2250%%22 fill=%22%2394a3b8%22 font-size=%2210%22 text-anchor=%22middle%22>No Thumb</text></svg>'">` : 
                        `<div class="no-thumbnail"><i class="fas fa-video"></i></div>`
                    }
                </div>
                <div class="history-info">
                    <div class="history-title" title="${item.title}">${item.title}</div>
                    <div class="history-meta">
                        <span><i class="fas fa-globe"></i> ${item.site || 'Unknown'}</span>
                        <span><i class="fas fa-${item.format_type === 'audio' ? 'music' : 'video'}"></i> ${item.format_type || 'video'}</span>
                        <span><i class="fas fa-calendar"></i> ${formatDate(item.downloaded_at)}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="btn btn-primary btn-small btn-redownload" data-id="${item.id}" title="Download again">
                        <i class="fas fa-redo"></i>
                    </button>
                    <button class="btn btn-secondary btn-small btn-copy-url" data-url="${item.url}" title="Copy URL">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-danger btn-small btn-delete-history" data-id="${item.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        elements.historyList.querySelectorAll('.btn-redownload').forEach(btn => {
            btn.addEventListener('click', () => redownloadFromHistory(btn.dataset.id));
        });
        
        elements.historyList.querySelectorAll('.btn-copy-url').forEach(btn => {
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(btn.dataset.url);
                showToast('URL copied to clipboard', 'success');
            });
        });
        
        elements.historyList.querySelectorAll('.btn-delete-history').forEach(btn => {
            btn.addEventListener('click', () => deleteHistoryItem(btn.dataset.id));
        });
        
        // Update pagination
        const totalPages = Math.ceil(total / state.historyLimit);
        if (totalPages > 1) {
            elements.historyPagination.classList.remove('hidden');
            elements.historyPageInfo.textContent = `Page ${state.historyPage + 1} of ${totalPages}`;
            elements.historyPrev.disabled = state.historyPage === 0;
            elements.historyNext.disabled = state.historyPage >= totalPages - 1;
        } else {
            elements.historyPagination.classList.add('hidden');
        }
        
    } catch (error) {
        showToast('Failed to load history: ' + error.message, 'error');
    }
}

async function redownloadFromHistory(historyId) {
    try {
        showToast('Starting download...', 'info');
        
        const response = await fetch(`/api/history/redownload/${historyId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to start download');
        }
        
        showToast('Download started!', 'success');
        
        // Track the download
        addActiveDownload(data.download_id, 'Re-downloading...');
        trackDownloadProgress(data.download_id);
        
        // Switch to download tab
        switchTab('download');
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteHistoryItem(historyId) {
    if (!confirm('Delete this item from history?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/history/${historyId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete');
        }
        
        showToast('Deleted from history', 'success');
        loadHistory();
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function clearAllHistory() {
    if (!confirm('Clear all download history? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/history/clear', {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to clear history');
        }
        
        showToast('History cleared', 'success');
        loadHistory();
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}
