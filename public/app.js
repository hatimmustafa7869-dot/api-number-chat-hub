/**
 * APIChat Hub - Client Application Logic
 * College Project: Query Any API with a 10-Digit Number & Display Response in Chatbox
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- STATE ---
  const state = {
    queriesCount: 0,
    chatHistory: [],
    soundEnabled: true,
    activePreset: 'mock-telecom',
    theme: localStorage.getItem('apichat_theme') || 'dark',
    isLocked: false,
    apis: [],
    activeApiId: 'phone_lookup'
  };

  // --- PRESET DEFINITIONS ---
  const PRESETS = {
    'custom': {
      name: 'Custom User API',
      url: '',
      param: 'number',
      method: 'GET',
      placeholder: 'https://api.yourdomain.com/v1/search'
    },
    'mock-telecom': {
      name: 'Telecom & Carrier Lookup',
      url: '/api/mock/telecom-lookup',
      param: 'number',
      method: 'GET',
      placeholder: '/api/mock/telecom-lookup'
    },
    'mock-student': {
      name: 'University Student Registry',
      url: '/api/mock/student-registry',
      param: 'number',
      method: 'GET',
      placeholder: '/api/mock/student-registry'
    },
    'mock-sms': {
      name: 'SMS / OTP Gateway Status',
      url: '/api/mock/sms-gateway',
      param: 'number',
      method: 'GET',
      placeholder: '/api/mock/sms-gateway'
    },
    'jsonplaceholder': {
      name: 'Public JSONPlaceholder Users',
      url: 'https://jsonplaceholder.typicode.com/users/{number}',
      param: 'id',
      method: 'GET',
      placeholder: 'https://jsonplaceholder.typicode.com/users/{number}'
    }
  };

  // --- DOM ELEMENTS ---
  const elements = {
    // Theme & Audio
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    sunIcon: document.getElementById('sunIcon'),
    moonIcon: document.getElementById('moonIcon'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundOnIcon: document.getElementById('soundOnIcon'),
    soundOffIcon: document.getElementById('soundOffIcon'),

    // Sidebar & Inputs
    configSidebar: document.getElementById('configSidebar'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    apiPresetSelect: document.getElementById('apiPresetSelect'),
    apiUrlInput: document.getElementById('apiUrlInput'),
    queryParamInput: document.getElementById('queryParamInput'),
    httpMethodSelect: document.getElementById('httpMethodSelect'),
    proxyToggle: document.getElementById('proxyToggle'),
    authHeaderInput: document.getElementById('authHeaderInput'),
    customHeadersInput: document.getElementById('customHeadersInput'),
    postBodyGroup: document.getElementById('postBodyGroup'),
    postBodyTypeSelect: document.getElementById('postBodyTypeSelect'),
    requestUrlPreview: document.getElementById('requestUrlPreview'),
    sampleChips: document.querySelectorAll('.sample-chip'),

    // Chat Area
    currentEndpointBadge: document.getElementById('currentEndpointBadge'),
    queryCountBadge: document.getElementById('queryCountBadge'),
    chatMessages: document.getElementById('chatMessages'),
    emptyState: document.getElementById('emptyState'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    exportChatBtn: document.getElementById('exportChatBtn'),

    // Multi-API Tabs & Editor Elements
    apiTabsBar: document.getElementById('apiTabsBar'),
    apiTabsContainer: document.getElementById('apiTabsContainer'),
    addNewApiBtn: document.getElementById('addNewApiBtn'),
    apiEditorModal: document.getElementById('apiEditorModal'),
    closeApiModalBtn: document.getElementById('closeApiModalBtn'),
    cancelApiModalBtn: document.getElementById('cancelApiModalBtn'),
    apiEditorForm: document.getElementById('apiEditorForm'),
    apiModalTitle: document.getElementById('apiModalTitle'),
    editApiId: document.getElementById('editApiId'),
    newApiName: document.getElementById('newApiName'),
    newApiType: document.getElementById('newApiType'),
    newApiMethod: document.getElementById('newApiMethod'),
    newApiUrl: document.getElementById('newApiUrl'),
    newApiParamName: document.getElementById('newApiParamName'),
    newApiIcon: document.getElementById('newApiIcon'),
    newApiPlaceholder: document.getElementById('newApiPlaceholder'),
    newApiAuthHeader: document.getElementById('newApiAuthHeader'),
    apiFormError: document.getElementById('apiFormError'),
    saveApiBtn: document.getElementById('saveApiBtn'),

    // Active API Sidebar Editing & Save Controls
    activeApiEditingBanner: document.getElementById('activeApiEditingBanner'),
    editingApiIcon: document.getElementById('editingApiIcon'),
    editingApiNameBadge: document.getElementById('editingApiNameBadge'),
    editingApiTypeBadge: document.getElementById('editingApiTypeBadge'),
    saveActiveApiBtn: document.getElementById('saveActiveApiBtn'),
    saveActiveApiBtnText: document.getElementById('saveActiveApiBtnText'),
    saveActiveApiStatus: document.getElementById('saveActiveApiStatus'),

    // Form & Input Bar
    queryForm: document.getElementById('queryForm'),
    numberInput: document.getElementById('numberInput'),
    digitCounter: document.getElementById('digitCounter'),
    sendBtn: document.getElementById('sendBtn'),
    inputValidationMsg: document.getElementById('inputValidationMsg'),

    // Documentation Modal
    projectDocsBtn: document.getElementById('projectDocsBtn'),
    docsModal: document.getElementById('docsModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    modalOkBtn: document.getElementById('modalOkBtn'),
    serverStatusText: document.getElementById('serverStatusText'),

    // Telegram Bot Integration Elements
    telegramModalBtn: document.getElementById('telegramModalBtn'),
    telegramBtnText: document.getElementById('telegramBtnText'),
    telegramStatusDot: document.getElementById('telegramStatusDot'),
    telegramModal: document.getElementById('telegramModal'),
    closeTelegramModalBtn: document.getElementById('closeTelegramModalBtn'),
    tgModalDoneBtn: document.getElementById('tgModalDoneBtn'),
    telegramStatusCard: document.getElementById('telegramStatusCard'),
    tgStatusIcon: document.getElementById('tgStatusIcon'),
    tgStatusTitle: document.getElementById('tgStatusTitle'),
    tgStatusDesc: document.getElementById('tgStatusDesc'),
    tgActiveBotLink: document.getElementById('tgActiveBotLink'),
    tgBotLinkTag: document.getElementById('tgBotLinkTag'),
    telegramConnectForm: document.getElementById('telegramConnectForm'),
    telegramTokenInput: document.getElementById('telegramTokenInput'),
    tgConnectBtn: document.getElementById('tgConnectBtn'),
    tgDisconnectBtn: document.getElementById('tgDisconnectBtn'),
    tgFormError: document.getElementById('tgFormError'),
    tgBroadcastSection: document.getElementById('tgBroadcastSection'),
    tgBroadcastInput: document.getElementById('tgBroadcastInput'),
    tgBroadcastBtn: document.getElementById('tgBroadcastBtn'),

    // Lock API Elements
    lockApiBtn: document.getElementById('lockApiBtn'),
    lockIconLocked: document.getElementById('lockIconLocked'),
    lockIconUnlocked: document.getElementById('lockIconUnlocked'),
    lockBtnText: document.getElementById('lockBtnText'),
    lockedBanner: document.getElementById('lockedBanner'),
    unlockQuickBtn: document.getElementById('unlockQuickBtn'),

    // Telegram Authorization Elements
    tgOwnerBadge: document.getElementById('tgOwnerBadge'),
    tgOwnerIdInput: document.getElementById('tgOwnerIdInput'),
    saveOwnerBtn: document.getElementById('saveOwnerBtn'),
    tgPendingRequestsCard: document.getElementById('tgPendingRequestsCard'),
    pendingCountBadge: document.getElementById('pendingCountBadge'),
    pendingListContainer: document.getElementById('pendingListContainer'),
    manualAuthId: document.getElementById('manualAuthId'),
    manualAuthLimit: document.getElementById('manualAuthLimit'),
    manualAuthBtn: document.getElementById('manualAuthBtn'),
    refreshAuthUsersBtn: document.getElementById('refreshAuthUsersBtn'),
    authUsersList: document.getElementById('authUsersList'),

    // Admin Authentication Elements
    userProfileMenu: document.getElementById('userProfileMenu'),
    userMenuBtn: document.getElementById('userMenuBtn'),
    userDropdown: document.getElementById('userDropdown'),
    currentUsernameText: document.getElementById('currentUsernameText'),
    dropdownUsername: document.getElementById('dropdownUsername'),
    openChangePassBtn: document.getElementById('openChangePassBtn'),
    logoutBtn: document.getElementById('logoutBtn'),

    // Login Overlay Elements
    loginModal: document.getElementById('loginModal'),
    loginForm: document.getElementById('loginForm'),
    loginUsernameInput: document.getElementById('loginUsernameInput'),
    loginPasswordInput: document.getElementById('loginPasswordInput'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    loginErrorMsg: document.getElementById('loginErrorMsg'),

    // Change Password Modal Elements
    changePasswordModal: document.getElementById('changePasswordModal'),
    closeChangePassModalBtn: document.getElementById('closeChangePassModalBtn'),
    cancelChangePassBtn: document.getElementById('cancelChangePassBtn'),
    changePasswordForm: document.getElementById('changePasswordForm'),
    currentPasswordInput: document.getElementById('currentPasswordInput'),
    newUsernameInput: document.getElementById('newUsernameInput'),
    newPasswordInput: document.getElementById('newPasswordInput'),
    confirmNewPasswordInput: document.getElementById('confirmNewPasswordInput'),
    saveChangePassBtn: document.getElementById('saveChangePassBtn'),
    changePassMsg: document.getElementById('changePassMsg')
  };

  // --- ADMIN AUTHENTICATION MANAGEMENT ---
  function getAuthToken() {
    return localStorage.getItem('apichat_admin_token') || '';
  }

  function setAuthToken(token, username) {
    if (token) localStorage.setItem('apichat_admin_token', token);
    if (username) localStorage.setItem('apichat_admin_user', username);
  }

  function clearAuthToken() {
    localStorage.removeItem('apichat_admin_token');
    localStorage.removeItem('apichat_admin_user');
  }

  // Wrapper for authenticated backend requests
  async function authFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = {
      ...(options.headers || {})
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      showLoginModal('Session expired or unauthorized. Please sign in.');
    }
    return res;
  }

  function showLoginModal(errMsg = '') {
    if (elements.loginModal) {
      elements.loginModal.classList.remove('hidden');
      if (errMsg && elements.loginErrorMsg) {
        elements.loginErrorMsg.textContent = errMsg;
        elements.loginErrorMsg.classList.remove('hidden');
      } else if (elements.loginErrorMsg) {
        elements.loginErrorMsg.classList.add('hidden');
      }
      setTimeout(() => elements.loginUsernameInput?.focus(), 60);
    }
  }

  function hideLoginModal() {
    if (elements.loginModal) {
      elements.loginModal.classList.add('hidden');
      if (elements.loginErrorMsg) elements.loginErrorMsg.classList.add('hidden');
      elements.loginForm?.reset();
    }
  }

  function updateLoggedInUserUI(username) {
    const user = username || localStorage.getItem('apichat_admin_user') || 'admin';
    if (elements.currentUsernameText) elements.currentUsernameText.textContent = user;
    if (elements.dropdownUsername) elements.dropdownUsername.textContent = user;
  }

  async function checkAuthSession() {
    const token = getAuthToken();
    if (!token) {
      showLoginModal();
      return false;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok && data.authenticated) {
        updateLoggedInUserUI(data.username);
        hideLoginModal();
        return true;
      } else {
        clearAuthToken();
        showLoginModal();
        return false;
      }
    } catch (e) {
      console.error('Session validation error:', e);
      showLoginModal();
      return false;
    }
  }

  // --- AUDIO SYNTHESIZER (Web Audio API - No external files needed) ---
  const audioContext = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;

  function playTone(type) {
    if (!state.soundEnabled || !audioContext) return;
    try {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);

      const now = audioContext.currentTime;

      if (type === 'send') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'receive') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(990, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.setValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // Audio playback fails gracefully if blocked by autoplay policy
    }
  }

  // --- THEME MANAGEMENT ---
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('apichat_theme', theme);
    if (theme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      elements.sunIcon.classList.add('hidden');
      elements.moonIcon.classList.remove('hidden');
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      elements.sunIcon.classList.remove('hidden');
      elements.moonIcon.classList.add('hidden');
    }
  }

  applyTheme(state.theme);

  elements.themeToggleBtn.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // --- SOUND TOGGLE ---
  elements.soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) {
      elements.soundOnIcon.classList.remove('hidden');
      elements.soundOffIcon.classList.add('hidden');
      playTone('send');
    } else {
      elements.soundOnIcon.classList.add('hidden');
      elements.soundOffIcon.classList.remove('hidden');
    }
  });

  // --- SIDEBAR TOGGLE FOR MOBILE ---
  elements.toggleSidebarBtn?.addEventListener('click', () => {
    elements.configSidebar.classList.toggle('open');
  });

  elements.closeSidebarBtn?.addEventListener('click', () => {
    elements.configSidebar.classList.remove('open');
  });

  // --- SERVER HEALTH CHECK ---
  async function checkServerHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        elements.serverStatusText.textContent = 'Server Online';
        elements.serverStatusText.parentElement.title = 'Backend Proxy is connected & active';
      }
    } catch {
      elements.serverStatusText.textContent = 'Offline / Direct';
      elements.serverStatusText.parentElement.title = 'Backend server unreachable. Using direct mode.';
    }
  }
  checkServerHealth();

  // --- PRESET SELECTION HANDLER ---
  elements.apiPresetSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    state.activePreset = key;
    const preset = PRESETS[key];
    if (preset) {
      elements.apiUrlInput.value = preset.url;
      elements.queryParamInput.value = preset.param;
      elements.httpMethodSelect.value = preset.method;
      elements.apiUrlInput.placeholder = preset.placeholder;
      elements.currentEndpointBadge.textContent = `Active Endpoint: ${preset.name}`;
      updateRequestPreview();
      if (typeof handleSidebarConfigChange === 'function') {
        handleSidebarConfigChange();
      }
    }
  });

  // --- METHOD CHANGE (Show/hide POST options) ---
  elements.httpMethodSelect.addEventListener('change', (e) => {
    const isPost = ['POST', 'PUT', 'PATCH'].includes(e.target.value);
    elements.postBodyGroup.style.display = isPost ? 'block' : 'none';
    updateRequestPreview();
    if (typeof handleSidebarConfigChange === 'function') {
      handleSidebarConfigChange();
    }
  });

  // --- UPDATE REQUEST PREVIEW CODE BLOCK ---
  function updateRequestPreview() {
    const method = elements.httpMethodSelect ? elements.httpMethodSelect.value : 'GET';
    const url = (elements.apiUrlInput ? elements.apiUrlInput.value.trim() : '') || '/api/mock/telecom-lookup';
    const param = (elements.queryParamInput ? elements.queryParamInput.value.trim() : '') || 'number';
    const num = (elements.numberInput ? elements.numberInput.value.trim() : '') || '9876543210';

    let displayUrl = url;
    if (displayUrl.includes('{number}')) {
      displayUrl = displayUrl.replace('{number}', num);
    } else if (displayUrl.includes('{rc}')) {
      displayUrl = displayUrl.replace('{rc}', num);
    } else if (displayUrl.includes('{query}')) {
      displayUrl = displayUrl.replace('{query}', num);
    } else if (method === 'GET') {
      const sep = displayUrl.includes('?') ? '&' : '?';
      displayUrl = `${displayUrl}${sep}${param}=${num}`;
    }

    if (elements.requestUrlPreview) {
      elements.requestUrlPreview.textContent = `${method} ${displayUrl}`;
    }
  }

  elements.apiUrlInput?.addEventListener('input', () => {
    updateRequestPreview();
    if (typeof handleSidebarConfigChange === 'function') {
      handleSidebarConfigChange();
    }
  });
  elements.queryParamInput?.addEventListener('input', () => {
    updateRequestPreview();
    if (typeof handleSidebarConfigChange === 'function') {
      handleSidebarConfigChange();
    }
  });
  elements.authHeaderInput?.addEventListener('input', () => {
    if (typeof handleSidebarConfigChange === 'function') {
      handleSidebarConfigChange();
    }
  });
  elements.customHeadersInput?.addEventListener('input', () => {
    if (typeof handleSidebarConfigChange === 'function') {
      handleSidebarConfigChange();
    }
  });
  elements.postBodyTypeSelect?.addEventListener('change', () => {
    if (typeof handleSidebarConfigChange === 'function') {
      handleSidebarConfigChange();
    }
  });

  // --- INPUT SANITIZATION & COUNTER (Multi-API Aware) ---
  elements.numberInput.addEventListener('input', (e) => {
    const activeApi = (state.apis && state.apis.find(a => a.id === state.activeApiId)) || { inputType: 'number' };

    if (activeApi.inputType === 'number') {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 10) val = val.slice(0, 10);
      e.target.value = val;

      const len = val.length;
      elements.digitCounter.textContent = `${len}/10`;

      if (len === 10) {
        elements.digitCounter.className = 'digit-counter complete';
        elements.inputValidationMsg.textContent = '✓ Ready to send 10-digit query.';
        elements.inputValidationMsg.style.color = 'var(--success)';
        elements.sendBtn.disabled = false;
      } else if (len > 0) {
        elements.digitCounter.className = 'digit-counter typing';
        elements.inputValidationMsg.textContent = `Need ${10 - len} more digit${10 - len === 1 ? '' : 's'}. (Currently ${len} digits)`;
        elements.inputValidationMsg.style.color = 'var(--warning)';
        elements.sendBtn.disabled = false;
      } else {
        elements.digitCounter.className = 'digit-counter';
        elements.inputValidationMsg.textContent = 'Enter exactly 10 digits to execute query.';
        elements.inputValidationMsg.style.color = 'var(--text-dim)';
        elements.sendBtn.disabled = false;
      }
    } else if (activeApi.inputType === 'vehicle') {
      let val = e.target.value.toUpperCase();
      e.target.value = val;
      const len = val.length;
      elements.digitCounter.textContent = `${len} chars`;

      if (len >= 6) {
        elements.digitCounter.className = 'digit-counter complete';
        elements.inputValidationMsg.textContent = '✓ Ready to query vehicle registration.';
        elements.inputValidationMsg.style.color = 'var(--success)';
        elements.sendBtn.disabled = false;
      } else {
        elements.digitCounter.className = 'digit-counter typing';
        elements.inputValidationMsg.textContent = 'Enter vehicle registration number (e.g. DL01AB1234).';
        elements.inputValidationMsg.style.color = 'var(--warning)';
        elements.sendBtn.disabled = false;
      }
    } else if (activeApi.inputType === 'tgid') {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 15) val = val.slice(0, 15);
      e.target.value = val;
      const len = val.length;
      elements.digitCounter.textContent = `${len} digits`;

      if (len >= 5) {
        elements.digitCounter.className = 'digit-counter complete';
        elements.inputValidationMsg.textContent = '✓ Ready to query Telegram User ID.';
        elements.inputValidationMsg.style.color = 'var(--success)';
        elements.sendBtn.disabled = false;
      } else {
        elements.digitCounter.className = 'digit-counter typing';
        elements.inputValidationMsg.textContent = 'Enter numerical Telegram ID (5 to 15 digits).';
        elements.inputValidationMsg.style.color = 'var(--warning)';
        elements.sendBtn.disabled = false;
      }
    } else {
      elements.digitCounter.textContent = `${e.target.value.length} chars`;
      elements.inputValidationMsg.textContent = 'Query ready to send.';
      elements.inputValidationMsg.style.color = 'var(--text-dim)';
      elements.sendBtn.disabled = false;
    }

    updateRequestPreview();
  });

  // --- SAMPLE CHIPS CLICK ---
  elements.sampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sampleNum = chip.getAttribute('data-num');
      elements.numberInput.value = sampleNum;
      elements.numberInput.dispatchEvent(new Event('input'));
      elements.numberInput.focus();
    });
  });

  // --- QUERY SUBMISSION HANDLER (Multi-API) ---
  elements.queryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const activeApi = (state.apis && state.apis.find(a => a.id === state.activeApiId)) || { inputType: 'number', name: 'API' };
    const queryVal = elements.numberInput.value.trim();

    if (activeApi.inputType === 'number') {
      if (!/^\d{10}$/.test(queryVal)) {
        alert('Please enter a valid 10-digit phone number (digits 0-9 only).');
        elements.numberInput.focus();
        return;
      }
    } else if (activeApi.inputType === 'vehicle') {
      if (queryVal.length < 5) {
        alert('Please enter a valid vehicle RC number (e.g. DL01AB1234).');
        elements.numberInput.focus();
        return;
      }
    } else if (activeApi.inputType === 'tgid') {
      if (!/^\d{5,15}$/.test(queryVal)) {
        alert('Please enter a valid numerical Telegram ID (5 to 15 digits).');
        elements.numberInput.focus();
        return;
      }
    } else {
      if (!queryVal) {
        alert('Please enter a query value.');
        elements.numberInput.focus();
        return;
      }
    }

    const apiUrl = elements.apiUrlInput.value.trim();
    if (!apiUrl) {
      alert('Please enter an API Endpoint URL in the configuration panel.');
      elements.apiUrlInput.focus();
      return;
    }

    const paramName = elements.queryParamInput.value.trim() || activeApi.paramName || 'query';
    const method = elements.httpMethodSelect.value;
    const useProxy = elements.proxyToggle.checked;
    const authHeader = elements.authHeaderInput.value.trim();
    const bodyType = elements.postBodyTypeSelect.value;

    // Parse custom headers
    let customHeaders = {};
    if (elements.customHeadersInput.value.trim()) {
      try {
        customHeaders = JSON.parse(elements.customHeadersInput.value.trim());
      } catch {
        alert('Invalid JSON in custom headers. Please check syntax.');
        return;
      }
    }
    if (authHeader) {
      customHeaders['Authorization'] = authHeader;
    }

    // Hide empty hero if shown
    if (elements.emptyState) {
      elements.emptyState.style.display = 'none';
    }

    // 1. Render User Message Bubble
    appendUserMessage(queryVal, apiUrl, method, `${activeApi.icon || '⚡'} ${activeApi.name}`);
    playTone('send');

    // 2. Render Typing Indicator
    const typingId = appendTypingIndicator(apiUrl);
    scrollToBottom();

    // 3. Dispatch API Request
    const startTime = performance.now();
    try {
      let result;
      if (useProxy) {
        // Backend Proxy Mode
        const res = await authFetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: apiUrl,
            paramName,
            query: queryVal,
            number: queryVal,
            method,
            headers: customHeaders,
            bodyType
          })
        });

        result = await res.json();
      } else {
        // Direct Browser Fetch Mode
        let directUrl = apiUrl;
        directUrl = directUrl.replace(/\{number\}|\{rc\}|\{query\}|\{value\}/gi, encodeURIComponent(queryVal));
        if (method === 'GET' && !directUrl.includes('=')) {
          const sep = directUrl.includes('?') ? '&' : '?';
          directUrl = `${directUrl}${sep}${encodeURIComponent(paramName)}=${encodeURIComponent(queryVal)}`;
        }

        const directRes = await fetch(directUrl, {
          method,
          headers: customHeaders
        });

        const contentType = directRes.headers.get('content-type') || '';
        let directData;
        if (contentType.includes('application/json')) {
          directData = await directRes.json();
        } else {
          directData = await directRes.text();
        }

        result = {
          ok: directRes.ok,
          status: directRes.status,
          statusText: directRes.statusText,
          latencyMs: Math.round(performance.now() - startTime),
          targetUrl: directUrl,
          method,
          data: directData
        };
      }

      // Remove typing bubble
      removeTypingIndicator(typingId);

      // Render Bot Response Bubble
      appendBotMessage(result, queryVal);
      playTone(result.ok ? 'receive' : 'error');

      // Update query count badge
      state.queriesCount++;
      elements.queryCountBadge.textContent = `${state.queriesCount} quer${state.queriesCount === 1 ? 'y' : 'ies'}`;

      // Save to chat history
      state.chatHistory.push({
        timestamp: new Date().toISOString(),
        query: queryVal,
        api: activeApi.name,
        request: { apiUrl, method, paramName },
        response: result
      });

    } catch (err) {
      removeTypingIndicator(typingId);
      playTone('error');
      appendBotMessage({
        ok: false,
        status: 500,
        statusText: 'Client Request Error',
        latencyMs: Math.round(performance.now() - startTime),
        targetUrl: apiUrl,
        error: err.message || 'Network request failed. Make sure Proxy toggle is enabled!'
      }, queryVal);
    }

    scrollToBottom();
  });

  // --- RENDER USER MESSAGE BUBBLE ---
  function appendUserMessage(number, url, method, originTag = '') {
    const row = document.createElement('div');
    row.className = 'message-row user-row';

    const is10Digit = /^\d{10}$/.test(String(number).trim());
    const formattedNum = is10Digit ? `${number.slice(0, 5)} ${number.slice(5)}` : String(number).toUpperCase();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const originBadgeHtml = originTag ? `<span class="telegram-origin-badge">${escapeHtml(originTag)}</span>` : '';

    row.innerHTML = `
      <div class="msg-content-wrapper">
        <div class="msg-bubble user-bubble">
          ${originBadgeHtml}
          <div class="user-query-text">
            <span># ${escapeHtml(formattedNum)}</span>
          </div>
          <div class="user-query-meta">
            <span>Querying: <strong>${method}</strong> ${escapeHtml(url)}</span>
          </div>
        </div>
        <span class="msg-timestamp">${time}</span>
      </div>
      <div class="msg-avatar user-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
    `;

    elements.chatMessages.appendChild(row);
  }

  // --- TYPING INDICATOR ---
  function appendTypingIndicator(url) {
    const id = 'typing_' + Date.now();
    const row = document.createElement('div');
    row.id = id;
    row.className = 'message-row bot-row typing-indicator-row';

    row.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      </div>
      <div class="typing-bubble">
        <div class="dots-wrapper">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
        <span class="typing-text">Querying endpoint & parsing 10-digit payload...</span>
      </div>
    `;

    elements.chatMessages.appendChild(row);
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // --- RENDER BOT MESSAGE BUBBLE ---
  function appendBotMessage(result, queryNumber) {
    const row = document.createElement('div');
    row.className = 'message-row bot-row';

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isSuccess = result.ok || (result.status >= 200 && result.status < 300);
    const statusClass = isSuccess ? 'status-2xx' : (result.status >= 500 ? 'status-5xx' : 'status-4xx');

    // Extract vehicle card from JSON data if applicable
    const vehicleCardHtml = buildVehicleCard(result.data);

    // Extract Telegram User ID profile card (if detected)
    const tgUserCardHtml = buildTgUserCard(result.data);

    // Extract Owner Security Encryption Shield card (if blocked)
    const protectedCardHtml = buildProtectedCard(result.data, result);

    // Extract smart cards from JSON data if applicable
    const smartCardsHtml = buildSmartCards(result.data);

    // Format JSON with syntax highlighting
    const rawData = result.data !== undefined ? result.data : (result.error || result);
    const formattedJsonHtml = syntaxHighlightJson(rawData);

    // Prepare speech text summary
    const speechSummary = generateSpeechSummary(result, queryNumber);

    const messageId = 'bot_msg_' + Date.now();

    row.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      </div>
      <div class="msg-content-wrapper" style="width: 100%;">
        <div class="msg-bubble bot-bubble" id="${messageId}">
          
          <!-- Status & Latency Header -->
          <div class="response-status-bar">
            <div class="status-pills-left">
              <span class="http-status-pill ${statusClass}">
                <span class="status-dot"></span>
                <span>${result.status || 500} ${result.statusText || (result.ok ? 'OK' : 'Error')}</span>
              </span>
              <span class="latency-pill">⚡ ${result.latencyMs || 0} ms</span>
            </div>
            <span class="response-url-tag" title="${escapeHtml(result.targetUrl || '')}">
              ${escapeHtml(result.targetUrl || '')}
            </span>
          </div>

          <!-- Vehicle RC & RTO Card (if detected) -->
          ${vehicleCardHtml}

          <!-- Telegram User Card (if detected) -->
          ${tgUserCardHtml}

          <!-- Administrative Security Shield Card (if protected/denied) -->
          ${protectedCardHtml}

          <!-- Highlight Key Value Cards (if detected) -->
          ${smartCardsHtml}

          <!-- JSON Viewer Card -->
          <div class="json-viewer-box">
            <div class="json-viewer-header">
              <span>Payload Response Body (JSON)</span>
              <div class="json-actions">
                <button type="button" class="btn btn-ghost btn-sm copy-btn" data-json="${escapeAttr(JSON.stringify(rawData, null, 2))}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>Copy</span>
                </button>
              </div>
            </div>
            <pre class="json-code-content"><code>${formattedJsonHtml}</code></pre>
          </div>

          <!-- Action Toolbar -->
          <div class="bot-action-bar">
            <button type="button" class="action-chip-btn speak-btn" data-speech="${escapeAttr(speechSummary)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span>Speak Output</span>
            </button>
            <button type="button" class="action-chip-btn download-json-btn" data-json="${escapeAttr(JSON.stringify(rawData, null, 2))}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download JSON</span>
            </button>
          </div>

        </div>
        <span class="msg-timestamp">${time}</span>
      </div>
    `;

    elements.chatMessages.appendChild(row);

    // Attach button listeners inside the newly created message
    const copyBtn = row.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = copyBtn.getAttribute('data-json');
        navigator.clipboard.writeText(text).then(() => {
          const originalText = copyBtn.innerHTML;
          copyBtn.innerHTML = '<span>✓ Copied!</span>';
          setTimeout(() => { copyBtn.innerHTML = originalText; }, 2000);
        });
      });
    }

    const speakBtn = row.querySelector('.speak-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => {
        const text = speakBtn.getAttribute('data-speech');
        speakText(text);
      });
    }

    const downloadBtn = row.querySelector('.download-json-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const jsonStr = downloadBtn.getAttribute('data-json');
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `response_${queryNumber}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  // --- VEHICLE REGISTRATION CARD GENERATOR ---
  function buildVehicleCard(data) {
    if (!data || typeof data !== 'object') return '';
    const v = data.vehicle || (data.registrationNumber && data.ownerName ? data : null);
    if (!v) return '';

    return `
      <div class="vehicle-info-card">
        <div class="vehicle-card-header">
          <div class="vehicle-plate-pill">${escapeHtml(v.registrationNumber || 'VEHICLE')}</div>
          <div class="vehicle-title-col">
            <div class="vehicle-card-title">${escapeHtml(v.makerModel || 'Motor Vehicle')}</div>
            <div class="vehicle-card-sub">${escapeHtml(v.vehicleClass || 'LMV')} &bull; ${escapeHtml(v.fuelType || 'Fuel')}</div>
          </div>
          <span class="vehicle-status-badge ${String(v.rcStatus || '').toLowerCase().includes('active') ? 'active' : ''}">${escapeHtml(v.rcStatus || 'VERIFIED')}</span>
        </div>
        <div class="vehicle-prop-grid">
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Registered Owner</span>
            <span class="v-prop-val owner">${escapeHtml(v.ownerName || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Registering Authority (RTO)</span>
            <span class="v-prop-val">${escapeHtml(v.rtoName || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Registration Date</span>
            <span class="v-prop-val">${escapeHtml(v.registrationDate || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Fitness Upto</span>
            <span class="v-prop-val">${escapeHtml(v.fitnessUpto || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Insurance Validity</span>
            <span class="v-prop-val highlight">${escapeHtml(v.insuranceUpto || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Insurance Provider</span>
            <span class="v-prop-val">${escapeHtml(v.insuranceCompany || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">PUCC Valid Upto</span>
            <span class="v-prop-val">${escapeHtml(v.puccUpto || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Engine & Chassis</span>
            <span class="v-prop-val mono">${escapeHtml(v.engineNumber || '')} / ${escapeHtml(v.chassisNumber || '')}</span>
          </div>
        </div>
      </div>
    `;
  }

  // --- TELEGRAM ID LOOKUP CARD GENERATOR ---
  function buildTgUserCard(data) {
    if (!data || typeof data !== 'object') return '';
    const p = data.profile || (data.telegramId && data.linkedPhone ? data : null);
    if (!p) return '';

    return `
      <div class="vehicle-info-card" style="border-left-color: #0088cc;">
        <div class="vehicle-card-header">
          <div class="vehicle-plate-pill" style="background: rgba(0, 136, 204, 0.15); color: #0088cc; border-color: rgba(0, 136, 204, 0.4);">
            ✈️ TG: ${escapeHtml(p.telegramId || 'USER')}
          </div>
          <div class="vehicle-title-col">
            <div class="vehicle-card-title">${escapeHtml(p.name || 'Telegram User')}</div>
            <div class="vehicle-card-sub">@${escapeHtml((p.username || '').replace('@', ''))} &bull; ${escapeHtml(p.authMethod || 'Telegram 2FA')}</div>
          </div>
          <span class="vehicle-status-badge active" style="background: rgba(0, 136, 204, 0.2); color: #0088cc;">${escapeHtml(p.simStatus || 'RESOLVED')}</span>
        </div>
        <div class="vehicle-prop-grid">
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">📱 Linked Phone Number</span>
            <span class="v-prop-val highlight" style="font-size: 1.1em; color: var(--accent); font-weight: 700;">${escapeHtml(p.linkedPhone || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Telecom Carrier</span>
            <span class="v-prop-val">${escapeHtml(p.carrier || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Telecom Circle</span>
            <span class="v-prop-val">${escapeHtml(p.circle || 'N/A')}</span>
          </div>
          <div class="vehicle-prop-item">
            <span class="v-prop-lbl">Security / Encryption Status</span>
            <span class="v-prop-val">${escapeHtml(p.encryptionStatus || 'Standard Profile')}</span>
          </div>
        </div>
      </div>
    `;
  }

  // --- ADMINISTRATIVE ENCRYPTION SHIELD CARD ---
  function buildProtectedCard(data, result = {}) {
    if (!data && !result) return '';
    const isProtected = result?.isProtected || data?.code === 'ADMIN_ID_PROTECTED' || (result?.status === 403 && (data?.error || '').includes('protected'));
    if (!isProtected) return '';

    const msg = data?.message || data?.error || result?.error || 'Security encryption protocols strictly protect administrative owner identities from resolution.';

    return `
      <div class="vehicle-info-card" style="border-left-color: #ef4444; background: rgba(239, 68, 68, 0.08);">
        <div class="vehicle-card-header">
          <div class="vehicle-plate-pill" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.5);">
            🔒 ENCRYPTED
          </div>
          <div class="vehicle-title-col">
            <div class="vehicle-card-title" style="color: #ef4444;">⛔ Administrative Encryption Shield Active</div>
            <div class="vehicle-card-sub" style="color: #fca5a5;">Protected Bot Administrator / Owner Identity</div>
          </div>
          <span class="vehicle-status-badge" style="background: rgba(239, 68, 68, 0.3); color: #ef4444; font-weight: 700;">BLOCKED</span>
        </div>
        <div style="padding: 12px 14px; font-size: 0.9em; color: var(--text); line-height: 1.5;">
          ${escapeHtml(msg)}
        </div>
      </div>
    `;
  }

  // --- SMART KEY-VALUE CARDS GENERATOR ---
  function buildSmartCards(data) {
    if (!data || typeof data !== 'object') return '';

    // Flatten nested objects up to 1 level for quick discovery
    const items = [];
    function scan(obj, prefix = '') {
      if (!obj || typeof obj !== 'object') return;
      
      // If array of objects, scan first item to extract record fields
      if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object') {
          scan(obj[0], prefix);
        }
        return;
      }

      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          if (v.length > 0 && typeof v[0] === 'object') {
            scan(v[0], `${prefix}`);
          }
        } else if (typeof v === 'object') {
          scan(v, `${prefix}${k}.`);
        } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          // Check for prominent keys
          const keyLower = k.toLowerCase();
          const isHighPriority = [
            'name', 'registeredname', 'fullname', 'fname', 'father', 'carrier', 'networkcircle',
            'circle', 'department', 'rollno', 'cgpa', 'attendancepercentage', 'status',
            'deliverystatus', 'generatedotp', 'lineType', 'spamscore', 'city', 'address', 'email', 'mobile'
          ].some(target => keyLower === target || keyLower.includes(target));

          if (isHighPriority || items.length < 8) {
            items.push({
              key: formatKeyName(prefix ? `${prefix}${k}` : k),
              val: String(v).replace(/!+/g, ', ') // Clean exclamation delimiters if in address
            });
          }
        }
      }
    }
    scan(data);

    if (items.length === 0) return '';

    // Pick top 6 cards
    const displayItems = items.slice(0, 6);
    return `
      <div class="smart-cards-grid">
        ${displayItems.map(item => `
          <div class="smart-card-item">
            <span class="smart-card-key">${escapeHtml(item.key)}</span>
            <span class="smart-card-val">${escapeHtml(item.val)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function formatKeyName(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[\._]/g, ' ')
      .trim();
  }

  // --- SYNTAX HIGHLIGHT JSON ---
  function syntaxHighlightJson(json) {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2);
    }
    if (!json) return '';

    json = escapeHtml(json);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  // --- TEXT TO SPEECH ---
  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
      return;
    }
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  function generateSpeechSummary(result, queryNumber) {
    if (!result.ok) {
      return `API query for number ${queryNumber} failed with status ${result.status}. Error message: ${result.error || result.statusText}`;
    }
    const data = result.data;
    if (data && typeof data === 'object') {
      if (data.vehicle?.ownerName || (data.registrationNumber && data.ownerName)) {
        const v = data.vehicle || data;
        return `Vehicle RC record found for ${v.registrationNumber || queryNumber}. Owner: ${v.ownerName}, Model: ${v.makerModel || 'Vehicle'}, RTO: ${v.rtoName || 'RTO'}.`;
      }
      if (Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.name) {
        const item = data.data[0];
        return `Record found for ${queryNumber}: Name ${item.name}, Father ${item.fname || 'N/A'}, Circle ${item.circle || 'N/A'}.`;
      }
      if (data.data?.registeredName) {
        return `Lookup successful for ${queryNumber}. Registered to ${data.data.registeredName}, on ${data.data.carrier}, circle ${data.data.networkCircle}.`;
      }
      if (data.profile?.fullName) {
        return `Student profile found. ${data.profile.fullName}, Department of ${data.profile.department}, CGPA ${data.profile.cgpa}.`;
      }
      if (data.details?.deliveryStatus) {
        return `SMS status: ${data.details.deliveryStatus} to recipient ${queryNumber}. OTP is ${data.details.generatedOtp}.`;
      }
    }
    return `API response received with status ${result.status} OK in ${result.latencyMs} milliseconds.`;
  }

  // --- CLEAR CHAT ---
  elements.clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear entire chat query history?')) {
      elements.chatMessages.innerHTML = '';
      if (elements.emptyState) {
        elements.chatMessages.appendChild(elements.emptyState);
        elements.emptyState.style.display = 'flex';
      }
      state.queriesCount = 0;
      elements.queryCountBadge.textContent = '0 queries';
      state.chatHistory = [];
    }
  });

  // --- EXPORT CHAT AS JSON ---
  elements.exportChatBtn.addEventListener('click', () => {
    if (state.chatHistory.length === 0) {
      alert('No queries yet to export!');
      return;
    }
    const exportData = {
      project: 'APIChat College Project',
      exportedAt: new Date().toISOString(),
      totalQueries: state.chatHistory.length,
      history: state.chatHistory
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apichat-session-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- MODAL CONTROLS ---
  elements.projectDocsBtn.addEventListener('click', () => {
    elements.docsModal.classList.remove('hidden');
  });

  elements.closeModalBtn.addEventListener('click', () => {
    elements.docsModal.classList.add('hidden');
  });

  elements.modalOkBtn.addEventListener('click', () => {
    elements.docsModal.classList.add('hidden');
  });

  elements.docsModal.addEventListener('click', (e) => {
    if (e.target === elements.docsModal) {
      elements.docsModal.classList.add('hidden');
    }
  });

  // --- TELEGRAM BOT LOGIC & CONTROLS ---
  elements.telegramModalBtn.addEventListener('click', () => {
    elements.telegramModal.classList.remove('hidden');
    elements.telegramTokenInput.focus();
  });

  elements.closeTelegramModalBtn.addEventListener('click', () => {
    elements.telegramModal.classList.add('hidden');
  });

  elements.tgModalDoneBtn.addEventListener('click', () => {
    elements.telegramModal.classList.add('hidden');
  });

  elements.telegramModal.addEventListener('click', (e) => {
    if (e.target === elements.telegramModal) {
      elements.telegramModal.classList.add('hidden');
    }
  });

  // Fetch Telegram Bot Status
  async function fetchTelegramStatus() {
    try {
      const res = await authFetch('/api/telegram/status');
      const data = await res.json();
      if (data.ok) {
        updateTelegramUI(data.data);
      }
    } catch (err) {
      console.error('Failed to get Telegram status:', err);
    }
  }

  function updateTelegramUI(tgState) {
    if (tgState && tgState.isRunning && tgState.botInfo) {
      elements.telegramStatusDot.className = 'status-dot-mini online';
      elements.telegramBtnText.textContent = `@${tgState.botInfo.username}`;
      elements.tgStatusIcon.className = 'tg-status-icon-wrapper connected';
      elements.tgStatusTitle.textContent = `🟢 Connected: @${tgState.botInfo.username}`;
      elements.tgStatusDesc.textContent = `Bot is actively polling and listening for 10-digit numbers! Queries processed: ${tgState.stats?.telegramQueriesCount || 0}`;
      elements.tgActiveBotLink.classList.remove('hidden');
      elements.tgBotLinkTag.href = `https://t.me/${tgState.botInfo.username}`;
      elements.tgConnectBtn.classList.add('hidden');
      elements.tgDisconnectBtn.classList.remove('hidden');
      elements.tgBroadcastSection.classList.remove('hidden');
      elements.telegramTokenInput.disabled = true;
      elements.tgFormError.style.display = 'none';
    } else {
      elements.telegramStatusDot.className = 'status-dot-mini offline';
      elements.telegramBtnText.textContent = 'Telegram Bot';
      elements.tgStatusIcon.className = 'tg-status-icon-wrapper';
      elements.tgStatusTitle.textContent = 'Telegram Bot: Disconnected';
      elements.tgStatusDesc.textContent = 'Enter your bot token below to start receiving 10-digit queries directly from Telegram users.';
      elements.tgActiveBotLink.classList.add('hidden');
      elements.tgConnectBtn.classList.remove('hidden');
      elements.tgDisconnectBtn.classList.add('hidden');
      elements.tgBroadcastSection.classList.add('hidden');
      elements.telegramTokenInput.disabled = false;
    }
  }

  // Connect Telegram Bot Form Submit
  elements.telegramConnectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = elements.telegramTokenInput.value.trim();
    if (!token) {
      elements.tgFormError.textContent = 'Please enter a valid Telegram Bot Token from @BotFather.';
      elements.tgFormError.style.display = 'block';
      return;
    }

    elements.tgConnectBtn.disabled = true;
    elements.tgConnectBtn.textContent = 'Connecting...';
    elements.tgFormError.style.display = 'none';

    try {
      const res = await authFetch('/api/telegram/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          apiUrl: elements.apiUrlInput.value.trim() || '/api/mock/telecom-lookup',
          paramName: elements.queryParamInput.value.trim() || 'number'
        })
      });

      const data = await res.json();
      elements.tgConnectBtn.disabled = false;
      elements.tgConnectBtn.textContent = 'Connect & Start Bot';

      if (data.ok) {
        updateTelegramUI({
          isRunning: true,
          botInfo: data.data.botInfo,
          stats: { telegramQueriesCount: 0 }
        });
        alert(`🎉 Success! Telegram Bot @${data.data.botInfo.username} is connected! You can now send 10-digit numbers from Telegram.`);
      } else {
        elements.tgFormError.textContent = `Error: ${data.error || 'Failed to connect bot'}`;
        elements.tgFormError.style.display = 'block';
      }
    } catch (err) {
      elements.tgConnectBtn.disabled = false;
      elements.tgConnectBtn.textContent = 'Connect & Start Bot';
      elements.tgFormError.textContent = `Network error: ${err.message}`;
      elements.tgFormError.style.display = 'block';
    }
  });

  // Disconnect Telegram Bot
  elements.tgDisconnectBtn.addEventListener('click', async () => {
    if (!confirm('Stop Telegram Bot polling?')) return;
    try {
      await authFetch('/api/telegram/stop', { method: 'POST' });
      fetchTelegramStatus();
    } catch (err) {
      alert('Failed to stop bot: ' + err.message);
    }
  });

  // Broadcast Message to Telegram Subscribers
  elements.tgBroadcastBtn.addEventListener('click', async () => {
    const msg = elements.tgBroadcastInput.value.trim();
    if (!msg) {
      alert('Please enter a message to broadcast.');
      return;
    }
    try {
      const res = await authFetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Broadcast sent to ${data.sentCount} active subscriber(s)!`);
        elements.tgBroadcastInput.value = '';
      }
    } catch (err) {
      alert('Broadcast failed: ' + err.message);
    }
  });

  // Update active endpoint and Telegram target API when user changes endpoint in sidebar
  elements.apiUrlInput.addEventListener('change', () => {
    saveSidebarToActiveApi(state.activeApiId, true);
    authFetch('/api/telegram/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiUrl: elements.apiUrlInput.value.trim(),
        paramName: elements.queryParamInput.value.trim()
      })
    }).catch(() => {});
  });

  // --- SERVER-SENT EVENTS (SSE) STREAM ---
  let activeEventSource = null;
  function initEventStream() {
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }

    const token = getAuthToken();
    if (!token) return;

    try {
      activeEventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      activeEventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'telegram_status') {
            fetchTelegramStatus();
          } else if (payload.type === 'config_lock') {
            const data = payload.payload;
            if (data && data.isLocked !== state.isLocked) {
              setApiLockState(data.isLocked, false);
            }
          } else if (payload.type === 'telegram_auth_updated') {
            fetchTelegramUsers();
          } else if (payload.type === 'telegram_access_request') {
            fetchTelegramUsers();
            playTone('receive');
          } else if (payload.type === 'telegram_query') {
            // Live query came in from Telegram!
            const item = payload.payload;
            if (elements.emptyState) {
              elements.emptyState.style.display = 'none';
            }
            appendUserMessage(item.number, item.targetUrl, 'GET', `Telegram @${item.user}`);
            appendBotMessage(item.result, item.number);
            playTone('receive');
            state.queriesCount++;
            elements.queryCountBadge.textContent = `${state.queriesCount} quer${state.queriesCount === 1 ? 'y' : 'ies'}`;
            scrollToBottom();
          }
        } catch (e) {
          console.error('Error parsing SSE event:', e);
        }
      };
      activeEventSource.onerror = () => {
        // SSE disconnected, will retry automatically if authorized
      };
    } catch (e) {
      console.warn('SSE not supported or connection error:', e);
    }
  }

  // --- TELEGRAM AUTHORIZATION & RATE LIMITS MANAGEMENT ---
  async function fetchTelegramUsers() {
    try {
      const res = await authFetch('/api/telegram/auth/state');
      const data = await res.json();
      if (data.ok) {
        renderTelegramUsers(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch Telegram users:', e);
    }
  }

  function renderTelegramUsers(authData) {
    if (!authData) return;

    // 1. Render Owner Info
    if (authData.ownerId) {
      elements.tgOwnerBadge.textContent = `👑 Owner: ID ${authData.ownerId}`;
      elements.tgOwnerIdInput.value = authData.ownerId;
    } else {
      elements.tgOwnerBadge.textContent = '👑 Owner: Not Set';
    }

    // 2. Render Pending Requests
    const pending = authData.pendingRequests || [];
    elements.pendingCountBadge.textContent = pending.length;
    if (pending.length > 0) {
      elements.tgPendingRequestsCard.classList.remove('hidden');
      elements.pendingListContainer.innerHTML = pending.map(p => `
        <div class="pending-item-row">
          <div class="pending-item-info">
            <strong>@${escapeHtml(p.username)}</strong>
            <code>${escapeHtml(p.id)}</code>
          </div>
          <div class="pending-actions">
            <button type="button" class="btn btn-primary btn-sm approve-user-btn" data-id="${p.id}" data-name="${escapeAttr(p.username)}">Approve (10)</button>
            <button type="button" class="btn btn-secondary btn-sm reject-user-btn" data-id="${p.id}">Reject</button>
          </div>
        </div>
      `).join('');

      elements.pendingListContainer.querySelectorAll('.approve-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          await authorizeUser(id, name, 10);
        });
      });

      elements.pendingListContainer.querySelectorAll('.reject-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await rejectUser(id);
        });
      });
    } else {
      elements.tgPendingRequestsCard.classList.add('hidden');
    }

    // 3. Render Authorized Users
    const users = authData.users || [];
    if (users.length === 0) {
      elements.authUsersList.innerHTML = `<div style="color: var(--text-dim); font-size: 11px; padding: 6px;">No users authorized yet.</div>`;
    } else {
      elements.authUsersList.innerHTML = users.map(u => {
        const isOwner = u.role === 'owner' || String(u.id) === String(authData.ownerId);
        const rem = u.limit === -1 ? '∞ Unlimited' : `${Math.max(0, u.limit - (u.used || 0))}/${u.limit} remaining`;
        const pillClass = isOwner ? 'quota-pill unlimited' : (u.limit !== -1 && (u.used || 0) >= u.limit ? 'quota-pill exhausted' : 'quota-pill');

        return `
          <div class="auth-user-card">
            <div class="auth-user-meta">
              <span>${isOwner ? '👑' : '👤'}</span>
              <div>
                <strong>@${escapeHtml(u.username || 'User')}</strong>
                <code style="font-size: 11px; color: var(--text-dim); margin-left: 4px;">ID: ${escapeHtml(u.id)}</code>
              </div>
              <span class="${pillClass}">${rem}</span>
            </div>
            <div class="pending-actions">
              ${!isOwner ? `
                <button type="button" class="btn btn-ghost btn-sm add-quota-btn" data-id="${u.id}" data-current="${u.limit}" title="Add 5 queries">+5</button>
                <button type="button" class="btn btn-ghost btn-sm set-limit-btn" data-id="${u.id}" data-current="${u.limit}" title="Set custom limit">Set</button>
                <button type="button" class="btn btn-ghost btn-sm revoke-user-btn" data-id="${u.id}" style="color: var(--danger);" title="Revoke access">✕</button>
              ` : `<span style="font-size: 11px; color: var(--text-dim); padding-right: 6px;">Admin</span>`}
            </div>
          </div>
        `;
      }).join('');

      // Wire action buttons
      elements.authUsersList.querySelectorAll('.add-quota-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const current = parseInt(btn.getAttribute('data-current'), 10) || 10;
          await setUserLimit(id, current + 5);
        });
      });

      elements.authUsersList.querySelectorAll('.set-limit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const current = btn.getAttribute('data-current');
          const val = prompt(`Set query limit for User ${id} (-1 for unlimited):`, current);
          if (val !== null && val.trim() !== '') {
            await setUserLimit(id, parseInt(val, 10));
          }
        });
      });

      elements.authUsersList.querySelectorAll('.revoke-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm(`Revoke bot access for User ID ${id}?`)) {
            await revokeUser(id);
          }
        });
      });
    }
  }

  // API Calls for Auth Management
  async function authorizeUser(userId, username, limit) {
    try {
      const res = await authFetch('/api/telegram/auth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username, limit })
      });
      const data = await res.json();
      if (data.ok) fetchTelegramUsers();
    } catch (e) {
      alert('Failed to authorize user: ' + e.message);
    }
  }

  async function setUserLimit(userId, limit) {
    try {
      const res = await authFetch('/api/telegram/auth/set-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, limit })
      });
      const data = await res.json();
      if (data.ok) fetchTelegramUsers();
    } catch (e) {
      alert('Failed to update limit: ' + e.message);
    }
  }

  async function revokeUser(userId) {
    try {
      const res = await authFetch('/api/telegram/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.ok) fetchTelegramUsers();
    } catch (e) {
      alert('Failed to revoke user: ' + e.message);
    }
  }

  async function rejectUser(userId) {
    try {
      const res = await authFetch('/api/telegram/auth/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.ok) fetchTelegramUsers();
    } catch (e) {
      alert('Failed to reject user: ' + e.message);
    }
  }

  // Save Owner button listener
  elements.saveOwnerBtn?.addEventListener('click', async () => {
    const ownerId = elements.tgOwnerIdInput.value.trim();
    if (!ownerId) {
      alert('Please enter a valid Telegram User ID.');
      return;
    }
    try {
      const res = await authFetch('/api/telegram/auth/set-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId, username: 'BotOwner' })
      });
      const data = await res.json();
      if (data.ok) {
        alert(`👑 Owner set to ID: ${ownerId}!`);
        fetchTelegramUsers();
      }
    } catch (e) {
      alert('Failed to save owner: ' + e.message);
    }
  });

  // Manual Auth button listener
  elements.manualAuthBtn?.addEventListener('click', async () => {
    const id = elements.manualAuthId.value.trim();
    const limit = parseInt(elements.manualAuthLimit.value, 10) || 10;
    if (!id) {
      alert('Please enter a Telegram User ID to authorize.');
      return;
    }
    await authorizeUser(id, 'User', limit);
    elements.manualAuthId.value = '';
  });

  elements.refreshAuthUsersBtn?.addEventListener('click', () => {
    fetchTelegramUsers();
  });

  // --- LOCK API CONFIGURATION LOGIC ---
  function setApiLockState(locked, save = true) {
    state.isLocked = Boolean(locked);

    if (state.isLocked) {
      elements.configSidebar.classList.add('is-locked');
      elements.lockApiBtn.classList.add('is-locked-state');
      elements.lockIconLocked.classList.remove('hidden');
      elements.lockIconUnlocked.classList.add('hidden');
      elements.lockBtnText.textContent = 'Locked';
      elements.lockedBanner.classList.remove('hidden');

      // Disable inputs to lock configuration
      elements.apiUrlInput.disabled = true;
      elements.queryParamInput.disabled = true;
      elements.httpMethodSelect.disabled = true;
      elements.apiPresetSelect.disabled = true;
      elements.proxyToggle.disabled = true;
      elements.authHeaderInput.disabled = true;
      elements.customHeadersInput.disabled = true;
      elements.postBodyTypeSelect.disabled = true;

      if (save) {
        const lockedData = {
          isLocked: true,
          apiUrl: elements.apiUrlInput.value,
          paramName: elements.queryParamInput.value,
          method: elements.httpMethodSelect.value,
          preset: elements.apiPresetSelect.value,
          proxy: elements.proxyToggle.checked,
          auth: elements.authHeaderInput.value,
          headers: elements.customHeadersInput.value,
          postBodyType: elements.postBodyTypeSelect.value
        };
        localStorage.setItem('apichat_locked_api', JSON.stringify(lockedData));
      }

      // Sync lock state with backend (including Telegram Bot)
      authFetch('/api/config/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isLocked: true,
          apiUrl: elements.apiUrlInput.value.trim(),
          paramName: elements.queryParamInput.value.trim()
        })
      }).catch(() => {});

    } else {
      elements.configSidebar.classList.remove('is-locked');
      elements.lockApiBtn.classList.remove('is-locked-state');
      elements.lockIconLocked.classList.add('hidden');
      elements.lockIconUnlocked.classList.remove('hidden');
      elements.lockBtnText.textContent = 'Lock API';
      elements.lockedBanner.classList.add('hidden');

      // Enable inputs
      elements.apiUrlInput.disabled = false;
      elements.queryParamInput.disabled = false;
      elements.httpMethodSelect.disabled = false;
      elements.apiPresetSelect.disabled = false;
      elements.proxyToggle.disabled = false;
      elements.authHeaderInput.disabled = false;
      elements.customHeadersInput.disabled = false;
      elements.postBodyTypeSelect.disabled = false;

      if (save) {
        localStorage.removeItem('apichat_locked_api');
      }

      // Sync unlock state with backend
      authFetch('/api/config/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isLocked: false,
          apiUrl: elements.apiUrlInput.value.trim(),
          paramName: elements.queryParamInput.value.trim()
        })
      }).catch(() => {});
    }
  }

  // Restore locked config on page load if present
  function restoreLockedConfig() {
    try {
      const saved = localStorage.getItem('apichat_locked_api');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.isLocked) {
          setApiLockState(true, false);
        }
      }
    } catch (e) {
      console.error('Failed to restore locked config:', e);
    }
  }

  elements.lockApiBtn?.addEventListener('click', () => {
    setApiLockState(!state.isLocked);
  });

  elements.unlockQuickBtn?.addEventListener('click', () => {
    setApiLockState(false);
  });

  // ============================================================
  // --- MULTI-API HUB MANAGEMENT (Tabs, Selection, CRUD, Storage) ---
  // ============================================================

  const STORAGE_KEY_APIS = 'apichat_endpoints_cache_v2';
  const STORAGE_KEY_ACTIVE = 'apichat_active_api_id_v2';

  // Save current APIs & active selection to localStorage immediately
  function saveApisToLocalStorage() {
    try {
      if (Array.isArray(state.apis) && state.apis.length > 0) {
        localStorage.setItem(STORAGE_KEY_APIS, JSON.stringify(state.apis));
      }
      if (state.activeApiId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE, state.activeApiId);
      }
    } catch (e) {
      console.warn('Failed to save APIs to localStorage:', e);
    }
  }

  // Load saved APIs from localStorage
  function loadApisFromLocalStorage() {
    try {
      const savedApis = localStorage.getItem(STORAGE_KEY_APIS);
      const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
      if (savedApis) {
        const parsed = JSON.parse(savedApis);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.apis = parsed;
          if (savedActive && parsed.some(a => a.id === savedActive)) {
            state.activeApiId = savedActive;
          } else {
            state.activeApiId = parsed[0].id;
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('Failed to load APIs from localStorage:', e);
    }
    return false;
  }

  async function loadApiEndpoints() {
    try {
      const res = await fetch('/api/endpoints');
      if (!res.ok) return;
      const data = await res.json();
      const rawList = data.endpoints || (data.data && data.data.apis) || [];
      if (data.ok && Array.isArray(rawList)) {
        const serverApis = rawList;

        // Smart merge: If client has custom non-mock URLs in memory or localStorage, preserve them!
        if (Array.isArray(state.apis) && state.apis.length > 0) {
          state.apis.forEach(localApi => {
            const serverMatch = serverApis.find(s => s.id === localApi.id);
            if (serverMatch) {
              if (localApi.url && !localApi.url.includes('/api/mock/') && (!serverMatch.url || serverMatch.url.includes('/api/mock/'))) {
                serverMatch.url = localApi.url;
                serverMatch.paramName = localApi.paramName || serverMatch.paramName;
                serverMatch.method = localApi.method || serverMatch.method;
                serverMatch.authHeader = localApi.authHeader || serverMatch.authHeader;
                serverMatch.customHeaders = localApi.customHeaders || serverMatch.customHeaders;
                serverMatch.bodyType = localApi.bodyType || serverMatch.bodyType;
                // Sync back to backend in background
                authFetch(`/api/endpoints/${encodeURIComponent(serverMatch.id)}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    url: serverMatch.url,
                    paramName: serverMatch.paramName,
                    method: serverMatch.method,
                    authHeader: serverMatch.authHeader,
                    customHeaders: serverMatch.customHeaders,
                    bodyType: serverMatch.bodyType
                  })
                }).catch(() => {});
              }
            }
          });
        }

        state.apis = serverApis;
        if (data.activeId && serverApis.some(a => a.id === data.activeId)) {
          state.activeApiId = data.activeId;
        } else if (!state.activeApiId || !serverApis.some(a => a.id === state.activeApiId)) {
          state.activeApiId = serverApis[0] ? serverApis[0].id : 'phone_lookup';
        }

        saveApisToLocalStorage();
        renderApiTabs();
        
        // Find active endpoint and apply to UI
        const activeApi = state.apis.find(a => a.id === state.activeApiId) || state.apis[0];
        if (activeApi) {
          applyApiToUI(activeApi, false);
        }
      }
    } catch (err) {
      console.error('Failed to load API endpoints:', err);
    }
  }

  function renderApiTabs() {
    if (!elements.apiTabsContainer) return;
    elements.apiTabsContainer.innerHTML = '';

    (state.apis || []).forEach(api => {
      const isActive = api.id === state.activeApiId;
      const isCustomUrl = api.url && !api.url.includes('/api/mock/');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `api-tab-btn ${isActive ? 'active' : ''}`;
      btn.title = `${api.name}\nTarget: ${api.url || '(none)'}`;

      const deleteBtnHtml = !api.isBuiltin && !api.isSystem
        ? `<span class="tab-delete-btn" title="Delete API" data-id="${escapeAttr(api.id)}">&times;</span>`
        : '';

      const dotHtml = isCustomUrl
        ? `<span class="tab-status-dot active" title="Custom API configured">●</span>`
        : '';

      btn.innerHTML = `
        <span class="api-tab-icon">${escapeHtml(api.icon || '⚡')}</span>
        <span class="api-tab-label">${escapeHtml(api.name)}</span>
        ${dotHtml}
        ${deleteBtnHtml}
      `;

      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-delete-btn')) return;
        selectActiveApi(api.id);
      });

      const delBtn = btn.querySelector('.tab-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCustomApi(api.id, api.name);
        });
      }

      elements.apiTabsContainer.appendChild(btn);
    });
  }

  let autoSaveTimeout = null;

  async function saveSidebarToActiveApi(targetId = state.activeApiId, showFeedback = false) {
    if (!targetId || !state.apis) return;
    const api = state.apis.find(a => a.id === targetId);
    if (!api) return;

    const currentUrl = elements.apiUrlInput.value.trim();
    const currentParam = elements.queryParamInput.value.trim() || (api.inputType === 'vehicle' ? 'rc' : 'number');
    const currentMethod = elements.httpMethodSelect.value;
    const currentAuth = elements.authHeaderInput ? elements.authHeaderInput.value.trim() : '';
    const currentHeaders = elements.customHeadersInput ? elements.customHeadersInput.value.trim() : '';
    const currentBodyType = elements.postBodyTypeSelect ? elements.postBodyTypeSelect.value : 'json';

    // Immediately update in-memory object and localStorage
    api.url = currentUrl;
    api.paramName = currentParam;
    api.method = currentMethod;
    api.authHeader = currentAuth;
    api.customHeaders = currentHeaders;
    api.bodyType = currentBodyType;
    saveApisToLocalStorage();

    if (showFeedback && elements.saveActiveApiStatus) {
      elements.saveActiveApiStatus.textContent = 'Saving...';
      elements.saveActiveApiStatus.className = 'save-status-indicator saving';
    }

    try {
      const res = await authFetch(`/api/endpoints/${encodeURIComponent(targetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentUrl,
          paramName: currentParam,
          method: currentMethod,
          authHeader: currentAuth,
          customHeaders: currentHeaders,
          bodyType: currentBodyType
        })
      });

      const data = await res.json();
      if (data.ok && data.data) {
        Object.assign(api, data.data);
        saveApisToLocalStorage();
        renderApiTabs();
        if (showFeedback && elements.saveActiveApiStatus) {
          elements.saveActiveApiStatus.textContent = `✓ Stored for ${api.name}`;
          elements.saveActiveApiStatus.className = 'save-status-indicator saved';
          setTimeout(() => {
            if (elements.saveActiveApiStatus) elements.saveActiveApiStatus.textContent = '';
          }, 3500);
        }
      }
    } catch (err) {
      console.error('Failed to save API settings:', err);
      if (showFeedback && elements.saveActiveApiStatus) {
        elements.saveActiveApiStatus.textContent = '✓ Saved locally';
        elements.saveActiveApiStatus.className = 'save-status-indicator saved';
      }
    }
  }

  function handleSidebarConfigChange() {
    if (!state.activeApiId || !state.apis) return;
    const api = state.apis.find(a => a.id === state.activeApiId);
    if (!api) return;

    // Immediately update in-memory object and localStorage on every change
    api.url = elements.apiUrlInput.value.trim();
    api.paramName = elements.queryParamInput.value.trim() || (api.inputType === 'vehicle' ? 'rc' : 'number');
    api.method = elements.httpMethodSelect.value;
    if (elements.authHeaderInput) api.authHeader = elements.authHeaderInput.value.trim();
    if (elements.customHeadersInput) api.customHeaders = elements.customHeadersInput.value.trim();
    if (elements.postBodyTypeSelect) api.bodyType = elements.postBodyTypeSelect.value;
    saveApisToLocalStorage();

    updateRequestPreview();

    if (elements.saveActiveApiStatus) {
      elements.saveActiveApiStatus.textContent = '● Saving...';
      elements.saveActiveApiStatus.className = 'save-status-indicator saving';
    }

    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      saveSidebarToActiveApi(state.activeApiId, true);
    }, 500);
  }

  async function selectActiveApi(id) {
    if (!id) return;
    const previousApiId = state.activeApiId;

    // STEP 1: Save previous active tab's sidebar config before switching!
    if (previousApiId && previousApiId !== id) {
      clearTimeout(autoSaveTimeout);
      const prevApi = (state.apis || []).find(a => a.id === previousApiId);
      if (prevApi) {
        prevApi.url = elements.apiUrlInput.value.trim();
        prevApi.paramName = elements.queryParamInput.value.trim() || (prevApi.inputType === 'vehicle' ? 'rc' : 'number');
        prevApi.method = elements.httpMethodSelect.value;
        if (elements.authHeaderInput) prevApi.authHeader = elements.authHeaderInput.value.trim();
        if (elements.customHeadersInput) prevApi.customHeaders = elements.customHeadersInput.value.trim();
        if (elements.postBodyTypeSelect) prevApi.bodyType = elements.postBodyTypeSelect.value;

        // Immediately update localStorage!
        saveApisToLocalStorage();

        // Persist previous API settings to backend
        authFetch(`/api/endpoints/${encodeURIComponent(previousApiId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: prevApi.url,
            paramName: prevApi.paramName,
            method: prevApi.method,
            authHeader: prevApi.authHeader,
            customHeaders: prevApi.customHeaders,
            bodyType: prevApi.bodyType
          })
        }).catch((err) => console.error('Error saving previous tab API:', err));
      }
    }

    // STEP 2: Switch to new active API
    state.activeApiId = id;
    saveApisToLocalStorage();
    renderApiTabs();
    const activeApi = (state.apis || []).find(a => a.id === id);
    if (activeApi) {
      applyApiToUI(activeApi, true);
      // Persist active selection to backend
      authFetch(`/api/endpoints/${encodeURIComponent(id)}/activate`, {
        method: 'POST'
      }).catch(() => {});
    }
  }

  function applyApiToUI(api, notify = false) {
    if (!api) return;

    elements.apiUrlInput.value = api.url || '';
    elements.queryParamInput.value = api.paramName || (api.inputType === 'vehicle' ? 'rc' : 'number');
    elements.httpMethodSelect.value = api.method || 'GET';
    if (elements.authHeaderInput) {
      elements.authHeaderInput.value = api.authHeader || '';
    }
    if (elements.customHeadersInput) {
      elements.customHeadersInput.value = api.customHeaders
        ? (typeof api.customHeaders === 'string' ? api.customHeaders : JSON.stringify(api.customHeaders, null, 2))
        : '';
    }
    if (elements.postBodyTypeSelect) {
      elements.postBodyTypeSelect.value = api.bodyType || 'json';
    }

    // Update endpoint badge in chat
    if (elements.currentEndpointBadge) {
      elements.currentEndpointBadge.textContent = `${api.icon || '⚡'} ${api.name}`;
    }

    // Update sidebar editing banner & save button
    if (elements.editingApiIcon) {
      elements.editingApiIcon.textContent = api.icon || '⚡';
    }
    if (elements.editingApiNameBadge) {
      elements.editingApiNameBadge.textContent = api.name;
    }
    if (elements.editingApiTypeBadge) {
      elements.editingApiTypeBadge.textContent = api.inputType === 'vehicle' ? 'Vehicle RC API' : (api.inputType === 'tgid' ? 'Telegram ID to Number API' : (api.inputType === 'number' ? 'Phone API' : 'Custom API'));
    }
    if (elements.saveActiveApiBtnText) {
      elements.saveActiveApiBtnText.textContent = `Save Settings for ${api.name}`;
    }
    if (elements.saveActiveApiStatus) {
      elements.saveActiveApiStatus.textContent = '';
    }

    // Update input placeholder and counter depending on type
    if (api.inputType === 'vehicle') {
      elements.numberInput.placeholder = api.placeholder || 'Enter vehicle registration (e.g. DL01AB1234)...';
      elements.numberInput.maxLength = 15;
    } else if (api.inputType === 'tgid') {
      elements.numberInput.placeholder = api.placeholder || 'Enter Telegram numerical User ID (e.g. 512345678)...';
      elements.numberInput.maxLength = 15;
    } else if (api.inputType === 'number') {
      elements.numberInput.placeholder = api.placeholder || 'Enter 10-digit number (e.g. 9876543210)...';
      elements.numberInput.maxLength = 10;
    } else {
      elements.numberInput.placeholder = api.placeholder || 'Enter query value...';
      elements.numberInput.removeAttribute('maxLength');
    }

    // Update sample chips dynamically
    updateSampleChipsForApi(api);

    updateRequestPreview();
  }

  elements.saveActiveApiBtn?.addEventListener('click', async () => {
    clearTimeout(autoSaveTimeout);
    await saveSidebarToActiveApi(state.activeApiId, true);
  });

  function updateSampleChipsForApi(api) {
    const chipsWrapper = document.querySelector('.sample-chips');
    if (!chipsWrapper) return;

    let sampleValues = [];
    if (api.inputType === 'vehicle') {
      sampleValues = [
        { label: 'DL01AB1234 (Thar)', val: 'DL01AB1234' },
        { label: 'MH12DE1433 (Swift)', val: 'MH12DE1433' },
        { label: 'KA05MJ9901 (Creta)', val: 'KA05MJ9901' }
      ];
    } else if (api.inputType === 'tgid') {
      sampleValues = [
        { label: '512345678 (Demo User)', val: '512345678' },
        { label: '689102341 (Demo 2)', val: '689102341' },
        { label: '2051992452 (Owner ID - Protected)', val: '2051992452' }
      ];
    } else if (api.inputType === 'number') {
      sampleValues = [
        { label: '9876543210 (Airtel)', val: '9876543210' },
        { label: '9123456780 (Jio)', val: '9123456780' },
        { label: '9998887776 (VI)', val: '9998887776' }
      ];
    } else {
      sampleValues = [
        { label: 'Sample 1', val: '1001' },
        { label: 'Sample 2', val: 'TEST_01' }
      ];
    }

    chipsWrapper.innerHTML = '<span class="chips-label">Quick samples:</span>';
    sampleValues.forEach(s => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sample-chip';
      chip.setAttribute('data-num', s.val);
      chip.textContent = s.label;
      chip.addEventListener('click', () => {
        elements.numberInput.value = s.val;
        elements.numberInput.dispatchEvent(new Event('input'));
        elements.numberInput.focus();
      });
      chipsWrapper.appendChild(chip);
    });
  }

  async function deleteCustomApi(id, name) {
    if (!confirm(`Are you sure you want to delete the endpoint "${name}"?`)) return;
    try {
      const res = await authFetch(`/api/endpoints/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.ok) {
        await loadApiEndpoints();
      } else {
        alert(data.error || 'Failed to delete API endpoint.');
      }
    } catch (err) {
      alert('Network error while deleting API: ' + err.message);
    }
  }

  // --- Modal Opening & Dynamic Autofill ---
  elements.addNewApiBtn?.addEventListener('click', () => {
    if (elements.apiEditorForm) elements.apiEditorForm.reset();
    if (elements.editApiId) elements.editApiId.value = '';
    if (elements.apiModalTitle) elements.apiModalTitle.textContent = 'Add New API Endpoint';
    if (elements.apiFormError) elements.apiFormError.classList.add('hidden');
    if (elements.apiEditorModal) elements.apiEditorModal.classList.remove('hidden');
  });

  elements.closeApiModalBtn?.addEventListener('click', () => {
    elements.apiEditorModal?.classList.add('hidden');
  });

  elements.cancelApiModalBtn?.addEventListener('click', () => {
    elements.apiEditorModal?.classList.add('hidden');
  });

  elements.apiEditorModal?.addEventListener('click', (e) => {
    if (e.target === elements.apiEditorModal) {
      elements.apiEditorModal.classList.add('hidden');
    }
  });

  // Autofill defaults on type change
  elements.newApiType?.addEventListener('change', (e) => {
    const type = e.target.value;
    if (type === 'vehicle') {
      if (elements.newApiIcon) elements.newApiIcon.value = '🚗';
      if (elements.newApiParamName) elements.newApiParamName.value = 'rc';
      if (elements.newApiPlaceholder) elements.newApiPlaceholder.value = 'e.g. DL01AB1234';
      if (!elements.newApiUrl.value || elements.newApiUrl.value.includes('mock/phone')) {
        elements.newApiUrl.value = 'http://localhost:3000/api/mock/vehicle-lookup?rc={rc}';
      }
    } else if (type === 'tgid') {
      if (elements.newApiIcon) elements.newApiIcon.value = '✈️';
      if (elements.newApiParamName) elements.newApiParamName.value = 'tgid';
      if (elements.newApiPlaceholder) elements.newApiPlaceholder.value = 'e.g. 512345678';
      if (!elements.newApiUrl.value || elements.newApiUrl.value.includes('mock/')) {
        elements.newApiUrl.value = '/api/mock/tg-id-lookup?tgid={query}';
      }
    } else if (type === 'number') {
      if (elements.newApiIcon) elements.newApiIcon.value = '📱';
      if (elements.newApiParamName) elements.newApiParamName.value = 'number';
      if (elements.newApiPlaceholder) elements.newApiPlaceholder.value = '10-digit number';
    } else {
      if (elements.newApiIcon) elements.newApiIcon.value = '🌐';
      if (elements.newApiParamName) elements.newApiParamName.value = 'query';
      if (elements.newApiPlaceholder) elements.newApiPlaceholder.value = 'Search or identifier query';
    }
  });

  // Handle Save API Form Submission
  elements.apiEditorForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elements.newApiName.value.trim();
    const inputType = elements.newApiType.value;
    const method = elements.newApiMethod.value;
    const url = elements.newApiUrl.value.trim();
    const paramName = elements.newApiParamName.value.trim() || (inputType === 'vehicle' ? 'rc' : 'query');
    const icon = elements.newApiIcon.value.trim() || (inputType === 'vehicle' ? '🚗' : '⚡');
    const placeholder = elements.newApiPlaceholder.value.trim();
    const authHeader = elements.newApiAuthHeader.value.trim();

    if (!name || !url) {
      elements.apiFormError.textContent = 'Please enter both a Name and URL for this API.';
      elements.apiFormError.classList.remove('hidden');
      return;
    }

    elements.saveApiBtn.disabled = true;
    elements.saveApiBtn.textContent = 'Saving...';
    elements.apiFormError.classList.add('hidden');

    try {
      const res = await authFetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          inputType,
          method,
          url,
          paramName,
          icon,
          placeholder,
          authHeader
        })
      });

      const data = await res.json();
      elements.saveApiBtn.disabled = false;
      elements.saveApiBtn.textContent = 'Save Endpoint';

      if (data.ok) {
        elements.apiEditorModal.classList.add('hidden');
        await loadApiEndpoints();
        if (data.endpoint && data.endpoint.id) {
          selectActiveApi(data.endpoint.id);
        }
      } else {
        elements.apiFormError.textContent = data.error || 'Failed to save API endpoint.';
        elements.apiFormError.classList.remove('hidden');
      }
    } catch (err) {
      elements.saveApiBtn.disabled = false;
      elements.saveApiBtn.textContent = 'Save Endpoint';
      elements.apiFormError.textContent = 'Network error: ' + err.message;
      elements.apiFormError.classList.remove('hidden');
    }
  });

  // --- ADMIN AUTHENTICATION UI EVENT LISTENERS ---

  // 1. Submit Login Form
  elements.loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = elements.loginUsernameInput.value.trim();
    const password = elements.loginPasswordInput.value.trim();

    if (!username || !password) {
      elements.loginErrorMsg.textContent = 'Please enter both username and password.';
      elements.loginErrorMsg.classList.remove('hidden');
      return;
    }

    elements.loginSubmitBtn.disabled = true;
    elements.loginSubmitBtn.textContent = 'Signing in...';
    elements.loginErrorMsg.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      elements.loginSubmitBtn.disabled = false;
      elements.loginSubmitBtn.innerHTML = `<span>Sign In to Hub</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

      if (data.ok && data.token) {
        setAuthToken(data.token, data.username);
        updateLoggedInUserUI(data.username);
        hideLoginModal();
        playTone('receive');

        // Initialize protected data feeds
        loadApiEndpoints();
        fetchTelegramStatus();
        fetchTelegramUsers();
        initEventStream();
      } else {
        elements.loginErrorMsg.textContent = data.error || 'Invalid username or password.';
        elements.loginErrorMsg.classList.remove('hidden');
        playTone('error');
      }
    } catch (err) {
      elements.loginSubmitBtn.disabled = false;
      elements.loginSubmitBtn.innerHTML = `<span>Sign In to Hub</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      elements.loginErrorMsg.textContent = 'Network error: ' + err.message;
      elements.loginErrorMsg.classList.remove('hidden');
    }
  });

  // 2. User profile dropdown toggle
  elements.userMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.userDropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (elements.userProfileMenu && !elements.userProfileMenu.contains(e.target)) {
      elements.userDropdown?.classList.add('hidden');
    }
  });

  // 3. Logout button
  elements.logoutBtn?.addEventListener('click', async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    clearAuthToken();
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    elements.userDropdown?.classList.add('hidden');
    showLoginModal('You have been signed out.');
  });

  // 4. Change Password Modal Open & Close
  elements.openChangePassBtn?.addEventListener('click', () => {
    elements.userDropdown?.classList.add('hidden');
    elements.changePasswordModal?.classList.remove('hidden');
    elements.changePassMsg?.classList.add('hidden');
    elements.changePasswordForm?.reset();
    elements.currentPasswordInput?.focus();
  });

  elements.closeChangePassModalBtn?.addEventListener('click', () => {
    elements.changePasswordModal?.classList.add('hidden');
  });

  elements.cancelChangePassBtn?.addEventListener('click', () => {
    elements.changePasswordModal?.classList.add('hidden');
  });

  elements.changePasswordModal?.addEventListener('click', (e) => {
    if (e.target === elements.changePasswordModal) {
      elements.changePasswordModal.classList.add('hidden');
    }
  });

  // 5. Submit Change Password Form
  elements.changePasswordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = elements.currentPasswordInput.value.trim();
    const newUsername = elements.newUsernameInput.value.trim();
    const newPassword = elements.newPasswordInput.value.trim();
    const confirmNewPassword = elements.confirmNewPasswordInput.value.trim();

    if (newPassword !== confirmNewPassword) {
      elements.changePassMsg.textContent = 'New passwords do not match. Please re-enter.';
      elements.changePassMsg.className = 'login-error';
      elements.changePassMsg.classList.remove('hidden');
      return;
    }

    if (newPassword.length < 4) {
      elements.changePassMsg.textContent = 'New password must be at least 4 characters long.';
      elements.changePassMsg.className = 'login-error';
      elements.changePassMsg.classList.remove('hidden');
      return;
    }

    elements.saveChangePassBtn.disabled = true;
    elements.saveChangePassBtn.textContent = 'Saving...';

    try {
      const res = await authFetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newUsername, newPassword })
      });

      const data = await res.json();
      elements.saveChangePassBtn.disabled = false;
      elements.saveChangePassBtn.textContent = 'Save Changes';

      if (data.ok) {
        if (data.token) {
          setAuthToken(data.token, data.username);
        }
        updateLoggedInUserUI(data.username);
        elements.changePassMsg.textContent = '✅ Credentials updated successfully!';
        elements.changePassMsg.className = 'login-error success-style';
        elements.changePassMsg.classList.remove('hidden');

        setTimeout(() => {
          elements.changePasswordModal?.classList.add('hidden');
        }, 1500);
      } else {
        elements.changePassMsg.textContent = data.error || 'Failed to update credentials';
        elements.changePassMsg.className = 'login-error';
        elements.changePassMsg.classList.remove('hidden');
      }
    } catch (err) {
      elements.saveChangePassBtn.disabled = false;
      elements.saveChangePassBtn.textContent = 'Save Changes';
      elements.changePassMsg.textContent = 'Network error: ' + err.message;
      elements.changePassMsg.className = 'login-error';
      elements.changePassMsg.classList.remove('hidden');
    }
  });

  // --- UTILS ---
  function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/"/g, '&quot;');
  }

  // 1. Instantly restore from localStorage before any async calls!
  const hasLocal = loadApisFromLocalStorage();
  if (hasLocal) {
    renderApiTabs();
    const active = state.apis.find(a => a.id === state.activeApiId) || state.apis[0];
    if (active) {
      applyApiToUI(active, false);
    }
  }

  // Initial runs
  updateRequestPreview();
  restoreLockedConfig();

  // Load backend endpoints immediately (sync with server)
  loadApiEndpoints();

  // Check login session for protected features (Telegram status, broadcast, users)
  checkAuthSession().then((authenticated) => {
    if (authenticated) {
      fetchTelegramStatus();
      fetchTelegramUsers();
      initEventStream();
    }
  });
});
