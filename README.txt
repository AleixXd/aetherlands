AETHERLANDS - Éterlands: la saga del Aetherbound
RPG 3D en el navegador
==================================================

Un RPG de mundo abierto completo en 3D (Three.js), 100% estático:
sin servidor, sin build, sin dependencias externas. Se juega abriendo
index.html en el navegador (Chrome/Edge/Firefox) o en la misma red
con el servidor local incluido.

Este mismo manual puedes descargarlo con un clic desde el menú de
pausa del juego (botón "DESCARGAR MANUAL").


COMO JUGAR (3 opciones)
-----------------------

1) Solo, sin instalar nada
   Doble clic en index.html. Se abre en el navegador.
   Guarda en localStorage.

2) En tu red (LAN, móvil incluido)
   Ejecuta servir.ps1 y abre http://<IP-del-PC>:8080 desde cualquier
   dispositivo de la misma red (TV, móvil, otro PC). Ver "Red local".

3) Publicar online gratis
   Arrastra la carpeta a Netlify Drop (app.netlify.com/drop) o a
   GitHub Pages / Vercel. Es 100% estático.

Requisito: cualquier navegador moderno (WebGL). No necesita Node,
npm ni build.


CONTROLES
---------

  Tecla                         Acción
  ----------------------------  ---------------------------------------
  Clic en el mundo              Capturar el ratón para mirar (Esc lo
                                libera y abre pausa)
  WASD / flechas                Moverse respecto a la cámara (la cámara
                                gira con el ratón)
  Espacio                       Saltar
  Shift                         Dash (esquivar corto, gasta resistencia)
  X                             Andar despacio
  Ratón izquierdo               Atacar con el arma
  Ratón derecho o Q             Bloquear (gasta resistencia)
  1 2 3                         Habilidades de clase
  5 o H                         Poción de vida
  E                             Interactuar (NPCs, tiendas, cofres,
                                portales, minerales)
  Tab                           Panel de estadísticas / atributos
  L                             Registro de misiones
  Esc o P                       Pausa (y cerrar paneles)
  M                             Montar / desmontar

Minimapa arriba a la derecha. Barra de vida/resistencia/XP arriba a
la izquierda.


AJUSTES (menú de pausa)
-----------------------

Desde Pausa → AJUSTES puedes cambiar, con aplicación al instante y
guardado automático:

  - Sonido: activar/desactivar todo el audio.
  - Volumen: 0-100%.
  - Sensibilidad del ratón: 30-200%.
  - Calidad gráfica: Baja / Media / Alta (resolución interna,
    distancia de dibujado y tamaño de sombras).
  - Sombras: activar/desactivar.
  - Partículas: activar/desactivar (mejora el rendimiento).
  - RESTAURAR: vuelve a los valores por defecto.

El botón DESCARGAR MANUAL de ese mismo menú guarda este archivo
(Aetherlands_Manual.txt) en tu equipo para leerlo cuando quieras.


EL MUNDO - «Veran Spire y los páramos»
---------------------------------------

- Mundo abierto (7200×7200) con biomas: llanuras, bosque, desierto,
  tundra, ciénaga, volcán.
- Pueblo central: NPCs, tiendas (armas/armaduras/pociones),
  alquimista, herrero, monturas.
- Villas extensibles: 6 aldeas con misiones de incursión.
- Castillo Veranth: 100 pisos de mazmorra secuencial, jefes cada 10,
  temas que cambian (Árida → Carmesí → Sombrío → Obsidiana).
- Cuevas minables: 5 cuevas con minerales (cobre, hierro, plata,
  aether).
- 6 jefes de élite en arenas abiertas + jefes guarida en el castillo.
- Arena PvP con consentimiento mutuo de ambos jugadores.
- Ciclo día/noche, minimapa, renderizado por chunks (rendimiento OK
  en portátiles).


COMBATE Y PROGRESO
-------------------

- 4 clases: Guerrero, Mago, Pícaro, Paladín con armas y habilidades
  propias.
- Stats: FUE/AGI/VIT/MAG/SPR + punto de habilidad por nivel;
  distribúyelos en Tab.
- Golpes cuerpo a cuerpo con arcos, proyectiles, dash con
  resistencia.
- Monedas, cristales, gacha con pity (garantía cada N tiradas) y
  tasas visibles.
- Salvado automático (localStorage) + botón EXPORTAR GUARDADO en
  Pausa (JSON) para cambiar de navegador.


ESTRUCTURA
----------

  index.html            Entrada del juego
  README.txt            Este manual (también en el menú de pausa)
  css/style.css         Estilos del HUD
  servir.ps1            Servidor local para la red (LAN)
  js/lib/three.min.js   Motor 3D (Three.js r160) [vendido, offline]
  js/core/config.js     Ajustes y fórmulas
  js/core/data.js       Clases, ítems, enemigos, misiones, NPCs, tiendas
  js/core/input.js      Teclado y ratón
  js/core/sound.js      Efectos de sonido sintetizados (WebAudio)
  js/core/save.js       Guardado (localStorage) + export/import JSON
  js/core/manual.js     Texto de este manual dentro del juego
  js/core/settings.js   Ajustes (audio, gráfica, cámara)
  js/core/utils.js      Utilidades matemáticas y de color
  js/world.js           Terreno, biomas, POIs, día/noche, chunks
  js/build.js           Poblado, castillo, aldeas, cuevas, arenas
  js/enemies.js         Director de enemigos + IA (melee/a distancia/boss)
  js/player.js          Control del jugador + combate + progreso
  js/castle.js          100 pisos, jefes, portales
  js/caves.js           Cuevas y minería
  js/quests.js          Sistema de misiones
  js/inventory.js       Inventario/equipo/monturas
  js/effects.js         Partículas, números de daño, proyectiles
  js/ui.js              HUD, paneles, avisos, minimapa
  js/game.js            Orquestador: escena, bucle, cámara, regiones


RED LOCAL (servir.ps1)
----------------------

1. Abre PowerShell en esta carpeta.
2. Ejecuta: powershell -ExecutionPolicy Bypass -File servir.ps1
   (o haz doble clic).
3. Verás la IP del PC (ej. 192.168.1.45). En cualquier dispositivo
   de la misma red abre: http://192.168.1.45:8080

Notas:
- Solo funcional en tu red (el router no lo expone a Internet).
- Windows pedirá permiso de firewall la primera vez → acepta en
  redes privadas.
- Si usas WSL o un móvil, comprueba que ambos estén en la misma
  red WiFi.


PUBLICAR ONLINE (Netlify)
-------------------------

1. Ve a app.netlify.com/drop
2. Arrastra toda la carpeta (index.html + css + js).
3. Listo: tu URL https://xxxx.netlify.app. Guardado y todo incluido.

Nada de esto requiere build (raíz "/", scripts en orden de carga,
sin módulos ES).


REQUISITOS Y NOTAS TÉCNICAS
---------------------------

- Three.js r160 local (js/lib/three.min.js) — funcional sin conexión.
- Sonido: WebAudio sintetizado (sin ficheros). Algunos navegadores
  requieren un clic para habilitar el audio: elige tu clase al
  arrancar y listo.
- Guardado: localStorage con clave ael_save_v1. Puedes exportarlo
  desde el menú de pausa.
- Rendimiento: chunks + niveles de detalle; si va lento, baja la
  Calidad gráfica en Ajustes (Pausa → AJUSTES).

Hecho en "Default Project" — Aetherlands. Diviértete.
