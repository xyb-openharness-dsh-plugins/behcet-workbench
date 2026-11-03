import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';

test('治疗记录保留未知、精度、来源、更正与私密出口', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-treatment-');
  const html = fx.html;
  const probe = `<script>(async()=>{try{
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('治疗与用药','当前用药');document.querySelector('[data-action=add]').click();
    document.querySelector('[data-action=save-treatment]').click();
    check(document.querySelector('#t-drug').getAttribute('aria-invalid')==='true' && document.activeElement.id==='t-drug','空记录校验');
    document.querySelector('#t-drug').value='合成药名';document.querySelector('#t-text').value='合成原文';document.querySelector('#t-source').value='合成处方';
    document.querySelector('#t-precision').value='month';document.querySelector('#t-precision').dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('[data-action=save-treatment]').click();check(document.querySelector('#t-month').getAttribute('aria-invalid')==='true','缺月份校验');
    document.querySelector('#t-month').value='2026-05';document.querySelector('#t-private').checked=true;document.querySelector('[data-action=save-treatment]').click();
    const r=state.records.at(-1);check(r.date==='2026-05' && r.datePrecision==='month' && !r.dose && !state.selected.has(r.id),'月份、未知剂量及私密默认');
    check(document.querySelector('main').textContent.includes('剂量原文：未知') && document.querySelector('main').textContent.includes('2026-05（仅月份）'),'结构化回看');
    document.querySelector('[data-action=discuss]').click();check(!document.querySelector('#draft').value.includes('合成药名'),'私密 AI 排除');
    go('复诊与准备','就诊准备与导出');check(!document.querySelector('#export-preview').textContent.includes('合成药名'),'私密导出默认排除');
    go('治疗与用药','当前用药');document.querySelector('[data-correct="'+r.id+'"]').click();
    document.querySelector('#t-private').checked=false;document.querySelector('#t-drug').value='更正药名';document.querySelector('#t-dose').value='原文剂量';document.querySelector('#t-source').value='更正来源';document.querySelector('#t-precision').value='unknown';document.querySelector('#t-precision').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-save-correction]').click();
    check(r.history[0].drug==='合成药名' && r.history[0].source==='合成处方' && r.history[0].private===true && r.date==='' && r.datePrecision==='unknown','更正历史及未知日期');
    check(!document.querySelector('main').textContent.includes('合成处方'),'本人页初始泄露私密旧来源');
    const historyToggle=document.querySelector('[data-history-toggle="'+r.id+'"]');
    check(historyToggle&&historyToggle.getAttribute('aria-expanded')==='false','本人页缺少私密历史展开入口');
    historyToggle.click();
    check(document.querySelector('main').textContent.includes('合成处方'),'本人展开后不能回看旧来源');
    document.querySelector('[data-history-toggle="'+r.id+'"]').click();
    go('看板');check(!document.querySelector('main').textContent.includes('合成处方'),'首页不泄露私密历史');
    document.querySelector('[data-action=discuss]').click();check(document.querySelector('#draft').value.includes('更正药名') && !document.querySelector('#draft').value.includes('合成处方'),'AI 仅当前公开版本');
    go('复诊与准备','就诊准备与导出');const choice=document.querySelector('[data-select="'+r.id+'"]');choice.checked=true;choice.dispatchEvent(new Event('change',{bubbles:true}));check(document.querySelector('#export-preview').textContent.includes('原文剂量') && !document.querySelector('#export-preview').textContent.includes('合成处方'),'导出仅当前选择');
    document.body.dataset.treatmentTest='PASS';
  }catch(e){document.body.dataset.treatmentTest='FAIL: '+e.message}})();</script>`;
  await writeFile(fx.indexPath,html.replace('</body>',probe+'</body>'));
  const run=spawnSync(process.env.CHROMIUM||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--dump-dom',fx.url],{encoding:'utf8',timeout:30000});
  if(run.error?.code==='ENOENT'){t.skip('Chromium 不可用；设置 CHROMIUM');return}
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/data-treatment-test="PASS"/,run.stdout.match(/data-treatment-test="[^"]*"/)?.[0]||run.stderr);
});
