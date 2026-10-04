/**
 * Admin Authentication & Session Management Module
 * Protects web access with customizable username and password.
 * Uses persistent HMAC signed tokens that survive server restarts and multi-process workers.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_FILE = path.join(__dirname, 'admin_auth.json');

class AdminAuthService {
  constructor() {
    this.username = 'admin';
    this.password = 'admin123';
    this.secret = crypto.randomBytes(32).toString('hex');
    this.activeSessions = new Map(); // token -> { username, createdAt, expiresAt }
    this.load();
  }

  // Load credentials and secret from disk or environment variables
  load() {
    try {
      if (fs.existsSync(AUTH_FILE)) {
        const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        this.username = process.env.ADMIN_USERNAME || data.username || 'admin';
        this.password = process.env.ADMIN_PASSWORD || data.password || 'admin123';
        this.secret = process.env.SESSION_SECRET || data.secret || this.secret;
        if (!data.secret) {
          this.save();
        }
        return;
      }
    } catch (err) {
      console.error('Error loading admin_auth.json:', err.message);
    }
    this.username = process.env.ADMIN_USERNAME || 'admin';
    this.password = process.env.ADMIN_PASSWORD || 'admin123';
    this.secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
    this.save();
  }

  // Save credentials and persistent secret to disk
  save() {
    try {
      const data = {
        username: this.username,
        password: this.password,
        secret: this.secret,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving admin_auth.json:', err.message);
    }
  }

  // Generate cryptographically signed token
  generateSignedToken(username) {
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days persistent session
    const payloadObj = {
      u: username,
      iat: now,
      exp: expiresAt,
      rnd: crypto.randomBytes(8).toString('hex')
    };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${signature}`;
  }

  // Authenticate credentials & generate session token
  login(username, password) {
    if (!username || !password) {
      return { ok: false, error: 'Username and password are required' };
    }

    if (username.trim() === this.username && password.trim() === this.password) {
      const token = this.generateSignedToken(this.username);
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

      this.activeSessions.set(token, {
        username: this.username,
        createdAt: Date.now(),
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

  // Validate session token (Stateless verification survives server restarts)
  verifyToken(token) {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.trim();

    // Check signed token format
    const parts = cleanToken.split('.');
    if (parts.length === 2) {
      const [payloadB64, signature] = parts;
      try {
        const expectedSig = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
          if (Date.now() <= payload.exp) {
            return {
              username: payload.u,
              expiresAt: payload.exp
            };
          }
        }
      } catch {
        // Fall through to memory check
      }
    }

    // Fallback: Check memory map
    const session = this.activeSessions.get(cleanToken);
    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(cleanToken);
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
    this.secret = crypto.randomBytes(32).toString('hex'); // Invalidate old tokens
    this.save();

    this.activeSessions.clear();

    const token = this.generateSignedToken(this.username);
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.activeSessions.set(token, {
      username: this.username,
      createdAt: Date.now(),
      expiresAt
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
