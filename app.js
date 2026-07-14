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
let map = null;
let sortConfig = { key: null, asc: true };
let jobPhotos = ['', '', '', '', '', ''];
let dashboardPeriod = 'month';

// ── Enterprise Extensions State ──
let currentUser = null;
let lineNotifyToken = localStorage.getItem('servicell1_line_token') || '';
const defaultEmployees = [
  { name: 'สมชาย แสงดี', email: 'somchai@livelighting.com', role: 'technician', password: '123' },
  { name: 'กิตติพงษ์ สว่าง', email: 'kittipong@livelighting.com', role: 'technician', password: '123' },
  { name: 'วิชัย หัวหน้างาน', email: 'wichai@livelighting.com', role: 'manager', password: '123' },
  { name: 'บัญชีกลาง Live Lighting', email: 'admin@livelighting.com', role: 'admin', password: '123' }
];
let employees = JSON.parse(localStorage.getItem('servicell1_employees')) || defaultEmployees;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  updateClock();
  setInterval(updateClock, 1000);
  setDefaultDates();
  initCharts();
  
  // Verify and enforce login state
  checkAuthOnLoad();
  
  // Load data from Google Sheets if connection URL is configured
  loadDataFromSheets();

  // Initialize Sheets warning banner visibility
  setTimeout(updateSheetsWarningBanner, 200);
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

function setLoggedInUser(user) {
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
    technician: 'ช่างเทคนิค',
    manager: 'ผู้จัดการ',
    admin: 'แอดมิน/บัญชี'
  };
  const roleEl = document.getElementById('displayUserRole');
  if (roleEl) {
    roleEl.textContent = roleNames[user.role] || user.role;
    roleEl.className = 'badge ' + (user.role === 'admin' ? 'badge-completed' : (user.role === 'manager' ? 'badge-progress' : 'badge-pending'));
  }
  
  // Filter navigation menus
  const adminMenu = document.getElementById('menu-admin-settings');
  if (user.role !== 'admin') {
    if (adminMenu) adminMenu.style.display = 'none';
  } else {
    if (adminMenu) adminMenu.style.display = 'flex';
  }
  
  // Set default values in forms
  const empSelect = document.getElementById('otEmployee');
  if (empSelect && user.role === 'technician') {
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
    const lineNotifyEl = document.getElementById('lineNotifyToken');
    if (lineNotifyEl) lineNotifyEl.value = lineNotifyToken;
    const setCompName = document.getElementById('settingsCompanyName');
    if (setCompName) setCompName.value = document.getElementById('companyName')?.value || 'Live Lighting';
    const setCompAddr = document.getElementById('settingsCompanyAddress');
    if (setCompAddr) setCompAddr.value = document.getElementById('companyAddress')?.value || '';
  }
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  
  const user = employees.find(emp => emp.email.toLowerCase() === email.toLowerCase());
  if (user && user.password === pass) {
    setLoggedInUser(user);
    showToast('🔓 เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + user.name, 'success');
  } else {
    showToast('❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง (ระบุ 123 สำหรับ Demo)', 'error');
  }
}

function quickLogin(role) {
  const user = employees.find(emp => emp.role === role) || defaultEmployees.find(emp => emp.role === role);
  if (user) {
    setLoggedInUser(user);
    showToast('🔓 เข้าสู่ระบบทดสอบ: ' + user.name, 'success');
  }
}

function switchRole(role) {
  quickLogin(role);
}

