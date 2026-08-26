// ============================================================
// BLOOD DONATION APP
// FRONTEND API CONNECTOR + ADMIN DONOR MANAGEMENT
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

    console.error("API connection error:", error);

    throw new Error(
      "Unable to connect to Google Apps Script."
    );
  }


  const text = await response.text();

  let result;

  try {

    result = JSON.parse(text);

  } catch (error) {

    console.error(
      "Invalid API response:",
      text
    );

    throw new Error(
      "Invalid response from Google Apps Script."
    );
  }


  if (!result || result.success !== true) {

    throw new Error(
      result && result.error
        ? result.error
        : "Request failed."
    );
  }


  return result;
}


// ============================================================
// ADMIN SESSION
// ============================================================

function getAdminUser() {

  try {

    const saved =
      localStorage.getItem(
        "bloodDonationAdmin"
      );

    if (!saved) {
      return null;
    }

    return JSON.parse(saved);

  } catch (error) {

    console.error(
      "Admin session error:",
      error
    );

    return null;
  }
}


function requireAdmin() {

  const admin =
    getAdminUser();

  if (!admin) {

    if (
      typeof showPage === "function"
    ) {
      showPage("adminLogin");
    }

    throw new Error(
      "Admin login required."
    );
  }

  return admin;
}


// ============================================================
// HEALTH CHECK
// ============================================================

async function testApi() {

  return await api("health");

}


// ============================================================
// REGISTER DONOR
// ============================================================

async function registerDonor(
  donor = {}
) {

  /*
   * IMPORTANT:
   * Status is NOT accepted from the public
   * donor registration form.
   *
   * Google Apps Script automatically creates
   * new donors as Active.
   */

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
          : "Yes"

    }
  );
}


// ============================================================
// GET DONORS
// ============================================================

async function getDonors() {

  const result =
    await api("getDonors");

  return Array.isArray(
    result.donors
  )
    ? result.donors
    : [];
}


// ============================================================
// SEARCH DONORS
// ============================================================

async function searchDonors(
  filters = {}
) {

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

  return Array.isArray(
    result.donors
  )
    ? result.donors
    : [];
}


// ============================================================
// CREATE BLOOD REQUEST
// ============================================================

async function createBloodRequest(
  request = {}
) {

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
    await api("getRequests");

  return Array.isArray(
    result.requests
  )
    ? result.requests
    : [];
}


// ============================================================
// DASHBOARD STATISTICS
// ============================================================

async function getDashboardStats() {

  const result =
    await api(
      "getDashboardStats"
    );

  return {
    success: true,
    stats: result.stats || {}
  };
}


// ============================================================
// DASHBOARD
// ============================================================

