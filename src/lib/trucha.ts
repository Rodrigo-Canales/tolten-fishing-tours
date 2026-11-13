// Trucha 3D procedural bajo el agua.
// Cuerpo con perfil dorsal y ventral distintos, piel pintada pixel a pixel (degradados, moteado,
// banda lateral, opérculo, línea lateral, manchas), relieve de escamas, aletas translúcidas con
// radios y ojo con iris. Nada por ondulación y cambia de especie con el scroll.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Modelo 3D real opcional por especie (.glb). Si no hay, se usa el pez procedural. */
export type ModeloEspecie = { archivo?: string; girar?: number; inclinar?: number; largo?: number } | undefined;

export interface Trucha {
  pose: { x: number; y: number; escala: number; giro: number; inclinar: number };
  /** 0 arcoíris, 1 café, 2 chinook (con decimales para la transición) */
  especie: number;
  activo: (v: boolean) => void;
}

let semilla = 11;
const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mezcla = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ruido de valor 2D para el moteado
function crearRuido(seed: number) {
  const P = new Float32Array(256 * 256);
  let s = seed; for (let i = 0; i < P.length; i++) { s = (s * 16807) % 2147483647; P[i] = s / 2147483647; }
  const v = (x: number, y: number) => P[((y & 255) << 8) | (x & 255)];
  const n = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    return (v(xi, yi) * (1 - u) + v(xi + 1, yi) * u) * (1 - w) + (v(xi, yi + 1) * (1 - u) + v(xi + 1, yi + 1) * u) * w;
  };
  return (x: number, y: number) => n(x, y) * 0.55 + n(x * 2.1, y * 2.1) * 0.3 + n(x * 4.3, y * 4.3) * 0.15;
}
const ruido = crearRuido(97);

// ---------- especies ----------
type Piel = {
  lomo: string; flanco: string; vientre: string; banda?: string; bandaFuerza: number;
  manchas: string; manchasRojas?: string; halo?: string; nManchas: number; tamMancha: [number, number];
  manchasVientre: number; aleta: string; aletaManchada: boolean; bordeBlanco: boolean;
};
const PIELES: Piel[] = [
  { // trucha arcoíris
    lomo: '#4b5a34', flanco: '#c7cbb6', vientre: '#f3f1ea', banda: '#d86f78', bandaFuerza: 0.75,
    manchas: '#1c1a12', nManchas: 2600, tamMancha: [1.8, 4.2], manchasVientre: -0.12,
    aleta: '#6f6a4c', aletaManchada: true, bordeBlanco: true,
  },
  { // trucha café
    lomo: '#43331a', flanco: '#b0843e', vientre: '#ecd9a4', bandaFuerza: 0,
    manchas: '#1e1309', manchasRojas: '#b23a28', halo: '#e8d6a8', nManchas: 900, tamMancha: [2.2, 4.6], manchasVientre: -0.3,
    aleta: '#7d5c2c', aletaManchada: false, bordeBlanco: true,
  },
  { // salmón chinook
    lomo: '#2a434c', flanco: '#a9b6b9', vientre: '#f1f2ef', bandaFuerza: 0,
    manchas: '#121819', nManchas: 2200, tamMancha: [1.8, 4.2], manchasVientre: 0.2,
    aleta: '#4a585c', aletaManchada: true, bordeBlanco: false,
  },
];

