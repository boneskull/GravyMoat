import 'ses';
import assert from 'node:assert';

lockdown({
  // gives a semi-high resolution timer
  dateTaming: 'unsafe',
  // this is introduces non-determinism, but is otherwise safe
  mathTaming: 'unsafe',
  // lets code observe call stack, but easier debuggability
  errorTaming: 'unsafe',
  // shows the full call stack
  stackFiltering: 'verbose',
  // prevents most common override mistake cases from tripping up users
  overrideTaming: 'severe',
  // preserves JS locale methods, to avoid confusing users
  // prevents aliasing: toLocaleString() to toString(), etc
  localeTaming: 'unsafe',
})

const ALLOWED_FORMATS = new Set(['module', 'commonjs'])

/** @type {import("node:module").LoadHook} */
export async function load(url, context, nextLoad) {
  if (!ALLOWED_FORMATS.has(context.format)) {
    return nextLoad(url);
  }

  // this runs all subsequent loaders (if any). we then modify the result
  const result = await nextLoad(url);
  const source = `var hello = 'hello world';\n\n${result.source}`;

  return {...result, source};
}

/**
 * @type {import("node:module").InitializeHook<{stuff: string}>}
 */
export async function initialize(data) {
  assert.ok(data.stuff, 'did not send {stuff: string} from registration module')
}

/**
 * @type {import("node:module").ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier);
}