// The spoken side of ClaimSaathi: a short summary of the estimate, and answers to questions.
// Uses the model when a key is set; otherwise answers from the best-matching clause.
import { search } from './policy.mjs';
import { inr } from './estimate.mjs';
import * as ai from './ai.mjs';
import { aiEnabled } from './config.mjs';

export function summary(est, lang = 'en') {
  const T = est.totals;
  const pct = Math.round((T.payable / T.billed) * 100);
  if (!est.eligibility.admissible) {
    const f = est.eligibility.flags.find((x) => x.level === 'block');
    return lang === 'hi' ? `यह दावा शायद स्वीकार नहीं होगा। ${f.msg.hi} (क्लॉज़ ${f.clause})` : `This claim is likely to be refused. ${f.msg.en} (clause ${f.clause})`;
  }
  const parts = est.steps.filter((s) => s.amount < 0).map((s) => `${s.label[lang] || s.label.en} ${inr(-s.amount)}`);
  if (lang === 'hi') return `आपका बिल ${inr(T.billed)} का है। बीमा कंपनी लगभग ${inr(T.payable)} देगी, यानी ${pct}%। आपको लगभग ${inr(T.youPay)} खुद देने होंगे। कटौती: ${parts.join(', ')}।`;
  return `Your bill is ${inr(T.billed)}. The insurer is likely to pay about ${inr(T.payable)}, or ${pct}%. You would pay about ${inr(T.youPay)} yourself. Deductions: ${parts.join(', ')}.`;
}

export async function ask(index, question, est, lang = 'en') {
  if (/[ऀ-ॿ]/.test(question)) lang = 'hi';
  const hits = search(index, question, 4);
  const context = est ? { billed: est.totals.billed, likelyPayable: est.totals.payable, roomRatePerDay: est.roomRate, roomLimitPerDay: est.roomCap, copayPercent: est.copayPct, coveredMonths: est.eligibility.coveredMonths } : {};
  if (aiEnabled() && (hits.length || est)) {
    try {
      const { data, meta } = await ai.answer(question, hits.length ? hits : index.docs.slice(0, 6), context, lang);
      return { answer: data.answer, clauses: data.clauses, confident: data.confident, source: 'ai', meta, hits };
    } catch (e) {
      console.warn('ask: AI failed, using clause match:', e.message);
    }
  }
  if (!hits.length) {
    return { answer: lang === 'hi' ? 'आपकी पॉलिसी में इसका सीधा जवाब नहीं मिला। बीमा कंपनी की हेल्पलाइन से पूछें।' : 'I could not find this in your policy wording. Please check with the insurer\'s helpline.', clauses: [], confident: false, source: 'match', hits };
  }
  const top = hits[0];
  // For the two questions people ask most, answer with their own numbers, not just the clause.
  if (est && top.id === '3.1' && est.ratio < 1) {
    const pct = Math.round(est.ratio * 1000) / 10;
    return { answer: lang === 'hi'
      ? `नहीं। आपका कमरा ${inr(est.roomRate)} प्रतिदिन था और पॉलिसी ${inr(est.roomCap)} तक देती है। इसलिए कमरा, नर्सिंग, डॉक्टर और OT का सिर्फ ${pct}% मिलेगा: ${inr(est.totals.proportionate)} की कटौती। दवाइयाँ और जाँच पूरी मिलेंगी। (क्लॉज़ 3.1)`
      : `Not fully. Your room cost ${inr(est.roomRate)} a day and the policy pays up to ${inr(est.roomCap)}. So room, nursing, doctor and OT charges are paid at ${pct}%: a cut of ${inr(est.totals.proportionate)}. Medicines and tests are paid in full. (Clause 3.1)`, clauses: ['3.1'], confident: true, source: 'match', hits };
  }
  if (est && top.id === '5.2' && est.copayPct) {
    return { answer: lang === 'hi' ? `हाँ। मरीज़ की उम्र 60 से ज़्यादा है, इसलिए ${est.copayPct}% को-पेमेंट लगेगा: ${inr(est.totals.copay)}। (क्लॉज़ 5.2)` : `Yes. The patient is above 60, so a ${est.copayPct}% co-payment applies: ${inr(est.totals.copay)}. (Clause 5.2)`, clauses: ['5.2'], confident: true, source: 'match', hits };
  }
  const lead = lang === 'hi' ? `आपकी पॉलिसी का क्लॉज़ ${top.id} (${top.title}) कहता है:` : `Clause ${top.id} (${top.title}) of your policy says:`;
  return { answer: `${lead} ${top.text}`, clauses: [top.id], confident: top.score > 2, source: 'match', hits };
}
