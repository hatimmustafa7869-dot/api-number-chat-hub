/**
 * Multi-API Store & Endpoint Manager
 * Allows managing, saving, and querying multiple APIs simultaneously
 */

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'api_store.json');

class ApiStore {
  constructor() {
    this.activeApiId = 'phone_lookup';
    this.apis = [];
    this.load();
  }

  // Load from disk or initialize default seed APIs
  load() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.activeApiId = data.activeApiId || 'phone_lookup';
        this.apis = Array.isArray(data.apis) ? data.apis : [];
        if (this.apis.length > 0) return;
      }
    } catch (err) {
      console.error('Error loading api_store.json:', err.message);
    }

    // Default Seed Endpoints
    const defaultApiUrl = process.env.DEFAULT_API_URL || '/api/mock/telecom-lookup';
    const defaultParam = process.env.DEFAULT_PARAM_NAME || 'number';

    this.apis = [
      {
        id: 'phone_lookup',
        name: 'Mobile Number Lookup',
        description: 'Telecom operator, circle, and owner verification',
        url: defaultApiUrl,
        paramName: defaultParam,
        method: 'GET',
        inputType: 'number',
        placeholder: 'Enter 10-digit mobile number (e.g. 9876543210)...',
        icon: '📱',
        isBuiltin: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'vehicle_lookup',
        name: 'Vehicle RC & RTO Lookup',
        description: 'Vehicle registration, owner, chassis, and fitness lookup',
        url: '/api/mock/vehicle-lookup',
        paramName: 'rc',
        method: 'GET',
        inputType: 'vehicle',
        placeholder: 'Enter Vehicle RC Number (e.g. DL01AB1234, MH12DE1433)...',
        icon: '🚗',
        isBuiltin: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'student_registry',
        name: 'University Student Registry',
        description: 'College enrollment, CGPA, and branch lookup',
        url: '/api/mock/student-registry',
        paramName: 'number',
        method: 'GET',
        inputType: 'number',
        placeholder: 'Enter 10-digit Student Enrollment / Phone ID...',
        icon: '🎓',
        isBuiltin: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'sms_gateway',
        name: 'SMS / OTP Gateway Simulator',
        description: 'High-priority SMS & OTP dispatch simulator',
        url: '/api/mock/sms-gateway',
        paramName: 'number',
        method: 'GET',
        inputType: 'number',
        placeholder: 'Enter 10-digit mobile number for OTP dispatch...',
        icon: '💬',
        isBuiltin: true,
        createdAt: new Date().toISOString()
      }
    ];

    this.activeApiId = 'phone_lookup';
    this.save();
  }

  // Save to disk
  save() {
    try {
      const data = {
        activeApiId: this.activeApiId,
        apis: this.apis,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving api_store.json:', err.message);
    }
  }

  // Get all APIs
  getAll() {
    return {
      activeApiId: this.activeApiId,
      apis: this.apis
    };
  }

  // Get single API by ID
  getById(id) {
    return this.apis.find(a => a.id === id) || null;
  }

  // Get currently active API
  getActiveApi() {
    return this.getById(this.activeApiId) || this.apis[0] || null;
  }

  // Set active API
  setActive(id) {
    const found = this.getById(id);
    if (!found) return false;
    this.activeApiId = id;
    this.save();
    return true;
  }

  // Add a new API
  addApi({
    name,
    url,
    paramName = 'query',
    method = 'GET',
    inputType = 'text',
    placeholder = '',
    description = '',
    icon = '🌐',
    authHeader = '',
    customHeaders = '',
    bodyType = 'none'
  }) {
    if (!name || !url) {
      throw new Error('API Name and URL are required');
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) || 'api';
    const id = `${slug}_${Date.now().toString(36)}`;

    const newApi = {
      id,
      name: name.trim(),
      description: description.trim() || `Custom API: ${name}`,
      url: url.trim(),
      paramName: (paramName || 'query').trim(),
      method: (method || 'GET').toUpperCase(),
      inputType: inputType || 'text',
      placeholder: placeholder.trim() || `Enter ${inputType === 'vehicle' ? 'Vehicle RC Number' : (inputType === 'number' ? '10-digit number' : 'search query')}...`,
      icon: icon || (inputType === 'vehicle' ? '🚗' : (inputType === 'number' ? '📱' : '🌐')),
      authHeader: authHeader ? authHeader.trim() : '',
      customHeaders: customHeaders ? customHeaders.trim() : '',
      bodyType: bodyType || 'none',
      isBuiltin: false,
      createdAt: new Date().toISOString()
    };

    this.apis.push(newApi);
    this.activeApiId = id; // Auto-activate newly added API
    this.save();
    return newApi;
  }

  // Update existing API
  updateApi(id, updates) {
    const idx = this.apis.findIndex(a => a.id === id);
    if (idx === -1) return null;

    const current = this.apis[idx];
    this.apis[idx] = {
      ...current,
      ...updates,
      id: current.id, // Preserve ID
      isBuiltin: current.isBuiltin,
      updatedAt: new Date().toISOString()
    };

    this.save();
    return this.apis[idx];
  }

  // Delete an API
  deleteApi(id) {
    const idx = this.apis.findIndex(a => a.id === id);
    if (idx === -1) return false;

    // Remove API
    this.apis.splice(idx, 1);

    // If deleted API was active, fallback to the first one
    if (this.activeApiId === id) {
      this.activeApiId = this.apis[0] ? this.apis[0].id : '';
    }

    this.save();
    return true;
  }
}

module.exports = new ApiStore();
