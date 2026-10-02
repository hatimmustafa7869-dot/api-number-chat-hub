const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Built-in .env parser (Loads .env variables without external packages)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
      if (match) {
        let key = match[1];
        let value = match[2] ? match[2].trim() : '';
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.warn('Notice: Could not load .env file:', e.message);
}

const TelegramBotService = require('./telegramBot');
const adminAuth = require('./adminAuth');
const apiStore = require('./apiStore');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// CORE QUERY EXECUTOR (Shared by Web & Telegram)
// ==========================================
async function executeApiQuery({
  url,
  paramName = 'number',
  number,
  query,
  value,
  method = 'GET',
  headers = {},
  bodyType = 'none',
  customBody = {}
}) {
  if (!url) {
    throw new Error('Target API URL is required');
  }

  const queryVal = (query !== undefined && query !== null && query !== '' ? query : (number !== undefined && number !== null && number !== '' ? number : value || '')).toString().trim();

  if (!queryVal) {
    throw new Error('A search value or query parameter is required');
  }

  const startTime = Date.now();

  let finalUrl = url.trim();

  // If relative path (e.g. /api/mock/...), prepend local server origin
  if (finalUrl.startsWith('/')) {
    finalUrl = `http://localhost:${PORT}${finalUrl}`;
  }

  // Check if URL has placeholders: {number}, {rc}, {query}, {value} or :number, :rc, :query, :value
  finalUrl = finalUrl.replace(/\{number\}|\{rc\}|\{query\}|\{value\}/gi, encodeURIComponent(queryVal));
  finalUrl = finalUrl.replace(/\:(number|rc|query|value)\b/gi, encodeURIComponent(queryVal));

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: {
      'User-Agent': 'APIChat-MultiApi-Proxy/2.0',
      ...headers
    }
  };

  // Configure query parameters or request body
  if (fetchOptions.method === 'GET') {
    if (!url.includes('{number}') && !url.includes('{rc}') && !url.includes('{query}') && !url.includes('{value}') && !url.includes(':number') && !url.includes(':rc') && !url.includes(':query') && !url.includes(':value') && paramName) {
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${separator}${encodeURIComponent(paramName)}=${encodeURIComponent(queryVal)}`;
    }
  } else if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
    if (bodyType === 'json') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      const payload = {
        [paramName || 'query']: queryVal,
        ...(typeof customBody === 'object' && customBody !== null ? customBody : {})
      };
      fetchOptions.body = JSON.stringify(payload);
    } else if (bodyType === 'form') {
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const params = new URLSearchParams();
      params.append(paramName || 'query', queryVal);
      if (typeof customBody === 'object' && customBody !== null) {
        Object.entries(customBody).forEach(([k, v]) => params.append(k, String(v)));
      }
      fetchOptions.body = params.toString();
    }
  }

  // 15-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(finalUrl, fetchOptions);
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';

    let responseData;
    let isJson = false;

    if (contentType.includes('application/json')) {
      responseData = await response.json();
      isJson = true;
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
        isJson = true;
      } catch {
        responseData = text;
        isJson = false;
      }
    }

    const responseHeaders = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
      targetUrl: finalUrl,
      method: fetchOptions.method,
      isJson,
      headers: responseHeaders,
      data: responseData
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    let errorMessage = err.message || 'Unknown network error';
    if (err.name === 'AbortError') {
      errorMessage = 'Request timed out after 15,000ms';
    }
    return {
      ok: false,
      status: 502,
      statusText: 'Gateway Error',
      error: errorMessage,
      latencyMs,
      targetUrl: finalUrl
    };
  }
}

// Initialize Telegram Bot Service with our shared executor and API store
const telegramBot = new TelegramBotService(executeApiQuery, apiStore);

// Health check endpoint (Public)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'API Number Query Hub Backend',
    version: '1.0.0',
    telegram: telegramBot.getStatus()
  });
});

// ==========================================
// ADMIN AUTHENTICATION MIDDLEWARE & ROUTES
// ==========================================

// Middleware: Require valid session token
function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'].trim();
  } else if (req.query && req.query.token) {
    token = req.query.token.trim();
  }

  const session = adminAuth.verifyToken(token);
  if (!session) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized: Admin authentication required',
      requiresLogin: true
    });
  }

  req.adminSession = session;
  next();
}

// 1. Admin Login (Public)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const result = adminAuth.login(username, password);
  if (result.ok) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
});

// 2. Verify Session / Whoami (Public token check)
app.get('/api/auth/me', (req, res) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'].trim();
  } else if (req.query && req.query.token) {
    token = req.query.token.trim();
  }

  const session = adminAuth.verifyToken(token);
  if (!session) {
    return res.status(401).json({ ok: false, authenticated: false, error: 'Not logged in' });
  }

  res.json({
    ok: true,
    authenticated: true,
    username: session.username,
    expiresAt: session.expiresAt
  });
});

// 3. Admin Logout
app.post('/api/auth/logout', (req, res) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'].trim();
  }
  adminAuth.logout(token);
  res.json({ ok: true, message: 'Logged out successfully' });
});

// 4. Update Admin Credentials (Protected)
app.post('/api/auth/change-credentials', requireAuth, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const result = adminAuth.changeCredentials(currentPassword, newUsername, newPassword);
  if (result.ok) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// ==========================================
// 1. UNIVERSAL API PROXY (Protected)
// ==========================================
app.post('/api/proxy', requireAuth, async (req, res) => {
  try {
    const result = await executeApiQuery(req.body);
    return res.status(result.ok ? 200 : result.status || 500).json(result);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

// ==========================================
// MULTI-API ENDPOINT MANAGEMENT (Protected)
// ==========================================

// Get all configured APIs
app.get('/api/endpoints', requireAuth, (req, res) => {
  const storeData = apiStore.getAll();
  res.json({
    ok: true,
    activeId: storeData.activeApiId,
    endpoints: storeData.apis,
    data: storeData
  });
});

// Add a new API
app.post('/api/endpoints', requireAuth, (req, res) => {
  try {
    const newApi = apiStore.addApi(req.body);
    // If telegram bot is running and unlocked, synchronize if requested
    if (!telegramBot.isLocked && newApi) {
      telegramBot.broadcastEvent('api_added', newApi);
    }
    res.json({
      ok: true,
      message: `API "${newApi.name}" added successfully!`,
      endpoint: newApi,
      data: newApi
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Update an existing API
app.put('/api/endpoints/:id', requireAuth, (req, res) => {
  try {
    const updated = apiStore.updateApi(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'API not found' });
    }
    res.json({
      ok: true,
      message: `API "${updated.name}" updated successfully!`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Delete an API
app.delete('/api/endpoints/:id', requireAuth, (req, res) => {
  const ok = apiStore.deleteApi(req.params.id);
  if (!ok) {
    return res.status(404).json({ ok: false, error: 'API not found or cannot be deleted' });
  }
  res.json({
    ok: true,
    message: 'API removed successfully',
    data: apiStore.getAll()
  });
});

// Activate an API
app.post('/api/endpoints/:id/activate', requireAuth, (req, res) => {
  const ok = apiStore.setActive(req.params.id);
  if (!ok) {
    return res.status(404).json({ ok: false, error: 'API not found' });
  }
  const active = apiStore.getActiveApi();
  if (!telegramBot.isLocked && active) {
    telegramBot.setConfig(active.url, active.paramName);
  }
  res.json({
    ok: true,
    message: `Active API switched to "${active.name}"`,
    data: active
  });
});

// ==========================================
// 2. TELEGRAM BOT CONTROLLER ROUTES (Protected)
// ==========================================

// Get Telegram Bot Status
app.get('/api/telegram/status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    data: telegramBot.getStatus()
  });
});

// Start Telegram Bot
app.post('/api/telegram/start', requireAuth, async (req, res) => {
  const { token, apiUrl, paramName } = req.body;
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Telegram Bot Token is required' });
  }

  try {
    const result = await telegramBot.start(token, apiUrl, paramName);
    res.json({
      ok: true,
      message: `Telegram Bot @${result.botInfo.username} started successfully!`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

// Stop Telegram Bot
app.post('/api/telegram/stop', requireAuth, async (req, res) => {
  try {
    const result = await telegramBot.stop();
    res.json({
      ok: true,
      message: 'Telegram Bot stopped successfully.',
      data: result
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update Target API for Telegram Bot
app.post('/api/telegram/config', requireAuth, (req, res) => {
  const { apiUrl, paramName } = req.body;
  const updated = telegramBot.setConfig(apiUrl, paramName);
  res.json({ ok: true, data: updated });
});

// Toggle/Set API Configuration Lock
app.post('/api/config/lock', requireAuth, (req, res) => {
  const { isLocked, apiUrl, paramName } = req.body;
  const result = telegramBot.setLock(isLocked, apiUrl, paramName);
  res.json({
    ok: true,
    message: result.isLocked ? 'API Configuration is now LOCKED' : 'API Configuration is now UNLOCKED',
    data: result
  });
});

// Send custom notification from Web to all connected Telegram chats
app.post('/api/telegram/broadcast', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message text is required' });
  }
  const count = await telegramBot.broadcastNotification(message);
  res.json({ ok: true, sentCount: count });
});

// ==========================================
// TELEGRAM AUTHORIZATION & USER QUOTA ROUTES (Protected)
// ==========================================

// Get all Telegram Users, Owner & Pending Requests
app.get('/api/telegram/auth/state', requireAuth, (req, res) => {
  res.json({
    ok: true,
    data: telegramBot.authManager.getState()
  });
});

// Set or update Bot Owner ID
app.post('/api/telegram/auth/set-owner', requireAuth, (req, res) => {
  const { ownerId, username = 'Owner' } = req.body;
  if (!ownerId) {
    return res.status(400).json({ ok: false, error: 'Owner User ID is required' });
  }
  const ok = telegramBot.authManager.setOwner(ownerId, username);
  telegramBot.broadcastEvent('telegram_auth_updated', telegramBot.authManager.getState());
  res.json({ ok, ownerId, username });
});

// Authorize a user with limit
app.post('/api/telegram/auth/authorize', requireAuth, async (req, res) => {
  const { userId, username = '', limit = 10 } = req.body;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'User ID is required' });
  }
  const user = telegramBot.authManager.authorizeUser(userId, username, limit);
  telegramBot.broadcastEvent('telegram_auth_updated', telegramBot.authManager.getState());

  // Notify user via Telegram
  await telegramBot.sendMessage(
    userId,
    `🎉 *Access Granted!*\nYou have been authorized by the Bot Owner to use APIChat Hub.\n🔋 *Your Quota:* ${user.limit === -1 ? 'Unlimited' : user.limit} queries.\nSend any 10-digit number to begin!`
  );

  res.json({ ok: true, data: user });
});

// Revoke user access
app.post('/api/telegram/auth/revoke', requireAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'User ID is required' });
  }
  const ok = telegramBot.authManager.revokeUser(userId);
  telegramBot.broadcastEvent('telegram_auth_updated', telegramBot.authManager.getState());

  if (ok) {
    await telegramBot.sendMessage(userId, `⚠️ Your access to APIChat Hub has been revoked by the Bot Owner.`);
  }

  res.json({ ok });
});

// Set query limit for user
app.post('/api/telegram/auth/set-limit', requireAuth, async (req, res) => {
  const { userId, limit } = req.body;
  if (!userId || limit === undefined) {
    return res.status(400).json({ ok: false, error: 'User ID and limit are required' });
  }
  const user = telegramBot.authManager.setLimit(userId, limit);
  telegramBot.broadcastEvent('telegram_auth_updated', telegramBot.authManager.getState());

  if (user) {
    const rem = user.limit === -1 ? 'Unlimited' : Math.max(0, user.limit - (user.used || 0));
    await telegramBot.sendMessage(
      userId,
      `🔋 *Quota Updated!*\nYour query quota has been updated by the Bot Owner.\n• *Limit:* ${user.limit}\n• *Remaining:* ${rem}`
    );
  }

  res.json({ ok: Boolean(user), data: user });
});

// Reject pending request
app.post('/api/telegram/auth/reject', requireAuth, (req, res) => {
  const { userId } = req.body;
  const ok = telegramBot.authManager.rejectPending(userId);
  telegramBot.broadcastEvent('telegram_auth_updated', telegramBot.authManager.getState());
  res.json({ ok });
});

// Real-Time Server-Sent Events (SSE) Stream to Web UI (Protected with Token)
app.get('/api/events', (req, res) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token.trim();
  }

  const session = adminAuth.verifyToken(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Unauthorized SSE connection' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial connection ping
  res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);

  // Subscribe to bot events
  const unsubscribe = telegramBot.subscribeEvents((type, payload) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// ==========================================
// 3. BUILT-IN MOCK APIS FOR COLLEGE DEMO
// ==========================================

// Mock 1: Telecom & Carrier Lookup API
app.get('/api/mock/telecom-lookup', (req, res) => {
  const number = (req.query.number || req.query.phone || '').toString().trim();
  if (!number || !/^\d{10}$/.test(number)) {
    return res.status(400).json({
      status: 'error',
      code: 400,
      message: 'Invalid input. Please provide a 10-digit number in ?number=XXXXXXXXXX'
    });
  }

  const carriers = ['Airtel 5G Plus', 'Jio True 5G', 'Vodafone Idea (Vi)', 'BSNL 4G', 'Verizon Wireless', 'AT&T Mobility'];
  const circles = ['Delhi NCR', 'Mumbai Metro', 'Karnataka (Bengaluru)', 'Maharashtra & Goa', 'California, USA', 'Texas, USA'];
  const names = ['Aarav Sharma', 'Priya Patel', 'Rahul Verma', 'Sneha Reddy', 'Vikram Singh', 'Ananya Gupta', 'David Miller', 'Sarah Jenkins'];

  const hash = Array.from(number).reduce((acc, digit) => acc + parseInt(digit, 10), 0);
  const carrier = carriers[hash % carriers.length];
  const circle = circles[(hash * 2) % circles.length];
  const owner = names[(hash * 3) % names.length];
  const isSpam = hash % 7 === 0;

  res.json({
    status: 'success',
    code: 200,
    timestamp: new Date().toISOString(),
    query: {
      number,
      formatted: `+91 ${number.slice(0, 5)} ${number.slice(5)}`
    },
    data: {
      registeredName: owner,
      carrier,
      networkCircle: circle,
      lineType: 'Prepaid GSM Mobile',
      networkTechnology: '5G SA / VoLTE Enabled',
      portabilityStatus: 'Original Operator (Never Ported)',
      spamAssessment: {
        score: isSpam ? '0.78 (Moderate Risk)' : '0.04 (Clean / Safe)',
        category: isSpam ? 'Telemarketing / Calls' : 'Personal Verified',
        reportsCount: isSpam ? 18 : 0
      },
      accountStatus: 'Active',
      country: 'India',
      countryCode: '+91'
    }
  });
});

// Mock 2: University Student & KYC Lookup API
app.get('/api/mock/student-registry', (req, res) => {
  const number = (req.query.number || req.query.id || '').toString().trim();
  if (!number || !/^\d{10}$/.test(number)) {
    return res.status(400).json({
      status: 'error',
      code: 400,
      message: 'Please specify a 10-digit Student Mobile / Enrollment ID in ?number=XXXXXXXXXX'
    });
  }

  const branches = [
    'Computer Science & Engineering',
    'Information Technology',
    'Electronics & Communication',
    'Artificial Intelligence & Data Science'
  ];
  const hash = Array.from(number).reduce((acc, digit) => acc + parseInt(digit, 10), 0);
  const branch = branches[hash % branches.length];
  const rollNo = `2023-CS-${100 + (hash % 899)}`;
  const cgpa = (7.2 + ((hash % 28) / 10)).toFixed(2);

  res.json({
    status: 'success',
    code: 200,
    timestamp: new Date().toISOString(),
    query: {
      studentId: number
    },
    profile: {
      fullName: `Student Candidate #${number.slice(-4)}`,
      enrollmentNumber: rollNo,
      department: branch,
      academicYear: 'Final Year (Semester 8)',
      cgpa: parseFloat(cgpa),
      attendancePercentage: `${82 + (hash % 15)}%`,
      feesClearance: 'Paid & Verified',
      libraryDue: '₹0.00',
      collegeProjectApproved: true,
      mentor: 'Dr. S. K. Ramanathan, Dept. of CSE'
    }
  });
});

