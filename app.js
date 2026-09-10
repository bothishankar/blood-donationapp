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
