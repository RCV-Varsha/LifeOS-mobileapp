const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(file,mocks={}){
  const compiled=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('exports','module','require',compiled)(module.exports,module,id=>id in mocks?mocks[id]:require(id));
  return module.exports;
}
const format=load('services/markdownFormat.ts');
function flatten(nodes){return nodes.flatMap(node=>[node.token,...flatten(node.children)]);}
test('AI headings, numbered lists, nested emphasis and tables become structural tokens',()=>{
  const source='# Your plan\n\n3. **Core CS** with *daily practice*\n4. Review\n   - **Nested step**\n\n| Topic | Time |\n| --- | --- |\n| Reasoning | 20 min |';
  const tokens=flatten(format.parseMarkdown(source));
  assert.ok(tokens.some(token=>token.type==='heading_open'));
  assert.equal(Number(tokens.find(token=>token.type==='ordered_list_open').attrGet('start')),3);
  for(const type of ['strong_open','em_open','bullet_list_open','table_open'])assert.ok(tokens.some(token=>token.type===type),type);
});
test('literal stars, escaped characters and code are preserved instead of stripped',()=>{
  const tokens=flatten(format.parseMarkdown('2 * 3 = 6 and \\*literal\\*\n\n`**code**`\n\n```js\nconst value = "**literal**";\n```'));
  assert.ok(tokens.some(token=>token.type==='text'&&token.content.includes('2 * 3 = 6 and *literal*')));
  assert.equal(tokens.find(token=>token.type==='code_inline').content,'**code**');
  assert.ok(tokens.find(token=>token.type==='fence').content.includes('**literal**'));
});
test('raw HTML stays text and only ordinary web/email links are actionable',()=>{
  const tokens=flatten(format.parseMarkdown('<script>alert(1)</script>'));
  assert.ok(!tokens.some(token=>token.type.startsWith('html_')));
  assert.equal(format.safeMarkdownLink('javascript:alert(1)'),null);
  assert.equal(format.safeMarkdownLink('file:///private'),null);
  assert.equal(format.safeMarkdownLink('https://example.com'),'https://example.com');
});
test('native renderer displays the reported AI response without raw bold syntax',()=>{
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const theme=load('ui/theme.ts');
  const Component=load('components/MarkdownText.tsx',{'react-native':require('react-native-web'),'../services/markdownFormat':format,'../ui/theme':theme}).default;
  const html=renderToStaticMarkup(React.createElement(Component,null,'## Your next steps\n\n1. **Strengthening core CS fundamentals** – Data structures and algorithms.\n2. **Building a portfolio** – Work on projects.'));
  assert.ok(html.includes('Strengthening core CS fundamentals'));
  assert.ok(html.includes('Building a portfolio'));
  assert.ok(!html.includes('**'));
  assert.ok(!html.includes('##'));
  assert.ok(html.includes('role="heading"'));
});
