// Reads an insurer's rejection or settlement letter, checks each deduction against the policy
// and the regulator's rules, and drafts the grievance and the escalation path.
import { inr } from './estimate.mjs';

const t = (en, hi) => ({ en, hi });
const money = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;

// Finds "label ... Rs 12,345" pairs in a letter. Indian digit grouping and multi-line labels are fine.
export function parseLetter(text = '') {
  const flat = text.replace(/\r/g, '');
  const grab = (re) => { const m = flat.match(re); return m ? money(m[1]) : null; };
  const claimed = grab(/amount claimed[^\d]*([\d,]+)/i);
  const approved = grab(/amount (?:approved|settled|paid)[^\d]*([\d,]+)/i);
  const deductions = [];
  const re = /less:\s*([\s\S]*?)(?:rs\.?|₹|inr)\s*([\d,]+)/gi;
  let m;
  while ((m = re.exec(flat))) deductions.push({ label: m[1].replace(/\s+/g, ' ').trim(), amount: money(m[2]) });
  const rejected = /repudiat|rejected|not admissible|denied/i.test(flat) && !approved;
  return { claimed, approved, deductions, rejected, text: flat };
}

// Each rule: how to spot the reason, and how to judge it.
const RULES = [
  {
    key: 'proportionate_on_all',
    test: (d, L) => /proportionate/i.test(d.label + L.text) && /total bill|entire bill|hospital bill|all expenses|pharmacy|medicine/i.test(d.label + L.text),
    judge: (ctx) => {
      const correct = ctx.est.totals.proportionate;
      const applied = ctx.deduction.amount;
      if (applied <= correct + 50) return null;
      return {
        verdict: 'contest',
        amount: Math.round((applied - correct) * (1 - ctx.est.copayPct / 100)),
        title: t('Proportionate deduction applied to the whole bill', 'आनुपातिक कटौती पूरे बिल पर लगाई गई'),
        why: t(
          `Your policy (clause 3.1) and the IRDAI Master Circular on Health Insurance Products (2024) allow the room-rent proportion only on room-linked costs: room, nursing, doctor and OT. Medicines, consumables, implants and tests must not be cut. The correct deduction is ${inr(correct)}, not ${inr(applied)}.`,
          `आपकी पॉलिसी (क्लॉज़ 3.1) और IRDAI मास्टर सर्कुलर (2024) के अनुसार आनुपातिक कटौती सिर्फ कमरे से जुड़े खर्च (कमरा, नर्सिंग, डॉक्टर, OT) पर लग सकती है। दवाइयाँ, सर्जिकल सामान, इम्प्लांट और जाँच पर नहीं। सही कटौती ${inr(correct)} है, ${inr(applied)} नहीं।`),
        clause: '3.1',
      };
    },
  },
  {
    key: 'proportionate',
    test: (d) => /proportionate|room rent/i.test(d.label),
    judge: () => ({ verdict: 'valid', amount: 0, title: t('Room above the limit', 'कमरा सीमा से ऊपर'), why: t('A room above 1% of the sum insured triggers a proportionate cut on room-linked costs. This part is in line with the policy.', 'बीमा राशि के 1% से महंगे कमरे पर कमरे से जुड़े खर्च में आनुपातिक कटौती होती है। यह हिस्सा पॉलिसी के अनुसार है।'), clause: '3.1' }),
  },
  {
    key: 'nonpayable',
    test: (d) => /non[- ]?payable|non[- ]?medical/i.test(d.label),
    judge: (ctx) => {
      const ours = ctx.est.totals.nonpayable;
      if (ctx.deduction.amount > ours + 50) return { verdict: 'review', amount: ctx.deduction.amount - ours, title: t('More non-payable items than expected', 'उम्मीद से ज़्यादा गैर-भुगतान योग्य मद'), why: t(`We count ${inr(ours)} of non-payable items on your bill; ask the insurer for the item-wise list behind ${inr(ctx.deduction.amount)}.`, `हमारे हिसाब से ${inr(ours)} के मद गैर-भुगतान योग्य हैं; ${inr(ctx.deduction.amount)} की मद-वार सूची माँगें।`), clause: '7.1' };
      return { verdict: 'valid', amount: 0, title: t('Non-payable items', 'गैर-भुगतान योग्य मद'), why: t('These items are on the IRDAI list of non-medical expenses. The deduction is in line with the policy.', 'ये मद IRDAI की गैर-चिकित्सा खर्च सूची में हैं। कटौती सही है।'), clause: '7.1' };
    },
  },
  {
    key: 'copay',
    test: (d) => /co-?pay/i.test(d.label),
    judge: () => ({ verdict: 'valid', amount: 0, title: t('Co-payment', 'को-पेमेंट'), why: t('Co-payment is a fixed policy term. Note it was recalculated on the corrected amount.', 'को-पेमेंट पॉलिसी की तय शर्त है। सही राशि पर इसे दोबारा गिना गया है।'), clause: '5.2' }),
  },
  {
    key: 'ambulance',
    test: (d) => /ambulance/i.test(d.label),
    judge: () => ({ verdict: 'valid', amount: 0, title: t('Ambulance limit', 'एम्बुलेंस सीमा'), why: t('Road ambulance is capped at ₹2,000 per hospitalisation.', 'एम्बुलेंस ₹2,000 प्रति भर्ती तक सीमित है।'), clause: '4.1' }),
  },
  {
    key: 'documents',
    test: (d, L) => /document|deficien|not submitted|awaited/i.test(d.label + L.text),
    judge: () => ({ verdict: 'fixable', amount: 0, title: t('Documents pending', 'दस्तावेज़ बाकी'), why: t('This is not a rejection. Send the listed documents within the time given and the claim is reopened.', 'यह अस्वीकृति नहीं है। बताए गए दस्तावेज़ समय पर भेजें, दावा फिर खुल जाएगा।'), clause: '8.2' }),
  },
];

