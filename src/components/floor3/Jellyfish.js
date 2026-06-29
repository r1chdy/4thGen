import * as THREE from 'three'

const PI = Math.PI
const N_AZ       = 36
const N_ZN       = 22
const N_TENT     = 24
const N_SEG      = 14
const N_ORAL     = 4
const N_ORAL_SEG = 32
const ORAL_VPA   = (N_ORAL_SEG + 1) * 2
const FLOAT_RANGE = 40

// ── CPU bell formula (port from aurelia medusaBellFormula.js) ──

function cpuBellPos(phase, z, az, scale) {
  const modPhase = phase - z * z * 0.95 + PI * 0.5
  const ruf = z < 0.5 ? 1.0 : (Math.sin(az * 16.0 + PI * 0.5) * 0.02 + 1.0)
  const xr  = (Math.sin(modPhase) * 0.3 + 1.3) * ruf
  const pol = (Math.sin(modPhase + 3.0) * 0.15 + 0.5) * z * PI
  const r   = Math.sin(pol) * xr
  return [Math.sin(az) * r * scale, Math.cos(pol) * scale, Math.cos(az) * r * scale]
}

// ── Bell geometry ─────────────────────────────────────────────

function makeBellGeo() {
  const vCount = N_AZ * N_ZN
  const pos = new Float32Array(vCount * 3)
  const nrm = new Float32Array(vCount * 3)
  const idx = []
  const azArr = new Float32Array(vCount)
  const znArr = new Float32Array(vCount)

  for (let z = 0; z < N_ZN; z++) {
    for (let a = 0; a < N_AZ; a++) {
      const i = z * N_AZ + a
      azArr[i] = (a / N_AZ) * PI * 2
      znArr[i] = z / (N_ZN - 1)
      if (z < N_ZN - 1) {
        const a1 = (a + 1) % N_AZ
        const i0 = z * N_AZ + a,  i1 = z * N_AZ + a1
        const i2 = (z+1)*N_AZ + a, i3 = (z+1)*N_AZ + a1
        idx.push(i0, i2, i1, i1, i2, i3)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(pos, 3)
  const nrmAttr = new THREE.BufferAttribute(nrm, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  nrmAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('normal',   nrmAttr)
  geo.setIndex(idx)
  geo._az = azArr
  geo._zn = znArr
  return geo
}

function updateBellGeo(geo, phase, scale) {
  const pos = geo.getAttribute('position').array
  const nrm = geo.getAttribute('normal').array
  const azA = geo._az
  const znA = geo._zn
  const dv  = 0.012

  for (let i = 0, n = N_AZ * N_ZN; i < n; i++) {
    const az = azA[i], zn = znA[i]
    const [px, py, pz] = cpuBellPos(phase, zn, az, scale)
    pos[i*3] = px; pos[i*3+1] = py; pos[i*3+2] = pz

    let nx, ny, nz
    if (zn < 0.02) {
      nx = 0; ny = 1; nz = 0
    } else {
      const [ax, ay, az_] = cpuBellPos(phase, zn, az + dv, scale)
      const [bx, by, bz]  = cpuBellPos(phase, Math.min(1, zn + dv), az, scale)
      const ux = ax-px, uy = ay-py, uz = az_-pz
      const vx = bx-px, vy = by-py, vz = bz-pz
      nx = uy*vz - uz*vy
      ny = uz*vx - ux*vz
      nz = ux*vy - uy*vx
      // Flip so normal points radially outward from bell axis (not always upward)
      if (px * nx + pz * nz < 0) { nx=-nx; ny=-ny; nz=-nz }
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1
      nx /= len; ny /= len; nz /= len
    }
    nrm[i*3] = nx; nrm[i*3+1] = ny; nrm[i*3+2] = nz
  }

  geo.getAttribute('position').needsUpdate = true
  geo.getAttribute('normal').needsUpdate   = true
}

// ── Bell material — MeshPhysical + floor3 clip injection ──────

function makeBellMat() {
  const mat = new THREE.MeshPhysicalMaterial({
    color:                    new THREE.Color(0.55, 0.06, 0.06),
    emissive:                 new THREE.Color(0.42, 0.02, 0.02),
    emissiveIntensity:        1.8,
    iridescence:              1.0,
    iridescenceIOR:           1.5,
    iridescenceThicknessRange:[80, 450],
    roughness:                0.08,
    metalness:                0.0,
    clearcoat:                1.0,
    clearcoatRoughness:       0.05,
    transparent:              true,
    opacity:                  0.70,
    side:                     THREE.FrontSide,
    depthWrite:               false,
  })

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `varying float v_wy;
        varying vec4  v_cp;
        void main() {`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        v_wy = (modelMatrix * vec4(position, 1.0)).y;
        v_cp = gl_Position;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying float v_wy;
        varying vec4  v_cp;
        void main() {
          vec2  _uv = (v_cp.xy / v_cp.w) * 0.5 + 0.5;
          float _ty = v_wy + (_uv.x - 0.5) * 1.5;
          if (_ty >= -9.0) discard;
          float _bf = smoothstep(-9.0, -18.0, _ty);`
      )
      .replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a * _bf );'
      )
  }

  mat.customProgramCacheKey = () => 'jf-bell-v2'
  return mat
}

// ── Tentacle shaders ──────────────────────────────────────────

const tentVert = `
attribute float aAlpha;
varying float vWorldY;
varying vec4  vClipPos;
varying float vAlpha;
void main() {
  vWorldY  = (modelMatrix * vec4(position, 1.0)).y;
  vec4 mv  = modelViewMatrix * vec4(position, 1.0);
  vClipPos = projectionMatrix * mv;
  gl_Position = vClipPos;
  vAlpha = aAlpha;
}
`

const tentFrag = `
varying float vWorldY;
varying vec4  vClipPos;
varying float vAlpha;
uniform float uTime;
void main() {
  vec2 sUV    = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
  float tiltY = vWorldY + (sUV.x - 0.5) * 1.5;
  if (tiltY >= -9.0) discard;
  float bdFade = smoothstep(-9.0, -18.0, tiltY);
  float pulse  = 0.8 + sin(uTime * 2.2) * 0.2;
  vec3 col = vec3(0.95, 0.20, 0.12) * pulse;
  gl_FragColor = vec4(col, vAlpha * bdFade);
}
`

// ── Oral arm shaders — translucent fabric strips with stripes ──

const oralVert = `
attribute float aAlpha;
attribute float aUvX;
attribute float aUvY;
varying float vWorldY;
varying vec4  vClipPos;
varying float vAlpha;
varying float vUvX;
varying float vUvY;
void main() {
  vWorldY  = (modelMatrix * vec4(position, 1.0)).y;
  vec4 mv  = modelViewMatrix * vec4(position, 1.0);
  vClipPos = projectionMatrix * mv;
  gl_Position = vClipPos;
  vAlpha = aAlpha;
  vUvX = aUvX;
  vUvY = aUvY;
}
`

const oralFrag = `
varying float vWorldY;
varying vec4  vClipPos;
varying float vAlpha;
varying float vUvX;
varying float vUvY;
uniform float uTime;
void main() {
  vec2 sUV    = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
  float tiltY = vWorldY + (sUV.x - 0.5) * 1.5;
  if (tiltY >= -9.0) discard;
  float bdFade = smoothstep(-9.0, -18.0, tiltY);

  // Horizontal stripe bands across ribbon length — aurelia pattern
  float limitOsc = sin(vUvY * 80.0) * 0.04;
  float edgeFade = 1.0 - smoothstep(0.25 + limitOsc, 0.58, vUvX);

  // Orange base, pinkish-white near inner edge
  vec3 orange = vec3(0.82, 0.16, 0.05);
  vec3 light  = vec3(0.96, 0.72, 0.58);
  vec3 col    = mix(orange, light, edgeFade);

  // Emissive red glow strongest near bell attachment
  col += vec3(0.30, 0.03, 0.01) * (1.0 - vUvY) * 0.6;

  // Very transparent, like aurelia (~0.1 opacity range)
  gl_FragColor = vec4(col, vAlpha * bdFade * 0.13);
}
`

// ── Oral arm geometry (ribbon with UV coords) ─────────────────

function makeOralGeo() {
  const vCount = N_ORAL * ORAL_VPA
  const pos   = new Float32Array(vCount * 3)
  const alpha = new Float32Array(vCount)
  const uvx   = new Float32Array(vCount)
  const uvy   = new Float32Array(vCount)
  const idx   = []

  for (let a = 0; a < N_ORAL; a++) {
    const base = a * ORAL_VPA
    for (let s = 0; s <= N_ORAL_SEG; s++) {
      const iL = base + s * 2
      const iR = base + s * 2 + 1
      const tt = s / N_ORAL_SEG
      alpha[iL] = (1.0 - tt) * 0.88
      alpha[iR] = (1.0 - tt) * 0.88
      uvx[iL]  = 0.0
      uvx[iR]  = 1.0
      uvy[iL]  = tt
      uvy[iR]  = tt
      if (s < N_ORAL_SEG) {
        const nL = iL + 2, nR = iR + 2
        idx.push(iL, nL, iR,  iR, nL, nR)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(pos, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alpha, 1))
  geo.setAttribute('aUvX',     new THREE.BufferAttribute(uvx, 1))
  geo.setAttribute('aUvY',     new THREE.BufferAttribute(uvy, 1))
  geo.setIndex(idx)
  return geo
}

// ── Tentacle geometry ─────────────────────────────────────────

function makeTentGeo() {
  const vCount = N_TENT * (N_SEG + 1)
  const pos   = new Float32Array(vCount * 3)
  const alpha = new Float32Array(vCount)
  const idx   = []

  for (let t = 0; t < N_TENT; t++) {
    for (let s = 0; s <= N_SEG; s++) {
      const i = t * (N_SEG + 1) + s
      alpha[i] = (1.0 - s / N_SEG) * 0.65
      if (s < N_SEG) idx.push(i, i + 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(pos, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alpha, 1))
  geo.setIndex(idx)
  return geo
}

// ── Shared bell material ──────────────────────────────────────

let _sharedMat = null
function getSharedMat() {
  if (!_sharedMat) _sharedMat = makeBellMat()
  return _sharedMat
}

// ── Single jellyfish ──────────────────────────────────────────

export class Jellyfish {
  constructor(scene, { x = 0, baseY = -30, z = 0, scale = 0.27, phase = 0, speed = 1.0, startOffset = 0 } = {}) {
    this._scale = scale
    this._seed  = phase   // per-jellyfish random seed for rotation variety
    this._baseY = baseY
    this._speed = speed
    this._x     = x
    this._z     = z

    // Initial time seeds continuous phase at the given phase angle
    this._time  = phase / (PI * 2 * 0.2)
    this._drift = startOffset
    this._prevElapsed = null
    this._uTime = { value: 0 }

    this._group = new THREE.Group()
    scene.instance.add(this._group)

    // Bell
    this._bellGeo = makeBellGeo()
    this._bell    = new THREE.Mesh(this._bellGeo, getSharedMat())
    this._bell.frustumCulled = false
    this._group.add(this._bell)

    // Tentacles
    const tentGeo = makeTentGeo()
    const tentMat = new THREE.ShaderMaterial({
      vertexShader:   tentVert,
      fragmentShader: tentFrag,
      uniforms:    { uTime: this._uTime },
      transparent: true,
      depthWrite:  false,
    })
    this._tents = new THREE.LineSegments(tentGeo, tentMat)
    this._tents.frustumCulled = false
    this._group.add(this._tents)
    this._tentPos = tentGeo.getAttribute('position')
    this._tentAz  = Array.from({ length: N_TENT }, (_, i) => (i / N_TENT) * PI * 2)

    // Oral arms
    const oralGeo = makeOralGeo()
    const oralMat = new THREE.ShaderMaterial({
      vertexShader:   oralVert,
      fragmentShader: oralFrag,
      uniforms:    { uTime: this._uTime },
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    })
    this._oral    = new THREE.Mesh(oralGeo, oralMat)
    this._oral.frustumCulled = false
    this._group.add(this._oral)
    this._oralPos = oralGeo.getAttribute('position')
    this._oralAz  = Array.from({ length: N_ORAL }, (_, i) => (i / N_ORAL) * PI * 2)
  }

  _updateTentacles(t, phase) {
    const pos = this._tentPos.array
    const sc  = this._scale
    for (let i = 0; i < N_TENT; i++) {
      const az   = this._tentAz[i]
      const [rx, ry, rz] = cpuBellPos(phase, 1.0, az, sc)
      const seed = i * 1.618
      const tLen = sc * 9.0
      for (let s = 0; s <= N_SEG; s++) {
        const tt   = s / N_SEG
        const tLag = t - tt * 1.2
        const wx = Math.sin(tt * PI * 2.0 + tLag * 1.6 + seed) * 0.9 * tt * sc
        const wz = Math.cos(tt * PI * 1.6 + tLag * 1.2 + seed * 1.5) * 0.7 * tt * sc
        const off = (i * (N_SEG + 1) + s) * 3
        pos[off]   = rx + wx
        pos[off+1] = ry - tt * tLen
        pos[off+2] = rz + wz
      }
    }
    this._tentPos.needsUpdate = true
  }

  _updateOralArms(t, phase) {
    const pos = this._oralPos.array
    const sc  = this._scale
    const tLen = sc * 7.0
    const hw   = sc * 0.55

    for (let a = 0; a < N_ORAL; a++) {
      const az   = this._oralAz[a]
      const seed = a * 2.618 + 7.3
      const wdx =  Math.cos(az)
      const wdz = -Math.sin(az)
      const bx = Math.sin(az) * sc * 0.12
      const bz = Math.cos(az) * sc * 0.12
      const by = cpuBellPos(phase, 0.8, az, sc)[1] * 0.35

      for (let s = 0; s <= N_ORAL_SEG; s++) {
        const tt   = s / N_ORAL_SEG
        const tLag = t - tt * 1.2
        const cx = bx + Math.sin(tt * PI * 2.0 + tLag * 1.6 + seed)        * 1.2 * tt * sc
        const cy = by - tt * tLen
        const cz = bz + Math.cos(tt * PI * 1.6 + tLag * 1.2 + seed * 1.5) * 0.95 * tt * sc
        const ruffle = Math.sin(tt * PI * 5.0 + t * 2.0 + a * PI * 0.5) * 0.18 * sc

        const base = (a * ORAL_VPA + s * 2) * 3
        pos[base]   = cx - wdx * hw
        pos[base+1] = cy + ruffle
        pos[base+2] = cz - wdz * hw
        pos[base+3] = cx + wdx * hw
        pos[base+4] = cy - ruffle
        pos[base+5] = cz + wdz * hw
      }
    }
    this._oralPos.needsUpdate = true
  }

  update(elapsed) {
    const delta = this._prevElapsed !== null ? elapsed - this._prevElapsed : 0
    this._prevElapsed = elapsed

    // Continuous phase ramp 0→2π (aurelia: phase = ((time*0.2) % 1.0) * 2π)
    this._time += delta
    const phase = ((this._time * 0.2) % 1.0) * PI * 2

    this._uTime.value = elapsed

    // Speed bursts after bell contraction — creates propulsion feel
    const spd = this._speed * (1.0 + Math.sin(phase + 4.4) * 0.35)
    this._drift = (this._drift + spd * delta) % FLOAT_RANGE

    // Organic group rotation: 2-sine approximation of noise3D (aurelia rotX/Y/Z)
    const st = this._time * 0.1
    const sd = this._seed
    const rotX = (Math.sin(st * 1.3 + sd) * 0.7 + Math.sin(st * 3.7 + sd * 1.7) * 0.3) * 0.15 * PI
    const rotY = (Math.sin(st * 0.5 + sd * 2.1) * 0.7 + Math.sin(st * 1.1 + sd * 0.5) * 0.3) * 0.35 * PI
    const rotZ = (Math.sin(st * 1.1 + sd * 1.3) * 0.7 + Math.sin(st * 2.9 + sd * 2.9) * 0.3) * 0.15 * PI
    this._group.rotation.set(rotX, rotY, rotZ, 'XZY')

    this._group.position.x = this._x + Math.sin(elapsed * 0.22 + sd) * 1.2 * this._scale
    this._group.position.y = this._baseY + this._drift
    this._group.position.z = this._z + Math.cos(elapsed * 0.18 + sd * 1.4) * 0.9 * this._scale

    updateBellGeo(this._bellGeo, phase, this._scale)
    this._updateTentacles(elapsed, phase)
    this._updateOralArms(elapsed, phase)
  }

  destroy() {
    this._bellGeo.dispose()
    this._tents.geometry.dispose()
    this._tents.material.dispose()
    this._oral.geometry.dispose()
    this._oral.material.dispose()
    this._group.parent?.remove(this._group)
  }
}

// ── Background manager ────────────────────────────────────────

const DEFS = [
  { x:  0,  baseY: -46, z: -7,  scale: 0.405, phase: 0.0, speed: 1.10, startOffset:  0 },
  { x: -6,  baseY: -46, z: -5,  scale: 0.270, phase: 2.1, speed: 0.90, startOffset: 15 },
  { x:  7,  baseY: -46, z: -11, scale: 0.450, phase: 3.8, speed: 1.30, startOffset:  7 },
  { x: -3,  baseY: -46, z: -14, scale: 0.300, phase: 5.5, speed: 1.00, startOffset: 28 },
  { x:  4,  baseY: -46, z: -4,  scale: 0.225, phase: 1.4, speed: 1.20, startOffset: 10 },
]

export class JellyfishBackground {
  constructor(scene) {
    this._list = DEFS.map(d => new Jellyfish(scene, d))
  }

  update(elapsed) {
    this._list.forEach(j => j.update(elapsed))
  }

  destroy() {
    this._list.forEach(j => j.destroy())
  }
}
