const API_URL =
  "https://script.google.com/macros/s/AKfycbx7gcSCqv4BNrzXpcVMrJnvYvJwR7xbL3Yus0MdtLjmD5wASeKqEj0JxrtkffojFQ/exec";

const ADMIN_KEY = "poongurichi_admin_session";

async function api(action, data = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...data
    })
  });

  const text = await response.text();

  let result;

  try {
    result = JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Google Apps Script returned an invalid response."
    );
  }

  if (result && result.success === false) {
    throw new Error(
      result.error || "Request failed."
    );
  }

  return result;
}


/* =========================================================
   ADMIN SESSION
   ========================================================= */

function adminSession() {
  try {
    return JSON.parse(
      sessionStorage.getItem(ADMIN_KEY) || "null"
    );
  } catch (error) {
    return null;
  }
}


function setAdminSession(user) {
  sessionStorage.setItem(
    ADMIN_KEY,
    JSON.stringify(user || {})
  );
}


function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_KEY);
}


/* =========================================================
   PUBLIC API
   ========================================================= */

window.BloodDonationAPI = {

  api,

  adminSession,

  setAdminSession,

  clearAdminSession,


  /* SETTINGS */

  getSettings: function () {
    return api("getSettings");
  },


  /* DASHBOARD */

  getDashboardStats: function () {
    return api("getDashboardStats");
  },


  /* DONORS */

  getDonors: function () {
    return api("getDonors");
  },


  searchDonors: function (filters = {}) {
    return api(
      "searchDonors",
      filters
    );
  },


  registerDonor: function (donor = {}) {
    return api(
      "registerDonor",
      donor
    );
  },


  /* BLOOD REQUESTS */

  createBloodRequest: function (request = {}) {
    return api(
      "createRequest",
      request
    );
  },


  getBloodRequests: function () {
    return api("getRequests");
  },


  /* ADMIN LOGIN */

  login: function (
    username,
    password
  ) {
    return api(
      "login",
      {
        username,
        password
      }
    );
  },


  /* ADMIN SETTINGS */

  saveSetting: function (
    setting,
    value,
    userId
  ) {
    return api(
      "saveSetting",
      {
        setting,
        value,
        userId
      }
    );
  },


  /* ADMIN DELETE DONOR */

  deleteDonor: function (
    donorId,
    userId
  ) {
    return api(
      "deleteDonor",
      {
        donorId,
        userId
      }
    );
  },


  /* ADMIN DELETE REQUEST */

  deleteRequest: function (
    requestId,
    userId
  ) {
    return api(
      "deleteRequest",
      {
        requestId,
        userId
      }
    );
  }

};
