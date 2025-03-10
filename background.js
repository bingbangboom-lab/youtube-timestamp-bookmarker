/**
 * YouTube Timestamp Bookmarker
 * Background script for extension initialization and keyboard shortcuts
 */

// Initialize default settings when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Default settings for the extension
  const defaultSettings = {
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

  // Initialize settings, bookmarks, and tags in parallel
  chrome.storage.local.get(['settings', 'bookmarks', 'tags'], (result) => {
    const updates = {};
    
    if (!result.settings) {
      updates.settings = defaultSettings;
    }
    
    if (!result.bookmarks) {
      updates.bookmarks = {};
    }
    
    if (!result.tags) {
      updates.tags = [
        'important',
        'review',
        'funny',
        'question',
        'custom'
      ];
    }
    
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

// Handle keyboard shortcuts for the extension
chrome.commands.onCommand.addListener((command) => {
  if (command === 'add-bookmark' || command === 'prev-bookmark' || command === 'next-bookmark') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('youtube.com/watch')) {
        // Send message to content script
        chrome.tabs.sendMessage(tabs[0].id, { action: command });
      }
    });
  }
});

// Listen for messages from content or popup scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVideoTitle') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('youtube.com/watch')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getVideoTitle' }, (response) => {
          sendResponse(response);
        });
        return true; // Indicates that sendResponse will be called asynchronously
      } else {
        sendResponse({ title: 'Not a YouTube video' });
      }
    });
    return true; // Indicates that sendResponse will be called asynchronously
  }
});

// Listen for tabs being updated (page loads, navigation, etc.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the tab is a YouTube URL and has completed loading
  if (tab.url && tab.url.includes("youtube.com") && changeInfo.status === 'complete') {
    // Message the content script to reinitialize
    chrome.tabs.sendMessage(tabId, { action: "checkInitialization" })
      .catch(error => {
        // If there's an error (likely content script not ready), that's okay
        console.log("Content script may not be ready yet:", error);
      });
  }
});