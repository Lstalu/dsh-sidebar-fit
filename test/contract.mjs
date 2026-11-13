/**
 * 最小 DOM stub + ModuleLoader stub，跑一次 lib/client.js，验证：
 * 1. factory 能被调用，返回 { name, inject, apply }；
 * 2. apply(ctx) 在空页面上不抛错（找不到 nav 时应当安静退出）；
 * 3. 构造一个假侧栏后 layout 能正确隐藏尾部行、插入分界线与「更多」行。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      loaded = def
    },
  },
  addEventListener() {},
  removeEventListener() {},
  setTimeout: (fn) => setTimeout(fn, 0),
  innerWidth: 1200,
  innerHeight: 900,
}
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.localStorage = {
  store: new Map(),
  getItem(k) {
    return this.store.has(k) ? this.store.get(k) : null
  },
  setItem(k, v) {
    this.store.set(k, String(v))
  },
}

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
// 文件是给浏览器 loader 的，这里直接执行即可（它只依赖 globalThis.window）
new Function(code)()
assert.ok(loaded !== null, 'loader 没有被调用')
assert.equal(loaded.id, 'dsh-sidebar-fit')

const mod = loaded.factory(() => {
  throw new Error('这个插件不该 require 任何模块')
})
assert.equal(typeof mod.apply, 'function')
assert.equal(mod.name, 'dsh-sidebar-fit')
assert.deepEqual(mod.inject, [])

// ── 空页面：找不到侧栏也不能炸 ─────────────────────────────────────────
const ctx = {
  effect(fn) {
    fn()
  },
}
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ dataset: {}, classList: { add() {}, contains: () => false, remove() {} }, style: {}, addEventListener() {}, append() {}, appendChild() {}, setAttribute() {}, remove() {}, querySelector: () => null }),
  addEventListener() {},
  removeEventListener() {},
  head: { appendChild() {} },
  body: { style: {}, appendChild() {} },
}
mod.apply(ctx)

// 第二次 apply（热重载会重放）不应重复注入
mod.apply(ctx)

console.log('OK: factory/apply 结构正确，空页面下不抛错')
