/**
 * Resilient Multi-Tier Database & Persistence Engine
 * Protects Telegram authorized users and API configurations across redeployments,
 * git pulls, server restarts, container rebuilds, and disk wipes.
 *
 * Tier 1: Real MySQL / MariaDB (Hostinger Web Hosting Database via .env table)
 * Tier 2: Parent External Backup (outside git repo root: ../.apichat_backup/)
 * Tier 3: User Home Directory Backup (~/.apichat_hub/)
 * Tier 4: System Temp / Cache Backup (/tmp/.apichat_hub/)
 * Tier 5: Local Data Storage (data/telegram_users.db and telegram_users.json)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Storage paths
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const LOCAL_STORAGE_FILE = path.join(ROOT_DIR, 'telegram_users.json');
const PRIMARY_DB_FILE = path.join(DATA_DIR, 'telegram_users.db');

// External backup locations that CANNOT be overwritten by git pull / git checkout
const EXTERNAL_BACKUP_DIR = path.join(ROOT_DIR, '..', '.apichat_backup');
const EXTERNAL_BACKUP_FILE = path.join(EXTERNAL_BACKUP_DIR, 'telegram_users_backup.json');

const HOME_BACKUP_DIR = path.join(os.homedir(), '.apichat_hub');
const HOME_BACKUP_FILE = path.join(HOME_BACKUP_DIR, 'telegram_users_backup.json');

const TMP_BACKUP_DIR = path.join(os.tmpdir(), '.apichat_hub');
const TMP_BACKUP_FILE = path.join(TMP_BACKUP_DIR, 'telegram_users_backup.json');

class DatabaseService {
  constructor() {
    this.mysqlPool = null;
    this.isInitialized = false;
    this.ensureDirectories();
  }

  // Ensure storage directories exist
  ensureDirectories() {
    const dirs = [DATA_DIR, EXTERNAL_BACKUP_DIR, HOME_BACKUP_DIR, TMP_BACKUP_DIR];
    for (const d of dirs) {
      try {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
      } catch {
        // Fallback gracefully if permissions restricted
      }
    }
  }

  // Safe file reader helper (synchronous)
  readJsonFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (raw && raw.trim().startsWith('{')) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      }
    } catch {
      // Silently fall through to next tier
    }
    return null;
  }

  // Safe atomic file writer helper (synchronous)
  writeJsonFile(filePath, data) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const content = JSON.stringify(data, null, 2);
      const tmp = `${filePath}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, filePath);
      return true;
    } catch {
      try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
      } catch {
        return false;
      }
    }
  }

  // Initialize MySQL if credentials provided in .env (Hostinger Database Table)
  async initMySQL() {
    if (this.mysqlPool) return true;

    // Check credentials from environment variables
    const host = process.env.DB_HOST || (process.env.DB_USER ? 'localhost' : null);
    const user = process.env.DB_USER || process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD || process.env.DB_PASS || '';
    const database = process.env.DB_NAME || process.env.DB_DATABASE;
    const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

    if (!databaseUrl && (!host || !user || !database)) {
      return false;
    }

    try {
      let mysql = null;
      try {
        mysql = require('mysql2/promise');
      } catch {
        console.log('[Database] Note: mysql2 package not found, using multi-tier file persistence.');
        return false;
      }

      const poolConfig = databaseUrl ? { uri: databaseUrl } : {
        host: host,
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: user,
        password: password,
        database: database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      };

      this.mysqlPool = mysql.createPool(poolConfig);

      // Verify connection
      await this.mysqlPool.query('SELECT 1');

      // Create telegram_users table if not exists
      await this.mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS telegram_users (
          user_id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) DEFAULT '',
          role VARCHAR(32) DEFAULT 'user',
          query_limit INT DEFAULT 10,
          used_queries INT DEFAULT 0,
          authorized_at VARCHAR(64) DEFAULT '',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Create pending_requests table if not exists
      await this.mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS telegram_pending_requests (
          user_id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) DEFAULT '',
          requested_at VARCHAR(64) DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      console.log('✅ [Database] Connected to MySQL database! Users will be permanently stored in MySQL across all redeployments.');
      return true;
    } catch (err) {
      console.warn('[Database] MySQL connection notice:', err.message);
      this.mysqlPool = null;
      return false;
    }
  }

  // Synchronous loader: reads all backup layers immediately on process start
  loadTelegramDataSync() {
    this.ensureDirectories();

    const ownerId = String(process.env.TELEGRAM_OWNER_ID || '2051992452').trim();
    let mergedUsers = {};
    let mergedPending = {};
    let defaultLimit = 10;

    // Scan all file backup locations in order of resilience
    const backupFiles = [
      HOME_BACKUP_FILE,
      EXTERNAL_BACKUP_FILE,
      TMP_BACKUP_FILE,
      PRIMARY_DB_FILE,
      LOCAL_STORAGE_FILE
    ];

    for (const file of backupFiles) {
      const data = this.readJsonFile(file);
      if (data && typeof data === 'object') {
        if (data.users && typeof data.users === 'object') {
          for (const [id, user] of Object.entries(data.users)) {
            if (id && user && !mergedUsers[id]) {
              mergedUsers[id] = user;
            } else if (id && user && mergedUsers[id]) {
              // Merge: keep highest quota or latest state
              if (user.limit === -1 || mergedUsers[id].limit === -1) {
                mergedUsers[id].limit = -1;
              } else if (typeof user.limit === 'number' && user.limit > (mergedUsers[id].limit || 0)) {
                mergedUsers[id].limit = user.limit;
              }
              if (user.username && !mergedUsers[id].username) {
                mergedUsers[id].username = user.username;
              }
            }
          }
        }
        if (data.pendingRequests && typeof data.pendingRequests === 'object') {
          Object.assign(mergedPending, data.pendingRequests);
        }
        if (typeof data.defaultLimit === 'number') {
          defaultLimit = data.defaultLimit;
        }
      }
    }

    // Ensure owner entry always exists with unlimited quota
    mergedUsers[ownerId] = {
      id: ownerId,
      username: 'BotOwner',
      role: 'owner',
      limit: -1, // Unlimited
      used: mergedUsers[ownerId]?.used || 0,
      authorizedAt: mergedUsers[ownerId]?.authorizedAt || new Date().toISOString()
    };
    delete mergedPending[ownerId];

    const state = {
      ownerId,
      defaultLimit,
      users: mergedUsers,
      pendingRequests: mergedPending,
      updatedAt: new Date().toISOString()
    };

    return state;
  }

  // Asynchronous loader: loads from files AND MySQL database
  async loadTelegramData() {
    // 1. Load from all file tiers first (synchronously)
    const state = this.loadTelegramDataSync();
    const ownerId = state.ownerId;
    const mergedUsers = { ...state.users };
    const mergedPending = { ...state.pendingRequests };

    // 2. Query MySQL if connected
    if (this.mysqlPool) {
      try {
        const [userRows] = await this.mysqlPool.query('SELECT * FROM telegram_users');
        for (const row of userRows) {
          const id = String(row.user_id);
          mergedUsers[id] = {
            id: id,
            username: row.username || 'User',
            role: row.role || 'user',
            limit: row.query_limit !== undefined ? row.query_limit : 10,
            used: row.used_queries !== undefined ? row.used_queries : 0,
            authorizedAt: row.authorized_at || new Date().toISOString()
          };
        }

        const [pendingRows] = await this.mysqlPool.query('SELECT * FROM telegram_pending_requests');
        for (const row of pendingRows) {
          const id = String(row.user_id);
          mergedPending[id] = {
            id: id,
            username: row.username || 'User',
            requestedAt: row.requested_at || new Date().toISOString()
          };
        }
      } catch (err) {
        console.warn('[Database] Error reading from MySQL:', err.message);
      }
    }

    // Ensure owner is preserved with unlimited quota
    mergedUsers[ownerId] = {
      id: ownerId,
      username: 'BotOwner',
      role: 'owner',
      limit: -1,
      used: mergedUsers[ownerId]?.used || 0,
      authorizedAt: mergedUsers[ownerId]?.authorizedAt || new Date().toISOString()
    };
    delete mergedPending[ownerId];

    const finalState = {
      ownerId,
      defaultLimit: state.defaultLimit,
      users: mergedUsers,
      pendingRequests: mergedPending,
      updatedAt: new Date().toISOString()
    };

    // Re-save merged state to all tiers without deletion
    this.saveTelegramData(finalState).catch(() => {});

    console.log(`🛡️ [Database] Telegram Access Loaded: ${Object.keys(mergedUsers).length} authorized users protected across deployments.`);
    return finalState;
  }

  // Non-destructive Additive Save: Never overwrites existing users with an empty list!
  async saveTelegramData(data, deletedUserId = null) {
    if (!data) return;

    // 1. Read existing users from disk to ensure non-destructive additive saving
    const existingDiskState = this.loadTelegramDataSync();
    const mergedUsers = { ...(existingDiskState.users || {}), ...(data.users || {}) };
    const mergedPending = { ...(existingDiskState.pendingRequests || {}), ...(data.pendingRequests || {}) };

    // If a user was explicitly deleted / revoked, remove them
    if (deletedUserId) {
      const delId = String(deletedUserId);
      delete mergedUsers[delId];
      delete mergedPending[delId];
    }

    const payload = {
      ownerId: data.ownerId || existingDiskState.ownerId || '2051992452',
      defaultLimit: typeof data.defaultLimit === 'number' ? data.defaultLimit : 10,
      users: mergedUsers,
      pendingRequests: mergedPending,
      updatedAt: new Date().toISOString()
    };

    // 2. Write to all 5 file tiers
    this.writeJsonFile(PRIMARY_DB_FILE, payload);
    this.writeJsonFile(LOCAL_STORAGE_FILE, payload);
    this.writeJsonFile(EXTERNAL_BACKUP_FILE, payload);
    this.writeJsonFile(HOME_BACKUP_FILE, payload);
    this.writeJsonFile(TMP_BACKUP_FILE, payload);

    // 3. Sync to MySQL if available
    if (this.mysqlPool) {
      try {
        if (deletedUserId) {
          await this.mysqlPool.query('DELETE FROM telegram_users WHERE user_id = ?', [String(deletedUserId)]);
          await this.mysqlPool.query('DELETE FROM telegram_pending_requests WHERE user_id = ?', [String(deletedUserId)]);
        }

        const users = Object.values(mergedUsers);
        for (const u of users) {
          await this.mysqlPool.query(`
            INSERT INTO telegram_users (user_id, username, role, query_limit, used_queries, authorized_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              username = VALUES(username),
              role = VALUES(role),
              query_limit = VALUES(query_limit),
              used_queries = VALUES(used_queries);
          `, [
            String(u.id),
            u.username || '',
            u.role || 'user',
            typeof u.limit === 'number' ? u.limit : 10,
            typeof u.used === 'number' ? u.used : 0,
            String(u.authorizedAt || new Date().toISOString())
          ]);
        }

        const pending = Object.values(mergedPending);
        for (const p of pending) {
          await this.mysqlPool.query(`
            INSERT INTO telegram_pending_requests (user_id, username, requested_at)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
              username = VALUES(username);
          `, [
            String(p.id),
            p.username || '',
            String(p.requestedAt || new Date().toISOString())
          ]);
        }
      } catch (err) {
        console.warn('[Database] Error syncing to MySQL:', err.message);
      }
    }
  }

  // Remove a user from persistence
  async deleteUser(userId) {
    const idStr = String(userId);
    // Trigger save with deletedUserId parameter
    await this.saveTelegramData({ users: {}, pendingRequests: {} }, idStr);
  }
}

module.exports = new DatabaseService();
