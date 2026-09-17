const express = require('express');
const path = require('path');
const db = require('./db');

// Initialize database schema
db.initSchema()
  .then(() => console.log('Database schema successfully initialized.'))
  .catch(err => console.error('Database schema initialization failed:', err));

const app = express();

// Set payload limit to 50MB to support base64 images uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static dashboard files directly
app.use(express.static(__dirname));

// API Endpoint: Jobs CRUD
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await db.getJobs();
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const job = req.body;
    if (!job.id) return res.status(400).json({ error: "Missing job ID" });
    await db.saveJob(job);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await db.deleteJob(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint: Travel Claims CRUD
app.get('/api/travel-claims', async (req, res) => {
  try {
    const claims = await db.getTravelClaims();
    res.json(claims);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/travel-claims', async (req, res) => {
  try {
    const claim = req.body;
    if (!claim.id) return res.status(400).json({ error: "Missing claim ID" });
    await db.saveTravelClaim(claim);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/travel-claims/:id', async (req, res) => {
  try {
    await db.deleteTravelClaim(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint: OT Claims CRUD
app.get('/api/ot-claims', async (req, res) => {
  try {
    const claims = await db.getOtClaims();
    res.json(claims);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ot-claims', async (req, res) => {
  try {
    const claim = req.body;
    if (!claim.id) return res.status(400).json({ error: "Missing claim ID" });
    await db.saveOtClaim(claim);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/ot-claims/:id', async (req, res) => {
  try {
    await db.deleteOtClaim(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint: Employees CRUD & Permissions
app.get('/api/employees', async (req, res) => {
  try {
    const emps = await db.getEmployees();
    res.json(emps);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const emp = req.body;
    if (!emp.email) return res.status(400).json({ error: "Missing email" });
    await db.saveEmployee(emp);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/employees/:email', async (req, res) => {
  try {
    await db.deleteEmployee(req.params.email);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint: Settings Configuration
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settingsObj = req.body;
    await db.saveSettings(settingsObj);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint: Login Authentication (Secure Verification)
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "กรุณาระบุอีเมลและรหัสผ่าน" });
    }
    const user = await db.authenticate(email, password);
    if (user) {
      res.json(user);
    } else {
      res.status(401).json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint: Change Password
app.post('/api/change-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
    }
    const result = await db.changePassword(email, oldPassword, newPassword);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check endpoint (Render and monitoring)
app.get('/healthz', async (req, res) => {
  try {
    const isHealthy = await db.ping();
    if (isHealthy) {
      return res.status(200).json({ status: 'ok' });
    }
    return res.status(503).json({ status: 'unavailable' });
  } catch {
    return res.status(503).json({ status: 'unavailable' });
  }
});

// API Endpoint: Diagnostics (Development/Test only when explicitly enabled)
app.get('/api/diagnose', async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DIAGNOSTICS !== 'true') {
    return res.status(404).send('Cannot GET /api/diagnose');
  }
  try {
    const report = await db.diagnose();
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Redirect index root requests to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
