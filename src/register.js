// @ts-check

import { register } from 'node:module';

/**
 * @satisfies {import('./hooks').GravyMoatPolicy[]}
 */
const EXAMPLE_POLICIES = /** @type {const} */([
  {
    resources: {
      pkg: {
        builtin: {
          'node:fs': true,
        },
        globals: {
          process: true,
        },
      },
    },
  },
  {
    resources: {
      pkg: {
        builtin: {
          'node:fs': ['readdirSync'],
        },
        globals: {
          process: true,
        },
      },
    },
  },
  {
    resources: {
      pkg: {
        builtin: {
          'node:fs': ['readFileSync'],
        },
        globals: {
          process: true,
        },
      },
    },
  },
  {
    resources: {
      pkg: {
        builtin: {
          'node:fs': true,
        },
        globals: {},
      },
    },
  },
  {
    resources: {
      pkg: {},
    },
  },
]);

const POLICY = EXAMPLE_POLICIES[0];

/** @type {import('./hooks').HookData} */
const data = { policy: POLICY };

register('./hooks.js', {
  parentURL: import.meta.url,
  data,
});
