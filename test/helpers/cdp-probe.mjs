// 用 CDP 驱动 Chromium：轮询页面里的探针结果，避免 --dump-dom 与脚本执行之间的竞态。
// Node 22+ 自带全局 WebSocket，不引入依赖。
import { spawn } from 'node:child_process';

export async function runPage(fileUrl, expression, { timeoutMs = 20000, interval = 40 } = {}) {
  const chrome = process.env.CHROMIUM || '/usr/bin/chromium';
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chromium 未在 10s 内就绪：' + buf.slice(-200))), 10000);
    child.stderr.on('data', d => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.on('exit', code => { clearTimeout(timer); reject(new Error('Chromium 提前退出 ' + code)); });
  });

  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const msgId = ++id;
    pending.set(msgId, { res, rej });
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });

  const cleanup = async () => {
    try { ws.close(); } catch {}
    child.kill('SIGKILL');
  };

  try {
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
    const { targetId } = await send('Target.createTarget', { url: fileUrl });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) throw new Error('页面内异常：' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      if (r.result?.value) return r.result.value;
      await new Promise(res => setTimeout(res, interval));
    }
    throw new Error('等待超时：' + expression);
  } finally {
    await cleanup();
  }
}