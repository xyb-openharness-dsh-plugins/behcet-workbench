import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPageWith } from './helpers/cdp-probe.mjs';

// 指标卡必须保持 group，翻转入口是 group 里的独立原生 button；来源按钮仍在卡面内，
// 因此不能把整卡改成 button。这个回归直接用 CDP 的 Accessibility 域核对读屏状态，
// 并用真实键盘/鼠标事件确认 aria-expanded、焦点和翻转没有分叉。
test('指标卡用 group + 独立原生按钮暴露 aria-expanded/controls，并保留键盘/鼠标/来源焦点', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-metric-ax-');
  await runPageWith(fx.url, async ({ send, sessionId, evaluate }) => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitEval = async (expression, message) => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const value = await evaluate(expression);
        if (value) return value;
        await sleep(25);
      }
      throw new Error(message);
    };
    const pressKey = async (key, code, keyCode, text) => {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode, text, unmodifiedText: text,
      }, sessionId);
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
      }, sessionId);
    };
    const pressEnter = () => pressKey('Enter', 'Enter', 13, '\r');
    const pressSpace = () => pressKey(' ', 'Space', 32, ' ');
    const readAx = async () => {
      const { nodes } = await send('Accessibility.getFullAXTree', {}, sessionId);
      return nodes.filter(node => !node.ignored).map(node => ({
        nodeId: node.nodeId,
        parentId: node.parentId,
        role: node.role?.value,
        name: node.name?.value,
        props: Object.fromEntries((node.properties || []).map(p => [p.name, p.value?.value])),
      }));
    };

    const ready = await evaluate(`(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      let end=Date.now()+8000;
      while(Date.now()<end){if(typeof go==='function'&&document.querySelector('#nav button'))break;await wait(20)}
      go('病情整理','指标检测');
      end=Date.now()+8000;
      while(Date.now()<end){if(document.querySelector('.mcard[data-card="a~0"]'))return true;await wait(20)}
      return false;
    })()`);
    assert.equal(ready, true, '指标检测页未就绪');

    const initial = await evaluate(`(()=>{
      const cards=[...document.querySelectorAll('.mcard[data-card]')].map(card=>{
        const toggle=card.querySelector(':scope > .mcard-hit');
        const back=card.querySelector('.mface.back');
        return {
          id:card.dataset.card,
          groupRole:card.getAttribute('role'),
          groupLabel:card.getAttribute('aria-label'),
          hasTabindex:card.hasAttribute('tabindex'),
          toggleTag:toggle?.tagName,
          toggleType:toggle?.getAttribute('type'),
          toggleIsDirectChild:toggle?.parentElement===card,
          toggleChildren:toggle?.children.length,
          expanded:toggle?.getAttribute('aria-expanded'),
          controls:toggle?.getAttribute('aria-controls'),
          label:toggle?.getAttribute('aria-label'),
          backId:back?.id,
          nestedButtons:card.querySelectorAll('button button').length,
          sourceButtons:card.querySelectorAll('.mface button[data-source]').length,
          overlay:{pointer:getComputedStyle(toggle).pointerEvents,opacity:getComputedStyle(toggle).opacity,position:getComputedStyle(toggle).position,z:getComputedStyle(toggle).zIndex},
          size:[card.getBoundingClientRect().width,card.getBoundingClientRect().height],
          toggleSize:[toggle.getBoundingClientRect().width,toggle.getBoundingClientRect().height],
        };
      });
      const a=cards.find(card=>card.id==='a~0');
      return {
        cards,
        uniqueControls:new Set(cards.map(card=>card.controls)).size===cards.length,
        controlsResolve:cards.every(card=>document.getElementById(card.controls)?.id===card.controls),
        a0:a,
        a0GroupLabel:document.querySelector('.mcard[data-card="a~0"]').getAttribute('aria-label'),
      };
    })()`);

    assert.ok(initial.cards.length >= 4, '指标卡数量不足：' + initial.cards.length);
    assert.equal(initial.uniqueControls, true, 'aria-controls 必须每卡唯一');
    assert.equal(initial.controlsResolve, true, 'aria-controls 必须指向卡内背面元素');
    for (const card of initial.cards) {
      assert.equal(card.groupRole, 'group', card.id + ' 的卡必须是 group');
      assert.equal(card.hasTabindex, false, card.id + ' 的 group 不应再承担焦点');
      assert.equal(card.toggleTag, 'BUTTON', card.id + ' 必须有原生按钮');
      assert.equal(card.toggleType, 'button', card.id + ' 的按钮必须 type=button');
      assert.equal(card.toggleIsDirectChild, true, card.id + ' 的按钮必须是卡的直接子元素');
      assert.equal(card.toggleChildren, 0, card.id + ' 的按钮不能包住卡面内容');
      assert.equal(card.nestedButtons, 0, card.id + ' 不能出现嵌套 button');
      assert.equal(card.expanded, 'false', card.id + ' 初始 aria-expanded 应为 false');
      assert.equal(card.controls, card.backId, card.id + ' 的 aria-controls 应指向背面 id');
      assert.ok(card.backId, card.id + ' 的背面缺少 id');
      assert.ok(card.label, card.id + ' 的按钮缺少可访问名称');
    }
    assert.equal(initial.a0.expanded, 'false');
    assert.match(initial.a0.label, /最新值.*查看趋势/, '可画卡初始提示应保留趋势口径：' + initial.a0.label);
    assert.equal(initial.a0.overlay.position, 'absolute', '翻转按钮应覆盖卡面');
    assert.equal(initial.a0.overlay.pointer, 'none', '透明覆盖按钮不应拦截卡面鼠标事件');
    assert.equal(initial.a0.overlay.opacity, '0', '翻转按钮不应改变卡片视觉');
    assert.equal(initial.a0.overlay.z, '2');
    assert.ok(Math.abs(initial.a0.size[0] - initial.a0.toggleSize[0]) < 1, '翻转按钮宽度应与卡一致');
    assert.ok(Math.abs(initial.a0.size[1] - initial.a0.toggleSize[1]) < 1, '翻转按钮高度应与卡一致');

    await send('Accessibility.enable', {}, sessionId);
    const axInitial = await readAx();
    const groupInitial = axInitial.find(node => node.role === 'group' && node.name === initial.a0GroupLabel);
    const toggleInitial = axInitial.find(node => node.role === 'button' && node.name === initial.a0.label);
    assert.ok(groupInitial, 'AX 树里找不到指标卡 group');
    assert.ok(toggleInitial, 'AX 树里找不到指标卡翻转按钮');
    assert.equal(toggleInitial.parentId, groupInitial.nodeId, '翻转按钮必须直接属于卡 group');
    assert.equal(toggleInitial.props.expanded, false, 'AX 初始 expanded 应为 false');
    assert.equal(toggleInitial.props.focusable, true, 'AX 翻转按钮应可聚焦');

    const focused = await evaluate(`(()=>{
      const card=document.querySelector('.mcard[data-card="a~0"]');
      const toggle=card.querySelector(':scope > .mcard-hit');
      toggle.focus();
      const style=getComputedStyle(card);
      return {
        focused:document.activeElement===toggle,
        focusVisible:toggle.matches(':focus-visible'),
        outlineStyle:style.outlineStyle,
        outlineWidth:style.outlineWidth,
        width:card.getBoundingClientRect().width,
        height:card.getBoundingClientRect().height,
      };
    })()`);
    assert.equal(focused.focused, true, '键盘焦点应落在翻转按钮');
    assert.equal(focused.focusVisible, true, '翻转按钮应显示焦点态');
    assert.equal(focused.outlineStyle, 'solid', '卡 group 应承接可见焦点环');
    assert.equal(focused.outlineWidth, '3px', '焦点环宽度应保持 3px');

    await pressEnter();
    await waitEval(`document.querySelector('.mcard[data-card="a~0"] .mcard-hit').getAttribute('aria-expanded')==='true'`, '真实 Enter 未翻到背面');
    const flipped = await evaluate(`(()=>{
      const card=document.querySelector('.mcard[data-card="a~0"]');
      const toggle=card.querySelector(':scope > .mcard-hit');
      return {
        expanded:toggle.getAttribute('aria-expanded'),
        label:toggle.getAttribute('aria-label'),
        focused:document.activeElement===toggle,
        frontInert:card.querySelector('.mface.front').inert,
        backInert:card.querySelector('.mface.back').inert,
        width:card.getBoundingClientRect().width,
        height:card.getBoundingClientRect().height,
      };
    })()`);
    assert.equal(flipped.expanded, 'true');
    assert.match(flipped.label, /趋势面.*返回/, '翻面提示应保留趋势面口径：' + flipped.label);
    assert.equal(flipped.focused, true, '翻面后焦点不应丢失');
    assert.equal(flipped.frontInert, true, '翻面后正面应 inert');
    assert.equal(flipped.backInert, false, '翻面后背面不应 inert');
    assert.equal(flipped.width, focused.width, '翻面不能改变卡宽');
    assert.equal(flipped.height, focused.height, '翻面不能改变卡高');

    await sleep(80);
    const axFlipped = await readAx();
    const groupFlipped = axFlipped.find(node => node.role === 'group' && node.name === initial.a0GroupLabel);
    const toggleFlipped = axFlipped.find(node => node.role === 'button' && node.name === flipped.label);
    assert.ok(groupFlipped, '翻面后 AX 树丢失指标卡 group');
    assert.ok(toggleFlipped, '翻面后 AX 树丢失翻转按钮');
    assert.equal(toggleFlipped.parentId, groupFlipped.nodeId, '翻面后按钮仍应直接属于 group');
    assert.equal(toggleFlipped.props.expanded, true, 'AX 翻面后 expanded 应为 true');
    assert.equal(toggleFlipped.props.controls, initial.a0.controls, 'AX 应暴露 aria-controls 目标');

    await pressSpace();
    await waitEval(`document.querySelector('.mcard[data-card="a~0"] .mcard-hit').getAttribute('aria-expanded')==='false'`, '真实 Space 未翻回正面');
    assert.equal(await evaluate(`document.querySelector('.mcard[data-card="a~0"] .mcard-hit').getAttribute('aria-label')`), initial.a0.label, '翻回提示应与初始一致');

    const point = await evaluate(`(()=>{
      const card=document.querySelector('.mcard[data-card="a~0"]');
      card.scrollIntoView({block:'center'});
      const r=card.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }, sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }, sessionId);
    await waitEval(`document.querySelector('.mcard[data-card="a~0"] .mcard-hit').getAttribute('aria-expanded')==='true'`, '真实鼠标点击未翻转卡片');

    const source = await evaluate(`(()=>{
      const button=document.querySelector('.mcard[data-card="a~0"] .mface.back .metric-points button[data-source]');
      button.focus();
      return {focused:document.activeElement===button,tag:button.tagName,tabIndex:button.tabIndex};
    })()`);
    assert.equal(source.tag, 'BUTTON', '来源入口应是原生按钮');
    assert.equal(source.tabIndex, 0, '来源按钮应可通过 Tab 到达');
    assert.equal(source.focused, true, '来源按钮应能获得焦点');
    await pressEnter();
    await waitEval(`document.querySelector('#dialog').open`, '来源按钮未打开来源弹窗');
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    }, sessionId);
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    }, sessionId);
    await waitEval(`!document.querySelector('#dialog').open`, '来源弹窗未关闭');
    const restored = await evaluate(`(()=>{
      const card=document.querySelector('.mcard[data-card="a~0"]');
      return {
        focusRestored:document.activeElement===document.querySelector('.mcard[data-card="a~0"] .mface.back .metric-points button[data-source]'),
        expanded:card.querySelector('.mcard-hit').getAttribute('aria-expanded'),
      };
    })()`);
    assert.equal(restored.focusRestored, true, '关闭来源弹窗后焦点应回到来源按钮');
    assert.equal(restored.expanded, 'true', '打开来源不应把卡片翻回正面');
  }, { width: 1200, height: 900 });
});
