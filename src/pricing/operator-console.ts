// Internal console only. Formulae execute on the server; credentials stay in
// memory and no third-party script, analytics or browser storage is used.
export const pricingConsoleHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Credits · 定价与利润测算</title>
<style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 20px;color:#173b43;background:#f5f8f8}h1,h2{line-height:1.3}fieldset,section{background:white;border:1px solid #b8cece;border-radius:10px;padding:20px;margin:20px 0}label{display:inline-grid;gap:6px;margin:8px 16px 8px 0;max-width:100%}input,select,textarea,button{font:inherit;padding:9px;border:1px solid #9ab6b7;border-radius:5px;max-width:100%;box-sizing:border-box}textarea{width:100%;min-height:110px}button{background:#174e50;color:white;cursor:pointer}button.secondary{background:white;color:#174e50}pre{white-space:pre-wrap;overflow-wrap:anywhere}#results{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.metric{padding:12px;background:#eef6f4;border-radius:6px}.metric strong{display:block;font-size:1.3rem;margin-top:5px}.expense-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;border:1px solid #d6e3e3;padding:12px;margin:12px 0}.warning{color:#a23b20}small{display:block;color:#456168}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:9px;border-bottom:1px solid #d6e3e3}button:disabled{opacity:.5;cursor:wait}</style>
<h1>Credits · 定价与利润测算</h1><p>修改费用和售价即可自动测算。测算按每次销售／服务单位计算；月固定费用按预计销量分摊。结果是基于输入的估算，不是已结算收入。</p>
<section><h2>操作员连接</h2><label>定价操作员令牌<input id="token" type="password" autocomplete="off" placeholder="专用定价权限，不是客户令牌"></label><button id="connect">连接并测算</button><button id="disconnect" class="secondary">断开并清除令牌</button><p id="status" role="status">请通过公司内部访问方式打开本页。</p></section>
<form id="calculator"><fieldset><legend>售价与经营费用（人民币）</legend>
<label>每单位售价（元）<input id="retailPrice" value="79.00" inputmode="decimal"></label><label>预计月销量<input id="salesVolume" value="100" inputmode="numeric"></label><label>每月固定费用（元）<input id="monthlyFixedCost" value="2000" inputmode="decimal"></label>
<label>每单支持分钟<input id="supportMinutes" value="6" inputmode="decimal"></label><label>支持人力完全成本（元／小时）<input id="supportHourlyCost" value="60" inputmode="decimal"></label><label>每单固定支付费用（元）<input id="paymentFixedFee" value="0" inputmode="decimal"></label>
<label>支付费率（%）<input id="paymentFee" value="1" inputmode="decimal"></label><label>税费预留（%）<input id="taxReserve" value="0" inputmode="decimal"></label><label>退款／坏账预留（%）<input id="refundReserve" value="0" inputmode="decimal"></label><label>目标贡献毛利率（%）<input id="targetMargin" value="60" inputmode="decimal"></label><small>税费输入是您的经营预留假设；固定费用应覆盖尚未按单计入的开发、行政等费用，避免重复计入。</small></fieldset>
<fieldset><legend><label><input id="includeAi" type="checkbox">计入 AI API 成本</label></legend><p>填写每个销售／服务单位内所有调用的合计用量。总输入已包含缓存读取与写入；两类缓存互不重叠。输出应按供应商账单口径包含推理等已计费 token，勿重复添加。</p>
<label>供应商币种<select id="aiCurrency"><option>CNY</option><option>USD</option></select></label><label>每1供应商币种折合人民币<input id="aiFx" value="1" inputmode="decimal"></label>
<label>总输入 token<input id="inputTokens" value="10000" inputmode="numeric"></label><label>缓存读取 token<input id="cachedInputTokens" value="0" inputmode="numeric"></label><label>缓存写入 token<input id="cacheWriteTokens" value="0" inputmode="numeric"></label><label>输出 token<input id="outputTokens" value="2000" inputmode="numeric"></label>
<label>普通输入单价／百万 token<input id="inputPerMillion" value="0" inputmode="decimal"></label><label>缓存读取单价／百万 token<input id="cachedPerMillion" value="0" inputmode="decimal"></label><label>缓存写入单价／百万 token<input id="cacheWritePerMillion" value="0" inputmode="decimal"></label><label>输出单价／百万 token<input id="outputPerMillion" value="0" inputmode="decimal"></label><label>调用次数<input id="requests" value="1" inputmode="numeric"></label><label>每次调用附加费（供应商币种）<input id="requestFee" value="0" inputmode="decimal"></label>
<small>没有某种费用时填0。价格、缓存规则、最低收费和币种以供应商实际合同为准；本页不自动使用过期的网上价格或发起 API 调用。</small></fieldset>
<fieldset><legend>其他按量成本</legend><p>支持云存储、流量、计算小时、图片／音频调用等。每项成本 = 数量 ÷ 报价单位大小 × 单价 × 汇率。示例：每1000次请求0.1元，unitSize填1000。</p><p>最多12项。为每项填写费用名称、类别、数量、报价单位大小、单价和币种。</p><div id="expenses"></div><button id="addExpense" type="button" class="secondary">添加费用</button></fieldset><button type="submit">立即测算</button></form>
<section aria-label="测算结果"><h2>测算结果</h2><div id="results" aria-live="polite"></div><p id="warning" class="warning"></p><details><summary>查看成本明细与假设</summary><pre id="breakdown"></pre></details></section>
<section><h2>价格版本与发布</h2><p>先保存新版本，核对后再发布为对外参考价。旧版本保留；价格修改不会改动过去的订单、报价或授权。发布价格本身不启用支付、云服务或付费 AI。</p>
<label>产品代码<input id="productCode" value="simulation:modeler-v1-local"></label><label>产品名称<input id="productLabel" value="Modeler v1 本机授权"></label><label>计费方式<select id="billingType"><option value="one_time">一次购买</option><option value="monthly">每月</option><option value="usage">按用量单位</option></select></label><label>销售单位<input id="unit" value="v1个人授权"></label><label>成本证据有效天数<input id="evidenceDays" value="30" inputmode="numeric"></label><label style="display:block">成本来源、日期、币种及判断依据<textarea id="evidenceNote" placeholder="确认供应商价格、人力与费用假设后填写"></textarea></label>
<div><button id="loadHistory">刷新版本</button> <button id="saveDraft">保存新价格版本</button></div><p id="catalogStatus" role="status"></p><div id="history"></div><p>所有费用为显式输入。缺少人力、成本过期或未达到既有利润审核要求时，会标为需审核；真实收费还需要独立的订单、收款、退款及服务资格。</p></section>
<script src="/v1/pricing/console.js" defer></script></html>`;

export const pricingConsoleScript = String.raw`'use strict';
const el = id => document.getElementById(id);
let token = '', sessionGeneration = 0, generation = 0, timer, controller, currentHistory = { revision: 0, publishedPriceId: null }, currentProduct = '', calculation = null;
const value = id => el(id).value.trim();
const status = text => { el('status').textContent = text; };
function percent(id){const text=value(id);if(!/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/.test(text))throw new Error('请填写有效的百分比（最多两位小数）');return Math.round(Number(text)*100);}
function readExpenses(){return Array.from(el('expenses').children).map(row=>Object.fromEntries(Array.from(row.querySelectorAll('[data-field]')).map(input=>[input.dataset.field,input.value.trim()])));}
function renderExpenses(lines){
 el('expenses').replaceChildren();
 lines.forEach((line,index)=>{const row=document.createElement('div');row.className='expense-row';
 for(const [field,title,options] of [['label','费用名称'],['category','费用类别',[['supplier','供应商'],['infrastructure','基础设施'],['risk','其他风险成本']]],['quantity','数量'],['unitSize','报价单位大小'],['unitRate','单价'],['currency','费用币种',[['CNY','人民币'],['USD','美元']]],['fxToCny','折合人民币汇率']]){
  const label=document.createElement('label');label.textContent=title+' '+(index+1);const input=document.createElement(options?'select':'input');input.dataset.field=field;
  if(options)for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
  input.value=line[field];if(!options&&field!=='label')input.inputMode='decimal';label.append(input);row.append(label);
 }
 row.querySelector('[data-field="currency"]').onchange=()=>{row.querySelector('[data-field="fxToCny"]').value=row.querySelector('[data-field="currency"]').value==='CNY'?'1':'';void calculate();};
 const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='删除费用 '+(index+1);remove.onclick=()=>{renderExpenses(readExpenses().filter((_,i)=>i!==index));void calculate();};row.append(remove);el('expenses').append(row);
 });
}
function scenario() {
 const data = { retailPrice:value('retailPrice'), salesVolume:value('salesVolume'), monthlyFixedCost:value('monthlyFixedCost'), supportMinutes:value('supportMinutes'), supportHourlyCost:value('supportHourlyCost'), paymentFixedFee:value('paymentFixedFee'), paymentFeeBps:percent('paymentFee'), taxReserveBps:percent('taxReserve'), refundReserveBps:percent('refundReserve'), targetMarginBps:percent('targetMargin'), expenses:readExpenses() };
 if (el('includeAi').checked) { data.ai={currency:value('aiCurrency'),fxToCny:value('aiFx')}; for(const key of ['inputTokens','cachedInputTokens','cacheWriteTokens','outputTokens','inputPerMillion','cachedPerMillion','cacheWritePerMillion','outputPerMillion','requests','requestFee']) data.ai[key]=value(key); }
 return data;
}
async function api(path, method='GET', body, signal) {
 if (!token) throw new Error('请先连接定价操作员。');
 const session=sessionGeneration; const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',redirect:'error',...(body?{body:JSON.stringify(body)}:{}),...(signal?{signal}:{})});
 const result=await response.json(); if(session!==sessionGeneration)throw new Error('操作员连接已改变，请重试。'); if(!response.ok) throw new Error(result.message||result.error||'操作未完成'); return result;
}
function metric(label,value) { const box=document.createElement('div');box.className='metric';box.textContent=label;const strong=document.createElement('strong');strong.textContent=value===null?'不适用':String(value);box.append(strong);el('results').append(box); }
async function calculate() {
 const own=++generation;controller?.abort();controller=new AbortController();
 try { const result=await api('/v1/pricing/calculate','POST',scenario(),controller.signal);if(own!==generation)return;calculation=result;el('results').replaceChildren();
 for(const [label,key] of [['每单位 AI 成本（元）','aiCost'],['每单位直接成本（元）','directCost'],['每单位贡献（元）','contributionRounded'],['贡献毛利率（%）','contributionMarginPercent'],['成本加价率（扣预留后，%）','contributionMarkupPercent'],['预计月收入（元）','monthlyRevenue'],['预计月经营利润（元）','estimatedMonthlyOperatingProfit'],['月固定费用盈亏平衡销量','breakEvenSales']])metric(label,result[key]===null?null:key.endsWith('Percent')?Number(result[key]).toFixed(2):result[key]);
 el('warning').textContent=result.lossMaking?'当前售价连每单成本都无法覆盖。':result.meetsTarget?'当前估算达到所填目标贡献率。':'当前估算未达到所填目标贡献率。';el('breakdown').textContent=JSON.stringify(result,null,2);status('测算已更新；未发起付费 API 或任何收款。');
 } catch(error) { if(own===generation){calculation=null;el('results').replaceChildren();el('warning').textContent='当前输入尚未计算成功；旧结果已清除。';status(error.message);} }
}
el('calculator').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(calculate,350);});
el('calculator').addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);void calculate();});
el('connect').onclick=()=>{sessionGeneration++;token=value('token');el('token').value='';void calculate();};
el('disconnect').onclick=()=>{sessionGeneration++;token='';generation++;controller?.abort();el('token').value='';el('results').replaceChildren();el('breakdown').textContent='';el('history').replaceChildren();status('已清除本页令牌与结果。');};
el('aiCurrency').onchange=()=>{el('aiFx').value=value('aiCurrency')==='CNY'?'1':'';void calculate();};
el('addExpense').onclick=()=>{const lines=readExpenses();if(lines.length>=12){status('最多填写12项费用。');return;}lines.push({label:'存储或调用成本',category:'infrastructure',quantity:'1',unitSize:'1',unitRate:'0',currency:'CNY',fxToCny:'1'});renderExpenses(lines);void calculate();};
async function history() {
 const product=value('productCode');const result=await api('/v1/pricing/products/'+encodeURIComponent(product));if(value('productCode')!==product)return;currentHistory=result;currentProduct=product;el('history').replaceChildren();
 for(const version of result.versions){const row=document.createElement('section');const title=document.createElement('strong');title.textContent='版本 '+version.revision+' · ¥'+version.price+' / '+version.unit+(version.priceVersionId===result.publishedPriceId?' · 当前参考价':'');row.append(title);const note=document.createElement('p');note.textContent=version.assessment.eligibleForSale?'成本审核通过；真实收款尚未启用。':'需审核：'+version.assessment.reviewRequired;row.append(note);
 const reuse=document.createElement('button');reuse.className='secondary';reuse.textContent='载入此版本的费用和售价';reuse.onclick=()=>{const s=version.scenario;for(const k of ['retailPrice','salesVolume','monthlyFixedCost','supportMinutes','supportHourlyCost','paymentFixedFee'])el(k).value=s[k];for(const [id,k] of [['paymentFee','paymentFeeBps'],['taxReserve','taxReserveBps'],['refundReserve','refundReserveBps'],['targetMargin','targetMarginBps']])el(id).value=s[k]/100;renderExpenses(s.expenses);el('includeAi').checked=!!s.ai;if(s.ai){el('aiCurrency').value=s.ai.currency;el('aiFx').value=s.ai.fxToCny;for(const k of ['inputTokens','cachedInputTokens','cacheWriteTokens','outputTokens','inputPerMillion','cachedPerMillion','cacheWritePerMillion','outputPerMillion','requests','requestFee'])el(k).value=s.ai[k];}el('productLabel').value=version.label;el('billingType').value=version.billingType;el('unit').value=version.unit;el('evidenceNote').value=version.evidenceNote;void calculate();};row.append(reuse);
 const publish=document.createElement('button');publish.textContent='发布为对外参考价';publish.onclick=async()=>{if(currentProduct!==product||value('productCode')!==product){el('catalogStatus').textContent='产品已改变，请先刷新版本。';return;}const note=prompt('请说明本次价格调整原因（至少5字）；这不会启用真实收款。');if(!note)return;publish.disabled=true;try{const result=await api('/v1/pricing/products/'+encodeURIComponent(product)+'/publish','POST',{priceVersionId:version.priceVersionId,expectedPublishedId:currentHistory.publishedPriceId,note,idempotencyKey:crypto.randomUUID()});el('catalogStatus').textContent='已发布版本 '+result.revision+'；历史版本保留，真实收款未启用。';await history();}catch(error){el('catalogStatus').textContent=error.message;}finally{publish.disabled=false;}};row.append(publish);el('history').append(row);}
 el('catalogStatus').textContent='已读取 '+result.versions.length+' 个最近版本；当前修订 '+result.revision+'。';
}
el('loadHistory').onclick=()=>history().catch(error=>{el('catalogStatus').textContent=error.message;});
el('saveDraft').onclick=async()=>{el('saveDraft').disabled=true;try{if(currentProduct!==value('productCode'))await history();const s=scenario();const body={productCode:value('productCode'),label:value('productLabel'),billingType:value('billingType'),unit:value('unit'),price:s.retailPrice,expectedRevision:currentHistory.revision,scenario:s,validUntil:Date.now()+Number(value('evidenceDays'))*86400000,evidenceNote:value('evidenceNote')};await api('/v1/pricing/versions','POST',{...body,idempotencyKey:crypto.randomUUID()});await history();el('catalogStatus').textContent='新价格草稿已保存。核对后可选择发布；尚未改动对外价格。';}catch(error){el('catalogStatus').textContent=error.message;}finally{el('saveDraft').disabled=false;}};
`;
