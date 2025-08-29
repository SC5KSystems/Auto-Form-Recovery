/*
 (c) 2025 SC5K Systems
 contentScript.js
 runs on each page to save and restore form input on a per‑form basis. a unique key is derived from
 the page origin/path and the form id or index. password, hidden, file and opt‑out fields are never saved.
 login forms containing a password input are ignored.
*/

(() => {
  /* use chrome API for cross‑browser compatibility */
  const storage = chrome.storage;
  /* cached settings */
  let extensionSettings = {
    enabled: true,
    retentionDays: 30,
    ignoreDomains: [],
    /* whether to skip saving/restoring login forms; user can override via options */
    ignoreLoginForms: true
  };

  /* load settings from storage.local */
  function loadSettings(callback) {
    chrome.storage.local.get({ settings: extensionSettings }, items => {
      extensionSettings = items.settings || extensionSettings;
      console.log('[AutoFormRecovery] Loaded settings:', extensionSettings);
      if (callback) callback();
    });
  }
  /* return true if the element should be saved; skip passwords, hidden, file, autocomplete="off" and data-autorecovery="false" */
  function shouldSaveField(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['password', 'hidden', 'file'].includes(type)) return false;
    }
    if (el.autocomplete === 'off') return false;
    if (el.getAttribute('data-autorecovery') === 'false') return false;
    return true;
  }

  /* build a unique key using origin+path and the form id/name; fall back to index if no identifier */
  function getFormKey(form) {
    const url = location.origin + location.pathname;
    const identifier = form.id || form.getAttribute('name');
    let idx = '';
    if (!identifier) {
      idx = Array.from(document.forms).indexOf(form).toString();
    }
    return `${url}::${identifier || idx}`;
  }

  /* return true if the form appears to be a sign‑in/login form
     heuristic rules:
     - if ignoreLoginForms is disabled in settings, always return false
     - any password input => login
     - id/name/class or action contains typical auth keywords
     - forms with only a single text/email input and no textarea and a small number of inputs
       are treated as a login stage (e.g., email step) */
  function isLoginForm(form) {
    /* respect user setting; if ignoreLoginForms is false, never treat as login */
    if (extensionSettings && extensionSettings.ignoreLoginForms === false) {
      return false;
    }
    /* check for password field */
    if (form.querySelector('input[type="password"]')) return true;
    /* gather combined attributes for keyword scanning */
    const attrs = [
      form.getAttribute('id') || '',
      form.getAttribute('name') || '',
      form.getAttribute('class') || '',
      form.getAttribute('action') || ''
    ].join(' ').toLowerCase();
    /* keyword patterns typical of login pages */
    const keywords = ['login', 'log-in', 'sign-in', 'signin', 'sign_in', 'auth', 'authenticate', 'authentication', 'account', 'passwd'];
    if (keywords.some(k => attrs.includes(k))) {
      return true;
    }
    /* detect forms that only ask for a username or email without other text inputs or textareas */
    const inputs = Array.from(form.querySelectorAll('input'));
    const textInputs = inputs.filter(el => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      return ['text', 'email', 'tel', 'phone', 'number'].includes(type) || !type;
    });
    const emailInputs = inputs.filter(el => {
      const nameAttr = (el.getAttribute('name') || '').toLowerCase();
      const idAttr = (el.getAttribute('id') || '').toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      return type === 'email' || nameAttr.includes('email') || idAttr.includes('email');
    });
    const passwordInputs = inputs.filter(el => (el.getAttribute('type') || '').toLowerCase() === 'password');
    const textAreas = Array.from(form.querySelectorAll('textarea'));
    /* treat small forms with email/user fields and no textarea as login */
    if (passwordInputs.length === 0 && textAreas.length === 0) {
      /* if there is at least one email input and the total number of text inputs is <= 1 and inputs count <= 3 */
      if (emailInputs.length >= 1 && textInputs.length <= 1 && inputs.length <= 3) {
        return true;
      }
      /* forms with a username field but no textarea and <=3 inputs (common on sites requiring username only) */
      const userInputs = inputs.filter(el => {
        const nameAttr = (el.getAttribute('name') || '').toLowerCase();
        const idAttr = (el.getAttribute('id') || '').toLowerCase();
        return nameAttr.includes('user') || idAttr.includes('user') || nameAttr.includes('login') || idAttr.includes('login');
      });
      if (userInputs.length >= 1 && inputs.length <= 3) {
        return true;
      }
    }
    return false;
  }

  /* iterate form elements and record values keyed by name+value for checkboxes/radios or id/index for others; write to storage.local */
  function saveFormData(form) {
    /* skip login forms that contain a password field */
    if (isLoginForm(form)) return;
    const key = getFormKey(form);
    const data = {};
    Array.from(form.elements).forEach((el, index) => {
      /* skip unsupported elements; derive a key per element; for checkboxes and radios use name+value to avoid collisions */
      if (!shouldSaveField(el)) return;
      const tag = el.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
      let fieldKey = el.name || el.id || `${tag}_${index}`;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.name) {
          fieldKey = `${el.name}_${el.value}`;
        }
        data[fieldKey] = el.checked;
      } else {
        data[fieldKey] = el.value;
      }
    });
    const obj = {};
    obj[key] = {
      data,
      timestamp: Date.now()
    };
    chrome.storage.local.set(obj);
    console.log('[AutoFormRecovery] Saved form', key, data);
  }

  /* restore saved data if available; remove expired entries; flash a message when values are applied */
  function restoreFormData(form) {
    /* skip login forms that contain a password field */
    if (isLoginForm(form)) return;
    const key = getFormKey(form);
    chrome.storage.local.get(key, result => {
      if (!result || !result[key]) return;
      const entry = result[key];
      const saved = entry.data || entry;
      /* compute retention window in milliseconds */
      const retentionMs = (extensionSettings.retentionDays || 30) * 24 * 60 * 60 * 1000;
      /* remove expired data */
      if (entry.timestamp && Date.now() - entry.timestamp > retentionMs) {
        chrome.storage.local.remove(key);
        return;
      }
      let restoredAny = false;
      Array.from(form.elements).forEach((el, index) => {
        if (!shouldSaveField(el)) return;
        const tag = el.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
        /* build the same key used when saving */
        let fieldKey = el.name || el.id || `${tag}_${index}`;
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (el.name) {
            fieldKey = `${el.name}_${el.value}`;
          }
        }
        if (saved.hasOwnProperty(fieldKey)) {
          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = saved[fieldKey];
          } else {
            el.value = saved[fieldKey];
          }
          restoredAny = true;
        }
      });
      if (restoredAny) {
        showRestoreNotification();
        console.log('[AutoFormRecovery] Restored form', key);
      }
    });
  }

  /* show a temporary banner to inform the user that data has been restored */
  function showRestoreNotification() {
    /* skip if a notice is already visible */
    if (document.querySelector('.auto-form-recovery-notice')) return;
    const notice = document.createElement('div');
    notice.className = 'auto-form-recovery-notice';
    notice.textContent = 'Form data has been restored by Auto Form Recovery';
    Object.assign(notice.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: '#4caf50',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: '4px',
      zIndex: '999999',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      fontSize: '14px'
    });
    document.body.appendChild(notice);
    setTimeout(() => {
      notice.remove();
    }, 4000);
  }

  /* attach debounced input/change listeners to persist form data */
  function monitorForm(form) {
    if (form._autoRecoveryAttached) return;
    /* skip login forms; do not attach listeners */
    if (isLoginForm(form)) return;
    form._autoRecoveryAttached = true;
    const debouncedSave = debounce(() => saveFormData(form), 500);
    form.addEventListener('input', debouncedSave);
    form.addEventListener('change', debouncedSave);
    console.log('[AutoFormRecovery] Monitoring form', getFormKey(form));
  }

  /* simple debounce utility */
  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  /* initialize recovery on current forms and observe the DOM for future forms */
  function initAutoFormRecovery() {
    /* skip recovery if the extension is disabled or the domain is ignored */
    const hostname = location.hostname;
    if (!extensionSettings.enabled || extensionSettings.ignoreDomains.includes(hostname)) {
      console.log('[AutoFormRecovery] Disabled on this domain:', hostname);
      return;
    }
    /* process existing forms */
    Array.from(document.forms).forEach(form => {
      if (!isLoginForm(form)) {
        restoreFormData(form);
        monitorForm(form);
      }
    });
    /* observe the page for new forms */
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.tagName === 'FORM') {
              if (!isLoginForm(node)) {
                restoreFormData(node);
                monitorForm(node);
              }
            } else {
              /* search inside for nested forms */
              node.querySelectorAll && node.querySelectorAll('form').forEach(form => {
                if (!isLoginForm(form)) {
                  restoreFormData(form);
                  monitorForm(form);
                }
              });
            }
          }
        });
      });
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  /* initialize on DOMContentLoaded */
  function start() {
    loadSettings(() => {
      initAutoFormRecovery();
    });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();