function logout() {
  showLoginScreen();
  showToast('🚪 ออกจากระบบเรียบร้อย', 'info');
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

// ── Local Storage & Sheet Synchronization ──
function saveToStorage() {
  try {
    localStorage.setItem('servicell1_jobs', JSON.stringify(jobs));
    localStorage.setItem('servicell1_travel_claims', JSON.stringify(travelClaims));
    localStorage.setItem('servicell1_ot_claims', JSON.stringify(otClaims));
  } catch (e) {
    console.error('Local storage quota exceeded!', e);
    showToast('⚠️ พื้นที่บันทึกข้อมูลในเบราว์เซอร์เต็ม ไม่สามารถบันทึกข้อมูลรูปภาพลงเครื่องได้ (ระบบจะลองอัปโหลดเข้า Google Sheets โดยตรง)', 'warning');
  }

  try {
    const companyInfo = {
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

  updateSyncQueueStatus();

  // Sync to Google Sheets in the background if connected
  if (sheetsApiUrl) {
    syncDataToSheets();
  }
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem('servicell1_jobs');
    jobs = raw ? JSON.parse(raw) : getSampleData();
    if (!raw) saveToStorage();
  } catch { jobs = getSampleData(); }

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
  updateSyncQueueStatus();
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
    'todo':         '📝 รายการสิ่งที่ต้องทำ / To-Do List',
    'map':          '🗺️ แผนที่ตำแหน่งลูกค้า',
    'travel-claim': '🚗 เบิกค่าเดินทาง / Travel Claim',
    'ot-claim':     '⏰ เบิก OT / Overtime Claim'
  };
  document.getElementById('pageTitle').textContent = titles[pageId] || '';

  if (pageId === 'map') initMap();
  if (pageId === 'report') populateReportSelect();
  if (pageId === 'travel-claim' || pageId === 'ot-claim') populateRefJobsDropdowns();
  if (pageId === 'dashboard') { updateCharts(); updateKPIs(); }
  if (pageId === 'add-job' && !editingJobId) {
    resetForm();
    document.getElementById('formTitle').innerHTML = '➕ เพิ่มงานใหม่ <span class="chart-sub">Add New Service Job</span>';
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
}

// ── KPIs ──
function getDashboardPeriodJobs() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let filteredJobs = jobs;
  if (currentUser && currentUser.role === 'technician') {
    filteredJobs = jobs.filter(j => j.technician === currentUser.name);
  }

  return filteredJobs.filter(j => {
    if (!j.date) return false;
    const jd = new Date(j.date);
    if (isNaN(jd.getTime())) return false;

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

  updateCharts();
}

function updateCharts() {
  if (!revenueChart || !statusChart) return;
  const year = parseInt(document.getElementById('chartYearFilter')?.value || new Date().getFullYear());

  let labels = [];
  let data = [];

  if (dashboardPeriod === 'day') {
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - 86400000 * i);
      const str = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
      data.push(jobs.filter(j => j.date === str).length);
    }
  } else if (dashboardPeriod === 'month') {
    labels = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    data = Array(12).fill(0);
    jobs.forEach(j => {
      if (!j.date) return;
      const d = new Date(j.date);
      if (d.getFullYear() === year) data[d.getMonth()]++;
    });
  } else if (dashboardPeriod === 'year') {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 4; y <= currentYear; y++) {
      labels.push(String(y));
      data.push(jobs.filter(j => {
        if (!j.date) return false;
        return new Date(j.date).getFullYear() === y;
      }).length);
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
    'รอดำเนินการ': jobs.filter(j => j.status === 'pending').length,
    'กำลังดำเนินการ': jobs.filter(j => j.status === 'in-progress').length,
    'เสร็จแล้ว': jobs.filter(j => j.status === 'completed').length,
    'ยกเลิก': jobs.filter(j => j.status === 'cancelled').length,
  };

  statusChart.data.labels = Object.keys(statusCounts);
  statusChart.data.datasets = [{
    data: Object.values(statusCounts),
    backgroundColor: ['#ff8c42', '#4f8ef7', '#2ecf7d', '#f87171'],
    borderWidth: 0
  }];
  statusChart.update();
}

// ── Tables ──
function renderRecentTable() {
  const tbody = document.getElementById('recentTableBody');
  let myJobs = jobs;
  if (currentUser && currentUser.role === 'technician') {
    myJobs = jobs.filter(j => j.technician === currentUser.name);
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
        <button class="action-btn" onclick="editJob('${j.id}')" title="แก้ไข">✏️</button>
        <button class="action-btn" onclick="generateReportForJob('${j.id}')" title="ออก Report">📄</button>
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
  if (currentUser && currentUser.role === 'technician') {
    filteredJobs = jobs.filter(j => j.technician === currentUser.name);
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

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">ไม่พบข้อมูลที่ตรงกัน</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(j => {
    const mapLinkHtml = j.googleMapsUrl 
      ? `<a href="${j.googleMapsUrl}" target="_blank" class="action-btn" style="text-decoration:none;" title="เปิดแผนที่">📍 แผนที่</a>` 
      : '-';

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
          <button class="action-btn" onclick="viewJob('${j.id}')" title="ดู">👁️</button>
          <button class="action-btn" onclick="editJob('${j.id}')" title="แก้ไข">✏️</button>
          <button class="action-btn" onclick="generateReportForJob('${j.id}')" title="Report">📄</button>
          <button class="action-btn del" onclick="deleteJob('${j.id}')" title="ลบ">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
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
    'pending':     ['badge-pending',   '⏳ รอดำเนินการ'],
    'in-progress': ['badge-progress',  '🔧 กำลังดำเนินการ'],
    'completed':   ['badge-completed', '✅ เสร็จแล้ว'],
    'cancelled':   ['badge-cancelled', '❌ ยกเลิก'],
  };
  const [cls, text] = map[status] || ['', status];
  return `<span class="badge ${cls}">${text}</span>`;
}

// ── Date Format ──
function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });
}

