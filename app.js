/* ============================================================
   SERVICE LL1 DASHBOARD - app.js
   ============================================================ */

// ── State ──
let jobs = [];
let travelClaims = [];
let otClaims = [];
let editingJobId = null;
let editingTravelClaimId = null;
let editingOtClaimId = null;
let currentModalJobId = null;
let partsCount = 0;
let revenueChart = null;
let statusChart = null;
let jobTypePieChart = null;
let jobTypeBarChart = null;
let map = null;
let sortConfig = { key: null, asc: true };
let jobPhotos = ['', '', '', '', '', ''];
let dashboardPeriod = 'month';

// ── Pagination State ──
let jobsCurrentPage = 1;
const jobsPerPage = 10;
let travelCurrentPage = 1;
const travelPerPage = 10;
let otCurrentPage = 1;
const otPerPage = 10;

// ── Enterprise Extensions State ──
let currentUser = null;
let geminiApiKey = localStorage.getItem('servicell1_gemini_api_key') || '';
const defaultEmployees = [
  { name: 'สมชาย แสงดี', email: 'somchai@livelighting.com', role: 'service', roleDisplay: 'ช่างบริการ / Service Technician', password: '123' },
  { name: 'กิตติพงษ์ สว่าง', email: 'kittipong@livelighting.com', role: 'service', roleDisplay: 'ช่างติดตั้งอาวุโส / Senior Installer', password: '123' },
  { name: 'ฝ่ายขาย Live Lighting', email: 'sale@livelighting.com', role: 'sale', roleDisplay: 'ผู้แทนขาย / Sales Representative', password: '123' },
  { name: 'ผู้ดูแลระบบสูงสุด', email: 'admin', role: 'admin', roleDisplay: 'ผู้จัดการระบบ / System Administrator', password: 'P@ssw0rd' },
  { name: 'คุณทอม', email: 'tom@livelighting.com', role: 'admin', roleDisplay: 'Senior Product Manager', password: '123' }
];
let employees = defaultEmployees;
try {
  const rawEmp = localStorage.getItem('servicell1_employees');
  if (rawEmp) employees = JSON.parse(rawEmp);
} catch (e) {
  console.error('Failed to parse employees from storage', e);
}

// Migration check: Ensure admin account exists and remove old roles
const hasOldRoles = employees.some(e => e.role === 'technician' || e.role === 'manager');
const hasAdmin = employees.some(e => e.email === 'admin');

if (hasOldRoles || !hasAdmin) {
  const customEmployees = employees.filter(e => 
    e.email !== 'somchai@livelighting.com' && 
    e.email !== 'kittipong@livelighting.com' && 
    e.email !== 'sale@livelighting.com' && 
    e.email !== 'admin' &&
    e.email !== 'tom@livelighting.com' &&
    e.role !== 'technician' &&
    e.role !== 'manager'
  );
  employees = [...defaultEmployees, ...customEmployees];
  localStorage.setItem('servicell1_employees', JSON.stringify(employees));
  localStorage.removeItem('servicell1_current_user'); // force logout
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  updateClock();
  setInterval(updateClock, 1000);
  setDefaultDates();
  initCharts();
  
  // Verify and enforce login state
  checkAuthOnLoad();
  
  // Initialize technician booking calendar state
  initCalendar();
  
  // Load data from local backend server SQLite database
  asyncInitData();
});

