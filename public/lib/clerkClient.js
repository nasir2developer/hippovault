import { Clerk } from "https://esm.sh/@clerk/clerk-js@5?bundle";

const configApi = window.location.protocol === "file:" ? null : "/api/config";
const HARDCODED_CLERK_PUBLISHABLE_KEY = "pk_test_Y2FwaXRhbC1raXdpLTI3LmNsZXJrLmFjY291bnRzLmRldiQ";
let clerkPromise = null;

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const loadConfig = async () => {
  if (!configApi) {
    return HARDCODED_CLERK_PUBLISHABLE_KEY;
  }

  try {
    const response = await fetch(configApi);
    const payload = await parseJsonSafe(response);

    if (response.ok && payload?.clerkPublishableKey) {
      return payload.clerkPublishableKey;
    }
  } catch (_error) {
    // Fall through to the hardcoded key when the server config route is unavailable.
  }

  if (!HARDCODED_CLERK_PUBLISHABLE_KEY) {
    throw new Error("Clerk publishable key is not configured.");
  }

  return HARDCODED_CLERK_PUBLISHABLE_KEY;
};

const deriveClerkDomain = (publishableKey) => {
  const encodedDomain = String(publishableKey).split("_")[2] || "";
  return atob(encodedDomain).slice(0, -1);
};

const loadUiBundle = async (publishableKey) => {
  if (window.__internal_ClerkUICtor) return;

  const script = document.createElement("script");
  script.src = `https://${deriveClerkDomain(publishableKey)}/npm/@clerk/ui@1/dist/ui.browser.js`;
  script.async = true;
  script.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load the Clerk UI bundle."));
    document.head.appendChild(script);
  });
};

export const getClerkClient = async () => {
  if (!clerkPromise) {
    clerkPromise = loadConfig()
      .then(async (publishableKey) => {
        await loadUiBundle(publishableKey);
        const clerk = new Clerk(publishableKey);
        await clerk.load({
          ui: {
            ClerkUI: window.__internal_ClerkUICtor
          }
        });
        return clerk;
      })
      .catch((error) => {
        clerkPromise = null;
        throw error;
      });
  }

  return clerkPromise;
};
