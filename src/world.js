import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SUN, PLANETS, MOON, AU_KM, C_AU_S } from "./data.js";
import { helioPosition, moonOffset, orbitSamples, distanceAU } from "./ephemeris.js";
import { proceduralTexture, sunTexture, ringTexture, glowTexture } from "./textures.js";

const ART_BASE = 0.035;
const MOON_ART_ORBIT = ART_BASE * 5;
const OVERVIEW_DIST = 70;
const INNER_DIST = 4.5;
const PULSE_MAX_AU = 120;

export const VIEWS = {
  Overview: { dist: OVERVIEW_DIST },
  Inner: { dist: INNER_DIST },
};

function artisticRadius(body) {
  if (body.id === "Sun") return 0.1;
  if (body.id === "Moon") return ART_BASE * 0.3;
  return ART_BASE * Math.pow(body.radiusKm / 6371, 0.45);
}

function trueRadius(body) {
  return body.radiusKm / AU_KM;
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
  const geo = new THREE.RingGeometry(inner, outer, 160, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

function pulseMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.6 } },
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

export function createWorld(canvas, labelsEl) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1e-8, 1e4);
  const dir = new THREE.Vector3(0.35, 0.5, 0.8).normalize();
  camera.position.copy(dir.multiplyScalar(OVERVIEW_DIST));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 1.1;
  controls.maxDistance = 400;
  controls.minDistance = 0.01;

  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const sunLight = new THREE.PointLight(0xffffff, 10, 0, 0);
  scene.add(sunLight);

  const stars = (() => {
    const n = 4000;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      v.multiplyScalar(3000);
      arr.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const p = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.2, sizeAttenuation: false, depthWrite: false })
    );
    p.frustumCulled = false;
    scene.add(p);
    return p;
  })();

  const bodies = {};
  const state = {
    trueScale: false,
    showOrbits: true,
    showLabels: true,
    focus: "Overview",
    center: [0, 0, 0],
    trans: null,
  };

  function buildBody(data, isSun = false) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = (-data.tiltDeg * Math.PI) / 180;
    let mesh;
    if (isSun) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshBasicMaterial({ map: sunTexture() })
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        new THREE.MeshStandardMaterial({ map: proceduralTexture(data), roughness: 0.95, metalness: 0 })
      );
    }
    tilt.add(mesh);
    let rings = null;
    if (data.rings) {
      rings = radialRing(data.rings.innerKm / data.radiusKm, data.rings.outerKm / data.radiusKm, ringTexture());
      tilt.add(rings);
    }
    group.add(tilt);
    scene.add(group);

    const marker = circleSprite(isSun ? "#ffd27a" : data.palette[0]);
    marker.scale.set(0.012, 0.012, 1);
    marker.renderOrder = 10;
    scene.add(marker);

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = data.name;
    labelsEl.appendChild(label);

    let orbit = null;
    if (!isSun && data.id !== "Moon") {
      orbit = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(data.palette[0]).lerp(new THREE.Color(0xffffff), 0.35),
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        })
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
      marker,
      label,
      orbit,
      pos: [0, 0, 0],
      radius: 0,
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
    new THREE.LineBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.45, depthWrite: false })
  );
  moonOrbit.frustumCulled = false;
  scene.add(moonOrbit);

  const pulse = {
    emitMs: null,
    mesh: new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), pulseMaterial()),
    logged: new Set(),
    radius: 0,
  };
  pulse.mesh.visible = false;
  pulse.mesh.renderOrder = 20;
  pulse.mesh.frustumCulled = false;
  scene.add(pulse.mesh);

  function rebuildOrbits(startMs) {
    PLANETS.forEach((p) => {
      const b = bodies[p.id];
      const pts = orbitSamples(p.id, startMs, p.periodDays, p.periodDays > 20000 ? 720 : 360);
      b.orbit.geometry.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      b.orbit.geometry.computeBoundingSphere();
    });
  }

  function displayRadius(data) {
    return state.trueScale ? trueRadius(data) : artisticRadius(data);
  }

  function desiredDistance(id) {
    if (VIEWS[id]) return VIEWS[id].dist;
    const b = bodies[id];
    const ringFactor = b.data.rings ? 2.4 : 1;
    return Math.max(b.radius * 4 * ringFactor, 1e-7);
  }

  function setFocus(id) {
    state.focus = id;
    const fromDist = camera.position.length();
    state.trans = { from: state.center.slice(), t0: performance.now(), dur: 2200, fromDist, id };
    if (!VIEWS[id]) {
      const r = displayRadius(bodies[id].data);
      controls.minDistance = r * 1.15;
    } else {
      controls.minDistance = 0.01;
    }
  }

  function update(simMs, timeScale, nowMs) {
    const sunB = bodies.Sun;
    const earth = helioPosition("Earth", simMs);
    for (const p of PLANETS) bodies[p.id].pos = helioPosition(p.id, simMs);
    sunB.pos = [0, 0, 0];

    const moonVec = moonOffset(simMs);
    const moonLen = Math.hypot(moonVec[0], moonVec[1], moonVec[2]);
    const earthDisp = displayRadius(bodies.Earth.data);
    const moonDistDisp = state.trueScale ? moonLen : Math.max(MOON_ART_ORBIT, earthDisp * 4);
    const k = moonDistDisp / moonLen;
    bodies.Moon.pos = [earth[0] + moonVec[0] * k, earth[1] + moonVec[1] * k, earth[2] + moonVec[2] * k];

    for (const id of Object.keys(bodies)) bodies[id].radius = displayRadius(bodies[id].data);

    let targetPos = [0, 0, 0];
    if (!VIEWS[state.focus]) targetPos = bodies[state.focus].pos;

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
    const camLen = camera.position.length();

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
      if (b.data.id === "Moon") {
        b.mesh.rotation.y = Math.atan2(moonVec[0], -moonVec[2]) + Math.PI;
      } else if (perFrame < 0.5) {
        b.mesh.rotation.y = ((simMs / 1000) / periodSec) * 2 * Math.PI;
      } else {
        b.mesh.rotation.y = (nowMs / 1000) * 0.3;
      }

      const camToBody = Math.hypot(camera.position.x - rx, camera.position.y - ry, camera.position.z - rz);
      const px = (b.radius / Math.max(camToBody, 1e-12)) * (halfH / tanHalf);
      b.marker.visible = px < 3;
      b.mesh.visible = true;

      if (b.orbit) {
        b.orbit.position.set(-c[0], -c[1], -c[2]);
        b.orbit.visible = state.showOrbits;
      }

      const v = new THREE.Vector3(rx, ry, rz).project(camera);
      const visible = state.showLabels && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      b.label.style.display = visible ? "block" : "none";
      if (visible) {
        b.label.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
        b.label.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
      }
    }

    const sunRad = bodies.Sun.radius;
    glow.position.copy(bodies.Sun.group.position);
    glow.scale.setScalar(sunRad * 7);
    sunLight.position.copy(bodies.Sun.group.position);

    moonOrbit.visible = state.showOrbits;
    moonOrbit.position.set(bodies.Earth.pos[0] - c[0], bodies.Earth.pos[1] - c[1], bodies.Earth.pos[2] - c[2]);
    moonOrbit.scale.setScalar(moonDistDisp);

    stars.position.copy(camera.position);

    let arrivals = [];
    if (pulse.emitMs !== null) {
      const elapsed = (simMs - pulse.emitMs) / 1000;
      if (elapsed < 0 || elapsed * C_AU_S > PULSE_MAX_AU) {
        pulse.emitMs = null;
        pulse.mesh.visible = false;
      } else {
        pulse.radius = elapsed * C_AU_S;
        pulse.mesh.visible = true;
        pulse.mesh.position.set(-c[0], -c[1], -c[2]);
        pulse.mesh.scale.setScalar(Math.max(pulse.radius, 1e-9));
        pulse.mesh.material.uniforms.uOpacity.value = 0.7;
        for (const p of PLANETS) {
          if (pulse.logged.has(p.id)) continue;
          const d = distanceAU(bodies[p.id].pos);
          if (pulse.radius >= d) {
            pulse.logged.add(p.id);
            arrivals.push({ id: p.id, name: p.name, seconds: d / C_AU_S, au: d });
          }
        }
      }
    }

    return { arrivals, camLen };
  }

  function emitPulse(simMs) {
    pulse.emitMs = simMs;
    pulse.logged = new Set();
    pulse.radius = 0;
  }

  function setTrueScale(v) {
    state.trueScale = v;
    if (!VIEWS[state.focus]) controls.minDistance = displayRadius(bodies[state.focus].data) * 1.15;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);

  function render() {
    controls.update();
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
    setTrueScale,
    rebuildOrbits,
    pulse,
  };
}
