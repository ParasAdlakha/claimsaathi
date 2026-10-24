// ClaimSaathi browser app. Holds the policy and claim in memory; the server only computes.
const $ = (s) => document.querySelector(s);
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const S = { lang: 'en', extra: '', policy: null, claim: null, result: null, sample: null, ai: false, ready: new Set() };

const UI = {
  hi: {
    heroTitle: 'अस्पताल का बिल हाथ में है? क्लेम करने से <em>पहले</em> जानिए बीमा कंपनी कितना देगी।',
    heroSub: 'ClaimSaathi आपका बिल पढ़ता है, हर मद को आपकी पॉलिसी से मिलाता है, बताता है क्या कटेगा और क्यों, कौन से कागज़ बाकी हैं, और कंपनी कम पैसे दे तो शिकायत का पत्र भी तैयार करता है।',
    trySample: 'सैंपल क्लेम से आज़माएँ', useMine: 'अपना बिल इस्तेमाल करें',
    f1: 'हेल्थ क्लेम अस्वीकार या रोके गए, FY24', f2: 'पॉलिसीधारकों को क्लेम में दिक्कत आई', f3: 'लोकपाल के पास हेल्थ शिकायतें, FY24',
    s1: 'आपकी पॉलिसी', s1p: 'जिन नियमों से आपका क्लेम तय होगा', upPolicy: 'अपनी पॉलिसी अपलोड करें (PDF)',
    s2: 'अस्पताल का बिल', s2p: 'मद-वार फाइनल बिल की फोटो', photoTitle: '📷 बिल की फोटो लें', photoSub: 'मद-वार फाइनल बिल के सभी पन्ने। AI हर लाइन पढ़ता है।',
    sampleTitle: '🧾 सैंपल बिल इस्तेमाल करें', sampleSub: 'लैप्रोस्कोपिक अपेंडिक्स ऑपरेशन, 3 दिन, बेंगलुरु (काल्पनिक)', reading: 'आपका बिल पढ़ा जा रहा है…',
    item: 'मद', type: 'प्रकार', amount: 'राशि', changeBill: 'दूसरा बिल लें',
    s3: 'बीमा कंपनी लगभग कितना देगी', s3p: 'हर कटौती के पीछे पॉलिसी का क्लॉज़', billed: 'अस्पताल का बिल', insurerPays: 'बीमा कंपनी लगभग देगी', youPay: 'आपको देना होगा',
    tipsTitle: 'क्या करने से यह बदल सकता था', lineDetail: 'हर मद का कारण', billedCol: 'बिल', payCol: 'मिलेगा', cutCol: 'कटौती',
    disclaim: 'यह तैयारी के लिए अनुमान है, आपकी पॉलिसी और IRDAI नियमों के आधार पर। अंतिम फैसला बीमा कंपनी या TPA करती है।',
    s4: 'कागज़ और समय-सीमा', s5: 'आपका क्लेम पैक', s5p: 'क्लेम फॉर्म भाग A, भरा हुआ', print: 'क्लेम फॉर्म प्रिंट करें', packNote: 'हर जानकारी जाँचें, साइन करें, ऊपर के कागज़ लगाएँ।',
    s6: 'कंपनी ने कम दिया? पत्र जाँचें', s6p: 'सेटलमेंट या अस्वीकृति का पत्र चिपकाएँ', checkLetter: 'पत्र जाँचें', sampleLetter: 'सैंपल सेटलमेंट पत्र', letterPhoto: '📷 पत्र की फोटो',
    saathiSub: 'अपने क्लेम के बारे में कुछ भी पूछें', send: 'भेजें',
  },
};
const EN = {};
document.querySelectorAll('[data-i]').forEach((el) => { EN[el.dataset.i] = el.innerHTML; });
const tr = (key) => (S.lang === 'hi' && UI.hi[key]) || EN[key] || key;
const L = (o) => (o && typeof o === 'object' ? o[S.lang] || o.en : o);

