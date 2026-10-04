/**
 * Resilient Multi-Tier Database & Persistence Engine
 * Protects Telegram authorized users and API configurations across redeployments,
 * git pulls, server restarts, and container rebuilds.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Storage paths
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const LOCAL_STORAGE_FILE = path.join(ROOT_DIR, 'telegram_users.json');
const PRIMARY_DB_FILE = path.join(DATA_DIR, 'telegram_users.db');

// Cross-deploy external backup locations (survive repository re-clones & git pulls)
const EXTERNAL_BACKUP_DIR = path.join(ROOT_DIR, '..', '.apichat_backup');
const EXTERNAL_BACKUP_FILE = path.join(EXTERNAL_BACKUP_DIR, 'telegram_users_backup.json');
const HOME_BACKUP_DIR = path.join(os.homedir(), '.apichat_hub');
const HOME_BACKUP_FILE = path.join(HOME_BACKUP_DIR, 'telegram_users_backup.json');

class DatabaseService {
  constructor() {
    this.mysqlPool = null;
    this.isInitialized = false;
    this.ensureDirectories();
  }

  // Ensure storage directories exist
  ensureDirectories() {
    const dirs = [DATA_DIR, EXTERNAL_BACKUP_DIR, HOME_BACKUP_DIR];
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

  // Safe file reader helper
  readJsonFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (raw && raw.trim().startsWith('{')) {
          return JSON.parse(raw);
        }
      }
    } catch (err) {
      console.warn(`[Database] Notice reading ${path.basename(filePath)}:`, err.message);
    }
    return null;
  }

  // Safe atomic file writer helper
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
      } catch (err) {
        console.error(`[Database] Failed writing ${path.basename(filePath)}:`, err.message);
        return false;
      }
    }
  }

  // Initialize MySQL if credentials provided in .env
  async initMySQL() {
    if (this.mysqlPool || !process.env.DB_HOST || !process.env.DB_USER) {
      return false;
    }

    try {
      let mysql = null;
      try {
        mysql = require('mysql2/promise');
      } catch {
        console.log('[Database] mysql2 package not installed, continuing with file-based multi-tier persistence');
        return false;
      }

      this.mysqlPool = mysql.createPool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
        database: process.env.DB_NAME || process.env.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      // Create telegram_users table if not exists
      await this.mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS telegram_users (
          user_id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) DEFAULT '',
          role VARCHAR(32) DEFAULT 'user',
          query_limit INT DEFAULT 10,
          used_queries INT DEFAULT 0,
          authorized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Create pending_requests table if not exists
      await this.mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS telegram_pending_requests (
          user_id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) DEFAULT '',
          requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      console.log('✅ [Database] Connected to MySQL database successfully! Telegram access will persist across deployments in MySQL.');
      return true;
    } catch (err) {
      console.warn('[Database] MySQL connection notice (using multi-tier local storage):', err.message);
      this.mysqlPool = null;
      return false;
    }
  }

  // Load and merge all users from all persistence layers
  async loadTelegramData() {
    this.ensureDirectories();

    const ownerId = String(process.env.TELEGRAM_OWNER_ID || '2051992452').trim();

    // Aggregated state
    let mergedUsers = {};
    let mergedPending = {};
    let defaultLimit = 10;

    // Layer 1: Read Primary Database file
    const primaryData = this.readJsonFile(PRIMARY_DB_FILE);
    if (primaryData) {
      if (primaryData.users) Object.assign(mergedUsers, primaryData.users);
      if (primaryData.pendingRequests) Object.assign(mergedPending, primaryData.pendingRequests);
      if (typeof primaryData.defaultLimit === 'number') defaultLimit = primaryData.defaultLimit;
    }

    // Layer 2: Read External backup (outside repo)
    const externalData = this.readJsonFile(EXTERNAL_BACKUP_FILE);
    if (externalData) {
      if (externalData.users) Object.assign(mergedUsers, externalData.users);
      if (externalData.pendingRequests) Object.assign(mergedPending, externalData.pendingRequests);
    }

    // Layer 3: Read User home backup
    const homeData = this.readJsonFile(HOME_BACKUP_FILE);
    if (homeData) {
      if (homeData.users) Object.assign(mergedUsers, homeData.users);
      if (homeData.pendingRequests) Object.assign(mergedPending, homeData.pendingRequests);
    }

    // Layer 4: Read local file
    const localData = this.readJsonFile(LOCAL_STORAGE_FILE);
    if (localData) {
      if (localData.users) Object.assign(mergedUsers, localData.users);
      if (localData.pendingRequests) Object.assign(mergedPending, localData.pendingRequests);
      if (typeof localData.defaultLimit === 'number') defaultLimit = localData.defaultLimit;
    }

    // Layer 5: Read from MySQL if connected
    if (this.mysqlPool) {
      try {
        const [userRows] = await this.mysqlPool.query('SELECT * FROM telegram_users');
        for (const row of userRows) {
          mergedUsers[String(row.user_id)] = {
            id: String(row.user_id),
            username: row.username,
            role: row.role,
            limit: row.query_limit,
            used: row.used_queries,
            authorizedAt: row.authorized_at ? new Date(row.authorized_at).toISOString() : new Date().toISOString()
          };
        }

        const [pendingRows] = await this.mysqlPool.query('SELECT * FROM telegram_pending_requests');
        for (const row of pendingRows) {
          mergedPending[String(row.user_id)] = {
            id: String(row.user_id),
            username: row.username,
            requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : new Date().toISOString()
          };
        }
      } catch (err) {
        console.warn('[Database] Error reading from MySQL:', err.message);
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

    const finalState = {
      ownerId,
      defaultLimit,
      users: mergedUsers,
      pendingRequests: mergedPending,
      updatedAt: new Date().toISOString()
    };

    // Synchronize the merged state back to all layers so all backups are up-to-date
    this.saveTelegramData(finalState).catch(() => {});

    console.log(`🛡️ [Database] Telegram Access Loaded: ${Object.keys(mergedUsers).length} authorized users protected across deployments.`);
    return finalState;
  }

  // Save users & state to all persistence layers
  async saveTelegramData(data) {
    if (!data) return;

    const payload = {
      ownerId: data.ownerId || '2051992452',
      defaultLimit: typeof data.defaultLimit === 'number' ? data.defaultLimit : 10,
      users: data.users || {},
      pendingRequests: data.pendingRequests || {},
      updatedAt: new Date().toISOString()
    };

    // 1. Primary DB file
    this.writeJsonFile(PRIMARY_DB_FILE, payload);

    // 2. Local root file (for quick local access)
    this.writeJsonFile(LOCAL_STORAGE_FILE, payload);

    // 3. External backup outside repository (survives git pull / git clone)
    this.writeJsonFile(EXTERNAL_BACKUP_FILE, payload);

    // 4. User home backup (survives container or directory deletion)
    this.writeJsonFile(HOME_BACKUP_FILE, payload);

    // 5. Sync to MySQL if available
    if (this.mysqlPool) {
      try {
        const users = Object.values(payload.users);
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
            u.authorizedAt ? new Date(u.authorizedAt) : new Date()
          ]);
        }
      } catch (err) {
        console.warn('[Database] Error syncing users to MySQL:', err.message);
      }
    }
  }

  // Remove a user from persistence
  async deleteUser(userId) {
    const idStr = String(userId);
    if (this.mysqlPool) {
      try {
        await this.mysqlPool.query('DELETE FROM telegram_users WHERE user_id = ?', [idStr]);
      } catch {}
    }
  }
}

module.exports = new DatabaseService();