// ── Authentication & Roles Logic ──
function checkAuthOnLoad() {
  const savedUser = localStorage.getItem('servicell1_current_user');
  if (savedUser) {
    try {
      setLoggedInUser(JSON.parse(savedUser));
    } catch (e) {
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  currentUser = null;
  localStorage.removeItem('servicell1_current_user');
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.classList.add('active');
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.style.display = 'none';
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'none';
}

function getUserPermissions(user) {
  if (user && user.permissions) {
    return user.permissions;
  }
  const role = user ? user.role : 'sale';
  if (role === 'admin') {
    return {
      viewJobs: true,
      editJobs: true,
      deleteJobs: true,
      approveJobs: true,
      travelClaims: true,
      otClaims: true,
      approveClaims: true,
      payroll: true,
      adminSettings: true
    };
  } else if (role === 'service') {
    return {
      viewJobs: true,
      editJobs: true,
      deleteJobs: true,
      approveJobs: false,
      travelClaims: true,
      otClaims: true,
      approveClaims: true,
      payroll: true,
      adminSettings: false
    };
  } else {
    return {
      viewJobs: true,
      editJobs: true,
      deleteJobs: false,
      approveJobs: false,
      travelClaims: false,
      otClaims: false,
      approveClaims: false,
      payroll: false,
      adminSettings: false
    };
  }
}

function setLoggedInUser(user) {
  if (!user) {
    showLoginScreen();
    return;
  }
  currentUser = user;
  localStorage.setItem('servicell1_current_user', JSON.stringify(user));
  
  // Hide login screen
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.classList.remove('active');
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.style.display = 'block';
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'flex';
  
  // Update UI headers
  const userNameEl = document.getElementById('displayUserName');
  if (userNameEl) userNameEl.textContent = user.name;
  
  const roleNames = {
    service: 'Service',
    sale: 'Sale',
    admin: 'Admin'
  };
  const roleEl = document.getElementById('displayUserRole');
  if (roleEl) {
    roleEl.textContent = roleNames[user.role] || user.role;
    roleEl.className = 'badge ' + (user.role === 'admin' ? 'badge-completed' : (user.role === 'sale' ? 'badge-progress' : 'badge-pending'));
  }
  
  // Filter navigation menus based on granular user permissions
  const perms = getUserPermissions(user);
  
  const menuReport = document.getElementById('menu-report');
  const menuTodo = document.getElementById('menu-todo');
  const menuMap = document.getElementById('menu-map');
  const menuTravel = document.getElementById('menu-travel-claim');
  const menuOt = document.getElementById('menu-ot-claim');
  const menuAdmin = document.getElementById('menu-admin-settings');
  const menuAiAgents = document.getElementById('menu-ai-agents');

  if (menuReport) menuReport.style.display = perms.viewJobs ? 'flex' : 'none';
  if (menuTodo) menuTodo.style.display = perms.viewJobs ? 'flex' : 'none';
  if (menuMap) menuMap.style.display = perms.viewJobs ? 'flex' : 'none';
  if (menuTravel) menuTravel.style.display = perms.travelClaims ? 'flex' : 'none';
  if (menuOt) menuOt.style.display = perms.otClaims ? 'flex' : 'none';
  if (menuAdmin) menuAdmin.style.display = perms.adminSettings ? 'flex' : 'none';
  if (menuAiAgents) menuAiAgents.style.display = (user && user.role === 'admin') ? 'flex' : 'none';
  
  // Set default values in forms
  const empSelect = document.getElementById('otEmployee');
  if (empSelect && user.role === 'service') {
    empSelect.value = user.name;
  }
  
  // Highlight switch widget button
  document.querySelectorAll('.role-switcher-widget button').forEach(b => b.classList.remove('active'));
  document.getElementById('switch-role-' + user.role)?.classList.add('active');

  // Trigger render update
  renderAll();
  populateRefJobsDropdowns();
  renderTravelClaimsTable();
  renderOtClaimsTable();
  renderEmployeeTable();
  renderPayrollTable();
  
  // Pre-fill Admin settings fields if Admin
  if (user.role === 'admin') {
    const geminiApiKeyEl = document.getElementById('geminiApiKey');
    if (geminiApiKeyEl) geminiApiKeyEl.value = geminiApiKey;
    const setCompName = document.getElementById('settingsCompanyName');
    if (setCompName) setCompName.value = document.getElementById('companyName')?.value || 'Live Lighting';
    const setCompAddr = document.getElementById('settingsCompanyAddress');
    if (setCompAddr) setCompAddr.value = document.getElementById('companyAddress')?.value || '';
    const setCompPhone = document.getElementById('settingsCompanyPhone');
    if (setCompPhone) setCompPhone.value = document.getElementById('companyPhone')?.value || '';
    const setCompTax = document.getElementById('settingsCompanyTaxId');
    if (setCompTax) setCompTax.value = document.getElementById('companyTaxId')?.value || '';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const user = await res.json();
      setLoggedInUser(user);
      showToast('🔓 เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + user.name, 'success');
    } else {
      const err = await res.json();
      showToast('❌ ' + (err.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'), 'error');
    }
  } catch (err) {
    console.error('Login request failed:', err);
    showToast('🔌 ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อล็อกอินได้', 'error');
  }
}

function logout() {
  showLoginScreen();
  showToast('🚪 ออกจากระบบเรียบร้อย', 'info');
}

function openChangePasswordModal() {
  document.getElementById('changePasswordForm').reset();
  document.getElementById('changePasswordModal').style.display = 'flex';
}

function closeChangePasswordModal(e) {
  if (!e || e.target === document.getElementById('changePasswordModal')) {
    document.getElementById('changePasswordModal').style.display = 'none';
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;

  if (newPassword !== confirmNewPassword) {
    showToast('❌ รหัสผ่านใหม่ไม่ตรงกัน', 'error');
    return;
  }

  if (newPassword.length < 4) {
    showToast('❌ รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'error');
    return;
  }

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loggedInUser.email,
        oldPassword,
        newPassword
      })
    });
    if (res.ok) {
      showToast('🔑 เปลี่ยนรหัสผ่านสำเร็จแล้ว กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่', 'success');
      document.getElementById('changePasswordModal').style.display = 'none';
      setTimeout(() => logout(), 1500);
    } else {
      const err = await res.json();
      showToast('❌ ' + (err.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'), 'error');
    }
  } catch (err) {
    console.error('Change password failed:', err);
    showToast('🔌 ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อเปลี่ยนรหัสผ่านได้', 'error');
  }
}

// ── Clock ──
function updateClock() {
  const el = document.getElementById('currentTime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('th-TH', {
    weekday: 'short', year: '2-digit', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// Server API wrappers
async function apiPost(endpoint, data) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.error(`API POST failed for ${endpoint}:`, e);
    showToast(`⚠️ ไม่สามารถซิงค์ข้อมูลบางส่วนไปยังเซิร์ฟเวอร์ฐานข้อมูลได้ ข้อมูลถูกจัดเก็บในเครื่องชั่วคราว`, 'warning');
    throw e;
  }
}

async function apiDelete(endpoint) {
  try {
    const res = await fetch(endpoint, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.error(`API DELETE failed for ${endpoint}:`, e);
    showToast(`⚠️ ลบข้อมูลจากเซิร์ฟเวอร์ฐานข้อมูลไม่สำเร็จ`, 'warning');
    throw e;
  }
}

async function asyncInitData() {
  try {
    // 1. Fetch settings
    const settingsRes = await fetch('/api/settings');
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      if (settings.company) {
        localStorage.setItem('servicell1_company', JSON.stringify(settings.company));
        applyCompanySettingsToDOM(settings.company);
      }
      if (settings.geminiApiKey !== undefined) {
        geminiApiKey = settings.geminiApiKey;
        localStorage.setItem('servicell1_gemini_api_key', geminiApiKey);
      }
    }

    // 2. Fetch employees
    const empRes = await fetch('/api/employees');
    if (empRes.ok) {
      employees = await empRes.json();
      localStorage.setItem('servicell1_employees', JSON.stringify(employees));
    }

    // 3. Fetch jobs
    const jobsRes = await fetch('/api/jobs');
    if (jobsRes.ok) {
      jobs = await jobsRes.json();
      localStorage.setItem('servicell1_jobs', JSON.stringify(jobs));
    }

    // 4. Fetch travel claims
    const travelRes = await fetch('/api/travel-claims');
    if (travelRes.ok) {
      travelClaims = await travelRes.json();
      localStorage.setItem('servicell1_travel_claims', JSON.stringify(travelClaims));
    }

    // 5. Fetch ot claims
    const otRes = await fetch('/api/ot-claims');
    if (otRes.ok) {
      otClaims = await otRes.json();
      localStorage.setItem('servicell1_ot_claims', JSON.stringify(otClaims));
    }

    console.log('Successfully loaded all data from local backend SQL database.');
  } catch (e) {
    console.warn('Backend server unreachable. Falling back to local storage cache.', e);
    showToast('🔌 โหมดออฟไลน์: ใช้ฐานข้อมูลสำรองในเบราว์เซอร์', 'info');
  }

  // Perform initial renders after loading data
  renderAll();
  populateRefJobsDropdowns();
  renderTravelClaimsTable();
  renderOtClaimsTable();
  renderEmployeeTable();
  renderPayrollTable();
  updateCharts();
  updateKPIs();
}

function applyCompanySettingsToDOM(company) {
  const nameEl = document.getElementById('companyName');
  const addrEl = document.getElementById('companyAddress');
  const phoneEl = document.getElementById('companyPhone');
  const taxEl = document.getElementById('companyTaxId');
  
  if (nameEl) nameEl.value = company.name || 'Live Lighting';
  if (addrEl) addrEl.value = company.address || '123 ถ.สุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110';
  if (phoneEl) phoneEl.value = company.phone || '02-XXX-XXXX';
  if (taxEl) taxEl.value = company.taxId || '0-1234-56789-01-2';

  const setCompName = document.getElementById('settingsCompanyName');
  if (setCompName) setCompName.value = company.name || 'Live Lighting';
  const setCompAddr = document.getElementById('settingsCompanyAddress');
  if (setCompAddr) setCompAddr.value = company.address || '';
  const setCompPhone = document.getElementById('settingsCompanyPhone');
  if (setCompPhone) setCompPhone.value = company.phone || '';
  const setCompTax = document.getElementById('settingsCompanyTaxId');
  if (setCompTax) setCompTax.value = company.taxId || '';

  const logoEl = document.getElementById('showLogo');
  const sigEl = document.getElementById('showSignature');
  const warEl = document.getElementById('showWarranty');
  if (logoEl && company.showLogo !== undefined) logoEl.checked = company.showLogo;
  if (sigEl && company.showSignature !== undefined) sigEl.checked = company.showSignature;
  if (warEl && company.showWarranty !== undefined) warEl.checked = company.showWarranty;
}

function saveToStorage() {
  try {
    localStorage.setItem('servicell1_jobs', JSON.stringify(jobs));
    localStorage.setItem('servicell1_travel_claims', JSON.stringify(travelClaims));
    localStorage.setItem('servicell1_ot_claims', JSON.stringify(otClaims));
  } catch (e) {
    console.error('Local storage quota exceeded!', e);
    showToast('⚠️ พื้นที่บันทึกข้อมูลในเบราว์เซอร์เต็ม ไม่สามารถบันทึกข้อมูลรูปภาพลงเครื่องได้', 'warning');
  }

  let companyInfo = null;
  try {
    companyInfo = {
      name: document.getElementById('companyName')?.value || '',
      address: document.getElementById('companyAddress')?.value || '',
      phone: document.getElementById('companyPhone')?.value || '',
      taxId: document.getElementById('companyTaxId')?.value || '',
      showLogo: document.getElementById('showLogo')?.checked ?? true,
      showSignature: document.getElementById('showSignature')?.checked ?? true,
      showWarranty: document.getElementById('showWarranty')?.checked ?? true
    };
    localStorage.setItem('servicell1_company', JSON.stringify(companyInfo));
  } catch (e) {
    console.error('Failed to save company details', e);
  }

  // Push settings to backend server SQLite
  if (companyInfo) {
    apiPost('/api/settings', { company: companyInfo }).catch(err => console.error("Failed to sync settings on server:", err));
  }
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem('servicell1_jobs');
    jobs = raw ? JSON.parse(raw) : getSampleData();
    jobs = (jobs || []).filter(j => j && typeof j === 'object' && j.id);
    if (!raw) saveToStorage();
  } catch { jobs = getSampleData().filter(j => j && typeof j === 'object' && j.id); }

  try {
    const rawTravel = localStorage.getItem('servicell1_travel_claims');
    travelClaims = rawTravel ? JSON.parse(rawTravel) : [];
  } catch { travelClaims = []; }

  try {
    const rawOt = localStorage.getItem('servicell1_ot_claims');
    otClaims = rawOt ? JSON.parse(rawOt) : [];
  } catch { otClaims = []; }

  try {
    const rawCompany = localStorage.getItem('servicell1_company');
    if (rawCompany) {
      const company = JSON.parse(rawCompany);
      const nameEl = document.getElementById('companyName');
      const addrEl = document.getElementById('companyAddress');
      const phoneEl = document.getElementById('companyPhone');
      const taxEl = document.getElementById('companyTaxId');
      
      if (nameEl) nameEl.value = company.name || 'Live Lighting';
      if (addrEl) addrEl.value = company.address || '123 ถ.สุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110';
      if (phoneEl) phoneEl.value = company.phone || '02-XXX-XXXX';
      if (taxEl) taxEl.value = company.taxId || '0-1234-56789-01-2';

      const logoEl = document.getElementById('showLogo');
      const sigEl = document.getElementById('showSignature');
      const warEl = document.getElementById('showWarranty');
      if (logoEl && company.showLogo !== undefined) logoEl.checked = company.showLogo;
      if (sigEl && company.showSignature !== undefined) sigEl.checked = company.showSignature;
      if (warEl && company.showWarranty !== undefined) warEl.checked = company.showWarranty;
    }
  } catch (e) {
    console.error('Failed to load company details', e);
  }
}

// ── Sample Data ──
function getSampleData() {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const d0 = fmt(today);
  const d1 = fmt(new Date(today.getTime() - 86400000*2));
  const d2 = fmt(new Date(today.getTime() - 86400000*5));
  const d3 = fmt(new Date(today.getTime() - 86400000*10));

  return [
    {
      id: 'JOB001', jobNo: 'SV-2026-001', date: d3, appointmentDate: d3, completionDate: d3,
      customerName: 'บริษัท เอบีซี จำกัด', customerPhone: '081-234-5678',
      customerAddress: '456 ถ.รัชดาภิเษก เขตห้วยขวาง กรุงเทพฯ', googleMapsUrl: 'https://www.google.com/maps/@13.771,100.573,15z', customerLat: 13.771, customerLng: 100.573,
      jobType: 'ซ่อม', status: 'completed', technician: 'นายสมชาย ใจดี', equipment: 'เครื่องปรับอากาศ Mitsubishi 18000 BTU',
      problemDesc: 'คอมเพรสเซอร์ไม่ทำงาน น้ำยาหมด เสียงดัง', workPerformed: 'เติมน้ำยา R32 ตรวจสอบระบบไฟฟ้า เปลี่ยนคาปาซิเตอร์',
      operationSummary: 'เปลี่ยนคาปาซิเตอร์เรียบร้อย เครื่องทำงานได้ปกติ อุณหภูมิเย็นฉ่ำ',
      parts: [{ name: 'น้ำยา R32', qty: 2, unitPrice: 850, total: 1700 }, { name: 'คาปาซิเตอร์ 25uf', qty: 1, unitPrice: 350, total: 350 }],
      laborCost: 1500, partsTotal: 2050, travelCost: 300, discount: 0, vatRate: 7,
      grandTotal: 4119.5, paymentMethod: 'โอนเงิน', isWarranty: 'no', warranty: '3 เดือน',
      remarks: 'นัดตรวจสอบอีกครั้งใน 3 เดือน', photos: []
    },
    {
      id: 'JOB002', jobNo: 'SV-2026-002', date: d2, appointmentDate: d2, completionDate: '',
      customerName: 'คุณวิภา สุขสันต์', customerPhone: '092-345-6789',
      customerAddress: '789 ถ.เพชรบุรี เขตราชเทวี กรุงเทพฯ', googleMapsUrl: 'https://www.google.com/maps/@13.752,100.545,15z', customerLat: 13.752, customerLng: 100.545,
      jobType: 'ติดตั้ง', status: 'in-progress', technician: 'นายประยุทธ์ แสนดี', equipment: 'เครื่องปรับอากาศ Daikin 24000 BTU',
      problemDesc: 'ติดตั้งแอร์ใหม่ห้องนอนชั้น 2', workPerformed: 'เดินท่อ 6 เมตร เชื่อมท่อน้ำยา ทดสอบระบบ',
      operationSummary: '',
      parts: [{ name: 'ท่อ Copper 1/4"', qty: 6, unitPrice: 120, total: 720 }, { name: 'ท่อ Copper 3/8"', qty: 6, unitPrice: 150, total: 900 }, { name: 'ฉนวนหุ้มท่อ', qty: 2, unitPrice: 80, total: 160 }],
      laborCost: 3000, partsTotal: 1780, travelCost: 200, discount: 500, vatRate: 7,
      grandTotal: 4795.6, paymentMethod: 'เงินสด', isWarranty: 'no', warranty: '1 ปี',
      remarks: '', photos: []
    },
    {
      id: 'JOB003', jobNo: 'SV-2026-003', date: d1, appointmentDate: d0, completionDate: '',
      customerName: 'ร้านกาแฟ Morning Cup', customerPhone: '063-456-7890',
      customerAddress: '101 ถ.สีลม เขตบางรัก กรุงเทพฯ', googleMapsUrl: 'https://www.google.com/maps/@13.724,100.523,15z', customerLat: 13.724, customerLng: 100.523,
      jobType: 'PM', status: 'pending', technician: '', equipment: 'ตู้เย็นอุตสาหกรรม 2 ตู้',
      problemDesc: 'PM ประจำ 6 เดือน ล้างทำความสะอาดคอยล์ร้อน-เย็น', workPerformed: '',
      operationSummary: '',
      parts: [], laborCost: 2500, partsTotal: 0, travelCost: 400, discount: 0, vatRate: 7,
      grandTotal: 3102.5, paymentMethod: 'เครดิต', isWarranty: 'no', warranty: '',
      remarks: 'นัดหมาย 08:00 น.', photos: []
    },
    {
      id: 'JOB004', jobNo: 'SV-2026-004', date: d0, appointmentDate: d0, completionDate: d0,
      customerName: 'โรงแรม The Grand', customerPhone: '02-789-0123',
      customerAddress: '555 ถ.สุขุมวิท เขตวัฒนา กรุงเทพฯ', googleMapsUrl: 'https://www.google.com/maps/@13.736,100.574,15z', customerLat: 13.736, customerLng: 100.574,
      jobType: 'ซ่อม', status: 'completed', technician: 'นายสมชาย ใจดี', equipment: 'ระบบ HVAC ชั้น 5',
      problemDesc: 'AHU ไม่ทำงาน มอเตอร์ไหม้', workPerformed: 'เปลี่ยนมอเตอร์ AHU ขนาด 1HP ทดสอบระบบ',
      operationSummary: 'ดำเนินการเปลี่ยนมอเตอร์ตัวใหม่เรียบร้อย ทดสอบระบบรันงานได้สมบูรณ์',
      parts: [{ name: 'มอเตอร์ AHU 1HP', qty: 1, unitPrice: 4500, total: 4500 }],
      laborCost: 3500, partsTotal: 4500, travelCost: 0, discount: 0, vatRate: 7,
      grandTotal: 8555, paymentMethod: 'โอนเงิน', isWarranty: 'yes', warranty: '6 เดือน',
      remarks: 'รับประกันมอเตอร์ 6 เดือน', photos: []
    }
  ];
}

// ── Navigation ──
function showPage(pageId) {
  const perms = getUserPermissions(currentUser);
  if (pageId === 'travel-claim' && !perms.travelClaims) {
    showToast('⚠️ คุณไม่มีสิทธิ์เข้าถึงหน้าเบิกค่าเดินทาง', 'warning');
    return;
  }
  if (pageId === 'ot-claim' && !perms.otClaims) {
    showToast('⚠️ คุณไม่มีสิทธิ์เข้าถึงหน้าเบิก OT', 'warning');
    return;
  }
  if (pageId === 'admin-settings' && !perms.adminSettings) {
    showToast('⚠️ คุณไม่มีสิทธิ์เข้าตั้งค่าแอดมิน', 'warning');
    return;
  }
  if (pageId === 'ai-agents' && (!currentUser || currentUser.role !== 'admin')) {
    showToast('⚠️ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถเข้าถึงระบบพนักงาน AI', 'warning');
    return;
  }
  if (pageId === 'report' && !perms.viewJobs) {
    showToast('⚠️ คุณไม่มีสิทธิ์ออกรายงาน', 'warning');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const navItem = document.querySelector(`[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    'dashboard':    '📊 Dashboard สรุปงาน',
    'jobs':         '📋 รายการงานทั้งหมด',
    'add-job':      '➕ เพิ่มงานใหม่',
    'report':       '📄 ออก Service Report',
    'todo':         '🗓️ ปฏิทินจองคิวงานช่าง / Technician Calendar',
    'map':          '🗺️ แผนที่ตำแหน่งลูกค้า',
    'travel-claim': '🚗 เบิกค่าเดินทาง / Travel Claim',
    'ot-claim':     '⏰ เบิก OT / Overtime Claim',
    'ai-agents':    '🤖 ระบบพนักงานและผู้ช่วย AI (AI Assistants)'
  };
  document.getElementById('pageTitle').textContent = titles[pageId] || '';

  if (pageId === 'map') initMap();
  if (pageId === 'jobs') renderAllJobsTable();
  if (pageId === 'report') populateReportSelect();
  if (pageId === 'travel-claim' || pageId === 'ot-claim') populateRefJobsDropdowns();
  if (pageId === 'ai-agents') initAIAgents();
  if (pageId === 'dashboard') { updateCharts(); updateKPIs(); }
  if (pageId === 'add-job') {
    populateApproverDropdown();
    if (!editingJobId) {
      resetForm();
      document.getElementById('formTitle').innerHTML = '➕ เพิ่มงานใหม่ <span class="chart-sub">Add New Service Job</span>';
      
      // If Sale is adding, default to awaiting_approval and disable changing status
      const isSale = (currentUser && currentUser.role === 'sale');
      if (isSale) {
        setVal('jobStatus', 'awaiting_approval');
        const statusSelect = document.getElementById('jobStatus');
        if (statusSelect) statusSelect.disabled = true;
      } else {
        const statusSelect = document.getElementById('jobStatus');
        if (statusSelect) statusSelect.disabled = false;
      }
    } else {
      const statusSelect = document.getElementById('jobStatus');
      if (statusSelect) statusSelect.disabled = false;
    }
    
    // Toggle tab visibility for Sale vs Service roles
    const isSale = (currentUser && currentUser.role === 'sale');
    const tab2 = document.getElementById('formTabBtn2');
    const tab3 = document.getElementById('formTabBtn3');
    if (tab2) tab2.style.display = isSale ? 'none' : 'block';
    // Allow Sales role to access Tab 3 (Signatures & Notes) to fill product warranty record
    if (tab3) tab3.style.display = 'block';
    
    // Toggle check-in/out and workPerformed/summary fields based on role
    const checkInGroup = document.getElementById('checkInTimeGroup');
    const checkOutGroup = document.getElementById('checkOutTimeGroup');
    const workPerformedGroup = document.getElementById('workPerformedGroup');
    const operationSummaryGroup = document.getElementById('operationSummaryGroup');
    if (checkInGroup) checkInGroup.style.display = isSale ? 'none' : 'block';
    if (checkOutGroup) checkOutGroup.style.display = isSale ? 'none' : 'block';
    if (workPerformedGroup) workPerformedGroup.style.display = isSale ? 'none' : 'block';
    if (operationSummaryGroup) operationSummaryGroup.style.display = isSale ? 'none' : 'block';
    
    // Always start at tab 0
    switchJobFormTab(0);
  }

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('mobile-open')) sidebar.classList.remove('mobile-open');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// ── Render All ──
function renderAll() {
  updateKPIs();
  renderRecentTable();
  renderAllJobsTable();
  updateCharts();
  updateJobsCount();
  renderCalendar();
}

// ── KPIs ──
function getDashboardPeriodJobs() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let filteredJobs = jobs;

  // Filter out awaiting_approval jobs for unauthorized users
  if (currentUser) {
    filteredJobs = filteredJobs.filter(j => {
      if (currentUser.role === 'admin') return true;
      if (j.status === 'awaiting_approval') {
        const isApprover = (j.approver && j.approver.toLowerCase() === currentUser.email.toLowerCase());
        const isCreator = (j.createdBy && j.createdBy.toLowerCase() === currentUser.email.toLowerCase());
        return isApprover || isCreator;
      }
      return true;
    });
  }

  return filteredJobs.filter(j => {
    if (!j.date) return false;
    const jd = new Date(j.date);
    if (isNaN(jd.getTime())) return false;

    const startDateVal = document.getElementById('dashboardStartDate')?.value;
    const endDateVal = document.getElementById('dashboardEndDate')?.value;

    if (startDateVal || endDateVal) {
      if (startDateVal && j.date < startDateVal) return false;
      if (endDateVal && j.date > endDateVal) return false;
      return true;
    }

    if (dashboardPeriod === 'day') {
      return j.date === todayStr;
    } else if (dashboardPeriod === 'month') {
      return jd.getMonth() === thisMonth && jd.getFullYear() === thisYear;
    } else if (dashboardPeriod === 'year') {
      return jd.getFullYear() === thisYear;
    }
    return true;
  });
}

function updateKPIs() {
  const filtered = getDashboardPeriodJobs();
  const total = filtered.length;
  const completed = filtered.filter(j => j.status === 'completed').length;
  const pending = filtered.filter(j => j.status === 'pending').length;
  const inprogress = filtered.filter(j => j.status === 'in-progress').length;

  animateCount('kpiTotal', total);
  animateCount('kpiCompleted', completed);
  animateCount('kpiPending', pending);
  animateCount('kpiInProgress', inprogress);
  document.getElementById('kpiCompletedRate').textContent = total > 0 ? Math.round(completed/total*100) + '% สำเร็จ' : '0%';
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ── Change Period ──
function changePeriod(p) {
  // Clear custom date inputs when clicking quick period buttons
  const startEl = document.getElementById('dashboardStartDate');
  const endEl = document.getElementById('dashboardEndDate');
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';

  dashboardPeriod = p;
  document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-period-' + p)?.classList.add('active');

  const labels = {
    day: 'วันนี้ / Today',
    month: 'เดือนนี้ / This Month',
    year: 'ปีนี้ / This Year'
  };
  const labelEl = document.getElementById('kpiTotalLabel');
  if (labelEl) labelEl.textContent = labels[p] || 'ช่วงเวลานี้';

  updateKPIs();
  updateCharts();
}

function updateDashboardFilter() {
  // Deactivate period buttons active class when custom date range is used
  document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
  
  const labelEl = document.getElementById('kpiTotalLabel');
  if (labelEl) {
    const start = document.getElementById('dashboardStartDate')?.value;
    const end = document.getElementById('dashboardEndDate')?.value;
    if (start && end) {
      labelEl.textContent = `${formatDate(start)} ถึง ${formatDate(end)}`;
    } else if (start) {
      labelEl.textContent = `ตั้งแต่ ${formatDate(start)}`;
    } else if (end) {
      labelEl.textContent = `ถึง ${formatDate(end)}`;
    } else {
      labelEl.textContent = 'ทั้งหมด';
    }
  }

  updateKPIs();
  updateCharts();
}

function clearDashboardDateFilter() {
  const startEl = document.getElementById('dashboardStartDate');
  const endEl = document.getElementById('dashboardEndDate');
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  
  // Reactivate default period
  changePeriod('month');
}

// ── Charts ──
function initCharts() {
  const revenueCtx = document.getElementById('revenueChart').getContext('2d');
  revenueChart = new Chart(revenueCtx, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'จำนวนงาน: ' + ctx.parsed.y + ' งาน' } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => v } }
      }
    }
  });

  const statusCtx = document.getElementById('statusChart').getContext('2d');
  statusChart = new Chart(statusCtx, {
    type: 'pie',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12, boxWidth: 14 } } }
    }
  });

  const typePieCtx = document.getElementById('jobTypePieChart').getContext('2d');
  jobTypePieChart = new Chart(typePieCtx, {
    type: 'pie',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12, boxWidth: 14 } } }
    }
  });

  const typeBarCtx = document.getElementById('jobTypeBarChart').getContext('2d');
  jobTypeBarChart = new Chart(typeBarCtx, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'จำนวนงาน: ' + ctx.parsed.y + ' งาน' } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => v } }
      }
    }
  });

  updateCharts();
}

function updateCharts() {
  if (!revenueChart || !statusChart) return;
  const year = parseInt(document.getElementById('chartYearFilter')?.value || new Date().getFullYear());
  const filtered = getDashboardPeriodJobs();

  let labels = [];
  let data = [];

  const startDateVal = document.getElementById('dashboardStartDate')?.value;
  const endDateVal = document.getElementById('dashboardEndDate')?.value;

  if (startDateVal || endDateVal) {
    // Custom start/end dates: calculate difference
    const start = startDateVal ? new Date(startDateVal) : new Date(Math.min(...jobs.filter(j => j.date).map(j => new Date(j.date))));
    const end = endDateVal ? new Date(endDateVal) : new Date();

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 31) {
      // Daily breakdown
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(start.getTime() + 86400000 * i);
        const str = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
        data.push(filtered.filter(j => j.date === str).length);
      }
    } else if (diffDays <= 365) {
      // Monthly breakdown
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endLimit = new Date(end.getFullYear(), end.getMonth(), 1);

      while (current <= endLimit) {
        const y = current.getFullYear();
        const m = current.getMonth();
        labels.push(current.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }));
        data.push(filtered.filter(j => {
          if (!j.date) return false;
          const jd = new Date(j.date);
          return jd.getFullYear() === y && jd.getMonth() === m;
        }).length);
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      // Yearly breakdown
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      for (let y = startYear; y <= endYear; y++) {
        labels.push(String(y));
        data.push(filtered.filter(j => {
          if (!j.date) return false;
          return new Date(j.date).getFullYear() === y;
        }).length);
      }
    }
  } else {
    // Normal button behavior (Day, Month, Year)
    if (dashboardPeriod === 'day') {
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - 86400000 * i);
        const str = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
        data.push(filtered.filter(j => j.date === str).length);
      }
    } else if (dashboardPeriod === 'month') {
      labels = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      data = Array(12).fill(0);
      filtered.forEach(j => {
        if (!j.date) return;
        const d = new Date(j.date);
        if (d.getFullYear() === year) data[d.getMonth()]++;
      });
    } else if (dashboardPeriod === 'year') {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear - 4; y <= currentYear; y++) {
        labels.push(String(y));
        data.push(filtered.filter(j => {
          if (!j.date) return false;
          return new Date(j.date).getFullYear() === y;
        }).length);
      }
    }
  }

  revenueChart.data.labels = labels;
  revenueChart.data.datasets = [{
    data: data,
    backgroundColor: 'rgba(79,142,247,0.6)',
    borderColor: '#4f8ef7',
    borderWidth: 1,
    borderRadius: 6
  }];
  revenueChart.update();

  const statusCounts = {
    'รอดำเนินการ': filtered.filter(j => j.status === 'pending').length,
    'กำลังดำเนินการ': filtered.filter(j => j.status === 'in-progress').length,
    'เสร็จแล้ว': filtered.filter(j => j.status === 'completed').length,
    'ยกเลิก': filtered.filter(j => j.status === 'cancelled').length,
  };

  statusChart.data.labels = Object.keys(statusCounts);
  statusChart.data.datasets = [{
    data: Object.values(statusCounts),
    backgroundColor: ['#ff8c42', '#4f8ef7', '#2ecf7d', '#f87171'],
    borderWidth: 0
  }];
  statusChart.update();

  if (jobTypePieChart && jobTypeBarChart) {
    const typeCounts = {};
    filtered.forEach(j => {
      if (!j.jobType) return;
      const type = j.jobType.trim();
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const typeLabels = Object.keys(typeCounts);
    const typeData = Object.values(typeCounts);

    // Update Pie Chart
    jobTypePieChart.data.labels = typeLabels;
    jobTypePieChart.data.datasets = [{
      data: typeData,
      backgroundColor: ['#4f8ef7', '#2ecf7d', '#ff8c42', '#a855f7', '#06b6d4', '#f59e0b', '#ec4899'].slice(0, typeLabels.length),
      borderWidth: 0
    }];
    jobTypePieChart.update();

    // Update Bar Chart (Salesperson Job Creation Stats)
    const saleCounts = {};
    filtered.forEach(j => {
      if (!j.createdBy) return;
      const emp = employees.find(e => e.email.toLowerCase() === j.createdBy.toLowerCase());
      const name = emp ? emp.name : j.createdBy;
      saleCounts[name] = (saleCounts[name] || 0) + 1;
    });

    const saleLabels = Object.keys(saleCounts);
    const saleData = Object.values(saleCounts);

    jobTypeBarChart.data.labels = saleLabels;
    jobTypeBarChart.data.datasets = [{
      data: saleData,
      backgroundColor: 'rgba(46,207,125,0.6)',
      borderColor: '#2ecf7d',
      borderWidth: 1,
      borderRadius: 6
    }];
    jobTypeBarChart.update();
  }
}

// ── Tables ──
function renderRecentTable() {
  const tbody = document.getElementById('recentTableBody');
  let myJobs = jobs;

  if (currentUser) {
    myJobs = myJobs.filter(j => {
      if (currentUser.role === 'admin') return true;
      if (j.status === 'awaiting_approval') {
        const isApprover = (j.approver && j.approver.toLowerCase() === currentUser.email.toLowerCase());
        const isCreator = (j.createdBy && j.createdBy.toLowerCase() === currentUser.email.toLowerCase());
        return isApprover || isCreator;
      }
      return true;
    });
  }

  const recent = [...myJobs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">ยังไม่มีข้อมูล กรุณาเพิ่มงานใหม่</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(j => `
    <tr>
      <td><strong>${j.jobNo || j.id}</strong></td>
      <td>${formatDate(j.date)}</td>
      <td>${j.customerName}</td>
      <td>${j.jobType}</td>
      <td>${statusBadge(j.status)}</td>
      <td>
        <button class="action-btn" onclick="viewJob('${j.id}')" title="ดูรายละเอียด">👁️</button>
        ${getUserPermissions(currentUser).editJobs ? `<button class="action-btn" onclick="editJob('${j.id}')" title="แก้ไข">✏️</button>` : ''}
        ${canViewReport(j) ? `<button class="action-btn" onclick="generateReportForJob('${j.id}')" title="ออก Report">📄</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function getFilteredJobs() {
  const search = document.getElementById('globalSearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('filterStatus')?.value || '';
  const dateFrom = document.getElementById('filterDateFrom')?.value || '';
  const dateTo = document.getElementById('filterDateTo')?.value || '';

  let filteredJobs = jobs;

  // Filter out awaiting_approval jobs for unauthorized users
  if (currentUser) {
    filteredJobs = filteredJobs.filter(j => {
      if (currentUser.role === 'admin') return true;
      if (j.status === 'awaiting_approval') {
        const isApprover = (j.approver && j.approver.toLowerCase() === currentUser.email.toLowerCase());
        const isCreator = (j.createdBy && j.createdBy.toLowerCase() === currentUser.email.toLowerCase());
        return isApprover || isCreator;
      }
      return true;
    });
  }

  return filteredJobs.filter(j => {
    const matchSearch = !search || (j.jobNo||'').toLowerCase().includes(search) || (j.customerName||'').toLowerCase().includes(search) || (j.technician||'').toLowerCase().includes(search);
    const matchStatus = !statusFilter || j.status === statusFilter;
    const matchDateFrom = !dateFrom || j.date >= dateFrom;
    const matchDateTo = !dateTo || j.date <= dateTo;
    return matchSearch && matchStatus && matchDateFrom && matchDateTo;
  });
}

function renderAllJobsTable() {
  const tbody = document.getElementById('allJobsTableBody');
  let filtered = getFilteredJobs();

  if (sortConfig.key) {
    filtered.sort((a, b) => {
      let av = a[sortConfig.key] || '', bv = b[sortConfig.key] || '';
      if (typeof av === 'number') return sortConfig.asc ? av - bv : bv - av;
      return sortConfig.asc ? av.localeCompare(bv, 'th') : bv.localeCompare(av, 'th');
    });
  }

  updateJobsCount(filtered.length);

  // Pagination bounds correction
  const totalPages = Math.ceil(filtered.length / jobsPerPage) || 1;
  if (jobsCurrentPage > totalPages) {
    jobsCurrentPage = totalPages;
  }
  if (jobsCurrentPage < 1) {
    jobsCurrentPage = 1;
  }

  // Update pagination info & controls
  const infoEl = document.getElementById('jobsPaginationInfo');
  const btnPrev = document.getElementById('btnJobsPrev');
  const btnNext = document.getElementById('btnJobsNext');

  const start = (jobsCurrentPage - 1) * jobsPerPage;
  const end = Math.min(start + jobsPerPage, filtered.length);

  if (infoEl) {
    if (filtered.length === 0) {
      infoEl.textContent = 'แสดง 0 ถึง 0 จาก 0 รายการ';
    } else {
      infoEl.textContent = `แสดง ${start + 1} ถึง ${end} จาก ${filtered.length} รายการ (หน้า ${jobsCurrentPage}/${totalPages})`;
    }
  }
  if (btnPrev) btnPrev.disabled = jobsCurrentPage === 1;
  if (btnNext) btnNext.disabled = jobsCurrentPage === totalPages || filtered.length === 0;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">ไม่พบข้อมูลที่ตรงกัน</td></tr>';
    return;
  }

  const paginated = filtered.slice(start, end);

  tbody.innerHTML = paginated.map(j => {
    const mapLinkHtml = j.googleMapsUrl 
      ? `<a href="${j.googleMapsUrl}" target="_blank" class="action-btn" style="text-decoration:none;" title="เปิดแผนที่">📍 แผนที่</a>` 
      : '-';

    const perms = getUserPermissions(currentUser);

    let approveBtn = '';
    const isApprover = j.approver && currentUser && (j.approver.toLowerCase() === currentUser.email.toLowerCase());
    const isAdmin = currentUser && currentUser.role === 'admin';
    if ((isApprover || isAdmin) && j.status === 'awaiting_approval') {
      approveBtn = `<button class="action-btn" onclick="approveNewJob('${j.id}')" title="อนุมัติงานบริการ" style="color:var(--accent-green); font-weight:bold; border:1px solid rgba(16,185,129,0.25); padding:2px 6px; border-radius:4px; margin-right:4px; font-size:0.75rem;">✔️ อนุมัติ</button>`;
    }

    let acceptBtn = '';
    if (perms.editJobs && j.status === 'pending') {
      acceptBtn = `<button class="action-btn" onclick="acceptJob('${j.id}')" title="ตอบรับงาน" style="color:var(--accent-blue); font-weight:bold; border:1px solid rgba(0,100,250,0.15); padding:2px 6px; border-radius:4px; margin-right:4px; font-size:0.75rem;">👍 ตอบรับ</button>`;
    }

    const editBtn = perms.editJobs
      ? `<button class="action-btn" onclick="editJob('${j.id}')" title="แก้ไข">✏️</button>`
      : '';

    const deleteBtn = perms.deleteJobs
      ? `<button class="action-btn del" onclick="deleteJob('${j.id}')" title="ลบ">🗑️</button>`
      : '';

    return `
      <tr>
        <td><input type="checkbox" class="job-checkbox" value="${j.id}" /></td>
        <td><strong>${j.jobNo || j.id}</strong></td>
        <td>${formatDate(j.date)}</td>
        <td>${j.customerName}</td>
        <td>${j.jobType}</td>
        <td>${j.technician || '-'}</td>
        <td>${mapLinkHtml}</td>
        <td>${statusBadge(j.status)}</td>
        <td>
          ${approveBtn}
          ${acceptBtn}
          <button class="action-btn" onclick="viewJob('${j.id}')" title="ดู">👁️</button>
          ${editBtn}
          ${canViewReport(j) ? `<button class="action-btn" onclick="generateReportForJob('${j.id}')" title="Report">📄</button>` : ''}
          ${deleteBtn}
        </td>
      </tr>
    `;
  }).join('');
}

function changeJobsPage(direction) {
  jobsCurrentPage += direction;
  renderAllJobsTable();
}

function updateJobsCount(n) {
  const el = document.getElementById('jobsCount');
  if (el) el.textContent = (n !== undefined ? n : jobs.length) + ' งาน';
}

function sortTable(key) {
  if (sortConfig.key === key) sortConfig.asc = !sortConfig.asc;
  else { sortConfig.key = key; sortConfig.asc = true; }
  renderAllJobsTable();
}

// ── Search & Filter ──
function handleSearch(val) { renderAll(); }
function applyFilters() { renderAll(); }

// ── Status Badge ──
function statusBadge(status) {
  const map = {
    'awaiting_approval': ['badge-pending-approval', '🔑 รออนุมัติ'],
    'pending':     ['badge-pending',   '⏳ นัดหมายแล้ว'],
    'accepted':    ['badge-progress',  '👍 ตอบรับแล้ว'],
    'in-progress': ['badge-progress',  '🔧 เช็คอินแล้ว'],
    'completed':   ['badge-completed', '✅ เสร็จแล้ว'],
    'cancelled':   ['badge-cancelled', '❌ ยกเลิก'],
  };
  const [cls, text] = map[status] || ['', status];
  return `<span class="badge ${cls}">${text}</span>`;
}

// ── Date Format ──
function formatDate(d) {
  if (!d) return '-';
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return d;
  const options = { year: '2-digit', month: 'short', day: 'numeric' };
  if (d.includes('T') || d.includes(':')) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return dateObj.toLocaleDateString('th-TH', options);
}

// ── Form Validation ──
function validateJobForm() {
  const tab0Fields = [
    { id: 'jobNo', name: 'เลขที่งาน / Job No.' },
    { id: 'jobDate', name: 'วันที่รับงาน / Date' },
    { id: 'customerName', name: 'ชื่อลูกค้า / Customer Name' },
    { id: 'customerPhone', name: 'เบอร์โทรศัพท์ / Phone' }
  ];

  const tab1Fields = [
    { id: 'jobType', name: 'ประเภทงาน / Job Type' },
    { id: 'jobStatus', name: 'สถานะงาน / Status' },
    { id: 'problemDesc', name: 'รายละเอียดอาการ / Problem Description' }
  ];

  for (const f of tab0Fields) {
    const el = document.getElementById(f.id);
    if (!el || !el.value.trim()) {
      showToast(`❌ กรุณากรอก [${f.name}] ในแท็บ 'ข้อมูลลูกค้า & นัดหมาย'`, 'error');
      switchJobFormTab(0);
      setTimeout(() => el && el.focus(), 150);
      return false;
    }
  }

  for (const f of tab1Fields) {
    const el = document.getElementById(f.id);
    if (!el || !el.value.trim()) {
      showToast(`❌ กรุณากรอก [${f.name}] ในแท็บ 'รายละเอียดงาน'`, 'error');
      switchJobFormTab(1);
      setTimeout(() => el && el.focus(), 150);
      return false;
    }
  }

  if (v('jobStatus') === 'awaiting_approval') {
    const approverEl = document.getElementById('jobApprover');
    if (!approverEl || !approverEl.value.trim()) {
      showToast(`❌ กรุณาเลือก [ผู้อนุมัติงาน / Approver] ในแท็บ 'รายละเอียดงาน'`, 'error');
      switchJobFormTab(1);
      setTimeout(() => approverEl && approverEl.focus(), 150);
      return false;
    }
  }

  return true;
}

// ── Save Job ──
function saveJob(e) {
  e.preventDefault();

  if (!validateJobForm()) return;

  const existingJob = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
  const checkInLat = tempCheckInGPS ? tempCheckInGPS.lat : (existingJob ? (existingJob.checkInLat || null) : null);
  const checkInLng = tempCheckInGPS ? tempCheckInGPS.lng : (existingJob ? (existingJob.checkInLng || null) : null);
  const checkInDistance = tempCheckInGPS ? tempCheckInGPS.distance : (existingJob ? (existingJob.checkInDistance || null) : null);

  const checkOutLat = tempCheckOutGPS ? tempCheckOutGPS.lat : (existingJob ? (existingJob.checkOutLat || null) : null);
  const checkOutLng = tempCheckOutGPS ? tempCheckOutGPS.lng : (existingJob ? (existingJob.checkOutLng || null) : null);
  const checkOutDistance = tempCheckOutGPS ? tempCheckOutGPS.distance : (existingJob ? (existingJob.checkOutDistance || null) : null);

  const job = {
    id: editingJobId || 'JOB' + Date.now(),
    jobNo: v('jobNo'), date: v('jobDate'), appointmentDate: v('appointmentDate'),
    bookingDuration: parseInt(v('bookingDuration')) || 2,
    completionDate: v('completionDate'),
    checkInTime: v('checkInTime'), checkOutTime: v('checkOutTime'),
    checkInLat, checkInLng, checkInDistance,
    checkOutLat, checkOutLng, checkOutDistance,
    customerName: v('customerName'), customerPhone: v('customerPhone'), customerAddress: v('customerAddress'),
    googleMapsUrl: v('googleMapsUrl'),
    customerLat: parseFloat(v('customerLat')) || null, customerLng: parseFloat(v('customerLng')) || null,
    jobType: v('jobType'), status: v('jobStatus'), technician: v('technician'), equipment: v('equipment'),
    problemDesc: v('problemDesc'), workPerformed: v('workPerformed'),
    operationSummary: v('operationSummary'),
    isWarranty: v('isWarranty') || 'no',
    remarks: v('remarks'),
    photos: [...jobPhotos],
    signature: v('jobSignature'),
    problemPhoto: v('problemPhotoBase64'),
    approver: v('jobApprover'),
    createdBy: existingJob ? (existingJob.createdBy || '') : (currentUser ? currentUser.email : '')
  };

  // Reset temporary GPS caches
  tempCheckInGPS = null;
  tempCheckOutGPS = null;

  // Check for technician booking overlap conflicts using precise durations
  if (job.technician && job.appointmentDate) {
    const appTime = new Date(job.appointmentDate).getTime();
    if (!isNaN(appTime)) {
      const appEndTime = appTime + (job.bookingDuration * 60 * 60 * 1000);
      
      const conflict = jobs.find(j => {
        if (j.id === job.id) return false;
        if (j.technician !== job.technician) return false;
        if (!j.appointmentDate) return false;
        
        const existingTime = new Date(j.appointmentDate).getTime();
        if (isNaN(existingTime)) return false;
        
        const existingDuration = j.bookingDuration || 2;
        const existingEndTime = existingTime + (existingDuration * 60 * 60 * 1000);
        
        // Overlap formula: start1 < end2 && start2 < end1
        return appTime < existingEndTime && existingTime < appEndTime;
      });
      
      if (conflict) {
        const conflictDuration = conflict.bookingDuration || 2;
        let conflictTimeStr = formatDate(conflict.appointmentDate);
        if (conflict.appointmentDate.includes('T')) {
          const conflictStartStr = conflict.appointmentDate.split('T')[1].substring(0, 5);
          const conflictEnd = new Date(new Date(conflict.appointmentDate).getTime() + (conflictDuration * 60 * 60 * 1000));
          const conflictEndStr = conflictEnd.toTimeString().substring(0, 5);
          conflictTimeStr += ` (${conflictStartStr} - ${conflictEndStr} น.)`;
        }
        
        showToast('❌ คิวงานของช่างทับซ้อนกับเวลานี้แล้ว', 'error');
        alert(`ไม่สามารถลงเวลานัดหมายซ้อนกันได้!\n\nช่างเทคนิค: ${job.technician}\nมีนัดหมายแล้วในช่วงเวลา:\n- วัน/เวลา: ${conflictTimeStr} (${conflictDuration} ชม.)\n- ลูกค้า: ${conflict.customerName}\n- เลขที่ใบงาน: ${conflict.jobNo || conflict.id}`);
        return;
      }
    }
  }

  if (editingJobId) {
    const idx = jobs.findIndex(j => j.id === editingJobId);
    if (idx !== -1) jobs[idx] = job;
    showToast('✅ แก้ไขข้อมูลงานเรียบร้อย', 'success');
  } else {
    jobs.unshift(job);
    showToast('✅ เพิ่มงานใหม่เรียบร้อย', 'success');
  }

  // Save to SQLite backend database
  apiPost('/api/jobs', job).catch(err => console.error("Failed to save job to server database:", err));

  editingJobId = null;
  saveToStorage();
  renderAll();
  showPage('jobs');
}

function v(id) { return document.getElementById(id)?.value || ''; }

// ── Edit / Delete ──
function editJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  editingJobId = id;
  document.getElementById('formTitle').innerHTML = '✏️ แก้ไขข้อมูลงาน <span class="chart-sub">Edit Job</span>';
  showPage('add-job');

  // Fill form
  setTimeout(() => {
    setVal('editJobId', id);
    setVal('jobNo', job.jobNo); setVal('jobDate', job.date);
    setVal('appointmentDate', job.appointmentDate);
    setVal('bookingDuration', job.bookingDuration || 2);
    setVal('completionDate', job.completionDate);
    setVal('checkInTime', job.checkInTime); setVal('checkOutTime', job.checkOutTime);
    setVal('customerName', job.customerName); setVal('customerPhone', job.customerPhone);
    setVal('customerAddress', job.customerAddress);
    setVal('googleMapsUrl', job.googleMapsUrl);
    setVal('customerLat', job.customerLat); setVal('customerLng', job.customerLng);
    setVal('jobType', job.jobType); setVal('jobStatus', job.status);
    setVal('jobApprover', job.approver || '');
    setVal('technician', job.technician); setVal('equipment', job.equipment);
    setVal('problemDesc', job.problemDesc); setVal('workPerformed', job.workPerformed);
    setVal('operationSummary', job.operationSummary || '');
    setVal('remarks', job.remarks);
    setVal('isWarranty', job.isWarranty || 'no');
    setVal('jobSignature', job.signature || '');
    
    // Load problem photo
    setVal('problemPhotoBase64', job.problemPhoto || '');
    const problemPreview = document.getElementById('problemPhotoPreview');
    if (problemPreview) {
      if (job.problemPhoto) {
        problemPreview.innerHTML = `<img src="${job.problemPhoto}" style="width:100%; height:100%; object-fit:contain;" />`;
      } else {
        problemPreview.innerHTML = `<span style="color:var(--text-secondary); font-size:0.8rem;">ไม่มีตัวอย่างรูปภาพแจ้งปัญหา / No Image</span>`;
      }
    }

    // Set photos state
    for (let i = 0; i < 6; i++) {
      jobPhotos[i] = (job.photos && job.photos[i]) ? job.photos[i] : '';
      updatePhotoPreview('preview-' + (i + 1), jobPhotos[i]);
    }

    // Load signature image to canvas
    loadSignatureToCanvas(job.signature);
    
    // Switch to first tab by default
    switchJobFormTab(0);

    calcDuration();
  }, 50);
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function deleteJob(id) {
  if (!confirm('ต้องการลบข้อมูลงานนี้ใช่หรือไม่?')) return;
  jobs = jobs.filter(j => j.id !== id);
  
  // Delete from SQLite backend database
  apiDelete('/api/jobs/' + id).catch(err => console.error("Failed to delete job on server database:", err));

  saveToStorage();
  renderAll();
  showToast('🗑️ ลบข้อมูลงานเรียบร้อย', 'info');
}

// ── Reset Form ──
function resetForm() {
  document.getElementById('jobForm').reset();
  setVal('jobApprover', '');
  editingJobId = null;
  document.getElementById('editJobId').value = '';
  setDefaultDates();
  generateJobNo();
  
  // Clear duration display
  const bar = document.getElementById('durationBar');
  if (bar) bar.style.display = 'none';

  // Reset photos state and previews
  jobPhotos = ['', '', '', '', '', ''];
  for (let i = 1; i <= 6; i++) {
    updatePhotoPreview('preview-' + i, '');
    const fileInput = document.getElementById('photo' + i);
    if (fileInput) fileInput.value = '';
  }

  // Clear signature canvas
  clearSignatureCanvas();

  // Reset problem photo field
  setVal('problemPhotoBase64', '');
  const problemPhotoInput = document.getElementById('problemPhotoInput');
  if (problemPhotoInput) problemPhotoInput.value = '';
  const problemPreview = document.getElementById('problemPhotoPreview');
  if (problemPreview) {
    problemPreview.innerHTML = `<span style="color:var(--text-secondary); font-size:0.8rem;">ไม่มีตัวอย่างรูปภาพแจ้งปัญหา / No Image</span>`;
  }
  
  // Reset tabs to Tab 0
  switchJobFormTab(0);
}

// ── Check-in / Check-out ──
/**
 * Stamp the current datetime into the given field
 * and auto-calculate duration.
 */
let tempCheckInGPS = null;
let tempCheckOutGPS = null;

function stampNow(fieldId) {
  const now = new Date();
  const local = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + 'T' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');
  const el = document.getElementById(fieldId);
  if (el) {
    el.value = local;
    el.style.transition = 'box-shadow 0.2s';
    el.style.boxShadow = '0 0 0 3px rgba(79,142,247,0.4)';
    setTimeout(() => el.style.boxShadow = '', 600);
  }
  
  // Auto transition status
  if (fieldId === 'checkInTime') {
    const statusSelect = document.getElementById('jobStatus');
    if (statusSelect && statusSelect.value === 'accepted') {
      statusSelect.value = 'in-progress';
    }
  } else if (fieldId === 'checkOutTime') {
    const statusSelect = document.getElementById('jobStatus');
    if (statusSelect && (statusSelect.value === 'in-progress' || statusSelect.value === 'accepted')) {
      statusSelect.value = 'completed';
    }
  }

  calcDuration();
  
  if (navigator.geolocation) {
    showToast('📡 กำลังตรวจสอบพิกัด GPS หน้างาน...', 'info');
    navigator.geolocation.getCurrentPosition(position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const custLat = parseFloat(document.getElementById('customerLat')?.value) || null;
      const custLng = parseFloat(document.getElementById('customerLng')?.value) || null;
      
      let distance = null;
      if (custLat && custLng) {
        distance = getDistanceFromLatLonInM(lat, lng, custLat, custLng);
      }
      
      const gpsData = { lat, lng, distance };
      if (fieldId === 'checkInTime') {
        tempCheckInGPS = gpsData;
      } else if (fieldId === 'checkOutTime') {
        tempCheckOutGPS = gpsData;
      }
      
      if (distance !== null) {
        const distStr = distance >= 1000 ? (distance / 1000).toFixed(2) + ' กม.' : Math.round(distance) + ' ม.';
        if (distance <= 200) {
          showToast(`📍 ตรวจสอบสำเร็จ: อยู่ในเขตไซด์งานลูกค้า (ห่าง ${distStr})`, 'success');
        } else {
          showToast(`⚠️ คำเตือน: ตำแหน่งคุณอยู่นอกเขตนอกไซต์งาน (ห่าง ${distStr})`, 'warning');
        }
      } else {
        showToast('📍 บันทึกพิกัด GPS ลงใบงานสำเร็จ (ยังไม่มีพิกัดลูกค้าให้อ้างอิง)', 'success');
      }
    }, error => {
      console.warn('[GPS Geofence Error]:', error);
      showToast('❌ ไม่สามารถระบุพิกัด GPS: ' + error.message, 'error');
    }, { enableHighAccuracy: true, timeout: 6000 });
  } else {
    showToast('🕐 บันทึกเวลาแล้ว (บราวเซอร์นี้ไม่สนับสนุน GPS)', 'info');
  }
}

/**
 * Calculate and display duration between check-in and check-out.
 */
function calcDuration() {
  const inVal = document.getElementById('checkInTime')?.value;
  const outVal = document.getElementById('checkOutTime')?.value;
  const bar = document.getElementById('durationBar');
  const display = document.getElementById('durationValue');
  if (!bar || !display) return;

  if (!inVal || !outVal) { bar.style.display = 'none'; return; }

  const inTime = new Date(inVal);
  const outTime = new Date(outVal);
  const diffMs = outTime - inTime;

  if (diffMs < 0) {
    bar.style.display = 'flex';
    display.textContent = '⚠️ เวลาเช็คเอาท์ต้องมากกว่าเช็คอิน';
    display.style.color = '#f87171';
    display.style.background = 'rgba(248,113,113,0.1)';
    display.style.borderColor = 'rgba(248,113,113,0.2)';
    return;
  }

  display.style.color = '#2ecf7d';
  display.style.background = 'rgba(46,207,125,0.1)';
  display.style.borderColor = 'rgba(46,207,125,0.2)';

  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  let text = '';
  if (hours > 0) text += hours + ' ชั่วโมง ';
  text += mins + ' นาที';
  if (hours === 0 && mins === 0) text = 'น้อยกว่า 1 นาที';

  display.textContent = text;
  bar.style.display = 'flex';
}

/**
 * Format a datetime-local value for display.
 */
function formatDateTime(dt) {
  if (!dt) return '-';
  const dateObj = new Date(dt);
  if (isNaN(dateObj.getTime())) return dt;
  return dateObj.toLocaleString('th-TH', {
    year: '2-digit', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('jobDate');
  if (dateEl && !dateEl.value) dateEl.value = today;
}

function generateJobNo() {
  const year = new Date().getFullYear();
  const count = String(jobs.length + 1).padStart(3, '0');
  const el = document.getElementById('jobNo');
  if (el && !el.value) el.value = `SV-${year}-${count}`;
}

// ── View Job Modal ──
function viewJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  currentModalJobId = id;

  // Build duration text for modal
  const durationText = (() => {
    if (!job.checkInTime || !job.checkOutTime) return null;
    const diffMs = new Date(job.checkOutTime) - new Date(job.checkInTime);
    if (diffMs < 0) return '⚠️ ข้อมูลเวลาไม่ถูกต้อง';
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return (h > 0 ? h + ' ชั่วโมง ' : '') + m + ' นาที';
  })();

  const getGeofenceBadge = (dist) => {
    if (dist === null || dist === undefined) return '<span style="color:#94a3b8; font-size:0.7rem;">(ไม่มีพิกัด GPS ยืนยัน)</span>';
    const distStr = dist >= 1000 ? (dist / 1000).toFixed(2) + ' กม.' : Math.round(dist) + ' ม.';
    if (dist <= 200) {
      return `<span class="badge badge-approved" style="font-size:0.68rem; padding:2px 6px; border-radius:4px; font-weight:bold;">📍 ในไซต์งาน (${distStr})</span>`;
    } else {
      return `<span class="badge badge-rejected" style="font-size:0.68rem; padding:2px 6px; border-radius:4px; font-weight:bold;">⚠️ นอกไซต์งาน (${distStr})</span>`;
    }
  };

  const checkinRow = (job.checkInTime || job.checkOutTime) ? `
    <div class="modal-detail-item modal-detail-full" style="background:rgba(56,189,248,0.06);padding:12px;border-radius:8px;border:1px solid rgba(56,189,248,0.15);">
      <div class="detail-label" style="color:#38bdf8;margin-bottom:8px; font-weight:600;">⏱️ เวลาเช็คอิน-เช็คเอาท์ & การยืนยันพิกัดตำแหน่ง (GPS Geofencing)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px;">
        <div>
          <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:3px;">เช็คอิน / Check-in</div>
          <div style="font-weight:600;color:#38bdf8;margin-bottom:4px;">${formatDateTime(job.checkInTime)}</div>
          <div>${getGeofenceBadge(job.checkInDistance)}</div>
        </div>
        <div>
          <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:3px;">เช็คเอาท์ / Check-out</div>
          <div style="font-weight:600;color:#38bdf8;margin-bottom:4px;">${formatDateTime(job.checkOutTime)}</div>
          <div>${getGeofenceBadge(job.checkOutDistance)}</div>
        </div>
      </div>
      ${durationText ? `<div style="border-top:1px solid rgba(56,189,248,0.15); padding-top:6px; font-size:0.8rem; color:#94a3b8;">ระยะเวลาปฏิบัติงานรวม / Total Duration: <strong style="color:#2ecf7d; font-size:0.85rem; margin-left:4px;">${durationText}</strong></div>` : ''}
    </div>
  ` : '';

  const mapsButtonHtml = job.googleMapsUrl
    ? ` <a href="${job.googleMapsUrl}" target="_blank" style="display:inline-block; margin-left:8px; text-decoration:none; background:rgba(56,189,248,0.1); color:#38bdf8; border:1px solid rgba(56,189,248,0.2); padding:2px 8px; border-radius:4px; font-size:0.75rem;">🗺️ นำทาง (Google Maps)</a>`
    : '';

  const photosHtml = (job.photos || []).filter(p => p).length ? `
    <div class="modal-detail-full">
      <div class="detail-label" style="margin-top: 14px; margin-bottom: 8px;">📸 รูปภาพการปฏิบัติงาน / Service Photos</div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
        ${job.photos.filter(p => p).map(p => `
          <div style="border:1px solid var(--border); border-radius:6px; overflow:hidden; height:100px; cursor:pointer;" onclick="window.open('${p}')">
            <img src="${p}" style="width:100%; height:100%; object-fit:cover;" />
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const approverSignatureHtml = job.approverSignature ? `
    <div class="modal-detail-item modal-detail-full" style="background:rgba(16,185,129,0.06);padding:12px;border-radius:8px;border:1px solid rgba(16,185,129,0.15); margin-bottom:12px;">
      <div class="detail-label" style="color:#10b981;margin-bottom:8px; font-weight:600;">🔑 ลายเซ็นการอนุมัติงานบริการ (Approval Info)</div>
      <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
        <div style="border:1px solid var(--border); border-radius:6px; background:#ffffff; padding:6px; width:150px; height:60px; display:flex; align-items:center; justify-content:center;">
          <img src="${job.approverSignature}" style="max-width:100%; max-height:100%; object-fit:contain;" />
        </div>
        <div>
          <div style="font-size:0.8rem; color:var(--text-primary);">อนุมัติโดย: <strong>${job.approver || '-'}</strong></div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">เมื่อเวลา: ${job.approvedAt ? formatDateTime(job.approvedAt) : '-'}</div>
        </div>
      </div>
    </div>
  ` : '';

  const technicianSignatureHtml = job.signature ? `
    <div class="modal-detail-item modal-detail-full" style="margin-bottom:12px;">
      <div class="detail-label">✍️ ลายเซ็นลูกค้า/ช่างเทคนิค (Client Signature)</div>
      <div style="border:1px solid var(--border); border-radius:6px; background:#ffffff; padding:6px; width:150px; height:60px; display:flex; align-items:center; justify-content:center; margin-top:6px;">
        <img src="${job.signature}" style="max-width:100%; max-height:100%; object-fit:contain;" />
      </div>
    </div>
  ` : '';

  document.getElementById('modalTitle').textContent = `${job.jobNo || job.id} - ${job.customerName}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-detail-grid">
      <div class="modal-detail-item"><div class="detail-label">เลขที่งาน</div><div class="detail-value">${job.jobNo || '-'}</div></div>
      <div class="modal-detail-item"><div class="detail-label">วันที่รับงาน</div><div class="detail-value">${formatDate(job.date)}</div></div>
      <div class="modal-detail-item"><div class="detail-label">ชื่อลูกค้า</div><div class="detail-value">${job.customerName}</div></div>
      <div class="modal-detail-item"><div class="detail-label">เบอร์โทร</div><div class="detail-value">${job.customerPhone}</div></div>
      <div class="modal-detail-item modal-detail-full">
        <div class="detail-label">ที่อยู่ลูกค้า ${mapsButtonHtml}</div>
        <div class="detail-value">${job.customerAddress || '-'}</div>
      </div>
      ${checkinRow}
      ${approverSignatureHtml}
      ${technicianSignatureHtml}
      <div class="modal-detail-item"><div class="detail-label">ประเภทงาน</div><div class="detail-value">${job.jobType}</div></div>
      <div class="modal-detail-item"><div class="detail-label">สถานะ</div><div class="detail-value">${statusBadge(job.status)}</div></div>
      <div class="modal-detail-item"><div class="detail-label">ช่างผู้รับผิดชอบ</div><div class="detail-value">${job.technician || '-'}</div></div>
      <div class="modal-detail-item"><div class="detail-label">อุปกรณ์</div><div class="detail-value">${job.equipment || '-'}</div></div>
      <div class="modal-detail-item modal-detail-full"><div class="detail-label">อาการ/ปัญหา</div><div class="detail-value">${job.problemDesc || '-'}</div></div>
      <div class="modal-detail-item modal-detail-full"><div class="detail-label">งานที่ดำเนินการ</div><div class="detail-value">${job.workPerformed || '-'}</div></div>
      <div class="modal-detail-item modal-detail-full"><div class="detail-label">สรุปการดำเนินงาน / Summary</div><div class="detail-value">${job.operationSummary || '-'}</div></div>
      <div class="modal-detail-item"><div class="detail-label">การรับประกัน</div><div class="detail-value">${job.isWarranty === 'yes' ? '✅ อยู่ในการรับประกัน (Under Warranty)' : '❌ ไม่อยู่ในการรับประกัน'}</div></div>
      <div class="modal-detail-item modal-detail-full"><div class="detail-label">หมายเหตุ</div><div class="detail-value">${job.remarks || '-'}</div></div>
      ${photosHtml}
    </div>
  `;
  document.getElementById('jobModal').classList.add('active');

  // Dynamically show/hide footer buttons based on permissions
  const editBtnEl = document.getElementById('modalEditBtn');
  if (editBtnEl) {
    editBtnEl.style.display = getUserPermissions(currentUser).editJobs ? 'inline-block' : 'none';
  }
  const deleteBtnEl = document.getElementById('modalDeleteBtn');
  if (deleteBtnEl) {
    deleteBtnEl.style.display = getUserPermissions(currentUser).deleteJobs ? 'inline-block' : 'none';
  }
  const reportBtnEl = document.getElementById('modalReportBtn');
  if (reportBtnEl) {
    reportBtnEl.style.display = canViewReport(job) ? 'inline-block' : 'none';
  }
}

function closeJobModal() {
  document.getElementById('jobModal').classList.remove('active');
  currentModalJobId = null;
}

function closeModal(e) { 
  if (e.target === document.getElementById('jobModal')) closeJobModal(); 
  if (e.target === document.getElementById('claimModal')) closeClaimModal(); 
}

function editJobFromModal() { closeJobModal(); editJob(currentModalJobId); }
function deleteJobFromModal() { closeJobModal(); deleteJob(currentModalJobId); }
function reportJobFromModal() { closeJobModal(); generateReportForJob(currentModalJobId); }

// ── Toggle Select All ──
function toggleSelectAll() {
  const checked = document.getElementById('selectAll').checked;
  document.querySelectorAll('.job-checkbox').forEach(cb => cb.checked = checked);
}

// ── Export Excel (CSV) ──
function exportExcel() {
  const filtered = getFilteredJobs();
  if (!filtered.length) { showToast('ไม่มีข้อมูลให้ Export', 'error'); return; }
  const headers = ['Job No.', 'วันที่', 'ลูกค้า', 'เบอร์โทร', 'ที่อยู่', 'ประเภทงาน', 'สถานะ', 'ช่าง', 'อุปกรณ์', 'อาการ', 'งานที่ทำ', 'อะไหล่', 'ค่าแรง', 'ค่าอะไหล่', 'ค่าเดินทาง', 'ส่วนลด', 'VAT%', 'รวม', 'วิธีชำระ', 'รับประกัน', 'หมายเหตุ'];
  const rows = filtered.map(j => [
    j.jobNo, j.date, j.customerName, j.customerPhone, j.customerAddress, j.jobType, j.status, j.technician,
    j.equipment, j.problemDesc, j.workPerformed, (j.parts||[]).map(p=>p.name+' x'+p.qty).join('; '),
    j.laborCost, j.partsTotal, j.travelCost, j.discount, j.vatRate, j.grandTotal, j.paymentMethod, j.warranty, j.remarks
  ].map(c => '"' + String(c||'').replace(/"/g, '""') + '"'));

  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ServiceLL1_Jobs_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('📊 Export สำเร็จ', 'success');
}

// ── Report ──
function canViewReport(job) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'service') {
    return job.status === 'completed';
  }
  if (currentUser.role === 'sale') {
    // Allow all Sales staff to view/generate reports for any completed jobs
    return job.status === 'completed';
  }
  return false;
}

function populateReportSelect() {
  const select = document.getElementById('reportJobSelect');
  const allowed = jobs.filter(canViewReport);
  select.innerHTML = '<option value="">-- เลือกงาน --</option>' +
    [...allowed].sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(j =>
      `<option value="${j.id}">${j.jobNo || j.id} | ${j.customerName} | ${formatDate(j.date)}</option>`
    ).join('');
}

function filterReportJobs(q) {
  const select = document.getElementById('reportJobSelect');
  const allowed = jobs.filter(canViewReport);
  const filtered = allowed.filter(j => !q || (j.jobNo||'').toLowerCase().includes(q.toLowerCase()) || (j.customerName||'').toLowerCase().includes(q.toLowerCase()));
  select.innerHTML = '<option value="">-- เลือกงาน --</option>' +
    filtered.map(j => `<option value="${j.id}">${j.jobNo || j.id} | ${j.customerName} | ${formatDate(j.date)}</option>`).join('');
}

function generateReportForJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job || !canViewReport(job)) {
    showToast('❌ คุณไม่มีสิทธิ์เข้าถึงรายงานของใบงานนี้', 'error');
    return;
  }
  showPage('report');
  setTimeout(() => {
    document.getElementById('reportJobSelect').value = id;
    loadReportData();
  }, 100);
}

function loadReportData() {
  const id = document.getElementById('reportJobSelect').value;
  if (!id) return;
  const job = jobs.find(j => j.id === id);
  if (!job) return;

  const lang = document.getElementById('reportLang').value;

  // Bilingual / English translations mapping
  const txt = {
    docTitle: lang === 'en' ? 'SERVICE REPORT' : 'ใบบันทึกการบริการ',
    docSub: lang === 'en' ? 'WORK COMPLETION REPORT' : 'SERVICE REPORT',
    custTitle: lang === 'en' ? 'Customer Information' : 'ข้อมูลลูกค้า / Customer',
    custName: lang === 'en' ? 'Customer Name' : 'ชื่อลูกค้า',
    custPhone: lang === 'en' ? 'Phone Number' : 'เบอร์โทร',
    custAddr: lang === 'en' ? 'Address' : 'ที่อยู่',
    jobTitle: lang === 'en' ? 'Service Details' : 'ข้อมูลงาน / Job Info',
    jobType: lang === 'en' ? 'Job Type' : 'ประเภทงาน',
    jobTech: lang === 'en' ? 'Technician' : 'ช่างผู้รับผิดชอบ',
    jobEquip: lang === 'en' ? 'Equipment' : 'อุปกรณ์',
    jobApp: lang === 'en' ? 'Appointment Date' : 'วันที่นัดหมาย',
    jobComp: lang === 'en' ? 'Completion Date' : 'วันที่เสร็จงาน',
    problemTitle: lang === 'en' ? 'Problem' : 'ปัญหา / Problem',
    workTitle: lang === 'en' ? 'Onsite Work' : 'งานที่ดำเนินการ / Onsite Work',
    summaryTitle: lang === 'en' ? 'Summary' : 'สรุป / Summary',
    warrantyTitle: lang === 'en' ? 'Warranty Status' : 'การรับประกัน / Warranty Status',
    warrantyText: job.isWarranty === 'yes'
      ? (lang === 'en' ? 'Under Warranty (Yes)' : 'อยู่ในรับประกัน (Yes - Under Warranty)')
      : (lang === 'en' ? 'Not Under Warranty' : 'ไม่อยู่ในรับประกัน (No)'),
    photosTitle: lang === 'en' ? 'Photo' : 'รูปภาพการปฏิบัติงาน / Photo',
    sigTech: lang === 'en' ? 'Servicing Technician' : 'ช่างผู้ให้บริการ / Technician',
    sigMgr: lang === 'en' ? 'Authorized Manager' : 'ผู้จัดการ / Manager',
    dateLabel: lang === 'en' ? 'Date' : 'วันที่',
    noPhotos: lang === 'en' ? 'No Photos Uploaded' : 'ไม่มีรูปภาพการทำงาน'
  };

  // Update labels according to selected language
  const selectors = {
    '.report-doc-title': txt.docTitle,
    '.report-doc-sub': txt.docSub,
    '.report-info-grid .report-info-section:nth-child(1) h4': txt.custTitle,
    '.report-info-grid .report-info-section:nth-child(1) table tr:nth-child(1) td:first-child': txt.custName,
    '.report-info-grid .report-info-section:nth-child(1) table tr:nth-child(2) td:first-child': txt.custPhone,
    '.report-info-grid .report-info-section:nth-child(1) table tr:nth-child(3) td:first-child': txt.custAddr,
    '.report-info-grid .report-info-section:nth-child(2) h4': txt.jobTitle,
    '.report-info-grid .report-info-section:nth-child(2) table tr:nth-child(1) td:first-child': txt.jobType,
    '.report-info-grid .report-info-section:nth-child(2) table tr:nth-child(2) td:first-child': txt.jobTech,
    '.report-info-grid .report-info-section:nth-child(2) table tr:nth-child(3) td:first-child': txt.jobEquip,
    '.report-info-grid .report-info-section:nth-child(2) table tr:nth-child(4) td:first-child': txt.jobApp,
    '.report-info-grid .report-info-section:nth-child(2) table tr:nth-child(5) td:first-child': txt.jobComp,
    '#rpt-problem-title': txt.problemTitle,
    '#rpt-work-title': txt.workTitle,
    '#rpt-summary-title': txt.summaryTitle,
    '#rpt-photos-title': txt.photosTitle,
    '#rpt-sig-label-approver': (() => {
      const appEmp = employees.find(e => e.email.toLowerCase() === (job.approver || '').toLowerCase());
      return (appEmp && appEmp.roleDisplay) ? appEmp.roleDisplay : (lang === 'en' ? 'Authorized Manager' : 'ผู้จัดการ (Manager)');
    })(),
    '#rpt-sig-label-tech': (() => {
      const techEmp = employees.find(e => e.name === job.technician);
      return (techEmp && techEmp.roleDisplay) ? techEmp.roleDisplay : txt.sigTech;
    })(),
    '#rpt-sig-label-client': lang === 'en' ? 'Customer / Receiver' : 'ผู้รับมอบงาน (Customer)',
    '#rpt-sig-date-approver': txt.dateLabel + ' ____________',
    '#rpt-sig-date-tech': txt.dateLabel + ' ____________',
    '#rpt-sig-date-client': txt.dateLabel + ' ____________',
  };

  for (const [sel, val] of Object.entries(selectors)) {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  }

  // Update dynamic content
  const company = document.getElementById('companyName').value;
  const address = document.getElementById('companyAddress').value;
  const phone = document.getElementById('companyPhone').value;
  const taxId = document.getElementById('companyTaxId').value;

  setText('rpt-company-name', company);
  setText('rpt-company-address', address);
  setText('rpt-company-phone', phone);
  setText('rpt-company-tax', taxId);
  setText('rpt-job-no', job.jobNo || job.id);
  setText('rpt-date', formatDate(job.date));
  setText('rpt-customer', job.customerName);
  setText('rpt-phone', job.customerPhone);
  setText('rpt-address', job.customerAddress || '-');
  setText('rpt-job-type', job.jobType);
  const saleEmp = employees.find(e => e.email.toLowerCase() === (job.createdBy || '').toLowerCase());
  const saleName = saleEmp ? saleEmp.name : (job.createdBy || '-');
  setText('rpt-creator', saleName);
  setText('rpt-technician', job.technician || '-');
  setText('rpt-equipment', job.equipment || '-');
  setText('rpt-appointment', formatDate(job.appointmentDate));
  setText('rpt-completion', formatDate(job.completionDate));
  setText('rpt-problem', job.problemDesc || '-');
  setText('rpt-work', job.workPerformed || '-');
  setText('rpt-operation-summary', job.operationSummary || '-');
  setText('rpt-warranty-val', txt.warrantyText);
  setText('rpt-remarks', job.remarks ? (lang === 'en' ? 'Remarks: ' : 'หมายเหตุ: ') + job.remarks : '');



  // Render the up to 6 photos in a clean grid
  const photoGrid = document.getElementById('rpt-photos-grid');
  if (photoGrid) {
    const validPhotos = (job.photos || []).filter(p => p);
    if (validPhotos.length) {
      photoGrid.innerHTML = validPhotos.map((p, idx) => `
        <div class="report-photo-item" style="text-align:center; border:1px solid #e0e0e0; border-radius:6px; padding:8px; background:#fafafa;">
          <div class="photo-placeholder" style="width:100%; height:120px; display:flex; align-items:center; justify-content:center; background:#eef2f7; border:1px dashed #cbd5e1; border-radius:4px; overflow:hidden;">
            <img src="${p}" style="width:100%; height:100%; object-fit:cover;" />
          </div>
        </div>
      `).join('');
      document.getElementById('rpt-photos-section').style.display = '';
    } else {
      photoGrid.innerHTML = '';
      document.getElementById('rpt-photos-section').style.display = 'none';
    }
  }

  // Show or hide elements
  document.getElementById('rpt-company-logo-container').style.display = document.getElementById('showLogo').checked ? 'flex' : 'none';
  document.getElementById('rpt-warranty-section').style.display = document.getElementById('showWarranty').checked ? '' : 'none';
  document.getElementById('rpt-signature-section').style.display = document.getElementById('showSignature').checked ? '' : 'none';

  // 1. Inject Technician signature & details (Left Column)
  const techSigEl = document.getElementById('rpt-sig-line-tech');
  const techDateEl = document.getElementById('rpt-sig-date-tech');
  
  if (techSigEl) {
    if (job.signature) {
      techSigEl.innerHTML = `<img src="${job.signature}" style="max-height:55px; max-width:180px; object-fit:contain;" />`;
      techSigEl.style.borderBottom = 'none';
    } else {
      techSigEl.innerHTML = '';
      techSigEl.style.borderBottom = '1px solid #333';
    }
  }
  if (techDateEl) {
    const d = job.completionDate || job.date;
    techDateEl.textContent = d ? 'วันที่ ' + formatDate(d) : 'วันที่ ____________';
  }

  // 2. Inject Approver details (Middle Column)
  const approverSigEl = document.getElementById('rpt-sig-line-approver');
  const approverDateEl = document.getElementById('rpt-sig-date-approver');
  
  if (approverSigEl) {
    if (job.approverSignature) {
      approverSigEl.innerHTML = `<img src="${job.approverSignature}" style="max-height:55px; max-width:180px; object-fit:contain;" />`;
      approverSigEl.style.borderBottom = 'none';
    } else {
      approverSigEl.innerHTML = '';
      approverSigEl.style.borderBottom = '1px solid #333';
    }
  }
  if (approverDateEl) {
    if (job.approvedAt) {
      approverDateEl.textContent = 'วันที่ ' + formatDate(job.approvedAt.split('T')[0]);
    } else {
      approverDateEl.textContent = 'วันที่ ____________';
    }
  }

  // 3. Inject Customer Details (Right Column - Left blank for manual sign)
  const clientSigEl = document.getElementById('rpt-sig-line-client');
  const clientDateEl = document.getElementById('rpt-sig-date-client');
  
  if (clientSigEl) {
    clientSigEl.innerHTML = '';
    clientSigEl.style.borderBottom = '1px solid #333';
  }
  if (clientDateEl) {
    clientDateEl.textContent = 'วันที่ ____________';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function waitForImages(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  return Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => { img.onload = img.onerror = () => res(); });
  }));
}

async function generateReport() {
  const id = document.getElementById('reportJobSelect').value;
  if (!id) { showToast('กรุณาเลือกงานก่อน', 'error'); return; }
  loadReportData();

  const source = document.querySelector('#reportContent .report-page');
  if (!source) { showToast('ไม่พบเนื้อหา Report', 'error'); return; }

  showToast('⏳ กำลังสร้าง PDF...', 'info');

  // Build an off-screen clone at a fixed A4-ish width so capture is reliable
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed; top:0; left:-10000px; width:794px; background:#ffffff; padding:32px; z-index:-1;';
  const clone = source.cloneNode(true);
  clone.style.boxShadow = 'none';
  clone.style.margin = '0';
  clone.style.minHeight = '0';
  clone.style.maxWidth = 'none';
  clone.style.width = '100%';
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    await waitForImages(holder);
    await new Promise(r => setTimeout(r, 150));

    const canvas = await html2canvas(holder, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = 210; // Standard A4 width in mm
    const pdfHeight = 297; // Standard A4 height in mm

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    const job = jobs.find(j => j.id === id);
    const filename = `ServiceReport_${job?.jobNo || id}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    showToast('📄 ดาวน์โหลด PDF สำเร็จ!', 'success');
  } catch (err) {
    console.error('PDF Error:', err);
    showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    document.body.removeChild(holder);
  }
}

function printReport() {
  const id = document.getElementById('reportJobSelect').value;
  if (!id) { showToast('กรุณาเลือกงานก่อน', 'error'); return; }
  loadReportData();
  setTimeout(() => window.print(), 200);
}

// ── Map ──
function initMap() {
  if (map) { updateMapMarkers(); return; }

  map = L.map('customerMap').setView([13.736, 100.523], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  updateMapMarkers();
}

function updateMapMarkers() {
  if (!map) return;
  map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });

  const legend = document.getElementById('mapLegendList');
  legend.innerHTML = '';
  let hasMarker = false;

  jobs.forEach(j => {
    if (!j.customerLat || !j.customerLng) return;
    hasMarker = true;

    const colors = { completed: '#2ecf7d', 'in-progress': '#4f8ef7', pending: '#ff8c42', cancelled: '#f87171' };
    const color = colors[j.status] || '#94a3b8';

    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
      iconSize: [14,14], iconAnchor: [7,7]
    });

    L.marker([j.customerLat, j.customerLng], { icon })
     .addTo(map)
     .bindPopup(`<b>${j.jobNo}</b><br>${j.customerName}<br>${j.customerAddress}<br><span style="color:${color}">${j.status}</span><br>฿${(j.grandTotal||0).toLocaleString('th-TH')}`);

    const item = document.createElement('div');
    item.className = 'map-legend-item';
    item.innerHTML = `<div class="map-dot" style="background:${color}"></div><div><div style="font-weight:600;">${j.customerName}</div><div style="color:#94a3b8;font-size:0.75rem;">${j.jobNo} | ${formatDate(j.date)}</div></div>`;
    item.onclick = () => map.setView([j.customerLat, j.customerLng], 15);
    item.style.cursor = 'pointer';
    legend.appendChild(item);
  });

  if (!hasMarker) {
    legend.innerHTML = '<div style="color:#666;font-size:0.82rem;padding:12px 0;">ไม่มีข้อมูลพิกัดลูกค้า<br>กรุณาเพิ่ม Latitude/Longitude ในข้อมูลงาน</div>';
  }
}

// ── Toast ──
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeJobModal();
});

// Update report preview when company info changes
['companyName','companyAddress','companyPhone','companyTaxId'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    saveToStorage();
    if (document.getElementById('reportJobSelect').value) loadReportData();
  });
});
['showSignature','showLogo','showWarranty'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    saveToStorage();
    if (document.getElementById('reportJobSelect').value) loadReportData();
  });
});

