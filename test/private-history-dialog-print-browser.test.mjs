import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

const execFileAsync = promisify(execFile);

// 复审回归：①关闭医嘱回看弹窗后私密正文必须离开 DOM，导航/重开不得保留；
// ②默认打印（不手动展开）保留公开更正历史，私密/未知历史始终不进入 PDF；
// ③beforeprint/afterprint 只临时打开公开历史并恢复原状。
const probe = `window.__privateDialogProbe=(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const bodyText=()=>{let c=document.body.cloneNode(true);c.querySelectorAll('script').forEach(s=>s.remove());return c.textContent};
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');

  state.records.push({id:9001,kind:'医嘱记录',date:'2026-05-01',datePrecision:'day',text:'当前公开医嘱',proposer:'医生',source:'复诊口述',reviewDate:'2026-08-01',private:false,history:[
    {text:'公开旧医嘱',proposer:'医生',source:'旧来源',date:'2026-04-01',datePrecision:'day',reviewDate:'',private:false},
    {text:'私密旧医嘱',proposer:'医生',source:'私密来源',date:'2026-04-02',datePrecision:'day',reviewDate:'',private:true},
    {text:'未知旧医嘱',proposer:'医生',source:'未知来源',date:'2026-04-03',datePrecision:'day',reviewDate:''}
  ]});
  const openAdvice=()=>{go('复诊与准备','医嘱记录');click('[data-advice-view="9001"]');check(q('#dialog').open,'医嘱回看未打开')};
  const expandPrivate=()=>{let t=document.querySelector('#dialog-body [data-history-toggle="9001"]');check(!!t,'回看弹窗缺少私密历史展开入口');t.click();check(q('#dialog-body').textContent.includes('私密旧医嘱'),'回看弹窗展开后看不到私密历史')};

  // 1. 取消按钮关闭：三块内容清空，展开状态清除，重开不恢复私密正文。
  openAdvice();
  expandPrivate();
  check(state.expandedHistory.has('9001'),'弹窗展开未写入页面状态');
  click('#dialog [data-action="cancel"]');
  await waitFor(()=>!q('#dialog').open&&q('#dialog-body').innerHTML===''&&!state.expandedHistory.has('9001'),'关闭弹窗后未清空正文/展开状态');
  check(q('#dialog-foot').innerHTML==='','关闭弹窗后操作区仍留 DOM');
  check(q('#dialog-title').textContent==='','关闭弹窗后标题仍留 DOM');
  check(!document.querySelector('#dialog .history-private-body'),'关闭弹窗后私密正文容器仍在 DOM');
  check(!bodyText().includes('私密旧医嘱')&&!bodyText().includes('未知旧医嘱'),'关闭弹窗后整页 DOM 仍含私密/未知正文');
  go('看板');
  check(!bodyText().includes('私密旧医嘱')&&!bodyText().includes('未知旧医嘱'),'导航后整页 DOM 仍含私密/未知正文');
  openAdvice();
  check(!document.querySelector('#dialog-body .history-private-body'),'重开弹窗后私密正文又出现');
  check(q('#dialog-body [data-history-toggle="9001"]').getAttribute('aria-expanded')==='false','重开弹窗后私密历史不是收起状态');

  // 2. 右上角 × 关闭同样清理；关闭后导航不保留。
  expandPrivate();
  click('#close-dialog');
  await waitFor(()=>!q('#dialog').open&&q('#dialog-body').innerHTML===''&&!state.expandedHistory.has('9001'),'× 关闭后未清空正文/展开状态');
  check(q('#dialog-foot').innerHTML===''&&q('#dialog-title').textContent==='','× 关闭后仍有界面内容残留');
  check(!document.querySelector('#dialog .history-private-body'),'× 关闭后私密正文容器仍在 DOM');
  go('病情整理','资料库');
  go('看板');
  check(!bodyText().includes('私密旧医嘱')&&!bodyText().includes('未知旧医嘱'),'× 关闭并导航后整页 DOM 仍含私密/未知正文');

  // 3. beforeprint 临时打开公开历史；afterprint 恢复原状，私密正文仍由用户控制。
  const generic=state.records.find(r=>r.id===4);
  generic.history=[
    {text:'公开历史可打印',source:'公开来源',private:false},
    {text:'私密历史不可打印',source:'私密来源',private:true},
    {text:'未知隐私历史不可打印',source:'未知来源'}
  ];
  go('病情整理','资料库');
  state.expandedHistory.add('4');
  render();
  const pub=q('details[data-history-public="4"]');
  check(!pub.open,'公开历史默认应为闭合');
  check(q('[data-history-toggle="4"]').getAttribute('aria-expanded')==='true','私密历史准备状态不正确');
  window.dispatchEvent(new Event('beforeprint'));
  check(pub.open,'beforeprint 未临时打开公开历史');
  check(!!q('.history-private-body'),'beforeprint 不应改变私密历史的展开状态');
  window.dispatchEvent(new Event('afterprint'));
  check(!pub.open,'afterprint 未恢复公开历史的闭合状态');
  check(state.expandedHistory.has('4')&&!!q('.history-private-body'),'afterprint 不应清除私密历史的展开状态');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

function setupHistory(recordId, items) {
  return `<script>
  (() => {
    const r=state.records.find(x=>x.id===${recordId});
    r.history=${JSON.stringify(items)};
    go('病情整理','资料库');
    state.expandedHistory.add('${recordId}');
    render();
    document.body.dataset.printReady='1';
  })();
  </script>`;
}

test('关闭医嘱回看弹窗后清除私密正文 DOM，导航与重开不保留', { timeout: 60000 }, async t => {
  const fx = await makePrototypeFixture(t, 'beipal-private-dialog-');
  await fx.injectProbe(`<script>${probe}</script>`);
  const result = await runPage(fx.url, 'window.__privateDialogProbe || document.body.dataset.privateDialog || ""', { timeoutMs: 40000 });
  assert.equal(result, 'PASS');
});

test('默认 printToPDF 打印公开历史并隐藏私密/未知历史', { timeout: 90000 }, async t => {
  const fx = await makePrototypeFixture(t, 'beipal-private-print-default-');
  const html = await fx.readIndex();
  await fx.writeIndex(html.replace('</body>', setupHistory(4, [
    { text: '公开历史可打印', source: '公开来源', private: false },
    { text: '私密历史不可打印', source: '私密来源', private: true },
    { text: '未知隐私历史不可打印', source: '未知来源' },
  ]) + '</body>'));
  const pdf = join(fx.dir, 'private-history-default.pdf');
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
  assert.ok(text.includes('公开历史可打印'), '默认打印丢失公开更正历史');
  assert.ok(!text.includes('私密历史不可打印'), 'PDF 输出了私密历史正文');
  assert.ok(!text.includes('未知隐私历史不可打印'), 'PDF 输出了未知隐私历史正文');
  assert.ok(text.includes('打印已隐藏') && text.includes('2条'), 'PDF 未说明私密历史已在打印时隐藏');
});