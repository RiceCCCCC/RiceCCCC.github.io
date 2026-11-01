/* ============================================================
   MLearn · 前端交互逻辑
   路由 / 渲染 / 语法高亮 / 问答匹配 / 主题 / 移动端抽屉 / 进度
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 工具 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORE_KEY = "mlearn-progress";
  const THEME_KEY = "mlearn-theme";

  function loadProgress() {
    try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveProgress(set) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  let progress = loadProgress();

  function catName(id) {
    const c = ML_CATEGORIES.find((x) => x.id === id);
    return c ? c.name : id;
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("is-show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("is-show");
      setTimeout(() => (t.hidden = true), 260);
    }, 1800);
  }

  /* ---------- Python 语法高亮 ---------- */
  const PY_KW = new Set(["def","return","if","elif","else","for","while","in","not","and","or",
    "import","from","as","class","try","except","finally","with","lambda","None","True","False",
    "pass","break","continue","yield","assert","global","nonlocal","raise","is","del","async","await"]);
  const PY_BUILT = new Set(["print","len","range","list","dict","set","tuple","int","float","str",
    "bool","sum","min","max","abs","sorted","enumerate","zip","map","filter","open","type",
    "isinstance","round","np","plt","pd","array","mean","std"]);

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const PY_RE = /(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|([+\-*/%=<>!&|~^]+)/g;

  function highlightPython(code) {
    let out = "", last = 0, m;
    PY_RE.lastIndex = 0;
    while ((m = PY_RE.exec(code))) {
      out += escapeHtml(code.slice(last, m.index));
      const text = m[0];
      let cls = null;
      if (m[1]) cls = "tok-com";
      else if (m[2]) cls = "tok-str";
      else if (m[3]) cls = "tok-num";
      else if (m[4]) {
        if (PY_KW.has(text)) cls = "tok-key";
        else if (PY_BUILT.has(text)) cls = "tok-built";
        else if (code[PY_RE.lastIndex] === "(") cls = "tok-fn";
      } else if (m[5]) cls = "tok-op";
      out += cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);
      last = PY_RE.lastIndex;
    }
    out += escapeHtml(code.slice(last));
    return out;
  }

  function codeBlockHtml(code, lang) {
    return `<div class="codeblock">
      <div class="codeblock__bar">
        <span class="codeblock__lang">${lang}</span>
        <button class="copy-btn" type="button" data-copy>📋 复制</button>
      </div>
      <pre class="py"><code>${highlightPython(code)}</code></pre>
    </div>`;
  }

  /* 复制按钮（事件委托） */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const block = btn.closest(".codeblock");
    const code = block ? block.querySelector("code").textContent : "";
    const done = () => { btn.textContent = "✓ 已复制"; setTimeout(() => (btn.textContent = "📋 复制"), 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
    } else fallbackCopy(code, done);
  });
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ============================================================
     路由
     ============================================================ */
  const VIEW_IDS = ["home", "knowledge", "detail", "practice", "qa", "resources", "about"];
  const TRANSITION_MS = 400;

  let currentView = null;

  function focusChat() {
    const i = $("#chatInput");
    if (i) i.focus();
  }

  // 顶部导航 / 抽屉导航的激活态同步
  function setActiveNav(name) {
    const target = name === "detail" ? "knowledge" : name;
    $$(".topnav__link, .drawer__link").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.view === target);
    });
  }

  function showView(name) {
    setActiveNav(name);
    const nextEl = document.getElementById("view-" + name);
    if (!nextEl) return;

    // 清理仍在进行中的退出动画，避免绝对定位的视图残留
    $$(".view.exiting").forEach((el) => {
      el.hidden = true;
      el.classList.remove("exiting");
    });

    // 同一视图：仅滚动到顶部
    if (currentView === name && nextEl.classList.contains("is-active")) {
      window.scrollTo({ top: 0, behavior: "auto" });
      if (name === "qa") focusChat();
      return;
    }

    const prevEl = currentView ? document.getElementById("view-" + currentView) : null;

    // 1) 旧页面：添加 exiting 类，向上淡出
    if (prevEl && prevEl !== nextEl) {
      prevEl.classList.remove("is-active");
      prevEl.classList.add("exiting");
      const pe = prevEl;
      setTimeout(() => {
        pe.hidden = true;
        pe.classList.remove("exiting");
      }, TRANSITION_MS);
    }

    // 2) 新页面：先置为可见且处于初始（opacity:0）状态，再于下一帧淡入
    nextEl.classList.remove("exiting");
    nextEl.hidden = false;
    void nextEl.offsetWidth; // 强制回流，锁定起始状态
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        nextEl.classList.add("is-active");
      })
    );

    currentView = name;
    window.scrollTo({ top: 0, behavior: "auto" });
    if (name === "qa") setTimeout(focusChat, 60);
  }

  function navigate(hash) {
    if (location.hash === "#" + hash) renderRoute();
    else location.hash = hash;
  }

  function renderRoute() {
    const hash = location.hash.replace(/^#/, "") || "home";
    if (hash.startsWith("concept/")) {
      const id = hash.slice("concept/".length);
      openDetail(id);
      showView("detail");
    } else if (VIEW_IDS.includes(hash)) {
      showView(hash);
      if (hash === "knowledge") ensureKnowledgeRendered();
      if (hash === "practice") renderPractice();
      if (hash === "home") renderHome();
      if (hash === "qa") renderQA();
      if (hash === "resources") renderResources();
    } else {
      showView("home");
      renderHome();
    }
  }

  /* 拦截导航点击 */
  document.addEventListener("click", (e) => {
    // 只匹配真正的链接/按钮；视图容器 <section data-view="..."> 不参与导航，
    // 否则点击视图内任意元素都会误触发一次重新渲染
    const link = e.target.closest("a[data-view], button[data-view]");
    if (!link) return;
    e.preventDefault();
    closeDrawer();
    navigate(link.dataset.view);
  });

  /* ============================================================
     首页
     ============================================================ */
  const LEARNING_PATH = [
    { no: "01", title: "打基础", desc: "理解机器学习是什么、监督/无监督的区别。" },
    { no: "02", title: "学算法", desc: "线性回归、决策树、KNN、SVM、聚类、PCA。" },
    { no: "03", title: "练 Python", desc: "用 NumPy / Pandas / scikit-learn 跑通流程。" },
    { no: "04", title: "做评估", desc: "掌握指标、交叉验证，识别过拟合。" },
    { no: "05", title: "上手问", desc: "遇到不懂，随时用智能问答查漏补缺。" },
  ];
  const FEATURES = [
    { icon: "📚", title: "结构化知识点", desc: "按主题分组的机器学习核心概念，从基础到神经网络循序渐进。" },
    { icon: "🎯", title: "知识点自测", desc: "核心知识点配 2~3 道自测题，选完立即看解析并记住作答记录。" },
    { icon: "🧰", title: "精选学习资源", desc: "书籍、课程、工具、数据集与社区，学完本站内容后知道往哪走。" },
    { icon: "🐍", title: "Python 实践", desc: "每个案例都是可运行的 scikit-learn 代码，配讲解与可视化。" },
    { icon: "💬", title: "智能问答", desc: "基于知识点库的关键词问答，即时给出讲解与跳转入口。" },
    { icon: "📱", title: "响应式体验", desc: "桌面多栏、移动端抽屉，随时随地打开复习。" },
    { icon: "🌗", title: "明暗主题", desc: "跟随习惯切换深色 / 浅色，长时间阅读更舒适。" },
    { icon: "✅", title: "学习进度", desc: "标记已学知识点，进度自动保存在本机浏览器。" },
  ];

  function renderHome() {
    // 路径（按列位置分三层延迟，营造依次升起效果）
    $("#learningPath").innerHTML = LEARNING_PATH.map((s, i) => `
      <div class="path__step fade-up" style="--delay:${(i % 3) * 100}ms">
        <div class="path__no">${s.no}</div>
        <div class="path__title">${s.title}</div>
        <p class="path__desc">${s.desc}</p>
      </div>`).join("");
    // 特性
    $("#featureGrid").innerHTML = FEATURES.map((f, i) => `
      <div class="feature fade-up" style="--delay:${(i % 3) * 100}ms">
        <div class="feature__icon">${f.icon}</div>
        <h3>${f.title}</h3>
        <p>${f.desc}</p>
      </div>`).join("");
    // 统计：页面加载时从 0 滚动计数
    runStatsIntro();
    observeFadeUps($("#view-home"));
  }

  // 缓动函数 easeOutCubic
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // 数字滚动计数（requestAnimationFrame 实现，支持延迟、后缀、小数精度）
  function animateCount(el, target, opts) {
    opts = opts || {};
    if (!el || isNaN(target)) return;
    const duration = opts.duration != null ? opts.duration : 1500;
    const delay = opts.delay || 0;
    const suffix = opts.suffix || "";
    const decimals = opts.decimals != null
      ? opts.decimals
      : (Number.isInteger(target) ? 0 : Math.min(2, (String(target).split(".")[1] || "").length));
    // 取消同一元素上仍在进行中的动画，避免重复渲染冲突
    if (el._countRAF) { cancelAnimationFrame(el._countRAF); el._countRAF = null; }
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fmt = (v) => (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString()) + suffix;
    if (reduce || duration <= 0) { el.textContent = fmt(target); return; }
    const now = window.performance ? performance.now() : Date.now();
    const startAt = now + delay;
    function frame(t) {
      if (t < startAt) { el._countRAF = requestAnimationFrame(frame); return; }
      const p = Math.min((t - startAt) / duration, 1);
      el.textContent = fmt(target * easeOutCubic(p));
      if (p < 1) el._countRAF = requestAnimationFrame(frame);
      else el._countRAF = null;
    }
    el._countRAF = requestAnimationFrame(frame);
  }

  function getProgressPct() {
    return ML_CONCEPTS.length ? Math.round((progress.size / ML_CONCEPTS.length) * 100) : 0;
  }

  // 首页统计数字依次滚动（间隔 200ms）
  function runStatsIntro() {
    animateCount($("#statConcepts"), ML_CONCEPTS.length, { delay: 0 });
    animateCount($("#statPractice"), PYTHON_PRACTICES.length, { delay: 200 });
    animateCount($("#statProgress"), getProgressPct(), { delay: 400, suffix: "%" });
  }

  function updateProgressStat() {
    const el = $("#statProgress");
    if (!el) return;
    if (el._countRAF) { cancelAnimationFrame(el._countRAF); el._countRAF = null; }
    el.textContent = getProgressPct() + "%";
  }

  /* ============================================================
     核心知识点
     ============================================================ */
  let knowledgeRendered = false;
  // 多选分类：空集合 = 全部；命中任一已选分类即显示（OR 逻辑）
  const activeCats = new Set();
  const FILTER_MS = 300;       // 与 CSS .filter-out 过渡时长保持一致
  const FILTER_STAGGER = 50;   // 卡片入场错峰延迟（ms）

  function renderChips() {
    const chips = [["all", "全部"], ...ML_CATEGORIES.map((c) => [c.id, c.name])];
    const noneSelected = activeCats.size === 0;
    $("#knowledgeChips").innerHTML = chips.map(([id, name]) => {
      const on = id === "all" ? noneSelected : activeCats.has(id);
      return `<button class="chip ${on ? "is-active" : ""}" data-cat="${id}" role="tab" aria-pressed="${on}">${name}</button>`;
    }).join("");
    const clear = $("#clearFilter");
    if (clear) clear.hidden = noneSelected;
  }

  function conceptCardHtml(c, i) {
    const done = progress.has(c.id);
    const quizCount = ((typeof QUIZ_DATA !== "undefined" && QUIZ_DATA[c.id]) || []).length;
    return `<button class="kcard fade-up ${done ? "is-done" : ""}" data-concept="${c.id}" data-category="${c.category}" style="--delay:${(i % 3) * 100}ms" aria-label="查看 ${c.title}">
      ${done ? '<span class="kcard__done" title="已学">✓</span>' : ""}
      <div class="kcard__top">
        <span class="kcard__icon">${c.icon}</span>
        <span class="kcard__cat">${catName(c.category)}</span>
      </div>
      <h3 class="kcard__title">${c.title}</h3>
      <p class="kcard__summary">${c.summary}</p>
      ${quizCount ? `<span class="kcard__quiz">🎯 ${quizCount} 题自测</span>` : ""}
    </button>`;
  }

  // 首次渲染即渲染全部卡片；之后不再重建 DOM，只切换 class 做显隐动画
  function renderKnowledgeGrid() {
    const grid = $("#knowledgeGrid");
    if (grid.dataset.rendered !== "1") {
      grid.innerHTML = ML_CONCEPTS.map((c, i) => conceptCardHtml(c, i)).join("");
      grid.dataset.rendered = "1";
      observeFadeUps(grid);
    }
    applyKnowledgeFilter();
  }

  function matchesFilters(c, q) {
    const catOk = activeCats.size === 0 || activeCats.has(c.category);
    const qOk = !q || (c.title + c.summary + catName(c.category)).toLowerCase().includes(q);
    return catOk && qOk;
  }

  function applyKnowledgeFilter() {
    const q = ($("#knowledgeSearch").value || "").trim().toLowerCase();
    const cards = Array.from($("#knowledgeGrid").children);
    let entering = 0;

    cards.forEach((card) => {
      const c = ML_CONCEPTS.find((x) => x.id === card.dataset.concept);
      if (!c) return;

      // 不再重建 DOM，这里同步「已学」状态
      const done = progress.has(c.id);
      card.classList.toggle("is-done", done);
      const badge = card.querySelector(".kcard__done");
      if (done && !badge) card.insertAdjacentHTML("afterbegin", '<span class="kcard__done" title="已学">✓</span>');
      if (!done && badge) badge.remove();

      const match = matchesFilters(c, q);
      const hidden = card.classList.contains("is-filtered");
      const isOut = card.classList.contains("filter-out");

      if (!match) {
        if (hidden || isOut) return; // 已隐藏，或退出动画进行中（定时器已在跑）
        card.classList.remove("filter-in");
        // 记录实际高度，让 max-height 能从真实高度平滑收拢到 0
        const h = card.offsetHeight;
        if (h) card.style.setProperty("--card-h", h + "px");
        card.classList.add("filter-out");
        // 过渡结束后才真正 display:none
        card._filterT = setTimeout(() => {
          card.classList.add("is-filtered");
          card._filterT = null;
        }, FILTER_MS);
        return;
      }

      if (!hidden && !isOut) return; // 已显示且无需动画

      // 恢复显示：先去掉隐藏/退出态，再播放入场动画
      clearTimeout(card._filterT); card._filterT = null;
      clearTimeout(card._inT);
      card.classList.remove("filter-out", "is-filtered", "filter-in");
      card.style.removeProperty("--card-h"); // 清掉缓存高度，避免窗口变化后被裁切
      card.classList.add("is-visible"); // 避免 fade-up 把它留在不可见态
      const delay = entering * FILTER_STAGGER;
      entering++;
      card.style.setProperty("--fdelay", delay + "ms");
      void card.offsetWidth; // 强制回流，保证动画从头播放
      card.classList.add("filter-in");
      card._inT = setTimeout(() => card.classList.remove("filter-in"), FILTER_MS + delay + 60);
    });

    $("#knowledgeEmpty").hidden = ML_CONCEPTS.some((c) => matchesFilters(c, q));
  }

  function ensureKnowledgeRendered() {
    if (!knowledgeRendered) {
      renderChips();
      renderKnowledgeGrid();
      knowledgeRendered = true;
    }
  }

  // 分类切换：多选（OR）；再次点击已选标签取消选择；点「全部」清空
  document.addEventListener("click", (e) => {
    // 学习资源的类型筛选（多选 OR）。注意必须限定在 chips 容器内：
    // 资源卡片本身也带 data-rtype，不限定的话点卡片会被当成筛选
    const rt = e.target.closest("[data-rtype]");
    if (rt && rt.closest("#resourceChips")) {
      const v = rt.dataset.rtype;
      if (v === "all") activeResTypes.clear();
      else if (activeResTypes.has(v)) activeResTypes.delete(v);
      else activeResTypes.add(v);
      renderResourceChips();
      applyResourceFilter();
      return;
    }
    // 实践案例的难度筛选（同样支持多选 OR）
    const lvl = e.target.closest("[data-level]");
    if (lvl && lvl.closest("#practiceChips")) {
      const v = lvl.dataset.level;
      if (v === "all") activeLevels.clear();
      else if (activeLevels.has(v)) activeLevels.delete(v);
      else activeLevels.add(v);
      renderPractice();
      return;
    }
    const chip = e.target.closest("[data-cat]");
    if (chip) {
      const cat = chip.dataset.cat;
      if (cat === "all") activeCats.clear();
      else if (activeCats.has(cat)) activeCats.delete(cat);
      else activeCats.add(cat);
      renderChips();
      applyKnowledgeFilter();
      return;
    }
    const card = e.target.closest("[data-concept]");
    if (card) {
      navigate("concept/" + card.dataset.concept);
    }
  });

  // 清除筛选
  const clearFilterBtn = $("#clearFilter");
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", () => {
      activeCats.clear();
      renderChips();
      applyKnowledgeFilter();
      toast("已清除分类筛选");
    });
  }

  // 清除学习资源筛选
  const clearResBtn = $("#clearResourceFilter");
  if (clearResBtn) {
    clearResBtn.addEventListener("click", () => {
      activeResTypes.clear();
      renderResourceChips();
      applyResourceFilter();
      toast("已清除资源筛选");
    });
  }

  // 搜索
  document.addEventListener("input", (e) => {
    if (e.target.id === "knowledgeSearch") renderKnowledgeGrid();
    if (e.target.id === "practiceSearch") renderPractice();
    if (e.target.id === "resourceSearch") renderResources();
  });

  /* ---------- 知识点详情 ---------- */
  function openDetail(id) {
    const c = ML_CONCEPTS.find((x) => x.id === id);
    const view = $("#view-detail");
    if (!c) {
      view.innerHTML = `<a class="detail__back" href="#knowledge" data-view="knowledge">← 返回知识点</a><p>未找到该知识点。</p>`;
      return;
    }
    const done = progress.has(id);
    view.innerHTML = `
      <a class="detail__back" href="#knowledge" data-view="knowledge">← 返回核心知识点</a>
      <div class="detail">
        <div class="detail__head">
          <span class="detail__icon">${c.icon}</span>
          <div>
            <div class="detail__cat">${catName(c.category)}</div>
            <h1 class="detail__title">${c.title}</h1>
          </div>
        </div>
        <div class="detail__body">
          ${c.body}
          <div class="detail__points">
            ${c.points.map((p) => `<div class="point"><b>${p.t}</b><p style="margin:.3em 0 0;color:var(--text-soft);font-size:.9rem">${p.d}</p></div>`).join("")}
          </div>
          <div class="detail__actions">
            <button class="btn ${done ? "btn--ghost" : "btn--primary"}" id="toggleDone" data-id="${c.id}">
              ${done ? "↺ 标记为未学" : "✓ 标记为已学"}
            </button>
            <a class="btn btn--ghost" href="#qa" data-view="qa">有问题？去问答 →</a>
          </div>
        </div>
        <div id="quizWrap">${quizHtml(c)}</div>
      </div>`;
  }

  /* ============================================================
     知识点自测 Quiz（答题结果持久化到 localStorage）
     ============================================================ */
  const QUIZ_SCORES_KEY = "mlearn_quiz_scores";

  function loadQuizScores() {
    try {
      const raw = localStorage.getItem(QUIZ_SCORES_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) { return {}; }
  }
  function saveQuizScores(all) {
    try { localStorage.setItem(QUIZ_SCORES_KEY, JSON.stringify(all)); } catch (e) {}
  }

  /* 记录一次作答：mlearn_quiz_scores[知识点 id][题目 id] = { chosen, correct, answeredAt, attempts } */
  function recordQuizAnswer(conceptId, qid, chosen, correct) {
    const all = loadQuizScores();
    if (!all[conceptId]) all[conceptId] = {};
    const prev = all[conceptId][qid];
    all[conceptId][qid] = {
      chosen,
      correct,
      answeredAt: new Date().toISOString(),
      attempts: (prev && prev.attempts ? prev.attempts : 0) + 1,
    };
    saveQuizScores(all);
    return all;
  }

  function clearQuizScores(conceptId) {
    const all = loadQuizScores();
    delete all[conceptId];
    saveQuizScores(all);
  }

  function quizItemHtml(q, i, rec) {
    const keys = ["A", "B", "C", "D"];
    return `<li class="quiz__item${rec ? " is-answered" : ""}" data-qid="${q.id}">
      <div class="quiz__q">
        <span class="quiz__no">${i + 1}</span>
        <span class="quiz__type">${escapeHtml(q.type)}</span>
        <span class="quiz__text">${escapeHtml(q.question)}</span>
      </div>
      ${q.code ? codeBlockHtml(q.code, "python") : ""}
      <div class="quiz__options">
        ${q.options.map((opt, idx) => {
          let cls = "quiz__opt";
          if (rec) {
            if (idx === q.correctAnswer) cls += " is-correct";
            else if (idx === rec.chosen) cls += " is-wrong";
            cls += " is-locked";
          }
          return `<button class="${cls}" type="button" data-quiz-opt="${idx}"${rec ? " disabled" : ""}>
            <span class="quiz__optKey">${keys[idx]}</span><span class="quiz__optText">${escapeHtml(opt)}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="quiz__feedback${rec ? " is-open" : ""}"${rec ? "" : " hidden"}>${rec ? quizFeedbackHtml(q, rec) : ""}</div>
    </li>`;
  }

  function quizFeedbackHtml(q, rec) {
    return `<div class="quiz__verdict ${rec.correct ? "is-right" : "is-wrong"}">
        ${rec.correct ? "✅ 回答正确" : "❌ 回答错误"}
        <span class="quiz__time">${formatQuizTime(rec.answeredAt)}</span>
      </div>
      <p class="quiz__exp">${escapeHtml(q.explanation)}</p>
      <p class="quiz__again">正确答案：<b>${"ABCD"[q.correctAnswer]}. ${escapeHtml(q.options[q.correctAnswer])}</b></p>`;
  }

  function formatQuizTime(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function quizSummaryHtml(list, saved) {
    const total = list.length;
    const right = list.filter((q) => saved[q.id] && saved[q.id].correct).length;
    const pct = right / total;
    let emoji = "💪", msg;
    if (right === total) { emoji = "🏆"; msg = "全部答对，这个知识点你已经吃透了，去挑战下一个吧！"; }
    else if (pct >= 0.6) { emoji = "👍"; msg = "整体掌握得不错，把答错的题再看一遍解析就稳了。"; }
    else { emoji = "📖"; msg = "别急，回到上面的知识点讲解再读一遍，然后点「重做」试一次。"; }
    return `<div class="quiz__sumCard">
      <div class="quiz__score">${emoji} 你答对了 <b>${right}/${total}</b> 题</div>
      <p class="quiz__enc">${msg}</p>
      <div class="quiz__dots">
        ${list.map((q, i) => {
          const ok = saved[q.id] && saved[q.id].correct;
          return `<span class="quiz__dot ${ok ? "is-right" : "is-wrong"}" title="第 ${i + 1} 题">${i + 1}</span>`;
        }).join("")}
      </div>
    </div>`;
  }

  function quizHtml(c) {
    const list = (typeof QUIZ_DATA !== "undefined" && QUIZ_DATA[c.id]) || [];
    if (!list.length) return "";
    const saved = loadQuizScores()[c.id] || {};
    const done = list.filter((q) => saved[q.id]).length;
    // 注意：这里不能用 data-concept，否则会被知识点卡片的点击委托捕获，导致每次点选项都重新渲染详情页
    return `<section class="quiz" id="quiz" data-quiz-concept="${c.id}" aria-label="知识自测">
      <div class="quiz__head">
        <div>
          <h2 class="quiz__title">🎯 知识自测</h2>
          <p class="quiz__sub">${list.length} 道题覆盖概念、场景、代码与辨析，选完立即看解析。
            ${done ? `<span class="quiz__saved">答题记录已保存在本机</span>` : ""}</p>
        </div>
        <div class="quiz__meta">
          <span class="quiz__progress" id="quizProgress">已答 ${done}/${list.length}</span>
          <button class="quiz__reset" type="button" data-quiz-reset>↺ 重做</button>
        </div>
      </div>
      <ol class="quiz__list">
        ${list.map((q, i) => quizItemHtml(q, i, saved[q.id])).join("")}
      </ol>
      <div class="quiz__summary${done === list.length ? " is-open" : ""}" id="quizSummary"${done === list.length ? "" : " hidden"}>
        ${done === list.length ? quizSummaryHtml(list, saved) : ""}
      </div>
    </section>`;
  }

  /* 选择某个选项 */
  function handleQuizAnswer(btn) {
    const item = btn.closest(".quiz__item");
    const section = btn.closest(".quiz");
    if (!item || !section || item.classList.contains("is-answered")) return;
    const conceptId = section.dataset.quizConcept;
    const list = QUIZ_DATA[conceptId] || [];
    const q = list.find((x) => x.id === item.dataset.qid);
    if (!q) return;

    const chosen = Number(btn.dataset.quizOpt);
    const correct = chosen === q.correctAnswer;
    const all = recordQuizAnswer(conceptId, q.id, chosen, correct);
    const saved = all[conceptId] || {};

    item.classList.add("is-answered");
    [...item.querySelectorAll(".quiz__opt")].forEach((b, idx) => {
      b.disabled = true;
      b.classList.add("is-locked");
      if (idx === q.correctAnswer) b.classList.add("is-correct");
      else if (idx === chosen) b.classList.add("is-wrong");
    });
    const fb = item.querySelector(".quiz__feedback");
    fb.innerHTML = quizFeedbackHtml(q, saved[q.id]);
    fb.hidden = false;
    requestAnimationFrame(() => fb.classList.add("is-open"));

    const done = list.filter((x) => saved[x.id]).length;
    const pg = section.querySelector(".quiz__progress");
    if (pg) pg.textContent = `已答 ${done}/${list.length}`;
    if (done === list.length) {
      const sum = section.querySelector(".quiz__summary");
      sum.innerHTML = quizSummaryHtml(list, saved);
      sum.hidden = false;
      requestAnimationFrame(() => sum.classList.add("is-open"));
      const sub = section.querySelector(".quiz__saved");
      if (!sub) {
        const p = section.querySelector(".quiz__sub");
        if (p) p.insertAdjacentHTML("beforeend", '<span class="quiz__saved">答题记录已保存在本机</span>');
      }
    }
    toast(correct ? "回答正确 ✓" : "答错了，看看解析～");
  }

  /* 重做：清空该知识点的作答记录并重新渲染 */
  function resetQuiz(section) {
    const conceptId = section.dataset.quizConcept;
    clearQuizScores(conceptId);
    const c = ML_CONCEPTS.find((x) => x.id === conceptId);
    const wrap = $("#quizWrap");
    if (c && wrap) wrap.innerHTML = quizHtml(c);
    toast("已清空该知识点的答题记录");
  }

  document.addEventListener("click", (e) => {
    const opt = e.target.closest(".quiz__opt");
    if (opt) { handleQuizAnswer(opt); return; }
    const reset = e.target.closest("[data-quiz-reset]");
    if (reset) { const s = reset.closest(".quiz"); if (s) resetQuiz(s); }
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("#toggleDone");
    if (!t) return;
    const id = t.dataset.id;
    if (progress.has(id)) progress.delete(id); else progress.add(id);
    saveProgress(progress);
    const c = ML_CONCEPTS.find((x) => x.id === id);
    t.className = "btn " + (progress.has(id) ? "btn--ghost" : "btn--primary");
    t.textContent = progress.has(id) ? "↺ 标记为未学" : "✓ 标记为已学";
    toast(progress.has(id) ? "已标记为已学 ✓" : "已取消标记");
    updateProgressStat();
    // 同步卡片状态
    if (knowledgeRendered) renderKnowledgeGrid();
  });

  /* ============================================================
     Python 实践
     ============================================================ */
  /* 难度筛选：空集合 = 全部（与知识点分类筛选保持一致的交互） */
  const PRACTICE_LEVELS = [["all", "全部"], ["入门", "入门"], ["进阶", "进阶"], ["高级", "高级"]];
  let activeLevels = new Set();

  function renderPracticeChips() {
    const box = $("#practiceChips");
    if (!box) return;
    box.innerHTML = PRACTICE_LEVELS.map(([v, label]) => {
      const on = (v === "all" && activeLevels.size === 0) || activeLevels.has(v);
      return `<button class="chip ${on ? "is-active" : ""}" data-level="${v}" role="tab">${label}</button>`;
    }).join("");
  }

  function practiceHtml(p, i) {
    const steps = Array.isArray(p.steps) && p.steps.length
      ? `<div class="practice__steps">
           <h4>分步讲解</h4>
           <ol>${p.steps.map((s) => `<li><b>${s.t}</b>：${s.d}</li>`).join("")}</ol>
         </div>`
      : "";
    const level = p.difficulty
      ? `<span class="practice__level" data-level="${p.difficulty}">${p.difficulty}</span>`
      : "";
    return `<div class="practice fade-up" style="--delay:${(i % 3) * 100}ms">
      <div class="practice__head">
        <h3 class="practice__title">${p.title}</h3>
        <span class="practice__meta">
          ${level}
          <span class="practice__tag">${p.tag}</span>
        </span>
      </div>
      <p class="practice__desc">${p.desc}</p>
      ${codeBlockHtml(p.code, "python")}
      ${steps}
      <div class="practice__explain">${p.explain}</div>
    </div>`;
  }

  function renderPractice() {
    const q = ($("#practiceSearch").value || "").trim().toLowerCase();
    const list = PYTHON_PRACTICES.filter((p) => {
      const hay = (p.title + p.desc + p.tag + (p.category || "") +
        (p.steps || []).map((s) => s.t + s.d).join("")).toLowerCase();
      const qOk = !q || hay.includes(q);
      const lvlOk = activeLevels.size === 0 || activeLevels.has(p.difficulty);
      return qOk && lvlOk;
    });
    $("#practiceList").innerHTML = list.map((p, i) => practiceHtml(p, i)).join("");
    $("#practiceEmpty").hidden = list.length > 0;
    observeFadeUps($("#practiceList"));
    renderPracticeChips();
  }

  /* ============================================================
     学习资源（#resources）
     ============================================================ */
  /* 类型筛选：空集合 = 全部（多选 OR，与知识点分类保持一致的交互） */
  let activeResTypes = new Set();

  function typeMeta(id) {
    return (typeof RESOURCE_TYPES !== "undefined" ? RESOURCE_TYPES : [])
      .find((t) => t.id === id) || { id, name: id, icon: "🔗" };
  }

  function renderResourceChips() {
    const box = $("#resourceChips");
    if (!box) return;
    const noneSelected = activeResTypes.size === 0;
    const chips = [["all", "全部"], ...RESOURCE_TYPES.map((t) => [t.id, t.icon + " " + t.name])];
    box.innerHTML = chips.map(([id, name]) => {
      const on = id === "all" ? noneSelected : activeResTypes.has(id);
      return `<button class="chip ${on ? "is-active" : ""}" data-rtype="${id}" role="tab" aria-pressed="${on}">${name}</button>`;
    }).join("");
    const clear = $("#clearResourceFilter");
    if (clear) clear.hidden = noneSelected;
  }

  function resourceCardHtml(r, i) {
    const t = typeMeta(r.type);
    const adv = r.level === "进阶";
    return `<article class="rcard fade-up" data-rid="${r.id}" data-rtype="${r.type}" style="--delay:${(i % 3) * 100}ms">
      <div class="rcard__top">
        <span class="rcard__icon" aria-hidden="true">${t.icon}</span>
        <span class="rcard__type">${escapeHtml(t.name)}</span>
        <span class="rcard__level ${adv ? "is-adv" : "is-basic"}">${escapeHtml(r.level)}</span>
      </div>
      <h3 class="rcard__title">${escapeHtml(r.title)}</h3>
      <p class="rcard__author">${escapeHtml(r.author)}</p>
      <p class="rcard__desc">${escapeHtml(r.description)}</p>
      <a class="rcard__go" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">
        前往 <span aria-hidden="true">→</span><span class="rcard__host">${escapeHtml(hostOf(r.url))}</span>
      </a>
    </article>`;
  }

  /* 从 URL 里取主机名，展示在「前往」按钮上，让用户知道会跳到哪里 */
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  function resMatches(r, q) {
    const typeOk = activeResTypes.size === 0 || activeResTypes.has(r.type);
    if (!typeOk) return false;
    if (!q) return true;
    const hay = (r.title + r.author + r.description + r.level + typeMeta(r.type).name).toLowerCase();
    return hay.includes(q);
  }

  // 与知识点卡片一致：只渲染一次，之后靠切换 class 做显隐动画
  function renderResources() {
    const grid = $("#resourceGrid");
    if (!grid) return;
    if (grid.dataset.rendered !== "1") {
      grid.innerHTML = (typeof RESOURCES !== "undefined" ? RESOURCES : [])
        .map((r, i) => resourceCardHtml(r, i)).join("");
      grid.dataset.rendered = "1";
      observeFadeUps(grid);
    }
    renderResourceChips();
    applyResourceFilter();
  }

  function applyResourceFilter() {
    const q = ($("#resourceSearch").value || "").trim().toLowerCase();
    const cards = Array.from($("#resourceGrid").children);
    let entering = 0;
    let shown = 0;

    cards.forEach((card) => {
      const r = RESOURCES.find((x) => x.id === card.dataset.rid);
      if (!r) return;
      const match = resMatches(r, q);
      if (match) shown++;
      const hidden = card.classList.contains("is-filtered");
      const isOut = card.classList.contains("filter-out");

      if (!match) {
        if (hidden || isOut) return;
        card.classList.remove("filter-in");
        const h = card.offsetHeight;
        if (h) card.style.setProperty("--card-h", h + "px");
        card.classList.add("filter-out");
        card._filterT = setTimeout(() => {
          card.classList.add("is-filtered");
          card._filterT = null;
        }, FILTER_MS);
        return;
      }

      if (!hidden && !isOut) return;

      clearTimeout(card._filterT); card._filterT = null;
      clearTimeout(card._inT);
      card.classList.remove("filter-out", "is-filtered", "filter-in");
      card.style.removeProperty("--card-h");
      card.classList.add("is-visible");
      const delay = entering * FILTER_STAGGER;
      entering++;
      card.style.setProperty("--fdelay", delay + "ms");
      void card.offsetWidth;
      card.classList.add("filter-in");
      card._inT = setTimeout(() => card.classList.remove("filter-in"), FILTER_MS + delay + 60);
    });

    $("#resourceEmpty").hidden = shown > 0;
    const count = $("#resourceCount");
    if (count) {
      const total = RESOURCES.length;
      count.textContent = q || activeResTypes.size
        ? `显示 ${shown} / ${total} 个资源`
        : `共 ${total} 个精选资源`;
    }
  }

  /* ============================================================
     智能问答
     ============================================================ */
  const SUGGESTIONS = [
    "什么是机器学习？",
    "过拟合怎么解决？",
    "怎么用 Python 做线性回归？",
    "精确率和召回率哪个更重要？",
    "怎么处理数据中的缺失值？",
    "深度学习和机器学习有什么区别？",
  ];

  /* ---------- 问答历史：最近 3 条，持久化到 localStorage ---------- */
  const HISTORY_KEY = "mlearn_qa_history";
  const HISTORY_MAX = 3;

  function getHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((x) => typeof x === "string" && x.trim()) : [];
    } catch (e) { return []; }
  }

  function pushHistory(q) {
    const text = (q || "").trim();
    if (!text) return;
    // 去重后置顶，只保留最近 3 条
    const list = getHistory().filter((x) => x !== text);
    list.unshift(text);
    const trimmed = list.slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch (e) {}
    renderHistory();
  }

  function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
    renderHistory();
  }

  function renderHistory() {
    const box = $("#qaHistory");
    if (!box) return;
    const list = getHistory();
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML =
      `<div class="qa-history__head">
         <span class="qa-history__title">🕘 最近提问</span>
         <button type="button" class="qa-history__clear" id="qaHistoryClear">清空</button>
       </div>
       <div class="qa-history__list">` +
      list.map((q) => `<button type="button" class="qa-history__item" data-ask="${escapeHtml(q)}" title="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("") +
      `</div>`;
  }

  function renderQA() {
    if ($("#chat").childElementCount === 0) {
      addBot("你好 👋 我是 MLearn 问答助手。问我任何机器学习或 Python 相关的问题，例如“什么是过拟合？”“怎么用 Python 做聚类？”。", null, true);
    }
    renderHistory();
    renderSuggestions();
    renderQASide();
  }

  function renderSuggestions() {
    $("#chatSuggestions").innerHTML = SUGGESTIONS.map(
      (q) => `<button class="sug" data-ask="${escapeHtml(q)}">${escapeHtml(q)}</button>`
    ).join("");
  }

  function renderQASide() {
    // 优先展示标记为热门的问题；没有标记时退回前 7 条
    const hot = QA_PAIRS.filter((q) => q.hot).slice(0, 8);
    const items = hot.length ? hot : QA_PAIRS.slice(0, 7);
    $("#qaSide").innerHTML = `<h3>🔥 热门问题</h3><div class="qa-side__list">` +
      items.map((q) => `<button class="qa-side__item" data-ask="${escapeHtml(q.question)}">${escapeHtml(q.question)}</button>`).join("") +
      `</div>`;
  }

  function normalize(s) {
    return (s || "").toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, " ").trim();
  }

  /* 词的信息量权重：越长的词越具体，短泛词（怎么用/的）权重低 */
  function infoWeight(s) {
    if (!s) return 0;
    if (/^[a-z0-9_.]+$/.test(s)) return s.length >= 6 ? 3 : s.length >= 3 ? 2 : 1;
    return s.length >= 4 ? 2 : s.length >= 2 ? 1 : 0;
  }

  /* 字面相似度特征：中文二元字组 + 整词，用于兜住各种口语化说法 */
  function textFeatures(s) {
    const set = new Set();
    const t = s.replace(/\s+/g, "");
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    s.split(/\s+/).forEach((w) => { if (w) set.add("#" + w); });
    return set;
  }

  function diceCoef(a, b) {
    let inter = 0;
    a.forEach((x) => { if (b.has(x)) inter++; });
    return (2 * inter) / ((a.size + b.size) || 1);
  }

  /* ============================================================
     同义词扩展：alias -> canonical，以及 canonical -> 同义词族
     ============================================================ */
  const SYN_ALIAS2CANON = new Map();
  const SYN_CANON2ALIAS = new Map();
  const KW_WEIGHT = new Map();
  let ALL_ALIASES = [];

  (function buildMatchTables() {
    Object.keys(QA_SYNONYMS || {}).forEach((canon) => {
      const c = normalize(canon);
      const alts = (QA_SYNONYMS[canon] || []).map(normalize).filter(Boolean);
      SYN_CANON2ALIAS.set(c, alts);
      SYN_ALIAS2CANON.set(c, c);
      alts.forEach((a) => SYN_ALIAS2CANON.set(a, c));
    });
    Object.keys(QA_KEYWORD_WEIGHTS || {}).forEach((k) => {
      KW_WEIGHT.set(normalize(k), QA_KEYWORD_WEIGHTS[k]);
    });
    // 用于子串扫描的同义词清单：长的优先，避免先命中短的
    ALL_ALIASES = [...SYN_ALIAS2CANON.keys()]
      .filter((a) => (/^[a-z0-9_.]+$/.test(a) ? a.length >= 3 : a.length >= 2))
      .sort((a, b) => b.length - a.length);
  })();

  function canonOf(term) { return SYN_ALIAS2CANON.get(term) || term; }

  /* 一个词的“同义词族”：自己 + 代表词 + 所有等价说法 */
  function familyOf(term) {
    const c = canonOf(term);
    const set = new Set([term, c]);
    (SYN_CANON2ALIAS.get(c) || []).forEach((a) => set.add(a));
    return set;
  }

  /* 关键词权重：显式权重表 > 同义词族内任一词的权重 > 词长特异性 */
  function keywordWeight(k) {
    const direct = KW_WEIGHT.get(k);
    if (direct) return direct;
    let viaFamily = 0;
    familyOf(k).forEach((x) => {
      const w = KW_WEIGHT.get(x);
      if (w && w > viaFamily) viaFamily = w;
    });
    return viaFamily || infoWeight(k) || 1;
  }

  /* 单个查询词的扩展集合：原词 + 同义词 + 句中包含的同义词整族 */
  function expandToken(t) {
    const set = new Set([t]);
    familyOf(t).forEach((x) => set.add(x));
    if (t.length >= 2) {
      for (const a of ALL_ALIASES) {
        if (a.length >= 2 && t.includes(a)) familyOf(a).forEach((x) => set.add(x));
      }
    }
    return set;
  }

  /* 把用户问题扩展成检索词集合：原词 + 同义词。
     中文整句通常是一个 token（“怎么把样本分组”），
     所以要再扫一遍：句里若包含某个同义词，就把整族加进来。 */
  function expandQueryTokens(tokens) {
    const set = new Set();
    tokens.forEach((t) => expandToken(t).forEach((x) => set.add(x)));
    return set;
  }

  /* 关键词与查询词的关联强度 0~1，并给出该命中归属的“同义词族”：
     1   = 整句直接包含；0.9 = 同义词命中；
     0.75 = 查询词是关键词的一部分（回归 ⊂ 线性回归）→ 归到查询词所在的族；
     0.6  = 关键词是查询词的一部分且占比够大
     归族很关键：否则“机器学习 / 什么是机器学习 / 机器学习是啥”会被算成 3 个不同关键词而重复加分。 */
  function bestKeywordHit(k, q, qTerms) {
    if (q.includes(k)) return { h: 1, fam: canonOf(k) };
    const kf = familyOf(k);
    let best = { h: 0, fam: canonOf(k) };
    qTerms.forEach((t) => {
      if (t.length < 2) return;
      let cur = null;
      if (kf.has(t)) cur = { h: 0.9, fam: canonOf(k) };
      else if (k.includes(t)) cur = { h: 0.75, fam: canonOf(t) };
      else if (t.includes(k) && k.length >= 2 && k.length / t.length >= 0.4) cur = { h: 0.6, fam: canonOf(k) };
      if (cur && cur.h > best.h) best = cur;
    });
    return best;
  }

  /* 是否算“解释到了”这个查询词（用于覆盖率惩罚） */
  function relatedTerm(k, t) {
    if (!k || !t || k.length < 2 || t.length < 2) return false;
    if (k === t || familyOf(k).has(t)) return true;
    return t.includes(k) || k.includes(t);
  }

  const MATCH_MIN_SCORE = 3.5;
  const MULTI_KEYWORD_BONUS = 6;   // 每多命中一个关键词的加分

  function matchQA(query) {
    const q = normalize(query);
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const qb = textFeatures(q);
    const qTerms = expandQueryTokens(tokens);

    const scored = QA_PAIRS.map((pair) => {
      const qNorm = normalize(pair.question);
      const kws = pair.keywords.map(normalize).filter(Boolean);
      const pointsText = Array.isArray(pair.points) ? pair.points.join(" ") : "";
      const hayAll = (pair.question + " " + pair.answer + " " + pointsText + " " + kws.join(" ")).toLowerCase();

      // 1) 逐个关键词计算加权得分；同一个同义词族只取最高分，避免“分类/类别”重复计分
      const hits = new Set();
      const bestByFamily = new Map();
      kws.forEach((k) => {
        const hit = bestKeywordHit(k, q, qTerms);
        if (hit.h <= 0) return;
        const w = keywordWeight(k);
        // 单位分：核心词（w>=2）远高于泛词；英文缩写仍保留一定分量
        const unit = w >= 2 ? 4 * w + 2 : (/^[a-z0-9_.]+$/.test(k) ? 3 : 1.5);
        const s = unit * hit.h;
        hits.add(k);
        const fam = hit.fam || canonOf(k);
        const prev = bestByFamily.get(fam);
        if (!prev || s > prev.s) bestByFamily.set(fam, { s, h: hit.h, w });
      });
      let kwScore = 0;
      let strongFams = 0;
      bestByFamily.forEach((v) => {
        kwScore += v.s;
        // 只有“直接命中/同义词命中”的核心词才算实打实的多关键词；
        // 弱的部分匹配、以及“怎么用/python”这类泛词都不计入
        if (v.h >= 0.75 && v.w >= 2) strongFams++;
      });

      // 命中的关键词同时出现在该问答标题里 → 说明它就是这条问答的主题，额外加分
      // （只对核心词生效，避免“怎么/是什么”这类泛词蹭分）
      hits.forEach((k) => { if (keywordWeight(k) >= 2 && qNorm.includes(k)) kwScore += 4; });

      // 2) 多关键词加权：命中关键词族越多的问答越优先
      let score = kwScore + MULTI_KEYWORD_BONUS * Math.max(0, strongFams - 1);

      // 3) 整句命中 / 答案全文软匹配
      if (qNorm.includes(q)) score += 8;
      if (q.length >= 4 && hayAll.includes(q)) score += 2;

      // 4) 字面相似度（短问法、口语说法主要靠它）
      score += 10 * diceCoef(qb, textFeatures(qNorm));

      // 5) 覆盖率惩罚：问题里的具体词没被这条问答解释到就打折
      //    注意要用“扩展后的词”判断，否则同义词命中（查准率→精确率）会被误判为没解释到
      const covered = new Set();
      tokens.forEach((t) => {
        if (t.length < 2) return;
        if (qNorm.includes(t)) { covered.add(t); return; }
        const terms = expandToken(t);
        const ok = [...terms].some((x) => kws.some((k) => relatedTerm(k, x)));
        if (ok) covered.add(t);
      });
      const tw = tokens.reduce((s, t) => s + infoWeight(t), 0);
      const cw = tokens.reduce((s, t) => s + (covered.has(t) ? infoWeight(t) : 0), 0);
      if (tw > 0) score *= 0.35 + 0.65 * (cw / tw);

      return { pair, score, hits };
    });

    scored.sort((a, b) => b.score - a.score);
    // 分数过低说明只是字面偶然相似，走兜底提示而不是硬凑一个答案
    return scored.filter((x) => x.score >= MATCH_MIN_SCORE);
  }

  function addUser(text) {
    const chat = $("#chat");
    const b = document.createElement("div");
    b.className = "bubble bubble--user";
    b.innerHTML = `<p>${escapeHtml(text)}</p>`;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
  }

  function addBotTyping() {
    const chat = $("#chat");
    const b = document.createElement("div");
    b.className = "bubble bubble--bot";
    b.innerHTML = `<div class="bubble__typing"><span></span><span></span><span></span></div>`;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
    return b;
  }

  /* 统一查找“知识点 / 实践案例”，让回答里的跳转链接两类都可跳 */
  function findKnowledge(id) {
    if (!id) return null;
    const c = ML_CONCEPTS.find((x) => x.id === id);
    if (c) return { id: c.id, title: c.title, view: "concept/" + c.id, icon: "📖" };
    const p = PYTHON_PRACTICES.find((x) => x.id === id);
    if (p) return { id: p.id, title: p.title, view: "practice", icon: "🧪" };
    return null;
  }

  /* 兼容旧的单值 topicId：统一成数组 */
  function relIdsOf(pair) {
    if (Array.isArray(pair.relatedKnowledgeIds) && pair.relatedKnowledgeIds.length) {
      return pair.relatedKnowledgeIds;
    }
    return pair.topicId ? [pair.topicId] : [];
  }

  function knowledgeLinksHtml(ids) {
    const seen = new Set();
    return ids
      .map((id) => {
        if (!id || seen.has(id)) return "";
        seen.add(id);
        const k = findKnowledge(id);
        return k ? `<button class="bubble__link" data-view="${k.view}">${k.icon} ${escapeHtml(k.title)}</button>` : "";
      })
      .join("");
  }

  function addBot(text, topicId, isWelcome) {
    const chat = $("#chat");
    const b = document.createElement("div");
    b.className = "bubble bubble--bot";
    let html = `<p>${escapeHtml(text)}</p>`;
    if (topicId) {
      const c = findKnowledge(topicId);
      if (c) {
        html += `<div class="bubble__links">
          <button class="bubble__link" data-view="${c.view}">${c.icon} 查看知识点：${escapeHtml(c.title)}</button></div>`;
      }
    }
    b.innerHTML = html;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
  }

  /* 结构化回答：定义 → 关键要点 → 代码示例 → 相关知识点跳转 */
  function addBotAnswer(pair) {
    const chat = $("#chat");
    const b = document.createElement("div");
    b.className = "bubble bubble--bot";
    let html = `<p>${escapeHtml(pair.answer)}</p>`;
    if (Array.isArray(pair.points) && pair.points.length) {
      html += `<ul class="bubble__points">${pair.points
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join("")}</ul>`;
    }
    if (pair.code) {
      b.classList.add("bubble--wide");
      html += codeBlockHtml(pair.code, "python");
    }
    const links = knowledgeLinksHtml(relIdsOf(pair));
    if (links) {
      html += `<p class="bubble__hint">📚 相关知识点</p><div class="bubble__links">${links}</div>`;
    }
    b.innerHTML = html;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
  }

  /* 兜底时按标题/摘要模糊搜知识点，给用户一个“虽然没收录但你可以先看这个”的去处 */
  function searchKnowledge(query, limit) {
    const q = normalize(query);
    const terms = expandQueryTokens(q.split(/\s+/).filter(Boolean));
    const scored = ML_CONCEPTS.map((c) => {
      const hay = normalize((c.title || "") + " " + (c.summary || "") + " " + (c.category || ""));
      let s = 0;
      terms.forEach((t) => {
        if (t.length < 2) return;
        if (hay.includes(t)) s += infoWeight(t);
      });
      return { c, s };
    }).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s);
    const picked = scored.slice(0, limit).map((x) => x.c.id);
    // 一个都没搜到时退化为入门知识点
    if (picked.length) return picked;
    return ["what-is-ml", "ml-workflow", "supervised"].slice(0, limit);
  }

  /* 未收录时的友好兜底：说明 + 热门问题 + 相关知识点 */
  function addBotNoMatch(query) {
    const chat = $("#chat");
    const b = document.createElement("div");
    b.className = "bubble bubble--bot";
    const hint = `🤔 暂未收录这个问题：「${escapeHtml(query)}」`;
    let html = `<p>${hint}</p>
      <ul class="bubble__points">
        <li>可以换个说法再试一次，比如把“怎么做”改成具体算法名（如“怎么用 Python 做 K-Means 聚类”）</li>
        <li>也可以到「知识点」页按分类浏览，或在「Python 实践」页搜索关键词</li>
        <li>下面是大家问得最多的问题，以及与该问题最接近的知识点 👇</li>
      </ul>`;

    const hot = QA_PAIRS.filter((q) => q.hot).slice(0, 5);
    const hotList = (hot.length ? hot : QA_PAIRS.slice(0, 5))
      .map((q) => `<button class="bubble__link bubble__link--ask" data-ask="${escapeHtml(q.question)}">💬 ${escapeHtml(q.question)}</button>`)
      .join("");
    if (hotList) {
      html += `<p class="bubble__hint">🔥 热门问题</p><div class="bubble__links">${hotList}</div>`;
    }

    const relIds = searchKnowledge(query, 3);
    const links = knowledgeLinksHtml(relIds);
    if (links) {
      html += `<p class="bubble__hint">📚 最接近的知识点</p><div class="bubble__links">${links}</div>`;
    }

    b.innerHTML = html;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
  }

  function answer(query) {
    addUser(query);
    pushHistory(query);
    const typing = addBotTyping();
    const results = matchQA(query);
    setTimeout(() => {
      typing.remove();
      if (results.length === 0) {
        addBotNoMatch(query);
        return;
      }
      const top = results[0];
      addBotAnswer(top.pair);
      // 相关知识点推荐：最多 3 个，且与上面已展示的不重复
      const used = new Set(relIdsOf(top.pair));
      const extraIds = [];
      for (const r of results.slice(1, 8)) {
        for (const id of relIdsOf(r.pair)) {
          if (id && !used.has(id)) {
            used.add(id);
            extraIds.push(id);
          }
        }
        if (extraIds.length >= 3) break;
      }
      // 相关问答不足 3 个时，用语义最接近的知识点补齐
      if (extraIds.length < 3) {
        searchKnowledge(query, 3).forEach((id) => {
          if (extraIds.length < 3 && id && !used.has(id)) {
            used.add(id);
            extraIds.push(id);
          }
        });
      }
      if (extraIds.length) {
        const links = knowledgeLinksHtml(extraIds.slice(0, 3));
        if (links) {
          const b = document.createElement("div");
          b.className = "bubble bubble--bot";
          b.innerHTML = `<p class="bubble__hint">你可能还想知道</p><div class="bubble__links">${links}</div>`;
          $("#chat").appendChild(b);
          $("#chat").scrollTop = $("#chat").scrollHeight;
        }
      }
    }, 480);
  }

  // 提交问题
  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chatInput");
    const v = input.value.trim();
    if (!v) return;
    input.value = "";
    answer(v);
  });

  // 建议 / 侧栏 / 历史 / 兜底推荐点击
  document.addEventListener("click", (e) => {
    if (e.target.closest("#qaHistoryClear")) {
      clearHistory();
      return;
    }
    const ask = e.target.closest("[data-ask]");
    if (ask) {
      const q = ask.getAttribute("data-ask");
      if (location.hash.replace(/^#/, "") !== "qa") navigate("qa");
      setTimeout(() => answer(q), 80);
    }
  });

  /* ============================================================
     主题切换
     ============================================================ */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = $(".theme-icon");
    if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!saved) saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved);
  })();
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  /* ============================================================
     移动端抽屉
     ============================================================ */
  const drawer = $("#drawer");
  const overlay = $("#drawerOverlay");
  function openDrawer() {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    $("#menuToggle").setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    $("#menuToggle").setAttribute("aria-expanded", "false");
  }
  $("#menuToggle").addEventListener("click", openDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  /* ============================================================
     滚动入场动画（fade-up · IntersectionObserver）
     ============================================================ */
  let fadeObserver = null;
  function initFadeObserver() {
    if (fadeObserver) return fadeObserver;
    if (!("IntersectionObserver" in window)) return null; // 不支持则降级为直接显示
    fadeObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target); // 动画完成后移除监听，优化性能
        }
      });
    }, { threshold: [0, 0.15], rootMargin: "0px 0px -8% 0px" });
    return fadeObserver;
  }
  function observeFadeUps(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    const els = root.querySelectorAll(".fade-up:not(.is-visible)");
    const obs = initFadeObserver();
    if (!obs) { // 降级：无 IntersectionObserver 时直接显示全部
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    els.forEach((el) => obs.observe(el));
  }

  /* ============================================================
     磁吸反馈 + 点击波纹
     ============================================================ */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* --- 磁吸：鼠标在 .btn 上移动时产生 ≤3px 的微位移 --- */
  const MAG_MAX = 3; // 最大位移（px），光标在按钮中心为 0，边缘为 ±3
  let lastMagBtn = null;
  function applyMag(btn, e) {
    const r = btn.getBoundingClientRect();
    // 光标相对中心的归一化偏移（-1 ~ 1）映射为 0 ~ ±MAG_MAX
    const nx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    const ny = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const dx = clamp(nx * MAG_MAX, -MAG_MAX, MAG_MAX);
    const dy = clamp(ny * MAG_MAX, -MAG_MAX, MAG_MAX);
    btn.style.setProperty("--mx", dx.toFixed(2) + "px");
    btn.style.setProperty("--my", dy.toFixed(2) + "px");
  }
  function resetMag(btn) {
    btn.style.setProperty("--mx", "0px");
    btn.style.setProperty("--my", "0px");
  }
  function initMagnetic() {
    if (reduceMotion || !finePointer) return; // 触摸设备 / 减少动效时不启用
    // 用事件委托，动态渲染的按钮同样生效
    document.addEventListener("mousemove", (e) => {
      const btn = e.target.closest ? e.target.closest(".btn") : null;
      if (btn === lastMagBtn) {
        if (btn) applyMag(btn, e);
      } else {
        if (lastMagBtn) resetMag(lastMagBtn);
        lastMagBtn = btn;
        if (btn) applyMag(btn, e);
      }
    });
    document.addEventListener("mouseleave", () => {
      if (lastMagBtn) { resetMag(lastMagBtn); lastMagBtn = null; }
    });
  }

  /* --- 波纹：点击处生成圆形扩散，600ms 后移除 --- */
  const RIPPLE_SEL = ".btn, .kcard, .topnav__link, .drawer__link, .chip, .icon-btn";
  function createRipple(e, el) {
    if (reduceMotion) return;
    const r = el.getBoundingClientRect();
    const isKey = e.detail === 0; // 键盘激活（Enter/Space）无坐标，从中心扩散
    const cx = isKey ? r.left + r.width / 2 : e.clientX;
    const cy = isKey ? r.top + r.height / 2 : e.clientY;
    // 半径取「点击点到最远角」的距离，确保圆形能完整覆盖整个按钮
    const rx = Math.max(cx - r.left, r.right - cx);
    const ry = Math.max(cy - r.top, r.bottom - cy);
    const radius = Math.sqrt(rx * rx + ry * ry);
    const size = radius * 2;
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = size + "px";
    span.style.left = cx - r.left - radius + "px";
    span.style.top = cy - r.top - radius + "px";
    el.appendChild(span);
    const kill = () => { if (span.parentNode) span.remove(); };
    span.addEventListener("animationend", kill);
    setTimeout(kill, 700); // 兜底清理（动画被截断时）
  }
  function initRipple() {
    if (reduceMotion) return;
    document.addEventListener("click", (e) => {
      const el = e.target.closest ? e.target.closest(RIPPLE_SEL) : null;
      if (el) createRipple(e, el);
    }); // 仅追加视觉元素，不 preventDefault，不影响跳转/表单提交
  }

  function initInteractions() { initMagnetic(); initRipple(); }

  /* ============================================================
     启动
     ============================================================ */
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
  observeFadeUps(); // 启动后统一观察一次（覆盖首屏/深链内容）
  initInteractions();
})();
