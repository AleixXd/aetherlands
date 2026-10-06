/* glb.js — caché compartida de modelos GLTF (KayKit).
   Carga cada modelo una sola vez (escena fuente) y entrega copias
   listas para escena con SkeletonUtils (clona esqueletos también).
   Requiere: THREE, window.GLTFLoader (bootstrap módulo en index.html),
   window.SkeletonUtils (js/lib/SkeletonUtils.js). */
const GLBCache = {
  entries: {},  // url -> { scene, animations }
  pending: {},  // url -> Promise<entry|null>

  // Promesa de la entrada cruda (una sola carga/parseo por url)
  load(url) {
    if (this.entries[url]) return Promise.resolve(this.entries[url]);
    if (this.pending[url]) return this.pending[url];
    const p = new Promise((resolve) => {
      const start = () => {
        if (!window.GLTFLoader) { resolve(null); return; }
        const loader = new window.GLTFLoader();
        loader.load(url,
          (gltf) => {
            const entry = { scene: gltf.scene, animations: gltf.animations || [] };
            this.entries[url] = entry;
            delete this.pending[url];
            resolve(entry);
          },
          undefined,
          (err) => {
            console.warn("[GLB] carga fallida:", url, err && (err.message || err));
            delete this.pending[url];
            resolve(null);
          });
      };
      if (window.GLTFLoader) start();
      else window.addEventListener("gltfloader-ready", start, { once: true });
    });
    this.pending[url] = p;
    return p;
  },

  // Copia lista para añadir a escena (clona mallas esqueléticas)
  instance(url) {
    return this.load(url).then((entry) => {
      if (!entry) return null;
      const root = window.SkeletonUtils
        ? window.SkeletonUtils.clone(entry.scene)
        : entry.scene.clone(true);
      return { root: root, animations: entry.animations };
    });
  },
};
