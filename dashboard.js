const apiBase = window.location.protocol === "file:" ? "http://localhost:3000" : "";

const api = {
  me: `${apiBase}/api/auth/me`,
  logout: `${apiBase}/api/auth/logout`,
  data: `${apiBase}/api/data`,
  export: `${apiBase}/api/export`,
  reviews: `${apiBase}/api/reviews`,
  reviewSubmit: `${apiBase}/api/reviews`
};

const appRoutes = {
  home: window.location.protocol === "file:" ? "./index.html" : "/"
};

const demoKeys = {
  user: "hippovault-demo-user",
  enabled: "hippovault-demo-enabled",
  data: "hippovault-demo-data"
};

const authStorageKeys = {
  token: "token",
  user: "user"
};

const localAuthKeys = {
  session: "hippovault-local-session",
  dataPrefix: "hippovault-local-data-"
};

const defaultListSeed = [
  { id: "default-grocery", name: "Grocery List", locked: true, items: [] },
  { id: "default-electric", name: "Electric List", locked: true, items: [] },
  { id: "default-vegetable", name: "Vegetable List", locked: true, items: [] }
];

const state = {
  user: null,
  accounts: [],
  diaryEntries: [],
  userLists: [],
  defaultLists: defaultListSeed.map((item) => ({ ...item })),
  reviews: [],
  mode: "api",
  filters: {
    accounts: "",
    diary: "",
    reviews: ""
  },
  lastSyncedAt: null
};

document.body.classList.add("auth-checking");

const dashboardShell = document.querySelector(".dashboard-shell");
const userPill = document.getElementById("userPill");
const authGuard = document.getElementById("authGuard");
const editorModal = document.getElementById("editorModal");
const editorBody = document.getElementById("editorBody");
const editorTitle = document.getElementById("editorTitle");
const syncStatus = document.getElementById("syncStatus");
const syncDetail = document.getElementById("syncDetail");
const securityScore = document.getElementById("securityScore");
const securityDetail = document.getElementById("securityDetail");
const exportBtn = document.getElementById("exportBtn");
const accountSearch = document.getElementById("accountSearch");
const diarySearch = document.getElementById("diarySearch");
const reviewSearch = document.getElementById("reviewSearch");

const setFormStatus = (id, message, type = "") => {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.className = "form-status";
  if (type) node.classList.add(type);
};