const TW = 1024, TH = 512;
// u = 0 y 1 lomo, 0.5 vientre, 0.25 y 0.75 flancos. Fila 0 = hocico, TH = cola
function pintarPiel(pl: Piel) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d')!;
  const img = g.createImageData(TW, TH);
  const L = hex(pl.lomo), F = hex(pl.flanco), V = hex(pl.vientre), B = pl.banda ? hex(pl.banda) : F;
  for (let y = 0; y < TH; y++) {
    const s = 1 - y / TH; // 1 cabeza, 0 cola
    for (let x = 0; x < TW; x++) {
      const u = x / TW;
      const h = Math.cos(u * Math.PI * 2);
      const nz = ruido(u * 40, y / 14);
      // degradado vientre, flanco, lomo con borde irregular
      let col = mezcla(V, F, ss(-0.78, -0.25, h + (nz - 0.5) * 0.15));
      col = mezcla(col, L, ss(0.05, 0.7, h + (nz - 0.5) * 0.35));
      // banda rosada a lo largo de la línea lateral
      if (pl.banda) {
        const fuerza = pl.bandaFuerza * Math.exp(-Math.pow((h - 0.02) / 0.2, 2)) * ss(0.02, 0.2, s) * (0.75 + nz * 0.5);
        col = mezcla(col, B, Math.min(1, fuerza));
      }
      // mejilla y opérculo
      if (s > 0.8) {
        const op = Math.exp(-Math.pow((h + 0.1) / 0.5, 2)) * ss(0.8, 0.86, s);
        col = mezcla(col, pl.banda ? B : mezcla(F, V, 0.5), op * 0.55);
      }
      // oscurecer hocico y aclarar levemente el vientre de la cabeza
      if (s > 0.94) col = mezcla(col, L, ss(0.94, 1, s) * 0.5 * ss(-0.3, 0.6, h));
      // moteado fino
      const m = 0.9 + nz * 0.2;
      const i = (y * TW + x) * 4;
      img.data[i] = col[0] * m; img.data[i + 1] = col[1] * m; img.data[i + 2] = col[2] * m; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // borde del opérculo (curva oscura detrás de la cabeza)
  g.strokeStyle = 'rgba(30,26,18,0.55)'; g.lineWidth = 2.2;
  for (const lado of [0.25, 0.75]) {
    g.beginPath();
    for (let k = -1; k <= 1.001; k += 0.05) {
      const u = lado + k * 0.17;
      const y = TH * (0.165 - 0.035 * (1 - k * k));
      k === -1 ? g.moveTo(u * TW, y) : g.lineTo(u * TW, y);
    }
    g.stroke();
  }
  // boca: pliegue oscuro desde el hocico
  g.strokeStyle = 'rgba(20,16,10,0.75)'; g.lineWidth = 2.5;
  for (const lado of [0.25, 0.75]) {
    const dir = lado < 0.5 ? 1 : -1;
    g.beginPath(); g.moveTo(lado * TW + dir * 0.06 * TW, 0); g.quadraticCurveTo(lado * TW + dir * 0.07 * TW, TH * 0.04, lado * TW + dir * 0.09 * TW, TH * 0.075); g.stroke();
  }
  // línea lateral punteada
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (const lado of [0.25, 0.75]) for (let y = TH * 0.17; y < TH * 0.95; y += 5) g.fillRect(lado * TW + (lado < 0.5 ? -1 : 1) * 0.008 * TW - 1, y, 2, 2);

  // manchas
  for (let n = 0; n < pl.nManchas; n++) {
    const u = rnd(), y = Math.pow(rnd(), 0.85) * TH;
    const h = Math.cos(u * Math.PI * 2);
    const s = 1 - y / TH;
    if (s > 0.97) continue;
    // más densas hacia el lomo y la cola
    const prob = ss(pl.manchasVientre - 0.1, pl.manchasVientre + 0.35, h) * (0.55 + 0.45 * (1 - s));
    if (rnd() > prob) continue;
    const r = pl.tamMancha[0] + rnd() * (pl.tamMancha[1] - pl.tamMancha[0]);
    const cx = u * TW, cy = y;
    if (pl.halo) {
      const roja = pl.manchasRojas && Math.abs(h) < 0.35 && rnd() > 0.55;
      g.fillStyle = pl.halo; g.globalAlpha = 0.3; g.beginPath(); g.arc(cx, cy, r * 1.55, 0, 7); g.fill();
      g.globalAlpha = 1; g.fillStyle = roja ? pl.manchasRojas! : pl.manchas;
      g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    } else {
      // manchas irregulares, algunas en forma de x
      g.fillStyle = pl.manchas; g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(cx, cy, r, r * (0.6 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
      if (rnd() > 0.7) { g.beginPath(); g.ellipse(cx + r * 0.7, cy + r * 0.4, r * 0.6, r * 0.4, rnd() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
  }
  const mapa = new THREE.CanvasTexture(c); mapa.colorSpace = THREE.SRGBColorSpace; mapa.anisotropy = 8;
  return mapa;
}

// relieve de escamas (igual para las tres especies)
function pintarEscamas() {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080'; g.fillRect(0, 0, TW, TH);
  const paso = 7;
  for (let y = TH * 0.17; y < TH; y += paso * 0.62) {
    const fila = Math.round(y / (paso * 0.62));
    for (let x = (fila % 2) * paso * 0.5; x < TW; x += paso) {
      const gr = g.createRadialGradient(x, y - paso * 0.35, 0, x, y - paso * 0.35, paso * 0.75);
      gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.8, '#7a7a7a'); gr.addColorStop(1, '#5c5c5c');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y - paso * 0.35, paso * 0.72, 0, Math.PI); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

// aletas: radios, transparencia en el borde, manchas y borde blanco opcionales
function pintarAleta(pl: Piel, tipo: 'cola' | 'dorsal' | 'baja') {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const col = hex(pl.aleta);
  const gr = g.createLinearGradient(0, 256, 0, 0);
  gr.addColorStop(0, `rgba(${col[0] * 0.8},${col[1] * 0.8},${col[2] * 0.8},0.82)`);
  gr.addColorStop(0.6, `rgba(${col[0]},${col[1]},${col[2]},0.55)`);
  gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0.18)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // radios
  g.strokeStyle = 'rgba(25,22,14,0.45)'; g.lineWidth = 1.3;
  const n = tipo === 'cola' ? 22 : 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.beginPath();
    if (tipo === 'cola') { g.moveTo(0, 128); g.quadraticCurveTo(110, 128 + (t - 0.5) * 60, 256, t * 256); }
    else { g.moveTo(t * 256, 256); g.lineTo(t * 256 * 0.6 + 70, 0); }
    g.stroke();
  }
  if (pl.aletaManchada && tipo !== 'baja') {
    g.fillStyle = 'rgba(20,18,12,0.75)';
    for (let i = 0; i < (tipo === 'cola' ? 90 : 40); i++) { g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 1.5 + rnd() * 2.5, 0, 7); g.fill(); }
  }
  if (pl.bordeBlanco && tipo === 'baja') {
    // borde de ataque blanco, típico de las truchas
    const b = g.createLinearGradient(0, 0, 40, 0); b.addColorStop(0, 'rgba(250,250,245,0.95)'); b.addColorStop(1, 'rgba(250,250,245,0)');
    g.fillStyle = b; g.fillRect(0, 0, 40, 256);
  }
  if (tipo === 'baja' && pl.banda) { g.fillStyle = 'rgba(216,111,120,0.25)'; g.fillRect(0, 0, 256, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ojo: iris dorado, pupila y brillo
function pintarOjo() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.42, '#000'); gr.addColorStop(0.46, '#c9a14a'); gr.addColorStop(0.75, '#8a6a2a'); gr.addColorStop(0.95, '#3b3020'); gr.addColorStop(1, '#2a2418');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(50, 48, 8, 5, -0.5, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- perfil del cuerpo ----------
// s: 0 cola, 1 hocico. Puntos de control interpolados con coseno.
const interp = (pts: [number, number][]) => {
  // cúbica monótona (Fritsch-Carlson): curva suave sin ondas entre puntos
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = Math.min(1, Math.max(0, (x - xs[i]) / h)), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
};
const LOMO = interp([[0, 0.055], [0.06, 0.07], [0.16, 0.09], [0.32, 0.19], [0.5, 0.29], [0.62, 0.3], [0.78, 0.25], [0.9, 0.18], [0.97, 0.1], [1, 0.03]]);
const PANZA = interp([[0, 0.055], [0.06, 0.068], [0.16, 0.085], [0.3, 0.16], [0.45, 0.235], [0.6, 0.25], [0.78, 0.22], [0.9, 0.16], [0.97, 0.1], [1, 0.05]]);
const ANCHO = interp([[0, 0.03], [0.06, 0.042], [0.16, 0.06], [0.4, 0.125], [0.6, 0.15], [0.8, 0.135], [0.92, 0.105], [0.97, 0.07], [1, 0.02]]);

// ---------- fondo submarino ----------
const fondoVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const fondoFrag = `
  uniform float uT; uniform vec3 uArriba; uniform vec3 uAbajo; uniform vec3 uRayo; uniform float uAspect;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  void main(){
    vec2 p = vUv; p.x *= uAspect;
    vec3 col = mix(uAbajo, uArriba, smoothstep(0.0, 1.0, pow(vUv.y, 1.4)));
    float x = p.x + (1.0 - vUv.y) * 0.35;
    float r = smoothstep(0.55, 1.0, n(vec2(x * 3.0, uT * 0.12))) * 0.6 + smoothstep(0.6, 1.0, n(vec2(x * 7.0 + 3.0, uT * 0.18))) * 0.35;
    r *= smoothstep(0.05, 1.0, vUv.y);
    col += uRayo * r * 0.55;
    float c = n(p * 9.0 + vec2(uT * 0.3, uT * 0.2)) * n(p * 13.0 - vec2(uT * 0.25, 0.0));
    col += uRayo * smoothstep(0.35, 0.6, c) * smoothstep(0.7, 1.0, vUv.y) * 0.35;
    col *= 1.0 - 0.45 * length(vUv - vec2(0.5, 0.55));
    gl_FragColor = vec4(col, 1.0);
  }`;
const TONOS = [
  { arriba: '#2f7a72', abajo: '#04161a', rayo: '#bfe8d2' },
  { arriba: '#6e6a3a', abajo: '#120f06', rayo: '#f2cf8a' },
  { arriba: '#1f5f78', abajo: '#030c14', rayo: '#a9d7ea' },
];

export function crearTrucha(canvas: HTMLCanvasElement, modelos: ModeloEspecie[] = []): Trucha {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  escena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  escena.environmentIntensity = 0.55;
  escena.fog = new THREE.FogExp2('#0a2a2c', 0.03);

  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  camara.position.set(0, 0, 9);
  escena.add(camara);

  const uni = {
    uT: { value: 0 }, uAspect: { value: 1 },
    uArriba: { value: new THREE.Color(TONOS[0].arriba) },
    uAbajo: { value: new THREE.Color(TONOS[0].abajo) },
    uRayo: { value: new THREE.Color(TONOS[0].rayo) },
  };
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: fondoVert, fragmentShader: fondoFrag, depthWrite: false, fog: false }));
  fondo.position.z = -60; fondo.renderOrder = -1;
  camara.add(fondo);

  // luz cenital fuerte (como el sol atravesando el agua), relleno frío y contraluz
  const sol = new THREE.DirectionalLight('#fff4dc', 3.0); sol.position.set(0.5, 8, 2.5); escena.add(sol);
  escena.add(new THREE.HemisphereLight('#cdeee6', '#18240f', 0.9));
  const contra = new THREE.DirectionalLight('#a6e0ff', 1.6); contra.position.set(-3, 2, -4); escena.add(contra);
  const frente = new THREE.DirectionalLight('#ffffff', 0.5); frente.position.set(0, -1, 6); escena.add(frente);

  // sedimento
  const NP = 500;
  const pos = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pos[i * 3] = (rnd() - 0.5) * 20; pos[i * 3 + 1] = (rnd() - 0.5) * 12; pos[i * 3 + 2] = (rnd() - 0.5) * 10 - 2; }
  const gP = new THREE.BufferGeometry(); gP.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  escena.add(new THREE.Points(gP, new THREE.PointsMaterial({ color: '#d8eee2', size: 0.035, transparent: true, opacity: 0.5, depthWrite: false })));

  // ---------- cuerpo ----------
  const raiz = new THREE.Group(); escena.add(raiz);
  const pez = new THREE.Group(); raiz.add(pez);
  const LARGO = 1.25; // mitad del largo

  const geo = new THREE.SphereGeometry(1, 160, 72);
  geo.rotateZ(-Math.PI / 2); // polos en X: +X hocico
  const base = geo.attributes.position.array.slice() as Float32Array;
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i], y = base[i + 1], z = base[i + 2];
    const s = Math.min(1, Math.max(0, (x + 1) / 2));
    const rho = Math.hypot(y, z);
    if (rho < 1e-5) { base[i] = x * LARGO; base[i + 1] = s > 0.5 ? 0.0 : 0; base[i + 2] = 0; continue; }
    const cy = y / rho, cz = z / rho;
    // superelipse: flancos más planos, como un pez de verdad
    const sy = Math.sign(cy) * Math.pow(Math.abs(cy), 0.9), sz = Math.sign(cz) * Math.pow(Math.abs(cz), 0.8);
    const radio = rho; // 0 en los polos, 1 en el ecuador
    base[i] = x * LARGO;
    base[i + 1] = (sy > 0 ? sy * LOMO(s) : sy * PANZA(s)) * Math.pow(radio, 0.08);
    base[i + 2] = sz * ANCHO(s) * Math.pow(radio, 0.08);
  }
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  posAttr.array.set(base); geo.computeVertexNormals();

  const pieles = PIELES.map(pintarPiel);
  const escamas = pintarEscamas();
  const matCuerpo = new THREE.MeshPhysicalMaterial({
    map: pieles[0], bumpMap: escamas, bumpScale: 0.5,
    roughness: 0.38, metalness: 0.12, clearcoat: 0.85, clearcoatRoughness: 0.18,
    iridescence: 0.35, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 500],
    sheen: 0.4, sheenColor: new THREE.Color('#d6f0ff'), sheenRoughness: 0.4, envMapIntensity: 1.0,
  });
  pez.add(new THREE.Mesh(geo, matCuerpo));

  // ---------- aletas ----------
  const texAletas = PIELES.map((pl) => ({ cola: pintarAleta(pl, 'cola'), dorsal: pintarAleta(pl, 'dorsal'), baja: pintarAleta(pl, 'baja') }));
  const matAleta = (t: THREE.Texture) => new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, roughness: 0.6, depthWrite: false });
  const mats = { cola: matAleta(texAletas[0].cola), dorsal: matAleta(texAletas[0].dorsal), baja: matAleta(texAletas[0].baja) };
  // geometría desde un contorno, con UV normalizadas a 0..1
  const forma = (pts: [number, number][], curva = 0) => {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      sh.quadraticCurveTo((x0 + x1) / 2 + curva * (y1 - y0), (y0 + y1) / 2 - curva * (x1 - x0), x1, y1);
    }
    const g = new THREE.ShapeGeometry(sh, 12);
    g.computeBoundingBox(); const bb = g.boundingBox!;
    const uv = g.attributes.uv as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
    return g;
  };
  const anclas: { m: THREE.Object3D; x: number; z0: number }[] = [];
  const pegar = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); pez.add(m); anclas.push({ m, x, z0: z }); return m;
  };
  const xDe = (s: number) => (s * 2 - 1) * LARGO;

  // cola levemente escotada, con radios que salen del pedúnculo
  const cola = new THREE.Group(); cola.position.x = xDe(0.01); pez.add(cola);
  const gCola = forma([[0.04, 0.06], [-0.18, 0.2], [-0.42, 0.34], [-0.4, 0.12], [-0.34, 0], [-0.4, -0.12], [-0.42, -0.32], [-0.18, -0.18], [0.04, -0.06], [0.04, 0.06]], 0.05);
  // los radios de la textura de cola van de izquierda (base) a derecha (borde): espejar U
  { const uv = gCola.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
  cola.add(new THREE.Mesh(gCola, mats.cola));
  // dorsal
  pegar(forma([[0, 0], [0.04, 0.16], [0.12, 0.26], [0.22, 0.24], [0.3, 0.12], [0.36, 0]], 0.03), mats.dorsal, xDe(0.42), LOMO(0.5) - 0.025, 0);
  // adiposa
  pegar(forma([[0, 0], [0.02, 0.05], [0.09, 0.07], [0.14, 0.02], [0.15, 0]], 0.02), mats.dorsal, xDe(0.17), LOMO(0.2) - 0.012, 0);
  // anal
  pegar(forma([[0, 0], [0.05, -0.13], [0.16, -0.16], [0.24, -0.08], [0.26, 0]], 0.03), mats.baja, xDe(0.22), -PANZA(0.27) + 0.02, 0);
  // pélvicas
  pegar(forma([[0, 0], [-0.05, -0.15], [0.05, -0.17], [0.12, -0.02], [0.12, 0]], 0.02), mats.baja, xDe(0.47), -PANZA(0.5) + 0.03, 0.06, 0.3, 0, 0);
  pegar(forma([[0, 0], [-0.05, -0.15], [0.05, -0.17], [0.12, -0.02], [0.12, 0]], 0.02), mats.baja, xDe(0.47), -PANZA(0.5) + 0.03, -0.06, -0.3, 0, 0);
  // pectorales, pegadas detrás del opérculo
  pegar(forma([[0, 0], [-0.3, -0.11], [-0.32, -0.03], [-0.15, 0.04], [0, 0.04]], 0.03), mats.baja, xDe(0.8), -PANZA(0.8) * 0.55, ANCHO(0.8) * 0.85, 0.5, 0.45, -0.25);
  pegar(forma([[0, 0], [-0.3, -0.11], [-0.32, -0.03], [-0.15, 0.04], [0, 0.04]], 0.02), mats.baja, xDe(0.8), -PANZA(0.8) * 0.55, -ANCHO(0.8) * 0.85, -0.5, -0.45, -0.25);

  // ---------- ojos ----------
  const texOjo = pintarOjo();
  const sOjo = 0.925;
  [1, -1].forEach((l) => {
    const o = new THREE.Group();
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.036, 32), new THREE.MeshPhysicalMaterial({ map: texOjo, roughness: 0.15, clearcoat: 1 }));
    const domo = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0, clearcoat: 1, envMapIntensity: 2 }),
    );
    domo.rotation.x = Math.PI / 2; domo.scale.z = 0.5; domo.position.z = 0.002;
    o.add(iris, domo);
    o.position.set(xDe(sOjo), LOMO(sOjo) * 0.32, l * ANCHO(sOjo) * 0.93);
    o.rotation.y = l > 0 ? 0.35 : Math.PI - 0.35;
    pez.add(o); anclas.push({ m: o, x: xDe(sOjo), z0: o.position.z });
  });

  // ---------- modelos reales (.glb) ----------
  type Doblable = { attr: THREE.BufferAttribute; base: Float32Array; geo: THREE.BufferGeometry };
  const reales: (THREE.Group | null)[] = [null, null, null];
  const doblables: Doblable[][] = [[], [], []];
  const mixers: (THREE.AnimationMixer | null)[] = [null, null, null];
  const loader = new GLTFLoader();
  modelos.forEach((cfg, i) => {
    if (!cfg?.archivo) return;
    loader.load(cfg.archivo, (gltf) => {
      const sc = gltf.scene;
      sc.updateMatrixWorld(true);
      const caja = new THREE.Box3().setFromObject(sc);
      const tam = caja.getSize(new THREE.Vector3()), centro = caja.getCenter(new THREE.Vector3());
      // dejar el eje más largo en X (de cola a hocico)
      const ejeLargo = tam.x >= tam.y && tam.x >= tam.z ? 'x' : tam.z >= tam.y ? 'z' : 'y';
      const rot = new THREE.Matrix4();
      if (ejeLargo === 'z') rot.makeRotationY(Math.PI / 2);
      if (ejeLargo === 'y') rot.makeRotationZ(-Math.PI / 2);
      const largoReal = Math.max(tam.x, tam.y, tam.z);
      const k = (2 * LARGO * (cfg.largo ?? 1)) / largoReal;
      const ajuste = new THREE.Matrix4()
        .makeRotationY(cfg.girar ?? 0)
        .multiply(new THREE.Matrix4().makeRotationX(cfg.inclinar ?? 0))
        .multiply(new THREE.Matrix4().makeScale(k, k, k))
        .multiply(rot)
        .multiply(new THREE.Matrix4().makeTranslation(-centro.x, -centro.y, -centro.z));
      const g = new THREE.Group();
      const animado = gltf.animations.length > 0;
      if (animado) {
        // con animación propia: se usa tal cual, solo escalado y centrado
        const cont = new THREE.Group(); cont.applyMatrix4(ajuste); cont.add(sc); g.add(cont);
        mixers[i] = new THREE.AnimationMixer(sc);
        gltf.animations.forEach((a) => mixers[i]!.clipAction(a).play());
      } else {
        sc.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const geo = m.geometry.clone();
          geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(ajuste, m.matrixWorld));
          geo.computeVertexNormals();
          const nm = new THREE.Mesh(geo, m.material);
          g.add(nm);
          const attr = geo.attributes.position as THREE.BufferAttribute;
          doblables[i].push({ attr, base: (attr.array as Float32Array).slice(), geo });
        });
      }
      g.visible = false;
      reales[i] = g; raiz.add(g);
      mostrar(pielActual);
    });
  });
  const mostrar = (i: number) => {
    reales.forEach((g, j) => g && (g.visible = j === i));
    pez.visible = !reales[i];
  };

  // ---------- estado ----------
  const estado: Trucha = {
    pose: { x: 0.68, y: 0.5, escala: 1, giro: -0.25, inclinar: 0 },
    especie: 0,
    activo: (v) => { corriendo = v; if (v) bucle(); },
  };

  let W = 1, H = 1;
  const medir = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false);
    camara.aspect = W / H; camara.updateProjectionMatrix();
    const alto = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * 60;
    fondo.scale.set(alto * camara.aspect * 1.02, alto * 1.02, 1);
    uni.uAspect.value = camara.aspect;
  };
  medir(); addEventListener('resize', medir);

  const raton = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => { raton.x = e.clientX / innerWidth - 0.5; raton.y = e.clientY / innerHeight - 0.5; });

  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reloj = new THREE.Clock();
  let corriendo = true, pedido = false, pielActual = 0;
  const cA = new THREE.Color(), cB = new THREE.Color();
  const tono = (k: 'arriba' | 'abajo' | 'rayo', e: number) => {
    const i = Math.min(1, Math.floor(e)), f = Math.min(1, e - i);
    return cA.set(TONOS[i][k]).lerp(cB.set(TONOS[Math.min(2, i + 1)][k]), f);
  };

  function bucle() {
    if (pedido) return; pedido = true;
    requestAnimationFrame(() => { pedido = false; if (corriendo) { cuadro(); bucle(); } });
  }

  // onda de nado: casi nada en la cabeza, crece hacia la cola
  const A = quieto ? 0 : 0.075, K = 2.4, Wn = 5.5;
  const amp = (x: number) => { const s = Math.min(1, Math.max(0, (x / LARGO + 1) / 2)); return A * (Math.pow(1 - s, 1.8) + 0.05 * s); };
  const onda = (x: number, t: number) => amp(x) * Math.sin(K * x - Wn * t);

  function cuadro() {
    const t = reloj.getElapsedTime();
    uni.uT.value = t;
    const e = estado.especie;
    uni.uArriba.value.copy(tono('arriba', e)); uni.uAbajo.value.copy(tono('abajo', e)); uni.uRayo.value.copy(tono('rayo', e));
    (escena.fog as THREE.FogExp2).color.copy(uni.uAbajo.value).lerp(uni.uArriba.value, 0.35);

    // cambio de especie con medio giro; la piel cambia cuando el pez queda de frente
    const i = Math.floor(e), f = e - i;
    const giroCambio = Math.PI * (i + ss(0.25, 0.75, f));
    const nueva = Math.min(2, f > 0.5 ? i + 1 : i);
    if (nueva !== pielActual) {
      pielActual = nueva;
      mostrar(nueva);
      matCuerpo.map = pieles[nueva]; matCuerpo.needsUpdate = true;
      mats.cola.map = texAletas[nueva].cola; mats.dorsal.map = texAletas[nueva].dorsal; mats.baja.map = texAletas[nueva].baja;
      Object.values(mats).forEach((m) => (m.needsUpdate = true));
    }
    const tam = [1, 1.08, 1.3];
    const escalaEspecie = THREE.MathUtils.lerp(tam[Math.min(2, i)], tam[Math.min(2, i + 1)], ss(0.25, 0.75, f));

    const altoV = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * camara.position.z;
    const anchoV = altoV * camara.aspect;
    const p = estado.pose;
    const ajuste = Math.min(1, camara.aspect / 0.9);
    raiz.position.set((p.x - 0.5) * anchoV, (0.5 - p.y) * altoV + (quieto ? 0 : Math.sin(t * 0.7) * 0.07), 0);
    raiz.scale.setScalar(p.escala * ajuste * escalaEspecie);
    raton.sx += (raton.x - raton.sx) * 0.04; raton.sy += (raton.y - raton.sy) * 0.04;
    raiz.rotation.set(p.inclinar + raton.sy * 0.25, p.giro + giroCambio + raton.sx * 0.5, quieto ? 0 : Math.sin(t * 0.5) * 0.035);

    if (pez.visible) {
      const arr = posAttr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) arr[j + 2] = base[j + 2] + onda(base[j], t);
      posAttr.needsUpdate = true; geo.computeVertexNormals();
    }
    const real = reales[pielActual];
    if (real?.visible) {
      mixers[pielActual]?.update(1 / 60);
      for (const d of doblables[pielActual]) {
        const a = d.attr.array as Float32Array;
        for (let j = 0; j < a.length; j += 3) a[j + 2] = d.base[j + 2] + onda(d.base[j], t);
        d.attr.needsUpdate = true; d.geo.computeVertexNormals();
      }
    }
    anclas.forEach((a) => (a.m.position.z = a.z0 + onda(a.x, t)));
    const xc = -LARGO;
    const dz = amp(xc) * K * Math.cos(K * xc - Wn * t);
    cola.position.z = onda(xc, t); cola.rotation.y = -Math.atan(dz) * 2.2;

    if (!quieto) {
      const pa = gP.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < NP; j++) {
        let y = pa.getY(j) + 0.0025; if (y > 6) y = -6;
        pa.setY(j, y); pa.setX(j, pa.getX(j) + Math.sin(t * 0.3 + j) * 0.0015);
      }
      pa.needsUpdate = true;
    }
    renderer.render(escena, camara);
  }
  bucle();
  return estado;
}
