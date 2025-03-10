/**
 * YouTube Timestamp Bookmarker
 * Content script for interacting with YouTube player
 */

// Main extension state
const YTBM = {
  initialized: false,
  videoId: null,
  bookmarks: [],
  currentBookmarkIndex: -1,
  settings: {
    markerColor: '#ff0000',
    markerShape: 'circle',
    markerSize: 3,
    darkMode: false,
    showNoteEditor: true,
    defaultNoteText: '',
    defaultNoteTag: '',
    pauseOnBookmark: true
  },
  tags: ['important', 'review', 'funny', 'question', 'custom'],
  player: null,
  progressBar: null,
  noteEditor: null,
  activeBookmark: null,
  observer: null,
  updateDebounceTimer: null
};

// DOM and video helper functions
function isYouTubeVideo() {
  return window.location.href.includes('youtube.com/watch');
}

function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

function getVideoTitle() {
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
  return titleElement ? titleElement.textContent.trim() : 'Untitled Video';
}

function getVideoElement() {
  return document.querySelector('video');
}

// Format timestamp to readable format (e.g. 1:23)
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  let result = '';
  
  if (hrs > 0) {
    result += `${hrs}:${mins < 10 ? '0' : ''}`;
  }
  
  result += `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  
  return result;
}

// Storage functions
function loadSettings(callback) {
  chrome.storage.local.get(['settings', 'tags'], (result) => {
    if (result.settings) {
      YTBM.settings = result.settings;
    }
    if (result.tags) {
      YTBM.tags = result.tags;
    }
    if (callback) callback();
  });
}

function loadBookmarks(videoId) {
  chrome.storage.local.get('bookmarks', (result) => {
    const allBookmarks = result.bookmarks || {};
    YTBM.bookmarks = allBookmarks[videoId] || [];
    
    // Sort bookmarks by time
    YTBM.bookmarks.sort((a, b) => a.time - b.time);
    
    // Update markers on progress bar
    updateProgressBarMarkers();
  });
}

function saveBookmark(videoId, time, note = '', tags = []) {
  try {
    // Generate a unique ID for the bookmark
    const bookmarkId = Date.now().toString();
    
    // Create bookmark object with video title
    const bookmark = {
      id: bookmarkId,
      videoId,
      time,
      note,
      tags,
      createdAt: new Date().toISOString(),
      videoTitle: getVideoTitle()
    };
    
    // Add to local bookmarks array
    YTBM.bookmarks.push(bookmark);
    
    // Sort bookmarks by time
    YTBM.bookmarks.sort((a, b) => a.time - b.time);
    
    // Update storage
    chrome.storage.local.get('bookmarks', (result) => {
      const allBookmarks = result.bookmarks || {};
      allBookmarks[videoId] = YTBM.bookmarks;
      
      chrome.storage.local.set({ bookmarks: allBookmarks }, () => {
        // Handle any potential error
        if (chrome.runtime.lastError) {
          console.error('Failed to save bookmark:', chrome.runtime.lastError);
          alert('Failed to save bookmark. Please try again.');
          return;
        }
        
        // Update markers on progress bar
        updateProgressBarMarkers();
        
        // Show feedback animation
        showBookmarkFeedback();
      });
    });
    
    return bookmark;
  } catch (error) {
    console.error('Error saving bookmark:', error);
    return null;
  }
}

function updateBookmark(bookmark) {
  chrome.storage.local.get('bookmarks', (result) => {
    const allBookmarks = result.bookmarks || {};
    const videoBookmarks = allBookmarks[bookmark.videoId] || [];
    
    // Find and update the bookmark
    const index = videoBookmarks.findIndex(b => b.id === bookmark.id);
    if (index !== -1) {
      videoBookmarks[index] = bookmark;
      allBookmarks[bookmark.videoId] = videoBookmarks;
      
      // Update storage
      chrome.storage.local.set({ bookmarks: allBookmarks }, () => {
        // Reload bookmarks
        loadBookmarks(YTBM.videoId);
      });
    }
  });
}

function deleteBookmark(bookmark) {
  chrome.storage.local.get('bookmarks', (result) => {
    const allBookmarks = result.bookmarks || {};
    const videoBookmarks = allBookmarks[bookmark.videoId] || [];
    
    // Remove the bookmark
    const filteredBookmarks = videoBookmarks.filter(b => b.id !== bookmark.id);
    allBookmarks[bookmark.videoId] = filteredBookmarks;
    
    // Update storage
    chrome.storage.local.set({ bookmarks: allBookmarks }, () => {
      // Reload bookmarks
      YTBM.bookmarks = filteredBookmarks;
      updateProgressBarMarkers();
    });
  });
}

// Security utility functions
function sanitizeHTML(html) {
  if (!html) return '';
  
  // Use DOMParser to parse the HTML safely
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Get body content
  const body = doc.body;
  
  // Whitelist allowed tags and attributes
  const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'p', 'span', 'div', 'br'];
  const allowedAttrs = ['href', 'target', 'rel'];
  
  // Process all nodes recursively
  function processNode(node) {
    // Skip non-element nodes (text nodes, etc.)
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return node.cloneNode(true);
    }
    
    // Check if tag is allowed
    const tagName = node.tagName.toLowerCase();
    if (!allowedTags.includes(tagName)) {
      // Not allowed, just return text content
      const textNode = document.createTextNode(node.textContent);
      return textNode;
    }
    
    // Create a new clean element
    const newElement = document.createElement(tagName);
    
    // Copy allowed attributes
    Array.from(node.attributes).forEach(attr => {
      if (allowedAttrs.includes(attr.name)) {
        // Special check for href to prevent javascript: URLs
        if (attr.name === 'href' && attr.value.toLowerCase().startsWith('javascript:')) {
          newElement.setAttribute(attr.name, '#');
        } else {
          newElement.setAttribute(attr.name, attr.value);
        }
      }
    });
    
    // Process children recursively
    Array.from(node.childNodes).forEach(child => {
      const newChild = processNode(child);
      if (newChild) {
        newElement.appendChild(newChild);
      }
    });
    
    return newElement;
  }
  
  // Create a new document fragment with cleaned content
  const fragment = document.createDocumentFragment();
  Array.from(body.childNodes).forEach(child => {
    const processedNode = processNode(child);
    if (processedNode) {
      fragment.appendChild(processedNode);
    }
  });
  
  // Create a temp div to get HTML string
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment.cloneNode(true));
  
  return tempDiv.innerHTML;
}

function sanitizeHTMLToText(html) {
  if (!html) return '';
  
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// UI Interface Functions
function addBookmarkButton() {
  // Check if button already exists
  if (document.querySelector('.ytbm-bookmark-btn')) {
    return;
  }
  
  // Find the right control panel
  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) return;
  
  // Create bookmark button
  const bookmarkButton = document.createElement('button');
  bookmarkButton.className = 'ytp-button ytbm-bookmark-btn';
  bookmarkButton.title = 'Add bookmark (S)';
  bookmarkButton.innerHTML = `
    <svg height="100%" version="1.1" viewBox="0 0 24 24" width="100%">
      <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M16,13h-3v3c0,0.55-0.45,1-1,1s-1-0.45-1-1v-3H8
        c-0.55,0-1-0.45-1-1s0.45-1,1-1h3V8c0-0.55,0.45-1,1-1s1,0.45,1,1v3h3c0.55,0,1,0.45,1,1S16.55,13,16,13z" fill="white"/>
    </svg>
  `;
  
  // Add click event
  bookmarkButton.addEventListener('click', addCurrentTimeBookmark);
  
  // Insert at the beginning of right controls
  rightControls.insertBefore(bookmarkButton, rightControls.firstChild);
}

function updateProgressBarMarkers() {
  // Debounce the update function
  clearTimeout(YTBM.updateDebounceTimer);
  YTBM.updateDebounceTimer = setTimeout(() => {
    // Remove existing markers
    const existingMarkers = document.querySelectorAll('.ytbm-marker');
    existingMarkers.forEach(marker => marker.remove());
    
    if (!YTBM.progressBar || !YTBM.bookmarks.length) return;
    
    // Get video duration
    const video = getVideoElement();
    if (!video) return;
    
    const duration = video.duration;
    if (!duration || isNaN(duration)) return;
    
    // Add markers for each bookmark
    YTBM.bookmarks.forEach(bookmark => {
      addMarkerToProgressBar(bookmark, duration);
    });
  }, 300);
}

function addMarkerToProgressBar(bookmark, duration) {
  // Create marker element
  const marker = document.createElement('div');
  marker.className = 'ytbm-marker';
  marker.setAttribute('data-id', bookmark.id);
  marker.setAttribute('data-time', bookmark.time);
  
  // Set position based on timestamp percentage
  const percent = (bookmark.time / duration) * 100;
  marker.style.left = `${percent}%`;
  
  // Set color and shape based on settings
  marker.style.backgroundColor = YTBM.settings.markerColor;
  
  // Apply size for better visibility
  const markerSize = YTBM.settings.markerSize * 2;
  marker.style.width = `${markerSize}px`;
  marker.style.height = `${markerSize}px`;
  
  // Apply shape
  switch (YTBM.settings.markerShape) {
    case 'square':
      marker.style.borderRadius = '0';
      break;
    case 'triangle':
      marker.style.backgroundColor = 'transparent';
      marker.style.borderLeft = `${YTBM.settings.markerSize / 2}px solid transparent`;
      marker.style.borderRight = `${YTBM.settings.markerSize / 2}px solid transparent`;
      marker.style.borderBottom = `${YTBM.settings.markerSize}px solid ${YTBM.settings.markerColor}`;
      marker.style.width = '0';
      marker.style.height = '0';
      break;
    case 'ring':
      marker.style.backgroundColor = 'transparent';
      marker.style.border = `2px solid ${YTBM.settings.markerColor}`;
      break;
    default: // circle
      marker.style.borderRadius = '50%';
  }
  
  // Add tooltip with time or note
  const tooltipText = bookmark.note ? 
    sanitizeHTMLToText(bookmark.note).substring(0, 50) + (sanitizeHTMLToText(bookmark.note).length > 50 ? '...' : '') : 
    formatTime(bookmark.time);
  
  marker.setAttribute('title', tooltipText);
  
  // Add tags as data attribute for styling
  if (bookmark.tags && bookmark.tags.length) {
    marker.setAttribute('data-tags', bookmark.tags.join(','));
  }
  
  // Add click event
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    // Jump to timestamp
    const video = getVideoElement();
    if (video) {
      video.currentTime = bookmark.time;
    }
    
    // Open editor
    openNoteEditor(bookmark);
  });
  
  // Add to progress bar
  YTBM.progressBar.appendChild(marker);
}

function showBookmarkFeedback() {
  // Create feedback element
  const feedback = document.createElement('div');
  feedback.className = 'ytbm-feedback';
  feedback.textContent = 'Bookmark added!';
  
  // Add to page
  document.body.appendChild(feedback);
  
  // Trigger animation
  setTimeout(() => {
    feedback.classList.add('show');
  }, 10);
  
  // Remove after animation
  setTimeout(() => {
    feedback.classList.remove('show');
    setTimeout(() => {
      feedback.remove();
    }, 300);
  }, 2000);
}

// Note Editor Functions
function createNoteEditor() {
  // Remove existing editor if any
  if (YTBM.noteEditor) {
    YTBM.noteEditor.remove();
  }
  
  // Create editor container
  const editor = document.createElement('div');
  editor.className = 'ytbm-note-editor';
  editor.style.display = 'none';
  
  // Add editor content
  editor.innerHTML = `
    <div class="ytbm-note-header">
      <span class="ytbm-note-title">Bookmark Note</span>
      <div>
        <select class="ytbm-note-tags" multiple>
          <!-- Tags will be added dynamically -->
        </select>
      </div>
      <button class="ytbm-note-close">×</button>
    </div>
    <div class="ytbm-note-toolbar">
      <button data-format="bold" title="Bold"><b>B</b></button>
      <button data-format="italic" title="Italic"><i>I</i></button>
      <button data-format="underline" title="Underline"><u>U</u></button>
      <button data-format="insertUnorderedList" title="Bullet List">• List</button>
    </div>
    <div class="ytbm-note-content" contenteditable="true"></div>
    <div class="ytbm-note-footer">
      <span class="ytbm-timestamp"></span>
      <div class="ytbm-note-actions">
        <button class="ytbm-note-delete">Delete</button>
        <button class="ytbm-note-save">Save</button>
      </div>
    </div>
  `;
  
  // Add event listeners
  const contentEl = editor.querySelector('.ytbm-note-content');
  
  editor.querySelector('.ytbm-note-close').addEventListener('click', closeNoteEditor);
  editor.querySelector('.ytbm-note-save').addEventListener('click', saveNoteContent);
  editor.querySelector('.ytbm-note-delete').addEventListener('click', deleteCurrentBookmark);
  
  contentEl.addEventListener('mouseup', updateFormatButtons);
  contentEl.addEventListener('keyup', updateFormatButtons);
  contentEl.addEventListener('click', updateFormatButtons);
  
  // Add formatting button listeners
  const toolbarButtons = editor.querySelectorAll('.ytbm-note-toolbar button');
  toolbarButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const format = button.getAttribute('data-format');
      document.execCommand(format, false, null);
      updateFormatButtons();
      contentEl.focus();
    });
  });
  
  // Prevent spacebar from controlling video playback when editing
  contentEl.addEventListener('keydown', e => e.stopPropagation());
  contentEl.addEventListener('keyup', e => e.stopPropagation());
  contentEl.addEventListener('keypress', e => e.stopPropagation());
  
  // Add to page
  document.body.appendChild(editor);
  YTBM.noteEditor = editor;
  updateNoteEditorTags();
  
  // Apply dark mode if needed
  applyDarkMode();
}

function openNoteEditor(bookmark) {
  if (!YTBM.noteEditor || !bookmark) return;
  
  // Set active bookmark
  YTBM.activeBookmark = bookmark;
  
  // Fill content
  const contentEl = YTBM.noteEditor.querySelector('.ytbm-note-content');
  contentEl.innerHTML = sanitizeHTML(bookmark.note);
  
  // Set timestamp
  const timestampEl = YTBM.noteEditor.querySelector('.ytbm-timestamp');
  timestampEl.textContent = formatTime(bookmark.time);
  
  // Set tags
  updateNoteEditorTags();
  
  // Position editor next to the marker
  positionEditor(bookmark);
  
  // Show editor
  YTBM.noteEditor.style.display = 'flex';
  contentEl.focus();
}

function positionEditor(bookmark) {
  // Find the marker element
  const marker = document.querySelector(`.ytbm-marker[data-id="${bookmark.id}"]`);
  if (!marker) {
    // If marker not found, position at center
    YTBM.noteEditor.style.left = '50%';
    YTBM.noteEditor.style.top = '50%';
    YTBM.noteEditor.style.transform = 'translate(-50%, -50%)';
    return;
  }
  
  // Get marker position
  const rect = marker.getBoundingClientRect();
  const editorHeight = 300; // Estimated height
  
  // Calculate position (position above the marker)
  let top = rect.top - editorHeight - 10;
  if (top < 10) {
    // Not enough space above, position below
    top = rect.bottom + 10;
  }
  
  // Apply positions
  YTBM.noteEditor.style.left = `${rect.left}px`;
  YTBM.noteEditor.style.top = `${top}px`;
  YTBM.noteEditor.style.transform = 'none';
}

function closeNoteEditor() {
  if (!YTBM.noteEditor) return;
  YTBM.noteEditor.style.display = 'none';
  YTBM.activeBookmark = null;
}

function saveNoteContent() {
  if (!YTBM.noteEditor || !YTBM.activeBookmark) return;
  
  // Get content
  const content = YTBM.noteEditor.querySelector('.ytbm-note-content').innerHTML;
  
  // Get selected tags
  const tagsSelect = YTBM.noteEditor.querySelector('.ytbm-note-tags');
  const selectedTags = Array.from(tagsSelect.selectedOptions).map(option => option.value);
  
  // Update bookmark
  const updatedBookmark = {
    ...YTBM.activeBookmark,
    note: sanitizeHTML(content),
    tags: selectedTags
  };
  
  // Save to storage
  updateBookmark(updatedBookmark);
  
  // Close editor
  closeNoteEditor();
}

function deleteCurrentBookmark() {
  if (!YTBM.activeBookmark) return;
  
  if (confirm('Are you sure you want to delete this bookmark?')) {
    deleteBookmark(YTBM.activeBookmark);
    closeNoteEditor();
  }
}

function updateNoteEditorTags() {
  if (!YTBM.noteEditor) return;
  
  // Get the tags select element
  const tagsSelect = YTBM.noteEditor.querySelector('.ytbm-note-tags');
  if (!tagsSelect) return;
  
  // Clear existing options
  tagsSelect.innerHTML = '';
  
  // Get current tags from storage
  chrome.storage.local.get('tags', (result) => {
    const tags = result.tags || YTBM.tags;
    
    // Add options for each tag
    tags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
      tagsSelect.appendChild(option);
    });
    
    // Re-select tags if there's an active bookmark
    if (YTBM.activeBookmark && YTBM.activeBookmark.tags) {
      Array.from(tagsSelect.options).forEach(option => {
        option.selected = YTBM.activeBookmark.tags.includes(option.value);
      });
    }
  });
}

function updateFormatButtons() {
  // Get all format buttons
  const formatButtons = document.querySelectorAll('[data-format]');
  
  // Check each format state
  formatButtons.forEach(button => {
    const format = button.getAttribute('data-format');
    let isActive = false;
    
    // Check if format is active
    try {
      isActive = document.queryCommandState(format);
      
      // Toggle active class
      if (isActive) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    } catch (e) {
      console.error('Error checking format state:', e);
    }
  });
}

function applyDarkMode() {
  if (!YTBM.noteEditor) return;
  
  if (YTBM.settings.darkMode) {
    YTBM.noteEditor.classList.add('dark-mode');
  } else {
    YTBM.noteEditor.classList.remove('dark-mode');
  }
}

// User Action Functions
function addCurrentTimeBookmark() {
  const video = getVideoElement();
  if (!video) return;
  
  // Get current settings
  loadSettings(() => {
    const { showNoteEditor, defaultNoteText, defaultNoteTag, pauseOnBookmark } = YTBM.settings;
    
    // Pause video if setting enabled
    if (pauseOnBookmark && !video.paused) {
      video.pause();
    }
    
    const currentTime = video.currentTime;
    
    // Save bookmark
    let tags = [];
    if (defaultNoteTag) {
      tags = [defaultNoteTag];
    }
    
    const newBookmark = saveBookmark(YTBM.videoId, currentTime, defaultNoteText, tags);
    
    // Set active bookmark
    YTBM.activeBookmark = newBookmark;
    
    // Only open editor if setting enabled
    if (showNoteEditor) {
      openNoteEditor(newBookmark);
    }
  });
}

function goToPreviousBookmark() {
  if (!YTBM.bookmarks.length) return;
  
  const video = getVideoElement();
  if (!video) return;
  
  const currentTime = video.currentTime;
  
  // Find the previous bookmark
  let prevBookmark = null;
  for (let i = YTBM.bookmarks.length - 1; i >= 0; i--) {
    if (YTBM.bookmarks[i].time < currentTime - 0.5) { // Small threshold to avoid the current bookmark
      prevBookmark = YTBM.bookmarks[i];
      break;
    }
  }
  
  // If no previous bookmark found, go to the last one
  if (!prevBookmark && YTBM.bookmarks.length) {
    prevBookmark = YTBM.bookmarks[YTBM.bookmarks.length - 1];
  }
  
  // Navigate to the bookmark
  if (prevBookmark) {
    video.currentTime = prevBookmark.time;
  }
}

function goToNextBookmark() {
  if (!YTBM.bookmarks.length) return;
  
  const video = getVideoElement();
  if (!video) return;
  
  const currentTime = video.currentTime;
  
  // Find the next bookmark
  let nextBookmark = null;
  for (let i = 0; i < YTBM.bookmarks.length; i++) {
    if (YTBM.bookmarks[i].time > currentTime + 0.5) { // Small threshold to avoid the current bookmark
      nextBookmark = YTBM.bookmarks[i];
      break;
    }
  }
  
  // If no next bookmark found, go to the first one
  if (!nextBookmark && YTBM.bookmarks.length) {
    nextBookmark = YTBM.bookmarks[0];
  }
  
  // Navigate to the bookmark
  if (nextBookmark) {
    video.currentTime = nextBookmark.time;
  }
}

// Setup Functions
function setupObservers() {
  // Remove existing observer
  if (YTBM.observer) {
    YTBM.observer.disconnect();
  }
  
  // Create new observer for the main container
  const targetNode = document.querySelector('body');
  const config = { childList: true, subtree: true };
  
  YTBM.observer = new MutationObserver((mutations) => {
    // Check for URL/video ID changes
    const currentVideoId = getVideoId();
    
    if (currentVideoId && currentVideoId !== YTBM.videoId) {
      console.log('Video ID changed from', YTBM.videoId, 'to', currentVideoId);
      
      YTBM.videoId = currentVideoId;
      loadBookmarks(currentVideoId);
      addBookmarkButton();
      
      // Notify popup about video change with new title
      const videoTitle = getVideoTitle();
      chrome.runtime.sendMessage({ 
        action: 'videoChanged',
        videoId: currentVideoId,
        videoTitle: videoTitle
      });
    }
    
    // Check if progress bar has changed or disappeared
    const progressBar = document.querySelector('.ytp-progress-bar');
    
    if (!progressBar && YTBM.progressBar) {
      // Progress bar disappeared, might indicate navigation away from video
      console.log('Progress bar disappeared, checking if still on video page');
      
      if (!isYouTubeVideo()) {
        // No longer on a video page
        YTBM.initialized = false;
      }
    } else if (progressBar && progressBar !== YTBM.progressBar) {
      // Progress bar changed, update reference and markers
      console.log('Progress bar changed, updating markers');
      YTBM.progressBar = progressBar;
      updateProgressBarMarkers();
    }
  });
  
  // Start observing
  if (targetNode) {
    YTBM.observer.observe(targetNode, config);
  }
}

// Ensure this runs when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Initializing YouTube Timestamp Bookmarker');
    initialize();
  });
} else {
  console.log('Document already loaded: Initializing YouTube Timestamp Bookmarker immediately');
  initialize();
}

// Add additional listener for YouTube's SPA navigation
window.addEventListener('yt-navigate-finish', () => {
  console.log('yt-navigate-finish global event detected');
  if (isYouTubeVideo()) {
    YTBM.initialized = false;
    initialize();
  }
});

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Skip if focused on an input or editor is open
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
        e.target.getAttribute('contenteditable') === 'true' ||
        (YTBM.noteEditor && YTBM.noteEditor.style.display === 'flex')) {
      return;
    }
    
    // Add bookmark with 'S' key
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      addCurrentTimeBookmark();
    }
    
    // Navigate to previous bookmark with 'A' key
    if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      goToPreviousBookmark();
    }
    
    // Navigate to next bookmark with 'D' key
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      goToNextBookmark();
    }
  });
}

// Initialization
function initialize() {
  // Skip initialization if already done
  if (YTBM.initialized) {
    return;
  }
  
  // Check if we're on a YouTube watch page
  if (!isYouTubeVideo()) {
    // If not on a video page, set up an observer to watch for navigation
    setupNavigationObserver();
    return;
  }
  
  // Get the video ID from the URL
  const videoId = getVideoId();
  if (!videoId) {
    // If no video ID, set up navigation observer and return
    setupNavigationObserver();
    return;
  }
  
  YTBM.videoId = videoId;
  
  // Load settings
  loadSettings(() => {
    // Find YouTube elements with retries
    tryFindYouTubeElements();
  });
}

function tryFindYouTubeElements(attempt = 0) {
  // Try to find the YouTube player elements
  YTBM.player = document.querySelector('.html5-video-player');
  YTBM.progressBar = document.querySelector('.ytp-progress-bar');
  
  if (!YTBM.player || !YTBM.progressBar) {
    // Elements not found yet, retry with exponential backoff
    const delay = Math.min(1000 * Math.pow(1.5, attempt), 10000); // Cap at 10 seconds
    console.log(`YouTube elements not found, retrying in ${delay}ms (attempt ${attempt + 1})`);
    
    setTimeout(() => {
      tryFindYouTubeElements(attempt + 1);
    }, delay);
    return;
  }
  
  // Elements found, continue initialization
  console.log('YouTube elements found, completing initialization');
  
  // Load bookmarks for this video
  loadBookmarks(YTBM.videoId);
  
  // Add bookmark button to player controls
  addBookmarkButton();
  
  // Create note editor
  createNoteEditor();
  
  // Set up observers for YouTube navigation
  setupObservers();
  
  // Add keyboard shortcuts
  setupKeyboardShortcuts();
  
  YTBM.initialized = true;
  console.log('YouTube Timestamp Bookmarker initialized');
}

// Watch for YouTube navigation
function setupNavigationObserver() {
  console.log('Setting up navigation observer for YouTube');
  
  // Listen for URL changes
  let lastUrl = location.href;
  
  // Use MutationObserver to watch for DOM changes that might indicate navigation
  const observer = new MutationObserver(() => {
    // Check if URL changed
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('YouTube URL changed:', lastUrl);
      
      // If we're now on a video page, re-initialize
      if (isYouTubeVideo()) {
        console.log('Detected navigation to YouTube video page, re-initializing');
        YTBM.initialized = false;
        setTimeout(initialize, 500); // Small delay to ensure YouTube has updated its DOM
      }
    }
  });
  
  // Observe changes to the body and its children
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also listen for the YouTube navigation finish event
  document.addEventListener('yt-navigate-finish', () => {
    console.log('YouTube navigation finished event detected');
    
    // Re-initialize if on a video page
    if (isYouTubeVideo()) {
      YTBM.initialized = false;
      setTimeout(initialize, 500);
    }
  });
}

// Message Handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Bookmark creation and navigation
  if (message.action === 'add-bookmark') {
    addCurrentTimeBookmark();
    sendResponse({ success: true });
  } 
  else if (message.action === 'prev-bookmark') {
    goToPreviousBookmark();
    sendResponse({ success: true });
  } 
  else if (message.action === 'next-bookmark') {
    goToNextBookmark();
    sendResponse({ success: true });
  } 
  
  // Video information
  else if (message.action === 'getVideoTitle') {
    sendResponse({ title: getVideoTitle() });
  }
  
  // Settings and UI updates
  else if (message.action === 'refreshSettings') {
    loadSettings(() => {
      updateProgressBarMarkers();
      applyDarkMode();
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
  
  // Timestamp navigation
  else if (message.action === 'jumpToTime') {
    const video = getVideoElement();
    if (video) {
      video.currentTime = message.time;
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Video element not found' });
    }
  }
  
  // Bookmark deletion
  else if (message.action === 'bookmarkDeleted') {
    if (message.videoId === YTBM.videoId) {
      const marker = document.querySelector(`.ytbm-marker[data-id="${message.bookmarkId}"]`);
      if (marker) {
        marker.remove();
      }
      YTBM.bookmarks = YTBM.bookmarks.filter(b => b.id !== message.bookmarkId);
    }
    sendResponse({ success: true });
  }
  
  // Tag updates
  else if (message.action === 'tagsUpdated') {
    updateNoteEditorTags();
    sendResponse({ success: true });
  }

  else if (message.action === 'checkInitialization') {
    // Check if we need to initialize
    if (!YTBM.initialized && isYouTubeVideo()) {
      console.log('Received initialization check, reinitializing');
      YTBM.initialized = false;
      initialize();
    }
    sendResponse({ initialized: YTBM.initialized });
  }
  
  return true; // Keep communication channel open for async responses
});

// Initialize once DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}