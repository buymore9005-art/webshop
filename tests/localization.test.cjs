const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const m = { exports: {} }; cache.set(file, m);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), m, m.exports);
  return m.exports;
}
const { localizeSource } = load('scripts/localize.ts');
const { phraseDictionary, phraseKey, phrase, zhPhraseDictionary, displayLocale } = load('src/i18n/runtime.ts');
const i18n = require('i18next');
test('all requested screens compile with localized copy and reactive subscriptions', () => {
  const files = ['App.tsx', ...['src/shop', 'src/admin'].flatMap(dir => fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => dir + '/' + f)), 'src/components/UI.tsx', 'src/components/ShippingAreaPicker.tsx'];
  for (const file of files) {
    const result = localizeSource(fs.readFileSync(file, 'utf8'), file);
    assert.ok(result?.includes('__useTranslation();'), file);
    assert.ok(result.includes('__phrase('), file);
    const diagnostics = ts.transpileModule(result, { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).diagnostics;
    assert.equal(diagnostics.length, 0, file);
  }
});
test('transform preserves dynamic data, identifiers, comparisons, and explicit option values', () => {
  const source = `function Screen(){const x={value:'Lunas'}; return <><p>{product.title}</p><option value="Penerimaan stok">Penerimaan stok</option><p>{state === 'Lunas' ? 'Lunas' : state}</p></>}`;
  const result = localizeSource(source, 'src/admin/Products.tsx');
  assert.match(result, /value="Penerimaan stok"/);
  assert.match(result, /value:'Lunas'/);
  assert.match(result, /state === 'Lunas'/);
  assert.match(result, /\{product.title\}/);
  assert.match(result, /__phrase\("Penerimaan stok"\)/);
});
test('phrase resources switch both ways and unknown data remains unchanged', async () => {
  await i18n.init({ lng: 'en', fallbackLng: 'id', resources: {
    id: { translation: Object.fromEntries(Object.keys(phraseDictionary).map(s => [phraseKey(s), s])) },
    en: { translation: Object.fromEntries(Object.entries(phraseDictionary).map(([s, en]) => [phraseKey(s), en])) },
    zh: { translation: Object.fromEntries(Object.entries(zhPhraseDictionary).map(([s, zh]) => [phraseKey(s), zh])) },
  } });
  assert.equal(phrase('Tambah ke keranjang'), 'Add to cart');
  assert.equal(phrase('Customer supplied text'), 'Customer supplied text');
  await i18n.changeLanguage('id');
  assert.equal(phrase('Tambah ke keranjang'), 'Tambah ke keranjang');
  await i18n.changeLanguage('zh');
  assert.equal(phrase('Tambah ke keranjang'), '加入购物车');
  assert.equal(displayLocale(), 'zh-CN');
  assert.ok(Object.keys(phraseDictionary).length > 400);
});
test('courier status namespace provides Simplified Chinese labels', () => {
  const source = fs.readFileSync('src/components/ShipmentStatus.tsx', 'utf8');
  assert.match(source, /const zh: typeof en = \{[^}]*title: '快递状态'/);
  assert.match(source, /addResourceBundle\('zh', 'shipment', zh\)/);
});