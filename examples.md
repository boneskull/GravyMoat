# GravyMoat Examples

```js
import fs from 'node:fs';
const cwd = process.cwd();
const dir = fs.readdirSync('.');
```

---

```js
builtin: {
    "node:fs": ['readDirSync'],
},
globals: {
    "process": true,
},
```

```text
/home/naugtur/repo/hooks-test
.git,.gitignore,README.md,gravymoat-logo.png,gravymoat-logo.svg,index.js,node_modules,package-lock.json,package.json,pkg,src
```

---

```js
builtin: {
    "node:fs": false,
},
```

```text
Error: Not allowed to load module node:fs from pkg
```

---

```js
builtin: {
    "node:fs": ['exists'],
},
```

```text
Error: fs.readdirSync is not a function
```

---

```js
globals: {
}
```

```text
Error: Cannot read properties of undefined (reading 'cwd')
```