const TEXT = {
  en: { ready: 'Ready', missing: 'missing', of: 'of', ready2: 'papers ready', contest: 'Contest', valid: 'Correct', review: 'Ask for details', fixable: 'Fixable',
    recover: 'You can ask for', recoverSub: 'more from the insurer, with the clause to back it.', nothing: 'Every deduction in this letter matches your policy. Nothing to contest.',
    draft: 'Your grievance letter, ready to send', copy: 'Copy letter', copied: 'Copied', path: 'If they still say no', clause: 'Clause',
    hello: 'Namaste! I am Saathi. Load a bill and I will tell you what your insurer is likely to pay, and why. Ask me anything, in English or Hindi, by typing or speaking.',
    sampleNote: 'Sample data: a fictional policy and hospital.', aiOff: 'AI off · offline mode', aiOn: 'AI on', thinking: 'Checking your policy…',
    quick: ['Why is my amount cut?', 'Is the room rent fully covered?', 'Which papers are missing?', 'Where can I complain?', 'Is cataract covered?'] },
  hi: { ready: 'तैयार', missing: 'बाकी', of: 'में से', ready2: 'कागज़ तैयार', contest: 'चुनौती दें', valid: 'सही', review: 'विवरण माँगें', fixable: 'ठीक हो सकता है',
    recover: 'आप माँग सकते हैं', recoverSub: 'और, पॉलिसी के क्लॉज़ के साथ।', nothing: 'इस पत्र की हर कटौती आपकी पॉलिसी के अनुसार है। चुनौती देने लायक कुछ नहीं।',
    draft: 'आपका शिकायत पत्र, भेजने के लिए तैयार', copy: 'पत्र कॉपी करें', copied: 'कॉपी हो गया', path: 'अगर फिर भी मना करें', clause: 'क्लॉज़',
    hello: 'नमस्ते! मैं साथी हूँ। बिल डालिए, मैं बताऊँगा कि बीमा कंपनी लगभग कितना देगी और क्यों। हिंदी या अंग्रेज़ी में, लिखकर या बोलकर, कुछ भी पूछिए।',
    sampleNote: 'सैंपल डेटा: काल्पनिक पॉलिसी और अस्पताल।', aiOff: 'AI बंद · ऑफ़लाइन', aiOn: 'AI चालू', thinking: 'आपकी पॉलिसी देख रहा हूँ…',
    quick: ['मेरी राशि क्यों कटी?', 'कमरे का किराया पूरा मिलेगा?', 'कौन से कागज़ बाकी हैं?', 'शिकायत कहाँ करें?', 'मोतियाबिंद कवर है?'] },
};
const X = (k) => TEXT[S.lang][k];

const CAT = {
  room: ['Room', 'कमरा'], nursing: ['Nursing', 'नर्सिंग'], icu: ['ICU', 'आईसीयू'], doctor: ['Doctor', 'डॉक्टर'], procedure: ['OT / procedure', 'OT'],
  pharmacy: ['Medicines', 'दवाइयाँ'], consumables: ['Consumables', 'सर्जिकल सामान'], implants: ['Implant', 'इम्प्लांट'], diagnostics: ['Tests', 'जाँच'],
  ambulance: ['Ambulance', 'एम्बुलेंस'], nonpayable: ['Non-payable', 'भुगतान योग्य नहीं'], other: ['Other', 'अन्य'],
};
const cat = (c) => (CAT[c] || CAT.other)[S.lang === 'hi' ? 1 : 0];

// The GitHub Pages build (docs/app) has no server: the same handlers run in the page.
let local = null;
async function api(path, body) {
  if (window.CLAIMSAATHI_STATIC) {
    local ||= await import('./static-api.mjs').then((m) => m.load());
    const h = local[`${body ? 'POST' : 'GET'} ${path}`];
    return h(body || {});
  }
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' }));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 4200);
}
const fileToDataUrl = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });

