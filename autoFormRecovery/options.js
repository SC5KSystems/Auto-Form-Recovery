/*
 (c) 2025 SC5K Systems
 options.js
 manages loading and saving user settings for auto form recovery
*/

document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');
  const retentionInput = document.getElementById('retentionDays');
  const ignoreTextarea = document.getElementById('ignoreDomains');
  const ignoreLoginFormsCheckbox = document.getElementById('ignoreLoginForms');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  /* default settings */
  const DEFAULTS = {
    enabled: true,
    retentionDays: 30,
    ignoreDomains: [],
    ignoreLoginForms: true
  };

  function loadSettings() {
    /* use local storage since sync is unavailable for temporary add-ons in Firefox */
    chrome.storage.local.get({ settings: DEFAULTS }, items => {
      const settings = items.settings || DEFAULTS;
      enabledCheckbox.checked = settings.enabled;
      retentionInput.value = settings.retentionDays;
      ignoreTextarea.value = settings.ignoreDomains.join(', ');
      ignoreLoginFormsCheckbox.checked = settings.ignoreLoginForms !== false;
    });
  }

  function saveSettings() {
    const settings = {
      enabled: enabledCheckbox.checked,
      retentionDays: parseInt(retentionInput.value, 10) || DEFAULTS.retentionDays,
      ignoreDomains: ignoreTextarea.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      ignoreLoginForms: ignoreLoginFormsCheckbox.checked
    };
    /* persist settings to local storage; avoid sync because it requires an explicit id */
    chrome.storage.local.set({ settings }, () => {
      statusDiv.textContent = 'Settings saved.';
      setTimeout(() => (statusDiv.textContent = ''), 3000);
    });
  }

  saveBtn.addEventListener('click', saveSettings);
  loadSettings();
});