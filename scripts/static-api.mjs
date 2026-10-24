// Browser-only API for the GitHub Pages build: the server's handlers, run in the page.
import { makeHandlers } from './core/handlers.mjs';

export async function load() {
  const get = (f, as) => fetch(`data/sample/${f}`).then((r) => r[as]());
  const [policy, bill, letter] = await Promise.all([get('policy.json', 'json'), get('bill.json', 'json'), get('settlement-letter.txt', 'text')]);
  return makeHandlers({ policy, bill, letter });
}
