const COOKIE_PART_SIZE = 3200;
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30;

const buildCookieSuffix = () => (window.location.protocol === "https:" ? "; Secure" : "");

const parseCookieMap = () =>
  document.cookie.split(";").reduce((all, entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return all;
    const separatorIndex = trimmed.indexOf("=");
    const key = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
    const value = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : "";
    all[key] = value;
    return all;
  }, {});

const writeCookie = (name, value, maxAge = DEFAULT_MAX_AGE) => {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${buildCookieSuffix()}`;
};

const clearCookie = (name) => {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${buildCookieSuffix()}`;
};

export const removeCookieValue = (name) => {
  const cookies = parseCookieMap();
  const partCount = Number(cookies[`${name}__parts`] || 0);
  clearCookie(name);
  clearCookie(`${name}__parts`);
  for (let index = 0; index < partCount; index += 1) {
    clearCookie(`${name}__${index}`);
  }
};

export const getCookieValue = (name) => {
  const cookies = parseCookieMap();
  if (cookies[name]) {
    try {
      return decodeURIComponent(cookies[name]);
    } catch (_error) {
      return null;
    }
  }

  const partCount = Number(cookies[`${name}__parts`] || 0);
  if (!partCount) return null;

  const encoded = Array.from({ length: partCount }, (_, index) => cookies[`${name}__${index}`] || "").join("");
  if (!encoded) return null;

  try {
    return decodeURIComponent(encoded);
  } catch (_error) {
    return null;
  }
};

export const setCookieValue = (name, rawValue, maxAge = DEFAULT_MAX_AGE) => {
  const encoded = encodeURIComponent(String(rawValue ?? ""));
  const partCount = Math.ceil(encoded.length / COOKIE_PART_SIZE);
  removeCookieValue(name);

  if (partCount <= 1) {
    writeCookie(name, encoded, maxAge);
    return;
  }

  writeCookie(`${name}__parts`, String(partCount), maxAge);
  for (let index = 0; index < partCount; index += 1) {
    const start = index * COOKIE_PART_SIZE;
    const part = encoded.slice(start, start + COOKIE_PART_SIZE);
    writeCookie(`${name}__${index}`, part, maxAge);
  }
};

export const readCookieJson = (name) => {
  const value = getCookieValue(name);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

export const writeCookieJson = (name, payload, maxAge = DEFAULT_MAX_AGE) => {
  setCookieValue(name, JSON.stringify(payload), maxAge);
};

export const createCookieStorage = (prefix) => ({
  getItem(key) {
    return getCookieValue(`${prefix}-${key}`);
  },
  setItem(key, value) {
    setCookieValue(`${prefix}-${key}`, value);
  },
  removeItem(key) {
    removeCookieValue(`${prefix}-${key}`);
  }
});
