// Lưới các tấm card project — xếp theo đường xoắn ốc, shader chrome + texture, click để vào detail room
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import gsap from 'gsap'
let Text = null
let _troika = null
const ensureText = () => (_troika ??= import('troika-three-text').then(m => { Text = m.Text }))

const FONT = '/fonts/SpaceMono-Bold.ttf'

export const PROJECTS = [
  {
    id: 'animation', title: '2D & 3D Animation', year: '2024',
    texture: '/textures/proj1.jpg', color: '#F2F2F2',
    videos: [
      // { id: 'a1', title: 'Slot Machine Loop', year: '2024', thumb: '/textures/proj1.jpg', src: '/video/anim1.mp4' },
    ],
  },
  {
    id: 'jackpot', title: 'Jackpot & Event Reveals', year: '2024',
    texture: '/textures/proj2.jpg', color: '#BCBEC0',
    videos: [],
  },
  {
    id: 'theming', title: 'Full Floor Theming', year: '2024',
    texture: '/textures/proj3.jpg', color: '#F2F2F2',
    videos: [],
  },
  {
    id: 'sound', title: 'Sound Design', year: '2023',
    texture: '/textures/proj4.jpg', color: '#BCBEC0',
    videos: [],
  },
  {
    id: 'storyboard', title: 'Storyboarding', year: '2023',
    texture: '/textures/proj5.jpg', color: '#410714',
    videos: [],
  },
]

const CARD_RADIUS  = 3.2
export const THETA_MAX   = 5.0
export const CAM_Y_START = -2.0
export const CAM_Y_RANGE = 20.0

export const ROT_DELAY = 0.60

export const SPIRAL = [
  [0.3000, 0    ],
  [0.4000, 1.25 ],
  [0.5000, 2.50 ],
  [0.6000, 3.75 ],
  [0.7000, 5.00 ],
].map(([p, angle]) => ({
  angle,
  y: CAM_Y_START - p * CAM_Y_RANGE - 6,
}))

/* ─── Chrome Card Shaders (LogoHero style) ───────────────────────── */

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vNormalView;
  varying vec4 vClipPos;
  uniform float uHover;
  uniform float uTime;

  void main() {
    vUv      = uv;
    vec3 pos = position;
    float ripple = sin(pos.x * 7.0 + uTime * 2.2) * sin(pos.y * 5.0 + uTime * 1.7);
    pos.z += ripple * uHover * 0.018;
    vec4 mvPos  = modelViewMatrix * vec4(pos, 1.0);
    vNormal     = normalize(normalMatrix * normal);
    vNormalView = normalize((normalMatrix * normal).xyz);
    vViewDir    = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
    vClipPos    = gl_Position;
  }
