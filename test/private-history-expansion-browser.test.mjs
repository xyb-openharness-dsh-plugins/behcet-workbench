import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

const execFileAsync = promisify(execFile);

// 真实浏览器回归：私密/未知更正历史初始不进入 DOM；公开历史与当前正文仍可见。
// 本人演示页逐记录展开/收起；导航、更正、隐私变动后重置；非本人视图没有私密历史。
const probe = `window.__privateHistoryProbe=(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const text=()=>q('main').textContent;
  const html=()=>q('main').innerHTML;
  const record=id=>state.records.find(r=>r.id===id);
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');

  const generic=record(4);
  generic.history=[
    {text:'公开旧版本正文',source:'公开来源',private:false},
    {text:'私密旧版本正文',source:'私密来源',private:true},
    {text:'未知隐私旧版本正文',source:'未知来源'},
    '旧格式未知历史正文'
  ];
  go('病情整理','资料库');
  check(text().includes('资料库私密更正后')===false,'测试起点异常');
  check(text().includes('公开旧版本正文'),'公开更正历史被误隐藏');
  check(!html().includes('私密旧版本正文')&&!html().includes('未知隐私旧版本正文')&&!html().includes('旧格式未知历史正文'),'私密/未知历史正文初始进入 DOM');
  check(!html().includes('history-private-body'),'初始已渲染私密历史容器');
  let toggle=q('[data-history-toggle="4"]');
  check(toggle.getAttribute('aria-expanded')==='false','私密历史初始不是收起状态');
  check(toggle.textContent.includes('3 条'),'未标出私密/未知历史条数');
  check(q('[data-owner-demo-note]').textContent.includes('无账号'),'本人页未说明无账号授权');

  toggle.click();
  check(q('[data-history-toggle="4"]').getAttribute('aria-expanded')==='true','展开后 aria-expanded 未更新');
  check(text().includes('私密旧版本正文')&&text().includes('未知隐私旧版本正文')&&text().includes('旧格式未知历史正文'),'展开后仍看不到私密/未知历史');
  check(!!q('.history-private-body'),'展开后缺少私密历史正文容器');
  check(q('[data-history-toggle="4"]').textContent.includes('收起'),'展开后按钮未变为收起');
  q('[data-history-toggle="4"]').click();
  check(!html().includes('私密旧版本正文')&&!html().includes('未知隐私旧版本正文')&&!html().includes('旧格式未知历史正文'),'收起后正文仍留在 DOM');
  check(!html().includes('history-private-body'),'收起后私密历史容器仍在 DOM');
  const other=record(5);
  other.history=[{text:'另一记录的私密历史',source:'另一来源',private:true}];
  go('病情整理','资料库');
  q('[data-history-toggle="4"]').click();
  check(!text().includes('另一记录的私密历史'),'展开一条记录时泄露了另一条记录的历史');
  q('[data-history-toggle="4"]').click();

  // 导航重置。
  q('[data-history-toggle="4"]').click();
  check(state.expandedHistory.has('4'),'展开状态未写入页面状态');
  go('看板');
  check(state.expandedHistory.size===0,'导航后展开状态未重置');
  check(text().includes('公开旧版本正文'),'非本人视图丢失公开历史');
  check(!html().includes('私密旧版本正文')&&!html().includes('未知隐私旧版本正文')&&!html().includes('旧格式未知历史正文'),'非本人视图泄露私密/未知历史');
  check(!html().includes('data-history-toggle'),'非本人视图仍提供私密历史展开入口');
  go('病情整理','资料库');
  check(!html().includes('history-private-body'),'返回后私密历史仍自动展开');

  // 更正重置。
  q('[data-history-toggle="4"]').click();
  check(html().includes('私密旧版本正文'),'更正前展开失败');
  click('[data-correct="4"]');
  q('#entry-text').value='资料库再次更正';
  click('[data-save-correction="4"]');
  check(state.expandedHistory.size===0,'保存更正后展开状态未重置');
  check(!html().includes('私密旧版本正文')&&!html().includes('未知隐私旧版本正文')&&!html().includes('旧格式未知历史正文'),'保存更正后私密历史仍显示');
  check(text().includes('公开旧版本正文'),'保存更正后公开历史丢失');

  // 隐私变动重置。
  q('[data-history-toggle="4"]').click();
  check(html().includes('私密旧版本正文'),'隐私变动前展开失败');
  q('[data-correct="4"]').closest('details').open=true;
  click('[data-toggle-private="4"]');
  check(record(4).private===true,'记录未标为私密');
  check(state.expandedHistory.size===0,'隐私变动后展开状态未重置');
  check(!html().includes('私密旧版本正文')&&!html().includes('未知隐私旧版本正文')&&!html().includes('旧格式未知历史正文'),'隐私变动后私密历史仍显示');
  check(text().includes('公开旧版本正文'),'隐私变动后公开历史丢失');

  // 医嘱页与回看弹窗：同样逐记录展开，弹窗初始不渲染私密正文。
  state.records.push({id:9001,kind:'医嘱记录',date:'2026-05-01',datePrecision:'day',text:'当前公开医嘱',proposer:'医生',source:'复诊口述',reviewDate:'2026-08-01',private:false,history:[
    {text:'公开旧医嘱',proposer:'医生',source:'旧来源',date:'2026-04-01',datePrecision:'day',reviewDate:'',private:false},
    {text:'私密旧医嘱',proposer:'医生',source:'私密来源',date:'2026-04-02',datePrecision:'day',reviewDate:'',private:true},
    {text:'未知旧医嘱',proposer:'医生',source:'未知来源',date:'2026-04-03',datePrecision:'day',reviewDate:''}
  ]});
  go('复诊与准备','医嘱记录');
  check(text().includes('公开旧医嘱'),'医嘱公开历史未显示');
  check(!html().includes('私密旧医嘱')&&!html().includes('未知旧医嘱'),'医嘱私密/未知历史初始进入 DOM');
  q('[data-history-toggle="9001"]').click();
  check(text().includes('私密旧医嘱')&&text().includes('未知旧医嘱'),'医嘱私密历史展开后不可见');
  q('[data-history-toggle="9001"]').click();
  click('[data-advice-view="9001"]');
  check(q('#dialog').open,'医嘱回看未打开');
  let body=q('#dialog-body').textContent;
  check(body.includes('当前公开医嘱')&&body.includes('公开旧医嘱'),'回看缺少当前事实或公开历史');
  check(!body.includes('私密旧医嘱')&&!body.includes('未知旧医嘱'),'回看弹窗初始渲染私密/未知历史');
  const dialogToggle=document.querySelector('#dialog-body [data-history-toggle="9001"]');
  const dialogHtml=q('#dialog-body').innerHTML; check(dialogToggle&&dialogToggle.getAttribute('aria-expanded')==='false','回看弹窗缺少收起状态的展开入口；body='+dialogHtml.slice(0,1200));
  dialogToggle.click();
  body=q('#dialog-body').textContent;
  check(body.includes('私密旧医嘱')&&body.includes('未知旧医嘱'),'回看弹窗展开后仍看不到私密历史');
  click('#dialog [data-action="cancel"]');

  // 非本人视图：公开历史仍显示，私密历史不显示，也没有展开入口。
  go('看板');
  const homeRow=q('[data-advice-row="9001"]');
  check(homeRow.textContent.includes('公开旧医嘱'),'首页丢失公开历史');
  check(!homeRow.textContent.includes('私密旧医嘱')&&!homeRow.textContent.includes('未知旧医嘱'),'首页展示私密/未知历史');
  homeRow.querySelector('[data-advice-view]').click();
  body=q('#dialog-body').textContent;
  check(body.includes('公开旧医嘱'),'首页回看丢失公开历史');
  check(!body.includes('私密旧医嘱')&&!body.includes('未知旧医嘱'),'首页回看泄露私密/未知历史');
  check(!document.querySelector('#dialog-body [data-history-toggle]'),'非本人回看仍提供私密历史展开入口');
  click('#dialog [data-action="cancel"]');

  // 设置页明确无账号授权。
  click('[data-action="privacy"]');
  const privacy=q('#dialog-body').textContent;
  check(privacy.includes('没有账号')&&privacy.includes('不是登录身份'),'隐私设置未明确无账号授权');
  check(privacy.includes('默认不渲染正文')&&privacy.includes('打印不输出'),'隐私设置未说明历史保护与打印边界');
  click('#dialog [data-action="cancel"]');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('私密/未知更正历史按记录主动展开，导航/更正/隐私变动重置，非本人不显示', { timeout: 60000 }, async t => {
  const fx = await makePrototypeFixture(t, 'beipal-private-history-expand-');
  await fx.injectProbe(`<script>${probe}</script>`);
  const result = await runPage(fx.url, 'window.__privateHistoryProbe || document.body.dataset.privateHistory || ""', { timeoutMs: 40000 });
  assert.equal(result, 'PASS');
});

test('printToPDF 不输出已展开的私密/未知更正历史，公开历史仍可打印', { timeout: 90000 }, async t => {
  const fx = await makePrototypeFixture(t, 'beipal-private-history-print-');
  const html = await fx.readIndex();
  const setup = `<script>
  (() => {
    const r=state.records.find(x=>x.id===4);
    r.history=[
      {text:'公开历史可打印',source:'公开来源',private:false},
      {text:'私密历史不可打印',source:'私密来源',private:true},
      {text:'未知隐私历史不可打印',source:'未知来源'}
    ];
    go('病情整理','资料库');
    state.expandedHistory.add('4');
    render();
    document.querySelectorAll('#main details').forEach(d=>{d.open=true});
    document.body.dataset.printReady='1';
  })();
  </script>`;
  await fx.writeIndex(html.replace('</body>', setup + '</body>'));
  const pdf = join(fx.dir, 'private-history.pdf');
  const chrome = process.env.CHROMIUM || '/usr/bin/chromium';
  await execFileAsync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
    '--print-to-pdf=' + pdf, fx.url
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
  assert.ok(text.includes('公开历史可打印'), 'PDF 丢失公开历史');
  assert.ok(!text.includes('私密历史不可打印'), 'PDF 输出了私密历史正文');
  assert.ok(!text.includes('未知隐私历史不可打印'), 'PDF 输出了未知隐私历史正文');
  assert.ok(text.includes('打印已隐藏') && text.includes('2条'), 'PDF 未说明私密历史已在打印时隐藏');
});