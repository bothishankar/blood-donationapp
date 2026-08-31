const API_URL =
  "https://script.google.com/macros/s/AKfycbzArwNN_uYoYtLS6Aj8QvZhOQSXwcYx_MHefvMOS870t4_rB_TWH3ITDNLJhGUmmRYz/exec";

const ADMIN_KEY = "poongurichi_admin_session";
const NINETY_DAYS = 90;

async function api(action, data = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...data })
  });

  const text = await response.text();
  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Google Apps Script returned an invalid response.");
  }

  if (result && result.success === false) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

function adminSession() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_KEY) || "null");
  } catch {
    return null;
  }
}

function setAdminSession(user) {
  sessionStorage.setItem(ADMIN_KEY, JSON.stringify(user || {}));
}

function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_KEY);
}

function parseDonationDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEligibility(lastDonationDate) {
  const last = parseDonationDate(lastDonationDate);

  if (!last) {
    return {
      eligible: false,
      status: "Date Required",
      className: "unknown",
      daysPassed: null,
      daysRemaining: null
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  const daysPassed = Math.floor(
    (today - last) / 86400000
  );

  if (daysPassed >= NINETY_DAYS) {
    return {
      eligible: true,
      status: "Eligible to Donate",
      className: "eligible",
      daysPassed,
      daysRemaining: 0
    };
  }

  return {
    eligible: false,
    status: "Not Eligible Yet",
    className: "not-eligible",
    daysPassed,
    daysRemaining: NINETY_DAYS - daysPassed
  };
}

function enrichDonor(donor) {
  const last =
    donor.Last_Donation_Date ||
    donor.lastDonationDate ||
    donor.LastDonationDate ||
    "";

  return {
    ...donor,
    eligibility: getEligibility(last)
  };
}

window.BloodDonationAPI = {
  api,
  adminSession,
  setAdminSession,
  clearAdminSession,

  getSettings: () => api("getSettings"),
  getDashboardStats: () => api("getDashboardStats"),

  getDonors: async () => {
    const result = await api("getDonors");
    const donors = Array.isArray(result)
      ? result
      : (result.donors || result.data || []);
    return donors.map(enrichDonor);
  },

  searchDonors: async (filters = {}) => {
    const result = await api("searchDonors", {
      bloodGroup: filters.bloodGroup || "",
      district: filters.district || "",
      city: filters.city || "",
      available: true
    });

    const donors = Array.isArray(result)
      ? result
      : (result.donors || result.data || []);

    return donors.map(enrichDonor);
  },

  registerDonor: (donor = {}) =>
    api("registerDonor", donor),

  createBloodRequest: (request = {}) =>
    api("createRequest", request),

  getBloodRequests: () =>
    api("getRequests"),

  login: (username, password) =>
    api("login", { username, password }),

  saveSetting: (setting, value, userId) =>
    api("saveSetting", { setting, value, userId }),

  deleteDonor: (donorId, userId) =>
    api("deleteDonor", { donorId, userId }),

  deleteRequest: (requestId, userId) =>
    api("deleteRequest", { requestId, userId }),

  /* Event endpoints for the new backend */
  getEvents: () =>
    api("getEvents"),

  createEvent: (event, userId) =>
    api("createEvent", { ...event, userId }),

  updateEvent: (event, userId) =>
    api("updateEvent", { ...event, userId }),

  deleteEvent: (eventId, userId) =>
    api("deleteEvent", { eventId, userId }),

  /* Editable About content */
  getAbout: () =>
    api("getAbout"),

  saveAbout: (about, userId) =>
    api("saveAbout", { ...about, userId })
};

window.getEligibility = getEligibility;
