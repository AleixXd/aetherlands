/* tests/probe.js — suite de regresión de Aetherlands.
   Se inyecta en una copia temporal de index.html por tests/run.ps1.
   Emite líneas de consola "[TEST] PASS|FAIL nombre :: detalle" y "[TEST] FIN". */
(function () {
  var total = 0, fails = 0;
  function T(name, ok, detail) {
    total++;
    if (!ok) fails++;
    console.log("[TEST]\t" + (ok ? "PASS" : "FAIL") + "\t" + name + "\t" + (detail || ""));
  }

  function testSave() {
    try {
      var raw = Save.exportJSON();
      var obj = JSON.parse(raw);
      if (!obj || !obj.player) return T("guardado: export", false, "sin player");
      T("guardado: export", true, "");
      var origGold = Save.data.player.gold;
      var copy = JSON.parse(raw);
      copy.player.gold = 999999;
      var ok = Save.importJSON(JSON.stringify(copy));
      T("guardado: import", ok === true && Save.data.player.gold === 999999, "gold=" + Save.data.player.gold);
      Save.importJSON(raw);
      T("guardado: restaura", Save.data.player.gold === origGold, "gold=" + Save.data.player.gold);
    } catch (e) { T("guardado", false, e.message); }
  }

  function insideAny(x, z, pr) {
    for (var i = 0; i < Build.colliders.length; i++) {
      var c = Build.colliders[i];
      var dx = x - c.x, dz = z - c.z;
      if (c.hw === undefined) {
        var rr = c.r + pr;
        if (dx * dx + dz * dz < (rr - 1e-4) * (rr - 1e-4)) return true;
      } else {
        var ca = Math.cos(c.a || 0), sa = Math.sin(c.a || 0);
        var lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
        if (Math.abs(lx) < c.hw + pr - 1e-4 && Math.abs(lz) < c.hd + pr - 1e-4) return true;
      }
    }
    return false;
  }

  function testCollisions() {
    var n = Build.colliders.length;
    T("colisiones: existen", n > 50, "n=" + n);
    var bad = 0;
    for (var i = 0; i < n; i++) {
      var c = Build.colliders[i];
      if (!isFinite(c.x) || !isFinite(c.z)) bad++;
      else if (c.hw === undefined && (!(c.r > 0) || !isFinite(c.r))) bad++;
      else if (c.hw !== undefined && (!(c.hw > 0) || !(c.hd > 0) || (c.a !== undefined && !isFinite(c.a)))) bad++;
    }
    T("colisiones: datos validos", bad === 0, "bad=" + bad);

    var step = Math.max(1, Math.floor(n / 60));
    var stuck = [];
    for (var j = 0; j < n; j += step) {
      var cc = Build.colliders[j];
      var ent = { pos: { x: cc.x, z: cc.z } };
      for (var k = 0; k < 4; k++) Game._pushStatics(ent, 0.45);
      if (insideAny(ent.pos.x, ent.pos.z, 0.4)) stuck.push(j);
    }
    T("colisiones: empuje converge", stuck.length === 0, "stuck=" + stuck.join(","));

    T("colisiones: spawn libre", !insideAny(6, 8, 0.45), "(6,8)");
  }

  function testMinimap() {
    try {
      var p = Game.player.pos;
      var x0 = p.x, y0 = p.y, z0 = p.z;
      p.set(200, 10, 50);
      Game.ui.drawMinimap();
      var ok1 = Game.ui._mmTerrC && Math.abs(Game.ui._mmTerrC.x - 200) < 0.01 && !!Game.ui._mmTerrain;
      p.set(6, 10, 8);
      Game.ui.drawMinimap();
      var ok2 = Game.ui._mmTerrC && Math.abs(Game.ui._mmTerrC.x - 6) < 0.01;
      T("minimap: cache sigue al jugador", ok1 && ok2, "c=" + (Game.ui._mmTerrC && Game.ui._mmTerrC.x));
      p.set(x0, y0, z0);
    } catch (e) { T("minimap", false, e.message); }
  }

  function testAccount() {
    try {
      if (typeof Game.ui.showAccount !== "function" || typeof Game.ui.renderAccount !== "function") {
        return T("cuenta: panel", false, "metodos ausentes");
      }
      var panel = document.getElementById("account-panel");
      var body = document.getElementById("account-body");
      Game.ui.showAccount();
      var opened = !!(panel && !panel.classList.contains("hidden"));
      var formOut = !!(body && body.innerHTML.indexOf("acc-email") >= 0);
      var prev = CloudSave.session;
      CloudSave.session = { email: "prueba@local.test" };
      Game.ui.renderAccount();
      var formIn = !!(body && body.innerHTML.indexOf("acc-up") >= 0);
      CloudSave.session = prev;
      Game.ui.renderAccount();
      var restOut = !!(body && body.innerHTML.indexOf("acc-email") >= 0);
      Game.ui.closeTop();
      var closed = !!(panel && panel.classList.contains("hidden"));
      T("cuenta: panel", opened && formOut && formIn && restOut && closed,
        "open=" + opened + " form=" + formOut + " sesion=" + formIn + " cierra=" + closed);
    } catch (e) { T("cuenta: panel", false, e.message); }
  }

  function testPwa() {
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      T("pwa: service worker", !!(reg && reg.active), "");
      return caches.keys();
    }).then(function (keys) {
      if (!keys.length) { T("pwa: cache", false, "sin caches"); return; }
      return caches.open(keys[0]).then(function (c) { return c.keys(); }).then(function (reqs) {
        return fetch("sw.js").then(function (r) { return r.text(); }).then(function (txt) {
          var block = txt.match(/const FILES = \[([\s\S]*?)\]/);
          var declared = block ? (block[1].match(/"\.\//g) || []).length : -1;
          T("pwa: cache completa", reqs.length === declared, "cache=" + reqs.length + " sw=" + declared);
        });
      });
    }).catch(function (e) { T("pwa", false, e.message); });
  }

  function testCloud() {
    if (location.search.indexOf("nocloud") >= 0) return Promise.resolve();
    if (typeof CloudSave === "undefined") { T("nube: cloud.js", false, "no existe"); return Promise.resolve(); }
    if (!CloudSave.enabled()) { T("nube: configurada", false, "CFG.CLOUD vacio"); return Promise.resolve(); }
    var em = "autotest@aetherlands.test", pw = "AeTest!2345";
    return CloudSave.login(em, pw)
      .then(function () { T("nube: login", !!CloudSave.session, ""); return CloudSave.upload(JSON.stringify({ player: { gold: 4242, name: "TEST" } })); })
      .then(function () { T("nube: subida", true, ""); return CloudSave.download(); })
      .then(function (cloud) {
        T("nube: ida/vuelta", !!(cloud && cloud.data && cloud.data.player && cloud.data.player.gold === 4242), cloud ? "gold=" + cloud.data.player.gold : "null");
        return CloudSave.logout();
      })
      .then(function () { T("nube: logout", !CloudSave.session, ""); })
      .catch(function (e) { T("nube", false, e.message); });
  }

  function finish() {
    console.log("[TEST]\tFIN\ttotal=" + total + "\tfails=" + fails);
  }

  function run() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.__gameReady && typeof Game !== "undefined") {
        clearInterval(iv);
        T("arranque: gameReady", true, "");
        try { testSave(); testCollisions(); testMinimap(); testAccount(); }
        catch (e) { T("suite", false, e.message); }
        Promise.all([testPwa(), testCloud()]).then(finish);
      } else if (tries >= 600) {
        clearInterval(iv);
        T("arranque: gameReady", false, "timeout");
        finish();
      }
    }, 50);
  }

  if (document.readyState === "complete") run();
  else window.addEventListener("load", run);
})();
