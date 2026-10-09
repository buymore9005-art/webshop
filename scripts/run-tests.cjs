const fs=require('node:fs'), cp=require('node:child_process');
fs.mkdirSync('.test-build',{recursive:true});fs.writeFileSync('.test-build/package.json','{"type":"commonjs"}');
const compiler=cp.spawnSync(process.platform==='win32'?'tsc.cmd':'tsc',['-p','tsconfig.test.json'],{stdio:'inherit',shell:process.platform==='win32'});
if(compiler.status!==0)process.exit(compiler.status||1);
const files=fs.readdirSync('tests').filter(x=>x.endsWith('.test.cjs')).map(x=>'tests/'+x);
const tests=cp.spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});process.exit(tests.status||0);
