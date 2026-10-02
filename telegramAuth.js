/**
 * Telegram Bot Authorization & Rate Limit Manager
 * Provides persistent Role-Based Access Control (RBAC) and query quotas
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'telegram_users.json');

class TelegramAuthManager {
  constructor() {
    this.ownerId = '2051992452'; // Hardcoded designated Bot Owner
    this.defaultLimit = 10;
    this.users = {}; // id -> { id, username, role, limit, used, authorizedAt }
    this.pendingRequests = {}; // id -> { id, username, requestedAt }
    this.load();
  }

  // Load from disk or environment variables
  load() {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.ownerId = process.env.TELEGRAM_OWNER_ID || data.ownerId || '2051992452';
        this.defaultLimit = typeof data.defaultLimit === 'number' ? data.defaultLimit : 10;
        this.users = data.users || {};
        this.pendingRequests = data.pendingRequests || {};

        // Ensure owner entry exists with unlimited quota
        if (!this.users[this.ownerId]) {
          this.users[this.ownerId] = {
            id: String(this.ownerId),
            username: 'BotOwner',
            role: 'owner',
            limit: -1,
            used: 0,
            authorizedAt: new Date().toISOString()
          };
        }
        return;
      }
    } catch (err) {
      console.error('Error loading telegram_users.json:', err.message);
    }
    // Initialize default file if not exists
    this.setOwner('2051992452', 'BotOwner');
  }

  // Save to disk
  save() {
    try {
      const data = {
        ownerId: this.ownerId,
        defaultLimit: this.defaultLimit,
        users: this.users,
        pendingRequests: this.pendingRequests,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving telegram_users.json:', err.message);
    }
  }

  // Check if someone is the owner
  isOwner(userId) {
    if (!userId || !this.ownerId) return false;
    return String(this.ownerId) === String(userId);
  }

  // Set or change bot owner
  setOwner(userId, username = 'Owner') {
    if (!userId) return false;
    this.ownerId = String(userId);

    // Ensure owner is in users list with unlimited role
    this.users[this.ownerId] = {
      id: String(userId),
      username: username || 'Owner',
      role: 'owner',
      limit: -1, // Unlimited
      used: this.users[this.ownerId]?.used || 0,
      authorizedAt: this.users[this.ownerId]?.authorizedAt || new Date().toISOString()
    };

    delete this.pendingRequests[this.ownerId];
    this.save();
    return true;
  }

  // Check if a user has access to query the bot
  checkAccess(userId, username = '') {
    const idStr = String(userId);

    // 1. Owner always has full access
    if (this.isOwner(idStr)) {
      return {
        allowed: true,
        isOwner: true,
        remaining: -1,
        limit: -1,
        used: this.users[idStr]?.used || 0
      };
    }

    // 2. Check if user is authorized
    const user = this.users[idStr];
    if (user) {
      // Update username if changed
      if (username && user.username !== username) {
        user.username = username;
      }

      // Check unlimited (-1)
      if (user.limit === -1) {
        return {
          allowed: true,
          isOwner: false,
          remaining: -1,
          limit: -1,
          used: user.used || 0
        };
      }

      // Check numeric limit
      const used = user.used || 0;
      const limit = typeof user.limit === 'number' ? user.limit : this.defaultLimit;
      const remaining = limit - used;

      if (remaining > 0) {
        return {
          allowed: true,
          isOwner: false,
          remaining,
          limit,
          used
        };
      } else {
        return {
          allowed: false,
          reason: 'QUOTA_EXHAUSTED',
          isOwner: false,
          remaining: 0,
          limit,
          used
        };
      }
    }

    // 3. User is unauthorized - record in pending requests
    const isNewRequest = !this.pendingRequests[idStr];
    this.pendingRequests[idStr] = {
      id: idStr,
      username: username || 'Telegram User',
      requestedAt: this.pendingRequests[idStr]?.requestedAt || new Date().toISOString()
    };
    this.save();

    return {
      allowed: false,
      reason: 'UNAUTHORIZED',
      isOwner: false,
      isNewRequest
    };
  }

  // Increment usage for an authorized user
  consumeQuota(userId) {
    const idStr = String(userId);
    const user = this.users[idStr];
    if (user) {
      user.used = (user.used || 0) + 1;
      this.save();
      const remaining = user.limit === -1 ? -1 : Math.max(0, user.limit - user.used);
      return {
        used: user.used,
        limit: user.limit,
        remaining
      };
    }
    return null;
  }

  // Authorize a user with a specific query limit
  authorizeUser(userId, username = '', limit = null) {
    const idStr = String(userId).trim();
    if (!idStr) return null;

    const parsedLimit = limit === null || limit === undefined || limit === '' 
      ? this.defaultLimit 
      : parseInt(limit, 10);

    const existingUsed = this.users[idStr]?.used || 0;

    this.users[idStr] = {
      id: idStr,
      username: username || this.pendingRequests[idStr]?.username || this.users[idStr]?.username || 'Telegram User',
      role: this.isOwner(idStr) ? 'owner' : 'user',
      limit: isNaN(parsedLimit) ? this.defaultLimit : parsedLimit,
      used: existingUsed,
      authorizedAt: new Date().toISOString()
    };

    // Remove from pending
    delete this.pendingRequests[idStr];
    this.save();

    return this.users[idStr];
  }

  // Revoke/De-authorize a user
  revokeUser(userId) {
    const idStr = String(userId).trim();
    if (!idStr) return false;

    // Prevent revoking owner directly
    if (this.isOwner(idStr)) {
      return false;
    }

    if (this.users[idStr]) {
      delete this.users[idStr];
      this.save();
      return true;
    }
    return false;
  }

  // Set new limit for an existing user
  setLimit(userId, newLimit) {
    const idStr = String(userId).trim();
    const user = this.users[idStr];
    if (!user) return null;

    const parsed = parseInt(newLimit, 10);
    user.limit = isNaN(parsed) ? this.defaultLimit : parsed;
    this.save();
    return user;
  }

  // Reject a pending request
  rejectPending(userId) {
    const idStr = String(userId).trim();
    if (this.pendingRequests[idStr]) {
      delete this.pendingRequests[idStr];
      this.save();
      return true;
    }
    return false;
  }

  // Full state snapshot for Web Dashboard
  getState() {
    return {
      ownerId: this.ownerId,
      defaultLimit: this.defaultLimit,
      users: Object.values(this.users),
      pendingRequests: Object.values(this.pendingRequests),
      totalAuthorized: Object.keys(this.users).length,
      totalPending: Object.keys(this.pendingRequests).length
    };
  }
}

module.exports = new TelegramAuthManager();