// Shrink phone photos before upload: bills read fine at 1800 px.
async function shrink(file, max = 1800) {
  const url = await fileToDataUrl(file);
  const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/* ---------- Language ---------- */
function applyLang() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = tr(el.dataset.i); });
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
  $('#q').placeholder = S.lang === 'hi' ? 'हिंदी या English में पूछें…' : 'Ask in English or हिंदी…';
  $('#letter').placeholder = S.lang === 'hi' ? 'बीमा कंपनी का सेटलमेंट या अस्वीकृति पत्र यहाँ चिपकाएँ…' : "Paste the insurer's settlement or rejection letter here…";
  renderQuick(); renderStatus();
  if (S.policy) renderPolicy();
  if (S.claim) renderBill();
  if (S.result) renderResult();
  if (S.review) renderReview();
}
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { S.lang = b.dataset.lang; S.extra = ''; $('#moreLang').value = ''; applyLang(); }));
$('#moreLang').addEventListener('change', async (e) => {
  const lang = e.target.value; if (!lang) return;
  if (!S.ai) { toast('More languages need an OpenAI key. English and Hindi work offline.'); e.target.value = ''; return; }
  if (!S.result) { toast('Load a bill first.'); e.target.value = ''; return; }
  const name = e.target.selectedOptions[0].textContent;
  bot(`…${name}`);
  try { const r = await api('/api/translate', { text: S.result.summary.en, lang }); bot(r.text, { speakLang: lang }); } catch (err) { bot(err.message); }
  e.target.value = '';
});

function renderStatus() {
  $('#aiChip').classList.toggle('on', S.ai);
  $('#aiChip span').textContent = S.ai ? X('aiOn') : X('aiOff');
}

/* ---------- Step 1: policy ---------- */
function renderPolicy() {
  const p = S.policy, t = p.terms;
  $('#polName').textContent = p.name;
  $('#polSample').hidden = !p.sample;
  $('#polMeta').textContent = `${p.insurer || ''} · ${p.policyNumber || ''} · ${(p.insured || []).map((m) => `${m.name} (${m.age})`).join(', ')}`;
  const room = t.roomRentPerDay.type === 'percentOfSI' ? `${t.roomRentPerDay.value}% SI = ${inr(t.sumInsured * t.roomRentPerDay.value / 100)}/day` : 'No limit';
  const hi = S.lang === 'hi';
  const items = [
    [hi ? 'बीमा राशि' : 'Sum insured', inr(t.sumInsured), '1.1'],
    [hi ? 'कमरे की सीमा' : 'Room rent limit', room, t.roomRentPerDay.clause],
    [hi ? 'को-पेमेंट' : 'Co-payment', t.copay.map((c) => `${c.percent}% ${c.condition === 'ageAbove' ? `${c.value}+` : (hi ? 'नॉन-नेटवर्क' : 'non-network')}`).join(', '), t.copay[0]?.clause],
    [hi ? 'पुरानी बीमारी वेटिंग' : 'Pre-existing wait', `${t.waiting.preExistingMonths} ${hi ? 'महीने' : 'months'}`, t.waiting.clause.preExisting],
    [hi ? 'विशेष बीमारी वेटिंग' : 'Specific diseases', `${t.waiting.specificMonths} ${hi ? 'महीने' : 'months'}`, t.waiting.clause.specific],
  ];
  $('#terms').innerHTML = items.map(([k, v, c]) => `<div class="term"><span>${k}</span><b>${esc(v)}</b><small>${X('clause')} ${esc(c || '–')}</small></div>`).join('');
  $('#policyStep').classList.add('done');
}

$('#policyFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    toast('Reading your policy…');
    const body = f.name.endsWith('.pdf') ? { pdfBase64: (await fileToDataUrl(f)).split(',')[1], name: f.name } : { text: await f.text(), name: f.name };
    const r = await api('/api/policy', body);
    S.policy = r.policy; renderPolicy();
    $('#polFound').textContent = `Read ${r.clauseCount} clauses. Found: ${r.found.join(', ') || 'none'}; anything not found uses typical values, so check the cards above.`;
    if (S.claim) await runEstimate();
  } catch (err) { toast(err.message); }
  e.target.value = '';
});

