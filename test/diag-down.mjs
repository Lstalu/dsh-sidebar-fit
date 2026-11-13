/**
 * 单向诊断：复现「存储值远大于当前可用上限 → 向下拖没反应」。
 *
 * 用法：node test/diag-down.mjs
 * 判定：把 localStorage 预置成一个远超 bounds.max 的值，重载后
 *   1) 渲染值应被裁到 max；
 *   2) 立刻向下拖 20px 就应当有变化（而不是要空拖掉几百像素）；
 *   3) 顺带量出 badge 的实际矩形，确认它没吃掉分界线的可拖区。
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  for (const id of [
    'playwright',
    'playwright-core',
    'G:/deepseek_Harness/01-data/dsh-home/profiles/desktop/node_modules/playwright',
    'G:/deepseek_Harness/01-data/dsh-home/profiles/desktop/node_modules/playwright-core',
  ]) {
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
  console.log('SKIP: 本机找不到 playwright');
  process.exit(0);
}

function findChromium() {
  const fs = require('node:fs');
  const root = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!fs.existsSync(root)) return null;
  for (const dir of fs.readdirSync(root)) {
    if (!dir.startsWith('chromium-')) continue;
    for (const rel of ['chrome-win\\chrome.exe', 'chrome-win64\\chrome.exe']) {
      const exe = path.join(root, dir, rel);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

const exe = findChromium();
if (exe === null) {
  console.log('SKIP: 没有 chromium 可执行文件');
  process.exit(0);
}

const html = path.join(here, 'harness.html').replace(/\\/g, '/');
const browser = await pw.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto('file:///' + html);

// 预置一个「用户在大窗口下拉到很大、之后窗口变小」的典型值
await page.evaluate(() => localStorage.setItem('dsh-sidebar-fit:minWorkspace', '1400'));
await page.reload();
await page.waitForTimeout(500);

const state = () =>
  page.evaluate(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    const region = document.querySelector('div[class*="regionArea"]');
    const handle = document.querySelector('.sidebar-fit-handle');
    const badge = document.querySelector('.sidebar-fit-badge');
    const hb = handle.getBoundingClientRect();
    const bb = badge === null ? null : badge.getBoundingClientRect();
    return {
      stored: localStorage.getItem('dsh-sidebar-fit:minWorkspace'),
      minH: region.style.minHeight,
      maxHeight: nav.style.maxHeight,
      hidden: nav.querySelectorAll('.sidebar-fit-hidden').length,
      aria: handle.getAttribute('aria-valuenow'),
      overflow: handle.dataset.overflow,
      handle: { x: Math.round(hb.x), y: Math.round(hb.y), w: Math.round(hb.width), h: Math.round(hb.height) },
      badge: bb === null ? null : { x: Math.round(bb.x), w: Math.round(bb.width), h: Math.round(bb.height) },
    };
  });

const out = {};
out.afterLoad = await state();

// 装一个事件探针：确认 pointerdown / pointermove 到底有没有落到分界线上，
// 以及 onHandleDown 是否真的进入拖动态（handle 上有 data-dragging）。
await page.evaluate(() => {
  window.__ev = { down: 0, move: 0, onHandle: 0, dragging: [] };
  const handle = document.querySelector('.sidebar-fit-handle');
  handle.addEventListener('pointerdown', () => {
    window.__ev.down += 1;
  });
  handle.addEventListener('pointermove', () => {
    window.__ev.move += 1;
  });
});

// 抓分界线「左侧」位置（远离右侧 badge），向下拖 3 步 × 20px
const hb = await page.locator('.sidebar-fit-handle').boundingBox();
const x = hb.x + 40;
let y = hb.y + hb.height / 2;
await page.mouse.move(x, y);
await page.mouse.down();
out.draggingAfterDown = await page.evaluate(
  () => document.querySelector('.sidebar-fit-handle').dataset.dragging ?? null,
);
out.downSteps = [];
for (let i = 1; i <= 3; i += 1) {
  await page.mouse.move(x, y + i * 20);
  await page.waitForTimeout(30);
  out.downSteps.push(await state());
}
await page.mouse.up();
await page.waitForTimeout(120);
out.afterDown = await state();
out.events = await page.evaluate(() => ({ ...window.__ev }));

// 再测「抓右侧 badge 区域」是否被吃掉
y = hb.y + hb.height / 2;
const xr = hb.x + hb.width - 20;
await page.mouse.move(xr, y);
await page.mouse.down();
await page.mouse.move(xr, y + 40);
await page.waitForTimeout(60);
out.badgeZoneDrag = await state();
await page.mouse.up();

console.log(JSON.stringify(out, null, 2));
await browser.close();
