// @ts-check

import fs from 'node:fs';
import { createRequire } from 'node:module';

/**
 * A GravyMoat policy object
 *
 * It's like a LavaMoat policy, 'cept different.
 *
 * @typedef GravyMoatPolicy
 * @property {Record<string, {builtin?: Record<string, boolean | string[]>, packages?: Record<string, boolean>, globals?: Record<string, boolean>}>} resources
 */

/**
 * Data passed to this hook; comes in via {@link initialize}
 *
 * @typedef HookData
 * @property {GravyMoatPolicy} policy
 */

/**
 * Information about a module which was requested via `specifier`
 *
 * @todo Currently we are not using any of `ResolveFnOutput`; do we need it?
 * @typedef {import('node:module').ResolveFnOutput & {specifier: string}} ModuleData
 */

// @ts-expect-error PRIVATE API WE ARE BAD SORRY
const log = /** @type {(...args: any) => void} */ (process._rawDebug);

/**
 * These are the only two module formats we care about censoring.
 */
const CENSORED_FORMATS = new Set(['module', 'commonjs']);

/**
 * Source of `ses` package
 *
 * Lucky for us: this is a single file, and does not differ based on module type.
 * @see {@link LOCKDOWN_SOURCE}
 */
const SES_SOURCE = fs.readFileSync(
  createRequire(new URL('.', import.meta.url)).resolve('ses'),
  'utf-8',
);

/**
 * Lockdown preamble that is injected into the entry point
 *
 * SES needs to be loaded this way, since we don't want it to go through these
 * hooks.
 *
 * The options here are the same used in LavaMoat.
 */
const LOCKDOWN_SOURCE =
  SES_SOURCE +
  `
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
});
`;

/**
 * Used to decode source (unlikely)
 */
const decoder = new TextDecoder();

/**
 * Token to signify the entry module
 */
const ROOT = '$root$';

/**
 * Policy as passed in to {@link initialize}
 *
 * @type {GravyMoatPolicy}
 */
let policy;

/**
 * Mapping of URLs to output of a resolve hook + the original specifier.
 *
 * @type {Map<string, import('node:module').ResolveFnOutput & {specifier: string}>}
 */
const moduleMap = new Map();

/**
 * These globals are censored _by default_.
 *
 * (yes, yes--there's no need to be pedantic)
 */
const censoredGlobals = /** @type {const} */ (['process']);

/**
 * Censors globals based on policy
 *
 * @param {string} source Source of module
 * @param {string} url URL of module
 * @returns {string} Censored source
 * @todo Source maps!! any volunteers?
 */
const censorGlobals = (source, url) => {
  const moduleData = moduleMap.get(url);
  if (!moduleData) {
    throw new Error(`${url} was somehow never resolved`);
  }
  const { specifier } = moduleData;
  const myPolicy = policy.resources[specifier] ?? {};
  const allowedGlobals = myPolicy.globals ?? {};
  const toCensor = censoredGlobals.filter((g) => !allowedGlobals[g]);
  // TODO: make globalThis censorship smarter
  // 'use strict' prevents getting global via function
  const censorshipSnippet =
    `'use strict';
  var globalThis = {};
  var global = {};` + toCensor.map((g) => `var ${g} = undefined;`).join('');
  return censorshipSnippet + source;
};

/**
 * Result of {@link checkPolicy}
 *
 * @typedef { {attenuate: true, keys: string[]} | {attenuate: false, keys: boolean} } CheckPolicyResult
 */

/**
 * Returns a list of properties to attenuate for a given builtin module specifier
 *
 * @param {string} specifier Module specifier
 * @param {string} parentURL URL of module requesting the specifier
 * @returns {CheckPolicyResult|undefined} If the module should be attenuated, then this is an array of keys to include. Otherwise, `undefined`
 * @throws If the specifier is disallowed by policy
 */
