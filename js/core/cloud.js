/* ============================================================
   cloud.js — guardado en la nube (Supabase Auth + user_metadata)
   Cliente mínimo con fetch puro: sin dependencias externas.
   El guardado viaja como JSON en user_metadata.save (solo el
   propio usuario puede leer/escribir su sesión → sin tabla ni RLS).
   ============================================================ */
const CloudSave = {
  KEY: "ael_session_v1",
  session: null,      // { access_token, refresh_token, expires_at, email }
  _t: null,           // temporizador de subida automática
  _busy: false,
  _netWarned: false,  // aviso de red mostrado (una sola vez hasta que se suba)

  enabled() {
    return !!(CFG.CLOUD && CFG.CLOUD.URL && CFG.CLOUD.ANON);
  },

  /* ---------- persistencia de sesión ---------- */
  _load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) this.session = JSON.parse(raw);
    } catch (e) { this.session = null; }
    return this.session;
  },
  _persist() {
    try {
      if (this.session) localStorage.setItem(this.KEY, JSON.stringify(this.session));
      else localStorage.removeItem(this.KEY);
    } catch (e) {}
  },

  /* ---------- transporte ---------- */
  async _fetch(path, opts) {
    const url = CFG.CLOUD.URL + path;
    const headers = Object.assign({ apikey: CFG.CLOUD.ANON, "Content-Type": "application/json" }, opts.headers || {});
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    const res = await fetch(url, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) || ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  _setSession(data, email) {
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
      email: email || (data.user && data.user.email) || ""
    };
    this._persist();
  },

  async _ensure() {
    if (!this.session) this._load();
    if (!this.session) return false;
    if (this.session.expires_at && Date.now() < this.session.expires_at - 60000) return true;
    try {
      const data = await this._fetch("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", body: { refresh_token: this.session.refresh_token }
      });
      this._setSession(data, this.session.email);
      return true;
    } catch (e) {
      this.session = null;
      this._persist();
      return false;
    }
  },

  /* ---------- cuentas ---------- */
  async signup(email, password) {
    const data = await this._fetch("/auth/v1/signup", { method: "POST", body: { email: email, password: password } });
    if (!data.access_token) {
      const err = new Error("Cuenta creada. Revisa tu correo para confirmarla.");
      err.needsConfirm = true;
      throw err;
    }
    this._setSession(data, email);
    return true;
  },

  async login(email, password) {
    const data = await this._fetch("/auth/v1/token?grant_type=password", {
      method: "POST", body: { email: email, password: password }
    });
    this._setSession(data, email);
    return true;
  },

  async logout() {
    if (this.session) {
      try { await this._fetch("/auth/v1/logout", { method: "POST", token: this.session.access_token }); } catch (e) {}
    }
    this.session = null;
    this._persist();
  },

  /* ---------- partidas ---------- */
  async upload(json) {
    if (!(await this._ensure())) throw new Error("No hay sesión iniciada.");
    await this._fetch("/auth/v1/user", {
      method: "PUT", token: this.session.access_token,
      body: { data: { save: json, saveAt: Date.now() } }
    });
    return true;
  },

  async download() {
    if (!(await this._ensure())) throw new Error("No hay sesión iniciada.");
    const user = await this._fetch("/auth/v1/user", { token: this.session.access_token });
    const meta = user.user_metadata || {};
    if (!meta.save) return null;
    return { data: JSON.parse(meta.save), saveAt: meta.saveAt || 0 };
  },

  /* ---------- avisos de red ---------- */
  _warn(msg) {
    if (this._netWarned) return;
    this._netWarned = true;
    if (typeof Game !== "undefined" && Game.ui && Game.ui.notify) Game.ui.notify(msg, "warn");
  },

  /* ---------- subida automática (tras Save.save) ---------- */
  scheduleUpload() {
    if (!this.enabled()) return;
    if (!this.session && !this._load()) return;
    if (this._busy) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this._warn("Sin conexión: la partida se subirá sola al volver la red.");
        return;
      }
      this._busy = true;
      this.upload(JSON.stringify(Save.data)).then(() => {
        this.lastUp = Date.now();
        this._netWarned = false;
      }).catch((e) => {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (offline || /fetch|network/i.test(e.message || "")) {
          this._warn("Sin conexión: la partida se subirá sola al volver la red.");
        } else {
          this._warn("No se pudo subir a la nube: " + e.message);
        }
      }).finally(() => { this._busy = false; });
    }, 3000);
  }
};

/* reintento automático al recuperar la conexión */
if (typeof window !== "undefined") {
  window.addEventListener("online", function () { CloudSave.scheduleUpload(); });
}
