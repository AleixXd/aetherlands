/* ============================================================
   postfx.js — postprocesado artesanal (sin addons de three.js)
   Pipeline: escena -> RT HDR lineal (MSAA x4 + depth) ->
   bright-pass -> blur gaussiano ping-pong (1/2 y 1/4 res) ->
   SSAO opcional desde la textura de profundidad ->
   composite final con ACES + sRGB manuales.
   ============================================================ */
const PostFX = {
  renderer: null,
  scene: null,
  camera: null,
  inited: false,
  active: false,
  failed: false,
  bloom: true,
  ssao: false,

  threshold: 0.95,       // luminancia mínima para brillar
  knee: 0.5,
  strength: 0.85,       // peso del bloom a media resolución
  wide: 1.05,           // peso del bloom anchored (1/4 res)
  aoStrength: 0.5,
  aoRadius: 0.6,
  aoBias: 0.045,

  _w: 0, _h: 0, _frames: 0, _dirty: true,
  rtScene: null, rtBright: null, rtBlurA: null, rtBlurB: null,
  rtWideA: null, rtWideB: null, rtAO: null, rtAO2: null,

  init(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    try {
      this._initQuad();
      this._initMaterials();
      this.inited = true;
      this.failed = false;
      this._dirty = true;
      this.active = this.bloom || this.ssao;
    } catch (e) {
      console.warn("PostFX.init", e);
      this.failed = true;
      this.active = false;
    }
  },

  setQuality(q) {
    this.bloom = !!q.bloom;
    this.ssao = !!q.ssao;
    if (this.inited && !this.failed) {
      this.active = this.bloom || this.ssao;
      if (this.ssao && !this.rtAO) this._dirty = true;
    }
  },

  setSize() { this._dirty = true; },

  /* ---------------- geometría a pantalla completa ---------------- */
  _initQuad() {
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quadScene = new THREE.Scene();
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this._quad.frustumCulled = false;
    this._quadScene.add(this._quad);
    this._size = new THREE.Vector2();
  },

  _initMaterials() {
    const VERT = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

    this.mBright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 1.05 }, uKnee: { value: 0.5 } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uThreshold; uniform float uKnee;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float br = max(c.r, max(c.g, c.b));
          float k = max(uKnee, 1e-4);
          float soft = clamp(br - uThreshold + k, 0.0, 2.0 * k);
          soft = soft * soft / (4.0 * k);
          float w = max(soft, br - uThreshold) / max(br, 1e-4);
          gl_FragColor = vec4(c * clamp(w, 0.0, 1.0), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.mBlur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uDir;
        varying vec2 vUv;
        void main(){
          vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
          s += (texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb +
                texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
          s += (texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb +
                texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
          gl_FragColor = vec4(s, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    // kernel hemisférico (8 muestras) para SSAO
    const kernel = [];
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 0.9 + 0.1);
      v.normalize().multiplyScalar(0.3 + 0.7 * (i / 7));
      kernel.push(v);
    }
    this.mAO = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uProj: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 64, 1 / 64) },
        uRadius: { value: 0.85 },
        uBias: { value: 0.035 },
        uKernel: { value: kernel },
      },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDepth;
        uniform mat4 uProj; uniform mat4 uProjInv;
        uniform vec2 uTexel; uniform float uRadius; uniform float uBias;
        uniform vec3 uKernel[8];
        varying vec2 vUv;
        vec3 viewPos(vec2 uv, float d){
          vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 p = uProjInv * ndc;
          return p.xyz / p.w;
        }
        vec3 hash33(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yxz + 33.33);
          return fract((p3.xxy + p3.yzz) * p3.zyx) * 2.0 - 1.0;
        }
        void main(){
          float d = texture2D(tDepth, vUv).x;
          if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }
          vec3 vp = viewPos(vUv, d);
          vec3 dx = dFdx(vp), dy = dFdy(vp);
          vec3 n = normalize(cross(dx, dy));
          if (dot(n, vp) > 0.0) n = -n;
          vec3 rnd = hash33(vUv / uTexel);
          vec3 tt = normalize(rnd - n * dot(rnd, n));
          if (dot(tt, tt) < 1e-5) tt = vec3(1.0, 0.0, 0.0);
          vec3 bb = cross(n, tt);
          mat3 TBN = mat3(tt, bb, n);
          float occ = 0.0;
          for (int i = 0; i < 8; i++) {
            vec3 sp = vp + TBN * uKernel[i] * uRadius;
            vec4 op = uProj * vec4(sp, 1.0);
            vec2 suv = op.xy / op.w * 0.5 + 0.5;
            if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
            float sd = texture2D(tDepth, suv).x;
            vec3 ss = viewPos(suv, sd);
            float range = smoothstep(0.0, 1.0, uRadius / max(abs(vp.z - ss.z), 1e-4));
            occ += step(uBias, ss.z - vp.z) * range;
          }
          float ao = clamp(1.0 - occ / 8.0, 0.0, 1.0);
          gl_FragColor = vec4(vec3(ao), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.mComposite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        tWide: { value: null }, tAO: { value: null },
        uBloom: { value: 0.85 }, uWide: { value: 1.05 },
        uAO: { value: 0.75 }, uExposure: { value: 1.05 },
        uUseBloom: { value: 1 }, uUseAO: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tScene; uniform sampler2D tBloom;
        uniform sampler2D tWide; uniform sampler2D tAO;
        uniform float uBloom; uniform float uWide; uniform float uAO;
        uniform float uExposure; uniform float uUseBloom; uniform float uUseAO;
        varying vec2 vUv;
        vec3 fxRRT(vec3 v){
          vec3 a = v * (v + 0.0245786) - 0.000090537;
          vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
          return a / b;
        }
        vec3 fxAces(vec3 color){
          const mat3 ACESInputMat = mat3(
            vec3(0.59719, 0.07600, 0.02840),
            vec3(0.35458, 0.90834, 0.13383),
            vec3(0.04823, 0.01566, 0.83777));
          const mat3 ACESOutputMat = mat3(
            vec3(1.60475, -0.10208, -0.00327),
            vec3(-0.53108, 1.10813, -0.07276),
            vec3(-0.07367, -0.00605, 1.07602));
          color *= uExposure / 0.6;
          color = ACESInputMat * color;
          color = fxRRT(color);
          color = ACESOutputMat * color;
          return clamp(color, 0.0, 1.0);
        }
        vec3 fxSRGB(vec3 value){
          return mix(pow(value, vec3(0.41666)) * 1.055 - vec3(0.055),
                     value * 12.92,
                     vec3(lessThanEqual(value, vec3(0.0031308))));
        }
        void main(){
          vec3 col = texture2D(tScene, vUv).rgb;
          if (uUseAO > 0.5) {
            float ao = texture2D(tAO, vUv).r;
            col *= mix(1.0, ao, uAO);
          }
          if (uUseBloom > 0.5) {
            col += texture2D(tBloom, vUv).rgb * uBloom;
            col += texture2D(tWide, vUv).rgb * uWide;
          }
          col = fxAces(col);
          gl_FragColor = vec4(fxSRGB(col), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  },

  /* ---------------- render targets ---------------- */
  _alloc(w, h) {
    this._dispose();
    this._w = w; this._h = h;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    const mk = (ww, hh2) => {
      const rt = new THREE.WebGLRenderTarget(ww, hh2, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      });
      rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
      return rt;
    };
    // escena: HDR lineal + MSAA + profundidad
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true, stencilBuffer: false,
    });
    this.rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.rtScene.depthTexture = depth;
    this.rtBright = mk(hw, hh);
    this.rtBlurA = mk(hw, hh);
    this.rtBlurB = mk(hw, hh);
    this.rtWideA = mk(qw, qh);
    this.rtWideB = mk(qw, qh);
    if (this.ssao) { this.rtAO = mk(hw, hh); this.rtAO2 = mk(hw, hh); }
  },

  _dispose() {
    const list = [this.rtScene, this.rtBright, this.rtBlurA, this.rtBlurB,
      this.rtWideA, this.rtWideB, this.rtAO, this.rtAO2];
    for (const rt of list) if (rt) rt.dispose();
    this.rtScene = this.rtBright = this.rtBlurA = this.rtBlurB = null;
    this.rtWideA = this.rtWideB = this.rtAO = this.rtAO2 = null;
  },

  _pass(mat, target) {
    this._quad.material = mat;
    this.renderer.setRenderTarget(target || null);
    this.renderer.render(this._quadScene, this._quadCam);
  },

  /* ---------------- pasos ---------------- */
  _bloomPasses() {
    const hw = this.rtBright.width, hh = this.rtBright.height;
    const qw = this.rtWideA.width, qh = this.rtWideA.height;
    let u = this.mBright.uniforms;
    u.tDiffuse.value = this.rtScene.texture;
    u.uThreshold.value = this.threshold;
    u.uKnee.value = this.knee;
    this._pass(this.mBright, this.rtBright);

    u = this.mBlur.uniforms;
    u.tDiffuse.value = this.rtBright.texture; u.uDir.value.set(1 / hw, 0);
    this._pass(this.mBlur, this.rtBlurA);
    u.tDiffuse.value = this.rtBlurA.texture; u.uDir.value.set(0, 1 / hh);
    this._pass(this.mBlur, this.rtBlurB);
    u.tDiffuse.value = this.rtBlurB.texture; u.uDir.value.set(1.6 / hw, 0);
    this._pass(this.mBlur, this.rtBlurA);
    u.tDiffuse.value = this.rtBlurA.texture; u.uDir.value.set(0, 1.6 / hh);
    this._pass(this.mBlur, this.rtBlurB);
    // halo ancho a 1/4 resolución
    u.tDiffuse.value = this.rtBlurB.texture; u.uDir.value.set(1 / qw, 0);
    this._pass(this.mBlur, this.rtWideA);
    u.tDiffuse.value = this.rtWideA.texture; u.uDir.value.set(0, 1 / qh);
    this._pass(this.mBlur, this.rtWideB);
    u.tDiffuse.value = this.rtWideB.texture; u.uDir.value.set(2 / qw, 0);
    this._pass(this.mBlur, this.rtWideA);
    u.tDiffuse.value = this.rtWideA.texture; u.uDir.value.set(0, 2 / qh);
    this._pass(this.mBlur, this.rtWideB);
  },

  _aoPass() {
    const u = this.mAO.uniforms;
    u.tDepth.value = this.rtScene.depthTexture;
    u.uProj.value.copy(this.camera.projectionMatrix);
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uTexel.value.set(1 / this.rtAO.width, 1 / this.rtAO.height);
    u.uRadius.value = this.aoRadius;
    u.uBias.value = this.aoBias;
    this._pass(this.mAO, this.rtAO);
    // desenfoque para eliminar el ruido del hash
    const ub = this.mBlur.uniforms;
    const w = this.rtAO.width, h = this.rtAO.height;
    ub.tDiffuse.value = this.rtAO.texture; ub.uDir.value.set(1 / w, 0);
    this._pass(this.mBlur, this.rtAO2);
    ub.tDiffuse.value = this.rtAO2.texture; ub.uDir.value.set(0, 1 / h);
    this._pass(this.mBlur, this.rtAO);
  },

  /* ---------------- bucle ---------------- */
  render() {
    const r = this.renderer;
    if (!this.inited || this.failed || !this.active) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    try {
      r.getDrawingBufferSize(this._size);
      if (this._dirty || this._size.x !== this._w || this._size.y !== this._h) {
        this._alloc(Math.max(1, this._size.x | 0), Math.max(1, this._size.y | 0));
        this._dirty = false;
      }
      // 1) escena -> RT HDR lineal (three no aplica tonemapping en RT)
      r.setRenderTarget(this.rtScene);
      r.render(this.scene, this.camera);
      // 2) bloom + SSAO
      if (this.bloom) this._bloomPasses();
      if (this.ssao && this.rtAO) this._aoPass();
      // 3) composite a pantalla con ACES + sRGB manuales
      const u = this.mComposite.uniforms;
      u.tScene.value = this.rtScene.texture;
      u.tBloom.value = this.rtBlurB.texture;
      u.tWide.value = this.rtWideB.texture;
      u.tAO.value = this.rtAO ? this.rtAO.texture : null;
      u.uBloom.value = this.strength;
      u.uWide.value = this.wide;
      u.uAO.value = this.aoStrength;
      u.uUseBloom.value = this.bloom ? 1 : 0;
      u.uUseAO.value = (this.ssao && this.rtAO) ? 1 : 0;
      u.uExposure.value = r.toneMappingExposure || 1.0;
      this._pass(this.mComposite, null);
      // control de errores del pipeline (una sola vez)
      this._frames++;
      if (this._frames === 2) {
        const err = r.getContext().getError();
        if (err) {
          console.warn("PostFX: error GL " + err + ", se usa el render directo");
          this.failed = true;
          this.active = false;
        }
      }
    } catch (e) {
      console.warn("PostFX.render", e);
      this.failed = true;
      this.active = false;
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
    }
  },
};
