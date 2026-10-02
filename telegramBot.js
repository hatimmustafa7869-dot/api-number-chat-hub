/**
 * Telegram Bot Service for APIChat Hub
 * Connects Telegram Bot to the API Query Engine via long-polling (getUpdates)
 * Zero external dependencies: Uses Node.js native fetch and AbortController.
 */

const authManager = require('./telegramAuth');

class TelegramBotService {
  constructor(queryExecutor) {
    this.queryExecutor = queryExecutor; // Function to execute the 10-digit API query
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
    this.subscribers.add(chatId);

    // 1. Handle Commands
    if (text.startsWith('/start')) {
      const welcome = 
`👋 *Welcome to APIChat Hub Bot!*
_College Project: 10-Digit API Query & Response System_

📱 *How to use:*
Just send any *10-digit number* (e.g. \`9876543210\`), and I will query the active API and send you the result formatted right here!

⚙️ *Current Target API:*
\`${this.activeApiUrl}\`

🛠️ *Available Commands:*
• Send \`9876543210\` -> Instant API query
• \`/preset telecom\` -> Switch to Telecom Lookup
• \`/preset student\` -> Switch to Student KYC Registry
• \`/preset sms\` -> Switch to SMS Gateway Simulator
• \`/api <url>\` -> Set custom API URL
• \`/status\` -> Check bot and endpoint status
• \`/help\` -> Show this help menu`;

      await this.sendMessage(chatId, welcome);
      return;
    }

    if (text.startsWith('/help')) {
      const helpMsg = 
`📖 *APIChat Telegram Bot Help*

• Send any 10-digit number directly to query:
  Example: \`9876543210\`
• Change API Endpoint:
  \`/api https://api.example.com/search\`
• Load Built-in Presets:
  \`/preset telecom\` (Telecom details)
  \`/preset student\` (Academic profile)
  \`/preset sms\` (SMS/OTP Delivery)
• Check Status: \`/status\``;

      await this.sendMessage(chatId, helpMsg);
      return;
    }

    if (text.startsWith('/status')) {
      const statusMsg = 
`📊 *APIChat Bot Status:*
• Status: 🟢 Online & Listening
• Username: @${this.botInfo.username}
• Active API: \`${this.activeApiUrl}\`
• Query Param: \`${this.activeParamName}\`
• Total Telegram Queries: ${this.stats.telegramQueriesCount}`;

      await this.sendMessage(chatId, statusMsg);
      return;
    }

    if (text.startsWith('/preset')) {
      if (this.isLocked) {
        await this.sendMessage(
          chatId,
          `🔒 *API Configuration is Locked*\nThe administrator has locked this bot to:\n\`${this.activeApiUrl}\`\n\nPreset modifications are disabled while locked.`
        );
        return;
      }

      const parts = text.split(/\s+/);
      const presetKey = (parts[1] || '').toLowerCase();

      if (presetKey === 'telecom') {
        this.activeApiUrl = '/api/mock/telecom-lookup';
        this.activeParamName = 'number';
        await this.sendMessage(chatId, `✅ Active API switched to *Telecom & Carrier Lookup Demo*.\nSend any 10-digit number to test!`);
      } else if (presetKey === 'student') {
        this.activeApiUrl = '/api/mock/student-registry';
        this.activeParamName = 'number';
        await this.sendMessage(chatId, `✅ Active API switched to *University Student Registry Demo*.\nSend any 10-digit enrollment number to test!`);
      } else if (presetKey === 'sms') {
        this.activeApiUrl = '/api/mock/sms-gateway';
        this.activeParamName = 'number';
        await this.sendMessage(chatId, `✅ Active API switched to *SMS & OTP Gateway Simulator*.\nSend any 10-digit mobile number to test!`);
      } else {
        await this.sendMessage(chatId, `⚠️ Unknown preset. Available: \`/preset telecom\`, \`/preset student\`, \`/preset sms\``);
      }
      return;
    }

    if (text.startsWith('/api')) {
      if (this.isLocked) {
        await this.sendMessage(
          chatId,
          `🔒 *API Configuration is Locked*\nThe administrator has locked this bot to:\n\`${this.activeApiUrl}\`\n\nCustom endpoint changes are disabled while locked.`
        );
        return;
      }

      const newUrl = text.replace('/api', '').trim();
      if (!newUrl) {
        await this.sendMessage(chatId, `⚠️ Please provide a URL. Example:\n\`/api https://api.example.com/v1/lookup\``);
        return;
      }
      this.activeApiUrl = newUrl;
      await this.sendMessage(chatId, `✅ Target API URL updated to:\n\`${newUrl}\`\n\nNow send any 10-digit number to query!`);
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
        await this.sendMessage(chatId, `⚠️ Bot already has a designated Owner (ID: \`${this.authManager.ownerId}\`).`);
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

    // 2. Check if the message is a 10-digit number
    const cleanNumber = text.replace(/\D/g, '');

    if (cleanNumber.length === 10) {
      // 🔒 Authorization & Rate Limit Verification
      const auth = this.authManager.checkAccess(chatId, fromUser);

      if (!auth.allowed) {
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
            `⛔ *Access Restricted / Unauthorized*\n\nYou must be authorized by the Bot Owner to query this API.\n• *Your User ID:* \`${chatId}\`\n\nYour request has been logged. Please ask the Bot Owner to approve you with:\n\`/auth ${chatId} 10\``
          );
          return;
        } else if (auth.reason === 'QUOTA_EXHAUSTED') {
          await this.sendMessage(
            chatId,
            `⚠️ *Query Quota Exhausted*\n\nYou have used all *${auth.limit}* authorized queries.\n\nPlease contact the Bot Owner to replenish your quota using:\n\`/setlimit ${chatId} 20\``
          );
          return;
        }
      }

      await this.sendMessage(chatId, `⏳ *Querying API for \`${cleanNumber}\`...*\n_Endpoint: ${this.activeApiUrl}_`);

      // Execute query using our shared query engine
      const startTime = Date.now();
      try {
        const result = await this.queryExecutor({
          url: this.activeApiUrl,
          paramName: this.activeParamName,
          number: cleanNumber,
          method: 'GET'
        });

        const latencyMs = result.latencyMs || (Date.now() - startTime);
        this.stats.telegramQueriesCount++;

        // Decrement quota for non-owners
        const quota = this.authManager.consumeQuota(chatId);

        // Broadcast to web frontend live feed
        this.broadcastEvent('telegram_query', {
          user: fromUser,
          number: cleanNumber,
          targetUrl: result.targetUrl || this.activeApiUrl,
          result
        });

        // Format Telegram response
        const formattedMsg = this.formatTelegramResponse(cleanNumber, result, latencyMs, quota, auth.isOwner);
        await this.sendMessage(chatId, formattedMsg);

      } catch (err) {
        await this.sendMessage(chatId, `❌ *API Query Failed*\nError: ${err.message}\nCheck if the target API endpoint is online.`);
      }
      return;
    }

    // If text is not 10 digits and not a command
    await this.sendMessage(
      chatId,
      `⚠️ *Please enter a valid 10-digit number!*\n\nReceived: \`${text}\` (${cleanNumber.length} digits).\nExample: \`9876543210\``
    );
  }

  // Format response for Telegram Markdown
  formatTelegramResponse(number, result, latencyMs, quota = null, isOwner = false) {
    const formattedNum = `${number.slice(0, 5)} ${number.slice(5)}`;
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
      // Check for Array of records (e.g. OSINT / Contact info)
      if (Array.isArray(data.data) && data.data.length > 0 && data.data[0].name) {
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
• *Recipient:* +91 ${number}
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
📱 *Query:* \`+91 ${formattedNum}\`
⚡ *Status:* ${statusText}
🌐 *Endpoint:* \`${result.targetUrl || this.activeApiUrl}\`
${quotaInfo ? quotaInfo + '\n' : ''}
${highlights ? highlights + '\n\n' : ''}📦 *Raw JSON Payload:*
\`\`\`json
${jsonString}
\`\`\``
    );
  }

  // Send message via Telegram API
  async sendMessage(chatId, text) {
    if (!this.token) return;
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
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
