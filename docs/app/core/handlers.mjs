// Request handlers shared by the Node server and the browser-only build on GitHub Pages.
// Each takes a plain body and the sample data, and returns plain JSON.
import { config, aiEnabled } from './config.mjs';
import { estimate } from './estimate.mjs';
import { checklist, claimFormPartA } from './checklist.mjs';
import { review } from './grievance.mjs';
import { buildIndex, splitClauses, extractTerms } from './policy.mjs';
import { summary, ask } from './assist.mjs';
import { normalizeItems } from './bills.mjs';
import * as ai from './ai.mjs';

const fail = (msg, status) => Object.assign(new Error(msg), { status });

export function makeHandlers(sample, { pdfText } = {}) {
  // A policy from the browser is trusted only for its shape; missing parts fall back to the sample.
  const policyFrom = (p) => (p && p.terms && Array.isArray(p.clauses) && p.clauses.length ? { ...sample.policy, ...p, terms: { ...sample.policy.terms, ...p.terms } } : sample.policy);
  const claimFrom = (c) => (c && Array.isArray(c.items) && c.items.length ? { ...c, items: normalizeItems(c.items) } : sample.bill);

  return {
    'GET /api/status': () => ({ ai: aiEnabled(), model: aiEnabled() ? config.textModel : null, usage: ai.aiUsage() }),
    'GET /api/sample': () => sample,

    'POST /api/policy': async (b) => {
      if (b.pdfBase64 && !pdfText) throw fail('Reading PDFs needs the full app. Paste the policy text, or run it locally.', 501);
      const text = b.pdfBase64 ? await pdfText(b.pdfBase64) : String(b.text || '');
      if (text.trim().length < 200) throw fail('Could not read enough text from that policy. Try the PDF from your insurer, not a scan.', 422);
      const clauses = splitClauses(text);
      const { terms, found } = extractTerms(text, sample.policy.terms);
      const name = (text.match(/([A-Z][A-Za-z ]{3,40}(?:Health|Medi|Care|Shield|Secure)[A-Za-z ]{0,30})/) || [])[1]?.trim() || b.name || 'Your policy';
      return { policy: { ...sample.policy, id: 'uploaded', sample: false, name, clauses, terms }, found, clauseCount: clauses.length };
    },

    'POST /api/bill/read': async (b) => {
      if (!aiEnabled()) throw fail('Reading photos needs OPENAI_API_KEY. Use the sample bill to try the flow.', 503);
      const { data, meta } = await ai.readBill(b.images || []);
      if (data.quality === 'unreadable' || !data.items.length) throw fail('The photo was too blurry to read. Try again in good light, the whole bill in frame.', 422);
      const claim = { ...sample.bill, sample: false, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== 0)), items: normalizeItems(data.items), documents: ['final_bill'] };
      return { claim, meta };
    },

    'POST /api/estimate': (b) => {
      const policy = policyFrom(b.policy), claim = claimFrom(b.claim);
      const est = estimate(policy, claim);
      return { estimate: est, checklist: checklist(policy, claim, est), partA: claimFormPartA(policy, claim, est), summary: { en: summary(est, 'en'), hi: summary(est, 'hi') } };
    },

    'POST /api/ask': async (b) => {
      const policy = policyFrom(b.policy), claim = claimFrom(b.claim);
      return ask(buildIndex(policy.clauses), String(b.question || '').slice(0, 500), b.withEstimate === false ? null : estimate(policy, claim), b.lang || 'en');
    },

    'POST /api/review': async (b) => {
      let text = String(b.letterText || '');
      let meta = null;
      if (!text && b.letterImage) {
        if (!aiEnabled()) throw fail('Reading letter photos needs OPENAI_API_KEY. Paste the text instead.', 503);
        ({ data: { text }, meta } = await ai.readLetter(b.letterImage));
      }
      const policy = policyFrom(b.policy), claim = claimFrom(b.claim);
      return { ...review(policy, claim, estimate(policy, claim), text), meta };
    },

    'POST /api/translate': async (b) => {
      if (!aiEnabled()) throw fail('More languages need OPENAI_API_KEY. English and Hindi work offline.', 503);
      const { data, meta } = await ai.translate(String(b.text || '').slice(0, 2000), b.lang);
      return { text: data.text, meta };
    },
  };
}
