/**
 * YouTube Timestamp Bookmarker
 * Popup Script
 */

// Main state for popup
const state = {
  activeTab: 'bookmarks',
  currentVideoId: null,
  currentVideoTitle: null,
  bookmarks: [],
  allBookmarks: {},
  settings: {
    markerColor: '#ff0000',
    markerShape: 'circle',
    markerSize: 6,
    darkMode: false,
    bookmarksPerPage: 10,
    showNoteEditor: true,
    defaultNoteText: '',
    defaultNoteTag: '',
    pauseOnBookmark: true
  },
  tags: ['important', 'review', 'funny', 'question', 'custom'],
  viewingAllVideos: false,
  currentPage: 1,
  totalPages: 1,
  searchTerm: '',
  tagFilter: ''
};

// DOM elements
const elements = {
  tabs: document.querySelectorAll('.ytbm-tab-btn'),
  tabContents: document.querySelectorAll('.ytbm-tab-content'),
  darkModeToggle: document.getElementById('darkModeToggle'),
  videoTitle: document.getElementById('videoTitle'),
  bookmarksList: document.getElementById('bookmarksList'),
  bookmarkTemplate: document.getElementById('bookmarkTemplate'),
  videoTemplate: document.getElementById('videoTemplate'),
  tagTemplate: document.getElementById('tagTemplate'),
  tagList: document.getElementById('tagList'),
  searchInput: document.getElementById('bookmarkSearch'),
  tagFilter: document.getElementById('tagFilter'),
  showAllVideosBtn: document.getElementById('showAllVideosBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
  prevPageBtn: document.getElementById('prevPage'),
  nextPageBtn: document.getElementById('nextPage'),
  pageInfo: document.getElementById('pageInfo'),
  markerColor: document.getElementById('markerColor'),
  markerShape: document.getElementById('markerShape'),
  markerSize: document.getElementById('markerSize'),
  markerSizeValue: document.getElementById('markerSizeValue'),
  bookmarksPerPage: document.getElementById('bookmarksPerPage'),
  newTagInput: document.getElementById('newTagInput'),
  addTagBtn: document.getElementById('addTagBtn'),
  resetSettingsBtn: document.getElementById('resetSettings'),
  saveSettingsBtn: document.getElementById('saveSettings'),
  showNoteEditor: document.getElementById('showNoteEditor'),
  defaultNoteText: document.getElementById('defaultNoteText'),
  defaultNoteTag: document.getElementById('defaultNoteTag'),
  pauseOnBookmark: document.getElementById('pauseOnBookmark'),
  defaultNoteSection: document.getElementById('defaultNoteSection'),
  defaultTagSection: document.getElementById('defaultTagSection')
};

// Storage functions
function loadSettings(callback) {
  chrome.storage.local.get(['settings', 'tags'], (result) => {
    if (result.settings) {
      state.settings = result.settings;
    }
    
    if (result.tags) {
      state.tags = result.tags;
    }
    
    if (callback) callback();
  });
}

function saveSettings(callback) {
  chrome.storage.local.set({ 
    settings: state.settings,
    tags: state.tags 
  }, callback);
}

function loadBookmarks(videoId) {
  chrome.storage.local.get('bookmarks', (result) => {
    state.allBookmarks = result.bookmarks || {};
    state.bookmarks = state.allBookmarks[videoId] || [];
    
    // Sort bookmarks by time
    state.bookmarks.sort((a, b) => a.time - b.time);
    
    // Reset pagination
    state.currentPage = 1;
    updatePagination();
    
    // Update UI
    renderBookmarks();
  });
}

function loadAllBookmarks() {
  chrome.storage.local.get('bookmarks', (result) => {
    state.allBookmarks = result.bookmarks || {};
    
    // Flatten all bookmarks into a single array
    let allBookmarks = [];
    Object.keys(state.allBookmarks).forEach(videoId => {
      allBookmarks = allBookmarks.concat(state.allBookmarks[videoId].map(bookmark => ({
        ...bookmark,
        videoId
      })));
    });
    
    state.bookmarks = allBookmarks;
    
    // Sort by creation date (newest first)
    state.bookmarks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Reset pagination
    state.currentPage = 1;
    updatePagination();
    
    // Update UI
    renderBookmarks();
  });
}

function updateBookmark(bookmark, callback) {
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
        if (state.viewingAllVideos) {
          loadAllBookmarks();
        } else {
          loadBookmarks(state.currentVideoId);
        }
        
        if (callback) callback();
      });
    }
  });
}

// Utility functions
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

