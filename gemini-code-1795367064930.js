/**
 * ============================================================================
 * SIK-DESA Frontend Controller (script.js)
 * ============================================================================
 */

// GANTI URL INI dengan URL Web App Google Apps Script Anda setelah Deploy
const DEFAULT_API_URL = "https://script.google.com/macros/s/PASTE_YOUR_WEB_APP_URL_HERE/exec";

const APP_STATE = {
  apiUrl: localStorage.getItem("SIK_DESA_API_URL") || DEFAULT_API_URL,
  token: sessionStorage.getItem("SIK_DESA_TOKEN") || "",
  user: JSON.parse(sessionStorage.getItem("SIK_DESA_USER") || "null"),
  penduduk: [],
  filteredPenduduk: [],
  currentPage: 1,
  pageSize: 25,
  kartu_keluarga: [],
  anggota_kk: [],
  mutasi_datang: [],
  mutasi_pindah: [],
  mutasi_meninggal: [],
  referensi: [],
  pengaturan: {},
  pengguna: [],
  log_aktivitas: [],
  selectedBiodataNik: null,
  selectedKKNo: null,
  activeRekapTab: "gender",
  charts: {}
};

// ============================================================================
// INISIALISASI & API CLIENT
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("apiUrlInput").value = APP_STATE.apiUrl;
  if (APP_STATE.token && APP_STATE.user) {
    showAppShell();
    syncAllData(false);
  } else {
    loadPublicInfo();
  }
});

function toggleApiConfig() {
  document.getElementById("apiConfigPanel").classList.toggle("hidden");
}

function saveApiUrl() {
  const url = document.getElementById("apiUrlInput").value.trim();
  if (!url.startsWith("https://script.google.com/")) {
    showToast("URL Web App Google Apps Script tidak valid.", "error");
    return;
  }
  APP_STATE.apiUrl = url;
  localStorage.setItem("SIK_DESA_API_URL", url);
  showToast("URL API berhasil disimpan.", "success");
  loadPublicInfo();
}

async function apiRequest(action, data = {}, showLoader = true) {
  if (!APP_STATE.apiUrl || APP_STATE.apiUrl.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
    showToast("Silakan atur URL Web App Google Apps Script terlebih dahulu.", "warning");
    document.getElementById("apiConfigPanel")?.classList.remove("hidden");
    throw new Error("API URL belum dikonfigurasi");
  }
  if (showLoader) setLoading(true);
  try {
    const response = await fetch(APP_STATE.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: action,
        token: APP_STATE.token,
        data: data
      })
    });
    const res = await response.json();
    if (res.status === "unauthorized") {
      forceLogout();
      throw new Error(res.message);
    }
    return res;
  } finally {
    if (showLoader) setLoading(false);
  }
}

function setLoading(state, text = "Menyinkronkan data dengan Google Spreadsheet...") {
  const el = document.getElementById("loadingOverlay");
  document.getElementById("loadingText").textContent = text;
  el.classList.toggle("hidden", !state);
}

function showToast(msg, type = "success") {
  const box = document.getElementById("toastContainer");
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// ============================================================================
// AUTENTIKASI (LOGIN / LOGOUT)
// ============================================================================
async function loadPublicInfo() {
  if (!APP_STATE.apiUrl || APP_STATE.apiUrl.includes("PASTE_YOUR_WEB_APP_URL_HERE")) return;
  try {
    const res = await apiRequest("getPublicInfo", {}, false);
    if (res.status === "success" && res.pengaturan) {
      document.getElementById("loginDesaTitle").textContent = res.pengaturan.nama_desa;
    }
  } catch (e) {}
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const res = await apiRequest("login", { username, password }, true);
    if (res.status === "success") {
      APP_STATE.token = res.token;
      APP_STATE.user = res.user;
      sessionStorage.setItem("SIK_DESA_TOKEN", res.token);
      sessionStorage.setItem("SIK_DESA_USER", JSON.stringify(res.user));
      showToast("Selamat datang, " + res.user.nama_lengkap, "success");
      showAppShell();
      await syncAllData(false);
    } else {
      showToast(res.message || "Login gagal.", "error");
    }
  } catch (err) {
    showToast("Gagal terhubung ke server: " + err.message, "error");
  }
}

async function handleLogout() {
  try {
    await apiRequest("logout", {}, false);
  } catch (e) {}
  forceLogout();
}

function forceLogout() {
  APP_STATE.token = "";
  APP_STATE.user = null;
  sessionStorage.removeItem("SIK_DESA_TOKEN");
  sessionStorage.removeItem("SIK_DESA_USER");
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

function showAppShell() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("headerUserName").textContent = APP_STATE.user.nama_lengkap;
  document.getElementById("headerUserRole").textContent = APP_STATE.user.role;

  // Pembatasan tampilan berdasarkan role
  const role = APP_STATE.user.role;
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", role !== "Administrator");
  });
  document.querySelectorAll(".write-only").forEach(el => {
    el.classList.toggle("hidden", role === "Viewer");
  });
}

// ============================================================================
// SINKRONISASI UTAMA DARI GOOGLE SPREADSHEET
// ============================================================================
async function syncAllData(notify = false) {
  try {
    const res = await apiRequest("syncAll", {}, true);
    if (res.status !== "success") {
      showToast(res.message, "error");
      return;
    }
    APP_STATE.penduduk = res.penduduk || [];
    APP_STATE.kartu_keluarga = res.kartu_keluarga || [];
    APP_STATE.anggota_kk = res.anggota_kk || [];
    APP_STATE.mutasi_datang = res.mutasi_datang || [];
    APP_STATE.mutasi_pindah = res.mutasi_pindah || [];
    APP_STATE.mutasi_meninggal = res.mutasi_meninggal || [];
    APP_STATE.referensi = res.referensi || [];
    APP_STATE.pengaturan = res.pengaturan || {};
    APP_STATE.pengguna = res.pengguna || [];
    APP_STATE.log_aktivitas = res.log_aktivitas || [];

    document.getElementById("syncStatusBadge").innerHTML =
      `<i class="fa-solid fa-circle-check"></i> Sync: ${res.server_time}`;

    applySettingsToUI();
    populateFilterDropdowns();
    renderDashboardKPI();
    renderDashboardCharts();
    filterAndRenderPenduduk(APP_STATE.currentPage);
    renderKKTable();
    if (APP_STATE.selectedKKNo) openKKDetail(APP_STATE.selectedKKNo);
    if (APP_STATE.selectedBiodataNik) renderBiodataDetail(APP_STATE.selectedBiodataNik);
    renderMutasiTables();
    renderAllRekapitulasi();
    generateLaporanPreview();
    renderPengaturanForm();
    renderUsersTable();
    renderLogsTable();

    if (notify) showToast("Data berhasil disinkronkan dari Google Spreadsheet.", "success");
  } catch (e) {
    showToast("Gagal sinkronisasi: " + e.message, "error");
  }
}

function applySettingsToUI() {
  const cfg = APP_STATE.pengaturan;
  document.getElementById("sidebarDesaName").textContent = cfg.nama_desa || "Pemerintah Desa";
  if (cfg.logo_desa) {
    const img = document.getElementById("sidebarLogo");
    img.src = cfg.logo_desa;
    img.classList.remove("hidden");
    document.getElementById("sidebarLogoFallback").classList.add("hidden");
  }
}

// ============================================================================
// NAVIGASI UI
// ============================================================================
function navigateTo(pageId, el) {
  document.querySelectorAll(".page-section").forEach(sec => sec.classList.remove("active"));
  document.getElementById("page-" + pageId).classList.add("active");

  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  if (el) el.classList.add("active");

  const titles = {
    "dashboard": "Dashboard Utama",
    "penduduk": "Data Penduduk Desa",
    "biodata": "Biodata Detail Penduduk",
    "kk": "Manajemen Kartu Keluarga (KK)",
    "mutasi-datang": "Mutasi Penduduk Datang",
    "mutasi-pindah": "Mutasi Penduduk Pindah",
    "mutasi-meninggal": "Mutasi Penduduk Meninggal",
    "rekapitulasi": "Rekapitulasi Statistik Penduduk",
    "laporan": "Laporan Resmi Kependudukan",
    "pengaturan": "Pengaturan Sistem & Desa",
    "pengguna": "Manajemen Pengguna",
    "log": "Log Aktivitas Sistem"
  };
  document.getElementById("pageTitle").textContent = titles[pageId] || "SIK-DESA";
  document.getElementById("sidebar").classList.remove("open");
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

function toggleSubmenu(id, btn) {
  document.getElementById(id).classList.toggle("open");
}

// ============================================================================
// HELPER KALKULASI USIA & REFERENSI
// ============================================================================
function calculateAge(birthDateStr) {
  if (!birthDateStr) return 0;
  const dob = new Date(birthDateStr);
  if (isNaN(dob.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

function formatDateID(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getRefOptions(kategori) {
  return APP_STATE.referensi
    .filter(r => r.kategori === kategori)
    .sort((a, b) => Number(a.urutan) - Number(b.urutan))
    .map(r => r.nilai);
}

function populateFilterDropdowns() {
  const fill = (id, items, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = `<option value="">${label}</option>` + items.map(v => `<option value="${v}">${v}</option>`).join("");
    el.value = prev;
  };
  fill("fltEducation", getRefOptions("PENDIDIKAN"), "Semua Pendidikan");
  fill("fltJob", getRefOptions("PEKERJAAN"), "Semua Pekerjaan");
  fill("fltReligion", getRefOptions("AGAMA"), "Semua Agama");
  fill("fltDusun", getRefOptions("DUSUN"), "Semua Dusun");
  fill("fltRW", getRefOptions("RW"), "Semua RW");
  fill("fltRT", getRefOptions("RT"), "Semua RT");

  fill("rekapDusun", getRefOptions("DUSUN"), "Semua Dusun");
  fill("rekapRW", getRefOptions("RW"), "Semua RW");
  fill("rekapRT", getRefOptions("RT"), "Semua RT");

  const curYear = new Date().getFullYear();
  const years = [];
  for (let y = curYear; y >= curYear - 5; y--) years.push(String(y));

  ["chartMutasiYear", "rekapYear", "laporanTahun"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  });
}

// ============================================================================
// 1. DASHBOARD KPI & 8 GRAFIK CHART.JS
// ============================================================================
function renderDashboardKPI() {
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");
  const curYear = String(new Date().getFullYear());

  document.getElementById("kpiTotalPenduduk").textContent = aktif.length;
  document.getElementById("kpiTotalKK").textContent = APP_STATE.kartu_keluarga.length;
  document.getElementById("kpiLaki").textContent = aktif.filter(p => p.jenis_kelamin === "Laki-laki").length;
  document.getElementById("kpiPerempuan").textContent = aktif.filter(p => p.jenis_kelamin === "Perempuan").length;
  document.getElementById("kpiDatang").textContent = APP_STATE.mutasi_datang.length;
  document.getElementById("kpiPindah").textContent = APP_STATE.mutasi_pindah.length;
  document.getElementById("kpiMeninggal").textContent = APP_STATE.mutasi_meninggal.length;
  document.getElementById("kpiLahir").textContent = aktif.filter(p => String(p.tanggal_lahir).startsWith(curYear)).length;
}

function drawChart(canvasId, type, labels, datasets, extraOptions = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (APP_STATE.charts[canvasId]) {
    APP_STATE.charts[canvasId].destroy();
  }
  APP_STATE.charts[canvasId] = new Chart(ctx, {
    type: type,
    data: { labels, datasets },
    options: Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } }
    }, extraOptions)
  });
}

