const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source='/Users/shenghangwang/Desktop/Codex/usedCarPlatform';
const root=path.resolve(__dirname,'..');
const ts=require(path.join(source,'node_modules/typescript'));
const copy=(relative)=>{const dest=path.join(root,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,relative),dest);};
const files=['src/pages/credits-admin/index.vue','src/pages/back-office-login/index.vue','src/layouts/BackOfficeLayout.vue','src/components/business/credits-admin/DeveloperHomeDashboard.vue','src/policies/accountProvisioning.ts','src/types/auth.ts','src/types/subscription.ts','src/api/http.ts'];
files.forEach(copy);
const text=fs.readFileSync(path.join(source,'src/api/visual-workbench.ts'),'utf8');
const api=ts.createSourceFile('api.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const declarations=new Map();
for(const statement of api.statements){if(statement.name?.text)declarations.set(statement.name.text,statement);if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(ts.isIdentifier(d.name))declarations.set(d.name.text,statement);}
const seed=new Set();
for(const file of files.filter(f=>f.endsWith('.vue'))){const v=fs.readFileSync(path.join(source,file),'utf8');const script=v.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1]||'';const ast=ts.createSourceFile(file,script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);for(const statement of ast.statements){if(ts.isImportDeclaration(statement)&&statement.moduleSpecifier.text==='@/api/visual-workbench')for(const e of statement.importClause.namedBindings.elements)seed.add(e.propertyName?.text||e.name.text);}}
const selected=new Set();function add(name){const statement=declarations.get(name);if(!statement||selected.has(statement))return;selected.add(statement);function walk(n){if(ts.isIdentifier(n)&&declarations.has(n.text))add(n.text);ts.forEachChild(n,walk);}ts.forEachChild(statement,walk);}
seed.forEach(add);
const output="// Reused from the owner's original full Credits console API client.\nimport { normalizeApiErrorMessage, request } from '@/api/http'\n\n"+api.statements.filter(s=>selected.has(s)).map(s=>s.getFullText(api).trim()).join('\n\n')+'\n';
fs.mkdirSync(path.join(root,'src/api'),{recursive:true});fs.writeFileSync(path.join(root,'src/api/visual-workbench.ts'),output);
const dependencies=['vue','vue-router','pinia','naive-ui','echarts','@iconify/vue','axios'];const dev=['vite','@vitejs/plugin-vue','typescript','vue-tsc','sass'];
const version=p=>JSON.parse(fs.readFileSync(path.join(source,'node_modules',p,'package.json'),'utf8')).version;
fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'entroqi-credits-back-office',version:'0.1.0',private:true,type:'module',scripts:{build:'vue-tsc --noEmit && vite build',typecheck:'vue-tsc --noEmit'},dependencies:Object.fromEntries(dependencies.map(p=>[p,version(p)])),devDependencies:Object.fromEntries(dev.map(p=>[p,version(p)]))},null,2)+'\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(path.join(root,'reuse-manifest.json'),JSON.stringify({authorization:'Owner explicitly requested reuse of their original full Credits console on 2026-10-29',source,files:files.map(file=>({file,originalSHA256:sha(fs.readFileSync(path.join(source,file)))})),apiClient:{source:'src/api/visual-workbench.ts',originalSHA256:sha(Buffer.from(text)),selectedExports:[...seed].sort(),note:'AST dependency closure retained original implementations and DTOs; unrelated vehicle/generation APIs excluded.'}},null,2)+'\n');
console.log('Reused original dashboard/layout/login/tables/charts/policies and '+seed.size+' API exports.');
