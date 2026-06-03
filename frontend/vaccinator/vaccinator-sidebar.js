/**
 * vaccinator-sidebar.js
 * Injects the shared VacciLink vaccinator sidebar into every page.
 * Usage: add <script src="vaccinator-sidebar.js"></script> before </body>
 */

const API_BASE_URL = "https://vaccilink-final.onrender.com";

(function () {
  /* ── 1. Read logged-in vaccinator from localStorage ── */
  const vaccName    = localStorage.getItem("vaccinatorName")    || "Vaccinator";
  const centerId    = localStorage.getItem("vaccinatorCenterId") || "";

  /* Redirect to login if not authenticated */
  if (!centerId && !window.location.pathname.includes("login")) {
    const noAuthPages = ["login.html", "signup.html", "register.html"];
    const currentPage = window.location.pathname.split("/").pop();
    if (!noAuthPages.includes(currentPage)) {
      window.location.href = "login.html";
      return;
    }
  }

  /* ── 2. Detect active page ── */
  const currentFile = window.location.pathname.split("/").pop();
  const pageMap = {
    "dashboard.html"  : "dashboard",
    "sessions.html"   : "sessions",
    "schedule.html"   : "schedule",
    "fup.html"        : "fup",
    "appointment.html": "appointment",
    "scanner.html"    : "scanner",
    "analytics.html"  : "analytics",
    "profile.html"    : "profile",
    "all_records.html": "all_records"
  };
  const activePage = pageMap[currentFile] || "";

  function navLink(href, page, label) {
    const isActive = activePage === page ? ' active' : '';
    return `<a href="${href}" class="nav-link${isActive}">${label}</a>`;
  }

  /* ── 4. Build sidebar HTML ── */
  const sidebarHTML = `
<aside class="sidebar" id="vaccinatorSidebar">
  <div class="sidebar-logo">
    <svg viewBox="0 0 24 24" width="28" height="28" stroke="white" stroke-width="2.5" fill="none">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <span>VacciLink</span>
  </div>

  <div class="vaccinator-profile">
    <div class="profile-img" id="sidebarAvatar">
      <i class="fa-solid fa-user-nurse" style="color: #2E7D32; font-size: 1.3rem;"></i>
    </div>
    <div class="profile-info">
      <h4 id="sidebarName">${vaccName}</h4>
      <p id="sidebarRole">Vaccinator</p>
    </div>
  </div>

  <nav class="nav-menu">
    ${navLink("dashboard.html",   "dashboard",   "Dashboard")}
    ${navLink("sessions.html",    "sessions",    "Vaccinator Session")}
    ${navLink("schedule.html",    "schedule",    "Vaccination Schedule")}
    ${navLink("fup.html",         "fup",         "Lost to Follow-Up")}
    ${navLink("appointment.html", "appointment", "Appointment")}
    ${navLink("scanner.html",     "scanner",     "Digital Scanner")}
    ${navLink("analytics.html",   "analytics",   "Analytics")}
    ${navLink("profile.html",     "profile",     "Profile")}
  </nav>
</aside>`;

  /* ── 5. Inject into DOM ── */
  document.body.insertAdjacentHTML("afterbegin", sidebarHTML);

  /* ── Inject FontAwesome if missing ── */
  if (!document.getElementById("font-awesome-cdn")) {
    const faLink = document.createElement("link");
    faLink.id = "font-awesome-cdn";
    faLink.rel = "stylesheet";
    faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
    document.head.appendChild(faLink);
  }

  // Auto-hydrate on load
  window.addEventListener('DOMContentLoaded', () => {
    hydrateSidebarAndHeader();
  });
})();

/**
 * Global function to hydrate Sidebar and Header elements
 */
async function hydrateSidebarAndHeader() {
  const vaccName   = localStorage.getItem("vaccinatorName")   || "Vaccinator";
  const vaccRole   = "Vaccinator";
  const centerId   = localStorage.getItem("vaccinatorCenterId") || "N/A";
  const centerName = localStorage.getItem("vaccCenterName")   || "Clinic Name";
  const city       = localStorage.getItem("vaccinatorCity")     || "City Name";
  const vaccEmail  = localStorage.getItem("vaccinatorEmail");

  // Update Sidebar
  const sidebarName = document.getElementById("sidebarName");
  if (sidebarName) sidebarName.innerText = vaccName;

  const sidebarRole = document.getElementById("sidebarRole");
  if (sidebarRole) sidebarRole.innerText = vaccRole;

  // Update Header Elements (Common in many pages)
  const welcomeTitle = document.getElementById("welcomeTitle");
  if (welcomeTitle) welcomeTitle.innerText = `Welcome, ${vaccName}`;

  const vaccInfo = document.getElementById("vaccinatorInfo");
  if (vaccInfo) vaccInfo.innerText = `${vaccRole} • ${centerName}`;

  const centerInfo = document.getElementById("centerInfo");
  if (centerInfo) centerInfo.innerText = `Center ID: ${centerId} • ${city}`;

  const centerInfoSub = document.getElementById("centerInfoSub");
  if (centerInfoSub) centerInfoSub.innerText = `Center: ${centerName}`;

  const heroCenterName = document.getElementById("heroCenterName");
  if (heroCenterName) heroCenterName.innerText = `Center: ${centerName}`;

  const analyticsSub = document.getElementById("analyticsSubheader");
  if (analyticsSub) analyticsSub.innerText = `Live insights · Center: ${centerName}`;

  // Fetch latest profile from server to ensure fresh data
  if (vaccEmail) {
    try {
      const response = await fetch(`${API_BASE_URL}/vaccinator/profile/${encodeURIComponent(vaccEmail)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.fullName) {
            if (sidebarName) sidebarName.innerText = data.fullName;
            if (welcomeTitle) welcomeTitle.innerText = `Welcome, ${data.fullName}`;
            localStorage.setItem("vaccinatorName", data.fullName);
        }
        if (data.centerName) {
            if (vaccInfo) vaccInfo.innerText = `${vaccRole} • ${data.centerName}`;
            if (centerInfoSub) centerInfoSub.innerText = `Center: ${data.centerName}`;
            if (heroCenterName) heroCenterName.innerText = `Center: ${data.centerName}`;
            if (analyticsSub) analyticsSub.innerText = `Live insights · Center: ${data.centerName}`;
            localStorage.setItem("vaccCenterName", data.centerName);
        }
        if (data.city) {
            localStorage.setItem("vaccinatorCity", data.city);
            if (centerInfo) centerInfo.innerText = `Center ID: ${centerId} • ${data.city}`;
        }
      }
    } catch (err) {
      console.warn("Profile hydration failed:", err);
    }
  }
}

// Ensure it's available globally immediately
window.hydrateSidebarAndHeader = hydrateSidebarAndHeader;
