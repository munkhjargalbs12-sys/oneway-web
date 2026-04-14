const state = {
  apiBase: localStorage.getItem("oneway_admin_api_base") || "/api",
  token: localStorage.getItem("oneway_admin_token") || "",
  admin: null,
  currentView: "overview",
  overview: null,
  users: { items: [], pagination: { page: 1, total_pages: 0 } },
  rides: { items: [], pagination: { page: 1, total_pages: 0 } },
  bookings: { items: [], pagination: { page: 1, total_pages: 0 } },
};

const elements = {};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("mn-MN");
}

function buildBadge(label, tone = "info") {
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`;
}

function translateRole(role) {
  const labels = {
    driver: "Жолооч",
    passenger: "Зорчигч",
    super_admin: "Admin",
  };
  return labels[String(role || "").toLowerCase()] || String(role || "-");
}

function translateStatus(status) {
  const labels = {
    none: "Байхгүй",
    pending: "Хүлээгдэж буй",
    approved: "Зөвшөөрсөн",
    rejected: "Татгалзсан",
    active: "Идэвхтэй",
    scheduled: "Товлосон",
    started: "Эхэлсэн",
    full: "Дүүрсэн",
    completed: "Дууссан",
    cancelled: "Цуцлагдсан",
    blocked: "Хаалттай",
    unknown: "Тодорхойгүй",
    arrived: "Ирсэн",
    no_show: "Ирээгүй",
  };
  return labels[String(status || "").toLowerCase()] || String(status || "-");
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "active", "arrived", "completed"].includes(normalized)) return "success";
  if (["pending", "scheduled", "full", "unknown"].includes(normalized)) return "warning";
  if (["rejected", "cancelled", "blocked", "no_show"].includes(normalized)) return "danger";
  return "info";
}

function setMessage(target, message, isError = false) {
  target.textContent = message || "";
  target.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function serializeForm(form) {
  const data = new FormData(form);
  const params = new URLSearchParams();

  for (const [key, value] of data.entries()) {
    if (String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  }

  return params;
}

async function api(path, options = {}) {
  const base = state.apiBase.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && path !== "/admin/auth/login") {
    clearSession();
    throw new Error("Сешн дууссан. Дахин нэвтэр.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Хүсэлт амжилтгүй");
  }

  return data;
}

function updateApiBaseUi() {
  elements.apiBaseInput.value = state.apiBase;
  elements.apiBaseBadge.textContent = `API: ${state.apiBase}`;
}

function clearSession() {
  state.token = "";
  state.admin = null;
  localStorage.removeItem("oneway_admin_token");
  renderAuthState();
}

function renderAuthState() {
  const signedIn = Boolean(state.token && state.admin);
  elements.authView.classList.toggle("hidden", signedIn);
  elements.dashboardView.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    elements.adminIdentity.textContent = `${state.admin.full_name} (${translateRole(state.admin.role)})`;
  } else {
    elements.adminIdentity.textContent = "Нэвтрээгүй";
  }

  updateApiBaseUi();
}

function renderNav() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    const active = button.dataset.view === state.currentView;
    button.classList.toggle("active", active);
  });

  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `${state.currentView}Section`);
  });
}

function renderList(items, renderItem, emptyMessage) {
  if (!items || items.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  return items.map(renderItem).join("");
}

function renderOverview() {
  if (!state.overview) {
    elements.overviewCards.innerHTML = "";
    elements.recentUsers.innerHTML = '<div class="empty-state">Товч мэдээлэл хараахан ачаалаагүй.</div>';
    elements.recentRides.innerHTML = '<div class="empty-state">Ride мэдээлэл хараахан алга.</div>';
    elements.recentBookings.innerHTML = '<div class="empty-state">Booking мэдээлэл хараахан алга.</div>';
    return;
  }

  const summary = state.overview.summary;
  const metrics = [
    ["Нийт users", summary.total_users],
    ["Жолооч", summary.total_drivers],
    ["Зорчигч", summary.total_passengers],
    ["Идэвхтэй rides", summary.active_rides],
    ["Pending bookings", summary.pending_bookings],
    ["Locked balance", summary.total_locked_balance],
    ["Өнөөдрийн users", summary.today_users],
    ["Өнөөдрийн rides", summary.today_rides],
    ["Өнөөдрийн bookings", summary.today_bookings],
  ];

  elements.overviewCards.innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(label)}</div>
          <div class="metric-value">${escapeHtml(value)}</div>
        </article>
      `
    )
    .join("");

  elements.recentUsers.innerHTML = renderList(
    state.overview.recent.users,
    (user) => `
      <div class="list-row">
        <div class="list-row-title">${escapeHtml(user.name)} <span class="muted">#${user.id}</span></div>
        <div class="list-row-meta">${escapeHtml(user.phone)} | ${escapeHtml(translateRole(user.role))} | ${escapeHtml(translateStatus(user.verification_status || "none"))}</div>
        <div class="list-row-meta">${escapeHtml(formatDate(user.created_at))}</div>
      </div>
    `,
    "Сүүлийн хэрэглэгч алга"
  );

  elements.recentRides.innerHTML = renderList(
    state.overview.recent.rides,
    (ride) => `
      <div class="list-row">
        <div class="list-row-title">#${ride.id} | ${escapeHtml(ride.end_location || "Чиглэлгүй")}</div>
        <div class="list-row-meta">${escapeHtml(ride.driver_name || "Жолоочгүй")} | ${escapeHtml(translateStatus(ride.status))}</div>
        <div class="list-row-meta">${escapeHtml(ride.ride_date || "-")} ${escapeHtml(ride.start_time || "")}</div>
      </div>
    `,
    "Сүүлийн ride алга"
  );

  elements.recentBookings.innerHTML = renderList(
    state.overview.recent.bookings,
    (booking) => `
      <div class="list-row">
        <div class="list-row-title">Booking #${booking.id} | Ride #${escapeHtml(booking.ride_id || "-")}</div>
        <div class="list-row-meta">${escapeHtml(booking.passenger_name || "Зорчигчгүй")} -> ${escapeHtml(booking.driver_name || "Жолоочгүй")}</div>
        <div class="list-row-meta">${escapeHtml(translateStatus(booking.status))} | ${escapeHtml(translateStatus(booking.attendance_status || "unknown"))} | ${escapeHtml(booking.end_location || "-")}</div>
      </div>
    `,
    "Сүүлийн booking алга"
  );
}