// Mock 3: SMS & OTP Gateway Simulator API
app.get('/api/mock/sms-gateway', (req, res) => {
  const number = (req.query.number || req.query.phone || '').toString().trim();
  if (!number || !/^\d{10}$/.test(number)) {
    return res.status(400).json({
      status: 'error',
      code: 400,
      message: '10-digit mobile number required in ?number=XXXXXXXXXX'
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
  const messageId = `msg_${Date.now()}_${number.slice(-4)}`;

  res.json({
    status: 'success',
    code: 200,
    transactionId: messageId,
    dispatchedAt: new Date().toISOString(),
    details: {
      recipient: number,
      formattedRecipient: `+91 ${number}`,
      messageType: 'High Priority OTP / Verification Token',
      generatedOtp: otp,
      deliveryStatus: 'DELIVERED_TO_HANDSET',
      latency: `${85 + Math.floor(Math.random() * 60)}ms`,
      gatewayNode: 'Asia-South1 (AWS SNS Mumbai)',
      smsSegments: 1,
      routeType: 'Transactional DLT Approved'
    }
  });
});

// Mock 4: Vehicle Registration & RTO Lookup API
app.get('/api/mock/vehicle-lookup', (req, res) => {
  const rc = (req.query.rc || req.query.number || req.query.query || req.query.id || '').toString().trim().toUpperCase().replace(/[\s-]/g, '');
  if (!rc || rc.length < 5) {
    return res.status(400).json({
      status: 'error',
      code: 400,
      message: 'Please provide a valid Vehicle RC Number (e.g. ?rc=DL01AB1234 or ?rc=MH12DE1433)'
    });
  }

  const stateMap = {
    'DL': 'Delhi NCT',
    'MH': 'Maharashtra',
    'UP': 'Uttar Pradesh',
    'KA': 'Karnataka',
    'HR': 'Haryana',
    'GJ': 'Gujarat',
    'RJ': 'Rajasthan',
    'PB': 'Punjab',
    'TN': 'Tamil Nadu',
    'WB': 'West Bengal',
    'TS': 'Telangana',
    'AP': 'Andhra Pradesh',
    'KL': 'Kerala',
    'MP': 'Madhya Pradesh',
    'BR': 'Bihar',
    'CH': 'Chandigarh'
  };

  const stateCode = rc.slice(0, 2);
  const stateName = stateMap[stateCode] || 'Central Motor Vehicles Registry';
  const rtoOffice = `RTO Division (${rc.slice(0, 4) || stateCode}), ${stateName}`;

  const vehicles = [
    { maker: 'Hyundai Motor India', model: 'Creta 1.5 SX (O) IVT', class: 'Motor Car (LMV)', fuel: 'Petrol' },
    { maker: 'Maruti Suzuki India', model: 'Swift ZXi+ Dual Tone', class: 'Motor Car (LMV)', fuel: 'Petrol / E20' },
    { maker: 'Tata Motors Passenger', model: 'Nexon EV Empowered Plus', class: 'Motor Car (LMV / Electric)', fuel: 'Electric (EV)' },
    { maker: 'Mahindra & Mahindra', model: 'Scorpio-N Z8L 4x4 Diesel', class: 'Motor Car (SUV)', fuel: 'Diesel (BS-VI)' },
    { maker: 'Toyota Kirloskar', model: 'Innova HyCross ZX (O) Hybrid', class: 'Motor Car (MUV)', fuel: 'Petrol Hybrid' },
    { maker: 'Honda Cars India', model: 'City 1.5L i-VTEC ZX', class: 'Motor Car (Sedan)', fuel: 'Petrol' },
    { maker: 'Royal Enfield', model: 'Classic 350 Dual-Channel ABS', class: 'Two Wheeler (MCWG)', fuel: 'Petrol' },
    { maker: 'Bajaj Auto Ltd', model: 'Pulsar NS200 BS6', class: 'Two Wheeler (MCWG)', fuel: 'Petrol' },
    { maker: 'Kia Motors India', model: 'Seltos 1.5 Turbo DCT GTX+', class: 'Motor Car (SUV)', fuel: 'Petrol' },
    { maker: 'BMW India', model: '3 Series Gran Limousine 330Li', class: 'Motor Car (Luxury Sedan)', fuel: 'Petrol' }
  ];

  const owners = [
    'Rajesh Kumar Verma', 'Vikramaditya Chauhan', 'Pooja Sanjay Sharma', 
    'Ankit Ravindra Patel', 'Siddharth Narayan Rao', 'Meera Krishnan Nair',
    'Harpreet Singh Dhillon', 'Amitabh Surendra Gupta', 'Kavita Rajesh Deshmukh'
  ];

  const financiers = ['HDFC Bank Ltd.', 'State Bank of India', 'ICICI Bank Ltd.', 'Axis Bank Ltd.', 'Kotak Mahindra Prime', 'Not Hypothecated (Cash Purchase)'];
  const insurers = ['HDFC ERGO General Insurance', 'ICICI Lombard General Insurance', 'Tata AIG General Insurance', 'Bajaj Allianz General Insurance', 'United India Insurance'];

  const hash = Array.from(rc).reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  const selectedVehicle = vehicles[hash % vehicles.length];
  const owner = owners[hash % owners.length];
  const financier = financiers[hash % financiers.length];
  const insurer = insurers[hash % insurers.length];
  const engineNo = `${selectedVehicle.maker.slice(0, 3).toUpperCase()}${100000 + (hash % 899999)}`;
  const chassisNo = `MA${stateCode}${200000 + (hash % 799999)}`;
  const regYear = 2018 + (hash % 6);

  res.json({
    status: 'success',
    code: 200,
    timestamp: new Date().toISOString(),
    query: {
      rcNumber: rc,
      formatted: `${rc.slice(0, 2)} ${rc.slice(2, 4)} ${rc.slice(4, -4)} ${rc.slice(-4)}`.replace(/\s+/g, ' ').trim()
    },
    vehicle: {
      rcNumber: rc,
      ownerName: owner,
      fatherName: `Shri ${(owners[(hash + 3) % owners.length]).split(' ')[0]} ${owner.split(' ').slice(-1)[0]}`,
      makerModel: selectedVehicle.model,
      makerName: selectedVehicle.maker,
      vehicleClass: selectedVehicle.class,
      fuelType: selectedVehicle.fuel,
      color: ['Polar White', 'Phantom Black', 'Titanium Grey', 'Cherry Red', 'Silver Metallic'][hash % 5],
      engineNumber: `${engineNo.slice(0, 4)}****${engineNo.slice(-3)}`,
      chassisNumber: `${chassisNo.slice(0, 4)}****${chassisNo.slice(-4)}`,
      registrationDate: `12-Jul-${regYear}`,
      registeringAuthority: rtoOffice,
      state: stateName,
      fitnessUpto: `11-Jul-${regYear + 15}`,
      roadTaxStatus: 'Life Time Tax Paid (Verified)',
      insuranceStatus: 'Active & Insured',
      insuranceCompany: insurer,
      insurancePolicyNo: `POL${hash}99182`,
      insuranceUpto: `24-Aug-2027`,
      puccValidUpto: `19-Dec-2026`,
      emissionNorms: 'Bharat Stage VI (BS6 OBD-II)',
      hypothecationStatus: financier.includes('Not') ? 'None' : `Hypothecated to ${financier}`,
      permitType: selectedVehicle.class.includes('Two') ? 'Private Motorcycle' : 'Private Passenger Car (LMV)',
      blacklistStatus: 'Clean / No Active Enforcement Violations',
      totalChallans: 0
    }
  });
});

// Catch-all for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 API Number Query Chat Hub is running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`🤖 Telegram Integration: Ready at /api/telegram/status`);
  console.log(`🧪 Mock APIs available:`);
  console.log(`   - Telecom:  http://localhost:${PORT}/api/mock/telecom-lookup?number=9876543210`);
  console.log(`   - Student:  http://localhost:${PORT}/api/mock/student-registry?number=9876543210`);
  console.log(`   - SMS/OTP:  http://localhost:${PORT}/api/mock/sms-gateway?number=9876543210`);
  console.log(`=======================================================`);

  // Auto-start Telegram Bot if token is provided via environment variables
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const defaultApi = process.env.DEFAULT_API_URL || 'https://rootx-osint.in/?type=num&key=sachin&query={number}';
    const defaultParam = process.env.DEFAULT_PARAM_NAME || 'number';
    
    telegramBot.start(process.env.TELEGRAM_BOT_TOKEN.trim(), defaultApi, defaultParam).then((res) => {
      console.log(`🤖 Telegram Bot @${res.botInfo.username} automatically connected via ENV!`);
      const shouldLock = process.env.LOCK_API === 'true' || process.env.LOCK_API === '1';
      if (shouldLock) {
        telegramBot.setLock(true, defaultApi, defaultParam);
        console.log(`🔒 API Configuration automatically locked to: ${defaultApi}`);
      }
    }).catch((err) => {
      console.error('⚠️ Could not auto-start Telegram bot from TELEGRAM_BOT_TOKEN:', err.message);
    });
  } else if (process.env.LOCK_API === 'true' || process.env.LOCK_API === '1') {
    const defaultApi = process.env.DEFAULT_API_URL || 'https://rootx-osint.in/?type=num&key=sachin&query={number}';
    const defaultParam = process.env.DEFAULT_PARAM_NAME || 'number';
    telegramBot.setLock(true, defaultApi, defaultParam);
    console.log(`🔒 API Configuration automatically locked to: ${defaultApi}`);
  }
});

// Clean shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await telegramBot.stop();
  server.close(() => process.exit(0));
});
