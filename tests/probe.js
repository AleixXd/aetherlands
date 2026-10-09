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
    return new Promise(function (resolve) {
      var tries = 0, swOk = false, done = false;
      var iv = setInterval(function () {
        tries++;
        if (done) return;
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.active) swOk = true;
        }).catch(function () {});
        if (tries >= 120 && !swOk) {
          clearInterval(iv);
          done = true;
          T("pwa: service worker", false, "sin SW activo");
          resolve();
          return;
        }
        caches.keys().then(function (keys) {
          if (!keys.length || !swOk) return null;
          return caches.open(keys[0]).then(function (c) { return c.keys(); }).then(function (reqs) {
            return fetch("sw.js").then(function (r) { return r.text(); }).then(function (txt) {
              var block = txt.match(/const FILES = \[([\s\S]*?)\]/);
              var declared = block ? (block[1].match(/"\.\/[^"]*"/g) || []) : [];
              var paths = reqs.map(function (r) { return new URL(r.url).pathname; });
              var missing = [];
              for (var i = 0; i < declared.length; i++) {
                var p = declared[i].replace(/^"\.\//, "").replace(/"$/, "");
                var found;
                if (p === "") found = paths.some(function (x) { return x.charAt(x.length - 1) === "/"; });
                else found = paths.some(function (x) { return x === "/" + p || x.slice(-(p.length + 1)) === "/" + p; });
                if (!found) missing.push(p);
              }
              if (missing.length === 0 || tries >= 120) {
                clearInterval(iv);
                done = true;
                T("pwa: service worker", true, "");
                T("pwa: cache completa", missing.length === 0,
                  "decl=" + declared.length + " cache=" + paths.length + " falta=" + (missing.join(",") || "-"));
                resolve();
              }
            });
          });
        }).catch(function (e) {
          clearInterval(iv);
          if (done) { resolve(); return; }
          done = true;
          T("pwa", false, e.message);
          resolve();
        });
      }, 50);
    });
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

  function testGlb() {
    return new Promise(function (resolve) {
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        var p = (typeof Game !== "undefined" && Game.player) ? Game.player : null;
        if (p && p.glbActive) {
          clearInterval(iv);
          T("personaje: glb", !!(p.mixer && p.clips && p.clips.Idle),
            "clips=" + Object.keys(p.clips || {}).length);
          resolve();
        } else if (tries >= 120) {
          clearInterval(iv);
          T("personaje: glb", false, p ? "no carga (fallback procedural)" : "sin player");
          resolve();
        }
      }, 50);
    });
  }

  function testTownGlb() {
    return new Promise(function (resolve) {
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        var npcs = (typeof Build !== "undefined" && Build.npcMixers) ? Build.npcMixers.length : 0;
        var ready = (typeof Build !== "undefined" && Build.glbReady) ? Build.glbReady : 0;
        if (npcs >= 11 && ready >= 29) {
          clearInterval(iv);
          T("pueblo: glb", true, "mixers=" + npcs + " glbReady=" + ready);
          resolve();
        } else if (tries >= 360) {
          clearInterval(iv);
          T("pueblo: glb", false, "mixers=" + npcs + " glbReady=" + ready + " (esperaba 11/29)");
          resolve();
        }
      }, 50);
    });
  }

  function testJump() {
    return new Promise(function (resolve) {
      var p = (typeof Game !== "undefined" && Game.player) ? Game.player : null;
      if (!p || typeof p.tryJump !== "function") {
        T("salto: sube", false, "sin player");
        return resolve();
      }
      try { Game.enterWorld(); } catch (e) { console.log("[TEST] enterWorld ERROR: " + e.message); }
      // asienta el spawn (rAF fiable en headless) antes de medir la referencia
      for (var s = 0; s < 12; s++) {
        try { Game.player.update(0.05); } catch (e) { break; }
      }
      var y0 = p.pos.y, x0 = p.pos.x, z0 = p.pos.z, maxDy = 0, t = 0;
      p.tryJump();
      // en headless el rAF puede quedarse sin presupuesto virtual:
      // empujamos la física a mano con dt fijo (mismo código que el bucle real)
      var iv = setInterval(function () {
        t++;
        for (var k = 0; k < 3; k++) {
          try { Game.player.update(0.05); } catch (e) { /* seguro si el bucle está vivo */ }
        }
        var dy = p.pos.y - y0;
        if (dy > maxDy) maxDy = dy;
        if (t >= 50) {
          clearInterval(iv);
          T("salto: sube", maxDy > 0.5, "maxDy=" + maxDy.toFixed(2) + " y0=" + y0.toFixed(2));
          T("salto: aterriza", p.onGround && Math.abs(p.pos.y - y0) < 0.3,
            "onGround=" + p.onGround + " dy=" + (p.pos.y - y0).toFixed(2) +
            " dx=" + (p.pos.x - x0).toFixed(2) + " dz=" + (p.pos.z - z0).toFixed(2));
          resolve();
        }
      }, 50);
    });
  }

  function testNet() {
    try {
      if (typeof Net === "undefined") return T("net: definido", false, "sin objeto Net");
      T("net: definido", typeof Net.update === "function" && typeof Net.plates === "function" &&
        typeof Net._upd === "function" && typeof Net._frame === "function", "state=" + Net.state);
      var f = JSON.parse(JSON.stringify(Net._frame("upd", { id: "x", x: 1 })));
      T("net: frame", f.topic === Net.TOPIC && f.event === "broadcast" &&
        f.payload.type === "broadcast" && f.payload.event === "upd", f.event);
      T("net: region", typeof Net._regionKey() === "string" && Net._regionKey().length > 0, Net._regionKey());

      // remoto sintético (sin red): aparece, pinta placa y su avatar entra en escena
      Net._upd({ id: "__ua__", n: "Prueba UA", c: "mage", l: 9, r: Net._regionKey(), x: 14, y: 3, z: -22, a: 1.1, m: 1 });
      var p = Net.players.get("__ua__");
      T("net: remoto sintetico", !!(p && p.init && Math.abs(p.pos.x - 14) < 0.01 && p.name === "Prueba UA"),
        p ? "x=" + p.pos.x : "sin entrada");
      T("net: avatar en escena", !!(p && p.g && p.g.parent === Game.scene), "");
      var plates = Net.plates();
      T("net: nameplate", plates.some(function (t) { return t.label === "Prueba UA" && t.pl === true; }),
        "plates=" + plates.length);

      // el destino cambia y la interpolación converge
      Net._upd({ id: "__ua__", n: "Prueba UA", c: "mage", l: 9, r: Net._regionKey(), x: 20, y: 3, z: -22, a: 1.1, m: 1 });
      for (var i = 0; i < 60; i++) Net.update(0.05);
      var d = p ? p.pos.distanceTo(p.tgt) : 99;
      T("net: interpolacion", d < 0.5, "dist=" + d.toFixed(3));

      // sin noticias en TIMEOUT → baja y su avatar sale de la escena
      p.seen = performance.now() - 9999;
      Net.update(0.016);
      T("net: caducidad", !Net.players.has("__ua__") && p.g && p.g.parent === null, "");
      T("net: placas limpias", Net.plates().every(function (t) { return t.label !== "Prueba UA"; }), "");
    } catch (e) { T("net", false, e.message); }
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
        try { testSave(); testCollisions(); testMinimap(); testAccount(); testNet(); }
        catch (e) { T("suite", false, e.message); }
        Promise.all([testPwa(), testCloud(), testGlb(), testTownGlb(), testJump()]).then(finish);
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
