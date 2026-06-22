// Logo 3D ở màn hình đầu (hero section) — load file GLB, shader chrome, animation xuất hiện
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vNormalView;
  varying vec2 vUv;
  varying vec4 vClipPos;

  void main() {
    vUv         = uv;
    vec4 mvPos  = modelViewMatrix * vec4(position, 1.0);
    vNormal     = normalize(normalMatrix * normal);
    vNormalView = normalize((normalMatrix * normal).xyz);
    vViewDir    = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
    vClipPos    = gl_Position;
  }
`

const fragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vNormalView;
  varying vec2 vUv;
  varying vec4 vClipPos;
  uniform float uTime;
  uniform float uEnterAlpha;
  uniform float uScrollFade;
  uniform vec2  uMouse;
  uniform float uMouseStrength;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }

  void main() {
    float NdotV   = max(dot(vNormal, vViewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 2.5);

    // ── Rim mask: distance from centre of view-normal disc ───────
    // 0 = facing camera (front), 1 = side-on (rim)
    float rimR = length(vNormalView.xy);   // 0..1
    float rim  = smoothstep(0.35, 1.0, rimR);

    // Subtle liquid shimmer on the rim band
    float ripple = noise(vNormalView.xy * 4.0 + uTime * 0.30) * 0.06;
    float rimAnim = smoothstep(0.30, 1.0, rimR + ripple);

    // ── Front face: nearly black ──────────────────────────────────
    vec3 chrome = vec3(0.04, 0.02, 0.02);

    // ── Rim light 1: cool silver-white (upper-left) ───────────────
    float angle = atan(vNormalView.y, vNormalView.x);  // -π..π
    float rimTop   = smoothstep(0.6, 1.5, angle) * smoothstep(3.2, 1.5, angle);
    float rimLeft  = smoothstep(-2.8, -1.2, angle) * smoothstep(-0.2, -1.2, angle);
    chrome += vec3(0.85, 0.80, 0.78) * rimAnim * rimTop  * 0.55;
    chrome += vec3(0.55, 0.50, 0.52) * rimAnim * rimLeft * 0.35;

    // ── Rim light 2: crimson brand colour (right/bottom) ─────────
    float rimRight  = smoothstep(-0.5, 0.6, angle) * smoothstep(1.8, 0.6, angle);
    float rimBottom = smoothstep(-2.2, -3.2, angle) + smoothstep(2.2, 3.2, angle);
    chrome += vec3(0.75, 0.06, 0.10) * rimAnim * rimRight  * 0.90;
    chrome += vec3(0.45, 0.03, 0.06) * rimAnim * rimBottom * 0.60;

    // ── Hard bright edge line ─────────────────────────────────────
    float edgeLine = smoothstep(0.78, 0.95, rimR) * smoothstep(1.0, 0.90, rimR);
    chrome += vec3(0.95, 0.88, 0.86) * edgeLine * 0.50;

    // ── Very subtle inner glow so shape reads in dark ─────────────
    chrome += vec3(0.18, 0.03, 0.04) * (1.0 - rim) * 0.40;

    // ── Mouse / particle glow ─────────────────────────────────────
    // Convert this fragment to screen UV (0..1)
    vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
    float mDist   = length(screenUV - uMouse);

    // Broad soft halo
    float halo  = smoothstep(0.28, 0.0, mDist) * uMouseStrength;
    // Sharp hot-spot right at cursor
    float spot  = smoothstep(0.07, 0.0, mDist) * uMouseStrength;

    // Halo: warm crimson bloom that accentuates the rim
    chrome += vec3(0.80, 0.10, 0.14) * halo * (0.5 + rim * 0.8);
    // Spot: near-white flash only on rim/edge
    chrome += vec3(1.00, 0.70, 0.65) * spot * (0.4 + edgeLine * 1.2);
    // Inner face picks up a faint red warmth from halo
    chrome += vec3(0.30, 0.02, 0.04) * halo * (1.0 - rim) * 0.6;

    // ── Micro-noise to break up flat front face ───────────────────
    chrome += noise(vUv * 90.0) * 0.018 * vec3(0.9, 0.7, 0.7);

    float alpha = clamp(0.94 + rim * 0.06, 0.0, 1.0);
    gl_FragColor = vec4(chrome, alpha * uEnterAlpha * uScrollFade);
  }
`

const HERO_Y = 5.0

export class LogoHero {
  constructor(scene) {
    this._scene      = scene.instance
    this._group      = new THREE.Group()
    this._mats       = []
    this._ready      = false
    this._enterProxy = { v: 0 }
    this._mouse      = new THREE.Vector2(0.5, 0.5)
    this._mouseStrength     = 0
    this._mouseStrengthTarget = 0

    window.addEventListener('mousemove', (e) => {
      this._mouse.x = e.clientX / window.innerWidth
      this._mouse.y = 1.0 - e.clientY / window.innerHeight
      this._mouseStrengthTarget = 1
    })

    this._scene.add(this._group)
    this._load()
  }

  _load() {
    const loader = new GLTFLoader()
    loader.load(
      '/models/4thgen_logo.glb',
      (gltf) => {
        const model  = gltf.scene
        const box    = new THREE.Box3().setFromObject(model)
        const size   = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)

        const maxDim = Math.max(size.x, size.y, size.z)
        const scale  = 2.0 / maxDim
        model.scale.setScalar(scale)
        model.position.sub(center.multiplyScalar(scale))
        model.position.y += HERO_Y

        model.traverse(child => {
          if (!child.isMesh) return
          const mat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
              uTime:          { value: 0 },
              uEnterAlpha:    { value: 0 },
              uScrollFade:    { value: 1 },
              uMouse:         { value: new THREE.Vector2(0.5, 0.5) },
              uMouseStrength: { value: 0 },
            },
            transparent: true,
            side:        THREE.DoubleSide,
            depthWrite:  false,
          })
          child.material = mat
          this._mats.push(mat)
        })

        this._group.add(model)
        this._ready = true

        gsap.to(this._enterProxy, {
          v: 1, duration: 1.6, delay: 0.3, ease: 'power2.out',
          onUpdate: () => {
            this._mats.forEach(m => { m.uniforms.uEnterAlpha.value = this._enterProxy.v })
          },
        })
      },
      undefined,
      err => console.error('[LogoHero] load error:', err)
    )
  }

  update({ elapsed, progress }) {
    if (!this._ready) return

    const scrollFade = Math.max(0, 1 - progress / 0.30)
    this._group.position.y = Math.sin(elapsed * 0.45) * 0.06
    this._group.rotation.y = Math.sin(elapsed * 0.5) * (Math.PI / 4)
    this._group.rotation.x = Math.sin(elapsed * 0.2) * (Math.PI / 8)

    // Strength spikes on mouse move, decays back to 0 smoothly
    this._mouseStrengthTarget *= 0.88
    this._mouseStrength += (this._mouseStrengthTarget - this._mouseStrength) * 0.12

    this._mats.forEach(m => {
      m.uniforms.uTime.value          = elapsed
      m.uniforms.uScrollFade.value    = scrollFade
      m.uniforms.uMouse.value.copy(this._mouse)
      m.uniforms.uMouseStrength.value = this._mouseStrength
    })
  }

  destroy() {
    this._group.traverse(child => {
      if (child.isMesh) { child.geometry.dispose(); child.material.dispose() }
    })
    this._scene.remove(this._group)
  }
}