/* ---------- Step 2: bill ---------- */
function renderBill() {
  const c = S.claim;
  $('#billPick').hidden = true; $('#billOut').hidden = false; $('#scanning').hidden = true;
  const hi = S.lang === 'hi';
  $('#billMeta').innerHTML = [
    [hi ? 'मरीज़' : 'Patient', `${c.patient}, ${c.age}`], [hi ? 'अस्पताल' : 'Hospital', `${c.hospital}${c.network ? ' · network' : ''}`],
    [hi ? 'भर्ती' : 'Stay', `${c.admission} → ${c.discharge}`], [hi ? 'इलाज' : 'Treatment', c.procedure || c.diagnosis], [hi ? 'कमरा' : 'Room', c.roomCategory || '–'],
  ].map(([k, v]) => `<span>${k}: <b>${esc(v)}</b></span>`).join('') + (c.sample ? ` <span class="badge">${X('sampleNote')}</span>` : '');
  const rows = (S.result?.estimate.lines || c.items);
  $('#billRows').innerHTML = rows.map((l, i) => `<tr><td class="tiny">${i + 1}</td><td>${esc(l.desc)}</td><td><span class="cat ${l.category || ''}">${cat(l.category)}</span></td><td class="num">${inr(l.amount)}</td></tr>`).join('');
  $('#billStep').classList.add('done');
}