function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'ytbm-notification';
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after animation
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2000);
  
  // Add styles
  if (!document.querySelector('style[ytbm-notification-style]')) {
    const style = document.createElement('style');
    style.setAttribute('ytbm-notification-style', '');
    style.textContent = `
      .ytbm-notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-family: 'Roboto', Arial, sans-serif;
        font-size: 14px;
        z-index: 10000;
        transition: transform 0.3s ease;
      }
      
      .ytbm-notification.show {
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }
}

// UI interface functions
function getCurrentTabInfo() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('youtube.com/watch')) {
      // Extract video ID from URL
      const urlParams = new URLSearchParams(new URL(tabs[0].url).search);
      state.currentVideoId = urlParams.get('v');
      
      // Get video title from content script
      chrome.runtime.sendMessage({ action: 'getVideoTitle' }, (response) => {
        if (response && response.title) {
          state.currentVideoTitle = response.title;
          elements.videoTitle.textContent = response.title;
        }
      });
      
      // Load bookmarks for this video
      loadBookmarks(state.currentVideoId);
    } else {
      // Not on a YouTube video page
      state.currentVideoId = null;
      state.currentVideoTitle = null;
      elements.videoTitle.textContent = 'Not on a YouTube video';
      
      // Load all bookmarks for the all videos view
      loadAllBookmarks();
    }
  });
}

function initializeUI() {
  // Set dark mode
  elements.darkModeToggle.checked = state.settings.darkMode;
  toggleDarkMode(state.settings.darkMode);
  
  // Set settings inputs
  elements.markerColor.value = state.settings.markerColor;
  elements.markerShape.value = state.settings.markerShape;
  elements.markerSize.value = state.settings.markerSize;
  elements.markerSizeValue.textContent = state.settings.markerSize;
  elements.bookmarksPerPage.value = state.settings.bookmarksPerPage.toString();
  
  // Populate tag filter dropdown
  populateTagFilter();
  
  // Populate tag management list
  renderTags();

  // Set up bookmark creation settings
  elements.showNoteEditor.checked = state.settings.showNoteEditor;
  elements.defaultNoteText.value = state.settings.defaultNoteText;
  elements.pauseOnBookmark.checked = state.settings.pauseOnBookmark;

  // Show/hide default note sections based on current setting
  elements.defaultNoteSection.style.display = state.settings.showNoteEditor ? 'none' : 'flex';
  elements.defaultTagSection.style.display = state.settings.showNoteEditor ? 'none' : 'flex';

  // Populate default tag dropdown
  populateDefaultTagDropdown();
}

function populateTagFilter() {
  // Clear existing options (except the first one)
  while (elements.tagFilter.options.length > 1) {
    elements.tagFilter.remove(1);
  }
  
  // Add options for each tag
  state.tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
    elements.tagFilter.appendChild(option);
  });
}

function populateDefaultTagDropdown() {
  // Clear existing options (except the first one)
  while (elements.defaultNoteTag.options.length > 1) {
    elements.defaultNoteTag.remove(1);
  }
  
  // Add option for each tag
  state.tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
    elements.defaultNoteTag.appendChild(option);
  });
  
  // Set the selected option
  if (state.settings.defaultNoteTag) {
    elements.defaultNoteTag.value = state.settings.defaultNoteTag;
  }
}

function toggleDarkMode(enabled) {
  state.settings.darkMode = enabled;
  
  if (enabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function switchTab(tabName) {
  // Update active tab state
  state.activeTab = tabName;
  
  // Update tab button classes
  elements.tabs.forEach(tab => {
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Update tab content visibility
  elements.tabContents.forEach(content => {
    if (content.id === `${tabName}-tab`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

function updatePagination() {
  // Get filtered bookmarks
  const filteredBookmarks = filterBookmarks();
  
  // Calculate total pages
  const pageSize = state.settings.bookmarksPerPage;
  state.totalPages = Math.max(1, Math.ceil(filteredBookmarks.length / pageSize));
  
  // Ensure current page is valid
  if (state.currentPage > state.totalPages) {
    state.currentPage = state.totalPages;
  }
  
  // Update UI
  elements.pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
  elements.prevPageBtn.disabled = state.currentPage <= 1;
  elements.nextPageBtn.disabled = state.currentPage >= state.totalPages;
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
      if (format === 'insertUnorderedList') {
        isActive = document.queryCommandState('insertUnorderedList');
      } else {
        isActive = document.queryCommandState(format);
      }
      
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

// Tag Management Functions
function renderTags() {
  // Clear existing tags
  elements.tagList.innerHTML = '';
  
  // Render each tag
  state.tags.forEach(tag => {
    const template = elements.tagTemplate.content.cloneNode(true);
    const tagItem = template.querySelector('.ytbm-tag-item');
    
    // Set tag name
    const nameEl = tagItem.querySelector('.ytbm-tag-name');
    nameEl.textContent = tag;
    
    // Set up delete action
    const deleteBtn = tagItem.querySelector('.ytbm-tag-delete');
    deleteBtn.addEventListener('click', () => {
      deleteTag(tag);
    });
    
    elements.tagList.appendChild(tagItem);
  });
}

function addNewTag() {
  const newTag = elements.newTagInput.value.trim().toLowerCase();
  
  if (!newTag) {
    alert('Please enter a tag name');
    return;
  }
  
  if (state.tags.includes(newTag)) {
    alert('This tag already exists');
    return;
  }
  
  // Add to tags array
  state.tags.push(newTag);
  
  // Clear input
  elements.newTagInput.value = '';
  
  // Update UI
  renderTags();
  populateDefaultTagDropdown();
  notifyTagsUpdated();
  populateTagFilter();
}

function deleteTag(tag) {
  if (confirm(`Are you sure you want to delete the "${tag}" tag?`)) {
    // Remove from tags array
    state.tags = state.tags.filter(t => t !== tag);
    
    // Update UI
    renderTags();
    populateTagFilter();
    populateDefaultTagDropdown();
    
    // Remove tag from all bookmarks
    chrome.storage.local.get('bookmarks', (result) => {
      const allBookmarks = result.bookmarks || {};
      let hasChanges = false;
      
      // Go through all bookmarks and remove the tag
      Object.keys(allBookmarks).forEach(videoId => {
        const videoBookmarks = allBookmarks[videoId];
        
        videoBookmarks.forEach(bookmark => {
          if (bookmark.tags && bookmark.tags.includes(tag)) {
            bookmark.tags = bookmark.tags.filter(t => t !== tag);
            hasChanges = true;
          }
        });
      });
      
      if (hasChanges) {
        // Save updated bookmarks
        chrome.storage.local.set({ bookmarks: allBookmarks }, () => {
          // Reload bookmarks
          if (state.viewingAllVideos) {
            loadAllBookmarks();
          } else if (state.currentVideoId) {
            loadBookmarks(state.currentVideoId);
          }
        });
      }
    });
    notifyTagsUpdated();
  }
}

function notifyTagsUpdated() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('youtube.com/watch')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'tagsUpdated' });
    }
  });
}

// Bookmark Display & Interaction Functions
function filterBookmarks() {
  return state.bookmarks.filter(bookmark => {
    // Search filter
    const noteText = bookmark.note ? sanitizeHTMLToText(bookmark.note).toLowerCase() : '';
    const matchesSearch = !state.searchTerm || 
                          noteText.includes(state.searchTerm) ||
                          formatTime(bookmark.time).includes(state.searchTerm);
    
    // Tag filter
    const matchesTag = !state.tagFilter || 
                      (bookmark.tags && bookmark.tags.includes(state.tagFilter));
    
    return matchesSearch && matchesTag;
  });
}

function renderBookmarks() {
  // Clear current list
  elements.bookmarksList.innerHTML = '';
  
  // Filter bookmarks
  const filteredBookmarks = filterBookmarks();
  
  // If no bookmarks, show empty state
  if (filteredBookmarks.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'ytbm-empty-state';
    
    if (state.searchTerm || state.tagFilter) {
      emptyState.textContent = 'No bookmarks match your filters.';
    } else if (state.viewingAllVideos) {
      emptyState.textContent = 'No bookmarks saved yet.';
    } else {
      emptyState.innerHTML = 'No bookmarks for this video yet.<br>Press \'S\' or click the bookmark button to add one.';
    }
    
    elements.bookmarksList.appendChild(emptyState);
    return;
  }
  
  // Get paginated bookmarks
  const pageSize = state.settings.bookmarksPerPage;
  const startIndex = (state.currentPage - 1) * pageSize;
  const paginatedBookmarks = filteredBookmarks.slice(startIndex, startIndex + pageSize);
  
  // Render based on view mode
  if (state.viewingAllVideos) {
    renderAllVideosView(paginatedBookmarks);
  } else {
    renderCurrentVideoView(paginatedBookmarks);
  }
}

function renderCurrentVideoView(bookmarks) {
  bookmarks.forEach(bookmark => {
    const bookmarkElement = createBookmarkElement(bookmark);
    elements.bookmarksList.appendChild(bookmarkElement);
  });
}

function renderAllVideosView(bookmarks) {
  // Group bookmarks by video ID
  const videoGroups = {};
  
  bookmarks.forEach(bookmark => {
    if (!videoGroups[bookmark.videoId]) {
      videoGroups[bookmark.videoId] = [];
    }
    videoGroups[bookmark.videoId].push(bookmark);
  });
  
  // Render each video group
  Object.keys(videoGroups).forEach(videoId => {
    const videoBookmarks = videoGroups[videoId];
    // Get video title from the first bookmark, or use a placeholder
    const videoTitle = videoBookmarks[0]?.videoTitle || `Video: ${videoId}`;
    
    // Create video section
    const videoSection = document.createElement('div');
    videoSection.className = 'ytbm-video-section';
    videoSection.setAttribute('data-video-id', videoId);
    
    // Create video header
    const videoHeader = document.createElement('div');
    videoHeader.className = 'ytbm-video-header';

    // Add export button to video header
    const exportBtn = document.createElement('button');
    exportBtn.className = 'ytbm-video-export-btn';
    exportBtn.title = 'Export bookmarks for this video';
    exportBtn.innerHTML = '↓'; // Download icon
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent toggling the section
      exportVideoBookmarks(videoId, videoTitle);
    });
    videoHeader.appendChild(exportBtn);
    
    // Create thumbnail element
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'ytbm-video-thumbnail';
    const thumbnailImg = document.createElement('img');
    thumbnailImg.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    thumbnailImg.alt = 'Video thumbnail';
    thumbnailImg.onerror = () => {
      // If image fails to load, show a placeholder
      thumbnailImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68"><rect width="120" height="68" fill="%23f0f0f0"/><text x="60" y="34" font-family="Arial" font-size="12" text-anchor="middle" fill="%23999">No Preview</text></svg>';
    };
    thumbnailDiv.appendChild(thumbnailImg);
    
    // Create video details
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'ytbm-video-details';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'ytbm-video-title';
    titleDiv.textContent = videoTitle;
    
    const bookmarksCountDiv = document.createElement('div');
    bookmarksCountDiv.className = 'ytbm-video-bookmarks';
    bookmarksCountDiv.textContent = `${videoBookmarks.length} bookmark${videoBookmarks.length !== 1 ? 's' : ''}`;
    
    // Assemble the elements
    detailsDiv.appendChild(titleDiv);
    detailsDiv.appendChild(bookmarksCountDiv);
    
    videoHeader.appendChild(thumbnailDiv);
    videoHeader.appendChild(detailsDiv);
    
    // Create bookmarks list container (initially collapsed)
    const bookmarksList = document.createElement('div');
    bookmarksList.className = 'ytbm-video-bookmarks-list';
    
    // Toggle expansion when clicking on header
    videoHeader.addEventListener('click', () => {
      videoSection.classList.toggle('expanded');
    });
    
    // Add each bookmark for this video
    videoBookmarks.forEach(bookmark => {
      const bookmarkElement = createBookmarkElement(bookmark);
      bookmarksList.appendChild(bookmarkElement);
    });
    
    // Assemble the video section
    videoSection.appendChild(videoHeader);
    videoSection.appendChild(bookmarksList);
    elements.bookmarksList.appendChild(videoSection);
  });
}

function createBookmarkElement(bookmark) {
  const template = elements.bookmarkTemplate.content.cloneNode(true);
  const bookmarkItem = template.querySelector('.ytbm-bookmark-item');
  
  // Set bookmark ID
  bookmarkItem.setAttribute('data-id', bookmark.id);
  
  // Set timestamp
  const timeEl = bookmarkItem.querySelector('.ytbm-bookmark-time');
  timeEl.textContent = formatTime(bookmark.time);
  
  // Set note content
  const noteEl = bookmarkItem.querySelector('.ytbm-bookmark-note');
  if (bookmark.note) {
    // Use actual HTML without sanitizing it again
    noteEl.innerHTML = bookmark.note;
  } else {
    noteEl.innerHTML = '<em>No note</em>';
  }
  
  // Set tags
  const tagsEl = bookmarkItem.querySelector('.ytbm-bookmark-tags');
  if (bookmark.tags && bookmark.tags.length) {
    bookmark.tags.forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'ytbm-tag ' + tag;
      tagSpan.textContent = tag;
      tagsEl.appendChild(tagSpan);
    });
  }
  
  // Set up jump action
  const jumpBtn = bookmarkItem.querySelector('.ytbm-bookmark-jump');
  jumpBtn.addEventListener('click', () => {
    jumpToTimestamp(bookmark.videoId, bookmark.time);
  });
  
  // Set up edit action
  const editBtn = bookmarkItem.querySelector('.ytbm-bookmark-edit');
  editBtn.addEventListener('click', () => {
    editBookmark(bookmark);
  });
  
  // Set up delete action
  const deleteBtn = bookmarkItem.querySelector('.ytbm-bookmark-delete');
  deleteBtn.addEventListener('click', () => {
    deleteBookmark(bookmark);
  });
  
  return bookmarkItem;
}

function jumpToTimestamp(videoId, time) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      // If we're already on this video
      if (videoId === state.currentVideoId) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'jumpToTime', 
          time: time 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending jumpToTime message:', chrome.runtime.lastError);
            openYouTubeVideo(videoId, time);
          }
        });
      } else {
        // Open the video at the specific timestamp
        openYouTubeVideo(videoId, time);
        
        // Update the current video ID
        state.currentVideoId = videoId;
        
        // Find the video title from the bookmark data
        chrome.storage.local.get('bookmarks', (result) => {
          const allBookmarks = result.bookmarks || {};
          const videoBookmarks = allBookmarks[videoId] || [];
          
          if (videoBookmarks.length > 0 && videoBookmarks[0].videoTitle) {
            // Update the title in the UI
            state.currentVideoTitle = videoBookmarks[0].videoTitle;
            elements.videoTitle.textContent = videoBookmarks[0].videoTitle;
          } else {
            // Fallback if no title is found
            elements.videoTitle.textContent = 'Loading video...';
            
            // Schedule a title update after the video loads
            setTimeout(() => {
              chrome.runtime.sendMessage({ action: 'getVideoTitle' }, (response) => {
                if (response && response.title) {
                  state.currentVideoTitle = response.title;
                  elements.videoTitle.textContent = response.title;
                }
              });
            }, 2000); // Give the video time to load
          }
        });
      }
    }
  });
}

function openYouTubeVideo(videoId, time = 0) {
  let url = `https://www.youtube.com/watch?v=${videoId}`;
  if (time > 0) {
    url += `&t=${Math.floor(time)}s`;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.update(tabs[0].id, { url: url });
      
      // Update the current video ID
      state.currentVideoId = videoId;
      
      // Update UI to show loading state
      elements.videoTitle.textContent = 'Loading video...';
    }
  });
}

