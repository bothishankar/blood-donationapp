/* ============================================================
   POONGURICHI NANBARGAL BLOOD DONATION APP
   Frontend API bridge + 90-day donor eligibility
   ============================================================ */

const API_URL =
  "https://script.google.com/macros/s/AKfycbwjk23yf4Ub8aRkQJ0WFv42RbzArCgkHf9Gf9WOMK9dtS8WneOh9YGyjZLZLLEH_Gw3/exec";

const ADMIN_KEY = "poongurichi_admin_session";
const NINETY_DAYS = 90;

const API_READ_CACHE = new Map();
const API_INFLIGHT = new Map();
const API_CACHE_TTL = 15000;

async function api(action, data = {}) {
  if (!action) throw new Error("API action is required.");

  const readActions = new Set([
    "health", "getSettings", "getDashboard", "getDashboardStats",
    "getDonors", "searchDonors", "getRequests", "getEvents",
    "getAbout", "getNotifications", "getDonorPhotos"
  ]);

  const isRead = readActions.has(action);
  const paramsKey = isRead
    ? action + "?" + new URLSearchParams(Object.entries(data || {}).sort())
    : "";

  if (isRead) {
    const cached = API_READ_CACHE.get(paramsKey);
    if (cached && (Date.now() - cached.time) < API_CACHE_TTL) return cached.value;
    if (API_INFLIGHT.has(paramsKey)) return API_INFLIGHT.get(paramsKey);
  }

  const requestPromise = (async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let response;
        if (isRead) {
          const params = new URLSearchParams({ action });
          Object.entries(data || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) params.set(key, String(value));
          });
          response = await fetch(`${API_URL}?${params.toString()}`, {
            method: "GET",
            redirect: "follow",
            cache: "default"
          });
        } else {
          response = await fetch(API_URL, {
            method: "POST",
            redirect: "follow",
            cache: "no-store",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action, ...data })
          });
        }

        if (!response.ok) throw new Error(`Server error (${response.status}).`);
        const text = await response.text();
        if (!text.trim()) throw new Error("The database returned an empty response.");

        let result;
        try { result = JSON.parse(text); }
        catch { throw new Error("Google Apps Script returned an invalid response."); }
        if (result && result.success === false) throw new Error(result.error || "Request failed.");

        if (isRead) API_READ_CACHE.set(paramsKey, { time: Date.now(), value: result });
        else invalidateApiCache();
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    throw lastError || new Error("Unable to connect to database.");
  })();

  if (isRead) API_INFLIGHT.set(paramsKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (isRead) API_INFLIGHT.delete(paramsKey);
  }
}

function invalidateApiCache(...actions) {
  if (!actions.length) {
    API_READ_CACHE.clear();
    return;
  }
  for (const key of API_READ_CACHE.keys()) {
    if (actions.some(action => key === action || key.startsWith(action + "?"))) {
      API_READ_CACHE.delete(key);
    }
  }
}

function adminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user && typeof user === "object" ? user : null;
  } catch {
    return null;
  }
}

function setAdminSession(user) {
  if (!user || typeof user !== "object") {
    throw new Error("Invalid administrator session.");
  }
  sessionStorage.setItem(ADMIN_KEY, JSON.stringify(user));
}

function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_KEY);
}

function clean(value) {
  return String(value ?? "").trim();
}

function first(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return "";
}

