const API_URL = "https://script.google.com/macros/s/AKfycbx7gcSCqv4BNrzXpcVMrJnvYvJwR7xbL3Yus0MdtLjmD5wASeKqEj0JxrtkffojFQ/exec";
async function callAPI(action,data={}){
  const response=await fetch(API_URL,{method:"POST",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...data})});
  const text=await response.text();
  let result;
  try{result=JSON.parse(text);}catch{throw new Error("Invalid Google Apps Script response.");}
  if(result&&result.success===false)throw new Error(result.error||"Request failed.");
  return result;
}
window.BloodDonationAPI={
  getSettings:()=>callAPI("getSettings"),
  getDashboardStats:()=>callAPI("getDashboardStats"),
  getDonors:()=>callAPI("getDonors"),
  searchDonors:filters=>callAPI("searchDonors",filters),
  registerDonor:donor=>callAPI("registerDonor",donor),
  createBloodRequest:request=>callAPI("createRequest",request),
  getBloodRequests:()=>callAPI("getRequests"),
  login:(username,password)=>callAPI("login",{username,password}),
  saveSetting:(setting,value,userId)=>callAPI("saveSetting",{setting,value,userId}),
  deleteDonor:(donorId,userId)=>callAPI("deleteDonor",{donorId,userId}),
  deleteRequest:(requestId,userId)=>callAPI("deleteRequest",{requestId,userId})
};