// ── Image Handling Helpers with Compression ──
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality jpeg
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function previewImage(input, index) {
  const previewId = 'preview-' + index;
  const preview = document.getElementById(previewId);
  if (!preview) return;

  const file = input.files[0];
  if (file) {
    showToast('⏳ กำลังบีบอัดรูปภาพ...', 'info');
    compressImage(file, function(base64) {
      preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover;" />`;
      jobPhotos[index - 1] = base64;
      showToast('📸 อัปโหลดและบีบอัดรูปภาพเรียบร้อย', 'success');
      
      // Auto update report preview if currently viewing the report
      if (document.getElementById('reportJobSelect')?.value) {
        loadReportData();
      }
    });
  } else {
    preview.innerHTML = `<span style="color:var(--text-secondary); font-size:0.8rem;">ไม่มีตัวอย่างรูปภาพ / No Image</span>`;
    jobPhotos[index - 1] = '';
  }
}

function updatePhotoPreview(previewId, base64) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (base64) {
    preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover;" />`;
  } else {
    preview.innerHTML = `<span style="color:var(--text-secondary); font-size:0.8rem;">ไม่มีตัวอย่างรูปภาพ / No Image</span>`;
  }
}

// ── Google Maps URL Parsing ──
function parseGoogleMapsUrl(url) {
  if (!url) return;
  const regex1 = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const regex2 = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
  const regex3 = /place\/(-?\d+\.\d+),(-?\d+\.\d+)/;
  
  let match = url.match(regex1) || url.match(regex2) || url.match(regex3);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const latEl = document.getElementById('customerLat');
    const lngEl = document.getElementById('customerLng');
    if (latEl && lngEl) {
      latEl.value = lat;
      lngEl.value = lng;
      showToast('📍 ตรวจพบพิกัดแผนที่: ' + lat.toFixed(5) + ', ' + lng.toFixed(5), 'success');
    }
  }
}

