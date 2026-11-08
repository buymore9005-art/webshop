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
const { id, en, zh } = load('src/i18n/resources.ts');
const { phrases } = load('src/i18n/phrases.ts');
const { adminPhrases } = load('src/i18n/adminPhrases.ts');
const { zhPhrases } = load('src/i18n/zhPhrases.ts');
const { zhAdminPhrases } = load('src/i18n/zhAdminPhrases.ts');
const { normalizeLocale, readLocale, writeLocale } = load('src/i18n/preference.ts');
function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? [[prefix + key, item]] : flatten(item, prefix + key + '.'));
}
test('locale dictionaries have identical keys and interpolation variables', () => {
  const a = Object.fromEntries(flatten(id)), b = Object.fromEntries(flatten(en)), c = Object.fromEntries(flatten(zh));
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.deepEqual(Object.keys(a).sort(), Object.keys(c).sort());
  for (const key of Object.keys(a)) {
    assert.ok(a[key].trim() && b[key].trim() && c[key].trim(), key);
    const variables = text => [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match => match[1]).sort();
    assert.deepEqual(variables(a[key]), variables(b[key]), key);
    assert.deepEqual(variables(a[key]), variables(c[key]), key);
  }
});
test('all storefront and admin copy has a Simplified Chinese translation', () => {
  const original = { ...phrases, ...adminPhrases }, translated = { ...zhPhrases, ...zhAdminPhrases };
  assert.deepEqual(Object.keys(translated).sort(), Object.keys(original).sort());
  for (const [key, value] of Object.entries(translated)) {
    assert.ok(value.trim(), key);
    assert.match(value, /[\u3400-\u9fff]/, key);
  }
});
test('locale preference defaults to Indonesian and only accepts supported languages', () => {
  for (const value of [undefined, null, '', 'fr', 'en-US', 'ID']) assert.equal(normalizeLocale(value), 'id');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('zh'), 'zh');
  assert.equal(readLocale(undefined, 'project:locale'), 'id');
  assert.equal(readLocale({ getItem() { throw Error('blocked'); } }, 'project:locale'), 'id');
});
test('locale preference survives reload with project isolation and blocked writes are safe', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeLocale(storage, 'project-a:locale', 'zh');
  assert.equal(readLocale(storage, 'project-a:locale'), 'zh');
  assert.equal(readLocale(storage, 'project-b:locale'), 'id');
  assert.doesNotThrow(() => writeLocale({ setItem() { throw Error('blocked'); } }, 'locale', 'en'));
});
test('language toggle exposes supported locales, pressed state, and language actions', () => {
  const source = fs.readFileSync('src/components/LanguageSelector.tsx', 'utf8');
  assert.doesNotMatch(source, /<select/);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const locale of ['id', 'en', 'zh', undefined]) {
    const changes = [];
    const module = { exports: {} };
    const dependencies = name => name === 'react-i18next'
      ? { useTranslation: () => ({ t: key => key, i18n: { resolvedLanguage: locale, changeLanguage: value => changes.push(value) } }) }
      : name === '../i18n/preference' ? { normalizeLocale } : require(name);
    new Function('require', 'module', 'exports', compiled)(dependencies, module, module.exports);
    const group = module.exports.LanguageSelector();
    assert.equal(group.props.role, 'group');
    assert.equal(group.props['aria-label'], 'language.label');
    const buttons = group.props.children.filter(child => child.type === 'button');
    assert.deepEqual(buttons.map(button => button.props.children), ['ID', 'ENG', '中文']);
    for (const button of buttons) {
      assert.equal(button.props.type, 'button');
      const buttonLocale = button.props.lang === 'zh-CN' ? 'zh' : button.props.lang;
      assert.equal(button.props['aria-pressed'], buttonLocale === normalizeLocale(locale));
      assert.ok(button.props['aria-label']);
      button.props.onClick();
    }
    assert.deepEqual(changes, ['id', 'en', 'zh']);
  }
  const setup = fs.readFileSync('src/i18n/index.ts', 'utf8');
  assert.match(setup, /projectStorageKey \+ 'locale'/);
  assert.match(setup, /document.documentElement.lang = locale/);
  assert.match(setup, /locale === 'zh' \? 'zh-CN' : locale/);
});
test('storefront navigation keeps conventional order and language utility after cart', () => {
  const source = fs.readFileSync('App.tsx', 'utf8');
  const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));
  const tokens = ["t('store.catalog')", "t('store.articles')", 'name="orders"', 'name="heart"', 'name="user"', 'name="bag"', '<LanguageSelector />'];
  const positions = tokens.map(token => header.indexOf(token));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const css = fs.readFileSync('index.css', 'utf8');
  assert.match(css, /\.language-selector button\s*\{[^}]*border: 0/);
  assert.match(css, /\.language-selector button:focus-visible\s*\{[^}]*outline: 2px/);
});