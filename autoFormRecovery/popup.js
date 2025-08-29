/*
 (c) 2025 SC5K Systems
 popup.js
 displays the total number of saved forms and offers quick actions: disable/enable the extension on the current site,
 clear data for the current site or all sites, and open the settings page.
*/

document.addEventListener('DOMContentLoaded', () => {
  /* elements for home view */
  const homeView = document.getElementById('homeView');
  const countSpan = document.getElementById('count');
  const domainName = document.getElementById('domainName');
  const ignoreToggle = document.getElementById('ignoreDomainToggle');
  const clearSiteBtn = document.getElementById('clearSiteBtn');
  const clearBtn = document.getElementById('clearBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const statusDiv = document.getElementById('status');

  /* elements for settings view */
  const settingsView = document.getElementById('settingsView');
  const backToHomeBtn = document.getElementById('backToHome');
  const popupEnabled = document.getElementById('popupEnabled');
  const popupRetention = document.getElementById('popupRetentionDays');
  const popupIgnoreDomains = document.getElementById('popupIgnoreDomains');
  const popupIgnoreLoginForms = document.getElementById('popupIgnoreLoginForms');
  const popupSaveBtn = document.getElementById('popupSaveBtn');
  const popupStatusDiv = document.getElementById('popupStatus');

  /* default settings used when none are stored */
  const DEFAULTS = { enabled: true, retentionDays: 30, ignoreDomains: [], ignoreLoginForms: true };

  /* update the total count of saved forms (exclude settings entry) */
  function updateCount() {
    chrome.storage.local.get(null, items => {
      const keys = Object.keys(items).filter(k => k !== 'settings');
      countSpan.textContent = keys.length.toString();
    });
  }

  /* load the current domain and reflect ignore status */
  function loadDomainInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || !tabs.length) return;
      try {
        const url = new URL(tabs[0].url);
        const domain = url.hostname;
        domainName.textContent = domain;
        chrome.storage.local.get({ settings: DEFAULTS }, items => {
          const settings = items.settings;
          ignoreToggle.checked = (settings.ignoreDomains || []).includes(domain);
        });
      } catch (err) {
        domainName.textContent = 'unknown';
      }
    });
  }

  /* toggle ignore status for current domain */
  ignoreToggle.addEventListener('change', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || !tabs.length) return;
      const domain = (() => { try { return new URL(tabs[0].url).hostname; } catch (err) { return null; }})();
      if (!domain) return;
      chrome.storage.local.get({ settings: DEFAULTS }, items => {
        const settings = items.settings;
        const list = settings.ignoreDomains || [];
        const idx = list.indexOf(domain);
        if (ignoreToggle.checked && idx < 0) {
          list.push(domain);
        } else if (!ignoreToggle.checked && idx >= 0) {
          list.splice(idx, 1);
        }
        settings.ignoreDomains = list;
        chrome.storage.local.set({ settings }, () => {
          statusDiv.textContent = ignoreToggle.checked ? `disabled on ${domain}` : `enabled on ${domain}`;
          setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        });
      });
    });
  });

  /* clear saved data for the current site */
  clearSiteBtn.addEventListener('click', () => {
    clearSiteBtn.disabled = true;
    statusDiv.textContent = 'clearing site...';
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs || !tabs.length) return;
      const domain = (() => { try { return new URL(tabs[0].url).hostname; } catch (err) { return null; }})();
      if (!domain) return;
      chrome.storage.local.get(null, items => {
        const keysToRemove = [];
        Object.keys(items).forEach(key => {
          if (key === 'settings') return;
          const urlPart = key.split('::')[0];
          try {
            const host = new URL(urlPart).hostname;
            if (host === domain) {
              keysToRemove.push(key);
            }
          } catch (err) {}
        });
        if (keysToRemove.length) {
          chrome.storage.local.remove(keysToRemove, () => {
            statusDiv.textContent = `cleared data for ${domain}`;
            clearSiteBtn.disabled = false;
            updateCount();
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
          });
        } else {
          statusDiv.textContent = `no data for ${domain}`;
          clearSiteBtn.disabled = false;
          setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        }
      });
    });
  });

  /* clear all saved data */
  clearBtn.addEventListener('click', () => {
    clearBtn.disabled = true;
    statusDiv.textContent = 'clearing...';
    chrome.storage.local.clear(() => {
      statusDiv.textContent = 'data cleared';
      clearBtn.disabled = false;
      updateCount();
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    });
  });

  /* show the settings view */
  function showSettings() {
    /* load settings into popup fields */
    chrome.storage.local.get({ settings: DEFAULTS }, items => {
      const settings = items.settings || DEFAULTS;
      popupEnabled.checked = settings.enabled;
      popupRetention.value = settings.retentionDays;
      popupIgnoreDomains.value = (settings.ignoreDomains || []).join(', ');
      popupIgnoreLoginForms.checked = settings.ignoreLoginForms !== false;
    });
    homeView.style.display = 'none';
    settingsView.style.display = 'block';
  }

  /* hide the settings view */
  function hideSettings() {
    settingsView.style.display = 'none';
    homeView.style.display = 'block';
    /* reload counts and domain info when returning */
    updateCount();
    loadDomainInfo();
  }

  /* handle save in settings view */
  function savePopupSettings() {
    const settings = {
      enabled: popupEnabled.checked,
      retentionDays: parseInt(popupRetention.value, 10) || DEFAULTS.retentionDays,
      ignoreDomains: popupIgnoreDomains.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      ignoreLoginForms: popupIgnoreLoginForms.checked
    };
    chrome.storage.local.set({ settings }, () => {
      /* show a temporary notification inside the popup */
      popupStatusDiv.textContent = 'Settings saved.';
      popupStatusDiv.style.color = '#4caf50';
      setTimeout(() => {
        popupStatusDiv.textContent = '';
        /* return to home view after save */
        hideSettings();
      }, 1500);
    });
  }

  /* attach event listeners */
  openSettingsBtn.addEventListener('click', showSettings);
  backToHomeBtn.addEventListener('click', () => {
    hideSettings();
  });
  popupSaveBtn.addEventListener('click', savePopupSettings);

  /* initial setup */
  updateCount();
  loadDomainInfo();
});