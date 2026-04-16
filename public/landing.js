import { getClerkClient } from "./lib/clerkClient.js";
import { readCookieJson, removeCookieValue, writeCookieJson } from "./lib/browserCookies.js";

const appRoutes = {
  home: window.location.protocol === "file:" ? "./index.html" : "/",
  dashboard: window.location.protocol === "file:" ? "./dashboard.html" : "/dashboard"
};

const authModal = document.getElementById("authModal");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authMount = document.getElementById("authMount");
const authStatus = document.getElementById("authStatus");
const authSwitch = document.getElementById("authSwitch");
const authSwitchText = document.getElementById("authSwitchText");
const authClose = document.getElementById("authClose");
const sessionChip = document.getElementById("sessionChip");
const dashboardTrigger = document.getElementById("dashboardTrigger");
const loginTrigger = document.getElementById("loginTrigger");
const signupTrigger = document.getElementById("signupTrigger");

let authMode = "login";
let authSubscription = null;
let mountedComponent = null;
const authUserCookie = "hippovault-auth-user";

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
  authSwitchText.textContent = signup ? "Already have an account?" : "Need a new account?";
  authSwitch.textContent = signup ? "Login" : "Sign Up";
  setStatus("");
};

const buildUserIdentity = (user) => {
  const fullName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || "";
  const email = user?.primaryEmailAddress?.emailAddress || user?.email || "";

  return {
    id: user?.id || "",
    email,
    name: fullName || email.split("@")[0] || "User"
  };
};

const setAuthenticatedUI = (user) => {
  const loggedIn = Boolean(user);
  sessionChip.classList.toggle("hidden", !loggedIn);
  dashboardTrigger.classList.toggle("hidden", !loggedIn);
  loginTrigger.classList.toggle("hidden", loggedIn);
  signupTrigger.classList.toggle("hidden", loggedIn);
  sessionChip.textContent = loggedIn ? `${user.name} | authenticated` : "";
};

const persistAuthenticatedUser = (user) => {
  if (!user?.id) {
    removeCookieValue(authUserCookie);
    return;
  }

  writeCookieJson(authUserCookie, {
    id: user.id,
    email: user.email,
    name: user.name
  });
};

const clearMountedAuth = async () => {
  if (!mountedComponent) return;

  try {
    const clerk = await getClerkClient();
    if (mountedComponent === "signin") {
      clerk.unmountSignIn(authMount);
    } else {
      clerk.unmountSignUp(authMount);
    }
  } catch (_error) {
    authMount.innerHTML = "";
  } finally {
    mountedComponent = null;
  }
};

const renderAuth = async () => {
  try {
    const clerk = await getClerkClient();
    await clearMountedAuth();
    authMount.innerHTML = "";

    if (authMode === "signup") {
      clerk.mountSignUp(authMount);
      mountedComponent = "signup";
      return;
    }

    clerk.mountSignIn(authMount);
    mountedComponent = "signin";
  } catch (error) {
    setStatus(error.message || "Unable to load authentication.", "error");
  }
};

const openAuth = async (mode) => {
  updateAuthMode(mode);
  authModal.classList.add("active");
  authModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  await renderAuth();
};

const closeAuthModal = async () => {
  authModal.classList.remove("active");
  authModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  setStatus("");
  await clearMountedAuth();
};

const hydrateSession = async () => {
  const cachedUser = readCookieJson(authUserCookie);
  if (cachedUser?.id) {
    setAuthenticatedUI(cachedUser);
  }

  try {
    const clerk = await getClerkClient();
    if (!clerk.isSignedIn || !clerk.user) {
      persistAuthenticatedUser(null);
      setAuthenticatedUI(null);
      return;
    }

    const sessionUser = buildUserIdentity(clerk.user);
    persistAuthenticatedUser(sessionUser);
    setAuthenticatedUI(sessionUser);
    goToDashboard();
  } catch (_error) {
    if (!cachedUser?.id) {
      setAuthenticatedUI(null);
    }
  }
};

authSwitch.addEventListener("click", async () => {
  updateAuthMode(authMode === "login" ? "signup" : "login");
  await renderAuth();
});

authClose.addEventListener("click", () => {
  closeAuthModal();
});

authModal.addEventListener("click", (event) => {
  if (event.target === authModal) {
    closeAuthModal();
  }
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

const bindAuthListener = async () => {
  try {
    const clerk = await getClerkClient();
    authSubscription?.();
    authSubscription = clerk.addListener(({ user }) => {
      const resolvedUser = user ? buildUserIdentity(user) : null;
      persistAuthenticatedUser(resolvedUser);
      setAuthenticatedUI(resolvedUser);

      if (resolvedUser?.id) {
        goToDashboard();
      }
    });
  } catch (_error) {
    setAuthenticatedUI(null);
  }
};

window.addEventListener("pagehide", () => {
  authSubscription?.();
}, { once: true });

bindAuthListener();
hydrateSession();
