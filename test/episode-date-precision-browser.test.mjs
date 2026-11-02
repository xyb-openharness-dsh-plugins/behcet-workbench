import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('发作开始日期支持日/月/未知精度，未知与月份不误排、不伪造并安全校验年份与结束日期', async t => {
  const browser = process.env.CHROMIUM || '/usr/bin/chromium';
  const dir = await mkdtemp(join(tmpdir(), 'beipal-date-precision-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js', 'metric-model.js']) await copyFile(join(root, name), join(dir, name));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const probe = `<script>
  (async () => { try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    const realNow=Date.now;let seq=realNow();Date.now=()=>seq+=1000;
    const prec=v=>{const el=document.querySelector('#entry-precision');el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))};
    const click=sel=>{const el=document.querySelector(sel);if(!el)throw Error('找不到 '+sel);el.click()};

    check(!isDayDate('12345-01-01') && inYearRange('12345-01-01')===false,'五位年份非法');
    check(isMonthDate('2026-03') && !isMonthDate('2026-13'),'月份合法范围');
    check(!isDayDate('2026-02-30'),'非法公历日');
    check(datePrecision({datePrecision:'month',date:'2026-03-15'})==='unknown' && startText({datePrecision:'month',date:'2026-03-15'})==='未知','声明月份与具体日不匹配时不推断具体日');
    check(datePrecision({datePrecision:'day',date:'2026-03'})==='unknown','声明日与月份不匹配时不推断');
    check(datePrecision({datePrecision:'unknown',date:'2026-03-15'})==='unknown','显式未知不推断');
    check(datePrecision({date:'2026-03-15'})==='day' && datePrecision({date:'2026-03'})==='month','无声明旧记录按有效格式推断');
    check(datePrecision({date:'2026-02-30'})==='unknown','无声明旧记录非法日期不推断');

    go('发作与病程','发作记录');

    // A 月精度：只记到月份，不编造具体日
    click('[data-action=add]');
    prec('month');
    check(document.querySelector('#entry-date-field').style.display==='none','月精度隐藏日输入');
    check(document.querySelector('#entry-month-field').style.display!=='none','月精度显示月输入');
    document.querySelector('#entry-month').value='2026-03';
    document.querySelector('#entry-site').value='口腔';
    document.querySelector('#entry-text').value='仅记得三月的发作';
    document.querySelector('#entry-source').value='本人转述';
    click('[data-action=save-episode]');
    const m=state.records.at(-1);
    check(m.date==='2026-03' && m.datePrecision==='month','月精度保存');
    check(datePrecision(m)==='month' && dateText(m)==='2026-03（仅月份）' && startText(m)==='2026-03（仅月份）','月精度读模型');
    check(document.querySelector('main').textContent.includes('开始：2026-03（仅月份）'),'月精度回看');
    check(!document.querySelector('main').innerHTML.includes('2026-03-01') && !document.querySelector('main').innerHTML.includes('2026-03-0'),'未编造具体日');

    // B 未知精度：允许留空、不用今天补齐；开始未知时结束日期不作误判
    click('[data-action=add]');
    prec('unknown');
    check(document.querySelector('#entry-unknown-note').style.display!=='none','未知精度提示可见');
    document.querySelector('#entry-end').value='2020-01-01';
    document.querySelector('#entry-text').value='日期未知的发作';
    click('[data-action=save-episode]');
    const u=state.records.at(-1);
    check(u.date==='' && u.datePrecision==='unknown' && u.endDate==='2020-01-01','未知精度保存且不比较结束');
    check(dateText(u)==='日期未知' && !document.querySelector('main').innerHTML.includes(realNow().toString()),'未知未用当前日期补齐');
    check(document.querySelector('main').textContent.includes('开始：未知'),'未知回看');

    // C 年份与结束日期安全校验
    click('[data-action=add]');
    prec('day');
    document.querySelector('#entry-date').value='1800-01-01';
    document.querySelector('#entry-text').value='越界年份';
    click('[data-action=save-episode]');
    check(document.querySelector('#dialog').open && document.querySelector('#entry-date').getAttribute('aria-invalid')==='true' && document.querySelector('#episode-errors').textContent.includes('年份'),'过低年份被拒并标出字段');
    document.querySelector('#entry-date').value='2200-01-01';
    click('[data-action=save-episode]');
    check(document.querySelector('#dialog').open && document.querySelector('#episode-errors').textContent.includes('年份'),'过高年份被拒');
    document.querySelector('#entry-date').value='2026-01-02';
    document.querySelector('#entry-end').value='2200-01-01';
    click('[data-action=save-episode]');
    check(document.querySelector('#dialog').open && document.querySelector('#entry-end').getAttribute('aria-invalid')==='true' && document.querySelector('#episode-errors').textContent.includes('年份'),'结束年份越界被拒');
    prec('month');
    document.querySelector('#entry-month').value='2026-03';
    document.querySelector('#entry-end').value='2026-02-28';
    document.querySelector('#entry-text').value='月开始与更早结束';
    click('[data-action=save-episode]');
    check(document.querySelector('#dialog').open && document.querySelector('#episode-errors').textContent.includes('结束日期不能早于开始月份') && document.activeElement.id==='entry-end','结束早于开始月被拒且聚焦');
    document.querySelector('#entry-end').value='2026-03-01';
    click('[data-action=save-episode]');
    check(!document.querySelector('#dialog').open,'同月结束日不误判为早于');
    const same=state.records.at(-1);
    check(same.date==='2026-03' && same.datePrecision==='month' && same.endDate==='2026-03-01','同月结束日保存');
    click('[data-action=add]');
    prec('month');
    document.querySelector('#entry-text').value='缺月份';
    click('[data-action=save-episode]');
    check(document.querySelector('#dialog').open && document.querySelector('#entry-month').getAttribute('aria-invalid')==='true' && document.querySelector('#episode-errors').textContent.includes('开始月份'),'月精度缺值被拒');
    document.querySelector('#dialog-foot [data-action=cancel]').click();

    // D 时间线：具体日倒序，月/未知单独分组，五位年份不参与排序
    const dayRec=state.records.find(r=>r.kind==='发作记录'&&r.date==='2026-10-18');
    check(!!dayRec,'存在具体日示例记录');
    const badId=999999;
    state.records.push({id:badId,kind:'资料库',date:'12345-01-01',department:'测试科',text:'五位年份记录',source:'合成示例',private:false,history:[]});
    check(datePrecision({date:'12345-01-01'})==='unknown' && dateText({date:'12345-01-01'})==='日期未知','越界五位年份降级为未知');
    go('病情一图秀','治疗与事件节点');
    const sel=(id,on)=>{const el=document.querySelector('[data-timeline-select="'+id+'"]');el.checked=on;el.dispatchEvent(new Event('change',{bubbles:true}))};
    sel(dayRec.id,true);sel(m.id,true);sel(u.id,true);sel(badId,true);
    const result=document.querySelector('#timeline-results');
    check(result.querySelectorAll('section').length===3,'日/月/未知分为三组');
    const heads=[...result.querySelectorAll('h3')].map(x=>x.textContent);
    check(heads.includes('2026-10-18'),'具体日标题');
    check(heads.some(x=>x.includes('仅知月份')),'月份分组标题');
    check(heads.some(x=>x.includes('日期未知')),'未知分组标题');
    check(!heads.some(x=>x.includes('12345')),'五位年份不作为日期标题');
    check(!heads.some(x=>x.includes('2026-03-01')),'月份不伪造成某一天');
    const daySection=[...result.querySelectorAll('section')].find(s=>s.querySelector('h3')&&s.querySelector('h3').textContent==='2026-10-18');
    check(!!daySection && daySection.textContent.includes('口腔不适') && !daySection.textContent.includes('仅记得三月的发作'),'月记录不混入具体日分组');
    const monthSection=[...result.querySelectorAll('section')].find(s=>s.querySelector('h3')&&s.querySelector('h3').textContent.includes('仅知月份'));
    check(!!monthSection && monthSection.textContent.includes('仅记得三月的发作') && monthSection.textContent.includes('2026-03（仅月份）'),'月记录在月份分组');
    const unknownSection=[...result.querySelectorAll('section')].find(s=>s.querySelector('h3')&&s.querySelector('h3').textContent.includes('日期未知'));
    check(!!unknownSection && unknownSection.textContent.includes('日期未知的发作') && unknownSection.textContent.includes('五位年份记录'),'未知分组含未知与五位年份记录');
    check(document.querySelector('[data-timeline-select="'+m.id+'"]').closest('label').textContent.includes('2026-03（仅月份）'),'选择列表月份可读');
    click('[data-timeline-source="'+m.id+'"]');
    check(document.querySelector('#dialog-body').textContent.includes('2026-03（仅月份）') && !document.querySelector('#dialog-body').textContent.includes('2026-03-01'),'月份来源弹窗保留精度');
    document.querySelector('#dialog').close();
    click('[data-timeline-source="'+u.id+'"]');
    check(document.querySelector('#dialog-body').textContent.includes('日期未知'),'未知日期来源弹窗');
    document.querySelector('#dialog').close();

    // E 摘要导出、AI 草稿与选择列表显示月/未知精度
    go('复诊与准备','就诊准备与导出');
    const pick=(id,on)=>{const el=document.querySelector('[data-select="'+id+'"]');el.checked=on;el.dispatchEvent(new Event('change',{bubbles:true}))};
    pick(m.id,true);pick(u.id,true);
    const preview=document.querySelector('#export-preview').textContent;
    check(preview.includes('开始：2026-03（仅月份）') && preview.includes('开始：未知'),'摘要含月与未知精度');
    check(!preview.includes('2026-03-01'),'摘要不编造具体日');
    let blob;const create=URL.createObjectURL,anchorClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>(blob=b,'blob:test');HTMLAnchorElement.prototype.click=function(){};
    click('[data-action=download]');const downloaded=await blob.text();URL.createObjectURL=create;HTMLAnchorElement.prototype.click=anchorClick;
    check(downloaded.includes('开始：2026-03（仅月份）') && downloaded.includes('开始：未知') && !downloaded.includes('开始：2026-03-01'),'下载内容保留日期精度');
    document.querySelector('[data-action=discuss]').click();
    const draft=document.querySelector('#draft').value;
    check(draft.includes('开始：2026-03（仅月份）') && draft.includes('开始：未知'),'AI 草稿含月与未知精度');
    check(!draft.includes('开始：2026-03-01'),'AI 草稿不编造具体日');
    check(document.querySelector('[data-select="'+u.id+'"]').closest('label').textContent.includes('日期未知'),'选择列表未知日期可读');

    // F 更正历史保留旧精度
    go('发作与病程','发作记录');
    click('[data-correct="'+m.id+'"]');
    prec('day');
    document.querySelector('#entry-date').value='2026-03-15';
    click('[data-save-correction]');
    check(m.date==='2026-03-15' && m.datePrecision==='day','更正为日精度');
    check(m.history.at(-1).date==='2026-03' && m.history.at(-1).datePrecision==='month','更正历史保留月精度');
    check(document.querySelector('main').textContent.includes('开始：2026-03（仅月份）') && document.querySelector('main').textContent.includes('开始：2026-03-15'),'新旧值分别按精度显示');

    // G 异常旧数据仅在测试中注入，验证未修改和真实更正的完整追溯。
    for (const [id,date,precision] of [[900001,'2026-03-15','month'],[900002,'1800-01-01','day']]) {
      const legacy={id,kind:'发作记录',date,datePrecision:precision,endDate:'',site:'口腔',text:'测试注入异常 '+id,source:'测试注入',private:false,history:[]};
      state.records.push(legacy);state.timelineSelected.add(id);render();
      go('病情一图秀','治疗与事件节点');
      const unknown=[...document.querySelectorAll('#timeline-results section')].find(section=>section.querySelector('h3')?.textContent.includes('日期未知'));
      check(unknown?.textContent.includes('测试注入异常 '+id) && ![...document.querySelectorAll('#timeline-results section')].filter(section=>section!==unknown).some(section=>section.textContent.includes('测试注入异常 '+id)),'异常值归入未知且不作排序标题');
      go('发作与病程','发作记录');
      click('[data-correct="'+id+'"]');
      check(document.querySelector('#dialog-body').textContent.includes(date) && document.querySelector('#dialog-body').textContent.includes(precision),'更正表单展示原始值与原始精度');
      click('[data-save-correction]');
      check(legacy.date===date && legacy.datePrecision===precision && legacy.history.length===0,'直接保存不覆盖异常值或产生历史');
      click('[data-correct="'+id+'"]');document.querySelector('#entry-text').value+='已修改';click('[data-save-correction]');
      check(legacy.date===date && legacy.datePrecision===precision && legacy.history.length===1 && legacy.history[0].date===date && legacy.history[0].datePrecision===precision,'更正文案保留原始日期与精度');
      check(document.querySelector('main').textContent.includes('原始值：'+date+'；原始精度：'+precision),'页面可回看原始异常值与精度');
      click('[data-correct="'+id+'"]');prec('day');document.querySelector('#entry-date').value='2026-04-01';click('[data-save-correction]');
      check(legacy.date==='2026-04-01' && legacy.history.at(-1).date===date && legacy.history.at(-1).datePrecision===precision,'日期更正保留原始精度');
      check(document.querySelector('main').textContent.includes('原始值：'+date+'；原始精度：'+precision),'更正后历史可回看原始值');
    }
    click('[data-action=add]');document.querySelector('#entry-date').value='2026-07-10';prec('month');
    check(document.querySelector('#entry-month').value==='2026-07','日转月自动填充');
    prec('day');document.querySelector('#entry-date').value='2026-08-10';prec('month');
    check(document.querySelector('#entry-month').value==='2026-08','再次切换刷新自动月份');
    const monthInput=document.querySelector('#entry-month');monthInput.value='2026-06';monthInput.dispatchEvent(new Event('input',{bubbles:true}));
    prec('day');document.querySelector('#entry-date').value='2026-09-10';prec('month');
    check(monthInput.value==='2026-06','保留手动输入的月份');click('[data-action=cancel]');

    // H 异常结束日期仅为测试注入；未经明确更正时不得丢失。
    for (const [id,badEnd] of [[900003,'2026-02-30'],[900004,'1800-01-01']]) {
      const legacy={id,kind:'发作记录',date:'2026-01-01',datePrecision:'day',endDate:badEnd,site:'口腔',text:'测试注入异常结束 '+id,source:'测试注入',private:false,history:[]};
      state.records.push(legacy);render();click('[data-correct="'+id+'"]');
      check(document.querySelector('#dialog-body').textContent.includes('原始值：'+badEnd) && document.querySelector('#entry-end').disabled,'表单提示原始结束日期并默认保留');
      click('[data-save-correction]');
      check(legacy.endDate===badEnd && legacy.history.length===0,'直接保存保留异常结束日期且无历史');
      click('[data-correct="'+id+'"]');document.querySelector('#entry-text').value+='已修改';click('[data-save-correction]');
      check(legacy.endDate===badEnd && legacy.history.at(-1).endDate===badEnd,'修改其他字段保留原始结束日期');
      click('[data-correct="'+id+'"]');click('#entry-end-replace');document.querySelector('#entry-end').value='2026-04-01';click('[data-save-correction]');
      check(legacy.endDate==='2026-04-01' && legacy.history.at(-1).endDate===badEnd,'明确更正保留原始结束日期历史');
      check(document.querySelector('main').textContent.includes('结束：待核（原始值：'+badEnd+'）'),'更正历史标明异常结束日期');
    }
    const clearEnd={id:900005,kind:'发作记录',date:'2026-01-01',datePrecision:'day',endDate:'2026-02-30',site:'',text:'测试清除异常结束',source:'测试注入',private:false,history:[]};
    state.records.push(clearEnd);render();click('[data-correct="900005"]');click('#entry-end-replace');click('[data-save-correction]');
    check(clearEnd.endDate==='' && clearEnd.history.at(-1).endDate==='2026-02-30','明确留空可设为未知并保留历史');

    Date.now=realNow;
    document.body.dataset.datePrecisionTest='PASS';
  } catch(e) { document.body.dataset.datePrecisionTest='FAIL: '+e.message; } })();
  </script>`;
  await writeFile(join(dir, 'index.html'), html.replace('</body>', probe + '</body>'));
  const run = spawnSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'file://' + join(dir, 'index.html')], { encoding: 'utf8', timeout: 30000 });
  if (run.error?.code === 'ENOENT') { t.skip('Chromium 不可用；设置 CHROMIUM 指向浏览器'); return; }
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /data-date-precision-test="PASS"/, run.stdout.match(/data-date-precision-test="[^"]*"/)?.[0] || run.stderr);
});
