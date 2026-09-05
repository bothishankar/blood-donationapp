
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const toggle = $("pn-bot-toggle"), panel = $("pn-bot-panel");
  const close = $("pn-bot-close"), form = $("pn-bot-form"), input = $("pn-bot-input");
  const messages = $("pn-bot-messages");

  if (!toggle || !panel || !form) return;

  const norm = s => String(s || "").toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s+]/gu, " ")
    .replace(/\s+/g, " ").trim();

  // Common Tamil/Thanglish variants + typo tolerance.
  const groups = {
    tamil: ["தமிழ்","tamil","tamizh","tami","taml"],
    donate: ["donate","donation","blood donation","give blood","ரத்த தானம்","இரத்த தானம்","ரத்தம் கொடுக்க","இரத்தம் கொடுக்க","ratham","ratham kudukka","blood kudukka","blood donate"],
    donor: ["donor","donors","நன்கொடையாளர்","நன்கொடையாளர்கள்","doner","donor search","find donor","donar"],
    request: ["blood request","request blood","தேவை","இரத்தம் தேவை","ரத்தம் தேவை","blood venum","blood venum","ratham venum","request"],
    register: ["register","become donor","join donor","பதிவு","நன்கொடையாளராக","donor register","regster"],
    eligibility: ["eligible","eligibility","can i donate","who can donate","தானம் செய்யலாமா","யார் தானம்","eligiblity","age","வயது"],
    id: ["id card","donor id","அடையாள அட்டை","idcard","pn bdc","pndbc","pnbdc"],
    notification: ["notification","notifications","அறிவிப்பு","அறிவிப்புகள்","notificaton"],
    event: ["event","events","நிகழ்வு","நிகழ்வுகள்","camp","முகாம்"],
    contact: ["contact","phone","admin","தொடர்பு","தொலைபேசி","mobile","number"],
    help: ["help","what can you do","என்ன செய்யலாம்","உதவி","menu"]
  };

  function similarity(a,b){
    a=norm(a); b=norm(b);
    if(!a||!b) return 0;
    if(a.includes(b)||b.includes(a)) return 0.92;
    const aa=a.split(" "), bb=b.split(" ");
    let hit=0;
    aa.forEach(x=>bb.forEach(y=>{
      if(x.length>=3 && y.length>=3){
        const d=Math.abs(x.length-y.length);
        if(d<=1 && (x[0]===y[0] || x.slice(0,2)===y.slice(0,2))) hit++;
      }
    }));
    return hit / Math.max(aa.length,bb.length,1);
  }

  function has(group,q){
    const n=norm(q);
    return groups[group].some(k=>similarity(n,k)>=0.45);
  }

  function lang(q){
    if(/[அ-ஹ]/u.test(q)) return "ta";
    const n=norm(q);
    if(/\b(tamil|tamizh|thanglish|tanglish)\b/.test(n)) return "ta";
    try { return localStorage.getItem("pn_language")==="ta" ? "ta" : "en"; } catch(e){ return "en"; }
  }

  const replies = {
    en: {
      welcome:"Vanakkam! 👋 I’m PNBDC AI Assistant. You can ask in English, தமிழ் or Thanglish—even with spelling mistakes.",
      donate:"🩸 Blood donation helps save lives. For the exact medical eligibility decision, please follow the guidance of a qualified healthcare professional or the blood centre. I can explain the donation process and help you find the relevant PNBDC section.",
      donor:"🔎 I can help you use the Find Donor section. Choose the required blood group and location, then contact a matching donor through the app’s available contact flow. I won’t reveal private donor information beyond what the app already permits.",
      request:"🆘 To request blood, open Blood Request and provide patient name, hospital/medical centre, contact number, blood group, units required, district and location. Mark priority appropriately.",
      register:"📝 To become a donor, open Become a Donor, fill in your details, optionally add a photo, and submit. Your PNBDC donor ID card can then be prepared/downloaded.",
      eligibility:"ℹ️ Donation eligibility can depend on age, health, medications, recent donation and other factors. Use the app as guidance, not as a medical diagnosis; confirm with the blood centre/health professional.",
      id:"🪪 PNBDC donor IDs use the permanent format PNBDC000001, PNBDC000002, PNBDC000003… New IDs continue from the highest existing serial. The ID card can follow the selected Tamil/English language.",
      notification:"🔔 Open Notifications to view updates. If supported by your browser/device, you can enable notification permission there.",
      event:"📅 Open Events to see published blood-donation camps and club activities.",
      contact:"📞 For club contact details, open the About/Contact section. The assistant does not invent contact numbers.",
      help:"🩸 BothiAI can help with donor registration, finding donors, blood requests, donation guidance, PNBDC IDs/cards, notifications, events and app navigation. Ask naturally in English, தமிழ் or Thanglish."
    },
    ta: {
      welcome:"வணக்கம்! 👋 நான் PNBDC AI Assistant. தமிழ், English அல்லது Thanglish-ல் கேட்கலாம். Spelling mistake இருந்தாலும் புரிந்துகொள்ள முயற்சிப்பேன்.",
      donate:"🩸 இரத்த தானம் உயிரைக் காப்பாற்ற உதவும். தகுதி குறித்த இறுதி மருத்துவ முடிவுக்கு தகுதியான மருத்துவர் அல்லது இரத்த வங்கி/தான மையத்தின் ஆலோசனையைப் பின்பற்றுங்கள். தானம் செய்வது எப்படி என்பதையும் PNBDC-யில் தொடர்புடைய பகுதியையும் நான் வழிகாட்டலாம்.",
      donor:"🔎 Find Donor பகுதியில் தேவையான இரத்த வகை மற்றும் இடத்தைத் தேர்வு செய்து பொருத்தமான நன்கொடையாளரைத் தேடலாம். App அனுமதிக்கும் அளவுக்கு மட்டுமே donor தகவல்கள் காட்டப்படும்; தனிப்பட்ட தகவல்களை நான் வெளியிடமாட்டேன்.",
      request:"🆘 இரத்தம் தேவைப்பட்டால் Blood Request பகுதியைத் திறந்து நோயாளி பெயர், மருத்துவமனை, தொடர்பு எண், இரத்த வகை, தேவையான Units, மாவட்டம் மற்றும் இடம் போன்ற விவரங்களைச் சமர்ப்பிக்கலாம்.",
      register:"📝 நன்கொடையாளராக பதிவு செய்ய Become a Donor பகுதியைத் திறந்து விவரங்களை நிரப்பி Submit செய்யுங்கள். அதன் பிறகு PNBDC Donor ID Card தயாரித்து Download செய்யலாம்.",
      eligibility:"ℹ️ இரத்த தான தகுதி வயது, உடல்நிலை, மருந்துகள், கடைசி தானம் மற்றும் பிற காரணிகளைப் பொறுத்தது. App தகவலை வழிகாட்டியாக மட்டும் பயன்படுத்துங்கள்; இறுதி முடிவுக்கு மருத்துவர்/இரத்த தான மையத்தை அணுகுங்கள்.",
      id:"🪪 PNBDC Donor ID நிரந்தர வடிவம் PNBDC000001, PNBDC000002, PNBDC000003… என தொடரும். ஏற்கனவே உள்ள அதிகபட்ச serial-க்கு அடுத்த ID வழங்கப்படும். தேர்ந்தெடுத்த தமிழ்/English மொழிக்கு ஏற்ப ID Card label-களும் மாறும்.",
      notification:"🔔 Notifications பகுதியில் அறிவிப்புகளைப் பார்க்கலாம். Browser/device ஆதரித்தால் அங்கே notification permission-ஐ Enable செய்யலாம்.",
      event:"📅 Events பகுதியில் வெளியிடப்பட்ட இரத்த தான முகாம்கள் மற்றும் club நிகழ்வுகளைப் பார்க்கலாம்.",
      contact:"📞 Club தொடர்பு விவரங்களுக்கு About/Contact பகுதியைத் திறக்கவும். நான் கற்பனையாக contact number உருவாக்கமாட்டேன்.",
      help:"🩸 BothiAI: Donor registration, donor search, blood request, இரத்த தான வழிகாட்டுதல், PNBDC ID/Card, notifications, events மற்றும் app navigation ஆகியவற்றில் உதவலாம். தமிழ், English அல்லது Thanglish-ல் இயல்பாக கேளுங்கள்."
    }
  };

  function add(text, who){
    const d=document.createElement("div");
    d.className="pn-bot-msg "+who;
    d.textContent=text;
    messages.appendChild(d);
    messages.scrollTop=messages.scrollHeight;
  }

  function answer(q){
    const L=lang(q), r=replies[L];
    if(has("donate",q)) return r.donate;
    if(has("donor",q)) return r.donor;
    if(has("request",q)) return r.request;
    if(has("register",q)) return r.register;
    if(has("eligibility",q)) return r.eligibility;
    if(has("id",q)) return r.id;
    if(has("notification",q)) return r.notification;
    if(has("event",q)) return r.event;
    if(has("contact",q)) return r.contact;
    if(has("help",q)) return r.help;
    return L==="ta"
      ? "நான் புரிந்துகொண்ட அளவில் உதவுகிறேன். Donor, Blood Request, Registration, Eligibility, ID Card, Notification, Event அல்லது Contact பற்றி கேளுங்கள்."
      : "I can help with Donor, Blood Request, Registration, Eligibility, ID Card, Notifications, Events or Contact. You can ask in Tamil, English or Thanglish.";
  }

  toggle.addEventListener("click",()=>{
    panel.classList.toggle("open");
    panel.setAttribute("aria-hidden", panel.classList.contains("open") ? "false" : "true");
    if(panel.classList.contains("open")) input && input.focus();
  });
  close && close.addEventListener("click",()=>panel.classList.remove("open"));
  document.querySelectorAll("#pn-bot-suggestions button").forEach(b=>b.addEventListener("click",()=>{
    const q=b.getAttribute("data-q")||"";
    add(q,"user"); setTimeout(()=>add(answer(q),"bot"),180);
  }));
  form.addEventListener("submit",e=>{
    e.preventDefault();
    const q=(input.value||"").trim(); if(!q)return;
    add(q,"user"); input.value="";
    setTimeout(()=>add(answer(q),"bot"),180);
  });

  // Expose a tiny hook so the whole-web language system can refresh the assistant UI.
  window.PNBDCAI = {
    open:()=>{panel.classList.add("open"); input && input.focus();},
    ask:q=>{if(q){add(q,"user");setTimeout(()=>add(answer(q),"bot"),80);}},
    answer
  };
})();