function renderUsers() {
  const rows = state.users.items || [];
  elements.usersTableBody.innerHTML = rows.length
    ? rows
        .map(
          (user) => `
            <tr>
              <td>
                <div class="stack">
                  <strong>${escapeHtml(user.name)}</strong>
                  <span class="muted">#${user.id} | ${escapeHtml(user.phone)}</span>
                  <span class="muted">${escapeHtml(user.email || "-")}</span>
                </div>
              </td>
              <td>${buildBadge(translateRole(user.role), "info")}</td>
              <td>
                <div class="badge-row">
                  ${buildBadge(translateStatus(user.verification_status || "none"), statusTone(user.verification_status))}
                  ${user.email_verified ? buildBadge("email", "success") : ""}
                  ${user.phone_verified ? buildBadge("phone", "success") : ""}
                  ${user.vehicle_verified ? buildBadge("машин", "success") : ""}
                </div>
              </td>
              <td>
                <div class="stack">
                  <span>Үлдэгдэл: ${escapeHtml(user.balance)}</span>
                  <span class="muted">Locked: ${escapeHtml(user.locked_balance)}</span>
                </div>
              </td>
              <td>
                <div class="badge-row">
                  ${user.driver_verified ? buildBadge("жолооч", "success") : ""}
                  ${user.one_way_verified ? buildBadge("oneway", "success") : ""}
                  ${user.is_blocked ? buildBadge("хаалттай", "danger") : buildBadge("идэвхтэй", "success")}
                </div>
              </td>
              <td>${escapeHtml(formatDate(user.last_login_at))}</td>
              <td>${escapeHtml(formatDate(user.created_at))}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="7"><div class="empty-state">Хэрэглэгч олдсонгүй.</div></td></tr>';

  renderPagination("users", state.users.pagination);
}

function renderRides() {
  const rows = state.rides.items || [];
  elements.ridesTableBody.innerHTML = rows.length
    ? rows
        .map(
          (ride) => `
            <tr>
              <td>
                <div class="stack">
                  <strong>#${ride.id} | ${escapeHtml(ride.end_location || "Чиглэлгүй")}</strong>
                  <span class="muted">${escapeHtml(ride.start_location || "-")}</span>
                  <span class="muted">${escapeHtml(ride.ride_date || "-")} ${escapeHtml(ride.start_time || "")}</span>
                </div>
              </td>
              <td>${escapeHtml(ride.driver_name || "Жолоочгүй")}</td>
              <td>${buildBadge(translateStatus(ride.status || "unknown"), statusTone(ride.status))}</td>
              <td>${escapeHtml(`${ride.seats_taken}/${ride.seats_total} суудал`)}</td>
              <td>${escapeHtml(ride.price)}</td>
              <td>
                <div class="stack">
                  <span>${escapeHtml(ride.vehicle || "-")}</span>
                  <span class="muted">${escapeHtml(ride.plate_number || "-")}</span>
                </div>
              </td>
              <td>${escapeHtml(formatDate(ride.created_at))}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="7"><div class="empty-state">Ride олдсонгүй.</div></td></tr>';

  renderPagination("rides", state.rides.pagination);
}

function renderBookings() {
  const rows = state.bookings.items || [];
  elements.bookingsTableBody.innerHTML = rows.length
    ? rows
        .map(
          (booking) => `
            <tr>
              <td>
                <div class="stack">
                  <strong>#${booking.id}</strong>
                  <span class="muted">Ride #${escapeHtml(booking.ride_id || "-")} | Суудал ${escapeHtml(booking.seats_booked)}</span>
                </div>
              </td>
              <td>
                <div class="stack">
                  <span>${escapeHtml(booking.passenger_name || "Зорчигчгүй")}</span>
                  <span class="muted">${escapeHtml(booking.passenger_phone || "-")}</span>
                </div>
              </td>
              <td>${escapeHtml(booking.driver_name || "Жолоочгүй")}</td>
              <td>
                <div class="stack">
                  <span>${escapeHtml(booking.end_location || "-")}</span>
                  <span class="muted">${escapeHtml(booking.ride_date || "-")} ${escapeHtml(booking.start_time || "")}</span>
                </div>
              </td>
              <td>${buildBadge(translateStatus(booking.status || "unknown"), statusTone(booking.status))}</td>
              <td>${buildBadge(translateStatus(booking.attendance_status || "unknown"), statusTone(booking.attendance_status))}</td>
              <td>${escapeHtml(formatDate(booking.created_at))}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="7"><div class="empty-state">Booking олдсонгүй.</div></td></tr>';

  renderPagination("bookings", state.bookings.pagination);
}

function renderPagination(prefix, pagination) {
  const page = Number(pagination?.page || 1);
  const totalPages = Number(pagination?.total_pages || 0);
  $(`${prefix}PaginationLabel`).textContent = totalPages
    ? `Хуудас ${page} / ${totalPages}`
    : "Хуудас 1";
  $(`${prefix}PrevButton`).disabled = page <= 1;
  $(`${prefix}NextButton`).disabled = totalPages === 0 || page >= totalPages;
}

async function login(event) {
  event.preventDefault();
  setMessage(elements.authMessage, "Нэвтэрч байна...");

  try {
    const payload = {
      email: elements.emailInput.value.trim(),
      password: elements.passwordInput.value,
    };

    const data = await api("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    state.token = data.token;
    state.admin = data.admin;
    localStorage.setItem("oneway_admin_token", state.token);
    renderAuthState();
    setMessage(elements.authMessage, "");
    await bootstrapDashboard();
  } catch (error) {
    setMessage(elements.authMessage, error.message, true);
  }
}

async function loadSession() {
  if (!state.token) {
    renderAuthState();
    return;
  }

  try {
    const data = await api("/admin/auth/me");
    state.admin = data.admin;
    renderAuthState();
    await bootstrapDashboard();
  } catch (error) {
    clearSession();
    setMessage(elements.authMessage, error.message, true);
  }
}

async function bootstrapDashboard() {
  renderNav();
  await Promise.all([loadOverview(), loadUsers(1), loadRides(1), loadBookings(1)]);
}

async function loadOverview() {
  setMessage(elements.globalMessage, "Товч мэдээлэл ачаалж байна...");
  try {
    state.overview = await api("/admin/overview");
    renderOverview();
    setMessage(elements.globalMessage, "");
  } catch (error) {
    setMessage(elements.globalMessage, error.message, true);
  }
}

async function loadUsers(page = 1) {
  const params = serializeForm(elements.usersFilters);
  params.set("page", page);
  params.set("page_size", 20);
  setMessage(elements.globalMessage, "Хэрэглэгч ачаалж байна...");

  try {
    state.users = await api(`/admin/users?${params.toString()}`);
    renderUsers();
    setMessage(elements.globalMessage, "");
  } catch (error) {
    setMessage(elements.globalMessage, error.message, true);
  }
}

async function loadRides(page = 1) {
  const params = serializeForm(elements.ridesFilters);
  params.set("page", page);
  params.set("page_size", 20);
  setMessage(elements.globalMessage, "Ride ачаалж байна...");

  try {
    state.rides = await api(`/admin/rides?${params.toString()}`);
    renderRides();
    setMessage(elements.globalMessage, "");
  } catch (error) {
    setMessage(elements.globalMessage, error.message, true);
  }
}

async function loadBookings(page = 1) {
  const params = serializeForm(elements.bookingsFilters);
  params.set("page", page);
  params.set("page_size", 20);
  setMessage(elements.globalMessage, "Booking ачаалж байна...");

  try {
    state.bookings = await api(`/admin/bookings?${params.toString()}`);
    renderBookings();
    setMessage(elements.globalMessage, "");
  } catch (error) {
    setMessage(elements.globalMessage, error.message, true);
  }
}

function changeView(view) {
  state.currentView = view;
  renderNav();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", login);
  elements.saveApiBaseButton.addEventListener("click", () => {
    state.apiBase = elements.apiBaseInput.value.trim() || "/api";
    localStorage.setItem("oneway_admin_api_base", state.apiBase);
    updateApiBaseUi();
    setMessage(elements.authMessage, "API base хадгаллаа.");
  });

  elements.logoutButton.addEventListener("click", () => {
    clearSession();
    setMessage(elements.authMessage, "Системээс гарлаа.");
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => changeView(button.dataset.view));
  });

  elements.refreshOverviewButton.addEventListener("click", () => loadOverview());
  elements.refreshUsersButton.addEventListener("click", () => loadUsers(state.users.pagination.page || 1));
  elements.refreshRidesButton.addEventListener("click", () => loadRides(state.rides.pagination.page || 1));
  elements.refreshBookingsButton.addEventListener("click", () => loadBookings(state.bookings.pagination.page || 1));

  elements.usersFilters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadUsers(1);
  });

  elements.ridesFilters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadRides(1);
  });

  elements.bookingsFilters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadBookings(1);
  });

  elements.usersPrevButton.addEventListener("click", () => {
    if ((state.users.pagination.page || 1) > 1) {
      loadUsers(state.users.pagination.page - 1);
    }
  });

  elements.usersNextButton.addEventListener("click", () => {
    if ((state.users.pagination.page || 1) < (state.users.pagination.total_pages || 0)) {
      loadUsers(state.users.pagination.page + 1);
    }
  });

  elements.ridesPrevButton.addEventListener("click", () => {
    if ((state.rides.pagination.page || 1) > 1) {
      loadRides(state.rides.pagination.page - 1);
    }
  });

  elements.ridesNextButton.addEventListener("click", () => {
    if ((state.rides.pagination.page || 1) < (state.rides.pagination.total_pages || 0)) {
      loadRides(state.rides.pagination.page + 1);
    }
  });

  elements.bookingsPrevButton.addEventListener("click", () => {
    if ((state.bookings.pagination.page || 1) > 1) {
      loadBookings(state.bookings.pagination.page - 1);
    }
  });

  elements.bookingsNextButton.addEventListener("click", () => {
    if ((state.bookings.pagination.page || 1) < (state.bookings.pagination.total_pages || 0)) {
      loadBookings(state.bookings.pagination.page + 1);
    }
  });
}

function initElements() {
  [
    "authView",
    "dashboardView",
    "loginForm",
    "emailInput",
    "passwordInput",
    "loginButton",
    "apiBaseInput",
    "saveApiBaseButton",
    "authMessage",
    "adminIdentity",
    "apiBaseBadge",
    "logoutButton",
    "globalMessage",
    "overviewCards",
    "recentUsers",
    "recentRides",
    "recentBookings",
    "refreshOverviewButton",
    "usersFilters",
    "usersTableBody",
    "refreshUsersButton",
    "usersPrevButton",
    "usersNextButton",
    "usersPaginationLabel",
    "ridesFilters",
    "ridesTableBody",
    "refreshRidesButton",
    "ridesPrevButton",
    "ridesNextButton",
    "ridesPaginationLabel",
    "bookingsFilters",
    "bookingsTableBody",
    "refreshBookingsButton",
    "bookingsPrevButton",
    "bookingsNextButton",
    "bookingsPaginationLabel",
  ].forEach((id) => {
    elements[id] = $(id);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initElements();
  updateApiBaseUi();
  bindEvents();
  renderAuthState();
  renderNav();
  renderOverview();
  renderUsers();
  renderRides();
  renderBookings();
  await loadSession();
});
