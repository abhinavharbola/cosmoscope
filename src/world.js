import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SUN, PLANETS, MOONS, AU_KM, C_AU_S, POLES } from "./data.js";
import { helioPosition, moonOffset, orbitSamples, orbitalPeriodDays, greenwichRaRad, poleVector, distanceAU } from "./ephemeris.js";
import { orbitWindowStart } from "./timeutil.js";
import { moonSpinAngle, nodeOffset, primeMeridianRad } from "./frame.js";
import { buildMaps, sunMap, ringTexture, glowTexture, loadManifest, loadSurface, disposeMaps } from "./textures.js";
import { TIERS, BASE_TIER, availableTiers, surfaceKey } from "./texmanifest.js";
import { createSky } from "./sky.js";
import { circleSprite, radialRing, atmosphereMaterial, pulseMaterial, patchShadow } from "./materials.js";
import { createSpin, stepSpin } from "./spin.js";
import { crossingSeconds } from "./pulse.js";
import { VIEWS, OVERVIEW_DIST } from "./views.js";
import { eclipseSlot, updateEclipseUniforms } from "./shadows.js";
import { MOON_SYSTEMS, moonDisplayDistance } from "./moonlayout.js";
import { createTrack, pathPoints, pathHead, trailAlpha, trailSpanMs, loadCatalog } from "./missions.js";

const ART_BASE = 0.035;
const PULSE_MAX_AU = 120;
const ORBIT_REBUILD_MS = 25 * 365.25 * 86400000;
const SUN_INTENSITY = 7;
const UP = new THREE.Vector3(0, 1, 0);
const TEXTURE_FIRST = ["Earth", "Sun", "Jupiter", "Saturn", "Mars"];
const TEXTURE_ORDER = [
  ...TEXTURE_FIRST,
  ...[SUN, ...PLANETS, ...MOONS].map((b) => b.id).filter((id) => !TEXTURE_FIRST.includes(id)),
];

const isView = (id) => Object.hasOwn(VIEWS, id);

function artisticRadius(body) {
  if (body.id === "Sun") return 0.1;
  return ART_BASE * Math.pow(body.radiusKm / 6371, 0.45);
}

