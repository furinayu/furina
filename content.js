(function () {
  function isPublicDeployWithoutEditor() {
    return document.documentElement.classList.contains("furina-no-editor");
  }

  const STORAGE_KEY = "furina-site-content-v1";
  /** 上线后放在网站根目录（与 index.html 同级），的内容备份；本地「Export JSON」可得到同名文件。 */
  const SHIPPED_CONTENT_URL = "furina-site-content.json";
  const BUNDLED_GALLERY_APPLIED_KEY = "furina-site-bundled-gallery-v1";
  const BUNDLED_APPS_APPLIED_KEY = "furina-site-bundled-apps-v1";
  const APPS_PATCH_V4_KEY = "furina-site-apps-patch-v4";
  const MAX_IMAGES = 16;

  /** Site-shipped gallery (relative to site root); tiny in localStorage vs data URLs. */
  const BUNDLED_GALLERY = [
    { url: "assets/gallery/01.png", caption: "女侠 · 三视设定" },
    { url: "assets/gallery/02.png", caption: "白衣 · 异瞳" },
    { url: "assets/gallery/03.png", caption: "黑白金 · 侠士" },
    { url: "assets/gallery/04.png", caption: "唐风 · 红色汉服" },
    { url: "assets/gallery/05.png", caption: "粉色 · 汉服" },
    { url: "assets/gallery/06.png", caption: "樱花 · 汉服" },
    { url: "assets/gallery/07.png", caption: "僧袍 · 设定" },
    { url: "assets/gallery/08.png", caption: "红衣 · 设定" },
    { url: "assets/gallery/09.png", caption: "浅蓝 · 仙侠" },
  ];

  const BUNDLED_APPS = [
    {
      icon: "assets/app-icons/01-arcade.png",
      title: "复古街机",
      description: "",
      url: "https://zh.wikipedia.org/wiki/街机",
    },
    {
      icon: "assets/app-icons/02-oc.png",
      title: "OC 角色",
      description: "",
      url: "https://www.pixiv.net/",
    },
    {
      icon: "assets/app-icons/03-python.png",
      title: "Python",
      description: "",
      url: "https://www.python.org/",
    },
    {
      icon: "assets/app-icons/04-agent.png",
      title: "Agent",
      description: "",
      url: "https://chatgpt.com/",
    },
  ];

  function defaultContent() {
    return {
      version: 1,
      aboutTitle: "Hello",
      aboutBody:
        "This window is for your introduction, role, and what you care about.\n\nExport JSON from a local build to change copy for the live site.",
      articlesLead: "Long-form writing and notes.",
      articles: [
        { title: "Sample article title", description: "Short description placeholder.", url: "" },
        { title: "Another piece", description: "Placeholder entry.", url: "" },
      ],
      videosPdfUrl: "",
      videosPdfLabel: "作品集.pdf",
      videos: [{ title: "Intro video", url: "", description: "", thumbnail: "" }],
      images: BUNDLED_GALLERY.map((item) => ({ url: item.url, caption: item.caption })),
      apps: BUNDLED_APPS.map((item) => ({ ...item })),
    };
  }

  function mergeContent(raw) {
    const base = defaultContent();
    if (!raw || typeof raw !== "object") {
      return base;
    }
    const out = { ...base, ...raw };
    for (const key of Object.keys(base)) {
      if (Array.isArray(base[key])) {
        out[key] = Array.isArray(raw[key]) ? raw[key] : base[key];
      }
    }
    return out;
  }

  function loadSiteContent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultContent();
      }
      return mergeContent(JSON.parse(raw));
    } catch {
      return defaultContent();
    }
  }

  async function loadShippedSiteContent() {
    try {
      const res = await fetch(SHIPPED_CONTENT_URL, { cache: "no-cache" });
      if (!res.ok) {
        return null;
      }
      const json = await res.json();
      return mergeContent(json);
    } catch {
      return null;
    }
  }

  /** 本地编辑仍以 localStorage 为准；上线（无编辑器）优先用根目录 JSON，避免访客浏览器里没有你的稿。 */
  async function loadContentForInit() {
    if (isPublicDeployWithoutEditor()) {
      const shipped = await loadShippedSiteContent();
      if (shipped) {
        return shipped;
      }
    }
    return loadSiteContent();
  }

  function saveSiteContent(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(file);
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  /** Prefer `url` (external link) over embedded `dataUrl`. */
  function imageItemSrc(img) {
    if (!img || typeof img !== "object") {
      return "";
    }
    const url = String(img.url || "").trim();
    if (url) {
      return url;
    }
    return String(img.dataUrl || "").trim();
  }

  function isImageUrlOnly(img) {
    return !!(img && String(img.url || "").trim() && !String(img.dataUrl || "").trim());
  }

  /** Append bundled gallery URLs missing from `data.images`. Does not persist or set the applied flag. */
  /** Replace placeholder apps with shipped icons once (or skip if user already customized). */
  function applyBundledAppsUpgrade(data) {
    let done = false;
    try {
      done = !!localStorage.getItem(BUNDLED_APPS_APPLIED_KEY);
    } catch {
      return false;
    }
    if (done) {
      return false;
    }
    const apps = data.apps || [];
    const oldTitles = ["Project one", "Project two", "Project three"];
    const isOldPlaceholder =
      apps.length === 0 ||
      (apps.length === 3 &&
        oldTitles.every(
          (title, i) =>
            String(apps[i]?.title || "").trim() === title && !String(apps[i]?.icon || "").trim()
        ));
    if (!isOldPlaceholder) {
      try {
        localStorage.setItem(BUNDLED_APPS_APPLIED_KEY, "1");
      } catch {
        /* ignore */
      }
      return false;
    }
    data.apps = BUNDLED_APPS.map((item) => ({ ...item }));
    return true;
  }

  /**
   * One-shot: fill icons/links by title match, or if there are exactly as many apps as bundled
   * and every icon is empty, assign icons (and empty links) by slot order.
   * @returns {"skip" | "save" | "flag"}
   */
  function applyBundledAppsPatchV4(data) {
    try {
      if (localStorage.getItem(APPS_PATCH_V4_KEY)) {
        return "skip";
      }
    } catch {
      return "skip";
    }
    if (!Array.isArray(data.apps)) {
      data.apps = [];
    }
    const byTitle = new Map(BUNDLED_APPS.map((x) => [String(x.title).trim(), x]));
    let changed = false;
    for (const row of data.apps) {
      const def = byTitle.get(String(row.title || "").trim());
      if (!def) {
        continue;
      }
      if (!String(row.icon || "").trim()) {
        row.icon = def.icon;
        changed = true;
      }
      if (!String(row.url || "").trim()) {
        row.url = def.url;
        changed = true;
      }
    }
    const n = data.apps.length;
    const m = BUNDLED_APPS.length;
    if (!changed && n === m && n > 0 && data.apps.every((a) => !String(a.icon || "").trim())) {
      for (let i = 0; i < n; i++) {
        data.apps[i].icon = BUNDLED_APPS[i].icon;
        if (!String(data.apps[i].url || "").trim()) {
          data.apps[i].url = BUNDLED_APPS[i].url;
        }
      }
      changed = true;
    }
    return changed ? "save" : "flag";
  }

  function appendBundledGalleryMissing(data) {
    if (!Array.isArray(data.images)) {
      data.images = [];
    }
    const seen = new Set(
      data.images
        .map((img) => imageItemSrc(img))
        .filter(Boolean)
    );
    let changed = false;
    for (const item of BUNDLED_GALLERY) {
      if (data.images.length >= MAX_IMAGES) {
        break;
      }
      if (seen.has(item.url)) {
        continue;
      }
      data.images.push({ url: item.url, caption: item.caption });
      seen.add(item.url);
      changed = true;
    }
    return changed;
  }

  function videoEmbedFromUrl(url) {
    const u = String(url || "").trim();
    if (!u) {
      return null;
    }
    const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    if (yt) {
      return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
    }
    const bv = u.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i);
    if (bv) {
      return `https://player.bilibili.com/player.html?bvid=${bv[1]}&high_quality=1&danmaku=0`;
    }
    return null;
  }

  function notify(msg) {
    if (typeof window.notifyUser === "function") {
      window.notifyUser(msg);
    }
  }

  function renderAbout(slot, data) {
    const paras = String(data.aboutBody || "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
    slot.innerHTML = `<h2>${escapeHtml(data.aboutTitle)}</h2>${paras || "<p></p>"}`;
  }

  function renderArticles(slot, data) {
    const items = (data.articles || []).filter((a) => a.title || a.description || a.url);
    let html = `<p class="window-lead">${escapeHtml(data.articlesLead)}</p>`;
    if (!items.length) {
      html += isPublicDeployWithoutEditor()
        ? '<p class="content-empty">No articles yet.</p>'
        : '<p class="content-empty">No articles yet. Add them in Edit.</p>';
      slot.innerHTML = html;
      return;
    }
    html += '<ul class="article-list">';
    for (const a of items) {
      const title = escapeHtml(a.title || "Untitled");
      const desc = a.description ? ` — ${escapeHtml(a.description)}` : "";
      if (a.url) {
        html += `<li><a href="${escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer"><span class="article-list__title">${title}</span></a>${desc}</li>`;
      } else {
        html += `<li><span class="article-list__title">${title}</span>${desc}</li>`;
      }
    }
    html += "</ul>";
    slot.innerHTML = html;
  }

  function openVideoPlayer(video) {
    const frame = document.getElementById("video-player-frame");
    const info = document.getElementById("video-player-info");
    const win = document.getElementById("window-video-player");
    if (!frame || !info || !win) return;

    const embed = videoEmbedFromUrl(video.url);
    const title = escapeHtml(video.title || "Video");

    if (embed) {
      frame.innerHTML = `<iframe src="${escapeAttr(embed)}" title="${escapeAttr(title)}" allowfullscreen></iframe>`;
    } else if (video.url) {
      frame.innerHTML = `<p style="padding:24px;text-align:center"><a href="${escapeAttr(video.url)}" target="_blank" rel="noopener noreferrer">Open in browser</a></p>`;
    } else {
      frame.innerHTML = "";
    }

    let infoHtml = `<h3 class="video-player__title">${title}</h3>`;
    if (video.description) {
      infoHtml += `<p class="video-player__desc">${escapeHtml(video.description)}</p>`;
    }
    info.innerHTML = infoHtml;

    const titleEl = win.querySelector("[data-title-target]");
    if (titleEl) titleEl.textContent = video.title || "Video Player";

    win.classList.remove("hidden");
    if (typeof window.__furinaBringToFront === "function") {
      window.__furinaBringToFront(win);
    }
    if (typeof window.__furinaSetActiveAppLabelFromWindow === "function") {
      window.__furinaSetActiveAppLabelFromWindow(win);
    }
  }

  function renderVideos(slot, data) {
    let html = "";
    const pdfUrl = String(data.videosPdfUrl || "").trim();
    if (pdfUrl) {
      const label = escapeHtml(data.videosPdfLabel || "作品集.pdf");
      html += `<p class="window-lead"><a href="${escapeAttr(pdfUrl)}" target="_blank" rel="noopener noreferrer">打开 PDF 作品集：${label}</a></p>`;
    }
    const list = (data.videos || []).filter((v) => v.title || v.url);
    if (!list.length) {
      html += '<div class="video-placeholder" aria-hidden="true"><span class="video-placeholder__icon">▶</span></div>';
      slot.innerHTML = html;
      return;
    }
    html += '<div class="video-file-grid">';
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const label = escapeHtml(v.title || "Video");
      const thumb = v.thumbnail
        ? `<img class="video-file__thumb" src="${escapeAttr(v.thumbnail)}" alt="" loading="lazy" />`
        : "";
      html += `<button class="video-file" type="button" data-video-index="${i}">
        <span class="video-file__icon">${thumb}<span class="video-file__play" aria-hidden="true">▶</span></span>
        <span class="video-file__name">${label}</span>
      </button>`;
    }
    html += "</div>";
    slot.innerHTML = html;

    slot.querySelectorAll("[data-video-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.videoIndex);
        if (list[idx]) openVideoPlayer(list[idx]);
      });
    });
  }

  function renderImages(slot, data) {
    const imgs = (data.images || []).filter((img) => imageItemSrc(img));
    if (!imgs.length) {
      slot.innerHTML = isPublicDeployWithoutEditor()
        ? '<p class="window-lead content-empty">No images in this build yet.</p>'
        : '<p class="window-lead content-empty">No images yet. Open <strong>Edit</strong>, then add an <strong>image URL</strong> or upload files.</p>';
      return;
    }
    slot.innerHTML = `<div class="photo-grid photo-grid--gallery">${imgs
      .map(
        (img) =>
          `<div class="photo-tile photo-tile--user"><img src="${escapeAttr(imageItemSrc(img))}" alt="${escapeAttr(img.caption || "")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></div>`
      )
      .join("")}</div>`;
  }

  function renderApps(slot, data) {
    const cards = (data.apps || []).filter((c) => c.title || c.description || c.url || String(c.icon || "").trim());
    if (!cards.length) {
      slot.innerHTML = isPublicDeployWithoutEditor()
        ? '<p class="content-empty">No apps in this build yet.</p>'
        : '<p class="content-empty">No apps yet. Edit in Content Editor.</p>';
      return;
    }
    slot.innerHTML = `<div class="app-launcher-grid">${cards
      .map((c) => {
        const name = escapeHtml(c.title || "App");
        const nameAttr = escapeAttr(c.title || "App");
        const link = String(c.url || "").trim();
        const iconSrc = String(c.icon || "").trim();
        const initial = escapeHtml((c.title || "?").trim().charAt(0).toUpperCase() || "?");
        const iconInner = iconSrc
          ? `<img src="${escapeAttr(iconSrc)}" alt="" class="app-launcher__icon-img" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
          : `<span class="app-launcher__icon-fallback" aria-hidden="true">${initial}</span>`;
        const label = `<span class="app-launcher__name">${name}</span>`;
        const inner = `<span class="app-launcher__icon">${iconInner}</span>${label}`;
        if (link) {
          return `<a class="app-launcher" href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer" aria-label="${nameAttr}">${inner}</a>`;
        }
        return `<div class="app-launcher app-launcher--nolink" role="group" aria-label="${nameAttr}">${inner}</div>`;
      })
      .join("")}</div>`;
  }

  function renderSiteContent(data) {
    const map = {
      aboutMe: () => renderAbout(document.querySelector('[data-content-slot="aboutMe"]'), data),
      articles: () => renderArticles(document.querySelector('[data-content-slot="articles"]'), data),
      video: () => renderVideos(document.querySelector('[data-content-slot="video"]'), data),
      images: () => renderImages(document.querySelector('[data-content-slot="images"]'), data),
      apps: () => renderApps(document.querySelector('[data-content-slot="apps"]'), data),
    };
    for (const fn of Object.values(map)) {
      fn();
    }
  }

  function readFormToContent() {
    const form = document.getElementById("site-editor-form");
    if (!form) {
      return loadSiteContent();
    }

    const articles = [...form.querySelectorAll(".editor-row-article")].map((row) => ({
      title: row.querySelector('[data-field="title"]')?.value?.trim() ?? "",
      description: row.querySelector('[data-field="description"]')?.value?.trim() ?? "",
      url: row.querySelector('[data-field="url"]')?.value?.trim() ?? "",
    }));

    const videos = [...form.querySelectorAll(".editor-row-video")].map((row) => ({
      title: row.querySelector('[data-field="title"]')?.value?.trim() ?? "",
      url: row.querySelector('[data-field="url"]')?.value?.trim() ?? "",
      description: row.querySelector('[data-field="description"]')?.value?.trim() ?? "",
      thumbnail: row.querySelector('[data-field="thumbnail"]')?.value?.trim() ?? "",
    }));

    const apps = [...form.querySelectorAll(".editor-row-app")].map((row) => ({
      icon: row.querySelector('[data-field="icon"]')?.value?.trim() ?? "",
      title: row.querySelector('[data-field="title"]')?.value?.trim() ?? "",
      description: row.querySelector('[data-field="description"]')?.value?.trim() ?? "",
      url: row.querySelector('[data-field="url"]')?.value?.trim() ?? "",
    }));

    const prev = loadSiteContent();
    return {
      version: 1,
      aboutTitle: form.querySelector('[name="aboutTitle"]')?.value ?? "",
      aboutBody: form.querySelector('[name="aboutBody"]')?.value ?? "",
      articlesLead: form.querySelector('[name="articlesLead"]')?.value ?? "",
      articles,
      videosPdfUrl: form.querySelector('[name="videosPdfUrl"]')?.value?.trim() ?? "",
      videosPdfLabel: form.querySelector('[name="videosPdfLabel"]')?.value ?? "",
      videos,
      images: prev.images,
      apps,
    };
  }

  function addArticleRow(container, item) {
    const row = document.createElement("div");
    row.className = "editor-row editor-row-article";
    const t1 = document.createElement("input");
    t1.type = "text";
    t1.placeholder = "Title";
    t1.dataset.field = "title";
    t1.value = item?.title ?? "";
    const t2 = document.createElement("input");
    t2.type = "text";
    t2.placeholder = "Short description";
    t2.dataset.field = "description";
    t2.value = item?.description ?? "";
    const t3 = document.createElement("input");
    t3.type = "url";
    t3.placeholder = "https://…";
    t3.dataset.field = "url";
    t3.value = item?.url ?? "";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "editor-row-remove";
    rm.setAttribute("aria-label", "Remove");
    rm.textContent = "×";
    rm.addEventListener("click", () => row.remove());
    row.append(t1, t2, t3, rm);
    container.appendChild(row);
  }

  function addVideoRow(container, item) {
    const row = document.createElement("div");
    row.className = "editor-row editor-row-video";
    const t1 = document.createElement("input");
    t1.type = "text";
    t1.placeholder = "Label";
    t1.dataset.field = "title";
    t1.value = item?.title ?? "";
    const t2 = document.createElement("input");
    t2.type = "url";
    t2.placeholder = "YouTube / Bilibili / any URL";
    t2.dataset.field = "url";
    t2.value = item?.url ?? "";
    const t3 = document.createElement("input");
    t3.type = "text";
    t3.placeholder = "Description";
    t3.dataset.field = "description";
    t3.value = item?.description ?? "";
    const t4 = document.createElement("input");
    t4.type = "url";
    t4.placeholder = "Thumbnail URL (or assets/video-covers/xxx.jpg)";
    t4.dataset.field = "thumbnail";
    t4.value = item?.thumbnail ?? "";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "editor-row-remove";
    rm.setAttribute("aria-label", "Remove");
    rm.textContent = "×";
    rm.addEventListener("click", () => row.remove());
    row.append(t1, t2, t3, t4, rm);
    container.appendChild(row);
  }

  function addAppRow(container, item) {
    const row = document.createElement("div");
    row.className = "editor-row editor-row-app";
    const t0 = document.createElement("input");
    t0.type = "url";
    t0.placeholder = "Icon URL";
    t0.dataset.field = "icon";
    t0.value = item?.icon ?? "";
    t0.title = "Square .png/.jpg URL, or assets/… path";
    const t1 = document.createElement("input");
    t1.type = "text";
    t1.placeholder = "App name";
    t1.dataset.field = "title";
    t1.value = item?.title ?? "";
    const t2 = document.createElement("input");
    t2.type = "text";
    t2.placeholder = "Notes (optional)";
    t2.dataset.field = "description";
    t2.value = item?.description ?? "";
    const t3 = document.createElement("input");
    t3.type = "url";
    t3.placeholder = "Open link https://…";
    t3.dataset.field = "url";
    t3.value = item?.url ?? "";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "editor-row-remove";
    rm.setAttribute("aria-label", "Remove");
    rm.textContent = "×";
    rm.addEventListener("click", () => row.remove());
    row.append(t0, t1, t2, t3, rm);
    container.appendChild(row);
  }

  function fillEditorForm(data) {
    const form = document.getElementById("site-editor-form");
    if (!form) {
      return;
    }

    const setVal = (name, v) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) {
        el.value = v ?? "";
      }
    };
    setVal("aboutTitle", data.aboutTitle);
    setVal("aboutBody", data.aboutBody);
    setVal("articlesLead", data.articlesLead);
    setVal("videosPdfUrl", data.videosPdfUrl);
    setVal("videosPdfLabel", data.videosPdfLabel);

    const artC = document.getElementById("editor-articles");
    artC.innerHTML = "";
    (data.articles || []).forEach((a) => addArticleRow(artC, a));
    if (!data.articles?.length) {
      addArticleRow(artC, {});
    }

    const vidC = document.getElementById("editor-videos");
    vidC.innerHTML = "";
    (data.videos || []).forEach((v) => addVideoRow(vidC, v));
    if (!data.videos?.length) {
      addVideoRow(vidC, {});
    }

    const appC = document.getElementById("editor-apps");
    appC.innerHTML = "";
    (data.apps || []).forEach((a) => addAppRow(appC, a));
    if (!data.apps?.length) {
      addAppRow(appC, {});
    }

    renderImageEditorList(data.images || []);
  }

  function renderImageEditorList(images) {
    const wrap = document.getElementById("editor-image-previews");
    if (!wrap) {
      return;
    }
    wrap.innerHTML = "";
    images.forEach((img, index) => {
      const src = imageItemSrc(img);
      const card = document.createElement("div");
      card.className = "editor-image-card";
      const kind = src && isImageUrlOnly(img)
        ? '<span class="editor-image-card__kind" title="Linked URL">URL</span>'
        : "";
      const body = src
        ? `<img src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
        : '<div class="editor-image-card--broken" title="Broken or empty entry">?</div>';
      card.innerHTML = `
        ${body}
        ${kind}
        <button type="button" class="editor-image-remove" data-index="${index}" aria-label="Remove image">×</button>
      `;
      card.querySelector(".editor-image-remove").addEventListener("click", () => {
        const d = loadSiteContent();
        if (!Array.isArray(d.images)) {
          d.images = [];
        }
        const removed = d.images.splice(index, 1)[0];
        if (!saveSiteContent(d)) {
          if (removed) {
            d.images.splice(index, 0, removed);
          }
          notify("删除失败：无法写入浏览器存储（可能已满）。");
          return;
        }
        fillEditorForm(d);
        renderSiteContent(d);
        notify("Image removed.");
      });
      wrap.appendChild(card);
    });
  }

  function bindEditor() {
    const form = document.getElementById("site-editor-form");
    if (!form) {
      return;
    }

    document.getElementById("editor-add-article")?.addEventListener("click", () => {
      addArticleRow(document.getElementById("editor-articles"), {});
    });
    document.getElementById("editor-add-video")?.addEventListener("click", () => {
      addVideoRow(document.getElementById("editor-videos"), {});
    });
    document.getElementById("editor-add-app")?.addEventListener("click", () => {
      addAppRow(document.getElementById("editor-apps"), {});
    });

    function addImageFromUrlField() {
      const urlInput = document.getElementById("editor-image-url-input");
      const raw = urlInput?.value?.trim() ?? "";
      if (!raw) {
        notify("Paste an image URL first.");
        return;
      }
      if (!/^https?:\/\//i.test(raw)) {
        notify("Use a link starting with http:// or https://");
        return;
      }
      if (/^(data:|blob:)/i.test(raw)) {
        notify("data:/blob: links are not suitable here—upload the file, or use a stable https:// image URL.");
        return;
      }
      const data = loadSiteContent();
      if (!Array.isArray(data.images)) {
        data.images = [];
      }
      if (data.images.length >= MAX_IMAGES) {
        notify(`${MAX_IMAGES} image limit reached.`);
        return;
      }
      data.images.push({ url: raw, caption: "" });
      if (!saveSiteContent(data)) {
        data.images.pop();
        notify("Could not save. Storage may still be full—remove some embedded uploads first, then add URLs.");
        return;
      }
      urlInput.value = "";
      fillEditorForm(data);
      renderSiteContent(data);
      notify("Linked image added.");
    }

    document.getElementById("editor-add-image-url")?.addEventListener("click", () => {
      addImageFromUrlField();
    });
    document.getElementById("editor-image-url-input")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addImageFromUrlField();
      }
    });

    form.querySelector("#editor-save")?.addEventListener("click", (e) => {
      e.preventDefault();
      const next = readFormToContent();
      if (!saveSiteContent(next)) {
        notify("保存失败：无法写入浏览器存储（可能已满或被禁用）。");
        return;
      }
      renderSiteContent(next);
      notify("Saved to this browser.");
    });

    form.querySelector("#editor-reset")?.addEventListener("click", (e) => {
      e.preventDefault();
      if (!window.confirm("Reset all content to default placeholders?")) {
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      const fresh = defaultContent();
      if (!saveSiteContent(fresh)) {
        notify("重置失败：无法写入浏览器存储。");
        return;
      }
      fillEditorForm(fresh);
      renderSiteContent(fresh);
      notify("Reset to defaults.");
    });

    form.querySelector("#editor-export")?.addEventListener("click", (e) => {
      e.preventDefault();
      const blob = new Blob([JSON.stringify(loadSiteContent(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "furina-site-content.json";
      a.click();
      URL.revokeObjectURL(a.href);
      notify("JSON file downloaded.");
    });

    form.querySelector("#editor-import")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = mergeContent(JSON.parse(reader.result));
          if (!saveSiteContent(imported)) {
            notify("导入失败：无法写入浏览器存储（可能已满）。");
            return;
          }
          fillEditorForm(imported);
          renderSiteContent(imported);
          notify("Imported from file.");
        } catch {
          notify("Invalid JSON file.");
        }
      };
      reader.readAsText(file);
    });

    document.getElementById("editor-images-input")?.addEventListener("change", (e) => {
      const input = e.target;
      const files = [...(input.files || [])];
      if (!files.length) {
        return;
      }

      void (async () => {
        const data = loadSiteContent();
        if (!Array.isArray(data.images)) {
          data.images = [];
        }

        let skipped = 0;
        let added = 0;
        let storageWarned = false;

        try {
          for (const file of files) {
            if (data.images.length >= MAX_IMAGES) {
              skipped += 1;
              continue;
            }
            let dataUrl;
            try {
              dataUrl = await readFileAsDataURL(file);
            } catch {
              notify(`无法读取「${file.name}」，请换一张图片再试。`);
              continue;
            }
            if (data.images.length >= MAX_IMAGES) {
              skipped += 1;
              continue;
            }
            data.images.push({ dataUrl, caption: file.name });
            if (!saveSiteContent(data)) {
              data.images.pop();
              if (!storageWarned) {
                notify("保存失败：浏览器存储可能已满。请缩小图片、导出备份后清理，或减少张数后再试。");
                storageWarned = true;
              }
              continue;
            }
            added += 1;
            fillEditorForm(data);
            renderSiteContent(data);
          }
        } finally {
          input.value = "";
        }

        if (added > 0) {
          notify(`已添加 ${added} 张图片。`);
        } else if (skipped > 0) {
          notify(`已达到 ${MAX_IMAGES} 张上限，未再添加。`);
        }
      })().catch(() => {
        notify("上传过程出错，请刷新页面后重试。");
        input.value = "";
      });
    });
  }

  async function init() {
    const data = await loadContentForInit();
    const appsUpgraded = applyBundledAppsUpgrade(data);
    const appsPatchV4 = applyBundledAppsPatchV4(data);
    let bundledDone = false;
    try {
      bundledDone = !!localStorage.getItem(BUNDLED_GALLERY_APPLIED_KEY);
    } catch {
      bundledDone = true;
    }
    let galleryChanged = false;
    if (!bundledDone) {
      galleryChanged = appendBundledGalleryMissing(data);
    }
    const needSave = appsUpgraded || galleryChanged || appsPatchV4 === "save";
    if (needSave) {
      if (saveSiteContent(data)) {
        if (appsUpgraded) {
          try {
            localStorage.setItem(BUNDLED_APPS_APPLIED_KEY, "1");
          } catch {
            /* ignore */
          }
        }
        if (galleryChanged) {
          try {
            localStorage.setItem(BUNDLED_GALLERY_APPLIED_KEY, "1");
          } catch {
            /* ignore */
          }
        }
        if (appsPatchV4 === "save") {
          try {
            localStorage.setItem(APPS_PATCH_V4_KEY, "1");
          } catch {
            /* ignore */
          }
        }
      }
    } else if (!bundledDone) {
      try {
        localStorage.setItem(BUNDLED_GALLERY_APPLIED_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (appsPatchV4 === "flag") {
      try {
        localStorage.setItem(APPS_PATCH_V4_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    renderSiteContent(data);
    if (!isPublicDeployWithoutEditor()) {
      fillEditorForm(data);
      bindEditor();
    }
    window.__furinaReloadContent = async () => {
      const d = await loadContentForInit();
      renderSiteContent(d);
      if (!isPublicDeployWithoutEditor()) {
        fillEditorForm(d);
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init());
  } else {
    void init();
  }
})();
