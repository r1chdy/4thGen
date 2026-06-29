import * as THREE from 'three'

const COUNT    = 50000
const BRANCHES = 4
const RADIUS   = 8.0
const SPIN     = 0.6

const VERT = `
  attribute vec3  aColor;
  attribute float aBright;
  attribute float aSize;
  varying vec3  vColor;
  varying float vBright;
  varying vec2  vScreenUV;
  uniform float uCone;

  void main() {
    vColor  = aColor;
    vBright = aBright;
    float r   = length(position.xz);
    float coneY = (r / 8.0) * 7.0 * uCone;
    vec3 pos  = vec3(position.x, position.y + coneY, position.z);
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip  = projectionMatrix * mvPos;
    vScreenUV  = clip.xy / clip.w * 0.5 + 0.5;
    gl_PointSize = clamp(aSize * aBright / -mvPos.z, 0.5, 24.0);
    gl_Position  = clip;
  }
`

const FRAG = `
  uniform float uTime;
  uniform float uCamY;
  uniform float uVertScale;
  uniform sampler2D uVideoTex;
  varying vec3  vColor;
  varying float vBright;
  varying vec2  vScreenUV;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }

  void main() {
    float worldY  = uCamY + (vScreenUV.y - 0.5) * uVertScale;
    float tiltedY = worldY + (vScreenUV.x - 0.5) * 1.5;
    if (tiltedY < 0.0) discard;

    vec2  uv = gl_PointCoord - 0.5;
    float d  = length(uv);
    if (d > 0.5) discard;

    // Sphere normal từ PointCoord (simulate LogoHero surface)
    vec2  nxy = uv * 2.0;
    float nz  = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
    vec3  N   = vec3(nxy, nz);

    float NdotV  = nz;
    float fresnel = pow(1.0 - NdotV, 2.8);
    float rim     = 1.0 - NdotV;

    // Video refraction
    float roughness = noise(vScreenUV * 30.0 + uTime * 0.06);
    vec2 refractUV  = vScreenUV + N.xy * 0.025 + roughness * 0.006;
    vec3 video      = texture2D(uVideoTex, clamp(refractUV, 0.0, 1.0)).rgb;

    // Core glow + video blend
    float core = exp(-d * 5.5);
    vec3 col = mix(video * 1.3, vec3(0.02, 0.01, 0.02), 0.12);
    col += vec3(0.90, 0.82, 0.72) * core * 0.55;

    // Red rim accent
    float angle    = atan(N.y, N.x);
    float rimRight = smoothstep(-0.5, 0.6, angle) * smoothstep(1.8, 0.6, angle);
    float rimTop   = smoothstep(0.6, 1.5, angle) * smoothstep(3.2, 1.5, angle);
    col += vec3(0.75, 0.06, 0.10) * rim * rimRight;
    col += vec3(0.80, 0.75, 0.72) * rim * rimTop * 0.4;

    // Edge line highlight
    float edgeLine = smoothstep(0.36, 0.49, d) * smoothstep(0.50, 0.41, d);
    col += vec3(0.95, 0.88, 0.86) * edgeLine * 0.6;

    float alpha = clamp(core * 0.9 + fresnel * 1.1 + edgeLine * 0.8, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha * vBright);
  }
`