`

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vNormalView;
  varying vec4 vClipPos;
  uniform float     uHover;
  uniform float     uAlpha;
  uniform float     uDim;
  uniform float     uTime;
  uniform float     uDissolve;
  uniform vec2      uMouse;
  uniform float     uMouseStrength;
  uniform sampler2D uTexture;
  uniform sampler2D uVideoTexture;
  uniform float     uVideoBlend;

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

    float rimR    = length(vNormalView.xy);
    float rim     = smoothstep(0.35, 1.0, rimR);
    float ripple  = noise(vNormalView.xy * 4.0 + uTime * 0.30) * 0.06;
    float rimAnim = smoothstep(0.30, 1.0, rimR + ripple);

    vec3  chrome = vec3(0.04, 0.02, 0.02);

    float angle     = atan(vNormalView.y, vNormalView.x);
    float rimTop    = smoothstep(0.6,  1.5,  angle) * smoothstep(3.2,  1.5,  angle);
    float rimLeft   = smoothstep(-2.8, -1.2, angle) * smoothstep(-0.2, -1.2, angle);
    chrome += vec3(0.85, 0.80, 0.78) * rimAnim * rimTop  * 0.55;
    chrome += vec3(0.55, 0.50, 0.52) * rimAnim * rimLeft * 0.35;

    float rimRight  = smoothstep(-0.5, 0.6,  angle) * smoothstep(1.8,  0.6,  angle);
    float rimBottom = smoothstep(-2.2, -3.2, angle) + smoothstep(2.2,  3.2,  angle);
    chrome += vec3(0.75, 0.06, 0.10) * rimAnim * rimRight  * 0.90;
    chrome += vec3(0.45, 0.03, 0.06) * rimAnim * rimBottom * 0.60;

    float edgeLine = smoothstep(0.78, 0.95, rimR) * smoothstep(1.0, 0.90, rimR);
    chrome += vec3(0.95, 0.88, 0.86) * edgeLine * 0.50;
    chrome += vec3(0.18, 0.03, 0.04) * (1.0 - rim) * 0.40;

    vec2  screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
    float mDist    = length(screenUV - uMouse);
    float halo     = smoothstep(0.28, 0.0, mDist) * uMouseStrength;
    float spot     = smoothstep(0.07, 0.0, mDist) * uMouseStrength;
    chrome += vec3(0.80, 0.10, 0.14) * halo * (0.5 + rim * 0.8);
    chrome += vec3(1.00, 0.70, 0.65) * spot * (0.4 + edgeLine * 1.2);
    chrome += vec3(0.30, 0.02, 0.04) * halo * (1.0 - rim) * 0.6;

    chrome += noise(vUv * 90.0) * 0.018 * vec3(0.9, 0.7, 0.7);

    vec2 dstUV    = vUv + noise(vUv * 8.0 + uTime * 0.12) * 0.008;
    vec3 stillCol = texture2D(uTexture,      dstUV).rgb;
    vec3 vidCol   = texture2D(uVideoTexture, dstUV).rgb * 1.0;
    vec3 texCol   = mix(stillCol, vidCol, uVideoBlend);

    float luma      = dot(texCol, vec3(0.2126, 0.7152, 0.0722));
    float highlight = smoothstep(0.55, 1.0, luma);
    texCol += texCol * highlight * 0.5;

    float texBlend = smoothstep(0.97, 0.05, rim);
    chrome = mix(chrome, texCol, texBlend * 0.82);

    float alpha = clamp(0.94 + rim * 0.06, 0.0, 1.0);

    if (uDissolve > 0.001) {
      vec2  cUv  = vUv - 0.5;
      float dist = length(cUv);
      float edge = uDissolve * 0.78;
      float dissolveRim  = smoothstep(0.09, 0.0, abs(dist - edge));
      chrome += vec3(0.55, 0.25, 1.0) * dissolveRim * 2.2;
      float dissolveMask = smoothstep(edge - 0.04, edge + 0.04, dist);
      alpha *= dissolveMask;
    }

    gl_FragColor = vec4(chrome, alpha * uAlpha * uDim);
  }
`

/* ─── ProjectGrid ─────────────────────────────────────────────────── */

export class ProjectGrid {
  constructor(scene, loader, cardGltf) {
    this.scene      = scene.instance
    this.camera     = scene.camera
    this.cards      = []
    this.raycaster  = new THREE.Raycaster()
    this.pointer    = new THREE.Vector2(-999, -999)
    this._lastHit   = null
    this._hitResult = null
    this._mouseStrength       = 0
    this._mouseStrengthTarget = 0

    const videoEl = document.createElement('video')
    this.videoEl        = videoEl
    videoEl.crossOrigin = 'anonymous'
    videoEl.src         = 'https://pub-b791cc020c8f4fcab9c651511349d2ec.r2.dev/hero-bg.mp4'
    videoEl.loop        = true
    videoEl.muted       = true
    videoEl.playsInline = true
    videoEl.play().catch(() => {})
    this._videoTex = new THREE.VideoTexture(videoEl)
    this._videoTex.colorSpace = THREE.SRGBColorSpace

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this._buildCards(loader, cardGltf)
    this._bindEvents()
    window.addEventListener('resize', () => this._applyScale())
  }

