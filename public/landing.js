import { supabase } from "./lib/supabaseClient.js";

const appRoutes = {
  home: window.location.protocol === "file:" ? "./index.html" : "/",
  dashboard: window.location.protocol === "file:" ? "./dashboard.html" : "/dashboard"
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

const isRecoverableAuthError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return [
    "rate limit",
    "email rate limit exceeded",
    "cannot reach the server",
    "supabase config is missing",
    "supabase environment variables are not configured"
  ].some((fragment) => message.includes(fragment));
};

const goToDashboard = () => {
  window.location.href = appRoutes.dashboard;
};

const setStatus = (message, type = "") => {
  authStatus.textContent = message;
  authStatus.className = "form-status";
  if (type) authStatus.classList.add(type);
};

const updateAuthMode = (mode) => {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create your account" : "Login";
  authSubtitle.textContent = signup
    ? "Create a secure Hippovault account and continue to your dashboard."
    : "Login to continue directly to your protected dashboard.";
  authSubmit.textContent = signup ? "Create Account" : "Login";
  authNameField.classList.toggle("hidden", !signup);
  authConfirmField.classList.toggle("hidden", !signup);
  authOtpField.classList.add("hidden");
  authSwitchText.textContent = signup ? "Already have an account?" : "Need a new account?";
  authSwitch.textContent = signup ? "Login" : "Sign Up";
  setStatus("");
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

const buildUserIdentity = (user) => {
  const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  return {
    id: user?.id || "",
    email: user?.email || "",
    name: metadataName || user?.email?.split("@")[0] || "User"
  };
};

const getFriendlyAuthMessage = (error) => {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Login failed. Check your email and password, then try again.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email not confirmed yet. Use the confirmation link from your signup email, then log in.";
  }

  return message || "Authentication failed.";
};

const hydrateSession = async () => {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) {
      setAuthenticatedUI(null);
      return;
    }
    const sessionUser = buildUserIdentity(sessionData.session.user);
    setAuthenticatedUI(sessionUser);
    goToDashboard();
  } catch (_error) {
    setAuthenticatedUI(null);
  }
};

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;

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

  setStatus(authMode === "signup" ? "Creating account..." : "Signing in...");

  try {
    if (authMode === "signup") {
      const name = authName.value.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            name
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        goToDashboard();
        return;
      }

      setStatus("Account created. Check your email for the confirmation link, then log in.", "success");
      updateAuthMode("login");
      authEmail.value = email;
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    goToDashboard();
  } catch (error) {
    if (isRecoverableAuthError(error)) {
      setStatus("Supabase auth is temporarily unavailable. Try again when the auth service responds normally.", "error");
      return;
    }

    setStatus(getFriendlyAuthMessage(error), "error");
  }
});

authSwitch.addEventListener("click", () => {
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

const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  setAuthenticatedUI(session ? buildUserIdentity(session.user) : null);
});

window.addEventListener("pagehide", () => {
  authSubscription.unsubscribe();
}, { once: true });

hydrateSession();
