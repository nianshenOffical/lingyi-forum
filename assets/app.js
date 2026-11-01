/* ===========================================================
   灵异复苏 · 观测者网络  |  交互脚本（纯前端演示）
   =========================================================== */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const L = window.LORE;
  const LV_NAME = { S: "S", A: "A", B: "B", C: "C", s: "S", a: "A", b: "B", c: "C" };
  const LV_COLOR = { S: "#ff4a5e", A: "#ffcf6b", B: "#6fe3ff", C: "#7dffcd" };

  /* ---------------- 小工具 ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- 时钟 ---------------- */
  const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  function tickClock() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    $("#clock").textContent =
      `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${WD[d.getDay()]} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------------- 顶部滚动警报 ---------------- */
  const alerts = [
    "<b>S 级警报</b>｜诡湖事件后续，大夏市水域全面禁入",
    "<b>幽灵船</b>信号再次出现，东海航线全线停运",
    "<b>凯撒大酒店</b>封锁线内检测到炉火反应，B 级以上禁止靠近",
    "<b>末班地铁</b>第十三节仍在运行，东京夜间区段已封锁",
    "<b>冰下钟声</b> 47 分钟一次，北极科考站已撤离",
    "<b>夜间盲域时段</b> 00:00 — 06:00，非必要不外勤"
  ];
  (function fillTicker() {
    const one = alerts.map(t => `<span>${t}</span><i>//////</i>`).join("");
    $("#ticker").innerHTML = one + one;
  })();

  /* ---------------- 总览 · KPI ---------------- */
  function renderKpis() {
    $("#kpis").innerHTML = L.stats.map((s, i) => {
      const cls = s.red ? " red" : s.amber ? " amber" : "";
      return `<div class="kpi">
        <div class="kpi__top"><div class="kpi__delta ${s.delta.indexOf("-") === 0 ? "dn" : ""}">${s.delta}</div></div>
        <div class="kpi__num${cls}">${s.num}${s.unit ? `<em>${s.unit}</em>` : ""}</div>
        <div class="kpi__lb">${s.label}<i>${s.en}</i></div>
      </div>`;
    }).join("");
  }

  function renderBars() {
    const max = Math.max.apply(null, L.continents.map(c => c.v));
    $("#bars").innerHTML = L.continents.map((c, i) => {
      const h = Math.max(6, (c.v / max) * 150);
      return `<div class="bar" title="${c.name} ${c.txt}">
        <div class="bar__v">${c.txt}</div>
        <div class="bar__col" style="height:${h}px;animation-delay:${i * .06}s"></div>
        <div class="bar__lb">${c.name}</div>
        <div class="bar__sub">${c.sub}</div>
      </div>`;
    }).join("");
  }

  function renderLegend() {
    const total = L.levels.reduce((a, b) => a + b.n, 0) || 1;
    let acc = 0;
    const seg = L.levels.map(l => {
      const a = acc / total * 360;
      acc += l.n;
      const b = acc / total * 360;
      return `${l.color} ${a.toFixed(2)}deg ${b.toFixed(2)}deg`;
    }).join(", ");
    const donut = $(".donut");
    if (donut) { donut.style.background = `conic-gradient(${seg})`; donut.dataset.total = total; }

    $("#legend").innerHTML = L.levels.map(l =>
      `<div><i style="background:${l.color};box-shadow:0 0 8px ${l.color}"></i>${l.name}
       <b>${l.n}</b></div>`).join("") +
      `<div style="border-top:1px solid rgba(125,255,205,.12);padding-top:8px;margin-top:2px">
         <span class="mut">合计 · TOTAL</span><b>${total}</b></div>`;
  }

  function renderTrend() {
    const v = L.trend.values;
    const W = 800, H = 200, padT = 14, padB = 12, padL = 34, padR = 8;
    const max = Math.max.apply(null, v) * 1.08;
    const n = v.length;
    const xs = v.map((_, i) => padL + (i / (n - 1)) * (W - padL - padR));
    const ys = v.map(val => H - padB - (val / max) * (H - padT - padB));

    function smooth(xs, ys) {
      let d = `M${xs[0]} ${ys[0]}`;
      for (let i = 0; i < xs.length - 1; i++) {
        const p0 = [xs[i - 1] || xs[i], ys[i - 1] || ys[i]];
        const p1 = [xs[i], ys[i]];
        const p2 = [xs[i + 1], ys[i + 1]];
        const p3 = [xs[i + 2] || p2[0], ys[i + 2] || p2[1]];
        d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}` +
             ` ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
      }
      return d;
    }

    const line = smooth(xs, ys);
    const area = `${line} L${xs[n - 1]} ${H} L${xs[0]} ${H} Z`;
    const v2 = v.map((val, i) => val * 0.62 + (i % 3) * 6);
    const ys2 = v2.map(val => H - padB - (val / max) * (H - padT - padB));
    const line2 = smooth(xs, ys2);

    const grid = [0, .34, .67, 1].map(t => {
      const y = padT + t * (H - padT - padB);
      const val = Math.round(max * (1 - t) / 10) * 10;
      return `<line x1="${padL}" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(125,255,205,.08)" stroke-width="1"/>
              <text x="${padL - 6}" y="${y + 3.5}" text-anchor="end" fill="#5c8a7b" font-size="10" font-family="monospace">${val}</text>`;
    }).join("");

    const bars = v.map((val, i) => {
      const hh = H - padB - ys[i];
      return `<rect x="${xs[i] - 2}" y="${ys[i]}" width="4" height="${hh}" fill="rgba(125,255,205,.05)"/>`;
    }).join("");

    $("#trend").insertAdjacentHTML("beforeend", `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff6b7f" stop-opacity=".55"/>
            <stop offset="55%" stop-color="#c41230" stop-opacity=".22"/>
            <stop offset="100%" stop-color="#7a0a1c" stop-opacity=".02"/>
          </linearGradient>
          <linearGradient id="gLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ff8a9a"/>
            <stop offset="100%" stop-color="#ff4a5e"/>
          </linearGradient>
        </defs>
        ${grid}
        ${bars}
        <path d="${area}" fill="url(#gArea)"/>
        <path d="${line}" fill="none" stroke="url(#gLine)" stroke-width="1.6" vector-effect="non-scaling-stroke"
              style="filter:drop-shadow(0 0 6px rgba(255,74,94,.7))"/>
        <path d="${line2}" fill="none" stroke="#ffcf6b" stroke-width="1.2" stroke-opacity=".85"
              vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 5px rgba(255,207,107,.6))"/>
        <circle cx="${xs[n - 1]}" cy="${ys[n - 1]}" r="3" fill="#fff"
                style="filter:drop-shadow(0 0 8px #ff4a5e)"/>
      </svg>`);

    $("#trendAxis").innerHTML = L.trend.labels.map(t => `<span>${t}</span>`).join("");
  }

  function renderFeed() {
    $("#feed").innerHTML = L.feed.map((f, i) => `
      <div class="feed__row" style="animation-delay:${i * .06}s">
        <span class="feed__t">${f.t}</span>
        <span class="feed__m"><span class="lv ${f.lv}">${LV_NAME[f.lv]}</span>${f.m}</span>
      </div>`).join("");
  }

  function renderActions() {
    $("#actions").innerHTML = L.actions.map((a, i) => `
      <div class="actrow">
        <span class="actrow__d">${a.d}</span>
        <b>${a.name}</b>
        <span class="mut">${a.who}</span>
        <em class="${a.ok === true ? "ok" : a.ok === false ? "no" : "mid"}">${a.res}</em>
      </div>`).join("");
  }

  function renderObs() {
    const p = L.profile;
    $("#obsCard").innerHTML = `
      <div class="dossier__row"><span>观测编号</span><b>${p.code}</b></div>
      <div class="dossier__row"><span>观测代号</span><b>${p.alias}</b></div>
      <div class="dossier__row"><span>危险等级</span><b style="color:#ffcf6b">${p.grade}</b></div>
      <div class="dossier__row"><span>完成进度</span><b>${p.progress}</b></div>
      <div class="dossier__row"><span>观测状态</span><b style="color:#7dffcd">${p.status}</b></div>
      <div class="dossier__row"><span>人员状态</span><b>${p.person}</b></div>
      <div class="tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>`;
  }

  /* ---------------- 社区广场 ---------------- */
  const TABS = [
    { id: "folk", name: "民间社区", key: "民间社区" },
    { id: "story", name: "个人故事社区", key: "个人故事社区" },
    { id: "dream", name: "梦境社区", key: "梦境社区" },
    { id: "help", name: "求助区", key: "求助区" },
    { id: "solved", name: "已解决区", key: "已解决区" }
  ];
  let curTab = "folk";

  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(t => {
      const n = L.posts[t.id] ? L.posts[t.id].length : 0;
      return `<button class="tab ${t.id === curTab ? "on" : ""}" data-tab="${t.id}">
        ${t.name}<i>${n}</i></button>`;
    }).join("");
    $("#postHere").textContent = (TABS.find(t => t.id === curTab) || TABS[0]).key;
  }

  function renderPosts() {
    const list = L.posts[curTab] || [];
    $("#posts").innerHTML = list.map((p, i) => `
      <article class="post">
        <div class="post__hd">
          <div class="avatar sm">${p.tag}</div>
          <div class="post__who"><b>${p.u}</b><time>${p.t}</time></div>
          ${p.urgent ? `<span class="lv s" style="margin-left:auto">急</span>` : ""}
          ${p.solved ? `<span class="lv c" style="margin-left:auto">已解决</span>` : ""}
        </div>
        <div class="post__title">${p.title}</div>
        <div class="post__body">${p.body}</div>
        <div class="post__ft">
          <span><svg><use href="#i-reply"/></svg>${p.reply} 回复</span>
          <span class="hot"><svg><use href="#i-star"/></svg>${p.like}</span>
          <span><svg><use href="#i-eye"/></svg>点击查看</span>
        </div>
      </article>`).join("") ||
      `<div class="panel" style="padding:26px;text-align:center;color:#4d7568;font-size:12px">该板块暂无帖子</div>`;
  }

  function renderFriends() {
    $("#friends").innerHTML = L.friends.map(f => `
      <div class="friend">
        <div class="avatar sm">${f.tag}</div>
        <div class="friend__meta"><b>${f.n}</b><small>${f.r}</small></div>
        <button class="btn ghost sm" data-add="${f.n}">加好友</button>
      </div>`).join("");
    $("#online").innerHTML = L.online.map(n => `<b>${n}</b>`).join('<span class="mut"> · </span>');
  }

  /* ---------------- 档案抽屉 ---------------- */
  function openDrawer(site) {
    const color = LV_COLOR[site.lv];
    $("#dTitle").textContent = `${site.n} · ${site.st}`;
    $("#dCode").textContent = `${site.c} · LEVEL ${site.lv} · ${site.src === "canon" ? "原著事件" : "原创事件"}`;
    $("#dBody").innerHTML = `
      <div class="kv">
        <div class="kv__it"><small>档案编号 / ID</small><b>${site.c}</b></div>
        <div class="kv__it"><small>危险等级 / LEVEL</small><b style="color:${color}">${site.lv} 级</b></div>
        <div class="kv__it"><small>国家 / COUNTRY</small><b>${site.cty}</b></div>
        <div class="kv__it"><small>发生地点 / SITE</small><b>${site.pl}</b></div>
        <div class="kv__it"><small>经纬度 / COORD</small><b>${Math.abs(site.lat).toFixed(2)}°${site.lat >= 0 ? "N" : "S"} ${Math.abs(site.lng).toFixed(2)}°${site.lng >= 0 ? "E" : "W"}</b></div>
        <div class="kv__it"><small>当前状态 / STATUS</small><b>${site.st}</b></div>
        <div class="kv__it"><small>累计死亡 / CASUALTIES</small><b>${site.dead}</b></div>
        <div class="kv__it"><small>首次上报 / FIRST REPORT</small><b>${site.date}</b></div>
      </div>

      <div class="prose">
        <h4>事件概述</h4>
        <p>${site.d}</p>
        <h4>危险规律</h4>
        <p>${site.r.map(r => "· " + r).join("<br>")}</p>
        <h4>压制方式</h4>
        <p>${site.k}</p>
        <p class="mut" style="font-size:11px;margin-top:14px">
          ${site.src === "canon"
            ? "本条据《神秘复苏》原著事件整理；城市名为原著虚构，坐标为本站推定位置。"
            : "本条为本站原创事件，用于补全全球分布。"}
        </p>
      </div>`;
    $("#drawer").classList.add("open");
  }
  function closeDrawer() { $("#drawer").classList.remove("open"); }

  /* ---------------- 全球态势（地球） ---------------- */
  let globe = null;
  const gFilter = { lv: "all", src: "all", q: "" };

  function filteredSites() {
    return L.sites.filter(s => {
      const okLv = gFilter.lv === "all" || s.lv === gFilter.lv;
      const okSrc = gFilter.src === "all" || s.src === gFilter.src;
      const q = gFilter.q.trim();
      const okQ = !q || s.n.indexOf(q) >= 0 || s.pl.indexOf(q) >= 0 || s.cty.indexOf(q) >= 0;
      return okLv && okSrc && okQ;
    });
  }

  function renderGlobeFilters() {
    const chips = [
      { id: "all", label: "全部" }, { id: "S", label: "S" }, { id: "A", label: "A" },
      { id: "B", label: "B" }, { id: "C", label: "C" }
    ];
    $("#globeFilters").innerHTML = chips.map(c => {
      const n = c.id === "all" ? L.sites.length : L.sites.filter(s => s.lv === c.id).length;
      return `<button class="gchip ${gFilter.lv === c.id ? "on" : ""}" data-glv="${c.id}">
        ${c.label}<i>${n}</i></button>`;
    }).join("") + `
      <span class="gsep"></span>
      <button class="gchip ${gFilter.src === "canon" ? "on" : ""}" data-gsrc="canon">原著</button>
      <button class="gchip ${gFilter.src === "orig" ? "on" : ""}" data-gsrc="orig">原创</button>`;
  }

  function renderGlobeList() {
    const list = filteredSites();
    $("#globeList").innerHTML = list.map((s, i) => `
      <button class="gitem" data-site="${s.c}">
        <span class="gitem__lv" style="color:${LV_COLOR[s.lv]};border-color:${LV_COLOR[s.lv]}55">${s.lv}</span>
        <span class="gitem__meta">
          <b>${s.n}</b>
          <small>${s.cty} · ${s.pl}${s.src === "canon" ? " · 原著" : ""}</small>
        </span>
      </button>`).join("") || `<div class="gempty">没有符合筛选的站点</div>`;
    const cnt = $("#globeCount");
    if (cnt) cnt.textContent = `${list.length} / ${L.sites.length}`;
  }

  function renderGlobeStats() {
    const c = { S: 0, A: 0, B: 0, C: 0 };
    filteredSites().forEach(s => c[s.lv]++);
    $("#globeStats").innerHTML = ["S", "A", "B", "C"].map(lv =>
      `<div class="gstat"><span style="color:${LV_COLOR[lv]}">${lv} 级</span>
        <b>${c[lv]}</b></div>`).join("") +
      `<div class="gstat total"><span>合计</span><b>${c.S + c.A + c.B + c.C}</b></div>`;
  }

  function renderGlobeCont() {
    const map = {};
    filteredSites().forEach(s => { map[s.cont] = (map[s.cont] || 0) + 1; });
    const vals = Object.values(map);
    const max = Math.max.apply(null, vals.concat([1]));
    const order = ["亚洲", "欧洲", "北美洲", "非洲", "南美洲", "大洋洲"];
    $("#globeCont").innerHTML = order.filter(k => map[k]).map(k => `
      <div class="gregion">
        <span>${k}</span>
        <i class="gbar"><em style="width:${(map[k] / max * 100).toFixed(0)}%"></em></i>
        <b>${map[k]}</b>
      </div>`).join("");
  }

  function refreshGlobePanels() {
    const list = filteredSites();
    if (globe) {
      globe.setSites(list);
      if (globe.selected && list.indexOf(globe.selected) < 0) globe.selected = null;
    }
    renderGlobeList();
    renderGlobeStats();
    renderGlobeCont();
  }

  function initGlobe() {
    const canvas = $("#globeCanvas"), overlay = $("#globeOverlay");
    if (!canvas || !window.Globe) return;
    globe = new window.Globe(canvas, overlay, {
      onSelect: site => {
        openDrawer(site);
        renderGlobeList();
        const ro = $("#globeReadout");
        ro.classList.add("flash");
        setTimeout(() => ro.classList.remove("flash"), 700);
      }
    });
    globe.setSites(filteredSites());
    refreshGlobePanels();


    setInterval(() => {
      if (!globe) return;
      const lat = globe.pitch / (Math.PI / 180);
      let lon = -globe.yaw / (Math.PI / 180);
      lon = ((lon + 540) % 360) - 180;
      const ro = $("#globeReadout");
      if (ro) ro.innerHTML =
        `<span>LAT ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}</span>` +
        `<span>LON ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}</span>` +
        `<span>ZOOM ${globe.zoom.toFixed(1)}×</span>`;
    }, 160);
  }

  /* ---------------- 灵异档案（表格） ---------------- */
  let arcFilter = "all";
  let arcQuery = "";

  function renderFilters() {
    const chips = [
      { id: "all", label: "全部" }, { id: "S", label: "S 级" }, { id: "A", label: "A 级" },
      { id: "B", label: "B 级" }, { id: "C", label: "C 级" }
    ];
    $("#filters").innerHTML = chips.map(c =>
      `<button class="chip ${arcFilter === c.id ? "on" : ""}" data-lv="${c.id}">${c.label}</button>`
    ).join("") +
      `<div class="grow"></div>
       <div class="search"><svg><use href="#i-search"/></svg>
         <input id="arcSearch" placeholder="搜索代号 / 国家 / 地点" value="${arcQuery}"></div>`;
  }

  function currentSites() {
    return L.sites.filter(e => {
      const okLv = arcFilter === "all" || e.lv === arcFilter;
      const q = arcQuery.trim();
      const okQ = !q || e.n.indexOf(q) >= 0 || e.pl.indexOf(q) >= 0 || e.cty.indexOf(q) >= 0 || e.c.indexOf(q) >= 0;
      return okLv && okQ;
    });
  }

  function renderArchive() {
    const list = currentSites();
    $("#arcCount").textContent = `共 ${list.length} 条`;
    $("#arcBody").innerHTML = list.map((e, i) => {
      const st = e.st === "活跃" ? "active" : (e.st === "封锁中" || e.st === "已压制") ? "sealed" : "watch";
      return `<tr data-code="${e.c}">
        <td class="code">${e.c}</td>
        <td class="name">${e.n}${e.src === "orig" ? `<span class="src">原创</span>` : ""}</td>
        <td><span class="lv ${e.lv.toLowerCase()}">${e.lv}</span></td>
        <td>${e.cty} · ${e.pl}</td>
        <td><span class="state ${st}"><i></i>${e.st}</span></td>
        <td style="font-family:monospace">${e.dead}</td>
        <td style="font-family:monospace;font-size:10.5px">${e.date}</td>
      </tr>`;
    }).join("") ||
      `<tr><td colspan="7" style="padding:30px;text-align:center;color:#4d7568">没有匹配的档案</td></tr>`;
  }

  /* ---------------- 驭鬼者档案 ---------------- */
  function renderProfile() {
    const p = L.profile;
    const fld = (label, val, full, big) =>
      `<div class="fld ${full ? "full" : ""}"><small>${label}</small><b class="${big ? "big" : ""}">${val}</b></div>`;

    $("#profileMain").innerHTML = `
      <div class="profile__head">
        <h1>驭鬼者档案</h1>
        <p>GHOST CONTROLLER PROFILE · CLASSIFIED</p>
      </div>
      <div class="fields">
        ${fld("档案编号 / ID", p.code)}
        ${fld("观测代号 / CODENAME", p.alias, false, true)}
        ${fld("危险等级 / TIER", p.grade, false, true)}
        ${fld("人员角色 / ROLE", p.role)}
        ${fld("所属区域 / REGION", p.region)}
        ${fld("隶属单位 / DOMAIN", p.domain)}
      </div>

      <div class="sechead"><b>杀人规律与压制方式</b><i>KILLING RULE &amp; SUPPRESSION</i></div>
      <div class="rulelist">
        ${fld("契约鬼 / GHOST", p.ghost, true)}
        ${fld("杀人规律 / RULE", p.rule, true)}
        ${fld("压制方式 / COUNTER", p.counter, true)}
        ${fld("当前进度 / EXPOSION", "43% · 压制进行中", true)}
      </div>`;

    $("#profileSide").innerHTML = `
      <div class="dossier__row"><span>观测编号</span><b>${p.code}</b></div>
      <div class="dossier__row"><span>观测代号</span><b>${p.alias}</b></div>
      <div class="dossier__row"><span>危险等级</span><b style="color:#ffcf6b">${p.grade}</b></div>
      <div class="dossier__row"><span>完成进度</span><b>${p.progress}</b></div>
      <div class="dossier__row"><span>观测状态</span><b style="color:#7dffcd">${p.status}</b></div>
      <div class="dossier__row"><span>人员状态</span><b>${p.person}</b></div>
      <div class="tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
      <div class="dossier__row" style="margin-top:8px"><span>个人签名</span><b>—</b></div>`;
  }

  /* ---------------- 路由 ---------------- */
  const VIEWS = ["globe", "overview", "community", "archive", "profile"];

  function route() {
    const h = (location.hash || "#/globe").replace(/^#\/?/, "");
    const v = VIEWS.indexOf(h) >= 0 ? h : "globe";
    $$(".view").forEach(el => el.classList.toggle("on", el.id === "view-" + v));
    $$("#nav a").forEach(a => a.classList.toggle("on", a.dataset.view === v));
    $$(".rail a").forEach(a => a.classList.toggle("on", a.dataset.rail === v));
    window.scrollTo({ top: 0, behavior: "instant" });

    if (globe) {
      globe.visible = (v === "globe");
      if (globe.visible) globe.resize();
    }
    if (v === "community") { renderTabs(); renderPosts(); }
    if (v === "archive") { renderFilters(); renderArchive(); }
  }
  window.addEventListener("hashchange", route);

  /* ---------------- 事件绑定 ---------------- */
  document.addEventListener("click", ev => {
    const tab = ev.target.closest("[data-tab]");
    if (tab) { curTab = tab.dataset.tab; renderTabs(); renderPosts(); return; }

    const lv = ev.target.closest("[data-lv]");
    if (lv) { arcFilter = lv.dataset.lv; renderFilters(); renderArchive(); return; }

    const glv = ev.target.closest("[data-glv]");
    if (glv) { gFilter.lv = glv.dataset.glv; renderGlobeFilters(); refreshGlobePanels(); return; }

    const gsrc = ev.target.closest("[data-gsrc]");
    if (gsrc) {
      gFilter.src = gFilter.src === gsrc.dataset.gsrc ? "all" : gsrc.dataset.gsrc;
      renderGlobeFilters(); refreshGlobePanels(); return;
    }

    const gs = ev.target.closest("[data-site]");
    if (gs) {
      const site = L.sites.find(x => x.c === gs.dataset.site);
      if (site && globe) { globe.flyTo(site.lng, site.lat, 2.1); globe.select(site); }
      return;
    }

    const z = ev.target.closest("[data-z]");
    if (z && globe) {
      if (z.dataset.z === "in") globe.zoomBy(1.35);
      if (z.dataset.z === "out") globe.zoomBy(1 / 1.35);
      if (z.dataset.z === "reset") globe.reset();
      return;
    }

    const add = ev.target.closest("[data-add]");
    if (add) { toast(`好友申请已发送 → ${add.dataset.add}（演示）`); return; }

    const post = ev.target.closest(".post");
    if (post) { toast("演示环境：帖子详情页未接入"); return; }

    const row = ev.target.closest("tr[data-code]");
    if (row) {
      const e = L.sites.find(x => x.c === row.dataset.code);
      if (e) openDrawer(e);
      return;
    }
  });

  document.addEventListener("input", ev => {
    if (ev.target.id === "arcSearch") {
      arcQuery = ev.target.value;
      renderArchive();
    }
  });

  const pub = $("#publish");
  if (pub) pub.addEventListener("click", () => {
    const t = $("#npTitle").value.trim();
    toast(t ? "演示环境：帖子已暂存，未真正发布" : "请先填写标题");
  });

  $("#dClose").addEventListener("click", closeDrawer);
  $("#drawerMask").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeDrawer(); });

  /* ---------------- 初始化 ---------------- */
  renderKpis();
  renderBars();
  renderLegend();
  renderTrend();
  renderActions();
  renderFeed();
  renderObs();
  renderFriends();
  renderTabs();
  renderPosts();
  renderFilters();
  renderArchive();
  renderProfile();
  renderGlobeFilters();
  initGlobe();
  route();
})();
