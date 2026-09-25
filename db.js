const path = require('path');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const defaultEmployees = [
  { name: 'สมชาย แสงดี', email: 'somchai@livelighting.com', role: 'service', password: hashPassword('123') },
  { name: 'กิตติพงษ์ สว่าง', email: 'kittipong@livelighting.com', role: 'service', password: hashPassword('123') },
  { name: 'ฝ่ายขาย Live Lighting', email: 'sale@livelighting.com', role: 'sale', password: hashPassword('123') },
  { name: 'ผู้ดูแลระบบสูงสุด', email: 'admin', role: 'admin', password: hashPassword('P@ssw0rd') },
  { name: 'คุณทอม', email: 'tom@livelighting.com', role: 'admin', password: hashPassword('123') }
];

const defaultCompany = {
  name: 'Live Lighting',
  address: '123 ถ.สุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
  phone: '02-XXX-XXXX',
  taxId: '0-1234-56789-01-2',
  showLogo: true,
  showSignature: true,
  showWarranty: true
};

let dbType = 'sqlite';
let pgPool = null;
let sqliteDb = null;

// Determine connection: if DATABASE_URL env var exists, connect to Cloud PostgreSQL (Supabase/Neon)
const connectionString = process.env.DATABASE_URL;
if (connectionString) {
  dbType = 'postgres';
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });
  console.log('Database configuration: Cloud PostgreSQL (Supabase/Neon)');
} else {
  dbType = 'sqlite';
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(path.join(__dirname, 'database.db'));
  console.log('Database configuration: Local SQLite (database.db)');
}