export function review(policy, claim, est, letterText) {
  const letter = parseLetter(letterText);
  const findings = [];
  const seen = new Set();
  for (const d of letter.deductions) {
    for (const r of RULES) {
      if (seen.has(d.label + r.key) || !r.test(d, letter)) continue;
      const f = r.judge({ policy, claim, est, deduction: d, letter });
      if (!f) continue;
      findings.push({ key: r.key, deduction: d, ...f });
      seen.add(d.label + r.key);
      break;
    }
  }
  const recoverable = findings.filter((f) => f.verdict === 'contest').reduce((s, f) => s + f.amount, 0);
  return { letter, findings, recoverable, ourEstimate: est.totals.payable, letterText: grievanceLetter(policy, claim, est, letter, findings, recoverable), ladder: ladder(claim) };
}

export function grievanceLetter(policy, claim, est, letter, findings, recoverable) {
  const contest = findings.filter((f) => f.verdict === 'contest');
  if (!contest.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return `To,
The Grievance Redressal Officer
${policy.insurer}

Date: ${today}

Subject: Request to review short settlement of claim, policy ${policy.policyNumber}, patient ${claim.patient}

Dear Sir or Madam,

My claim for the hospitalisation of ${claim.patient} at ${claim.hospital} from ${claim.admission} to ${claim.discharge} (${claim.procedure}) was settled for ${inr(letter.approved || 0)} against a claim of ${inr(letter.claimed || est.totals.billed)}.

I request a review of the following deduction${contest.length > 1 ? 's' : ''}:

${contest.map((f, i) => `${i + 1}. ${f.deduction.label}: ${inr(f.deduction.amount)}
   ${f.why.en}`).join('\n\n')}

Applying the policy terms correctly, the admissible amount after co-payment is ${inr(est.totals.payable)}. I request payment of the balance of ${inr(recoverable)}.

Please acknowledge this grievance and reply within the timelines set by IRDAI. If the matter is not resolved, I will approach Bima Bharosa and the Insurance Ombudsman.

Enclosed: settlement advice, itemised final bill, discharge summary.

Yours faithfully,
${policy.holder}
Policy number: ${policy.policyNumber}
`;
}

export function ladder(claim) {
  return [
    { step: 1, who: t('Insurer Grievance Redressal Officer', 'बीमा कंपनी के शिकायत निवारण अधिकारी'), what: t('Send the letter above by email. Keep the acknowledgement number.', 'ऊपर का पत्र ईमेल करें। पावती संख्या संभाल कर रखें।'), when: t('Insurers must acknowledge in 3 days and resolve in 14 days.', 'कंपनी 3 दिन में पावती और 14 दिन में समाधान दे।') },
    { step: 2, who: t('Bima Bharosa (IRDAI)', 'बीमा भरोसा (IRDAI)'), what: t('Register the same grievance on bimabharosa.irdai.gov.in if the reply is late or unfair.', 'जवाब देर से आए या गलत हो तो bimabharosa.irdai.gov.in पर शिकायत दर्ज करें।'), when: t('After the insurer\'s reply, or 14 days without one.', 'कंपनी के जवाब के बाद, या 14 दिन तक जवाब न मिलने पर।') },
    { step: 3, who: t('Insurance Ombudsman', 'बीमा लोकपाल'), what: t('Free, no lawyer needed. Covers claims up to ₹50 lakh. File online at cioins.co.in.', 'मुफ्त, वकील की ज़रूरत नहीं। ₹50 लाख तक के दावे। cioins.co.in पर ऑनलाइन दर्ज करें।'), when: t('If no reply in 30 days or you are unhappy with it; within one year of the insurer\'s reply.', '30 दिन में जवाब न मिले या असंतोष हो; कंपनी के जवाब के एक साल के भीतर।') },
  ];
}