async function getDashboard() {

  const result =
    await api("getDashboard");

  return Array.isArray(
    result.dashboard
  )
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

async function registerUser(
  user = {}
) {

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
// ADMIN UPDATE DONOR
// ============================================================

async function updateDonor(
  donor = {}
) {

  const admin =
    requireAdmin();


  if (!donor.donorId) {

    throw new Error(
      "Donor ID is required."
    );
  }


  return await api(
    "updateDonor",
    {

      userId:
        admin.userId,

      donorId:
        donor.donorId,

      name:
        donor.name || "",

      mobile:
        donor.mobile || "",

      email:
        donor.email || "",

      bloodGroup:
        donor.bloodGroup || "",

      gender:
        donor.gender || "",

      dob:
        donor.dob || "",

      district:
        donor.district || "",

      city:
        donor.city || "",

      address:
        donor.address || "",

      lastDonationDate:
        donor.lastDonationDate || "",

      available:
        donor.available || "Yes",

      status:
        donor.status || "Active"

    }
  );
}


// ============================================================
// ADMIN DELETE DONOR
// ============================================================

async function deleteDonor(
  donorId
) {

  const admin =
    requireAdmin();


  if (!donorId) {

    throw new Error(
      "Donor ID is required."
    );
  }


  return await api(
    "deleteDonor",
    {

      userId:
        admin.userId,

      donorId:
        donorId

    }
  );
}


// ============================================================
// ADMIN - LOAD DONORS
// ============================================================

async function loadAdminDonors() {

  const content =
    document.getElementById(
      "adminContent"
    );


  if (!content) {
    return;
  }


  const admin =
    getAdminUser();


  if (!admin) {

    if (
      typeof showPage === "function"
    ) {
      showPage("adminLogin");
    }

    return;
  }


  content.innerHTML = `
    <div class="card">
      <h3>🩸 Manage Donors</h3>
      <p>Admin can edit all donor information and change donor status.</p>
      <div class="empty">
        Loading donors...
      </div>
    </div>
  `;


  try {

    const donors =
      await getDonors();


    if (!donors.length) {

      content.innerHTML = `
        <div class="card">
          <h3>🩸 Manage Donors</h3>
          <div class="empty">
            No donors found.
          </div>
        </div>
      `;

      return;
    }


    content.innerHTML = `

      <div class="card">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:20px;
        ">

          <div>
            <h3 style="margin:0;">
              🩸 Manage Donors
            </h3>

            <p style="margin:5px 0 0;">
              ${donors.length} donor record(s)
            </p>
          </div>

          <button
            class="btn btn-blue"
            type="button"
            onclick="loadAdminDonors()">
            🔄 Refresh
          </button>

        </div>


        <div style="
          overflow-x:auto;
        ">

          <table style="
            width:100%;
            border-collapse:collapse;
            min-width:900px;
          ">

            <thead>

              <tr style="
                text-align:left;
                border-bottom:2px solid #ddd;
              ">

                <th style="padding:10px;">
                  Donor ID
                </th>

                <th style="padding:10px;">
                  Name
                </th>

                <th style="padding:10px;">
                  Blood Group
                </th>

                <th style="padding:10px;">
                  Mobile
                </th>

                <th style="padding:10px;">
                  City
                </th>

                <th style="padding:10px;">
                  Available
                </th>

                <th style="padding:10px;">
                  Status
                </th>

                <th style="padding:10px;">
                  Actions
                </th>

              </tr>

            </thead>


            <tbody>

              ${donors.map(
                function(donor) {

                  const donorId =
                    donor.donorId ||
                    donor.Donor_ID ||
                    "";

                  const name =
                    donor.name ||
                    donor.Name ||
                    "";

                  const bloodGroup =
                    donor.bloodGroup ||
                    donor.Blood_Group ||
                    "";

                  const mobile =
                    donor.mobile ||
                    donor.Mobile ||
                    "";

                  const city =
                    donor.city ||
                    donor.City ||
                    "";

                  const available =
                    donor.available ||
                    donor.Available ||
                    "Yes";

                  const status =
                    donor.status ||
                    donor.Status ||
                    "Active";


                  return `

                    <tr style="
                      border-bottom:1px solid #eee;
                    ">

                      <td style="padding:10px;">
                        ${escapeHtml(donorId)}
                      </td>

                      <td style="padding:10px;">
                        <strong>
                          ${escapeHtml(name)}
                        </strong>
                      </td>

                      <td style="padding:10px;">
                        <strong>
                          ${escapeHtml(bloodGroup)}
                        </strong>
                      </td>

                      <td style="padding:10px;">
                        ${escapeHtml(mobile)}
                      </td>

                      <td style="padding:10px;">
                        ${escapeHtml(city)}
                      </td>

                      <td style="padding:10px;">
                        ${escapeHtml(available)}
                      </td>

                      <td style="padding:10px;">
                        <span style="
                          display:inline-block;
                          padding:4px 9px;
                          border-radius:20px;
                          background:${
                            String(status)
                              .toLowerCase() ===
                            "active"
                              ? "#dcfce7"
                              : "#fee2e2"
                          };
                          color:${
                            String(status)
                              .toLowerCase() ===
                            "active"
                              ? "#166534"
                              : "#991b1b"
                          };
                          font-size:12px;
                          font-weight:600;
                        ">
                          ${escapeHtml(status)}
                        </span>
                      </td>

                      <td style="
                        padding:10px;
                        white-space:nowrap;
                      ">

                        <button
                          class="btn btn-blue"
                          type="button"
                          onclick='openAdminDonorEditor(${JSON.stringify(
                            donor
                          ).replace(/'/g, "&#39;")})'>
                          ✏️ Edit
                        </button>

                        <button
                          class="btn btn-danger"
                          type="button"
                          onclick='adminDeleteDonor(${JSON.stringify(
                            donorId
                          )})'>
                          🗑️ Delete
                        </button>

                      </td>

                    </tr>

                  `;

                }
              ).join("")}

            </tbody>

          </table>

        </div>

      </div>

    `;


  } catch (error) {

    console.error(
      "Admin donor loading error:",
      error
    );


    content.innerHTML = `

      <div class="card">

        <h3>Unable to load donors</h3>

        <p style="color:#b91c1c;">
          ${escapeHtml(
            error.message
          )}
        </p>

        <button
          class="btn btn-blue"
          type="button"
          onclick="loadAdminDonors()">
          Try Again
        </button>

      </div>

    `;
  }
}