// Initialize tables
async function initSchema() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS travel_claims (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS ot_claims (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS employees (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  `;
  
  if (dbType === 'postgres') {
    await pgPool.query(ddl);
    
    // Backfill any missing built-in accounts without overwriting existing employee data.
    let seededEmployees = 0;
    for (const emp of defaultEmployees) {
      const result = await pgPool.query(
        "INSERT INTO employees (email, data) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
        [emp.email, JSON.stringify(emp)]
      );
      seededEmployees += result.rowCount || 0;
    }
    if (seededEmployees > 0) console.log('Cloud Postgres built-in employees backfilled.');

    // Seed default settings if empty
    const resSettings = await pgPool.query("SELECT COUNT(*) FROM settings");
    if (parseInt(resSettings.rows[0].count) === 0) {
      await pgPool.query("INSERT INTO settings (key, value) VALUES ($1, $2)", ['company', JSON.stringify(defaultCompany)]);
      await pgPool.query("INSERT INTO settings (key, value) VALUES ($1, $2)", ['lineToken', '']);
      console.log('Cloud Postgres default settings seeded.');
    }
  } else {
    sqliteDb.exec(ddl);
    
    // Backfill any missing built-in accounts without overwriting existing employee data.
    const insertEmployee = sqliteDb.prepare(
      "INSERT OR IGNORE INTO employees (email, data) VALUES (?, ?)"
    );
    let seededEmployees = 0;
    for (const emp of defaultEmployees) {
      const result = insertEmployee.run(emp.email, JSON.stringify(emp));
      seededEmployees += Number(result.changes || 0);
    }
    if (seededEmployees > 0) console.log('Local SQLite built-in employees backfilled.');
    
    // Seed default settings if empty
    const countSettings = sqliteDb.prepare("SELECT COUNT(*) as count FROM settings").get();
    if (countSettings.count === 0) {
      sqliteDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('company', JSON.stringify(defaultCompany));
      sqliteDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('lineToken', '');
      console.log('Local SQLite default settings seeded.');
    }
  }
}

const dbModule = {
  hashPassword,
  initSchema,

  async ping() {
    try {
      if (dbType === 'postgres') {
        if (!pgPool) return false;
        const res = await pgPool.query("SELECT 1");
        return Boolean(res && res.rows && res.rows.length > 0);
      } else {
        if (!sqliteDb) return false;
        const res = sqliteDb.prepare("SELECT 1 as alive").get();
        return Boolean(res && res.alive === 1);
      }
    } catch {
      return false;
    }
  },
  
  async getJobs() {
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT data FROM jobs");
      return res.rows.map(r => JSON.parse(r.data));
    } else {
      const rows = sqliteDb.prepare("SELECT data FROM jobs").all();
      return rows.map(r => JSON.parse(r.data));
    }
  },
  
  async saveJob(job) {
    if (dbType === 'postgres') {
      await pgPool.query(
        "INSERT INTO jobs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        [job.id, JSON.stringify(job)]
      );
    } else {
      sqliteDb.prepare("INSERT OR REPLACE INTO jobs (id, data) VALUES (?, ?)").run(job.id, JSON.stringify(job));
    }
  },
  
  async deleteJob(id) {
    if (dbType === 'postgres') {
      await pgPool.query("DELETE FROM jobs WHERE id = $1", [id]);
    } else {
      sqliteDb.prepare("DELETE FROM jobs WHERE id = ?").run(id);
    }
  },

  async getTravelClaims() {
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT data FROM travel_claims");
      return res.rows.map(r => JSON.parse(r.data));
    } else {
      const rows = sqliteDb.prepare("SELECT data FROM travel_claims").all();
      return rows.map(r => JSON.parse(r.data));
    }
  },

  async saveTravelClaim(claim) {
    if (dbType === 'postgres') {
      await pgPool.query(
        "INSERT INTO travel_claims (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        [claim.id, JSON.stringify(claim)]
      );
    } else {
      sqliteDb.prepare("INSERT OR REPLACE INTO travel_claims (id, data) VALUES (?, ?)").run(claim.id, JSON.stringify(claim));
    }
  },

  async deleteTravelClaim(id) {
    if (dbType === 'postgres') {
      await pgPool.query("DELETE FROM travel_claims WHERE id = $1", [id]);
    } else {
      sqliteDb.prepare("DELETE FROM travel_claims WHERE id = ?").run(id);
    }
  },

  async getOtClaims() {
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT data FROM ot_claims");
      return res.rows.map(r => JSON.parse(r.data));
    } else {
      const rows = sqliteDb.prepare("SELECT data FROM ot_claims").all();
      return rows.map(r => JSON.parse(r.data));
    }
  },

  async saveOtClaim(claim) {
    if (dbType === 'postgres') {
      await pgPool.query(
        "INSERT INTO ot_claims (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        [claim.id, JSON.stringify(claim)]
      );
    } else {
      sqliteDb.prepare("INSERT OR REPLACE INTO ot_claims (id, data) VALUES (?, ?)").run(claim.id, JSON.stringify(claim));
    }
  },

  async deleteOtClaim(id) {
    if (dbType === 'postgres') {
      await pgPool.query("DELETE FROM ot_claims WHERE id = $1", [id]);
    } else {
      sqliteDb.prepare("DELETE FROM ot_claims WHERE id = ?").run(id);
    }
  },

  async getEmployees(raw = false) {
    let emps = [];
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT data FROM employees");
      emps = res.rows.map(r => JSON.parse(r.data));
    } else {
      const rows = sqliteDb.prepare("SELECT data FROM employees").all();
      emps = rows.map(r => JSON.parse(r.data));
    }
    
    if (raw) return emps;
    
    // Hide password for standard client request
    return emps.map(emp => {
      const copy = { ...emp };
      delete copy.password;
      return copy;
    });
  },

  async saveEmployee(emp) {
    // Fetch existing employee data if any, to preserve their password during updates (which omit password field)
    let existing = null;
    try {
      if (dbType === 'postgres') {
        const res = await pgPool.query("SELECT data FROM employees WHERE email = $1", [emp.email.toLowerCase()]);
        existing = res.rows[0] ? JSON.parse(res.rows[0].data) : null;
      } else {
        const row = sqliteDb.prepare("SELECT data FROM employees WHERE email = ?").get(emp.email.toLowerCase());
        existing = row ? JSON.parse(row.data) : null;
      }
    } catch (err) {
      console.warn("Failed to check existing employee for password merge:", err);
    }

    if (!emp.password && existing && existing.password) {
      emp.password = existing.password;
    } else if (emp.password && emp.password.length < 64) {
      emp.password = hashPassword(emp.password);
    }

    if (dbType === 'postgres') {
      await pgPool.query(
        "INSERT INTO employees (email, data) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data",
        [emp.email.toLowerCase(), JSON.stringify(emp)]
      );
    } else {
      sqliteDb.prepare("INSERT OR REPLACE INTO employees (email, data) VALUES (?, ?)").run(emp.email.toLowerCase(), JSON.stringify(emp));
    }
  },

  async deleteEmployee(email) {
    if (dbType === 'postgres') {
      await pgPool.query("DELETE FROM employees WHERE email = $1", [email]);
    } else {
      sqliteDb.prepare("DELETE FROM employees WHERE email = ?").run(email);
    }
  },

  async getSettings() {
    let rows = [];
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT key, value FROM settings");
      rows = res.rows;
    } else {
      rows = sqliteDb.prepare("SELECT key, value FROM settings").all();
    }
    
    const settingsObj = {};
    rows.forEach(r => {
      try {
        settingsObj[r.key] = JSON.parse(r.value);
      } catch {
        settingsObj[r.key] = r.value;
      }
    });
    return settingsObj;
  },

  async saveSettings(settingsObj) {
    if (dbType === 'postgres') {
      for (const [k, v] of Object.entries(settingsObj)) {
        await pgPool.query(
          "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]
        );
      }
    } else {
      const stmt = sqliteDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      for (const [k, v] of Object.entries(settingsObj)) {
        stmt.run(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
  },

  async authenticate(email, password) {
    let row = null;
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT data FROM employees WHERE email = $1", [email.toLowerCase()]);
      row = res.rows[0];
    } else {
      row = sqliteDb.prepare("SELECT data FROM employees WHERE email = ?").get(email.toLowerCase());
    }
    
    if (!row) return null;
    
    const user = JSON.parse(row.data);
    const hashedInput = hashPassword(password);
    if (user.password === hashedInput) {
      const copy = { ...user };
      delete copy.password;
      return copy;
    }
    return null;
  },

  async diagnose() {
    const report = {
      dbType,
      connectionOk: false,
      tables: {},
      errors: []
    };
    try {
      if (dbType === 'postgres') {
        const res = await pgPool.query("SELECT 1");
        report.connectionOk = res.rows.length > 0;
        
        const tableNames = ['jobs', 'travel_claims', 'ot_claims', 'employees', 'settings'];
        for (const t of tableNames) {
          try {
            const countRes = await pgPool.query(`SELECT COUNT(*) FROM ${t}`);
            report.tables[t] = { exists: true, count: parseInt(countRes.rows[0].count) };
          } catch (err) {
            report.tables[t] = { exists: false, error: err.message };
          }
        }
      } else {
        report.connectionOk = true;
        const tableNames = ['jobs', 'travel_claims', 'ot_claims', 'employees', 'settings'];
        for (const t of tableNames) {
          try {
            const countRes = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
            report.tables[t] = { exists: true, count: countRes.count };
          } catch (err) {
            report.tables[t] = { exists: false, error: err.message };
          }
        }
      }
    } catch (e) {
      report.errors.push(e.message);
    }
    return report;
  },

  async changePassword(email, oldPassword, newPassword) {
    let row = null;
    if (dbType === 'postgres') {
      const res = await pgPool.query("SELECT data FROM employees WHERE email = $1", [email.toLowerCase()]);
      row = res.rows[0];
    } else {
      row = sqliteDb.prepare("SELECT data FROM employees WHERE email = ?").get(email.toLowerCase());
    }
    
    if (!row) return { success: false, error: "ไม่พบผู้ใช้ในระบบ" };
    
    const user = JSON.parse(row.data);
    const hashedOld = hashPassword(oldPassword);
    if (user.password !== hashedOld) {
      return { success: false, error: "รหัสผ่านเดิมไม่ถูกต้อง" };
    }
    
    // Hash new password and save
    user.password = hashPassword(newPassword);
    
    if (dbType === 'postgres') {
      await pgPool.query(
        "INSERT INTO employees (email, data) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data",
        [email.toLowerCase(), JSON.stringify(user)]
      );
    } else {
      sqliteDb.prepare("INSERT OR REPLACE INTO employees (email, data) VALUES (?, ?)").run(email.toLowerCase(), JSON.stringify(user));
    }
    return { success: true };
  }
};

module.exports = dbModule;