function deleteBookmark(bookmark) {
  if (confirm('Are you sure you want to delete this bookmark?')) {
    chrome.storage.local.get('bookmarks', (result) => {
      const allBookmarks = result.bookmarks || {};
      const videoBookmarks = allBookmarks[bookmark.videoId] || [];
      
      // Remove the bookmark
      const filteredBookmarks = videoBookmarks.filter(b => b.id !== bookmark.id);
      allBookmarks[bookmark.videoId] = filteredBookmarks;
      
      // Update storage
      chrome.storage.local.set({ bookmarks: allBookmarks }, () => {
        // Reload bookmarks
        if (state.viewingAllVideos) {
          loadAllBookmarks();
        } else {
          loadBookmarks(state.currentVideoId);
        }
        
        // Show confirmation
        showNotification('Bookmark deleted');
        
        // Notify content script to update markers immediately
        if (bookmark.videoId === state.currentVideoId) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'bookmarkDeleted',
                bookmarkId: bookmark.id,
                videoId: bookmark.videoId
              });
            }
          });
        }
      });
    });
  }
}

// Edit Bookmark Interface
function editBookmark(bookmark) {
  // Create edit form
  const editForm = document.createElement('div');
  editForm.className = 'ytbm-edit-form';
  editForm.innerHTML = `
    <div class="ytbm-edit-header">
      <span>Edit Bookmark at ${formatTime(bookmark.time)}</span>
      <button class="ytbm-edit-close">×</button>
    </div>
    <div class="ytbm-edit-body">
      <div class="ytbm-edit-note">
        <label>Note:</label>
        <div class="ytbm-edit-toolbar">
          <button data-format="bold" title="Bold"><b>B</b></button>
          <button data-format="italic" title="Italic"><i>I</i></button>
          <button data-format="underline" title="Underline"><u>U</u></button>
          <button data-format="insertUnorderedList" title="Bullet List">• List</button>
        </div>
        <div class="ytbm-edit-content" contenteditable="true"></div>
      </div>
      <div class="ytbm-edit-tags">
        <label>Tags:</label>
        <div class="ytbm-tag-checkboxes">
          ${state.tags.map(tag => `
            <label class="ytbm-tag-checkbox">
              <input type="checkbox" value="${tag}" ${bookmark.tags && bookmark.tags.includes(tag) ? 'checked' : ''}>
              <span>${tag}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="ytbm-edit-actions">
      <button class="ytbm-edit-cancel">Cancel</button>
      <button class="ytbm-edit-save">Save</button>
    </div>
  `;
  
  // Set note content
  const contentEl = editForm.querySelector('.ytbm-edit-content');
  contentEl.innerHTML = sanitizeHTML(bookmark.note);
  
  // Add form to page
  document.body.appendChild(editForm);
  
  // Focus note content
  contentEl.focus();
  
  // Set up toolbar buttons
  const toolbarButtons = editForm.querySelectorAll('.ytbm-edit-toolbar button');
  toolbarButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const format = button.getAttribute('data-format');
      document.execCommand(format, false, null);
      updateFormatButtons();
      contentEl.focus();
    });
  });
  
  // Set up close button
  const closeBtn = editForm.querySelector('.ytbm-edit-close');
  closeBtn.addEventListener('click', () => {
    editForm.remove();
  });
  
  // Set up cancel button
  const cancelBtn = editForm.querySelector('.ytbm-edit-cancel');
  cancelBtn.addEventListener('click', () => {
    editForm.remove();
  });
  
  // Set up save button
  const saveBtn = editForm.querySelector('.ytbm-edit-save');
  saveBtn.addEventListener('click', () => {
    // Get note content
    const noteContent = contentEl.innerHTML;
    
    // Get selected tags
    const selectedTags = Array.from(
      editForm.querySelectorAll('.ytbm-tag-checkbox input:checked')
    ).map(checkbox => checkbox.value);
    
    // Update bookmark
    const updatedBookmark = {
      ...bookmark,
      note: sanitizeHTML(noteContent),
      tags: selectedTags
    };
    
    // Save to storage
    updateBookmark(updatedBookmark, () => {
      // Close form
      editForm.remove();
      
      // Show confirmation
      showNotification('Bookmark updated');
    });
  });
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .ytbm-edit-form {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 350px;
      background-color: ${state.settings.darkMode ? 'var(--dark-bg)' : 'white'};
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      font-family: 'Roboto', Arial, sans-serif;
      color: ${state.settings.darkMode ? 'var(--dark-text)' : 'var(--light-text)'};
      border: 1px solid ${state.settings.darkMode ? 'var(--dark-border)' : 'var(--light-border)'};
    }
    
    .ytbm-edit-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background-color: ${state.settings.darkMode ? 'var(--dark-secondary-bg)' : 'var(--light-hover)'};
      border-bottom: 1px solid ${state.settings.darkMode ? 'var(--dark-border)' : 'var(--light-border)'};
      border-radius: 8px 8px 0 0;
    }
    
    .ytbm-edit-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: ${state.settings.darkMode ? 'var(--dark-text)' : '#606060'};
    }
    
    .ytbm-edit-body {
      padding: 15px;
    }
    
    .ytbm-edit-note, .ytbm-edit-tags {
      margin-bottom: 15px;
    }
    
    .ytbm-edit-note label, .ytbm-edit-tags label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    
    .ytbm-edit-toolbar {
      display: flex;
      margin-bottom: 5px;
    }
    
    .ytbm-edit-toolbar button {
      background: none;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      margin-right: 5px;
      cursor: pointer;
      color: ${state.settings.darkMode ? 'var(--dark-text)' : '#606060'};
    }
    
    .ytbm-edit-toolbar button:hover {
      background-color: ${state.settings.darkMode ? 'var(--dark-hover)' : 'rgba(0, 0, 0, 0.05)'};
    }
    
    .ytbm-edit-content {
      min-height: 100px;
      padding: 10px;
      border: 1px solid ${state.settings.darkMode ? 'var(--dark-border)' : 'var(--light-border)'};
      border-radius: 4px;
      background-color: ${state.settings.darkMode ? 'var(--dark-secondary-bg)' : 'white'};
      overflow-y: auto;
      max-height: 200px;
    }
    
    .ytbm-tag-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .ytbm-tag-checkbox {
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    
    .ytbm-tag-checkbox input {
      margin-right: 5px;
    }
    
    .ytbm-edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 10px 15px;
      background-color: ${state.settings.darkMode ? 'var(--dark-secondary-bg)' : 'var(--light-hover)'};
      border-top: 1px solid ${state.settings.darkMode ? 'var(--dark-border)' : 'var(--light-border)'};
      border-radius: 0 0 8px 8px;
    }
    
    .ytbm-edit-actions button {
      padding: 8px 15px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .ytbm-edit-cancel {
      background: none;
      border: 1px solid ${state.settings.darkMode ? 'var(--dark-border)' : 'var(--light-border)'};
      color: ${state.settings.darkMode ? 'var(--dark-text)' : 'var(--light-text)'};
    }
    
    .ytbm-edit-save {
      background-color: var(--primary-color);
      color: white;
      border: none;
    }
  `;
  
  document.head.appendChild(style);
}

