import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runPage } from './helpers/cdp-probe.mjs';

const execFileAsync = promisify(execFile);
const root = resolve('prototypes/v0.2');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-pathway-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['demo-data.js', 'metric-model.js', 'pathway-model.js']) {
    await copyFile(join(root, name), join(dir, name));
  }
  const html = await readFile(join(root, 'index.html'), 'utf8');
  await writeFile(join(dir, 'index.html'), html);
  return { dir, url: 'file://' + join(dir, 'index.html') };
}

// 页面探针：等应用就绪后进入“治疗与用药 / 当前用药”，返回 PASS 或 FAIL 原因。
const pageProbe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function'&&document.querySelector('#nav')?.children.length,'应用未就绪');
  go('治疗与用药','当前用药');
  await waitFor(()=>document.querySelectorAll('details.phase-fold').length>0,'没有治疗阶段卡');
  const folds=[...document.querySelectorAll('details.phase-fold')];
  const expected=state.records.filter(r=>r.kind==='当前用药').length;
  check(folds.length===expected,'卡数不等于治疗记录数：'+folds.length+' / '+expected);
  check(folds.every(d=>d.open===false&&!d.hasAttribute('open')),'存在默认展开的阶段卡');
  check(document.querySelectorAll('.phase-detail').length===folds.length,'阶段明细数量不对');
  check(folds.every(d=>d.querySelector('summary')),'缺少原生 summary');
  check(folds.every(d=>d.querySelector('summary').tabIndex>=0),'summary 不可聚焦');
  for(const d of folds){
    const s=d.querySelector('summary').textContent.replace(/\\s+/g,' ');
    check(s.includes('●'),'概要缺少阶段圆点');
    check(/ · .+ · .+展开细节/.test(s),'概要三件或展开提示缺失：'+s);
    check(!d.open,'概要阶段不应默认展示明细');
  }
  const first=folds[0];
  first.querySelector('summary').focus();
  check(document.activeElement===first.querySelector('summary'),'summary 无法获得焦点');
  first.querySelector('summary').click();
  check(first.open,'点击概要未展开');
  const detail=first.querySelector('.phase-detail');
  check(getComputedStyle(detail).display==='grid','展开区未按网格显示');
  const blocks=[...first.querySelectorAll('.phase-detail section.pd-block')];
  check(blocks.length===5,'展开区不是五块：'+blocks.length);
  check(blocks.map(b=>b.dataset.block).join(',')==='regimen,metrics,imaging,ae,support','五块顺序不对');
  check(blocks.map(b=>b.querySelector('h3')?.textContent.replace(/\\s+/g,'').replace(/^[1-5]/,'')).join('|')==='方案|指标和趋势|影像发现|副作用总结|心理/营养措施和效果','五块标题不对');
  check(blocks.every(b=>b.querySelector('.pd-summary')?.textContent.trim()),'存在没有概要的块');
  check(blocks.every(b=>b.querySelectorAll('.pd-items>div').length>0),'存在没有条目的块');
  check(blocks.every(b=>!b.querySelector('.pd-summary').textContent.trim().startsWith('无记录')),'示例数据的五块不应为空');
  check(!first.textContent.includes('缺失块')&&!first.textContent.includes('省略'),'不应以省略块代替空状态');

  const pathway=document.querySelector('.pathway');
  check(pathway.textContent.includes('合成示例'),'没有合成示例标识');
  check(pathway.textContent.includes('不构成医学建议'),'没有“不构成医学建议”说明');
  check(pathway.textContent.includes('计划 vs 实际'),'缺少计划 vs 实际对照');
  check(pathway.querySelectorAll('.pathway-table tbody tr').length===folds.length,'对照表行数不等于阶段数');
  check(pathway.textContent.includes('不显示数值或原文'),'缺少私密过滤口径');

  const imaging=blocks.find(b=>b.dataset.block==='imaging').textContent;
  const ae=blocks.find(b=>b.dataset.block==='ae').textContent;
  const judged=/建议|考虑|提示|符合|不除外|典型|严重|轻度|中度|好转|恶化|有效|无效|改善|缓解|稳定|进展|导致|引起|可能是因为|风险很高/;
  check(!judged.test(imaging),'影像块出现判读词：'+imaging);
  check(!judged.test(ae),'副作用块出现判读/归因词：'+ae);
  const supportItems=[...blocks.find(b=>b.dataset.block==='support').querySelectorAll('.pd-items>div')];
  const effect=supportItems.find(x=>x.querySelector('dt')?.textContent.includes('效果'));
  check(effect,'缺少效果条目');
  check(/^“[^”]+”$/.test(effect.querySelector('dd').textContent.trim()),'效果不是引号内原话：'+effect.textContent);

  // 独立打印脚本在主脚本之后加载；等待页面完成再派发打印事件。
  await waitFor(()=>document.readyState==='complete','页面未加载完成，打印脚本可能未注册');
  // 打印前展开、打印后逐卡恢复；重复 beforeprint 不应覆盖最初状态。
  first.open=false;
  window.dispatchEvent(new Event('beforeprint'));
  check(folds.every(d=>d.open),'beforeprint 未展开全部阶段');
  window.dispatchEvent(new Event('beforeprint'));
  window.dispatchEvent(new Event('afterprint'));
  check(folds.every(d=>!d.open),'afterprint 未恢复全部收起');
  first.open=true;
  window.dispatchEvent(new Event('beforeprint'));
  window.dispatchEvent(new Event('afterprint'));
  check(first.open&&folds.slice(1).every(d=>!d.open),'afterprint 未逐卡恢复原状态');
  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('治疗阶段折叠卡：默认收起、五块固定顺序、合成标识、打印前后展开恢复', async t => {
  const { url } = await fixture(t);
  const result = await runPage(url, pageProbe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});

// 读模型的零/一/多/日期未知/私密/缺块，均在真实页面里执行，顺带验证脚本没有全局报错。
const modelProbe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>window.BEIPAL_PATHWAY_MODEL,'读模型未加载');
  const M=window.BEIPAL_PATHWAY_MODEL;
  check(M&&typeof M.build==='function','读模型未加载');
  check(M.BLOCKS.map(b=>b[0]).join(',')==='regimen,metrics,imaging,ae,support','块顺序不对');
  const rec=(over={})=>Object.assign({id:1,kind:'当前用药',date:'2026-01-01',datePrecision:'day',ongoing:true,drug:'药A',dose:'',text:'原文',source:'本人抄录',private:false,history:[]},over);
  check(M.build([],[]).length===0,'零记录应为零卡');
  const one=M.build([rec()],[]);
  check(one.length===1,'单记录应为一卡');
  check(one[0].detail&&Object.keys(one[0].detail).join(',')==='regimen,metrics,imaging,ae,support','单卡五块缺失');
  const blank=['metrics','imaging','ae','support'];
  check(blank.every(k=>one[0].detail[k].summary.startsWith('无记录')),'无数据块未写“无记录”+说明');
  check(blank.every(k=>one[0].detail[k].items.length&&one[0].detail[k].items[0][0]==='说明'),'无数据块缺少说明');
  check(one[0].detail.regimen.summary.includes('药A'),'有数据块不应被当成空块');
  const many=M.build([rec({id:1,date:'2026-01-01'}),rec({id:2,date:'2026-02-01'}),rec({id:3,date:'2026-01-15'})],[]);
  check(many.map(s=>s.recordId).join(',')==='1,3,2','多记录未按开始日期升序');
  const unknown=M.build([rec({id:4,date:'',datePrecision:'unknown'}),rec({id:5,date:'2026-03',datePrecision:'month'})],[]);
  check(unknown.map(s=>s.recordId).join(',')==='5,4','日期未知阶段未排在最后：'+unknown.map(s=>s.recordId).join(','));
  check(unknown[1].detail.metrics.summary.includes('开始日期未知'),'未知日期阶段不应归入指标');
  const secret=rec({id:6,private:true,drug:'不应出现药名',dose:'不应出现剂量',text:'不应出现原文',date:'2026-04-01'});
  const priv=M.build([secret],[])[0];
  check(priv.private===true&&priv.phase==='私密治疗记录'&&priv.d==='日期已过滤','私密阶段概要未过滤');
  check(JSON.stringify(priv).includes('不应出现')===false,'私密阶段泄露数值或原文');
  check(Object.values(priv.detail).every(b=>b.summary.startsWith('已过滤')),'私密阶段五块未全部过滤');
  const metricRec=rec({id:7,date:'2026-06-01',ongoing:true});
  const metrics=[{id:'a',name:'指标A',unit:'u',method:'m',laboratory:'l',source:'s',points:[{date:'2026-01-01',value:2},{date:'2026-06-15',value:5},{date:'2026-07-01',value:6}]}];
  const mb=M.build([metricRec],metrics)[0].detail.metrics;
  check(mb.summary.includes('阶段内 2 个记录点'),'指标点数统计不对：'+mb.summary);
  check(mb.summary.includes('阶段前最近 2 → 阶段内最后 6'),'阶段前对比或趋势不对：'+mb.summary);
  check(!/(偏高|偏低|好转|恶化|有效|无效|正常范围)/.test(mb.summary),'不应评价指标好坏：'+mb.summary);
  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('治疗路径读模型：零/一/多、日期未知、私密过滤、缺块与指标趋势', async t => {
  const { url } = await fixture(t);
  const result = await runPage(url, modelProbe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});

const widthProbe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function','应用未就绪');
  go('治疗与用药','当前用药');
  await waitFor(()=>document.querySelectorAll('details.phase-fold').length,'没有阶段卡');
  const folds=[...document.querySelectorAll('details.phase-fold')];
  folds.forEach(d=>{d.open=true});
  const vw=document.documentElement.clientWidth;
  check(document.documentElement.scrollWidth<=vw+1,'页面横向溢出：'+document.documentElement.scrollWidth+' > '+vw);
  const bad=[...document.querySelectorAll('.phase-fold,.phase-detail,.pd-block')].filter(el=>{
    const r=el.getBoundingClientRect();
    return r.right>vw+1||r.left<-1||el.scrollWidth>el.clientWidth+1;
  });
  check(!bad.length,'卡片或块溢出：'+bad.map(x=>x.className).join(','));
  const sum=folds[0].querySelector('summary');
  const sr=sum.getBoundingClientRect();
  check(sr.height<220,'概要换行过高：'+sr.height);
  check(sr.width>vw*0.5,'概要宽度异常：'+sr.width);
  check(sum.scrollWidth<=sum.clientWidth+1,'概要自身横向溢出');
  check(getComputedStyle(sum).writingMode==='horizontal-tb','概要竖排');
  const cols=getComputedStyle(folds[0].querySelector('.phase-detail')).gridTemplateColumns.split(/\\s+/).filter(Boolean).length;
  check(cols===(__COLS__),'列数不对：'+cols);
  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

for (const [width, columns] of [[1280, 2], [900, 1], [720, 1], [390, 1]]) {
  test(`治疗阶段卡在 ${width}px 无横向溢出且不竖排`, async t => {
    const { url } = await fixture(t);
    const result = await runPage(url, widthProbe.replace('__COLS__', String(columns)), { width, height: 900, timeoutMs: 30000 });
    assert.equal(result, 'PASS');
  });
}

// 用真实 printToPDF 验收：只断言 CSS 存在不够，必须确认收起状态的正文进入 PDF。
test('printToPDF 实际展开五块正文并隐藏展开提示', { timeout: 90000 }, async t => {
  const { dir } = await fixture(t);
  const path = join(dir, 'index.html');
  const html = await readFile(path, 'utf8');
  await writeFile(path, html.replace('</body>', `<script>go('治疗与用药','当前用药');</script></body>`));
  const pdf = join(dir, 'pathway.pdf');
  const chrome = process.env.CHROMIUM || '/usr/bin/chromium';
  await execFileAsync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
    '--print-to-pdf=' + pdf, 'file://' + path
  ], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const py = [
    'import sys, unicodedata',
    'from pypdf import PdfReader',
    'r=PdfReader(sys.argv[1])',
    't="\\n".join((p.extract_text() or "") for p in r.pages)',
    'print(unicodedata.normalize("NFKC", t))'
  ].join('\n');
  const { stdout } = await execFileAsync('python3', ['-c', py, pdf], { maxBuffer: 8 * 1024 * 1024 });
  const text = stdout.replace(/\s+/g, '');
  assert.match(text, /治疗阶段折叠卡/, 'PDF 未包含折叠卡标题');
  for (const title of ['方案', '指标和趋势', '影像发现', '副作用总结', '心理/营养措施和效果']) {
    assert.ok(text.includes(title), 'PDF 缺少块标题：' + title);
  }
  for (const token of ['示例药物', '示例既往药物', '示例影像报告原文', '阶段范围', '记录每日饮水量', '白天口干的时候会想起来喝水']) {
    assert.ok(text.includes(token), 'PDF 缺少展开后的正文：' + token);
  }
  assert.ok(!text.includes('展开细节'), 'PDF 仍显示屏幕用展开提示');
});