  _cardScale() {
    const aspect = window.innerWidth / window.innerHeight
    return aspect < 1 ? Math.max(0.60, aspect * 1.10) * 1.5 : 1.5
  }

  get baseScale() { return this._cardScale() }
  get videoTex()  { return this._videoTex }

  _applyScale() {
    const s = this._cardScale()
    this.cards.forEach(card => {
      if (card._entered) card.mesh.scale.setScalar(s)
    })
  }

  async _buildCards(loader, gltf) {
    await ensureText()
    const texLoader = new THREE.TextureLoader()
    if (!gltf) gltf = await new Promise((res, rej) =>
      new GLTFLoader().load('https://pub-b791cc020c8f4fcab9c651511349d2ec.r2.dev/card.glb', res, undefined, rej)
    )

    const W = 2.4
    const H = 1.35

    PROJECTS.forEach((proj, i) => {
      const { angle, y } = SPIRAL[i]
      const bx        = CARD_RADIUS * Math.sin(angle)
      const bz        = CARD_RADIUS * Math.cos(angle)
      const faceAngle = angle

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uHover:         { value: 0 },
          uAlpha:         { value: 0 },
          uDim:           { value: 1 },
          uTime:          { value: 0 },
          uDissolve:      { value: 0 },
          uMouse:         { value: new THREE.Vector2(0.5, 0.5) },
          uMouseStrength: { value: 0 },
          uTexture:       { value: (() => { const t = texLoader.load(proj.texture); t.colorSpace = THREE.SRGBColorSpace; return t })() },
          uVideoTexture:  { value: this._videoTex },
          uVideoBlend:    { value: 0 },
        },
        transparent: true,
        depthWrite:  false,
        side:        THREE.FrontSide,
      })

      const root = gltf.scene.clone(true)

      let faceMesh = null
      let maxArea  = -1
      root.traverse(obj => {
        if (!obj.isMesh) return
        obj.geometry.computeBoundingBox()
        const bb   = obj.geometry.boundingBox
        const area = (bb.max.x - bb.min.x) * (bb.max.y - bb.min.y)
        if (area > maxArea) { maxArea = area; faceMesh = obj }
      })

      root.traverse(obj => {
        if (!obj.isMesh) return
        obj.material  = mat
        obj.depthWrite = false
      })

      const mesh = root
      mesh.position.set(bx, y, bz)
      mesh.rotation.y = faceAngle
      mesh.scale.setScalar(0.05)
      this.group.add(mesh)

      mesh.userData.baseX    = bx
      mesh.userData.baseY    = y
      mesh.userData.baseZ    = bz
      mesh.userData.baseRotY = faceAngle

      const label = new Text()
      label.text          = proj.title.toUpperCase()
      label.font          = FONT
      label.fontSize      = 0.175
      label.color         = '#F2F2F2'
      label.letterSpacing = 0.06
      label.maxWidth      = 2.0
      label.textAlign     = 'center'
      label.anchorX       = 'center'
      label.anchorY       = 'middle'
      label.fillOpacity   = 0
      label.depthOffset   = -1
      label.raycast       = () => {}
      label.position.set(0, 0.08, 0.06)
      label.addEventListener('synccomplete', () => {
        label.material.side = THREE.FrontSide
        label.material.needsUpdate = true
      }, { once: true })
      label.sync()
      mesh.add(label)

      const labelYear = new Text()
      labelYear.text          = proj.year
      labelYear.font          = FONT
      labelYear.fontSize      = 0.08
      labelYear.color         = '#DC3535'
      labelYear.letterSpacing = 0.22
      labelYear.anchorX       = 'center'
      labelYear.anchorY       = 'middle'
      labelYear.fillOpacity   = 0
      labelYear.depthOffset   = -1
      labelYear.raycast       = () => {}
      labelYear.position.set(0, -0.26, 0.06)
      labelYear.addEventListener('synccomplete', () => {
        labelYear.material.side = THREE.FrontSide
        labelYear.material.needsUpdate = true
      }, { once: true })
      labelYear.sync()
      mesh.add(labelYear)