function countByField(list, field) {
  const map = {};
  list.forEach(item => {
    const key = item[field] || "Tidak Diketahui";
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function renderDashboardCharts() {
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");
  const palette = ["#1e3a5f", "#2563eb", "#0d9488", "#d97706", "#dc2626", "#6366f1", "#0891b2", "#16a34a", "#db2777", "#64748b"];

  // 1. Jenis Kelamin
  const laki = aktif.filter(p => p.jenis_kelamin === "Laki-laki").length;
  const perem = aktif.filter(p => p.jenis_kelamin === "Perempuan").length;
  drawChart("chartGender", "doughnut", ["Laki-laki", "Perempuan"], [{
    data: [laki, perem], backgroundColor: ["#1e3a5f", "#ec4899"]
  }]);

  // 2. Kelompok Usia
  const ageBuckets = { "0-4": 0, "5-14": 0, "15-24": 0, "25-44": 0, "45-64": 0, "65+": 0 };
  aktif.forEach(p => {
    const u = calculateAge(p.tanggal_lahir);
    if (u <= 4) ageBuckets["0-4"]++;
    else if (u <= 14) ageBuckets["5-14"]++;
    else if (u <= 24) ageBuckets["15-24"]++;
    else if (u <= 44) ageBuckets["25-44"]++;
    else if (u <= 64) ageBuckets["45-64"]++;
    else ageBuckets["65+"]++;
  });
  drawChart("chartAge", "bar", Object.keys(ageBuckets), [{
    label: "Jumlah Jiwa", data: Object.values(ageBuckets), backgroundColor: "#2563eb"
  }]);

  // 3. Pendidikan
  const eduMap = countByField(aktif, "pendidikan");
  drawChart("chartEducation", "bar", Object.keys(eduMap), [{
    label: "Jumlah", data: Object.values(eduMap), backgroundColor: "#0d9488"
  }], { indexAxis: "y" });

  // 4. Pekerjaan (Top 10)
  const jobEntries = Object.entries(countByField(aktif, "jenis_pekerjaan")).sort((a, b) => b[1] - a[1]).slice(0, 10);
  drawChart("chartJob", "bar", jobEntries.map(e => e[0]), [{
    label: "Jumlah", data: jobEntries.map(e => e[1]), backgroundColor: "#6366f1"
  }], { indexAxis: "y" });

  // 5. Agama
  const relMap = countByField(aktif, "agama");
  drawChart("chartReligion", "pie", Object.keys(relMap), [{
    data: Object.values(relMap), backgroundColor: palette
  }]);

  // 6. Status Perkawinan
  const marMap = countByField(aktif, "status_perkawinan");
  drawChart("chartMarital", "doughnut", Object.keys(marMap), [{
    data: Object.values(marMap), backgroundColor: palette
  }]);

  // 7. Dusun
  const dusunMap = countByField(aktif, "dusun");
  drawChart("chartDusun", "bar", Object.keys(dusunMap), [{
    label: "Penduduk Aktif", data: Object.values(dusunMap), backgroundColor: "#1e3a5f"
  }]);

  // 8. Mutasi Per Bulan
  const selYear = document.getElementById("chartMutasiYear")?.value || String(new Date().getFullYear());
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const mDatang = Array(12).fill(0), mPindah = Array(12).fill(0), mMeninggal = Array(12).fill(0);

  APP_STATE.mutasi_datang.forEach(m => {
    if (String(m.tanggal_datang).startsWith(selYear)) {
      const idx = parseInt(String(m.tanggal_datang).split("-")[1], 10) - 1;
      if (idx >= 0 && idx < 12) mDatang[idx]++;
    }
  });
  APP_STATE.mutasi_pindah.forEach(m => {
    if (String(m.tanggal_pindah).startsWith(selYear)) {
      const idx = parseInt(String(m.tanggal_pindah).split("-")[1], 10) - 1;
      if (idx >= 0 && idx < 12) mPindah[idx]++;
    }
  });
  APP_STATE.mutasi_meninggal.forEach(m => {
    if (String(m.tanggal_meninggal).startsWith(selYear)) {
      const idx = parseInt(String(m.tanggal_meninggal).split("-")[1], 10) - 1;
      if (idx >= 0 && idx < 12) mMeninggal[idx]++;
    }
  });

  drawChart("chartMutasi", "line", months, [
    { label: "Datang", data: mDatang, borderColor: "#16a34a", tension: 0.3 },
    { label: "Pindah", data: mPindah, borderColor: "#d97706", tension: 0.3 },
    { label: "Meninggal", data: mMeninggal, borderColor: "#dc2626", tension: 0.3 }
  ]);
}

// ============================================================================
// 2. DATA PENDUDUK (FILTER, SORT, PAGINATION, CRUD, IMPORT/EXPORT)
// ============================================================================
function filterAndRenderPenduduk(page = 1) {
  APP_STATE.currentPage = page;
  const q = document.getElementById("searchPenduduk").value.trim().toLowerCase();
  const gender = document.getElementById("fltGender").value;
  const ageGrp = document.getElementById("fltAgeGroup").value;
  const edu = document.getElementById("fltEducation").value;
  const job = document.getElementById("fltJob").value;
  const rel = document.getElementById("fltReligion").value;
  const dusun = document.getElementById("fltDusun").value;
  const rw = document.getElementById("fltRW").value;
  const rt = document.getElementById("fltRT").value;
  const status = document.getElementById("fltStatus").value;
  const sortBy = document.getElementById("sortPenduduk").value;

  let list = APP_STATE.penduduk.filter(p => {
    if (status && p.status_kependudukan !== status) return false;
    if (gender && p.jenis_kelamin !== gender) return false;
    if (edu && p.pendidikan !== edu) return false;
    if (job && p.jenis_pekerjaan !== job) return false;
    if (rel && p.agama !== rel) return false;
    if (dusun && p.dusun !== dusun) return false;
    if (rw && p.rw !== rw) return false;
    if (rt && p.rt !== rt) return false;
    if (ageGrp) {
      const u = calculateAge(p.tanggal_lahir);
      if (ageGrp === "balita" && u > 4) return false;
      if (ageGrp === "anak" && (u < 5 || u > 14)) return false;
      if (ageGrp === "remaja" && (u < 15 || u > 24)) return false;
      if (ageGrp === "produktif" && (u < 15 || u > 64)) return false;
      if (ageGrp === "lansia" && u < 65) return false;
    }
    if (q) {
      const match = p.nik.includes(q) || p.no_kk.includes(q) || p.nama_lengkap.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === "nama_asc") return a.nama_lengkap.localeCompare(b.nama_lengkap);
    if (sortBy === "nama_desc") return b.nama_lengkap.localeCompare(a.nama_lengkap);
    if (sortBy === "nik_asc") return a.nik.localeCompare(b.nik);
    if (sortBy === "nik_desc") return b.nik.localeCompare(a.nik);
    return 0;
  });

  APP_STATE.filteredPenduduk = list;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / APP_STATE.pageSize));
  if (APP_STATE.currentPage > totalPages) APP_STATE.currentPage = totalPages;

  const start = (APP_STATE.currentPage - 1) * APP_STATE.pageSize;
  const slice = list.slice(start, start + APP_STATE.pageSize);
  const canWrite = APP_STATE.user?.role !== "Viewer";

  const tbody = document.getElementById("tbodyPenduduk");
  tbody.innerHTML = slice.map((p, idx) => {
    const usia = calculateAge(p.tanggal_lahir);
    const badgeCls = p.status_kependudukan === "AKTIF" ? "badge-aktif" : (p.status_kependudukan === "PINDAH" ? "badge-pindah" : "badge-meninggal");
    return `
      <tr>
        <td>${start + idx + 1}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openBiodataPage('${p.nik}')" title="Biodata"><i class="fa-solid fa-eye"></i></button>
          ${canWrite ? `
            <button class="btn btn-sm btn-secondary" onclick="openPendudukModal('${p.id_penduduk}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deletePenduduk('${p.id_penduduk}', '${p.nama_lengkap}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
          ` : ""}
        </td>
        <td><strong>${p.nik}</strong></td>
        <td>${p.no_kk || "-"}</td>
        <td><strong>${p.nama_lengkap}</strong></td>
        <td>${p.jenis_kelamin}</td>
        <td>${p.tempat_lahir}</td>
        <td>${formatDateID(p.tanggal_lahir)}</td>
        <td>${usia} th</td>
        <td>${p.agama}</td>
        <td>${p.pendidikan}</td>
        <td>${p.jenis_pekerjaan}</td>
        <td>${p.status_perkawinan}</td>
        <td>${p.status_hubungan}</td>
        <td>${p.kewarganegaraan}</td>
        <td>${p.nama_ayah}</td>
        <td>${p.nama_ibu}</td>
        <td>${p.alamat}</td>
        <td>${p.rt}</td>
        <td>${p.rw}</td>
        <td>${p.dusun}</td>
        <td><span class="badge ${badgeCls}">${p.status_kependudukan}</span></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="22" style="text-align:center;padding:24px;">Tidak ada data penduduk yang cocok.</td></tr>`;

  document.getElementById("pendudukCountInfo").textContent =
    `Menampilkan ${total ? start + 1 : 0} - ${Math.min(start + APP_STATE.pageSize, total)} dari ${total} penduduk`;

  const pagEl = document.getElementById("pendudukPagination");
  let btns = "";
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - APP_STATE.currentPage) <= 2) {
      btns += `<button class="btn btn-sm ${i === APP_STATE.currentPage ? "btn-primary" : "btn-outline"}" onclick="filterAndRenderPenduduk(${i})">${i}</button>`;
    }
  }
  pagEl.innerHTML = btns;
}