function randn() {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export class Galaxy {
  constructor(scene, videoTex = null) {
    if (!videoTex) {
      const fb = new THREE.DataTexture(new Uint8Array([0,0,0,255]), 1, 1, THREE.RGBAFormat)
      fb.needsUpdate = true
      videoTex = fb
    }

    const geo    = new THREE.BufferGeometry()
    const pos    = new Float32Array(COUNT * 3)
    const col    = new Float32Array(COUNT * 3)
    const bright = new Float32Array(COUNT)
    const size   = new Float32Array(COUNT)

    const cCore = new THREE.Color('#ffffff')
    const cIn   = new THREE.Color('#d4af37')
    const cMid  = new THREE.Color('#b06040')
    const cOut  = new THREE.Color('#1a0204')

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3

      const isHalo = Math.random() < 0.08

      if (isHalo) {
        const angle = Math.random() * Math.PI * 2
        const r     = Math.pow(Math.random(), 0.5) * RADIUS
        pos[i3    ] = Math.cos(angle) * r + randn() * RADIUS * 0.008
        pos[i3 + 1] = randn() * RADIUS * 0.010
        pos[i3 + 2] = Math.sin(angle) * r + randn() * RADIUS * 0.008
        bright[i]   = 0.06 + Math.random() * 0.12
        size[i]     = 8 + Math.random() * 12

        const t = r / RADIUS
        const c = cIn.clone().lerp(cOut, t)
        col[i3] = c.r; col[i3+1] = c.g; col[i3+2] = c.b
        continue
      }

      // Arm stars
      const r  = Math.random() * RADIUS
      const t  = r / RADIUS
      const sa = r * SPIN
      const ba = (i % BRANCHES) / BRANCHES * Math.PI * 2

      // Gaussian scatter normalized to RADIUS
      const armPull = Math.exp(-t * 4.0)
      const spread  = RADIUS * (0.010 + (1 - armPull) * 0.078)
      const sx = randn() * spread
      const sz = randn() * spread
      const sy = randn() * (RADIUS * 0.012 * Math.exp(-t * 3.0))

      pos[i3    ] = Math.cos(ba + sa) * r + sx
      pos[i3 + 1] = sy
      pos[i3 + 2] = Math.sin(ba + sa) * r + sz

      const c = t < 0.15
        ? cCore.clone().lerp(cIn,  t / 0.15)
        : t < 0.55
          ? cIn.clone().lerp(cMid, (t - 0.15) / 0.40)
          : cMid.clone().lerp(cOut, (t - 0.55) / 0.45)
      col[i3] = c.r; col[i3+1] = c.g; col[i3+2] = c.b

      const rimBoost = 0.7 * Math.pow(t, 1.8)
      bright[i] = Math.max(0.50, 1.3 * Math.exp(-t * 2.0) + rimBoost)
      const r2 = Math.random()
      size[i]  = r2 < 0.70 ? 20 + Math.random() * 15
               : r2 < 0.92 ? 45 + Math.random() * 25
               :              85 + Math.random() * 35
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos,    3))
    geo.setAttribute('aColor',   new THREE.BufferAttribute(col,    3))
    geo.setAttribute('aBright',  new THREE.BufferAttribute(bright, 1))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(size,   1))

    this._uniforms = {
      uCamY:      { value: 0 },
      uVertScale: { value: 7 },
      uTime:      { value: 0 },
      uVideoTex:  { value: videoTex },
      uCone:      { value: 0 },
    }

    this._points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms:       this._uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    }))
    this._points.position.y  = 1.5
    this._points.rotation.x  = 0.06
    this._points.renderOrder = 0
    scene.instance.add(this._points)
  }

  get centerY() { return this._points.position.y }

  setVideoTex(tex) {
    this._uniforms.uVideoTex.value = tex
  }

  update({ elapsed, camY = 0, vertScale = 7 }) {
    this._points.rotation.y         = elapsed * 0.04
    this._uniforms.uCamY.value      = camY
    this._uniforms.uVertScale.value = vertScale
    this._uniforms.uTime.value      = elapsed

    const targetY = Math.min(1.5, camY - 1.0)
    this._points.position.y += (targetY - this._points.position.y) * 0.08

    const cone = Math.max(0, Math.min(1, (2.5 - camY) / 2.5))
    this._uniforms.uCone.value += (cone - this._uniforms.uCone.value) * 0.06

  }

  destroy() {
    this._points.geometry.dispose()
    this._points.material.dispose()
    this._points.parent?.remove(this._points)
  }
}
