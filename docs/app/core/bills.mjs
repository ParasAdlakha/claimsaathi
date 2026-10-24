// Sorts hospital bill lines into the categories insurers use when they settle a claim.
// Works the same on the sample bill and on lines the vision model reads off a photo.

// Expenses that move with the room category. Only these are cut in proportion when the
// room costs more than the policy allows (IRDAI Master Circular on Health Insurance, 2024).
export const ASSOCIATED = new Set(['room', 'nursing', 'doctor', 'procedure']);

const RULES = [
  // Non-payable first, so "gloves" never lands in consumables.
  { cat: 'nonpayable', why: 'comfort', re: /admission kit|toiletr|diaper|sanitary|slipper|comb|tooth|soap|towel|baby food|cosmetic/i },
  { cat: 'nonpayable', why: 'subsumed', re: /glove|mask|cotton|gauze|bed ?sheet|gown|tissue/i },
  { cat: 'nonpayable', why: 'admin', re: /registration|admission fee|documentation|medical records|file charge|service charge|mrd/i },
  { cat: 'nonpayable', why: 'attendant', re: /attendant|visitor|food and bev|telephone|laundry|television|tv charge/i },
  { cat: 'icu', re: /\bicu\b|iccu|intensive care|hdu|nicu/i },
  { cat: 'room', re: /room rent|bed charge|ward charge|room charge|boarding/i },
  { cat: 'nursing', re: /nursing/i },
  { cat: 'doctor', re: /surgeon|anaesth|anesth|consultant|doctor|physician|visit charge|professional fee/i },
  { cat: 'procedure', re: /operation theatre|\bot charge|procedure charge|cath lab|labour room/i },
  { cat: 'implants', re: /implant|stent|lens|iol|prosthe|pacemaker|plate|screw/i },
  { cat: 'consumables', re: /consumable|trocar|stapler|catheter|syringe|cannula|suture/i },
  { cat: 'pharmacy', re: /pharmacy|medicine|drug|injection|iv fluid|tablet/i },
  { cat: 'diagnostics', re: /diagnos|lab|cbc|x-?ray|usg|ultrasound|ct |ct$|mri|ecg|echo|pathology|radiology|test/i },
  { cat: 'ambulance', re: /ambulance/i },
];

export function classify(desc = '') {
  for (const r of RULES) if (r.re.test(desc)) return { category: r.cat, why: r.why || null };
  return { category: 'other', why: null };
}

export const CATEGORY_LABEL = {
  room: { en: 'Room rent', hi: 'कमरे का किराया' },
  nursing: { en: 'Nursing', hi: 'नर्सिंग' },
  icu: { en: 'ICU', hi: 'आईसीयू' },
  doctor: { en: 'Doctor and surgeon fees', hi: 'डॉक्टर और सर्जन की फीस' },
  procedure: { en: 'Operation theatre and procedure', hi: 'ऑपरेशन थिएटर और प्रोसीजर' },
  pharmacy: { en: 'Medicines', hi: 'दवाइयाँ' },
  consumables: { en: 'Surgical consumables', hi: 'सर्जिकल सामान' },
  implants: { en: 'Implants and devices', hi: 'इम्प्लांट और उपकरण' },
  diagnostics: { en: 'Tests and scans', hi: 'जाँच और स्कैन' },
  ambulance: { en: 'Ambulance', hi: 'एम्बुलेंस' },
  nonpayable: { en: 'Non-payable items', hi: 'जो भुगतान योग्य नहीं हैं' },
  other: { en: 'Other', hi: 'अन्य' },
};

// Why a non-payable line is refused, in plain words, both languages.
export const NONPAYABLE_REASON = {
  comfort: { en: 'Personal comfort item. IRDAI lists it as a non-medical expense.', hi: 'यह निजी सुविधा का सामान है। IRDAI इसे गैर-चिकित्सा खर्च मानता है।' },
  subsumed: { en: 'Already counted inside room or procedure charges, so it is not paid again.', hi: 'यह पहले से कमरे या प्रोसीजर के चार्ज में शामिल है, इसलिए दोबारा नहीं मिलता।' },
  admin: { en: 'Administrative charge. Insurers do not pay registration or paperwork fees.', hi: 'यह कागज़ी/रजिस्ट्रेशन शुल्क है। बीमा कंपनी इसे नहीं देती।' },
  attendant: { en: 'For the attendant, not the patient. Not a medical expense.', hi: 'यह साथ रहने वाले के लिए है, मरीज़ के इलाज के लिए नहीं।' },
};

// Accepts loose input (from a model or a form) and returns clean, numbered lines.
export function normalizeItems(items = []) {
  return items
    .map((it, i) => {
      const n = (v) => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
      const qty = n(it.qty) > 0 ? n(it.qty) : 1;
      const rate = n(it.rate);
      let amount = n(it.amount);
      if (!(amount > 0)) amount = qty * rate;
      const desc = String(it.desc || it.description || '').trim().slice(0, 140);
      const { category, why } = it.category && CATEGORY_LABEL[it.category] ? { category: it.category, why: it.why || classify(desc).why } : classify(desc);
      return { line: i + 1, desc, qty, rate: rate || Math.round(amount / qty), amount: Math.round(amount), category, why };
    })
    .filter((it) => it.desc && it.amount > 0);
}

export const days = (from, to) => {
  const d = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  return Number.isFinite(d) && d > 0 ? d : 1;
};
