import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, normalizeItems } from '../core/bills.mjs';
import { estimate, eligibility } from '../core/estimate.mjs';
import { checklist, claimFormPartA } from '../core/checklist.mjs';
import { parseLetter, review } from '../core/grievance.mjs';
import { buildIndex, search, splitClauses, extractTerms } from '../core/policy.mjs';
import { summary, ask } from '../core/assist.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/sample/${f}`, import.meta.url)));
const policy = load('policy.json');
const bill = load('bill.json');
const letter = readFileSync(new URL('../data/sample/settlement-letter.txt', import.meta.url), 'utf8');

test('classifies bill lines the way insurers do', () => {
  assert.equal(classify('Room rent - Single private room').category, 'room');
  assert.equal(classify('Gloves and masks').category, 'nonpayable');
  assert.equal(classify('Surgeon fee').category, 'doctor');
  assert.equal(classify('Surgical consumables - trocars').category, 'consumables');
  assert.equal(classify('CT abdomen').category, 'diagnostics');
  assert.equal(classify('ICU charges').category, 'icu');
  assert.equal(classify('Attendant food and beverages').category, 'nonpayable');
});

test('normalizes loose model output', () => {
  const items = normalizeItems([{ description: 'Pharmacy', amount: '1,200' }, { desc: 'Nursing', qty: 2, rate: 500 }, { desc: '', amount: 5 }]);
  assert.equal(items.length, 2);
  assert.equal(items[1].amount, 1000);
});

test('proportionate deduction only touches room-linked costs', () => {
  const est = estimate(policy, bill);
  assert.equal(est.roomCap, 5000);
  assert.equal(est.roomRate, 6500);
  const pharmacy = est.lines.find((l) => l.category === 'pharmacy');
  const consumables = est.lines.find((l) => l.category === 'consumables');
  const surgeon = est.lines.find((l) => /Surgeon/.test(l.desc));
  assert.equal(pharmacy.cut, 0);
  assert.equal(consumables.cut, 0);
  assert.equal(surgeon.payable, Math.round(45000 * 5000 / 6500));
  assert.equal(est.lines.find((l) => l.category === 'room').payable, 15000);
});

test('full estimate on the sample bill adds up', () => {
  const { totals, steps } = estimate(policy, bill);
  assert.equal(totals.billed, 174050);
  assert.equal(totals.nonpayable, 6900);
  assert.equal(totals.caps, 500);
  assert.equal(totals.copay, Math.round(totals.admissible * 0.1));
  assert.equal(totals.payable + totals.youPay, totals.billed);
  assert.equal(steps.at(-1).amount, totals.payable);
  assert.equal(steps.reduce((s, x) => s + (x.key === 'payable' ? 0 : x.amount), 0), totals.payable);
});

test('no proportionate cut when the room is within the limit', () => {
  const cheap = { ...bill, items: bill.items.map((i) => (/Room rent/.test(i.desc) ? { ...i, rate: 4500, amount: 13500 } : i)) };
  const est = estimate(policy, cheap);
  assert.equal(est.ratio, 1);
  assert.equal(est.totals.proportionate, 0);
});

test('waiting periods block a cataract claim in year one', () => {
  const p = structuredClone(policy);
  p.insured[0].coveredSince = '2025-01-10';
  const e = eligibility(p, { ...bill, diagnosis: 'Senile cataract', procedure: 'Phaco with IOL' });
  assert.equal(e.admissible, false);
  assert.ok(e.flags.some((f) => f.clause === '6.3'));
  const est = estimate(p, { ...bill, diagnosis: 'Senile cataract', procedure: 'Phaco with IOL' });
  assert.equal(est.totals.payable, 0);
});

test('cataract sub-limit caps the admissible amount', () => {
  const est = estimate(policy, { ...bill, diagnosis: 'Cataract', procedure: 'Phaco' });
  assert.ok(est.steps.some((s) => s.key === 'sublimit'));
  assert.equal(est.totals.payable, 36000);
});

test('checklist lists what is missing and the deadlines', () => {
  const est = estimate(policy, bill);
  const c = checklist(policy, bill, est);
  const missing = c.missing.map((m) => m.key);
  assert.ok(missing.includes('kyc') && missing.includes('bank') && missing.includes('pharmacy_bills'));
  assert.ok(!missing.includes('final_bill'));
  assert.equal(c.deadlines.find((d) => d.key === 'submit').by, '2025-11-16');
  assert.equal(claimFormPartA(policy, bill, est)['A. Policy']['Policy number'], 'SFH/2025/004417');
});

test('reads a settlement letter', () => {
  const L = parseLetter(letter);
  assert.equal(L.claimed, 174050);
  assert.equal(L.approved, 115789);
  assert.equal(L.deductions.length, 4);
});

test('spots a proportionate cut wrongly applied to the whole bill', () => {
  const est = estimate(policy, bill);
  const r = review(policy, bill, est, letter);
  const wrong = r.findings.find((f) => f.key === 'proportionate_on_all');
  assert.ok(wrong, 'should contest');
  assert.ok(r.recoverable > 9000 && r.recoverable < 12000, `recoverable ${r.recoverable}`);
  assert.equal(r.findings.find((f) => f.key === 'nonpayable').verdict, 'valid');
  assert.match(r.letterText, /Grievance Redressal Officer/);
  assert.equal(r.ladder.length, 3);
});

test('policy search answers Hindi and English questions with a clause', () => {
  const idx = buildIndex(policy.clauses);
  assert.equal(search(idx, 'room rent limit')[0].id, '3.1');
  assert.equal(search(idx, 'कमरे का किराया कितना मिलेगा')[0].id, '3.1');
  assert.equal(search(idx, 'cataract')[0].id, '4.2');
  assert.equal(search(idx, 'shikayat kahan karein')[0].id, '9.1');
});

test('offline answers and summaries work without keys', async () => {
  const idx = buildIndex(policy.clauses);
  const est = estimate(policy, bill);
  const a = await ask(idx, 'Is there a co-payment for senior citizens?', est);
  assert.equal(a.source, 'match');
  assert.deepEqual(a.clauses, ['5.2']);
  assert.match(summary(est, 'hi'), /बीमा कंपनी लगभग/);
});

test('splits uploaded wording into clauses and reads key terms', () => {
  const text = `1.1 Hospitalisation\nWe pay in-patient expenses.\n3.1 Room rent\nRoom rent up to 2% of sum insured per day.\n5.1 Co-payment\nA co-payment of 20% applies to every claim.\n6.2 Pre-existing\nPre-existing diseases are covered after 24 months.\n`;
  const clauses = splitClauses(text);
  assert.equal(clauses.length, 4);
  const { terms, found } = extractTerms(text, policy.terms);
  assert.equal(terms.roomRentPerDay.value, 2);
  assert.equal(terms.copay[0].percent, 20);
  assert.equal(terms.waiting.preExistingMonths, 24);
  assert.ok(found.includes('copay'));
});
