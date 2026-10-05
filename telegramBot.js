/**
 * Telegram Bot Service for APIChat Hub
 * Connects Telegram Bot to the API Query Engine via long-polling (getUpdates)
 * Zero external dependencies: Uses Node.js native fetch and AbortController.
 */

const authManager = require('./telegramAuth');

class TelegramBotService {
  constructor(queryExecutor, apiStore = null) {
    this.queryExecutor = queryExecutor; // Function to execute API queries
    this.apiStore = apiStore; // Multi-API store
    this.authManager = authManager;
    this.token = null;
    this.botInfo = null;
    this.isRunning = false;
    this.abortController = null;
    this.lastUpdateId = 0;
    this.activeApiUrl = '/api/mock/telecom-lookup';
    this.activeParamName = 'number';
    this.isLocked = false; // When true, API config cannot be modified via Telegram commands
    this.subscribers = new Set(); // Stores chat IDs of connected users
    this.eventListeners = new Set(); // SSE client listeners
    this.stats = {
      telegramQueriesCount: 0,
      phoneQueries: 0,
      vehicleQueries: 0,
      tgIdQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      startedAt: null,
      lastQueryAt: null
    };
  }

  // Register SSE event callback
  subscribeEvents(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  broadcastEvent(eventType, payload) {
    for (const listener of this.eventListeners) {
      try {
        listener(eventType, payload);
      } catch (err) {
        console.error('SSE Broadcast error:', err.message);
      }
    }
  }

  // Connect & Start Polling
  async start(token, defaultApiUrl, defaultParamName = 'number') {
    if (!token || typeof token !== 'string') {
      throw new Error('Valid Telegram Bot Token is required.');
    }

    const cleanToken = token.trim();

    // 1. Verify Bot Token with getMe
    try {
      const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.description || 'Invalid Telegram Bot Token');
      }

      this.token = cleanToken;
      this.botInfo = data.result;
      this.activeApiUrl = defaultApiUrl || this.activeApiUrl;
      this.activeParamName = defaultParamName || this.activeParamName;
      this.isRunning = true;
      this.stats.startedAt = new Date().toISOString();
      this.abortController = new AbortController();

      console.log(`🤖 Telegram Bot @${this.botInfo.username} connected successfully!`);

      // 2. Start Long-Polling in background loop
      this.pollUpdates();

      this.broadcastEvent('telegram_status', {
        connected: true,
        botInfo: this.botInfo,
        activeApi: this.activeApiUrl
      });

      return {
        ok: true,
        botInfo: this.botInfo,
        activeApi: this.activeApiUrl
      };
    } catch (err) {
      this.isRunning = false;
      this.token = null;
      this.botInfo = null;
      throw err;
    }
  }

  // Stop Bot Polling
  async stop() {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    const info = this.botInfo;
    this.token = null;
    this.botInfo = null;

    this.broadcastEvent('telegram_status', {
      connected: false,
      botInfo: null
    });

    console.log(`🛑 Telegram Bot stopped.`);
    return { ok: true, stoppedBot: info ? info.username : null };
  }

  // Update target API configuration
  setConfig(apiUrl, paramName = 'number') {
    if (apiUrl) this.activeApiUrl = apiUrl;
    if (paramName) this.activeParamName = paramName;
    return {
      apiUrl: this.activeApiUrl,
      paramName: this.activeParamName
    };
  }

  // Set Lock state
  setLock(isLocked, apiUrl = null, paramName = null) {
    this.isLocked = Boolean(isLocked);
    if (apiUrl) this.activeApiUrl = apiUrl;
    if (paramName) this.activeParamName = paramName;

    this.broadcastEvent('config_lock', {
      isLocked: this.isLocked,
      activeApiUrl: this.activeApiUrl,
      activeParamName: this.activeParamName
    });

    console.log(`🔒 API Lock State: ${this.isLocked ? 'LOCKED' : 'UNLOCKED'} (Target: ${this.activeApiUrl})`);

    return {
      isLocked: this.isLocked,
      activeApiUrl: this.activeApiUrl,
      activeParamName: this.activeParamName
    };
  }

  // Helper: Retrieve Mobile Number Lookup API configuration
  getPhoneApi() {
    const phoneById = this.apiStore ? this.apiStore.getById('phone_lookup') : null;
    const active = this.apiStore ? this.apiStore.getActiveApi() : null;

    // Use activeApi only if it is explicitly a number-type API and not vehicle or tgid
    let selected = (active && active.inputType === 'number' && active.id !== 'tg_id_lookup' && active.id !== 'vehicle_lookup')
      ? active
      : phoneById;

    if (!selected && this.apiStore) {
      selected = this.apiStore.getAll().apis.find(a => a.inputType === 'number' && a.id !== 'tg_id_lookup' && a.id !== 'vehicle_lookup');
    }

    let url = selected?.url || '/api/mock/telecom-lookup';
    let paramName = selected?.paramName || 'number';
    let method = (selected?.method || 'GET').toUpperCase();
    let headers = {};

    // Allow activeApiUrl only if set by telegram /api command AND not a tgid/vehicle URL
    if (this.activeApiUrl && !this.activeApiUrl.includes('tg') && !this.activeApiUrl.includes('vehicle') && !this.activeApiUrl.includes('rc')) {
      if ((!url || url.includes('/api/mock/')) && !this.activeApiUrl.includes('/api/mock/')) {
        url = this.activeApiUrl;
      }
    }

    if (selected?.authHeader) {
      headers['Authorization'] = selected.authHeader;
    }
    if (selected?.customHeaders) {
      try {
        const parsed = typeof selected.customHeaders === 'object' ? selected.customHeaders : JSON.parse(selected.customHeaders);
        headers = { ...headers, ...parsed };
      } catch {}
    }

    return {
      id: selected?.id || 'phone_lookup',
      name: selected?.name || 'Mobile Number Lookup',
      url,
      paramName,
      method,
      headers
    };
  }

  // Helper: Retrieve Vehicle RC Lookup API configuration
  getVehicleApi() {
    const vehicleById = this.apiStore ? this.apiStore.getById('vehicle_lookup') : null;
    const active = this.apiStore ? this.apiStore.getActiveApi() : null;

    let selected = (active && active.inputType === 'vehicle') ? active : vehicleById;
    if (!selected && this.apiStore) {
      selected = this.apiStore.getAll().apis.find(a => a.inputType === 'vehicle');
    }

    let url = selected?.url || '/api/mock/vehicle-lookup';
    let paramName = selected?.paramName || 'rc';
    let method = (selected?.method || 'GET').toUpperCase();
    let headers = {};

    if (selected?.authHeader) {
      headers['Authorization'] = selected.authHeader;
    }
    if (selected?.customHeaders) {
      try {
        const parsed = typeof selected.customHeaders === 'object' ? selected.customHeaders : JSON.parse(selected.customHeaders);
        headers = { ...headers, ...parsed };
      } catch {}
    }

    return {
      id: selected?.id || 'vehicle_lookup',
      name: selected?.name || 'Vehicle RC & RTO Lookup',
      url,
      paramName,
      method,
      headers
    };
  }

  // Helper: Retrieve Telegram ID to Number API configuration
  getTgIdApi() {
    const tgById = this.apiStore ? this.apiStore.getById('tg_id_lookup') : null;
    const active = this.apiStore ? this.apiStore.getActiveApi() : null;

    let selected = (active && (active.inputType === 'tgid' || active.id === 'tg_id_lookup')) ? active : tgById;
    if (!selected && this.apiStore) {
      selected = this.apiStore.getAll().apis.find(a => a.inputType === 'tgid' || a.id === 'tg_id_lookup');
    }

    let url = selected?.url || '/api/mock/tg-id-lookup';
    let paramName = selected?.paramName || 'tgid';
    let method = (selected?.method || 'GET').toUpperCase();
    let headers = {};

    if (selected?.authHeader) {
      headers['Authorization'] = selected.authHeader;
    }
    if (selected?.customHeaders) {
      try {
        const parsed = typeof selected.customHeaders === 'object' ? selected.customHeaders : JSON.parse(selected.customHeaders);
        headers = { ...headers, ...parsed };
      } catch {}
    }

    return {
      id: selected?.id || 'tg_id_lookup',
      name: selected?.name || 'Telegram ID to Number',
      url,
      paramName,
      method,
      headers
    };
  }

  // Get current Bot Status
  getStatus() {
    return {
      isRunning: this.isRunning,
      botInfo: this.botInfo,
      activeApiUrl: this.activeApiUrl,
      activeParamName: this.activeParamName,
      isLocked: this.isLocked,
      stats: this.stats,
      subscribersCount: this.subscribers.size
    };
  }

  // Long-Polling Loop
  async pollUpdates() {
    while (this.isRunning && this.token) {
      try {
        const offset = this.lastUpdateId ? this.lastUpdateId + 1 : 0;
        const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${offset}&timeout=25&allowed_updates=["message"]`;

        const res = await fetch(url, { signal: this.abortController?.signal });
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.lastUpdateId = update.update_id;
            if (update.message) {
              await this.handleIncomingMessage(update.message);
            }
          }
        } else if (!data.ok) {
          console.error('Telegram getUpdates returned error:', data.description);
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          break; // Clean shutdown
        }
        // Brief backoff on network failure
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // Handle User Messages from Telegram
  async handleIncomingMessage(msg) {
    const chatId = msg.chat?.id;
    const text = (msg.text || '').trim();
    const fromUser = msg.from?.username || msg.from?.first_name || 'Telegram User';

    if (!chatId || !text) return;

    try {
      // 🔒 1. Gatekeeper Authorization Check
      const auth = this.authManager.checkAccess(chatId, fromUser);

    if (!auth.allowed) {
      const ownerId = this.authManager.ownerId || '2051992452';
      const ownerMarkup = {
        inline_keyboard: [
          [
            {
              text: '💬 Contact Bot Owner',
              url: `tg://user?id=${ownerId}`
            }
          ]
        ]
      };

      if (auth.reason === 'UNAUTHORIZED') {
        if (auth.isNewRequest && this.authManager.ownerId) {
          // Alert Bot Owner
          await this.sendMessage(
            this.authManager.ownerId,
            `🔔 *New Access Request*\n• *User:* @${fromUser}\n• *User ID:* \`${chatId}\`\n\nTo approve with 10 queries, reply:\n\`/auth ${chatId} 10\``
          );
        }
        this.broadcastEvent('telegram_access_request', {
          id: chatId,
          username: fromUser,
          time: new Date().toISOString()
        });

        await this.sendMessage(
          chatId,
          `⛔ *Access Restricted / Unauthorized*\n\nYou are not authorized to access or use this bot.\n• *Your User ID:* \`${chatId}\`\n• *Status:* 🔒 Pending Authorization\n\nPlease contact the Bot Owner to get access:\n👉 [Contact Bot Owner](tg://user?id=${ownerId})\n\n_Once authorized by the owner, you will be able to query the system._`,
          ownerMarkup
        );
        return;
      } else if (auth.reason === 'QUOTA_EXHAUSTED') {
        await this.sendMessage(
          chatId,
          `⚠️ *Query Quota Exhausted*\n\nYou have used all *${auth.limit}* authorized queries.\n• *Your User ID:* \`${chatId}\`\n\nPlease contact the Bot Owner to replenish your quota:\n👉 [Contact Bot Owner](tg://user?id=${ownerId})`,
          ownerMarkup
        );
        return;
      }
      return;
    }

    this.subscribers.add(chatId);

    // 2. Handle Commands
    if (text.startsWith('/start')) {
      const welcome = 
`👋 *Welcome to APIChat Hub Bot!*
_Multi-API Query & Verification System_

📱 *Phone Number Lookup:*
Send any *10-digit number* (e.g. \`9876543210\`)

🚗 *Vehicle RC & RTO Lookup:*
Send vehicle registration number (e.g. \`DL01AB1234\` or \`/vehicle DL01AB1234\`)

✈️ *Telegram ID to Number:*
Send \`/tg <id>\` (e.g. \`/tg 512345678\`) or numerical user ID

⚙️ *Gateway Status:* 🟢 Multi-API Hub Online

🛠️ *User Commands:*
• Send \`9876543210\` -> Phone Number Query
• Send \`DL01AB1234\` -> Vehicle RC Query
• Send \`/tg 512345678\` -> Telegram ID Query
• \`/apis\` -> List all configured active APIs
• \`/myid\` or \`/profile\` -> Check your profile & quota
• \`/stats\` or \`/totalstats\` -> Full system traffic statistics
• \`/status\` -> Check bot and service status
• \`/ping\` -> Gateway roundtrip speed test
• \`/help\` -> Show help instructions

👑 *Owner Commands:*
• \`/unlimited <userId>\` -> Grant ♾️ Unlimited Queries
• \`/auth <userId> [limit|unlimited]\` -> Authorize user
• \`/setlimit <userId> <limit|unlimited]\` -> Update quota
• \`/users\` -> View all authorized users & quotas
• \`/deauth <userId>\` -> Revoke user access
• \`/lock\` & \`/unlock\` -> Toggle API lock state`;

      await this.sendMessage(chatId, welcome);
      return;
    }

    if (text.startsWith('/apis')) {
      const allApis = this.apiStore ? this.apiStore.getAll().apis : [];
      let apiLines = '';
      if (allApis.length > 0) {
        apiLines = allApis.map(a => `${a.icon || '🌐'} *${a.name}*\n• Type: \`${a.inputType}\` | Param: \`${a.paramName}\``).join('\n\n');
      } else {
        apiLines = '📱 *Mobile Number Lookup*\n🚗 *Vehicle RC & RTO Lookup*\n✈️ *Telegram ID to Number*';
      }
      await this.sendMessage(
        chatId,
        `🗂️ *Configured APIs Hub (${allApis.length || 3} Available):*\n\n${apiLines}\n\n💡 _You can query phone numbers, vehicle numbers, and Telegram IDs simultaneously!_`
      );
      return;
    }

    if (text.startsWith('/help')) {
      const helpMsg = 
`📖 *APIChat Telegram Bot Help & Commands Guide*

🔍 *Query Commands:*
• *Phone Number Lookup:*
  Send any 10-digit number: \`9876543210\`
• *Vehicle RC Lookup:*
  Send vehicle number: \`DL01AB1234\` or \`/vehicle DL01AB1234\`
• *Telegram ID to Number:*
  Send \`/tg <id>\` or \`/telegram <id>\`: \`/tg 512345678\`

📊 *System & Info Commands:*
• \`/stats\` or \`/totalstats\` — Comprehensive total query statistics
• \`/status\` — Bot and gateway connection state
• \`/ping\` — Fast ping & latency check
• \`/apis\` — List all active APIs & parameters
• \`/myid\` or \`/profile\` — View your user profile and remaining quota

👑 *Owner Admin Commands:*
• \`/unlimited <userId>\` — Grant permanent unlimited queries
• \`/auth <userId> [limit]\` — Authorize user with quota (or 'unlimited')
• \`/setlimit <userId> <limit>\` — Update quota (or 'unlimited')
• \`/users\` — List all authorized users and pending requests
• \`/deauth <userId>\` — Revoke user access
• \`/lock\` — Lock API config from changes
• \`/unlock\` — Unlock API config`;

      await this.sendMessage(chatId, helpMsg);
      return;
    }

    if (text === '/ping') {
      const startPing = Date.now();
      await this.sendMessage(chatId, `🏓 *Pong!*\n• Gateway Status: 🟢 Online & Responsive\n• Ping Roundtrip: ~${Math.max(1, Date.now() - startPing)}ms\n• Multi-API Hub: Ready`);
      return;
    }

    if (text.startsWith('/stats') || text.startsWith('/totalstats') || text.startsWith('/analytics') || text.startsWith('/metrics')) {
      const authState = this.authManager.getState();
      const uptimeSec = this.stats.startedAt 
        ? Math.floor((Date.now() - new Date(this.stats.startedAt).getTime()) / 1000)
        : Math.floor(process.uptime());
      
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const secs = uptimeSec % 60;
      const uptimeStr = `${days > 0 ? days + 'd ' : ''}${hours}h ${mins}m ${secs}s`;

      const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const allApis = this.apiStore ? this.apiStore.getAll().apis : [];
      const activeApi = this.apiStore ? this.apiStore.getActiveApi() : null;

      const usersList = authState.users || [];
      const unlimitedCount = usersList.filter(u => u.limit === -1).length;
      const totalUsedQueries = usersList.reduce((acc, u) => acc + (u.used || 0), 0);

      const statsMsg = 
`📊 *APIChat Hub — Total System Statistics*

⚡ *Query Execution Metrics:*
• *Total Telegram Queries:* \`${this.stats.telegramQueriesCount}\`
• 📱 *Phone Number Lookups:* \`${this.stats.phoneQueries || 0}\`
• 🚗 *Vehicle RC Lookups:* \`${this.stats.vehicleQueries || 0}\`
• ✈️ *Telegram ID Lookups:* \`${this.stats.tgIdQueries || 0}\`
• 🟢 *Successful Queries:* \`${this.stats.successfulQueries || 0}\`
• 🔴 *Failed / Blocked:* \`${this.stats.failedQueries || 0}\`
• ⏱️ *Last Query:* ${this.stats.lastQueryAt ? new Date(this.stats.lastQueryAt).toLocaleTimeString() : 'None recorded'}

👥 *User & Quota Analytics:*
• *Total Authorized Users:* \`${authState.totalAuthorized}\`
• ♾️ *Unlimited Quota Users:* \`${unlimitedCount}\`
• 🔋 *Total Queries Consumed:* \`${totalUsedQueries}\`
• ⏳ *Pending Access Requests:* \`${authState.totalPending}\`
• 👑 *Bot Owner:* \`${this.authManager.ownerId || 'Not Set'}\`

🗂️ *Gateway & API Hub:*
• *Active Target API:* ${activeApi ? activeApi.name : 'Default Proxy'}
• *Configured Endpoints:* \`${allApis.length}\`
• *Gateway Configuration:* ${this.isLocked ? '🔒 Locked (Protected)' : '🔓 Unlocked'}
• *Database Resilience:* Multi-Tier Active (Survives Git Redeploys)

🖥️ *Server Telemetry:*
• *Server Health:* 🟢 Online & Healthy
• *Bot Uptime:* \`${uptimeStr}\`
• *RAM Usage:* \`${memMb} MB\`
• *Node Runtime:* \`${process.version}\` (${process.platform})`;

      await this.sendMessage(chatId, statsMsg);
      return;
    }

    if (text.startsWith('/status')) {
      const activeApi = this.apiStore ? this.apiStore.getActiveApi() : null;
      const statusMsg = 
`📊 *APIChat Bot Status:*
• Status: 🟢 Online & Listening
• Username: @${this.botInfo.username}
• Target API: ${activeApi ? activeApi.name : 'Default Proxy'}
• Total Queries: \`${this.stats.telegramQueriesCount}\`
• Lock State: ${this.isLocked ? '🔒 Locked' : '🔓 Unlocked'}

💡 _Send \`/stats\` or \`/totalstats\` for complete traffic analytics and server metrics!_`;

      await this.sendMessage(chatId, statusMsg);
      return;
    }

    if (text.startsWith('/preset')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can switch presets.`);
        return;
      }

      if (this.isLocked) {
        await this.sendMessage(
          chatId,
          `🔒 *API Configuration is Locked*\nThe administrator has locked this bot. Preset modifications are disabled.`
        );
        return;
      }

      const parts = text.split(/\s+/);
      const presetKey = (parts[1] || '').toLowerCase();

      if (presetKey === 'telecom') {
        this.activeApiUrl = '/api/mock/telecom-lookup';
        this.activeParamName = 'number';
        await this.sendMessage(chatId, `✅ Switched to *Telecom & Carrier Lookup Demo*.\nSend any 10-digit number to test!`);
      } else if (presetKey === 'student') {
        this.activeApiUrl = '/api/mock/student-registry';
        this.activeParamName = 'number';
        await this.sendMessage(chatId, `✅ Switched to *University Student Registry Demo*.\nSend any 10-digit enrollment number to test!`);
      } else if (presetKey === 'sms') {
        this.activeApiUrl = '/api/mock/sms-gateway';
        this.activeParamName = 'number';
        await this.sendMessage(chatId, `✅ Switched to *SMS & OTP Gateway Simulator*.\nSend any 10-digit mobile number to test!`);
      } else {
        await this.sendMessage(chatId, `⚠️ Unknown preset. Available: \`/preset telecom\`, \`/preset student\`, \`/preset sms\``);
      }
      return;
    }

    if (text.startsWith('/api')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can configure the target API.`);
        return;
      }

      if (this.isLocked) {
        await this.sendMessage(
          chatId,
          `🔒 *API Configuration is Locked*\nThe administrator has locked this bot. Custom endpoint changes are disabled.`
        );
        return;
      }

      const newUrl = text.replace('/api', '').trim();
      if (!newUrl) {
        await this.sendMessage(chatId, `⚠️ Please provide a URL. Example:\n\`/api https://api.example.com/v1/lookup\``);
        return;
      }
      this.activeApiUrl = newUrl;
      await this.sendMessage(chatId, `✅ Target API URL updated successfully.\nNow send any 10-digit number to query!`);
      return;
    }

    if (text.startsWith('/myid') || text.startsWith('/profile') || text.startsWith('/me')) {
      const isOwner = this.authManager.isOwner(chatId);
      const user = this.authManager.users[String(chatId)];
      const roleText = isOwner 
        ? '👑 Owner (Full Admin & ♾️ Unlimited Access)' 
        : (user ? (user.limit === -1 ? '✅ Authorized User (♾️ Unlimited Queries)' : `✅ Authorized User (${Math.max(0, user.limit - (user.used || 0))} of ${user.limit} queries remaining)`) : '⛔ Unauthorized (Pending Approval)');

      await this.sendMessage(
        chatId,
        `🆔 *Your Telegram User Profile*\n• *Chat / User ID:* \`${chatId}\`\n• *Username:* @${fromUser}\n• *Access Status:* ${roleText}\n• *Service Role:* ${isOwner ? '👑 Administrator' : 'Client User'}`
      );
      return;
    }

    if (text.startsWith('/claimowner')) {
      if (this.authManager.ownerId) {
        await this.sendMessage(chatId, `⚠️ Bot already has a designated Owner.`);
        return;
      }
      this.authManager.setOwner(chatId, fromUser);
      this.broadcastEvent('telegram_auth_updated', this.authManager.getState());
      await this.sendMessage(
        chatId,
        `👑 *Congratulations!*\nYou have claimed ownership of @${this.botInfo.username}.\n\n🛠️ *Admin Commands:*\n• \`/unlimited <userId>\` - Grant Unlimited Queries\n• \`/auth <userId> [limit]\` - Authorize user\n• \`/deauth <userId>\` - Revoke access\n• \`/setlimit <userId> <limit>\` - Update quota\n• \`/users\` - List users & quotas\n• \`/stats\` - System traffic statistics\n• \`/lock\` & \`/unlock\` - Protect configuration`
      );
      return;
    }

    if (text.startsWith('/unlimited') || text.startsWith('/unlimit')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can grant unlimited query access.`);
        return;
      }
      const parts = text.split(/\s+/);
      const targetId = (parts[1] || '').trim();
      if (!targetId || isNaN(parseInt(targetId, 10))) {
        await this.sendMessage(chatId, `⚠️ *Usage:* \`/unlimited <userId>\`\nExample: \`/unlimited 123456789\``);
        return;
      }

      const userRecord = this.authManager.authorizeUser(targetId, '', -1);
      this.broadcastEvent('telegram_auth_updated', this.authManager.getState());

      await this.sendMessage(
        chatId,
        `♾️ *Unlimited Quota Granted!*\n\n• *User ID:* \`${targetId}\`\n• *Quota:* ♾️ Unlimited Queries\n• *Status:* 🟢 Unrestricted Access`
      );

      // Notify the target user
      await this.sendMessage(
        targetId,
        `🎉 *Unlimited Access Activated!*\n\nThe Bot Owner has upgraded your account to *♾️ Unlimited Queries*!\nYou can now query Phone Numbers, Vehicle RC, and Telegram IDs without any limits.`
      );
      return;
    }

    if (text.startsWith('/auth')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can authorize users.`);
        return;
      }
      const parts = text.split(/\s+/);
      const targetId = (parts[1] || '').trim();
      const rawLimit = (parts[2] || '').toLowerCase().trim();

      if (!targetId || isNaN(parseInt(targetId, 10))) {
        await this.sendMessage(chatId, `⚠️ *Usage:* \`/auth <userId> [limit]\`\nExamples:\n• \`/auth 123456789 15\` (15 queries)\n• \`/auth 123456789 unlimited\` (or \`-1\` for Unlimited)`);
        return;
      }

      let limit = 10;
      if (rawLimit === 'unlimited' || rawLimit === '-1' || rawLimit === 'inf' || rawLimit === 'all') {
        limit = -1;
      } else if (rawLimit !== '') {
        const parsed = parseInt(rawLimit, 10);
        limit = isNaN(parsed) ? 10 : parsed;
      }

      const userRecord = this.authManager.authorizeUser(targetId, '', limit);
      this.broadcastEvent('telegram_auth_updated', this.authManager.getState());
      const quotaDesc = userRecord.limit === -1 ? '♾️ Unlimited' : `${userRecord.limit} queries`;

      await this.sendMessage(chatId, `✅ *User Authorized*\n• *User ID:* \`${targetId}\`\n• *Quota:* ${quotaDesc}`);
      // Notify the target user
      await this.sendMessage(targetId, `🎉 *Access Granted!*\nYou have been authorized by the Bot Owner to use APIChat Hub.\n🔋 *Your Quota:* ${quotaDesc}.\nSend any 10-digit number or command to begin!`);
      return;
    }

    if (text.startsWith('/deauth') || text.startsWith('/revoke')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can revoke access.`);
        return;
      }
      const targetId = (text.split(/\s+/)[1] || '').trim();
      if (!targetId) {
        await this.sendMessage(chatId, `⚠️ *Usage:* \`/deauth <userId>\``);
        return;
      }
      const ok = this.authManager.revokeUser(targetId);
      if (ok) {
        this.broadcastEvent('telegram_auth_updated', this.authManager.getState());
        await this.sendMessage(chatId, `🚫 User \`${targetId}\` authorization revoked.`);
        await this.sendMessage(targetId, `⚠️ Your access to APIChat Hub has been revoked by the Bot Owner.`);
      } else {
        await this.sendMessage(chatId, `⚠️ User \`${targetId}\` not found or cannot revoke Owner.`);
      }
      return;
    }

    if (text.startsWith('/setlimit')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can set limits.`);
        return;
      }
      const parts = text.split(/\s+/);
      const targetId = (parts[1] || '').trim();
      const rawLimit = (parts[2] || '').toLowerCase().trim();
      if (!targetId || rawLimit === '') {
        await this.sendMessage(chatId, `⚠️ *Usage:* \`/setlimit <userId> <newLimit>\`\nExamples:\n• \`/setlimit 123456789 25\`\n• \`/setlimit 123456789 unlimited\` (or \`-1\`)`);
        return;
      }

      let newLimit = 10;
      if (rawLimit === 'unlimited' || rawLimit === '-1' || rawLimit === 'inf' || rawLimit === 'all') {
        newLimit = -1;
      } else {
        const parsed = parseInt(rawLimit, 10);
        newLimit = isNaN(parsed) ? 10 : parsed;
      }

      const updated = this.authManager.setLimit(targetId, newLimit);
      if (updated) {
        this.broadcastEvent('telegram_auth_updated', this.authManager.getState());
        const rem = updated.limit === -1 ? '♾️ Unlimited' : Math.max(0, updated.limit - (updated.used || 0));
        const limitDesc = updated.limit === -1 ? '♾️ Unlimited' : updated.limit;
        await this.sendMessage(chatId, `✅ Quota updated for \`${targetId}\`: Limit = ${limitDesc}, Remaining = ${rem}.`);
        await this.sendMessage(targetId, `🔋 *Quota Updated!*\nYour query quota has been updated by the Bot Owner.\n• *Limit:* ${limitDesc}\n• *Remaining:* ${rem}`);
      } else {
        await this.sendMessage(chatId, `⚠️ User \`${targetId}\` is not in authorized list.`);
      }
      return;
    }

    if (text.startsWith('/lock')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can lock configuration.`);
        return;
      }
      this.setLock(true);
      await this.sendMessage(chatId, `🔒 *API Configuration Locked*\nPresets and endpoints cannot be modified via Telegram commands.`);
      return;
    }

    if (text.startsWith('/unlock')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can unlock configuration.`);
        return;
      }
      this.setLock(false);
      await this.sendMessage(chatId, `🔓 *API Configuration Unlocked*\nPresets and endpoints can now be configured.`);
      return;
    }

    if (text.startsWith('/users')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can view user list.`);
        return;
      }
      const authState = this.authManager.getState();
      const userLines = authState.users.map(u => {
        const rem = u.limit === -1 ? '♾️ Unlimited' : `${Math.max(0, u.limit - (u.used || 0))}/${u.limit}`;
        return `• \`${u.id}\` (@${u.username}): ${u.role === 'owner' ? '👑 Owner' : `🔋 ${rem}`}`;
      }).join('\n') || 'None';

      const pendingLines = authState.pendingRequests.map(p => `• \`${p.id}\` (@${p.username}) - requested`).join('\n') || 'None';

      await this.sendMessage(chatId, `👥 *Telegram Bot Users (${authState.totalAuthorized})*\n${userLines}\n\n⏳ *Pending Requests (${authState.totalPending})*\n${pendingLines}`);
      return;
    }

    // 1. Check if user explicitly called a Phone Lookup command:
    let isExplicitPhoneCmd = false;
    let explicitPhoneQuery = null;
    if (text.startsWith('/phone') || text.startsWith('/num') || text.startsWith('/mobile') || text.startsWith('/number')) {
      isExplicitPhoneCmd = true;
      const parts = text.split(/\s+/);
      explicitPhoneQuery = (parts[1] || '').trim();
    }

    // 2. Check if user explicitly called a Telegram ID Lookup command:
    let isExplicitTgCmd = false;
    let explicitTgId = null;
    if (text.startsWith('/tg') || text.startsWith('/telegram') || text.startsWith('/tgid') || text.startsWith('/id')) {
      const parts = text.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      if (cmd === '/tg' || cmd === '/telegram' || cmd === '/tgid' || cmd === '/id') {
        isExplicitTgCmd = true;
        explicitTgId = (parts[1] || '').trim().replace(/\D/g, '');
        if (!explicitTgId) {
          await this.sendMessage(chatId, `⚠️ *Usage:* \`/tg <Telegram_User_ID>\`\nExample: \`/tg 512345678\``);
          return;
        }
      }
    }

    // 3. Check if user explicitly called a Vehicle command:
    let vehicleNum = null;
    if (text.startsWith('/vehicle') || text.startsWith('/rc')) {
      vehicleNum = text.replace(/^\/(vehicle|rc)\s*/i, '').trim().toUpperCase().replace(/[\s-]/g, '');
    }

    // Extract numeric digits (handle international/domestic prefixes like +91 or leading 0)
    let cleanNumber = (explicitPhoneQuery || text).replace(/\D/g, '');
    if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
      cleanNumber = cleanNumber.slice(2);
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.slice(1);
    }

    // Check Vehicle RC pattern if not 10 digits and not explicit commands
    if (!vehicleNum && cleanNumber.length !== 10 && !isExplicitTgCmd && !isExplicitPhoneCmd) {
      const stripped = text.trim().toUpperCase().replace(/[\s-]/g, '');
      if (/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/i.test(stripped)) {
        vehicleNum = stripped;
      }
    }

    // ==========================================
    // ROUTE 1: VEHICLE RC & RTO LOOKUP
    // ==========================================
    if (vehicleNum) {
      await this.sendMessage(chatId, `⏳ *Querying Vehicle RTO Registry for \`${vehicleNum}\`...*`);
      const startTime = Date.now();
      try {
        const vehicleApi = this.getVehicleApi();
        const result = await this.queryExecutor({
          url: vehicleApi.url,
          paramName: vehicleApi.paramName,
          query: vehicleNum,
          method: vehicleApi.method,
          headers: vehicleApi.headers
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;
        this.stats.vehicleQueries = (this.stats.vehicleQueries || 0) + 1;
        this.stats.lastQueryAt = new Date().toISOString();
        if (result.ok) {
          this.stats.successfulQueries = (this.stats.successfulQueries || 0) + 1;
        } else {
          this.stats.failedQueries = (this.stats.failedQueries || 0) + 1;
        }
        const quota = this.authManager.consumeQuota(chatId);

        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: vehicleNum,
          type: 'vehicle',
          targetUrl: result.targetUrl || vehicleApi.url,
          result
        });

        const formattedMsg = this.formatTelegramResponse(vehicleNum, result, latencyMs, quota, auth.isOwner);
        await this.sendMessage(chatId, formattedMsg);
      } catch (err) {
        const safeError = (err.message || 'Service unavailable').replace(/https?:\/\/[^\s]+/gi, '[Secure Gateway]');
        await this.sendMessage(chatId, `❌ *Vehicle Query Failed*\nError: ${safeError}\nPlease verify the RC number.`);
      }
      return;
    }

    // ==========================================
    // ROUTE 2: EXPLICIT TELEGRAM ID LOOKUP (/tg, /telegram, /tgid, /id)
    // ==========================================
    if (isExplicitTgCmd && explicitTgId) {
      const ownerId = this.authManager.ownerId || process.env.TELEGRAM_OWNER_ID || '2051992452';
      
      // 🔒 Security Encryption Shield: Protect Owner's Telegram ID from reverse lookup!
      if (String(explicitTgId).trim() === String(ownerId).trim()) {
        await this.sendMessage(
          chatId,
          `🔒 *SECURITY ENCRYPTION SHIELD*\n\n⛔ *Access Denied:* The requested Telegram ID (\`${explicitTgId}\`) belongs to the Bot Administrator / Owner and is protected under administrative encryption protocols.\n\nQuery cannot be fulfilled.`
        );
        return;
      }

      await this.sendMessage(chatId, `⏳ *Querying Telegram ID Registry for \`${explicitTgId}\`...*`);
      const startTime = Date.now();
      try {
        const tgApi = this.getTgIdApi();
        const result = await this.queryExecutor({
          url: tgApi.url,
          paramName: tgApi.paramName,
          query: explicitTgId,
          method: tgApi.method,
          headers: tgApi.headers
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;
        this.stats.tgIdQueries = (this.stats.tgIdQueries || 0) + 1;
        this.stats.lastQueryAt = new Date().toISOString();
        if (result.ok) {
          this.stats.successfulQueries = (this.stats.successfulQueries || 0) + 1;
        } else {
          this.stats.failedQueries = (this.stats.failedQueries || 0) + 1;
        }
        const quota = this.authManager.consumeQuota(chatId);

        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: explicitTgId,
          type: 'tgid',
          targetUrl: result.targetUrl || tgApi.url,
          result
        });

        const formattedMsg = this.formatTelegramResponse(explicitTgId, result, latencyMs, quota, auth.isOwner);
        await this.sendMessage(chatId, formattedMsg);
      } catch (err) {
        const safeError = (err.message || 'Service unavailable').replace(/https?:\/\/[^\s]+/gi, '[Secure Gateway]');
        await this.sendMessage(chatId, `❌ *Telegram ID Query Failed*\nError: ${safeError}\nPlease verify the User ID.`);
      }
      return;
    }

    // ==========================================
    // ROUTE 3: MOBILE NUMBER LOOKUP (10-Digit Numbers or /phone, /mobile, /num)
    // ALWAYS queries Mobile Number Info. Never hijacked by Telegram ID lookup!
    // ==========================================
    if (cleanNumber.length === 10 || isExplicitPhoneCmd) {
      if (cleanNumber.length !== 10) {
        await this.sendMessage(chatId, `⚠️ *Invalid Phone Number:* Please enter a valid 10-digit mobile number.\nExample: \`9876543210\``);
        return;
      }

      await this.sendMessage(chatId, `⏳ *Querying secure gateway for \`${cleanNumber}\`...*`);
      const startTime = Date.now();
      try {
        const phoneApi = this.getPhoneApi();
        const result = await this.queryExecutor({
          url: phoneApi.url,
          paramName: phoneApi.paramName,
          number: cleanNumber,
          query: cleanNumber,
          method: phoneApi.method,
          headers: phoneApi.headers
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;
        this.stats.phoneQueries = (this.stats.phoneQueries || 0) + 1;
        this.stats.lastQueryAt = new Date().toISOString();
        if (result.ok) {
          this.stats.successfulQueries = (this.stats.successfulQueries || 0) + 1;
        } else {
          this.stats.failedQueries = (this.stats.failedQueries || 0) + 1;
        }

        const quota = this.authManager.consumeQuota(chatId);

        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: cleanNumber,
          type: 'phone',
          targetUrl: result.targetUrl || phoneApi.url,
          result
        });

        const formattedMsg = this.formatTelegramResponse(cleanNumber, result, latencyMs, quota, auth.isOwner);
        await this.sendMessage(chatId, formattedMsg);
      } catch (err) {
        const safeError = (err.message || 'Service unavailable').replace(/https?:\/\/[^\s]+/gi, '[Secure Gateway]');
        await this.sendMessage(chatId, `❌ *Phone Query Failed*\nError: ${safeError}\nPlease verify the number and try again.`);
      }
      return;
    }

    // ==========================================
    // ROUTE 4: NON-10-DIGIT NUMERICAL FALLBACK
    // If user sent a numerical string that is NOT 10 digits (e.g. 5 to 9 digits, or 11 to 15 digits)
    // AND the active API on the site is Telegram ID to Number:
    // ==========================================
    const activeApi = this.apiStore ? this.apiStore.getActiveApi() : null;
    if (activeApi && (activeApi.inputType === 'tgid' || activeApi.id === 'tg_id_lookup') && cleanNumber.length >= 5 && cleanNumber.length <= 15) {
      const ownerId = this.authManager.ownerId || process.env.TELEGRAM_OWNER_ID || '2051992452';
      if (String(cleanNumber).trim() === String(ownerId).trim()) {
        await this.sendMessage(
          chatId,
          `🔒 *SECURITY ENCRYPTION SHIELD*\n\n⛔ *Access Denied:* The requested Telegram ID (\`${cleanNumber}\`) belongs to the Bot Administrator / Owner and is protected under administrative encryption protocols.\n\nQuery cannot be fulfilled.`
        );
        return;
      }

      await this.sendMessage(chatId, `⏳ *Querying Telegram ID Registry for \`${cleanNumber}\`...*`);
      const startTime = Date.now();
      try {
        const tgApi = this.getTgIdApi();
        const result = await this.queryExecutor({
          url: tgApi.url,
          paramName: tgApi.paramName,
          query: cleanNumber,
          method: tgApi.method,
          headers: tgApi.headers
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;
        this.stats.tgIdQueries = (this.stats.tgIdQueries || 0) + 1;
        this.stats.lastQueryAt = new Date().toISOString();
        if (result.ok) {
          this.stats.successfulQueries = (this.stats.successfulQueries || 0) + 1;
        } else {
          this.stats.failedQueries = (this.stats.failedQueries || 0) + 1;
        }
        const quota = this.authManager.consumeQuota(chatId);

        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: cleanNumber,
          type: 'tgid',
          targetUrl: result.targetUrl || tgApi.url,
          result
        });

        const formattedMsg = this.formatTelegramResponse(cleanNumber, result, latencyMs, quota, auth.isOwner);
        await this.sendMessage(chatId, formattedMsg);
      } catch (err) {
        const safeError = (err.message || 'Service unavailable').replace(/https?:\/\/[^\s]+/gi, '[Secure Gateway]');
        await this.sendMessage(chatId, `❌ *Telegram ID Query Failed*\nError: ${safeError}\nPlease verify the User ID.`);
      }
      return;
    }

    // ==========================================
    // UNRECOGNIZED INPUT FORMAT
    // ==========================================
    await this.sendMessage(
      chatId,
      `⚠️ *Unrecognized Input Format*\n\n• 📱 *Phone Lookup:* Send any *10-digit number* (e.g. \`9876543210\`)\n• 🚗 *Vehicle RC Lookup:* Send registration number (e.g. \`DL01AB1234\` or \`/vehicle DL01AB1234\`)\n• ✈️ *Telegram ID Lookup:* Send \`/tg <id>\` (e.g. \`/tg 512345678\`)\n• 🗂️ Type \`/apis\` to see all active APIs`
    );
    } catch (err) {
      console.error(`Error handling Telegram message from ${chatId}:`, err);
      try {
        await this.sendMessage(chatId, `⚠️ An internal error occurred: ${err.message}`);
      } catch {}
    }
  }

  // Format response for Telegram Markdown
  formatTelegramResponse(number, result, latencyMs, quota = null, isOwner = false) {
    const is10Digit = /^\d{10}$/.test(String(number).trim());
    const displayQuery = is10Digit ? `+91 ${number.slice(0, 5)} ${number.slice(5)}` : String(number).toUpperCase();
    const statusIcon = result.ok ? '🟢' : '🔴';
    const statusText = `${statusIcon} *HTTP ${result.status}* (${latencyMs}ms)`;

    const quotaInfo = isOwner 
      ? '👑 *Account:* Bot Owner (♾️ Unlimited Access)'
      : (quota && (quota.limit === -1 || quota.remaining === -1) 
          ? '🔋 *Quota:* ♾️ Unlimited Queries' 
          : (quota ? `🔋 *Remaining Quota:* ${quota.remaining} of ${quota.limit} requests` : ''));

    let highlights = '';
    const data = result.data;

    if (data && typeof data === 'object') {
      // Check for Vehicle / RC Record
      if (data.vehicle || (data.data && data.data.vehicleClass)) {
        const v = data.vehicle || data.data;
        highlights = 
`🚗 *Vehicle RC & RTO Details:*
• *RC Number:* ${v.rcNumber || number}
• *Owner Name:* ${v.ownerName || 'Verified Citizen'}
• *Vehicle Model:* ${v.makerModel || 'N/A'}
• *Vehicle Class:* ${v.vehicleClass || 'Motor Car (LMV)'}
• *Fuel Type:* ${v.fuelType || 'Petrol'}
• *RTO Office:* ${v.registeringAuthority || 'RTO Office'}
• *Reg Date:* ${v.registrationDate || 'N/A'}
• *Fitness Upto:* ${v.fitnessUpto || 'Valid'}
• *Insurance:* ${v.insuranceStatus || 'Active'}
• *PUCC Upto:* ${v.puccValidUpto || 'Valid'}
• *Status:* ${v.blacklistStatus || 'Clean Record'}`;
      }
      // Check for Array of records (e.g. OSINT / Contact info)
      else if (Array.isArray(data.data) && data.data.length > 0 && data.data[0].name) {
        const item = data.data[0];
        const cleanAddress = (item.address || 'N/A').replace(/!+/g, ', ');
        highlights = 
`📋 *Target Information Record:*
• *Name:* ${item.name}
• *Father:* ${item.fname || 'N/A'}
• *Mobile:* ${item.mobile || number}
• *Circle:* ${item.circle || 'N/A'}
• *Address:* ${cleanAddress}
• *Alt Contact:* ${item.alt || 'N/A'}`;
      }
      // Check for Telecom Mock
      else if (data.data && data.data.registeredName) {
        highlights = 
`📋 *Telecom Lookup Result:*
• *Owner:* ${data.data.registeredName}
• *Carrier:* ${data.data.carrier}
• *Circle:* ${data.data.networkCircle}
• *Type:* ${data.data.lineType}
• *Spam Score:* ${data.data.spamAssessment?.score || 'Clean'}
• *Status:* ${data.data.accountStatus}`;
      } 
      // Check for Telegram ID to Phone Record
      else if (data.profile && (data.profile.linkedPhone || data.profile.telegramId)) {
        const p = data.profile;
        highlights = 
`✈️ *Telegram User ID Lookup Record:*
• *Telegram ID:* \`${p.telegramId || number}\`
• *Username:* ${p.username ? '@' + p.username.replace('@', '') : 'N/A'}
• *Name:* ${p.name || 'Verified User'}
• *📱 Linked Phone:* *${p.linkedPhone || 'N/A'}*
• *Carrier:* ${p.carrier || 'N/A'}
• *Circle:* ${p.circle || 'N/A'}
• *Security Status:* 🟢 ${p.encryptionStatus || 'Standard Profile'}`;
      }
      // Check for Owner ID Encryption Shield
      else if (data.code === 'ADMIN_ID_PROTECTED' || result.isProtected) {
        highlights = 
`🔒 *SECURITY ENCRYPTION SHIELD*
⛔ Protected Administrative Entity. Resolution is prohibited.`;
      }
      // Check for Student Mock
      else if (data.profile && data.profile.fullName) {
        highlights = 
`🎓 *Student Profile Record:*
• *Student:* ${data.profile.fullName}
• *Roll No:* ${data.profile.enrollmentNumber}
• *Department:* ${data.profile.department}
• *CGPA:* ${data.profile.cgpa}
• *Attendance:* ${data.profile.attendancePercentage}
• *Status:* ${data.profile.collegeProjectApproved ? 'Approved ✅' : 'Pending'}`;
      }
      // Check for SMS Mock
      else if (data.details && data.details.deliveryStatus) {
        highlights = 
`💬 *SMS Delivery Report:*
• *Status:* ${data.details.deliveryStatus}
• *Generated OTP:* \`${data.details.generatedOtp}\`
• *Recipient:* ${displayQuery}
• *Gateway:* ${data.details.gatewayNode}`;
      }
    }

    let jsonString = '';
    try {
      jsonString = JSON.stringify(result.data, null, 2);
      if (jsonString.length > 1500) {
        jsonString = jsonString.slice(0, 1500) + '\n... (truncated)';
      }
    } catch {
      jsonString = String(result.data);
    }

    return (
`🔍 *APIChat Query Output*
📌 *Target:* \`${displayQuery}\`
⚡ *Status:* ${statusText}
🔒 *Gateway:* Protected Cloud Proxy
${quotaInfo ? quotaInfo + '\n' : ''}
${highlights ? highlights + '\n\n' : ''}📦 *Raw JSON Payload:*
\`\`\`
${jsonString}
\`\`\``
    );
  }

  // Send message via Telegram API
  async sendMessage(chatId, text, replyMarkup = null) {
    if (!this.token) return;
    try {
      const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        console.warn(`Telegram sendMessage Markdown error: ${data.description}. Retrying as plain text...`);
        // Fallback: send as plain text without parse_mode if Markdown parsing failed
        const plainPayload = {
          chat_id: chatId,
          text: text.replace(/[*`]/g, ''),
          disable_web_page_preview: true
        };
        if (replyMarkup) {
          plainPayload.reply_markup = replyMarkup;
        }
        await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plainPayload)
        });
      }
    } catch (err) {
      console.error(`Failed to send Telegram message to ${chatId}:`, err.message);
    }
  }

  // Send custom notification from Web UI to all Telegram subscribers
  async broadcastNotification(text) {
    if (!this.token || this.subscribers.size === 0) return 0;
    let count = 0;
    for (const chatId of this.subscribers) {
      try {
        await this.sendMessage(chatId, text);
        count++;
      } catch {}
    }
    return count;
  }
}

module.exports = TelegramBotService;