const makeId = () => {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const matchesFilter = (fields, query) => {
  const needle = normalizeText(query);
  if (!needle) return true;
  return fields.some((field) => normalizeText(field).includes(needle));
};

const setSyncState = (title, detail) => {
  syncStatus.textContent = title;
  syncDetail.textContent = detail;
};

const updateSecuritySummary = () => {
  const modeLabel = state.mode === "demo"
    ? "Demo Sandbox"
    : state.mode === "local"
      ? "Local Test Mode"
      : "Protected";
  const securityParts = [
    state.mode === "demo"
      ? "Local demo data only"
      : state.mode === "local"
        ? "Browser-only test storage"
        : "Encrypted server storage",
    window.location.protocol === "https:" ? "HTTPS transport" : "non-HTTPS environment",
    `${state.accounts.length} accounts`,
    `${state.diaryEntries.length} diary entries`
  ];
  securityScore.textContent = modeLabel;
  securityDetail.textContent = securityParts.join(" | ");
};

const downloadJsonFile = (fileName, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const apiRequest = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(url, {
      credentials: "include",
      ...options,
      headers
    });
  } catch (_error) {
    throw new Error("Cannot reach the server.");
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status}).`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Server returned invalid JSON.");
  }
  return payload;
};

const getDemoUser = () => {
  try {
    return JSON.parse(localStorage.getItem(demoKeys.user) || "null");
  } catch (_error) {
    return null;
  }
};

const getStoredToken = () => localStorage.getItem(authStorageKeys.token) || "";

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(authStorageKeys.user) || "null");
  } catch (_error) {
    return null;
  }
};

const persistAuth = (receivedToken, userData) => {
  if (receivedToken) {
    localStorage.setItem(authStorageKeys.token, receivedToken);
  }
  if (userData) {
    localStorage.setItem(authStorageKeys.user, JSON.stringify(userData));
  }
};

const clearStoredAuth = () => {
  localStorage.removeItem(authStorageKeys.token);
  localStorage.removeItem(authStorageKeys.user);
};

const getLocalSessionUser = () => {
  try {
    return JSON.parse(localStorage.getItem(localAuthKeys.session) || "null");
  } catch (_error) {
    return null;
  }
};

const getLocalDataKey = (userId) => `${localAuthKeys.dataPrefix}${userId}`;

const getDemoPayload = () => {
  try {
    return JSON.parse(localStorage.getItem(demoKeys.data) || "null");
  } catch (_error) {
    return null;
  }
};

const getLocalPayload = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(getLocalDataKey(userId)) || "null");
  } catch (_error) {
    return null;
  }
};

const saveDemoPayload = () => {
  localStorage.setItem(demoKeys.data, JSON.stringify({
    accounts: state.accounts,
    diaryEntries: state.diaryEntries,
    userLists: state.userLists,
    defaultLists: state.defaultLists,
    reviews: state.reviews
  }));
};

const saveLocalPayload = () => {
  if (!state.user?.id) return;
  localStorage.setItem(getLocalDataKey(state.user.id), JSON.stringify({
    accounts: state.accounts,
    diaryEntries: state.diaryEntries,
    userLists: state.userLists,
    defaultLists: state.defaultLists,
    reviews: state.reviews
  }));
};

const goHome = () => {
  window.location.href = appRoutes.home;
};

const setLoading = (isLoading) => {
  document.body.classList.toggle("auth-checking", isLoading);
  if (authGuard) authGuard.hidden = !isLoading;
};

const redirectHomeIfUnauthed = () => {
  clearStoredAuth();
};

const renderProtectedContent = () => {
  if (authGuard && !authGuard.hidden) return;
  if (!dashboardShell) return;
  dashboardShell.hidden = !state.user;
};

const normalizeListItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const itemName = String(item?.itemName || "").trim();
      if (!itemName) return null;
      return { id: item.id || makeId(), itemName };
    })
    .filter(Boolean);
};

const normalizeDefaultLists = (items) => {
  const incoming = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
  return defaultListSeed.map((seed) => {
    const existing = incoming.get(seed.id);
    return {
      ...seed,
      name: String(existing?.name || seed.name).trim(),
      items: normalizeListItems(existing?.items)
    };
  });
};

const applyPayloadToState = (payload) => {
  state.accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
  state.diaryEntries = Array.isArray(payload?.diaryEntries) ? payload.diaryEntries : [];
  state.userLists = Array.isArray(payload?.userLists)
    ? payload.userLists.map((list) => ({
      id: list.id || makeId(),
      name: String(list.name || "").trim(),
      items: normalizeListItems(list.items)
    }))
    : [];
  state.defaultLists = normalizeDefaultLists(payload?.defaultLists);
  state.reviews = Array.isArray(payload?.reviews)
    ? payload.reviews.map((item) => ({
      id: item.id || makeId(),
      name: String(item.name || "Anonymous"),
      email: String(item.email || ""),
      rating: Number(item.rating) || 0,
      review: String(item.review_text || item.review || ""),
      createdAt: item.createdAt || item.created_at || new Date().toISOString()
    }))
    : [];
};

const renderStats = () => {
  document.getElementById("statAccounts").textContent = String(state.accounts.length);
  document.getElementById("statDiary").textContent = String(state.diaryEntries.length);
  document.getElementById("statLists").textContent = String(state.userLists.length);
  document.getElementById("statReviews").textContent = String(state.reviews.length);
  document.getElementById("accountsCount").textContent = `${state.accounts.length} records`;
  document.getElementById("diaryCount").textContent = `${state.diaryEntries.length} entries`;
  document.getElementById("listsCount").textContent = `${state.userLists.length} custom lists`;
  document.getElementById("reviewsCount").textContent = `${state.reviews.length} reviews`;
  updateSecuritySummary();
};

const renderAccounts = () => {
  const container = document.getElementById("accountsList");
  const visibleAccounts = state.accounts.filter((account) => matchesFilter(
    [account.appName, account.appUrl, account.username, account.password],
    state.filters.accounts
  ));
  if (!visibleAccounts.length) {
    container.innerHTML = `<article class="empty-card">No account records yet.</article>`;
    return;
  }
  container.innerHTML = visibleAccounts.map((account) => `
    <article class="record-card">
      <div class="record-head">
        <div>
          <h4>${escapeHtml(account.appName)}</h4>
          <small>${escapeHtml(account.username)}</small>
        </div>
        <span class="record-badge">Credential</span>
      </div>
      <p class="record-line">${escapeHtml(account.appUrl)}</p>
      <p class="record-line mono">${escapeHtml(account.password)}</p>
      <div class="record-actions">
        <button class="btn btn-ghost action-btn" data-type="account" data-action="view" data-id="${account.id}" type="button">View</button>
        <button class="btn btn-ghost action-btn" data-type="account" data-action="edit" data-id="${account.id}" type="button">Edit</button>
        <button class="btn btn-danger action-btn" data-type="account" data-action="delete" data-id="${account.id}" type="button">Delete</button>
      </div>
    </article>
  `).join("");
};

const renderDiary = () => {
  const container = document.getElementById("diaryList");
  const visibleEntries = state.diaryEntries.filter((entry) => matchesFilter(
    [entry.title, entry.body, formatDate(entry.createdAt)],
    state.filters.diary
  ));
  if (!visibleEntries.length) {
    container.innerHTML = `<article class="empty-card">No diary entries yet.</article>`;
    return;
  }
  container.innerHTML = visibleEntries.map((entry) => `
    <article class="record-card">
      <div class="record-head">
        <div>
          <h4>${escapeHtml(entry.title)}</h4>
          <small>${escapeHtml(formatDate(entry.createdAt))}</small>
        </div>
        <span class="record-badge">Diary</span>
      </div>
      <p class="record-line">${escapeHtml(entry.body)}</p>
      <div class="record-actions">
        <button class="btn btn-ghost action-btn" data-type="diary" data-action="view" data-id="${entry.id}" type="button">View</button>
        <button class="btn btn-ghost action-btn" data-type="diary" data-action="edit" data-id="${entry.id}" type="button">Edit</button>
        <button class="btn btn-danger action-btn" data-type="diary" data-action="delete" data-id="${entry.id}" type="button">Delete</button>
      </div>
    </article>
  `).join("");
};

const renderListCards = (items, allowDelete) => {
  if (!items.length) return `<article class="empty-card">No lists available.</article>`;
  return items.map((list) => `
    <article class="record-card">
      <div class="record-head">
        <div>
          <h4>${escapeHtml(list.name)}</h4>
          <small>${Array.isArray(list.items) ? list.items.length : 0} items</small>
        </div>
        <span class="record-badge">${allowDelete ? "Custom" : "Default"}</span>
      </div>
      <div class="tag-list">
        ${(Array.isArray(list.items) && list.items.length)
          ? list.items.map((item) => `<span class="tag-chip">${escapeHtml(item.itemName)}</span>`).join("")
          : `<span class="tag-chip muted">No items yet</span>`}
      </div>
      <div class="record-actions">
        <button class="btn btn-ghost action-btn" data-type="list" data-action="view" data-id="${list.id}" type="button">View</button>
        <button class="btn btn-ghost action-btn" data-type="list" data-action="edit" data-id="${list.id}" type="button">Edit</button>
        ${allowDelete ? `<button class="btn btn-danger action-btn" data-type="list" data-action="delete" data-id="${list.id}" type="button">Delete</button>` : ""}
      </div>
    </article>
  `).join("");
};

const renderLists = () => {
  document.getElementById("defaultLists").innerHTML = renderListCards(state.defaultLists, false);
  document.getElementById("customLists").innerHTML = renderListCards(state.userLists, true);
};

const renderReviews = () => {
  const container = document.getElementById("reviewList");
  const visibleReviews = state.reviews.filter((review) => matchesFilter(
    [review.name, review.email, review.review, formatDate(review.createdAt)],
    state.filters.reviews
  ));
  if (!visibleReviews.length) {
    container.innerHTML = `<article class="empty-card">No reviews saved yet.</article>`;
    return;
  }
  container.innerHTML = visibleReviews.map((review) => `
    <article class="record-card">
      <div class="record-head">
        <div>
          <h4>${escapeHtml(review.name)}</h4>
          <small>${escapeHtml(formatDate(review.createdAt))}</small>
        </div>
        <span class="record-badge">${"★".repeat(review.rating)}</span>
      </div>
      <p class="record-line">${escapeHtml(review.review)}</p>
      ${review.email ? `<p class="record-line muted">${escapeHtml(review.email)}</p>` : ""}
    </article>
  `).join("");
};

const renderAll = () => {
  renderStats();
  renderAccounts();
  renderDiary();
  renderLists();
  renderReviews();
};

const syncAll = async () => {
  if (state.mode === "demo") {
    saveDemoPayload();
    state.lastSyncedAt = new Date().toISOString();
    setSyncState("Local", `Demo vault updated ${formatDate(state.lastSyncedAt)}`);
    return;
  }
  if (state.mode === "local") {
    saveLocalPayload();
    state.lastSyncedAt = new Date().toISOString();
    setSyncState("Local", `Test workspace updated ${formatDate(state.lastSyncedAt)}`);
    return;
  }
  await apiRequest(api.data, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accounts: state.accounts,
      diaryEntries: state.diaryEntries,
      userLists: state.userLists,
      defaultLists: state.defaultLists
    })
  });
  state.lastSyncedAt = new Date().toISOString();
  setSyncState("Live", `Secure cloud sync completed ${formatDate(state.lastSyncedAt)}`);
};

const loadData = async () => {
  if (state.mode === "demo") {
    applyPayloadToState(getDemoPayload());
    return;
  }
  if (state.mode === "local") {
    applyPayloadToState(getLocalPayload(state.user?.id));
    return;
  }

  const payload = await apiRequest(api.data);
  if (!payload.success || !payload.data) {
    throw new Error("Unable to load dashboard data.");
  }

  applyPayloadToState(payload.data);
  state.lastSyncedAt = new Date().toISOString();
  setSyncState("Live", `Workspace loaded ${formatDate(state.lastSyncedAt)}`);
};

const loadReviews = async () => {
  if (state.mode === "demo" || state.mode === "local") return;

  const payload = await apiRequest(api.reviews);
  if (!payload.success || !Array.isArray(payload.reviews)) {
    state.reviews = [];
    return;
  }

  state.reviews = payload.reviews.map((item) => ({
    id: item.id || makeId(),
    name: String(item.name || "Anonymous"),
    email: String(item.email || ""),
    rating: Number(item.rating) || 0,
    review: String(item.review_text || ""),
    createdAt: item.created_at || new Date().toISOString()
  }));
};

const openEditor = (title, html) => {
  editorTitle.textContent = title;
  editorBody.innerHTML = html;
  editorModal.classList.add("active");
  editorModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
};

const closeEditor = () => {
  editorModal.classList.remove("active");
  editorModal.setAttribute("aria-hidden", "true");
  editorBody.innerHTML = "";
  document.body.classList.remove("modal-open");
};

const findCollectionItem = (type, id) => {
  if (type === "account") return state.accounts.find((item) => item.id === id);
  if (type === "diary") return state.diaryEntries.find((item) => item.id === id);
  if (type === "list") return state.userLists.find((item) => item.id === id) || state.defaultLists.find((item) => item.id === id);
  return null;
};

const openEditAccount = (account) => {
  openEditor("Edit account", `
    <form class="stack-form" id="editAccountForm">
      <div class="field"><label>App name</label><input name="appName" value="${escapeHtml(account.appName)}" required /></div>
      <div class="field"><label>URL</label><input name="appUrl" value="${escapeHtml(account.appUrl)}" required /></div>
      <div class="field"><label>Username</label><input name="username" value="${escapeHtml(account.username)}" required /></div>
      <div class="field"><label>Password</label><input name="password" value="${escapeHtml(account.password)}" required /></div>
      <div class="form-status" id="editorStatus" aria-live="polite"></div>
      <button class="btn btn-primary" type="submit">Save Changes</button>
    </form>
  `);
  document.getElementById("editAccountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    account.appName = String(form.get("appName")).trim();
    account.appUrl = String(form.get("appUrl")).trim();
    account.username = String(form.get("username")).trim();
    account.password = String(form.get("password")).trim();
    setFormStatus("editorStatus", "Saving...");
    try {
      await syncAll();
      renderAll();
      closeEditor();
    } catch (error) {
      setFormStatus("editorStatus", error.message || "Save failed.", "error");
    }
  });
};

const openViewAccount = (account) => {
  openEditor("View account", `
    <div class="stack-form">
      <div class="field"><label>App name</label><input value="${escapeHtml(account.appName)}" readonly /></div>
      <div class="field"><label>URL</label><input value="${escapeHtml(account.appUrl)}" readonly /></div>
      <div class="field"><label>Username</label><input value="${escapeHtml(account.username)}" readonly /></div>
      <div class="field"><label>Password</label><input value="${escapeHtml(account.password)}" readonly /></div>
    </div>
  `);
};

const openEditDiary = (entry) => {
  openEditor("Edit diary entry", `
    <form class="stack-form" id="editDiaryForm">
      <div class="field"><label>Title</label><input name="title" value="${escapeHtml(entry.title)}" required /></div>
      <div class="field"><label>Description</label><textarea name="body" required>${escapeHtml(entry.body)}</textarea></div>
      <div class="form-status" id="editorStatus" aria-live="polite"></div>
      <button class="btn btn-primary" type="submit">Save Changes</button>
    </form>
  `);
  document.getElementById("editDiaryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    entry.title = String(form.get("title")).trim();
    entry.body = String(form.get("body")).trim();
    setFormStatus("editorStatus", "Saving...");
    try {
      await syncAll();
      renderAll();
      closeEditor();
    } catch (error) {
      setFormStatus("editorStatus", error.message || "Save failed.", "error");
    }
  });
};

const openViewDiary = (entry) => {
  openEditor("View diary entry", `
    <div class="stack-form">
      <div class="field"><label>Title</label><input value="${escapeHtml(entry.title)}" readonly /></div>
      <div class="field"><label>Saved</label><input value="${escapeHtml(formatDate(entry.createdAt))}" readonly /></div>
      <div class="field"><label>Description</label><textarea readonly>${escapeHtml(entry.body)}</textarea></div>
    </div>
  `);
};

const renderListEditorRows = (list) => {
  return (Array.isArray(list.items) && list.items.length)
    ? list.items.map((item) => `
      <div class="list-edit-row">
        <input class="list-item-input" data-item-id="${item.id}" value="${escapeHtml(item.itemName)}" />
        <button class="btn btn-danger list-item-delete" data-item-id="${item.id}" type="button">Delete</button>
      </div>
    `).join("")
    : `<div class="empty-card">No items yet.</div>`;
};

const openEditList = (list) => {
  openEditor("Edit list", `
    <form class="stack-form" id="editListForm">
      <div class="field"><label>List name</label><input name="name" value="${escapeHtml(list.name)}" required /></div>
      <div class="field">
        <label>Items</label>
        <div class="list-edit-grid">${renderListEditorRows(list)}</div>
      </div>
      <div class="field inline-field">
        <input id="newListItem" type="text" placeholder="Add new item" />
        <button class="btn btn-ghost" id="addListItem" type="button">Add Item</button>
      </div>
      <div class="form-status" id="editorStatus" aria-live="polite"></div>
      <button class="btn btn-primary" type="submit">Save List</button>
    </form>
  `);

  document.getElementById("addListItem").addEventListener("click", () => {
    const input = document.getElementById("newListItem");
    const itemName = input.value.trim();
    if (!itemName) return;
    list.items.push({ id: makeId(), itemName });
    openEditList(list);
  });

  editorBody.querySelectorAll(".list-item-delete").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.itemId;
      list.items = list.items.filter((item) => item.id !== itemId);
      openEditList(list);
    });
  });

  document.getElementById("editListForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    list.name = String(form.get("name")).trim();
    list.items = Array.from(document.querySelectorAll(".list-item-input"))
      .map((input) => ({
        id: input.dataset.itemId,
        itemName: input.value.trim()
      }))
      .filter((item) => item.id && item.itemName);
    setFormStatus("editorStatus", "Saving...");
    try {
      await syncAll();
      renderAll();
      closeEditor();
    } catch (error) {
      setFormStatus("editorStatus", error.message || "Save failed.", "error");
    }
  });
};

const openViewList = (list) => {
  openEditor("View list", `
    <div class="stack-form">
      <div class="field"><label>List name</label><input value="${escapeHtml(list.name)}" readonly /></div>
      <div class="field">
        <label>Items</label>
        <div class="tag-list">
          ${(Array.isArray(list.items) && list.items.length)
            ? list.items.map((item) => `<span class="tag-chip">${escapeHtml(item.itemName)}</span>`).join("")
            : `<span class="tag-chip muted">No items yet</span>`}
        </div>
      </div>
    </div>
  `);
};

const deleteItem = async (type, id) => {
  if (!window.confirm("Delete this item?")) return;
  if (type === "account") state.accounts = state.accounts.filter((item) => item.id !== id);
  if (type === "diary") state.diaryEntries = state.diaryEntries.filter((item) => item.id !== id);
  if (type === "list") state.userLists = state.userLists.filter((item) => item.id !== id);
  await syncAll();
  renderAll();
};

document.getElementById("accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const account = {
    id: makeId(),
    appName: String(form.get("appName")).trim(),
    appUrl: String(form.get("appUrl")).trim(),
    username: String(form.get("username")).trim(),
    password: String(form.get("password")).trim(),
    createdAt: new Date().toISOString()
  };

  if (!account.appName || !account.appUrl || !account.username || !account.password) {
    setFormStatus("accountStatus", "Complete all account fields.", "error");
    return;
  }

  setFormStatus("accountStatus", "Saving account...");
  try {
    state.accounts.unshift(account);
    await syncAll();
    event.currentTarget.reset();
    setFormStatus("accountStatus", "Account saved.", "success");
    renderAll();
  } catch (error) {
    state.accounts = state.accounts.filter((item) => item.id !== account.id);
    setFormStatus("accountStatus", error.message || "Failed to save account.", "error");
  }
});

document.getElementById("diaryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entry = {
    id: makeId(),
    title: String(form.get("title")).trim(),
    body: String(form.get("body")).trim(),
    createdAt: new Date().toISOString()
  };

  if (!entry.title || !entry.body) {
    setFormStatus("diaryStatus", "Title and description are required.", "error");
    return;
  }

  setFormStatus("diaryStatus", "Saving entry...");
  try {
    state.diaryEntries.unshift(entry);
    await syncAll();
    event.currentTarget.reset();
    setFormStatus("diaryStatus", "Entry saved.", "success");
    renderAll();
  } catch (error) {
    state.diaryEntries = state.diaryEntries.filter((item) => item.id !== entry.id);
    setFormStatus("diaryStatus", error.message || "Failed to save entry.", "error");
  }
});

document.getElementById("listForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get("name")).trim();
  if (!name) {
    setFormStatus("listStatus", "List name is required.", "error");
    return;
  }
  const list = { id: makeId(), name, items: [] };
  setFormStatus("listStatus", "Creating list...");
  try {
    state.userLists.push(list);
    await syncAll();
    event.currentTarget.reset();
    setFormStatus("listStatus", "List created.", "success");
    renderAll();
  } catch (error) {
    state.userLists = state.userLists.filter((item) => item.id !== list.id);
    setFormStatus("listStatus", error.message || "Failed to create list.", "error");
  }
});

document.getElementById("reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    id: makeId(),
    name: String(form.get("name")).trim(),
    email: String(form.get("email") || "").trim(),
    rating: Number(form.get("rating")),
    review: String(form.get("review")).trim(),
    createdAt: new Date().toISOString()
  };

  if (!payload.name || !payload.review || !payload.rating) {
    setFormStatus("reviewStatus", "Name, rating, and review are required.", "error");
    return;
  }

  setFormStatus("reviewStatus", "Submitting review...");

  try {
    if (state.mode === "demo" || state.mode === "local") {
      state.reviews.unshift(payload);
      await syncAll();
    } else {
      await apiRequest(api.reviewSubmit, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          rating: payload.rating,
          review_text: payload.review
        })
      });
      await loadReviews();
      state.lastSyncedAt = new Date().toISOString();
      setSyncState("Live", `Review sync completed ${formatDate(state.lastSyncedAt)}`);
    }

    event.currentTarget.reset();
    renderAll();
    setFormStatus("reviewStatus", "Review submitted.", "success");
  } catch (error) {
    setFormStatus("reviewStatus", error.message || "Failed to submit review.", "error");
  }
});

accountSearch.addEventListener("input", (event) => {
  state.filters.accounts = event.target.value;
  renderAccounts();
});

diarySearch.addEventListener("input", (event) => {
  state.filters.diary = event.target.value;
  renderDiary();
});

reviewSearch.addEventListener("input", (event) => {
  state.filters.reviews = event.target.value;
  renderReviews();
});

document.body.addEventListener("click", async (event) => {
  const actionButton = event.target.closest(".action-btn");
  if (!actionButton) return;
  const { type, action, id } = actionButton.dataset;
  const item = findCollectionItem(type, id);
  if (!item) return;

  if (action === "delete") {
    try {
      await deleteItem(type, id);
    } catch (error) {
      window.alert(error.message || "Delete failed.");
    }
    return;
  }

  if (action === "view") {
    if (type === "account") openViewAccount(item);
    if (type === "diary") openViewDiary(item);
    if (type === "list") openViewList(item);
    return;
  }

  if (type === "account") openEditAccount(item);
  if (type === "diary") openEditDiary(item);
  if (type === "list") openEditList(item);
});

document.getElementById("editorClose").addEventListener("click", closeEditor);

editorModal.addEventListener("click", (event) => {
  if (event.target === editorModal) closeEditor();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (state.mode === "demo") {
    clearStoredAuth();
    localStorage.removeItem(demoKeys.user);
    localStorage.removeItem(demoKeys.enabled);
    localStorage.removeItem(demoKeys.data);
    goHome();
    return;
  }
  if (state.mode === "local") {
    clearStoredAuth();
    localStorage.removeItem(localAuthKeys.session);
    goHome();
    return;
  }

  try {
    await apiRequest(api.logout, { method: "POST" });
  } finally {
    clearStoredAuth();
    goHome();
  }
});

exportBtn.addEventListener("click", async () => {
  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";
  try {
    if (state.mode === "demo" || state.mode === "local") {
      downloadJsonFile("hippovault-demo-export.json", {
        exportedAt: new Date().toISOString(),
        user: state.user,
        data: {
          accounts: state.accounts,
          diaryEntries: state.diaryEntries,
          userLists: state.userLists,
          defaultLists: state.defaultLists
        },
        reviews: state.reviews
      });
    } else {
      const payload = await apiRequest(api.export);
      downloadJsonFile("hippovault-export.json", payload);
    }
    setSyncState(syncStatus.textContent, "Encrypted workspace export downloaded");
  } catch (error) {
    window.alert(error.message || "Export failed.");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "Export Data";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editorModal.classList.contains("active")) {
    closeEditor();
  }
});

const bootstrapDemo = () => {
  const demoUser = getDemoUser();
  if (!demoUser) {
    return false;
  }

  state.mode = "demo";
  state.user = demoUser;
  persistAuth(getStoredToken(), demoUser);
  userPill.textContent = `${demoUser.name} | demo mode`;
  applyPayloadToState(getDemoPayload());
  document.getElementById("reviewName").value = demoUser.name || "";
  document.getElementById("reviewEmail").value = demoUser.email || "";
  setSyncState("Local", "Demo workspace loaded in browser storage");
  renderAll();
  return true;
};

const bootstrapLocal = () => {
  const localUser = getLocalSessionUser();
  if (!localUser) {
    return false;
  }

  state.mode = "local";
  state.user = localUser;
  persistAuth(getStoredToken(), localUser);
  userPill.textContent = `${localUser.name} | local test mode`;
  applyPayloadToState(getLocalPayload(localUser.id));
  document.getElementById("reviewName").value = localUser.name || "";
  document.getElementById("reviewEmail").value = localUser.email || "";
  setSyncState("Local", "Test workspace loaded from browser storage");
  renderAll();
  return true;
};

const bootstrap = async () => {
  let shouldRedirectHome = false;

  try {
    const storedToken = getStoredToken();
    if (!storedToken) {
      shouldRedirectHome = true;
      return;
    }

    const demoUser = getDemoUser();
    if (demoUser) {
      if (!bootstrapDemo()) shouldRedirectHome = true;
      return;
    }

    const localUser = getLocalSessionUser();
    if (localUser) {
      if (!bootstrapLocal()) shouldRedirectHome = true;
      return;
    }

    const session = await apiRequest(api.me);
    if (session.success && session.user) {
      state.user = session.user;
      persistAuth(storedToken, session.user);
      userPill.textContent = `${session.user.name} | ${session.user.email}`;
      document.getElementById("reviewName").value = session.user.name || "";
      document.getElementById("reviewEmail").value = session.user.email || "";
      await loadData();
      await loadReviews();
      renderAll();
      return;
    }

    const storedUser = getStoredUser();
    if (storedUser) {
      state.mode = "local";
      state.user = storedUser;
      userPill.textContent = `${storedUser.name} | cached session`;
      applyPayloadToState(getLocalPayload(storedUser.id));
      document.getElementById("reviewName").value = storedUser.name || "";
      document.getElementById("reviewEmail").value = storedUser.email || "";
      setSyncState("Local", "Cached workspace restored from browser storage");
      renderAll();
      return;
    }

    shouldRedirectHome = true;
  } catch (_error) {
    shouldRedirectHome = true;
  } finally {
    setLoading(false);
    renderProtectedContent();
    if (shouldRedirectHome || !state.user) {
      redirectHomeIfUnauthed();
      goHome();
    }
  }
};

bootstrap();
