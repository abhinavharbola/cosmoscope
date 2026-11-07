import * as THREE from "three";

export function circleSprite(color) {
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

export function radialRing(inner, outer, tex) {
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
  mat.customProgramCacheKey = () => "ring-shadow";
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

export function atmosphereMaterial(cfg) {
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

export function pulseMaterial() {
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
export function patchShadow(mat, nightUniform, eclipse) {
  mat.customProgramCacheKey = () => `surface-shadow:${nightUniform ? "n" : "-"}${eclipse ? "e" : "-"}`;
  mat.onBeforeCompile = (shader) => {
    if (nightUniform) shader.uniforms.uSunView = nightUniform;
    if (eclipse) {
      shader.uniforms.uCasterPos = eclipse.casterPos;
      shader.uniforms.uSunPos = eclipse.sunPos;
      shader.uniforms.uCasterRadius = eclipse.casterRadius;
      shader.uniforms.uSunRadius = eclipse.sunRadius;
      shader.uniforms.uUmbraLength = eclipse.umbraLength;
    }
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldEclipse;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorldEclipse = (modelMatrix * vec4(position, 1.0)).xyz;");
    let prelude = "";
    if (nightUniform) prelude += "uniform vec3 uSunView;\n";
    if (eclipse) {
      prelude +=
        "uniform vec3 uCasterPos;\nuniform vec3 uSunPos;\nuniform float uCasterRadius;\nuniform float uSunRadius;\nuniform float uUmbraLength;\n";
    }
    prelude += "varying vec3 vWorldEclipse;";
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${prelude}`
    );
    if (nightUniform) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - smoothstep(-0.14, 0.06, dot(normalize(vNormal), uSunView));"
      );
    }
    if (eclipse) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        [
          "{",
          "  vec3 C = uCasterPos;",
          "  vec3 S = uSunPos;",
          "  vec3 S_to_C = C - S;",
          "  float D = length(S_to_C);",
          "  if (D > 1e-9 && uCasterRadius > 0.0) {",
          "    vec3 awayFromSun = S_to_C / D;",
          "    vec3 V = vWorldEclipse - C;",
          "    float t = dot(V, awayFromSun);",
          "    if (t > 0.0) {",
          "      float perp = length(V - t * awayFromSun);",
          "      float umbraR = max(0.0, uCasterRadius * (1.0 - t / uUmbraLength));",
          "      float penumbraR = uCasterRadius + t * uSunRadius / D;",
          "      if (perp < umbraR) {",
          "        outgoingLight *= 0.05;",
          "      } else if (perp < penumbraR) {",
          "        float f = (perp - umbraR) / max(penumbraR - umbraR, 1e-9);",
          "        outgoingLight *= mix(0.05, 1.0, f);",
          "      }",
          "    }",
          "  }",
          "}",
          "#include <opaque_fragment>",
        ].join("\n")
      );
    }
  };
}
