const launchers = document.querySelectorAll("[data-window]");
const windows = document.querySelectorAll(".window");
const closeButtons = document.querySelectorAll("[data-close]");
const maximizeButtons = document.querySelectorAll("[data-toggle-maximize]");
const timeLabel = document.querySelector("#menu-time");
const activeAppLabel = document.querySelector("#active-app-label");
const stubButtons = document.querySelectorAll(".menu-bar__stub");
const goTrigger = document.querySelector(".menu-bar__go-trigger");
const goMenu = document.querySelector(".menu-bar__go-menu");
const toastEl = document.querySelector("#menu-toast");

const MIN_WINDOW_W = 260;
const MIN_WINDOW_H = 140;

let topLayer = 20;
let toastTimer = null;
/** @type {Element | null} */
let fullscreenRestoreTarget = null;

const STUB_MESSAGE = "This feature is not available yet.";
const FULLSCREEN_FAIL = "Fullscreen is not available in this browser.";
const LOCK_SESSION_KEY = "furina-lock-dismissed";

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function requestFullscreenFor(el) {
  if (el.requestFullscreen) {
    return el.requestFullscreen();
  }
  if (el.webkitRequestFullscreen) {
    return el.webkitRequestFullscreen();
  }
  return Promise.reject(new Error("fullscreen unsupported"));
}

function exitFullscreenDoc() {
  if (document.exitFullscreen) {
    return document.exitFullscreen();
  }
  if (document.webkitExitFullscreen) {
    return document.webkitExitFullscreen();
  }
  return Promise.reject(new Error("fullscreen unsupported"));
}

function getWindowLayer() {
  return document.querySelector(".window-layer");
}

function relativeWindowBounds(win) {
  const layer = getWindowLayer();
  if (!layer) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const lr = layer.getBoundingClientRect();
  const wr = win.getBoundingClientRect();
  return {
    left: wr.left - lr.left,
    top: wr.top - lr.top,
    width: wr.width,
    height: wr.height,
  };
}

function bringToFront(windowElement) {
  topLayer += 1;
  windowElement.style.zIndex = String(topLayer);
}

function setActiveAppLabelFromWindow(windowElement) {
  if (!activeAppLabel || !windowElement) {
    return;
  }
  const titleEl = windowElement.querySelector("[data-title-target]");
  activeAppLabel.textContent = titleEl ? titleEl.textContent.trim() : "Desktop";
}

function isWindowNativeFullscreen(win) {
  return getFullscreenElement() === win;
}

function syncMaximizeButton(win) {
  const btn = win.querySelector("[data-toggle-maximize]");
  if (!btn) {
    return;
  }
  const on = isWindowNativeFullscreen(win);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Exit fullscreen" : "Enter fullscreen");
}

function saveRestoreSnapshot(win) {
  const b = relativeWindowBounds(win);
  win.dataset.restoreTop = String(Math.round(b.top));
  win.dataset.restoreLeft = String(Math.round(b.left));
  win.dataset.restoreW = String(Math.round(b.width));
  win.dataset.restoreH = String(Math.round(b.height));
  win.dataset.restoreFixed = win.classList.contains("window--has-fixed-height") ? "1" : "0";
}

function applyRestoreSnapshot(win) {
  if (win.dataset.restoreTop === undefined) {
    return;
  }
  win.style.setProperty("--window-top", `${win.dataset.restoreTop}px`);
  win.style.setProperty("--window-left", `${win.dataset.restoreLeft}px`);
  win.style.setProperty("--window-w", `${win.dataset.restoreW}px`);
  if (win.dataset.restoreFixed === "1") {
    win.classList.add("window--has-fixed-height");
    win.style.setProperty("--window-h", `${win.dataset.restoreH}px`);
  } else {
    win.classList.remove("window--has-fixed-height");
    win.style.removeProperty("--window-h");
  }
}

function onFullscreenChange() {
  const el = getFullscreenElement();
  if (el && el.classList.contains("window")) {
    fullscreenRestoreTarget = el;
    windows.forEach((w) => syncMaximizeButton(w));
    return;
  }

  if (!el && fullscreenRestoreTarget) {
    applyRestoreSnapshot(fullscreenRestoreTarget);
    if (!fullscreenRestoreTarget.classList.contains("hidden")) {
      bringToFront(fullscreenRestoreTarget);
    }
    fullscreenRestoreTarget = null;
  }

  windows.forEach((w) => syncMaximizeButton(w));
}

async function toggleMaximize(win) {
  try {
    if (isWindowNativeFullscreen(win)) {
      await exitFullscreenDoc();
      return;
    }

    const current = getFullscreenElement();
    if (current && current !== win) {
      await exitFullscreenDoc();
    }

    saveRestoreSnapshot(win);
    await requestFullscreenFor(win);
  } catch {
    applyRestoreSnapshot(win);
    showToast(FULLSCREEN_FAIL);
    windows.forEach((w) => syncMaximizeButton(w));
  }
}

