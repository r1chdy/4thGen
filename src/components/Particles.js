import * as THREE from 'three'

const COUNT = 550

const VERT = `
uniform float uTime;
attribute float aPhase;
attribute float aSpeed;
attribute float aSize;
attribute float aAlpha;
attribute float aTwinkle;
attribute vec3  aColor;
varying vec3  vColor;
varying float vAlpha;
varying float vTwinkle;

void main() {
  vec3 pos = position;
  float t  = fract(uTime * aSpeed + aPhase);

  pos.y += (t - 0.5) * 28.0;
  pos.x += sin(uTime * aSpeed * 1.3 + aPhase * 6.28318) * 0.9;
  pos.z += cos(uTime * aSpeed * 0.7 + aPhase * 3.14159) * 0.7;

  float fadeIn  = smoothstep(0.0, 0.12, t);
  float fadeOut = 1.0 - smoothstep(0.88, 1.0, t);
  float fade    = fadeIn * fadeOut;

  vColor   = aColor;
  vAlpha   = fade * aAlpha;
  vTwinkle = uTime * aTwinkle + aPhase * 6.28318;

  gl_PointSize = aSize * fade;
  gl_Position  = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const FRAG = `
varying vec3  vColor;
varying float vAlpha;
varying float vTwinkle;

void main() {
  vec2  uv   = gl_PointCoord - 0.5;
  float d    = length(uv) * 2.0;
  if (d > 1.0) discard;

  float core    = exp(-d * 4.5);
  float halo    = pow(1.0 - d, 2.0);
  float twinkle = 0.70 + 0.30 * sin(vTwinkle);
  float alpha   = (core * 0.65 + halo * 0.35) * vAlpha * twinkle;

  gl_FragColor = vec4(vColor + core * vec3(0.18, 0.02, 0.02), alpha);
}
`

export class Particles {
  constructor(scene) {
    const geo = new THREE.BufferGeometry()
    const pos     = new Float32Array(COUNT * 3)
    const phase   = new Float32Array(COUNT)
    const speed   = new Float32Array(COUNT)
    const size    = new Float32Array(COUNT)
    const alpha   = new Float32Array(COUNT)
    const twinkle = new Float32Array(COUNT)
    const color   = new Float32Array(COUNT * 3)

    const palette = [
      [0.55, 0.03, 0.05],
      [0.86, 0.21, 0.21],
      [0.83, 0.69, 0.22],
      [0.95, 0.90, 0.85],
    ]
    const weights = [0.40, 0.30, 0.20, 0.10]

    for (let i = 0; i < COUNT; i++) {
      const angle  = Math.random() * Math.PI * 2
      const radius = 0.5 + Math.random() * 5.5
      pos[i*3    ] = Math.cos(angle) * radius
      pos[i*3 + 1] = (Math.random() - 0.5) * 28.0
      pos[i*3 + 2] = Math.sin(angle) * radius

      phase[i]   = Math.random()
      speed[i]   = 0.015 + Math.random() * 0.055
      twinkle[i] = 0.8 + Math.random() * 2.5

      const r = Math.random()
      if      (r < 0.60) size[i] = 1.5 + Math.random() * 2.5
      else if (r < 0.88) size[i] = 4.0 + Math.random() * 5.0
      else               size[i] = 11.0 + Math.random() * 9.0

      alpha[i] = 0.25 + Math.random() * 0.75

      let cr = Math.random(), cumW = 0, cIdx = 0
      for (let c = 0; c < weights.length; c++) {
        cumW += weights[c]
        if (cr < cumW) { cIdx = c; break }
      }
      color[i*3    ] = palette[cIdx][0]
      color[i*3 + 1] = palette[cIdx][1]
      color[i*3 + 2] = palette[cIdx][2]
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos,     3))
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phase,   1))
    geo.setAttribute('aSpeed',   new THREE.BufferAttribute(speed,   1))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(size,    1))
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alpha,   1))
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1))
    geo.setAttribute('aColor',   new THREE.BufferAttribute(color,   3))

    this._uniforms = { uTime: { value: 0 } }

    const mat = new THREE.ShaderMaterial({
      uniforms:       this._uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    })

    this._points = new THREE.Points(geo, mat)
    this._points.frustumCulled = false
    this._points.renderOrder   = 101
    scene.instance.add(this._points)
  }

  update({ elapsed }) {
    this._uniforms.uTime.value = elapsed
  }

  destroy() {
    this._points.geometry.dispose()
    this._points.material.dispose()
    this._points.parent?.remove(this._points)
  }
}
