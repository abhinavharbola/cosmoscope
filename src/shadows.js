import { SUN, PLANETS, MOONS, AU_KM } from "./data.js";

const R_SUN_AU = SUN.radiusKm / AU_KM;
const R_EARTH_AU = PLANETS.find((p) => p.id === "Earth").radiusKm / AU_KM;
const R_MOON_AU = MOONS.find((m) => m.id === "Moon").radiusKm / AU_KM;

export function eclipseSlot(THREE) {
  return {
    casterPos: { value: new THREE.Vector3() },
    sunPos: { value: new THREE.Vector3() },
    casterRadius: { value: 0 },
    sunRadius: { value: 0 },
    umbraLength: { value: 1 },
  };
}

function fill(slot, caster, sunRel, casterRadiusAU, trueScale) {
  slot.casterPos.value.set(caster[0], caster[1], caster[2]);
  slot.sunPos.value.set(sunRel[0], sunRel[1], sunRel[2]);
  slot.casterRadius.value = trueScale ? casterRadiusAU : 0;
  slot.sunRadius.value = R_SUN_AU;
  const d = Math.hypot(caster[0] - sunRel[0], caster[1] - sunRel[1], caster[2] - sunRel[2]);
  slot.umbraLength.value = (casterRadiusAU * d) / (R_SUN_AU - casterRadiusAU) || 1;
}

export function updateEclipseUniforms(uniforms, sunRel, earthRel, moonRel, trueScale) {
  fill(uniforms.Earth, moonRel, sunRel, R_MOON_AU, trueScale);
  fill(uniforms.Moon, earthRel, sunRel, R_EARTH_AU, trueScale);
}