function openWindow(windowId) {
  const windowElement = document.getElementById(windowId);

  if (!windowElement) {
    return;
  }

  windowElement.classList.remove("hidden");
  bringToFront(windowElement);
  setActiveAppLabelFromWindow(windowElement);
}

async function closeWindow(button) {
  const windowElement = button.closest(".window");

  if (!windowElement) {
    return;
  }

  try {
    if (isWindowNativeFullscreen(windowElement)) {
      await exitFullscreenDoc();
    }
  } catch {
    /* ignore */
  }

  windowElement.classList.add("hidden");
  syncMaximizeButton(windowElement);

  const visible = [...windows].filter((w) => !w.classList.contains("hidden"));
  if (visible.length === 0 && activeAppLabel) {
    activeAppLabel.textContent = "Desktop";
  } else if (visible.length > 0 && activeAppLabel) {
    const top = visible.sort(
      (a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0)
    )[0];
    setActiveAppLabelFromWindow(top);
  }
}

function showToast(message) {
  if (!toastEl) {
    return;
  }

  toastEl.textContent = message;
  toastEl.classList.remove("hidden");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
    toastTimer = null;
  }, 2600);
}

function closeGoMenu() {
  if (!goMenu || !goTrigger) {
    return;
  }
  goMenu.classList.add("hidden");
  goTrigger.setAttribute("aria-expanded", "false");
}

function updateMenuTime() {
  if (!timeLabel) {
    return;
  }

  const now = new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = dayNames[now.getDay()];
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  timeLabel.textContent = `${day} ${hours}:${minutes}`;
}

function bindWindowDrag(win) {
  const header = win.querySelector("[data-drag-handle]");
  if (!header) {
    return;
  }

  header.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) {
      return;
    }
    if (e.target.closest("button")) {
      return;
    }
    if (isWindowNativeFullscreen(win)) {
      return;
    }

    e.preventDefault();
    bringToFront(win);
    setActiveAppLabelFromWindow(win);

    const layer = getWindowLayer();
    if (!layer) {
      return;
    }

    header.setPointerCapture(e.pointerId);
    win.setAttribute("data-window-state", "dragging");

    const lr = layer.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    const start = {
      mx: e.clientX,
      my: e.clientY,
      l: wr.left - lr.left,
      t: wr.top - lr.top,
      ww: wr.width,
      wh: wr.height,
    };

    const onMove = (ev) => {
      const dx = ev.clientX - start.mx;
      const dy = ev.clientY - start.my;
      let nl = start.l + dx;
      let nt = start.t + dy;
      const maxL = Math.max(0, lr.width - start.ww);
      const maxT = Math.max(0, lr.height - start.wh);
      nl = Math.min(Math.max(0, nl), maxL);
      nt = Math.min(Math.max(0, nt), maxT);
      win.style.setProperty("--window-top", `${Math.round(nt)}px`);
      win.style.setProperty("--window-left", `${Math.round(nl)}px`);
    };

    const onUp = (ev) => {
      try {
        header.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      win.setAttribute("data-window-state", "closed");
      header.removeEventListener("pointermove", onMove);
      header.removeEventListener("pointerup", onUp);
      header.removeEventListener("pointercancel", onUp);
    };

    header.addEventListener("pointermove", onMove);
    header.addEventListener("pointerup", onUp);
    header.addEventListener("pointercancel", onUp);
  });
}

function bindWindowResize(win) {
  const handle = win.querySelector("[data-resize-handle]");
  if (!handle) {
    return;
  }

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) {
      return;
    }
    if (isWindowNativeFullscreen(win)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    bringToFront(win);
    setActiveAppLabelFromWindow(win);

    handle.setPointerCapture(e.pointerId);

    const wr = win.getBoundingClientRect();
    const start = {
      mx: e.clientX,
      my: e.clientY,
      w: wr.width,
      h: wr.height,
    };

    const onMove = (ev) => {
      const dw = ev.clientX - start.mx;
      const dh = ev.clientY - start.my;
      const nw = Math.max(MIN_WINDOW_W, Math.round(start.w + dw));
      const nh = Math.max(MIN_WINDOW_H, Math.round(start.h + dh));
      win.style.setProperty("--window-w", `${nw}px`);
      win.style.setProperty("--window-h", `${nh}px`);
      win.classList.add("window--has-fixed-height");
    };

    const onUp = (ev) => {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
}

document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

windows.forEach((win) => {
  bindWindowDrag(win);
  bindWindowResize(win);
  syncMaximizeButton(win);
});

launchers.forEach((launcher) => {
  launcher.addEventListener("click", () => {
    openWindow(launcher.dataset.window);
    closeGoMenu();
  });
});

stubButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    showToast(STUB_MESSAGE);
    closeGoMenu();
  });
});

if (goTrigger) {
  goTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    goMenu.classList.toggle("hidden");
    const isOpen = !goMenu.classList.contains("hidden");
    goTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

document.addEventListener("click", () => {
  closeGoMenu();
});

if (goMenu) {
  goMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

closeButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void closeWindow(button);
  });
});

maximizeButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const win = button.closest(".window");
    if (!win) {
      return;
    }
    void toggleMaximize(win).then(() => {
      if (!isWindowNativeFullscreen(win)) {
        bringToFront(win);
      }
      setActiveAppLabelFromWindow(win);
    });
  });
});

windows.forEach((windowElement) => {
  windowElement.addEventListener("mousedown", () => {
    bringToFront(windowElement);
    setActiveAppLabelFromWindow(windowElement);
  });
});

document.addEventListener("keydown", (event) => {
  const lockScreenEl = document.getElementById("lock-screen");
  const lockActive = lockScreenEl && !lockScreenEl.classList.contains("lock-screen--hidden");

  if (event.key === "Escape") {
    if (goMenu && !goMenu.classList.contains("hidden")) {
      closeGoMenu();
      return;
    }
    if (getFullscreenElement()) {
      return;
    }
    if (lockActive) {
      event.preventDefault();
      document.getElementById("lock-screen-input")?.focus();
      return;
    }
  }

  if (event.key !== "Escape") {
    return;
  }

  if (lockActive) {
    return;
  }

  const visibleWindows = [...windows].filter(
    (windowElement) => !windowElement.classList.contains("hidden")
  );

  const topWindow = visibleWindows.sort(
    (firstWindow, secondWindow) =>
      Number(secondWindow.style.zIndex || 0) - Number(firstWindow.style.zIndex || 0)
  )[0];

  if (topWindow) {
    topWindow.classList.add("hidden");
    syncMaximizeButton(topWindow);
    const rest = [...windows].filter((w) => !w.classList.contains("hidden"));
    if (rest.length === 0 && activeAppLabel) {
      activeAppLabel.textContent = "Desktop";
    } else if (rest.length > 0 && activeAppLabel) {
      const top = rest.sort(
        (a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0)
      )[0];
      setActiveAppLabelFromWindow(top);
    }
  }
});

updateMenuTime();
setInterval(updateMenuTime, 30000);

function updateLockClock() {
  const timeEl = document.getElementById("lock-screen-time");
  const dateEl = document.getElementById("lock-screen-date");
  if (!timeEl || !dateEl) {
    return;
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  timeEl.textContent = timeStr;
  dateEl.textContent = dateStr;
}

function dismissLockScreen(passphrase) {
  const screen = document.getElementById("lock-screen");
  if (!screen || screen.classList.contains("lock-screen--hidden")) {
    return;
  }
  const value = String(passphrase ?? "").slice(0, 24);
  try {
    window.dispatchEvent(new CustomEvent("furina-unlock", { detail: { passphrase: value } }));
  } catch {
    /* ignore */
  }
  sessionStorage.setItem(LOCK_SESSION_KEY, "1");
  screen.classList.add("lock-screen--hidden");
  screen.setAttribute("aria-hidden", "true");
}

function initLockScreen() {
  const screen = document.getElementById("lock-screen");
  const form = document.getElementById("lock-screen-form");
  const input = document.getElementById("lock-screen-input");
  if (!screen || !form || !input) {
    return;
  }

  if (sessionStorage.getItem(LOCK_SESSION_KEY) === "1") {
    screen.classList.add("lock-screen--hidden");
    screen.setAttribute("aria-hidden", "true");
    return;
  }

  screen.setAttribute("aria-hidden", "false");
  updateLockClock();
  setInterval(updateLockClock, 30000);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    dismissLockScreen(input.value);
  });

  input.focus();
}

initLockScreen();

window.notifyUser = showToast;
// Expose small window helpers for content-driven popups (e.g. video player).
window.__furinaBringToFront = bringToFront;
window.__furinaSetActiveAppLabelFromWindow = setActiveAppLabelFromWindow;

// ========== Dock Pet (Digital Twin) ==========
try {
  const dockEl = document.querySelector(".dock");
  const petRoot = document.getElementById("dock-pet");
  const petChat = document.getElementById("dock-pet-chat");
  const petLog = document.getElementById("dock-pet-chat-log");
  const petForm = document.getElementById("dock-pet-chat-form");
  const petInput = document.getElementById("dock-pet-chat-input");
  const petClose = document.querySelector(".dock-pet-chat__close");

  if (dockEl && petRoot && petChat && petLog && petForm && petInput && petClose && window.createDockPet) {
    const pet = window.createDockPet({
      root: petRoot,
      dockEl,
      chat: petChat,
      chatLog: petLog,
      chatForm: petForm,
      chatInput: petInput,
      closeBtn: petClose,
    });

    window.addEventListener("furina-unlock", (e) => {
      pet.onUnlock(e && e.detail ? e.detail.passphrase : "");
    });

    // If lock screen was skipped due to session key, the unlock event will not fire on refresh.
    // In that case, wake the pet with an empty passphrase.
    if (sessionStorage.getItem(LOCK_SESSION_KEY) === "1") {
      pet.onUnlock("");
    }
  }
} catch {
  /* ignore */
}
