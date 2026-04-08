(function () {
  const SESSION_KEY = "furina-pet-session-v1";

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function nowMs() {
    return performance.now();
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") || { turn: 0, maxTurns: 18, messages: [] };
    } catch {
      return { turn: 0, maxTurns: 18, messages: [] };
    }
  }

  function saveSession(s) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function pushMsg(session, msg) {
    const next = { ...session, messages: [...session.messages, msg] };
    if (next.messages.length > 24) next.messages = next.messages.slice(-24);
    return next;
  }

  /** GitHub Pages 静态站：不接 API，固定提示（与主仓库 pet.js 不同）。 */
  async function petChat(_payload) {
    return {
      ok: true,
      status: "normal",
      message: "该功能调试中，等待上线",
    };
  }

  window.createDockPet = function createDockPet(opts) {
    const root = opts.root;
    const dockEl = opts.dockEl;
    const chat = opts.chat;
    const chatLog = opts.chatLog;
    const chatForm = opts.chatForm;
    const chatInput = opts.chatInput;
    const closeBtn = opts.closeBtn;

    let state = "sleeping";
    let energy = "normal";
    let passphrase = "";
    let session = loadSession();

    // positioning
    let x = 0;
    let y = 0;
    let trackMin = 0;
    let trackMax = 0;
    let lastDodgeAt = -Infinity;
    let lastMouse = { x: 0, y: 0 };
    let raf = 0;
    let pendingDodgeTimer = 0;
    let dodgePhaseTimer = 0;
    let dodgeSettleTimer = 0;
    let chaseWindowStart = 0;
    let chaseCount = 0;

    function setState(next) {
      state = next;
      root.dataset.state = state;
    }

    function setEnergy(next) {
      energy = next;
      root.dataset.energy = energy;
    }

    function layoutTrack() {
      const dock = dockEl.getBoundingClientRect();
      const petRect = root.getBoundingClientRect();
      const petW = petRect.width || 80;
      const margin = 18;
      trackMin = dock.left + margin;
      trackMax = dock.right - margin - petW;

      // default parking to the right
      if (!Number.isFinite(x) || x === 0) x = clamp(trackMax - 6, trackMin, trackMax);
      // "轻压住 Dock"：螃蟹底边压进 Dock 上沿少许（更像趴着）
      const h = root.getBoundingClientRect().height || 80;
      const overlap = 18;
      y = Math.round(dock.top - h + overlap);
    }

    function applyTransform() {
      root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }

    function clearDodgeTimers() {
      clearTimeout(pendingDodgeTimer);
      pendingDodgeTimer = 0;
      clearTimeout(dodgePhaseTimer);
      dodgePhaseTimer = 0;
      clearTimeout(dodgeSettleTimer);
      dodgeSettleTimer = 0;
    }

    function freezeToCurrentScreenPosition() {
      // Freeze the crab at the exact spot user pressed.
      // Cancel any queued raf that might apply a just-computed dodge.
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      clearDodgeTimers();

      const r = root.getBoundingClientRect();
      x = Math.round(r.left);
      y = Math.round(r.top);
      applyTransform();
      positionBubble();
    }

    function tick() {
      raf = 0;
      applyTransform();
      positionBubble();
    }

    function requestTick() {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    }

    function renderLog() {
      chatLog.innerHTML = session.messages
        .map((m) => `<div class="dock-pet-chat__msg dock-pet-chat__msg--${m.role}">${escapeHtml(m.text)}</div>`)
        .join("");
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function positionBubble() {
      if (chat.classList.contains("dock-pet-chat--hidden")) return;
      const pr = root.getBoundingClientRect();
      const cr = chat.getBoundingClientRect();

      const padding = 10;
      const gap = 10;

      let left = Math.round(pr.left + pr.width / 2 - 36);
      let top = Math.round(pr.top - cr.height - gap);

      left = clamp(left, padding, window.innerWidth - cr.width - padding);
      top = clamp(top, padding, window.innerHeight - cr.height - padding);

      chat.style.left = `${left}px`;
      chat.style.top = `${top}px`;

      // 让气泡尾巴指向螃蟹中心
      const tailX = clamp(Math.round(pr.left + pr.width / 2 - left), 18, cr.width - 18);
      chat.style.setProperty("--dock-pet-tail-x", `${tailX}px`);
    }

    function openChat() {
      if (state === "sleeping") return;
      chat.classList.remove("dock-pet-chat--hidden");
      setState("chatting");
      renderLog();
      positionBubble();
      chatInput.focus();
    }

    function closeChat() {
      chat.classList.add("dock-pet-chat--hidden");
      if (state !== "offline") setState("idle");
      root.focus();
    }

    async function send(text) {
      if (state === "offline") return;

      if (text) {
        session = pushMsg(session, { role: "user", text });
        saveSession(session);
        renderLog();
      }

      const out = await petChat({ passphrase, text: text || "", session: { turn: session.turn, maxTurns: session.maxTurns, messages: session.messages } });
      session = { ...session, turn: session.turn + 1 };
      session = pushMsg(session, { role: "pet", text: out.message });
      saveSession(session);
      renderLog();

      if (out.status === "drained") setEnergy("drained");
      if (out.status === "offline") {
        setState("offline");
        chatInput.disabled = true;
        chatInput.placeholder = "它已经下线了…";
      }
    }

    function onUnlock(p) {
      passphrase = String(p || "").slice(0, 24);
      root.classList.remove("dock-pet--hidden");
      chatInput.disabled = false;
      chatInput.placeholder = "说点什么…";
      setEnergy("normal");
      setState("idle");
      // cold open: let server react to passphrase even if user didn't chat yet
      void send("");
    }

    // bratty dodge
    function awarenessHit(mx, my) {
      const r = root.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const radius = 132;
      return dx * dx + dy * dy <= radius * radius;
    }

    function scheduleDodge() {
      if (prefersReducedMotion()) return;
      if (state === "sleeping" || state === "chatting" || state === "offline") return;
      const t = nowMs();
      if (t - lastDodgeAt < 260) return;

      setState("alert");
      clearDodgeTimers();
      pendingDodgeTimer = window.setTimeout(() => {
        if (state === "chatting" || state === "offline") return;
        // track chasing to show a richer expression sometimes
        if (!chaseWindowStart || t - chaseWindowStart > 2200) {
          chaseWindowStart = t;
          chaseCount = 0;
        }
        chaseCount += 1;
        const direction = lastMouse.x < x + 22 ? 1 : -1; // if cursor on left, move right
        const dist = 160;
        let nextX = x + direction * dist;
        nextX = clamp(nextX, trackMin, trackMax);

        const nearEdge = nextX <= trackMin + 6 || nextX >= trackMax - 6;
        const stillOnMe = awarenessHit(lastMouse.x, lastMouse.y);
        if (nearEdge && stillOnMe) {
          // jump to safer side
          nextX = direction > 0 ? trackMin + 12 : trackMax - 12;
        }

        setState("dodging");
        x = nextX;
        lastDodgeAt = nowMs();
        requestTick();

        dodgePhaseTimer = window.setTimeout(() => {
          if (state === "dodging") {
            if (chaseCount >= 3) {
              setState("annoyed");
              dodgeSettleTimer = window.setTimeout(() => {
                if (state === "annoyed") setState("peeking");
              }, 260);
            } else {
              setState("peeking");
            }
          }
          dodgeSettleTimer = window.setTimeout(() => {
            if (state === "peeking") setState("idle");
          }, 320);
        }, 260);
      }, 160);
    }

    function onMouseMove(e) {
      lastMouse = { x: e.clientX, y: e.clientY };
      if (state === "sleeping" || state === "chatting" || state === "offline") return;
      if (awarenessHit(e.clientX, e.clientY)) scheduleDodge();
    }

    // Use pointerdown to open chat immediately (before click),
    // so we can freeze movement and cancel any pending dodge timer.
    root.addEventListener("pointerdown", (e) => {
      root.classList.add("is-pressed");

      if (state === "sleeping") return;
      if (!chat.classList.contains("dock-pet-chat--hidden")) return;

      // Freeze first, then enter chatting state and open bubble.
      freezeToCurrentScreenPosition();
      lastDodgeAt = nowMs();
      openChat();

      if (e && e.pointerId !== undefined && root.setPointerCapture) {
        try {
          root.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    });
    root.addEventListener("pointerup", () => root.classList.remove("is-pressed"));
    root.addEventListener("pointercancel", () => root.classList.remove("is-pressed"));
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openChat();
      }
    });
    closeBtn.addEventListener("click", closeChat);
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (chat.classList.contains("dock-pet-chat--hidden")) return;
        const t = e.target;
        if (t && (root.contains(t) || chat.contains(t))) return;
        closeChat();
      },
      { capture: true }
    );
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = "";
      void send(text);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !chat.classList.contains("dock-pet-chat--hidden")) closeChat();
    });
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", () => {
      layoutTrack();
      requestTick();
    });

    layoutTrack();
    requestTick();
    setState("sleeping");

    return { onUnlock, layout: () => (layoutTrack(), requestTick()) };
  };
})();

