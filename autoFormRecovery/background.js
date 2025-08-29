/*
 (c) 2025 SC5K Systems
 background.js
 handles message routing and periodic cleanup for auto form recovery
*/

/* clear all form data from local storage */
function clearAllFormData(callback) {
  chrome.storage.local.clear(() => {
    if (callback) callback(true);
  });
}

/* remove expired entries using settings.retentionDays */
function purgeExpiredEntries() {
  /* load settings to determine retention */
  chrome.storage.local.get({ settings: { retentionDays: 30 } }, items => {
    const retentionDays = (items.settings && items.settings.retentionDays) || 30;
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;
    chrome.storage.local.get(null, all => {
      const keysToRemove = [];
      const now = Date.now();
      Object.entries(all).forEach(([key, entry]) => {
        const timestamp = entry && entry.timestamp;
        if (timestamp && now - timestamp > maxAge) {
          keysToRemove.push(key);
        }
      });
      if (keysToRemove.length) {
        chrome.storage.local.remove(keysToRemove);
      }
    });
  });
}

/* listen for messages from popup or other scripts */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'CLEAR_FORM_DATA') {
    clearAllFormData(success => {
      sendResponse({ success });
    });
    return true;
  }
});

/* create an alarm on install to purge expired entries daily */
chrome.runtime.onInstalled.addListener(() => {
  /* run purge on install */
  purgeExpiredEntries();
  /* schedule daily purge via alarm */
  chrome.alarms.create('autoFormRecoveryPurge', { periodInMinutes: 60 * 24 });
});

/* run a purge on service worker startup */
purgeExpiredEntries();

/* alarm handler triggers purge */
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm && alarm.name === 'autoFormRecoveryPurge') {
    purgeExpiredEntries();
  }
});