      this.cards.push({
        mesh, faceMesh, mat, proj,
        label, labelYear,
        _entered:        false,
        _entranceActive: false,
        baseAlpha:  0.5,
        labelAlpha: 1,
        hoverVal:   0,
        dimVal:     1,
        hoverTiltX: 0,
        hoverTiltY: 0,
        zOff:       0,
        flyPush:    0,
        flyMode:    false,
      })
    })

  }

  _bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
      this._mouseStrengthTarget = 1
    })

    window.addEventListener('click', () => {
      if (this._hitResult) this._onCardClick(this._hitResult.card)
    })
  }

  _castRay() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const faceMeshes = this.cards.map(c => c.faceMesh).filter(Boolean)
    const hits = this.raycaster.intersectObjects(faceMeshes, false)
    if (!hits.length) return null
    const card = this.cards.find(c => c.faceMesh === hits[0].object)
    return card ? { card, uv: hits[0].uv } : null
  }

  _onCardClick(card) {
    window.dispatchEvent(new CustomEvent('cardClick', {
      detail: {
        proj: card.proj,
        mat:  card.mat,
        mesh: card.mesh,
        pos:  {
          x: card.mesh.position.x,
          y: card.mesh.position.y,
          z: card.mesh.position.z,
        },
        rotY: card.mesh.userData.baseRotY,
      },
    }))
  }

  update({ elapsed, camY = 0 }) {
    const s = this._cardScale()
    this.cards.forEach(card => {
      if (!card._entered && camY <= card.mesh.userData.baseY + 4) {
        card._entered        = true
        card._entranceActive = true
        const bx = card.mesh.userData.baseX
        const bz = card.mesh.userData.baseZ
        card.mesh.position.set(bx * 0.1, card.mesh.userData.baseY, bz * 0.1)
        card.mesh.scale.setScalar(0.08)
        gsap.to(card.mesh.position, { x: bx, z: bz, duration: 1.0, ease: 'expo.out',
          onComplete: () => { card._entranceActive = false } })
        gsap.to(card.mesh.scale,          { x: s, y: s, z: s, duration: 0.9, ease: 'expo.out' })
        gsap.to(card.mat.uniforms.uAlpha, { value: 0.5,        duration: 0.8, ease: 'power2.out' })
      }
    })

    this._hitResult = this._castRay()
    const hit   = this._hitResult?.card || null
    const hitUV = this._hitResult?.uv   || null

    if (hit !== this._lastHit) {
      if (hit) window.dispatchEvent(new CustomEvent('cardHover', { detail: hit.proj }))
      else     window.dispatchEvent(new CustomEvent('cardLeave'))
      if (hit) {
        gsap.to(hit.mat.uniforms.uVideoBlend, { value: 1,                    duration: 0.5, ease: 'sine.out', overwrite: true })
        gsap.to(hit.mat.uniforms.uAlpha,      { value: 1,                    duration: 0.5, ease: 'sine.out', overwrite: true })
      }
      if (this._lastHit) {
        gsap.to(this._lastHit.mat.uniforms.uVideoBlend, { value: 0,                              duration: 0.3, ease: 'sine.in', overwrite: true })
        gsap.to(this._lastHit.mat.uniforms.uAlpha,      { value: this._lastHit.baseAlpha ?? 0.5, duration: 0.3, ease: 'sine.in', overwrite: true })
      }
      this._lastHit = hit
    }

    this._mouseStrengthTarget *= 0.88
    this._mouseStrength += (this._mouseStrengthTarget - this._mouseStrength) * 0.12
    const screenUV = new THREE.Vector2(
      this.pointer.x * 0.5 + 0.5,
      this.pointer.y * 0.5 + 0.5,
    )

    const anyHover = hit !== null

    this.cards.forEach(card => {
      // flyMode: position/rotation controlled externally — skip hover system
      if (card.flyMode) return

      const isHovered = card === hit
      const LFAST = 0.12
      const LMED  = 0.08

      // ── Hover glow ───────────────────────────────────────────────
      card.hoverVal += ((isHovered ? 1 : 0) - card.hoverVal) * LFAST
      card.mat.uniforms.uHover.value          = card.hoverVal
      card.mat.uniforms.uTime.value           = elapsed
      card.mat.uniforms.uMouse.value.copy(screenUV)
      card.mat.uniforms.uMouseStrength.value  = this._mouseStrength

      // ── Label: fade out on hover, fade in when leave ─────────────
      const labelTarget = isHovered ? 0 : 1
      card.labelAlpha += (labelTarget - card.labelAlpha) * 0.10
      card.label.fillOpacity     = card.labelAlpha * 1.0
      card.labelYear.fillOpacity = card.labelAlpha * 0.7
      card.label.position.z     = 0.06 + card.hoverVal * 0.06
      card.labelYear.position.z = 0.06 + card.hoverVal * 0.06

      // ── Dim non-hovered ──────────────────────────────────────────
      const targetDim = (!anyHover || isHovered) ? 1.0 : 0.5
      card.dimVal += (targetDim - card.dimVal) * LMED
      card.mat.uniforms.uDim.value = card.dimVal

      // ── Forward pop — along outward direction from column ────────
      const tZOff = isHovered ? 0.22 : 0
      card.zOff  += (tZOff - card.zOff) * LMED
      const angle = card.mesh.userData.baseRotY
      const totalPush = card.zOff + card.flyPush
      if (!card._entranceActive) {
        card.mesh.position.x = card.mesh.userData.baseX + Math.sin(angle) * totalPush
        card.mesh.position.z = card.mesh.userData.baseZ + Math.cos(angle) * totalPush
      }

      // ── Hover tilt — offset from base rotation ───────────────────
      const tiltXTarget = (isHovered && hitUV) ? -(hitUV.y - 0.5) * 0.20 : 0
      const tiltYTarget = (isHovered && hitUV) ?  (hitUV.x - 0.5) * 0.20 : 0
      card.hoverTiltX += (tiltXTarget - card.hoverTiltX) * LMED
      card.hoverTiltY += (tiltYTarget - card.hoverTiltY) * LMED
      card.mesh.rotation.x = card.hoverTiltX
      card.mesh.rotation.y = card.mesh.userData.baseRotY + card.hoverTiltY
    })
  }

  // excludeMat: skip uAlpha tween for clicked card — its uDissolve handles disappearance
  fade(alpha, duration = 0.5, excludeMat = null) {
    this.cards.forEach((card) => {
      const { mat, label, labelYear } = card
      const targetAlpha = alpha === 1 ? card.baseAlpha : alpha
      if (mat !== excludeMat) {
        gsap.to(mat.uniforms.uAlpha, { value: targetAlpha, duration, ease: 'power2.out' })
      }
      if (alpha === 0) {
        gsap.to(label,     { fillOpacity: 0, duration: duration * 0.6, ease: 'power2.out' })
        gsap.to(labelYear, { fillOpacity: 0, duration: duration * 0.6, ease: 'power2.out' })
      }
      if (alpha === 1) {
        gsap.to(mat.uniforms.uDissolve, { value: 0, duration: 1.4, ease: 'power2.out' })
      }
    })
  }

  // Enable/disable fly mode for a card (disables hover system when true)
  setFlyMode(mesh, enabled) {
    const card = this.cards.find(c => c.mesh === mesh)
    if (!card) return
    card.flyMode = enabled
    if (!enabled) card.zOff = 0  // prevent position jump when hover system resumes
  }

  destroy() {
    this.cards.forEach(({ mesh, mat, label, labelYear }) => {
      label.dispose()
      labelYear.dispose()
      mesh.traverse(obj => {
        if (!obj.isMesh) return
        obj.geometry.dispose()
      })
      mat.dispose()
      this.scene.remove(mesh)
    })
  }
}
