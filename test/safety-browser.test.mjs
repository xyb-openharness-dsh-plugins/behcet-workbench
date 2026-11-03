import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs'
import { runPage } from './helpers/cdp-probe.mjs'

const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium'

test('S03 求助信息：未临床审核状态、来源与联系提示，急救句只作待核占位', async (t) => {
  const fx = await makePrototypeFixture(t, 'beipal-safety-')
  await fx.injectProbe(`<script>
(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try{
    const check=(value,message)=>{if(!value)throw new Error(message)};
    go('看板');
    const entry=[...document.querySelectorAll('#main .card')].find(card=>card.querySelector('small')&&card.querySelector('small').textContent.trim()==='安全提示'&&card.querySelector('h3')&&card.querySelector('h3').textContent.trim()==='求助信息');
    check(entry,'看板没有「安全提示 / 求助信息」入口');
    entry.querySelector('button').click();
    check(state.view==='复诊与准备'&&state.sub==='什么情况要马上就医','入口没有落到 S03');

    const main=document.querySelector('#main');
    const text=main.textContent;
    check(main.querySelector('[data-safety-state="unreviewed"]'),'缺少未临床审核状态区');
    check(text.includes('本页内容尚待临床审核'),'没有写明尚待临床审核');
    check(text.includes('未临床审核'),'没有写明未临床审核');
    check(text.includes('临床审核 0 次'),'没有给出审核次数');
    check(!/审核状态[：:]\\s*已审核/.test(text),'把审核状态写成了已审核');
    check(!/本页(?:内容)?已通过临床审核/.test(text),'冒充已通过临床审核');
    check(text.includes('来源'),'页面没有来源信息');
    check(/联系[^。]{0,12}(医生|医疗|专业人员|急救)/.test(text),'没有联系医疗专业人员的提示');
    check(!main.querySelector('[data-action="discuss"]'),'S03 不应出现 AI 讨论入口');
    check(!/立即(?:就医|就诊)|必须马上就医|应前往急诊/.test(text),'出现了未经审核的就医结论');

    const emergency=main.querySelector('[data-emergency-status="pending"]');
    check(emergency,'急救句没有待核占位');
    const emergencyText=emergency.textContent;
    check(emergencyText.includes('【待核】'),'急救句没有待核标记');
    check(emergencyText.includes('不作为本页证据'),'急救句被写成了证据');
    check(emergencyText.includes('未临床审核'),'急救句没有说明未审核');

    const sourceButton=main.querySelector('[data-action="s03-sources"]');
    check(sourceButton,'没有查看来源与审核状态的入口');
    sourceButton.focus();
    sourceButton.click();
    const dialog=document.querySelector('#dialog');
    check(dialog.open,'来源弹窗没有打开');
    check(document.querySelector('#dialog-title').textContent==='来源与审核状态','来源弹窗标题不对');
    const body=document.querySelector('#dialog-body');
    const bodyText=body.textContent;
    check(body.querySelector('[data-review-state="unreviewed"]'),'来源弹窗缺少未审核状态');
    check(bodyText.includes('患者访谈 0 次'),'来源弹窗没有访谈次数');
    check(bodyText.includes('E08'),'来源弹窗缺少 E08');
    check(bodyText.includes('第 54–60 页'),'来源弹窗缺少页码');
    check(bodyText.includes('EULAR 2018 / 2025'),'来源弹窗缺少 EULAR 2025');
    check(bodyText.includes('全文未取得'),'把未取得的来源写成已核对');
    check(bodyText.includes('急救句仍待核'),'来源弹窗没有说明急救句待核');
    check(body.querySelector('a[href*="gov.cn"]'),'缺少官方指南链接');

    dialog.querySelector('[data-action="cancel"]').click();
    await wait(0);
    check(!dialog.open,'来源弹窗没有关闭');
    check(document.activeElement===sourceButton,'关闭后焦点没有回到来源按钮');

    document.body.dataset.safetyTest='PASS';
  }catch(error){
    document.body.dataset.safetyTest='FAIL: '+error.message;
  }
})()
</script>`)
  const run = spawnSync(CHROMIUM, ['--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=4000', '--dump-dom', fx.url], { encoding: 'utf8', timeout: 30000 })
  if (run.error && run.error.code === 'ENOENT') {
    t.skip('Chromium 不可用')
    return
  }
  assert.equal(run.status, 0, run.stderr || 'Chromium 运行失败')
  const result = run.stdout.match(/data-safety-test="([^"]*)"/)
  assert.ok(result, '测试探针没有运行')
  assert.equal(result[1], 'PASS', result[1])
})


test('S03 求助信息在 390px 无整页横向滚动，状态区单列', async (t) => {
  const fx = await makePrototypeFixture(t, 'beipal-safety-narrow-')
  const result = await runPage(fx.url, `(async()=>{try{
    const check=(v,m)=>{if(!v)throw Error(m)};
    const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
    await waitFor(()=>typeof go==='function','应用未就绪');
    go('复诊与准备','什么情况要马上就医');
    await waitFor(()=>document.querySelector('[data-safety-state="unreviewed"]'),'未进入 S03');
    const root=document.documentElement;
    check(root.scrollWidth<=root.clientWidth+1,'出现整页横向滚动：'+root.scrollWidth+' > '+root.clientWidth);
    const grid=document.querySelector('#main .s03-grid');
    check(grid,'缺少审核状态三格');
    check(getComputedStyle(grid).gridTemplateColumns.split(' ').length===1,'窄屏状态区仍为多列');
    const buttons=[...document.querySelectorAll('#main button')];
    check(buttons.length>=2,'窄屏缺少操作按钮');
    check(buttons.every(b=>b.getBoundingClientRect().height>=44),'窄屏按钮高度不足 44px');
    return 'PASS';
  }catch(e){return 'FAIL: '+e.message}})()`, { timeoutMs: 30000, width: 390, height: 844 })
  assert.equal(result, 'PASS')
})