function parseDonationDate(value) {
  if (!value) return null;

  const text = clean(value);
  if (!text || /^n\.?\s*a\.?$/i.test(text) || /^new\s+donor$/i.test(text)) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    ) {
      return date;
    }
    return null;
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [d, m, y] = text.split(/[/-]/).map(Number);
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    ) {
      return date;
    }
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEligibility(lastDonationDate) {
  const raw = clean(lastDonationDate);

  /* New donors have no previous donation. They are eligible. */
  if (!raw || /^n\.?\s*a\.?$/i.test(raw) || /^new\s+donor$/i.test(raw)) {
    return {
      eligible: true,
      status: "Eligible to Donate",
      className: "eligible",
      daysPassed: null,
      daysRemaining: 0,
      message: "New donor — eligible to donate."
    };
  }

  const last = parseDonationDate(raw);
  if (!last) {
    return {
      eligible: false,
      status: "Invalid Date",
      className: "unknown",
      daysPassed: null,
      daysRemaining: null,
      message: "Last donation date is invalid."
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  const daysPassed = Math.floor((today - last) / 86400000);

  /* Future donation dates are never eligible. */
  if (daysPassed < 0) {
    return {
      eligible: false,
      status: "Invalid Date",
      className: "unknown",
      daysPassed: 0,
      daysRemaining: null,
      message: "Last donation date cannot be in the future."
    };
  }

  if (daysPassed >= NINETY_DAYS) {
    return {
      eligible: true,
      status: "Eligible to Donate",
      className: "eligible",
      daysPassed,
      daysRemaining: 0,
      message: "Eligible to donate."
    };
  }

  const daysRemaining = NINETY_DAYS - daysPassed;

  return {
    eligible: false,
    status: "Not Eligible Yet",
    className: "not-eligible",
    daysPassed,
    daysRemaining,
    message: `Eligible in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`
  };
}

function enrichDonor(donor = {}) {
  const last = first(
    donor,
    "Last_Donation_Date",
    "lastDonationDate",
    "LastDonationDate"
  );

  const eligibility = getEligibility(last);

  return {
    ...donor,
    eligibility,
    eligible: eligibility.eligible,
    eligibilityStatus: eligibility.status,
    eligibilityMessage: eligibility.message,
    daysSinceDonation: eligibility.daysPassed,
    daysRemaining: eligibility.daysRemaining
  };
}

function normalizeDonor(donor = {}) {
  const name = clean(first(donor, "name", "Name", "Donor_Name", "DonorName"));
  const mobile = clean(first(donor, "mobile", "Mobile", "Phone"));
  const email = clean(first(donor, "email", "Email"));
  const bloodGroup = clean(first(donor, "bloodGroup", "Blood_Group", "BloodGroup"));
  const gender = clean(first(donor, "gender", "Gender"));
  const dob = clean(first(donor, "dob", "DOB", "Date_of_Birth"));
  const district = clean(first(donor, "district", "District"));
  const city = clean(first(donor, "city", "City"));
  const address = clean(first(donor, "address", "Address"));
  const lastDonationDate = clean(
    first(donor, "lastDonationDate", "Last_Donation_Date", "LastDonationDate")
  );
  const available = clean(first(donor, "available", "Available")) || "Yes";
  const aadhaarNumber = clean(first(donor, "aadhaarNumber", "Aadhaar_Number", "Aadhaar", "aadhaar"));
  const referredBy = clean(first(donor, "referredBy", "Referred_By", "ReferredBy"));

  return {
    name,
    Name: name,
    Donor_Name: name,
    DonorName: name,
    mobile,
    Mobile: mobile,
    email,
    Email: email,
    bloodGroup,
    Blood_Group: bloodGroup,
    gender,
    Gender: gender,
    dob,
    DOB: dob,
    district,
    District: district,
    city,
    City: city,
    address,
    Address: address,
    lastDonationDate,
    Last_Donation_Date: lastDonationDate,
    LastDonationDate: lastDonationDate,
    aadhaarNumber,
    Aadhaar_Number: aadhaarNumber,
    referredBy,
    Referred_By: referredBy,
    available,
    Available: available
  };
}

function normalizeRequest(request = {}) {
  const patientName = clean(
    first(request, "patientName", "Patient_Name", "PatientName", "Name", "name")
  );
  const hospital = clean(first(request, "hospital", "Hospital", "Medical_Centre"));
  const contactNumber = clean(
    first(request, "contactNumber", "Contact_Number", "Contact_Mobile", "Mobile", "Phone")
  );
  const bloodGroup = clean(first(request, "bloodGroup", "Blood_Group", "BloodGroup"));
  const unitsRequired = clean(first(request, "unitsRequired", "Units_Required", "Units"));
  const district = clean(first(request, "district", "District"));
  const location = clean(first(request, "location", "Location", "City", "city"));
  const priority = clean(first(request, "priority", "Priority")) || "Normal";
  const requiredDate = clean(first(request, "requiredDate", "Required_Date", "Date"));
  const requiredTime = clean(first(request, "requiredTime", "Required_Time", "Time"));
  const description = clean(first(request, "description", "Description", "Additional_Details"));

  return {
    patientName,
    Patient_Name: patientName,
    PatientName: patientName,
    Name: patientName,
    name: patientName,
    hospital,
    Hospital: hospital,
    contactNumber,
    Contact_Number: contactNumber,
    Contact_Mobile: contactNumber,
    bloodGroup,
    Blood_Group: bloodGroup,
    unitsRequired,
    Units_Required: unitsRequired,
    district,
    District: district,
    location,
    Location: location,
    priority,
    Priority: priority,
    requiredDate,
    Required_Date: requiredDate,
    requiredTime,
    Required_Time: requiredTime,
    description,
    Description: description
  };
}

function normalizeEvent(event = {}) {
  const title = clean(first(event, "title", "Title", "Event_Title", "eventTitle"));
  const eventDate = clean(first(event, "eventDate", "Event_Date", "EventDate", "event_date"));
  const location = clean(first(event, "location", "Location", "Event_Location"));
  const imageUrl = clean(first(event, "imageUrl", "Image_URL", "ImageUrl", "imageURL"));
  const description = clean(first(event, "description", "Description", "Info"));
  const status = clean(first(event, "status", "Status")) || "Published";
  const eventId = clean(first(event, "eventId", "Event_ID", "EventID", "id", "ID"));

  return {
    eventId,
    Event_ID: eventId,
    title,
    Title: title,
    Event_Title: title,
    eventDate,
    Event_Date: eventDate,
    EventDate: eventDate,
    location,
    Location: location,
    imageUrl,
    Image_URL: imageUrl,
    description,
    Description: description,
    status,
    Status: status
  };
}

function resultArray(result, key) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.[key])
    ? result[key]
    : Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.result)
        ? result.result
        : [];
}

