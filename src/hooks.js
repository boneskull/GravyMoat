import fs from "node:fs";
import { createRequire } from "node:module";

const log = process._rawDebug;

const CENSORED_FORMATS = new Set(["module", "commonjs"]);

const ses = fs.readFileSync(
  createRequire(import.meta.dirname).resolve("ses"),
  "utf-8"
);
const lockdownSource =
  ses +
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

let policy;
const moduleMap = new Map();

const censoredGlobals = ["process"];

const censor = (source, url, format) => {
  const { specifier } = moduleMap.get(url);
  const myPolicy = policy.resources[specifier] || {};
  const allowedGlobals = myPolicy.globals || {};
  const toCensor = censoredGlobals.filter((g) => !allowedGlobals[g]);
  // TODO: make globalThis censorship smarter
  // "use strict" prevents getting global via function
  const censorshipSnippet =
    `"use strict";
  var globalThis = {};
  var global = {};` + toCensor.map((g) => `var ${g} = undefined;`).join("");
  return censorshipSnippet + source;
};

const checkPolicy = (specifier, parentURL) => {
  const parent = moduleMap.get(parentURL);
  if (typeof specifier === "undefined") {
    throw Error(`Requested resource ID is undefined`);
  }
  if (parent.specifier === specifier || parent.specifier === "$root$") {
    return;
  }

  const myPolicy = policy.resources[parent.specifier] || {};
  // TODO: make this work with original lavamoat policy format?
  if (myPolicy.builtin && myPolicy.builtin[specifier]) {
    return {
      attenuate: Array.isArray(myPolicy.builtin[specifier]),
      keys: myPolicy.builtin[specifier],
    };
  }
  if (myPolicy.packages && myPolicy.packages[specifier]) {
    return false;
  }
  throw Error(
    `Not allowed to load module ${specifier} from ${parent.specifier}`
  );
};

const generateAttenuator = (specifier, keys) => {
  const selection = keys.join(",");
  return `import { ${selection} } from "${specifier}"; export { ${selection} }; export default { ${selection} };`;
};

/** @type {import("node:module").LoadHook} */
export async function load(url, context, nextLoad) {
  const purl = new URL(url);

  if (purl.protocol === "lockdown:") {
    log("loading lockdown")
    return {
      source: lockdownSource,
      format: "module",
      shortCircuit: true,
    };
  }
  if (purl.protocol === "attenuate:") {
    return {
      source: generateAttenuator(
        purl.searchParams.get("specifier"),
        purl.searchParams.get("keys").split(",")
      ),
      format: "module",
      shortCircuit: true,
    };
  }
  const { specifier } = moduleMap.get(url);
  log("loading", specifier, url, purl, context);

  let result = await nextLoad(url);
  log("loaded", result);
  if (CENSORED_FORMATS.has(context.format) && specifier !== "$root$") {
    log("> censoring", url);
    result = { ...result, source: censor(result.source, url, context.format) };
    log(result);
  }
  // add lockdown, but prevent it from being tampered with by the censorship part
  if (specifier === "$root$") {
    result = {
      ...result,
      source: `import 'lockdown:'; ${result.source}`,
    };
  }

  return result;
}

/**
 * @type {import("node:module").InitializeHook<{policy:object}>}
 */
export async function initialize(data) {
  log({ data });
  policy = data.policy;
}

/**
 * @type {import("node:module").ResolveHook}
 */
export async function resolve(specifier, context, nextResolve) {
  log("resolving", specifier, context);
  if (context.parentURL && !context.parentURL.startsWith("attenuate:")) {
    const builtin = checkPolicy(specifier, context.parentURL);
    if (builtin && builtin.attenuate) {
      return {
        url: `attenuate:?specifier=${specifier}&keys=${builtin.keys.join(",")}`,
        format: "module",
        shortCircuit: true,
      };
    }
  }
  const result = await nextResolve(specifier);
  const specifierOrRoot =
    context.parentURL === undefined ? "$root$" : specifier;
  // TODO: this is VERY naive. We need to use `aa` for mapping modules to policy
  moduleMap.set(result.url, { specifier: specifierOrRoot, ...result });
  log("resolved", result);
  return result;
}