function trueRadius(body) {
  return body.radiusKm / AU_KM;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
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
  const craft = Object.create(null);
  const state = {
    trueScale: false,
    showOrbits: true,
    showLabels: true,
    showMissions: true,
    missionSource: null,
    missionGenerated: null,
    focus: "Overview",
    center: [0, 0, 0],
    trans: null,
    lastNow: null,
    lastSimMs: null,
    contextLost: false,
    hoverId: null,
    orbitBuiltMs: null,
    degraded: false,
    textured: new Set(),
    surfaces: {},
    textureQuality: BASE_TIER,
    textureMs: null,
    eclipseView: false,
  };
  let surfaceManifest = Object.create(null);
  const surfaceTokens = {};
  const patched = [];

  const eclipseUniforms = { Earth: eclipseSlot(THREE), Moon: eclipseSlot(THREE) };

  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    if (state.degraded) return;
    state.degraded = true;
    console.warn("A custom shader failed to compile. Falling back to plain materials.");
    patched.forEach((m) => {
      m.customProgramCacheKey = () => "plain";
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
    if (!isSun && !data.parent) {
      orbit = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
      );
      orbit.frustumCulled = false;
      scene.add(orbit);
    }

    const body = {
      data,
      parent: data.parent || null,
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
      spin: createSpin(),
      orbitHead: -1,
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
      _trueOffset: [0, 0, 0],
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
  MOONS.forEach((m) => buildBody(m));

  const CRAFT_PATH_POINTS = 2400;
  const CRAFT_LABEL_GAP = 26;

  function buildCraft(entry) {
    const track = createTrack(entry);
    const path = pathPoints(entry, CRAFT_PATH_POINTS);
    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
    );
    line.frustumCulled = false;
    const col = new Float32Array(path.ms.length * 4);
    line.geometry.setAttribute("position", new THREE.BufferAttribute(path.pts, 3));
    line.geometry.setAttribute("color", new THREE.BufferAttribute(col, 4));
    line.geometry.computeBoundingSphere();
    scene.add(line);

    const marker = circleSprite(entry.color);
    marker.scale.set(0.009, 0.009, 1);
    marker.renderOrder = 10;
    scene.add(marker);

    const label = document.createElement("button");
    label.className = "label craft";
    label.textContent = entry.name;
    label.addEventListener("click", () => onSelect(entry.id));
    labelsEl.appendChild(label);

    craft[entry.id] = {
      data: entry,
      track,
      path,
      line,
      col,
      rgb: new THREE.Color(entry.color).lerp(new THREE.Color(0xffffff), 0.15),
      span: trailSpanMs(entry),
      head: -1,
      marker,
      label,
      pos: [0, 0, 0],
      active: false,
      onScreen: false,
      shown: false,
      sx: 0,
      sy: 0,
      cd: 0,
    };
  }

  function clearCraft() {
    for (const id of Object.keys(craft)) {
      const cr = craft[id];
      scene.remove(cr.line);
      scene.remove(cr.marker);
      cr.line.geometry.dispose();
      cr.line.material.dispose();
      cr.marker.material.map.dispose();
      cr.marker.material.dispose();
      cr.label.remove();
      delete craft[id];
    }
    if (!isView(state.focus) && !Object.hasOwn(bodies, state.focus)) state.focus = "Overview";
  }

  function setMissions(catalog) {
    clearCraft();
    state.missionSource = catalog.source;
    state.missionGenerated = catalog.generated;
    for (const entry of Object.values(catalog.objects)) {
      if (!Object.hasOwn(bodies, entry.id) && !isView(entry.id)) buildCraft(entry);
    }
    return Object.values(craft).map((c) => c.data);
  }

  async function loadMissions(url) {
    try {
      return setMissions(await loadCatalog(url));
    } catch (err) {
      console.warn("Missions unavailable", err);
      return [];
    }
  }

  function updateCraftPath(cr) {
    const ms = cr.path.ms;
    const head = pathHead(ms, cr.simMs);
    if (head === cr.head) return;
    cr.head = head;
    const at = ms[head];
    const col = cr.col;
    const c = cr.rgb;
    for (let i = 0; i < ms.length; i++) {
      col[i * 4] = c.r;
      col[i * 4 + 1] = c.g;
      col[i * 4 + 2] = c.b;
      col[i * 4 + 3] = trailAlpha(at - ms[i], cr.span);
    }
    cr.line.geometry.attributes.color.needsUpdate = true;
  }

  function craftFocusDistance(cr) {
    return Math.min(30, Math.max(0.02, 0.1 * distanceAU(cr.pos)));
  }

  function minDistanceFor(id, eclipse = false) {
    if (eclipse) return 0.001;
    if (isView(id)) return 0.01;
    if (Object.hasOwn(craft, id)) return 1e-4;
    return displayRadius(bodies[id].data) * 1.15;
  }

  const moonRings = {};
  for (const m of MOONS) {
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 128 }, (_, i) => {
          const a = (i / 128) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        })
      ),
      new THREE.LineBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.4, depthWrite: false })
    );
    ring.frustumCulled = false;
    scene.add(ring);
    moonRings[m.id] = ring;
  }

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
    b.orbitHead = -1;
    b.orbitPts = pts;
    b.orbitCol = new Float32Array(n * 4);
    b.orbit.geometry.dispose();
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
    if (head === b.orbitHead) return;
    b.orbitHead = head;
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
    }
    const eclipse = eclipseUniforms[b.data.id];
    if (b.night || eclipse) {
      patchShadow(mat, b.night, eclipse);
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
      const cloudEclipse = eclipseUniforms[b.data.id];
      if (cloudEclipse) {
        patchShadow(clouds.material, null, cloudEclipse);
        patched.push(clouds.material);
      }
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
    const loaded = await loadSurface(entry, wanted, cur.files);
    if (!loaded) return;
    if (token !== surfaceTokens[id]) {
      disposeMaps(loaded.maps);
      return;
    }
    swapMaps(b, loaded.maps);
    cur.tier = loaded.tier;
    cur.key = loaded.key;
    cur.files = loaded.files;
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
    if (!availableTiers(surfaceManifest).includes(state.textureQuality)) state.textureQuality = BASE_TIER;
    try {
      await sky.load();
    } catch (err) {
      console.warn("Texture for sky failed", err);
    }
    const total = TEXTURE_ORDER.length;
    let done = 0;
    for (const id of TEXTURE_ORDER) {
      const b = bodies[id];
      if (!b) continue;
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
            files: real.files,
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
    if (state.eclipseView) return 0.006;
    if (Object.hasOwn(craft, id)) return craftFocusDistance(craft[id]);
    const b = bodies[id];
    const ringFactor = b.data.rings ? 2.4 : 1;
    if (state.trueScale) {
      const sys = MOON_SYSTEMS[id];
      if (sys && Number.isFinite(sys.aMax)) {
        return Math.max(b.radius * 4 * ringFactor, sys.aMax * 1.5);
      }
      return Math.max(b.radius * 3, 1e-7);
    }
    return Math.max(b.radius * 4 * ringFactor, 1e-7);
  }

  function setFocus(id, options = {}) {
    if (!isView(id) && !Object.hasOwn(bodies, id) && !Object.hasOwn(craft, id)) return;
    state.focus = id;
    state.eclipseView = !!options.eclipse;
    syncTiers();
    const fromDist = camera.position.length();
    state.trans = { from: state.center.slice(), t0: performance.now(), dur: 2200, fromDist, id };
    controls.minDistance = minDistanceFor(id, !!options.eclipse);
  }

  function update(simMs, timeScale, nowMs) {
    const jumped = state.lastSimMs !== null && Math.abs(simMs - state.lastSimMs) > 365.25 * 86400000;
    state.lastSimMs = simMs;
    if (state.orbitBuiltMs === null) rebuildOrbits(simMs, true);
    else if (Math.abs(simMs - state.orbitBuiltMs) > ORBIT_REBUILD_MS) rebuildOrbits(simMs, jumped);
    if (rebuildQueue.length) buildOrbit(rebuildQueue.shift(), rebuildMs);

    const frameDt = state.lastNow === null ? 0 : Math.min(0.1, Math.max(0, (nowMs - state.lastNow) / 1000));
    state.lastNow = nowMs;
    for (const p of PLANETS) bodies[p.id].pos = helioPosition(p.id, simMs);
    bodies.Sun.pos = [0, 0, 0];

    for (const id of Object.keys(bodies)) bodies[id].radius = displayRadius(bodies[id].data);

    for (const moon of MOONS) {
      const b = bodies[moon.id];
      const parent = bodies[moon.parent];
      const trueOffset = moonOffset(moon.id, simMs);
      const trueLen = Math.hypot(trueOffset[0], trueOffset[1], trueOffset[2]);

      const dispDist = moonDisplayDistance(moon, parent, trueLen, state.trueScale);
      const k = trueLen > 1e-12 ? dispDist / trueLen : 0;
      b.pos = [
        parent.pos[0] + trueOffset[0] * k,
        parent.pos[1] + trueOffset[1] * k,
        parent.pos[2] + trueOffset[2] * k,
      ];
      b._trueOffset = trueOffset;
    }

    for (const cr of Object.values(craft)) {
      cr.simMs = simMs;
      cr.active = cr.track.inRange(simMs);
      cr.pos = cr.track.positionAt(simMs);
    }

    const focusCraft = Object.hasOwn(craft, state.focus) ? craft[state.focus] : null;
    const targetPos = isView(state.focus) ? [0, 0, 0] : focusCraft ? focusCraft.pos : bodies[state.focus].pos;

    if (state.trans) {
      const t = Math.min(1, Math.max(0, (nowMs - state.trans.t0) / state.trans.dur));
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

    controls.update();
    camera.updateMatrixWorld();

    const c = state.center;
    const halfH = window.innerHeight / 2;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const sunRel = new THREE.Vector3(-c[0], -c[1], -c[2]);
    const tmp = new THREE.Vector3();
    {
      const earthRel = [bodies.Earth.pos[0] - c[0], bodies.Earth.pos[1] - c[1], bodies.Earth.pos[2] - c[2]];
      const moonOff = moonOffset("Moon", simMs);
      const moonRel = [earthRel[0] + moonOff[0], earthRel[1] + moonOff[1], earthRel[2] + moonOff[2]];
      updateEclipseUniforms(eclipseUniforms, [sunRel.x, sunRel.y, sunRel.z], earthRel, moonRel, state.trueScale);
    }

    const earthSpin = greenwichRaRad(simMs);
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
      const spinSign = b.data.spinSign ?? 1;
      if (b.data.parent) {
        b.mesh.rotation.y = moonSpinAngle(b._trueOffset, b.tilt.quaternion);
      } else {
        const rate = periodSec > 0 ? (Math.abs(timeScale) * 2 * Math.PI) / periodSec : 0;
        let trueAngle = null;
        if (id === "Earth") trueAngle = earthSpin;
        else if (b.data.W0 !== undefined) trueAngle = primeMeridianRad(b.data.W0, b.data.Wdot, simMs) + b.phi;
        b.mesh.rotation.y = stepSpin(b.spin, trueAngle, rate, spinSign * (timeScale < 0 ? -1 : 1), frameDt);
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
      if (b.data.parent && state.focus !== id) {
        const parent = bodies[b.data.parent];
        if (parent && Math.hypot(b.sx - parent.sx, b.sy - parent.sy) < 56) {
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

    const shownMoons = [];
    for (const moon of MOONS) {
      const mb = bodies[moon.id];
      if (!mb.shown) continue;
      let hide = false;
      for (const other of shownMoons) {
        if (Math.hypot(mb.sx - other.sx, mb.sy - other.sy) < 40) {
          hide = true;
          break;
        }
      }
      if (hide) {
        mb.shown = false;
        mb.crowded = true;
        mb.label.style.display = "none";
      } else {
        shownMoons.push({ sx: mb.sx, sy: mb.sy });
      }
    }

    const labelled = [];
    for (const id of Object.keys(bodies)) if (bodies[id].shown) labelled.push(bodies[id]);
    for (const cr of Object.values(craft)) {
      const rx = cr.pos[0] - c[0];
      const ry = cr.pos[1] - c[1];
      const rz = cr.pos[2] - c[2];
      const visible = state.showMissions && cr.active;
      cr.line.position.set(-c[0], -c[1], -c[2]);
      const precision = 1.2e-4 * Math.max(0.1, distanceAU(cr.pos));
      const craftFade = state.focus === cr.data.id ? smoothstep(precision, precision * 4, camLen) : 1;
      cr.line.material.opacity = craftFade;
      cr.line.visible = state.showMissions && state.showOrbits && craftFade > 0.01;
      if (cr.line.visible) updateCraftPath(cr);
      cr.marker.position.set(rx, ry, rz);
      cr.marker.visible = visible;
      tmp.set(rx, ry, rz).project(camera);
      cr.sx = ((tmp.x + 1) / 2) * window.innerWidth;
      cr.sy = ((1 - tmp.y) / 2) * window.innerHeight;
      cr.cd = Math.hypot(camera.position.x - rx, camera.position.y - ry, camera.position.z - rz);
      cr.onScreen = visible && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      let show = state.showLabels && cr.onScreen;
      if (show && state.focus !== cr.data.id) {
        for (const o of labelled) {
          if (Math.hypot(cr.sx - o.sx, cr.sy - o.sy) < CRAFT_LABEL_GAP) {
            show = false;
            break;
          }
        }
      }
      cr.shown = show;
      if (show) labelled.push(cr);
      cr.label.style.display = show ? "block" : "none";
      if (show) {
        cr.label.style.transform = `translate(${cr.sx.toFixed(1)}px, ${cr.sy.toFixed(1)}px) translate(-50%, calc(-100% - 12px))`;
        cr.label.classList.toggle("active", state.focus === cr.data.id);
        cr.label.classList.toggle("hover", state.hoverId === cr.data.id);
      }
    }

    glow.position.copy(bodies.Sun.group.position);
    glow.scale.setScalar(bodies.Sun.radius * 7);
    sunLight.position.copy(bodies.Sun.group.position);
    const lit = isView(state.focus) ? null : focusCraft ? focusCraft : state.focus === "Moon" ? bodies.Earth : bodies[state.focus];
    const lightD = lit && lit.data.id !== "Sun" ? Math.max(0.39, distanceAU(lit.pos)) : 1;
    const wantI = SUN_INTENSITY * Math.pow(1 / lightD, 0.6);
    sunLight.intensity += (wantI - sunLight.intensity) * (1 - Math.exp(-3.6 * frameDt));

    for (const moon of MOONS) {
      const ring = moonRings[moon.id];
      const b = bodies[moon.id];
      const parent = bodies[moon.parent];
      ring.visible = state.showOrbits;
      if (!ring.visible) continue;
      ring.position.set(parent.pos[0] - c[0], parent.pos[1] - c[1], parent.pos[2] - c[2]);
      const dispDist = Math.hypot(
        b.pos[0] - parent.pos[0],
        b.pos[1] - parent.pos[1],
        b.pos[2] - parent.pos[2]
      );
      ring.scale.setScalar(dispDist || 1e-9);

      const stepMs = Math.min(6 * 3600000, Math.abs(moon.periodDays) * 0.05 * 86400000);
      const cur = moonOffset(moon.id, simMs);
      const fut = moonOffset(moon.id, simMs + stepMs);
      const nx = cur[1] * fut[2] - cur[2] * fut[1];
      const ny = cur[2] * fut[0] - cur[0] * fut[2];
      const nz = cur[0] * fut[1] - cur[1] * fut[0];
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-12) ring.quaternion.setFromUnitVectors(UP, tmp.set(nx / nl, ny / nl, nz / nl));
    }

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
            pulse.logged.add(p.id);
            arrivals.push({
              id: p.id,
              name: p.name,
              seconds: crossingSeconds(pulse.prevElapsed, elapsed, prevD, d, C_AU_S),
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
    controls.minDistance = minDistanceFor(state.focus);
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
    for (const cr of Object.values(craft)) {
      if (!cr.onScreen) continue;
      const d = Math.hypot(cr.sx - x, cr.sy - y);
      if (d < 14 && d < nearD) {
        near = cr.data.id;
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
  canvas.addEventListener("pointercancel", () => {
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    state.contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    state.contextLost = false;
  });

  function render() {
    if (state.contextLost) return;
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
    craft,
    camera,
    controls,
    update,
    render,
    setFocus,
    emitPulse,
    stopPulse,
    setTrueScale,
    loadTextures,
    setMissions,
    loadMissions,
    setTextureQuality,
    textureTiers,
    diagnostics,
    pulse,
  };
}
