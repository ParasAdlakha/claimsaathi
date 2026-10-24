// Policy wording: split into clauses, searched with BM25 so every answer can cite a clause.
// Also reads the few numbers that decide a settlement (room limit, co-pay, waiting periods)
// out of an uploaded wording, so a customer's own policy can replace the sample.

const STOP = new Set('the a an of to in for on and or is are be by with as at any this that from will your you my me i it its if not under per can where what how when which who do does did get got much many there was were have has should would could please'.split(' '));

// Hindi and Hinglish words customers actually use, mapped to the policy's English terms.
const HINDI = {
  'कमरा': 'room', 'कमरे': 'room', 'किराया': 'rent', 'किराए': 'rent', 'दवा': 'pharmacy medicine', 'दवाई': 'pharmacy medicine', 'दवाइयाँ': 'pharmacy medicine',
  'जाँच': 'diagnostics test', 'ऑपरेशन': 'surgery operation', 'मोतियाबिंद': 'cataract', 'घुटना': 'knee', 'पुरानी': 'pre-existing', 'बीमारी': 'disease illness',
  'वेटिंग': 'waiting period', 'इंतज़ार': 'waiting period', 'एम्बुलेंस': 'ambulance', 'कैशलेस': 'cashless', 'दस्तावेज़': 'documents', 'कागज़': 'documents',
  'शिकायत': 'grievance ombudsman', 'को-पेमेंट': 'co-payment', 'उम्र': 'age senior', 'आईसीयू': 'icu intensive care', 'भर्ती': 'hospitalisation admission',
  complain: 'grievance ombudsman', complaint: 'grievance ombudsman', appeal: 'grievance ombudsman', unfair: 'grievance ombudsman', reject: 'grievance ombudsman',
  papers: 'documents', paperwork: 'documents', deadline: 'intimation submit days', medicines: 'pharmacy', senior: 'senior age co-payment', old: 'age co-payment',
  kamra: 'room', kiraya: 'rent', dawai: 'pharmacy medicine', dawa: 'pharmacy medicine', jaanch: 'diagnostics', operation: 'surgery operation',
  bimari: 'disease illness', purani: 'pre-existing', shikayat: 'grievance ombudsman', kagaz: 'documents', bharti: 'hospitalisation admission',
};

export function tokenize(text = '') {
  let s = String(text).toLowerCase();
  for (const [k, v] of Object.entries(HINDI)) if (s.includes(k)) s += ' ' + v;
  return s.replace(/[^a-z0-9ऀ-ॿ%\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')));
}

export function buildIndex(clauses) {
  const docs = clauses.map((c) => ({ ...c, tokens: tokenize(`${c.title} ${c.title} ${c.text}`) }));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.tokens)) df.set(w, (df.get(w) || 0) + 1);
  const avg = docs.reduce((s, d) => s + d.tokens.length, 0) / Math.max(1, docs.length);
  return { docs, df, avg, n: docs.length };
}

export function search(index, query, k = 3) {
  const q = tokenize(query);
  const k1 = 1.4, b = 0.75;
  return index.docs
    .map((d) => {
      let score = 0;
      for (const w of q) {
        const f = d.tokens.filter((x) => x === w).length;
        if (!f) continue;
        const idf = Math.log(1 + (index.n - index.df.get(w) + 0.5) / (index.df.get(w) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.tokens.length) / index.avg)));
      }
      return { id: d.id, title: d.title, text: d.text, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}

// Splits raw wording into numbered clauses ("3.1 Room rent ...").
export function splitClauses(text = '') {
  const out = [];
  const re = /(?:^|\n)\s*(\d{1,2}(?:\.\d{1,2}){0,2})[.)]?\s+([^\n]{3,90})\n?([\s\S]*?)(?=\n\s*\d{1,2}(?:\.\d{1,2}){0,2}[.)]?\s+[A-Z]|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const body = (m[3] || '').replace(/\s+/g, ' ').trim();
    out.push({ id: m[1], title: m[2].trim().replace(/[:.]$/, ''), text: (body || m[2]).slice(0, 1200) });
  }
  if (out.length >= 3) return out;
  // No numbering: fall back to paragraphs.
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 40).slice(0, 200).map((p, i) => ({ id: `P${i + 1}`, title: p.slice(0, 60), text: p.slice(0, 1200) }));
}

const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));

// Reads the settlement-critical numbers. Anything not found keeps the sample's value, and is reported.
export function extractTerms(text, base) {
  const terms = structuredClone(base);
  const found = [];
  const s = text.replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/sum insured[^.]{0,40}?(?:rs\.?|₹|inr)\s*([\d,]{5,})/i))) { terms.sumInsured = num(m[1]); found.push('sumInsured'); }
  if ((m = s.match(/room[^.]{0,80}?(\d(?:\.\d)?)\s*%\s*of (?:the )?sum insured/i))) { terms.roomRentPerDay = { ...terms.roomRentPerDay, type: 'percentOfSI', value: Number(m[1]) }; found.push('roomRentPerDay'); }
  else if (/no (?:room rent )?(?:capping|limit|sub-?limit) on room/i.test(s) || /any room category/i.test(s)) { terms.roomRentPerDay = { ...terms.roomRentPerDay, type: 'fixed', value: Infinity }; found.push('roomRentPerDay'); }
  if ((m = s.match(/(?:icu|intensive care)[^.]{0,80}?(\d(?:\.\d)?)\s*%\s*of (?:the )?sum insured/i))) { terms.icuPerDay = { ...terms.icuPerDay, type: 'percentOfSI', value: Number(m[1]) }; found.push('icuPerDay'); }
  if ((m = s.match(/co-?pay(?:ment)?[^.]{0,80}?(\d{1,2})\s*%/i))) { terms.copay = [{ ...terms.copay[0], percent: Number(m[1]) }, ...terms.copay.slice(1)]; found.push('copay'); }
  if ((m = s.match(/pre-?existing[^.]{0,120}?(\d{2})\s*months/i))) { terms.waiting.preExistingMonths = Number(m[1]); found.push('preExistingMonths'); }
  return { terms, found };
}
