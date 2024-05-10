import { register } from "node:module";

const policiesToTry = [
  {
    resources: {
      pkg: {
        builtin: {
          "node:fs": true,
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
          "node:fs": ['readdirSync'],
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
          "node:fs": ['readFileSync'],
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
          "node:fs": true,
        },
        globals: {
        },
      },
    },
  },
  {
    resources: {
      pkg: {
        
      },
    },
  },
];


register("./hooks.js", import.meta.url, {
  data: {
    policy: policiesToTry[0]
  },
});
