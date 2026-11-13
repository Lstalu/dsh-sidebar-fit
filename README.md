# dsh-sidebar-fit

左侧栏插件一多，`全局面板` 那一串按钮就是 `flex:none`，只会一路往上长，把下面的
`工作区 / 会话列表` 压成零高度——最后只剩一行半工作区可看。

这个插件给这两块之间插一条可拖动的分界线，并把塞不下的面板行收进官方那一行「更多」
（官方没有「更多」时才在列表尾部自建一条「更多 N 项」）。纯浏览器侧增强，不改官方插件源码。

## 用法

- **拖动分界线**：上下拖，决定工作区保底高度。向下拖 = 工作区变大、面板行让位；向上拖 = 面板行拿回空间。
  拖动是逐行生效的：每多拖约一行的高度，就正好多收一行进「更多」，不会一次吞掉两行。
- **双击分界线**：恢复默认保底高度（200px）。
- **键盘**：分界线获得焦点后 `↑`/`↓` 每次 24px，`PageUp`/`PageDown` 每次 120px，`Home`/`Esc` 复位。
- **溢出面板**：塞不下的行直接从列表里隐去，收进官方「更多」菜单末尾的一段（分隔线 + 若干项），
  点其中任意一项等同于点原来那一行；官方「更多」不存在时，改在列表尾部显示自建「更多 N 项」浮层。
- 侧栏被收成 56px 图标栏时整套逻辑自动让位，不干预。

设置存在 `localStorage` 的 `dsh-sidebar-fit:minWorkspace` 里，只记「工作区保底高度」而不是「显示几行」，所以换窗口大小、增删插件都会重算。

## 实现要点

- 选择器用后缀匹配（`nav[class*="panelList"]`、`div[class*="regionArea"]`、`button[class*="panelRow"]`），不吃 CSS Module 的 hash 前缀。
- 预算 = 侧栏总高 − 除面板列表/工作区外的静态占位 − 工作区保底 − 分界线；超出则从尾部隐藏面板行，并至少保留两行。
- **必须真的给面板列表一个 `max-height`**。`nav` 是 `flex:none`，不给上限时它永远按内容自然高度撑开，工作区 `flex:1` 再去吃剩下的两块都不溢出，「放不下」这个条件几乎不会成立；一旦成立就已经大幅超支，收纳判断会一次跳过好几行。给了上限，预算才和真实几何对齐。
- 同时钉住 `nav > button{flex:0 0 auto}`：`nav` 有了 `max-height` 之后子项默认 `flex-shrink:1`，总高超出时行会被压扁（36px → 二十几 px），测量值失真同样导致跳格。
- 「更多」行的高度只在预算里扣一次：官方已经有「更多」时不再重复扣（重复扣会让能放的行数比实际少一行，表现也是首拖吞两行）。
- `ResizeObserver` 只看侧栏根节点，**不看工作区**——工作区高度是插件自己写 `minHeight` 写出来的，观察它就是自己给自己回火。
- 所有写 DOM 的位置都先做等值判断，避免自己的改动再次触发 observer 形成回环。
- 隐藏行用 `.sidebar-fit-hidden{display:none!important}`，不卸载节点，所以「更多」浮层里点一下就是复用原按钮的 `click()`，无需重放路由逻辑。

## 性能

侧栏布局计算做到「稳态零强制同步布局」。`test/perf.mjs` 在真实 chromium 里把
`getBoundingClientRect` / `clientHeight` / `getComputedStyle` 各包一层计数，再用真实交互驱动：

| 场景 | gbcr | clientHeight | gcs |
| --- | --- | --- | --- |
| 计数自检（必须非零，否则下面的 0 不可信） | 1 | 1 | 1 |
| 冷路径（改视口，缓存全失效） | 6 | 1 | 5 |
| 稳态（观察器再触发一次，缓存全命中） | 0 | 0 | 0 |
| 键盘 5×`↑` | 0 | 0 | 0 |
| 拖动 16 帧 | 0 | 0 | 0 |

做法是两级缓存：`st.geo`（侧栏总高 / 静态占位 / 侧栏宽度）只随窗口尺寸与根节点子元素增删失效；
`st.metrics`（行高 / 「更多」行高 / 底部 margin）只在面板列表内部结构变化时失效。
命中缓存时 `measureLayout()` 退化成纯算术。

历史上没缓存时，一次拖动每帧要重排十来个节点，还叠着观察器回火，主线程会被打满（表现为整个 DSH 卡住）。

## 开发与自测

```powershell
node --check lib\client.js      # 语法
node test\contract.mjs          # 模块契约（构造 factory/apply，空页面下 apply 不抛）
node test\perf.mjs              # 浏览器性能回归 + 逐行收纳校验（需要本机 playwright）
```

`test/harness.html` 是一个模拟官方侧栏结构的静态页面，可以直接用浏览器打开看效果。

## 安装（本机 profile）

1. `G:\deepseek_Harness\01-data\dsh-home\profiles\desktop\package.json` 的 `dependencies` 加
   `"dsh-sidebar-fit": "link:../../../../02-plugins/dsh-sidebar-fit"`；
2. 同文件 `dsh.profile.bundles` 数组末尾加 `"dsh-sidebar-fit"`；
3. 建链接。本机 `pnpm install --offline` 会因为 `ERR_PNPM_NO_OFFLINE_META` 和 lockfile 供应链策略拒绝，
   直接手工建 Junction 等价：
   ```powershell
   $t = 'G:\deepseek_Harness\01-data\dsh-home\profiles\desktop\node_modules\dsh-sidebar-fit'
   cmd /c mklink /J "$t" 'G:\deepseek_Harness\02-plugins\dsh-sidebar-fit'
   ```
4. 让宿主重载（不必重启 DSH）。端口以 DSH 当前监听为准（`Get-NetTCPConnection -State Listen |
   Where-Object OwningProcess -eq $pid` 或看启动输出），路径固定：
   ```powershell
   Invoke-WebRequest -Uri 'http://127.0.0.1:<DSH_PORT>/dsh-unlag/reload' -Method POST `
     -Headers @{'x-dsh-unlag'='1'} -UseBasicParsing -TimeoutSec 90
   ```

## 已实测（2560×1600 桌面端，9 个面板行）

| 项目 | 结果 |
| --- | --- |
| 溢出面板进入官方「更多」 | 通过：菜单 = 浏览更多插件 / 创建你的插件 / 分隔线 / 上下文洞察 / Purge / 技能中心 / 设备调试 |
| 拖动分界线 | 通过：面板行随预算自动增减（全显 9 行 ↔ 5 行），工作区标题随拖动移动 |
| 逐行收纳 | 通过：每 40px（= 一行）稳定多收一行，`hidden` 序列 0,0,1,1,2,2,3,3… |
| 持久化 | 通过：`dsh-sidebar-fit:minWorkspace` 历史值 131 → 88 → 263 → 244 → 200 |
| 双击复位 | 通过：值回到 200，面板全恢复 |

## 卸载

从 `bundles` 和 `dependencies` 里删掉两行，再 `pnpm install`。插件卸载时 `ctx.effect`
的清理函数会摘掉分界线、`更多` 行与 `minHeight`，侧栏回到官方行为。

## License

MIT