// ── Save Job ──
function saveJob(e) {
  e.preventDefault();

  const existingJob = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
  const checkInLat = tempCheckInGPS ? tempCheckInGPS.lat : (existingJob ? (existingJob.checkInLat || null) : null);
  const checkInLng = tempCheckInGPS ? tempCheckInGPS.lng : (existingJob ? (existingJob.checkInLng || null) : null);
  const checkInDistance = tempCheckInGPS ? tempCheckInGPS.distance : (existingJob ? (existingJob.checkInDistance || null) : null);

  const checkOutLat = tempCheckOutGPS ? tempCheckOutGPS.lat : (existingJob ? (existingJob.checkOutLat || null) : null);
  const checkOutLng = tempCheckOutGPS ? tempCheckOutGPS.lng : (existingJob ? (existingJob.checkOutLng || null) : null);
  const checkOutDistance = tempCheckOutGPS ? tempCheckOutGPS.distance : (existingJob ? (existingJob.checkOutDistance || null) : null);

  const job = {
    id: editingJobId || 'JOB' + Date.now(),
    jobNo: v('jobNo'), date: v('jobDate'), appointmentDate: v('appointmentDate'), completionDate: v('completionDate'),
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
    signature: v('jobSignature')
  };

  // Reset temporary GPS caches
  tempCheckInGPS = null;
  tempCheckOutGPS = null;

  if (editingJobId) {
    const idx = jobs.findIndex(j => j.id === editingJobId);
    if (idx !== -1) jobs[idx] = job;
    showToast('✅ แก้ไขข้อมูลงานเรียบร้อย', 'success');
  } else {
    jobs.unshift(job);
    showToast('✅ เพิ่มงานใหม่เรียบร้อย', 'success');
  }

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
    setVal('appointmentDate', job.appointmentDate); setVal('completionDate', job.completionDate);
    setVal('checkInTime', job.checkInTime); setVal('checkOutTime', job.checkOutTime);
    setVal('customerName', job.customerName); setVal('customerPhone', job.customerPhone);
    setVal('customerAddress', job.customerAddress);
    setVal('googleMapsUrl', job.googleMapsUrl);
    setVal('customerLat', job.customerLat); setVal('customerLng', job.customerLng);
    setVal('jobType', job.jobType); setVal('jobStatus', job.status);
    setVal('technician', job.technician); setVal('equipment', job.equipment);
    setVal('problemDesc', job.problemDesc); setVal('workPerformed', job.workPerformed);
    setVal('operationSummary', job.operationSummary || '');
    setVal('remarks', job.remarks);
    setVal('isWarranty', job.isWarranty || 'no');
    setVal('jobSignature', job.signature || '');

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
  saveToStorage();
  renderAll();
  showToast('🗑️ ลบข้อมูลงานเรียบร้อย', 'info');
}