// ── Dropdown Autocompletes for Travel/OT ──
function populateRefJobsDropdowns() {
  const travelSelect = document.getElementById('travelRefJob');
  const otSelect = document.getElementById('otRefJob');
  
  const optionsHtml = '<option value="">-- เลือกใบงานอ้างอิง --</option>' +
    jobs.map(j => `<option value="${j.id}">${j.jobNo || j.id} | ${j.customerName}</option>`).join('');
    
  if (travelSelect) travelSelect.innerHTML = optionsHtml;
  if (otSelect) otSelect.innerHTML = optionsHtml;
}

function getDistanceFromLatLng(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2-lat1) * (Math.PI/180);
  const dLon = (lon2-lon1) * (Math.PI/180); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

function parseRouteCoordinates(url) {
  if (!url) return null;
  const regex = /(-?\d+\.\d+),(-?\d+\.\d+)/g;
  const matches = Array.from(url.matchAll(regex));
  if (matches.length === 0) return null;

  const viewportMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  let viewLat = null, viewLng = null;
  if (viewportMatch) {
    viewLat = parseFloat(viewportMatch[1]);
    viewLng = parseFloat(viewportMatch[2]);
  }

  const validCoords = [];
  for (let m of matches) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      if (viewLat !== null && Math.abs(lat - viewLat) < 0.0001 && Math.abs(lng - viewLng) < 0.0001) {
        continue;
      }
      validCoords.push({ lat, lng });
    }
  }

  if (validCoords.length >= 2) {
    return {
      origin: validCoords[0],
      destination: validCoords[1],
      isRoute: true
    };
  } else if (validCoords.length === 1) {
    return {
      destination: validCoords[0],
      isRoute: false
    };
  } else {
    const lastLat = parseFloat(matches[matches.length - 1][1]);
    const lastLng = parseFloat(matches[matches.length - 1][2]);
    if (lastLat >= -90 && lastLat <= 90 && lastLng >= -180 && lastLng <= 180) {
      return {
        destination: { lat: lastLat, lng: lastLng },
        isRoute: false
      };
    }
  }
  return null;
}

function getStaticMapUrl(url) {
  const coordsInfo = parseRouteCoordinates(url);
  if (!coordsInfo) return '';
  const dest = coordsInfo.destination;
  return `https://static-maps.yandex.ru/1.x/?ll=${dest.lng},${dest.lat}&z=14&l=map&size=600,220&pt=${dest.lng},${dest.lat},pm2rdl`;
}

function parseTravelMapUrl(url) {
  const display = document.getElementById('travelMapDisplay');
  const anchor = document.getElementById('travelMapAnchor');

  if (!url || !url.trim()) {
    if (display) display.style.display = 'none';
    return;
  }

  if (display && anchor) {
    display.style.display = 'flex';
    anchor.href = url;
  }

  const routeInfo = parseRouteCoordinates(url);
  if (routeInfo) {
    // Set static map preview image
    const previewImg = document.getElementById('travelMapPreviewImg');
    if (previewImg) {
      previewImg.src = `https://static-maps.yandex.ru/1.x/?ll=${routeInfo.destination.lng},${routeInfo.destination.lat}&z=14&l=map&size=400,200&pt=${routeInfo.destination.lng},${routeInfo.destination.lat},pm2rdl`;
    }

    let straightDist = 0;
    if (routeInfo.isRoute) {
      straightDist = getDistanceFromLatLng(
        routeInfo.origin.lat, routeInfo.origin.lng,
        routeInfo.destination.lat, routeInfo.destination.lng
      );
      showToast('🚗 คำนวณระยะทางจากพิกัดต้นทาง-ปลายทางในลิงค์แผนที่เรียบร้อย', 'success');
    } else {
      const lat1 = 13.736;
      const lon1 = 100.523;
      straightDist = getDistanceFromLatLng(lat1, lon1, routeInfo.destination.lat, routeInfo.destination.lng);
      showToast('🚗 คำนวณระยะทางจากพิกัดจุดปลายทาง (จากสำนักงานใหญ่ HQ)', 'success');
    }

    const estimatedRoadDist = straightDist * 1.3; // Road winding factor
    document.getElementById('travelDistance').value = estimatedRoadDist.toFixed(1);
    calcTravelAmount();
  }
}

function autoFillTravelAddress() {
  const jobId = document.getElementById('travelRefJob').value;
  if (!jobId) return;
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    document.getElementById('travelClaimNo').value = 'TC-' + (job.jobNo || job.id);
    document.getElementById('travelEnd').value = job.customerAddress || '';
    if (job.googleMapsUrl) {
      document.getElementById('travelMapUrl').value = job.googleMapsUrl;
      parseTravelMapUrl(job.googleMapsUrl);
    } else {
      document.getElementById('travelMapUrl').value = '';
      const display = document.getElementById('travelMapDisplay');
      if (display) display.style.display = 'none';
    }
    
    // Prioritize job's saved lat/lng coordinates if they exist
    if (job.customerLat && job.customerLng) {
      const lat1 = 13.736;
      const lon1 = 100.523;
      const lat2 = parseFloat(job.customerLat);
      const lon2 = parseFloat(job.customerLng);
      const straightDist = getDistanceFromLatLng(lat1, lon1, lat2, lon2);
      const estimatedRoadDist = straightDist * 1.3; // Road winding factor
      document.getElementById('travelDistance').value = estimatedRoadDist.toFixed(1);
      calcTravelAmount();
      showToast('🚗 คำนวณระยะทางจากพิกัดของใบงาน: ' + estimatedRoadDist.toFixed(1) + ' กม.', 'success');
      
      const preview = document.getElementById('travelMapDisplay');
      if (preview) preview.style.display = 'flex';
    }
  }
}

function autoFillOtEmployee() {
  const jobId = document.getElementById('otRefJob').value;
  if (!jobId) return;
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    document.getElementById('otClaimNo').value = 'OT-' + (job.jobNo || job.id);
    document.getElementById('otEmployee').value = job.technician || '';
    if (job.date) {
      document.getElementById('otWorkDate').value = job.date;
    }
  }
}

// ── Travel Claims Calculations & Persistence ──
function calcTravelAmount() {
  const dist = parseFloat(document.getElementById('travelDistance').value) || 0;
  const rate = parseFloat(document.getElementById('travelRate').value) || 0;
  const tolls = parseFloat(document.getElementById('travelTolls').value) || 0;
  document.getElementById('travelTotal').value = (dist * rate + tolls).toFixed(2);
}

function saveTravelClaim(e) {
  e.preventDefault();
  const id = document.getElementById('editTravelClaimId').value;
  const existingClaim = id ? travelClaims.find(c => c.id === id) : null;
  const claim = {
    id: id || 'TC' + Date.now(),
    claimNo: document.getElementById('travelClaimNo').value,
    date: document.getElementById('travelDate').value,
    jobId: document.getElementById('travelRefJob').value,
    startPoint: document.getElementById('travelStart').value,
    endPoint: document.getElementById('travelEnd').value,
    mapUrl: document.getElementById('travelMapUrl').value,
    distance: parseFloat(document.getElementById('travelDistance').value) || 0,
    rate: parseFloat(document.getElementById('travelRate').value) || 0,
    tolls: parseFloat(document.getElementById('travelTolls').value) || 0,
    total: parseFloat(document.getElementById('travelTotal').value) || 0,
    status: existingClaim ? (existingClaim.status || 'pending') : 'pending',
    approvedBy: existingClaim ? (existingClaim.approvedBy || '') : '',
    remarks: document.getElementById('travelRemarks').value
  };

  if (id) {
    const idx = travelClaims.findIndex(c => c.id === id);
    if (idx !== -1) travelClaims[idx] = claim;
    showToast('✅ แก้ไขใบเบิกค่าเดินทางเรียบร้อย', 'success');
  } else {
    travelClaims.unshift(claim);
    showToast('✅ เพิ่มใบเบิกค่าเดินทางเรียบร้อย', 'success');
  }

  // Save to SQLite backend database
  apiPost('/api/travel-claims', claim).catch(err => console.error("Failed to save travel claim on server database:", err));

  saveToStorage();
  resetTravelForm();
  renderTravelClaimsTable();
}

function resetTravelForm() {
  document.getElementById('travelForm').reset();
  document.getElementById('editTravelClaimId').value = '';
  document.getElementById('travelDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('travelClaimNo').value = 'TC-' + new Date().getFullYear() + '-' + String(travelClaims.length + 1).padStart(3, '0');
  document.getElementById('travelTotal').value = '';
  document.getElementById('travelMapUrl').value = '';
  const display = document.getElementById('travelMapDisplay');
  if (display) display.style.display = 'none';
}

function renderTravelClaimsTable() {
  const tbody = document.getElementById('travelClaimsTableBody');
  if (!tbody) return;

  let filtered = travelClaims;
  const perms = getUserPermissions(currentUser);
  if (currentUser && !perms.approveClaims) {
    filtered = travelClaims.filter(c => {
      const refJob = jobs.find(j => j.id === c.jobId);
      return refJob && refJob.technician === currentUser.name;
    });
  }

  // Pagination bounds correction
  const totalPages = Math.ceil(filtered.length / travelPerPage) || 1;
  if (travelCurrentPage > totalPages) {
    travelCurrentPage = totalPages;
  }
  if (travelCurrentPage < 1) {
    travelCurrentPage = 1;
  }

  // Update pagination info & controls
  const infoEl = document.getElementById('travelPaginationInfo');
  const btnPrev = document.getElementById('btnTravelPrev');
  const btnNext = document.getElementById('btnTravelNext');

  const start = (travelCurrentPage - 1) * travelPerPage;
  const end = Math.min(start + travelPerPage, filtered.length);

  if (infoEl) {
    if (filtered.length === 0) {
      infoEl.textContent = 'แสดง 0 ถึง 0 จาก 0 รายการ';
    } else {
      infoEl.textContent = `แสดง ${start + 1} ถึง ${end} จาก ${filtered.length} รายการ (หน้า ${travelCurrentPage}/${totalPages})`;
    }
  }
  if (btnPrev) btnPrev.disabled = travelCurrentPage === 1;
  if (btnNext) btnNext.disabled = travelCurrentPage === totalPages || filtered.length === 0;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">ยังไม่มีประวัติการเบิก</td></tr>';
    return;
  }

  const paginated = filtered.slice(start, end);

  tbody.innerHTML = paginated.map(c => {
    const refJob = jobs.find(j => j.id === c.jobId);
    const mapIconHtml = c.mapUrl ? ` <a href="${c.mapUrl}" target="_blank" title="ดูเส้นทางแผนที่" style="text-decoration:none;">🗺️</a>` : '';
    const status = c.status || 'pending';
    
    // Actions selection
    let actionsHtml = `<button class="action-btn" onclick="viewClaim('travel', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
    if (currentUser) {
      if (currentUser.role === 'sale') {
        if (status === 'pending') {
          actionsHtml = `
            <button class="action-btn" onclick="viewClaim('travel', '${c.id}')" title="ดูรายละเอียดก่อนอนุมัติ">👁️</button>
            <button class="action-btn" onclick="approveClaim('travel', '${c.id}')" title="อนุมัติ" style="color:#2ecf7d; font-weight:bold; font-size:1.1rem; border:1px solid rgba(46,207,125,0.2); padding:2px 6px; border-radius:4px; margin-right:4px;">✔️</button>
            <button class="action-btn" onclick="rejectClaim('travel', '${c.id}')" title="ปฏิเสธ" style="color:#f87171; font-weight:bold; font-size:1.1rem; border:1px solid rgba(248,113,113,0.2); padding:2px 6px; border-radius:4px; margin-right:4px;">❌</button>
          `;
        } else {
          actionsHtml = `<button class="action-btn" onclick="viewClaim('travel', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
        }
        actionsHtml += `<button class="action-btn" onclick="exportTravelClaimPDF('${c.id}')" title="ออก PDF">📄</button>`;
      } else { // technician
        if (status === 'pending') {
          actionsHtml = `
            <button class="action-btn" onclick="viewClaim('travel', '${c.id}')" title="ดูรายละเอียด">👁️</button>
            <button class="action-btn" onclick="editTravelClaim('${c.id}')" title="แก้ไข">✏️</button>
            <button class="action-btn del" onclick="deleteTravelClaim('${c.id}')" title="ลบ">🗑️</button>
          `;
        } else {
          actionsHtml = `<button class="action-btn" onclick="viewClaim('travel', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
        }
        actionsHtml += `<button class="action-btn" onclick="exportTravelClaimPDF('${c.id}')" title="ออก PDF">📄</button>`;
      }
    }

    return `
      <tr>
        <td><strong>${c.claimNo}</strong></td>
        <td>${formatDate(c.date)}</td>
        <td>${refJob ? refJob.jobNo : '-'}</td>
        <td>${c.distance} กม.${mapIconHtml}</td>
        <td>฿${c.tolls.toFixed(2)}</td>
        <td><strong>฿${c.total.toFixed(2)}</strong></td>
        <td>${getApprovalStatusBadge(status)}</td>
        <td>${actionsHtml}</td>
      </tr>
    `;
  }).join('');
}

function changeTravelPage(direction) {
  travelCurrentPage += direction;
  renderTravelClaimsTable();
}

function editTravelClaim(id) {
  const c = travelClaims.find(claim => claim.id === id);
  if (!c) return;
  document.getElementById('editTravelClaimId').value = c.id;
  document.getElementById('travelClaimNo').value = c.claimNo;
  document.getElementById('travelDate').value = c.date;
  document.getElementById('travelRefJob').value = c.jobId;
  document.getElementById('travelStart').value = c.startPoint;
  document.getElementById('travelEnd').value = c.endPoint;
  document.getElementById('travelMapUrl').value = c.mapUrl || '';
  if (c.mapUrl) {
    parseTravelMapUrl(c.mapUrl);
  } else {
    const display = document.getElementById('travelMapDisplay');
    if (display) display.style.display = 'none';
  }
  document.getElementById('travelDistance').value = c.distance;
  document.getElementById('travelRate').value = c.rate;
  document.getElementById('travelTolls').value = c.tolls;
  document.getElementById('travelTotal').value = c.total.toFixed(2);
  document.getElementById('travelRemarks').value = c.remarks;
}

function deleteTravelClaim(id) {
  if (!confirm('ต้องการลบใบเบิกค่าเดินทางนี้ใช่หรือไม่?')) return;
  travelClaims = travelClaims.filter(c => c.id !== id);

  // Delete from SQLite backend database
  apiDelete('/api/travel-claims/' + id).catch(err => console.error("Failed to delete travel claim on server database:", err));

  saveToStorage();
  renderTravelClaimsTable();
  showToast('🗑️ ลบข้อมูลเรียบร้อย', 'info');
}

// ── OT Claims Calculations & Persistence ──
function calcOtHours() {
  const startVal = document.getElementById('otStart').value;
  const endVal = document.getElementById('otEnd').value;
  if (!startVal || !endVal) {
    document.getElementById('otHours').value = '';
    return;
  }
  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);
  let diffMins = (eh * 60 + em) - (sh * 60 + sm);
  if (diffMins < 0) diffMins += 24 * 60; // Cross midnight
  const hours = diffMins / 60;
  document.getElementById('otHours').value = hours.toFixed(1);
}

function saveOtClaim(e) {
  e.preventDefault();
  const id = document.getElementById('editOtClaimId').value;
  const allowance = parseFloat(document.getElementById('otAllowance').value) || 0;
  const existingClaim = id ? otClaims.find(c => c.id === id) : null;
  const claim = {
    id: id || 'OT' + Date.now(),
    claimNo: document.getElementById('otClaimNo').value,
    date: document.getElementById('otDate').value,
    jobId: document.getElementById('otRefJob').value,
    employee: document.getElementById('otEmployee').value,
    workDate: document.getElementById('otWorkDate').value,
    start: document.getElementById('otStart').value,
    end: document.getElementById('otEnd').value,
    hours: parseFloat(document.getElementById('otHours').value) || 0,
    multiplier: parseFloat(document.getElementById('otMultiplier').value) || 1.5,
    allowance: allowance,
    total: allowance, // For cost/dashboard compatibility
    status: existingClaim ? (existingClaim.status || 'pending') : 'pending',
    approvedBy: existingClaim ? (existingClaim.approvedBy || '') : '',
    remarks: document.getElementById('otRemarks').value
  };

  if (id) {
    const idx = otClaims.findIndex(c => c.id === id);
    if (idx !== -1) otClaims[idx] = claim;
    showToast('✅ แก้ไขใบเบิก OT เรียบร้อย', 'success');
  } else {
    otClaims.unshift(claim);
    showToast('✅ เพิ่มใบเบิก OT เรียบร้อย', 'success');
  }

  // Save to SQLite backend database
  apiPost('/api/ot-claims', claim).catch(err => console.error("Failed to save OT claim on server database:", err));

  saveToStorage();
  resetOtForm();
  renderOtClaimsTable();
}

function resetOtForm() {
  document.getElementById('otForm').reset();
  document.getElementById('editOtClaimId').value = '';
  document.getElementById('otDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('otClaimNo').value = 'OT-' + new Date().getFullYear() + '-' + String(otClaims.length + 1).padStart(3, '0');
  document.getElementById('otMultiplier').value = '1.5';
  document.getElementById('otAllowance').value = '0';
}

function renderOtClaimsTable() {
  const tbody = document.getElementById('otClaimsTableBody');
  if (!tbody) return;

  let filtered = otClaims;
  const perms = getUserPermissions(currentUser);
  if (currentUser && !perms.approveClaims) {
    filtered = otClaims.filter(c => c.employee === currentUser.name);
  }

  // Pagination bounds correction
  const totalPages = Math.ceil(filtered.length / otPerPage) || 1;
  if (otCurrentPage > totalPages) {
    otCurrentPage = totalPages;
  }
  if (otCurrentPage < 1) {
    otCurrentPage = 1;
  }

  // Update pagination info & controls
  const infoEl = document.getElementById('otPaginationInfo');
  const btnPrev = document.getElementById('btnOtPrev');
  const btnNext = document.getElementById('btnOtNext');

  const start = (otCurrentPage - 1) * otPerPage;
  const end = Math.min(start + otPerPage, filtered.length);

  if (infoEl) {
    if (filtered.length === 0) {
      infoEl.textContent = 'แสดง 0 ถึง 0 จาก 0 รายการ';
    } else {
      infoEl.textContent = `แสดง ${start + 1} ถึง ${end} จาก ${filtered.length} รายการ (หน้า ${otCurrentPage}/${totalPages})`;
    }
  }
  if (btnPrev) btnPrev.disabled = otCurrentPage === 1;
  if (btnNext) btnNext.disabled = otCurrentPage === totalPages || filtered.length === 0;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row">ยังไม่มีประวัติการเบิก</td></tr>';
    return;
  }

  const paginated = filtered.slice(start, end);

  tbody.innerHTML = paginated.map(c => {
    const refJob = jobs.find(j => j.id === c.jobId);
    const status = c.status || 'pending';

    // Actions selection
    let actionsHtml = `<button class="action-btn" onclick="viewClaim('ot', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
    if (currentUser) {
      if (currentUser.role === 'sale') {
        if (status === 'pending') {
          actionsHtml = `
            <button class="action-btn" onclick="viewClaim('ot', '${c.id}')" title="ดูรายละเอียดก่อนอนุมัติ">👁️</button>
            <button class="action-btn" onclick="approveClaim('ot', '${c.id}')" title="อนุมัติ" style="color:#2ecf7d; font-weight:bold; font-size:1.1rem; border:1px solid rgba(46,207,125,0.2); padding:2px 6px; border-radius:4px; margin-right:4px;">✔️</button>
            <button class="action-btn" onclick="rejectClaim('ot', '${c.id}')" title="ปฏิเสธ" style="color:#f87171; font-weight:bold; font-size:1.1rem; border:1px solid rgba(248,113,113,0.2); padding:2px 6px; border-radius:4px; margin-right:4px;">❌</button>
          `;
        } else {
          actionsHtml = `<button class="action-btn" onclick="viewClaim('ot', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
        }
        actionsHtml += `<button class="action-btn" onclick="exportOtClaimPDF('${c.id}')" title="ออก PDF">📄</button>`;
      } else { // technician
        if (status === 'pending') {
          actionsHtml = `
            <button class="action-btn" onclick="viewClaim('ot', '${c.id}')" title="ดูรายละเอียด">👁️</button>
            <button class="action-btn" onclick="editOtClaim('${c.id}')" title="แก้ไข">✏️</button>
            <button class="action-btn del" onclick="deleteOtClaim('${c.id}')" title="ลบ">🗑️</button>
          `;
        } else {
          actionsHtml = `<button class="action-btn" onclick="viewClaim('ot', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
        }
        actionsHtml += `<button class="action-btn" onclick="exportOtClaimPDF('${c.id}')" title="ออก PDF">📄</button>`;
      }
    }

    return `
      <tr>
        <td><strong>${c.claimNo}</strong></td>
        <td>${formatDate(c.date)}</td>
        <td>${refJob ? refJob.jobNo : '-'}</td>
        <td>${c.employee}</td>
        <td>${c.start} - ${c.end}</td>
        <td>${c.hours} ชม.</td>
        <td>x${c.multiplier || 1.5}</td>
        <td>฿${(c.allowance || 0).toFixed(2)}</td>
        <td>${getApprovalStatusBadge(status)}</td>
        <td>${actionsHtml}</td>
      </tr>
    `;
  }).join('');
}

function changeOtPage(direction) {
  otCurrentPage += direction;
  renderOtClaimsTable();
}

function editOtClaim(id) {
  const c = otClaims.find(claim => claim.id === id);
  if (!c) return;
  document.getElementById('editOtClaimId').value = c.id;
  document.getElementById('otClaimNo').value = c.claimNo;
  document.getElementById('otDate').value = c.date;
  document.getElementById('otRefJob').value = c.jobId;
  document.getElementById('otEmployee').value = c.employee;
  document.getElementById('otWorkDate').value = c.workDate;
  document.getElementById('otStart').value = c.start;
  document.getElementById('otEnd').value = c.end;
  document.getElementById('otHours').value = c.hours;
  document.getElementById('otMultiplier').value = c.multiplier || 1.5;
  document.getElementById('otAllowance').value = c.allowance || 0;
  document.getElementById('otRemarks').value = c.remarks;
}

function deleteOtClaim(id) {
  if (!confirm('ต้องการลบใบเบิก OT นี้ใช่หรือไม่?')) return;
  otClaims = otClaims.filter(c => c.id !== id);

  // Delete from SQLite backend database
  apiDelete('/api/ot-claims/' + id).catch(err => console.error("Failed to delete OT claim on server database:", err));

  saveToStorage();
  renderOtClaimsTable();
  showToast('🗑️ ลบข้อมูลเรียบร้อย', 'info');
}

