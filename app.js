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

  let response;

  try {

    response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },

      body: JSON.stringify(payload)
    });

  } catch (error) {

    console.error("Network/API error:", error);

    throw new Error(
      "Cannot connect to Google Apps Script. Check the Apps Script deployment."
    );
  }


  const text = await response.text();

  let result;

  try {

    result = JSON.parse(text);

  } catch (error) {

    console.error(
      "Invalid Apps Script response:",
      text
    );

    throw new Error(
      "Google Apps Script returned an invalid response."
    );
  }


  if (!result || result.success !== true) {

    throw new Error(
      result && result.error
        ? result.error
        : "Google Apps Script request failed."
    );
  }


  return result;
}


// ============================================================
// HEALTH CHECK
// ============================================================

async function testApi() {

  return await api("health");

}


// ============================================================
// DONOR REGISTRATION
// ============================================================

async function registerDonor(donor = {}) {

  return await api(
    "registerDonor",
    {

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
        donor.Last_Donation_Date ||
        "",

      available:
        donor.available !== undefined
          ? donor.available
          : "Yes",

      status:
        donor.status ||
        "Active"

    }
  );

}


// ============================================================
// GET ALL DONORS
// ============================================================

async function getDonors() {

  const result =
    await api("getDonors");

  return Array.isArray(result.donors)
    ? result.donors
    : [];

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


  return Array.isArray(result.donors)
    ? result.donors
    : [];

}


// ============================================================
// CREATE BLOOD REQUEST
// ============================================================

async function createBloodRequest(request = {}) {

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
        1,

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
    await api("getRequests");

  return Array.isArray(result.requests)
    ? result.requests
    : [];

}


// ============================================================
// DASHBOARD STATISTICS
// ============================================================

async function getDashboardStats() {

  const result =
    await api("getDashboardStats");


  return {

    success: true,

    stats:
      result.stats ||
      {}

  };

}


// ============================================================
// DASHBOARD DATA
// ============================================================

async function getDashboard() {

  const result =
    await api("getDashboard");


  return Array.isArray(result.dashboard)
    ? result.dashboard
    : [];

}


// ============================================================
// SETTINGS
// ============================================================

async function getSettings() {

  const result =
    await api("getSettings");


  return result.settings || {};

}


// ============================================================
// USER REGISTRATION
// ============================================================

async function registerUser(user = {}) {

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

async function login(
  username,
  password
) {

  return await api(
    "login",
    {

      username:
        String(
          username || ""
        ).trim(),

      password:
        String(
          password || ""
        )

    }
  );

}


// ============================================================
// DONATION HISTORY
// ============================================================

async function addDonation(
  donation = {}
) {

  return await api(
    "addDonation",
    donation
  );

}


async function getDonationHistory(
  donorId = ""
) {

  const result =
    await api(
      "getHistory",
      {
        donorId: donorId
      }
    );


  return Array.isArray(
    result.history
  )
    ? result.history
    : [];

}


// ============================================================
// NOTIFICATIONS
// ============================================================

async function getNotifications(
  userId = ""
) {

  const result =
    await api(
      "getNotifications",
      {
        userId: userId
      }
    );


  return Array.isArray(
    result.notifications
  )
    ? result.notifications
    : [];

}


async function addNotification(
  notification = {}
) {

  return await api(
    "addNotification",
    notification
  );

}


// ============================================================
// GLOBAL API
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
  getDashboard,

  getSettings,

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
  async function () {

    try {

      const result =
        await testApi();

      console.log(
        "Blood Donation API connected:",
        result
      );

    } catch (error) {

      console.error(
        "Blood Donation API connection failed:",
        error
      );

    }

  }
);
