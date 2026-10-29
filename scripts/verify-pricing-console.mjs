// Real browser + MySQL contract test. The original Vue console is private and
// must be explicitly supplied for --full-ui; public CI verifies the session API.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { buildPrivateApp } from '../dist/private-api.js';
import { loadEnv } from '../dist/config/env.js';
import { createDatabase } from '../dist/db/pool.js';
import { companyApplications, COMPANY_ISSUER } from '../dist/company/registry.js';
const fullUI=process.argv.includes('--full-ui'),directoryIndex=process.argv.indexOf('--console-directory');
if(directoryIndex>=0)process.env.CREDITS_CONSOLE_DIRECTORY=resolve(process.argv[directoryIndex+1]);
if(fullUI&&(!process.env.CREDITS_CONSOLE_DIRECTORY||!(await stat(resolve(process.env.CREDITS_CONSOLE_DIRECTORY,'index.html'))).isFile()))throw new Error('The built private original console is required for full UI verification');
const env=loadEnv();if(!/(?:^|_)tests?(?:_|$)/.test(env.mysql.database))throw new Error('Disposable test database required');
const connection=await mysql.createConnection(env.mysql);
try{
  const [tables]=await connection.query("select table_name from information_schema.tables where table_schema=database() and table_type='BASE TABLE' and table_name<>'schema_migrations'");
  await connection.query('set foreign_key_checks=0');
  try{for(const row of tables){const name=String(row.TABLE_NAME??row.table_name);if(!/^[a-z0-9_]+$/i.test(name))throw new Error('Unexpected table');await connection.query('delete from `'+name+'`');}}finally{await connection.query('set foreign_key_checks=1');}
  await createRequire(import.meta.url)('./register-company-apps.cjs').registerCompanyApplications(connection);
}finally{await connection.end();}
const db=createDatabase(env),origin='http://127.0.0.1:3197';
process.env.CREDITS_CONSOLE_ORIGINS=origin;
const credentials=companyApplications.map((row,i)=>({token:String(i+1).repeat(43),application:row.application,issuer:COMPANY_ISSUER,identityMode:'company',onboarding:'self_service',permissions:['catalog']}));
const owner={id:'browser-fixture-owner',token:'o'.repeat(43),applications:companyApplications.map(row=>row.application),pricingPermissions:['read','write','publish']};
const app=await buildPrivateApp(db,credentials,[],[owner]),checks=[],errors=[],externalRequests=[];let browser,page,passed=false,failure=null;
const productCode=companyApplications[0].priceProductCode;
await mkdir('artifacts-pricing',{recursive:true});
try{
  await app.listen({host:'127.0.0.1',port:3197});
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();externalRequests.push(route.request().url());return route.abort();});
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  if(fullUI){
    await page.goto(origin+'/back-office/login');await page.getByLabel('账号',{exact:true}).fill(owner.id);await page.getByLabel('操作员凭证',{exact:true}).fill(owner.token);await page.getByRole('button',{name:'登录积分后台',exact:true}).click();
    await page.getByRole('button',{name:'定价与收费方案',exact:true}).click();await page.getByRole('heading',{name:'定价与收费方案',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.product-picker select')?.options.length===3);
    assert.equal(await page.locator('.product-picker select option').count(),3);
    await page.getByLabel('管理产品',{exact:true}).selectOption(productCode);
    await page.getByLabel('候选售价（人民币）',{exact:true}).fill('100.00');await page.getByLabel('收费方式',{exact:true}).selectOption('monthly');await page.getByLabel('销售单位',{exact:true}).fill('month');
    await page.getByLabel('启用免费试用',{exact:true}).check();await page.getByLabel('免费试用天数',{exact:true}).fill('14');
    for(const[label,value]of[['每月销量 / 付费单位数','10'],['每月固定费用（元）','50'],['每个收费单位支持分钟数','30'],['支持人力小时成本（元）','20'],['支付费率（%）','2'],['税费预留（%）','1'],['退款 / 风险预留（%）','1']])await page.getByLabel(label,{exact:true}).fill(value);
    await page.getByRole('button',{name:'添加费用',exact:true}).click();await page.getByLabel('费用名称 1',{exact:true}).fill('Compute fixture');await page.getByLabel('数量',{exact:true}).fill('2');await page.getByLabel('单价',{exact:true}).fill('3');
    await page.getByLabel('计入 AI API 成本',{exact:true}).check();await page.getByLabel('AI 报价币种',{exact:true}).selectOption('USD');await page.getByLabel('AI 汇率',{exact:true}).fill('7');await page.getByLabel('输入总 token 数',{exact:true}).fill('1000000');await page.getByLabel('未缓存输入 / 百万 token',{exact:true}).fill('2');
    await page.waitForFunction(()=>document.querySelector('.results')?.textContent.includes('66.00')&&document.querySelector('.results')?.textContent.includes('610.00'));
    checks.push('Original Vue layout, three-product selector, server decimal calculator: independently calculated 30 direct cost, 4 reserves, 66 contribution, 610 monthly profit including USD AI FX and itemized compute.');
    await page.getByLabel('成本来源、日期、币种及判断依据',{exact:true}).fill('Explicit browser fixture assumptions; not a real business decision.');
    await page.getByRole('button',{name:'保存新方案草稿',exact:true}).click();await page.getByText('新草稿已保存，尚未发布。旧方案与客户合同未改变。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'发布此方案',exact:true}).first().click();await page.getByLabel('发布原因',{exact:true}).fill('Reviewed monthly fixture and fourteen day trial');await page.getByRole('button',{name:'确认发布参考方案',exact:true}).click();await page.getByText('新方案已发布；应用将在读取最新方案后更新展示。已接受的合同与试用保持原条款。',{exact:true}).waitFor();
  }else{
    await page.goto(origin+'/health');
    await page.evaluate(async owner=>{const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:owner.id,password:owner.token})});if(!response.ok)throw new Error('Staff login failed');},owner);
    const result=await page.evaluate(async()=>{const response=await fetch('/api/v1/platform/pricing/calculate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({retailPrice:'100.00',salesVolume:'10',monthlyFixedCost:'50',supportMinutes:'30',supportHourlyCost:'20',paymentFixedFee:'0',paymentFeeBps:200,taxReserveBps:100,refundReserveBps:100,targetMarginBps:6000,expenses:[{label:'Compute fixture',category:'infrastructure',quantity:'2',unitSize:'1',unitRate:'3',currency:'CNY',fxToCny:'1'}],ai:{currency:'USD',fxToCny:'7',inputTokens:'1000000',cachedInputTokens:'0',cacheWriteTokens:'0',outputTokens:'0',inputPerMillion:'2',cachedPerMillion:'0',cacheWritePerMillion:'0',outputPerMillion:'0',requests:'0',requestFee:'0'}})});if(!response.ok)throw new Error('Calculation failed');return response.json();});
    assert.equal(result.data.contributionRounded,'66.00');assert.equal(result.data.estimatedMonthlyOperatingProfit,'610.00');
    checks.push('Real browser same-origin staff session and exact backend calculator contract. Private original Vue UI is not included in this public CI mode.');
  }
  const call=(path,body)=>page.evaluate(async({path,body})=>{const response=await fetch('/api/v1/platform/pricing'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error('Staff pricing API failed '+response.status);return (await response.json()).data;},{path,body});
  const history=await call('/products/'+encodeURIComponent(productCode));
  const scenario={retailPrice:'149.00',salesVolume:'10',monthlyFixedCost:'50',supportMinutes:'30',supportHourlyCost:'20',paymentFixedFee:'0',paymentFeeBps:200,taxReserveBps:100,refundReserveBps:100,targetMarginBps:6000,expenses:[]};
  if(!fullUI){
    const draft=await call('/versions',{productCode,label:'Browser fixture monthly',billingType:'monthly',unit:'month',price:'149.00',expectedRevision:history.revision,scenario,validUntil:Date.now()+86400000,evidenceNote:'Explicit browser fixture costs and manual monthly renewal.',terms:{schemaVersion:1,model:'monthly',licensedVersion:null,trial:{enabled:true,days:14},renewal:'manual'},idempotencyKey:randomUUID()});
    await call('/products/'+encodeURIComponent(productCode)+'/publish',{priceVersionId:draft.priceVersionId,expectedPublishedId:history.publishedPriceId,note:'Reviewed browser fixture monthly plan',idempotencyKey:randomUUID()});
  }
  const original=await(await fetch(origin+'/v1/offers/'+encodeURIComponent(productCode),{headers:{authorization:'Bearer '+credentials[0].token}})).json();assert.equal(original.terms.model,'monthly');assert.equal(original.terms.trial.days,14);
  if(fullUI){
    await page.getByLabel('收费方式',{exact:true}).selectOption('version_license');await page.getByLabel('候选售价（人民币）',{exact:true}).fill('149.00');await page.getByLabel('授权的软件版本 / Atlas 版次',{exact:true}).fill('v1');await page.getByLabel('销售单位',{exact:true}).fill('v1 license');await page.getByLabel('启用免费试用',{exact:true}).uncheck();
    await page.waitForFunction(()=>document.querySelector('.results')?.textContent.includes('113.04'));
    await page.getByRole('button',{name:'保存新方案草稿',exact:true}).click();await page.getByText('新草稿已保存，尚未发布。旧方案与客户合同未改变。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'发布此方案',exact:true}).first().click();await page.getByLabel('发布原因',{exact:true}).fill('Reviewed version license fixture with trial disabled');await page.getByRole('button',{name:'确认发布参考方案',exact:true}).click();await page.getByText('新方案已发布；应用将在读取最新方案后更新展示。已接受的合同与试用保持原条款。',{exact:true}).waitFor();
  }else{
    const h=await call('/products/'+encodeURIComponent(productCode)),draft=await call('/versions',{productCode,label:'Browser fixture version license',billingType:'one_time',unit:'v1 license',price:'149.00',expectedRevision:h.revision,scenario,validUntil:Date.now()+86400000,evidenceNote:'Explicit browser fixture costs; version license with no trial.',terms:{schemaVersion:1,model:'version_license',licensedVersion:'v1',trial:{enabled:false,days:0},renewal:'manual'},idempotencyKey:randomUUID()});
    await call('/products/'+encodeURIComponent(productCode)+'/publish',{priceVersionId:draft.priceVersionId,expectedPublishedId:h.publishedPriceId,note:'Reviewed browser fixture version license',idempotencyKey:randomUUID()});
  }
  const updated=await(await fetch(origin+'/v1/offers/'+encodeURIComponent(productCode),{headers:{authorization:'Bearer '+credentials[0].token}})).json();assert.equal(updated.amountMinor,'14900');assert.equal(updated.terms.model,'version_license');assert.equal(updated.terms.licensedVersion,'v1');assert.equal(updated.terms.trial.enabled,false);assert.notEqual(updated.priceVersionId,original.priceVersionId);
  const retained=await call('/products/'+encodeURIComponent(productCode));assert.ok(retained.versions.some(row=>row.priceVersionId===original.priceVersionId&&row.terms.model==='monthly'&&row.terms.trial.days===14));
  checks.push('Actual MySQL publication changes monthly to version license and disables trials; safe app-facing terms update; old revision remains immutable.');
  assert.equal((await fetch(origin+'/v1/offers/atlas-ai%3Aaccess',{headers:{authorization:'Bearer '+credentials[0].token}})).status,403);
  assert.equal((await fetch(origin+'/v1/pricing/console.js')).status,404);assert.equal((await fetch(origin+'/v1/platform/console.js')).status,404);
  if(fullUI){await page.reload();await page.getByRole('heading',{name:'定价与收费方案',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('select[aria-label="收费方式"]')?.value==='version_license');assert.equal(await page.getByLabel('收费方式',{exact:true}).inputValue(),'version_license');await page.screenshot({path:'artifacts-pricing/original-back-office-pricing.png',fullPage:true});}
  await page.evaluate(()=>fetch('/api/v1/auth/logout',{method:'POST'}));await page.reload();
  if(fullUI)await page.getByLabel('操作员凭证',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);passed=true;
}catch(error){failure=String(error).slice(0,1500);if(page)await page.screenshot({path:'artifacts-pricing/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await writeFile('artifacts-pricing/report.json',JSON.stringify({status:passed?'passed':'failed',mode:fullUI?'private_original_vue_ui':'public_backend_browser_contract',checks,errors,externalRequests,failure},null,2)+'\n');await browser?.close();await app.close();await db.close();}