// ============================================================
// ADMIN - EDIT DONOR
// ============================================================

function openAdminDonorEditor(
  donor
) {

  requireAdmin();


  const donorId =
    donor.donorId ||
    donor.Donor_ID ||
    "";

  const name =
    donor.name ||
    donor.Name ||
    "";

  const mobile =
    donor.mobile ||
    donor.Mobile ||
    "";

  const email =
    donor.email ||
    donor.Email ||
    "";

  const bloodGroup =
    donor.bloodGroup ||
    donor.Blood_Group ||
    "";

  const gender =
    donor.gender ||
    donor.Gender ||
    "";

  const dob =
    donor.dob ||
    donor.DOB ||
    "";

  const district =
    donor.district ||
    donor.District ||
    "";

  const city =
    donor.city ||
    donor.City ||
    "";

  const address =
    donor.address ||
    donor.Address ||
    "";

  const lastDonationDate =
    donor.lastDonationDate ||
    donor.Last_Donation_Date ||
    "";

  const available =
    donor.available ||
    donor.Available ||
    "Yes";

  const status =
    donor.status ||
    donor.Status ||
    "Active";


  const oldModal =
    document.getElementById(
      "adminDonorEditModal"
    );

  if (oldModal) {
    oldModal.remove();
  }


  const modal =
    document.createElement(
      "div"
    );


  modal.id =
    "adminDonorEditModal";


  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    background:rgba(0,0,0,.55);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    overflow:auto;
  `;


  modal.innerHTML = `

    <div style="
      width:min(900px,100%);
      max-height:90vh;
      overflow:auto;
      background:white;
      border-radius:16px;
      padding:25px;
      box-shadow:0 20px 60px rgba(0,0,0,.25);
    ">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:15px;
        margin-bottom:20px;
      ">

        <div>

          <h2 style="margin:0;">
            ✏️ Edit Donor
          </h2>

          <p style="margin:5px 0 0;color:#666;">
            Donor ID:
            <strong>
              ${escapeHtml(donorId)}
            </strong>
          </p>

        </div>

        <button
          type="button"
          class="btn btn-light"
          onclick="closeAdminDonorEditor()">
          ✕ Close
        </button>

      </div>


      <form
        id="adminDonorEditForm"
        onsubmit="saveAdminDonor(event)">

        <input
          type="hidden"
          id="editDonorId"
          value="${escapeHtml(donorId)}"
        >


        <div style="
          display:grid;
          grid-template-columns:
            repeat(auto-fit,minmax(250px,1fr));
          gap:15px;
        ">


          <div class="field">

            <label>
              Full Name
            </label>

            <input
              id="editDonorName"
              required
              value="${escapeHtml(name)}"
            >

          </div>


          <div class="field">

            <label>
              Mobile Number
            </label>

            <input
              id="editDonorMobile"
              required
              value="${escapeHtml(mobile)}"
            >

          </div>


          <div class="field">

            <label>
              Email
            </label>

            <input
              id="editDonorEmail"
              type="email"
              value="${escapeHtml(email)}"
            >

          </div>


          <div class="field">

            <label>
              Blood Group
            </label>

            <select
              id="editDonorBloodGroup"
              required
            >

              ${bloodGroupOptions(
                bloodGroup
              )}

            </select>

          </div>


          <div class="field">

            <label>
              Gender
            </label>

            <select
              id="editDonorGender"
            >

              <option value="">
                Select gender
              </option>

              <option
                value="Male"
                ${gender === "Male" ? "selected" : ""}
              >
                Male
              </option>

              <option
                value="Female"
                ${gender === "Female" ? "selected" : ""}
              >
                Female
              </option>

              <option
                value="Other"
                ${gender === "Other" ? "selected" : ""}
              >
                Other
              </option>

            </select>

          </div>


          <div class="field">

            <label>
              Date of Birth
            </label>

            <input
              id="editDonorDob"
              type="date"
              value="${escapeHtml(
                toInputDate(dob)
              )}"
            >

          </div>


          <div class="field">

            <label>
              District
            </label>

            <input
              id="editDonorDistrict"
              value="${escapeHtml(district)}"
            >

          </div>


          <div class="field">

            <label>
              City
            </label>

            <input
              id="editDonorCity"
              value="${escapeHtml(city)}"
            >

          </div>


          <div
            class="field"
            style="
              grid-column:
                1 / -1;
            "
          >

            <label>
              Address
            </label>

            <textarea
              id="editDonorAddress"
              rows="3"
            >${escapeHtml(address)}</textarea>

          </div>


          <div class="field">

            <label>
              Last Donation Date
            </label>

            <input
              id="editDonorLastDonation"
              type="date"
              value="${escapeHtml(
                toInputDate(lastDonationDate)
              )}"
            >

          </div>


          <div class="field">

            <label>
              Currently Available
            </label>

            <select
              id="editDonorAvailable"
            >

              <option
                value="Yes"
                ${available === "Yes" ? "selected" : ""}
              >
                Yes, I am available
              </option>

              <option
                value="No"
                ${available === "No" ? "selected" : ""}
              >
                No, not currently
              </option>

            </select>

          </div>


          <!-- ADMIN ONLY -->

          <div
            class="field"
            style="
              border:2px solid #fee2e2;
              padding:12px;
              border-radius:10px;
              background:#fffafa;
            "
          >

            <label>
              🔐 Status
              <small>
                (Admin Only)
              </small>
            </label>

            <select
              id="editDonorStatus"
            >

              <option
                value="Active"
                ${status === "Active" ? "selected" : ""}
              >
                Active
              </option>

              <option
                value="Inactive"
                ${status === "Inactive" ? "selected" : ""}
              >
                Inactive
              </option>

            </select>

          </div>


        </div>


        <div style="
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-top:25px;
          flex-wrap:wrap;
        ">

          <button
            type="button"
            class="btn btn-light"
            onclick="closeAdminDonorEditor()">
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-blue"
            id="saveDonorButton">
            💾 Save Changes
          </button>

        </div>


        <div
          id="adminEditMessage"
          style="margin-top:15px;"
        ></div>

      </form>

    </div>

  `;


  document.body.appendChild(
    modal
  );
}


// ============================================================
// ADMIN - SAVE DONOR
// ============================================================

async function saveAdminDonor(
  event
) {

  event.preventDefault();


  const button =
    document.getElementById(
      "saveDonorButton"
    );

  const message =
    document.getElementById(
      "adminEditMessage"
    );


  button.disabled = true;

  button.textContent =
    "Saving...";


  try {

    const donor = {

      donorId:
        document.getElementById(
          "editDonorId"
        ).value,

      name:
        document.getElementById(
          "editDonorName"
        ).value.trim(),

      mobile:
        document.getElementById(
          "editDonorMobile"
        ).value.trim(),

      email:
        document.getElementById(
          "editDonorEmail"
        ).value.trim(),

      bloodGroup:
        document.getElementById(
          "editDonorBloodGroup"
        ).value,

      gender:
        document.getElementById(
          "editDonorGender"
        ).value,

      dob:
        document.getElementById(
          "editDonorDob"
        ).value,

      district:
        document.getElementById(
          "editDonorDistrict"
        ).value.trim(),

      city:
        document.getElementById(
          "editDonorCity"
        ).value.trim(),

      address:
        document.getElementById(
          "editDonorAddress"
        ).value.trim(),

      lastDonationDate:
        document.getElementById(
          "editDonorLastDonation"
        ).value,

      available:
        document.getElementById(
          "editDonorAvailable"
        ).value,

      status:
        document.getElementById(
          "editDonorStatus"
        ).value

    };


    await updateDonor(
      donor
    );


    message.innerHTML = `
      <div style="
        padding:10px;
        border-radius:8px;
        background:#dcfce7;
        color:#166534;
      ">
        ✓ Donor updated successfully.
      </div>
    `;


    setTimeout(
      function() {

        closeAdminDonorEditor();

        loadAdminDonors();

        if (
          typeof loadHomeStats ===
          "function"
        ) {
          loadHomeStats();
        }

      },
      700
    );


  } catch (error) {

    console.error(
      "Update donor error:",
      error
    );


    message.innerHTML = `
      <div style="
        padding:10px;
        border-radius:8px;
        background:#fee2e2;
        color:#991b1b;
      ">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;


    button.disabled = false;

    button.textContent =
      "💾 Save Changes";
  }
}


