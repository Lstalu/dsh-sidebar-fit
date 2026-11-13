/**
 * 性能回归台：在真实浏览器里数「一次布局计算花掉多少次强制同步布局」。
 *
 * 用法：node test/perf.mjs
 * 依赖：本机已装 playwright（dsh-browser 自带）。找不到就打印 SKIP 退出 0。
 *
 * 判定口径：把 getBoundingClientRect / clientHeight / getComputedStyle 包一层计数，
 * 再用真实用户交互（键盘、拖动分界线）驱动插件，看这些 API 被调了几次。
 * 这三个 API 命中缓存时应当接近 0。
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  const candidates = [
    'playwright',
    'playwright-core',
    'G:/deepseek_Harness/01-data/dsh-home/profiles/desktop/node_modules/playwright',
    'G:/deepseek_Harness/01-data/dsh-home/profiles/desktop/node_modules/playwright-core',
  ];
  for (const id of candidates) {
    try {
      return require(id);
    } catch (error) {
      /* 换下一个 */
    }
  }
  return null;
}

const pw = loadPlaywright();
if (pw === null) {
  console.log('SKIP: 本机找不到 playwright，跳过浏览器性能回归');
  process.exit(0);
}

const html = path.join(here, 'harness.html').replace(/\\/g, '/');
// 本机 ms-playwright 只装了 chromium-1234，而 profile 里的 playwright 版本号更高，
// 默认会去找不存在的 chromium_headless_shell-1254。直接指定本机已有的可执行文件。
function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const fs = require('node:fs');
  if (!fs.existsSync(root)) return null;
  for (const dir of fs.readdirSync(root)) {
    if (!dir.startsWith('chromium-')) continue;
    for (const rel of [
      'chrome-win\\chrome.exe',
      'chrome-win64\\chrome.exe',
    ]) {
      const exe = path.join(root, dir, rel);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

const exe = findChromium();
if (exe === null) {
  console.log('SKIP: 本机没有可用的 chromium 可执行文件');
  process.exit(0);
}

const browser = await pw.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 900, height: 1600 } });

await page.addInitScript(() => {
  const c = { gbcr: 0, clientHeight: 0, gcs: 0 };
  window.__perf = c;
  const gbcr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function patched() {
    c.gbcr += 1;
    return gbcr.call(this);
  };
  const chDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get() {
      c.clientHeight += 1;
      return chDesc.get.call(this);
    },
  });
  const gcs = window.getComputedStyle;
  window.getComputedStyle = function patchedGcs(...args) {
    c.gcs += 1;
    return gcs.apply(this, args);
  };
  window.__resetPerf = () => {
    c.gbcr = 0;
    c.clientHeight = 0;
    c.gcs = 0;
  };
});

await page.goto('file:///' + html);
await page.waitForTimeout(400);

const out = {};

// —— 0. 计数自检：冷启动必须真的读到尺寸，否则下面的 0 都是假的 ——
out.selftest = await page.evaluate(async () => {
  window.__resetPerf();
  // 直接读一次，确认补丁生效
  document.body.getBoundingClientRect();
  void document.body.clientHeight;
  getComputedStyle(document.body).fontSize;
  const after = { ...window.__perf };
  window.__resetPerf();
  return after;
});

// —— 1. 冷路径：改视口高度 → ResizeObserver 作废缓存 → 一次完整重算 ——
await page.evaluate(() => window.__resetPerf());
await page.setViewportSize({ width: 900, height: 1560 });
await page.waitForTimeout(300);
out.coldResize = await page.evaluate(() => ({ ...window.__perf }));
await page.setViewportSize({ width: 900, height: 1600 });
await page.waitForTimeout(300);

// —— 2. 稳态：布局已算完，再让观察器自然触发一次（缓存全命中）——
await page.evaluate(() => window.__resetPerf());
await page.evaluate(() => {
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(200);
out.steadyResize = await page.evaluate(() => ({ ...window.__perf }));

// —— 2. 键盘：5 次 ArrowUp（每次 +24px）——
await page.evaluate(() => window.__resetPerf());
const handle = page.locator('.sidebar-fit-handle');
for (let i = 0; i < 5; i += 1) {
  await handle.press('ArrowUp');
  await page.waitForTimeout(30);
}
out.keyboard5 = await page.evaluate(() => ({ ...window.__perf }));

// —— 3. 逐行收纳：把视口压矮到 1000px，让 11 行面板真的放不下 ——
await page.setViewportSize({ width: 900, height: 1000 });
await page.waitForTimeout(300);
await page.evaluate(() => window.__resetPerf());
const box = await handle.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
const steps = [];
for (let i = 1; i <= 16; i += 1) {
  await page.mouse.move(cx, Math.max(2, cy - i * 20));
  await page.waitForTimeout(20);
  steps.push(
    await page.evaluate(() => {
      const nav = document.querySelector('nav[class*="panelList"]');
      return {
        hidden: nav.querySelectorAll('.sidebar-fit-hidden').length,
        minH: document.querySelector('div[class*="regionArea"]').style.minHeight,
      };
    }),
  );
}
await page.mouse.up();
await page.waitForTimeout(150);
out.drag16 = await page.evaluate(() => ({ ...window.__perf }));
out.oneRowPerStep = steps;

// —— 4. 结果校核：逐行收纳是否仍然成立 ——
out.result = await page.evaluate(() => {
  const nav = document.querySelector('nav[class*="panelList"]');
  const region = document.querySelector('div[class*="regionArea"]');
  return {
    hidden: nav.querySelectorAll('.sidebar-fit-hidden').length,
    hiddenLabels: [...nav.querySelectorAll('.sidebar-fit-hidden')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent.trim(),
    ),
    maxHeight: nav.style.maxHeight,
    minHeight: region.style.minHeight,
  };
});

// —— 5. 复位后应当全恢复 ——
await handle.press('Home');
await page.waitForTimeout(120);
out.afterHome = await page.evaluate(() => {
  const nav = document.querySelector('nav[class*="panelList"]');
  const region = document.querySelector('div[class*="regionArea"]');
  return {
    hidden: nav.querySelectorAll('.sidebar-fit-hidden').length,
    maxHeight: nav.style.maxHeight,
    minHeight: region.style.minHeight,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
