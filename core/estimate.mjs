// Estimates what the insurer is likely to pay on a bill, line by line, and why.
// Pure functions: the same input always gives the same estimate, with a clause for every rupee cut.
// This is a pre-check for the customer, not a claim decision. The insurer or TPA decides.
import { ASSOCIATED, NONPAYABLE_REASON, normalizeItems, days } from './bills.mjs';

const t = (en, hi) => ({ en, hi });
export const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

const capPerDay = (rule, si) => (rule?.type === 'percentOfSI' ? (si * rule.value) / 100 : Number(rule?.value) || Infinity);

const monthsBetween = (from, to) => {
  const a = new Date(from), b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
};

// Checks that decide whether the claim is admissible at all.
export function eligibility(policy, claim) {
  const terms = policy.terms;
  const w = terms.waiting;
  const member = policy.insured.find((m) => m.name === claim.patient) || policy.insured[0];
  const flags = [];
  const covered = monthsBetween(member.coveredSince, claim.admission);
  const coveredDays = (Date.parse(claim.admission) - Date.parse(member.coveredSince)) / 86400000;
  const text = `${claim.diagnosis || ''} ${claim.procedure || ''}`.toLowerCase();

  if (Date.parse(claim.admission) < Date.parse(policy.start) || Date.parse(claim.admission) > Date.parse(policy.end)) {
    flags.push({ level: 'block', clause: '1.1', msg: t('The admission date is outside the policy period.', 'भर्ती की तारीख पॉलिसी अवधि से बाहर है।') });
  }
  if (coveredDays < w.initialDays && !claim.accident) {
    flags.push({ level: 'block', clause: w.clause.initial, msg: t(`Admitted ${Math.floor(coveredDays)} days after cover started; illnesses in the first ${w.initialDays} days are excluded.`, `कवर शुरू होने के ${Math.floor(coveredDays)} दिन बाद भर्ती; पहले ${w.initialDays} दिनों की बीमारी कवर नहीं होती।`) });
  }
  const specific = w.specificList.find((d) => text.includes(d));
  if (specific && covered < w.specificMonths) {
    flags.push({ level: 'block', clause: w.clause.specific, msg: t(`${specific} has a ${w.specificMonths}-month waiting period; you have ${covered} months of cover.`, `${specific} के लिए ${w.specificMonths} महीने की वेटिंग है; आपका कवर ${covered} महीने का है।`) });
  }
  if (claim.preExisting && covered < w.preExistingMonths) {
    flags.push({ level: 'block', clause: w.clause.preExisting, msg: t(`Pre-existing conditions are covered after ${w.preExistingMonths} months; you have ${covered}.`, `पहले से मौजूद बीमारी ${w.preExistingMonths} महीने बाद कवर होती है; आपका कवर ${covered} महीने का है।`) });
  }
  if (!flags.length) {
    flags.push({ level: 'ok', clause: w.clause.specific, msg: t(`Waiting periods passed: ${covered} months of continuous cover since ${member.coveredSince}.`, `वेटिंग पीरियड पूरे: ${member.coveredSince} से ${covered} महीने का लगातार कवर।`) });
  }
  return { member, coveredMonths: covered, flags, admissible: !flags.some((f) => f.level === 'block') };
}

