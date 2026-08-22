export const GLASS_PRESETS = {
  balanced: { name: "Balanced", ior: 1.5168, refraction: 1.35, dispersion: 6, blur: 2.5, fresnel: .62, glare: .58 },
  control: { name: "Control", ior: 1.56883, refraction: 1.05, dispersion: 4.5, blur: 3.5, fresnel: .56, glare: .48 },
  frosted: { name: "Frosted", ior: 1.5168, refraction: .72, dispersion: 2, blur: 8, fresnel: .42, glare: .34 },
  lens: { name: "Lens", ior: 1.78472, refraction: 1.75, dispersion: 10, blur: 1.5, fresnel: .72, glare: .70 }
}

export const glassOptics = { preset: "lens", ...GLASS_PRESETS.lens }

export function applyGlassPreset(key) {
  const preset = GLASS_PRESETS[key]
  if (!preset) return
  Object.assign(glassOptics, preset, { preset: key })
  window.dispatchEvent(new CustomEvent("mn-glass-optics-change", { detail: { ...glassOptics } }))
}

export function setGlassOptic(key, value) {
  if (!(key in glassOptics) || key === "name" || key === "preset") return
  glassOptics[key] = Number(value)
  glassOptics.preset = "custom"
  window.dispatchEvent(new CustomEvent("mn-glass-optics-change", { detail: { ...glassOptics } }))
}
