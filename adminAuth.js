/**
 * Admin Authentication & Session Management Module
 * Protects web access with customizable username and password
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_FILE = path.join(__dirname, 'admin_auth.json');

class AdminAuthService {
  constructor() {
    this.username = 'admin';
    this.password = 'admin123';
    this.activeSessions = new Map(); // token -> { username, createdAt, expiresAt }
    this.load();
  }

  // Load credentials from disk or environment variables
  load() {
    try {
      if (fs.existsSync(AUTH_FILE)) {
        const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        this.username = process.env.ADMIN_USERNAME || data.username || 'admin';
        this.password = process.env.ADMIN_PASSWORD || data.password || 'admin123';
        return;
      }
    } catch (err) {
      console.error('Error loading admin_auth.json:', err.message);
    }
    this.username = process.env.ADMIN_USERNAME || 'admin';
    this.password = process.env.ADMIN_PASSWORD || 'admin123';
    this.save();
  }

  // Save credentials to disk
  save() {
    try {
      const data = {
        username: this.username,
        password: this.password,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving admin_auth.json:', err.message);
    }
  }

  // Authenticate credentials & generate session token
  login(username, password) {
    if (!username || !password) {
      return { ok: false, error: 'Username and password are required' };
    }

    if (username.trim() === this.username && password.trim() === this.password) {
      const token = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days session

      this.activeSessions.set(token, {
        username: this.username,
        createdAt: now,
        expiresAt
      });

      return {
        ok: true,
        token,
        username: this.username,
        expiresAt
      };
    }

    return { ok: false, error: 'Invalid username or password' };
  }

  // Validate session token
  verifyToken(token) {
    if (!token || typeof token !== 'string') return false;
    const session = this.activeSessions.get(token.trim());
    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(token);
      return false;
    }
    return session;
  }

  // Invalidate session
  logout(token) {
    if (token) {
      this.activeSessions.delete(token.trim());
    }
    return true;
  }

  // Update credentials
  changeCredentials(currentPassword, newUsername, newPassword) {
    if (currentPassword.trim() !== this.password) {
      return { ok: false, error: 'Current password does not match' };
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return { ok: false, error: 'New password must be at least 4 characters long' };
    }

    if (newUsername && newUsername.trim()) {
      this.username = newUsername.trim();
    }
    this.password = newPassword.trim();
    this.save();

    // Invalidate old sessions
    this.activeSessions.clear();

    // Create a new session for the updated credentials
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    this.activeSessions.set(token, {
      username: this.username,
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000
    });

    return {
      ok: true,
      token,
      username: this.username,
      message: 'Credentials updated successfully'
    };
  }
}

module.exports = new AdminAuthService();