// Import/Export Functions
function exportAllBookmarks() {
  chrome.storage.local.get('bookmarks', (result) => {
    const bookmarksData = result.bookmarks || {};
    
    // Create blob with JSON data
    const blob = new Blob([JSON.stringify(bookmarksData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube_bookmarks.json';
    a.click();
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Show confirmation
    showNotification('All bookmarks exported');
  });
}

function exportVideoBookmarks(videoId, videoTitle) {
  chrome.storage.local.get('bookmarks', (result) => {
    const allBookmarks = result.bookmarks || {};
    const videoBookmarks = allBookmarks[videoId] || [];
    
    if (videoBookmarks.length === 0) {
      alert('No bookmarks to export for this video.');
      return;
    }
    
    // Create export data with just this video's bookmarks
    const exportData = {};
    exportData[videoId] = videoBookmarks;
    
    // Add video metadata
    const metadata = {
      exportDate: new Date().toISOString(),
      videoId: videoId,
      videoTitle: videoTitle || 'Untitled Video',
      bookmarkCount: videoBookmarks.length,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
    
    // Create the final export object
    const finalExport = {
      metadata: metadata,
      bookmarks: exportData
    };
    
    // Create blob with JSON data
    const blob = new Blob([JSON.stringify(finalExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create sanitized filename from video title
    const sanitizedTitle = (videoTitle || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `bookmarks_${sanitizedTitle}_${videoId}.json`;
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Show confirmation
    showNotification('Video bookmarks exported');
  });
}

function importBookmarks(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      // Parse JSON data
      const importedData = JSON.parse(e.target.result);
      let bookmarksToImport = {};
      
      // Check if this is the new format with metadata
      if (importedData.metadata && importedData.bookmarks) {
        bookmarksToImport = importedData.bookmarks;
      } 
      // Check if it's the old format (direct bookmarks object)
      else if (typeof importedData === 'object' && !Array.isArray(importedData)) {
        bookmarksToImport = importedData;
      } else {
        throw new Error('Invalid data format');
      }
      
      // Validate bookmark data
      Object.keys(bookmarksToImport).forEach(videoId => {
        const bookmarks = bookmarksToImport[videoId];
        if (!Array.isArray(bookmarks)) {
          throw new Error(`Invalid bookmarks for video ${videoId}`);
        }
        
        // Check each bookmark
        bookmarks.forEach(bookmark => {
          if (!bookmark.id || !bookmark.time) {
            throw new Error(`Invalid bookmark in video ${videoId}`);
          }
        });
      });
      
      // Merge with existing bookmarks
      chrome.storage.local.get('bookmarks', (result) => {
        const existingBookmarks = result.bookmarks || {};
        
        // Merge the data
        const mergedBookmarks = { ...existingBookmarks };
        
        Object.keys(bookmarksToImport).forEach(videoId => {
          if (!mergedBookmarks[videoId]) {
            mergedBookmarks[videoId] = [];
          }
          
          // Add imported bookmarks
          bookmarksToImport[videoId].forEach(importedBookmark => {
            // Check if bookmark already exists
            const exists = mergedBookmarks[videoId].some(b => b.id === importedBookmark.id);
            if (!exists) {
              mergedBookmarks[videoId].push(importedBookmark);
            }
          });
          
          // Sort bookmarks by time
          mergedBookmarks[videoId].sort((a, b) => a.time - b.time);
        });
        
        // Save merged bookmarks
        chrome.storage.local.set({ bookmarks: mergedBookmarks }, () => {
          // Reload bookmarks
          if (state.viewingAllVideos) {
            loadAllBookmarks();
          } else if (state.currentVideoId) {
            loadBookmarks(state.currentVideoId);
          }
          
          // Show confirmation
          showNotification('Bookmarks imported');
        });
      });
    } catch (error) {
      console.error('Import error:', error);
      alert(`Error importing bookmarks: ${error.message}`);
    }
    
    // Reset the file input
    event.target.value = '';
  };
  
  reader.readAsText(file);
}

function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to default?')) {
    state.settings = {
      markerColor: '#ff0000',
      markerShape: 'circle',
      markerSize: 6,
      darkMode: false,
      bookmarksPerPage: 10,
      showNoteEditor: true,
      defaultNoteText: '',
      defaultNoteTag: '',
      pauseOnBookmark: true
    };
    
    // Update UI
    initializeUI();
    
    // Show confirmation
    showNotification('Settings reset to default');
  }
}

// Event setup
function setupEventListeners() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-tab'));
    });
  });
  
  // Dark mode toggle
  elements.darkModeToggle.addEventListener('change', () => {
    toggleDarkMode(elements.darkModeToggle.checked);
  });
  
  // Search input
  elements.searchInput.addEventListener('input', () => {
    state.searchTerm = elements.searchInput.value.toLowerCase();
    state.currentPage = 1;
    updatePagination();
    renderBookmarks();
  });
  
  // Tag filter
  elements.tagFilter.addEventListener('change', () => {
    state.tagFilter = elements.tagFilter.value;
    state.currentPage = 1;
    updatePagination();
    renderBookmarks();
  });
  
  // Show all videos button
  elements.showAllVideosBtn.addEventListener('click', () => {
    state.viewingAllVideos = !state.viewingAllVideos;
    
    if (state.viewingAllVideos) {
      elements.showAllVideosBtn.textContent = 'Back to Current Video';
      loadAllBookmarks();
    } else {
      elements.showAllVideosBtn.textContent = 'View All Videos';
      
      // Always get fresh info from the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url.includes('youtube.com/watch')) {
          // Extract video ID from URL
          const urlParams = new URLSearchParams(new URL(tabs[0].url).search);
          const currentVideoId = urlParams.get('v');
          
          // If the ID changed, update state and request the title
          if (currentVideoId !== state.currentVideoId) {
            state.currentVideoId = currentVideoId;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getVideoTitle' }, (response) => {
              if (response && response.title) {
                state.currentVideoTitle = response.title;
                elements.videoTitle.textContent = response.title;
              }
            });
          }
          
          // Load this video's bookmarks
          loadBookmarks(currentVideoId);
        } else {
          state.bookmarks = [];
          renderBookmarks();
        }
      });
    }
  });
  
  // Export button
  elements.exportBtn.addEventListener('click', () => {
    if (state.viewingAllVideos) {
      exportAllBookmarks();
    } else {
      // Export just the current video
      exportVideoBookmarks(state.currentVideoId, state.currentVideoTitle);
    }
  });
  
  // Import file input
  elements.importFile.addEventListener('change', importBookmarks);
  
  // Pagination buttons
  elements.prevPageBtn.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      updatePagination();
      renderBookmarks();
    }
  });
  
  elements.nextPageBtn.addEventListener('click', () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      updatePagination();
      renderBookmarks();
    }
  });
  
  // Settings inputs
  elements.markerColor.addEventListener('change', () => {
    state.settings.markerColor = elements.markerColor.value;
  });
  
  elements.markerShape.addEventListener('change', () => {
    state.settings.markerShape = elements.markerShape.value;
  });
  
  elements.markerSize.addEventListener('input', () => {
    const size = parseInt(elements.markerSize.value);
    state.settings.markerSize = size;
    elements.markerSizeValue.textContent = size;
  });
  
  elements.bookmarksPerPage.addEventListener('change', () => {
    state.settings.bookmarksPerPage = parseInt(elements.bookmarksPerPage.value);
    state.currentPage = 1;
    updatePagination();
    renderBookmarks();
  });
  
  // Tag management
  elements.addTagBtn.addEventListener('click', addNewTag);

  // Note editor settings
  elements.showNoteEditor.addEventListener('change', () => {
    const showEditor = elements.showNoteEditor.checked;
    state.settings.showNoteEditor = showEditor;
    
    // Show/hide default note settings based on checkbox
    elements.defaultNoteSection.style.display = showEditor ? 'none' : 'flex';
    elements.defaultTagSection.style.display = showEditor ? 'none' : 'flex';
  });

  elements.defaultNoteText.addEventListener('input', () => {
    state.settings.defaultNoteText = elements.defaultNoteText.value;
  });

  elements.defaultNoteTag.addEventListener('change', () => {
    state.settings.defaultNoteTag = elements.defaultNoteTag.value;
  });

  elements.pauseOnBookmark.addEventListener('change', () => {
    state.settings.pauseOnBookmark = elements.pauseOnBookmark.checked;
  });
  
  // Settings buttons
  elements.resetSettingsBtn.addEventListener('click', resetSettings);
  elements.saveSettingsBtn.addEventListener('click', () => {
    saveSettings(() => {
      // Show save confirmation
      showNotification('Settings saved');
      
      // Refresh content script
      if (state.currentVideoId) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshSettings' });
          }
        });
      }
    });
  });
}

// Initialization
function init() {
  // Update marker size slider range
  elements.markerSize.min = "3";
  elements.markerSize.max = "12";
  
  // Load settings
  loadSettings(() => {
    // Get current tab info
    getCurrentTabInfo();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize UI based on settings
    initializeUI();
  });
}

// Listen for video change messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'videoChanged') {
    // Update state with new video info
    state.currentVideoId = message.videoId;
    state.currentVideoTitle = message.videoTitle;
    
    // Update UI
    elements.videoTitle.textContent = message.videoTitle;
    
    // If we're not in "View All Videos" mode, load the bookmarks for this video
    if (!state.viewingAllVideos) {
      loadBookmarks(message.videoId);
    }
    
    sendResponse({ success: true });
  }
  return true; // Keep the channel open for async responses
});

// Initialize the popup
document.addEventListener('DOMContentLoaded', init);