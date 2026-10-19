import ts from 'typescript';
import { phraseDictionary } from '../src/i18n/runtime';

// Compile only application-owned literals, never rendered values or DOM text.
// Keeping source offsets avoids reprinting JSX and preserves all business logic.
export function localizeSource(source: string, filename: string): string | undefined {
  if (!/(?:^|\/)(?:App\.tsx|src\/(?:admin|shop|components)\/[^/]+\.tsx)$/.test(filename.replaceAll('\\', '/')) || /(?:AdminGate|LanguageSelector)\.tsx$/.test(filename)) return;
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; text: string }[] = [];
  const known = (text: string) => Object.hasOwn(phraseDictionary, text);
  const call = (text: string) => `__phrase(${JSON.stringify(text)})`;
  const replace = (node: ts.Node, text: string) => edits.push({ start: node.getStart(tree), end: node.end, text });
  const displayAttributes = new Set(['label', 'hint', 'title', 'placeholder', 'aria-label', 'alt']);
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ['toLocaleString', 'toLocaleDateString'].includes(node.expression.name.text) &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'id-ID') {
      replace(node.arguments[0], '__displayLocale()');
      if (ts.isNewExpression(node.expression.expression) && node.expression.expression.expression.getText(tree) === 'Date' && node.arguments.length === 1) {
        edits.push({ start: node.arguments[0].end, end: node.arguments[0].end, text: ", { timeZone: 'Asia/Jakarta' }" });
      }
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text) && node.body) {
      edits.push({ start: node.body.getStart(tree) + 1, end: node.body.getStart(tree) + 1, text: '\n__useTranslation();\n' });
    }
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (known(text)) {
        // JSX collapses indentation but retains same-line spaces adjacent to expressions.
        const before = /^\s/.test(node.text) && !/^\s*\n/.test(node.text) ? ' ' : '';
        const after = /\s$/.test(node.text) && !/\n\s*$/.test(node.text) ? ' ' : '';
        edits.push({ start: node.pos, end: node.end, text: `{${JSON.stringify(before)} + ${call(text)} + ${JSON.stringify(after)}}` });
      }
      return;
    }
    if (ts.isStringLiteral(node) && known(node.text)) {
      const parent = node.parent;
      let scope: ts.Node | undefined = node.parent;
      while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
      if (!scope) return;
      if (ts.isCallExpression(parent) && /^(?:setError|setMessage|setSuccess)$/.test(parent.expression.getText(tree))) return;
      if (ts.isJsxAttribute(parent)) {
        if (displayAttributes.has(parent.name.getText(tree))) replace(node, `{${call(node.text)}}`);
      } else if (!ts.isImportDeclaration(parent) && !ts.isLiteralTypeNode(parent) &&
        !(ts.isPropertyAssignment(parent) && parent.name === node) &&
        // Values/identifiers and persisted inventory reasons remain canonical.
        !(ts.isPropertyAssignment(parent) && /^(?:value|type|id|key)$/.test(parent.name.getText(tree))) &&
        !(ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) &&
        !['Penerimaan stok', 'Pengurangan stok', 'Stok rusak', 'Retur pelanggan', 'Koreksi stok'].includes(node.text)) {
        replace(node, call(node.text));
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map(span => span.literal.text)];
      if (parts.some(known)) {
        const chunks = [known(parts[0]) ? call(parts[0]) : JSON.stringify(parts[0])];
        for (const span of node.templateSpans) {
          chunks.push(`(${span.expression.getText(tree)})`, known(span.literal.text) ? call(span.literal.text) : JSON.stringify(span.literal.text));
        }
        replace(node, '(' + chunks.join(' + ') + ')');
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) return;
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return `import { phrase as __phrase, displayLocale as __displayLocale } from '/src/i18n/runtime';\nimport { useTranslation as __useTranslation } from 'react-i18next';\n` + source;
}