/* ============================================================
   input.js — keyboard + mouse tracking, cursor-pivot camera
   ============================================================ */
const Input = {
  keys: new Set(),
  mouse: { x: 0, y: 0, dx: 0, dy: 0, ndcX: 0, ndcY: 0, inCanvas: false, right: false },
  locked: false,
  everLocked: false,
  _canvas: null,
  _consumed: false,
  onClick: null,
  onKeyDown: null,
  onKeyUp: null,
  onUnlock: null,
  _lastTouch: 0,

  init(canvas) {
    this._canvas = canvas;
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this._canvas;
      if (this.locked) this.everLocked = true;
      else {
        this.mouse.right = false;
        if (this.onUnlock) this.onUnlock();
      }
    });
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (["tab", " ","arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) ||
          (k === "1" && (e.ctrlKey || e.metaKey)) || k === "escape") {
        // allow defaults for Tab/arrows except when panels open handled by Game
      }
      if (this.onKeyDown) this.onKeyDown(k, e);
      if (e.target && e.target.tagName === "INPUT") return;
      if (k === " " || k === "arrowup" || k === "arrowdown" || k === "tab" || k.startsWith("f")) {
        // prevent page scroll on space/arrows
        if (k !== "f1" && k !== "f2" && k !== "f5" && k !== "f12") e.preventDefault();
        if (k === "tab") e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (this.onKeyUp) this.onKeyUp(k, e);
    });
    window.addEventListener("blur", () => { this.keys.clear(); this.mouse.right = false; });

    document.addEventListener("mousemove", (e) => {
      this.mouse.dx = e.movementX || 0;
      this.mouse.dy = e.movementY || 0;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      const r = canvas.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        this.mouse.inCanvas = true;
        this.mouse.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
        this.mouse.ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
      } else {
        this.mouse.inCanvas = false;
      }
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) { this._consumed = true; if (this.onClick) this.onClick(e); }
      if (e.button === 2) { this.mouse.right = true; if (this.onRClick) this.onRClick(e); }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("touchstart", (e) => {
      const now = Date.now();
      if (now - this._lastTouch > 250 && this.onClick) this.onClick(e);
      this._lastTouch = now;
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (this.onResize) this.onResize();
    });
  },

  down(...k) { return k.some(x => this.keys.has(x)); },
  pressed(...k) { return k.some(x => this.keys.has(x)); },
  requestLock() {
    try {
      if (!this._canvas || this.locked) return;
      const p = this._canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* tasa de bloqueo o no soportado: fallback por posición */ }
  },
  exitLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
  },
  consumeClick() { const c = this._consumed; this._consumed = false; return c; },
};