// ============================================================
// ADMIN - DELETE DONOR
// ============================================================

async function adminDeleteDonor(
  donorId
) {

  requireAdmin();


  const confirmed =
    window.confirm(
      "Are you sure you want to delete this donor entry?\n\nDonor ID: " +
      donorId
    );


  if (!confirmed) {
    return;
  }


  try {

    await deleteDonor(
      donorId
    );


    alert(
      "Donor deleted successfully."
    );


    await loadAdminDonors();


    if (
      typeof loadHomeStats ===
      "function"
    ) {
      await loadHomeStats();
    }


  } catch (error) {

    console.error(
      "Delete donor error:",
      error
    );


    alert(
      "Unable to delete donor:\n" +
      error.message
    );
  }
}


// ============================================================
// CLOSE EDITOR
// ============================================================

function closeAdminDonorEditor() {

  const modal =
    document.getElementById(
      "adminDonorEditModal"
    );

  if (modal) {
    modal.remove();
  }
}


// ============================================================
// BLOOD GROUP OPTIONS
// ============================================================

function bloodGroupOptions(
  selected
) {

  const groups = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-"
  ];


  return `
    <option value="">
      Select blood group
    </option>

    ${groups.map(
      function(group) {

        return `
          <option
            value="${group}"
            ${selected === group
              ? "selected"
              : ""}
          >
            ${group}
          </option>
        `;

      }
    ).join("")}
  `;
}


