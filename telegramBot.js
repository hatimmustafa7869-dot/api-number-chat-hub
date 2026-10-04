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
      startedAt: null
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

⚙️ *Gateway Status:* 🟢 Multi-API Hub Online

🛠️ *Available Commands:*
• Send \`9876543210\` -> Phone Number Query
• Send \`DL01AB1234\` -> Vehicle RC Query
• \`/apis\` -> List all configured active APIs
• \`/myid\` -> Check your user profile & quota
• \`/status\` -> Check bot and service status
• \`/help\` -> Show help instructions`;

      await this.sendMessage(chatId, welcome);
      return;
    }

    if (text.startsWith('/apis')) {
      const allApis = this.apiStore ? this.apiStore.getAll().apis : [];
      let apiLines = '';
      if (allApis.length > 0) {
        apiLines = allApis.map(a => `${a.icon || '🌐'} *${a.name}*\n• Type: \`${a.inputType}\` | Param: \`${a.paramName}\``).join('\n\n');
      } else {
        apiLines = '📱 *Mobile Number Lookup*\n🚗 *Vehicle RC & RTO Lookup*';
      }
      await this.sendMessage(
        chatId,
        `🗂️ *Configured APIs Hub (${allApis.length || 2} Available):*\n\n${apiLines}\n\n💡 _You can query phone numbers and vehicle numbers simultaneously!_`
      );
      return;
    }

    if (text.startsWith('/help')) {
      const helpMsg = 
`📖 *APIChat Telegram Bot Help*

• *Phone Number Lookup:*
  Send any 10-digit number: \`9876543210\`
• *Vehicle RC Lookup:*
  Send vehicle number: \`DL01AB1234\` or \`/vehicle DL01AB1234\`
• *List All APIs:*
  \`/apis\`
• *Check Profile & Quota:*
  \`/myid\`
• *Check Bot Status:*
  \`/status\``;

      await this.sendMessage(chatId, helpMsg);
      return;
    }

    if (text.startsWith('/status')) {
      const statusMsg = 
`📊 *APIChat Bot Status:*
• Status: 🟢 Online & Listening
• Username: @${this.botInfo.username}
• Gateway: 🔒 Secure Cloud Proxy (Encrypted)
• Total Telegram Queries: ${this.stats.telegramQueriesCount}`;

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

    if (text.startsWith('/myid')) {
      const isOwner = this.authManager.isOwner(chatId);
      const user = this.authManager.users[String(chatId)];
      const roleText = isOwner 
        ? '👑 Owner (Full Admin & Unlimited Access)' 
        : (user ? `✅ Authorized User (${user.limit === -1 ? 'Unlimited' : Math.max(0, user.limit - (user.used || 0)) + ' queries remaining'})` : '⛔ Unauthorized (Pending Approval)');

      await this.sendMessage(
        chatId,
        `🆔 *Your Telegram User Profile*\n• *Chat / User ID:* \`${chatId}\`\n• *Username:* @${fromUser}\n• *Access Status:* ${roleText}`
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
        `👑 *Congratulations!*\nYou have claimed ownership of @${this.botInfo.username}.\n\n🛠️ *Admin Commands:*\n• \`/auth <userId> [limit]\` - Authorize user\n• \`/deauth <userId>\` - Revoke access\n• \`/setlimit <userId> <limit>\` - Update quota\n• \`/users\` - List users & quotas`
      );
      return;
    }

    if (text.startsWith('/auth')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can authorize users.`);
        return;
      }
      const parts = text.split(/\s+/);
      const targetId = parts[1];
      const limit = parts[2] !== undefined ? parseInt(parts[2], 10) : 10;
      if (!targetId || isNaN(parseInt(targetId, 10))) {
        await this.sendMessage(chatId, `⚠️ *Usage:* \`/auth <userId> [limit]\`\nExample: \`/auth 123456789 15\` or \`/auth 123456789 -1\` (unlimited)`);
        return;
      }
      const userRecord = this.authManager.authorizeUser(targetId, '', limit);
      this.broadcastEvent('telegram_auth_updated', this.authManager.getState());
      await this.sendMessage(chatId, `✅ *User Authorized*\n• *User ID:* \`${targetId}\`\n• *Quota:* ${userRecord.limit === -1 ? 'Unlimited' : userRecord.limit + ' queries'}`);
      // Notify the target user
      await this.sendMessage(targetId, `🎉 *Access Granted!*\nYou have been authorized by the Bot Owner to use APIChat Hub.\n🔋 *Your Quota:* ${userRecord.limit === -1 ? 'Unlimited' : userRecord.limit} queries.\nSend any 10-digit number to begin!`);
      return;
    }

    if (text.startsWith('/deauth') || text.startsWith('/revoke')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can revoke access.`);
        return;
      }
      const targetId = text.split(/\s+/)[1];
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
      const targetId = parts[1];
      const newLimit = parts[2];
      if (!targetId || newLimit === undefined) {
        await this.sendMessage(chatId, `⚠️ *Usage:* \`/setlimit <userId> <newLimit>\`\nExample: \`/setlimit 123456789 25\``);
        return;
      }
      const updated = this.authManager.setLimit(targetId, newLimit);
      if (updated) {
        this.broadcastEvent('telegram_auth_updated', this.authManager.getState());
        const rem = updated.limit === -1 ? 'Unlimited' : Math.max(0, updated.limit - (updated.used || 0));
        await this.sendMessage(chatId, `✅ Quota updated for \`${targetId}\`: Limit = ${updated.limit}, Remaining = ${rem}.`);
        await this.sendMessage(targetId, `🔋 *Quota Updated!*\nYour query quota has been updated by the Bot Owner.\n• *Limit:* ${updated.limit}\n• *Remaining:* ${rem}`);
      } else {
        await this.sendMessage(chatId, `⚠️ User \`${targetId}\` is not in authorized list.`);
      }
      return;
    }

    if (text.startsWith('/users')) {
      if (!this.authManager.isOwner(chatId)) {
        await this.sendMessage(chatId, `⛔ *Permission Denied*\nOnly the Bot Owner can view user list.`);
        return;
      }
      const authState = this.authManager.getState();
      const userLines = authState.users.map(u => {
        const rem = u.limit === -1 ? '∞' : `${Math.max(0, u.limit - (u.used || 0))}/${u.limit}`;
        return `• \`${u.id}\` (@${u.username}): ${u.role === 'owner' ? '👑 Owner' : `🔋 ${rem}`}`;
      }).join('\n') || 'None';

      const pendingLines = authState.pendingRequests.map(p => `• \`${p.id}\` (@${p.username}) - requested`).join('\n') || 'None';

      await this.sendMessage(chatId, `👥 *Telegram Bot Users (${authState.totalAuthorized})*\n${userLines}\n\n⏳ *Pending Requests (${authState.totalPending})*\n${pendingLines}`);
      return;
    }

    // 2. Check if message is a Vehicle Lookup
    let vehicleNum = null;
    if (text.startsWith('/vehicle') || text.startsWith('/rc')) {
      vehicleNum = text.replace(/^\/(vehicle|rc)\s*/i, '').trim().toUpperCase().replace(/[\s-]/g, '');
    } else if (!cleanNumber || cleanNumber.length !== 10) {
      const stripped = text.trim().toUpperCase().replace(/[\s-]/g, '');
      if (/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/i.test(stripped)) {
        vehicleNum = stripped;
      }
    }

    if (vehicleNum) {
      await this.sendMessage(chatId, `⏳ *Querying Vehicle RTO Registry for \`${vehicleNum}\`...*`);
      const startTime = Date.now();
      try {
        const vehicleApi = this.apiStore ? this.apiStore.getById('vehicle_lookup') : null;
        const targetUrl = vehicleApi ? vehicleApi.url : '/api/mock/vehicle-lookup';
        const paramName = vehicleApi ? vehicleApi.paramName : 'rc';
        let headers = {};
        if (vehicleApi?.authHeader) {
          headers['Authorization'] = vehicleApi.authHeader;
        }
        if (vehicleApi?.customHeaders) {
          try {
            const parsed = typeof vehicleApi.customHeaders === 'object' ? vehicleApi.customHeaders : JSON.parse(vehicleApi.customHeaders);
            headers = { ...headers, ...parsed };
          } catch {}
        }

        const result = await this.queryExecutor({
          url: targetUrl,
          paramName,
          query: vehicleNum,
          method: vehicleApi?.method || 'GET',
          headers
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;
        const quota = this.authManager.consumeQuota(chatId);

        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: vehicleNum,
          type: 'vehicle',
          targetUrl: result.targetUrl || targetUrl,
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

    // 3. Check if the message is a 10-digit number
    if (cleanNumber.length === 10) {
      await this.sendMessage(chatId, `⏳ *Querying secure gateway for \`${cleanNumber}\`...*`);

      // Execute query using our shared query engine
      const startTime = Date.now();
      try {
        const phoneApi = this.apiStore ? (this.apiStore.getById('phone_lookup') || this.apiStore.getActiveApi()) : null;
        const targetUrl = phoneApi ? phoneApi.url : this.activeApiUrl;
        const paramName = phoneApi ? phoneApi.paramName : this.activeParamName;
        let headers = {};
        if (phoneApi?.authHeader) {
          headers['Authorization'] = phoneApi.authHeader;
        }
        if (phoneApi?.customHeaders) {
          try {
            const parsed = typeof phoneApi.customHeaders === 'object' ? phoneApi.customHeaders : JSON.parse(phoneApi.customHeaders);
            headers = { ...headers, ...parsed };
          } catch {}
        }

        const result = await this.queryExecutor({
          url: targetUrl,
          paramName,
          number: cleanNumber,
          query: cleanNumber,
          method: phoneApi?.method || 'GET',
          headers
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;

        // Decrement quota for non-owners
        const quota = this.authManager.consumeQuota(chatId);

        // Broadcast to web frontend live feed
        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: cleanNumber,
          type: 'phone',
          targetUrl: result.targetUrl || targetUrl,
          result
        });

        // Format Telegram response
        const formattedMsg = this.formatTelegramResponse(cleanNumber, result, latencyMs, quota, auth.isOwner);
        await this.sendMessage(chatId, formattedMsg);

      } catch (err) {
        const safeError = (err.message || 'Service unavailable').replace(/https?:\/\/[^\s]+/gi, '[Secure Gateway]');
        await this.sendMessage(chatId, `❌ *Query Failed*\nError: ${safeError}\nPlease verify the number and try again.`);
      }
      return;
    }

    // If text is not 10 digits and not a vehicle and not a command
    await this.sendMessage(
      chatId,
      `⚠️ *Unrecognized Input Format*\n\n• For *Phone Lookup*, send any *10-digit number* (e.g. \`9876543210\`)\n• For *Vehicle RC Lookup*, send registration number (e.g. \`DL01AB1234\` or \`/vehicle DL01AB1234\`)\n• Type \`/apis\` to see all active APIs`
    );
  }

  // Format response for Telegram Markdown
  formatTelegramResponse(number, result, latencyMs, quota = null, isOwner = false) {
    const is10Digit = /^\d{10}$/.test(String(number).trim());
    const displayQuery = is10Digit ? `+91 ${number.slice(0, 5)} ${number.slice(5)}` : String(number).toUpperCase();
    const statusIcon = result.ok ? '🟢' : '🔴';
    const statusText = `${statusIcon} *HTTP ${result.status}* (${latencyMs}ms)`;

    const quotaInfo = isOwner 
      ? '👑 *Account:* Bot Owner (Unlimited)'
      : (quota && quota.limit === -1 
          ? '🔋 *Quota:* Unlimited Queries' 
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
\`\`\`json
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
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
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
