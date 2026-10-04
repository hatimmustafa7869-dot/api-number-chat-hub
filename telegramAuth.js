/**
 * Telegram Bot Authorization & Rate Limit Manager
 * Provides persistent Role-Based Access Control (RBAC) and query quotas
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORAGE_FILE = path.join(__dirname, 'telegram_users.json');

class TelegramAuthManager {
  constructor() {
    this.ownerId = process.env.TELEGRAM_OWNER_ID || '2051992452'; // Designated Bot Owner
    this.defaultLimit = 10;
    this.users = {}; // id -> { id, username, role, limit, used, authorizedAt }
    this.pendingRequests = {}; // id -> { id, username, requestedAt }
    this.load();
    this.initDatabase();
  }

  // Initialize and merge from multi-tier database
  async initDatabase() {
    try {
      await db.initMySQL();
      const state = await db.loadTelegramData();
      if (state && state.users) {
        this.ownerId = state.ownerId || this.ownerId;
        this.defaultLimit = state.defaultLimit || this.defaultLimit;
        // Merge into current state
        Object.assign(this.users, state.users);
        Object.assign(this.pendingRequests, state.pendingRequests || {});
      }
    } catch (err) {
      console.warn('[TelegramAuth] Database initialization notice:', err.message);
    }
  }

  // Load synchronously from multi-tier database and backup layers
  load() {
    try {
      const syncData = db.loadTelegramDataSync();
      if (syncData && syncData.users) {
        this.ownerId = process.env.TELEGRAM_OWNER_ID || syncData.ownerId || '2051992452';
        this.defaultLimit = typeof syncData.defaultLimit === 'number' ? syncData.defaultLimit : 10;
        this.users = syncData.users || {};
        this.pendingRequests = syncData.pendingRequests || {};
      }
    } catch (err) {
      console.error('Error loading sync from db:', err.message);
    }

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
  }

  // Save to disk and database engine
  save(deletedUserId = null) {
    const data = {
      ownerId: this.ownerId,
      defaultLimit: this.defaultLimit,
      users: this.users,
      pendingRequests: this.pendingRequests,
      updatedAt: new Date().toISOString()
    };

    // Save to multi-tier database engine (survives git pulls and redeploys)
    db.saveTelegramData(data, deletedUserId).catch(() => {});
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

  // Authorize a user with a specific query limit (supports 'unlimited' or -1)
  authorizeUser(userId, username = '', limit = null) {
    const idStr = String(userId).trim();
    if (!idStr) return null;

    let parsedLimit;
    const strLimit = String(limit || '').toLowerCase().trim();
    if (strLimit === 'unlimited' || strLimit === 'inf' || strLimit === 'infinite' || strLimit === '-1' || limit === -1) {
      parsedLimit = -1;
    } else if (limit === null || limit === undefined || limit === '') {
      parsedLimit = this.defaultLimit;
    } else {
      parsedLimit = parseInt(limit, 10);
    }

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
      this.save(idStr);
      return true;
    }
    return false;
  }

  // Set new limit for an existing user (supports 'unlimited' or -1)
  setLimit(userId, newLimit) {
    const idStr = String(userId).trim();
    const user = this.users[idStr];
    if (!user) return null;

    let parsed;
    const strLimit = String(newLimit || '').toLowerCase().trim();
    if (strLimit === 'unlimited' || strLimit === 'inf' || strLimit === 'infinite' || strLimit === '-1' || newLimit === -1) {
      parsed = -1;
    } else {
      parsed = parseInt(newLimit, 10);
    }

    user.limit = isNaN(parsed) ? this.defaultLimit : parsed;
    this.save();
    return user;
  }

  // Convenience helper to set unlimited queries directly
  setUnlimited(userId) {
    return this.setLimit(userId, -1);
  }

  // Reject a pending request
  rejectPending(userId) {
    const idStr = String(userId).trim();
    if (this.pendingRequests[idStr]) {
      delete this.pendingRequests[idStr];
      this.save(idStr);
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
