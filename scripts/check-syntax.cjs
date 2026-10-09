const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.test-build', 'docs'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
}
walk('.');
const errors = [];
for (const p of files) {
  const sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const d of sf.parseDiagnostics) {
    errors.push({ file: p, code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, '\n') });
  }
}
console.log(JSON.stringify({ scope: 'TypeScript syntax only; not typecheck, bundling or Deno execution.', compiler: ts.version, files: files.length, errors }, null, 2));
if (errors.length) process.exit(1);