async function useSample() {
  S.claim = structuredClone(S.sample.bill);
  S.claim.documents = [...S.sample.bill.documents];
  $('#scanning').hidden = false; $('#billPick').hidden = true;
  await new Promise((r) => setTimeout(r, 900));
  await runEstimate();
}
$('#useSampleBill').addEventListener('click', useSample);
$('#trySample').addEventListener('click', async () => { await useSample(); document.querySelector('#estStep').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#changeBill').addEventListener('click', () => { $('#billPick').hidden = false; $('#billOut').hidden = true; });

$('#billFile').addEventListener('change', async (e) => {
  const files = [...e.target.files].slice(0, 4); if (!files.length) return;
  $('#billPick').hidden = true; $('#scanning').hidden = false;
  try {
    const images = await Promise.all(files.map((f) => shrink(f)));
    const r = await api('/api/bill/read', { images });
    S.claim = r.claim;
    bot(S.lang === 'hi' ? `${r.claim.items.length} लाइनें पढ़ीं (${(r.meta.ms / 1000).toFixed(1)} सेकंड)।` : `Read ${r.claim.items.length} lines from your bill in ${(r.meta.ms / 1000).toFixed(1)} s.`);
    await runEstimate();
  } catch (err) {
    $('#scanning').hidden = true; $('#billPick').hidden = false; toast(err.message);
  }
  e.target.value = '';
});

/* ---------- Step 3–5: estimate, documents, claim pack ---------- */
async function runEstimate() {
  S.result = await api('/api/estimate', { policy: S.policy.sample ? undefined : S.policy, claim: S.claim });
  S.ready = new Set((S.claim.documents || []).concat('claim_form'));
  S.review = null; $('#revOut').hidden = true;
  renderBill(); renderResult();
  ['estStep', 'docStep', 'pack', 'revStep'].forEach((id) => $('#' + id).classList.remove('locked'));
  const sum = S.result.summary[S.lang] || S.result.summary.en;
  bot(sum, { speak: true });
}

function renderResult() {
  const { estimate: e, checklist: c, partA } = S.result;
  const T = e.totals;
  $('#estOut').hidden = false;
  $('#flags').innerHTML = e.eligibility.flags.map((f) => `<div class="flag ${f.level === 'block' ? 'block' : ''}"><span>${f.level === 'block' ? '⛔' : '✅'}</span><span>${esc(L(f.msg))} <span class="clause" data-c="${f.clause}">${X('clause')} ${f.clause}</span></span></div>`).join('');
  $('#eBilled').textContent = inr(T.billed);
  $('#ePay').textContent = inr(T.payable);
  $('#eYou').textContent = inr(T.youPay);

  const parts = [
    ['payable', T.payable, 'var(--pay)', S.lang === 'hi' ? 'बीमा कंपनी' : 'Insurer'],
    ['copay', T.copay, '#e0a43a', S.lang === 'hi' ? 'को-पेमेंट' : 'Co-payment'],
    ['proportionate', T.proportionate, 'var(--cut)', S.lang === 'hi' ? 'आनुपातिक कटौती' : 'Room proportion'],
    ['nonpayable', T.nonpayable, '#8c2b22', S.lang === 'hi' ? 'गैर-भुगतान योग्य' : 'Non-payable'],
    ['caps', T.caps + (T.billed - T.payable - T.copay - T.proportionate - T.nonpayable - T.caps), '#b9b4a8', S.lang === 'hi' ? 'अन्य सीमाएँ' : 'Other limits'],
  ].filter((p) => p[1] > 0);
  $('#bar').innerHTML = parts.map((p) => `<i style="width:${(p[1] / T.billed) * 100}%;background:${p[2]}" title="${p[3]} ${inr(p[1])}"></i>`).join('');
  $('#legend').innerHTML = parts.map((p) => `<span><i style="background:${p[2]}"></i>${p[3]} ${inr(p[1])}</span>`).join('');

  $('#water').innerHTML = e.steps.map((s) => `<div><span>${esc(L(s.label))} ${s.clause ? `<span class="clause" data-c="${s.clause.split(',')[0]}">${X('clause')} ${esc(s.clause)}</span>` : ''}</span><span class="amt ${s.amount < 0 ? 'minus' : ''}">${s.amount < 0 ? '−' : ''}${inr(Math.abs(s.amount))}</span></div>`).join('');
  $('#tips').innerHTML = e.tips.map((t) => `<div class="tip"><b>${inr(t.amount)}</b><span>${esc(L(t.msg))}</span></div>`).join('');
  $('#estRows').innerHTML = e.lines.map((l) => `<tr class="${l.cut ? 'cut' : ''}"><td class="desc">${esc(l.desc)} <span class="cat ${l.category}">${cat(l.category)}</span>${l.reason ? `<span class="why">${esc(L(l.reason))} <span class="clause" data-c="${l.clause}">${X('clause')} ${l.clause}</span></span>` : ''}</td><td class="num">${inr(l.amount)}</td><td class="num">${inr(l.payable)}</td><td class="num ${l.cut ? 'minus' : ''}">${l.cut ? '−' + inr(l.cut) : '–'}</td></tr>`).join('');
  $('#estStep').classList.add('done');

  // Documents
  $('#docOut').hidden = false;
  $('#dates').innerHTML = c.deadlines.map((d) => `<div class="date"><time>${d.by}</time><span>${esc(L(d.label))}</span> <span class="clause" data-c="${d.clause}">${X('clause')} ${d.clause}</span></div>`).join('');
  renderDocs();

  // Claim pack
  $('#packOut').hidden = false;
  $('#form').innerHTML = Object.entries(partA).map(([h, fields]) => `<section><h3>${esc(h)}</h3><dl>${Object.entries(fields).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'number' && v > 999 ? inr(v) : v)}</dd>`).join('')}</dl></section>`).join('');
  $('#pack').classList.add('done');
  $('#revIn').hidden = false;
}

function renderDocs() {
  const items = S.result.checklist.items;
  $('#docs').innerHTML = items.map((d) => `<label class="doc ${S.ready.has(d.key) ? 'ready' : ''}"><input type="checkbox" data-doc="${d.key}" ${S.ready.has(d.key) ? 'checked' : ''}><div><b>${esc(L(d.label))}</b><span>${esc(L(d.how))}</span></div></label>`).join('');
  const n = items.filter((d) => S.ready.has(d.key)).length;
  $('#docProg').textContent = S.lang === 'hi' ? `${items.length} में से ${n} कागज़ तैयार` : `${n} of ${items.length} papers ready`;
  $('#docStep').classList.toggle('done', n === items.length);
}
$('#docs').addEventListener('change', (e) => { const k = e.target.dataset.doc; if (!k) return; e.target.checked ? S.ready.add(k) : S.ready.delete(k); renderDocs(); });
$('#printPack').addEventListener('click', () => window.print());

/* ---------- Step 6: settlement letter ---------- */
$('#sampleLetter').addEventListener('click', () => { $('#letter').value = S.sample.letter; });
$('#checkLetter').addEventListener('click', () => checkLetter({ letterText: $('#letter').value }));
$('#letterFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) await checkLetter({ letterImage: await shrink(f) }); e.target.value = ''; });

async function checkLetter(body) {
  if (!body.letterText && !body.letterImage) return toast('Paste the letter first.');
  try {
    S.review = await api('/api/review', { ...body, policy: S.policy.sample ? undefined : S.policy, claim: S.claim });
    if (S.review.letter?.text && !$('#letter').value) $('#letter').value = S.review.letter.text;
    renderReview();
    $('#revOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const f = S.review.findings.find((x) => x.verdict === 'contest');
    bot(f ? (S.lang === 'hi' ? `इस पत्र में एक गलती है: ${L(f.title)}। आप लगभग ${inr(S.review.recoverable)} और माँग सकते हैं। शिकायत पत्र तैयार है।` : `This letter has an error: ${L(f.title)}. You can ask for about ${inr(S.review.recoverable)} more. Your grievance letter is ready.`) : X('nothing'), { speak: true });
  } catch (err) { toast(err.message); }
}

function renderReview() {
  const r = S.review;
  const box = $('#revOut'); box.hidden = false;
  const tag = { contest: 'bad', valid: 'ok', review: '', fixable: '' };
  box.innerHTML = `
    ${r.recoverable > 0 ? `<div class="recover"><b>${inr(r.recoverable)}</b><span>${X('recover')} ${inr(r.recoverable)} ${X('recoverSub')}</span></div>` : `<div class="flag">✅ ${X('nothing')}</div>`}
    ${r.findings.map((f) => `<div class="finding ${f.verdict}"><header><span class="badge ${tag[f.verdict]}">${X(f.verdict)}</span><h3>${esc(L(f.title))}</h3><span class="tiny">${esc(f.deduction.label)} · ${inr(f.deduction.amount)}</span><span class="clause" data-c="${f.clause}">${X('clause')} ${f.clause}</span></header><p class="muted">${esc(L(f.why))}</p></div>`).join('')}
    ${r.letterText ? `<h3 style="font-size:17px">${X('draft')}</h3><div class="letter" id="glet">${esc(r.letterText)}</div><div class="row"><button class="btn primary small" id="copyLet">${X('copy')}</button></div>` : ''}
    <h3 style="font-size:17px">${X('path')}</h3>
    <div class="ladder">${r.ladder.map((s) => `<div><i>STEP ${s.step}</i><b>${esc(L(s.who))}</b><span>${esc(L(s.what))}</span><span class="tiny">${esc(L(s.when))}</span></div>`).join('')}</div>`;
  $('#revStep').classList.add('done');
  $('#copyLet')?.addEventListener('click', async (e) => { await navigator.clipboard.writeText(r.letterText); e.target.textContent = X('copied'); });
}

/* ---------- Clause popover: click any clause chip ---------- */
document.addEventListener('click', (e) => {
  const c = e.target.closest('.clause'); if (!c) return;
  const cl = S.policy.clauses.find((x) => x.id === c.dataset.c);
  if (cl) bot(`📖 ${X('clause')} ${cl.id} · ${cl.title}\n${cl.text}`, { refs: [] });
  openPanel();
});

/* ---------- Saathi: chat, voice in, voice out ---------- */
function renderQuick() {
  $('#quick').innerHTML = X('quick').map((q) => `<button type="button">${esc(q)}</button>`).join('');
}
$('#quick').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') askSaathi(e.target.textContent); });

function addMsg(text, who, opts = {}) {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  el.innerHTML = esc(text).replace(/\n/g, '<br>');
  if (who === 'bot') {
    const refs = document.createElement('div'); refs.className = 'refs';
    (opts.refs || []).forEach((id) => { const s = document.createElement('span'); s.className = 'clause'; s.dataset.c = id; s.textContent = `${X('clause')} ${id}`; refs.append(s); });
    if ('speechSynthesis' in window) { const b = document.createElement('button'); b.className = 'say'; b.type = 'button'; b.textContent = '🔊'; b.onclick = () => speak(text, opts.speakLang); refs.append(b); }
    el.append(refs);
  }
  $('#msgs').append(el);
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
  return el;
}
const bot = (text, opts = {}) => { const el = addMsg(text, 'bot', opts); if (opts.speak || opts.speakLang) speak(text, opts.speakLang); return el; };

const VOICE_LANG = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN', ml: 'ml-IN', pa: 'pa-IN' };
function speak(text, lang) {
  if (!('speechSynthesis' in window) || !$('#voiceOn').checked) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/₹/g, 'rupees ').replace(/📖/g, ''));
  const code = VOICE_LANG[lang || S.lang];
  u.lang = code;
  const v = speechSynthesis.getVoices().find((x) => x.lang === code) || speechSynthesis.getVoices().find((x) => x.lang.startsWith(code.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.98;
  u.onstart = () => $('#avatar').classList.add('talking');
  u.onend = u.onerror = () => $('#avatar').classList.remove('talking');
  speechSynthesis.speak(u);
}

async function askSaathi(q) {
  q = q.trim(); if (!q) return;
  addMsg(q, 'me');
  // Answer the checklist question from the checklist itself; it is more exact than any clause.
  if (S.result && /paper|document|missing|कागज़|दस्तावेज़|kagaz/i.test(q)) {
    const miss = S.result.checklist.items.filter((d) => !S.ready.has(d.key));
    return bot(miss.length ? (S.lang === 'hi' ? `${miss.length} कागज़ बाकी हैं: ${miss.map((d) => L(d.label)).join('; ')}।` : `${miss.length} papers still missing: ${miss.map((d) => L(d.label)).join('; ')}.`) : (S.lang === 'hi' ? 'सभी कागज़ तैयार हैं।' : 'All papers are ready.'), { speak: true, refs: ['8.2'] });
  }
  if (S.result && /why.*(cut|less|deduct)|क्यों कटी|कम क्यों|kyun kata/i.test(q)) {
    return bot(S.result.summary[S.lang] || S.result.summary.en, { speak: true, refs: S.result.estimate.steps.filter((s) => s.clause).map((s) => s.clause.split(',')[0]) });
  }
  const wait = bot(X('thinking'));
  try {
    const r = await api('/api/ask', { question: q, lang: S.lang, policy: S.policy.sample ? undefined : S.policy, claim: S.claim || undefined, withEstimate: Boolean(S.claim) });
    wait.remove();
    bot(r.answer, { speak: true, refs: r.clauses });
  } catch (err) { wait.remove(); bot(err.message); }
}
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value; $('#q').value = ''; askSaathi(q); });

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$('#mic').addEventListener('click', () => {
  if (!Rec) return toast('Voice input needs Chrome or Edge.');
  if (rec) { rec.stop(); return; }
  rec = new Rec(); rec.lang = VOICE_LANG[S.lang]; rec.interimResults = true;
  $('#mic').classList.add('live');
  rec.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(''); $('#q').value = t; if (e.results[e.results.length - 1].isFinal) { $('#q').value = ''; askSaathi(t); } };
  rec.onend = () => { rec = null; $('#mic').classList.remove('live'); };
  rec.start();
});

const openPanel = () => $('#saathi').classList.add('open');
$('#fab').addEventListener('click', () => $('#saathi').classList.toggle('open'));

/* ---------- Boot ---------- */
(async () => {
  const [status, sample] = await Promise.all([api('/api/status'), api('/api/sample')]);
  S.ai = status.ai; S.sample = sample; S.policy = sample.policy;
  applyLang();
  bot(X('hello'));
  if (new URLSearchParams(location.search).has('lang')) { S.lang = new URLSearchParams(location.search).get('lang'); applyLang(); }
  if (new URLSearchParams(location.search).has('demo')) await useSample();
})();