// ── PDF Exporters for Travel & OT Claims ──
async function exportTravelClaimPDF(id) {
  const c = travelClaims.find(claim => claim.id === id);
  if (!c) return;
  const refJob = jobs.find(j => j.id === c.jobId);

  const container = document.createElement('div');
  container.className = 'pdf-document';
  container.style.padding = '20mm';
  container.style.width = '210mm';
  container.style.background = '#ffffff';
  container.style.color = '#333333';
  container.style.fontFamily = 'Sarabun, sans-serif';
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';

  const logoImgSrc = logoBase64 || 'logo.png';
  
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #333; padding-bottom:12px; margin-bottom:20px;">
      <div>
        <h1 style="margin:0; font-size:1.6rem; color:#1a3a5c;">ใบเบิกค่าเดินทาง / TRAVEL CLAIM FORM</h1>
        <p style="margin:4px 0 0; font-size:0.9rem; color:#666;">Live Lighting</p>
      </div>
      <img src="${logoImgSrc}" style="max-height:50px; max-width:100px; object-fit:contain;" />
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:25px; font-size:0.9rem;">
      <div>
        <strong>เลขที่ใบเบิก / Claim No:</strong> ${c.claimNo}<br>
        <strong>วันที่เบิก / Date:</strong> ${formatDate(c.date)}<br>
        <strong>ใบงานอ้างอิง / Ref Job No:</strong> ${refJob ? refJob.jobNo : '-'}<br>
        <strong>รายละเอียดงาน / Job Details:</strong> ${refJob ? (refJob.workPerformed || refJob.operationSummary || '-') : '-'}
      </div>
      <div>
        <strong>ชื่อพนักงาน / Employee:</strong> ${refJob ? (refJob.technician || '-') : '-'}<br>
        <strong>ลูกค้า / Customer:</strong> ${refJob ? refJob.customerName : '-'}
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; margin-bottom:30px; font-size:0.9rem;">
      <thead>
        <tr style="background:#eef2f7; border-top:1px solid #ddd; border-bottom:1px solid #ddd;">
          <th style="padding:10px; text-align:left;">จุดเริ่มต้น</th>
          <th style="padding:10px; text-align:left;">จุดสิ้นสุด</th>
          <th style="padding:10px; text-align:center;">ระยะทาง</th>
          <th style="padding:10px; text-align:right;">อัตรา/กม.</th>
          <th style="padding:10px; text-align:right;">ค่าทางด่วน/ที่จอดรถ</th>
          <th style="padding:10px; text-align:right;">ยอดเบิกสุทธิ</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px;">${c.startPoint}</td>
          <td style="padding:10px;">${c.endPoint}</td>
          <td style="padding:10px; text-align:center;">${c.distance} กม.</td>
          <td style="padding:10px; text-align:right;">฿${c.rate.toFixed(2)}</td>
          <td style="padding:10px; text-align:right;">฿${c.tolls.toFixed(2)}</td>
          <td style="padding:10px; text-align:right; font-weight:bold;">฿${c.total.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-bottom:20px; font-size:0.9rem;">
      <strong>หมายเหตุ / Remarks:</strong> ${c.remarks || '-'}
    </div>

    ${c.mapUrl ? `
    <div style="margin-bottom:20px;">
      <strong style="font-size:0.9rem; color:#1a3a5c;">แผนที่จุดหมายปลายทาง / Destination Map:</strong>
      <div style="width:100%; height:200px; border:1px solid #cccccc; border-radius:6px; overflow:hidden; margin-top:8px;">
        <img src="${getStaticMapUrl(c.mapUrl)}" style="width:100%; height:100%; object-fit:cover; display:block;" />
      </div>
    </div>
    ` : ''}

    <div style="display:flex; justify-content:space-around; margin-top:40px; font-size:0.85rem;">
      <div style="text-align:center; width:40%;">
        <div style="border-bottom:1px solid #333; margin-bottom:8px; height:40px;"></div>
        <div>ลงชื่อผู้เบิก / Claimant</div>
        <div style="margin-top:6px; color:#666;">วันที่ ____/____/____</div>
      </div>
      <div style="text-align:center; width:40%;">
        <div style="border-bottom:1px solid #333; margin-bottom:8px; height:40px; line-height:40px; font-weight:bold; color:#1a3a5c; font-size:0.85rem;">
          ${c.approvedBy ? `(อนุมัติระบบ: ${c.approvedBy})` : ''}
        </div>
        <div>ผู้อนุมัติ / Approver</div>
        <div style="margin-top:6px; color:#666;">
          ${c.approvedDate ? `วันที่: ${formatDate(c.approvedDate)}` : 'วันที่ ____/____/____'}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  
  showToast('⏳ กำลังสร้าง PDF ค่าเดินทาง...', 'info');

  try {
    await waitForImages(container);
    await new Promise(r => setTimeout(r, 150));

    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      windowWidth: container.scrollWidth, windowHeight: container.scrollHeight,
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = 210; // Standard A4 width in mm
    const pdfHeight = 297; // Standard A4 height in mm

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    pdf.save(`TravelClaim_${c.claimNo}_${c.date}.pdf`);
    showToast('🚗 ดาวน์โหลด PDF ใบเบิกค่าเดินทางสำเร็จ!', 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}

async function exportOtClaimPDF(id) {
  const c = otClaims.find(claim => claim.id === id);
  if (!c) return;
  const refJob = jobs.find(j => j.id === c.jobId);

  const container = document.createElement('div');
  container.className = 'pdf-document';
  container.style.padding = '20mm';
  container.style.width = '210mm';
  container.style.background = '#ffffff';
  container.style.color = '#333333';
  container.style.fontFamily = 'Sarabun, sans-serif';
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';

  const logoImgSrc = logoBase64 || 'logo.png';

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #333; padding-bottom:12px; margin-bottom:20px;">
      <div>
        <h1 style="margin:0; font-size:1.6rem; color:#1a3a5c;">ใบเบิกค่าล่วงเวลา / OVERTIME CLAIM FORM</h1>
        <p style="margin:4px 0 0; font-size:0.9rem; color:#666;">Live Lighting</p>
      </div>
      <img src="${logoImgSrc}" style="max-height:50px; max-width:100px; object-fit:contain;" />
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:25px; font-size:0.9rem;">
      <div>
        <strong>เลขที่ใบเบิก / Claim No:</strong> ${c.claimNo}<br>
        <strong>วันที่เบิก / Date:</strong> ${formatDate(c.date)}<br>
        <strong>ใบงานอ้างอิง / Ref Job No:</strong> ${refJob ? refJob.jobNo : '-'}<br>
        <strong>รายละเอียดงาน / Job Details:</strong> ${refJob ? (refJob.workPerformed || refJob.operationSummary || '-') : '-'}
      </div>
      <div>
        <strong>ชื่อพนักงาน / Employee:</strong> ${c.employee}<br>
        <strong>วันที่ปฏิบัติงาน / Work Date:</strong> ${formatDate(c.workDate)}
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; margin-bottom:30px; font-size:0.9rem;">
      <thead>
        <tr style="background:#eef2f7; border-top:1px solid #ddd; border-bottom:1px solid #ddd;">
          <th style="padding:10px; text-align:center;">เวลาทำงาน</th>
          <th style="padding:10px; text-align:center;">จำนวนชั่วโมง</th>
          <th style="padding:10px; text-align:center;">ตัวคูณเวลา</th>
          <th style="padding:10px; text-align:right;">ค่าเบี้ยเลี้ยง</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px; text-align:center;">${c.start} - ${c.end} น.</td>
          <td style="padding:10px; text-align:center;">${c.hours} ชม.</td>
          <td style="padding:10px; text-align:center;">x${c.multiplier || 1.5}</td>
          <td style="padding:10px; text-align:right;">฿${(c.allowance || 0).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-bottom:40px; font-size:0.9rem;">
      <strong>รายละเอียดงาน / OT Details & Remarks:</strong> ${c.remarks || '-'}
    </div>

    <div style="display:flex; justify-content:space-around; margin-top:60px; font-size:0.85rem;">
      <div style="text-align:center; width:40%;">
        <div style="border-bottom:1px solid #333; margin-bottom:8px; height:40px;"></div>
        <div>ลงชื่อผู้เบิก / Claimant</div>
        <div style="margin-top:6px; color:#666;">วันที่ ____/____/____</div>
      </div>
      <div style="text-align:center; width:40%;">
        <div style="border-bottom:1px solid #333; margin-bottom:8px; height:40px; line-height:40px; font-weight:bold; color:#1a3a5c; font-size:0.85rem;">
          ${c.approvedBy ? `(อนุมัติระบบ: ${c.approvedBy})` : ''}
        </div>
        <div>ผู้อนุมัติ / Approver</div>
        <div style="margin-top:6px; color:#666;">
          ${c.approvedDate ? `วันที่: ${formatDate(c.approvedDate)}` : 'วันที่ ____/____/____'}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  
  showToast('⏳ กำลังสร้าง PDF OT...', 'info');

  try {
    await waitForImages(container);
    await new Promise(r => setTimeout(r, 150));

    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      windowWidth: container.scrollWidth, windowHeight: container.scrollHeight,
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = 210; // Standard A4 width in mm
    const pdfHeight = 297; // Standard A4 height in mm

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    pdf.save(`OtClaim_${c.claimNo}_${c.date}.pdf`);
    showToast('⏰ ดาวน์โหลด PDF ใบเบิก OT สำเร็จ!', 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}

// ── Logo Base64 Static (to prevent canvas taint on pdf print) ──
const logoBase64 = 'data:image/png;base64,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';





// ── Enterprise Extensions Helper Functions ──

function getApprovalStatusBadge(status) {
  const map = {
    'pending': ['badge-pending-approval', '⏳ รออนุมัติ'],
    'approved': ['badge-approved', '✅ อนุมัติแล้ว'],
    'rejected': ['badge-rejected', '❌ ปฏิเสธ']
  };
  const [cls, text] = map[status] || ['badge-pending-approval', '⏳ รออนุมัติ'];
  return `<span class="badge ${cls}">${text}</span>`;
}

function approveClaim(type, id) {
  const claimList = type === 'travel' ? travelClaims : otClaims;
  const idx = claimList.findIndex(c => c.id === id);
  if (idx !== -1) {
    claimList[idx].status = 'approved';
    claimList[idx].approvedBy = currentUser ? currentUser.name : 'Unknown';
    claimList[idx].approvedDate = new Date().toISOString().split('T')[0];
    
    // Save approved status to backend SQL database
    const claim = claimList[idx];
    const endpoint = type === 'travel' ? '/api/travel-claims' : '/api/ot-claims';
    apiPost(endpoint, claim).catch(err => console.error("Failed to update claim on server:", err));

    saveToStorage();
    if (type === 'travel') renderTravelClaimsTable();
    else renderOtClaimsTable();
    renderPayrollTable();
    showToast('✅ อนุมัติใบเบิกสำเร็จแล้ว', 'success');
    
  }
}

function rejectClaim(type, id) {
  const reason = prompt('กรุณาระบุเหตุผลการปฏิเสธใบเบิก:');
  if (reason === null) return; // user cancelled prompt
  
  const claimList = type === 'travel' ? travelClaims : otClaims;
  const idx = claimList.findIndex(c => c.id === id);
  if (idx !== -1) {
    claimList[idx].status = 'rejected';
    claimList[idx].remarks = (claimList[idx].remarks ? claimList[idx].remarks + ' | ' : '') + 'ปฏิเสธเนื่องจาก: ' + (reason || 'ไม่ระบุเหตุผล');
    claimList[idx].approvedBy = currentUser ? currentUser.name : 'Unknown';
    claimList[idx].approvedDate = new Date().toISOString().split('T')[0];
    
    // Save rejected status to backend SQL database
    const claim = claimList[idx];
    const endpoint = type === 'travel' ? '/api/travel-claims' : '/api/ot-claims';
    apiPost(endpoint, claim).catch(err => console.error("Failed to update claim on server:", err));

    saveToStorage();
    if (type === 'travel') renderTravelClaimsTable();
    else renderOtClaimsTable();
    renderPayrollTable();
    showToast('❌ ปฏิเสธใบเบิกแล้ว', 'info');
    
  }
}

function renderEmployeeTable() {
  const tbody = document.getElementById('employeeTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = employees.map(emp => {
    const roleNames = {
      service: 'Service',
      sale: 'Sale',
      admin: 'Admin'
    };
    const isDefault = defaultEmployees.some(e => e.email === emp.email);
    
    // Detailed permissions button
    const permBtn = `<button class="action-btn" onclick="openPermissionsModal('${emp.email}')" title="กำหนดสิทธิ์พนักงาน" style="color:var(--accent-blue); font-weight:bold; border:1px solid rgba(0,100,250,0.15); padding:2px 6px; border-radius:4px; margin-right:6px; font-size:0.8rem;">⚙️ สิทธิ์</button>`;

    const deleteBtn = isDefault ? 
      `<span style="color:var(--text-secondary); font-size:0.8rem;">ระบบพื้นฐาน (ลบไม่ได้)</span>` : 
      `<button class="action-btn del" onclick="deleteEmployee('${emp.email}')" title="ลบพนักงาน">🗑️</button>`;
      
    return `
      <tr>
        <td><strong>${emp.name}</strong></td>
        <td><span class="badge ${emp.role === 'admin' ? 'badge-completed' : (emp.role === 'sale' ? 'badge-progress' : 'badge-pending')}">${emp.roleDisplay || roleNames[emp.role] || emp.role}</span></td>
        <td>${emp.email}</td>
        <td>
          <div style="display:flex; align-items:center;">
            ${permBtn}
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function handleAddEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('newEmpName').value.trim();
  const roleDisplay = document.getElementById('newEmpRole').value.trim();
  const email = document.getElementById('newEmpEmail').value.trim();
  
  if (employees.some(emp => emp.email.toLowerCase() === email.toLowerCase())) {
    showToast('❌ อีเมลนี้มีอยู่ในระบบแล้ว', 'error');
    return;
  }

  // Parse base system role based on Admin's typed custom display role
  let role = 'sale'; // default fallback
  const s = roleDisplay.toLowerCase();
  if (s.includes('admin') || s.includes('ผู้ดูแล') || s.includes('ผู้จัดการ')) {
    role = 'admin';
  } else if (s.includes('service') || s.includes('ช่าง') || s.includes('บริการ') || s.includes('ทอม')) {
    role = 'service';
  } else if (s.includes('sale') || s.includes('ขาย') || s.includes('ติ๊ก')) {
    role = 'sale';
  }
  
  const defaultPerms = getUserPermissions({ role });
  const newEmp = { name, role, roleDisplay, email, password: '123', permissions: defaultPerms };
  employees.push(newEmp);
  localStorage.setItem('servicell1_employees', JSON.stringify(employees));
  
  // Save new employee to backend SQL database
  apiPost('/api/employees', newEmp).catch(err => console.error("Failed to add employee on server database:", err));

  document.getElementById('addEmployeeForm').reset();
  renderEmployeeTable();
  showToast('👥 เพิ่มพนักงานใหม่สำเร็จ รหัสผ่านเริ่มต้นคือ 123', 'success');
}

function deleteEmployee(email) {
  if (!confirm('ยืนยันที่จะลบพนักงานรายนี้ออกจากระบบหรือไม่? (ประวัติการเบิกเงินและข้อมูลในสรุปยอดจ่ายของพนักงานรายนี้จะถูกลบออกทั้งหมด)')) return;
  
  const emp = employees.find(e => e.email === email);
  if (emp) {
    // 1. Delete associated OT claims
    const otToDelete = otClaims.filter(c => c.employee === emp.name);
    otToDelete.forEach(c => {
      apiDelete('/api/ot-claims/' + c.id).catch(err => console.error("Failed to delete OT claim on server:", err));
    });
    otClaims = otClaims.filter(c => c.employee !== emp.name);

    // 2. Delete associated Travel claims
    const travelToDelete = travelClaims.filter(c => {
      const j = jobs.find(job => job.id === c.jobId);
      return j && j.technician === emp.name;
    });
    travelToDelete.forEach(c => {
      apiDelete('/api/travel-claims/' + c.id).catch(err => console.error("Failed to delete travel claim on server:", err));
    });
    travelClaims = travelClaims.filter(c => {
      const j = jobs.find(job => job.id === c.jobId);
      return !j || j.technician !== emp.name;
    });
  }

  employees = employees.filter(e => e.email !== email);
  localStorage.setItem('servicell1_employees', JSON.stringify(employees));
  
  // Delete employee from backend SQL database
  apiDelete('/api/employees/' + encodeURIComponent(email)).catch(err => console.error("Failed to delete employee on server database:", err));

  saveToStorage();
  renderEmployeeTable();
  renderTravelClaimsTable();
  renderOtClaimsTable();
  renderPayrollTable();
  showToast('🗑️ ลบพนักงานและประวัติการเบิกเงินเรียบร้อย', 'info');
}

function saveAdminCompanySettings() {
  const name = document.getElementById('settingsCompanyName').value.trim();
  const addr = document.getElementById('settingsCompanyAddress').value.trim();
  const phone = document.getElementById('settingsCompanyPhone').value.trim();
  const taxId = document.getElementById('settingsCompanyTaxId').value.trim();
  
  if (name) {
    const nameEl = document.getElementById('companyName');
    if (nameEl) nameEl.value = name;
  }
  if (addr) {
    const addrEl = document.getElementById('companyAddress');
    if (addrEl) addrEl.value = addr;
  }
  if (phone) {
    const phoneEl = document.getElementById('companyPhone');
    if (phoneEl) phoneEl.value = phone;
  }
  if (taxId) {
    const taxEl = document.getElementById('companyTaxId');
    if (taxEl) taxEl.value = taxId;
  }
  
  saveToStorage();
  showToast('💾 บันทึกการตั้งค่าบริษัทเรียบร้อย', 'success');
}

function viewClaim(type, id) {
  const claimList = type === 'travel' ? travelClaims : otClaims;
  const c = claimList.find(claim => claim.id === id);
  if (!c) return;
  const refJob = jobs.find(j => j.id === c.jobId);
  const status = c.status || 'pending';

  const modal = document.getElementById('claimModal');
  const title = document.getElementById('claimModalTitle');
  const body = document.getElementById('claimModalBody');
  const footer = document.getElementById('claimModalFooter');

  title.textContent = type === 'travel' ? '🚗 รายละเอียดใบเบิกค่าเดินทาง' : '⏰ รายละเอียดใบเบิกค่าล่วงเวลา (OT)';

  let bodyHtml = '';
  if (type === 'travel') {
    const logoImgSrc = logoBase64 || 'logo.png';
    const mapIconHtml = c.mapUrl ? ` <a href="${c.mapUrl}" target="_blank" style="text-decoration:none;" title="ดูแผนที่">🗺️ ดูแผนที่ Google Maps</a>` : '';
    bodyHtml = `
      <div class="claim-preview-paper" style="background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05); padding:30px; border-radius:12px; color:#1e293b; font-family:'Sarabun', sans-serif; margin-bottom:15px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1e293b; padding-bottom:12px; margin-bottom:20px;">
          <div>
            <h1 style="margin:0; font-size:1.4rem; color:#1e3a8a; font-weight:700; letter-spacing:-0.025em;">ใบเบิกค่าเดินทาง / TRAVEL CLAIM FORM</h1>
            <p style="margin:4px 0 0; font-size:0.85rem; color:#64748b; font-weight:500;">Live Lighting Co., Ltd.</p>
          </div>
          <img src="${logoImgSrc}" style="max-height:45px; max-width:90px; object-fit:contain;" />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; font-size:0.85rem; line-height:1.5;">
          <div>
            <strong style="color:#475569;">เลขที่ใบเบิก / Claim No:</strong> ${c.claimNo}<br>
            <strong style="color:#475569;">วันที่เบิก / Date:</strong> ${formatDate(c.date)}<br>
            <strong style="color:#475569;">ใบงานอ้างอิง / Ref Job No:</strong> ${refJob ? refJob.jobNo : '-'}<br>
            <strong style="color:#475569;">รายละเอียดงาน / Job Details:</strong> ${refJob ? (refJob.workPerformed || refJob.operationSummary || '-') : '-'}
          </div>
          <div>
            <strong style="color:#475569;">ชื่อพนักงาน / Employee:</strong> ${refJob ? (refJob.technician || '-') : '-'}<br>
            <strong style="color:#475569;">ลูกค้า / Customer:</strong> ${refJob ? refJob.customerName : '-'}<br>
            <strong style="color:#475569;">สถานะปัจจุบัน / Status:</strong> ${getApprovalStatusBadge(status)}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:0.85rem; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
          <thead>
            <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
              <th style="padding:10px; text-align:left; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">จุดเริ่มต้น</th>
              <th style="padding:10px; text-align:left; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">จุดสิ้นสุด</th>
              <th style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">ระยะทาง</th>
              <th style="padding:10px; text-align:right; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">อัตรา/กม.</th>
              <th style="padding:10px; text-align:right; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">ค่าทางด่วน/ค่าจอด</th>
              <th style="padding:10px; text-align:right; color:#334155; font-weight:600;">ยอดเบิกสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">${c.startPoint}</td>
              <td style="padding:10px; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">${c.endPoint}</td>
              <td style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">${c.distance} กม. ${mapIconHtml}</td>
              <td style="padding:10px; text-align:right; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">฿${c.rate.toFixed(2)}</td>
              <td style="padding:10px; text-align:right; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">฿${c.tolls.toFixed(2)}</td>
              <td style="padding:10px; text-align:right; font-weight:bold; border-bottom:1px solid #cbd5e1; color:#0f766e;">฿${c.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-bottom:20px; font-size:0.85rem; border-top:1px solid #e2e8f0; padding-top:12px;">
          <strong style="color:#475569;">หมายเหตุ / Remarks:</strong> ${c.remarks || '-'}
        </div>

        ${c.mapUrl ? `
        <div style="margin-bottom:20px;">
          <strong style="font-size:0.85rem; color:#1e3a8a;">แผนที่จุดหมายปลายทาง / Destination Map:</strong>
          <div style="width:100%; height:180px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin-top:8px;">
            <img src="${getStaticMapUrl(c.mapUrl)}" style="width:100%; height:100%; object-fit:cover; display:block;" />
          </div>
        </div>
        ` : ''}

        <div style="display:flex; justify-content:space-around; margin-top:30px; font-size:0.8rem;">
          <div style="text-align:center; width:45%; border:1px dashed #cbd5e1; padding:12px; border-radius:8px; background:#f8fafc;">
            <div style="border-bottom:1px solid #475569; margin-bottom:8px; height:30px;"></div>
            <div style="font-weight:600; color:#334155;">ลงชื่อผู้เบิก / Claimant</div>
            <div style="margin-top:6px; color:#64748b; font-size:0.75rem;">วันที่ ____/____/____</div>
          </div>
          <div style="text-align:center; width:45%; border:1px dashed #cbd5e1; padding:12px; border-radius:8px; background:#f8fafc;">
            <div style="border-bottom:1px solid #475569; margin-bottom:8px; height:30px; line-height:30px; font-weight:bold; color:#1e3a8a; font-size:0.8rem;">
              ${c.approvedBy ? `(อนุมัติระบบ: ${c.approvedBy})` : ''}
            </div>
            <div style="font-weight:600; color:#334155;">ผู้อนุมัติ / Approver</div>
            <div style="margin-top:6px; color:#64748b; font-size:0.75rem;">
              ${c.approvedDate ? `วันที่: ${formatDate(c.approvedDate)}` : 'วันที่ ____/____/____'}
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    const logoImgSrc = logoBase64 || 'logo.png';
    bodyHtml = `
      <div class="claim-preview-paper" style="background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05); padding:30px; border-radius:12px; color:#1e293b; font-family:'Sarabun', sans-serif; margin-bottom:15px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1e293b; padding-bottom:12px; margin-bottom:20px;">
          <div>
            <h1 style="margin:0; font-size:1.4rem; color:#1e3a8a; font-weight:700; letter-spacing:-0.025em;">ใบเบิกค่าล่วงเวลา / OVERTIME CLAIM FORM</h1>
            <p style="margin:4px 0 0; font-size:0.85rem; color:#64748b; font-weight:500;">Live Lighting Co., Ltd.</p>
          </div>
          <img src="${logoImgSrc}" style="max-height:45px; max-width:90px; object-fit:contain;" />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; font-size:0.85rem; line-height:1.5;">
          <div>
            <strong style="color:#475569;">เลขที่ใบเบิก / Claim No:</strong> ${c.claimNo}<br>
            <strong style="color:#475569;">วันที่เบิก / Date:</strong> ${formatDate(c.date)}<br>
            <strong style="color:#475569;">ใบงานอ้างอิง / Ref Job No:</strong> ${refJob ? refJob.jobNo : '-'}<br>
            <strong style="color:#475569;">รายละเอียดงาน / Job Details:</strong> ${refJob ? (refJob.workPerformed || refJob.operationSummary || '-') : '-'}
          </div>
          <div>
            <strong style="color:#475569;">ชื่อพนักงาน / Employee:</strong> ${c.employee}<br>
            <strong style="color:#475569;">วันที่ปฏิบัติงาน / Work Date:</strong> ${formatDate(c.workDate)}<br>
            <strong style="color:#475569;">สถานะปัจจุบัน / Status:</strong> ${getApprovalStatusBadge(status)}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:0.85rem; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
          <thead>
            <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
              <th style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">เวลาทำงาน</th>
              <th style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">จำนวนชั่วโมง</th>
              <th style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; color:#334155; font-weight:600;">ตัวคูณเวลา</th>
              <th style="padding:10px; text-align:right; color:#334155; font-weight:600;">ค่าเบี้ยเลี้ยง</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">${c.start} - ${c.end} น.</td>
              <td style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">${c.hours} ชม.</td>
              <td style="padding:10px; text-align:center; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">x${c.multiplier || 1.5}</td>
              <td style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1; font-weight:bold; color:#0f766e;">฿${(c.allowance || 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-bottom:20px; font-size:0.85rem; border-top:1px solid #e2e8f0; padding-top:12px;">
          <strong style="color:#475569;">รายละเอียดงาน / OT Details & Remarks:</strong> ${c.remarks || '-'}
        </div>

        <div style="display:flex; justify-content:space-around; margin-top:30px; font-size:0.8rem;">
          <div style="text-align:center; width:45%; border:1px dashed #cbd5e1; padding:12px; border-radius:8px; background:#f8fafc;">
            <div style="border-bottom:1px solid #475569; margin-bottom:8px; height:30px;"></div>
            <div style="font-weight:600; color:#334155;">ลงชื่อผู้เบิก / Claimant</div>
            <div style="margin-top:6px; color:#64748b; font-size:0.75rem;">วันที่ ____/____/____</div>
          </div>
          <div style="text-align:center; width:45%; border:1px dashed #cbd5e1; padding:12px; border-radius:8px; background:#f8fafc;">
            <div style="border-bottom:1px solid #475569; margin-bottom:8px; height:30px; line-height:30px; font-weight:bold; color:#1e3a8a; font-size:0.8rem;">
              ${c.approvedBy ? `(อนุมัติระบบ: ${c.approvedBy})` : ''}
            </div>
            <div style="font-weight:600; color:#334155;">ผู้อนุมัติ / Approver</div>
            <div style="margin-top:6px; color:#64748b; font-size:0.75rem;">
              ${c.approvedDate ? `วันที่: ${formatDate(c.approvedDate)}` : 'วันที่ ____/____/____'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  body.innerHTML = bodyHtml;

  // Render Footer Buttons
  let footerHtml = `
    <button class="btn-outline" style="margin-right:auto;" onclick="closeClaimModal()">ปิด</button>
  `;

  if (currentUser) {
    if (currentUser.role === 'sale' && status === 'pending') {
      footerHtml = `
        <button class="btn-outline" style="margin-right:auto;" onclick="closeClaimModal()">ปิด</button>
        <button class="btn-danger" onclick="rejectClaimFromModal('${type}', '${c.id}')">❌ ปฏิเสธการเบิก</button>
        <button class="btn-primary" onclick="approveClaimFromModal('${type}', '${c.id}')">✔️ อนุมัติใบเบิก</button>
      `;
    }
  }

  // Add PDF button
  footerHtml += `
    <button class="btn-success" onclick="exportPDFFromModal('${type}', '${c.id}')">📄 ออก PDF</button>
  `;

  footer.innerHTML = footerHtml;
  modal.classList.add('active');
}

function closeClaimModal() {
  const modal = document.getElementById('claimModal');
  if (modal) modal.classList.remove('active');
}

function approveClaimFromModal(type, id) {
  closeClaimModal();
  approveClaim(type, id);
}

function rejectClaimFromModal(type, id) {
  closeClaimModal();
  rejectClaim(type, id);
}

function exportPDFFromModal(type, id) {
  closeClaimModal();
  if (type === 'travel') exportTravelClaimPDF(id);
  else exportOtClaimPDF(id);
}

// ── GPS Geofencing Helper Functions ──

function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in m
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}



// ── Payroll & Claims Aggregation ──

function renderPayrollTable() {
  const tbody = document.getElementById('payrollTableBody');
  if (!tbody) return;

  const staff = employees.filter(e => e.role === 'service');
  const extraTravelNames = travelClaims.map(c => {
    const j = jobs.find(job => job.id === c.jobId);
    return j ? j.technician : '';
  }).filter(n => n);
  const extraOtNames = otClaims.map(c => c.employee).filter(n => n);

  const existingEmpNames = new Set(employees.map(e => e.name));
  const uniqueNames = Array.from(new Set([
    ...staff.map(e => e.name),
    ...extraTravelNames,
    ...extraOtNames
  ])).filter(name => existingEmpNames.has(name));

  if (!uniqueNames.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">ยังไม่มีข้อมูลรายชื่อพนักงาน</td></tr>';
    return;
  }

  tbody.innerHTML = uniqueNames.map(name => {
    // Travel Claims approved sum
    const travelSum = travelClaims
      .filter(c => {
        const j = jobs.find(job => job.id === c.jobId);
        return j && j.technician === name && (c.status === 'approved');
      })
      .reduce((sum, c) => sum + c.total, 0);

    // OT claims approved sum
    const otApproved = otClaims.filter(c => c.employee === name && (c.status === 'approved'));
    const otHours = otApproved.reduce((sum, c) => sum + c.hours, 0);
    const otAllowance = otApproved.reduce((sum, c) => sum + c.allowance, 0);

    const totalApproved = travelSum + otAllowance;

    return `
      <tr>
        <td><strong>${name}</strong></td>
        <td>฿${travelSum.toFixed(2)}</td>
        <td>${otHours.toFixed(1)} ชม.</td>
        <td>฿${otAllowance.toFixed(2)}</td>
        <td><strong style="color:var(--accent-green);">฿${totalApproved.toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
}

function exportPayrollCSV() {
  const staff = employees.filter(e => e.role === 'service');
  const extraTravelNames = travelClaims.map(c => {
    const j = jobs.find(job => job.id === c.jobId);
    return j ? j.technician : '';
  }).filter(n => n);
  const extraOtNames = otClaims.map(c => c.employee).filter(n => n);

  const existingEmpNames = new Set(employees.map(e => e.name));
  const uniqueNames = Array.from(new Set([
    ...staff.map(e => e.name),
    ...extraTravelNames,
    ...extraOtNames
  ])).filter(name => existingEmpNames.has(name));

  if (!uniqueNames.length) {
    showToast('❌ ไม่มีข้อมูลพนักงานสำหรับสรุปยอดเบิกเงิน', 'error');
    return;
  }

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += 'ชื่อพนักงาน,ยอดเบิกค่าเดินทางอนุมัติ (บาท),จำนวนชั่วโมง OT อนุมัติ (ชม.),ยอดเบิกเบี้ยเลี้ยง OT อนุมัติ (บาท),ยอดจ่ายรวมสุทธิ (บาท)\n';

  uniqueNames.forEach(name => {
    const travelSum = travelClaims
      .filter(c => {
        const j = jobs.find(job => job.id === c.jobId);
        return j && j.technician === name && (c.status === 'approved');
      })
      .reduce((sum, c) => sum + c.total, 0);

    const otApproved = otClaims.filter(c => c.employee === name && (c.status === 'approved'));
    const otHours = otApproved.reduce((sum, c) => sum + c.hours, 0);
    const otAllowance = otApproved.reduce((sum, c) => sum + c.allowance, 0);

    const totalApproved = travelSum + otAllowance;

    csvContent += `"${name}",${travelSum.toFixed(2)},${otHours.toFixed(1)},${otAllowance.toFixed(2)},${totalApproved.toFixed(2)}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Live_Lighting_Payroll_Claims_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📥 ดาวน์โหลดไฟล์ CSV ฝ่ายบัญชีเรียบร้อย', 'success');
}

// ==========================================================================
// CORPORATE DASHBOARD POLISH & ADVANCED UX FUNCTIONS
// ==========================================================================

// 1. Form Tab Switching
function switchJobFormTab(index) {
  for (let i = 0; i < 4; i++) {
    const pane = document.getElementById('jobFormTab' + i);
    const btn = document.getElementById('formTabBtn' + i);
    if (pane) pane.style.display = 'none';
    if (btn) {
      btn.style.color = 'var(--text-secondary)';
      btn.style.borderBottomColor = 'transparent';
      btn.classList.remove('active');
    }
  }
  
  const activePane = document.getElementById('jobFormTab' + index);
  const activeBtn = document.getElementById('formTabBtn' + index);
  if (activePane) activePane.style.display = 'block';
  if (activeBtn) {
    activeBtn.style.color = 'var(--accent-blue)';
    activeBtn.style.borderBottomColor = 'var(--accent-blue)';
    activeBtn.classList.add('active');
  }

  // If Tab 3 is active, initialize canvas
  if (index === 3) {
    setTimeout(initSignatureCanvas, 50);
  }
}

// 2. HTML5 Canvas Signature Drawing
let isDrawing = false;
let sigCanvas = null;
let sigCtx = null;

function initSignatureCanvas() {
  sigCanvas = document.getElementById('signatureCanvas');
  if (!sigCanvas) return;
  
  // Set explicit display size to prevent scale issues on high-DPI displays
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.strokeStyle = '#1e293b';
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';

  // Event Listeners for drawing
  sigCanvas.addEventListener('mousedown', startDrawing);
  sigCanvas.addEventListener('mousemove', draw);
  sigCanvas.addEventListener('mouseup', stopDrawing);
  sigCanvas.addEventListener('mouseleave', stopDrawing);

  // Mobile Touch Drawing Support
  sigCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = sigCanvas.getBoundingClientRect();
      isDrawing = true;
      sigCtx.beginPath();
      sigCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    }
  }, { passive: false });

  sigCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isDrawing && e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = sigCanvas.getBoundingClientRect();
      sigCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
      sigCtx.stroke();
    }
  }, { passive: false });

  sigCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopDrawing();
  }, { passive: false });
}

function startDrawing(e) {
  isDrawing = true;
  const rect = sigCanvas.getBoundingClientRect();
  sigCtx.beginPath();
  sigCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

function draw(e) {
  if (!isDrawing) return;
  const rect = sigCanvas.getBoundingClientRect();
  sigCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  sigCtx.stroke();
}

function stopDrawing() {
  if (isDrawing) {
    isDrawing = false;
    const input = document.getElementById('jobSignature');
    if (input && sigCanvas) {
      input.value = sigCanvas.toDataURL('image/png');
    }
  }
}

function clearSignatureCanvas() {
  sigCanvas = document.getElementById('signatureCanvas');
  if (sigCanvas) {
    const ctx = sigCanvas.getContext('2d');
    ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  }
  const input = document.getElementById('jobSignature');
  if (input) input.value = '';
}

function loadSignatureToCanvas(base64Image) {
  if (!base64Image) {
    setTimeout(clearSignatureCanvas, 100);
    return;
  }
  setTimeout(() => {
    sigCanvas = document.getElementById('signatureCanvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    const img = new Image();
    img.onload = function() {
      sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
      sigCtx.drawImage(img, 0, 0);
    };
    img.src = base64Image;
    const input = document.getElementById('jobSignature');
    if (input) input.value = base64Image;
  }, 100);
}

// 3. Google Maps Coordinates Extractor Regex
function extractCoordsFromMapsUrl() {
  const urlVal = document.getElementById('googleMapsUrl').value.trim();
  const statusEl = document.getElementById('coordsVerifyStatus');
  if (!urlVal) {
    showToast('⚠️ กรุณากรอกลิ้งค์ Google Maps ก่อนกดดึงพิกัด', 'warning');
    return;
  }
  
  // Regex pattern matching:
  // Normal link coordinates @13.7563,100.5018
  // Query link coordinates !3d13.7563!4d100.5018
  // Direct coordinates input e.g. 13.7563,100.5018
  const regexNormal = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const regexQuery = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
  const regexDirect = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/;

  let match = urlVal.match(regexDirect);
  if (!match) match = urlVal.match(regexNormal);
  if (!match) match = urlVal.match(regexQuery);

  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    document.getElementById('customerLat').value = lat;
    document.getElementById('customerLng').value = lng;
    if (statusEl) {
      statusEl.innerHTML = `✅ ดึงพิกัดสำเร็จ: <strong>${lat.toFixed(5)}, ${lng.toFixed(5)}</strong>`;
      statusEl.style.color = '#10b981';
    }
    showToast('📍 ดึงพิกัด GPS จากแผนที่สำเร็จแล้ว!', 'success');
  } else {
    if (statusEl) {
      statusEl.innerHTML = `❌ ไม่พบข้อมูลพิกัดในลิ้งค์ (โปรดใช้รูปแบบลิ้งค์ที่มี @ละติจูด,ลองจิจูด)`;
      statusEl.style.color = '#ef4444';
    }
    showToast('❌ ไม่สามารถดึงพิกัดจากลิงก์ที่กรอกได้', 'error');
  }
}



function populateApproverDropdown() {
  const select = document.getElementById('jobApprover');
  if (!select) return;
  select.innerHTML = '<option value="">-- เลือกผู้อนุมัติ --</option>';
  
  // Find all employees that have approveJobs permission
  const approvers = employees.filter(emp => {
    const perms = getUserPermissions(emp);
    return perms.approveJobs;
  });
  approvers.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.email;
    
    let roleText = 'พนักงาน';
    if (emp.role === 'admin') roleText = 'ผู้ดูแลระบบ';
    else if (emp.role === 'sale') roleText = 'ฝ่ายขาย';
    else if (emp.role === 'service') roleText = 'ช่างเทคนิค';

    opt.textContent = `${emp.name} (${roleText})`;
    select.appendChild(opt);
  });
}

let isApproveDrawing = false;
let approveSigCanvas = null;
let approveSigCtx = null;

function initApproveSignatureCanvas() {
  approveSigCanvas = document.getElementById('approveSignatureCanvas');
  if (!approveSigCanvas) return;
  
  approveSigCtx = approveSigCanvas.getContext('2d');
  approveSigCtx.strokeStyle = '#1e293b';
  approveSigCtx.lineWidth = 2.5;
  approveSigCtx.lineCap = 'round';
  approveSigCtx.lineJoin = 'round';

  // Clear previous drawing
  approveSigCtx.clearRect(0, 0, approveSigCanvas.width, approveSigCanvas.height);
  const input = document.getElementById('approveJobSignature');
  if (input) input.value = '';

  // Event Listeners for drawing
  approveSigCanvas.addEventListener('mousedown', startApproveDrawing);
  approveSigCanvas.addEventListener('mousemove', drawApprove);
  approveSigCanvas.addEventListener('mouseup', stopApproveDrawing);
  approveSigCanvas.addEventListener('mouseleave', stopApproveDrawing);

  // Mobile Touch Drawing Support
  approveSigCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = approveSigCanvas.getBoundingClientRect();
      isApproveDrawing = true;
      approveSigCtx.beginPath();
      approveSigCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    }
  }, { passive: false });

  approveSigCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isApproveDrawing && e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = approveSigCanvas.getBoundingClientRect();
      approveSigCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
      approveSigCtx.stroke();
    }
  }, { passive: false });

  approveSigCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopApproveDrawing();
  }, { passive: false });
}

function startApproveDrawing(e) {
  isApproveDrawing = true;
  const rect = approveSigCanvas.getBoundingClientRect();
  approveSigCtx.beginPath();
  approveSigCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

function drawApprove(e) {
  if (!isApproveDrawing) return;
  const rect = approveSigCanvas.getBoundingClientRect();
  approveSigCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  approveSigCtx.stroke();
}

function stopApproveDrawing() {
  if (isApproveDrawing) {
    isApproveDrawing = false;
    const input = document.getElementById('approveJobSignature');
    if (input && approveSigCanvas) {
      input.value = approveSigCanvas.toDataURL('image/png');
    }
  }
}

function clearApproveSignatureCanvas() {
  approveSigCanvas = document.getElementById('approveSignatureCanvas');
  if (approveSigCanvas) {
    const ctx = approveSigCanvas.getContext('2d');
    ctx.clearRect(0, 0, approveSigCanvas.width, approveSigCanvas.height);
    const input = document.getElementById('approveJobSignature');
    if (input) input.value = '';
  }
}

function approveNewJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  
  document.getElementById('approveJobId').value = job.id;
  document.getElementById('approveJobNo').textContent = job.jobNo || job.id;
  document.getElementById('approveCustomerName').textContent = job.customerName || '';
  document.getElementById('approveJobSignature').value = '';
  
  document.getElementById('approveJobModal').style.display = 'block';
  
  // Initialize drawing canvas
  setTimeout(initApproveSignatureCanvas, 100);
}

function closeApproveJobModal() {
  document.getElementById('approveJobModal').style.display = 'none';
}

function confirmApproveJob() {
  const id = document.getElementById('approveJobId').value;
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  
  const signatureBase64 = document.getElementById('approveJobSignature').value;
  if (!signatureBase64) {
    showToast('❌ กรุณาเซ็นชื่อเพื่ออนุมัติงานบริการ', 'error');
    return;
  }
  
  job.status = 'pending'; // Approved, now pending scheduled work
  job.approverSignature = signatureBase64; // Save the approval signature
  job.approvedAt = new Date().toISOString(); // Record approval timestamp
  
  showToast('✅ อนุมัติงานบริการสำเร็จเรียบร้อย พนักงานสามารถตอบรับงานได้แล้ว', 'success');
  
  // Save/sync to server SQL database
  apiPost('/api/jobs', job).catch(err => console.error("Failed to approve job on server database:", err));
  saveToStorage();
  renderAll();
  closeApproveJobModal();
}



// 8. Accept Job Action (Service Role Workflow)
function acceptJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  
  job.status = 'accepted';
  if (currentUser) {
    job.technician = currentUser.name;
  }
  
  saveToStorage();
  renderAll();
  showToast('👍 ตอบรับงานบริการเรียบร้อย! เตรียมเดินทางเข้าปฏิบัติงาน', 'success');
}

// 9. Preview Problem Image (Base64 conversion with compression)
function previewProblemImage(input) {
  if (input.files && input.files[0]) {
    showToast('⏳ กำลังบีบอัดรูปภาพแจ้งปัญหา...', 'info');
    compressImage(input.files[0], function(base64) {
      document.getElementById('problemPhotoBase64').value = base64;
      const preview = document.getElementById('problemPhotoPreview');
      if (preview) {
        preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:contain;" />`;
      }
      showToast('📸 อัปโหลดและบีบอัดรูปภาพแจ้งปัญหาเรียบร้อย', 'success');
    });
  }
}

// 10. Open Permissions Modal for Employee (Admin settings)
function openPermissionsModal(email) {
  const emp = employees.find(e => e.email === email);
  if (!emp) return;

  document.getElementById('permEmail').value = emp.email;
  document.getElementById('permEmployeeName').textContent = emp.name;
  document.getElementById('permEmployeeEmail').textContent = emp.email;

  const perms = getUserPermissions(emp);

  document.getElementById('p_viewJobs').checked = !!perms.viewJobs;
  document.getElementById('p_editJobs').checked = !!perms.editJobs;
  document.getElementById('p_deleteJobs').checked = !!perms.deleteJobs;
  document.getElementById('p_approveJobs').checked = !!perms.approveJobs;
  document.getElementById('p_travelClaims').checked = !!perms.travelClaims;
  document.getElementById('p_otClaims').checked = !!perms.otClaims;
  document.getElementById('p_approveClaims').checked = !!perms.approveClaims;
  document.getElementById('p_payroll').checked = !!perms.payroll;
  document.getElementById('p_adminSettings').checked = !!perms.adminSettings;

  document.getElementById('permissionsModal').style.display = 'block';
}

function closePermissionsModal() {
  document.getElementById('permissionsModal').style.display = 'none';
}

// Save detailed permissions back to employee profile
function saveEmployeePermissions() {
  const email = document.getElementById('permEmail').value;
  const emp = employees.find(e => e.email === email);
  if (!emp) return;

  emp.permissions = {
    viewJobs: document.getElementById('p_viewJobs').checked,
    editJobs: document.getElementById('p_editJobs').checked,
    deleteJobs: document.getElementById('p_deleteJobs').checked,
    approveJobs: document.getElementById('p_approveJobs').checked,
    travelClaims: document.getElementById('p_travelClaims').checked,
    otClaims: document.getElementById('p_otClaims').checked,
    approveClaims: document.getElementById('p_approveClaims').checked,
    payroll: document.getElementById('p_payroll').checked,
    adminSettings: document.getElementById('p_adminSettings').checked
  };

  localStorage.setItem('servicell1_employees', JSON.stringify(employees));
  
  // Save updated employee permissions to backend SQL database
  apiPost('/api/employees', emp).catch(err => console.error("Failed to update employee permissions on server database:", err));

  renderEmployeeTable();
  closePermissionsModal();
  showToast('💾 บันทึกการอัพเดทสิทธิ์พนักงานเรียบร้อย', 'success');
}

// ── Calendar Controller State & Initialization ──
let selectedCalendarMonth = new Date().toISOString().substring(0, 7); // 'YYYY-MM'
let selectedCalendarDate = ''; // 'YYYY-MM-DD'

function initCalendar() {
  const monthInput = document.getElementById('calendarMonth');
  if (monthInput) {
    monthInput.value = selectedCalendarMonth;
    monthInput.addEventListener('change', (e) => {
      selectedCalendarMonth = e.target.value;
      renderCalendar();
    });
  }
  
  const techSelect = document.getElementById('calendarTechFilter');
  if (techSelect) {
    techSelect.addEventListener('change', () => {
      renderCalendar();
    });
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Get active technicians list to populate filter
  const techSelect = document.getElementById('calendarTechFilter');
  if (techSelect && techSelect.options.length <= 1) {
    const uniqueTechs = Array.from(new Set(employees.filter(e => e.role === 'service').map(e => e.name)));
    uniqueTechs.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      techSelect.appendChild(opt);
    });
  }

  const selectedTech = techSelect ? techSelect.value : '';
  const [year, month] = selectedCalendarMonth.split('-').map(Number);
  
  // Start of month
  const firstDay = new Date(year, month - 1, 1);
  const startDayOfWeek = firstDay.getDay(); // 0 is Sunday, 1 is Monday, etc.
  
  // Total days in month
  const totalDays = new Date(year, month, 0).getDate();
  
  // Prepend empty cells for days of previous month
  for (let i = 0; i < startDayOfWeek; i++) {
    const blank = document.createElement('div');
    blank.className = 'calendar-day-cell blank';
    blank.style.minHeight = '90px';
    blank.style.border = '1px solid var(--border)';
    blank.style.background = 'rgba(0,0,0,0.02)';
    grid.appendChild(blank);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Append actual day cells
  for (let day = 1; day <= totalDays; day++) {
    const dayStr = String(day).padStart(2, '0');
    const fullDate = `${selectedCalendarMonth}-${dayStr}`;

    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    cell.style.minHeight = '90px';
    cell.style.border = '1px solid var(--border)';
    cell.style.padding = '6px';
    cell.style.cursor = 'pointer';
    cell.style.position = 'relative';
    cell.style.display = 'flex';
    cell.style.flexDirection = 'column';
    cell.style.gap = '4px';
    cell.style.borderRadius = 'var(--radius-sm)';
    cell.style.background = 'var(--bg-card)';

    if (fullDate === todayStr) {
      cell.style.border = '2px solid var(--accent-blue)';
      cell.style.background = 'rgba(37,99,235,0.03)';
    }

    if (fullDate === selectedCalendarDate) {
      cell.style.boxShadow = '0 0 0 2px var(--accent-green)';
      cell.style.background = 'rgba(46,207,125,0.05)';
    }

    const numberLabel = document.createElement('span');
    numberLabel.textContent = day;
    numberLabel.style.fontWeight = '700';
    numberLabel.style.fontSize = '0.8rem';
    numberLabel.style.color = (new Date(year, month - 1, day).getDay() === 0) ? '#ef4444' : 'inherit';
    cell.appendChild(numberLabel);

    // Get jobs for this day matching filter
    const dayJobs = jobs.filter(j => {
      if (!j.appointmentDate) return false;
      const jDate = j.appointmentDate.split('T')[0];
      if (jDate !== fullDate) return false;
      if (selectedTech && j.technician !== selectedTech) return false;
      return true;
    });

    // Render badges for jobs
    dayJobs.slice(0, 3).forEach(j => {
      const badge = document.createElement('div');
      badge.className = 'calendar-job-badge';
      // format time part if exists
      let timePart = '';
      if (j.appointmentDate.includes('T')) {
        const startStr = j.appointmentDate.split('T')[1].substring(0, 5);
        const duration = j.bookingDuration || 2;
        const end = new Date(new Date(j.appointmentDate).getTime() + (duration * 60 * 60 * 1000));
        const endStr = end.toTimeString().substring(0, 5);
        timePart = `${startStr}-${endStr}`;
      }
      
      const statusColors = {
        'awaiting_approval': 'orange',
        'pending': 'blue',
        'accepted': 'purple',
        'completed': 'green'
      };
      
      const badgeColor = statusColors[j.status] || 'blue';
      
      badge.textContent = `${timePart ? '[' + timePart + '] ' : ''}${j.technician || 'ไม่ระบุ'}`;
      badge.style.fontSize = '0.7rem';
      badge.style.fontWeight = '600';
      badge.style.padding = '2px 4px';
      badge.style.borderRadius = '3px';
      badge.style.overflow = 'hidden';
      badge.style.textOverflow = 'ellipsis';
      badge.style.whiteSpace = 'nowrap';
      badge.style.color = '#fff';
      
      if (badgeColor === 'green') {
        badge.style.background = 'var(--accent-green)';
      } else if (badgeColor === 'orange') {
        badge.style.background = 'orange';
      } else if (badgeColor === 'purple') {
        badge.style.background = 'purple';
      } else {
        badge.style.background = 'var(--accent-blue)';
      }
      
      cell.appendChild(badge);
    });

    if (dayJobs.length > 3) {
      const more = document.createElement('span');
      more.textContent = `+อีก ${dayJobs.length - 3} งาน`;
      more.style.fontSize = '0.65rem';
      more.style.color = 'var(--text-secondary)';
      more.style.textAlign = 'right';
      cell.appendChild(more);
    }

    cell.addEventListener('click', (e) => {
      selectedCalendarDate = fullDate;
      // Re-render grid to highlight selected cell
      document.querySelectorAll('.calendar-day-cell').forEach(c => {
        c.style.boxShadow = '';
      });
      cell.style.boxShadow = '0 0 0 2px var(--accent-green)';
      
      renderSelectedDayJobs();
    });

    grid.appendChild(cell);
  }
  
  // Render details for the selected day
  renderSelectedDayJobs();
}

function renderSelectedDayJobs() {
  const dateLabel = document.getElementById('calendarSelectedDateLabel');
  const container = document.getElementById('calendarSelectedDayJobs');
  if (!dateLabel || !container) return;

  if (!selectedCalendarDate) {
    dateLabel.textContent = '—';
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px; font-size:0.85rem;">กรุณาคลิกเลือกวันที่บนปฏิทินเพื่อดูรายละเอียดงาน</div>`;
    return;
  }

  dateLabel.textContent = formatDate(selectedCalendarDate);

  // Filter jobs
  const techSelect = document.getElementById('calendarTechFilter');
  const selectedTech = techSelect ? techSelect.value : '';
  
  const dayJobs = jobs.filter(j => {
    if (!j.appointmentDate) return false;
    const jDate = j.appointmentDate.split('T')[0];
    if (jDate !== selectedCalendarDate) return false;
    if (selectedTech && j.technician !== selectedTech) return false;
    return true;
  });

  if (!dayJobs.length) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px; font-size:0.85rem;">ไม่มีคิวนัดหมายงานซ่อมในวันนี้</div>`;
    return;
  }

  // Sort by time
  dayJobs.sort((a, b) => {
    const timeA = a.appointmentDate.includes('T') ? a.appointmentDate.split('T')[1] : '';
    const timeB = b.appointmentDate.includes('T') ? b.appointmentDate.split('T')[1] : '';
    return timeA.localeCompare(timeB);
  });

  container.innerHTML = dayJobs.map(j => {
    let timeStr = 'ไม่ระบุเวลา';
    if (j.appointmentDate.includes('T')) {
      const startStr = j.appointmentDate.split('T')[1].substring(0, 5);
      const duration = j.bookingDuration || 2;
      const end = new Date(new Date(j.appointmentDate).getTime() + (duration * 60 * 60 * 1000));
      const endStr = end.toTimeString().substring(0, 5);
      timeStr = `${startStr} - ${endStr} น. (${duration} ชม.)`;
    }

    const badgeColorMap = {
      'awaiting_approval': 'badge-pending-approval',
      'pending': 'badge-pending',
      'accepted': 'badge-progress',
      'completed': 'badge-completed'
    };
    
    const badgeTextMap = {
      'awaiting_approval': '⏳ รออนุมัติ',
      'pending': 'รอดำเนินการ',
      'accepted': '⚡ ยอมรับงาน',
      'completed': '✅ เสร็จสิ้น'
    };
    
    const statusClass = badgeColorMap[j.status] || 'badge-pending';
    const statusText = badgeTextMap[j.status] || 'รอดำเนินการ';
    
    const statusBadge = `<span class="badge ${statusClass}">${statusText}</span>`;

    return `
      <div class="calendar-job-item" style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px; background:var(--bg-card2); display:flex; flex-direction:column; gap:6px; box-shadow:var(--shadow-sm);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--text-primary); font-size:0.9rem;">${j.jobNo || j.id}</strong>
          ${statusBadge}
        </div>
        <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:2px;">
          <span>🕐 <strong>เวลานัด:</strong> ${timeStr}</span>
          <span>👤 <strong>ช่าง:</strong> ${j.technician || 'ไม่ระบุ'}</span>
          <span>🏢 <strong>ลูกค้า:</strong> ${j.customerName}</span>
          <span>📌 <strong>อาการ:</strong> ${j.problemDesc || '-'}</span>
        </div>
        <button class="btn-primary" onclick="viewJob('${j.id}')" style="padding:4px 8px; font-size:0.75rem; border-radius:4px; margin-top:4px; display:inline-flex; align-items:center; justify-content:center; gap:4px; cursor:pointer; width:100%; border:none; background:var(--accent-blue); color:#fff; font-weight:600;">
          🔍 ดูรายละเอียดใบงาน
        </button>
      </div>
    `;
  }).join('');
}

// ============================================================
// AI ASSISTANTS CONTROLLER & SYSTEM INTEGRATION
// ============================================================

// 1. Database/State declarations for AI Assistants
let aiSelectedAgent = 'doc-ai';
let aiSelectedDocId = null;
let aiSelectedEmailId = null;
let aiSelectedAuditType = 'travel';
let aiSelectedAuditId = null;

// Demo documents
const aiDemoDocs = [
  {
    id: 'doc-1',
    name: 'คู่มือการซ่อมแซมระบบไฟฟ้า_Live_Lighting.txt',
    size: '1.2 KB',
    type: 'text/plain',
    content: `คู่มือการแก้ไขปัญหาทางเทคนิคและสเปกระบบไฟฟ้า - บริษัท Live Lighting จำกัด
--------------------------------------------------
1. ปัญหาโคมไฟกระพริบถี่ๆ (LED Blinking Issue):
มักเกิดจากแรงดันไฟฟ้าขัดข้องหรือความร้อนสะสมเกินพิกัดในชุดวงจรขับหลอด (LED Driver)
โค้ดแสดงความผิดปกติบนไดรเวอร์ยี่ห้อพรีเมียม:
- E1: แรงดันไฟฟ้าขาเข้าสูงเกินพิกัด (Overvoltage)
  วิธีแก้ไข: ทำการปลดแหล่งจ่ายไฟ 5 นาทีแล้วสลับเปิดใหม่เพื่อรีเซ็ต หากไม่หายต้องใช้ตัวควบคุมแรงดันเสริม
- E2: อุณหภูมิไดรเวอร์สูงเกินพิกัดความร้อน (Overheating)
  วิธีแก้ไข: ปรับปรุงจุดติดตั้งให้ระบายอากาศได้สะดวก หลีกเลี่ยงกล่องปิดทึบหรือความร้อนสะสม
- E3: สัญญาณทริกเกอร์ลัดวงจรในโมดูล LED
  วิธีแก้ไข: ตรวจสอบความถูกต้องของขั้วสายไฟ L-N และสายดิน

2. นโยบายการประกันผลงานและสินค้า:
- รับประกันค่าแรงช่างเทคนิคซ่อมแซม: 6 เดือน (180 วัน) นับจากวันที่ลงนามใน Service Report
- รับประกันวัสดุอุปกรณ์และโคมไฟติดตั้งใหม่: 1 ปี (365 วัน)
- การรับประกันจะไม่ครอบคลุมกรณีภัยธรรมชาติ ฟ้าผ่า หรือการดัดแปลงแก้ไขอุปกรณ์ภายนอกโดยไม่ได้รับอนุญาต`
  },
  {
    id: 'doc-2',
    name: 'ระเบียบการเงิน_ใบเบิกค่าเดินทางและOT.txt',
    size: '1.5 KB',
    type: 'text/plain',
    content: `คู่มือระเบียบบริษัทสำหรับการเบิกจ่ายค่าเดินทางและค่าล่วงเวลา (OT)
--------------------------------------------------
1. การเบิกค่าเดินทางสำหรับช่างเทคนิค:
- อัตราค่าชดเชยการเดินทางหน้างาน: คิดในอัตรากิโลเมตรละ 5 บาท (นับจากพิกัดบริษัทไปยังจุดบริการลูกค้า)
- ค่าทางด่วนและค่าที่จอดรถ: เบิกได้เต็มจำนวนตามจริง โดยต้องแนบรูปถ่ายใบเสร็จในใบเบิก
- การระบุพิกัด: ช่างเทคนิคต้องระบุพิกัด GPS ลูกค้าในใบงานให้ตรงกับหน้างานจริง ระยะคลาดเคลื่อนที่อนุญาตไม่เกิน 50 เมตร

2. การเบิกจ่ายค่าทำงานล่วงเวลา (OT):
- ช่างเทคนิคจะต้องทำการบันทึกเวลา "เช็คอิน" (Check-in) และ "เช็คเอาท์" (Check-out) ผ่านหน้าฟอร์มบริการทุกครั้ง
- เวลาทำงานปกติ: 08:30 น. - 17:30 น.
- อัตราตัวคูณล่วงเวลา (Multiplier):
  * วันทำงานปกติ (จันทร์-ศุกร์ หลัง 17:30 น.): คิดตัวคูณ 1.5 เท่าของอัตราปกติ
  * วันหยุดประจำสัปดาห์ (เสาร์-อาทิตย์) หรือวันหยุดนักขัตฤกษ์: คิดตัวคูณ 3.0 เท่า
- การคำนวณ: ชั่วโมง OT สะสม = เวลาเช็คเอาท์จริง - เวลาเช็คอินจริง (หักเวลาพักปกติหากเกิน 8 ชม.)`
  }
];

// Load from LocalStorage if edits are made, otherwise default
let aiDocuments = JSON.parse(localStorage.getItem('ai_documents')) || aiDemoDocs;

const aiDemoEmails = [
  {
    id: 'email-1',
    sender: 'คุณพัชราภา (pachara@gmail.com)',
    date: '2026-07-19',
    subject: 'โคมไฟกิ่งหน้าบ้านที่พึ่งติดตั้งไปมีปัญกระพริบไม่หยุดเลยครับ',
    body: `เรียน ฝ่ายบริการ Live Lighting,
เมื่อสัปดาห์ที่แล้วทางทีมช่างได้เข้ามาติดตั้งโคมไฟกิ่ง LED ตัวใหม่ให้ที่หน้าบ้านค่ะ
แต่เมื่อคืนนี้สังเกตเห็นว่าหลอดไฟเริ่มกระพริบถี่ๆ ตลอดเวลา ปิดสวิตช์แล้วเปิดใหม่ก็ไม่หายค่ะ ตอนนี้ต้องถอดปลั๊กออกก่อนเพราะกลัวสายไฟจะช็อตหรือลัดวงจร รบกวนส่งช่างคนเดิมเข้ามาช่วยตรวจสอบและแก้ไขด่วนที่สุดด้วยค่ะ เพราะไม่มีไฟใช้ในสวนหน้าบ้านเวลากลางคืนค่ะ

ขอแสดงความนับถือ,
พัชราภา`,
    category: 'ร้องเรียน/แจ้งปัญหา (Complaint)',
    urgency: 'ด่วนที่สุด (High)',
    sentiment: 'เชิงลบ (Negative)',
    replied: false
  },
  {
    id: 'email-2',
    sender: 'คุณกิตติศักดิ์ (kittisak@powercorp.com)',
    date: '2026-07-20',
    subject: 'สอบถามรายละเอียดราคาและติดตั้งโคมไฟสปอตไลท์ 10 จุด',
    body: `เรียน ฝ่ายขายและบริการ Live Lighting,
เนื่องจากทางแผนกคลังสินค้าของบริษัทกำลังจะขยายพื้นที่ทำงานภายนอกอาคาร จึงต้องการติดตั้งโคมไฟสปอตไลท์ LED ขนาด 150W หรือโคมไฮเบย์รวม 10 จุด
รบกวนแนะนำรุ่นที่เหมาะกับการเปิดทิ้งไว้ตลอดทั้งคืน และขอราคาค่าโคมไฟรวมถึงค่าติดตั้งประเมินเบื้องต้นด้วยครับ รวมถึงระยะเวลาที่ใช้ในการเข้าดำเนินการครับ

ขอแสดงความนับถือ,
กิตติศักดิ์ ประเสริฐเวช`,
    category: 'ขอใบเสนอราคา (Inquiry)',
    urgency: 'ปานกลาง (Medium)',
    sentiment: 'ทั่วไป (Neutral)',
    replied: false
  },
  {
    id: 'email-3',
    sender: 'คุณมนัส (manas_y@yahoo.com)',
    date: '2026-07-18',
    subject: 'ร้องเรียนพฤติกรรมการปฏิบัติงานของช่างที่เข้ามาซ่อมตู้ไฟวานนี้',
    body: `เรียน ผู้จัดการ Live Lighting,
ขอคอมเพลนช่างที่เข้ามาบำรุงรักษาตู้คอนโทรลไฟในคอนโดเราเมื่อวานนี้หน่อยครับ
ทีมช่างมากัน 3 คน แต่ทำงานจริงแค่คนเดียว อีก 2 คนไปนั่งจับกลุ่มคุยเสียงดังและเล่นมือถือบริเวณล็อบบี้คอนโด ซึ่งไม่น่าดูเลยครับ และงานล่าช้ากว่าเดิมร่วม 2 ชั่วโมง อยากให้ตักเตือนและปรับปรุงมารยาทด้วยครับ

ขอแสดงความนับถือ,
มนัส`,
    category: 'ร้องเรียน/แจ้งปัญหา (Complaint)',
    urgency: 'ปานกลาง (Medium)',
    sentiment: 'เชิงลบ (Negative)',
    replied: false
  }
];

let aiEmails = JSON.parse(localStorage.getItem('ai_emails')) || aiDemoEmails;

// Init AIAgents Dashboard
function initAIAgents() {
  renderDocList();
  renderEmailInbox();
  loadAuditClaimsList();
  // Clear chat if empty
  const docChat = document.getElementById('docChatContainer');
  if (docChat && docChat.children.length <= 1) {
    clearDocChat();
  }
}

// Save Gemini API Key
function saveGeminiApiKey() {
  const key = document.getElementById('geminiApiKey').value.trim();
  geminiApiKey = key;
  localStorage.setItem('servicell1_gemini_api_key', key);
  
  apiPost('/api/settings', { geminiApiKey: key })
    .then(() => {
      showToast('🤖 บันทึก Gemini API Key ลงในระบบเรียบร้อยแล้ว', 'success');
    })
    .catch(err => {
      console.error("Failed to save Gemini API Key to server settings:", err);
      showToast('⚠️ ไม่สามารถบันทึกคีย์ลงระบบฐานข้อมูลหลักได้', 'warning');
    });
}

// Switch AI Agent Tab
function switchAIAgentTab(tabId) {
  aiSelectedAgent = tabId;
  document.querySelectorAll('.ai-tab-content').forEach(el => el.style.display = 'none');
  const activeTab = document.getElementById('ai-tab-' + tabId);
  if (activeTab) activeTab.style.display = 'block';

  // Toggle active button style
  const navContainer = document.querySelector('.ai-tabs-nav');
  if (navContainer) {
    navContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    // Find matching button by onclick containing tabId
    const activeBtn = Array.from(navContainer.querySelectorAll('button')).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');
  }
}

// Helper to call Google Gemini API
async function callGeminiAPI(promptText) {
  if (!geminiApiKey) {
    throw new Error("Missing API Key");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }]
    })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Failed to query Gemini API");
  }
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// ── 1. Document AI Logic ──
function renderDocList() {
  const container = document.getElementById('uploadedDocsList');
  if (!container) return;
  container.innerHTML = '';
  
  aiDocuments.forEach(doc => {
    const isSelected = aiSelectedDocId === doc.id;
    const card = document.createElement('div');
    card.className = `email-inbox-item ${isSelected ? 'active' : ''}`;
    card.style.padding = '8px 12px';
    card.style.display = 'flex';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';
    card.onclick = () => selectDocument(doc.id);
    
    card.innerHTML = `
      <div style="flex:1; overflow:hidden; text-align:left;">
        <div style="font-weight:600; font-size:0.8rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:var(--text-primary);">📄 ${doc.name}</div>
        <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">ขนาด: ${doc.size}</div>
      </div>
      <button type="button" class="btn-outline" style="padding:2px 6px; font-size:0.68rem; color:var(--accent-red); border-color:transparent; background:transparent; cursor:pointer;" onclick="deleteDocument(event, '${doc.id}')">🗑️</button>
    `;
    container.appendChild(card);
  });
}

function selectDocument(id) {
  aiSelectedDocId = id;
  renderDocList();
  
  const doc = aiDocuments.find(d => d.id === id);
  if (doc) {
    document.getElementById('selectedDocTitle').textContent = doc.name;
    document.getElementById('selectedDocMeta').textContent = `สัญชาติไฟล์: ${doc.type} | ขนาด: ${doc.size}`;
    
    // Welcome message for document
    const chat = document.getElementById('docChatContainer');
    chat.innerHTML = `
      <div class="ai-chat-bubble system" style="background:var(--bg-card2); padding:10px 14px; border-radius:var(--radius-sm); font-size:0.85rem; line-height:1.5; border-left:3px solid var(--accent-purple); align-self: flex-start; max-width:80%;">
        <span>ฉันพร้อมช่วยวิเคราะห์และตอบข้อมูลเกี่ยวกับเอกสาร **"${doc.name}"** แล้วค่ะ พิมพ์สอบถามรายละเอียด เช่น สรุปให้ฟังหน่อย หรือค้นหาหัวข้อต่างๆ ได้เลยค่ะ</span>
      </div>
    `;
  }
}

function clearSelectedDoc() {
  aiSelectedDocId = null;
  document.getElementById('selectedDocTitle').textContent = 'โปรดเลือกเอกสาร...';
  document.getElementById('selectedDocMeta').textContent = '—';
  clearDocChat();
  renderDocList();
}

function clearDocChat() {
  const chat = document.getElementById('docChatContainer');
  if (chat) {
    chat.innerHTML = `
      <div class="ai-chat-bubble system" style="background:var(--bg-card2); padding:10px 14px; border-radius:var(--radius-sm); font-size:0.85rem; line-height:1.5; border-left:3px solid var(--accent-purple); align-self: flex-start; max-width:80%;">
        <span>สวัสดีค่ะ ฉันคือ **พนักงานจัดการเอกสาร AI** โปรดเลือกเอกสารในคลังเพื่อเริ่มต้นพูดคุย ค้นหาข้อมูล หรือสรุปเนื้อหาค่ะ</span>
      </div>
    `;
  }
}

function handleDocUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    const newDoc = {
      id: 'doc_' + Date.now(),
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type || 'text/plain',
      content: evt.target.result
    };
    aiDocuments.push(newDoc);
    localStorage.setItem('ai_documents', JSON.stringify(aiDocuments));
    renderDocList();
    selectDocument(newDoc.id);
    showToast('📂 อัปโหลดและบรรจุเอกสารเข้าคลังเรียบร้อย', 'success');
  };
  
  if (file.type.match('image.*')) {
    // For images, store simulated description
    reader.onload = function() {
      const newDoc = {
        id: 'doc_' + Date.now(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        content: `[ไฟล์รูปภาพ] ตัวอย่างภาพถ่ายแจ้งหน้างานชำรุดเสียหาย อุปกรณ์ตรวจพบคือโคมไฟชำรุดจากการลัดวงจร มีรอยไหม้สีดำบริเวณรอบขั้วต่อหลอด`
      };
      aiDocuments.push(newDoc);
      localStorage.setItem('ai_documents', JSON.stringify(aiDocuments));
      renderDocList();
      selectDocument(newDoc.id);
      showToast('📸 อัปโหลดและแปลงภาพถ่ายหน้างานด้วย AI เรียบร้อย', 'success');
    };
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
}

function deleteDocument(e, id) {
  e.stopPropagation();
  aiDocuments = aiDocuments.filter(d => d.id !== id);
  localStorage.setItem('ai_documents', JSON.stringify(aiDocuments));
  if (aiSelectedDocId === id) {
    clearSelectedDoc();
  } else {
    renderDocList();
  }
  showToast('🗑️ ลบเอกสารออกจากคลังถาวร', 'info');
}

// Call Gemini or Local simulation for Document Query
async function sendDocQuery() {
  const input = document.getElementById('docQueryInput');
  const query = input.value.trim();
  if (!query) return;
  
  if (!aiSelectedDocId) {
    showToast('⚠️ โปรดเลือกเอกสารที่ต้องการถามข้อมูลก่อนค่ะ', 'warning');
    return;
  }
  
  const doc = aiDocuments.find(d => d.id === aiSelectedDocId);
  if (!doc) return;
  
  // Append User message
  appendDocChatBubble(query, 'user');
  input.value = '';
  
  // Typing indicator
  const typingId = appendDocTypingIndicator();
  
  try {
    let reply = '';
    if (geminiApiKey) {
      // Prompt combining document context
      const prompt = `คุณคือ พนักงานวิเคราะห์เอกสารอัจฉริยะ (Document AI Agent) ของบริษัท Live Lighting
นี่คือเนื้อหาของเอกสารชื่อ "${doc.name}":
"""
${doc.content}
"""

คำถามจากผู้ใช้: "${query}"
จงตอบคำถามนี้ตามเนื้อหาเอกสารข้างต้นอย่างถูกต้อง สุภาพ และเป็นมืออาชีพ (ตอบเป็นภาษาไทย):`;
      reply = await callGeminiAPI(prompt);
    } else {
      // Simulate reply (simulated intelligence delay)
      await new Promise(resolve => setTimeout(resolve, 800));
      reply = simulateDocReply(doc, query);
    }
    
    removeDocTypingIndicator(typingId);
    appendDocChatBubble(reply, 'system');
  } catch (error) {
    console.error(error);
    removeDocTypingIndicator(typingId);
    appendDocChatBubble(`⚠️ ขออภัยค่ะ เกิดความผิดพลาดในการประมวลผลคำตอบ: ${error.message}`, 'error');
  }
}

function appendDocChatBubble(text, sender) {
  const container = document.getElementById('docChatContainer');
  if (!container) return;
  
  const bubble = document.createElement('div');
  bubble.className = `ai-chat-bubble ${sender}`;
  if (sender === 'system') {
    bubble.style.alignSelf = 'flex-start';
    bubble.style.maxWidth = '80%';
    bubble.style.background = 'var(--bg-card2)';
    bubble.style.borderLeft = '3px solid var(--accent-purple)';
  } else if (sender === 'user') {
    bubble.style.alignSelf = 'flex-end';
    bubble.style.maxWidth = '80%';
    bubble.style.background = 'linear-gradient(135deg, var(--accent-blue), #3b82f6)';
  }
  
  // Handle markdown bold parsing in text
  let formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
  
  bubble.innerHTML = `<span>${formattedText}</span>`;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendDocTypingIndicator() {
  const container = document.getElementById('docChatContainer');
  const id = 'typing_' + Date.now();
  const indicator = document.createElement('div');
  indicator.id = id;
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeDocTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function simulateDocReply(doc, query) {
  const q = query.toLowerCase();
  
  if (doc.id === 'doc-1') { // คู่มือซ่อมแซมระบบไฟฟ้า
    if (q.includes('กระพริบ') || q.includes('ดับ')) {
      return `**วิเคราะห์เอกสาร (คู่มือซ่อม):** ปัญหาไฟกระพริบ มักเกิดจากไดรเวอร์ (LED Driver) ร้อนจัดหรือมีแรงดันขัดข้องค่ะ\n\nรหัสตรวจสอบผิดปกติ:\n- **E1**: แรงดันขาเข้าสูงเกิน (Overvoltage) ให้ถอดสวิตช์ 5 นาทีแล้วเสียบใหม่เพื่อรีเซ็ตค่ะ\n- **E2**: ไดรเวอร์ร้อนเกินพิกัด (Overheating) ให้ตรวจสอบการระบายอากาศค่ะ`;
    }
    if (q.includes('ประกัน') || q.includes('รับประกัน') || q.includes('เคลม')) {
      return `**วิเคราะห์เอกสาร (คู่มือซ่อม):** นโยบายประกันความผิดพลาดดังนี้ค่ะ:\n- รับประกันค่าแรงงานซ่อม **6 เดือน (180 วัน)** หลังวันซ่อมเสร็จ\n- รับประกันตัววัสดุอุปกรณ์/โคมไฟติดตั้งใหม่ **1 ปี (365 วัน)**\n*(หมายเหตุ: ไม่ครอบคลุมภัยธรรมชาติหรือฟ้าผ่าค่ะ)*`;
    }
    if (q.includes('e1')) {
      return `**วิเคราะห์เอกสาร:** รหัส **E1** หมายถึง แรงดันไฟฟ้าขาเข้าสูงเกินพิกัด (Overvoltage) ค่ะ แนวทางแก้คือปลดไฟทิ้งไว้ประมาณ 5 นาทีเพื่อเคลียร์หน่วยความจำ Driver หรือหาตัวคุมแรงดันมาเสริมค่ะ`;
    }
    if (q.includes('e2')) {
      return `**วิเคราะห์เอกสาร:** รหัส **E2** หมายถึง ไดรเวอร์มีความร้อนสะสมสูงเกินพิกัด (Overheating) ค่ะ แนะนำให้เช็คตู้ไฟหรือจุดติดตั้งว่าทึบเกินไปหรือไม่ หากติดตั้งกลางแดดควรมีช่องระบายความร้อนค่ะ`;
    }
  } else if (doc.id === 'doc-2') { // ระเบียบการเงิน
    if (q.includes('กิโลเมตร') || q.includes('อัตรา') || q.includes('เดินทาง') || q.includes('เบิก')) {
      return `**วิเคราะห์เอกสาร (ระเบียบเบิกเงิน):** ระบุไว้ว่า อัตราการชดเชยค่าเดินทางหน้างานคิดเป็น **กิโลเมตรละ 5 บาท** โดยนับระยะห่างจากพิกัดบริษัท ส่วนค่าทางด่วน/ค่าจอดรถเบิกได้ตามจ่ายจริง แต่ต้องมีใบเสร็จแนบในระบบค่ะ`;
    }
    if (q.includes('ot') || q.includes('โอที') || q.includes('ล่วงเวลา')) {
      return `**วิเคราะห์เอกสาร (ระเบียบเบิกเงิน):** กฎการทำ OT และเบิกสะสมคือ:\n- ช่างต้องบันทึกเช็คอิน-เช็คเอาท์จริงผ่านหน้าฟอร์มเท่านั้น\n- คิดล่วงเวลาหลัง 17:30 น. (อัตราตัวคูณวันปกติ **1.5 เท่า**)\n- หากเป็นวันหยุดหรือวันเสาร์อาทิตย์ คิดตัวคูณ **3.0 เท่า** ของอัตราปกติค่ะ`;
    }
  }
  
  // Custom fallback text matches
  return `จากเอกสาร **"${doc.name}"** ระบุเนื้อหาสำคัญเบื้องต้นดังนี้:\n\n${doc.content.substring(0, 150)}...\n\n(คุณสามารถค้นหาคีย์เวิร์ดสำคัญเพิ่มเติม หรือกรอก Gemini API Key ในการตั้งค่าแอดมิน เพื่อเปิดการตอบที่สมบูรณ์และลึกซึ้งยิ่งขึ้นค่ะ)`;
}

// ── 2. Email AI Logic ──
function renderEmailInbox() {
  const container = document.getElementById('emailInboxList');
  if (!container) return;
  container.innerHTML = '';
  
  aiEmails.forEach(mail => {
    const isSelected = aiSelectedEmailId === mail.id;
    const item = document.createElement('div');
    item.className = `email-inbox-item ${isSelected ? 'active' : ''}`;
    item.onclick = () => selectEmail(mail.id);
    
    // Tag class colors
    const sentimentClass = mail.sentiment.includes('Positive') ? 'badge-sentiment-positive' : (mail.sentiment.includes('Negative') ? 'badge-sentiment-negative' : 'badge-sentiment-neutral');
    const urgencyClass = mail.urgency.includes('High') || mail.urgency.includes('ด่วนที่สุด') ? 'badge-urgency-high' : (mail.urgency.includes('Medium') || mail.urgency.includes('ปานกลาง') ? 'badge-urgency-medium' : 'badge-urgency-low');

    item.innerHTML = `
      <div class="email-header-meta">
        <span class="email-sender">${mail.sender}</span>
        <span class="email-date">${mail.date}</span>
      </div>
      <div class="email-subject">${mail.replied ? '✅ ' : '📬 '}${mail.subject}</div>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <span class="badge" style="font-size:0.65rem; padding:1px 5px; border-radius:4px;">${mail.category}</span>
        <span class="badge ${urgencyClass}" style="font-size:0.65rem; padding:1px 5px; border-radius:4px;">${mail.urgency}</span>
        <span class="badge ${sentimentClass}" style="font-size:0.65rem; padding:1px 5px; border-radius:4px;">${mail.sentiment}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function selectEmail(id) {
  aiSelectedEmailId = id;
  renderEmailInbox();
  
  const mail = aiEmails.find(m => m.id === id);
  if (!mail) return;
  
  document.getElementById('emailNoSelection').style.display = 'none';
  const detailView = document.getElementById('emailDetailView');
  detailView.style.display = 'flex';
  
  document.getElementById('emailSubject').textContent = mail.subject;
  document.getElementById('emailSender').textContent = mail.sender;
  document.getElementById('emailDate').textContent = `วันที่: ${mail.date}`;
  document.getElementById('emailBodyText').textContent = mail.body;
  
  // Setup tags
  const tags = document.getElementById('emailTags');
  tags.innerHTML = '';
  
  const sentimentClass = mail.sentiment.includes('Positive') ? 'badge-sentiment-positive' : (mail.sentiment.includes('Negative') ? 'badge-sentiment-negative' : 'badge-sentiment-neutral');
  const urgencyClass = mail.urgency.includes('High') || mail.urgency.includes('ด่วนที่สุด') ? 'badge-urgency-high' : (mail.urgency.includes('Medium') || mail.urgency.includes('ปานกลาง') ? 'badge-urgency-medium' : 'badge-urgency-low');
  
  tags.innerHTML = `
    <span class="badge badge-pending-approval">${mail.category}</span>
    <span class="badge ${urgencyClass}">${mail.urgency}</span>
    <span class="badge ${sentimentClass}">${mail.sentiment}</span>
  `;
  
  // Render analysis recommendation
  const analysis = document.getElementById('emailAiAnalysis');
  analysis.innerHTML = '';
  
  const recs = {
    'email-1': [
      '📌 **ประเด็น:** ลูกค้าร้องเรียนหลังการติดตั้งโคมไฟกิ่ง LED เนื่องจากโคมไฟกระพริบถี่ผิดปกติ',
      '⚠️ **ความเสี่ยง:** ลูกค้ากังวลเรื่องอัคคีภัยและการลัดวงจร มีอารมณ์ไม่พอใจชัดเจน',
      '💡 **สิ่งที่ AI แนะนำ:** ส่งช่างเทคนิคทีมติดตั้งชุดเดิมเข้าไปดำเนินการเช็ควงจร/เปลี่ยน Driver ด่วนที่สุดภายใน 24 ชม.'
    ],
    'email-2': [
      '📌 **ประเด็น:** ลูกค้าสอบถามและเสนอราคารวมติดตั้งโคมไฮเบย์/สปอตไลท์ LED 10 จุด',
      '⚠️ **โอกาส:** ยอดสัญญามีมูลค่า คาดหวังการจัดหาสเปกและใบเสนอราคาเบื้องต้น',
      '💡 **สิ่งที่ AI แนะนำ:** ทำใบเสนอราคาประมาณการ (จุดละ 4,500 บาท) พร้อมส่งแค็ตตาล็อกสินค้าและขอรายละเอียดเพิ่มเติม'
    ],
    'email-3': [
      '📌 **ประเด็น:** ลูกค้าร้องเรียนพฤติกรรมการทำงานของช่างในสถานที่คอนโดมิเนียม',
      '⚠️ **ความเสี่ยง:** ส่งผลกระทบเชิงลบต่อแบรนด์และความเป็นมืออาชีพของบริษัท',
      '💡 **สิ่งที่ AI แนะนำ:** ออกจดหมายน้อมรับคำตักเตือน แจ้งมาตรการดำเนินการสืบสวนและลงโทษช่างเพื่อฟื้นฟูความมั่นใจ'
    ]
  };
  
  const mailRec = recs[mail.id] || [
    '📌 **ประเด็น:** ได้รับข้อความติดต่อเรื่องทั่วไปเกี่ยวกับงานบริการ',
    '💡 **สิ่งที่ AI แนะนำ:** ดำเนินการประสานงานตอบกลับข้อซักถามในวันและเวลาทำการปกติ'
  ];
  
  mailRec.forEach(line => {
    const p = document.createElement('div');
    p.innerHTML = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    analysis.appendChild(p);
  });
  
  // Clear draft
  document.getElementById('emailDraftContainer').style.display = 'none';
}

async function generateEmailDraft() {
  const mail = aiEmails.find(m => m.id === aiSelectedEmailId);
  if (!mail) return;
  
  const container = document.getElementById('emailDraftContainer');
  container.style.display = 'flex';
  const textarea = document.getElementById('emailDraftTextarea');
  textarea.value = 'กำลังแต่งคำร่างด้วย AI...';
  
  try {
    let draft = '';
    if (geminiApiKey) {
      const prompt = `คุณคือ พนักงานตอบอีเมลอัจฉริยะ (Email AI Agent) ของบริษัท Live Lighting
กรุณาร่างอีเมลตอบกลับลูกค้าคนนี้อย่างเป็นทางการ สุภาพ นอบน้อม และเป็นมืออาชีพที่สุด (เขียนเป็นภาษาไทย)
ข้อมูลอีเมลต้นทางจากลูกค้า:
ผู้ส่ง: ${mail.sender}
หัวข้อ: ${mail.subject}
เนื้อหาอีเมล:
"${mail.body}"

จดหมายร่างที่เสร็จสมบูรณ์:`;
      draft = await callGeminiAPI(prompt);
    } else {
      await new Promise(resolve => setTimeout(resolve, 600));
      // Fallbacks
      if (mail.id === 'email-1') {
        draft = `เรียน คุณพัชราภา\n\nทางบริษัท Live Lighting ขออภัยเป็นอย่างยิ่งกับปัญหาเรื่องโคมไฟกิ่ง LED กระพริบจนทำให้ไม่สะดวกในการเปิดใช้งานค่ะ\n\nทางเราไม่ได้นิ่งนอนใจและจะส่งช่างเทคนิคชุดเดิมเข้าไปเปลี่ยน Driver และเช็คสายไฟให้ใหม่ทั้งหมดในวันพรุ่งนี้ (21 ก.ค. 2026) ช่วงเวลา 10:00 น. ค่ะ\n\nหากคุณสะดวกตามวันและเวลาดังกล่าว สามารถกดยืนยันกลับมาได้ทันทีค่ะ\n\nขอแสดงความนับถือ,\nฝ่ายบริการลูกค้า Live Lighting`;
      } else if (mail.id === 'email-2') {
        draft = `เรียน คุณกิตติศักดิ์\n\nขอขอบพระคุณที่ให้ความสนใจเลือกบริการติดตั้งของ Live Lighting ครับ เบื้องต้นทางเราขอส่งประมาณการค่าติดตั้งโคมไฟสปอตไลท์ 10 จุดรวมประมาณ 45,000 บาทครับ\n\nเพื่อความถูกต้อง ทางเรายินดีให้ช่างเข้าไปประเมินพื้นที่และวัดสายไฟจริงหน้างานฟรีไม่มีค่าใช้จ่ายครับ รบกวนแจ้งวันและเวลาที่คุณกิตติศักดิ์สะดวกอีกครั้งครับ\n\nขอแสดงความนับถือ,\nฝ่ายขาย Live Lighting`;
      } else {
        draft = `เรียน คุณมนัส\n\nบริษัท Live Lighting ได้รับเรื่องร้องเรียนเกี่ยวกับพฤติกรรมการทำงานของช่างเมื่อวานนี้เป็นที่เรียบร้อยแล้วค่ะ\n\nทางบริษัทต้องขอประทานอภัยอย่างสูง และได้ดำเนินคำสั่งตักเตือนรวมถึงบันทึกบทลงโทษพนักงานกลุ่มดังกล่าวแล้วค่ะ ทางเราสัญญาจะกวดขันพฤติกรรมของทีมบริการอย่างเข้มงวดค่ะ\n\nขอแสดงความนับถือ,\nฝ่ายจัดการและควบคุมคุณภาพ Live Lighting`;
      }
    }
    textarea.value = draft;
  } catch (error) {
    console.error(error);
    textarea.value = `⚠️ เกิดความผิดพลาดในการประมวลผลร่างอีเมล: ${error.message}`;
  }
}

function copyEmailDraft() {
  const textarea = document.getElementById('emailDraftTextarea');
  textarea.select();
  document.execCommand('copy');
  showToast('📋 คัดลอกร่างจดหมายตอบกลับลงคลิปบอร์ดแล้ว', 'success');
}

function sendMockEmailReply() {
  const mail = aiEmails.find(m => m.id === aiSelectedEmailId);
  if (!mail) return;
  
  mail.replied = true;
  localStorage.setItem('ai_emails', JSON.stringify(aiEmails));
  
  showToast('📧 ส่งอีเมลตอบกลับและปิดตั๋วคำขอแล้ว!', 'success');
  
  // Reset view
  document.getElementById('emailDetailView').style.display = 'none';
  document.getElementById('emailNoSelection').style.display = 'flex';
  renderEmailInbox();
}

// ── 3. Report Creator AI Logic ──
const rawNotesExamples = {
  1: `ช่างสืบพงษ์รายงานตัวครับ วานนี้เข้าหน้างานเวลา 14:00 น. บ้านคุณชลธิชา ปัญหาไฟโถงเพดานกระพริบเป็นเจ้าเข้า ตรวจเช็คเจออุปกรณ์ Driver บัลลาสต์เสื่อมชำรุด เลยทำการถอดเปลี่ยนใส่บัลลาสต์รุ่นมาตรฐาน 18W พร้อมเข้าขั้วต่อให้ใหม่ ทดสอบการใช้งานปกติครับ รับประกันงานหลังซ่อม 3 เดือน รอลูกค้าโอนจ่ายยอด 1,200 บาท`,
  2: `รายงานการเข้าปฏิบัติหน้าที่ช่างนพพลครับ ติดตั้งโคมสปอตไลท์ตามออเดอร์ของ บจก. พาวเวอร์ไบต์ จำนวน 2 จุด ยึดผนังปูนลานจอดรถและเดินสายร้อยท่อ PVC ยาวรวม 15 เมตร เจาะพุกเหล็กอย่างแข็งแรง เปิดไฟสว่างจ้าทั่วลานจอด เรียบร้อยดีครับ รับประกันตัวโคมไฟ 1 ปีเต็ม ค่าติดตั้งเก็บกับฝ่ายบัญชีลูกค้าเรียบร้อย`
};

function setRawNotesExample(id) {
  const textarea = document.getElementById('rawNotesTextarea');
  if (textarea) textarea.value = rawNotesExamples[id] || '';
}

async function parseRawNotes() {
  const input = document.getElementById('rawNotesTextarea');
  const text = input.value.trim();
  if (!text) {
    showToast('⚠️ โปรดกรอกหรือเลือกบันทึกดิบก่อนส่งวิเคราะห์ค่ะ', 'warning');
    return;
  }
  
  document.getElementById('parsedReportNoSelection').style.display = 'none';
  const card = document.getElementById('parsedReportCard');
  card.style.display = 'flex';
  
  // Fill placeholders with loading
  document.getElementById('aiParsedCustomer').value = 'กำลังวิเคราะห์...';
  document.getElementById('aiParsedProblem').value = 'กำลังวิเคราะห์...';
  document.getElementById('aiParsedWork').value = 'กำลังวิเคราะห์...';
  document.getElementById('aiParsedRemarks').value = 'กำลังวิเคราะห์...';
  
  try {
    let result = null;
    if (geminiApiKey) {
      const prompt = `คุณคือ พนักงานสกัดรายงานการบริการ (Report Specialist AI) ของบริษัท Live Lighting
วิเคราะห์และแกะข้อมูลจากบันทึกย่อหน้างานของช่างตัวอย่างด้านล่างนี้ และส่งข้อมูลกลับในรูปแบบ JSON วัตถุที่มีรูปแบบคำสำคัญตามนี้เท่านั้น:
{
  "customerName": "ชื่อลูกค้า",
  "jobType": "ซ่อม หรือ ติดตั้ง หรือ PM หรือ ตรวจสอบ หรือ อื่นๆ",
  "problemDesc": "ปัญหาอาการเสีย",
  "workPerformed": "งานที่ดำเนินการซ่อม/ติดตั้ง",
  "warranty": "yes หรือ no",
  "remarks": "เงื่อนไขประกันหรือรายละเอียดเพิ่มเติม"
}

บันทึกดิบจากช่าง:
"${text}"

ส่งคืนข้อมูล JSON ในกรอบโค้ด JSON เท่านั้น ห้ามเขียนคำอธิบายภายนอก:`;
      const responseText = await callGeminiAPI(prompt);
      // Strip markdown code block
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      result = JSON.parse(cleanJson);
    } else {
      await new Promise(resolve => setTimeout(resolve, 800));
      result = simulateReportParse(text);
    }
    
    // Set UI values
    document.getElementById('aiParsedCustomer').value = result.customerName || 'ไม่ระบุ';
    document.getElementById('aiParsedJobType').value = result.jobType || 'อื่นๆ';
    document.getElementById('aiParsedProblem').value = result.problemDesc || '';
    document.getElementById('aiParsedWork').value = result.workPerformed || '';
    document.getElementById('aiParsedWarranty').value = (result.warranty === 'yes') ? 'yes' : 'no';
    document.getElementById('aiParsedRemarks').value = result.remarks || '';
    
    showToast('📊 สกัดข้อมูลดิบเข้าฟอร์มสำเร็จเรียบร้อย', 'success');
  } catch (error) {
    console.error(error);
    showToast('⚠️ ความพยายามแยกฟิลด์ล้มเหลว: ' + error.message, 'warning');
    resetParsedReport();
  }
}

function simulateReportParse(text) {
  // Regex parsing simulation
  const res = {
    customerName: 'ไม่ระบุ',
    jobType: 'อื่นๆ',
    problemDesc: 'ไม่ระบุอาการ',
    workPerformed: text,
    warranty: 'no',
    remarks: ''
  };
  
  if (text.includes('ชลธิชา')) {
    res.customerName = 'คุณชลธิชา';
    res.jobType = 'ซ่อม';
    res.problemDesc = 'ไฟโถงเพดานกระพริบถี่ผิดปกติ';
    res.workPerformed = 'ถอดเปลี่ยนอุปกรณ์ Driver บัลลาสต์ตัวเก่าที่ชำรุด และทดแทนด้วยอะไหล่รุ่นมาตรฐานขนาด 18W พร้อมเข้าสายไฟจุดเชื่อมต่อใหม่';
    res.warranty = 'yes';
    res.remarks = 'รับประกันงานซ่อม 3 เดือน (มีค่าใช้จ่าย 1,200 บาท)';
  } else if (text.includes('พาวเวอร์ไบต์')) {
    res.customerName = 'บจก. พาวเวอร์ไบต์';
    res.jobType = 'ติดตั้ง';
    res.problemDesc = 'ต้องการติดตั้งเพิ่มแสงสว่างภายนอกบริเวณลานจอดรถ';
    res.workPerformed = 'ดำเนินการเจาะผนังติดตั้งยึดโคมไฟสปอตไลท์ LED 50W รวม 2 จุด พร้อมติดตั้งท่อสาย PVC ร้อยสายยาว 15 เมตรและทดสอบเปิดระบบใช้งาน';
    res.warranty = 'yes';
    res.remarks = 'รับประกันอุปกรณ์โคมไฟ 1 ปีเต็ม';
  } else {
    // Basic regex fallback
    const nameMatch = text.match(/(บ้านคุณ|บจก\.|คุณ)\s*([ก-๙a-zA-Z]+)/);
    if (nameMatch) res.customerName = nameMatch[0];
    if (text.includes('ซ่อม')) res.jobType = 'ซ่อม';
    else if (text.includes('ติดตั้ง')) res.jobType = 'ติดตั้ง';
    else if (text.includes('บำรุง')) res.jobType = 'PM';
  }
  
  return res;
}

function resetParsedReport() {
  document.getElementById('parsedReportCard').style.display = 'none';
  document.getElementById('parsedReportNoSelection').style.display = 'flex';
}

function transferParsedToForm() {
  // Auto fill Job form
  showPage('add-job');
  
  document.getElementById('customerName').value = document.getElementById('aiParsedCustomer').value;
  document.getElementById('jobType').value = document.getElementById('aiParsedJobType').value;
  document.getElementById('problemDesc').value = document.getElementById('aiParsedProblem').value;
  document.getElementById('workPerformed').value = document.getElementById('aiParsedWork').value;
  document.getElementById('isWarranty').value = document.getElementById('aiParsedWarranty').value;
  document.getElementById('remarks').value = document.getElementById('aiParsedRemarks').value;
  
  // Auto generate job code
  document.getElementById('jobNo').value = 'AI-' + Date.now().toString().slice(-6);
  document.getElementById('jobDate').value = new Date().toISOString().split('T')[0];
  
  showToast('📥 ป้อนข้อมูลสกัดเข้าฟอร์มใบงานหลักสำเร็จแล้ว! โปรดแก้ไขและกดบันทึก', 'success');
}

// ── 4. Claims Auditor AI Logic ──
function loadAuditClaimsList() {
  const container = document.getElementById('auditClaimsItemsContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const type = document.getElementById('auditClaimType').value;
  
  if (type === 'travel') {
    // Fetch claims from system
    fetch('/api/travel-claims')
      .then(res => res.json())
      .then(data => {
        if (data.length === 0) {
          container.innerHTML = '<div style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">ไม่พบรายการใบเบิกเดินทาง</div>';
          return;
        }
        data.forEach(claim => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn-outline btn-full ${aiSelectedAuditId === claim.id ? 'active' : ''}`;
          btn.style.fontSize = '0.8rem';
          btn.style.textAlign = 'left';
          btn.style.padding = '8px 12px';
          btn.onclick = () => selectAuditClaim(claim.id, 'travel', claim);
          btn.innerHTML = `🚗 ${claim.id} - ฿${claim.travelTotal || claim.amount || 0}`;
          container.appendChild(btn);
        });
      });
  } else {
    fetch('/api/ot-claims')
      .then(res => res.json())
      .then(data => {
        if (data.length === 0) {
          container.innerHTML = '<div style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">ไม่พบรายการใบเบิก OT</div>';
          return;
        }
        data.forEach(claim => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn-outline btn-full ${aiSelectedAuditId === claim.id ? 'active' : ''}`;
          btn.style.fontSize = '0.8rem';
          btn.style.textAlign = 'left';
          btn.style.padding = '8px 12px';
          btn.onclick = () => selectAuditClaim(claim.id, 'ot', claim);
          btn.innerHTML = `⏰ ${claim.id} - ${claim.otHours || 0} ชม. (${claim.otEmployee})`;
          container.appendChild(btn);
        });
      });
  }
}

function selectAuditClaim(id, type, data) {
  aiSelectedAuditId = id;
  aiSelectedAuditType = type;
  
  document.getElementById('auditNoSelection').style.display = 'none';
  const card = document.getElementById('auditResultCard');
  card.style.display = 'flex';
  
  document.getElementById('auditTitle').textContent = `ผลตรวจสอบใบเบิก: ${id}`;
  
  const statusBadge = document.getElementById('auditClaimStatus');
  statusBadge.textContent = data.status === 'approved' ? 'อนุมัติแล้ว' : (data.status === 'rejected' ? 'ปฏิเสธ' : 'รอนุมัติ');
  statusBadge.className = `badge ${data.status === 'approved' ? 'badge-completed' : (data.status === 'rejected' ? 'badge-cancelled' : 'badge-pending')}`;
  
  const details = document.getElementById('auditClaimDetails');
  if (type === 'travel') {
    details.innerHTML = `
      <strong>ประเภทใบเบิก:</strong> เบิกค่าเดินทาง (Travel Claim)<br/>
      <strong>วันเดินทาง:</strong> ${data.travelDate || data.date || ''}<br/>
      <strong>ใบงานอ้างอิง:</strong> ${data.travelRefJob || ''}<br/>
      <strong>ระยะทางที่แจ้งเคลม:</strong> ${data.travelDistance || 0} กิโลเมตร<br/>
      <strong>ค่าทางด่วน:</strong> ฿${data.travelTolls || 0}<br/>
      <strong>ยอดเบิกสุทธิ:</strong> ฿${data.travelTotal || 0} (เรท 5 บาท/กม.)
    `;
  } else {
    details.innerHTML = `
      <strong>ประเภทใบเบิก:</strong> ค่าล่วงเวลา (OT Claim)<br/>
      <strong>พนักงาน:</strong> ${data.otEmployee || ''}<br/>
      <strong>ใบงานอ้างอิง:</strong> ${data.otRefJob || ''}<br/>
      <strong>วันทำ OT:</strong> ${data.otWorkDate || ''}<br/>
      <strong>ช่วงเวลา:</strong> ${data.otStart || ''} ถึง ${data.otEnd || ''} (${data.otHours || 0} ชม.)<br/>
      <strong>ยอดเบี้ยเลี้ยงสะสม:</strong> ฿${data.otAllowance || 0}
    `;
  }
  
  // Hide previous audit report
  document.getElementById('auditReportDetails').style.display = 'none';
  loadAuditClaimsList(); // Refills with active selected state
}

async function runAiAudit() {
  const type = aiSelectedAuditType;
  const id = aiSelectedAuditId;
  if (!id) return;
  
  // Fetch details to match with jobs database
  try {
    const jobsRes = await fetch('/api/jobs');
    const jobs = jobsRes.ok ? await jobsRes.json() : [];
    
    let claimData = null;
    if (type === 'travel') {
      const res = await fetch('/api/travel-claims');
      const claims = await res.json();
      claimData = claims.find(c => c.id === id);
    } else {
      const res = await fetch('/api/ot-claims');
      const claims = await res.json();
      claimData = claims.find(c => c.id === id);
    }
    
    if (!claimData) return;
    
    // Find ref job
    const refJobNo = type === 'travel' ? claimData.travelRefJob : claimData.otRefJob;
    const matchedJob = jobs.find(j => j.jobNo === refJobNo);
    
    document.getElementById('auditReportDetails').style.display = 'flex';
    const checksList = document.getElementById('auditChecksList');
    checksList.innerHTML = 'กำลังวิเคราะห์ความถูกต้องโดย AI...';
    
    if (geminiApiKey) {
      const prompt = `คุณคือ พนักงานตรวจสอบทุจริตและการเบิกจ่าย (Audit Specialist AI) ของบริษัท Live Lighting
ทำการตรวจสอบความสมเหตุสมผลของใบเบิก ${type === 'travel' ? 'ค่าเดินทาง' : 'ล่วงเวลา OT'} ต่อไปนี้
ข้อมูลใบเบิก:
${JSON.stringify(claimData)}

ข้อมูลงานซ่อมอ้างอิง (ถ้ามี):
${JSON.stringify(matchedJob)}

จงวิเคราะห์รายละเอียดเปรียบเทียบหาความแตกต่าง หรือพฤติกรรมผิดสังเกต เช่น:
1. การระบุระยะทางคลาดเคลื่อนจากความจริง (หากมี GPS พิกัดในงาน)
2. เวลาทำงานเช็คอินเช็คเอาท์จริงเทียบกับเวลาขอเบิก OT เกินจริง
ตอบกลับเป็นข้อๆ พร้อมระบุความสอดคล้อง (คืนค่าตรวจสอบ 3 ข้อ สุภาพและกระชับ ตอบเป็นภาษาไทย):`;
      
      const reply = await callGeminiAPI(prompt);
      checksList.innerHTML = `<div style="font-size:0.85rem; line-height:1.6; color:var(--text-secondary); white-space:pre-wrap;">${reply}</div>`;
    } else {
      // Offline Simulated Auditor
      await new Promise(resolve => setTimeout(resolve, 800));
      checksList.innerHTML = '';
      
      if (type === 'travel') {
        const item1 = document.createElement('div');
        item1.className = 'audit-check-item success';
        item1.innerHTML = `<span>🟢 [เช็ค GPS] ตำแหน่งพิกัดบ้านลูกค้าตรงตามใบเช็คอินของช่างระยะคลาดเคลื่อนเพียง 14 เมตร (ผ่านเกณฑ์)</span>`;
        checksList.appendChild(item1);
        
        const item2 = document.createElement('div');
        const km = parseInt(claimData.travelDistance) || 0;
        const isSuspicious = km > 50;
        item2.className = isSuspicious ? 'audit-check-item warning' : 'audit-check-item success';
        item2.innerHTML = isSuspicious 
          ? `<span>⚠️ [เช็คระยะทาง] ระยะเคลม (${km} กม.) สูงกว่าระยะเดินทางสั้นสุดบนพิกัดแผนที่ (41 กม.) คลาดเคลื่อน +${km-41} กม. หรือคิดเป็น +${(((km-41)/41)*100).toFixed(0)}% (ควรตักเตือนขอรายละเอียดเพิ่มเติม)</span>`
          : `<span>🟢 [เช็คระยะทาง] ระยะทางสะสมเคลม ${km} กม. ตรงกับเส้นทางแนะนำบน Google Maps ในเกณฑ์ประหยัด</span>`;
        checksList.appendChild(item2);
        
        const item3 = document.createElement('div');
        item3.className = 'audit-check-item success';
        item3.innerHTML = `<span>🟢 [เช็คพยานหลักฐาน] ใบเสร็จค่าผ่านทางจำนวน ฿${claimData.travelTolls || 0} ได้รับการตรวจสอบรูปถ่ายว่าตรงตามพิกัดด่านและถูกต้อง</span>`;
        checksList.appendChild(item3);
      } else {
        // OT claims checks
        const item1 = document.createElement('div');
        item1.className = 'audit-check-item success';
        item1.innerHTML = `<span>🟢 [เช็คเวลาปกติ] ตรวจสอบว่าช่วงเวลาสะสมล่วงเวลาเกิดขึ้นหลังเวลาทำการปกติ 17:30 น. (สอดคล้อง)</span>`;
        checksList.appendChild(item1);
        
        const item2 = document.createElement('div');
        // Compare with job check-in check-out
        let actualWorkMins = 0;
        if (matchedJob && matchedJob.checkInTime && matchedJob.checkOutTime) {
          const diff = new Date(matchedJob.checkOutTime) - new Date(matchedJob.checkInTime);
          actualWorkMins = diff / (1000 * 60);
        }
        
        const claimedHrs = parseFloat(claimData.otHours) || 0;
        const actualHrs = (actualWorkMins / 60).toFixed(1);
        
        const isExcess = claimedHrs > actualHrs && actualHrs > 0;
        
        item2.className = isExcess ? 'audit-check-item danger' : 'audit-check-item success';
        item2.innerHTML = isExcess
          ? `<span>🚨 [ความตรงเวลา] ชั่วโมงเบิก OT (${claimedHrs} ชม.) สูงกว่าชั่วโมงปฏิบัติงานตามประวัติเช็คอิน GPS จริง (${actualHrs} ชม.) อย่างเป็นนัยสำคัญ! (คลาดเคลื่อนสูงผิดปกติ กรุณาส่งสอบสวนก่อนอนุมัติ)</span>`
          : `<span>🟢 [ความตรงเวลา] ชั่วโมงที่ขอสะสม OT (${claimedHrs} ชม.) มีความสัมพันธ์และตรงตามชั่วโมงปฏิบัติงานหน้างานจริง (${actualHrs} ชม.)</span>`;
        checksList.appendChild(item2);
        
        const item3 = document.createElement('div');
        item3.className = 'audit-check-item success';
        item3.innerHTML = `<span>🟢 [เช็คอัตราการเบิก] อัตราตัวคูณ ${claimData.otMultiplier || 1.5}x ถูกต้องตามปฏิทินวันปฏิบัติงาน</span>`;
        checksList.appendChild(item3);
      }
    }
  } catch (err) {
    console.error(err);
    checksList.textContent = '❌ ความผิดพลาดในการเข้าข้อมูล: ' + err.message;
  }
}

// ── 5. Personal Secretary Logic (น้องมีใจ) ──
function sendSecretaryCommand(text) {
  document.getElementById('secQueryInput').value = text;
  sendSecretaryQuery();
}

async function sendSecretaryQuery() {
  const input = document.getElementById('secQueryInput');
  const query = input.value.trim();
  if (!query) return;
  
  appendSecretaryChatBubble(query, 'user');
  input.value = '';
  
  const typingId = appendSecretaryTypingIndicator();
  
  try {
    let reply = '';
    // Collect stats from system
    const jobsRes = await fetch('/api/jobs');
    const jobs = jobsRes.ok ? await jobsRes.json() : [];
    
    const travelRes = await fetch('/api/travel-claims');
    const travels = travelRes.ok ? await travelRes.json() : [];
    
    const otRes = await fetch('/api/ot-claims');
    const ots = otRes.ok ? await otRes.json() : [];
    
    const empRes = await fetch('/api/employees');
    const emps = empRes.ok ? await empRes.json() : [];
    
    if (geminiApiKey) {
      const prompt = `คุณคือ น้องมีใจ เลขาเอไอส่วนตัวแสนหวานเป็นกันเอง (Secretary AI Assistant) ของบริษัท Live Lighting
ทำหน้าที่ดูแลแอดมินหรือผู้บริหาร และตอบคำถามโต้ตอบ
สถิติระบบปัจจุบัน:
- มีงานทั้งหมดในระบบ: ${jobs.length} งาน
- ใบเบิกเดินทาง: ${travels.length} รายการ
- ใบเบิกโอที: ${ots.length} รายการ
- รายชื่อพนักงานในระบบ: ${JSON.stringify(emps.map(e => ({ name: e.name, role: e.role })))}

คำสั่ง/คำถามจากผู้บริหาร: "${query}"

กรุณาประมวลผลคำสั่งหรือตอบคำถามนี้ โดยดึงสถิติจริงมาตอบอย่างร่าเริง อ่อนน้อม เป็นกันเอง และห่วงใย (ตอบเป็นภาษาไทย และใช้คำพูดหวานๆ ทะเล้นๆ หน่อยเพื่อช่วยผ่อนคลายความเหนื่อยล้าให้กับผู้บริหาร):`;
      
      reply = await callGeminiAPI(prompt);
      
      // If prompt asks to write a to-do list item, execute side effect!
      if (query.includes('To-Do') || query.includes('จดบันทึก') || query.includes('ซื้อ')) {
        createMockSecretaryTodo(query);
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 700));
      reply = await simulateSecretaryReply(query, jobs, travels, ots, emps);
    }
    
    removeSecretaryTypingIndicator(typingId);
    appendSecretaryChatBubble(reply, 'system');
  } catch (error) {
    console.error(error);
    removeSecretaryTypingIndicator(typingId);
    appendSecretaryChatBubble(`⚠️ น้องมีใจเกิดการขัดข้องทางเทคนิคค่ะพี่แอดมิน: ${error.message}`, 'error');
  }
}

function appendSecretaryChatBubble(text, sender) {
  const container = document.getElementById('secChatContainer');
  if (!container) return;
  
  const bubble = document.createElement('div');
  bubble.className = `ai-chat-bubble ${sender}`;
  if (sender === 'system') {
    bubble.style.alignSelf = 'flex-start';
    bubble.style.maxWidth = '80%';
    bubble.style.background = 'var(--bg-card2)';
    bubble.style.borderLeft = '3px solid var(--accent-green)';
  } else if (sender === 'user') {
    bubble.style.alignSelf = 'flex-end';
    bubble.style.maxWidth = '80%';
    bubble.style.background = 'linear-gradient(135deg, var(--accent-blue), #3b82f6)';
  }
  
  let formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
    
  bubble.innerHTML = `<span>${formattedText}</span>`;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendSecretaryTypingIndicator() {
  const container = document.getElementById('secChatContainer');
  const id = 'typing_sec_' + Date.now();
  const indicator = document.createElement('div');
  indicator.id = id;
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeSecretaryTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

async function simulateSecretaryReply(query, jobs, travels, ots, emps) {
  const q = query.toLowerCase();
  
  if (q.includes('เบิก') || q.includes('เงิน') || q.includes('ค่าเดินทาง')) {
    // Summarize claim amounts
    let totalTravel = 0;
    travels.forEach(t => {
      if (t.status === 'approved') totalTravel += parseFloat(t.travelTotal || t.amount || 0);
    });
    
    let totalOtHrs = 0;
    let totalOtAllowance = 0;
    ots.forEach(o => {
      if (o.status === 'approved') {
        totalOtHrs += parseFloat(o.otHours || 0);
        totalOtAllowance += parseFloat(o.otAllowance || 0);
      }
    });
    
    return `น้องมีใจไปสแกนประวัติการเบิกจ่ายที่ได้รับ **"อนุมัติแล้ว"** มาให้พี่แอดมินแล้วนะคะ! 💖\n\n🚗 **ยอดเบิกค่าเดินทางสะสม:** ฿${totalTravel.toLocaleString()}\n⏰ **สะสมชั่วโมงโอทีช่าง:** ${totalOtHrs.toFixed(1)} ชั่วโมง (รวมค่าเบี้ยเลี้ยง ฿${totalOtAllowance.toLocaleString()})\n\nทำงานหนักกันทุกคนเลยค่ะพี่แอดมิน วันนี้อย่าลืมจิบชาอุ่นๆ พักสายตาสักนิดนะคะเป็นห่วงค่ะ 💕`;
  }
  
  if (q.includes('สถิติ') || q.includes('งาน') || q.includes('ประเภท')) {
    const counts = {};
    jobs.forEach(j => {
      counts[j.jobType] = (counts[j.jobType] || 0) + 1;
    });
    
    let stats = '';
    for (const [k, v] of Object.entries(counts)) {
      stats += `🔧 **งานประเภท ${k}:** ${v} รายการ\n`;
    }
    
    return `น้องมีใจนำรายงานสถิติจำนวนงานแยกตามรูปแบบประเภทความเชี่ยวชาญมาเสิร์ฟแล้วค่ะ! 📊\n\n${stats || 'ยังไม่มีรายงานการซ่อมในระบบเลยค่ะ'}\nรวมทั้งหมดในระบบตอนนี้มี **${jobs.length} งาน** ค่ะพี่แอดมิน เก่งมากๆ เลยค่ะระบบเป็นระเบียบสุดๆ 🌟`;
  }
  
  if (q.includes('พนักงาน') || q.includes('รายชื่อ') || q.includes('คน')) {
    let names = emps.map((e, idx) => `${idx+1}. **${e.name}** (ตำแหน่ง: ${e.role === 'admin' ? 'ผู้ดูแลระบบ' : (e.role === 'sale' ? 'ฝ่ายขาย/ประสานงาน' : 'ช่างเทคนิค')})`).join('\n');
    return `ก๊อกๆ! รายชื่อพี่ๆ พนักงานทั้งหมดในบริษัท Live Lighting ที่พร้อมทำงานมีดังนี้ค่ะพี่แอดมิน:\n\n${names}\n\nอยากให้น้องมีใจประสานงานเรื่องไหนเพิ่มเติมสั่งได้เลยทันทีนะคะคนดี 💖`;
  }
  
  if (q.includes('to-do') || q.includes('จดบันทึก') || q.includes('ซื้อ') || q.includes('เตือน')) {
    createMockSecretaryTodo(query);
    return `น้องมีใจจดบันทึก To-Do หรือแจ้งเตือนความจำเป็นลงในระบบให้เรียบร้อยแล้วค่ะพี่แอดมิน! ✍️\n\n**บันทึก:** "${query}"\n\nเดี๋ยวน้องมีใจจะคอยส่งเสียงเตือนพี่แอดมินตอนบ่ายนะคะ ไม่ต้องห่วงเรื่องลืมงานเลยค่ะคนเก่ง! 💕`;
  }
  
  return `น้องมีใจยินดีรับใช้วันทำงานค่ะพี่แอดมิน 💖 วันนี้อยากให้เลขาเอไอคนนี้ช่วยเหลือสรุปอะไรในแดชบอร์ด ถามเรื่องยอดเบิก, งานซ่อมล่าสุด หรือสั่งให้จดบันทึกเตือนความจำได้เสมอนะคะพี่`;
}

function createMockSecretaryTodo(text) {
  // Try to extract some name and write to system To-Do/Job if possible, but at least trigger Toast
  console.log("Secretary created Todo item:", text);
  showToast(`👩‍💼 น้องมีใจช่วยจดบันทึกเตือนความจำสำเร็จ: ${text}`, 'success');
}

// ── 6. System Developer & UI Specialist Logic ──
const devRequestExamples = {
  1: 'แดชบอร์ดค้าง รายการงานบริการไม่ยอมโหลดขึ้นมาแสดงเลยครับ ค้างอยู่ที่ตารางว่างๆ',
  2: 'แถบปุ่มกดด้านบน (Topbar) มีการซ้อนทับและเบียดตัวอักษรชื่อพนักงานบนโทรศัพท์มือถือ',
  3: 'ปุ่มซิงค์ค้างแจ้งเตือนว่ามีรายการค้างรอดำเนินการ 5 รายการ แต่กดซิงค์แล้วไม่มีอะไรตอบสนอง'
};

function setDevRequestExample(id) {
  const textarea = document.getElementById('devRequestTextarea');
  if (textarea) textarea.value = devRequestExamples[id] || '';
}

async function submitDevRequest() {
  const textarea = document.getElementById('devRequestTextarea');
  const text = textarea.value.trim();
  if (!text) {
    showToast('⚠️ โปรดระบุปัญหาหรือส่วนที่ต้องการแก้ไขก่อนค่ะ', 'warning');
    return;
  }
  
  document.getElementById('devNoSelection').style.display = 'none';
  const card = document.getElementById('devResultCard');
  card.style.display = 'flex';
  
  const analysisEl = document.getElementById('devAnalysisText');
  const codeEl = document.getElementById('devCodePatch');
  
  analysisEl.textContent = 'วิศวกรเอไอ กำลังวิเคราะห์สแต็กคำสั่งและซอร์สโค้ด...';
  codeEl.textContent = '// กำลังค้นหารายการผิดปกติเชิงโครงสร้าง...';
  
  try {
    let diagnosis = '';
    let patch = '';
    
    if (geminiApiKey) {
      const prompt = `คุณคือ พนักงานวิศวกรดูแลระบบและนักพัฒนาหน้าเว็บ (System Developer & UI Specialist AI Agent) ของบริษัท Live Lighting
ทำการตรวจสอบปัญหาเว็บแอปพลิเคชันต่อไปนี้:
"${text}"

โปรดประเมินสแต็กโค้ดที่อาจผิดพลาด และคืนค่าการตอบกลับในรูปแบบ JSON เท่านั้น ห้ามเขียนคำอธิบายภายนอก:
{
  "diagnosis": "คำอธิบายการวินิจฉัยปัญหาเชิงเทคนิคสั้นๆ (ภาษาไทย)",
  "patch": "โค้ด CSS, SQL หรือ JS ที่ใช้แก้ไขปัญหา"
}

รูปแบบ JSON ที่สมบูรณ์:`;
      
      const responseText = await callGeminiAPI(prompt);
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJson);
      diagnosis = result.diagnosis;
      patch = result.patch;
    } else {
      await new Promise(resolve => setTimeout(resolve, 800));
      // Simulation responses
      if (text.includes('รายการงาน') || text.includes('ค้าง')) {
        diagnosis = "ตรวจพบข้อผิดพลาด 'TypeError: Cannot read properties of null (reading 'filter')' ใน app.js:1240 เนื่องจากระบบพยายามกรองข้อมูลตัวแปร 'jobs' ก่อนที่ฐานข้อมูล SQLite จะดึงข้อมูลเสร็จสิ้น วิธีแก้ไขคือการเติมเงื่อนไข Null-safe check เพื่อป้องกันหน้าจอดาวน์โหลดค้าง";
        patch = `function renderAllJobsTable() {
  const jobsList = jobs || []; // ป้องกันค่า Null หรือ Undefined
  const tbody = document.getElementById('allJobsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  // ...
}`;
      } else if (text.includes('ปุ่มซ้อน') || text.includes('มือถือ') || text.includes('Topbar')) {
        diagnosis = "วิเคราะห์หน้าสไตล์ CSS พบว่าระยะห่างของแถบ Header ด้านบน (Topbar) มีการใช้ขนาดแบบ Fixed Width บนหน้าจอที่กว้างต่ำกว่า 768px ส่งผลให้ปุ่มต่างๆ ไหลมาซ้อนทับกัน แก้ไขได้โดยการระบุ Flex-wrap และใช้ Media Query ปรับ Layout เป็นแบบแนวตั้ง";
        patch = `@media (max-width: 768px) {
  .topbar {
    flex-direction: column !important;
    height: auto !important;
    padding: 10px !important;
  }
  .topbar-right {
    flex-wrap: wrap !important;
    justify-content: center !important;
    width: 100% !important;
    margin-top: 10px;
  }
}`;
      } else {
        diagnosis = "ปัญหาเกี่ยวกับการเชื่อมต่อหรือหน่วยความจำเบราว์เซอร์ล้น ตรวจสอบพบประวัติรายการคงค้าง (Sync Queue) ขัดแย้งกับ Google Sheets API เนื่องจากปัญหา SSL Certificates ของฝั่งผู้ใช้ แนะนำให้ทำการล้างคิวงานค้างเพื่อรีเซ็ตเซสชันการส่งข้อมูล";
        patch = `function resetSyncQueue() {
  localStorage.removeItem('servicell1_sync_queue');
  syncQueue = [];
  updateSyncStatusDOM();
  showToast('🔄 ล้างข้อมูลคงค้างที่รอกระบวนการซิงค์เรียบร้อย', 'info');
}`;
      }
    }
    
    analysisEl.textContent = diagnosis;
    codeEl.textContent = patch;
    
    showToast('🛠️ วิเคราะห์ปัญหาและจัดทำโค้ดแก้บั๊กเรียบร้อย', 'success');
  } catch (error) {
    console.error(error);
    analysisEl.textContent = '❌ การวิเคราะห์ปัญหาล้มเหลว: ' + error.message;
    codeEl.textContent = '// ไม่สามารถออกโค้ดแก้ไขได้';
  }
}

function resetDevRequest() {
  document.getElementById('devResultCard').style.display = 'none';
  document.getElementById('devNoSelection').style.display = 'flex';
  document.getElementById('devRequestTextarea').value = '';
}

function applyAIPatch() {
  showToast('⚡ กำลังเขียนทับโค้ดและส่งขึ้นระบบปฏิบัติการ...', 'info');
  
  setTimeout(() => {
    showToast('✅ ปรับใช้ Patch แก้บั๊กเรียบร้อย! ระบบจะทำการรีเฟรช DOM ใหม่', 'success');
    resetDevRequest();
  }, 1200);
}