// ── Reset Form ──
function resetForm() {
  document.getElementById('jobForm').reset();
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
  return new Date(dt).toLocaleString('th-TH', {
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
}

function closeJobModal() {
  document.getElementById('jobModal').classList.remove('active');
  currentModalJobId = null;
}

function closeModal(e) { 
  if (e.target === document.getElementById('jobModal')) closeJobModal(); 
  if (e.target === document.getElementById('claimModal')) closeClaimModal(); 
  if (e.target === document.getElementById('sheetsModal')) closeSheetsModal(); 
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
function populateReportSelect() {
  const select = document.getElementById('reportJobSelect');
  select.innerHTML = '<option value="">-- เลือกงาน --</option>' +
    [...jobs].sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(j =>
      `<option value="${j.id}">${j.jobNo || j.id} | ${j.customerName} | ${formatDate(j.date)}</option>`
    ).join('');
}

function filterReportJobs(q) {
  const select = document.getElementById('reportJobSelect');
  const filtered = jobs.filter(j => !q || (j.jobNo||'').toLowerCase().includes(q.toLowerCase()) || (j.customerName||'').toLowerCase().includes(q.toLowerCase()));
  select.innerHTML = '<option value="">-- เลือกงาน --</option>' +
    filtered.map(j => `<option value="${j.id}">${j.jobNo || j.id} | ${j.customerName} | ${formatDate(j.date)}</option>`).join('');
}

function generateReportForJob(id) {
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
    '#rpt-signature-section .signature-box:nth-child(1) div:nth-child(2)': txt.sigTech,
    '#rpt-signature-section .signature-box:nth-child(2) div:nth-child(2)': txt.sigMgr,
    '#rpt-signature-section .signature-box:nth-child(1) .sig-date': txt.dateLabel + ' ____________',
    '#rpt-signature-section .signature-box:nth-child(2) .sig-date': txt.dateLabel + ' ____________',
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

  // Inject digital signature
  const clientSigEl = document.getElementById('rpt-sig-line-client');
  if (clientSigEl) {
    if (job.signature) {
      clientSigEl.innerHTML = `<img src="${job.signature}" style="max-height:48px; max-width:200px; object-fit:contain;" />`;
      clientSigEl.style.borderBottom = 'none';
    } else {
      clientSigEl.innerHTML = '';
      clientSigEl.style.borderBottom = '1px solid #333';
    }
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
  if (currentUser && currentUser.role === 'technician') {
    filtered = travelClaims.filter(c => {
      const refJob = jobs.find(j => j.id === c.jobId);
      return refJob && refJob.technician === currentUser.name;
    });
  }

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">ยังไม่มีประวัติการเบิก</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const refJob = jobs.find(j => j.id === c.jobId);
    const mapIconHtml = c.mapUrl ? ` <a href="${c.mapUrl}" target="_blank" title="ดูเส้นทางแผนที่" style="text-decoration:none;">🗺️</a>` : '';
    const status = c.status || 'pending';
    
    // Actions selection
    let actionsHtml = `<button class="action-btn" onclick="viewClaim('travel', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
    if (currentUser) {
      if (currentUser.role === 'manager' || currentUser.role === 'admin') {
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
  if (currentUser && currentUser.role === 'technician') {
    filtered = otClaims.filter(c => c.employee === currentUser.name);
  }

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row">ยังไม่มีประวัติการเบิก</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const refJob = jobs.find(j => j.id === c.jobId);
    const status = c.status || 'pending';

    // Actions selection
    let actionsHtml = `<button class="action-btn" onclick="viewClaim('ot', '${c.id}')" title="ดูรายละเอียด">👁️</button>`;
    if (currentUser) {
      if (currentUser.role === 'manager' || currentUser.role === 'admin') {
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



// ── Google Sheets Sync State & Logic ──
let sheetsApiUrl = localStorage.getItem('servicell1_sheets_url') || '';

function openSheetsModal() {
  const modal = document.getElementById('sheetsModal');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('sheetsApiUrl').value = sheetsApiUrl;
  }
}

function closeSheetsModal() {
  const modal = document.getElementById('sheetsModal');
  if (modal) modal.classList.remove('active');
}

function updateSyncStatus(status) {
  const iconEl = document.getElementById('syncStatusIcon');
  const textEl = document.getElementById('syncStatusText');
  if (!iconEl || !textEl) return;
  
  if (status === 'connected') {
    iconEl.textContent = '☁️';
    textEl.textContent = 'Google Sheets: เชื่อมต่อแล้ว';
    textEl.style.color = 'var(--accent-green)';
  } else if (status === 'syncing') {
    iconEl.textContent = '⏳';
    textEl.textContent = 'กำลังซิงค์ข้อมูล...';
    textEl.style.color = 'var(--accent-blue)';
  } else if (status === 'error') {
    iconEl.textContent = '⚠️';
    textEl.textContent = 'การเชื่อมต่อผิดพลาด';
    textEl.style.color = '#ef4444';
  } else {
    iconEl.textContent = '☁️';
    textEl.textContent = 'เชื่อมต่อ Google Sheets';
    textEl.style.color = 'inherit';
  }
}

async function testAndSyncSheets() {
  const url = document.getElementById('sheetsApiUrl').value.trim();
  if (!url) {
    showToast('❌ กรุณากรอก Web App URL', 'error');
    return;
  }
  
  updateSyncStatus('syncing');
  showToast('⏳ กำลังทดสอบและเชื่อมต่อ...', 'info');
  
  try {
    const testUrl = url + '?action=getData';
    const res = await fetch(testUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error('Network response error');
    
    // Check if response is HTML (which happens when unauthorized/access blocked by Google account restrictions)
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new SyntaxError('HTML_RESPONSE');
    }

    let result;
    try {
      result = await res.json();
    } catch (e) {
      throw new SyntaxError('JSON_PARSE_ERROR');
    }

    if (result.success) {
      sheetsApiUrl = url;
      localStorage.setItem('servicell1_sheets_url', url);
      updateSheetsWarningBanner();
      showToast('✅ เชื่อมต่อ Google Sheets สำเร็จ!', 'success');
      
      if (result.jobs && (result.jobs.length > 0 || result.travelClaims.length > 0 || result.otClaims.length > 0)) {
        jobs = result.jobs;
        travelClaims = result.travelClaims;
        otClaims = result.otClaims;
        saveToStorageLocal();
        renderAll();
        populateRefJobsDropdowns();
        renderTravelClaimsTable();
        renderOtClaimsTable();
        showToast('📥 ดาวน์โหลดข้อมูลจาก Google Sheet สำเร็จ', 'success');
      } else {
        await syncDataToSheets();
      }
      
      updateSyncStatus('connected');
      closeSheetsModal();
    } else {
      throw new Error(result.message || 'Unknown error');
    }
  } catch (err) {
    console.error(err);
    updateSyncStatus('error');
    if (err instanceof SyntaxError) {
      showToast('❌ การเชื่อมต่อขัดข้อง: ได้รับหน้าจอตั้งค่าสิทธิ์จาก Google (กรุณาทำตามขั้นตอนที่ระบุด้านล่าง ให้สิทธิ์เข้าถึง และตั้งค่า Who has access เป็น Anyone)', 'error');
    } else {
      showToast('❌ การเชื่อมต่อล้มเหลว: ' + err.message + ' (โปรดตรวจทาน Web App URL อีกครั้ง)', 'error');
    }
  }
}

function disconnectSheets() {
  sheetsApiUrl = '';
  localStorage.removeItem('servicell1_sheets_url');
  document.getElementById('sheetsApiUrl').value = '';
  updateSyncStatus('disconnected');
  updateSheetsWarningBanner();
  showToast('🔌 ยกเลิกการเชื่อมต่อ Google Sheets แล้ว', 'info');
  closeSheetsModal();
}

async function syncDataToSheets() {
  if (!sheetsApiUrl) return;
  
  try {
    const res = await fetch(sheetsApiUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'syncAll',
        jobs: jobs,
        travelClaims: travelClaims,
        otClaims: otClaims
      })
    });
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.error('Failed to sync: Received HTML response');
      updateSyncQueueStatus();
      return;
    }

    const result = await res.json();
    if (result.success) {
      console.log('Successfully synced with Google Sheets');
      // Clear pendingSync flags from local lists
      jobs.forEach(j => delete j.pendingSync);
      travelClaims.forEach(c => delete c.pendingSync);
      otClaims.forEach(c => delete c.pendingSync);
      
      // Save cleaned arrays to local storage directly (without calling syncDataToSheets again)
      try {
        localStorage.setItem('servicell1_jobs', JSON.stringify(jobs));
        localStorage.setItem('servicell1_travel_claims', JSON.stringify(travelClaims));
        localStorage.setItem('servicell1_ot_claims', JSON.stringify(otClaims));
      } catch (e) {
        console.error('Failed to save cleaned data to localStorage', e);
      }
      
      updateSyncQueueStatus();
    } else {
      console.error('Failed to sync:', result.message);
      updateSyncQueueStatus();
    }
  } catch (err) {
    console.error('Sync Error:', err);
    updateSyncQueueStatus();
  }
}

function saveToStorageLocal() {
  try {
    localStorage.setItem('servicell1_jobs', JSON.stringify(jobs));
    localStorage.setItem('servicell1_travel_claims', JSON.stringify(travelClaims));
    localStorage.setItem('servicell1_ot_claims', JSON.stringify(otClaims));
  } catch (e) {
    console.error('Local storage quota exceeded!', e);
    showToast('⚠️ พื้นที่เบราว์เซอร์เต็ม ไม่สามารถบันทึกข้อมูลรูปภาพขนาดใหญ่ลงเครื่องได้', 'warning');
  }
}

async function loadDataFromSheets() {
  if (!sheetsApiUrl) {
    updateSyncStatus('disconnected');
    return;
  }
  
  updateSyncStatus('syncing');
  try {
    const res = await fetch(sheetsApiUrl + '?action=getData', { redirect: 'follow' });
    if (!res.ok) throw new Error('Network response error');

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new SyntaxError('HTML_RESPONSE');
    }

    let result;
    try {
      result = await res.json();
    } catch (e) {
      throw new SyntaxError('JSON_PARSE_ERROR');
    }

    if (result.success) {
      jobs = result.jobs || [];
      travelClaims = result.travelClaims || [];
      otClaims = result.otClaims || [];
      
      saveToStorageLocal();
      renderAll();
      populateRefJobsDropdowns();
      renderTravelClaimsTable();
      renderOtClaimsTable();
      
      updateSyncStatus('connected');
      console.log('Data loaded successfully from Google Sheets');
    } else {
      updateSyncStatus('error');
    }
  } catch (err) {
    console.error('Error loading sheets data:', err);
    updateSyncStatus('error');
    if (err instanceof SyntaxError) {
      showToast('⚠️ ตรวจพบบัญชี Google ติดขัดเรื่องสิทธิ์การเข้าถึงสคริปต์ใน Google Sheets', 'warning');
    }
  }
}

function copyAppsScriptCode() {
  const code = `function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'getData') {
    var jobsData = getSheetData(ss, 'Jobs');
    var travelData = getSheetData(ss, 'TravelClaims');
    var otData = getSheetData(ss, 'OtClaims');
    
    var response = {
      success: true,
      jobs: jobsData,
      travelClaims: travelData,
      otClaims: otData
    };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'syncAll') {
    saveSheetData(ss, 'Jobs', data.jobs);
    saveSheetData(ss, 'TravelClaims', data.travelClaims);
    saveSheetData(ss, 'OtClaims', data.otClaims);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Synced successfully' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetData(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  var headers = rows[0];
  var data = [];
  for (var i = 1; i < rows.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = rows[i][j];
      if (typeof val === 'string' && (val.indexOf('{') === 0 || val.indexOf('[') === 0)) {
        try { val = JSON.parse(val); } catch(err) {}
      }
      obj[headers[j]] = val;
    }
    data.push(obj);
  }
  return data;
}

function saveSheetData(ss, sheetName, dataArray) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }
  
  if (!dataArray || dataArray.length === 0) {
    var defaultHeaders = getHeadersForSheet(sheetName);
    sheet.appendRow(defaultHeaders);
    return;
  }
  
  var headers = Object.keys(dataArray[0]);
  sheet.appendRow(headers);
  
  var rows = [];
  for (var i = 0; i < dataArray.length; i++) {
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      var val = dataArray[i][headers[j]];
      if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val);
      }
      row.push(val);
    }
    rows.push(row);
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function getHeadersForSheet(sheetName) {
  if (sheetName === 'Jobs') {
    return ['id', 'jobNo', 'date', 'appointmentDate', 'completionDate', 'customerName', 'customerPhone', 'customerAddress', 'googleMapsUrl', 'customerLat', 'customerLng', 'jobType', 'status', 'technician', 'equipment', 'problemDesc', 'workPerformed', 'operationSummary', 'parts', 'laborCost', 'partsTotal', 'travelCost', 'discount', 'vatRate', 'grandTotal', 'paymentMethod', 'isWarranty', 'warranty', 'remarks', 'photos'];
  } else if (sheetName === 'TravelClaims') {
    return ['id', 'claimNo', 'date', 'jobId', 'startPoint', 'endPoint', 'mapUrl', 'distance', 'rate', 'tolls', 'total', 'status', 'approvedBy', 'remarks'];
  } else if (sheetName === 'OtClaims') {
    return ['id', 'claimNo', 'date', 'jobId', 'employee', 'workDate', 'start', 'end', 'hours', 'normalRate', 'rate', 'multiplier', 'allowance', 'total', 'status', 'approvedBy', 'remarks'];
  }
  return ['id'];
}`;

  navigator.clipboard.writeText(code).then(() => {
    showToast('📋 คัดลอกโค้ด Apps Script ไปยัง Clipboard แล้ว!', 'success');
  }).catch(() => {
    showToast('❌ ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกด้วยตนเอง', 'error');
  });
}

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
    saveToStorage();
    if (type === 'travel') renderTravelClaimsTable();
    else renderOtClaimsTable();
    renderPayrollTable();
    showToast('✅ อนุมัติใบเบิกสำเร็จแล้ว', 'success');
    
    // Simulate Line Notify Alert
    sendLineNotifyAlert(`📢 ใบเบิก ${claimList[idx].claimNo} (${type === 'travel' ? 'เดินทาง' : 'OT'}) ได้รับการอนุมัติแล้วโดย ${claimList[idx].approvedBy}`);
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
    saveToStorage();
    if (type === 'travel') renderTravelClaimsTable();
    else renderOtClaimsTable();
    renderPayrollTable();
    showToast('❌ ปฏิเสธใบเบิกแล้ว', 'info');
    
    // Simulate Line Notify Alert
    sendLineNotifyAlert(`⚠️ ใบเบิก ${claimList[idx].claimNo} (${type === 'travel' ? 'เดินทาง' : 'OT'}) ถูกปฏิเสธโดย ${claimList[idx].approvedBy} (เหตุผล: ${reason || 'ไม่ระบุ'})`);
  }
}

function renderEmployeeTable() {
  const tbody = document.getElementById('employeeTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = employees.map(emp => {
    const roleNames = {
      technician: 'ช่างเทคนิค',
      manager: 'ผู้จัดการ',
      admin: 'แอดมิน/บัญชี'
    };
    const isDefault = defaultEmployees.some(e => e.email === emp.email);
    const deleteBtn = isDefault ? 
      `<span style="color:var(--text-secondary); font-size:0.8rem;">ระบบพื้นฐาน (ลบไม่ได้)</span>` : 
      `<button class="action-btn del" onclick="deleteEmployee('${emp.email}')" title="ลบพนักงาน">🗑️</button>`;
      
    return `
      <tr>
        <td><strong>${emp.name}</strong></td>
        <td>${emp.email}</td>
        <td><span class="badge ${emp.role === 'admin' ? 'badge-completed' : (emp.role === 'manager' ? 'badge-progress' : 'badge-pending')}">${roleNames[emp.role]}</span></td>
        <td>${deleteBtn}</td>
      </tr>
    `;
  }).join('');
}

function handleAddEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('newEmpName').value.trim();
  const email = document.getElementById('newEmpEmail').value.trim();
  const role = document.getElementById('newEmpRole').value;
  
  if (employees.some(emp => emp.email.toLowerCase() === email.toLowerCase())) {
    showToast('❌ อีเมลนี้มีอยู่ในระบบแล้ว', 'error');
    return;
  }
  
  employees.push({ name, email, role, password: '123' });
  localStorage.setItem('servicell1_employees', JSON.stringify(employees));
  
  document.getElementById('addEmployeeForm').reset();
  renderEmployeeTable();
  showToast('👥 เพิ่มพนักงานใหม่สำเร็จ รหัสผ่านเริ่มต้นคือ 123', 'success');
}

function deleteEmployee(email) {
  if (!confirm('ยืนยันที่จะลบพนักงานรายนี้ออกจากระบบหรือไม่?')) return;
  employees = employees.filter(emp => emp.email !== email);
  localStorage.setItem('servicell1_employees', JSON.stringify(employees));
  renderEmployeeTable();
  showToast('🗑️ ลบพนักงานสำเร็จ', 'info');
}

function saveAdminCompanySettings() {
  const name = document.getElementById('settingsCompanyName').value.trim();
  const addr = document.getElementById('settingsCompanyAddress').value.trim();
  const lineToken = document.getElementById('lineNotifyToken').value.trim();
  
  if (name) {
    const nameEl = document.getElementById('companyName');
    if (nameEl) nameEl.value = name;
  }
  if (addr) {
    const addrEl = document.getElementById('companyAddress');
    if (addrEl) addrEl.value = addr;
  }
  
  lineNotifyToken = lineToken;
  localStorage.setItem('servicell1_line_token', lineToken);
  
  saveToStorage();
  showToast('💾 บันทึกการตั้งค่าบริษัทเรียบร้อย', 'success');
}

function sendLineNotifyAlert(message) {
  if (!lineNotifyToken) {
    console.log('[Line Notify Simulation]:', message);
    return;
  }
  
  console.log('[Line Notify Sent!]: Token = ' + lineNotifyToken + ' | Message = ' + message);
  showToast('🔔 ส่งแจ้งเตือน Line Notify สำเร็จ', 'success');
}

function testLineNotify() {
  const token = document.getElementById('lineNotifyToken').value.trim();
  if (!token) {
    showToast('❌ กรุณากรอก Line Notify Token', 'error');
    return;
  }
  
  showToast('⏳ กำลังส่งทดสอบแจ้งเตือน...', 'info');
  setTimeout(() => {
    showToast('🔔 ส่งข้อความทดสอบเข้ากลุ่ม Line เรียบร้อย!', 'success');
  }, 1000);
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
    const mapIconHtml = c.mapUrl ? ` <a href="${c.mapUrl}" target="_blank" style="text-decoration:none;">🗺️ ดูแผนที่ Google Maps</a>` : '';
    bodyHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:16px;">
        <div><strong>เลขที่ใบเบิก:</strong> ${c.claimNo}</div>
        <div><strong>วันที่ยื่นเบิก:</strong> ${formatDate(c.date)}</div>
        <div><strong>พนักงานผู้เบิก:</strong> ${refJob ? (refJob.technician || '-') : '-'}</div>
        <div><strong>ใบงานอ้างอิง:</strong> ${refJob ? `${refJob.jobNo} (${refJob.customerName})` : '-'}</div>
      </div>
      <div style="margin-bottom:16px;">
        <h4 style="color:var(--accent-blue); margin-bottom:8px; font-weight:600;">📍 รายละเอียดเส้นทางเดินทาง</h4>
        <p style="margin:4px 0;"><strong>จุดเริ่มต้น:</strong> ${c.startPoint}</p>
        <p style="margin:4px 0;"><strong>จุดสิ้นสุด:</strong> ${c.endPoint}</p>
        <p style="margin:8px 0 4px 0;"><strong>ระยะทาง:</strong> ${c.distance} กม. ${mapIconHtml}</p>
        <p style="margin:4px 0;"><strong>รายละเอียดงาน:</strong> ${refJob ? (refJob.workPerformed || refJob.operationSummary || '-') : '-'}</p>
      </div>
      <div style="margin-bottom:16px; border-top:1px solid var(--border); padding-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div><strong>อัตราจ่าย/กม.:</strong> ฿${c.rate.toFixed(2)} / กม.</div>
        <div><strong>ค่าทางด่วน/ค่าจอดรถ:</strong> ฿${c.tolls.toFixed(2)}</div>
        <div style="grid-column:span 2; font-size:1.1rem; color:var(--accent-green); font-weight:700; margin-top:8px;">
          ยอดเงินเบิกสุทธิ: ฿${c.total.toFixed(2)}
        </div>
      </div>
      <div style="border-top:1px solid var(--border); padding-top:16px;">
        <p style="margin:4px 0;"><strong>สถานะปัจจุบัน:</strong> ${getApprovalStatusBadge(status)}</p>
        ${c.approvedBy ? `<p style="margin:4px 0;"><strong>ผู้ดำเนินการอนุมัติ:</strong> ${c.approvedBy}</p>` : ''}
        <p style="margin:4px 0;"><strong>หมายเหตุ:</strong> ${c.remarks || '-'}</p>
      </div>
    `;
  } else {
    // OT Claim
    bodyHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:16px;">
        <div><strong>เลขที่ใบเบิก:</strong> ${c.claimNo}</div>
        <div><strong>วันที่ยื่นเบิก:</strong> ${formatDate(c.date)}</div>
        <div><strong>พนักงานผู้เบิก:</strong> ${c.employee}</div>
        <div><strong>ใบงานอ้างอิง:</strong> ${refJob ? `${refJob.jobNo} (${refJob.customerName})` : '-'}</div>
      </div>
      <div style="margin-bottom:16px;">
        <h4 style="color:var(--accent-blue); margin-bottom:8px; font-weight:600;">⏰ รายละเอียดชั่วโมงปฏิบัติงานล่วงเวลา</h4>
        <p style="margin:4px 0;"><strong>วันที่ปฏิบัติงาน:</strong> ${formatDate(c.workDate)}</p>
        <p style="margin:4px 0;"><strong>เวลาทำงาน:</strong> ${c.start} - ${c.end} น.</p>
        <p style="margin:4px 0;"><strong>จำนวนชั่วโมงรวม:</strong> ${c.hours} ชม.</p>
        <p style="margin:4px 0;"><strong>ตัวคูณเวลา:</strong> x${c.multiplier || 1.5}</p>
        <p style="margin:8px 0 4px 0;"><strong>ค่าเบี้ยเลี้ยง / Allowance:</strong> ฿${(c.allowance || 0).toFixed(2)}</p>
        <p style="margin:4px 0;"><strong>รายละเอียดงาน:</strong> ${refJob ? (refJob.workPerformed || refJob.operationSummary || '-') : '-'}</p>
      </div>
      <div style="border-top:1px solid var(--border); padding-top:16px;">
        <p style="margin:4px 0;"><strong>สถานะปัจจุบัน:</strong> ${getApprovalStatusBadge(status)}</p>
        ${c.approvedBy ? `<p style="margin:4px 0;"><strong>ผู้ดำเนินการอนุมัติ:</strong> ${c.approvedBy}</p>` : ''}
        <p style="margin:4px 0;"><strong>หมายเหตุ/รายละเอียดอื่น ๆ:</strong> ${c.remarks || '-'}</p>
      </div>
    `;
  }

  body.innerHTML = bodyHtml;

  // Render Footer Buttons
  let footerHtml = `
    <button class="btn-outline" style="margin-right:auto;" onclick="closeClaimModal()">ปิด</button>
  `;

  if (currentUser) {
    if ((currentUser.role === 'manager' || currentUser.role === 'admin') && status === 'pending') {
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

// ── Sync Queue Tracker ──

function updateSyncQueueStatus() {
  const pendingJobs = jobs.filter(j => j.pendingSync).length;
  const pendingTravel = travelClaims.filter(c => c.pendingSync).length;
  const pendingOt = otClaims.filter(c => c.pendingSync).length;
  const totalPending = pendingJobs + pendingTravel + pendingOt;

  const badge = document.getElementById('syncQueueBadge');
  const btn = document.getElementById('syncPendingBtn');

  if (totalPending > 0) {
    if (badge) {
      badge.textContent = `${totalPending} รอซิงค์`;
      badge.style.display = 'inline-block';
    }
    if (btn) {
      btn.textContent = `🔄 ซิงค์รายการคงค้างที่รอดำเนินการ (${totalPending})`;
      btn.style.display = 'flex';
    }
  } else {
    if (badge) badge.style.display = 'none';
    if (btn) btn.style.display = 'none';
  }
}

async function syncPendingQueue() {
  const pendingJobs = jobs.filter(j => j.pendingSync).length;
  const pendingTravel = travelClaims.filter(c => c.pendingSync).length;
  const pendingOt = otClaims.filter(c => c.pendingSync).length;
  const totalPending = pendingJobs + pendingTravel + pendingOt;

  if (totalPending === 0) {
    showToast('✅ ไม่มีข้อมูลคงค้างที่รอการซิงค์', 'info');
    return;
  }

  showToast('⏳ กำลังพยายามซิงค์ข้อมูลคงค้างขึ้นคลาวด์...', 'info');
  await syncDataToSheets();

  const afterPending = jobs.filter(j => j.pendingSync).length +
                       travelClaims.filter(c => c.pendingSync).length +
                       otClaims.filter(c => c.pendingSync).length;

  if (afterPending === 0) {
    showToast('✅ ซิงค์ข้อมูลทั้งหมดไปยัง Google Sheets สำเร็จแล้ว!', 'success');
  } else {
    showToast('❌ ยังไม่สามารถเชื่อมต่อคลาวด์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
  }
}

// ── Payroll & Claims Aggregation ──

function renderPayrollTable() {
  const tbody = document.getElementById('payrollTableBody');
  if (!tbody) return;

  const staff = employees.filter(e => e.role === 'technician');
  const extraTravelNames = travelClaims.map(c => {
    const j = jobs.find(job => job.id === c.jobId);
    return j ? j.technician : '';
  }).filter(n => n);
  const extraOtNames = otClaims.map(c => c.employee).filter(n => n);

  const uniqueNames = Array.from(new Set([
    ...staff.map(e => e.name),
    ...extraTravelNames,
    ...extraOtNames
  ]));

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
  const staff = employees.filter(e => e.role === 'technician');
  const extraTravelNames = travelClaims.map(c => {
    const j = jobs.find(job => job.id === c.jobId);
    return j ? j.technician : '';
  }).filter(n => n);
  const extraOtNames = otClaims.map(c => c.employee).filter(n => n);

  const uniqueNames = Array.from(new Set([
    ...staff.map(e => e.name),
    ...extraTravelNames,
    ...extraOtNames
  ]));

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

// 4. Demo Toggle
function toggleDemoOptions(e) {
  if (e) e.preventDefault();
  const section = document.getElementById('demoAccountsSection');
  const widget = document.getElementById('roleSwitcherWidget');
  const link = document.getElementById('toggleDemoLink');
  if (!section) return;

  if (section.style.display === 'none') {
    section.style.display = 'block';
    if (widget) widget.style.display = 'block';
    if (link) link.textContent = '🔒 ซ่อนตัวเลือกบัญชีทดลอง (Hide Demo Options)';
  } else {
    section.style.display = 'none';
    if (widget) widget.style.display = 'none';
    if (link) link.textContent = '🔧 แสดงตัวเลือกบัญชีทดลอง (Demo Options)';
  }
}

// 5. Update Sheets Warning Banner
function updateSheetsWarningBanner() {
  const banner = document.getElementById('sheetsWarningBanner');
  if (!banner) return;
  if (!sheetsApiUrl) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}
