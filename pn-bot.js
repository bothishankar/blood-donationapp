(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const toggle = $('pn-bot-toggle');
  const panel = $('pn-bot-panel');
  const close = $('pn-bot-close');
  const back = $('pn-bot-back');
  const minimize = $('pn-bot-minimize');
  const form = $('pn-bot-form');
  const input = $('pn-bot-input');
  const messages = $('pn-bot-messages');

  if (!toggle || !panel || !form || !messages) return;

  const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function lang(q) {
    if (/[அ-ஹ]/u.test(String(q || ''))) return 'ta';
    const n = norm(q);
    if (/\b(tamil|tamizh|thanglish|tanglish)\b/.test(n)) return 'ta';
    try { return localStorage.getItem('pn_language') === 'ta' ? 'ta' : 'en'; }
    catch (e) { return 'en'; }
  }

  const replies = {
    en: {
      donate: `🩸 How to Donate Blood\n\n1. Check with a blood donation centre about your eligibility.\n2. Open the Become a Donor section in PNBDC if you want to register.\n3. Select a suitable blood donation camp or donation centre.\n4. Carry a valid ID if the centre requires it.\n5. Complete the centre's health screening.\n6. Donate only after the medical team confirms you can donate.\n7. Rest and follow the centre's after-donation instructions.\n\nPNBDC AI provides general guidance; the blood centre's medical team makes the final eligibility decision.`,
      donor: `🔎 How to Find a Donor\n\n1. Open Find Blood / Find Donor.\n2. Select the required blood group.\n3. Select the district.\n4. Select the city / area if available.\n5. Tap Search Donors.\n6. Review the available matching donors.\n7. Use only the contact information that PNBDC publicly permits.\n\nFor privacy, PNBDC AI will not reveal hidden donor information.`,
      register: `📝 How to Become a Donor\n\n1. Open Become a Donor.\n2. Enter your full name.\n3. Enter your date of birth.\n4. Select your blood group.\n5. Enter your mobile number.\n6. Enter your address/location details.\n7. Add an alternate mobile number if needed.\n8. Upload a photo if you want an ID card photo.\n9. Review all details.\n10. Tap Register.\n11. After successful registration, your PNBDC Donor ID is generated.\n12. Prepare/download your Donor ID Card.`,
      camps: `📅 How to Check Camps\n\n1. Open Camps & Events / Events.\n2. View the published upcoming camps.\n3. Open a camp to see its date, time and location.\n4. Contact the club if you need additional information.`,
      eligibility: `ℹ️ Who Can Donate Blood?\n\nBlood donation eligibility depends on the donor's age, health, recent donation history, medicines and the rules of the donation centre.\n\n1. Check the donation centre's current eligibility requirements.\n2. Complete the health screening before donation.\n3. Tell the medical team about relevant medicines or recent illness.\n4. Donate only when the medical team confirms eligibility.`,
      postpone: `⏸️ When Should Donation Be Postponed?\n\nDonation may need to be postponed for reasons such as recent illness, certain medicines or medical treatment, recent donation, or other conditions identified during screening.\n\n1. Tell the blood-centre medical team about your current health and medicines.\n2. Follow their screening decision.\n3. If they ask you to postpone, wait until they confirm that you can donate.\n\nThe blood centre should make the final medical decision.`,
      request: `🆘 How to Submit a Blood Request\n\n1. Open Blood Request.\n2. Select the required blood group.\n3. Enter the number of units required.\n4. Enter the patient name.\n5. Enter the hospital name.\n6. Enter the contact number.\n7. Enter the required date.\n8. Select the location/district.\n9. Add remarks if necessary.\n10. Review the information and submit the request.\n\nAfter submission, the request can be handled through the PNBDC notification/admin workflow.`,
      emergency: `🚨 Emergency Blood Requests\n\n1. Open Blood Request to submit a new urgent requirement.\n2. Enter the correct blood group and units required.\n3. Provide the patient, hospital and contact details.\n4. Select the appropriate priority.\n5. Submit the request.\n\nIf you need an existing emergency request, open the Blood Requests section in the app.`,
      id: `🪪 PNBDC Donor ID Card\n\n1. Complete donor registration successfully.\n2. Your permanent PNBDC Donor ID is generated.\n3. Open the ID Card option.\n4. Review the displayed donor details.\n5. Use Download or Share when available.\n\nPNBDC IDs follow the format PNBDC000001, PNBDC000002, PNBDC000003…`,
      notification: `🔔 Notifications\n\n1. Open the Notifications bell.\n2. Review new notifications.\n3. Tap a notification to open its available action.\n4. For a blood request notification, an authorised admin can use the Generate Request option when available.`,
      help: `🤖 PNBDC AI can help with:\n\n• Becoming a donor\n• Finding a donor\n• Blood requests\n• Donation eligibility guidance\n• When donation may need to be postponed\n• Donor ID cards\n• Camps and events\n• Notifications\n• App navigation\n\nAsk your question naturally in English, தமிழ் or Thanglish.`
    },
    ta: {
      donate: `🩸 இரத்த தானம் செய்வது எப்படி?\n\n1. முதலில் இரத்த தான மையத்தில் உங்கள் தகுதியை சரிபார்க்கவும்.\n2. PNBDC-ல் பதிவு செய்ய வேண்டுமெனில் Become a Donor பகுதியைத் திறக்கவும்.\n3. பொருத்தமான இரத்த தான முகாம் அல்லது தான மையத்தைத் தேர்வு செய்யவும்.\n4. தேவையான அடையாள ஆவணத்தை எடுத்துச் செல்லவும்.\n5. மருத்துவக் குழுவின் health screening-ஐ முடிக்கவும்.\n6. மருத்துவக் குழு தகுதி உறுதி செய்த பிறகே இரத்த தானம் செய்யவும்.\n7. தானத்திற்குப் பிறகு மையம் வழங்கும் வழிமுறைகளைப் பின்பற்றவும்.\n\nஇறுதி மருத்துவ தகுதி முடிவை இரத்த தான மையத்தின் மருத்துவக் குழுவே வழங்கும்.`,
      donor: `🔎 Donor-ஐ தேடுவது எப்படி?\n\n1. Find Blood / Find Donor பகுதியைத் திறக்கவும்.\n2. தேவையான Blood Group-ஐ தேர்வு செய்யவும்.\n3. District-ஐ தேர்வு செய்யவும்.\n4. City / Area கிடைத்தால் தேர்வு செய்யவும்.\n5. Search Donors என்பதை அழுத்தவும்.\n6. பொருத்தமான donors-ஐ பார்க்கவும்.\n7. PNBDC அனுமதிக்கும் contact தகவல்களை மட்டுமே பயன்படுத்தவும்.`,
      register: `📝 Donor-ஆக பதிவு செய்வது எப்படி?\n\n1. Become a Donor பகுதியைத் திறக்கவும்.\n2. Full Name உள்ளிடவும்.\n3. Date of Birth உள்ளிடவும்.\n4. Blood Group தேர்வு செய்யவும்.\n5. Mobile Number உள்ளிடவும்.\n6. Address / Location விவரங்களை உள்ளிடவும்.\n7. தேவையெனில் Alternate Mobile Number உள்ளிடவும்.\n8. ID Card photo வேண்டுமெனில் Photo upload செய்யவும்.\n9. அனைத்து விவரங்களையும் சரிபார்க்கவும்.\n10. Register அழுத்தவும்.\n11. பதிவு வெற்றியடைந்ததும் PNBDC Donor ID உருவாகும்.\n12. Donor ID Card-ஐ Download/Share செய்யலாம்.`,
      camps: `📅 Camps-ஐ பார்ப்பது எப்படி?\n\n1. Camps & Events / Events பகுதியைத் திறக்கவும்.\n2. வெளியிடப்பட்ட upcoming camps-ஐ பார்க்கவும்.\n3. ஒரு camp-ஐ திறந்து date, time, location பார்க்கவும்.\n4. கூடுதல் தகவலுக்கு club-ஐ தொடர்பு கொள்ளவும்.`,
      eligibility: `ℹ️ யார் இரத்த தானம் செய்யலாம்?\n\nஇரத்த தான தகுதி வயது, உடல்நிலை, சமீபத்திய தானம், மருந்துகள் மற்றும் தான மையத்தின் விதிமுறைகளைப் பொறுத்தது.\n\n1. தற்போதைய தகுதி விதிகளை தான மையத்தில் சரிபார்க்கவும்.\n2. Donation-க்கு முன் health screening செய்யவும்.\n3. மருந்துகள் அல்லது சமீபத்திய உடல்நலப் பிரச்சினைகள் இருந்தால் மருத்துவக் குழுவிடம் தெரிவிக்கவும்.\n4. மருத்துவக் குழு தகுதி உறுதி செய்த பிறகே தானம் செய்யவும்.`,
      postpone: `⏸️ எப்போது இரத்த தானத்தை ஒத்திவைக்க வேண்டும்?\n\nசமீபத்திய உடல்நலக்குறைவு, சில மருந்துகள்/மருத்துவ சிகிச்சைகள், சமீபத்திய இரத்த தானம் அல்லது screening-ல் கண்டறியப்படும் பிற காரணங்களால் தானம் ஒத்திவைக்கப்படலாம்.\n\n1. உங்கள் உடல்நிலை மற்றும் மருந்துகள் பற்றி மருத்துவக் குழுவிடம் தெரிவிக்கவும்.\n2. அவர்களின் screening முடிவைப் பின்பற்றவும்.\n3. ஒத்திவைக்கச் சொன்னால், மீண்டும் தானம் செய்யலாம் என்று அவர்கள் உறுதி செய்யும் வரை காத்திருக்கவும்.`,
      request: `🆘 Blood Request செய்வது எப்படி?\n\n1. Blood Request பகுதியைத் திறக்கவும்.\n2. தேவையான Blood Group தேர்வு செய்யவும்.\n3. தேவையான Units எண்ணிக்கையை உள்ளிடவும்.\n4. Patient Name உள்ளிடவும்.\n5. Hospital Name உள்ளிடவும்.\n6. Contact Number உள்ளிடவும்.\n7. Required Date உள்ளிடவும்.\n8. Location / District தேர்வு செய்யவும்.\n9. தேவையெனில் Remarks சேர்க்கவும்.\n10. விவரங்களை சரிபார்த்து Submit செய்யவும்.`,
      emergency: `🚨 அவசர Blood Request\n\n1. Blood Request பகுதியைத் திறக்கவும்.\n2. சரியான Blood Group மற்றும் Units உள்ளிடவும்.\n3. Patient, Hospital மற்றும் Contact விவரங்களை உள்ளிடவும்.\n4. பொருத்தமான Priority தேர்வு செய்யவும்.\n5. Request-ஐ Submit செய்யவும்.\n\nஏற்கனவே உள்ள emergency request-ஐ பார்க்க Blood Requests பகுதியைத் திறக்கவும்.`,
      id: `🪪 PNBDC Donor ID Card\n\n1. Donor registration-ஐ வெற்றிகரமாக முடிக்கவும்.\n2. நிரந்தர PNBDC Donor ID உருவாகும்.\n3. ID Card option-ஐ திறக்கவும்.\n4. விவரங்களை சரிபார்க்கவும்.\n5. Download அல்லது Share செய்யவும்.\n\nPNBDC ID வடிவம்: PNBDC000001, PNBDC000002, PNBDC000003…`,
      notification: `🔔 Notifications\n\n1. Notifications bell-ஐ திறக்கவும்.\n2. புதிய notifications-ஐ பார்க்கவும்.\n3. தேவையான notification-ஐ tap செய்யவும்.\n4. Blood Request notification என்றால், அனுமதியுள்ள Admin-க்கு Generate Request option கிடைக்கும்.`,
      help: `🤖 PNBDC AI உதவக்கூடியவை:\n\n• Donor registration\n• Donor search\n• Blood Request\n• Donation eligibility guidance\n• Donation postpone guidance\n• Donor ID Card\n• Camps & Events\n• Notifications\n• App navigation\n\nதமிழ், English அல்லது Thanglish-ல் கேளுங்கள்.`
    }
  };

  function matches(q, list) {
    const n = norm(q);
    return list.some(k => n.includes(norm(k)));
  }

  function intent(q) {
    const n = norm(q);
    if (matches(n, ['how can i donate','how to donate','donate blood','blood donation','ரத்த தானம்','இரத்த தானம்','ratham kudukka','blood kudukka'])) return 'donate';
    if (matches(n, ['find donor','find blood','donor search','search donor','doner','donar'])) return 'donor';
    if (matches(n, ['register as donor','become a donor','join donor','donor registration','how to register','பதிவு','நன்கொடையாளராக'])) return 'register';
    if (matches(n, ['upcoming camp','upcoming camps','next camp','blood donation camp','events','camp','முகாம்','நிகழ்வு'])) return 'camps';
    if (matches(n, ['who can donate','can i donate','eligible','eligibility','தகுதி','யார் தானம்','தானம் செய்யலாமா'])) return 'eligibility';
    if (matches(n, ['when should donation be postponed','when to postpone','postpone donation','donation postponed','ஒத்திவைக்க','தள்ளிப்போட'])) return 'postpone';
    if (matches(n, ['blood request','request blood','how to request','request blood','இரத்தம் தேவை','blood venum','request'])) return 'request';
    if (matches(n, ['emergency blood','emergency request','urgent blood','அவசர'])) return 'emergency';
    if (matches(n, ['id card','donor id','pn bdc','pnbdc id','அடையாள அட்டை'])) return 'id';
    if (matches(n, ['notification','notifications','அறிவிப்பு'])) return 'notification';
    if (matches(n, ['help','what can you do','உதவி'])) return 'help';
    return null;
  }

  function add(text, who) {
    const d = document.createElement('div');
    d.className = 'pn-bot-msg ' + who;
    d.textContent = text;
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
  }

  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    if (input) setTimeout(() => input.focus(), 80);
  }
  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }

  function navigateForIntent(type) {
    try {
      if (type === 'register' && typeof window.goTo === 'function') window.goTo('donor');
      else if (type === 'donor' && typeof window.goTo === 'function') window.goTo('find');
      else if (type === 'request' && typeof window.goTo === 'function') window.goTo('request');
      else if (type === 'camps' && typeof window.goTo === 'function') window.goTo('events');
    } catch (e) {}
  }

  function handleQuestion(q, navigate) {
    const type = intent(q);
    openPanel();
    add(q, 'user');
    if (navigate && type) navigateForIntent(type);
    setTimeout(() => add((replies[lang(q)] || replies.en)[type || 'help'], 'bot'), 120);
  }

  toggle.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
  if (close) close.addEventListener('click', closePanel);
  if (back) back.addEventListener('click', closePanel);
  if (minimize) minimize.addEventListener('click', closePanel);

  document.querySelectorAll('#pn-bot-suggestions button, .pn-bot-quick').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const q = this.getAttribute('data-q') || this.textContent.trim();
      handleQuestion(q, true);
    });
  });

  const seeAll = $('pn-bot-see-all');
  if (seeAll) {
    seeAll.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('#pn-bot-suggestions button').forEach(b => b.style.display = 'flex');
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = (input && input.value || '').trim();
    if (!q) return;
    input.value = '';
    handleQuestion(q, false);
  });

  window.PNBDCAI = {
    open: openPanel,
    close: closePanel,
    ask: q => { if (q) handleQuestion(q, false); },
    answer: q => {
      const type = intent(q);
      return (replies[lang(q)] || replies.en)[type || 'help'];
    }
  };
})();