const checkPolicy = (specifier, parentURL) => {
  if (!specifier) {
    throw new Error(`Requested resource ID is undefined`);
  }
  if (!parentURL) {
    throw new Error(`Parent URL is undefined`);
  }

  const parent = moduleMap.get(parentURL);
  if (!parent) {
    throw new Error(
      `Parent module ${parentURL} should have been resolved already`,
    );
  }

  if (parent.specifier === specifier || parent.specifier === ROOT) {
    return;
  }

  const parentPolicy = policy.resources[parent.specifier] ?? {};

  // TODO: make this work with original lavamoat policy format?
  if (parentPolicy.builtin?.[specifier]) {
    const keys = parentPolicy.builtin[specifier];

    // load-bearing ternary
    return Array.isArray(keys)
      ? {
          attenuate: true,
          keys,
        }
      : {
          attenuate: false,
          keys,
        };
  }

  if (parentPolicy.packages?.[specifier]) {
    return;
  }

  throw Error(
    `Not allowed to load module ${specifier} from ${parent.specifier}`,
  );
};

/**
 * Given a specifier and a list of properties to attenuate, returns source code
 * which sets the values of the properties to `undefined`
 *
 * @param {string} specifier Module specifier
 * @param {string[]} keys Properties
 * @returns {string} New source code
 */
const generateAttenuator = (specifier, keys) => {
  const selection = keys.join(',');
  return `import { ${selection} } from '${specifier}'; export { ${selection} }; export default { ${selection} };`;
};

/**
 * Loader hook
 *
 * Performs initial bootstrap of SES, calls lockdown, and attenuates modules
 *
 * @type {import('node:module').LoadHook}
 */
export async function load(url, context, nextLoad) {
  const purl = new URL(url);

  if (purl.protocol === 'lockdown:') {
    log('loading lockdown');
    return {
      source: LOCKDOWN_SOURCE,
      format: 'module',
      shortCircuit: true,
    };
  }

  if (purl.protocol === 'attenuate:') {
    const specifier = purl.searchParams.get('specifier');
    const keys = purl.searchParams.get('keys');

    if (!specifier) {
      throw new Error('No specifier provided for attenuation');
    }
    if (!keys) {
      throw new Error('No keys provided for attenuation');
    }

    return {
      source: generateAttenuator(specifier, keys.split(',')),
      format: 'module',
      shortCircuit: true,
    };
  }

  const moduleData = moduleMap.get(url);
  if (!moduleData) {
    throw new Error(`Module ${url} was never resolved`);
  }
  const { specifier } = moduleData;
  log('loading', specifier, url, purl, context);

  let result = await nextLoad(url);
  log('loaded', result);

  let { source } = result;

  // add lockdown at entry, but prevent it from being tampered with by the
  // censorship part
  if (specifier === ROOT) {
    result = {
      ...result,
      source: `import 'lockdown:'; ${result.source}`,
    };
  } else if (CENSORED_FORMATS.has(context.format)) {
    // careful: `source` may be undefined if the format is `builtin`
    source = typeof source === 'string' ? source : decoder.decode(source);
    log('> censoring', url);
    result = {
      ...result,
      source: censorGlobals(source, url),
    };
    log(result);
  }

  return result;
}

/**
 * Initialize hook
 *
 * Assigns policy in module scope for use in {@link resolve} and {@link load}
 *
 * @type {import('node:module').InitializeHook<{policy: GravyMoatPolicy}>}
 */
export async function initialize(data) {
  log({ data });
  policy = data.policy;
}

/**
 * Resolve hook
 *
 * If `specifier` is a builtin, then we determine if it needs attenuation.  If it does, we inject a new URL that {@link load} handles to perform the attenuation.
 *
 * We also build a mapping of parent / child relationships here,
 *
 * @type {import('node:module').ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  log('resolving', specifier, context);
  if (context.parentURL && !context.parentURL.startsWith('attenuate:')) {
    const checkPolicyResult = checkPolicy(specifier, context.parentURL);
    if (checkPolicyResult?.attenuate) {
      return {
        url: `attenuate:?specifier=${specifier}&keys=${checkPolicyResult.keys.join(
          ',',
        )}`,
        format: 'module',
        shortCircuit: true,
      };
    }
  }
  const result = await nextResolve(specifier);
  log('resolved', result);

  const specifierOrRoot = context.parentURL === undefined ? ROOT : specifier;
  // TODO: this is VERY naive. We need to use `aa` for mapping modules to policy
  moduleMap.set(result.url, { specifier: specifierOrRoot, ...result });

  return result;
}
