const authApiBase = window.location.protocol === "file:" ? "http://localhost:3000" : "";

const authApi = {
  me: `${authApiBase}/api/auth/me`,
  login: `${authApiBase}/api/auth/login`,
  signup: `${authApiBase}/api/auth/signup`,
  verifyOtp: `${authApiBase}/api/auth/verify-otp`
};

const appRoutes = {
  home: window.location.protocol === "file:" ? "./index.html" : "/",
  dashboard: window.location.protocol === "file:" ? "./dashboard.html" : "/dashboard"
};

const demoAccount = {
  id: "demo-user",
  name: "Demo User",
  email: "demo@hippovault.com",
  password: "demo12345"
};

const demoKeys = {
  user: "hippovault-demo-user",
  enabled: "hippovault-demo-enabled",
  data: "hippovault-demo-data"
};

const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authNameField = document.getElementById("authNameField");
const authConfirmField = document.getElementById("authConfirmField");
const authOtpField = document.getElementById("authOtpField");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authConfirmPassword = document.getElementById("authConfirmPassword");
const authOtp = document.getElementById("authOtp");
const authStatus = document.getElementById("authStatus");
const authSubmit = document.getElementById("authSubmit");
const authSwitch = document.getElementById("authSwitch");
const authSwitchText = document.getElementById("authSwitchText");
const authClose = document.getElementById("authClose");
const sessionChip = document.getElementById("sessionChip");
const dashboardTrigger = document.getElementById("dashboardTrigger");
const loginTrigger = document.getElementById("loginTrigger");
const signupTrigger = document.getElementById("signupTrigger");

let authMode = "login";
let pendingOtpChallenge = null;

const getDemoUser = () => {
  try {
    return JSON.parse(localStorage.getItem(demoKeys.user) || "null");
  } catch (_error) {
    return null;
  }
};

const buildDemoData = (user) => ({
  accounts: [
    {
      id: "demo-account-1",
      appName: "Netflix",
      appUrl: "https://www.netflix.com",
      username: user.email,
      password: "DemoPass#2026",
      createdAt: new Date().toISOString()
    },
    {
      id: "demo-account-2",
      appName: "GitHub",
      appUrl: "https://github.com",
      username: user.name.toLowerCase().replaceAll(" ", "."),
      password: "VaultAccess!88",
      createdAt: new Date().toISOString()
    }
  ],
  diaryEntries: [
    {
      id: "demo-diary-1",
      title: "Welcome to Hippovault",
      body: "This is your sample diary entry. You can edit or delete it from the dashboard.",
      createdAt: new Date().toISOString()
    }
  ],
  userLists: [
    {
      id: "demo-list-1",
      name: "Launch Checklist",
      items: [
        { id: "demo-item-1", itemName: "Review dashboard" },
        { id: "demo-item-2", itemName: "Add real credentials" },
        { id: "demo-item-3", itemName: "Write first diary note" }
      ]
    }
  ],
  defaultLists: [
    {
      id: "default-grocery",
      name: "Grocery List",
      locked: true,
      items: [
        { id: "default-grocery-1", itemName: "Milk" },
        { id: "default-grocery-2", itemName: "Eggs" }
      ]
    },
    {
      id: "default-electric",
      name: "Electric List",
      locked: true,
      items: [
        { id: "default-electric-1", itemName: "Extension cable" },
        { id: "default-electric-2", itemName: "Chargers" }
      ]
    },
    {
      id: "default-vegetable",
      name: "Vegetable List",
      locked: true,
      items: [
        { id: "default-vegetable-1", itemName: "Tomatoes" },
        { id: "default-vegetable-2", itemName: "Spinach" }
      ]
    }
  ],
  reviews: [
    {
      id: "demo-review-1",
      name: user.name,
      email: user.email,
      rating: 5,
      review: "Professional layout, smooth dashboard flow, and a clean secure theme.",
      createdAt: new Date().toISOString()
    }
  ]
});

const startDemoSession = (user) => {
  localStorage.setItem(demoKeys.user, JSON.stringify(user));
  localStorage.setItem(demoKeys.enabled, "true");
  if (!localStorage.getItem(demoKeys.data)) {
    localStorage.setItem(demoKeys.data, JSON.stringify(buildDemoData(user)));
  }
};

const goToDashboard = () => {
  window.location.href = appRoutes.dashboard;
};

