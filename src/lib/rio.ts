// Escena bajo el agua del río Toltén.
// Los peces son fotos reales recortadas, montadas en mallas que se doblan con una onda de nado
// (la onda avanza de la cabeza a la cola), con volumen y luz calculados desde un mapa de grosor.
// Arriba de la línea de agua se ve una foto real del río (toma "over-under").
import * as THREE from 'three';

export type Especie = { id: string; img: string; alto: string; tam: number };
type Tono = { arriba: string; abajo: string; rayo: string };

export interface Rio {
  /** linea: altura de la superficie en pantalla (0 abajo, 1 arriba). especie: 0..n-1 con decimales. */
  estado: { linea: number; linea0: number; especie: number; fondo: number; pose: { x: number; y: number; escala: number } };
  activo: (v: boolean) => void;
  listo: Promise<void>;
  /** se llama en cada cuadro justo antes de dibujar, con el alto del lienzo en px */
  alCuadro?: (estado: Rio['estado'], alto: number) => void;
}

const TONOS: Tono[] = [
  { arriba: '#3f8e86', abajo: '#05201f', rayo: '#cdf3e2' },
  { arriba: '#6a8452', abajo: '#10180a', rayo: '#f3d79a' },
  { arriba: '#2c7088', abajo: '#031019', rayo: '#b4e2f2' },
];

const CAUSTICAS = /* glsl */ `
  float causticas(vec2 p, float t) {
    vec2 i = p; float c = 1.0; float k = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / k), p.y / (cos(i.y + tt) / k)));
    }
    c /= 4.0; c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }`;

