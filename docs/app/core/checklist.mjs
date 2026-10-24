// What to submit, and by when. Missing paperwork is the most avoidable reason a claim is
// held up: IRDAI reports insurers disallowed 12.9% of health claims by value in FY24.

const t = (en, hi) => ({ en, hi });

export const DOCS = {
  claim_form: { label: t('Claim form (Part A, signed by you)', 'क्लेम फॉर्म (भाग A, आपके हस्ताक्षर)'), how: t('ClaimSaathi pre-fills it below. Print, sign, attach.', 'ClaimSaathi नीचे इसे भर देता है। प्रिंट करें, साइन करें, लगाएँ।') },
  claim_form_b: { label: t('Claim form Part B (filled by hospital)', 'क्लेम फॉर्म भाग B (अस्पताल भरेगा)'), how: t('Ask the hospital billing desk before you leave.', 'अस्पताल छोड़ने से पहले बिलिंग डेस्क से भरवाएँ।') },
  final_bill: { label: t('Original final bill with item-wise break-up', 'मूल फाइनल बिल, मद-वार विवरण के साथ'), how: t('A summary bill is not enough; ask for the itemised one.', 'सारांश बिल काफी नहीं; मद-वार बिल माँगें।') },
  payment_receipt: { label: t('Payment receipts', 'भुगतान की रसीदें'), how: t('Every advance and the final payment.', 'हर एडवांस और अंतिम भुगतान की।') },
  discharge_summary: { label: t('Discharge summary', 'डिस्चार्ज समरी'), how: t('Signed by the treating doctor, with diagnosis and dates.', 'इलाज करने वाले डॉक्टर के हस्ताक्षर, निदान और तारीखों के साथ।') },
  investigation_reports: { label: t('Test and scan reports', 'जाँच और स्कैन रिपोर्ट'), how: t('Reports for every test on the bill.', 'बिल में हर जाँच की रिपोर्ट।') },
  pharmacy_bills: { label: t('Pharmacy bills with prescriptions', 'दवा के बिल, पर्चे के साथ'), how: t('Each pharmacy bill needs the matching prescription.', 'हर दवा बिल के साथ उसका पर्चा।') },
  kyc: { label: t('KYC of the proposer (Aadhaar or PAN)', 'प्रस्तावक का KYC (आधार या PAN)'), how: t('Self-attested copy.', 'स्व-सत्यापित प्रति।') },
  bank: { label: t('Cancelled cheque or bank details for NEFT', 'कैंसल चेक या NEFT के लिए बैंक विवरण'), how: t('The account the money should go to.', 'जिस खाते में पैसा आना है।') },
  fir: { label: t('FIR or MLC copy (accidents only)', 'FIR या MLC की प्रति (केवल दुर्घटना)'), how: t('Needed when the admission follows an accident.', 'दुर्घटना के बाद भर्ती होने पर ज़रूरी।') },
  implant_sticker: { label: t('Implant invoice and sticker', 'इम्प्लांट का बिल और स्टिकर'), how: t('For stents, lenses and other implants.', 'स्टेंट, लेंस आदि के लिए।') },
};

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export function checklist(policy, claim, est) {
  const need = ['claim_form', 'claim_form_b', 'final_bill', 'payment_receipt', 'discharge_summary', 'investigation_reports', 'pharmacy_bills', 'kyc', 'bank'];
  if (claim.accident) need.push('fir');
  if (est?.lines?.some((l) => l.category === 'implants')) need.push('implant_sticker');
  const have = new Set(claim.documents || []);
  // ClaimSaathi drafts Part A itself, so it counts as ready.
  have.add('claim_form');
  const items = need.map((key) => ({ key, ...DOCS[key], ready: have.has(key) }));

  const terms = policy.terms;
  const deadlines = [];
  if (claim.admissionType === 'emergency') {
    deadlines.push({ key: 'intimate', by: iso(Date.parse(claim.admission) + terms.intimation.emergencyHours * 3600000), label: t(`Tell the insurer within ${terms.intimation.emergencyHours} hours of an emergency admission`, `आपातकालीन भर्ती के ${terms.intimation.emergencyHours} घंटे के भीतर बीमा कंपनी को सूचित करें`), clause: terms.intimation.clause });
  } else {
    deadlines.push({ key: 'intimate', by: iso(Date.parse(claim.admission) - terms.intimation.plannedHoursBefore * 3600000), label: t(`Tell the insurer ${terms.intimation.plannedHoursBefore} hours before a planned admission`, `नियोजित भर्ती से ${terms.intimation.plannedHoursBefore} घंटे पहले बीमा कंपनी को सूचित करें`), clause: terms.intimation.clause });
  }
  deadlines.push({ key: 'submit', by: iso(Date.parse(claim.discharge) + terms.submissionDays * DAY), label: t(`Submit the reimbursement file within ${terms.submissionDays} days of discharge`, `डिस्चार्ज के ${terms.submissionDays} दिन के भीतर रीइंबर्समेंट फ़ाइल जमा करें`), clause: '8.2' });
  deadlines.push({ key: 'post', by: iso(Date.parse(claim.discharge) + terms.postHospitalDays * DAY), label: t(`Follow-up bills for the same illness are covered until this date`, `इसी बीमारी के फॉलो-अप बिल इस तारीख तक कवर हैं`), clause: '2.2' });

  return { items, missing: items.filter((i) => !i.ready), deadlines };
}

// Part A of the standard claim form, pre-filled from what we already know.
export function claimFormPartA(policy, claim, est) {
  const member = est?.eligibility?.member || policy.insured[0];
  return {
    'A. Policy': { 'Policy number': policy.policyNumber, Insurer: policy.insurer, 'Product UIN': policy.uin, 'Sum insured': policy.terms.sumInsured },
    'B. Primary insured': { Name: policy.holder },
    'C. Patient': { Name: claim.patient, Age: claim.age, Relationship: member.relation, 'Covered since': member.coveredSince },
    'D. Hospitalisation': { Hospital: claim.hospital, 'Network hospital': claim.network ? 'Yes' : 'No', 'Admitted on': claim.admission, 'Discharged on': claim.discharge, 'Room category': claim.roomCategory || '', Diagnosis: claim.diagnosis, Procedure: claim.procedure, 'Admission type': claim.admissionType, 'Injury or accident': claim.accident ? 'Yes' : 'No' },
    'E. Claim': { 'Hospital expenses claimed': est?.totals?.billed ?? '', 'Pre-hospitalisation': 0, 'Post-hospitalisation': 0, 'Bill number': claim.billNumber || '' },
    'F. Bank (for NEFT)': { 'Account holder': policy.holder, 'Account number': '________________', IFSC: '___________' },
  };
}
