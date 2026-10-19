const ts = require('typescript');
const fs = require('node:fs');
function dictionary(file, name) {
  const module = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
  return module.exports[name];
}
const known = { ...dictionary('src/i18n/phrases.ts', 'phrases'), ...dictionary('src/i18n/adminPhrases.ts', 'adminPhrases') };
const files = ['App.tsx', ...['src/shop', 'src/admin', 'src/components'].flatMap(dir => fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => `${dir}/${f}`))];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const phrases = new Set();
  function visit(node) {
    if (ts.isJsxText(node) && node.text.trim()) phrases.add(node.text.trim());
    if (ts.isStringLiteral(node)) phrases.add(node.text);
    if (ts.isTemplateExpression(node)) phrases.add(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  console.log('\nFILE ' + file + '\n' + [...phrases].filter(x => !Object.hasOwn(known, x)).map(x => JSON.stringify(x)).join('\n'));
}