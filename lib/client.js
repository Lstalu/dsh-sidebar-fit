window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fit',
  factory() {
    'use strict';

    /** localStorage：只存「工作区保底高度」，不存面板行数——窗口缩放时行数应当重算。 */
    const STORAGE_KEY = 'dsh-sidebar-fit:minWorkspace';
    /** 首次使用的工作区保底高度（px）。200 大约是一条工作区标题 + 两个会话。 */
    const DEFAULT_MIN_WORKSPACE = 200;
    /** 无论工作区多想要空间，面板列表至少保留这么多行（「更多」行另算）。 */
    const MIN_NAV_ROWS = 2;
    /** 分界线自身占的高度。 */
    const HANDLE_H = 8;
    /** 面板行之间的 gap，官方 CSS 是 2px。 */
    const ROW_GAP = 2;
    /** 侧栏宽度低于此值视为折叠成图标栏（rail），整套逻辑让位。 */
    const RAIL_WIDTH = 60;
    /** 工作区保底高度不得低于此值，否则分界线会贴死面板列表、拖不回来。 */
    const MIN_WORKSPACE_FLOOR = 88;
    /** 两次重算之间的最小间隔（ms）。观察器会被流式输出/过渡动画高频触发，必须节流。 */
    const MIN_GAP_MS = 60;

    const ELLIPSIS_SVG =
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">' +
      '<circle cx="3.2" cy="8" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="12.8" cy="8" r="1.35"/></svg>';

    const CSS = `
.sidebar-fit-handle{position:relative;flex:none;height:${HANDLE_H}px;display:flex;align-items:center;justify-content:center;cursor:row-resize;touch-action:none;z-index:4;outline:none}
.sidebar-fit-handle:before{content:"";position:absolute;left:6px;right:6px;top:50%;height:1px;transform:translateY(-50%);border-radius:1px;background:var(--dsw-alias-border-l3,rgba(128,128,128,.32));opacity:.6;transition:opacity .15s var(--ds-ease-in-out),height .15s var(--ds-ease-in-out),background-color .15s var(--ds-ease-in-out)}
.sidebar-fit-handle:hover:before,.sidebar-fit-handle:focus-visible:before,.sidebar-fit-handle[data-dragging="1"]:before{opacity:1;height:2px;background:var(--dsw-alias-state-business-primary,#5b8cff)}
.sidebar-fit-handle[data-overflow="1"]:before{left:6px;right:56px}
.sidebar-fit-badge{position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:10px;line-height:1;min-width:16px;padding:2px 5px;border-radius:999px;border:none;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.22));color:var(--dsw-alias-label-secondary,#9aa0a6);font-family:inherit;cursor:pointer;display:none}
.sidebar-fit-handle[data-overflow="1"] .sidebar-fit-badge{display:block}
.sidebar-fit-badge:hover{background:var(--dsw-alias-button-floating-hover,rgba(128,128,128,.32));color:var(--dsw-alias-label-primary,#eceff1)}
.sidebar-fit-hidden{display:none !important}
nav[data-sidebar-fit="1"]{overflow:hidden}
/* nav 会被我们加上 max-height。它本身是 flex column，子项默认 flex-shrink:1，
   一旦总高超出上限，行会被压扁而不是溢出 —— 行高从 36 掉到二十几，测量值跟着失真，
   收纳判断就跳格。这里钉死不让收缩，超出部分交给 layout() 逐行移进「更多」。 */
nav[data-sidebar-fit="1"]>button{flex:0 0 auto}
.sidebar-fit-menu{position:fixed;z-index:2147483000;min-width:188px;max-width:284px;max-height:60vh;overflow:auto;padding:6px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.3));background:var(--dsw-alias-bg-base,#1d1f23);box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:13px;color:var(--dsw-alias-label-primary,#eceff1)}
.sidebar-fit-menu[hidden]{display:none}
.sidebar-fit-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:5px 8px;border:none;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sidebar-fit-menu button:hover,.sidebar-fit-menu button:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));outline:none}
.sidebar-fit-menu .sidebar-fit-glyph{display:inline-flex;flex:none;align-items:center;justify-content:center}
.sidebar-fit-menu .sidebar-fit-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-fit-menu-divider{height:1px;margin:5px 6px;background:var(--dsw-alias-border-l3,rgba(128,128,128,.28))}
.sidebar-fit-menu-hint{padding:4px 8px 2px;font-size:11px;line-height:1.4;color:var(--dsw-alias-label-secondary,#9aa0a6)}
/* 官方「更多」菜单里被我们追加的溢出面板区 */
[data-sidebar-fit-group] .sidebar-fit-menu-divider{margin:5px 4px}
[data-sidebar-fit-group] button.sidebar-fit-menu-item{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:5px 8px;border:none;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
[data-sidebar-fit-group] button.sidebar-fit-menu-item:hover,[data-sidebar-fit-group] button.sidebar-fit-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));outline:none}
[data-sidebar-fit-group] .sidebar-fit-glyph{display:inline-flex;flex:none;align-items:center;justify-content:center}
[data-sidebar-fit-group] .sidebar-fit-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

    const st = {
      nav: null,
      region: null,
      handle: null,
      badge: null,
      moreRow: null,
      officialMore: null,
      menu: null,
      minWorkspace: null,
      hidden: [],
      raf: 0,
      lastRun: 0,
      dirty: false,
      mo: null,
      ro: null,
      writing: false,
      /** 上一次 layout 量到的几何 + 由此推出的边界，键盘操作直接复用，省一次全量 reflow。 */
      measure: null,
      bounds: null,
      /** total / chrome / navWidth 的缓存；由观察器负责失效，避免每帧重排十个节点。 */
      geo: null,
      /** rowH / officialMoreH / navMarginBottom 的缓存；只在 nav 内部结构变化时失效。 */
      metrics: null,
      /** 上次观察到的 root 盒子尺寸；只有它变了才作废 geo。 */
      geoSize: '',
      /** 自建「更多」行里那个文字 span，缓存住免得每次 layout 都 querySelector。 */
      moreLabel: null,
      moreText: '',
      /** 已经注入官方「更多」菜单里的那几组条目，清理时按列表走，不扫全文档。 */
      injected: [],
    };

    // ── 基础工具 ────────────────────────────────────────────────────────

    function injectCss() {
      const id = 'dsh-sidebar-fit/style';
      if (document.querySelector('style[data-plugin-css="' + id + '"]') !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-sidebar-fit';
      tag.dataset.pluginCss = id;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function readStored() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      } catch (error) {
        return null;
      }
    }

    function writeStored(value) {
      try {
        localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
      } catch (error) {
        /* 隐私模式或配额满：这一次拖动只在本次运行里有效，功能不受影响 */
      }
    }

    function findNav() {
      return document.querySelector('nav[class*="panelList"]');
    }

    /**
     * 官方面板行是 `button.panelRow`。官方的「更多」按钮用的是同一个类（`aria-haspopup="menu"`），
     * 它自己就是一个收纳入口，既不能被我们隐藏，也不占我们的收纳名额，必须排除。
     */
    function isPanelRow(el) {
      if (!(el instanceof HTMLElement)) return false;
      if (!el.matches('button[class*="panelRow"]')) return false;
      if (el.getAttribute('aria-haspopup') === 'menu') return false;
      if (el.dataset.sidebarFitMore === '1') return false;
      return true;
    }

    function panelRows(nav) {
      const rows = [];
      for (const el of nav.children) {
        if (isPanelRow(el)) rows.push(el);
      }
      return rows;
    }

    /**
     * 官方「更多」行：`PanelMoreMenu` 返回的是一个 Menu，真正的按钮被包在 `div.moreAnchor` 里，
     * 不是 nav 的直接子节点，所以只能按 `aria-haspopup="menu"` 搜。它自己就是收纳入口，
     * 既不能被隐藏，也不占我们的收纳名额；还要把它整块的高度从预算里扣掉。
     */
    function officialMoreRow(nav) {
      const button = nav.querySelector('[aria-haspopup="menu"]:not([data-sidebar-fit-more="1"])');
      return button instanceof HTMLElement ? button : null;
    }

    function labelOf(row) {
      const aria = row.getAttribute('aria-label');
      if (aria !== null && aria !== '') return aria;
      const title = row.querySelector('[class*="panelTitle"]');
      if (title !== null) return (title.textContent ?? '').trim();
      return (row.textContent ?? '').trim();
    }

    /**
     * 重算是昂贵的（一次强制同步布局 + 一批 DOM 写），绝不能「有一点风吹草动就跑」。
     *
     * 三道闸：
     * 1. `suspended`：拖动期间，几何由 onMove 自己算，观察器全部闭嘴。
     * 2. `writing`：layout 自己写 DOM 会立刻被观察器看见，写期间一律丢弃，避免自激。
     * 3. `MIN_GAP_MS` 节流：CSS 过渡、字体加载、流式输出会把 DOM 变更拆成成百上千次微任务，
     *    逐次跑 layout 会让主线程长期 100%（用户看到的「DSH 极度卡顿」），合并到 ~15fps 就够。
     */
    function schedule() {
      if (st.suspended) return;
      // 写期间来的请求不能丢：记一笔 dirty，等这次 layout 收尾再补跑一次。
      if (st.writing) {
        st.dirty = true;
        return;
      }
      if (st.raf !== 0) return;
      const now = performance.now();
      const wait = Math.max(0, st.lastRun + MIN_GAP_MS - now);
      if (wait <= 0) {
        st.raf = requestAnimationFrame(runScheduled);
        return;
      }
      st.raf = window.setTimeout(() => {
        st.raf = 0;
        schedule();
      }, wait);
    }

    function runScheduled() {
      st.raf = 0;
      layout();
    }

    // ── 空间预算 ────────────────────────────────────────────────────────

    /** root 的上下内边距：`clientHeight` 含 padding，子元素高度之和却不含，必须补上。 */
    function rootPadding(root) {
      const cs = getComputedStyle(root);
      return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    }

    /** root 里除面板列表、工作区、分界线之外，所有静态占位元素的高度之和。 */
    function chromeHeight(root, nav) {
      let sum = rootPadding(root);
      for (const el of root.children) {
        if (el === nav || el === st.region || el === st.handle) continue;
        if (!(el instanceof HTMLElement)) continue;
        if (el.getAttribute('role') === 'dialog') continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        if (cs.position === 'absolute' || cs.position === 'fixed') continue;
        sum +=
          el.getBoundingClientRect().height +
          (parseFloat(cs.marginTop) || 0) +
          (parseFloat(cs.marginBottom) || 0);
      }
      return sum;
    }

    /**
     * 一次性把所有「要 reflow 才能拿到」的尺寸量出来。
     *
     * 为什么集中测：拖动时每帧都要重算预算，而 `clientHeight` / `getBoundingClientRect()` /
     * `getComputedStyle()` 每一个都是强制同步布局（forced reflow）。侧栏里十来个子节点，
     * 逐帧全量测一遍直接把帧预算吃穿 —— 表现出来就是「越拖越卡、拖不动」。
     *
     * 其中 `total` / `chrome` / `navWidth` 只随「窗口尺寸」和「固定块增删」变化，
     * 缓存在 `st.geo` 里，由 ResizeObserver 与 root 的 childList 变化负责失效。
     * `rowH` 与 `officialMoreH` 随行注册变化，每次照量（各一次 rect，共两次）。
     */
    function measureLayout(root, nav) {
      // 「更多」行与面板行各只扫一次：下面的预算和收纳循环都复用这两个结果，
      // 否则一次 measureLayout 内部就会出现两次同样的 querySelector + children 遍历。
      // 这两个选择器只扫 nav 的十来个直接子节点，不触发 reflow，随便扫。
      const moreRow = officialMoreRow(nav);
      const rows = panelRows(nav);

      // 缓存命中时，整个 measureLayout 一次 reflow 都不付：不读 clientHeight、
      // 不读任何 getBoundingClientRect、不解析 computedStyle。
      // 稳态下（用户不动窗口、不装插件）layout 就是纯算术 + 几次等值比较。
      //
      // 两级缓存，失效范围不同：
      //   - `st.geo`（total / chrome / navWidth）：只随 root 盒子与 root 直接子节点增删变化。
      //   - `st.metrics`（rowH / officialMoreH / navMarginBottom）：只随 nav 内部结构变化，
      //     也就是「插件面板注册/卸载」。窗口缩放时行高其实不变，但一并清掉也无妨。
      let geo = st.geo;
      if (geo === null) {
        geo = {
          total: root.clientHeight,
          chrome: chromeHeight(root, nav),
          navWidth: nav.getBoundingClientRect().width,
        };
        st.geo = geo;
      }

      let metrics = st.metrics;
      if (metrics === null) {
        const first = rows[0];
        const firstH = first === undefined ? 0 : first.getBoundingClientRect().height;
        const wrapper = moreRow === null ? null : moreRow.closest('[class*="moreAnchor"]');
        const moreBox = wrapper instanceof HTMLElement ? wrapper : moreRow;
        metrics = {
          rowH: (firstH > 0 ? firstH : 36) + ROW_GAP,
          officialMoreH:
            moreBox === null ? 0 : moreBox.getBoundingClientRect().height + ROW_GAP,
          navMarginBottom: parseFloat(getComputedStyle(nav).marginBottom) || 0,
        };
        st.metrics = metrics;
      }

      return {
        total: geo.total,
        chrome: geo.chrome,
        navWidth: geo.navWidth,
        rowH: metrics.rowH,
        officialMoreH: metrics.officialMoreH,
        // 「更多」行存不存在必须现读：它决定预算里要不要额外挪一行给自建行。
        hasOfficialMore: moreRow !== null,
        navMarginBottom: metrics.navMarginBottom,
        rows: rows,
      };
    }

    /** 工作区保底高度的允许区间：下限不让分界线贴死，上限保证面板列表至少 MIN_NAV_ROWS 行。 */
    function workspaceBounds(m) {
      const reserve = m.rowH * MIN_NAV_ROWS + HANDLE_H;
      const max = Math.max(0, Math.floor(m.total - m.chrome - reserve));
      const min = Math.min(MIN_WORKSPACE_FLOOR, max);
      return { min: min, max: max };
    }

    /**
     * 算出本次布局可用的工作区保底高度。
     * 注意不回写 `st.minWorkspace`：窗口临时变矮只是这一次的裁剪，不该把用户的设定永久压低。
     */
    function resolveMinWorkspace(m) {
      const bounds = workspaceBounds(m);
      if (st.minWorkspace === null) {
        const stored = readStored();
        st.minWorkspace = stored === null ? DEFAULT_MIN_WORKSPACE : stored;
      }
      return Math.max(bounds.min, Math.min(bounds.max, st.minWorkspace));
    }

    // ── 分界线 ──────────────────────────────────────────────────────────

    function ensureBadge(handle) {
      let badge = handle.querySelector('.sidebar-fit-badge');
      if (badge !== null) {
        st.badge = badge;
        return badge;
      }
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'sidebar-fit-badge';
      badge.title = '面板塞不下，点这里展开';
      badge.textContent = '0';
      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (st.menu === null) openMenu(badge);
        else closeMenu();
      });
      handle.appendChild(badge);
      st.badge = badge;
      return badge;
    }

    function ensureHandle(nav) {
      const root = nav.parentElement;
      let handle = root === null ? null : root.querySelector(':scope > .sidebar-fit-handle');
      if (handle !== null) {
        st.handle = handle;
        ensureBadge(handle);
        return handle;
      }
      handle = document.createElement('div');
      handle.className = 'sidebar-fit-handle';
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'horizontal');
      handle.setAttribute('aria-valuemin', '0');
      handle.setAttribute('aria-label', '工作区与面板列表的分界线：上下拖动调整工作区高度，双击复位');
      handle.title = '上下拖动调整工作区高度 · 双击复位';
      handle.addEventListener('pointerdown', onHandleDown);
      handle.addEventListener('dblclick', onHandleReset);
      handle.addEventListener('keydown', onHandleKey);
      nav.after(handle);
      st.handle = handle;
      ensureBadge(handle);
      return handle;
    }

    function onHandleDown(event) {
      if (event.button !== 0) return;
      if (st.nav === null || st.handle === null) return;
      if (event.target instanceof HTMLElement && event.target.closest('.sidebar-fit-badge') !== null) return;
      const root = st.nav.parentElement;
      const nav = st.nav;
      if (root === null) return;

      const startY = event.clientY;
      const start = st.minWorkspace === null ? DEFAULT_MIN_WORKSPACE : st.minWorkspace;
      let latest = start;
      // 拖动期间临时压住观察器：我们每帧都在改 minHeight / class，
      // ResizeObserver 会立刻回火一次 schedule，和拖动本身叠成两套全量测量。
      st.suspended = true;
      // 拖动全程尺寸不变，量一次就够，别每帧重排十来个节点。
      const m = measureLayout(root, nav);
      const bounds = workspaceBounds(m);

      st.handle.dataset.dragging = '1';
      try {
        st.handle.setPointerCapture(event.pointerId);
      } catch (error) {
        /* 某些指针类型不支持 capture，退化成普通事件流也能用 */
      }
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const onMove = (moveEvent) => {
        const dy = moveEvent.clientY - startY;
        const next = Math.max(bounds.min, Math.min(bounds.max, Math.round(start - dy)));
        moveEvent.preventDefault();
        if (next === latest) return;
        latest = next;
        st.minWorkspace = next;
        layout();
      };

      const finish = (upEvent) => {
        delete st.handle.dataset.dragging;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
          st.handle.releasePointerCapture(upEvent.pointerId);
        } catch (error) {
          /* 指针已离开文档，capture 自然失效 */
        }
        st.handle.removeEventListener('pointermove', onMove);
        st.handle.removeEventListener('pointerup', finish);
        st.handle.removeEventListener('pointercancel', finish);
        st.suspended = false;
        writeStored(latest);
        layout();
      };

      st.handle.addEventListener('pointermove', onMove);
      st.handle.addEventListener('pointerup', finish);
      st.handle.addEventListener('pointercancel', finish);
      event.preventDefault();
    }

    function onHandleReset(event) {
      event.preventDefault();
      st.minWorkspace = DEFAULT_MIN_WORKSPACE;
      writeStored(DEFAULT_MIN_WORKSPACE);
      layout();
    }

    function onHandleKey(event) {
      if (st.nav === null) return;
      const root = st.nav.parentElement;
      if (root === null) return;
      // 复用上一次 layout 的测量结果；只有在从没跑过 layout 时才现场量一次。
      // 键盘操作不改变任何几何，逐次重排十来个节点纯属浪费。
      const m = st.measure ?? measureLayout(root, st.nav);
      const bounds = st.bounds ?? workspaceBounds(m);
      const base = st.minWorkspace === null ? DEFAULT_MIN_WORKSPACE : st.minWorkspace;
      let next = null;
      if (event.key === 'ArrowUp') next = base + 24;
      else if (event.key === 'ArrowDown') next = base - 24;
      else if (event.key === 'PageUp') next = base + 120;
      else if (event.key === 'PageDown') next = base - 120;
      else if (event.key === 'Home' || event.key === 'Escape') next = DEFAULT_MIN_WORKSPACE;
      if (next === null) return;
      event.preventDefault();
      st.minWorkspace = Math.max(bounds.min, Math.min(bounds.max, next));
      writeStored(st.minWorkspace);
      layout();
    }

    // ── 「更多」行与浮层 ────────────────────────────────────────────────

    function copyRowClasses(source, target, filter) {
      if (source === null) return;
      for (const cls of source.classList) {
        if (filter.test(cls)) target.classList.add(cls);
      }
    }

    let cloneSeq = 0;

    /**
     * 克隆图标节点，并把内部所有 id 改名、同步替换所有引用它的 url(#id) / #id。
     *
     * 为什么必须这么做：有些面板图标（例如 dsh-context 的「上下文洞察」）用
     * `<mask id="…">` 挖洞再套在实心 path 上，id 由 useId() 在运行时生成。
     * 直接 cloneNode 会让页面上出现两个同 id 的 mask，而 url(#id) 只解析到第一个，
     * 第二份的 mask 取不到 → 挖洞失效 → 图标渲染成实心色块。
     */
    function cloneIsolated(node) {
      const copy = node.cloneNode(true);
      cloneSeq += 1;
      const suffix = '--sf' + String(cloneSeq);
      const renamed = new Map();

      const nodes = [copy, ...copy.querySelectorAll('*')];
      for (const el of nodes) {
        const oldId = el.getAttribute('id');
        if (oldId !== null && oldId !== '') {
          const newId = oldId + suffix;
          renamed.set(oldId, newId);
          el.setAttribute('id', newId);
        }
      }
      if (renamed.size === 0) return copy;

      const rewrite = (value) =>
        value.replace(/#([A-Za-z0-9_:.\-]+)/g, (whole, name) => {
          const mapped = renamed.get(name);
          return mapped === undefined ? whole : '#' + mapped;
        });

      const refAttrs = ['fill', 'stroke', 'mask', 'clip-path', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'style', 'href', 'xlink:href'];
      for (const el of nodes) {
        for (const attr of refAttrs) {
          const v = el.getAttribute(attr);
          if (v !== null && v.indexOf('#') !== -1) el.setAttribute(attr, rewrite(v));
        }
      }
      return copy;
    }

    function ensureMoreRow(nav, count) {
      // 官方已经有「更多」行时，把溢出项注入它的菜单，不再叠一行自家的「更多」。
      if (officialMoreRow(nav) !== null) {
        removeMoreRow();
        return;
      }
      if (st.moreRow === null || !st.moreRow.isConnected) {
        const rows = panelRows(nav);
        const sample =
          rows.find((el) => el.getAttribute('aria-current') === null) ?? rows[0] ?? null;

        const row = document.createElement('button');
        row.type = 'button';
        row.dataset.sidebarFitMore = '1';
        copyRowClasses(sample, row, /panelRow$/);

        const glyph = document.createElement('span');
        copyRowClasses(sample === null ? null : sample.querySelector('span[class*="panelGlyph"]'), glyph, /panelGlyph$/);
        glyph.classList.add('sidebar-fit-glyph');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.innerHTML = ELLIPSIS_SVG;

        const title = document.createElement('span');
        copyRowClasses(sample === null ? null : sample.querySelector('span[class*="panelTitle"]'), title, /panelTitle$|wide$/);
        title.classList.add('sidebar-fit-title');
        title.dataset.sidebarFitLabel = '1';

        row.append(glyph, title);
        row.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (st.menu === null) openMenu(row);
          else closeMenu();
        });
        nav.appendChild(row);
        st.moreRow = row;
        st.moreLabel = title;
      }
      const text = '更多 ' + String(count) + ' 项';
      // 缓存 label 节点与上次文本：layout 每跑一次都会走到这里，省掉一次 querySelector
      // 和两次必然失败的字符串比较。
      if (text !== st.moreText) {
        st.moreText = text;
        const label = st.moreLabel;
        if (label !== null && label.isConnected) label.textContent = text;
        st.moreRow.setAttribute('aria-label', text);
        st.moreRow.title = '还有 ' + String(count) + ' 个面板，点开选择';
      }
    }

    function removeMoreRow() {
      if (st.moreRow === null) return;
      st.moreRow.remove();
      st.moreRow = null;
      st.moreLabel = null;
      st.moreText = '';
    }

    function onOutside(event) {
      if (st.menu === null) return;
      if (event.target instanceof Node && (st.menu.contains(event.target) || st.badge?.contains(event.target))) return;
      closeMenu();
    }

    function onEsc(event) {
      if (event.key === 'Escape') closeMenu();
    }

    function closeMenu() {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onEsc, true);
      if (st.menu !== null) {
        st.menu.remove();
        st.menu = null;
      }
    }

    function openMenu(anchor) {
      closeMenu();
      const rows = st.hidden.filter((el) => el.isConnected);
      if (rows.length === 0) return;

      const menu = document.createElement('div');
      menu.className = 'sidebar-fit-menu';
      menu.setAttribute('role', 'menu');
      // 官方没有「更多」行时我们自建浮层，排版照样照抄侧栏面板行，
      // 免得自建浮层的字号和侧栏对不上。
      const sample = st.nav === null ? null : panelRows(st.nav)[0] ?? null;
      const boxPairs = readStyleProps(sample, MENU_BOX_PROPS);
      const textPairs = readStyleProps(sample, MENU_TEXT_PROPS);
      for (const row of rows) {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        applyStyleProps(item, boxPairs);
        const glyph = document.createElement('span');
        glyph.className = 'sidebar-fit-glyph';
        const sourceGlyph = row.querySelector('span[class*="panelGlyph"]');
        // 克隆整节点而不是只搬 innerHTML：官方图标靠 svg 自带的 fill="none" 走描边，
        // 若只搬 innerHTML，外层的 class/尺寸上下文会丢，且容易被我们的 CSS 覆盖成实心块。
        if (sourceGlyph !== null) glyph.appendChild(cloneIsolated(sourceGlyph));
        const title = document.createElement('span');
        title.className = 'sidebar-fit-title';
        title.textContent = labelOf(row);
        applyStyleProps(title, textPairs);
        item.append(glyph, title);
        item.addEventListener('click', () => {
          closeMenu();
          row.click();
        });
        menu.appendChild(item);
      }
      document.body.appendChild(menu);

      const rect = anchor.getBoundingClientRect();
      const size = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - size.width - 8, rect.right - size.width));
      let top = rect.bottom + 4;
      if (top + size.height > window.innerHeight - 8) top = Math.max(8, rect.top - size.height - 4);
      menu.style.left = String(Math.round(left)) + 'px';
      menu.style.top = String(Math.round(top)) + 'px';
      st.menu = menu;
      window.setTimeout(() => {
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onEsc, true);
        const first = menu.querySelector('button');
        if (first !== null) first.focus({ preventScroll: true });
      }, 0);
    }

    /** 官方菜单是点击后才挂上来的，补两次注入覆盖首帧与动画后的一帧。 */
    function injectOfficialMenuSoon() {
      window.setTimeout(injectIntoOfficialMenu, 0);
      window.setTimeout(injectIntoOfficialMenu, 80);
    }

    /**
     * 溢出项清空或卸载时，把已经塞进官方菜单的那组条目收回来。
     *
     * 走 `st.injected` 列表而不是 `document.querySelectorAll('[data-sidebar-fit-group]')`：
     * 这个函数在「面板放得下」的稳态下每帧都会被调到一次，而全文档属性选择器
     * 要把整棵树走一遍。正常只有 0~1 组，走列表基本是空循环。
     */
    function removeInjectedGroups() {
      if (st.injected.length === 0) return;
      for (const group of st.injected) {
        if (group.isConnected) group.remove();
      }
      st.injected = [];
    }

    /**
     * 官方「更多」菜单是 React portal，内容来自 slot，我们进不去它的树；
     * 但它每次打开都会新建一个 `*_moreMenu` 容器，所以等它挂上来再追加一组条目。
     */
    /**
     * 注入项要照抄官方菜单行的排版，否则会落回浏览器默认字号（16px）而无明显偏大。
     *
     * 官方菜单项由 @deepseek-ai/dsh-client-ui-primitives 的 MenuItemButton 渲染，
     * 字号来自组件内部样式而非继承，所以 `font:inherit` 抄不到 —— 只能运行时
     * 用 getComputedStyle 读出来再写成 inline style（优先级最高，能压过我们的 CSS）。
     */
    const MENU_BOX_PROPS = [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'line-height',
      'letter-spacing',
      'color',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'gap',
      'min-height',
      'border-radius',
      'text-align',
    ];

    /** 只要文字相关属性；用于标题 span，避免把行内边距套到内层元素上。 */
    const MENU_TEXT_PROPS = [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'line-height',
      'letter-spacing',
      'color',
    ];

    /** 取官方菜单里第一个真正的菜单行（排除我们注入的组）。 */
    function officialMenuItem(menu) {
      for (const el of menu.querySelectorAll('button, a, [role="menuitem"]')) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.closest('[data-sidebar-fit-group]') !== null) continue;
        if (el.textContent.trim() === '') continue;
        if (el.getBoundingClientRect().height === 0) continue;
        return el;
      }
      return null;
    }

    /**
     * 读一次源元素的排版，返回可直接下发的 `[prop, value]` 列表。
     *
     * 菜单里每行都要抄同一套排版，`getComputedStyle` 是强制同步样式解析，
     * 行数 × 属性数（15 + 7）会重复读几十次同一个元素。读一次缓存下来再逐个 setProperty。
     */
    function readStyleProps(source, props) {
      if (source === null) return [];
      const cs = getComputedStyle(source);
      const out = [];
      for (const prop of props) {
        const value = cs.getPropertyValue(prop);
        if (value !== '') out.push([prop, value]);
      }
      return out;
    }

    function applyStyleProps(target, pairs) {
      if (target === null) return;
      for (const [prop, value] of pairs) target.style.setProperty(prop, value);
    }

    function injectIntoOfficialMenu() {
      if (st.hidden.length === 0) return;
      const rows = st.hidden.filter((el) => el.isConnected);
      if (rows.length === 0) return;
      for (const menu of document.querySelectorAll('[class*="moreMenu"]')) {
        if (!(menu instanceof HTMLElement)) continue;
        if (menu.querySelector('[data-sidebar-fit-group]') !== null) continue;
        const rect = menu.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const group = document.createElement('div');
        group.dataset.sidebarFitGroup = '1';
        const divider = document.createElement('div');
        divider.className = 'sidebar-fit-menu-divider';
        group.appendChild(divider);
        // 官方菜单行：拿它当排版模板，把字号/字体/行高/内边距整套抄过来。
        const sample =
          menu.querySelector('[data-sidebar-fit-sample]') ??
          (() => {
            const found = officialMenuItem(menu);
            if (found !== null) found.dataset.sidebarFitSample = '1';
            return found;
          })();
        const boxPairs = readStyleProps(sample, MENU_BOX_PROPS);
        const textPairs = readStyleProps(sample, MENU_TEXT_PROPS);
        for (const row of rows) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'sidebar-fit-menu-item';
          item.setAttribute('role', 'menuitem');
          applyStyleProps(item, boxPairs);
          const glyph = document.createElement('span');
          glyph.className = 'sidebar-fit-glyph';
          const sourceGlyph = row.querySelector('span[class*="panelGlyph"]');
          // 与 openMenu 一致：cloneIsolated 会重写 mask/clip 的 id，避免与侧栏原件撞 id 后挖洞失效。
          if (sourceGlyph !== null) glyph.appendChild(cloneIsolated(sourceGlyph));
          const title = document.createElement('span');
          title.className = 'sidebar-fit-title';
          title.textContent = labelOf(row);
          applyStyleProps(title, textPairs);
          item.append(glyph, title);
          item.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            row.click();
          });
          group.appendChild(item);
        }
        menu.appendChild(group);
        st.injected.push(group);
      }
    }

    // ── 主流程 ──────────────────────────────────────────────────────────

    function attach(nav) {
      st.nav = nav;
      // 换了 nav 就是一个全新的几何环境，缓存必须作废。
      st.geo = null;
      st.metrics = null;
      st.measure = null;
      st.bounds = null;
      nav.dataset.sidebarFit = '1';
      ensureHandle(nav);
      const root = nav.parentElement;
      st.region = root === null ? null : root.querySelector(':scope > div[class*="regionArea"]');

      // 官方「更多」菜单是 React 渲染的，开合时机我们不知道，只能跟着它的点击补一次注入。
      if (st.officialMore !== null && st.officialMore.isConnected) {
        st.officialMore.removeEventListener('click', injectOfficialMenuSoon);
      }
      st.officialMore = officialMoreRow(nav);
      if (st.officialMore !== null) st.officialMore.addEventListener('click', injectOfficialMenuSoon);

      if (st.mo !== null) st.mo.disconnect();
      if (root !== null) {
        // 两处观察要分开：只有 root 的结构变化才可能改变 chrome 高度（也就让 geo 缓存失效），
        // nav 内部的增删只影响行数与行高，total/chrome/navWidth 仍然有效。
        st.mo = new MutationObserver((records) => {
          for (const record of records) {
            if (record.target !== nav) {
              // root 直接子节点变了：固定块高度可能变，geo 与 metrics 一起作废。
              st.geo = null;
              st.metrics = null;
              break;
            }
            // nav 内部变了（面板行注册/卸载、我们自建「更多」行的插入）：
            // 行高与「更多」行高都要重量，但 total/chrome/navWidth 不受影响。
            st.metrics = null;
          }
          schedule();
        });
        // 只盯「会影响预算」的两处直接子节点增删：
        //   - root 的直接子节点（固定块增减才会改变 chrome 高度）
        //   - nav 的直接子节点（面板行注册/卸载）
        // 绝不能开 subtree：工作区列表、会话标题、消息流都在 root 下面，
        // 开 subtree 等于把「侧栏每一次文字变化」都变成一次强制重排，主线程会被打满。
        st.mo.observe(root, { childList: true, subtree: false });
        // nav 内部还要看 subtree：官方面板行注册、自建「更多」行的插入都发生在 nav 里，
        // 但 nav 只装十来个按钮，变更频率极低，开 subtree 的代价可以忽略。
        st.mo.observe(nav, { childList: true, subtree: true });
      }
      if (st.ro !== null) st.ro.disconnect();
      if (root !== null && typeof ResizeObserver !== 'undefined') {
        // 只观察 root：预算公式里 total / chrome / navWidth 全部来自 root 的盒子。
        // 不去观察 region —— region 的高度正是我们写 minHeight 写出来的，
        // 观察它等于让每次 layout 都给自己回一次火。
        st.geoSize = '';
        st.ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target !== root) continue;
            const box = entry.contentRect;
            const size = String(Math.round(box.width)) + 'x' + String(Math.round(box.height));
            if (size === st.geoSize) continue;
            st.geoSize = size;
            st.geo = null;
            // 窗口尺寸变了，行高理论上不变（min-height 固定），但宽度跨过折叠阈值时
            // 官方可能切换紧凑样式，一并重量一次更稳，代价是每次 resize 多两次 rect。
            st.metrics = null;
            st.measure = null;
            st.bounds = null;
          }
          schedule();
        });
        st.ro.observe(root);
      }
      schedule();
    }

    function hideRow(el) {
      if (!el.classList.contains('sidebar-fit-hidden')) el.classList.add('sidebar-fit-hidden');
    }

    function showRow(el) {
      if (el.classList.contains('sidebar-fit-hidden')) el.classList.remove('sidebar-fit-hidden');
    }

    function updateHandleState(count) {
      if (st.handle !== null) {
        const next = count > 0 ? '1' : '0';
        if (st.handle.dataset.overflow !== next) st.handle.dataset.overflow = next;
        const value = String(Math.round(st.minWorkspace ?? DEFAULT_MIN_WORKSPACE));
        if (st.handle.getAttribute('aria-valuenow') !== value) st.handle.setAttribute('aria-valuenow', value);
      }
      if (st.badge !== null) {
        const text = String(count);
        if (st.badge.textContent !== text) st.badge.textContent = text;
      }
    }

    function layout() {
      // 写期间闸门：layout 自己会改 inline style 和 class，MutationObserver/ResizeObserver
      // 立刻回火调 schedule()。没有这道闸门，拖动或窗口变化时会形成
      // 「写 DOM → 观察器 → 再 layout → 再写 DOM」的自激回路，一次交互能跑上百帧重排，
      // CPU 直接拉满（用户看到的就是「DSH 极度卡顿」）。
      st.writing = true;
      st.dirty = false;
      st.lastRun = performance.now();
      try {
        layoutInner();
      } finally {
        st.writing = false;
      }
      if (st.dirty) {
        st.dirty = false;
        schedule();
      }
    }

    function layoutInner() {
      if (st.nav !== null && !st.nav.isConnected) {
        st.nav = null;
        st.handle = null;
        st.badge = null;
        st.moreRow = null;
        st.moreLabel = null;
        st.hidden = [];
        st.geo = null;
        st.metrics = null;
        st.measure = null;
        st.bounds = null;
      }
      // 只在缓存的 nav 失效时才重新查询。`nav[class*="panelList"]` 是属性子串选择器，
      // 每帧扫一遍整棵文档树并不便宜，而侧栏在整个会话里通常只渲染一次。
      const nav = st.nav !== null && st.nav.isConnected ? st.nav : findNav();
      if (nav === null) return;
      if (nav !== st.nav || st.handle === null || !st.handle.isConnected) attach(nav);

      const root = nav.parentElement;
      if (root === null) return;
      if (st.region === null || !st.region.isConnected) {
        st.region = root.querySelector(':scope > div[class*="regionArea"]');
      }

      const m = measureLayout(root, nav);

      // 折叠成图标栏时不介入：那里没有文字标签，也没有被挤压的工作区。
      const rail = m.navWidth < RAIL_WIDTH;
      if (st.handle !== null) {
        // 等值判断：写同一个值浏览器虽然会短路，但仍要走一遍 style 解析。
        // 这段在每次 layout 都会执行，稳态下应当一次写都不发。
        const want = rail ? 'none' : '';
        if (st.handle.style.display !== want) st.handle.style.display = want;
      }
      if (rail) {
        for (const el of st.hidden) if (el.isConnected) showRow(el);
        removeMoreRow();
        removeInjectedGroups();
        closeMenu();
        st.hidden = [];
        updateHandleState(0);
        if (st.region !== null && st.region.style.minHeight !== '') st.region.style.minHeight = '';
        if (nav.style.maxHeight !== '') nav.style.maxHeight = '';
        return;
      }

      const minWorkspace = resolveMinWorkspace(m);
      // 缓存给 onHandleKey 用：键盘调高度不该再付一次全量测量。
      st.measure = m;
      st.bounds = workspaceBounds(m);
      // 面板列表能占多少：整列减掉固定块、分界线、工作区保底。这个预算**包含**官方「更多」行。
      //
      // 必须真的给 nav 一个 max-height，否则「往上拖」不会逐行收纳：
      // nav 是 `flex:none`，不给上限时它永远按内容自然高度撑开，工作区 `flex:1` 再去吃剩下的，
      // 两边都不溢出 → `sum > avail` 很难成立，一旦成立就已经是大幅超支，
      // cut 直接被 floor 卡住 → 一次吞掉好几行。给了上限，预算才和真实几何对齐，
      // 每多拖约一行高度就正好多收一行。
      const navBudget = Math.max(
        0,
        Math.floor(m.total - m.chrome - minWorkspace - m.navMarginBottom - HANDLE_H),
      );
      const avail = Math.max(0, navBudget - m.officialMoreH);
      const navPx = String(navBudget) + 'px';
      if (nav.style.maxHeight !== navPx) nav.style.maxHeight = navPx;

      if (st.region !== null) {
        const px = String(Math.round(minWorkspace)) + 'px';
        if (st.region.style.minHeight !== px) st.region.style.minHeight = px;
      }

      // 只恢复「上一次被我们藏起来的那几行」，而不是每帧 querySelectorAll 全量扫一遍。
      // 全量扫 + 逐个 classList 判断看着便宜，但它在每帧都跑，配合观察器回火就是长任务。
      for (const el of st.hidden) if (el.isConnected) showRow(el);

      const rows = m.rows;
      if (rows.length === 0) {
        removeMoreRow();
        removeInjectedGroups();
        st.hidden = [];
        updateHandleState(0);
        return;
      }

      // 官方面板行高度一致（min-height:36px + 统一 padding），用 m.rowH 乘行数，
      // 比逐行 getBoundingClientRect 少 N 次强制同步布局。行数很少时两者等价。
      const sum = m.rowH * rows.length;

      let cut = -1;
      if (sum > avail) {
        // 官方「更多」行是常驻的（slot 里永远有 action），它的高度已经在算 avail 时
        // 从 m.officialMoreH 扣过一遍了。只有当官方没有「更多」行、我们要自建一行时才需要
        // 再从预算里挪一行给它。否则就是双重扣除：能放下的行数比实际少一行，
        // 表现为第一次收纳时一口气吞掉两行。
        const extraMoreH = m.hasOfficialMore ? 0 : m.rowH;
        const budget = avail - extraMoreH;
        const floor = Math.min(MIN_NAV_ROWS, m.rows.length);
        // 行高一致，能放几行是纯除法，不必逐行累加：
        // 累加版每行都要多跑一次比较，行数多时是几十次无谓迭代，而且「够了就停」的
        // 写法容易和 floor 的裁剪顺序耦合出错。除法版只有一次向下取整。
        cut = m.rowH > 0 ? Math.floor(budget / m.rowH) : 0;
        if (cut < floor) cut = floor;
        if (cut >= rows.length) cut = -1;
      }

      if (cut === -1) {
        removeMoreRow();
        removeInjectedGroups();
        st.hidden = [];
        updateHandleState(0);
        return;
      }

      const hiddenRows = rows.slice(cut);
      for (const el of hiddenRows) hideRow(el);
      st.hidden = hiddenRows;
      ensureMoreRow(nav, hiddenRows.length);
      updateHandleState(hiddenRows.length);
    }

    // ── 生命周期 ────────────────────────────────────────────────────────

    let started = false;

    function teardown() {
      closeMenu();
      if (st.mo !== null) {
        st.mo.disconnect();
        st.mo = null;
      }
      if (st.ro !== null) {
        st.ro.disconnect();
        st.ro = null;
      }
      if (st.handle !== null) {
        st.handle.remove();
        st.handle = null;
      }
      st.badge = null;
      removeMoreRow();
      if (st.nav !== null) {
        for (const el of st.nav.querySelectorAll('.sidebar-fit-hidden')) showRow(el);
        delete st.nav.dataset.sidebarFit;
      }
      if (st.region !== null) st.region.style.minHeight = '';
      st.nav = null;
      st.region = null;
      st.hidden = [];
      started = false;
    }

    function start() {
      if (started) return;
      started = true;
      injectCss();
      window.addEventListener('resize', schedule);
      // 侧栏是懒渲染的：会话列表、工作区都要等首屏数据回来，几次补算覆盖这段时间。
      schedule();
      window.setTimeout(schedule, 120);
      window.setTimeout(schedule, 600);
      window.setTimeout(schedule, 2000);
      document.addEventListener('visibilitychange', schedule);
    }

    return {
      name: 'dsh-sidebar-fit',
      inject: [],
      apply(ctx) {
        start();
        if (typeof ctx?.effect === 'function') {
          ctx.effect(() => {
            start();
            return () => {
              window.removeEventListener('resize', schedule);
              document.removeEventListener('visibilitychange', schedule);
              teardown();
            };
          }, 'dsh-sidebar-fit: sidebar space budgeting');
        }
      },
    };
  },
});