// ============================================================
// DATE HELPER
// ============================================================

function toInputDate(
  value
) {

  if (!value) {
    return "";
  }


  const text =
    String(value);


  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return text;
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      date.getDate()
    ).padStart(2, "0");


  return (
    year +
    "-" +
    month +
    "-" +
    day
  );
}


// ============================================================
// REMOVE STATUS FROM PUBLIC DONOR FORM
// ============================================================

function removePublicDonorStatus() {

  const status =
    document.getElementById(
      "donorStatus"
    );


  if (!status) {
    return;
  }


  const field =
    status.closest(
      ".field"
    );


  if (field) {

    field.remove();

  } else {

    status.remove();

  }
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

  getDashboard,

  getSettings,

  registerUser,

  login,

  addDonation,

  getDonationHistory,

  getNotifications,

  addNotification,

  updateDonor,

  deleteDonor

};


// ============================================================
// GLOBAL ADMIN FUNCTIONS
// ============================================================

window.loadAdminDonors =
  loadAdminDonors;

window.openAdminDonorEditor =
  openAdminDonorEditor;

window.saveAdminDonor =
  saveAdminDonor;

window.adminDeleteDonor =
  adminDeleteDonor;

window.closeAdminDonorEditor =
  closeAdminDonorEditor;


// ============================================================
// PAGE START
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  async function() {

    /*
     * Remove Status from public
     * Become a Donor form.
     */
    removePublicDonorStatus();


    /*
     * Test API.
     */
    try {

      await testApi();

      console.log(
        "✓ Blood Donation API connected."
      );

    } catch (error) {

      console.error(
        "API connection failed:",
        error
      );

    }

  }
);