// ---------- pez ----------
const pezVert = /* glsl */ `
  uniform sampler2D uAlto;
  uniform float uAmp, uFrec, uFase, uGrosor, uDir;
  varying vec2 vUv; varying float vPend; varying vec3 vMundo; varying float vAlto;
  void main() {
    float u = uDir > 0.0 ? uv.x : 1.0 - uv.x;
    vUv = vec2(u, uv.y);
    float s = u; // 0 cola, 1 hocico
    float h = texture2D(uAlto, vUv).r;
    vAlto = h;
    float cola = pow(1.0 - s, 1.7);
    float env = uAmp * (0.04 + cola);
    float ph = uFrec * s * 6.2831853 + uFase;
    float lat = env * sin(ph);
    float dEnv = -uAmp * 1.7 * pow(max(1.0 - s, 0.0001), 0.7);
    vPend = (dEnv * sin(ph) + env * cos(ph) * uFrec * 6.2831853) * uDir;
    vec3 p = position;
    p.z += h * uGrosor + lat;
    p.x -= uDir * env * 0.18 * (1.0 - cos(ph)); // al doblarse, la cola se acorta un poco
    vec4 w = modelMatrix * vec4(p, 1.0);
    vMundo = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const pezFrag = /* glsl */ `
  uniform sampler2D uMapa, uAlto;
  uniform vec3 uAgua, uLuz;
  uniform float uNiebla, uT, uGrosor, uDir, uAspecto, uLinea, uResY, uOpacidad;
  varying vec2 vUv; varying float vPend; varying vec3 vMundo; varying float vAlto;
  ${CAUSTICAS}
  void main() {
    if (gl_FragCoord.y / uResY > uLinea) discard;
    vec4 c = texture2D(uMapa, vUv);
    if (c.a < 0.03) discard;
    vec2 e = vec2(1.0 / 512.0, 1.0 / (512.0 * uAspecto));
    float dhu = (texture2D(uAlto, vUv + vec2(e.x, 0.0)).r - texture2D(uAlto, vUv - vec2(e.x, 0.0)).r) / (2.0 * e.x);
    float dhv = (texture2D(uAlto, vUv + vec2(0.0, e.y)).r - texture2D(uAlto, vUv - vec2(0.0, e.y)).r) / (2.0 * e.y);
    vec3 n = normalize(vec3(-(uGrosor * dhu * uDir + vPend), -(uGrosor * dhv / uAspecto), 1.0));
    vec3 L = normalize(vec3(0.2 * uDir, 1.0, 0.6));
    float dif = max(dot(n, L), 0.0);
    vec3 col = c.rgb * (0.66 + 0.5 * dif);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float cuerpo = smoothstep(0.12, 0.5, vAlto);
    col += uLuz * pow(max(dot(n, H), 0.0), 30.0) * 0.2 * cuerpo;
    float ca = causticas(vec2(vMundo.x * 1.5, vMundo.z * 1.5 + vMundo.y * 0.9) + 17.0, uT * 0.8);
    col += uLuz * ca * 0.2 * smoothstep(-0.3, 0.9, n.y) * cuerpo;
    // el agua se come el rojo y tiñe hacia el color del río
    col = mix(col, col * vec3(0.8, 0.96, 1.0) + uAgua * 0.06, 0.65);
    col = mix(col, uAgua, uNiebla);
    float a = c.a * mix(0.8, 1.0, smoothstep(0.02, 0.2, vAlto)) * uOpacidad;
    gl_FragColor = vec4(col, a);
  }`;

// ---------- fondo: superficie, agua y lecho de piedras ----------
const fondoVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fondoFrag = /* glsl */ `
  uniform float uT, uAspect, uLinea, uLinea0, uFotoAsp, uResY, uHorizonte, uFotoListo;
  uniform sampler2D uFoto;
  uniform vec3 uArriba, uAbajo, uRayo;
  varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 h22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  vec3 voronoi(vec2 x) {
    vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)); vec2 r = g + h22(n + g) - f; float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
    float me = 8.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j)); vec2 r = g + h22(n + g) - f;
      if (dot(mr - r, mr - r) > 0.00001) me = min(me, dot(0.5 * (mr + r), normalize(r - mr)));
    }
    return vec3(sqrt(md), me, h21(n + mg));
  }
  vec3 paleta(float h) {
    vec3 c = mix(vec3(0.33, 0.32, 0.28), vec3(0.24, 0.23, 0.2), smoothstep(0.0, 0.35, h));
    c = mix(c, vec3(0.43, 0.37, 0.28), smoothstep(0.35, 0.6, h));
    c = mix(c, vec3(0.3, 0.33, 0.27), smoothstep(0.6, 0.85, h));
    return mix(c, vec3(0.38, 0.29, 0.24), smoothstep(0.85, 1.0, h));
  }
  // canto rodado: piedra redonda dentro de cada celda, con sombra de domo
  vec4 canto(vec2 fp, float esc, float sem) {
    vec3 v = voronoi(fp * esc + sem);
    float r = 0.3 + 0.2 * h21(vec2(v.z, 4.7 + sem));
    float m = 1.0 - smoothstep(r - 0.1, r, v.x);
    vec3 c = paleta(v.z) * (0.45 + 0.7 * (1.0 - clamp(v.x / r, 0.0, 1.0)));
    return vec4(c, m);
  }
  ${CAUSTICAS}
  void main() {
    vec2 uv = vUv; float t = uT;
    float ax = uv.x * uAspect;
    float linea = uLinea + 0.005 * sin(ax * 9.0 + t * 1.6) + 0.0025 * sin(ax * 23.0 - t * 2.4);
    float prof = max(linea - uv.y, 0.0);

    // agua: más clara cerca de la superficie
    vec3 col = mix(uArriba, uAbajo, smoothstep(0.0, 0.95, prof));
    float x = ax + prof * 0.4;
    float rayos = smoothstep(0.55, 1.0, ruido(vec2(x * 3.0, t * 0.12))) * 0.6 + smoothstep(0.6, 1.0, ruido(vec2(x * 7.0 + 3.0, t * 0.18))) * 0.35;
    col += uRayo * rayos * 0.42 * exp(-prof * 1.8);
    // cara de abajo de la superficie: brillo ondulado
    col += uRayo * 0.32 * exp(-prof * 30.0) * (0.55 + 0.45 * sin(ax * 50.0 + t * 2.0 + sin(ax * 11.0 + t) * 2.0));

    // lecho de piedras y grava con perspectiva
    float hz = uHorizonte;
    if (uv.y < hz + 0.02) {
      float dy = max(hz - uv.y, 0.0);
      float z = 0.08 / (dy + 0.015);
      vec2 fp = vec2((uv.x - 0.5) * uAspect * z * 2.6, z * 2.4);
      // arena de fondo, grava fina y piedras redondas encima
      vec3 lecho = vec3(0.2, 0.19, 0.15) * (0.75 + 0.4 * ruido(fp * 9.0));
      vec4 g = canto(fp, 5.2, 7.0);
      lecho = mix(lecho, g.rgb * 0.8, g.a);
      vec4 pz = canto(fp, 1.7, 0.0);
      lecho = mix(lecho * (1.0 - 0.35 * smoothstep(0.0, 0.25, pz.a)), pz.rgb, pz.a);
      // lo más cercano queda fuera de foco: menos detalle
      lecho = mix(lecho, vec3(0.24, 0.23, 0.19), smoothstep(0.06, 0.22, dy) * 0.3);
      lecho *= 0.8 + 0.35 * ruido(fp * 14.0);
      lecho += uRayo * causticas(fp * 1.1, t * 0.9) * 0.32;
      float niebla = 1.0 - exp(-z * 0.34);
      lecho = mix(lecho * 0.8, col, niebla);
      col = mix(col, lecho, smoothstep(0.0, 0.05, dy));
    }
    col *= 1.0 - 0.32 * length((uv - vec2(0.5, 0.42)) * vec2(0.9, 1.15));

    // sobre el agua: foto real del Toltén (encuadre cover)
    if (uv.y > linea) {
      // la línea de agua corta la foto justo en su propia superficie (qW) y la foto sube con ella
      float qW = 0.4;
      float s = min((1.0 - qW) / max(1.0 - uLinea0, 0.2), uFotoAsp / uAspect);
      vec2 q = vec2(0.5 + (uv.x - 0.5) * uAspect * s / uFotoAsp, qW + (uv.y - uLinea) * s);
      float cerca = smoothstep(0.04, 0.0, uv.y - linea);
      q.x += sin(ax * 40.0 + t * 2.2) * 0.0025 * cerca;
      vec3 foto = pow(texture2D(uFoto, clamp(q, 0.001, 0.999)).rgb, vec3(0.88)); // un poco más de luz de día
      foto *= mix(0.62, 1.0, smoothstep(1.0, 0.6, uv.y)); // más oscuro arriba, bajo el menú
      foto *= mix(0.6, 1.0, smoothstep(0.0, 0.68, uv.x * min(uAspect, 1.7) / 1.7)); // y a la izquierda, detrás del titular
      foto = mix(foto, foto * vec3(0.85, 1.0, 1.02), 0.3);
      col = mix(vec3(0.05, 0.12, 0.13), foto, uFotoListo);
      col = mix(col, uRayo, cerca * 0.18);
    }
    // menisco: línea brillante y sombra fina bajo la superficie
    float dl = (uv.y - linea) * uResY;
    col = mix(col, vec3(0.92, 1.0, 0.97), 0.6 * exp(-abs(dl) / 1.6));
    col *= 1.0 - 0.35 * exp(-max(-dl, 0.0) / 6.0) * step(dl, 0.0);
    gl_FragColor = vec4(col, 1.0);
  }`;

// ---------- sedimento que arrastra la corriente ----------
const motaVert = /* glsl */ `
  uniform float uT, uEsc; attribute float aTam; attribute float aVel;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x = mod(p.x - uT * aVel + 12.0, 24.0) - 12.0;
    p.y += sin(uT * 0.4 + position.x) * 0.15;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aTam * uEsc / -mv.z;
    vA = clamp(1.0 - (-mv.z - 4.0) / 18.0, 0.15, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;
const motaFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uLinea, uResY; varying float vA;
  void main() {
    if (gl_FragCoord.y / uResY > uLinea - 0.01) discard;
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * 0.55 * vA);
  }`;

let semilla = 7;
const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function crearRio(canvas: HTMLCanvasElement, especies: Especie[], foto: string): Rio {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  const movil = matchMedia('(max-width: 767px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, movil ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  camara.position.set(0, 0, 9);
  escena.add(camara);

  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const carga = new THREE.TextureLoader();
  const tex = (url: string, color = true) => new Promise<THREE.Texture>((ok) => carga.load(url, (t) => {
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter; ok(t);
  }));

  // fondo
  const uniFondo = {
    uT: { value: 0 }, uAspect: { value: 1 }, uLinea: { value: 0.52 }, uLinea0: { value: 0.52 }, uFotoAsp: { value: 1.5 },
    uResY: { value: 1 }, uHorizonte: { value: 0.18 }, uFotoListo: { value: 0 }, uFoto: { value: null as THREE.Texture | null },
    uArriba: { value: new THREE.Color(TONOS[0].arriba) }, uAbajo: { value: new THREE.Color(TONOS[0].abajo) }, uRayo: { value: new THREE.Color(TONOS[0].rayo) },
  };
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: uniFondo, vertexShader: fondoVert, fragmentShader: fondoFrag, depthWrite: false, depthTest: false }));
  fondo.position.z = -60; fondo.renderOrder = -10; fondo.frustumCulled = false;
  camara.add(fondo);
  const pFoto = tex(foto).then((t) => { uniFondo.uFoto.value = t; uniFondo.uFotoAsp.value = (t.image as HTMLImageElement).width / (t.image as HTMLImageElement).height; });

  // sedimento
  const NP = movil ? 260 : 520;
  const pos = new Float32Array(NP * 3), tam = new Float32Array(NP), vel = new Float32Array(NP);
  for (let i = 0; i < NP; i++) { pos[i * 3] = (rnd() - 0.5) * 24; pos[i * 3 + 1] = (rnd() - 0.5) * 9; pos[i * 3 + 2] = -rnd() * 16 + 3; tam[i] = 0.012 + rnd() * 0.034; vel[i] = 0.15 + rnd() * 0.35; }
  const gP = new THREE.BufferGeometry();
  gP.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  gP.setAttribute('aTam', new THREE.BufferAttribute(tam, 1));
  gP.setAttribute('aVel', new THREE.BufferAttribute(vel, 1));
  const uniMota = { uT: { value: 0 }, uEsc: { value: 1 }, uColor: { value: new THREE.Color('#dff3e8') }, uLinea: uniFondo.uLinea, uResY: uniFondo.uResY };
  const motas = new THREE.Points(gP, new THREE.ShaderMaterial({ uniforms: uniMota, vertexShader: motaVert, fragmentShader: motaFrag, transparent: true, depthWrite: false }));
  motas.frustumCulled = false;
  escena.add(motas);

  // peces
  type Pez = { malla: THREE.Mesh; uni: Record<string, THREE.IUniform>; aspecto: number; fase: number };
  const agua = new THREE.Color(TONOS[0].arriba).lerp(new THREE.Color(TONOS[0].abajo), 0.45);
  const crearPez = (mapa: THREE.Texture, alto: THREE.Texture, niebla: number, dir = 1): Pez => {
    const img = mapa.image as HTMLImageElement;
    const aspecto = img.height / img.width;
    const geo = new THREE.PlaneGeometry(1, aspecto, movil ? 90 : 140, movil ? 16 : 24);
    const uni = {
      uMapa: { value: mapa }, uAlto: { value: alto }, uAmp: { value: 0.055 }, uFrec: { value: 0.85 }, uFase: { value: rnd() * 6 },
      uGrosor: { value: 0.075 }, uDir: { value: dir }, uAgua: { value: agua }, uLuz: { value: uniFondo.uRayo.value },
      uNiebla: { value: niebla }, uT: uniFondo.uT, uAspecto: { value: aspecto }, uLinea: uniFondo.uLinea, uResY: uniFondo.uResY, uOpacidad: { value: 1 },
    };
    const malla = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: pezVert, fragmentShader: pezFrag, transparent: true, depthWrite: false }));
    malla.frustumCulled = false;
    escena.add(malla);
    return { malla, uni, aspecto, fase: rnd() * 6 };
  };

  const principales: Pez[] = [];
  type Lejano = Pez & { z: number; y: number; x: number; vel: number; dir: number; largo: number; vaiven: number };
  const cardumen: Lejano[] = [];
  const listo = Promise.all([pFoto, ...especies.map((e) => Promise.all([tex(e.img), tex(e.alto, false)]))]).then((r) => {
    const texturas = r.slice(1) as [THREE.Texture, THREE.Texture][];
    // peces lejanos primero para que queden detrás
    const N = movil ? 4 : 8;
    for (let i = 0; i < N; i++) {
      const dir = rnd() > 0.35 ? 1 : -1;
      const z = -3 - rnd() * 12;
      const [m, a] = texturas[i % 3 === 2 ? 0 : i % 3];
      const p = crearPez(m, a, Math.min(0.85, 0.35 + (-z - 3) / 16), dir) as Lejano;
      Object.assign(p, { z, y: -1.1 + rnd() * 2.6, x: (rnd() - 0.5) * 14, vel: 0.25 + rnd() * 0.35, dir, largo: 1.3 + rnd() * 0.9, vaiven: rnd() * 6 });
      p.malla.renderOrder = -5 + z * 0.01;
      cardumen.push(p);
    }
    texturas.forEach(([m, a]) => { const p = crearPez(m, a, 0.06); p.malla.renderOrder = 2; principales.push(p); });
    uniFondo.uFotoListo.value = 1;
  });

  // ---------- estado ----------
  const estado: Rio['estado'] = { linea: 0.52, linea0: 0.52, especie: 0, fondo: 0.18, pose: { x: 0.64, y: 0.68, escala: 1 } };
  let corriendo = true, pedido = false;
  const rio: Rio = { estado, activo: (v) => { corriendo = v; if (v) bucle(); }, listo };

  let W = 1, H = 1;
  const medir = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false);
    camara.aspect = W / H; camara.updateProjectionMatrix();
    const alto = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * 60;
    fondo.scale.set(alto * camara.aspect * 1.02, alto * 1.02, 1);
    uniFondo.uAspect.value = camara.aspect;
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    uniFondo.uResY.value = buf.y;
    uniMota.uEsc.value = buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)));
  };
  medir(); addEventListener('resize', medir);

  const raton = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!quieto) addEventListener('pointermove', (e) => { raton.x = e.clientX / innerWidth - 0.5; raton.y = e.clientY / innerHeight - 0.5; });

  function bucle() {
    if (pedido) return; pedido = true;
    requestAnimationFrame(() => { pedido = false; if (corriendo) { cuadro(); bucle(); } });
  }

  const reloj = new THREE.Timer();
  const cA = new THREE.Color(), cB = new THREE.Color();
  const tono = (k: keyof Tono, e: number) => { const i = Math.min(TONOS.length - 1, Math.floor(e)), f = e - i; return cA.set(TONOS[i][k]).lerp(cB.set(TONOS[Math.min(TONOS.length - 1, i + 1)][k]), f); };
  let tCarga = -1; // el pez entra nadando al cargar
  let impulso = 0, proxImpulso = 4;

  function cuadro() {
    reloj.update();
    const dt = Math.min(0.05, reloj.getDelta());
    const t = reloj.getElapsed();
    uniFondo.uT.value = t; uniMota.uT.value = quieto ? 0 : t;
    const e = estado.especie;
    uniFondo.uArriba.value.copy(tono('arriba', e)); uniFondo.uAbajo.value.copy(tono('abajo', e)); uniFondo.uRayo.value.copy(tono('rayo', e));
    agua.copy(uniFondo.uArriba.value).lerp(uniFondo.uAbajo.value, 0.5);
    uniFondo.uLinea.value = estado.linea;
    uniFondo.uLinea0.value = estado.linea0;
    uniFondo.uHorizonte.value = estado.fondo;

    const altoV = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * camara.position.z;
    const anchoV = altoV * camara.aspect;
    raton.sx += (raton.x - raton.sx) * 0.04; raton.sy += (raton.y - raton.sy) * 0.04;

    if (principales.length) {
      if (tCarga < 0) tCarga = t;
      const arranque = Math.min(1, (t - tCarga) / 2.4);
      // de vez en cuando el pez da un golpe de cola, como una trucha que corrige su posición en la corriente
      if (!quieto) { proxImpulso -= dt; if (proxImpulso < 0) { impulso = 1; proxImpulso = 5 + rnd() * 6; } }
      impulso = Math.max(0, impulso - dt * 1.6);
      const p = estado.pose;
      const largo = p.escala * Math.min(anchoV * (movil ? 0.74 : 0.42), altoV * 0.95);
      const entrada = (1 - ss(0, 1, arranque)) * anchoV * 0.9;
      principales.forEach((pz, j) => {
        const d = e - j;
        const vis = Math.abs(d) < 1;
        pz.malla.visible = vis;
        if (!vis) return;
        // el pez de la especie actual sale nadando hacia adelante y el siguiente entra por detrás
        const sale = d > 0 ? ss(0.15, 0.85, d) : 0;
        const llega = d < 0 ? ss(0.15, 0.85, -d) : 0;
        const esf = 1 + 1.6 * Math.max(sale > 0 && sale < 1 ? 1 : 0, llega > 0 && llega < 1 ? 1 : 0) + impulso * 1.4;
        const w = (quieto ? 2.2 : 5.2) * esf;
        pz.fase += dt * w;
        pz.uni.uFase.value = pz.fase;
        pz.uni.uAmp.value = (quieto ? 0.03 : 0.05) * (1 + impulso * 0.5);
        const tam = especies[j].tam;
        const L = largo * tam;
        const deriva = quieto ? 0 : Math.sin(t * 0.37 + j) * 0.04 * anchoV;
        const x = (p.x - 0.5) * anchoV + deriva + sale * anchoV * 0.95 - llega * anchoV * 0.95 - (j === 0 ? entrada : 0);
        const y = (0.5 - p.y) * altoV + (quieto ? 0 : Math.sin(t * 0.53 + j * 2) * 0.022 * altoV);
        pz.malla.position.set(x, y, 0);
        pz.malla.scale.setScalar(L);
        pz.malla.rotation.set(0.05 + raton.sy * 0.12, -0.32 + raton.sx * 0.3 + (quieto ? 0 : Math.sin(t * 0.41 + j) * 0.06), (quieto ? 0 : Math.sin(t * 0.5) * 0.025));
        pz.uni.uNiebla.value = 0.05;
      });
    }

    cardumen.forEach((pz) => {
      const prof = camara.position.z - pz.z;
      const anchoZ = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * prof * camara.aspect;
      pz.fase += dt * (quieto ? 1.5 : 3.6 + pz.vel * 4);
      pz.uni.uFase.value = pz.fase;
      if (!quieto) pz.x += pz.dir * pz.vel * dt;
      const borde = anchoZ / 2 + pz.largo;
      if (pz.x > borde) pz.x = -borde; if (pz.x < -borde) pz.x = borde;
      pz.malla.position.set(pz.x, pz.y + Math.sin(t * 0.3 + pz.vaiven) * 0.25, pz.z);
      pz.malla.scale.setScalar(pz.largo);
      pz.malla.rotation.set(0.04, pz.dir * -0.25, 0);
    });

    rio.alCuadro?.(estado, H);
    renderer.render(escena, camara);
  }
  bucle();
  return rio;
}
