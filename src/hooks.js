// import 'ses';

import assert from 'node:assert';
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module';

// lockdown({
//   // gives a semi-high resolution timer
//   dateTaming: 'unsafe',
//   // this is introduces non-determinism, but is otherwise safe
//   mathTaming: 'unsafe',
//   // lets code observe call stack, but easier debuggability
//   errorTaming: 'unsafe',
//   // shows the full call stack
//   stackFiltering: 'verbose',
//   // prevents most common override mistake cases from tripping up users
//   overrideTaming: 'severe',
//   // preserves JS locale methods, to avoid confusing users
//   // prevents aliasing: toLocaleString() to toString(), etc
//   localeTaming: 'unsafe',
// })

const ALLOWED_FORMATS = new Set(['module', 'commonjs']);

let runtimeAdded = false
function prependRuntime(source){
  if(runtimeAdded) { throw Error("Wait, what?") }

  process._rawDebug(source.substring(20))

  runtimeAdded = true;
  return `
  import "hooks-test/runtime";
  
  import * as thing from '@endo/env-options';
  `+source
}

function wrap(source){
  return `
  global.evil(\`
    with({}){
      ${source} 
    }
  \`)

  `;
  
}

let entryModuleUrl;

/** @type {import("node:module").LoadHook} */
export async function load(url, context, nextLoad) {
  process._rawDebug({context, url, a: Object.getOwnPropertyDescriptors(context.importAttributes)})
  if (!ALLOWED_FORMATS.has(context.format)) {
    return nextLoad(url);
  }

  // this runs all subsequent loaders (if any). we then modify the result
  const result = await nextLoad(url);
  let source = result.source;
  if(!url.includes('runtime')) {
   source = wrap(source);
  }
  // let source = result.source;
  // process._rawDebug({url, entryModuleUrl})
  if(entryModuleUrl === url){
    source = prependRuntime(source)
  }
  // process._rawDebug(source.split('\n').slice(-100).join('\n'))
  return {...result, source};
}

/**
 * @type {import("node:module").InitializeHook<{stuff: string}>}
 */
export async function initialize(data) {
  assert.ok(data.stuff, 'did not send {stuff: string} from registration module');
}

/**
 * @type {import("node:module").ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  const urlStuff = await nextResolve(specifier);
  if(context.parentURL === undefined) {
    entryModuleUrl=urlStuff.url;
  }
  return urlStuff;
}