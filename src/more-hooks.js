
/** @type {import("node:module").LoadHook} */
export async function load(url, context, nextLoad) {
  console.error('Other hooks locked down?', Object.isFrozen([].__proto__));
  return nextLoad(url);
}