// The only place that talks to a model. Every call returns facts in a strict JSON shape;
// the money arithmetic never happens in a model, it happens in estimate.mjs.
import { config, aiEnabled } from './config.mjs';

export const LANGS = { en: 'English', hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', ml: 'Malayalam', pa: 'Punjabi' };

const usage = [];
export const aiUsage = () => ({ calls: usage.length, usd: usage.reduce((s, u) => s + u.usd, 0), last: usage.at(-1) || null });

async function chat({ model, messages, schema, name }) {
  if (!aiEnabled()) throw new Error('AI is off: set OPENAI_API_KEY');
  const started = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      reasoning_effort: 'minimal',
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || `OpenAI ${res.status}`);
  const u = body.usage || {};
  const usd = ((u.prompt_tokens || 0) * config.pricePerMTokIn + (u.completion_tokens || 0) * config.pricePerMTokOut) / 1e6;
  usage.push({ name, model, ms: Date.now() - started, tokens: u.total_tokens || 0, usd });
  return { data: JSON.parse(body.choices[0].message.content), meta: usage.at(-1) };
}

const str = { type: 'string' };
const numT = { type: 'number' };

const BILL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['hospital', 'patient', 'age', 'admission', 'discharge', 'diagnosis', 'procedure', 'roomCategory', 'billNumber', 'items', 'quality'],
  properties: {
    hospital: str, patient: str, age: numT, admission: { ...str, description: 'YYYY-MM-DD or empty' }, discharge: { ...str, description: 'YYYY-MM-DD or empty' },
    diagnosis: str, procedure: str, roomCategory: str, billNumber: str,
    quality: { type: 'string', enum: ['clear', 'partly_readable', 'unreadable'] },
    items: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['desc', 'qty', 'rate', 'amount'], properties: { desc: str, qty: numT, rate: numT, amount: { ...numT, description: 'Line total in rupees' } } },
    },
  },
};

// Photo of a hospital bill -> structured lines. Missing fields come back empty, never guessed.
export async function readBill(imageDataUrls) {
  const urls = [].concat(imageDataUrls).slice(0, 4);
  return chat({
    model: config.visionModel,
    name: 'hospital_bill',
    schema: BILL_SCHEMA,
    messages: [
      { role: 'system', content: 'You read Indian hospital final bills. Copy every billed line exactly as printed: description, quantity, rate and line amount in rupees. Do not merge, invent or correct lines. If a field is not printed, return an empty string or 0. Dates as YYYY-MM-DD.' },
      { role: 'user', content: [{ type: 'text', text: 'Read this hospital bill.' }, ...urls.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] },
    ],
  });
}

// Image of an insurer's letter -> its text, so the grievance checker can parse it.
export async function readLetter(imageDataUrl) {
  return chat({
    model: config.visionModel,
    name: 'letter_text',
    schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: str } },
    messages: [
      { role: 'system', content: 'Transcribe this insurance claim letter exactly, keeping line breaks and every amount. Output only what is printed.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] },
    ],
  });
}

// A customer's question, answered only from the clauses we retrieved.
export async function answer(question, clauses, context, lang = 'en') {
  return chat({
    model: config.textModel,
    name: 'policy_answer',
    schema: { type: 'object', additionalProperties: false, required: ['answer', 'clauses', 'confident'], properties: { answer: str, clauses: { type: 'array', items: str }, confident: { type: 'boolean' } } },
    messages: [
      { role: 'system', content: `You are ClaimSaathi, a calm, plain-spoken helper for Indian health insurance customers. Answer in ${LANGS[lang] || 'English'} in at most three short sentences a 60-year-old would understand. Use ONLY the policy clauses and claim facts given. Cite clause numbers. If the clauses do not answer it, say so and set confident=false. Never promise a claim will be paid: the insurer decides.` },
      { role: 'user', content: `Question: ${question}\n\nClaim facts: ${JSON.stringify(context)}\n\nPolicy clauses:\n${clauses.map((c) => `[${c.id}] ${c.title}: ${c.text}`).join('\n')}` },
    ],
  });
}

// The estimate summary, in the customer's language, for reading aloud.
export async function translate(text, lang) {
  return chat({
    model: config.textModel,
    name: 'translation',
    schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: str } },
    messages: [
      { role: 'system', content: `Translate into simple, spoken ${LANGS[lang]}. Keep rupee amounts as digits with ₹ and keep clause numbers. No extra words.` },
      { role: 'user', content: text },
    ],
  });
}
