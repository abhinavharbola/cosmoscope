import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SUN, PLANETS, MOON, AU_KM, C_AU_S, POLES } from "./data.js";
import { helioPosition, moonOffset, orbitSamples, orbitalPeriodDays, gmstRad, poleVector, distanceAU } from "./ephemeris.js";
import { orbitWindowStart } from "./timeutil.js";
import { moonSpinAngle, nodeOffset, primeMeridianRad } from "./frame.js";
import { buildMaps, sunMap, ringTexture, glowTexture, loadManifest, loadSurface, disposeMaps } from "./textures.js";
import { TIERS, BASE_TIER, availableTiers, surfaceKey } from "./texmanifest.js";
import { createSky } from "./sky.js";

const ART_BASE = 0.035;
const MOON_ART_ORBIT = ART_BASE * 5;
const OVERVIEW_DIST = 85;
const INNER_DIST = 4.5;
const PULSE_MAX_AU = 120;
const ORBIT_REBUILD_MS = 25 * 365.25 * 86400000;
const SUN_INTENSITY = 7;
const UP = new THREE.Vector3(0, 1, 0);
const TEXTURE_ORDER = ["Earth", "Sun", "Jupiter", "Saturn", "Mars", "Moon", "Venus", "Mercury", "Neptune", "Uranus", "Pluto"];

export const VIEWS = {
  Overview: { dist: OVERVIEW_DIST },
  Inner: { dist: INNER_DIST },
};

const isView = (id) => Object.hasOwn(VIEWS, id);

function artisticRadius(body) {
  if (body.id === "Sun") return 0.1;
  if (body.id === "Moon") return ART_BASE * 0.3;
  return ART_BASE * Math.pow(body.radiusKm / 6371, 0.45);
}

function trueRadius(body) {
  return body.radiusKm / AU_KM;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function circleSprite(color) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false })
  );
}

function radialRing(inner, outer, tex) {
  const geo = new THREE.RingGeometry(inner, outer, 192, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    color: 0xe8e8e8,
    roughness: 1,
    metalness: 0,
  });
  const sun = { value: new THREE.Vector3(1, 0, 0) };
  patchRingShadow(mat, sun);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.sun = sun;
  return mesh;
}

function patchRingShadow(mat, sunLocal) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunLocal = sunLocal;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSunLocal;\nvarying vec3 vLocal;")
      .replace(
        "#include <opaque_fragment>",
        [
          "float ringShadow = 1.0;",
          "vec3 sunDirLocal = normalize(uSunLocal);",
          "float along = dot(-vLocal, sunDirLocal);",
          "if (along > 0.0) {",
          "  float miss = sqrt(max(dot(vLocal, vLocal) - along * along, 0.0));",
          "  ringShadow = smoothstep(0.96, 1.04, miss);",
          "}",
          "outgoingLight *= ringShadow;",
          "#include <opaque_fragment>",
        ].join("\n")
      );
  };
}

function atmosphereMaterial(cfg) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Vector3(cfg.color[0], cfg.color[1], cfg.color[2]) },
      uPower: { value: cfg.power },
      uIntensity: { value: cfg.intensity },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWN;
      varying vec3 vWP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vWN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      uniform vec3 uSun;
      varying vec3 vWN;
      varying vec3 vWP;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vWN);
        vec3 v = normalize(cameraPosition - vWP);
        float f = pow(1.0 - max(dot(n, v), 0.0), uPower);
        float lit = smoothstep(-0.3, 0.5, dot(n, uSun));
        gl_FragColor = vec4(uColor * uIntensity, clamp(f * lit, 0.0, 1.0));
      }
    `,
  });
}

function pulseMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.7 } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0);
        gl_FragColor = vec4(1.0, 0.82, 0.45, rim * uOpacity);
      }
    `,
  });
}

