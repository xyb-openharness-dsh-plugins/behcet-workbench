// 多步 CDP 会话：真实鼠标点击、表单赋值、页面重载与状态读取。
// 只驱动浏览器，不注入或改写原型文件；表单赋值走 DOM setter + input/change
// 事件（无头环境下无法逐字敲键盘），入口与按钮点击一律走 Input.dispatchMouseEvent。
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openSession({
  chromium = process.env.CHROMIUM || '/usr/bin/chromium',
  width = 1280,
  height = 900,
  launchTimeoutMs = 15000,
} = {}) {
  const profileDir = await mkdtemp(join(tmpdir(), 'beipal-cdp-'));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  const child = spawn(chromium, args, { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`等待 Chromium DevTools 超时（${launchTimeoutMs}ms）：${stderr.slice(-800)}`));
    }, launchTimeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chromium 提前退出（code=${code}）：${stderr.slice(-800)}`));
    });
  });

  const session = new CdpSession({ child, profileDir, wsUrl, width, height });
  try {
    await session.connect();
    await session.prepare();
    return session;
  } catch (error) {
    await session.close().catch(() => {});
    throw error;
  }
}

class CdpSession {
  constructor({ child, profileDir, wsUrl, width, height }) {
    this.child = child;
    this.profileDir = profileDir;
    this.wsUrl = wsUrl;
    this.width = width;
    this.height = height;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.events = [];
    this.exceptions = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接 DevTools WebSocket 超时')), 10000);
      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(`DevTools WebSocket 错误：${event.message || 'unknown'}`));
      };
    });
    this.ws.onmessage = (event) => this.#onMessage(event.data);
    this.ws.onclose = () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('DevTools WebSocket 已关闭'));
      }
      this.pending.clear();
    };
  }

  #onMessage(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}（${message.error.code}）`));
      else resolve(message.result);
      return;
    }
    if (!message.method) return;
    this.events.push({ method: message.method, params: message.params, at: Date.now() });
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails;
      this.exceptions.push(details?.exception?.description || details?.text || '未知页面异常');
    }
    const waiters = this.eventWaiters.get(message.method);
    if (waiters?.length) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(message.params);
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 命令超时：${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }));
    });
  }

  waitEvent(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        const index = waiters.findIndex((item) => item.timer === timer);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`等待页面事件超时：${method}`));
      }, timeoutMs);
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push({ resolve, reject, timer });
      this.eventWaiters.set(method, waiters);
    });
  }

  async prepare() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    this.targetId = targetId;
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    // 把下载落到本次会话的临时目录，避免污染仓库或用户下载目录。
    await mkdir(join(this.profileDir, 'downloads'), { recursive: true }).catch(() => {});
    await this.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: join(this.profileDir, 'downloads'),
    }).catch(() => {});
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || '页面脚本异常';
      throw new Error(text.split('\n')[0]);
    }
    return result.result?.value;
  }

  async waitFor(expression, { timeoutMs = 8000, intervalMs = 40, label = expression } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        if (await this.eval(expression)) return true;
      } catch (error) {
        lastError = error;
      }
      await sleep(intervalMs);
    }
    throw new Error(`等待条件超时（${label}）${lastError ? `：${lastError.message}` : ''}`);
  }

  async settle() {
    try {
      await this.eval(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 20))))',
      );
    } catch {
      await sleep(30);
    }
  }

  async goto(url) {
    const loaded = this.waitEvent('Page.loadEventFired', 15000);
    await this.send('Page.navigate', { url });
    await loaded;
    await this.waitFor("document.readyState === 'complete' && !!document.querySelector('#nav button')", {
      timeoutMs: 15000,
      label: '原型加载完成',
    });
    await this.settle();
  }

  async reload() {
    const loaded = this.waitEvent('Page.loadEventFired', 15000);
    await this.send('Page.reload', { ignoreCache: false });
    await loaded;
    await this.waitFor("document.readyState === 'complete' && !!document.querySelector('#nav button')", {
      timeoutMs: 15000,
      label: '原型重载完成',
    });
    await this.settle();
  }

  async text(selector) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
    })()`);
  }

  async attr(selector, name) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? el.getAttribute(${JSON.stringify(name)}) : null;
    })()`);
  }

  async rect(selector) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        found: true,
        x, y,
        width: r.width,
        height: r.height,
        visible: r.width > 0 && r.height > 0,
        disabled: el.disabled === true,
        hit: hit ? (hit === el || el.contains(hit) ? 'self' : hit.tagName + (hit.id ? '#' + hit.id : '') + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.trim().split(/\\s+/).join('.') : '')) : 'none',
      };
    })()`);
  }

  async click(selector) {
    const info = await this.rect(selector);
    if (!info.found) throw new Error(`找不到可点击元素：${selector}`);
    if (!info.visible) throw new Error(`元素不可见：${selector}`);
    if (info.disabled) throw new Error(`元素被禁用：${selector}`);
    if (info.hit !== 'self') throw new Error(`点击目标被遮挡：${selector} 命中 ${info.hit}`);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: info.x, y: info.y, button: 'left', buttons: 1, clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: info.x, y: info.y, button: 'left', buttons: 0, clickCount: 1,
    });
    await this.settle();
    return info;
  }

  async clickText(text, { selector = 'button', scope = '#main', exact = true, index = 0 } = {}) {
    const attr = 'data-path-walk-hit';
    const result = await this.eval(`(() => {
      const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const scopeEl = document.querySelector(${JSON.stringify(scope)}) || document;
      const els = [...scopeEl.querySelectorAll(${JSON.stringify(selector)})];
      const wanted = ${JSON.stringify(text)};
      const exact = ${exact};
      const matches = els.filter((el) => exact ? norm(el.textContent) === wanted : norm(el.textContent).includes(wanted));
      if (!matches.length) {
        return { found: false, available: els.map((el) => norm(el.textContent)).filter(Boolean).slice(0, 40) };
      }
      document.querySelectorAll('[${attr}]').forEach((el) => el.removeAttribute('${attr}'));
      const el = matches[${index}] || matches[0];
      el.setAttribute('${attr}', '1');
      return { found: true, text: norm(el.textContent), tag: el.tagName };
    })()`);
    if (!result.found) {
      throw new Error(`找不到文本为「${text}」的 ${selector}；可见文本：${(result.available || []).join(' / ') || '无'}`);
    }
    await this.click(`[${attr}="1"]`);
    return result;
  }

  // 无头环境下逐字敲键盘对 date 控件不可靠，这里用原生 value setter + input/change。
  // 点击仍走真实鼠标事件；报告会把“表单赋值方式”单列说明。
  async fill(selector, value) {
    const actual = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('找不到表单控件：' + ${JSON.stringify(selector)});
      el.focus();
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, ${JSON.stringify(value)});
      else el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    })()`);
    if (actual !== value) throw new Error(`表单赋值未生效：${selector} 期望「${value}」实际「${actual}」`);
    return actual;
  }

  async isChecked(selector) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? el.checked === true : null;
    })()`);
  }

  async setChecked(selector, desired) {
    const current = await this.isChecked(selector);
    if (current === null) throw new Error(`找不到复选框：${selector}`);
    if (current !== desired) await this.click(selector);
    const after = await this.isChecked(selector);
    if (after !== desired) throw new Error(`复选框状态未改变：${selector}`);
  }

  async state() {
    return this.eval(`({
      view: state.view,
      sub: state.sub,
      recordCount: state.records.length,
      selected: [...state.selected],
      timelineSelected: [...state.timelineSelected],
      dialogOpen: document.querySelector('#dialog')?.open === true,
      dialogTitle: document.querySelector('#dialog-title')?.textContent || '',
      paneOpen: document.querySelector('#pane')?.hidden === false,
    })`);
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, Buffer.from(data, 'base64'));
  }

  async close() {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    } catch {}
    if (this.child && !this.child.killed) {
      this.child.kill('SIGKILL');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        this.child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await rm(this.profileDir, { recursive: true, force: true }).catch(() => {});
  }
}