window.BloodDonationAPI = {
  api,
  adminSession,
  setAdminSession,
  clearAdminSession,
  getEligibility,

  getSettings: () => api("getSettings"),
  getDashboard: () => api("getDashboard"),
  getDashboardStats: () => api("getDashboardStats"),

  getDonors: async () => {
    const donors = resultArray(await api("getDonors"), "donors");
    return donors.map(enrichDonor);
  },

  searchDonors: async (filters = {}) => {
    const result = await api("searchDonors", {
      bloodGroup: clean(filters.bloodGroup),
      district: clean(filters.district),
      city: clean(filters.city),
      available: true
    });
    return resultArray(result, "donors").map(enrichDonor);
  },

  registerDonor: (donor = {}) =>
    api("registerDonor", normalizeDonor(donor)),

  createBloodRequest: (request = {}) =>
    api("createRequest", normalizeRequest(request)),

  getBloodRequests: async () => {
    const result = await api("getRequests");
    return resultArray(result, "requests");
  },

  login: (username, password) =>
    api("login", {
      username: clean(username),
      password: String(password ?? "")
    }),

  saveSetting: (setting, value, userId) =>
    api("saveSetting", {
      setting: clean(setting),
      value: value ?? "",
      userId: clean(userId)
    }),

  deleteDonor: (donorId, userId) =>
    api("deleteDonor", {
      donorId: clean(donorId),
      userId: clean(userId)
    }),

  deleteRequest: (requestId, userId) =>
    api("deleteRequest", {
      requestId: clean(requestId),
      userId: clean(userId)
    }),

  updateDonor: (donor = {}, userId) =>
    api("updateDonor", {
      ...normalizeDonor(donor),
      donorId: clean(first(donor, "donorId", "Donor_ID", "DonorID", "id", "ID")),
      userId: clean(userId)
    }),

  /* EVENTS */
  getEvents: async () => {
    const result = await api("getEvents");
    return resultArray(result, "events").map(normalizeEvent);
  },

  createEvent: (event = {}, userId) =>
    api("createEvent", {
      ...normalizeEvent(event),
      userId: clean(userId)
    }),

  updateEvent: (event = {}, userId) =>
    api("updateEvent", {
      ...normalizeEvent(event),
      userId: clean(userId)
    }),

  deleteEvent: (eventId, userId) =>
    api("deleteEvent", {
      eventId: clean(eventId),
      userId: clean(userId)
    }),

  uploadEventImage: (payload = {}) =>
    api("uploadEventImage", payload),

  getDonorPhotos: async (admin = false) => {
    const result = await api("getDonorPhotos", { admin: admin ? "true" : "false" });
    return resultArray(result, "photos");
  },

  createDonorPhoto: (photo = {}, userId) =>
    api("createDonorPhoto", { ...photo, userId: clean(userId) }),

  updateDonorPhoto: (photo = {}, userId) =>
    api("updateDonorPhoto", { ...photo, userId: clean(userId) }),

  deleteDonorPhoto: (photoId, userId) =>
    api("deleteDonorPhoto", { photoId: clean(photoId), userId: clean(userId) }),

  uploadDonorPhoto: (payload = {}) =>
    api("uploadDonorPhoto", payload),

  /* ABOUT */
  getAbout: () => api("getAbout"),

  saveAbout: (about = {}, userId) =>
    api("saveAbout", {
      ...about,
      userId: clean(userId)
    }),

  /* NOTIFICATIONS */
  getNotifications: (userId = "") =>
    api("getNotifications", { userId: clean(userId) }),

  addNotification: (notification = {}) =>
    api("addNotification", notification),

  markNotificationRead: (notificationId, userId) =>
    api("markNotificationRead", {
      notificationId: clean(notificationId),
      userId: clean(userId)
    }),

  deleteNotification: (notificationId, userId) =>
    api("deleteNotification", {
      notificationId: clean(notificationId),
      userId: clean(userId)
    }),

  clearNotifications: (userId) =>
    api("clearNotifications", { userId: clean(userId) })
};