function patchNightLights(mat, sunView) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunView = sunView;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSunView;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - smoothstep(-0.14, 0.06, dot(normalize(vNormal), uSunView));"
      );
  };
}

export function createWorld(canvas, labelsEl, hooks = {}) {
  const onSelect = hooks.onSelect || (() => {});
  const onProgress = hooks.onProgress || (() => {});

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1e-8, 1e4);
  camera.position.copy(new THREE.Vector3(0.35, 0.5, 0.8).normalize().multiplyScalar(OVERVIEW_DIST));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 1.1;
  controls.maxDistance = 400;
  controls.minDistance = 0.01;

  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const sunLight = new THREE.PointLight(0xffffff, SUN_INTENSITY, 0, 0);
  scene.add(sunLight);

  const sky = createSky();
  scene.add(sky.object);

  const bodies = {};
  const state = {
    trueScale: false,
    showOrbits: true,
    showLabels: true,
    focus: "Overview",
    center: [0, 0, 0],
    trans: null,
    hoverId: null,
    orbitBuiltMs: null,
    degraded: false,
    textured: new Set(),
    surfaces: {},
    textureQuality: BASE_TIER,
    textureMs: null,
  };
  let surfaceManifest = Object.create(null);
  const surfaceTokens = {};
  const patched = [];

  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    if (state.degraded) return;
    state.degraded = true;
    console.warn("A custom shader failed to compile. Falling back to plain materials.");
    patched.forEach((m) => {
      m.onBeforeCompile = () => {};
      m.needsUpdate = true;
    });
    Object.values(bodies).forEach((b) => {
      if (b.atmos) b.atmos.visible = false;
    });
    pulse.mesh.material = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.12,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  };

  function buildBody(data, isSun = false) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    const pole = POLES[data.id];
    if (pole) {
      const pv = poleVector(pole[0], pole[1]);
      tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(pv[0], pv[1], pv[2]).normalize());
    }
    let mesh;
    if (isSun) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    } else {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 128, 96),
        new THREE.MeshStandardMaterial({ color: data.palette[0], roughness: 0.95, metalness: 0 })
      );
    }
    tilt.add(mesh);
    let rings = null;
    if (data.rings) {
      rings = radialRing(data.rings.innerKm / data.radiusKm, data.rings.outerKm / data.radiusKm, ringTexture(data.rings));
      patched.push(rings.material);
      tilt.add(rings);
    }
    group.add(tilt);

    let atmos = null;
    if (data.atmosphere) {
      atmos = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), atmosphereMaterial(data.atmosphere));
      atmos.renderOrder = 5;
      group.add(atmos);
    }
    scene.add(group);

    const marker = circleSprite(isSun ? "#ffd27a" : data.palette[0]);
    marker.scale.set(0.011, 0.011, 1);
    marker.renderOrder = 10;
    scene.add(marker);

    const label = document.createElement("button");
    label.className = "label";
    label.textContent = data.name;
    label.addEventListener("click", () => onSelect(data.id));
    labelsEl.appendChild(label);

    let orbit = null;
    if (!isSun && data.id !== "Moon") {
      orbit = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
      );
      orbit.frustumCulled = false;
      scene.add(orbit);
    }

    const body = {
      data,
      group,
      tilt,
      mesh,
      rings,
      atmos,
      clouds: null,
      marker,
      label,
      orbit,
      orbitN: 0,
      orbitPts: null,
      orbitCol: null,
      orbitRGB: orbit ? new THREE.Color(data.palette[0]).lerp(new THREE.Color(0xffffff), 0.3) : null,
      sunDir: new THREE.Vector3(1, 0, 0),
      night: null,
      ringSun: rings ? rings.userData.sun : null,
      tiltInv: tilt.quaternion.clone().invert(),
      phi: pole && data.W0 !== undefined ? nodeOffset(tilt.quaternion, pole[0]) : 0,
      onScreen: false,
      crowded: false,
      cd: 0,
      pos: [0, 0, 0],
      radius: 0,
      sx: 0,
      sy: 0,
      sr: 0,
      shown: false,
    };
    bodies[data.id] = body;
    return body;
  }

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  scene.add(glow);

  buildBody(SUN, true);
  PLANETS.forEach((p) => buildBody(p));
  buildBody(MOON);

  const moonOrbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 128 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      })
    ),
    new THREE.LineBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.4, depthWrite: false })
  );
  moonOrbit.frustumCulled = false;
  scene.add(moonOrbit);

  const pulse = {
    emitMs: null,
    prevElapsed: 0,
    prevDist: {},
    mesh: new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), pulseMaterial()),
    logged: new Set(),
    radius: 0,
    end: null,
  };
  pulse.mesh.visible = false;
  pulse.mesh.renderOrder = 20;
  pulse.mesh.frustumCulled = false;
  scene.add(pulse.mesh);

  let rebuildQueue = [];
  let rebuildMs = 0;

  function buildOrbit(p, startMs) {
    const b = bodies[p.id];
    const period = orbitalPeriodDays(p.id);
    const n = period > 20000 ? 720 : 360;
    const pts = orbitSamples(p.id, orbitWindowStart(startMs, period), period, n);
    b.orbitN = n;
    b.orbitPts = pts;
    b.orbitCol = new Float32Array(n * 4);
    b.orbit.geometry.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    b.orbit.geometry.setAttribute("color", new THREE.BufferAttribute(b.orbitCol, 4));
    b.orbit.geometry.computeBoundingSphere();
  }

  function rebuildOrbits(startMs, immediate) {
    state.orbitBuiltMs = startMs;
    rebuildMs = startMs;
    rebuildQueue = PLANETS.slice();
    if (immediate) while (rebuildQueue.length) buildOrbit(rebuildQueue.shift(), rebuildMs);
  }

  function updateTrail(b) {
    const n = b.orbitN;
    if (!n) return;
    const pts = b.orbitPts;
    const px = b.pos[0];
    const py = b.pos[1];
    const pz = b.pos[2];
    let head = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - px;
      const dy = pts[i * 3 + 1] - py;
      const dz = pts[i * 3 + 2] - pz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) {
        best = d;
        head = i;
      }
    }
    const col = b.orbitCol;
    const c = b.orbitRGB;
    for (let i = 0; i < n; i++) {
      const behind = ((head - i + n) % n) / n;
      const a = 0.07 + 0.8 * Math.pow(1 - behind, 3.4);
      col[i * 4] = c.r;
      col[i * 4 + 1] = c.g;
      col[i * 4 + 2] = c.b;
      col[i * 4 + 3] = a;
    }
    b.orbit.geometry.attributes.color.needsUpdate = true;
  }

  function applyMaps(b, maps, bumpScale = 0.9) {
    b.maps = maps;
    if (b.data.id === "Sun") {
      b.mesh.material.map = maps.map;
      b.mesh.material.color.set(0xffffff);
      b.mesh.material.needsUpdate = true;
      return;
    }
    const mat = b.mesh.material;
    mat.map = maps.map || null;
    mat.color.set(0xffffff);
    if (maps.bump) {
      mat.bumpMap = maps.bump;
      mat.bumpScale = bumpScale;
    }
    if (maps.rough) {
      mat.roughnessMap = maps.rough;
      mat.roughness = 1;
    }
    if (maps.lights) {
      mat.emissiveMap = maps.lights;
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = 1.5;
      b.night = { value: new THREE.Vector3(0, 0, 1) };
      patchNightLights(mat, b.night);
      patched.push(mat);
    }
    mat.needsUpdate = true;
    if (maps.clouds || maps.cloudMask) {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.012, 96, 64),
        new THREE.MeshStandardMaterial({
          map: maps.clouds || null,
          alphaMap: maps.cloudMask || null,
          transparent: true,
          depthWrite: false,
          roughness: 1,
        })
      );
      b.tilt.add(clouds);
      b.clouds = clouds;
    }
  }

  function swapMaps(b, next) {
    const mat = b.mesh.material;
    const prev = b.maps || {};
    if (next.map) mat.map = next.map;
    if (next.bump) mat.bumpMap = next.bump;
    if (next.rough) mat.roughnessMap = next.rough;
    if (next.lights) mat.emissiveMap = next.lights;
    mat.needsUpdate = true;
    if (b.clouds) {
      if (next.clouds) b.clouds.material.map = next.clouds;
      if (next.cloudMask) b.clouds.material.alphaMap = next.cloudMask;
      b.clouds.material.needsUpdate = true;
    }
    const stale = {};
    for (const [slot, tex] of Object.entries(prev)) if (next[slot] && next[slot] !== tex) stale[slot] = tex;
    disposeMaps(stale);
    b.maps = { ...prev, ...next };
  }

  async function setSurfaceTier(id, wanted) {
    const entry = surfaceManifest[id];
    const cur = state.surfaces[id];
    const b = bodies[id];
    if (!entry || !cur || !b) return;
    surfaceTokens[id] = (surfaceTokens[id] || 0) + 1;
    const token = surfaceTokens[id];
    if (cur.key === surfaceKey(entry, wanted)) return;
    const loaded = await loadSurface(entry, wanted);
    if (!loaded) return;
    if (token !== surfaceTokens[id]) {
      disposeMaps(loaded.maps);
      return;
    }
    swapMaps(b, loaded.maps);
    cur.tier = loaded.tier;
    cur.key = loaded.key;
  }

  function syncTiers() {
    for (const id of Object.keys(state.surfaces)) {
      const wanted = id === state.focus ? state.textureQuality : BASE_TIER;
      setSurfaceTier(id, wanted).catch((err) => console.warn(`Texture detail for ${id} failed`, err));
    }
  }

  function setTextureQuality(q) {
    if (!TIERS.includes(q)) return;
    state.textureQuality = q;
    syncTiers();
  }

  function textureTiers() {
    return availableTiers(surfaceManifest);
  }

  async function loadTextures() {
    const started = performance.now();
    surfaceManifest = await loadManifest();
    const total = TEXTURE_ORDER.length;
    let done = 0;
    for (const id of TEXTURE_ORDER) {
      const b = bodies[id];
      try {
        let maps = null;
        let bumpScale;
        const entry = surfaceManifest[id];
        const real = entry ? await loadSurface(entry, BASE_TIER) : null;
        if (real) {
          maps = real.maps;
          bumpScale = entry.bumpScale ?? undefined;
          state.textured.add(id);
          state.surfaces[id] = {
            tier: real.tier,
            key: real.key,
            credit: entry.credit,
            license: entry.license,
            note: entry.note,
            url: entry.url,
          };
        } else if (id === "Sun") maps = { map: await sunMap() };
        else maps = await buildMaps(b.data);
        applyMaps(b, maps, bumpScale);
      } catch (err) {
        console.warn(`Texture for ${id} failed`, err);
      }
      done += 1;
      onProgress(done, total, id);
    }
    state.textureMs = performance.now() - started;
    syncTiers();
  }

  function displayRadius(data) {
    return state.trueScale ? trueRadius(data) : artisticRadius(data);
  }

  function desiredDistance(id) {
    if (isView(id)) return VIEWS[id].dist;
    const b = bodies[id];
    const ringFactor = b.data.rings ? 2.4 : 1;
    return Math.max(b.radius * 4 * ringFactor, 1e-7);
  }

  function setFocus(id) {
    if (!isView(id) && !Object.hasOwn(bodies, id)) return;
    state.focus = id;
    syncTiers();
    const fromDist = camera.position.length();
    state.trans = { from: state.center.slice(), t0: performance.now(), dur: 2200, fromDist, id };
    controls.minDistance = isView(id) ? 0.01 : displayRadius(bodies[id].data) * 1.15;
  }

  function update(simMs, timeScale, nowMs) {
    if (state.orbitBuiltMs === null) rebuildOrbits(simMs, true);
    else if (Math.abs(simMs - state.orbitBuiltMs) > ORBIT_REBUILD_MS) rebuildOrbits(simMs, false);
    for (let i = 0; i < 2 && rebuildQueue.length; i++) buildOrbit(rebuildQueue.shift(), rebuildMs);

    const earth = helioPosition("Earth", simMs);
    for (const p of PLANETS) bodies[p.id].pos = helioPosition(p.id, simMs);
    bodies.Sun.pos = [0, 0, 0];

    const moonVec = moonOffset(simMs);
    const moonLen = Math.hypot(moonVec[0], moonVec[1], moonVec[2]);
    const earthDisp = displayRadius(bodies.Earth.data);
    const moonDistDisp = state.trueScale ? moonLen : Math.max(MOON_ART_ORBIT, earthDisp * 4);
    const k = moonDistDisp / moonLen;
    bodies.Moon.pos = [earth[0] + moonVec[0] * k, earth[1] + moonVec[1] * k, earth[2] + moonVec[2] * k];

    for (const id of Object.keys(bodies)) bodies[id].radius = displayRadius(bodies[id].data);

    const targetPos = isView(state.focus) ? [0, 0, 0] : bodies[state.focus].pos;

    if (state.trans) {
      const t = Math.min(1, (nowMs - state.trans.t0) / state.trans.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      state.center = [
        state.trans.from[0] + (targetPos[0] - state.trans.from[0]) * e,
        state.trans.from[1] + (targetPos[1] - state.trans.from[1]) * e,
        state.trans.from[2] + (targetPos[2] - state.trans.from[2]) * e,
      ];
      const toDist = Math.max(desiredDistance(state.focus), 1e-7);
      const dist = Math.exp(Math.log(state.trans.fromDist) + (Math.log(toDist) - Math.log(state.trans.fromDist)) * e);
      camera.position.setLength(dist);
      if (t >= 1) state.trans = null;
    } else {
      state.center = targetPos.slice();
    }

    const c = state.center;
    const halfH = window.innerHeight / 2;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const sunRel = new THREE.Vector3(-c[0], -c[1], -c[2]);
    const tmp = new THREE.Vector3();
    const gmst = gmstRad(simMs);
    const shellScale = state.trueScale ? 1.02 : 1.05;
    const camLen = camera.position.length();
    const fadeId = state.focus === "Moon" ? "Earth" : state.focus;

    for (const id of Object.keys(bodies)) {
      const b = bodies[id];
      const rx = b.pos[0] - c[0];
      const ry = b.pos[1] - c[1];
      const rz = b.pos[2] - c[2];
      b.group.position.set(rx, ry, rz);
      b.marker.position.set(rx, ry, rz);
      b.tilt.scale.setScalar(b.radius);

      const periodSec = Math.abs(b.data.rotationHours) * 3600;
      const perFrame = (Math.abs(timeScale) * 2 * Math.PI) / periodSec / 60;
      const spinSign = b.data.spinSign ?? 1;
      if (id === "Moon") {
        b.mesh.rotation.y = moonSpinAngle(moonVec, b.tilt.quaternion);
      } else if (perFrame >= 0.5) {
        b.mesh.rotation.y = (nowMs / 1000) * 0.3 * spinSign;
      } else if (id === "Earth") {
        b.mesh.rotation.y = gmst;
      } else {
        b.mesh.rotation.y = primeMeridianRad(b.data.W0, b.data.Wdot, simMs) + b.phi;
      }
      if (b.clouds) b.clouds.rotation.y = b.mesh.rotation.y + (nowMs / 1000) * 0.0008;

      const camToBody = Math.hypot(camera.position.x - rx, camera.position.y - ry, camera.position.z - rz);
      const px = (b.radius / Math.max(camToBody, 1e-12)) * (halfH / tanHalf);
      b.marker.visible = px < 3;

      tmp.set(sunRel.x - rx, sunRel.y - ry, sunRel.z - rz).normalize();
      b.sunDir.copy(tmp);
      if (b.ringSun) b.ringSun.value.copy(tmp).applyQuaternion(b.tiltInv);
      if (b.atmos) {
        b.atmos.scale.setScalar(b.radius * shellScale);
        b.atmos.material.uniforms.uSun.value.copy(tmp);
      }

      if (b.orbit) {
        b.orbit.position.set(-c[0], -c[1], -c[2]);
        const fade = id === fadeId ? smoothstep(0.05, 1.5, camLen) : 1;
        b.orbit.material.opacity = fade;
        b.orbit.visible = state.showOrbits && fade > 0.01;
        if (b.orbit.visible) updateTrail(b);
      }

      tmp.set(rx, ry, rz).project(camera);
      b.sx = ((tmp.x + 1) / 2) * window.innerWidth;
      b.sy = ((1 - tmp.y) / 2) * window.innerHeight;
      b.sr = px;
      const onScreen = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      b.onScreen = onScreen;
      b.cd = camToBody;
      b.crowded = false;
      let show = state.showLabels && onScreen;
      if (id === "Moon" && state.focus !== "Moon") {
        const e = bodies.Earth;
        if (Math.hypot(b.sx - e.sx, b.sy - e.sy) < 56) {
          show = false;
          b.crowded = true;
        }
      }
      if (state.focus === id && px > 70) show = false;
      b.shown = show;
      b.label.style.display = show ? "block" : "none";
      if (show) {
        b.label.style.transform = `translate(${b.sx.toFixed(1)}px, ${b.sy.toFixed(1)}px) translate(-50%, calc(-100% - ${Math.min(14 + px * 0.5, 80).toFixed(0)}px))`;
        b.label.classList.toggle("active", state.focus === id);
        b.label.classList.toggle("hover", state.hoverId === id);
      }
    }

    glow.position.copy(bodies.Sun.group.position);
    glow.scale.setScalar(bodies.Sun.radius * 7);
    sunLight.position.copy(bodies.Sun.group.position);
    const lit = isView(state.focus) ? null : state.focus === "Moon" ? bodies.Earth : bodies[state.focus];
    const lightD = lit && lit.data.id !== "Sun" ? Math.max(0.39, distanceAU(lit.pos)) : 1;
    const wantI = SUN_INTENSITY * Math.pow(1 / lightD, 0.6);
    sunLight.intensity += (wantI - sunLight.intensity) * 0.06;

    moonOrbit.visible = state.showOrbits;
    moonOrbit.position.set(bodies.Earth.pos[0] - c[0], bodies.Earth.pos[1] - c[1], bodies.Earth.pos[2] - c[2]);
    moonOrbit.scale.setScalar(moonDistDisp);
    const ahead = moonOffset(simMs + 6 * 3600000);
    const nx = moonVec[1] * ahead[2] - moonVec[2] * ahead[1];
    const ny = moonVec[2] * ahead[0] - moonVec[0] * ahead[2];
    const nz = moonVec[0] * ahead[1] - moonVec[1] * ahead[0];
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 0) moonOrbit.quaternion.setFromUnitVectors(UP, tmp.set(nx / nl, ny / nl, nz / nl));

    sky.follow(camera.position);

    const arrivals = [];
    if (pulse.emitMs !== null) {
      const elapsed = (simMs - pulse.emitMs) / 1000;
      if (elapsed < 0 || elapsed * C_AU_S > PULSE_MAX_AU) {
        pulse.end = elapsed < 0 ? "reversed" : "range";
        pulse.emitMs = null;
        pulse.mesh.visible = false;
      } else {
        pulse.radius = elapsed * C_AU_S;
        pulse.mesh.visible = true;
        pulse.mesh.position.set(-c[0], -c[1], -c[2]);
        pulse.mesh.scale.setScalar(Math.max(pulse.radius, 1e-9));
        for (const p of PLANETS) {
          const d = distanceAU(bodies[p.id].pos);
          if (!pulse.logged.has(p.id) && pulse.radius >= d) {
            const prevD = pulse.prevDist[p.id] ?? d;
            const f0 = pulse.prevElapsed * C_AU_S - prevD;
            const f1 = elapsed * C_AU_S - d;
            const frac = f1 - f0 > 0 ? Math.min(1, Math.max(0, -f0 / (f1 - f0))) : 1;
            pulse.logged.add(p.id);
            arrivals.push({
              id: p.id,
              name: p.name,
              seconds: pulse.prevElapsed + frac * (elapsed - pulse.prevElapsed),
              au: d,
            });
          }
          pulse.prevDist[p.id] = d;
        }
        pulse.prevElapsed = elapsed;
      }
    }

    return {
      arrivals,
      pulseRadius: pulse.emitMs === null ? null : pulse.radius,
      pulseEnd: pulse.emitMs === null ? pulse.end : null,
    };
  }

  function emitPulse(simMs) {
    pulse.emitMs = simMs;
    pulse.logged = new Set();
    pulse.radius = 0;
    pulse.prevElapsed = 0;
    pulse.prevDist = {};
    for (const p of PLANETS) pulse.prevDist[p.id] = distanceAU(bodies[p.id].pos);
  }

  function stopPulse() {
    pulse.emitMs = null;
    pulse.mesh.visible = false;
  }

  function setTrueScale(v) {
    const focused = Object.hasOwn(bodies, state.focus) ? bodies[state.focus] : null;
    const before = focused ? focused.radius : 0;
    state.trueScale = v;
    if (focused) {
      const after = displayRadius(focused.data);
      if (before > 0 && after > 0) camera.position.multiplyScalar(after / before);
    }
    controls.minDistance = isView(state.focus) ? 0.01 : displayRadius(bodies[state.focus].data) * 1.15;
  }

  function pick(x, y) {
    let front = null;
    let frontCd = Infinity;
    let near = null;
    let nearD = Infinity;
    for (const id of Object.keys(bodies)) {
      const b = bodies[id];
      if (!b.onScreen || b.crowded) continue;
      const d = Math.hypot(b.sx - x, b.sy - y);
      if (b.sr > 4 && d < b.sr && b.cd < frontCd) {
        front = id;
        frontCd = b.cd;
      }
      if (d < Math.max(16, b.sr) && d < nearD) {
        near = id;
        nearD = d;
      }
    }
    return front || near;
  }

  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
      const id = pick(e.clientX, e.clientY);
      if (id) onSelect(id);
    }
    down = null;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons) return;
    state.hoverId = pick(e.clientX, e.clientY);
    canvas.style.cursor = state.hoverId ? "pointer" : "grab";
  });

  function diagnostics() {
    const gl = renderer.getContext();
    let gpu = "unknown";
    try {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } catch {
      gpu = "unavailable";
    }
    return {
      gpu,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      degraded: state.degraded,
      textureMs: state.textureMs,
    };
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);

  function render() {
    controls.update();
    camera.updateMatrixWorld();
    for (const id of Object.keys(bodies)) {
      const b = bodies[id];
      if (b.night) b.night.value.copy(b.sunDir).transformDirection(camera.matrixWorldInverse);
    }
    renderer.render(scene, camera);
  }

  return {
    state,
    bodies,
    camera,
    controls,
    update,
    render,
    setFocus,
    emitPulse,
    stopPulse,
    setTrueScale,
    loadTextures,
    setTextureQuality,
    textureTiers,
    diagnostics,
    pulse,
  };
}