export function estimate(policy, claim) {
  const terms = policy.terms;
  const si = terms.sumInsured;
  const items = normalizeItems(claim.items);
  const elig = eligibility(policy, claim);
  const stay = days(claim.admission, claim.discharge);

  const roomCap = capPerDay(terms.roomRentPerDay, si);
  const icuCap = capPerDay(terms.icuPerDay, si);
  const roomLines = items.filter((i) => i.category === 'room');
  const roomRate = roomLines.length ? Math.max(...roomLines.map((i) => i.amount / i.qty)) : 0;
  const ratio = roomRate > roomCap ? roomCap / roomRate : 1;

  const lines = items.map((it) => {
    const out = { ...it, payable: it.amount, cut: 0, reason: null, clause: null, kind: null };
    if (it.category === 'nonpayable') {
      Object.assign(out, { payable: 0, kind: 'nonpayable', clause: '7.1', reason: NONPAYABLE_REASON[it.why] || NONPAYABLE_REASON.admin });
    } else if (it.category === 'icu') {
      const cap = icuCap * it.qty;
      if (it.amount > cap) Object.assign(out, { payable: cap, kind: 'cap', clause: terms.icuPerDay.clause, reason: t(`ICU is paid up to ${inr(icuCap)} a day.`, `आईसीयू ${inr(icuCap)} प्रतिदिन तक मिलता है।`) });
    } else if (ASSOCIATED.has(it.category) && ratio < 1) {
      const pct = Math.round(ratio * 1000) / 10;
      const reason = it.category === 'room'
        ? t(`Your room cost ${inr(roomRate)} a day; the policy pays up to ${inr(roomCap)} (1% of sum insured).`, `आपका कमरा ${inr(roomRate)} प्रतिदिन था; पॉलिसी ${inr(roomCap)} तक देती है (बीमा राशि का 1%)।`)
        : t(`Cut to ${pct}% because the room was above the limit (proportionate deduction).`, `कमरा सीमा से महंगा था, इसलिए यह ${pct}% ही मिलेगा (आनुपातिक कटौती)।`);
      Object.assign(out, { payable: it.amount * ratio, kind: 'proportionate', clause: terms.roomRentPerDay.clause, reason });
    } else if (it.category === 'ambulance' && it.amount > 2000) {
      Object.assign(out, { payable: 2000, kind: 'cap', clause: '4.1', reason: t('Road ambulance is paid up to ₹2,000.', 'एम्बुलेंस ₹2,000 तक मिलती है।') });
    }
    out.payable = Math.round(out.payable);
    out.cut = it.amount - out.payable;
    return out;
  });

  const sum = (f) => lines.reduce((s, l) => s + f(l), 0);
  const billed = sum((l) => l.amount);
  const nonpayable = sum((l) => (l.kind === 'nonpayable' ? l.cut : 0));
  const proportionate = sum((l) => (l.kind === 'proportionate' ? l.cut : 0));
  const caps = sum((l) => (l.kind === 'cap' ? l.cut : 0));
  let admissible = billed - nonpayable - proportionate - caps;

  const steps = [{ key: 'billed', label: t('Hospital bill', 'अस्पताल का बिल'), amount: billed }];
  if (nonpayable) steps.push({ key: 'nonpayable', label: t('Non-payable items', 'भुगतान योग्य नहीं'), amount: -nonpayable, clause: '7.1' });
  if (proportionate) steps.push({ key: 'proportionate', label: t('Room above limit (proportionate)', 'कमरा सीमा से ऊपर (आनुपातिक)'), amount: -proportionate, clause: terms.roomRentPerDay.clause });
  if (caps) steps.push({ key: 'caps', label: t('Per-item limits', 'मद-वार सीमा'), amount: -caps });

  const text = `${claim.diagnosis || ''} ${claim.procedure || ''}`.toLowerCase();
  const sub = terms.subLimits.find((s) => s.match.some((m) => text.includes(m)));
  if (sub && admissible > sub.limit) {
    steps.push({ key: 'sublimit', label: t(`${sub.procedure} sub-limit`, `${sub.procedure} की उप-सीमा`), amount: -(admissible - sub.limit), clause: sub.clause });
    admissible = sub.limit;
  }

  let copayPct = 0; const copayClauses = [];
  for (const c of terms.copay) {
    if ((c.condition === 'ageAbove' && claim.age > c.value) || (c.condition === 'nonNetwork' && claim.network === false)) { copayPct += c.percent; copayClauses.push(c.clause); }
  }
  const copay = Math.round((admissible * copayPct) / 100);
  if (copay) steps.push({ key: 'copay', label: t(`Co-payment ${copayPct}%`, `को-पेमेंट ${copayPct}%`), amount: -copay, clause: copayClauses.join(', ') });
  let payable = admissible - copay;
  if (terms.deductible) { steps.push({ key: 'deductible', label: t('Deductible', 'डिडक्टिबल'), amount: -Math.min(payable, terms.deductible) }); payable = Math.max(0, payable - terms.deductible); }
  const remaining = claim.sumInsuredLeft ?? si;
  if (payable > remaining) { steps.push({ key: 'si', label: t('Sum insured exhausted', 'बीमा राशि खत्म'), amount: -(payable - remaining), clause: '1.1' }); payable = remaining; }
  if (!elig.admissible) { steps.push({ key: 'excluded', label: t('Claim excluded (waiting period)', 'दावा बाहर (वेटिंग पीरियड)'), amount: -payable }); payable = 0; }
  steps.push({ key: 'payable', label: t('Insurer likely pays', 'बीमा कंपनी लगभग देगी'), amount: payable });

  // What would have changed the outcome: the advice a friend in insurance would give.
  const tips = [];
  if (ratio < 1) {
    // The room itself would still cost the difference, but the proportionate cut on doctors,
    // OT and nursing disappears; co-payment would still apply to what is added back.
    const saved = Math.round((proportionate - roomLines.reduce((s, l) => s + (l.amount - roomCap * l.qty), 0)) * (1 - copayPct / 100));
    tips.push({ key: 'room', amount: saved, msg: t(`A room at or under ${inr(roomCap)} a day would have kept doctor, OT and nursing fees whole: about ${inr(saved)} more from the insurer, plus a cheaper room. Ask for that category at admission.`, `${inr(roomCap)} प्रतिदिन या उससे कम का कमरा लेने पर डॉक्टर, OT और नर्सिंग की पूरी राशि मिलती: बीमा कंपनी से लगभग ${inr(saved)} ज़्यादा, और कमरा भी सस्ता। भर्ती के समय यही श्रेणी माँगें।`) });
  }
  if (nonpayable) tips.push({ key: 'nonpayable', amount: nonpayable, msg: t(`${inr(nonpayable)} is for items no health policy pays. Many hospitals let you bring your own kit and toiletries.`, `${inr(nonpayable)} ऐसे सामान का है जो कोई पॉलिसी नहीं देती। कई अस्पताल अपना किट और सामान लाने देते हैं।`) });
  if (copay) tips.push({ key: 'copay', amount: copay, msg: t(`The ${copayPct}% co-payment is fixed by your policy terms for age above 60; it cannot be appealed.`, `${copayPct}% को-पेमेंट आपकी पॉलिसी की शर्त है (60 से अधिक उम्र); इस पर अपील नहीं हो सकती।`) });

  return {
    sample: Boolean(claim.sample && policy.sample),
    eligibility: elig,
    stay,
    roomCap, roomRate, ratio, copayPct,
    lines, steps,
    totals: { billed, nonpayable, proportionate, caps, copay, admissible, payable, youPay: billed - payable },
    tips,
  };
}
