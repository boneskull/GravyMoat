import fs from 'node:fs';

let dir;
try {
  dir = fs.readdirSync('.');
} catch (e) {
  dir = e.message + ' meanwhile, readFileSync is ' + typeof fs.readFileSync;
}
let cwd = 'unknown';
try {
  cwd = process.cwd();
} catch (e) {
  cwd = e.message;
}
export const hello = `boop 
${cwd}
${dir}
`;
