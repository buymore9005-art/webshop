const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', source)(module, module.exports);
  return module.exports;
}
const { id, en } = load('src/i18n/resources.ts');
const { normalizeLocale, readLocale, writeLocale } = load('src/i18n/preference.ts');
function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? [[prefix + key, item]] : flatten(item, prefix + key + '.'));
}
test('locale dictionaries have identical keys and interpolation variables', () => {
  const a = Object.fromEntries(flatten(id)), b = Object.fromEntries(flatten(en));
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  for (const key of Object.keys(a)) {
    assert.ok(a[key].trim() && b[key].trim(), key);
    const variables = text => [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match => match[1]).sort();
    assert.deepEqual(variables(a[key]), variables(b[key]), key);
  }
});
test('locale preference defaults to Indonesian and only accepts supported languages', () => {
  for (const value of [undefined, null, '', 'fr', 'en-US', 'ID']) assert.equal(normalizeLocale(value), 'id');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(readLocale(undefined, 'project:locale'), 'id');
  assert.equal(readLocale({ getItem() { throw Error('blocked'); } }, 'project:locale'), 'id');
});
test('locale preference survives reload with project isolation and blocked writes are safe', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeLocale(storage, 'project-a:locale', 'en');
  assert.equal(readLocale(storage, 'project-a:locale'), 'en');
  assert.equal(readLocale(storage, 'project-b:locale'), 'id');
  assert.doesNotThrow(() => writeLocale({ setItem() { throw Error('blocked'); } }, 'locale', 'en'));
});
test('language selector derives value and options from the same supported locale contract', () => {
  const source = fs.readFileSync('src/components/LanguageSelector.tsx', 'utf8');
  assert.match(source, /value=\{normalizeLocale\(i18n.resolvedLanguage\)\}/);
  assert.match(source, /htmlFor=\{id\}/);
  assert.deepEqual([...source.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]).sort(), ['en', 'id']);
  const setup = fs.readFileSync('src/i18n/index.ts', 'utf8');
  assert.match(setup, /projectStorageKey \+ 'locale'/);
  assert.match(setup, /document.documentElement.lang = locale/);
});