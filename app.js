// ============================================================
// BLOOD DONATION APP - GOOGLE APPS SCRIPT CONNECTOR
// ============================================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbx7gcSCqv4BNrzXpcVMrJnvYvJwR7xbL3Yus0MdtLjmD5wASeKqEj0JxrtkffojFQ/exec";


// ============================================================
// API HELPER
// ============================================================

async function api(action, data = {}) {

  const payload = {
    action: action,
    ...data
  };

  try {

    const response = await fetch(API_URL, {

      method: "POST",

      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },

      body: JSON.stringify(payload)

    });

    const text = await response.text();

    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {

      console.error("Invalid API response:", text);

      throw new Error(
        "Invalid response from Google Apps Script."
      );
    }

    if (!result.success) {

      throw new Error(
        result.error ||
        "Google Apps Script request failed."
      );
    }

    return result;

  } catch (error) {

    console.error(
      "API Error:",
      error
    );

    throw error;
  }
}


// ============================================================
// TEST API CONNECTION
// ============================================================

async function testApi() {

  try {

    const result =
      await api("health");

    console.log(
      "Google Apps Script connected:",
      result
    );

    return result;

  } catch (error) {

    console.error(
      "API connection failed:",
      error
    );

    return {
      success: false,
      error: error.message
    };
  }
}


// ============================================================
// REGISTER DONOR
// ============================================================

async function registerDonor(donor) {

  const data = {

    name:
      donor.name ||
      "",

    mobile:
      donor.mobile ||
      "",

    email:
      donor.email ||
      "",

    bloodGroup:
      donor.bloodGroup ||
      donor.blood_group ||
      donor.Blood_Group ||
      "",

    gender:
      donor.gender ||
      "",

    dob:
      donor.dob ||
      "",

    district:
      donor.district ||
      "",

    city:
      donor.city ||
      "",

    address:
      donor.address ||
      "",

    lastDonationDate:
      donor.lastDonationDate ||
      donor.last_donation_date ||
      "",

    available:
      donor.available !== undefined
        ? donor.available
        : "Yes",

    status:
      donor.status ||
      "Active"
  };


  console.log(
    "Sending donor to Google Sheets:",
    data
  );


  const result =
    await api(
      "registerDonor",
      data
    );


  console.log(
    "Donor successfully saved:",
    result
  );


  return result;
}


// ============================================================
// GET ALL DONORS
// ============================================================

async function getDonors() {

  const result =
    await api(
      "getDonors"
    );

  return result.donors || [];
}


// ============================================================
// SEARCH DONORS
// ============================================================

async function searchDonors(filters = {}) {

  const result =
    await api(
      "searchDonors",
      {

        bloodGroup:
          filters.bloodGroup ||
          "",

        district:
          filters.district ||
          "",

        city:
          filters.city ||
          "",

        available:
          filters.available !== undefined
            ? filters.available
            : true

      }
    );

  return result.donors || [];
}


// ============================================================
// CREATE BLOOD REQUEST
// ============================================================

async function createBloodRequest(request) {

  return await api(
    "createRequest",
    {

      patientName:
        request.patientName ||
        request.patient_name ||
        "",

      hospital:
        request.hospital ||
        "",

      contactNumber:
        request.contactNumber ||
        request.contact_number ||
        "",

      bloodGroup:
        request.bloodGroup ||
        request.blood_group ||
        "",

      unitsRequired:
        request.unitsRequired ||
        request.units_required ||
        "",

      district:
        request.district ||
        "",

      location:
        request.location ||
        "",

      priority:
        request.priority ||
        "Normal",

      requiredDate:
        request.requiredDate ||
        "",

      requiredTime:
        request.requiredTime ||
        "",

      description:
        request.description ||
        ""

    }
  );
}


// ============================================================
// GET BLOOD REQUESTS
// ============================================================

async function getBloodRequests() {

  const result =
    await api(
      "getRequests"
    );

  return result.requests || [];
}


// ============================================================
// DASHBOARD STATISTICS
// ============================================================

async function getDashboardStats() {

  return await api(
    "getDashboardStats"
  );
}


// ============================================================
// SETTINGS
// ============================================================

async function getSettings() {

  const result =
    await api(
      "getSettings"
    );

  return result.settings || {};
}


// ============================================================
// DASHBOARD
// ============================================================

async function getDashboard() {

  const result =
    await api(
      "getDashboard"
    );

  return result.dashboard || [];
}


// ============================================================
// USER REGISTRATION
// ============================================================

async function registerUser(user) {

  return await api(
    "register",
    {

      name:
        user.name ||
        "",

      mobile:
        user.mobile ||
        "",

      email:
        user.email ||
        "",

      username:
        user.username ||
        "",

      password:
        user.password ||
        "",

      role:
        user.role ||
        "user"

    }
  );
}


// ============================================================
// LOGIN
// ============================================================

async function login(username, password) {

  return await api(
    "login",
    {

      username:
        username,

      password:
        password

    }
  );
}


// ============================================================
// DONATION HISTORY
// ============================================================

async function addDonation(donation) {

  return await api(
    "addDonation",
    donation
  );
}


async function getDonationHistory(donorId = "") {

  const result =
    await api(
      "getHistory",
      {
        donorId: donorId
      }
    );

  return result.history || [];
}


// ============================================================
// NOTIFICATIONS
// ============================================================

async function getNotifications(userId = "") {

  const result =
    await api(
      "getNotifications",
      {
        userId: userId
      }
    );

  return result.notifications || [];
}


async function addNotification(notification) {

  return await api(
    "addNotification",
    notification
  );
}


// ============================================================
// GLOBAL EXPORT
// ============================================================

window.BloodDonationAPI = {

  api,

  testApi,

  registerDonor,

  getDonors,

  searchDonors,

  createBloodRequest,

  getBloodRequests,

  getDashboardStats,

  getSettings,

  getDashboard,

  registerUser,

  login,

  addDonation,

  getDonationHistory,

  getNotifications,

  addNotification

};


// ============================================================
// CONNECTION TEST
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  function() {

    testApi();

  }
);
