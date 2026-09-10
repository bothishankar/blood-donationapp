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
    "getDonors", "getAdminDonors", "searchDonors", "getRequests", "getEvents",
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
  const alternateMobile = clean(first(donor, "alternateMobile", "Alternate_Mobile", "Alternate Mobile", "Secondary Mobile"));
  const email = clean(first(donor, "email", "Email"));
  const bloodGroup = clean(first(donor, "bloodGroup", "Blood_Group", "BloodGroup"));
  const gender = clean(first(donor, "gender", "Gender"));
  const dob = clean(first(donor, "dob", "DOB", "Date_of_Birth"));
  const district = clean(first(donor, "district", "District"));
  const city = clean(first(donor, "city", "City", "Town/Village", "Town", "Village"));
  const address = clean(first(donor, "address", "Address"));
  const lastDonationDate = clean(
    first(donor, "lastDonationDate", "Last_Donation_Date", "LastDonationDate")
  );
  const available = clean(first(donor, "available", "Available")) || "Yes";
  const aadhaarNumber = clean(first(donor, "aadhaarNumber", "Aadhaar_Number", "Aadhaar", "aadhaar"));
  const referredBy = clean(first(donor, "referredBy", "Referred_By", "ReferredBy"));
  const photoUrl = clean(first(donor, "photoUrl", "Photo_URL", "photoURL", "Photo_Url"));

  return {
    name,
    Name: name,
    Donor_Name: name,
    DonorName: name,
    mobile,
    Mobile: mobile,
    alternateMobile,
    Alternate_Mobile: alternateMobile,
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
    photoUrl,
    Photo_URL: photoUrl,
    photoURL: photoUrl,
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

  getAdminDonors: async (userId) => {
    const donors = resultArray(await api("getAdminDonors", { userId: clean(userId) }), "donors");
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

  getAdminUsers: (userId) => api("getAdminUsers", { userId: clean(userId) }),
  createSubAdmin: (payload = {}) => api("createSubAdmin", payload),
  updateSubAdmin: (payload = {}) => api("updateSubAdmin", payload),
  setSubAdminStatus: (targetUserId, status, userId) => api("setSubAdminStatus", { targetUserId: clean(targetUserId), status: clean(status), userId: clean(userId) }),
  deleteSubAdmin: (targetUserId, userId) => api("deleteSubAdmin", { targetUserId: clean(targetUserId), userId: clean(userId) }),

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

  uploadDonorRegistrationPhoto: (payload = {}) =>
    api("uploadDonorRegistrationPhoto", payload),

  getDonorPhotoData: (payload = {}) =>
    api("getDonorPhotoData", payload),

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


/* ============================================================
   PNBDC DONOR SELF-UPDATE + ADMIN BLOOD REQUEST POSTER
   Add-on: keeps existing application UI/logic intact.
   ============================================================ */
(function PNBDCUpdateAddon(){
  const BOOT_KEY = "__PNBDC_UPDATE_ADDON_V1";
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = true;

  function esc(v){
    return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }
  function toastMsg(msg){
    if (typeof window.toast === "function") window.toast(msg);
    else console.log(msg);
  }
  function apiCall(action,data){ return window.BloodDonationAPI.api(action,data); }

  /* ---------- Donor self-update ---------- */
  function injectDonorUpdate(){
    const form = document.getElementById("donorForm");
    if (!form || document.getElementById("pnDonorSelfUpdateCard")) return;
    const card = form.closest(".content-card");
    if (!card || !card.parentElement) return;

    const wrap = document.createElement("div");
    wrap.id = "pnDonorSelfUpdateCard";
    wrap.className = "pn-self-update-card";
    wrap.innerHTML = `
      <div class="pn-self-update-icon">🩸</div>
      <div class="pn-self-update-copy">
        <strong>Already a Registered Donor?</strong>
        <span>Update your last blood donation date securely using your Donor ID and Date of Birth.</span>
      </div>
      <button type="button" class="pn-self-update-btn" onclick="window.PNBDCOpenDonorUpdate()">✏️ Update Last Donation</button>
    `;
    card.parentElement.insertBefore(wrap, card);
  }

  function ensureDonorUpdateModal(){
    if (document.getElementById("pnDonorSelfUpdateModal")) return;
    const modal = document.createElement("div");
    modal.id = "pnDonorSelfUpdateModal";
    modal.className = "pn-self-modal";
    modal.innerHTML = `
      <div class="pn-self-modal-card" role="dialog" aria-modal="true" aria-labelledby="pnSelfUpdateTitle">
        <div class="pn-self-modal-head">
          <div><div class="pn-self-kicker">PNBDC DONOR PORTAL</div><h2 id="pnSelfUpdateTitle">Update Last Donation</h2></div>
          <button type="button" class="pn-self-close" aria-label="Close" onclick="window.PNBDCCloseDonorUpdate()">×</button>
        </div>
        <p class="pn-self-help">Use your <b>Donor ID</b> as ID and your <b>Date of Birth</b> as password.</p>
        <form id="pnDonorSelfUpdateForm" class="pn-self-form">
          <label>Donor ID <span>Required</span><input id="pnSelfDonorId" autocomplete="username" placeholder="PNBDC000001" required></label>
          <label>Date of Birth / Password <span>DDMMYYYY</span><input id="pnSelfDob" inputmode="numeric" autocomplete="current-password" maxlength="10" placeholder="18022008" required></label>
          <div class="pn-self-divider"></div>
          <label>Last Donation Date <span>Required</span><input id="pnSelfLastDonation" type="date" required></label>
          <div id="pnSelfUpdateMessage" class="pn-self-message"></div>
          <button id="pnSelfUpdateSubmit" type="submit" class="pn-self-submit">💾 Save Last Donation Date</button>
        </form>
        <div class="pn-self-note">🔒 Only the last donation date is changed. Your other donor details remain unchanged.</div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) window.PNBDCCloseDonorUpdate(); });
    document.getElementById("pnDonorSelfUpdateForm").addEventListener("submit", submitDonorUpdate);
  }

  async function submitDonorUpdate(e){
    e.preventDefault();
    const idEl=document.getElementById("pnSelfDonorId");
    const dobEl=document.getElementById("pnSelfDob");
    const dateEl=document.getElementById("pnSelfLastDonation");
    const msg=document.getElementById("pnSelfUpdateMessage");
    const btn=document.getElementById("pnSelfUpdateSubmit");
    const donorId=String(idEl.value||"").trim().toUpperCase();
    const dob=String(dobEl.value||"").replace(/\D/g,"");
    const lastDonationDate=String(dateEl.value||"").trim();
    if(!/^PNBDC\d{6}$/.test(donorId)){msg.className="pn-self-message error";msg.textContent="Enter a valid PNBDC Donor ID.";idEl.focus();return;}
    if(!/^\d{8}$/.test(dob)){msg.className="pn-self-message error";msg.textContent="Enter DOB as DDMMYYYY. Example: 18022008";dobEl.focus();return;}
    if(!lastDonationDate){msg.className="pn-self-message error";msg.textContent="Please select your last donation date.";dateEl.focus();return;}
    const selected=new Date(lastDonationDate+"T00:00:00");
    const today=new Date(); today.setHours(0,0,0,0);
    if(selected>today){msg.className="pn-self-message error";msg.textContent="Last donation date cannot be in the future.";dateEl.focus();return;}
    try{
      btn.disabled=true; btn.textContent="Checking details…";
      msg.className="pn-self-message info"; msg.textContent="Verifying Donor ID and DOB…";
      const result=await apiCall("updateDonorSelf",{donorId,dob,lastDonationDate});
      if(result?.success===false) throw new Error(result.error||"Unable to update donor details.");
      msg.className="pn-self-message success"; msg.textContent="✓ Last donation date updated successfully.";
      toastMsg("Last donation date updated successfully.");
      setTimeout(()=>{ window.PNBDCCloseDonorUpdate(); },900);
      if(typeof window.loadDonors === "function") { try{ await window.loadDonors(); }catch(_){} }
    }catch(err){
      msg.className="pn-self-message error"; msg.textContent=err?.message||"Unable to update donor details.";
    }finally{btn.disabled=false;btn.textContent="💾 Save Last Donation Date";}
  }

  window.PNBDCOpenDonorUpdate=function(){ ensureDonorUpdateModal(); const m=document.getElementById("pnDonorSelfUpdateModal"); m.classList.add("show"); setTimeout(()=>document.getElementById("pnSelfDonorId")?.focus(),80); };
  window.PNBDCCloseDonorUpdate=function(){ document.getElementById("pnDonorSelfUpdateModal")?.classList.remove("show"); };

  /* ---------- Admin blood-request poster ---------- */
  function getRefId(item){ return String(item?.referenceId || item?.Reference_ID || item?.requestId || item?.Request_ID || "").trim(); }
  function isBloodRequest(item){ return String(item?.type || item?.Type || "").toLowerCase()==="blood request"; }

  async function generateRequestPoster(requestId, button){
    if(!requestId) return toastMsg("Request ID is not available.");
    try{
      if(button){button.disabled=true;button.textContent="Generating…";}
      const admin = typeof window.getAdminUserId === "function" ? window.getAdminUserId() : "";
      const result=await apiCall("getRequestById",{requestId,userId:admin});
      if(result?.success===false) throw new Error(result.error||"Unable to load blood request.");
      const req=result.request||result.data||result.result;
      if(!req) throw new Error("Blood request not found.");
      const dataUrl=await drawRequestPoster(req);
      const a=document.createElement("a");
      const safe=String(req.requestId||requestId).replace(/[^a-zA-Z0-9_-]/g,"_");
      a.href=dataUrl; a.download=`${safe}_Blood_Request.png`; document.body.appendChild(a); a.click(); a.remove();
      toastMsg("Blood request image downloaded.");
    }catch(err){console.error(err);toastMsg(err?.message||"Unable to generate request image.");}
    finally{if(button){button.disabled=false;button.textContent="🖼️ Generate Request";}}
  }

  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}
  async function drawRequestPoster(req){
    const c=document.createElement("canvas"); c.width=1200; c.height=1500; const x=c.getContext("2d");
    const bg=x.createLinearGradient(0,0,1200,1500); bg.addColorStop(0,"#f7fbff"); bg.addColorStop(1,"#ffffff"); x.fillStyle=bg;x.fillRect(0,0,1200,1500);
    x.fillStyle="#102a56"; x.fillRect(0,0,1200,210);
    try{const logo=await loadImage("icons/poongurichi-logo.jpeg");x.drawImage(logo,60,45,120,120);}catch(_){x.fillStyle="#e72d50";x.beginPath();x.arc(120,105,55,0,Math.PI*2);x.fill();}
    x.fillStyle="#fff";x.font="800 38px Arial";x.fillText("Poongurichi Nanbargal",210,90);x.font="500 22px Arial";x.fillText("Blood Donors Club",210,128);
    x.fillStyle="#e72d50";x.roundRect(870,55,260,85,42);x.fill();x.fillStyle="#fff";x.font="900 32px Arial";x.textAlign="center";x.fillText(String(req.priority||"NORMAL").toUpperCase(),1000,110);x.textAlign="left";
    x.fillStyle="#102a56";x.font="900 44px Arial";x.fillText("URGENT BLOOD REQUEST",60,285);
    x.fillStyle="#e72d50";x.font="900 110px Arial";x.textAlign="center";x.fillText(String(req.bloodGroup||"?").toUpperCase(),600,440);
    x.fillStyle="#102a56";x.font="800 28px Arial";x.fillText(`${req.unitsRequired||"1"} UNIT(S) REQUIRED`,60,500);
    const rows=[
      ["Patient",req.patientName], ["Hospital",req.hospital], ["Location",[req.location,req.district].filter(Boolean).join(", ")],
      ["Required Date",req.requiredDate||"As soon as possible"], ["Required Time",req.requiredTime||""], ["Contact",req.contactNumber]
    ];
    let y=590;
    rows.forEach(([label,val])=>{x.fillStyle="#5b6b83";x.font="700 22px Arial";x.fillText(label.toUpperCase(),70,y);x.fillStyle="#102a56";x.font="600 28px Arial";x.fillText(String(val||"—"),300,y);y+=90;});
    x.fillStyle="#eef5ff";x.roundRect(55,1120,1090,170,28);x.fill();x.fillStyle="#102a56";x.font="700 22px Arial";x.fillText("Additional Details",80,1160);x.font="500 24px Arial";
    const desc=String(req.description||"Please contact the attender for further details."); const lines=wrapCanvasText(x,desc,80,1205,1030,34); lines.slice(0,3).forEach((line,i)=>x.fillText(line,80,1205+i*34));
    x.fillStyle="#e72d50";x.font="700 20px Arial";x.fillText(`Request ID: ${req.requestId||""}`,70,1365);
    x.fillStyle="#fff0f3";x.roundRect(70,1390,1060,52,26);x.fill();
    x.fillStyle="#e72d50";x.font="900 18px Arial";x.textAlign="center";x.fillText("♥  MY CLUB  •  POONGURICHI NANBARGAL BLOODS CLUB  ♥",600,1423);x.textAlign="left";
    x.fillStyle="#68758c";x.font="500 16px Arial";x.fillText("Please share responsibly. Verify the request before arranging donation.",70,1468);
    return c.toDataURL("image/png");
  }
  function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight){const words=String(text||"").split(/\s+/),lines=[];let line="";words.forEach(w=>{const test=line?line+" "+w:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w;}else line=test;});if(line)lines.push(line);return lines;}

  function decorateBloodRequestNotifications(){
    if(typeof window.adminIsLoggedIn === "function" && !window.adminIsLoggedIn()) return;
    const list=document.getElementById("notificationList"); if(!list) return;
    const items=[...list.querySelectorAll(".notification-item")];
    items.forEach((el)=>{
      if(el.querySelector(".pn-generate-request-btn")) return;
      const text=String(el.textContent||"");
      const match=text.match(/\b(REQ[A-Z0-9_-]*)\b/i);
      const ref=match ? match[1] : "";
      if(!ref) return;
      const content=el.querySelector(".notification-item-content"); if(!content) return;
      const btn=document.createElement("button"); btn.type="button"; btn.className="pn-generate-request-btn"; btn.textContent="🖼️ Generate Request";
      btn.addEventListener("click",e=>{e.stopPropagation();generateRequestPoster(ref,btn);}); content.appendChild(btn);
    });
  }

  function hookNotificationRenderer(){
    if(typeof window.renderNotifications !== "function") return false;
    if(window.renderNotifications.__pnHooked) return true;
    const original=window.renderNotifications;
    function wrapped(){const out=original.apply(this,arguments);setTimeout(decorateBloodRequestNotifications,0);return out;}
    wrapped.__pnHooked=true; window.renderNotifications=wrapped; return true;
  }

  function injectStyles(){
    if(document.getElementById("pn-update-addon-styles")) return;
    const s=document.createElement("style");s.id="pn-update-addon-styles";s.textContent=`
      .pn-self-update-card{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:16px 18px;border:1px solid #dbe7f5;border-radius:18px;background:linear-gradient(135deg,#f7fbff,#fff);box-shadow:0 10px 28px rgba(16,42,86,.07)}
      .pn-self-update-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;background:#fff0f3;font-size:24px;flex:0 0 48px}.pn-self-update-copy{flex:1;min-width:0}.pn-self-update-copy strong{display:block;color:#102a56;font-size:15px}.pn-self-update-copy span{display:block;color:#68758c;font-size:12px;margin-top:2px}.pn-self-update-btn{border:0;border-radius:12px;background:#102a56;color:#fff;padding:11px 14px;font-weight:800;white-space:nowrap}.pn-self-update-btn:hover{background:#1769e0}
      .pn-self-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(9,22,44,.58);backdrop-filter:blur(8px)}.pn-self-modal.show{display:flex}.pn-self-modal-card{width:min(480px,100%);background:#fff;border:1px solid #dce7f4;border-radius:24px;padding:24px;box-shadow:0 30px 90px rgba(0,0,0,.28)}.pn-self-modal-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start}.pn-self-kicker{font-size:10px;font-weight:900;letter-spacing:.12em;color:#e72d50}.pn-self-modal h2{margin:3px 0 0;color:#102a56;font-size:24px}.pn-self-close{width:36px;height:36px;border:0;border-radius:11px;background:#f1f5f9;font-size:22px;color:#102a56}.pn-self-help{margin:13px 0 18px;color:#68758c;font-size:13px;line-height:1.5}.pn-self-form{display:grid;gap:13px}.pn-self-form label{display:flex;flex-direction:column;gap:6px;color:#102a56;font-size:12px;font-weight:850}.pn-self-form label span{font-size:10px;color:#7a8799;font-weight:700}.pn-self-form input{width:100%;min-height:48px;border:1px solid #d8e0ec;background:#fbfcfe;border-radius:12px;padding:0 13px;outline:none;color:#12213f}.pn-self-form input:focus{border-color:#1769e0;box-shadow:0 0 0 4px rgba(23,105,224,.09);background:#fff}.pn-self-divider{height:1px;background:#edf1f7;margin:2px 0}.pn-self-submit{min-height:49px;border:0;border-radius:13px;background:linear-gradient(135deg,#1769e0,#104eb4);color:#fff;font-weight:850}.pn-self-submit:disabled{opacity:.65}.pn-self-message{display:none;padding:11px 13px;border-radius:11px;font-size:12px;font-weight:750}.pn-self-message.success,.pn-self-message.error,.pn-self-message.info{display:block}.pn-self-message.success{background:#ecfbf5;color:#08734b}.pn-self-message.error{background:#fff0f3;color:#b8183b}.pn-self-message.info{background:#eef5ff;color:#1557c0}.pn-self-note{margin-top:13px;padding:10px 12px;border-radius:11px;background:#f7f9fc;color:#68758c;font-size:11px;line-height:1.45}.pn-generate-request-btn{display:inline-flex;align-items:center;justify-content:center;margin-top:9px;border:1px solid #cfe0f7;background:#eef5ff;color:#1557c0;border-radius:10px;padding:7px 10px;font-size:11px;font-weight:850;cursor:pointer}.pn-generate-request-btn:hover{background:#dfeeff}.pn-generate-request-btn:disabled{opacity:.6}
      @media(max-width:640px){.pn-self-update-card{align-items:flex-start;flex-wrap:wrap}.pn-self-update-copy{flex-basis:calc(100% - 64px)}.pn-self-update-btn{width:100%}.pn-self-modal{padding:10px}.pn-self-modal-card{padding:19px;border-radius:20px}.pn-self-modal h2{font-size:21px}}
    `;document.head.appendChild(s);
  }

  function boot(){
    injectStyles(); ensureDonorUpdateModal(); injectDonorUpdate(); hookNotificationRenderer();
    decorateBloodRequestNotifications();
    if(!window.__pnAddonTimer){window.__pnAddonTimer=setInterval(()=>{injectDonorUpdate();hookNotificationRenderer();decorateBloodRequestNotifications();},1200);setTimeout(()=>{clearInterval(window.__pnAddonTimer);window.__pnAddonTimer=null;},30000);}
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();

/* ===== INDEX INLINE LOGIC CONSOLIDATED ===== */
(function(){
  window.addEventListener("load", function(){
    var api=window.BloodDonationAPI;
    var required=["createSubAdmin","getAdminUsers","updateSubAdmin","setSubAdminStatus","deleteSubAdmin","getAdminDonors"];
    var missing=required.filter(function(k){return !api || typeof api[k]!=="function";});
    if(missing.length){
      console.error("PNBDC API bridge missing:", missing);
      var el=document.getElementById("adminManagementCard");
      if(el){
        var m=document.createElement("div");
        m.className="form-message error";
        m.textContent="System update required. Please refresh once or upload the latest PNBDC package. Missing: "+missing.join(", ");
        el.insertBefore(m, el.firstChild);
      }
    }
  });
})();

/* =========================================================
       GLOBAL
       ========================================================= */

    const bloodGroups = [
      "A+",
      "A-",
      "B+",
      "B-",
      "AB+",
      "AB-",
      "O+",
      "O-"
    ];


    /* =========================================================
       NAVIGATION
       ========================================================= */

    function goTo(page) {

      /* Admin dashboard is protected by the existing admin session. */
      if (page === "admin" && !adminIsLoggedIn()) {
        openAdmin();
        return;
      }

      document
        .querySelectorAll(".page-section")
        .forEach(section => {
          section.classList.remove("active");
        });


      const target =
        document.getElementById(
          "page-" + page
        );


      if (target) {
        target.classList.add("active");
      }

      if (page === "admin" && adminIsLoggedIn()) {
        // Admin opens on the Donors tab; individual buttons switch tabs without exposing other panels.
        setTimeout(() => adminJumpTo("donors"), 0);
      }

      document
        .querySelectorAll(".nav-link")
        .forEach(button => {

          button.classList.toggle(
            "active",
            button.dataset.page === page
          );

        });


      document
        .querySelectorAll(".mobile-nav-btn")
        .forEach(button => {

          button.classList.toggle(
            "active",
            button.dataset.mobilePage === page
          );

        });


      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });


      if (page === "find") {
        setTimeout(() => {

          const result =
            document.getElementById(
              "donorResults"
            );

          if (
            result &&
            result.children.length === 0
          ) {
            result.innerHTML =
              '<div class="loading">Search for available donors.</div>';
          }

        }, 50);
      }

    }


    /* =========================================================
       TOAST
       ========================================================= */

    let toastTimer;

    function toast(message) {

      const element =
        document.getElementById("toast");

      element.textContent = message;

      element.classList.add("show");

      clearTimeout(toastTimer);

      toastTimer =
        setTimeout(() => {
          element.classList.remove("show");
        }, 3000);

    }


    /* =========================================================
       SAFE VALUE
       ========================================================= */

    function value(obj, ...keys) {

      for (const key of keys) {

        if (
          obj &&
          obj[key] !== undefined &&
          obj[key] !== null &&
          obj[key] !== ""
        ) {
          return obj[key];
        }

      }

      return "";

    }


    /* =========================================================
       DASHBOARD
       ========================================================= */

    async function loadDashboard() {
      try {
        if (!window.BloodDonationAPI) {
          throw new Error("BloodDonationAPI is not available.");
        }

        let stats = {};
        let donors = [];
        let requests = [];
        let events = [];

        try {
          const result = await BloodDonationAPI.getDashboardStats();
          stats = result?.stats || result?.data || result || {};
        } catch (statsError) {
          console.warn("Dashboard stats failed; loading database tables directly.", statsError);

          const [d, r, e] = await Promise.all([
            BloodDonationAPI.getDonors(),
            BloodDonationAPI.getBloodRequests(),
            BloodDonationAPI.getEvents()
          ]);

          donors = Array.isArray(d) ? d : [];
          requests = Array.isArray(r) ? r : [];
          events = Array.isArray(e) ? e : [];

          stats = {
            totalDonors: donors.length,
            openRequests: requests.filter(x =>
              String(value(x, "Status", "status")).toLowerCase() !== "closed"
            ).length,
            totalRequests: requests.length,
            bloodGroups: new Set(
              donors.map(x =>
                String(value(x, "Blood_Group", "bloodGroup", "BloodGroup")).trim()
              ).filter(Boolean)
            ).size,
            events: events.length
          };
        }

        const donorCount = Number(
          value(stats, "totalDonors", "registeredDonors", "donors", "Registered_Donors")
        ) || donors.length;

        let requestCount = Number(
          value(stats, "openRequests", "totalRequests", "activeRequests", "bloodRequests",
            "requests", "Open_Requests", "Total_Requests", "Active_Requests")
        );

        /* If the stats endpoint is from an older deployment or returns
           zero without the request table, verify the request count once. */
        if (!Number.isFinite(requestCount) || requestCount < 0) {
          requestCount = requests.length;
        }

        const groupCount = Number(
          value(stats, "bloodGroups", "groups", "Blood_Groups")
        ) || (
          donors.length
            ? new Set(
                donors.map(x =>
                  String(value(x, "Blood_Group", "bloodGroup", "BloodGroup")).trim()
                ).filter(Boolean)
              ).size
            : 0
        );

        const eventCount = Number(
          value(stats, "events", "totalEvents", "camps", "Events")
        ) || events.length;

        document.getElementById("statDonors").textContent = donorCount;
        document.getElementById("statRequests").textContent = requestCount;
        document.getElementById("statGroups").textContent = groupCount;
        document.getElementById("statEvents").textContent = eventCount;
        document.getElementById("heroDonorCount").textContent = donorCount;

      } catch (error) {
        console.error("Database/dashboard error:", error);
        ["statDonors","statRequests","statGroups","statEvents","heroDonorCount"]
          .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "—";
          });
      }
    }


    /* =========================================================
       BLOOD GROUP COUNTS
       ========================================================= */

    async function loadBloodGroups() {

      const container =
        document.getElementById(
          "bloodGrid"
        );


      try {

        const donors =
          await BloodDonationAPI.getDonors();


        const counts = {};

        bloodGroups.forEach(group => {
          counts[group] = 0;
        });


        donors.forEach(donor => {

          const group =
            String(
              value(
                donor,
                "Blood_Group",
                "bloodGroup",
                "BloodGroup"
              )
            )
            .trim()
            .toUpperCase();


          if (
            Object.prototype.hasOwnProperty.call(
              counts,
              group
            )
          ) {
            counts[group]++;
          }

        });


        container.innerHTML =
          bloodGroups
            .map(group => {

              const count =
                counts[group] || 0;


              return `

                <div class="blood-card">

                  <div class="blood-drop">
                    🩸
                  </div>

                  <div class="blood-type">
                    ${escapeHtml(group)}
                  </div>

                  <div class="blood-count">
                    ${count}
                  </div>

                  <div class="blood-members">
                    ${count === 1 ? "Member" : "Members"}
                  </div>

                </div>

              `;

            })
            .join("");

      } catch (error) {

        console.error(
          "Blood groups database error:",
          error
        );

        container.innerHTML = `
          <div class="empty-events" style="grid-column:1/-1">
            🩸<br><br>
            Blood group data is temporarily unavailable.
          </div>
        `;

      }

    }


    /* =========================================================
       EVENTS
       ========================================================= */

    let cachedEvents = [];


    async function loadEvents() {

      const container =
        document.getElementById(
          "eventsContainer"
        );


      try {

        const result =
          await BloodDonationAPI.getEvents();


        cachedEvents =
          Array.isArray(result)
            ? result
            : (
                result?.events ||
                result?.data ||
                result?.result ||
                []
              );

        if (!Array.isArray(cachedEvents)) {
          cachedEvents = [];
        }


        /*
          Only show active/upcoming events when
          status is available.
        */

        const today =
          new Date();

        const events =
          cachedEvents
            .filter(event => {

              const status =
                String(
                  value(
                    event,
                    "Status",
                    "status"
                  )
                )
                .toLowerCase();


              if (
                status &&
                [
                  "cancelled",
                  "canceled",
                  "deleted",
                  "inactive",
                  "archived",
                  "draft",
                  "removed"
                ].includes(status)
              ) {
                return false;
              }


              const dateText =
                value(
                  event,
                  "Event_Date",
                  "eventDate",
                  "EventDate"
                );


              if (!dateText) {
                return true;
              }


              const date =
                parseLocalDate(dateText);


              if (!date) {
                return true;
              }


              return date >=
                new Date(
                  today.getFullYear(),
                  today.getMonth(),
                  today.getDate()
                );

            })
            .sort((a, b) => {
              const da = value(a, "Event_Date", "eventDate", "EventDate");
              const db = value(b, "Event_Date", "eventDate", "EventDate");

              if (!da && !db) return 0;
              if (!da) return 1;
              if (!db) return -1;

              const parsedA = parseLocalDate(da);
              const parsedB = parseLocalDate(db);
              const ta = parsedA ? parsedA.getTime() : Number.MAX_SAFE_INTEGER;
              const tb = parsedB ? parsedB.getTime() : Number.MAX_SAFE_INTEGER;

              if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
              if (Number.isNaN(ta)) return 1;
              if (Number.isNaN(tb)) return -1;

              return ta - tb;
            })
            .slice(0, 1);


        if (!events.length) {

          container.innerHTML = `

            <div class="empty-events"
                 style="grid-column:1/-1">

              ❤️

              <br><br>

              No upcoming events
              are currently available.

            </div>

          `;

          return;

        }


        container.innerHTML =
          events
            .map(renderEvent)
            .join("");

      } catch (error) {

        console.error(
          "Events error:",
          error
        );


        container.innerHTML = `

          <div class="empty-events"
               style="grid-column:1/-1">

            Unable to load events right now.

          </div>

        `;

      }

    }


    function renderEvent(event) {

      const title =
        value(
          event,
          "Title",
          "title",
          "Event_Title"
        ) ||
        "Blood Donation Camp";


      const date =
        value(
          event,
          "Event_Date",
          "eventDate",
          "EventDate"
        );


      const location =
        value(
          event,
          "Location",
          "location"
        ) ||
        "Poongurichi";


      const image =
        value(
          event,
          "Image_URL",
          "imageUrl",
          "ImageURL"
        );


      const description =
        value(
          event,
          "Description",
          "description"
        ) ||
        "Join us and help save lives in our community.";


      const status =
        value(
          event,
          "Status",
          "status"
        ) ||
        "Upcoming";


      return `

        <article class="event-card">

          <div class="event-image-wrap">

            ${
              image
              ? `
                <img
                  class="event-image"
                  src="${escapeAttribute(image)}"
                  alt="${escapeAttribute(title)}"
                  loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                >

                <div
                  class="event-placeholder"
                  style="display:none"
                >
                  🩸
                </div>
              `
              : `
                <div class="event-placeholder">
                  🩸
                </div>
              `
            }

          </div>


          <div class="event-body">

            <h3 class="event-title">
              ${escapeHtml(title)}
            </h3>


            <div class="event-meta">

              ${
                date
                ? `
                  <span>
                    📅
                    ${escapeHtml(formatDate(date))}
                  </span>
                `
                : ""
              }


              <span>
                📍
                ${escapeHtml(location)}
              </span>

            </div>


            <p class="event-description">
              ${escapeHtml(description)}
            </p>


            <span class="event-status">
              ${escapeHtml(status)}
            </span>

          </div>

        </article>

      `;

    }


    function parseLocalDate(value) {
      const text = String(value ?? "").trim();
      const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (match) {
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isNaN(date.getTime()) ? null : date;
      }
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {

      const date =
        parseLocalDate(value);


      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return String(value);
      }


      return date.toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }
      );

    }


    async function showAllEvents() {
      const container = document.getElementById("eventsContainer");
      if (!container) return;

      container.innerHTML = `
        <div class="loading" style="grid-column:1/-1">
          <span class="spinner"></span>
          Loading all events...
        </div>
      `;

      try {
        const result = await BloodDonationAPI.getEvents();

        const freshEvents = Array.isArray(result)
          ? result
          : (
              result?.events ||
              result?.data ||
              result?.result ||
              []
            );

        cachedEvents = Array.isArray(freshEvents) ? freshEvents : [];

        const activeEvents = cachedEvents.filter(event => {
          const status = String(
            value(event, "Status", "status")
          ).trim().toLowerCase();

          return ![
            "cancelled",
            "canceled",
            "deleted",
            "inactive",
            "removed"
          ].includes(status);
        });

        if (!activeEvents.length) {
          container.innerHTML = `
            <div class="empty-events" style="grid-column:1/-1">
              ❤️
              <br><br>
              No events are currently available.
            </div>
          `;
          toast("No events are currently available.");
          return;
        }

        container.innerHTML = activeEvents
          .map(renderEvent)
          .join("");

        toast(`${activeEvents.length} event(s) loaded.`);
      } catch (error) {
        console.error("View all events error:", error);

        const fallbackEvents = (Array.isArray(cachedEvents)
          ? cachedEvents
          : []
        ).filter(event => {
          const status = String(
            value(event, "Status", "status")
          ).trim().toLowerCase();

          return ![
            "cancelled",
            "canceled",
            "deleted",
            "inactive",
            "removed"
          ].includes(status);
        });

        if (fallbackEvents.length) {
          container.innerHTML = fallbackEvents
            .map(renderEvent)
            .join("");
          toast(`${fallbackEvents.length} event(s) loaded.`);
          return;
        }

        container.innerHTML = `
          <div class="empty-events" style="grid-column:1/-1">
            Unable to load events right now.
          </div>
        `;
      }
    }


    /* =========================================================
       DONOR PHOTO LOCAL CACHE
       ========================================================= */
    let __pendingDonorPhotoDataUrl = "";
    function donorPhotoCacheKey(donorId) { return "poongurichi_donor_photo_" + String(donorId || "").trim(); }
    async function makeDonorPhotoDataUrl(file) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const maxW=600, maxH=750, scale=Math.min(1,maxW/img.width,maxH/img.height);
            const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale));
            const cx=c.getContext("2d"); if(!cx) return reject(new Error("Unable to prepare donor photo."));
            cx.drawImage(img,0,0,c.width,c.height); resolve(c.toDataURL("image/jpeg",0.82));
          };
          img.onerror=()=>reject(new Error("Unable to read donor photo."));
          img.src=String(reader.result||"");
        };
        reader.onerror=reject; reader.readAsDataURL(file);
      });
    }
    function getCachedDonorPhoto(donorId) { try { return donorId ? (localStorage.getItem(donorPhotoCacheKey(donorId)) || "") : ""; } catch (_) { return ""; } }
    function saveCachedDonorPhoto(donorId,dataUrl) { if(!donorId||!dataUrl)return; try{localStorage.setItem(donorPhotoCacheKey(donorId),dataUrl);}catch(_){}}

    /* =========================================================
       DONOR PHOTO PREVIEW
       ========================================================= */

    function showRegistrationSuccessCelebration(donorId) {
      const modal = document.getElementById("registrationSuccessCelebration");
      const idEl = document.getElementById("successCelebrationDonorId");
      const confetti = document.getElementById("successConfetti");
      if (!modal) return;
      if (idEl) { idEl.hidden = !donorId; idEl.textContent = donorId ? `Donor ID: ${donorId}` : ""; }
      if (confetti) {
        confetti.innerHTML = "";
        for (let i=0;i<28;i++) {
          const piece=document.createElement("i");
          piece.style.left=(Math.random()*100)+"%";
          piece.style.setProperty("--x",((Math.random()-.5)*180)+"px");
          piece.style.animationDelay=(Math.random()*.35)+"s";
          piece.style.transform=`rotate(${Math.random()*180}deg)`;
          confetti.appendChild(piece);
        }
      }
      modal.classList.add("show"); modal.setAttribute("aria-hidden","false");
      setTimeout(()=>{ modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); }, 1800);
    }

    document.getElementById("donorPhotoFile")?.addEventListener("change", function() {
      const preview = document.getElementById("donorPhotoPreview");
      const img = document.getElementById("donorPhotoPreviewImage");
      const file = this.files?.[0];
      if (!preview || !img) return;
      if (!file) {
        preview.hidden = true;
        img.removeAttribute("src");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        preview.hidden = false;
        preview.classList.add("error");
        img.removeAttribute("src");
        preview.querySelector("span").textContent = "Photo is larger than 5 MB.";
        return;
      }
      preview.classList.remove("error");
      img.src = URL.createObjectURL(file);
      preview.querySelector("span").textContent = "Photo ready for ID card";
      preview.hidden = false;
    });


    window.__NEW_DONOR_ID_CARD_BLOB = null;
    window.__NEW_DONOR_ID_CARD_FILE = null;
    window.__ADMIN_DONOR_PAGE = 1;

    /* =========================================================
       DONOR REGISTRATION
       ========================================================= */

    document
      .getElementById("donorForm")
      .addEventListener(
        "submit",
        async function(event) {

          event.preventDefault();


          const form =
            event.target;

          const message =
            document.getElementById(
              "donorMessage"
            );

          if (!form.checkValidity()) {
            form.reportValidity();
            message.className = "form-message error";
            message.textContent = "Please complete all mandatory fields before submitting.";
            return;
          }


          const data =
            Object.fromEntries(
              new FormData(form)
            );

          // Store the donor's preferred card language. If Tamil text is entered,
          // the ID card is automatically generated in Tamil even when the app
          // selector is currently English.
          data.Language = (typeof detectPNBDCTamilObject === "function" && detectPNBDCTamilObject(data)) ? "ta" : getAppLanguage();

          // The photo file is uploaded separately; the resulting URL is stored with the donor record.
          delete data.Donor_Photo_File;

          const lastDateEl = document.getElementById("donorLastDonationDate");
          const newDonorNA = document.getElementById("newDonorNA");
          const lastDonationDate = String(lastDateEl?.value || "").trim();

          if (!lastDonationDate && !newDonorNA?.checked) {
            message.className = "form-message error";
            message.textContent = "Last donation date is required, or select NA for a new donor.";
            lastDateEl?.focus();
            return;
          }

          data.Last_Donation_Date = newDonorNA?.checked ? "NA" : lastDonationDate;
          data.lastDonationDate = data.Last_Donation_Date;

          const donorName = String(
            data.Name ||
            data.name ||
            data.Donor_Name ||
            data.DonorName ||
            ""
          ).trim();

          if (!donorName) {
            message.className = "form-message error";
            message.textContent = "Donor name is required.";
            form.elements.namedItem("Name")?.focus();
            return;
          }

          data.Name = donorName;
          data.name = donorName;
          data.Donor_Name = donorName;
          data.DonorName = donorName;

          const alternateMobile = String(data.Alternate_Mobile || data.alternateMobile || "").replace(/\D/g, "").trim();
          if (alternateMobile && !/^[6-9]\d{9}$/.test(alternateMobile)) {
            message.className = "form-message error";
            message.textContent = "Enter a valid 10-digit alternate mobile number.";
            form.elements.namedItem("Alternate_Mobile")?.focus();
            return;
          }
          data.Alternate_Mobile = alternateMobile;
          data.alternateMobile = alternateMobile;


          try {

            message.className =
              "form-message success";

            message.textContent =
              "Submitting your registration...";

            const photoFile = document.getElementById("donorPhotoFile")?.files?.[0];
            if (photoFile) {
              if (photoFile.size > 5 * 1024 * 1024) {
                throw new Error("Donor photo is too large. Maximum size is 5 MB.");
              }
              if (!["image/jpeg","image/png","image/webp"].includes(photoFile.type)) {
                throw new Error("Please upload a JPG, PNG or WEBP donor photo.");
              }
              message.textContent = "Uploading donor photo...";
              const localPhotoDataUrl = await makeDonorPhotoDataUrl(photoFile);
              __pendingDonorPhotoDataUrl = localPhotoDataUrl;
              const base64 = localPhotoDataUrl.split(",")[1] || "";
              const upload = await BloodDonationAPI.uploadDonorRegistrationPhoto({
                base64, mimeType: "image/jpeg", fileName: photoFile.name.replace(/\.[^.]+$/, "") + ".jpg"
              });
              if (!upload || upload.success === false) throw new Error(upload?.error || "Donor photo upload failed.");
              data.photoUrl = upload.imageUrl || "";
              data.Photo_URL = data.photoUrl;
              data.photoFileId = upload.fileId || upload.fileID || "";
            }

            const registrationResult = await BloodDonationAPI.registerDonor(data);
            if (registrationResult && registrationResult.success === false) throw new Error(registrationResult.error || "Registration failed.");

            // Duplicate registration: nothing is saved. Show the existing donor
            // record and prepare that donor's existing ID card for download.
            if (registrationResult?.duplicate && registrationResult?.existingDonor) {
              __pendingDonorPhotoDataUrl = "";
              const existingDonor = registrationResult.existingDonor;
              existingDonor.Language = (typeof detectPNBDCTamilObject === "function" && detectPNBDCTamilObject(existingDonor)) ? "ta" : (existingDonor.Language || getAppLanguage());
              const existingId = String(existingDonor.Donor_ID || existingDonor.donorId || registrationResult.donorId || "").trim();
              message.className = "form-message error";
              message.textContent = `⚠️ Data already registered/updated. Existing Donor ID: ${existingId || "—"}`;

              const idAction = document.getElementById("newDonorIdCardAction");
              const idStatus = document.getElementById("newDonorIdCardStatus");
              if (idAction) idAction.style.display = "block";
              if (idStatus) {
                idStatus.className = "form-message success";
                idStatus.textContent = "⏳ Existing donor found. Preparing the existing ID card…";
              }
              window.__NEW_DONOR_ID_CARD_BLOB = null;
              window.__NEW_DONOR_ID_CARD_FILE = null;
              try {
                const idBlob = await createProfessionalDonorIdCard(existingDonor);
                const safeName = String(existingDonor.Name || existingDonor.name || "Donor")
                  .replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Donor";
                window.__NEW_DONOR_ID_CARD_BLOB = idBlob;
                window.__NEW_DONOR_ID_CARD_FILE = new File([idBlob], `${safeName}_Donor_ID_Card.png`, { type: "image/png" });
                if (idStatus) {
                  idStatus.className = "form-message success";
                  idStatus.textContent = `✓ Existing donor ID card is ready — ${existingId || "Donor"}.`;
                }
              } catch (cardError) {
                console.error("Existing donor ID card error:", cardError);
                if (idStatus) {
                  idStatus.className = "form-message error";
                  idStatus.textContent = "Existing donor found, but the ID card could not be prepared. Please try again.";
                }
              }
              form.elements.namedItem("Name")?.focus();
              return;
            }

            const registeredDonorId = registrationResult?.donorId || registrationResult?.Donor_ID || "";
            if (registeredDonorId && __pendingDonorPhotoDataUrl) saveCachedDonorPhoto(registeredDonorId, __pendingDonorPhotoDataUrl);
            __pendingDonorPhotoDataUrl = "";

            const newlyRegisteredDonor = {
              ...data,
              Donor_ID: registeredDonorId,
              donorId: registeredDonorId,
              Photo_URL: data.Photo_URL || data.photoUrl || "",
              photoUrl: data.photoUrl || data.Photo_URL || "",
              Language: data.Language || getAppLanguage()
            };

            // Prepare the ID card immediately after the donor is saved.
            // No popup is used; a download button appears below the Save button.
            const idAction = document.getElementById("newDonorIdCardAction");
            const idStatus = document.getElementById("newDonorIdCardStatus");
            if (idAction) idAction.style.display = "block";
            if (idStatus) {
              idStatus.className = "form-message success";
              idStatus.textContent = "⏳ Preparing your donor ID card…";
            }
            window.__NEW_DONOR_ID_CARD_BLOB = null;
            window.__NEW_DONOR_ID_CARD_FILE = null;

            try {
              const idBlob = await createProfessionalDonorIdCard(newlyRegisteredDonor);
              const safeName = String(newlyRegisteredDonor.Name || "Donor")
                .replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Donor";
              window.__NEW_DONOR_ID_CARD_BLOB = idBlob;
              window.__NEW_DONOR_ID_CARD_FILE = new File([idBlob], `${safeName}_Donor_ID_Card.png`, { type: "image/png" });
              if (idStatus) {
                idStatus.className = "form-message success";
                idStatus.textContent = "✓ Registration saved. ID Card is ready to download.";
                showRegistrationSuccessCelebration(registeredDonorId);
              }
            } catch (cardError) {
              console.error("New donor ID card error:", cardError);
              if (idStatus) {
                idStatus.className = "form-message error";
                idStatus.textContent = "✓ Registration saved, but ID Card could not be prepared. Please try again.";
              }
            }

            form.reset();
            document.getElementById("donorPhotoPreview")?.setAttribute("hidden", "hidden");
            await Promise.all([loadDashboard(), loadBloodGroups()]);
            return;


            message.className =
              "form-message success";

            message.textContent =
              "Registration successful. Thank you for becoming a donor!";


            toast("Donor registration successful ❤️");

          } catch (error) {

            console.error(error);


            message.className =
              "form-message error";

            message.textContent =
              error.message ||
              "Unable to register donor.";

          }

        }
      );


    async function downloadNewDonorIdCard() {
      const blob = window.__NEW_DONOR_ID_CARD_BLOB;
      const file = window.__NEW_DONOR_ID_CARD_FILE;
      if (!blob || !file) {
        toast("ID Card is still preparing. Please wait a moment and try again.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("Donor ID Card downloaded successfully.");
    }

    /* =========================================================
       SEARCH DONORS
       ========================================================= */

    async function searchDonors() {

      const container =
        document.getElementById(
          "donorResults"
        );


      const bloodGroup =
        document.getElementById(
          "searchBloodGroup"
        ).value;


      const district =
        document.getElementById(
          "searchDistrict"
        ).value;


      const city =
        document.getElementById(
          "searchCity"
        ).value;


      container.innerHTML = `

        <div
          class="loading"
          style="grid-column:1/-1"
        >
          <span class="spinner"></span>
          Searching donors...
        </div>

      `;


      try {

        const donors =
          await BloodDonationAPI.searchDonors({

            bloodGroup,
            district,
            city

          });


        if (!donors.length) {

          container.innerHTML = `

            <div
              class="empty-events"
              style="grid-column:1/-1"
            >

              🔎

              <br><br>

              No available donors found
              for your search.

            </div>

          `;

          return;

        }


        container.innerHTML =
          donors
            .map(renderDonor)
            .join("");

      } catch (error) {

        console.error(error);


        container.innerHTML = `

          <div
            class="empty-events"
            style="grid-column:1/-1"
          >

            Unable to search donors.
            Please try again.

          </div>

        `;

      }

    }


    function maskMobile(mobile) {
      const digits = String(mobile || "").replace(/\D/g, "");
      if (!digits) return "";
      if (digits.length <= 4) return "X".repeat(Math.max(0, digits.length - 1)) + digits.slice(-1);
      return "X".repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
    }

    function renderDonor(donor) {

      const name =
        value(
          donor,
          "Name",
          "name"
        ) ||
        "Blood Donor";


      const group =
        value(
          donor,
          "Blood_Group",
          "bloodGroup",
          "BloodGroup"
        ) ||
        "—";


      const mobile =
        value(
          donor,
          "Mobile",
          "mobile",
          "Phone"
        );

      const maskedMobile = maskMobile(mobile);

      const referredBy = value(
        donor,
        "Referred_By",
        "referredBy",
        "ReferredBy"
      );


      const district =
        value(
          donor,
          "District",
          "district"
        );


      const city =
        value(
          donor,
          "City",
          "city"
        );


      const eligibility =
        donor.eligibility || {};


      const initials =
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map(word =>
            word.charAt(0)
          )
          .join("")
          .toUpperCase();


      return `

        <article class="donor-card">

          <div class="donor-head">

            <div class="donor-avatar">
              ${escapeHtml(initials)}
            </div>

            <div>

              <div class="donor-name">
                ${escapeHtml(name)}
              </div>

              <div class="donor-group">
                🩸 ${escapeHtml(group)}
              </div>

            </div>

          </div>


          <div class="donor-details">

            ${
              mobile
              ? `
                <div>
                  📞 ${escapeHtml(maskedMobile)}
                </div>
              `
              : ""
            }


            ${
              district || city
              ? `
                <div>
                  📍
                  ${escapeHtml(
                    [city, district]
                      .filter(Boolean)
                      .join(", ")
                  )}
                </div>
              `
              : ""
            }

            ${
              referredBy
              ? `
                <div>
                  👤 Referred by: ${escapeHtml(referredBy)}
                </div>
              `
              : ""
            }

          </div>


          <div
            class="eligibility ${escapeAttribute(
              eligibility.className || "unknown"
            )}"
          >

            ${
              escapeHtml(
                eligibility.status ||
                "Eligibility unknown"
              )
            }

          </div>

        </article>

      `;

    }


    /* =========================================================
       BLOOD REQUEST
       ========================================================= */

    document
      .getElementById("requestForm")
      .addEventListener(
        "submit",
        async function(event) {

          event.preventDefault();


          const form =
            event.target;

          const message =
            document.getElementById(
              "requestMessage"
            );

          if (!form.checkValidity()) {
            form.reportValidity();
            message.className = "form-message error";
            message.textContent = "Please complete all mandatory fields before submitting.";
            return;
          }


          const data =
            Object.fromEntries(
              new FormData(form)
            );

          const patientName = String(
            data.Patient_Name ||
            data.PatientName ||
            data.Name ||
            data.name ||
            ""
          ).trim();

          if (!patientName) {
            message.className = "form-message error";
            message.textContent = "Patient name is required.";
            form.elements.namedItem("Patient_Name")?.focus();
            return;
          }

          data.Patient_Name = patientName;
          data.PatientName = patientName;
          data.Name = patientName;
          data.name = patientName;

          const unitsRequired = String(
            data.Units_Required ||
            data.unitsRequired ||
            data.Units ||
            ""
          ).trim();

          if (!unitsRequired || Number(unitsRequired) < 1) {
            message.className = "form-message error";
            message.textContent = "Please enter the number of blood units required.";
            form.elements.namedItem("Units_Required")?.focus();
            return;
          }

          data.Units_Required = unitsRequired;
          data.unitsRequired = unitsRequired;


          try {

            message.className =
              "form-message success";

            message.textContent =
              "Submitting your blood request...";


            await BloodDonationAPI.createBloodRequest(
              data
            );


            message.className =
              "form-message success";

            message.textContent =
              "Blood request submitted successfully. Our network can now respond.";


            form.reset();


            await loadDashboard();


            setAppNotification(
              "New Blood Request",
              `${data.Patient_Name || data.patientName || "A patient"} needs ${data.Blood_Group || data.bloodGroup || "blood"} at ${data.Hospital || data.hospital || "the hospital"}.`,
              "🚨"
            );

            await loadNotifications();

            toast(
              "Blood request submitted 🚨"
            );

          } catch (error) {

            console.error(error);


            message.className =
              "form-message error";

            message.textContent =
              error.message ||
              "Unable to submit blood request.";

          }

        }
      );



    /* =========================================================
       MOBILE MENU
       ========================================================= */

    function toggleMobileMenu() {
      const menu = document.getElementById("mobileMenu");
      if (!menu) return;

      const isOpen = menu.classList.toggle("show");
      menu.setAttribute("aria-hidden", String(!isOpen));
    }

    function closeMobileMenu() {
      const menu = document.getElementById("mobileMenu");
      if (!menu) return;

      menu.classList.remove("show");
      menu.setAttribute("aria-hidden", "true");
    }

    /* =========================================================
       NOTIFICATIONS
       Added without changing existing application logic.
       ========================================================= */

    let APP_NOTIFICATIONS = [];

    async function loadNotifications() {
      try {
        const result = await BloodDonationAPI.getNotifications("");
        const list = Array.isArray(result)
          ? result
          : (result?.notifications || result?.data || result?.result || []);
        APP_NOTIFICATIONS = Array.isArray(list) ? list : [];
        renderNotifications();
        updateNotificationBadges();
      } catch (error) {
        console.warn("Notifications API:", error);
        APP_NOTIFICATIONS = [];
        renderNotifications();
        updateNotificationBadges();
      }
    }

    function updateNotificationBadges() {
      const unread = APP_NOTIFICATIONS.filter(n =>
        String(n.readStatus || n.Read_Status || "Unread").toLowerCase() !== "read"
      ).length;
      ["notificationBadge", "notificationBadgeMobile"].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.textContent = String(unread);
        badge.style.display = unread > 0 ? "inline-flex" : "none";
      });
    }

    async function openNotifications() {
      const modal = document.getElementById("notificationModal");
      if (!modal) return;
      modal.classList.add("show");
      updateNotificationPermissionUI("Notification" in window ? Notification.permission : "unsupported");
      const list = document.getElementById("notificationList");
      if (list) list.innerHTML = `
        <div class="notification-empty">
          <div class="notification-empty-icon">⏳</div>
          <strong>Loading notifications…</strong>
          <p>Please wait.</p>
        </div>`;
      await loadNotifications();
    }

    function closeNotifications() {
      const modal = document.getElementById("notificationModal");
      if (modal) modal.classList.remove("show");
    }

    function closeNotificationsOutside(event) {
      if (event.target.id === "notificationModal") closeNotifications();
    }

    function renderNotifications() {
      const list = document.getElementById("notificationList");
      if (!list) return;
      const adminControls = adminIsLoggedIn() ? `
        <div class="notification-admin-actions">
          <button type="button" class="admin-small-btn" onclick="clearAllNotifications()">Clear all</button>
        </div>` : "";
      if (!APP_NOTIFICATIONS.length) {
        list.innerHTML = adminControls + `
          <div class="notification-empty">
            <div class="notification-empty-icon">🔔</div>
            <strong>No notifications yet</strong>
            <p>New donors, blood requests and events will appear here.</p>
          </div>`;
        return;
      }
      list.innerHTML = adminControls + APP_NOTIFICATIONS.map(item => {
        const type = item.type || item.Type || "General";
        const icon = type === "Blood Request" ? "🚨" : type === "Event" ? "📅" : "🩸";
        const id = item.notificationId || item.Notification_ID || item.id || "";
        const deleteButton = adminIsLoggedIn() && id ? `<button type="button" class="notification-delete-btn" onclick="deleteOneNotification('${escapeAttribute(id)}')" aria-label="Remove notification">×</button>` : "";
        const isRead = String(item.readStatus || item.Read_Status || "Unread").toLowerCase() === "read";
        const readClass = isRead ? "read" : "unread";
        const clickAction = id ? `onclick="markNotificationAsRead('${escapeAttribute(id)}')" role="button" tabindex="0"` : "";
        return `
          <div class="notification-item ${readClass}" ${clickAction}>
            <div class="notification-item-icon">${icon}</div>
            <div class="notification-item-content">
              <strong>${escapeHtml(item.title || item.Title || "Notification")}</strong>
              <p>${escapeHtml(item.message || item.Message || "")}</p>
              <small>${escapeHtml(item.createdDate || item.Created_Date || "")}</small>
              <div class="notification-status">${isRead ? "✓ Read" : "● New — tap to mark as read"}</div>
            </div>
            ${deleteButton}
          </div>`;
      }).join("");
    }

    document.addEventListener("keydown", function(event) {
      const item = event.target?.closest?.(".notification-item[role='button']");
      if (item && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); item.click(); }
    });

    async function deleteOneNotification(notificationId) {
      if (!adminIsLoggedIn() || !notificationId) return;
      if (!confirm("Remove this notification?")) return;
      try {
        await BloodDonationAPI.deleteNotification(notificationId, getAdminUserId());
        await loadNotifications();
        toast("Notification removed.");
      } catch (error) { toast(error?.message || "Unable to remove notification."); }
    }

    async function clearAllNotifications() {
      if (!adminIsLoggedIn()) return;
      if (!confirm("Remove all notifications?")) return;
      try {
        await BloodDonationAPI.clearNotifications(getAdminUserId());
        APP_NOTIFICATIONS = [];
        lastNotificationIds = new Set();
        renderNotifications();
        updateNotificationBadges();
        toast("All notifications removed.");
      } catch (error) { toast(error?.message || "Unable to clear notifications."); }
    }

    function setAppNotification(title, message, icon = "🔔") {
      APP_NOTIFICATIONS.unshift({
        title, message, type: "General", readStatus: "Unread", icon,
        createdDate: new Date().toISOString()
      });
      renderNotifications();
      updateNotificationBadges();
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
      }[c]));
    }

    /* =========================================================
       ADMIN LOGIN
       ========================================================= */

    function openAdmin() {

      document
        .getElementById(
          "adminModal"
        )
        .classList.add("show");

    }


    function closeAdmin() {

      document
        .getElementById(
          "adminModal"
        )
        .classList.remove("show");

    }


    function closeAdminOutside(event) {

      if (
        event.target.id ===
        "adminModal"
      ) {
        closeAdmin();
      }

    }


    document.getElementById("adminForm").addEventListener("submit", async function(event) {
      event.preventDefault();

      const usernameEl = document.getElementById("adminUsername");
      const passwordEl = document.getElementById("adminPassword");
      const message = document.getElementById("adminMessage");
      const submit = this.querySelector(".admin-login-submit");

      const username = usernameEl.value.trim();
      const password = passwordEl.value;

      if (!username || !password) {
        message.className = "form-message error";
        message.textContent = "Please enter both username and password.";
        if (!username) usernameEl.focus();
        else passwordEl.focus();
        return;
      }

      try {
        submit.disabled = true;
        submit.textContent = "Checking login...";
        message.className = "form-message success";
        message.textContent = "Checking login...";

        if (!window.BloodDonationAPI || typeof BloodDonationAPI.login !== "function") {
          throw new Error("Login service is not available. Please check app.js.");
        }

        const result = await BloodDonationAPI.login(username, password);
        const user = result?.user || result?.data || result;

        if (result?.success === false) {
          throw new Error(result.error || "Invalid username or password.");
        }

        BloodDonationAPI.setAdminSession(user);
        message.className = "form-message success";
        message.textContent = "Login successful.";
        toast("Admin login successful.");

        setTimeout(async () => {
          closeAdmin();
          closeMobileMenu();
          submit.disabled = false;
          submit.textContent = "🔐 Login as Admin";
          goTo("admin");
          await loadAdminDashboard();
          adminJumpTo("donors");
        }, 450);

      } catch (error) {
        console.error(error);
        message.className = "form-message error";
        message.textContent = error?.message || "Invalid username or password.";
        submit.disabled = false;
        submit.textContent = "🔐 Login as Admin";
      }
    });


    /* =========================================================
       ESCAPE HTML
       ========================================================= */

    function escapeHtml(value) {

      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    }


    function escapeAttribute(value) {
      return escapeHtml(value);
    }



    /* =========================================================
       ADMIN SETTINGS / BRANDING
       ========================================================= */

    let APP_SETTINGS = {};

    function applySiteSettings(settings) {
      APP_SETTINGS = settings || {};
      const get = (key, fallback = "") => String(APP_SETTINGS[key] ?? fallback).trim();
      const club = get("Organization Name", "Poongurichi Nanbargal");
      const subtitle = get("Header Subtitle", "Poongurichi Nanbargal Blood Donor's Club");
      const logoUrl = get("Logo URL", "");
      const developer = get("Developer Name", "Bothishankar.Natarajan");
      const developerPhone = get("Developer Contact", "9677824319");
      const c1n = get("Blood Need Contact 1 Name", "Ragubathi");
      const c1p = get("Blood Need Contact 1 Phone", "7402591727");
      const c2n = get("Blood Need Contact 2 Name", "Dhanavenkadesh");
      const c2p = get("Blood Need Contact 2 Phone", "9585559593");
      const setText = (id, text) => { const el=document.getElementById(id); if(el) el.textContent=text; };
      setText("headerClubName", "Poongurichi Nanbargal");
      setText("headerSubtitle", "Poongurichi Nanbargal Blood Donor's Club");
      const logo = document.querySelector(".brand-logo");
      if (logoUrl && logo) { logo.src = logoUrl; }
      setText("footerClubName", "Poongurichi Nanbargal Donor's Club");
      setText("footerDescription", get("Footer Description", "One donation. Many lives."));
      setText("footerDeveloperName", developer);
      const phone = document.getElementById("footerDeveloperPhone");
      if (phone) { phone.textContent = developerPhone; phone.href = "tel:" + developerPhone.replace(/\D/g, ""); }
      const copyright = document.getElementById("footerCopyright");
      if (copyright) copyright.textContent = get("Footer Text", club + " Donor's Club. All rights reserved.");
      const contacts = document.getElementById("footerBloodContacts");
      if (contacts) {
        contacts.innerHTML = `
          <a class="footer-call-btn" href="tel:${escapeAttribute(c1p.replace(/\D/g,''))}">☎ ${escapeHtml(c1n)} <span>${escapeHtml(c1p)}</span></a>
          <a class="footer-call-btn" href="tel:${escapeAttribute(c2p.replace(/\D/g,''))}">☎ ${escapeHtml(c2n)} <span>${escapeHtml(c2p)}</span></a>`;
      }
      const social = document.getElementById("footerSocialLinks");
      if (social) {
        const links = [["Instagram URL","Instagram"],["Facebook URL","Facebook"],["YouTube URL","YouTube"],["Gmail URL","Gmail"]]
          .map(([k,label]) => ({label,url:get(k)})).filter(x=>x.url);
        social.innerHTML = links.map(x=>`<a href="${escapeAttribute(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.label)}</a>`).join("");
      }
    }

    async function loadSiteSettings() {
      try {
        const result = await BloodDonationAPI.getSettings();
        const settings = result?.settings || result?.data || result || {};
        applySiteSettings(settings);
      } catch (error) {
        console.warn("Settings:", error);
      }
    }

    async function loadAdminSettings() {
      if (!ensureAdminAccess()) return;
      const form = document.getElementById("adminSettingsForm");
      if (!form) return;
      try {
        const result = await BloodDonationAPI.getSettings();
        const settings = result?.settings || result?.data || result || {};
        form.querySelectorAll("[data-setting]").forEach(input => {
          input.value = String(settings[input.dataset.setting] ?? "");
        });
      } catch (error) { console.error("Admin settings load:", error); }
    }

    let adminSettingsMode = "fields";

    function setAdminSettingsMode(mode = "fields") {
      adminSettingsMode = mode === "social" ? "social" : "fields";
      const form = document.getElementById("adminSettingsForm");
      if (!form) return;
      form.querySelectorAll("[data-settings-group]").forEach(label => {
        // Fields tab shows every editable website field. Social Links tab shows only social URLs.
        label.hidden = adminSettingsMode === "social" && label.dataset.settingsGroup !== "social";
      });
      const submit = form.querySelector("button[type=submit]");
      if (submit) submit.textContent = adminSettingsMode === "social" ? "💾 Save Social Links" : "💾 Save Website Fields";
      const message = document.getElementById("adminSettingsMessage");
      if (message) message.textContent = "";
    }

    document.getElementById("adminSettingsForm")?.addEventListener("submit", async function(event) {
      event.preventDefault();
      if (!ensureAdminAccess()) return;
      const message = document.getElementById("adminSettingsMessage");
      const submit = this.querySelector("button[type=submit]");
      try {
        submit.disabled = true;
        const inputs = adminSettingsMode === "social"
          ? [...this.querySelectorAll('[data-settings-group="social"] [data-setting]')]
          : [...this.querySelectorAll("[data-setting]")];
        for (const input of inputs) {
          await BloodDonationAPI.saveSetting(input.dataset.setting, input.value.trim(), getAdminUserId());
        }
        await loadSiteSettings();
        message.className = "form-message success";
        message.textContent = adminSettingsMode === "social" ? "Social links saved successfully." : "Website fields saved successfully.";
        submit.textContent = "✓ Saved Successfully";
        toast(adminSettingsMode === "social" ? "Social links updated." : "Website fields updated.");
        setTimeout(() => {
          if (submit && !submit.disabled) {
            submit.textContent = adminSettingsMode === "social" ? "💾 Save Social Links" : "💾 Save Website Fields";
          }
        }, 2500);
      } catch (error) {
        message.className = "form-message error";
        message.textContent = error?.message || "Unable to save settings.";
      } finally { submit.disabled = false; }
    });

    setAdminSettingsMode("fields");

    /* =========================================================
       ADMIN DONOR DETAILS + IMAGE SHARE
       ========================================================= */
    function dateOnly(valueToFormat) {
      const raw = String(valueToFormat ?? "").trim();
      if (!raw) return "—";
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) { const parts = raw.slice(0, 10).split("-"); return `${parts[2]}-${parts[1]}-${parts[0]}`; }
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${dd}-${mm}-${yyyy}`;
      }
      return raw.split(" ")[0] || "—";
    }

    let currentAdminDonor = null;

    function openAdminDonorDetails(donorId) {
      if (!ensureAdminAccess()) return;
      const donors = window.__ADMIN_DONORS || [];
      const donor = donors.find(d => String(value(d,"Donor_ID","donorId","DonorID","ID","id")) === String(donorId));
      if (!donor) return toast("Donor details not found.");
      currentAdminDonor = donor;
      const card = document.getElementById("adminDonorDetailsCard");
      const rows = [
        ["Full Name", value(donor,"Name","name")],
        ["Blood Group", value(donor,"Blood_Group","bloodGroup","BloodGroup")],
        ["Date of Birth", dateOnly(value(donor,"DOB","dob"))],
        ["Gender", value(donor,"Gender","gender")],
        ["Mobile Number", value(donor,"Mobile","mobile","Phone")],
        ["Email", value(donor,"Email","email")],
        ["District", value(donor,"District","district")],
        ["Town/Village", value(donor,"City","city")],
        ["Address", value(donor,"Address","address")],
        ["Last Donation Date", value(donor,"Last_Donation_Date","lastDonationDate")],
        ["Aadhaar Number", value(donor,"Aadhaar_Number","aadhaarNumber")],
        ["Referred By", value(donor,"Referred_By","referredBy")],
        ["Registered On", value(donor,"Registration_Date","registrationDate")]
      ];
      const donorIdForPhoto = String(value(donor,"Donor_ID","donorId","DonorID","ID","id") || "").trim();
      const donorPhotoUrl = String(value(donor,"Photo_URL","photoUrl","PhotoURL","photoURL","Photo_Url") || "").trim();
      const cachedPhoto = getCachedDonorPhoto(donorIdForPhoto);
      const detailPhotoSrc = cachedPhoto || donorPhotoUrl;
      const photoHtml = detailPhotoSrc ? `<img class="admin-donor-detail-photo" src="${escapeAttribute(detailPhotoSrc)}" alt="${escapeAttribute(value(donor,"Name","name") || "Donor photo")}">` : `<div class="donor-avatar">${escapeHtml(String(value(donor,"Name","name")||"D").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase())}</div>`;
      card.innerHTML = `<div class="admin-donor-detail-head">${photoHtml}<div><h3>${escapeHtml(value(donor,"Name","name")||"Donor")}</h3><span>${escapeHtml(value(donor,"Blood_Group","bloodGroup")||"—")}</span></div></div><div class="admin-donor-detail-list">${rows.map(r=>`<div><strong>${escapeHtml(r[0])}</strong><span>${escapeHtml(r[1]||"—")}</span></div>`).join("")}</div>`;
      card.insertAdjacentHTML("beforeend", `<div class="admin-detail-note">🔒 All donor details are visible only to Admin.</div>`);
      document.getElementById("adminDonorDetailsModal").classList.add("show");
    }

    function closeAdminDonorDetails() { document.getElementById("adminDonorDetailsModal")?.classList.remove("show"); }
    function closeAdminDonorDetailsOutside(event) { if(event.target.id === "adminDonorDetailsModal") closeAdminDonorDetails(); }

    async function createDonorShareImage(donor) {
      const donorName = String(value(donor,"Name","name") || "Donor").trim();
      const bloodGroup = String(value(donor,"Blood_Group","bloodGroup","BloodGroup") || "—").trim();
      const mobile = String(value(donor,"Mobile","mobile","Phone") || "—").trim();
      const district = String(value(donor,"District","district") || "—").trim();
      const city = String(value(donor,"City","city") || "—").trim();
      const address = String(value(donor,"Address","address") || "—").trim();
      const lastDonation = String(value(donor,"Last_Donation_Date","lastDonationDate") || "—").trim();

      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser cannot create the donor image.");

      const roundRect = (x,y,w,h,r,fill,stroke,sw=1) => {
        ctx.beginPath();
        ctx.roundRect(x,y,w,h,r);
        if (fill) { ctx.fillStyle=fill; ctx.fill(); }
        if (stroke) { ctx.lineWidth=sw; ctx.strokeStyle=stroke; ctx.stroke(); }
      };
      const wrap = (text, maxWidth, font) => {
        ctx.font = font;
        const words = String(text || "—").split(/\s+/);
        const lines=[]; let line="";
        for (const word of words) {
          const test=line ? line+" "+word : word;
          if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line=word; }
          else line=test;
        }
        if(line) lines.push(line);
        return lines.slice(0,4);
      };

      ctx.fillStyle="#f4f7fb"; ctx.fillRect(0,0,1080,1350);
      roundRect(35,35,1010,1280,42,"#ffffff","#d7e2ef",4);
      roundRect(35,35,1010,235,42,"#eef6ff",null);

      // Load the supplied Poongurichi Nanbargal logo directly onto the canvas.
      try {
        const logo = new Image();
        logo.src = new URL("icons/poongurichi-logo.jpeg", document.baseURI).href;
        await new Promise((resolve,reject)=>{ logo.onload=resolve; logo.onerror=reject; });
        ctx.save();
        ctx.beginPath(); ctx.arc(165,160,95,0,Math.PI*2); ctx.clip();
        ctx.drawImage(logo,70,65,190,190);
        ctx.restore();
      } catch (_) {
        ctx.fillStyle="#123b82"; ctx.beginPath(); ctx.arc(165,160,90,0,Math.PI*2); ctx.fill();
        ctx.fillStyle="#fff"; ctx.font="700 32px Arial"; ctx.textAlign="center"; ctx.fillText("PN",165,172);
      }

      ctx.textAlign="left";
      ctx.fillStyle="#123b82"; ctx.font="700 39px Arial"; ctx.fillText("Poongurichi Nanbargal",300,120);
      ctx.fillStyle="#5f7087"; ctx.font="27px Arial"; ctx.fillText("Blood Donor's Club",300,168);
      roundRect(300,195,255,55,27,"#d9273f",null);
      ctx.fillStyle="#fff"; ctx.font="700 28px Arial"; ctx.textAlign="center"; ctx.fillText("BLOOD DONOR",427,232);

      ctx.textAlign="left"; ctx.fillStyle="#123b82"; ctx.font="700 43px Arial"; ctx.fillText("Donor Details",110,350);
      ctx.fillStyle="#172033"; ctx.font="700 38px Arial"; ctx.fillText(donorName,110,420);

      const rows=[
        ["BLOOD GROUP",bloodGroup], ["MOBILE NUMBER",mobile], ["CITY",city],
        ["DISTRICT",district], ["LAST DONATION",lastDonation]
      ];
      let y=505;
      for(const [label,val] of rows){
        ctx.fillStyle="#123b82"; ctx.font="700 27px Arial"; ctx.fillText(label,110,y);
        ctx.fillStyle="#172033"; ctx.font="29px Arial"; ctx.fillText(val,420,y);
        ctx.strokeStyle="#dbe4f0"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(110,y+22); ctx.lineTo(970,y+22); ctx.stroke();
        y+=82;
      }
      ctx.fillStyle="#123b82"; ctx.font="700 27px Arial"; ctx.fillText("ADDRESS",110,y+10);
      const addressLines=wrap(address,520,"27px Arial");
      ctx.fillStyle="#172033"; ctx.font="27px Arial";
      addressLines.forEach((line,i)=>ctx.fillText(line,420,y+10+i*42));

      roundRect(90,1200,900,75,25,"#eef6ff",null);
      ctx.textAlign="center"; ctx.fillStyle="#123b82"; ctx.font="700 25px Arial";
      ctx.fillText("Donate Blood • Save Life • Be a Hero",540,1232);
      ctx.fillStyle="#5f7087"; ctx.font="21px Arial";
      ctx.fillText("Poongurichi Nanbargal Blood Donors Club",540,1260);

      return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create PNG image.")),"image/png",1));
    }

    async function createProfessionalDonorIdCard(donor) {
      const name = String(value(donor,"Name","name") || "Donor").trim();
      const donorId = String(value(donor,"Donor_ID","donorId","DonorID","ID","id") || "—").trim();
      const blood = String(value(donor,"Blood_Group","bloodGroup","BloodGroup") || "—").trim();
      const mobile = String(value(donor,"Mobile","mobile","Phone") || "—").trim();
      const city = String(value(donor,"City","city") || "—").trim();
      const district = String(value(donor,"District","district") || "—").trim();
      const dob = dateOnly(value(donor,"DOB","dob"));
      const donorIdForPhoto = String(value(donor,"Donor_ID","donorId","DonorID","ID","id") || "").trim();
      const storedPhotoUrl = String(value(donor,"Photo_URL","photoUrl","PhotoURL","photoURL","Photo_Url") || "").trim();
      const cachedPhoto = getCachedDonorPhoto(donorIdForPhoto);
      let photoUrl = cachedPhoto || storedPhotoUrl;
      if (!cachedPhoto && storedPhotoUrl) {
        try {
          const serverPhoto = await Promise.race([
            BloodDonationAPI.getDonorPhotoData({ photoUrl: storedPhotoUrl }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("PHOTO_FETCH_TIMEOUT")), 25000))
          ]);
          if (serverPhoto && serverPhoto.success && serverPhoto.dataUrl) {
            photoUrl = serverPhoto.dataUrl;
            if (donorIdForPhoto) saveCachedDonorPhoto(donorIdForPhoto, photoUrl);
          }
        } catch (_) {}
      }

      const cardLang = (typeof getDonorCardLanguage === "function") ? getDonorCardLanguage(donor) : getAppLanguage();
      const ta = cardLang === "ta";
      const t = ta ? {
        club1:"பூங்குறிச்சி நண்பர்கள்",
        club2:"இரத்த தான நன்கொடையாளர்கள் சங்கம்",
        official:"அதிகாரப்பூர்வ நன்கொடையாளர் அடையாள அட்டை",
        photo:"நன்கொடையாளர் புகைப்படம்",
        blood:"இரத்த வகை",
        id:"நன்கொடையாளர் ID",
        mobile:"கைபேசி எண்",
        dob:"பிறந்த தேதி",
        location:"இடம்",
        footer:"இரத்த தானம் செய்வோம் • உயிரைக் காப்போம் • ஹீரோவாக இருப்போம்"
      } : {
        club1:"POONGURICHI NANBARGAL",
        club2:"BLOOD DONORS CLUB",
        official:"OFFICIAL DONOR ID CARD",
        photo:"DONOR PHOTO",
        blood:"BLOOD GROUP",
        id:"DONOR ID",
        mobile:"MOBILE",
        dob:"DATE OF BIRTH",
        location:"LOCATION",
        footer:"DONATE BLOOD • SAVE LIFE • BE A HERO"
      };

      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 760;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser cannot generate the ID card.");

      const rr = (x,y,w,h,r,fill,stroke,sw=1) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.lineWidth=sw;ctx.strokeStyle=stroke;ctx.stroke();} };
      const fontFamily = '"Noto Sans Tamil","Nirmala UI","Latha",Arial,sans-serif';
      const fitText = (text, maxWidth, startSize, weight=700) => {
        let size = startSize;
        while (size > 14) {
          ctx.font = `${weight} ${size}px ${fontFamily}`;
          if (ctx.measureText(String(text)).width <= maxWidth) break;
          size -= 1;
        }
        return size;
      };
      const logo = await loadImageSafe("icons/poongurichi-logo.jpeg");
      const photo = photoUrl ? await loadImageForCard(photoUrl) : null;

      ctx.fillStyle="#edf3fa"; ctx.fillRect(0,0,1200,760);
      rr(30,30,1140,700,34,"#ffffff","#cbd8e8",4);
      rr(30,30,1140,155,34,"#123b82",null);
      if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(120,108,62,0,Math.PI*2); ctx.clip(); ctx.drawImage(logo,58,46,124,124); ctx.restore(); }

      ctx.fillStyle="#ffffff";
      ctx.font=`800 ${ta ? 34 : 42}px ${fontFamily}`; ctx.fillText(t.club1,215,92);
      ctx.font=`500 ${ta ? 22 : 24}px ${fontFamily}`; ctx.fillText(t.club2,215,132);
      ctx.font=`700 ${ta ? 18 : 20}px ${fontFamily}`; ctx.textAlign="right"; ctx.fillText(t.official,1135,110); ctx.textAlign="left";

      rr(72,220,250,330,24,"#f3f7fc","#d7e2ef",2);
      if (photo) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(92,240,210,250,18); ctx.clip();
        const scale=Math.max(210/photo.width,250/photo.height); const w=photo.width*scale,h=photo.height*scale;
        ctx.drawImage(photo,197-w/2,365-h/2,w,h); ctx.restore();
      } else {
        ctx.fillStyle="#dce9f7"; ctx.fillRect(92,240,210,250);
        ctx.fillStyle="#123b82"; ctx.font=`700 70px ${fontFamily}`; ctx.textAlign="center"; ctx.fillText(name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase(),197,390); ctx.textAlign="left";
      }
      ctx.fillStyle="#5d6f84"; ctx.font=`600 ${ta ? 16 : 18}px ${fontFamily}`; ctx.textAlign="center"; ctx.fillText(t.photo,197,525); ctx.textAlign="left";

      ctx.fillStyle="#123b82";
      ctx.font=`800 ${fitText(name,680,38,800)}px ${fontFamily}`; ctx.fillText(name,365,260);
      rr(365,285,165,62,30,"#d9273f",null); ctx.fillStyle="#ffffff"; ctx.font=`800 32px ${fontFamily}`; ctx.textAlign="center"; ctx.fillText(blood,447,327); ctx.textAlign="left";
      ctx.fillStyle="#64748b"; ctx.font=`600 ${ta ? 16 : 18}px ${fontFamily}`; ctx.fillText(t.blood,550,325);

      const fields=[[t.id,donorId],[t.mobile,mobile],[t.dob,dob],[t.location,[city,district].filter(Boolean).join(", ") || "—"]];
      let fy=400;
      fields.forEach(([label,val])=>{
        ctx.fillStyle="#123b82"; ctx.font=`700 ${ta ? 16 : 18}px ${fontFamily}`; ctx.fillText(label,365,fy);
        ctx.fillStyle="#172033"; ctx.font=`600 ${fitText(String(val||"—"),500,25,600)}px ${fontFamily}`; ctx.fillText(String(val||"—"),565,fy);
        ctx.strokeStyle="#e1e8f0"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(365,fy+18); ctx.lineTo(1090,fy+18); ctx.stroke(); fy+=62;
      });

      rr(365,665,725,40,18,"#eef6ff",null); ctx.fillStyle="#123b82"; ctx.font=`700 ${ta ? 15 : 18}px ${fontFamily}`; ctx.textAlign="center"; ctx.fillText(t.footer,727,691); ctx.textAlign="left";
      return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create ID card PNG.")),"image/png",1));
    }

    async function loadImageSafe(src) {
      return await new Promise((resolve)=>{
        const img=new Image();
        img.crossOrigin="anonymous";
        img.onload=()=>resolve(img);
        img.onerror=()=>resolve(null);
        img.src=src;
      });
    }

    async function loadImageForCard(src) {
      if (!src) return null;
      const raw = String(src).trim();
      if (!raw) return null;

      // Local/cached data URLs are the most reliable source for canvas.
      if (raw.startsWith("data:image/")) return await loadImageSafe(raw);

      // Try the stored URL first.
      let img = await loadImageSafe(raw);
      if (img) return img;

      // Google Drive direct image variants.
      const driveId = raw.match(/[?&]id=([^&]+)/)?.[1] || raw.match(/\/d\/([^/]+)/)?.[1] || raw.match(/id=([^&]+)/)?.[1];
      const candidates = [];
      if (driveId) {
        candidates.push(
          `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1000`,
          `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveId)}`
        );
      }
      candidates.push(
        "https://images.weserv.nl/?url=" + encodeURIComponent(raw),
        "https://wsrv.nl/?url=" + encodeURIComponent(raw)
      );

      for (const candidate of candidates) {
        img = await loadImageSafe(candidate);
        if (img) return img;
      }
      return null;
    }

    async function generateAdminDonorIdCard() {
      if (!currentAdminDonor) return;
      const status = document.getElementById("idCardStatus");
      const setStatus = (text, type="success") => {
        if (!status) return;
        status.style.display = "block";
        status.className = "form-message " + type;
        status.textContent = text;
      };
      try {
        const donorIdForPhoto = String(value(currentAdminDonor,"Donor_ID","donorId","DonorID","ID","id") || "").trim();
        const storedPhotoUrl = String(value(currentAdminDonor,"Photo_URL","photoUrl","PhotoURL","photoURL","Photo_Url") || "").trim();
        const cachedPhoto = getCachedDonorPhoto(donorIdForPhoto);

        if (cachedPhoto || storedPhotoUrl) {
          setStatus("⏳ Loading donor photo… Please wait until the photo is ready.", "success");
        } else {
          setStatus("ℹ️ No donor photo uploaded. ID card will use initials.", "success");
        }

        // Give the server/browser enough time to fetch a Google Drive photo.
        // The photo fetch itself has a 25-second maximum; the ID card then continues.
        const blob = await Promise.race([
          createProfessionalDonorIdCard(currentAdminDonor),
          new Promise((_, reject) => setTimeout(() => reject(new Error("PHOTO_TIMEOUT")), 30000))
        ]).catch(async (error) => {
          if (error?.message !== "PHOTO_TIMEOUT") throw error;
          setStatus("⚠️ Photo took too long to load. Using initials. Preparing ID card…", "success");
          // Generate once more without blocking indefinitely; createProfessionalDonorIdCard
          // will still use a cached/local photo if available.
          return await createProfessionalDonorIdCard({ ...currentAdminDonor, Photo_URL: "" });
        });

        const name = String(value(currentAdminDonor,"Name","name") || "Donor").replace(/[^a-z0-9]+/gi,"_");
        const file = new File([blob], `${name || "Donor"}_ID_Card.png`, { type:"image/png" });

        setStatus("✓ Photo loaded. ID card is ready to download/share.", "success");
        await new Promise(resolve => setTimeout(resolve, 500));

        if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
          await navigator.share({ title:"Poongurichi Nanbargal Donor ID Card", text:"Official Blood Donor ID Card", files:[file] });
          return;
        }
        const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
        toast("Professional donor ID card generated.");
      } catch(error) {
        console.error(error);
        setStatus("Unable to generate the ID card. Please try again.", "error");
        toast(error?.message || "Unable to generate donor ID card.");
      }
    }

    async function shareAdminDonorDetails() {
      if (!currentAdminDonor) return;
      const donor = currentAdminDonor;
      const donorName = String(value(donor,"Name","name") || "Donor").trim();
      const safeName = donorName.replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"") || "Donor";
      const detailsText = [
        "Poongurichi Nanbargal Blood Donor Details",
        `Name: ${value(donor,"Name","name") || "—"}`,
        `Blood Group: ${value(donor,"Blood_Group","bloodGroup","BloodGroup") || "—"}`,
        `Mobile: ${value(donor,"Mobile","mobile","Phone") || "—"}`,
        `District: ${value(donor,"District","district") || "—"}`,
        `City: ${value(donor,"City","city") || "—"}`,
        `Address: ${value(donor,"Address","address") || "—"}`
      ].join("\n");

      try {
        toast("Creating donor PNG…");
        const pngBlob = await createDonorShareImage(donor);
        const file = new File([pngBlob], `${safeName}_Blood_Donor_Details.png`, {type:"image/png"});

        // Preferred path: native Android/iOS share sheet with the actual PNG file.
        if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
          await navigator.share({
            title:`Blood Donor Details - ${donorName}`,
            text:"Poongurichi Nanbargal Blood Donor Details",
            files:[file]
          });
          return;
        }

        // Some in-app browsers (including WhatsApp's browser) don't expose file sharing.
        // Open a simple share/download view instead of silently failing.
        const url = URL.createObjectURL(pngBlob);
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Share Donor Details</title><style>body{margin:0;background:#eef3f8;font-family:Arial;text-align:center;padding:20px;color:#123b82}img{max-width:100%;height:auto;border-radius:16px;box-shadow:0 8px 30px #0002}a,button{display:inline-block;margin:14px 6px;padding:14px 20px;border:0;border-radius:12px;background:#1261d8;color:#fff;font-weight:700;font-size:16px;text-decoration:none}p{color:#5f7087}

/* =========================================================
   PNBDC WHOLE-APP LANGUAGE SWITCHER
   ========================================================= */
.language-switcher{position:relative;display:flex;align-items:center;margin-left:4px}
.language-btn{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:inherit;border-radius:12px;padding:9px 12px;font:700 13px/1.1 inherit;cursor:pointer;white-space:nowrap;transition:.2s ease}
.language-btn:hover{background:rgba(255,255,255,.15);transform:translateY(-1px)}
.language-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:150px;padding:6px;background:#fff;border:1px solid #dbe4ef;border-radius:14px;box-shadow:0 16px 38px rgba(16,42,74,.18);display:none;z-index:9999}
.language-menu.show{display:block;animation:pnLangDrop .16s ease-out}
.language-menu button{display:block;width:100%;border:0;background:transparent;text-align:left;padding:11px 12px;border-radius:10px;color:#172033;font:700 14px/1.2 Arial,sans-serif;cursor:pointer}
.language-menu button:hover,.language-menu button.active{background:#eef5ff;color:#123b82}
.mobile-language-row{padding:12px 14px;margin:8px 10px;border:1px solid rgba(18,59,130,.12);border-radius:14px;background:rgba(18,59,130,.045)}
.mobile-language-label{display:block;font-weight:800;margin-bottom:8px;color:#123b82}
.mobile-language-buttons{display:flex;gap:8px}
.mobile-language-buttons button{flex:1;border:1px solid #d7e2ef;background:#fff;border-radius:10px;padding:9px 8px;font-weight:700;cursor:pointer}
.mobile-language-buttons button.active{background:#123b82;color:#fff;border-color:#123b82}
@keyframes pnLangDrop{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
/* Tamil-friendly UI font fallback. */
html[data-language="ta"] body{font-family:"Noto Sans Tamil","Nirmala UI","Latha",Arial,sans-serif}
</style></head><body><h2>Donor Details PNG</h2><p>Image created successfully. Save it and share it on WhatsApp.</p><img src="${url}" alt="Donor details"><br><a href="${url}" download="${safeName}_Blood_Donor_Details.png">⬇️ Save PNG</a><p><b>iPhone:</b> long-press the image to save it, then share it from Photos.<br><b>Android:</b> tap Save PNG, then share it from Gallery.</p></body></html>`);
          win.document.close();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
          return;
        }

        // Last fallback: trigger a download from the current page.
        const a=document.createElement("a"); a.href=url; a.download=`${safeName}_Blood_Donor_Details.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),5000);
        toast("PNG created. Save the image and share it from your gallery.");
      } catch(error) {
        console.error("Donor PNG share failed:",error);
        toast(error?.message || "Unable to create donor PNG.");
      }
    }

    function openAdminDonorEditFromDetails() {
      if (!currentAdminDonor) return;
      closeAdminDonorDetails();
      openAdminDonorEdit(value(currentAdminDonor,"Donor_ID","donorId","DonorID","ID","id"));
    }

    function openAdminDonorEdit(donorId) {
      if (!ensureAdminAccess()) return;
      const donor = (window.__ADMIN_DONORS || []).find(d => String(value(d,"Donor_ID","donorId","DonorID","ID","id")) === String(donorId));
      if (!donor) return toast("Donor details not found.");
      const form = document.getElementById("adminDonorEditForm");
      const fields = {
        Donor_ID:["Donor_ID","donorId"], Name:["Name","name"], Mobile:["Mobile","mobile","Phone"], Alternate_Mobile:["Alternate_Mobile","alternateMobile"], Email:["Email","email"],
        Blood_Group:["Blood_Group","bloodGroup","BloodGroup"], Gender:["Gender","gender"], DOB:["DOB","dob"], District:["District","district"],
        City:["City","city"], Address:["Address","address"], Last_Donation_Date:["Last_Donation_Date","lastDonationDate"],
        Aadhaar_Number:["Aadhaar_Number","aadhaarNumber"], Referred_By:["Referred_By","referredBy"], Status:["Status","status"], Available:["Available","available"]
      };
      Object.entries(fields).forEach(([name, keys]) => { const el=form.elements.namedItem(name); if(el) el.value=String(value(donor,...keys) || ""); });
      document.getElementById("adminDonorEditMessage").textContent="";
      document.getElementById("adminDonorEditModal").classList.add("show");
    }

    function closeAdminDonorEdit(){ document.getElementById("adminDonorEditModal")?.classList.remove("show"); }
    function closeAdminDonorEditOutside(event){ if(event.target.id === "adminDonorEditModal") closeAdminDonorEdit(); }

    document.getElementById("adminDonorEditForm")?.addEventListener("submit", async function(event){
      event.preventDefault(); if(!ensureAdminAccess()) return;
      const msg=document.getElementById("adminDonorEditMessage"), submit=this.querySelector("button[type=submit]");
      const required=["Name","Mobile","Blood_Group","Gender","DOB","District","City","Address","Last_Donation_Date"];
      const missing=required.find(n=>!String(this.elements.namedItem(n)?.value||"").trim());
      if(missing){msg.className="form-message error";msg.textContent=missing === "City" ? "Town/Village is required." : missing.replace(/_/g," ")+" is required.";this.elements.namedItem(missing)?.focus();return;}
      try{
        submit.disabled=true; msg.className="form-message success"; msg.textContent="Updating donor…";
        const result=await BloodDonationAPI.updateDonor({
          donorId:this.elements.namedItem("Donor_ID").value, name:this.elements.namedItem("Name").value.trim(), mobile:this.elements.namedItem("Mobile").value.trim(), alternateMobile:this.elements.namedItem("Alternate_Mobile").value.trim(),
          email:this.elements.namedItem("Email").value.trim(), bloodGroup:this.elements.namedItem("Blood_Group").value, gender:this.elements.namedItem("Gender").value,
          dob:this.elements.namedItem("DOB").value, district:this.elements.namedItem("District").value.trim(), city:this.elements.namedItem("City").value.trim(),
          address:this.elements.namedItem("Address").value.trim(), lastDonationDate:this.elements.namedItem("Last_Donation_Date").value,
          aadhaarNumber:this.elements.namedItem("Aadhaar_Number").value.trim(), referredBy:this.elements.namedItem("Referred_By").value.trim(),
          status:this.elements.namedItem("Status").value, available:this.elements.namedItem("Available").value
        }, getAdminUserId());
        if(result?.success===false) throw new Error(result.error||"Unable to update donor.");
        closeAdminDonorEdit(); toast("Donor updated successfully."); await loadAdminDashboard();
      }catch(error){msg.className="form-message error";msg.textContent=error?.message||"Unable to update donor.";}finally{submit.disabled=false;}
    });

    function adminJumpTo(tab) {
      if (!ensureAdminAccess()) return;
      const validTabs = new Set(["donors","requests","events","fields","social","admin-management","reports"]);
      if (!validTabs.has(tab)) return;
      const tabPermission = {donors:"donors.view",requests:"requests.view",events:"events.view",fields:"settings.view",social:"social.view","admin-management":"admin.manage",reports:"reports.view"}[tab];
      if (tabPermission && !adminHasPermission(tabPermission)) { toast("You do not have permission to access this section."); return; }

      const cards = [...document.querySelectorAll("[data-admin-tab]")];
      cards.forEach(card => {
        const active = card.dataset.adminTab === tab;
        card.classList.toggle("admin-tab-active", active);
        card.hidden = !active;
      });

      // The Fields card contains both normal website fields and social fields.
      const settingsCard = document.getElementById("adminSettingsCard");
      if (settingsCard) {
        settingsCard.hidden = !["fields","social"].includes(tab);
        settingsCard.classList.toggle("admin-tab-active", ["fields","social"].includes(tab));
        setAdminSettingsMode(tab === "social" ? "social" : "fields");
      }

      document.querySelectorAll(".admin-action-btn").forEach(btn => {
        const text=btn.textContent||"";
        btn.classList.toggle("active",
          (tab === "donors" && text.includes("Manage Donors")) ||
          (tab === "requests" && text.includes("Blood Requests")) ||
          (tab === "events" && text.includes("Events")) ||
          (tab === "social" && text.includes("Social Links")) ||
          (tab === "fields" && text.includes("Fields"))
        );
      });

      const target = cards.find(card => card.dataset.adminTab === tab) ||
        (settingsCard && ["fields","social"].includes(tab) ? settingsCard : null);
      if (target) target.scrollIntoView({behavior:"smooth", block:"start"});
    }


    /* =========================================================
       ADMIN DONOR EXCEL IMPORT / EXPORT
       ========================================================= */

    const DONOR_EXCEL_HEADERS = [
      "Donor ID",
      "Name",
      "Mobile",
      "Alternate Mobile",
      "Email",
      "Blood Group",
      "Gender",
      "DOB",
      "District",
      "Town/Village",
      "Address",
      "Last Donation Date",
      "Aadhaar Number",
      "Referred By",
      "Available",
      "Status",
      "Registration Date",
      "Photo URL"
    ];

    const DONOR_IMPORT_ALIASES = {
      name: ["Name", "Donor Name", "Donor_Name", "DonorName"],
      mobile: ["Mobile", "Mobile Number", "Phone", "Phone Number"],
      alternateMobile: ["Alternate Mobile", "Alternate_Mobile", "Alternate Mobile Number", "Secondary Mobile"],
      email: ["Email", "Email Address"],
      bloodGroup: ["Blood Group", "Blood_Group", "BloodGroup"],
      gender: ["Gender", "Sex"],
      dob: ["DOB", "Date of Birth", "Date_of_Birth"],
      district: ["District"],
      townVillage: ["Town/Village", "Town / Village", "Town", "Village", "City"],
      address: ["Address"],
      lastDonationDate: ["Last Donation Date", "Last_Donation_Date", "LastDonationDate"],
      aadhaarNumber: ["Aadhaar Number", "Aadhaar_Number", "Aadhaar"],
      referredBy: ["Referred By", "Referred_By", "ReferredBy"],
      available: ["Available"],
      status: ["Status"],
      photoUrl: ["Photo URL", "Photo_URL", "PhotoURL", "Photo Url"]
    };

    function excelCell(row, aliases) {
      for (const key of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
          return row[key];
        }
      }
      const normalized = {};
      Object.keys(row || {}).forEach(k => {
        normalized[String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "")] = row[k];
      });
      for (const key of aliases) {
        const nk = String(key).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normalized[nk] !== undefined && normalized[nk] !== null && String(normalized[nk]).trim() !== "") return normalized[nk];
      }
      return "";
    }

    function excelDateToISO(valueToFormat) {
      if (valueToFormat instanceof Date && !Number.isNaN(valueToFormat.getTime())) {
        return `${valueToFormat.getFullYear()}-${String(valueToFormat.getMonth()+1).padStart(2,"0")}-${String(valueToFormat.getDate()).padStart(2,"0")}`;
      }
      const raw = String(valueToFormat ?? "").trim();
      if (!raw) return "";
      if (/^\\d{4}-\\d{2}-\\d{2}/.test(raw)) return raw.slice(0,10);
      const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (m) {
        // Treat DD/MM/YYYY as the normal Indian Excel entry format.
        return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
      }
      if (/^\\d+(\\.\\d+)?$/.test(raw) && window.XLSX?.SSF?.parse_date_code) {
        const d = XLSX.SSF.parse_date_code(Number(raw));
        if (d?.y) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
      }
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}-${String(parsed.getDate()).padStart(2,"0")}`;
      }
      return raw.split(" ")[0];
    }

    function donorImportRowToPayload(row) {
      const name = String(excelCell(row, DONOR_IMPORT_ALIASES.name) || "").trim();
      const mobile = String(excelCell(row, DONOR_IMPORT_ALIASES.mobile) || "").replace(/\D/g, "").trim();
      const alternateMobile = String(excelCell(row, DONOR_IMPORT_ALIASES.alternateMobile) || "").replace(/\D/g, "").trim();
      const email = String(excelCell(row, DONOR_IMPORT_ALIASES.email) || "").trim();
      const bloodGroup = String(excelCell(row, DONOR_IMPORT_ALIASES.bloodGroup) || "").trim().toUpperCase();
      const gender = String(excelCell(row, DONOR_IMPORT_ALIASES.gender) || "").trim();
      const dob = excelDateToISO(excelCell(row, DONOR_IMPORT_ALIASES.dob));
      const district = String(excelCell(row, DONOR_IMPORT_ALIASES.district) || "").trim();
      const townVillage = String(excelCell(row, DONOR_IMPORT_ALIASES.townVillage) || "").trim();
      const address = String(excelCell(row, DONOR_IMPORT_ALIASES.address) || "").trim();
      const lastDonationDate = excelDateToISO(excelCell(row, DONOR_IMPORT_ALIASES.lastDonationDate)) || "NA";
      const aadhaarNumber = String(excelCell(row, DONOR_IMPORT_ALIASES.aadhaarNumber) || "").replace(/\D/g, "").trim();
      const referredBy = String(excelCell(row, DONOR_IMPORT_ALIASES.referredBy) || "").trim();
      const available = String(excelCell(row, DONOR_IMPORT_ALIASES.available) || "Yes").trim() || "Yes";
      const status = String(excelCell(row, DONOR_IMPORT_ALIASES.status) || "Active").trim() || "Active";
      const photoUrl = String(excelCell(row, DONOR_IMPORT_ALIASES.photoUrl) || "").trim();

      return {
        name, mobile, alternateMobile, email, bloodGroup, gender, dob, district,
        city: townVillage,
        address, lastDonationDate, aadhaarNumber, referredBy,
        available, status, photoUrl, Photo_URL: photoUrl
      };
    }

    function downloadDonorExcelTemplate() {
      if (!ensureAdminAccess()) return;
      if (!window.XLSX) return toast("Excel module is still loading. Please try again.");
      const headers = DONOR_EXCEL_HEADERS.filter(h => !["Donor ID", "Registration Date"].includes(h)); // system fields are generated automatically
      const sample = [[
        "Sample Donor",
        "9876543210",
        "example@email.com",
        "O+",
        "Male",
        "1990-01-15",
        "Erode",
        "Modakkurichi",
        "Sample Address",
        "NA",
        "",
        "",
        "Yes",
        "Active",
        "https://drive.google.com/..."
      ]];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
      ws["!cols"] = headers.map(h => ({ wch: Math.max(15, Math.min(32, h.length + 4)) }));
      XLSX.utils.book_append_sheet(wb, ws, "Donor Import");

      const guide = [
        ["Poongurichi Nanbargal - Mass Donor Import"],
        ["Use this Excel file to add many donors at once from Admin → Manage Donors → Import Excel."],
        ["Required fields", "Name, Mobile, Blood Group, Gender, DOB, District, Town/Village, Address"],
        ["Last Donation Date", "Enter YYYY-MM-DD or DD/MM/YYYY. Enter NA for a first-time/new donor."],
        ["Photo URL", "Optional. If supplied, use a publicly accessible image URL."],
        ["Donor ID / Registration Date", "Do not enter these for import; the system generates them automatically."],
        ["Duplicates", "Review your file before importing. Each row is registered as a new donor."],
        ["Google Sheets", "Upload this .xlsx file to Google Sheets; the same columns can be used there."]
      ];
      const gi = XLSX.utils.aoa_to_sheet(guide);
      gi["!cols"] = [{ wch: 28 }, { wch: 90 }];
      XLSX.utils.book_append_sheet(wb, gi, "Instructions");
      XLSX.writeFile(wb, "Poongurichi_Nanbargal_Donor_Import_Template.xlsx");
    }

    function donorExportRows(donors) {
      return (donors || []).map(donor => ({
        "Donor ID": value(donor,"Donor_ID","donorId","DonorID","ID","id"),
        "Name": value(donor,"Name","name"),
        "Mobile": value(donor,"Mobile","mobile","Phone"),
        "Alternate Mobile": value(donor,"Alternate_Mobile","alternateMobile"),
        "Email": value(donor,"Email","email"),
        "Blood Group": value(donor,"Blood_Group","bloodGroup","BloodGroup"),
        "Gender": value(donor,"Gender","gender"),
        "DOB": dateOnly(value(donor,"DOB","dob")),
        "District": value(donor,"District","district"),
        "Town/Village": value(donor,"City","city"),
        "Address": value(donor,"Address","address"),
        "Last Donation Date": dateOnly(value(donor,"Last_Donation_Date","lastDonationDate")),
        "Aadhaar Number": value(donor,"Aadhaar_Number","aadhaarNumber"),
        "Referred By": value(donor,"Referred_By","referredBy"),
        "Available": value(donor,"Available","available"),
        "Status": value(donor,"Status","status"),
        "Registration Date": dateOnly(value(donor,"Registration_Date","registrationDate")),
        "Photo URL": value(donor,"Photo_URL","photoUrl","PhotoURL","photoURL","Photo_Url")
      }));
    }

    async function exportDonorsToExcel() {
      if (!ensureAdminAccess()) return;
      if (!window.XLSX) return toast("Excel module is still loading. Please try again.");
      const message = document.getElementById("adminDonorImportMessage");
      try {
        if (message) { message.className = "form-message success"; message.textContent = "Preparing donor Excel file…"; }
        const donors = await BloodDonationAPI.getAdminDonors(getAdminUserId());
        if (!donors.length) {
          if (message) { message.className = "form-message error"; message.textContent = "No donor records available to export."; }
          return;
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(donorExportRows(donors), { header: DONOR_EXCEL_HEADERS });
        ws["!cols"] = DONOR_EXCEL_HEADERS.map(h => ({ wch: Math.max(14, Math.min(34, h.length + 4)) }));
        XLSX.utils.book_append_sheet(wb, ws, "Donors");
        XLSX.writeFile(wb, `Poongurichi_Nanbargal_Donors_${new Date().toISOString().slice(0,10)}.xlsx`);
        if (message) { message.className = "form-message success"; message.textContent = `✓ ${donors.length} donor record(s) exported successfully.`; }
      } catch (error) {
        console.error(error);
        if (message) { message.className = "form-message error"; message.textContent = error?.message || "Unable to export donors."; }
      }
    }

    async function importDonorsFromExcel(event) {
      if (!ensureAdminAccess()) return;
      const input = event.target;
      const file = input?.files?.[0];
      if (!file) return;
      const message = document.getElementById("adminDonorImportMessage");
      if (!window.XLSX) {
        if (message) { message.className = "form-message error"; message.textContent = "Excel module is not available. Please refresh the page."; }
        input.value = "";
        return;
      }

      try {
        if (message) { message.className = "form-message success"; message.textContent = "Reading Excel file…"; }
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: true });
        if (!rows.length) throw new Error("The Excel sheet contains no donor rows.");

        const donors = rows.map(donorImportRowToPayload);
        const required = [
          ["Name","name"], ["Mobile","mobile"], ["Blood Group","bloodGroup"],
          ["Gender","gender"], ["DOB","dob"], ["District","district"],
          ["Town/Village","city"], ["Address","address"]
        ];
        const errors = [];
        donors.forEach((d, i) => {
          required.forEach(([label,key]) => {
            if (!String(d[key] || "").trim()) errors.push(`Row ${i+2}: ${label} is required.`);
          });
          if (d.mobile && !/^[6-9]\d{9}$/.test(d.mobile)) errors.push(`Row ${i+2}: Mobile must be a valid 10-digit Indian number.`);
          if (d.bloodGroup && !["A+","A-","B+","B-","AB+","AB-","O+","O-"].includes(d.bloodGroup)) errors.push(`Row ${i+2}: Invalid blood group ${d.bloodGroup}.`);
        });
        if (errors.length) {
          if (message) {
            message.className = "form-message error";
            message.textContent = errors.slice(0, 8).join(" ") + (errors.length > 8 ? ` (+${errors.length-8} more errors)` : "");
          }
          return;
        }

        if (!confirm(`Import ${donors.length} donor record(s) now? This will create new donor IDs for every row.`)) return;

        let success = 0, failed = 0;
        const failures = [];
        for (let i = 0; i < donors.length; i++) {
          if (message) {
            message.className = "form-message success admin-import-progress";
            message.textContent = `Importing ${i+1} of ${donors.length}…`;
          }
          try {
            const result = await BloodDonationAPI.registerDonor(donors[i]);
            if (result?.success === false) throw new Error(result.error || "Registration failed.");
            success++;
          } catch (error) {
            failed++;
            failures.push(`Row ${i+2}: ${error?.message || "Import failed."}`);
          }
        }

        await loadAdminDashboard();
        if (message) {
          message.className = failed ? "form-message error" : "form-message success";
          message.textContent = `Import completed: ${success} successful, ${failed} failed.` + (failures.length ? " " + failures.slice(0,5).join(" ") : "");
        }
      } catch (error) {
        console.error(error);
        if (message) { message.className = "form-message error"; message.textContent = error?.message || "Unable to import Excel file."; }
      } finally {
        input.value = "";
      }
    }

    /* =========================================================
       ADMIN DASHBOARD
       ========================================================= */

    function adminIsLoggedIn() {
      try {
        return !!(window.BloodDonationAPI &&
          typeof BloodDonationAPI.adminSession === "function" &&
          BloodDonationAPI.adminSession());
      } catch (error) {
        return false;
      }
    }

    function getAdminUser() {
      try {
        return BloodDonationAPI.adminSession() || {};
      } catch (error) {
        return {};
      }
    }

    function getAdminUserId() {
      const user = getAdminUser();
      return value(user, "User_ID", "userId", "UserId", "ID", "id", "Username", "username");
    }

    function ensureAdminAccess() {
      if (!adminIsLoggedIn()) {
        document.getElementById("adminGuardMessage").innerHTML =
          '<div class="form-message error">Please log in as an administrator to access this page.</div>';
        return false;
      }

      const guard = document.getElementById("adminGuardMessage");
      if (guard) guard.innerHTML = "";
      return true;
    }

    async function loadAdminDashboard() {
      if (!ensureAdminAccess()) return;

      const stats = await Promise.resolve()
        .then(() => BloodDonationAPI.getDashboardStats())
        .catch(() => ({}));

      const s = stats?.stats || stats?.data || stats || {};

      document.getElementById("adminStatDonors").textContent =
        Number(value(s, "registeredDonors", "totalDonors", "donors", "Registered_Donors")) || 0;

      document.getElementById("adminStatRequests").textContent =
        Number(value(s, "activeRequests", "bloodRequests", "requests", "Active_Requests")) || 0;

      document.getElementById("adminStatEvents").textContent =
        Number(value(s, "events", "totalEvents", "camps", "Events")) || 0;

      document.getElementById("adminStatGroups").textContent =
        Number(value(s, "bloodGroups", "groups", "Blood_Groups")) || 0;

      await Promise.allSettled([
        adminHasPermission('donors.view') ? loadAdminDonors() : Promise.resolve(),
        adminHasPermission('requests.view') ? loadAdminRequests() : Promise.resolve(),
        adminHasPermission('events.view') ? loadAdminEvents() : Promise.resolve(),
        adminHasPermission('about.view') ? loadAdminAbout() : Promise.resolve(),
        adminHasPermission('settings.view') ? loadAdminSettings() : Promise.resolve(),
        adminHasPermission('admin.manage') ? loadAdminUsers() : Promise.resolve()
      ]);
      applyAdminRbacUI();
    }

    function clearAdminDonorSearch() {
      const input = document.getElementById("adminDonorSearch");
      if (input) input.value = "";
      window.__ADMIN_DONOR_PAGE = 1;
      renderAdminDonorTable();
    }

    function changeAdminDonorPage(delta) {
      window.__ADMIN_DONOR_PAGE = Math.max(1, (Number(window.__ADMIN_DONOR_PAGE) || 1) + delta);
      renderAdminDonorTable();
    }

    function renderAdminDonorTable() {
      const box = document.getElementById("adminDonorTable");
      if (!box) return;

      const donors = Array.isArray(window.__ADMIN_DONORS) ? window.__ADMIN_DONORS : [];
      const query = String(document.getElementById("adminDonorSearch")?.value || "").trim().toLowerCase();
      const entryValue = String(document.getElementById("adminDonorEntryCount")?.value || "10");

      const filtered = donors.filter(donor => {
        if (!query) return true;
        const name = String(value(donor, "Name", "name") || "").toLowerCase();
        const group = String(value(donor, "Blood_Group", "bloodGroup", "BloodGroup") || "").toLowerCase();
        const mobile = String(value(donor, "Mobile", "mobile", "Phone") || "").toLowerCase();
        const referred = String(value(donor, "Referred_By", "referredBy", "ReferredBy") || "").toLowerCase();
        return name.includes(query) || group.includes(query) || mobile.includes(query) || referred.includes(query);
      });

      const pageSize = entryValue === "all" ? filtered.length : Math.max(1, Number(entryValue) || 10);
      const totalPages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
      const page = Math.min(Math.max(1, Number(window.__ADMIN_DONOR_PAGE) || 1), totalPages);
      window.__ADMIN_DONOR_PAGE = page;
      const visible = entryValue === "all"
        ? filtered
        : filtered.slice((page - 1) * pageSize, page * pageSize);

      if (!filtered.length) {
        box.innerHTML = '<div class="admin-empty">No donors match your search.</div>';
        return;
      }

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;">
          <div style="font-size:14px;color:#5d6f84;font-weight:600;">Showing ${entryValue === "all" ? 1 : ((page-1)*pageSize+1)}–${entryValue === "all" ? filtered.length : Math.min(page*pageSize, filtered.length)} of ${filtered.length} matching donor(s)</div>
          ${entryValue !== "all" && totalPages > 1 ? `
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" class="admin-small-btn" onclick="changeAdminDonorPage(-1)" ${page<=1?"disabled":""}>← Previous</button>
              <span style="font-size:13px;font-weight:700;">Page ${page} / ${totalPages}</span>
              <button type="button" class="admin-small-btn" onclick="changeAdminDonorPage(1)" ${page>=totalPages?"disabled":""}>Next →</button>
            </div>` : ""}
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Blood</th>
              <th>Mobile</th>
              <th>Referred By</th>
              <th>Location</th>
              <th>90-Day Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${visible.map(donor => {
              const id = value(donor, "Donor_ID", "donorId", "DonorID", "ID", "id");
              const name = value(donor, "Name", "name") || "—";
              const group = value(donor, "Blood_Group", "bloodGroup", "BloodGroup") || "—";
              const mobile = value(donor, "Mobile", "mobile", "Phone") || "—";
              const referred = value(donor, "Referred_By", "referredBy", "ReferredBy") || "—";
              const location = [value(donor, "City", "city"), value(donor, "District", "district")]
                .filter(Boolean).join(", ") || "—";
              const eligibility = donor.eligibility?.status || "Unknown";
              return `
                <tr>
                  <td><strong>${escapeHtml(name)}</strong></td>
                  <td>${escapeHtml(group)}</td>
                  <td>${escapeHtml(mobile)}</td>
                  <td>${escapeHtml(referred)}</td>
                  <td>${escapeHtml(location)}</td>
                  <td><span class="admin-status-pill">${escapeHtml(eligibility)}</span></td>
                  <td style="white-space:nowrap;">
                    <button type="button" class="admin-small-btn" onclick="openAdminDonorDetails('${escapeAttribute(id)}')">View Details</button>
                    <button type="button" class="admin-small-btn admin-edit-btn" onclick="openAdminDonorEdit('${escapeAttribute(id)}')">Edit</button>
                    <button type="button" class="admin-danger-btn" onclick="adminDeleteDonor('${escapeAttribute(id)}')">Delete</button>
                  </td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>`;
    }

    async function loadAdminDonors() {
      const box = document.getElementById("adminDonorTable");
      if (!box || !ensureAdminAccess()) return;

      box.innerHTML = '<div class="admin-loading">Loading donors…</div>';

      try {
        const donors = await BloodDonationAPI.getDonors();
        window.__ADMIN_DONORS = Array.isArray(donors) ? donors : [];
        window.__ADMIN_DONOR_PAGE = 1;
        renderAdminDonorTable();
      } catch (error) {
        console.error(error);
        box.innerHTML = '<div class="admin-empty error-text">Unable to load donors.</div>';
      }
    }

    async function adminDeleteDonor(donorId) {
      if (!donorId || !ensureAdminAccess()) return;
      if (!confirm("Delete this donor registration?")) return;

      try {
        await BloodDonationAPI.deleteDonor(donorId, getAdminUserId());
        toast("Donor deleted.");
        await loadAdminDashboard();
      } catch (error) {
        console.error(error);
        toast(error?.message || "Unable to delete donor.");
      }
    }

    async function loadAdminRequests() {
      const box = document.getElementById("adminRequestTable");
      if (!box || !ensureAdminAccess()) return;

      box.innerHTML = '<div class="admin-loading">Loading requests…</div>';

      try {
        const result = await BloodDonationAPI.getBloodRequests();
        const requests = Array.isArray(result)
          ? result
          : (result?.requests || result?.data || []);

        if (!requests.length) {
          box.innerHTML = '<div class="admin-empty">No blood requests found.</div>';
          return;
        }

        box.innerHTML = `
          <table class="admin-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Blood</th>
                <th>Mobile</th>
                <th>Hospital</th>
                <th>Location</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${requests.map(req => {
                const id = value(req, "Request_ID", "requestId", "RequestID", "ID", "id");
                const patient = value(req, "Patient_Name", "patientName", "PatientName") || "—";
                const group = value(req, "Blood_Group", "bloodGroup", "BloodGroup") || "—";
                const mobile = value(req, "Contact_Mobile", "contactMobile", "Mobile", "Phone") || "—";
                const hospital = value(req, "Hospital", "hospital") || "—";
                const location = [value(req, "City", "city"), value(req, "District", "district")]
                  .filter(Boolean).join(", ") || "—";

                return `
                  <tr>
                    <td><strong>${escapeHtml(patient)}</strong></td>
                    <td>${escapeHtml(group)}</td>
                    <td>${escapeHtml(mobile)}</td>
                    <td>${escapeHtml(hospital)}</td>
                    <td>${escapeHtml(location)}</td>
                    <td>
                      <button type="button" class="admin-danger-btn"
                        onclick="adminDeleteRequest('${escapeAttribute(id)}')">Delete</button>
                    </td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>`;
      } catch (error) {
        console.error(error);
        box.innerHTML = '<div class="admin-empty error-text">Unable to load blood requests.</div>';
      }
    }

    async function adminDeleteRequest(requestId) {
      if (!requestId || !ensureAdminAccess()) return;
      if (!confirm("Delete this blood request?")) return;

      try {
        await BloodDonationAPI.deleteRequest(requestId, getAdminUserId());
        toast("Blood request deleted.");
        await loadAdminDashboard();
      } catch (error) {
        console.error(error);
        toast(error?.message || "Unable to delete request.");
      }
    }

    function openAdminEventEditor(eventId) {
      if(!ensureAdminAccess()) return;
      const events=window.__ADMIN_EVENTS||[];
      const event=events.find(e=>String(value(e,"Event_ID","eventId","EventID","ID","id"))===String(eventId));
      if(!event) return toast("Event not found.");
      const form=document.getElementById("adminEventEditForm");
      form.elements.namedItem("Event_ID").value=value(event,"Event_ID","eventId","EventID","ID","id")||"";
      form.elements.namedItem("Title").value=value(event,"Title","title","Event_Title")||"";
      form.elements.namedItem("Event_Date").value=value(event,"Event_Date","eventDate","EventDate")||"";
      form.elements.namedItem("Location").value=value(event,"Location","location")||"";
      form.elements.namedItem("Image_URL").value=value(event,"Image_URL","imageUrl","ImageURL")||"";
      form.elements.namedItem("Description").value=value(event,"Description","description")||"";
      form.elements.namedItem("Status").value=value(event,"Status","status")||"Published";
      document.getElementById("adminEventEditImageFile").value="";
      document.getElementById("adminEventEditMessage").textContent="";
      document.getElementById("adminEventEditModal").classList.add("show");
    }
    function closeAdminEventEditor(){document.getElementById("adminEventEditModal")?.classList.remove("show");}
    function closeAdminEventEditorOutside(event){if(event.target.id==="adminEventEditModal")closeAdminEventEditor();}

    document.getElementById("adminEventEditForm")?.addEventListener("submit",async function(event){
      event.preventDefault(); if(!ensureAdminAccess()) return;
      const msg=document.getElementById("adminEventEditMessage"), submit=this.querySelector("button[type=submit]");
      const title=String(this.elements.namedItem("Title").value||"").trim(), date=String(this.elements.namedItem("Event_Date").value||"").trim(), location=String(this.elements.namedItem("Location").value||"").trim();
      if(!title||!date||!location){msg.className="form-message error";msg.textContent="Event title, date and location are mandatory.";return;}
      try{submit.disabled=true;msg.className="form-message success";msg.textContent="Saving event…";let imageUrl=this.elements.namedItem("Image_URL").value||"";const file=document.getElementById("adminEventEditImageFile")?.files?.[0];if(file)imageUrl=await uploadAdminImage(file,"event");const result=await BloodDonationAPI.updateEvent({eventId:this.elements.namedItem("Event_ID").value,title,eventDate:date,location,imageUrl,description:this.elements.namedItem("Description").value||"",status:this.elements.namedItem("Status").value||"Published"},getAdminUserId());if(result?.success===false)throw new Error(result.error||"Unable to update event.");closeAdminEventEditor();toast("Event updated.");await Promise.allSettled([loadAdminDashboard(),loadEvents()]);}catch(error){msg.className="form-message error";msg.textContent=error?.message||"Unable to update event.";}finally{submit.disabled=false;}
    });

    async function loadAdminEvents() {
      const box = document.getElementById("adminEventTable");
      if (!box || !ensureAdminAccess()) return;

      box.innerHTML = '<div class="admin-loading">Loading events…</div>';

      try {
        const result = await BloodDonationAPI.getEvents();
        const events = Array.isArray(result)
          ? result
          : (result?.events || result?.data || []);
        window.__ADMIN_EVENTS = events;

        if (!events.length) {
          box.innerHTML = '<div class="admin-empty">No events found.</div>';
          return;
        }

        box.innerHTML = `
          <table class="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Location</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(event => {
                const id = value(event, "Event_ID", "eventId", "EventID", "ID", "id");
                const title = value(event, "Title", "title", "Event_Title") || "Blood Donation Camp";
                const date = value(event, "Event_Date", "eventDate", "EventDate") || "—";
                const location = value(event, "Location", "location") || "—";
                const status = value(event, "Status", "status") || "Active";

                return `
                  <tr>
                    <td><strong>${escapeHtml(title)}</strong></td>
                    <td>${escapeHtml(formatDate(date))}</td>
                    <td>${escapeHtml(location)}</td>
                    <td><span class="admin-status-pill">${escapeHtml(status)}</span></td>
                    <td>
                      <button type="button" class="admin-small-btn" onclick="openAdminEventEditor('${escapeAttribute(id)}')">Edit</button>
                      <button type="button" class="admin-danger-btn" onclick="adminDeleteEvent('${escapeAttribute(id)}')">Delete</button>
                    </td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>`;
      } catch (error) {
        console.error(error);
        box.innerHTML = '<div class="admin-empty error-text">Unable to load events.</div>';
      }
    }

    async function adminDeleteEvent(eventId) {
      if (!eventId || !ensureAdminAccess()) return;
      if (!confirm("Delete this event?")) return;

      try {
        await BloodDonationAPI.deleteEvent(eventId, getAdminUserId());
        toast("Event deleted.");
        await loadAdminDashboard();
        await loadEvents();
      } catch (error) {
        console.error(error);
        toast(error?.message || "Unable to delete event.");
      }
    }

    async function loadAdminAbout() {
      const title = document.getElementById("adminAboutTitle");
      const content = document.getElementById("adminAboutContent");
      if (!title || !content || !ensureAdminAccess()) return;

      try {
        const result = await BloodDonationAPI.getAbout();
        const about = result?.about || result?.data || result || {};

        title.value = value(about, "Title", "title", "About_Title") || "";
        content.value = value(about, "Content", "content", "Description", "description", "About_Content") || "";
      } catch (error) {
        console.error(error);
      }
    }

    /* =========================================================
       CREATE EVENT
       Explicit validation + normalized API payload.
       ========================================================= */
    async function readImageAsBase64(file) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function uploadAdminImage(file, kind) {
      if (!file) return "";
      if (file.size > 5 * 1024 * 1024) throw new Error("Image is too large. Maximum 5 MB.");
      const allowed = ["image/jpeg","image/png","image/webp","image/gif"];
      if (!allowed.includes(file.type)) throw new Error("Only JPG, PNG, WEBP and GIF images are allowed.");
      const base64 = await readImageAsBase64(file);
      const fn = kind === "event" ? BloodDonationAPI.uploadEventImage : BloodDonationAPI.uploadDonorPhoto;
      const result = await fn({base64, mimeType:file.type, fileName:file.name, userId:getAdminUserId()});
      if (result?.success === false) throw new Error(result.error || "Image upload failed.");
      return result.imageUrl || "";
    }

    document.getElementById("adminEventForm")?.addEventListener("submit", async function(event) {
      event.preventDefault();
      if (!ensureAdminAccess()) return;
      const message = document.getElementById("adminEventMessage");
      const submit = this.querySelector("button[type=submit]");
      const titleEl=this.elements.namedItem("Title"), dateEl=this.elements.namedItem("Event_Date"), locEl=this.elements.namedItem("Location"), fileEl=document.getElementById("adminEventImageFile"), descEl=this.elements.namedItem("Description");
      const title=String(titleEl?.value||"").trim(), eventDate=String(dateEl?.value||"").trim(), location=String(locEl?.value||"").trim(), description=String(descEl?.value||"").trim();
      if(!title){message.className="form-message error";message.textContent="Event title is required.";titleEl?.focus();return;}
      if(!eventDate){message.className="form-message error";message.textContent="Event date is required.";dateEl?.focus();return;}
      if(!location){message.className="form-message error";message.textContent="Event location is required.";locEl?.focus();return;}
      try {
        submit.disabled=true; message.className="form-message success"; message.textContent="Uploading image and creating event…";
        let imageUrl=String(this.elements.namedItem("Image_URL")?.value||"").trim();
        if(fileEl?.files?.[0]) imageUrl=await uploadAdminImage(fileEl.files[0],"event");
        const result=await BloodDonationAPI.createEvent({title,eventDate,location,imageUrl,description,status:"Published"},getAdminUserId());
        if(result?.success===false) throw new Error(result.error||"Unable to create event.");
        this.reset(); message.className="form-message success"; message.textContent="Event created successfully."; toast("Event created.");
        BloodDonationAPI.api && BloodDonationAPI.api && (typeof BloodDonationAPI.api === "function") && (window.__dummy=0);
        await Promise.allSettled([loadAdminDashboard(),loadEvents()]);
      } catch(error){console.error("Create event error:",error);message.className="form-message error";message.textContent=error?.message||"Unable to create event.";}
      finally{submit.disabled=false;}
    });



    document.getElementById("adminAboutForm")?.addEventListener("submit", async function(event) {
      event.preventDefault();
      if (!ensureAdminAccess()) return;

      const message = document.getElementById("adminAboutMessage");
      const submit = this.querySelector("button[type=submit]");
      const data = Object.fromEntries(new FormData(this));

      try {
        submit.disabled = true;
        message.className = "form-message success";
        message.textContent = "Saving About content…";

        await BloodDonationAPI.saveAbout(data, getAdminUserId());

        message.textContent = "About content saved successfully.";
        toast("About content saved.");
      } catch (error) {
        console.error(error);
        message.className = "form-message error";
        message.textContent = error?.message || "Unable to save About content.";
      } finally {
        submit.disabled = false;
      }
    });

    function applyAdminRbacUI() {
      const role=String(getAdminUser().role||'').toLowerCase();
      const full=['admin','superadmin','super admin'].includes(role);
      const tabPermissions={donors:'donors.view',requests:'requests.view',events:'events.view',fields:'settings.view',social:'social.view',"admin-management":'admin.manage',reports:'reports.view'};
      document.querySelectorAll('[data-admin-tab]').forEach(card=>{ const tab=card.dataset.adminTab; if(tabPermissions[tab] && !full && !adminHasPermission(tabPermissions[tab])) card.style.display='none'; });
      document.querySelectorAll('.admin-action-btn').forEach(btn=>{ const text=btn.textContent||''; let perm=null; if(text.includes('Manage Donors'))perm='donors.view'; else if(text.includes('Blood Requests'))perm='requests.view'; else if(text.includes('Events'))perm='events.view'; else if(text.includes('Social'))perm='social.view'; else if(text.includes('Fields'))perm='settings.view'; else if(text.includes('Admin Management'))perm='admin.manage'; else if(text.includes('Reports'))perm='reports.view'; if(perm && !full && !adminHasPermission(perm)) btn.style.display='none'; });
      const mg=document.getElementById('adminManagementCard'); if(mg && !full && !adminHasPermission('admin.manage')) mg.style.display='none';
    }

    const RBAC_PERMISSION_GROUPS = [
      ['Dashboard',['dashboard.view','dashboard.export']],
      ['Donors',['donors.view','donors.add','donors.edit','donors.delete','donors.import','donors.export','donors.generate']],
      ['Blood Requests',['requests.view','requests.add','requests.edit','requests.delete','requests.export','requests.generate']],
      ['Events / Camps',['events.view','events.add','events.edit','events.delete','events.export','events.generate']],
      ['Latest Updates',['updates.view','updates.add','updates.edit','updates.delete','updates.export']],
      ['Notifications',['notifications.view','notifications.add','notifications.edit','notifications.delete']],
      ['Reports',['reports.view','reports.export']],
      ['Social / Donor Photos',['social.view','social.add','social.edit','social.delete']],
      ['About Club',['about.view','about.edit']],
      ['Settings / Website Fields',['settings.view','settings.edit']],
      ['Admin Management',['admin.manage']]
    ];

    function adminHasPermission(permission) {
      const user = getAdminUser();
      const role = String(user.role || '').toLowerCase();
      if (role === 'admin' || role === 'superadmin' || role === 'super admin') return true;
      const permissions = Array.isArray(user.permissions) ? user.permissions : [];
      return permissions.includes('*') || permissions.includes(permission);
    }

    function renderSubAdminPermissions(selected=[]) {
      const box=document.getElementById('subAdminPermissions'); if(!box) return;
      const chosen=new Set(Array.isArray(selected)?selected:[]);
      box.innerHTML=RBAC_PERMISSION_GROUPS.map(([group,perms])=>`<div class="rbac-permission-group"><div class="rbac-group-title">${escapeHtml(group)}</div>${perms.map(p=>`<label><input type="checkbox" value="${escapeHtml(p)}" ${chosen.has(p)?'checked':''}> <span>${escapeHtml(p.split('.')[1] || p)}</span></label>`).join('')}</div>`).join('');
    }

    function toggleAllSubAdminPermissions(on) {
      document.querySelectorAll('#subAdminPermissions input[type=checkbox]').forEach(cb=>cb.checked=!!on);
    }

    function selectedSubAdminPermissions() {
      return [...document.querySelectorAll('#subAdminPermissions input[type=checkbox]:checked')].map(cb=>cb.value);
    }

    function resetSubAdminForm() {
      const f=document.getElementById('subAdminForm'); if(f) f.reset();
      const id=document.getElementById('subAdminEditId'); if(id) id.value='';
      const btn=f?.querySelector('button[type=submit]'); if(btn) btn.textContent='🛡️ Create Sub Admin';
      renderSubAdminPermissions([]);
      const msg=document.getElementById('subAdminMessage'); if(msg) msg.textContent='';
    }

    async function loadAdminUsers() {
      if(!adminHasPermission('admin.manage')) return;
      const box=document.getElementById('adminUsersTable'); if(!box) return;
      try {
        const result=await BloodDonationAPI.getAdminUsers(getAdminUserId());
        const users=Array.isArray(result?.users)?result.users:[];
        if(!users.length){box.innerHTML='<div class="admin-empty">No admin/sub admin accounts found.</div>';return;}
        box.innerHTML=`<table class="admin-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Permissions</th><th>Action</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escapeHtml(u.name||'—')}</td><td>${escapeHtml(u.username||'—')}</td><td>${escapeHtml(u.role||'—')}</td><td>${escapeHtml(u.status||'—')}</td><td><div class="rbac-chip-list">${(u.permissions||[]).slice(0,8).map(x=>`<span>${escapeHtml(x)}</span>`).join('')}${(u.permissions||[]).length>8?`<span>+${u.permissions.length-8}</span>`:''}</div></td><td>${String(u.role||'').toLowerCase().includes('sub')?`<button class="admin-small-btn" type="button" onclick='editSubAdmin(${JSON.stringify(u).replace(/'/g,"&#39;")})'>Edit</button> <button class="admin-small-btn" type="button" onclick="toggleSubAdminStatus('${escapeHtml(u.userId)}','${String(u.status).toLowerCase()==='active'?'Inactive':'Active'}')">${String(u.status).toLowerCase()==='active'?'Disable':'Enable'}</button> <button class="admin-small-btn danger" type="button" onclick="deleteSubAdminAccount('${escapeHtml(u.userId)}')">Delete</button>`:'—'}</td></tr>`).join('')}</tbody></table>`;
      } catch(e) { box.innerHTML=`<div class="form-message error">${escapeHtml(e?.message||'Unable to load admin users.')}</div>`; }
    }

    function editSubAdmin(user) {
      document.getElementById('subAdminEditId').value=user.userId||'';
      document.getElementById('subAdminName').value=user.name||'';
      document.getElementById('subAdminUsername').value=user.username||'';
      document.getElementById('subAdminPassword').value='';
      document.getElementById('subAdminMobile').value=user.mobile||'';
      document.getElementById('subAdminEmail').value=user.email||'';
      renderSubAdminPermissions(user.permissions||[]);
      const btn=document.querySelector('#subAdminForm button[type=submit]'); if(btn) btn.textContent='💾 Update Sub Admin';
      document.getElementById('adminManagementCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    }

    async function toggleSubAdminStatus(targetUserId,status) {
      try { await BloodDonationAPI.setSubAdminStatus(targetUserId,status,getAdminUserId()); toast('Sub Admin '+status.toLowerCase()+'.'); await loadAdminUsers(); } catch(e){ toast(e?.message||'Unable to update Sub Admin.'); }
    }
    async function deleteSubAdminAccount(targetUserId) {
      if(!confirm('Delete this Sub Admin account?')) return;
      try { await BloodDonationAPI.deleteSubAdmin(targetUserId,getAdminUserId()); toast('Sub Admin deleted.'); await loadAdminUsers(); } catch(e){ toast(e?.message||'Unable to delete Sub Admin.'); }
    }

    document.getElementById('subAdminForm')?.addEventListener('submit', async function(e){
      e.preventDefault();
      const msg=document.getElementById('subAdminMessage');
      const payload={userId:getAdminUserId(),name:document.getElementById('subAdminName').value.trim(),username:document.getElementById('subAdminUsername').value.trim(),password:document.getElementById('subAdminPassword').value,mobile:document.getElementById('subAdminMobile').value.trim(),email:document.getElementById('subAdminEmail').value.trim(),permissions:selectedSubAdminPermissions()};
      const editId=document.getElementById('subAdminEditId').value.trim();
      try {
        if(!payload.name || !payload.username || (!editId && payload.password.length<6)) throw new Error('Name, username and password (minimum 6 characters) are required.');
        msg.className='form-message success'; msg.textContent='Saving…';
        if(editId){ payload.targetUserId=editId; delete payload.username; await BloodDonationAPI.updateSubAdmin(payload); toast('Sub Admin updated.'); }
        else { await BloodDonationAPI.createSubAdmin(payload); toast('Sub Admin created.'); }
        resetSubAdminForm(); await loadAdminUsers();
      } catch(err){ msg.className='form-message error'; msg.textContent=err?.message||'Unable to save Sub Admin.'; }
    });

    function exportAdminReport(type) {
      if(!adminHasPermission('reports.export')) { toast('Report export permission is not assigned.'); return; }
      try {
        let rows=[];
        if(type==='requests') rows=(window.__ADMIN_REQUESTS||[]).map(r=>({...r}));
        else rows=(window.__ADMIN_DONORS||[]).map(d=>({...d}));
        if(type==='blood-group') rows=rows.reduce((a,d)=>{const k=value(d,'Blood_Group','bloodGroup')||'Unknown';const x=a.find(v=>v['Blood Group']===k);x?x.Count++:a.push({'Blood Group':k,Count:1});return a;},[]);
        if(type==='location') rows=rows.reduce((a,d)=>{const k=[value(d,'City','city'),value(d,'District','district')].filter(Boolean).join(', ')||'Unknown';const x=a.find(v=>v.Location===k);x?x.Count++:a.push({Location:k,Count:1});return a;},[]);
        if(type==='last-donation') rows=rows.map(d=>({Donor_ID:value(d,'Donor_ID','donorId'),Name:value(d,'Name','name'),'Blood Group':value(d,'Blood_Group','bloodGroup'),'Last Donation Date':value(d,'Last_Donation_Date','lastDonationDate')}));
        if(!rows.length){toast('No data available for this report.');return;}
        if(!window.XLSX){throw new Error('Excel library is not loaded.');}
        const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Report'); XLSX.writeFile(wb,`PNBDC_${type.replace(/[^a-z0-9]+/gi,'_')}_Report.xlsx`); toast('Report exported.');
      }catch(e){toast(e?.message||'Unable to export report.');}
    }

    function adminLogout() {
      try {
        BloodDonationAPI.clearAdminSession();
      } catch (error) {
        console.error(error);
      }

      goTo("home");
      toast("Admin logged out.");
    }

    /* =========================================================
       DONOR PHOTO GALLERY
       ========================================================= */

    let donorPhotos = [];
    let donorPhotoIndex = 0;
    let donorPhotoTimer = null;
    let donorPhotoTouchStartX = 0;

    async function loadDonorPhotos() {
      const gallery = document.getElementById("donorPhotoGallery");
      if (!gallery) return;
      try {
        const photos = await BloodDonationAPI.getDonorPhotos(false);
        donorPhotos = Array.isArray(photos) ? photos : [];
        donorPhotoIndex = 0;
        renderDonorPhotoGallery();
        clearInterval(donorPhotoTimer);
        if (donorPhotos.length > 1) {
          donorPhotoTimer = setInterval(() => showDonorPhoto(donorPhotoIndex + 1), 5000);
        }
      } catch (error) {
        console.warn("Donor photos:", error);
        gallery.innerHTML = "";
      }
    }

    function normalizeImageUrl(url) {
      const raw = String(url || "").trim();
      if (!raw) return "";
      const match = raw.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^#]*id=|thumbnail\?id=))([a-zA-Z0-9_-]+)/);
      if (match) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w1400`;
      return raw;
    }

    function renderDonorPhotoGallery() {
      const gallery = document.getElementById("donorPhotoGallery");
      if (!gallery) return;
      if (!donorPhotos.length) { gallery.innerHTML = `<div class="donor-photo-empty"><div>💙</div><strong>Our Donor Community</strong><span>Donor photos will appear here after Admin uploads them.</span></div>`; return; }
      const photo = donorPhotos[donorPhotoIndex];
      const title = escapeHtml(photo.title || "Poongurichi Donor");
      const imageUrl = escapeAttribute(normalizeImageUrl(photo.imageUrl || ""));
      gallery.innerHTML = `
        <div class="donor-photo-card" ontouchstart="donorPhotoTouchStart(event)" ontouchend="donorPhotoTouchEnd(event)">
          <img src="${imageUrl}" alt="${title}" loading="lazy" decoding="async" onerror="handleDonorPhotoImageError(this)">
          <button class="donor-photo-nav prev" type="button" onclick="showDonorPhoto(${donorPhotoIndex - 1})" aria-label="Previous donor photo">‹</button>
          <button class="donor-photo-nav next" type="button" onclick="showDonorPhoto(${donorPhotoIndex + 1})" aria-label="Next donor photo">›</button>
          <div class="donor-photo-caption">${title}</div>
          <div class="donor-photo-dots">${donorPhotos.map((_, i) => `<button type="button" class="donor-photo-dot ${i === donorPhotoIndex ? 'active' : ''}" onclick="showDonorPhoto(${i})" aria-label="Photo ${i + 1}"></button>`).join("")}</div>
        </div>`;
    }

    function handleDonorPhotoImageError(img) {
      const card = img.closest(".donor-photo-card");
      if (img.dataset.fallback !== "1") {
        const raw = img.getAttribute("src") || "";
        const m = raw.match(/[?&]id=([^&]+)/);
        if (m) { img.dataset.fallback="1"; img.src=`https://drive.google.com/uc?export=view&id=${encodeURIComponent(m[1])}`; return; }
      }
      if(card) card.classList.add("image-error");
    }

    function showDonorPhoto(index) {
      if (!donorPhotos.length) return;
      donorPhotoIndex = (index + donorPhotos.length) % donorPhotos.length;
      renderDonorPhotoGallery();
    }

    function donorPhotoTouchStart(event) { donorPhotoTouchStartX = event.changedTouches?.[0]?.screenX || 0; }
    function donorPhotoTouchEnd(event) {
      const endX = event.changedTouches?.[0]?.screenX || 0;
      const diff = endX - donorPhotoTouchStartX;
      if (Math.abs(diff) > 45) showDonorPhoto(donorPhotoIndex + (diff < 0 ? 1 : -1));
    }

    /* =========================================================
       PWA INSTALL / MOBILE APP
       ========================================================= */
    let deferredInstallPrompt = null;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      document.documentElement.classList.add("pwa-install-ready");
      updateInstallButtonState();
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      document.documentElement.classList.remove("pwa-install-ready");
      updateInstallButtonState();
      toast("Poongurichi App installed successfully.");
    });

    function isIOSDevice() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    function isStandalonePWA() {
      return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function isSafariBrowser() {
      const ua = navigator.userAgent || "";
      return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(ua);
    }


    function updateInstallButtonState() {
      document.querySelectorAll(".install-app-top-btn, .install-menu-btn").forEach(btn => {
        btn.style.display = isStandalonePWA() ? "none" : "";
      });
      const androidBtn = document.getElementById("androidInstallButton");
      if (androidBtn) {
        if (deferredInstallPrompt) androidBtn.textContent = "⬇️ Install for Android";
        else if (isIOSDevice()) androidBtn.textContent = "🍎 Show iPhone Install Steps";
        else androidBtn.textContent = "📱 Install / Add to Home Screen";
      }
    }

    async function installAppNow() {
      if (isStandalonePWA()) return;
      if (deferredInstallPrompt) {
        try {
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice;
        } catch (error) { console.warn("Install prompt:",error); }
        deferredInstallPrompt=null; updateInstallButtonState(); return;
      }
      openInstallApp();
    }

    function openInstallApp() {
      const modal=document.getElementById("installAppModal");
      if(!modal) return;
      modal.classList.add("open"); modal.setAttribute("aria-hidden","false"); updateInstallButtonState();
      if(isIOSDevice()) showIOSInstallSteps();
    }
    function closeInstallApp(){ const modal=document.getElementById("installAppModal"); if(!modal)return; modal.classList.remove("open"); modal.setAttribute("aria-hidden","true"); }
    function closeInstallAppOutside(event){ if(event.target?.id==="installAppModal") closeInstallApp(); }

    function showIOSInstallSteps(){
      const steps=document.getElementById("iosInstallSteps"); if(!steps)return;
      steps.hidden=false;
      steps.innerHTML=`<strong>iPhone / iPad:</strong> Open this page in <b>Safari</b> → tap <b>Share ⬆️</b> → <b>Add to Home Screen</b> → turn on <b>Open as Web App</b> → <b>Add</b>.<br><br><small>Apple installs this website as a web app; an unsigned .ipa file cannot be directly installed on a normal iPhone.</small>`;
    }

    function openInChromeForInstall(){
      const url=location.href;
      if(/Android/i.test(navigator.userAgent)){
        try { location.href=`intent://${url.replace(/^https?:\/\//,'')}#Intent;scheme=https;package=com.android.chrome;end`; return; } catch(_) {}
      }
      window.open(url,"_blank");
    }

    async function installAndroidApp(){
      if(isIOSDevice()){ showIOSInstallSteps(); return; }
      if(deferredInstallPrompt){
        try{ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; }
        catch(error){ console.warn("Install prompt:",error); }
        deferredInstallPrompt=null; updateInstallButtonState(); return;
      }
      if(/Android/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent)){
        openInChromeForInstall();
        return;
      }
      openInstallApp();
      toast("In Chrome, use ⋮ → Install app if the automatic prompt is not shown.");
    }

    updateInstallButtonState();

    /* =========================================================
       BACKGROUND BROWSER NOTIFICATIONS (FREE)
       ========================================================= */

    let lastNotificationIds = new Set();
    let notificationPollTimer = null;

    function updateNotificationPermissionUI(permission) {
      const btn = document.getElementById("enableNotificationBtn");
      const status = document.getElementById("notificationPermissionStatus");
      if (!btn || !status) return;
      btn.classList.remove("notification-enabled");
      if (!("Notification" in window)) {
        btn.textContent = "🔕 Notifications unavailable"; btn.disabled = true;
        status.textContent = "This browser does not support phone notifications."; return;
      }
      if (permission === "granted") {
        btn.textContent = "✓ Notifications Enabled"; btn.classList.add("notification-enabled"); btn.disabled = false;
        status.textContent = "Notifications are allowed for this website.";
      } else if (permission === "denied") {
        btn.textContent = "⚠️ Notifications Blocked"; btn.disabled = false;
        status.textContent = "Notifications are blocked. Allow them from your browser/site settings, then try again.";
      } else {
        btn.textContent = "🔔 Enable phone notifications"; btn.disabled = false;
        status.textContent = "Tap the button to allow browser notifications on this device.";
      }
    }

    async function enableBrowserNotifications() {
      if (!("Notification" in window)) { updateNotificationPermissionUI("unsupported"); toast("This browser does not support notifications."); return; }
      try {
        const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
        updateNotificationPermissionUI(permission);
        if (permission === "granted") {
          toast("✓ Notifications enabled successfully.");
          try { new Notification("Poongurichi Nanbargal", { body:"Notifications are now enabled on this device.", icon:"icons/icon-192.png", tag:"poongurichi-notification-enabled" }); } catch (_) {}
        } else if (permission === "denied") toast("⚠️ Notifications are blocked. Please allow them in browser site settings.");
      } catch (error) { updateNotificationPermissionUI(Notification.permission || "default"); toast("Unable to enable notifications. Please check browser permissions."); }
    }

    async function markNotificationAsRead(notificationId) {
      if (!notificationId) return;
      const index = APP_NOTIFICATIONS.findIndex(n => String(n.notificationId || n.Notification_ID || n.id || "") === String(notificationId));
      if (index >= 0) { APP_NOTIFICATIONS[index].readStatus = "Read"; APP_NOTIFICATIONS[index].Read_Status = "Read"; renderNotifications(); updateNotificationBadges(); }
      try {
        await BloodDonationAPI.markNotificationRead(notificationId, getAdminUserId ? getAdminUserId() : "");
      } catch (error) { console.warn("Mark notification read:", error); }
    }

    function notifyPhone(title, message) {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try { new Notification(title, { body: message, icon: "icons/icon-192.png", tag: "poongurichi-blood-request" }); } catch (_) {}
    }

    function processNewNotifications(list) {
      const ids = new Set(list.map(n => String(n.notificationId || n.Notification_ID || n.id || "")));
      if (!lastNotificationIds.size) { lastNotificationIds = ids; return; }
      list.forEach(n => {
        const id = String(n.notificationId || n.Notification_ID || n.id || "");
        if (id && !lastNotificationIds.has(id)) {
          const type = String(n.type || n.Type || "");
          if (type.toLowerCase() === "blood request") notifyPhone(n.title || "New Blood Request", n.message || "A new blood request was received.");
        }
      });
      lastNotificationIds = ids;
    }

    function startNotificationPolling() {
      clearInterval(notificationPollTimer);
      notificationPollTimer = setInterval(async () => {
        try {
          const result = await BloodDonationAPI.getNotifications("");
          const list = Array.isArray(result) ? result : (result?.notifications || result?.data || []);
          processNewNotifications(Array.isArray(list) ? list : []);
          APP_NOTIFICATIONS = Array.isArray(list) ? list : [];
          updateNotificationBadges();
        } catch (_) {}
      }, 30000);
    }


    /* =========================================================
       ADMIN DONOR PHOTOS
       ========================================================= */

    async function loadAdminDonorPhotos() {
      const box = document.getElementById("adminDonorPhotoTable");
      if (!box || !ensureAdminAccess()) return;
      try {
        const photos = await BloodDonationAPI.getDonorPhotos(true);
        if (!photos.length) { box.innerHTML = '<div class="admin-empty">No donor photos uploaded.</div>'; return; }
        box.innerHTML = `<table class="admin-table"><thead><tr><th>Photo</th><th>Title</th><th>Order</th><th>Status</th><th>Action</th></tr></thead><tbody>${photos.map(photo => `
          <tr><td><img src="${escapeAttribute(photo.imageUrl || '')}" alt="" style="width:72px;height:48px;object-fit:cover;border-radius:10px" loading="lazy"></td><td>${escapeHtml(photo.title || '—')}</td><td>${escapeHtml(photo.displayOrder)}</td><td>${escapeHtml(photo.status || 'Published')}</td><td><button type="button" class="admin-danger-btn" onclick="adminDeleteDonorPhoto('${escapeAttribute(photo.photoId)}')">Delete</button></td></tr>`).join('')}</tbody></table>`;
      } catch (error) { box.innerHTML = '<div class="admin-empty error-text">Unable to load donor photos.</div>'; }
    }

    async function adminDeleteDonorPhoto(photoId) {
      if (!photoId || !ensureAdminAccess()) return;
      if (!confirm("Delete this donor photo?")) return;
      try { await BloodDonationAPI.deleteDonorPhoto(photoId, getAdminUserId()); toast("Donor photo deleted."); await loadAdminDonorPhotos(); await loadDonorPhotos(); }
      catch (error) { toast(error?.message || "Unable to delete donor photo."); }
    }

    document.getElementById("adminDonorPhotoForm")?.addEventListener("submit", async function(event) {
      event.preventDefault();
      if (!ensureAdminAccess()) return;
      const file = document.getElementById("adminDonorPhotoFile")?.files?.[0];
      const message = document.getElementById("adminDonorPhotoMessage");
      if (!file) { message.className = "form-message error"; message.textContent = "Please select a donor photo."; return; }
      if (file.size > 5 * 1024 * 1024) { message.className = "form-message error"; message.textContent = "Image is too large. Maximum 5 MB."; return; }
      try {
        message.className = "form-message success"; message.textContent = "Uploading photo…";
        const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(file); });
        const upload = await BloodDonationAPI.uploadDonorPhoto({ base64, mimeType: file.type, fileName: file.name, userId: getAdminUserId() });
        const title = String(this.elements.namedItem("Title")?.value || "").trim();
        const order = Number(this.elements.namedItem("Display_Order")?.value || 0);
        await BloodDonationAPI.createDonorPhoto({ title, imageUrl: upload.imageUrl, displayOrder: order, status: "Published" }, getAdminUserId());
        this.reset(); message.className = "form-message success"; message.textContent = "Donor photo added successfully.";
        await Promise.all([loadAdminDonorPhotos(), loadDonorPhotos()]);
      } catch (error) { message.className = "form-message error"; message.textContent = error?.message || "Unable to add donor photo."; }
    });



    /* =========================================================
       PNBDC WHOLE-APP LANGUAGE ENGINE — ENGLISH / TAMIL
       ========================================================= */
    const PNBDC_TRANSLATIONS = {
      "Home":"முகப்பு", "Become Donor":"நன்கொடையாளராக பதிவு", "Become a Donor":"நன்கொடையாளராக பதிவு செய்யுங்கள்", "Find Blood":"இரத்தம் தேடுங்கள்", "Find Blood / Donor":"இரத்தம் / நன்கொடையாளர் தேடல்", "Request Blood":"இரத்தம் கோருங்கள்", "About":"எங்களை பற்றி", "Admin Login":"நிர்வாகி உள்நுழைவு", "Install App":"ஆப்பை நிறுவுங்கள்", "Notifications":"அறிவிப்புகள்", "Language":"மொழி",
      "Community Blood Donor Network":"சமூக இரத்த நன்கொடையாளர் வலைப்பின்னல்", "One donation.":"ஒரு இரத்த தானம்.", "Many lives.":"பல உயிர்கள்.", "Connect people who need blood with people willing to help. Find a donor near you, become a donor, and make a real difference in your community.":"இரத்தம் தேவைப்படுபவர்களை உதவ முன்வரும் நன்கொடையாளர்களுடன் இணைக்கிறோம். அருகிலுள்ள நன்கொடையாளரைத் தேடி, நன்கொடையாளராக பதிவு செய்து, உங்கள் சமூகத்தில் உண்மையான மாற்றத்தை ஏற்படுத்துங்கள்.",
      "🔎 Find Blood":"🔎 இரத்தம் தேடுங்கள்", "🩸 Become a Donor":"🩸 நன்கொடையாளராக பதிவு செய்யுங்கள்", "🚨 Request Blood":"🚨 இரத்தம் கோருங்கள்", "SAVE LIVES":"உயிர்களைக் காப்போம்", "Registered donors":"பதிவு செய்த நன்கொடையாளர்கள்", "24/7":"24/7", "Community support":"சமூக ஆதரவு", "QUICK ACTIONS":"விரைவு செயல்கள்", "Search available donors by blood group and location.":"இரத்த வகை மற்றும் இருப்பிடத்தின் அடிப்படையில் கிடைக்கும் நன்கொடையாளர்களைத் தேடுங்கள்.", "Register your details and help someone in need.":"உங்கள் விவரங்களைப் பதிவு செய்து தேவைப்படுபவர்களுக்கு உதவுங்கள்.", "Need Blood?":"இரத்தம் தேவையா?", "Send a blood request to the donor network.":"நன்கொடையாளர் வலைப்பின்னலுக்கு இரத்தக் கோரிக்கையை அனுப்புங்கள்.",
      "EVENTS":"நிகழ்வுகள்", "Community":"சமூகம்", "Blood Camps & Events":"இரத்த தான முகாம்கள் மற்றும் நிகழ்வுகள்", "Blood donation camps and community activities.":"இரத்த தான முகாம்கள் மற்றும் சமூக செயல்பாடுகள்.", "View All →":"அனைத்தையும் பார்க்க →", "DONOR PHOTO GALLERY":"நன்கொடையாளர் புகைப்படத் தொகுப்பு", "Our Donors":"எங்கள் நன்கொடையாளர்கள்", "Our Donor Community":"எங்கள் நன்கொடையாளர் சமூகம்", "Celebrating the people who help save lives.":"உயிர்களைக் காப்பாற்ற உதவும் நபர்களைக் கொண்டாடுகிறோம்.", "BLOOD GROUP":"இரத்த வகை", "Availability":"கிடைக்கும் நிலை", "Blood Group Availability":"இரத்த வகை கிடைக்கும் நிலை", "Live member counts from registered donors.":"பதிவு செய்த நன்கொடையாளர்களின் தற்போதைய எண்ணிக்கை.", "Loading...":"ஏற்றப்படுகிறது...", "Total Donors":"மொத்த நன்கொடையாளர்கள்", "Camps / Events":"முகாம்கள் / நிகழ்வுகள்",
      "Blood donation is a voluntary act that can save a life. Be a hero — donate blood and help your community.":"இரத்த தானம் ஒரு உயிரைக் காப்பாற்றக்கூடிய தன்னார்வ செயலாகும். ஹீரோவாக இருங்கள் — இரத்த தானம் செய்து உங்கள் சமூகத்திற்கு உதவுங்கள்.",
      "🩸 Give Hope":"🩸 நம்பிக்கை கொடுங்கள்", "Become a Blood Donor":"இரத்த நன்கொடையாளராகுங்கள்", "Register your details with Poongurichi Nanbargal Blood Donors Club.":"Poongurichi Nanbargal Blood Donors Club-ல் உங்கள் விவரங்களைப் பதிவு செய்யுங்கள்.", "Name":"பெயர்", "Mobile":"கைபேசி எண்", "Alternate Mobile":"மாற்று கைபேசி எண்", "Email":"மின்னஞ்சல்", "Gender":"பாலினம்", "Male":"ஆண்", "Female":"பெண்", "Other":"மற்றவை", "Date of Birth":"பிறந்த தேதி", "District":"மாவட்டம்", "Town/Village":"நகரம் / கிராமம்", "City":"நகரம்", "Address":"முகவரி", "Last Donation Date":"கடைசி இரத்த தான தேதி", "Donor Photo":"நன்கொடையாளர் புகைப்படம்", "Aadhaar Number":"ஆதார் எண்", "Referred By":"பரிந்துரைத்தவர்", "Select":"தேர்ந்தெடுக்கவும்", "Select blood group":"இரத்த வகையைத் தேர்ந்தெடுக்கவும்", "New donor — no previous donation (NA)":"புதிய நன்கொடையாளர் — முன்பு இரத்த தானம் செய்யவில்லை (NA)", "Photo ready for ID card":"ID கார்டுக்கான புகைப்படம் தயாராக உள்ளது", "🩸 Register as Donor":"🩸 நன்கொடையாளராக பதிவு செய்யுங்கள்", "✓ Registration saved. Your ID card is ready.":"✓ பதிவு வெற்றிகரமாக சேமிக்கப்பட்டது. உங்கள் ID கார்டு தயாராக உள்ளது.", "⬇️ Download Donor ID Card":"⬇️ நன்கொடையாளர் ID கார்டை பதிவிறக்குங்கள்", "Cancel":"ரத்து", "Optional":"விருப்பம்", "* Mandatory":"* கட்டாயம்", "* Mandatory fields":"* கட்டாய புலங்கள்",
      "Find available registered donors by blood group and location.":"இரத்த வகை மற்றும் இருப்பிடத்தின் அடிப்படையில் பதிவு செய்த நன்கொடையாளர்களைத் தேடுங்கள்.", "All Blood Groups":"அனைத்து இரத்த வகைகளும்", "Search for available donors.":"கிடைக்கும் நன்கொடையாளர்களைத் தேடுங்கள்.", "Search":"தேடல்", "🚨 Urgent Help":"🚨 அவசர உதவி", "Submit a request and our donor network can help connect you with available donors.":"கோரிக்கையைச் சமர்ப்பிக்கவும்; எங்கள் நன்கொடையாளர் வலைப்பின்னல் கிடைக்கும் நன்கொடையாளர்களுடன் உங்களை இணைக்க உதவும்.", "Patient Name":"நோயாளியின் பெயர்", "No. of Units":"தேவையான அலகுகள்", "Contact Mobile":"தொடர்பு கைபேசி எண்", "Hospital":"மருத்துவமனை", "Additional Details":"கூடுதல் விவரங்கள்", "🚨 Submit Request":"🚨 கோரிக்கையைச் சமர்ப்பிக்கவும்",
      "❤️ Our Mission":"❤️ எங்கள் நோக்கம்", "About Poongurichi Nanbargal":"Poongurichi Nanbargal பற்றி", "A community-driven blood donor network created to make finding help easier when every minute matters.":"ஒவ்வொரு நிமிடமும் முக்கியமான நேரத்தில் உதவியை எளிதாகக் கண்டுபிடிக்க உருவாக்கப்பட்ட சமூக அடிப்படையிலான இரத்த நன்கொடையாளர் வலைப்பின்னல்.", "Together, we can make blood available when it matters most.":"மிகவும் தேவையான நேரத்தில் இரத்தம் கிடைக்க நாம் ஒன்றிணைந்து செயல்படலாம்.", "Our goal is to connect donors and people in need through a simple, accessible community platform.":"எளிமையான, அனைவரும் அணுகக்கூடிய சமூக தளத்தின் மூலம் நன்கொடையாளர்களையும் தேவைப்படுபவர்களையும் இணைப்பதே எங்கள் நோக்கம்.", "Our Community":"எங்கள் சமூகம்", "Every registered donor helps strengthen the local donor network and makes it easier for families to find support.":"ஒவ்வொரு பதிவு செய்த நன்கொடையாளரும் உள்ளூர் நன்கொடையாளர் வலைப்பின்னலை வலுப்படுத்தி, குடும்பங்கள் உதவியை எளிதாகக் கண்டுபிடிக்க உதவுகிறார்.",
      "Administration":"நிர்வாகம்", "Admin Dashboard":"நிர்வாக டாஷ்போர்டு", "Manage donors, blood requests, upcoming events and About content.":"நன்கொடையாளர்கள், இரத்தக் கோரிக்கைகள், வரவிருக்கும் நிகழ்வுகள் மற்றும் About உள்ளடக்கத்தை நிர்வகிக்கவும்.", "🚪 Logout":"🚪 வெளியேறு", "Manage Donors":"நன்கொடையாளர்களை நிர்வகிக்கவும்", "Edit all donor details":"அனைத்து நன்கொடையாளர் விவரங்களையும் திருத்தவும்", "View active requests":"செயலில் உள்ள கோரிக்கைகளைப் பார்க்கவும்", "Add & upload photos":"புகைப்படங்களைச் சேர்த்து பதிவேற்றவும்", "Clear one or all":"ஒன்றை அல்லது அனைத்தையும் அழிக்கவும்", "🔗 Social Links":"🔗 சமூக இணைப்புகள்", "Edit social links":"சமூக இணைப்புகளைத் திருத்தவும்", "⚙️ Fields":"⚙️ புலங்கள்", "Edit all website fields":"அனைத்து இணையதள புலங்களையும் திருத்தவும்", "Registered Donors":"பதிவு செய்த நன்கொடையாளர்கள்", "View, edit and manage every registered donor record.":"ஒவ்வொரு பதிவு செய்த நன்கொடையாளர் பதிவையும் பார்க்க, திருத்த மற்றும் நிர்வகிக்கவும்.", "✕ Clear":"✕ அழிக்க", "Entries":"பதிவுகள்", "All":"அனைத்தும்", "📥 Import Excel":"📥 Excel இறக்குமதி", "📄 Excel Template":"📄 Excel மாதிரி", "📤 Export Excel":"📤 Excel ஏற்றுமதி", "Loading donors…":"நன்கொடையாளர்கள் ஏற்றப்படுகின்றனர்…", "🚨 Blood Requests":"🚨 இரத்தக் கோரிக்கைகள்", "Review active and submitted blood requests.":"செயலில் உள்ள மற்றும் சமர்ப்பிக்கப்பட்ட இரத்தக் கோரிக்கைகளைப் பரிசீலிக்கவும்.", "Loading requests…":"கோரிக்கைகள் ஏற்றப்படுகின்றன…", "📅 Add Event":"📅 நிகழ்வைச் சேர்க்கவும்", "Create a new upcoming blood donation event.":"புதிய வரவிருக்கும் இரத்த தான நிகழ்வை உருவாக்கவும்.", "Event Image":"நிகழ்வு படம்", "➕ Create Event":"➕ நிகழ்வை உருவாக்கவும்", "💙 Donor Photos":"💙 நன்கொடையாளர் புகைப்படங்கள்", "Add photos for the public donor gallery. Photos auto-rotate and support mobile swipe.":"பொது நன்கொடையாளர் புகைப்படத் தொகுப்பில் புகைப்படங்களைச் சேர்க்கவும். புகைப்படங்கள் தானாக மாறும் மற்றும் மொபைல் ஸ்வைப் வசதி உள்ளது.", "Photo Title":"புகைப்படத் தலைப்பு", "Display Order":"காட்சி வரிசை", "➕ Add Donor Photo":"➕ நன்கொடையாளர் புகைப்படத்தைச் சேர்க்கவும்", "ℹ️ About Content":"ℹ️ About உள்ளடக்கம்", "Edit the public About section.":"பொது About பகுதியைத் திருத்தவும்.", "About Title":"About தலைப்பு", "About Content":"About உள்ளடக்கம்", "💾 Save About":"💾 About-ஐ சேமிக்கவும்", "Club Name":"கிளப் பெயர்", "Logo URL":"Logo URL", "Copyright Text":"காப்புரிமை உரை", "Header Subtitle":"Header துணைத்தலைப்பு", "Developer Name":"உருவாக்குநர் பெயர்", "Developer Contact":"உருவாக்குநர் தொடர்பு", "Blood Need Contact 1 Name":"இரத்தத் தேவைக்கான தொடர்பு 1 பெயர்", "Blood Need Contact 1 Phone":"இரத்தத் தேவைக்கான தொடர்பு 1 தொலைபேசி", "Blood Need Contact 2 Name":"இரத்தத் தேவைக்கான தொடர்பு 2 பெயர்", "Blood Need Contact 2 Phone":"இரத்தத் தேவைக்கான தொடர்பு 2 தொலைபேசி", "Instagram URL":"Instagram URL", "Facebook URL":"Facebook URL", "YouTube URL":"YouTube URL", "Gmail URL":"Gmail URL", "Footer Text":"Footer உரை", "Footer Description":"Footer விளக்கம்", "💾 Save Header & Footer":"💾 Header & Footer-ஐ சேமிக்கவும்", "📅 Existing Events":"📅 ஏற்கனவே உள்ள நிகழ்வுகள்", "Edit or remove events. Event images are uploaded securely by Admin.":"நிகழ்வுகளைத் திருத்தவும் அல்லது நீக்கவும். நிகழ்வு படங்கள் நிர்வாகியால் பாதுகாப்பாக பதிவேற்றப்படுகின்றன.", "Follow Us":"எங்களைப் பின்தொடருங்கள்", "Developed By":"உருவாக்கியது", "All rights reserved.":"அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.", "Donate":"தானம்", "Find":"தேடல்", "Request":"கோரிக்கை", "Edit Event":"நிகழ்வைத் திருத்தவும்", "Replace Event Image":"நிகழ்வு படத்தை மாற்றவும்", "Save":"சேமிக்கவும்", "Refresh":"புதுப்பிக்கவும்", "↻ Refresh":"↻ புதுப்பிக்கவும்"
    };

    let PNBDC_APP_LANGUAGE = localStorage.getItem("PNBDC_APP_LANGUAGE") || "en";
    const pnOriginalText = new WeakMap();
    let pnTranslating = false;

    function getAppLanguage(){ return PNBDC_APP_LANGUAGE === "ta" ? "ta" : "en"; }
    function containsTamilPNBDC(text){ return /[\u0B80-\u0BFF]/.test(String(text || "")); }
    function detectPNBDCTamilObject(obj){
      if (!obj || typeof obj !== "object") return false;
      return Object.keys(obj).some(k => containsTamilPNBDC(obj[k]));
    }
    function getDonorCardLanguage(donor){
      const stored = String(value(donor,"Language","language","Preferred_Language","preferredLanguage") || "").toLowerCase();
      if (stored === "ta" || stored === "tamil") return "ta";
      if (stored === "en" || stored === "english") return containsTamilPNBDC(donor?.Name) || containsTamilPNBDC(donor?.Address) || containsTamilPNBDC(donor?.City) || containsTamilPNBDC(donor?.District) ? "ta" : getAppLanguage();
      return detectPNBDCTamilObject(donor) ? "ta" : getAppLanguage();
    }
    function normalizePNText(text){ return String(text || "").replace(/\s+/g," ").trim(); }
    function translatePNTextNode(node, lang){
      if (!node || !node.parentElement) return;
      if (node.parentElement.closest("script,style,template")) return;
      let original = pnOriginalText.get(node);
      const current = node.nodeValue;
      if (original === undefined) { original = current; pnOriginalText.set(node, original); }
      const key = normalizePNText(original);
      if (!key) return;
      const translated = lang === "ta" ? (PNBDC_TRANSLATIONS[key] || key) : key;
      const leading = original.match(/^\s*/)?.[0] || "";
      const trailing = original.match(/\s*$/)?.[0] || "";
      node.nodeValue = leading + translated + trailing;
    }
    function translatePNAttributes(root, lang){
      const attrs=["placeholder","title","aria-label"];
      root.querySelectorAll?.("input,textarea,select,button,[title],[aria-label]").forEach(el=>{
        attrs.forEach(attr=>{
          if (!el.hasAttribute(attr)) return;
          const marker="data-pn-en-"+attr;
          const original=el.getAttribute(marker) ?? el.getAttribute(attr);
          el.setAttribute(marker, original);
          const key=normalizePNText(original);
          if (!key) return;
          el.setAttribute(attr, lang === "ta" ? (PNBDC_TRANSLATIONS[key] || key) : key);
        });
      });
    }
    function translatePNPage(){
      if (pnTranslating) return;
      pnTranslating=true;
      try {
        document.documentElement.setAttribute("data-language", getAppLanguage());
        const walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes=[]; let n; while(n=walker.nextNode()) nodes.push(n);
        nodes.forEach(node=>translatePNTextNode(node,getAppLanguage()));
        translatePNAttributes(document,getAppLanguage());
        const label=document.getElementById("languageBtnLabel"); if(label) label.textContent=getAppLanguage()==="ta"?"தமிழ்":"English";
        document.querySelectorAll(".language-menu button,.mobile-language-buttons button").forEach(b=>b.classList.toggle("active",b.dataset.lang===getAppLanguage()));
      } finally { pnTranslating=false; }
    }
    function toggleLanguageMenu(){
      const menu=document.getElementById("languageMenu"), btn=document.getElementById("languageBtn");
      if(!menu) return; const show=!menu.classList.contains("show"); menu.classList.toggle("show",show); btn?.setAttribute("aria-expanded",String(show));
    }
    function setAppLanguage(lang){
      PNBDC_APP_LANGUAGE = lang === "ta" ? "ta" : "en";
      localStorage.setItem("PNBDC_APP_LANGUAGE",PNBDC_APP_LANGUAGE);
      document.getElementById("languageMenu")?.classList.remove("show");
      document.getElementById("languageBtn")?.setAttribute("aria-expanded","false");
      translatePNPage();
      try { toast(PNBDC_APP_LANGUAGE === "ta" ? "மொழி தமிழ் ஆக மாற்றப்பட்டது." : "Language changed to English."); } catch(_) {}
    }
    document.addEventListener("click", function(e){
      const sw=document.getElementById("languageSwitcher");
      if(sw && !sw.contains(e.target)) document.getElementById("languageMenu")?.classList.remove("show");
    });
    const pnLanguageObserver = new MutationObserver((mutations)=>{
      if(pnTranslating || getAppLanguage()==="en") return;
      let needs=false;
      for(const m of mutations){ if(m.type==="childList" || m.type==="characterData" || m.type==="attributes"){ needs=true; break; } }
      if(needs) requestAnimationFrame(()=>translatePNPage());
    });
    function initializePNBDCLanguage(){
      translatePNPage();
      pnLanguageObserver.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});
    }

    /* =========================================================
       INITIALIZE
       ========================================================= */

    function registerPerformanceServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }, { once: true });
    }

    async function initializeApp() {

      document.getElementById(
        "currentYear"
      ).textContent =
        new Date().getFullYear();


      /*
        Load everything independently.
        If one backend function fails, the rest
        of the page remains usable.
      */

      await Promise.allSettled([

        loadSiteSettings(),

        loadDashboard(),

        loadBloodGroups(),

        loadEvents(),

        loadDonorPhotos()

      ]);

      startNotificationPolling();

      if (adminIsLoggedIn()) {
        goTo("admin");
        await loadAdminDashboard();
        await loadAdminDonorPhotos();
      }

    }


    document.addEventListener(
      "DOMContentLoaded",
      () => {
        registerPerformanceServiceWorker();
        initializePNBDCLanguage();
        initializeApp();
      }
    );


    /* =========================================================
       KEYBOARD
       ========================================================= */

    document.addEventListener(
      "keydown",
      function(event) {

        if (
          event.key === "Escape"
        ) {
          closeAdmin();
        }

      }
    );

(function(){
  function hideLoader(){
    const l=document.getElementById('pn-premium-loader');
    if(!l) return;
    setTimeout(()=>l.classList.add('hide'),650);
    setTimeout(()=>l.remove(),1200);
  }
  function motion(){
    document.querySelectorAll('.section-head,.stats-grid,.info-banner,.content-card,.pn-latest-updates,.page-section').forEach(el=>el.classList.add('pn-reveal'));
    document.querySelectorAll('.pn-latest-grid').forEach(el=>el.classList.add('pn-stagger'));
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('pn-visible');io.unobserve(e.target)}}),{threshold:.08});
    document.querySelectorAll('.pn-reveal').forEach(el=>io.observe(el));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{motion();hideLoader()}); else {motion();hideLoader()}
  window.addEventListener('load',hideLoader,{once:true});
})();