const setStatus = (message, type = "") => {
  authStatus.textContent = message;
  authStatus.className = "form-status";
  if (type) authStatus.classList.add(type);
};

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const apiRequest = async (url, options = {}) => {
  let response;
  try {
    response = await fetch(url, {
      credentials: "include",
      ...options
    });
  } catch (_error) {
    throw new Error("Cannot reach the server. Demo mode is available.");
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

const updateAuthMode = (mode) => {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create your account" : "Login";
  authSubtitle.textContent = signup
    ? "Create a secure Hippovault account and continue to your dashboard."
    : "Login to continue directly to your protected dashboard. Demo account: demo@hippovault.com / demo12345";
  authSubmit.textContent = signup ? "Create Account" : "Login";
  authNameField.classList.toggle("hidden", !signup);
  authConfirmField.classList.toggle("hidden", !signup);
  authOtpField.classList.add("hidden");
  authSwitchText.textContent = signup ? "Already have an account?" : "Need a new account?";
  authSwitch.textContent = signup ? "Login" : "Sign Up";
  pendingOtpChallenge = null;
  setStatus("");
};

const enterOtpMode = (email, payload) => {
  pendingOtpChallenge = {
    challengeId: payload.challengeId,
    email
  };
  authTitle.textContent = "Verify OTP";
  authSubtitle.textContent = `Enter the 6-digit code sent to ${email}.`;
  authSubmit.textContent = "Verify OTP";
  authNameField.classList.add("hidden");
  authConfirmField.classList.add("hidden");
  authOtpField.classList.remove("hidden");
  authOtp.value = "";
  authSwitchText.textContent = "Need another attempt?";
  authSwitch.textContent = "Back to Login";
  if (payload.otpPreview) {
    setStatus(`Development OTP: ${payload.otpPreview}`, "success");
  } else {
    setStatus("OTP sent to your email.", "success");
  }
};

const openAuth = (mode) => {
  updateAuthMode(mode);
  authModal.classList.add("active");
  authModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
};

const closeAuthModal = () => {
  authModal.classList.remove("active");
  authModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  authForm.reset();
  pendingOtpChallenge = null;
  setStatus("");
};

const setAuthenticatedUI = (user) => {
  const loggedIn = Boolean(user);
  sessionChip.classList.toggle("hidden", !loggedIn);
  dashboardTrigger.classList.toggle("hidden", !loggedIn);
  loginTrigger.classList.toggle("hidden", loggedIn);
  signupTrigger.classList.toggle("hidden", loggedIn);
  sessionChip.textContent = loggedIn ? `${user.name} | authenticated` : "";
};

const hydrateSession = async () => {
  const demoUser = getDemoUser();
  if (demoUser) {
    setAuthenticatedUI(demoUser);
    return;
  }

  try {
    const payload = await apiRequest(authApi.me);
    if (!payload.success || !payload.user) return;
    setAuthenticatedUI(payload.user);
  } catch (_error) {
    setAuthenticatedUI(null);
  }
};

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmail.value.trim();
  const normalizedEmail = email.toLowerCase();
  const password = authPassword.value;

  if (pendingOtpChallenge) {
    const otp = authOtp.value.trim();
    if (!otp) {
      setStatus("Enter the OTP code.", "error");
      return;
    }
    setStatus("Verifying OTP...");
    try {
      const payload = await apiRequest(authApi.verifyOtp, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: pendingOtpChallenge.challengeId,
          otp
        })
      });
      if (!payload.success) {
        throw new Error(payload.message || "OTP verification failed.");
      }
      goToDashboard();
    } catch (error) {
      setStatus(error.message || "OTP verification failed.", "error");
    }
    return;
  }

  if (!email || !password) {
    setStatus("Email and password are required.", "error");
    return;
  }

  if (authMode === "signup") {
    const name = authName.value.trim();
    const confirmPassword = authConfirmPassword.value;
    if (!name || !confirmPassword) {
      setStatus("Complete all signup fields.", "error");
      return;
    }
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.", "error");
      return;
    }
  }

  if (authMode === "login" && normalizedEmail === demoAccount.email && password === demoAccount.password) {
    startDemoSession({
      id: demoAccount.id,
      name: demoAccount.name,
      email: demoAccount.email
    });
    goToDashboard();
    return;
  }

  setStatus(authMode === "signup" ? "Creating account..." : "Signing in...");

  try {
    const payload = await apiRequest(
      authMode === "signup" ? authApi.signup : authApi.login,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          authMode === "signup"
            ? { name: authName.value.trim(), email: normalizedEmail, password }
            : { email: normalizedEmail, password }
        )
      }
    );

    if (!payload.success) {
      throw new Error(payload.message || "Authentication failed.");
    }

    if (payload.requiresOtp) {
      enterOtpMode(normalizedEmail, payload);
      return;
    }

    goToDashboard();
  } catch (error) {
    if (authMode === "signup" || error.message.includes("Demo mode is available")) {
      startDemoSession({
        id: "demo-user",
        name: authName.value.trim() || email.split("@")[0] || "Demo User",
        email: normalizedEmail
      });
      goToDashboard();
      return;
    }
    setStatus(error.message || "Authentication failed.", "error");
  }
});

authSwitch.addEventListener("click", () => {
  if (pendingOtpChallenge) {
    updateAuthMode("login");
    return;
  }
  updateAuthMode(authMode === "login" ? "signup" : "login");
});

authClose.addEventListener("click", closeAuthModal);

authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuthModal();
});

document.getElementById("heroStart").addEventListener("click", () => openAuth("signup"));
document.getElementById("ctaStart").addEventListener("click", () => openAuth("signup"));
loginTrigger.addEventListener("click", () => openAuth("login"));
signupTrigger.addEventListener("click", () => openAuth("signup"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && authModal.classList.contains("active")) {
    closeAuthModal();
  }
});

dashboardTrigger.setAttribute("href", appRoutes.dashboard);

hydrateSession();