function resetPendudukFilters() {
  document.getElementById("searchPenduduk").value = "";
  ["fltGender", "fltAgeGroup", "fltEducation", "fltJob", "fltReligion", "fltDusun", "fltRW", "fltRT"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("fltStatus").value = "AKTIF";
  filterAndRenderPenduduk(1);
}

function buildOptionsHTML(arr, selected) {
  return arr.map(v => `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`).join("");
}

function openPendudukModal(idPenduduk = null) {
  const p = idPenduduk ? APP_STATE.penduduk.find(x => x.id_penduduk === idPenduduk) : {};
  const title = idPenduduk ? "Edit Data Penduduk" : "Tambah Data Penduduk Baru";

  const html = `
    <form id="formPenduduk" onsubmit="submitPendudukForm(event, '${idPenduduk || ""}')">
      <div class="form-grid">
        <div class="form-group">
          <label>NIK (16 Digit) *</label>
          <input type="text" name="nik" maxlength="16" pattern="\\d{16}" value="${p.nik || ""}" required oninput="checkNikDuplicateLive(this.value, '${idPenduduk || ""}')" />
          <small id="nikWarnMsg" style="color:#dc2626;font-weight:600;"></small>
        </div>
        <div class="form-group">
          <label>Nomor KK (16 Digit)</label>
          <input type="text" name="no_kk" maxlength="16" list="kkDatalist" value="${p.no_kk || ""}" />
          <datalist id="kkDatalist">
            ${APP_STATE.kartu_keluarga.map(k => `<option value="${k.no_kk}">${k.nama_kepala}</option>`).join("")}
          </datalist>
        </div>
        <div class="form-group full">
          <label>Nama Lengkap (Sesuai KTP/Akta) *</label>
          <input type="text" name="nama_lengkap" value="${p.nama_lengkap || ""}" required style="text-transform:uppercase;" />
        </div>
        <div class="form-group">
          <label>Jenis Kelamin *</label>
          <select name="jenis_kelamin">
            <option value="Laki-laki" ${p.jenis_kelamin === "Laki-laki" ? "selected" : ""}>Laki-laki</option>
            <option value="Perempuan" ${p.jenis_kelamin === "Perempuan" ? "selected" : ""}>Perempuan</option>
          </select>
        </div>
        <div class="form-group">
          <label>Golongan Darah</label>
          <select name="golongan_darah">${buildOptionsHTML(getRefOptions("GOLONGAN_DARAH"), p.golongan_darah || "-")}</select>
        </div>
        <div class="form-group">
          <label>Tempat Lahir *</label>
          <input type="text" name="tempat_lahir" value="${p.tempat_lahir || ""}" required />
        </div>
        <div class="form-group">
          <label>Tanggal Lahir *</label>
          <input type="date" name="tanggal_lahir" value="${p.tanggal_lahir || ""}" required />
        </div>
        <div class="form-group">
          <label>Agama</label>
          <select name="agama">${buildOptionsHTML(getRefOptions("AGAMA"), p.agama || "Islam")}</select>
        </div>
        <div class="form-group">
          <label>Pendidikan Terakhir</label>
          <select name="pendidikan">${buildOptionsHTML(getRefOptions("PENDIDIKAN"), p.pendidikan || "SLTA/Sederajat")}</select>
        </div>
        <div class="form-group">
          <label>Jenis Pekerjaan</label>
          <select name="jenis_pekerjaan">${buildOptionsHTML(getRefOptions("PEKERJAAN"), p.jenis_pekerjaan || "Belum/Tidak Bekerja")}</select>
        </div>
        <div class="form-group">
          <label>Status Perkawinan</label>
          <select name="status_perkawinan">${buildOptionsHTML(getRefOptions("STATUS_PERKAWINAN"), p.status_perkawinan || "Belum Kawin")}</select>
        </div>
        <div class="form-group">
          <label>Tanggal Perkawinan (Jika Kawin)</label>
          <input type="date" name="tanggal_perkawinan" value="${p.tanggal_perkawinan || ""}" />
        </div>
        <div class="form-group">
          <label>Status Hubungan Dalam Keluarga</label>
          <select name="status_hubungan">${buildOptionsHTML(getRefOptions("STATUS_HUBUNGAN"), p.status_hubungan || "Kepala Keluarga")}</select>
        </div>
        <div class="form-group">
          <label>Kewarganegaraan</label>
          <select name="kewarganegaraan">
            <option value="WNI" ${p.kewarganegaraan !== "WNA" ? "selected" : ""}>WNI</option>
            <option value="WNA" ${p.kewarganegaraan === "WNA" ? "selected" : ""}>WNA</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nomor Paspor</label>
          <input type="text" name="no_paspor" value="${p.no_paspor || "-"}" />
        </div>
        <div class="form-group">
          <label>Nomor KITAP</label>
          <input type="text" name="no_kitap" value="${p.no_kitap || "-"}" />
        </div>
        <div class="form-group">
          <label>Nama Ayah</label>
          <input type="text" name="nama_ayah" value="${p.nama_ayah || ""}" />
        </div>
        <div class="form-group">
          <label>Nama Ibu</label>
          <input type="text" name="nama_ibu" value="${p.nama_ibu || ""}" />
        </div>
        <div class="form-group full">
          <label>Alamat Lengkap</label>
          <input type="text" name="alamat" value="${p.alamat || ""}" />
        </div>
        <div class="form-group">
          <label>Dusun</label>
          <select name="dusun">${buildOptionsHTML(getRefOptions("DUSUN"), p.dusun || "")}</select>
        </div>
        <div class="form-group">
          <label>RW</label>
          <select name="rw">${buildOptionsHTML(getRefOptions("RW"), p.rw || "001")}</select>
        </div>
        <div class="form-group">
          <label>RT</label>
          <select name="rt">${buildOptionsHTML(getRefOptions("RT"), p.rt || "001")}</select>
        </div>
        <div class="form-group">
          <label>Status Kependudukan</label>
          <select name="status_kependudukan">
            <option value="AKTIF" ${p.status_kependudukan === "AKTIF" ? "selected" : ""}>AKTIF</option>
            <option value="PINDAH" ${p.status_kependudukan === "PINDAH" ? "selected" : ""}>PINDAH</option>
            <option value="MENINGGAL" ${p.status_kependudukan === "MENINGGAL" ? "selected" : ""}>MENINGGAL</option>
          </select>
        </div>
      </div>
      <div style="margin-top:16px;text-align:right;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Simpan Data Penduduk</button>
      </div>
    </form>
  `;
  openModal(title, html);
}

function checkNikDuplicateLive(val, currentId) {
  const warn = document.getElementById("nikWarnMsg");
  if (!warn) return;
  if (val.length === 16) {
    const dup = APP_STATE.penduduk.find(p => p.nik === val && p.id_penduduk !== currentId);
    warn.textContent = dup ? `PERINGATAN: NIK sudah terdaftar a.n. ${dup.nama_lengkap}!` : "";
  } else {
    warn.textContent = val.length > 0 ? `NIK harus 16 digit (saat ini ${val.length} digit)` : "";
  }
}

async function submitPendudukForm(e, idPenduduk) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  if (idPenduduk) payload.id_penduduk = idPenduduk;

  const res = await apiRequest("savePenduduk", payload, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

async function deletePenduduk(id, nama) {
  if (!confirm(`Yakin ingin menghapus data penduduk "${nama}" dari Google Spreadsheet?`)) return;
  const res = await apiRequest("deletePenduduk", { id_penduduk: id }, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

function exportPendudukExcel() {
  const rows = APP_STATE.filteredPenduduk.map((p, i) => ({
    "No": i + 1,
    "NIK": p.nik,
    "Nomor KK": p.no_kk,
    "Nama Lengkap": p.nama_lengkap,
    "Jenis Kelamin": p.jenis_kelamin,
    "Tempat Lahir": p.tempat_lahir,
    "Tanggal Lahir": p.tanggal_lahir,
    "Usia": calculateAge(p.tanggal_lahir),
    "Agama": p.agama,
    "Pendidikan": p.pendidikan,
    "Jenis Pekerjaan": p.jenis_pekerjaan,
    "Status Perkawinan": p.status_perkawinan,
    "Hubungan Keluarga": p.status_hubungan,
    "Kewarganegaraan": p.kewarganegaraan,
    "Nama Ayah": p.nama_ayah,
    "Nama Ibu": p.nama_ibu,
    "Alamat": p.alamat,
    "RT": p.rt,
    "RW": p.rw,
    "Dusun": p.dusun,
    "Status Kependudukan": p.status_kependudukan
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data_Penduduk");
  XLSX.writeFile(wb, `Data_Penduduk_Desa_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function handleExcelImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet);
      const mapped = rawRows.map(r => ({
        nik: r.NIK || r.nik || "",
        no_kk: r["Nomor KK"] || r.no_kk || "",
        nama_lengkap: r["Nama Lengkap"] || r.nama_lengkap || "",
        jenis_kelamin: r["Jenis Kelamin"] || r.jenis_kelamin || "Laki-laki",
        tempat_lahir: r["Tempat Lahir"] || r.tempat_lahir || "",
        tanggal_lahir: r["Tanggal Lahir"] || r.tanggal_lahir || "",
        agama: r.Agama || r.agama || "Islam",
        pendidikan: r.Pendidikan || r.pendidikan || "SLTA/Sederajat",
        jenis_pekerjaan: r["Jenis Pekerjaan"] || r.jenis_pekerjaan || "Belum/Tidak Bekerja",
        status_perkawinan: r["Status Perkawinan"] || r.status_perkawinan || "Belum Kawin",
        status_hubungan: r["Hubungan Keluarga"] || r.status_hubungan || "Famili Lain",
        nama_ayah: r["Nama Ayah"] || r.nama_ayah || "",
        nama_ibu: r["Nama Ibu"] || r.nama_ibu || "",
        alamat: r.Alamat || r.alamat || "",
        rt: r.RT || r.rt || "001",
        rw: r.RW || r.rw || "001",
        dusun: r.Dusun || r.dusun || ""
      }));
      const res = await apiRequest("importPenduduk", { rows: mapped }, true);
      showToast(res.message, res.status === "success" ? "success" : "error");
      e.target.value = "";
      await syncAllData(false);
    } catch (err) {
      showToast("Gagal membaca file Excel: " + err.message, "error");
    }
  };
  reader.readAsBinaryString(file);
}

function printDaftarPenduduk() {
  const cfg = APP_STATE.pengaturan;
  const rowsHTML = APP_STATE.filteredPenduduk.map((p, i) => `
    <tr>
      <td>${i + 1}</td><td>${p.nik}</td><td>${p.no_kk}</td><td>${p.nama_lengkap}</td>
      <td>${p.jenis_kelamin === "Laki-laki" ? "L" : "P"}</td>
      <td>${p.tempat_lahir}, ${formatDateID(p.tanggal_lahir)}</td>
      <td>${calculateAge(p.tanggal_lahir)}</td>
      <td>${p.alamat} RT ${p.rt}/RW ${p.rw} ${p.dusun}</td>
    </tr>
  `).join("");

  triggerPrint(`
    <div style="font-family:Arial,sans-serif;font-size:9pt;">
      <h3 style="text-align:center;margin-bottom:4px;">DAFTAR PENDUDUK ${cfg.nama_desa || ""}</h3>
      <p style="text-align:center;margin-bottom:12px;">Tanggal Cetak: ${formatDateID(new Date().toISOString())}</p>
      <table border="1" cellspacing="0" cellpadding="4" width="100%" style="border-collapse:collapse;">
        <thead><tr><th>No</th><th>NIK</th><th>No. KK</th><th>Nama Lengkap</th><th>L/P</th><th>TTL</th><th>Usia</th><th>Alamat</th></tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
  `, "landscape");
}

// ============================================================================
// 3. BIODATA PENDUDUK
// ============================================================================
function searchBiodataOptions() {
  const q = document.getElementById("searchBiodataInput").value.trim().toLowerCase();
  const dd = document.getElementById("biodataSearchDropdown");
  if (!q) { dd.classList.add("hidden"); return; }
  const matches = APP_STATE.penduduk.filter(p => p.nik.includes(q) || p.nama_lengkap.toLowerCase().includes(q)).slice(0, 10);
  if (!matches.length) { dd.classList.add("hidden"); return; }
  dd.innerHTML = matches.map(p => `
    <div style="padding:8px 12px;border-bottom:1px solid #e2e8f0;cursor:pointer;" onclick="selectBiodata('${p.nik}')">
      <strong>${p.nama_lengkap}</strong> — NIK: ${p.nik} (${p.status_kependudukan})
    </div>
  `).join("");
  dd.classList.remove("hidden");
}

function openBiodataPage(nik) {
  navigateTo("biodata", document.querySelector('[data-page="biodata"]'));
  selectBiodata(nik);
}

function selectBiodata(nik) {
  document.getElementById("biodataSearchDropdown").classList.add("hidden");
  APP_STATE.selectedBiodataNik = nik;
  renderBiodataDetail(nik);
}

function renderBiodataDetail(nik) {
  const p = APP_STATE.penduduk.find(x => x.nik === nik);
  if (!p) return;
  const cfg = APP_STATE.pengaturan;
  const kk = APP_STATE.kartu_keluarga.find(k => k.no_kk === p.no_kk);
  const datang = APP_STATE.mutasi_datang.filter(m => m.nik === nik);
  const pindah = APP_STATE.mutasi_pindah.filter(m => m.nik === nik);
  const meninggal = APP_STATE.mutasi_meninggal.filter(m => m.nik === nik);

  document.getElementById("biodataActionBtns").style.display = "flex";
  document.getElementById("btnEditBiodata").onclick = () => openPendudukModal(p.id_penduduk);
  document.getElementById("btnViewKKFromBiodata").onclick = () => {
    if (!p.no_kk) { showToast("Penduduk ini belum terhubung dengan Nomor KK.", "warning"); return; }
    navigateTo("kk", document.querySelector('[data-page="kk"]'));
    openKKDetail(p.no_kk);
  };

  document.getElementById("biodataDetailContainer").innerHTML = `
    <div id="biodataPrintable">
      <div class="biodata-section-title">A. IDENTITAS PRIBADI</div>
      <table class="biodata-table">
        <tr><td>NIK</td><td><strong>${p.nik}</strong></td></tr>
        <tr><td>Nama Lengkap</td><td><strong>${p.nama_lengkap}</strong></td></tr>
        <tr><td>Jenis Kelamin</td><td>${p.jenis_kelamin}</td></tr>
        <tr><td>Tempat, Tanggal Lahir</td><td>${p.tempat_lahir}, ${formatDateID(p.tanggal_lahir)}</td></tr>
        <tr><td>Usia</td><td>${calculateAge(p.tanggal_lahir)} Tahun</td></tr>
        <tr><td>Agama</td><td>${p.agama}</td></tr>
        <tr><td>Pendidikan Terakhir</td><td>${p.pendidikan}</td></tr>
        <tr><td>Jenis Pekerjaan</td><td>${p.jenis_pekerjaan}</td></tr>
        <tr><td>Golongan Darah</td><td>${p.golongan_darah || "-"}</td></tr>
        <tr><td>Status Perkawinan</td><td>${p.status_perkawinan}</td></tr>
        <tr><td>Kewarganegaraan</td><td>${p.kewarganegaraan}</td></tr>
      </table>

      <div class="biodata-section-title">B. DATA KELUARGA</div>
      <table class="biodata-table">
        <tr><td>Nomor Kartu Keluarga (KK)</td><td><strong>${p.no_kk || "-"}</strong></td></tr>
        <tr><td>Status Hubungan Dalam Keluarga</td><td>${p.status_hubungan}</td></tr>
        <tr><td>Nama Kepala Keluarga</td><td>${kk ? kk.nama_kepala : "-"}</td></tr>
        <tr><td>Nama Ayah</td><td>${p.nama_ayah || "-"}</td></tr>
        <tr><td>Nama Ibu</td><td>${p.nama_ibu || "-"}</td></tr>
      </table>

      <div class="biodata-section-title">C. ALAMAT DOMISILI</div>
      <table class="biodata-table">
        <tr><td>Alamat Lengkap</td><td>${p.alamat || "-"}</td></tr>
        <tr><td>RT / RW</td><td>RT ${p.rt} / RW ${p.rw}</td></tr>
        <tr><td>Dusun</td><td>${p.dusun || "-"}</td></tr>
        <tr><td>Desa / Kecamatan</td><td>${cfg.nama_desa_singkat || "-"} / Kec. ${cfg.kecamatan || "-"}</td></tr>
        <tr><td>Kabupaten / Provinsi</td><td>${cfg.kabupaten || "-"} / ${cfg.provinsi || "-"}</td></tr>
        <tr><td>Kode Pos</td><td>${p.kode_pos || cfg.kode_pos || "-"}</td></tr>
      </table>

      <div class="biodata-section-title">D. RIWAYAT KEPENDUDUKAN</div>
      <table class="biodata-table">
        <tr><td>Status Kependudukan Saat Ini</td><td><strong>${p.status_kependudukan}</strong></td></tr>
        <tr><td>Riwayat Kelahiran</td><td>Lahir di ${p.tempat_lahir} pada ${formatDateID(p.tanggal_lahir)}</td></tr>
        <tr><td>Riwayat Kedatangan</td><td>${datang.length ? datang.map(d => `Datang tgl ${formatDateID(d.tanggal_datang)} dari ${d.alamat_asal} (${d.no_transaksi})`).join("; ") : "Tidak ada catatan kedatangan"}</td></tr>
        <tr><td>Riwayat Perpindahan</td><td>${pindah.length ? pindah.map(d => `Pindah tgl ${formatDateID(d.tanggal_pindah)} ke ${d.alamat_tujuan} (${d.no_transaksi})`).join("; ") : "Tidak ada catatan perpindahan"}</td></tr>
        <tr><td>Riwayat Kematian</td><td>${meninggal.length ? meninggal.map(d => `Meninggal tgl ${formatDateID(d.tanggal_meninggal)} di ${d.tempat_meninggal} (${d.no_transaksi})`).join("; ") : "-"}</td></tr>
        <tr><td>Pembaruan Data Terakhir</td><td>${p.updated_at || p.created_at || "-"}</td></tr>
      </table>
    </div>
  `;
}

function printBiodata() {
  const content = document.getElementById("biodataPrintable")?.innerHTML;
  if (!content) return;
  const cfg = APP_STATE.pengaturan;
  triggerPrint(`
    <div style="font-family:Arial,sans-serif;padding:10mm;">
      <h2 style="text-align:center;margin-bottom:4px;">BIODATA PENDUDUK</h2>
      <p style="text-align:center;margin-bottom:14px;">${cfg.nama_desa || ""} — ${cfg.kabupaten || ""}</p>
      ${content}
    </div>
  `, "portrait");
}

// ============================================================================
// 4. KARTU KELUARGA (KK) & CETAK FORMAT KK A4 LANDSCAPE
// ============================================================================
function renderKKTable() {
  const q = document.getElementById("searchKKInput").value.trim().toLowerCase();
  const list = APP_STATE.kartu_keluarga.filter(k =>
    k.no_kk.includes(q) || k.nama_kepala.toLowerCase().includes(q)
  );
  const canWrite = APP_STATE.user?.role !== "Viewer";

  document.getElementById("tbodyKK").innerHTML = list.map((k, idx) => {
    const jml = APP_STATE.penduduk.filter(p => p.no_kk === k.no_kk && p.status_kependudukan === "AKTIF").length;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${k.no_kk}</strong></td>
        <td><strong>${k.nama_kepala}</strong></td>
        <td>${k.nik_kepala}</td>
        <td>${k.alamat}</td>
        <td>RT ${k.rt} / RW ${k.rw}</td>
        <td>${k.dusun}</td>
        <td>${jml} Jiwa</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="openKKDetail('${k.no_kk}')"><i class="fa-solid fa-users"></i> Anggota & Cetak</button>
          ${canWrite ? `
            <button class="btn btn-sm btn-secondary" onclick="openKKModal('${k.id_kk}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteKK('${k.id_kk}', '${k.no_kk}')"><i class="fa-solid fa-trash"></i></button>
          ` : ""}
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="9" style="text-align:center;padding:20px;">Belum ada data Kartu Keluarga.</td></tr>`;
}

function openKKModal(idKK = null) {
  const k = idKK ? APP_STATE.kartu_keluarga.find(x => x.id_kk === idKK) : {};
  const cfg = APP_STATE.pengaturan;
  const html = `
    <form onsubmit="submitKKForm(event, '${idKK || ""}')">
      <div class="form-grid">
        <div class="form-group">
          <label>Nomor Kartu Keluarga (16 Digit) *</label>
          <input type="text" name="no_kk" maxlength="16" pattern="\\d{16}" value="${k.no_kk || ""}" required />
        </div>
        <div class="form-group">
          <label>Pilih Kepala Keluarga (Dari Database Penduduk)</label>
          <input type="text" name="nik_kepala" list="pendudukNikList" placeholder="Ketik NIK Kepala Keluarga" value="${k.nik_kepala || ""}" onchange="autoFillKepalaName(this.value)" />
          <datalist id="pendudukNikList">
            ${APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF").map(p => `<option value="${p.nik}">${p.nama_lengkap}</option>`).join("")}
          </datalist>
        </div>
        <div class="form-group full">
          <label>Nama Kepala Keluarga *</label>
          <input type="text" id="inputNamaKepalaKK" name="nama_kepala" value="${k.nama_kepala || ""}" required style="text-transform:uppercase;" />
        </div>
        <div class="form-group full">
          <label>Alamat *</label>
          <input type="text" name="alamat" value="${k.alamat || ""}" required />
        </div>
        <div class="form-group"><label>Dusun</label><select name="dusun">${buildOptionsHTML(getRefOptions("DUSUN"), k.dusun || "")}</select></div>
        <div class="form-group"><label>RW</label><select name="rw">${buildOptionsHTML(getRefOptions("RW"), k.rw || "001")}</select></div>
        <div class="form-group"><label>RT</label><select name="rt">${buildOptionsHTML(getRefOptions("RT"), k.rt || "001")}</select></div>
        <div class="form-group"><label>Kode Pos</label><input type="text" name="kode_pos" value="${k.kode_pos || cfg.kode_pos || ""}" /></div>
        <div class="form-group"><label>Desa/Kelurahan</label><input type="text" name="desa" value="${k.desa || cfg.nama_desa_singkat || ""}" /></div>
        <div class="form-group"><label>Kecamatan</label><input type="text" name="kecamatan" value="${k.kecamatan || cfg.kecamatan || ""}" /></div>
        <div class="form-group"><label>Kabupaten/Kota</label><input type="text" name="kabupaten" value="${k.kabupaten || cfg.kabupaten || ""}" /></div>
        <div class="form-group"><label>Provinsi</label><input type="text" name="provinsi" value="${k.provinsi || cfg.provinsi || ""}" /></div>
        <div class="form-group"><label>Tanggal Dikeluarkan</label><input type="date" name="tanggal_dikeluarkan" value="${k.tanggal_dikeluarkan || new Date().toISOString().slice(0,10)}" /></div>
      </div>
      <div style="margin-top:16px;text-align:right;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan Kartu Keluarga</button>
      </div>
    </form>
  `;
  openModal(idKK ? "Edit Kartu Keluarga" : "Tambah Kartu Keluarga Baru", html);
}

function autoFillKepalaName(nik) {
  const p = APP_STATE.penduduk.find(x => x.nik === nik);
  if (p) document.getElementById("inputNamaKepalaKK").value = p.nama_lengkap;
}

async function submitKKForm(e, idKK) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  if (idKK) payload.id_kk = idKK;
  const res = await apiRequest("saveKK", payload, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

async function deleteKK(idKK, noKK) {
  if (!confirm(`Hapus Kartu Keluarga No. ${noKK}?`)) return;
  const res = await apiRequest("deleteKK", { id_kk: idKK }, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    APP_STATE.selectedKKNo = null;
    document.getElementById("kkDetailPanel").classList.add("hidden");
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

function openKKDetail(noKK) {
  APP_STATE.selectedKKNo = noKK;
  const kk = APP_STATE.kartu_keluarga.find(k => k.no_kk === noKK);
  if (!kk) return;

  const panel = document.getElementById("kkDetailPanel");
  panel.classList.remove("hidden");
  document.getElementById("kkDetailTitle").textContent = `Kartu Keluarga No. ${kk.no_kk} — Kepala: ${kk.nama_kepala}`;
  document.getElementById("kkDetailSubtitle").textContent = `${kk.alamat}, RT ${kk.rt}/RW ${kk.rw}, ${kk.dusun}`;

  const members = getSortedKKMembers(noKK);
  const canWrite = APP_STATE.user?.role !== "Viewer";

  document.getElementById("tbodyAnggotaKK").innerHTML = members.map((m, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${m.nik}</td>
      <td><strong>${m.nama_lengkap}</strong></td>
      <td>${m.jenis_kelamin}</td>
      <td>${m.tempat_lahir}, ${formatDateID(m.tanggal_lahir)}</td>
      <td>${m.status_hubungan}</td>
      <td><span class="badge badge-aktif">${m.status_kependudukan}</span></td>
      <td>
        ${canWrite ? `
          <button class="btn btn-sm btn-outline" onclick="setKepalaKK('${noKK}', '${m.nik}')">Jadikan Kepala</button>
          <button class="btn btn-sm btn-secondary" onclick="openMoveAnggotaModal('${m.nik}', '${m.nama_lengkap}')">Pindah KK</button>
          <button class="btn btn-sm btn-danger" onclick="removeAnggotaKK('${noKK}', '${m.nik}')">Keluarkan</button>
        ` : "-"}
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8" style="text-align:center;">Belum ada anggota keluarga terdaftar pada KK ini.</td></tr>`;
}

function getSortedKKMembers(noKK) {
  const orderMap = { "Kepala Keluarga": 1, "Suami": 2, "Istri": 3, "Anak": 4, "Menantu": 5, "Cucu": 6, "Orang Tua": 7, "Mertua": 8, "Famili Lain": 9 };
  return APP_STATE.penduduk
    .filter(p => p.no_kk === noKK && p.status_kependudukan === "AKTIF")
    .sort((a, b) => (orderMap[a.status_hubungan] || 99) - (orderMap[b.status_hubungan] || 99));
}

function openAddAnggotaKKModal() {
  const html = `
    <form onsubmit="submitAddAnggotaKK(event)">
      <div class="form-group">
        <label>Pilih Penduduk (NIK / Nama) *</label>
        <input type="text" name="nik" list="allActivePenduduk" required placeholder="Ketik NIK atau Nama..." />
        <datalist id="allActivePenduduk">
          ${APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF").map(p => `<option value="${p.nik}">${p.nama_lengkap} (KK: ${p.no_kk || "Kosong"})</option>`).join("")}
        </datalist>
      </div>
      <div class="form-group">
        <label>Status Hubungan Dalam Keluarga *</label>
        <select name="status_hubungan">${buildOptionsHTML(getRefOptions("STATUS_HUBUNGAN"), "Anak")}</select>
      </div>
      <div style="text-align:right;margin-top:14px;">
        <button type="submit" class="btn btn-primary">Tambahkan ke KK</button>
      </div>
    </form>
  `;
  openModal("Tambah Anggota ke KK " + APP_STATE.selectedKKNo, html);
}

async function submitAddAnggotaKK(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  fd.no_kk = APP_STATE.selectedKKNo;
  const res = await apiRequest("addAnggotaKK", fd, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

async function setKepalaKK(noKK, nik) {
  const res = await apiRequest("setKepalaKK", { no_kk: noKK, nik }, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

async function removeAnggotaKK(noKK, nik) {
  if (!confirm("Keluarkan anggota ini dari Kartu Keluarga?")) return;
  const res = await apiRequest("removeAnggotaKK", { no_kk: noKK, nik }, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

function openMoveAnggotaModal(nik, nama) {
  const html = `
    <form onsubmit="submitMoveAnggota(event, '${nik}')">
      <p style="margin-bottom:12px;">Memindahkan <strong>${nama}</strong> (${nik}) ke Kartu Keluarga lain:</p>
      <div class="form-group">
        <label>Nomor KK Tujuan *</label>
        <input type="text" name="target_no_kk" list="kkDatalist" required />
        <datalist id="kkDatalist">
          ${APP_STATE.kartu_keluarga.map(k => `<option value="${k.no_kk}">${k.nama_kepala}</option>`).join("")}
        </datalist>
      </div>
      <div class="form-group">
        <label>Status Hubungan di KK Baru</label>
        <select name="status_hubungan">${buildOptionsHTML(getRefOptions("STATUS_HUBUNGAN"), "Famili Lain")}</select>
      </div>
      <div style="text-align:right;margin-top:14px;">
        <button type="submit" class="btn btn-primary">Pindahkan Anggota</button>
      </div>
    </form>
  `;
  openModal("Pindah Kartu Keluarga", html);
}

async function submitMoveAnggota(e, nik) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  fd.nik = nik;
  const res = await apiRequest("moveAnggotaKK", fd, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else {
    showToast(res.message, "error");
  }
}

/**
 * GENERATOR HTML CETAK KARTU KELUARGA (A4 LANDSCAPE - STANDAR NASIONAL)
 */
function buildKartuKeluargaHTML(noKK) {
  const kk = APP_STATE.kartu_keluarga.find(k => k.no_kk === noKK);
  if (!kk) return "";
  const cfg = APP_STATE.pengaturan;
  const members = getSortedKKMembers(noKK);

  // Minimal 10 baris seperti blanko KK standar agar proporsi terjaga
  const totalRows = Math.max(10, members.length);

  let table1Rows = "";
  let table2Rows = "";

  for (let i = 0; i < totalRows; i++) {
    const m = members[i];
    table1Rows += `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${m ? m.nama_lengkap : "&nbsp;"}</td>
        <td class="center">${m ? m.nik : ""}</td>
        <td class="center">${m ? m.jenis_kelamin.toUpperCase() : ""}</td>
        <td>${m ? m.tempat_lahir.toUpperCase() : ""}</td>
        <td class="center">${m ? formatDateID(m.tanggal_lahir) : ""}</td>
        <td class="center">${m ? m.agama.toUpperCase() : ""}</td>
        <td>${m ? m.pendidikan.toUpperCase() : ""}</td>
        <td>${m ? m.jenis_pekerjaan.toUpperCase() : ""}</td>
        <td class="center">${m ? (m.golongan_darah || "-") : ""}</td>
      </tr>
    `;

    table2Rows += `
      <tr>
        <td class="center">${i + 1}</td>
        <td class="center">${m ? m.status_perkawinan.toUpperCase() : "&nbsp;"}</td>
        <td class="center">${m ? (m.tanggal_perkawinan ? formatDateID(m.tanggal_perkawinan) : "-") : ""}</td>
        <td class="center">${m ? m.status_hubungan.toUpperCase() : ""}</td>
        <td class="center">${m ? (m.kewarganegaraan || "WNI") : ""}</td>
        <td class="center">${m ? (m.no_paspor || "-") : ""}</td>
        <td class="center">${m ? (m.no_kitap || "-") : ""}</td>
        <td>${m ? (m.nama_ayah || "-").toUpperCase() : ""}</td>
        <td>${m ? (m.nama_ibu || "-").toUpperCase() : ""}</td>
      </tr>
    `;
  }

  return `
    <div class="kk-sheet">
      <div class="kk-header">
        <div class="kk-garuda">
          <svg viewBox="0 0 64 64" fill="none" stroke="#000" stroke-width="2">
            <circle cx="32" cy="32" r="28" />
            <path d="M18 34 L32 14 L46 34 L32 50 Z" />
            <circle cx="32" cy="32" r="6" />
          </svg>
          <span>REPUBLIK INDONESIA</span>
        </div>
        <div class="kk-title-center">
          <h1>KARTU KELUARGA</h1>
          <div class="kk-no">No. ${kk.no_kk}</div>
        </div>
        <div style="width:62px;"></div>
      </div>

      <div class="kk-meta-grid">
        <table class="kk-meta-table">
          <tr><td>Nama Kepala Keluarga</td><td>: <strong>${kk.nama_kepala}</strong></td></tr>
          <tr><td>Alamat</td><td>: ${kk.alamat.toUpperCase()}</td></tr>
          <tr><td>RT / RW</td><td>: ${kk.rt} / ${kk.rw}</td></tr>
          <tr><td>Kode Pos</td><td>: ${kk.kode_pos || cfg.kode_pos || "-"}</td></tr>
        </table>
        <table class="kk-meta-table">
          <tr><td>Desa / Kelurahan</td><td>: ${(kk.desa || cfg.nama_desa_singkat || "-").toUpperCase()}</td></tr>
          <tr><td>Kecamatan</td><td>: ${(kk.kecamatan || cfg.kecamatan || "-").toUpperCase()}</td></tr>
          <tr><td>Kabupaten / Kota</td><td>: ${(kk.kabupaten || cfg.kabupaten || "-").toUpperCase()}</td></tr>
          <tr><td>Provinsi</td><td>: ${(kk.provinsi || cfg.provinsi || "-").toUpperCase()}</td></tr>
        </table>
      </div>

      <!-- TABEL PERTAMA: DATA ANGGOTA KELUARGA -->
      <table class="kk-table">
        <thead>
          <tr>
            <th style="width:26px;">No.</th>
            <th>Nama Lengkap</th>
            <th style="width:115px;">NIK</th>
            <th style="width:72px;">Jenis Kelamin</th>
            <th style="width:95px;">Tempat Lahir</th>
            <th style="width:74px;">Tanggal Lahir</th>
            <th style="width:62px;">Agama</th>
            <th>Pendidikan</th>
            <th>Jenis Pekerjaan</th>
            <th style="width:52px;">Golongan Darah</th>
          </tr>
          <tr>
            <th></th><th>(1)</th><th>(2)</th><th>(3)</th><th>(4)</th><th>(5)</th><th>(6)</th><th>(7)</th><th>(8)</th><th>(9)</th>
          </tr>
        </thead>
        <tbody>${table1Rows}</tbody>
      </table>

      <!-- TABEL KEDUA: DATA STATUS DAN HUBUNGAN KELUARGA -->
      <table class="kk-table">
        <thead>
          <tr>
            <th rowspan="2" style="width:26px;">No.</th>
            <th rowspan="2">Status Perkawinan</th>
            <th rowspan="2" style="width:82px;">Tanggal Perkawinan</th>
            <th rowspan="2">Status Hubungan Dalam Keluarga</th>
            <th rowspan="2" style="width:72px;">Kewarganegaraan</th>
            <th colspan="2">Dokumen Imigrasi</th>
            <th colspan="2">Nama Orang Tua</th>
          </tr>
          <tr>
            <th style="width:82px;">No. Paspor</th>
            <th style="width:82px;">No. KITAP</th>
            <th>Ayah</th>
            <th>Ibu</th>
          </tr>
          <tr>
            <th></th><th>(10)</th><th>(11)</th><th>(12)</th><th>(13)</th><th>(14)</th><th>(15)</th><th>(16)</th><th>(17)</th>
          </tr>
        </thead>
        <tbody>${table2Rows}</tbody>
      </table>

      <div class="kk-footer">
        <div style="width:30%;">
          Dikeluarkan Tanggal: <strong>${formatDateID(kk.tanggal_dikeluarkan)}</strong>
        </div>
        <div class="kk-sign-box">
          KEPALA KELUARGA
          <br><br><br><br>
          <u><strong>${kk.nama_kepala}</strong></u><br>
          Tanda Tangan / Cap Jempol
        </div>
        <div class="kk-sign-box">
          ${(cfg.jabatan_penandatangan || "KEPALA DESA").toUpperCase()}
          <br><br><br><br>
          <u><strong>${(cfg.nama_kepala_desa || "").toUpperCase()}</strong></u><br>
          NIP. ${cfg.nip_kepala_desa || "-"}
        </div>
      </div>

      <div class="kk-disclaimer">
        Catatan: Dokumen ini adalah salinan / pratinjau data kependudukan internal Pemerintah Desa (${cfg.nama_desa || ""}) untuk keperluan administrasi desa, bukan pengganti dokumen Kartu Keluarga resmi yang diterbitkan oleh Dinas Kependudukan dan Pencatatan Sipil (Disdukcapil).
      </div>
    </div>
  `;
}

function previewCetakKK() {
  if (!APP_STATE.selectedKKNo) return;
  const html = `
    <div style="margin-bottom:12px;text-align:right;">
      <button class="btn btn-primary" onclick="printKartuKeluarga()"><i class="fa-solid fa-print"></i> Cetak Sekarang (A4 Landscape)</button>
    </div>
    <div style="border:1px solid #cbd5e1;overflow-x:auto;">
      ${buildKartuKeluargaHTML(APP_STATE.selectedKKNo)}
    </div>
  `;
  openModal("Preview Kartu Keluarga (Format A4 Landscape)", html, true);
}

function printKartuKeluarga() {
  if (!APP_STATE.selectedKKNo) return;
  triggerPrint(buildKartuKeluargaHTML(APP_STATE.selectedKKNo), "landscape");
}

// ============================================================================
// 5. MUTASI PENDUDUK (DATANG, PINDAH, MENINGGAL)
// ============================================================================
function renderMutasiTables() {
  document.getElementById("tbodyMutasiDatang").innerHTML = APP_STATE.mutasi_datang.map(m => `
    <tr>
      <td><strong>${m.no_transaksi}</strong></td>
      <td>${formatDateID(m.tanggal_datang)}</td>
      <td>${m.nik}</td>
      <td>${m.nama_lengkap}</td>
      <td>${m.jenis_kelamin}</td>
      <td>${m.alamat_asal}</td>
      <td>${m.alamat_tujuan} (RT ${m.rt}/RW ${m.rw} ${m.dusun})</td>
      <td>${m.no_surat_pindah || "-"}</td>
      <td><span class="badge badge-aktif">${m.status_verifikasi}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="9" style="text-align:center;padding:18px;">Belum ada data mutasi datang.</td></tr>`;

  document.getElementById("tbodyMutasiPindah").innerHTML = APP_STATE.mutasi_pindah.map(m => `
    <tr>
      <td><strong>${m.no_transaksi}</strong></td>
      <td>${formatDateID(m.tanggal_pindah)}</td>
      <td>${m.nik}</td>
      <td>${m.nama_lengkap}</td>
      <td>${m.no_kk || "-"}</td>
      <td>${m.alamat_tujuan}, Desa ${m.desa_tujuan}, Kec. ${m.kecamatan_tujuan}, ${m.kabupaten_tujuan}</td>
      <td>${m.alasan_pindah}</td>
      <td><span class="badge badge-pindah">${m.status_verifikasi}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="8" style="text-align:center;padding:18px;">Belum ada data mutasi pindah.</td></tr>`;

  document.getElementById("tbodyMutasiMeninggal").innerHTML = APP_STATE.mutasi_meninggal.map(m => `
    <tr>
      <td><strong>${m.no_transaksi}</strong></td>
      <td>${formatDateID(m.tanggal_meninggal)}</td>
      <td>${m.nik}</td>
      <td>${m.nama_lengkap}</td>
      <td>${m.jenis_kelamin}</td>
      <td>${m.tempat_meninggal} — ${m.penyebab_meninggal}</td>
      <td>${m.no_surat_kematian || "-"}</td>
      <td><span class="badge badge-meninggal">${m.status_verifikasi}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="8" style="text-align:center;padding:18px;">Belum ada data kematian.</td></tr>`;
}

function openMutasiDatangModal() {
  const html = `
    <form onsubmit="submitMutasiDatang(event)">
      <div class="form-grid">
        <div class="form-group"><label>NIK (16 Digit) *</label><input type="text" name="nik" maxlength="16" pattern="\\d{16}" required /></div>
        <div class="form-group"><label>Nomor KK (Opsional)</label><input type="text" name="no_kk" maxlength="16" /></div>
        <div class="form-group full"><label>Nama Lengkap *</label><input type="text" name="nama_lengkap" required /></div>
        <div class="form-group"><label>Tempat Lahir *</label><input type="text" name="tempat_lahir" required /></div>
        <div class="form-group"><label>Tanggal Lahir *</label><input type="date" name="tanggal_lahir" required /></div>
        <div class="form-group"><label>Jenis Kelamin</label><select name="jenis_kelamin"><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select></div>
        <div class="form-group"><label>Tanggal Kedatangan *</label><input type="date" name="tanggal_datang" value="${new Date().toISOString().slice(0,10)}" required /></div>
        <div class="form-group full"><label>Alamat Asal *</label><input type="text" name="alamat_asal" required /></div>
        <div class="form-group full"><label>Alamat Tujuan di Desa *</label><input type="text" name="alamat_tujuan" required /></div>
        <div class="form-group"><label>Dusun</label><select name="dusun">${buildOptionsHTML(getRefOptions("DUSUN"), "")}</select></div>
        <div class="form-group"><label>RW</label><select name="rw">${buildOptionsHTML(getRefOptions("RW"), "001")}</select></div>
        <div class="form-group"><label>RT</label><select name="rt">${buildOptionsHTML(getRefOptions("RT"), "001")}</select></div>
        <div class="form-group"><label>No. Surat Keterangan Pindah</label><input type="text" name="no_surat_pindah" /></div>
        <div class="form-group full"><label>Keterangan</label><input type="text" name="keterangan" /></div>
      </div>
      <div style="text-align:right;margin-top:14px;">
        <button type="submit" class="btn btn-primary">Simpan & Verifikasi Kedatangan</button>
      </div>
    </form>
  `;
  openModal("Input Mutasi Penduduk Datang", html);
}

async function submitMutasiDatang(e) {
  e.preventDefault();
  const res = await apiRequest("saveMutasiDatang", Object.fromEntries(new FormData(e.target).entries()), true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else showToast(res.message, "error");
}

function openMutasiPindahModal() {
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");
  const html = `
    <form onsubmit="submitMutasiPindah(event)">
      <div class="form-grid">
        <div class="form-group full">
          <label>Pilih Penduduk Aktif (NIK) *</label>
          <input type="text" name="nik" list="pindahList" required placeholder="Ketik NIK atau Nama..." />
          <datalist id="pindahList">${aktif.map(p => `<option value="${p.nik}">${p.nama_lengkap} (KK: ${p.no_kk})</option>`).join("")}</datalist>
        </div>
        <div class="form-group"><label>Tanggal Pindah *</label><input type="date" name="tanggal_pindah" value="${new Date().toISOString().slice(0,10)}" required /></div>
        <div class="form-group"><label>Alasan Pindah</label><input type="text" name="alasan_pindah" placeholder="Pekerjaan / Ikut Keluarga / Pendidikan" /></div>
        <div class="form-group full"><label>Alamat Tujuan Lengkap *</label><input type="text" name="alamat_tujuan" required /></div>
        <div class="form-group"><label>Desa/Kelurahan Tujuan</label><input type="text" name="desa_tujuan" /></div>
        <div class="form-group"><label>Kecamatan Tujuan</label><input type="text" name="kecamatan_tujuan" /></div>
        <div class="form-group"><label>Kabupaten/Kota Tujuan</label><input type="text" name="kabupaten_tujuan" /></div>
        <div class="form-group"><label>Provinsi Tujuan</label><input type="text" name="provinsi_tujuan" /></div>
        <div class="form-group full"><label>Keterangan</label><input type="text" name="keterangan" /></div>
      </div>
      <div style="text-align:right;margin-top:14px;">
        <button type="submit" class="btn btn-primary">Sahkan Perpindahan Penduduk</button>
      </div>
    </form>
  `;
  openModal("Input Mutasi Penduduk Pindah", html);
}

async function submitMutasiPindah(e) {
  e.preventDefault();
  const res = await apiRequest("saveMutasiPindah", Object.fromEntries(new FormData(e.target).entries()), true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else showToast(res.message, "error");
}

function openMutasiMeninggalModal() {
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");
  const html = `
    <form onsubmit="submitMutasiMeninggal(event)">
      <div class="form-grid">
        <div class="form-group full">
          <label>Pilih Penduduk (NIK) *</label>
          <input type="text" name="nik" list="meninggalList" required placeholder="Ketik NIK atau Nama..." />
          <datalist id="meninggalList">${aktif.map(p => `<option value="${p.nik}">${p.nama_lengkap}</option>`).join("")}</datalist>
        </div>
        <div class="form-group"><label>Tanggal Meninggal *</label><input type="date" name="tanggal_meninggal" value="${new Date().toISOString().slice(0,10)}" required /></div>
        <div class="form-group"><label>Tempat Meninggal *</label><input type="text" name="tempat_meninggal" placeholder="Rumah / RSUD ..." required /></div>
        <div class="form-group"><label>Penyebab Meninggal</label><input type="text" name="penyebab_meninggal" placeholder="Sakit / Usia Lanjut / Kecelakaan" /></div>
        <div class="form-group"><label>No. Surat Keterangan Kematian</label><input type="text" name="no_surat_kematian" /></div>
        <div class="form-group full"><label>Keterangan</label><input type="text" name="keterangan" /></div>
      </div>
      <div style="text-align:right;margin-top:14px;">
        <button type="submit" class="btn btn-primary">Simpan & Arsipkan Data Kematian</button>
      </div>
    </form>
  `;
  openModal("Input Data Penduduk Meninggal", html);
}

async function submitMutasiMeninggal(e) {
  e.preventDefault();
  const res = await apiRequest("saveMutasiMeninggal", Object.fromEntries(new FormData(e.target).entries()), true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else showToast(res.message, "error");
}

// ============================================================================
// 6. REKAPITULASI PENDUDUK DINAMIS
// ============================================================================
function switchRekapTab(tabName, btn) {
  APP_STATE.activeRekapTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderAllRekapitulasi();
}

function getFilteredRekapPenduduk() {
  const dusun = document.getElementById("rekapDusun")?.value || "";
  const rw = document.getElementById("rekapRW")?.value || "";
  const rt = document.getElementById("rekapRT")?.value || "";
  return APP_STATE.penduduk.filter(p => {
    if (p.status_kependudukan !== "AKTIF") return false;
    if (dusun && p.dusun !== dusun) return false;
    if (rw && p.rw !== rw) return false;
    if (rt && p.rt !== rt) return false;
    return true;
  });
}

function buildRekapTableHTML(title, rows, total) {
  return `
    <h4 style="margin-bottom:10px;">${title}</h4>
    <table class="data-table">
      <thead><tr><th>No</th><th>Kategori</th><th>Laki-laki</th><th>Perempuan</th><th>Jumlah</th><th>Persentase</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${r.label}</strong></td>
            <td>${r.l}</td>
            <td>${r.p}</td>
            <td><strong>${r.total}</strong></td>
            <td>${total > 0 ? ((r.total / total) * 100).toFixed(2) : "0.00"}%</td>
          </tr>
        `).join("")}
        <tr style="background:#f8fafc;font-weight:700;">
          <td colspan="2">TOTAL KESELURUHAN</td>
          <td>${rows.reduce((s, r) => s + r.l, 0)}</td>
          <td>${rows.reduce((s, r) => s + r.p, 0)}</td>
          <td>${total}</td>
          <td>100.00%</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderAllRekapitulasi() {
  const list = getFilteredRekapPenduduk();
  const total = list.length;
  const tab = APP_STATE.activeRekapTab;
  const container = document.getElementById("rekapContent");

  const groupBy = (field, orderList = null) => {
    const keys = orderList || [...new Set(list.map(p => p[field] || "Lainnya"))];
    return keys.map(k => {
      const sub = list.filter(p => (p[field] || "Lainnya") === k);
      return {
        label: k,
        l: sub.filter(p => p.jenis_kelamin === "Laki-laki").length,
        p: sub.filter(p => p.jenis_kelamin === "Perempuan").length,
        total: sub.length
      };
    });
  };

  if (tab === "gender") {
    container.innerHTML = buildRekapTableHTML("Rekapitulasi Berdasarkan Jenis Kelamin", groupBy("jenis_kelamin", ["Laki-laki", "Perempuan"]), total);
  } else if (tab === "usia") {
    const ranges = [
      ["0–4 tahun", 0, 4], ["5–9 tahun", 5, 9], ["10–14 tahun", 10, 14], ["15–19 tahun", 15, 19],
      ["20–24 tahun", 20, 24], ["25–29 tahun", 25, 29], ["30–34 tahun", 30, 34], ["35–39 tahun", 35, 39],
      ["40–44 tahun", 40, 44], ["45–49 tahun", 45, 49], ["50–54 tahun", 50, 54], ["55–59 tahun", 55, 59],
      ["60–64 tahun", 60, 64], ["65–69 tahun", 65, 69], ["70–74 tahun", 70, 74], ["75 tahun ke atas", 75, 200]
    ];
    const rows = ranges.map(([lbl, min, max]) => {
      const sub = list.filter(p => { const u = calculateAge(p.tanggal_lahir); return u >= min && u <= max; });
      return { label: lbl, l: sub.filter(p => p.jenis_kelamin === "Laki-laki").length, p: sub.filter(p => p.jenis_kelamin === "Perempuan").length, total: sub.length };
    });

    const macro = [
      ["Balita (0–4 th)", 0, 4], ["Anak-anak (5–14 th)", 5, 14], ["Remaja (15–24 th)", 15, 24],
      ["Usia Produktif (15–64 th)", 15, 64], ["Lansia (65+ th)", 65, 200]
    ].map(([lbl, min, max]) => {
      const sub = list.filter(p => { const u = calculateAge(p.tanggal_lahir); return u >= min && u <= max; });
      return { label: lbl, l: sub.filter(p => p.jenis_kelamin === "Laki-laki").length, p: sub.filter(p => p.jenis_kelamin === "Perempuan").length, total: sub.length };
    });

    container.innerHTML = buildRekapTableHTML("Rekapitulasi Kelompok Usia 5 Tahunan", rows, total) +
      "<br>" + buildRekapTableHTML("Rekapitulasi Kategori Demografi Usia", macro, total);
  } else if (tab === "pendidikan") {
    container.innerHTML = buildRekapTableHTML("Rekapitulasi Berdasarkan Pendidikan", groupBy("pendidikan", getRefOptions("PENDIDIKAN")), total);
  } else if (tab === "pekerjaan") {
    container.innerHTML = buildRekapTableHTML("Rekapitulasi Berdasarkan Pekerjaan", groupBy("jenis_pekerjaan", getRefOptions("PEKERJAAN")), total);
  } else if (tab === "agama") {
    container.innerHTML = buildRekapTableHTML("Rekapitulasi Berdasarkan Agama", groupBy("agama", getRefOptions("AGAMA")), total);
  } else if (tab === "perkawinan") {
    container.innerHTML = buildRekapTableHTML("Rekapitulasi Berdasarkan Status Perkawinan", groupBy("status_perkawinan", getRefOptions("STATUS_PERKAWINAN")), total);
  } else if (tab === "wilayah") {
    container.innerHTML =
      buildRekapTableHTML("Rekapitulasi Per Dusun", groupBy("dusun"), total) + "<br>" +
      buildRekapTableHTML("Rekapitulasi Per RW", groupBy("rw"), total) + "<br>" +
      buildRekapTableHTML("Rekapitulasi Per RT", groupBy("rt"), total);
  }
}

// ============================================================================
// 7. LAPORAN KEPENDUDUKAN RESMI (16 JENIS LAPORAN)
// ============================================================================
function generateLaporanPreview() {
  const jenis = document.getElementById("jenisLaporanSelect").value;
  const bulan = document.getElementById("laporanBulan").value;
  const tahun = document.getElementById("laporanTahun").value || String(new Date().getFullYear());
  const cfg = APP_STATE.pengaturan;
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");

  const titles = {
    "1": "LAPORAN JUMLAH PENDUDUK KESELURUHAN",
    "2": "LAPORAN PENDUDUK BERDASARKAN JENIS KELAMIN",
    "3": "LAPORAN PENDUDUK BERDASARKAN KELOMPOK USIA",
    "4": "LAPORAN PENDUDUK BERDASARKAN PENDIDIKAN",
    "5": "LAPORAN PENDUDUK BERDASARKAN PEKERJAAN",
    "6": "LAPORAN PENDUDUK BERDASARKAN AGAMA",
    "7": "LAPORAN PENDUDUK BERDASARKAN STATUS PERKAWINAN",
    "8": "LAPORAN JUMLAH KARTU KELUARGA (KK)",
    "9": "LAPORAN ANGGOTA KELUARGA PER KARTU KELUARGA",
    "10": "LAPORAN PENDUDUK BERDASARKAN DUSUN",
    "11": "LAPORAN PENDUDUK BERDASARKAN RT / RW",
    "12": "LAPORAN MUTASI PENDUDUK DATANG",
    "13": "LAPORAN MUTASI PENDUDUK PINDAH",
    "14": "LAPORAN MUTASI PENDUDUK MENINGGAL",
    "15": "LAPORAN PERKEMBANGAN PENDUDUK BULANAN",
    "16": "LAPORAN PERKEMBANGAN PENDUDUK TAHUNAN"
  };

  let bodyTable = "";
  const makeSummaryTable = (field) => {
    const keys = [...new Set(aktif.map(p => p[field] || "Lainnya"))];
    const rows = keys.map((k, i) => {
      const sub = aktif.filter(p => (p[field] || "Lainnya") === k);
      const l = sub.filter(p => p.jenis_kelamin === "Laki-laki").length;
      const pr = sub.filter(p => p.jenis_kelamin === "Perempuan").length;
      return `<tr><td>${i + 1}</td><td>${k}</td><td style="text-align:center;">${l}</td><td style="text-align:center;">${pr}</td><td style="text-align:center;"><strong>${sub.length}</strong></td></tr>`;
    }).join("");
    return `<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;font-size:10pt;">
      <thead><tr><th>No</th><th>Uraian / Kategori</th><th>Laki-laki</th><th>Perempuan</th><th>Jumlah</th></tr></thead>
      <tbody>${rows}<tr><td colspan="2"><strong>TOTAL</strong></td><td style="text-align:center;"><strong>${aktif.filter(p=>p.jenis_kelamin==="Laki-laki").length}</strong></td><td style="text-align:center;"><strong>${aktif.filter(p=>p.jenis_kelamin==="Perempuan").length}</strong></td><td style="text-align:center;"><strong>${aktif.length}</strong></td></tr></tbody>
    </table>`;
  };

  if (jenis === "1" || jenis === "10") bodyTable = makeSummaryTable("dusun");
  else if (jenis === "2") bodyTable = makeSummaryTable("jenis_kelamin");
  else if (jenis === "3") {
    const groups = [["0-4 Tahun",0,4],["5-14 Tahun",5,14],["15-24 Tahun",15,24],["25-44 Tahun",25,44],["45-64 Tahun",45,64],["65+ Tahun",65,200]];
    bodyTable = `<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;font-size:10pt;">
      <thead><tr><th>No</th><th>Kelompok Usia</th><th>Laki-laki</th><th>Perempuan</th><th>Jumlah</th></tr></thead>
      <tbody>${groups.map(([lbl, min, max], i) => {
        const sub = aktif.filter(p => { const u = calculateAge(p.tanggal_lahir); return u >= min && u <= max; });
        return `<tr><td>${i+1}</td><td>${lbl}</td><td style="text-align:center;">${sub.filter(p=>p.jenis_kelamin==="Laki-laki").length}</td><td style="text-align:center;">${sub.filter(p=>p.jenis_kelamin==="Perempuan").length}</td><td style="text-align:center;">${sub.length}</td></tr>`;
      }).join("")}</tbody></table>`;
  }
  else if (jenis === "4") bodyTable = makeSummaryTable("pendidikan");
  else if (jenis === "5") bodyTable = makeSummaryTable("jenis_pekerjaan");
  else if (jenis === "6") bodyTable = makeSummaryTable("agama");
  else if (jenis === "7") bodyTable = makeSummaryTable("status_perkawinan");
  else if (jenis === "8") {
    bodyTable = `<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;font-size:10pt;">
      <thead><tr><th>No</th><th>Nomor KK</th><th>Kepala Keluarga</th><th>Alamat</th><th>RT/RW</th><th>Dusun</th><th>Anggota</th></tr></thead>
      <tbody>${APP_STATE.kartu_keluarga.map((k, i) => `<tr><td>${i+1}</td><td>${k.no_kk}</td><td>${k.nama_kepala}</td><td>${k.alamat}</td><td>${k.rt}/${k.rw}</td><td>${k.dusun}</td><td style="text-align:center;">${aktif.filter(p=>p.no_kk===k.no_kk).length}</td></tr>`).join("")}</tbody></table>`;
  }
  else if (jenis === "9") {
    bodyTable = `<table border="1" cellspacing="0" cellpadding="5" width="100%" style="border-collapse:collapse;font-size:9pt;">
      <thead><tr><th>No</th><th>No. KK</th><th>NIK</th><th>Nama Lengkap</th><th>Hubungan Keluarga</th><th>L/P</th><th>Usia</th></tr></thead>
      <tbody>${aktif.map((p, i) => `<tr><td>${i+1}</td><td>${p.no_kk}</td><td>${p.nik}</td><td>${p.nama_lengkap}</td><td>${p.status_hubungan}</td><td>${p.jenis_kelamin}</td><td>${calculateAge(p.tanggal_lahir)}</td></tr>`).join("")}</tbody></table>`;
  }
  else if (jenis === "11") bodyTable = makeSummaryTable("rt");
  else if (jenis === "12") {
    const list = APP_STATE.mutasi_datang.filter(m => String(m.tanggal_datang).startsWith(tahun + (bulan ? "-" + bulan : "")));
    bodyTable = `<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;font-size:9.5pt;">
      <thead><tr><th>No</th><th>No. Transaksi</th><th>Tanggal</th><th>NIK</th><th>Nama</th><th>Alamat Asal</th><th>Alamat Tujuan</th></tr></thead>
      <tbody>${list.map((m, i) => `<tr><td>${i+1}</td><td>${m.no_transaksi}</td><td>${formatDateID(m.tanggal_datang)}</td><td>${m.nik}</td><td>${m.nama_lengkap}</td><td>${m.alamat_asal}</td><td>${m.alamat_tujuan}</td></tr>`).join("")}</tbody></table>`;
  }
  else if (jenis === "13") {
    const list = APP_STATE.mutasi_pindah.filter(m => String(m.tanggal_pindah).startsWith(tahun + (bulan ? "-" + bulan : "")));
    bodyTable = `<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;font-size:9.5pt;">
      <thead><tr><th>No</th><th>No. Transaksi</th><th>Tanggal</th><th>NIK</th><th>Nama</th><th>Tujuan</th><th>Alasan</th></tr></thead>
      <tbody>${list.map((m, i) => `<tr><td>${i+1}</td><td>${m.no_transaksi}</td><td>${formatDateID(m.tanggal_pindah)}</td><td>${m.nik}</td><td>${m.nama_lengkap}</td><td>${m.alamat_tujuan}</td><td>${m.alasan_pindah}</td></tr>`).join("")}</tbody></table>`;
  }
  else if (jenis === "14") {
    const list = APP_STATE.mutasi_meninggal.filter(m => String(m.tanggal_meninggal).startsWith(tahun + (bulan ? "-" + bulan : "")));
    bodyTable = `<table border="1" cellspacing="0" cellpadding="6" width="100%" style="border-collapse:collapse;font-size:9.5pt;">
      <thead><tr><th>No</th><th>No. Transaksi</th><th>Tanggal</th><th>NIK</th><th>Nama</th><th>Tempat & Penyebab</th></tr></thead>
      <tbody>${list.map((m, i) => `<tr><td>${i+1}</td><td>${m.no_transaksi}</td><td>${formatDateID(m.tanggal_meninggal)}</td><td>${m.nik}</td><td>${m.nama_lengkap}</td><td>${m.tempat_meninggal} (${m.penyebab_meninggal})</td></tr>`).join("")}</tbody></table>`;
  }
  else {
    // 15 & 16 Perkembangan Penduduk Bulanan / Tahunan
    const dtg = APP_STATE.mutasi_datang.filter(m => String(m.tanggal_datang).startsWith(tahun + (bulan ? "-" + bulan : ""))).length;
    const pnd = APP_STATE.mutasi_pindah.filter(m => String(m.tanggal_pindah).startsWith(tahun + (bulan ? "-" + bulan : ""))).length;
    const mng = APP_STATE.mutasi_meninggal.filter(m => String(m.tanggal_meninggal).startsWith(tahun + (bulan ? "-" + bulan : ""))).length;
    const lhr = aktif.filter(p => String(p.tanggal_lahir).startsWith(tahun + (bulan ? "-" + bulan : ""))).length;
    bodyTable = `<table border="1" cellspacing="0" cellpadding="8" width="100%" style="border-collapse:collapse;font-size:10pt;">
      <thead><tr><th>Indikator Kependudukan</th><th>Laki-laki</th><th>Perempuan</th><th>Total</th></tr></thead>
      <tbody>
        <tr><td>Penduduk Aktif Saat Ini</td><td>${aktif.filter(p=>p.jenis_kelamin==="Laki-laki").length}</td><td>${aktif.filter(p=>p.jenis_kelamin==="Perempuan").length}</td><td><strong>${aktif.length}</strong></td></tr>
        <tr><td>Kelahiran Periode Ini</td><td>-</td><td>-</td><td>${lhr}</td></tr>
        <tr><td>Penduduk Datang Periode Ini</td><td>-</td><td>-</td><td>${dtg}</td></tr>
        <tr><td>Penduduk Pindah Periode Ini</td><td>-</td><td>-</td><td>${pnd}</td></tr>
        <tr><td>Penduduk Meninggal Periode Ini</td><td>-</td><td>-</td><td>${mng}</td></tr>
      </tbody></table>`;
  }

  document.getElementById("laporanPaper").innerHTML = `
    <div id="laporanPrintable">
      <div class="kop-surat">
        ${cfg.logo_desa ? `<img src="${cfg.logo_desa}" alt="Logo" />` : ""}
        <div class="kop-text">
          <h3>PEMERINTAH ${cfg.kabupaten || "KABUPATEN"}</h3>
          <h3>KECAMATAN ${cfg.kecamatan || ""}</h3>
          <h2>${cfg.nama_desa || "PEMERINTAH DESA"}</h2>
          <p>${cfg.alamat_kantor || ""} — Kode Pos ${cfg.kode_pos || ""}</p>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:16px;">
        <h3 style="text-decoration:underline;">${titles[jenis]}</h3>
        <p>Periode: ${bulan ? "Bulan " + bulan + " " : ""}Tahun ${tahun}</p>
      </div>
      ${bodyTable}
      <div style="display:flex;justify-content:flex-end;margin-top:28px;">
        <div style="text-align:center;width:260px;">
          <p>${cfg.nama_desa_singkat || "Desa"}, ${formatDateID(new Date().toISOString())}</p>
          <p>${cfg.jabatan_penandatangan || "Kepala Desa"}</p>
          <br><br><br>
          <p><u><strong>${cfg.nama_kepala_desa || ""}</strong></u></p>
        </div>
      </div>
    </div>
  `;
}

function printLaporan(subJenis) {
  const map = { datang: "12", pindah: "13", meninggal: "14" };
  navigateTo("laporan", document.querySelector('[data-page="laporan"]'));
  document.getElementById("jenisLaporanSelect").value = map[subJenis];
  generateLaporanPreview();
  setTimeout(printLaporanResmi, 200);
}

function printLaporanResmi() {
  const html = document.getElementById("laporanPrintable")?.innerHTML;
  if (html) triggerPrint(`<div style="font-family:Arial,sans-serif;padding:10mm;">${html}</div>`, "portrait");
}

function exportLaporanExcel() {
  const table = document.querySelector("#laporanPrintable table:last-of-type");
  if (!table) return;
  const wb = XLSX.utils.table_to_book(table, { sheet: "Laporan" });
  XLSX.writeFile(wb, `Laporan_Kependudukan_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ============================================================================
// 8. PENGATURAN, REFERENSI, PENGGUNA & LOG
// ============================================================================
function renderPengaturanForm() {
  const form = document.getElementById("formPengaturan");
  if (!form) return;
  Object.keys(APP_STATE.pengaturan).forEach(k => {
    if (form.elements[k]) form.elements[k].value = APP_STATE.pengaturan[k];
  });
  renderReferensiTags();
}

async function handleSavePengaturanSubmit(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const res = await apiRequest("savePengaturan", payload, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    await syncAllData(false);
  } else showToast(res.message, "error");
}

function renderReferensiTags() {
  const box = document.getElementById("referensiListBox");
  if (!box) return;
  const targetCats = ["DUSUN", "RW", "RT"];
  box.innerHTML = APP_STATE.referensi
    .filter(r => targetCats.includes(r.kategori))
    .map(r => `<span class="ref-tag"><strong>${r.kategori}:</strong> ${r.nilai} <button onclick="deleteReferensiItem('${r.kategori}','${r.nilai}')">&times;</button></span>`)
    .join("");
}

async function addReferensiItem() {
  const kategori = document.getElementById("refKategoriSelect").value;
  const nilai = document.getElementById("refNilaiInput").value.trim();
  if (!nilai) return;
  const res = await apiRequest("saveReferensi", { kategori, nilai }, true);
  if (res.status === "success") {
    document.getElementById("refNilaiInput").value = "";
    showToast(res.message, "success");
    await syncAllData(false);
  } else showToast(res.message, "error");
}

async function deleteReferensiItem(kategori, nilai) {
  const res = await apiRequest("deleteReferensi", { kategori, nilai }, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    await syncAllData(false);
  } else showToast(res.message, "error");
}

async function triggerBackupDatabase() {
  const res = await apiRequest("backupDatabase", {}, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    document.getElementById("backupResultBox").innerHTML =
      `Backup berhasil: <a href="${res.backup_url}" target="_blank" style="color:#2563eb;font-weight:600;">${res.backup_name}</a>`;
  } else showToast(res.message, "error");
}

function renderUsersTable() {
  const tbody = document.getElementById("tbodyUsers");
  if (!tbody) return;
  tbody.innerHTML = APP_STATE.pengguna.map(u => `
    <tr>
      <td>${u.id_user}</td>
      <td><strong>${u.username}</strong></td>
      <td>${u.nama_lengkap}</td>
      <td>${u.role}</td>
      <td><span class="badge ${u.status_aktif === "AKTIF" ? "badge-aktif" : "badge-meninggal"}">${u.status_aktif}</span></td>
      <td>${u.last_login || "-"}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openUserModal('${u.id_user}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id_user}', '${u.username}')">Hapus</button>
      </td>
    </tr>
  `).join("");
}

function openUserModal(idUser = null) {
  const u = idUser ? APP_STATE.pengguna.find(x => x.id_user === idUser) : {};
  const html = `
    <form onsubmit="submitUserForm(event, '${idUser || ""}')">
      <div class="form-group"><label>Username *</label><input type="text" name="username" value="${u.username || ""}" ${idUser ? "readonly" : "required"} /></div>
      <div class="form-group"><label>Nama Lengkap *</label><input type="text" name="nama_lengkap" value="${u.nama_lengkap || ""}" required /></div>
      <div class="form-group"><label>Password ${idUser ? "(Kosongkan jika tidak diubah)" : "*"}</label><input type="password" name="password" ${idUser ? "" : "required"} /></div>
      <div class="form-group"><label>Role Hak Akses</label>
        <select name="role">
          <option value="Administrator" ${u.role === "Administrator" ? "selected" : ""}>Administrator (Akses Penuh)</option>
          <option value="Operator" ${u.role === "Operator" ? "selected" : ""}>Operator (Input Penduduk & Mutasi)</option>
          <option value="Viewer" ${u.role === "Viewer" ? "selected" : ""}>Viewer (Hanya Lihat Dashboard & Laporan)</option>
        </select>
      </div>
      <div class="form-group"><label>Status Akun</label>
        <select name="status_aktif">
          <option value="AKTIF" ${u.status_aktif !== "NONAKTIF" ? "selected" : ""}>AKTIF</option>
          <option value="NONAKTIF" ${u.status_aktif === "NONAKTIF" ? "selected" : ""}>NONAKTIF</option>
        </select>
      </div>
      <div style="text-align:right;margin-top:14px;"><button type="submit" class="btn btn-primary">Simpan Pengguna</button></div>
    </form>
  `;
  openModal(idUser ? "Edit Pengguna" : "Tambah Pengguna Baru", html);
}

async function submitUserForm(e, idUser) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  if (idUser) payload.id_user = idUser;
  const res = await apiRequest("saveUser", payload, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    closeModal();
    await syncAllData(false);
  } else showToast(res.message, "error");
}

async function deleteUser(idUser, username) {
  if (!confirm(`Hapus akun pengguna "${username}"?`)) return;
  const res = await apiRequest("deleteUser", { id_user: idUser }, true);
  if (res.status === "success") {
    showToast(res.message, "success");
    await syncAllData(false);
  } else showToast(res.message, "error");
}

function renderLogsTable() {
  const tbody = document.getElementById("tbodyLogs");
  if (!tbody) return;
  tbody.innerHTML = APP_STATE.log_aktivitas.map(l => `
    <tr>
      <td>${l.waktu}</td>
      <td><strong>${l.username}</strong></td>
      <td>${l.role}</td>
      <td>${l.aksi}</td>
      <td>${l.modul}</td>
      <td>${l.detail}</td>
    </tr>
  `).join("");
}

// ============================================================================
// MODAL & PRINT ENGINE (A4 LANDSCAPE / PORTRAIT)
// ============================================================================
function openModal(title, bodyHTML, wide = false) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHTML;
  document.getElementById("modalContainer").classList.toggle("wide", wide);
  document.getElementById("modalBackdrop").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.add("hidden");
}

function closeModalOnBackdrop(e) {
  if (e.target.id === "modalBackdrop") closeModal();
}

function triggerPrint(htmlContent, orientation = "portrait") {
  let pageStyle = document.getElementById("dynamicPrintPageStyle");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "dynamicPrintPageStyle";
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@media print { @page { size: A4 ${orientation}; margin: 8mm; } }`;

  const area = document.getElementById("printArea");
  area.innerHTML = htmlContent;
  window.print();
}