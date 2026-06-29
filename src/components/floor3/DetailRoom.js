// Phòng chi tiết (detail room) — hiện khi click vào card, hiển thị nội dung project bên trong không gian 3D
import * as THREE from 'three'
import gsap from 'gsap'
let Text = null
let _troika = null
const ensureText = () => (_troika ??= import('troika-three-text').then(m => { Text = m.Text }))

const FONT     = '/fonts/SpaceMono-Bold.ttf'
const ROOM_HALF = 1.2   // box depth half
const _CAM_Z    = -0.5  // camera z inside room scene (0.5 units from front face)

/* ─── Room wall shader ───────────────────────────────────────── */
const wallVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const wallFrag = `
  varying vec2 vUv;

  uniform float uTime;

  void main() {
    vec3 col = vec3(0.010, 0.010, 0.018);

    // grid
    vec2 g = fract(vUv * 18.0);
    float line = step(0.956, g.x) + step(0.956, g.y);
    col += clamp(line, 0.0, 1.0) * vec3(0.38, 0.42, 0.90) * 0.016;

    // edge vignette
    vec2 uvc = abs(vUv - 0.5) * 2.0;
    float vig = smoothstep(0.40, 1.0, max(uvc.x, uvc.y));
    col *= 1.0 - vig * 0.50;

    gl_FragColor = vec4(col, 1.0);
  }
`

/* ─── Card shader ────────────────────────────────────────────── */
const cardVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const cardFrag = `
  varying vec2 vUv;
  uniform float uHover;
  uniform float uAlpha;
  uniform sampler2D uTexture;
  uniform float uHasTexture;
  uniform vec2  uCardSize;

  float rrSDF(vec2 p, vec2 h, float r) {
    vec2 q = abs(p) - h + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 uvC = vUv - 0.5;
    vec2 wp  = uvC * uCardSize;
    float sdf    = rrSDF(wp, uCardSize * 0.5 - 0.10, 0.10);
    float mask   = 1.0 - smoothstep(-0.004, 0.008, sdf);
    if (mask < 0.01) discard;

    float border = smoothstep(0.012, -0.002, sdf);
    float rim    = smoothstep(0.14,   0.0,  -sdf);

    vec3 videoCol = texture2D(uTexture, vUv).rgb;
    vec3 base     = vec3(0.028, 0.028, 0.042);
    vec3 col      = mix(base, videoCol, uHasTexture * 0.90);

    col += border * (vec3(0.70, 0.75, 1.00) * (0.14 + uHover * 0.32));
    col += rim    *  vec3(0.22, 0.25, 0.50) * 0.10;

    float baseAlpha = 0.06 + rim * 0.12 + border * 0.22;
    float alpha = mix(baseAlpha, 0.92, uHasTexture * 0.90);
    alpha = clamp(alpha, 0.0, 0.95) * mask;

    gl_FragColor = vec4(col, alpha * uAlpha);
  }
`

/* ─── DetailRoom ─────────────────────────────────────────────── */
export class DetailRoom {
  constructor() {
    // Own scene + camera — rendered by Compositor to roomRT
    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      65, window.innerWidth / window.innerHeight, 0.01, 50
    )
    this.camera.position.set(0, 0, _CAM_Z)
    this.camera.lookAt(0, 0, -ROOM_HALF)
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
    })

    this._group = new THREE.Group()
    this._group.position.set(0, 0, -ROOM_HALF) // room center behind front face
    this._group.visible = false
    this.scene.add(this._group)

    this._cards     = []
    this._raycaster = new THREE.Raycaster()
    this._pointer   = new THREE.Vector2(-999, -999)
    this._lastHit   = null
    this.active     = false

    this._rawMouse  = { x: 0, y: 0 }
    this._lerpMouse = { x: 0, y: 0 }
    this._elapsed   = 0

    this._buildRoom()
    this._bindPointer()
  }

  _buildRoom() {
    const geo = new THREE.BoxGeometry(2.35, 1.28, 2.4)

    // Flip winding + normals inward so FrontSide culls when camera is outside
    const idx = geo.index.array
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t
    }
    geo.index.needsUpdate = true
    const nrm = geo.attributes.normal.array
    for (let i = 0; i < nrm.length; i++) nrm[i] = -nrm[i]
    geo.attributes.normal.needsUpdate = true

    // Wall — dark room, grid lines only. FrontSide + inward normals = inside-only visible
    this._wallMat = new THREE.ShaderMaterial({
      vertexShader: wallVert,
      fragmentShader: wallFrag,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
      },
    })
    // Index 4 = +Z face (front, camera enters here) — hidden so no wall blocks entry
    this._frontHideMat = new THREE.MeshBasicMaterial({ visible: false })
    const wallMats = [
      this._wallMat,     this._wallMat, // +X, -X
      this._wallMat,     this._wallMat, // +Y, -Y
      this._frontHideMat,               // +Z front — invisible (camera enters through here)
      this._wallMat,                    // -Z back — visible
    ]
    this._group.add(new THREE.Mesh(geo, wallMats))

    // Edge lines — back face + 4 depth edges (no front face edges)
    const W2 = 1.175, H2 = 0.64, D2 = ROOM_HALF
    const edgeVerts = new Float32Array([
      // back face (z = -D2) — 4 edges
      -W2, -H2, -D2,   W2, -H2, -D2,
       W2, -H2, -D2,   W2,  H2, -D2,
       W2,  H2, -D2,  -W2,  H2, -D2,
      -W2,  H2, -D2,  -W2, -H2, -D2,
      // depth edges from back to front — 4 edges
      -W2, -H2, -D2,  -W2, -H2,  D2,
       W2, -H2, -D2,   W2, -H2,  D2,
       W2,  H2, -D2,   W2,  H2,  D2,
      -W2,  H2, -D2,  -W2,  H2,  D2,
    ])
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeVerts, 3))
    this._edgeMat = new THREE.LineBasicMaterial({
      color: 0x4466dd,
      transparent: true,
      opacity: 0.45,
    })
    this._group.add(new THREE.LineSegments(edgeGeo, this._edgeMat))
  }

  _clearCards() {
    this._cards.forEach(({ mesh, label }) => {
      if (label) { label.dispose(); mesh.remove(label) }
      mesh.geometry.dispose()
      mesh.material.dispose()
      this._group.remove(mesh)
    })
    this._cards = []
  }

  async _buildCards(proj) {
    await ensureText()
    this._clearCards()

    const videos = (proj.videos && proj.videos.length > 0)
      ? proj.videos
      : [
          { id: 'ph1', title: 'Coming Soon', year: '', thumb: null, src: null },
          { id: 'ph2', title: 'Coming Soon', year: '', thumb: null, src: null },
          { id: 'ph3', title: 'Coming Soon', year: '', thumb: null, src: null },
        ]

    const W = 0.65
    const H = W * (9 / 16)
    const aspect  = window.innerWidth / window.innerHeight
    const maxCols = aspect < 0.8 ? 1 : 2
    const cols    = Math.min(videos.length, maxCols)
    const rows    = Math.ceil(videos.length / cols)
    const gapX    = 0.28
    const gapY    = 0.30
    const totalW  = cols * W + (cols - 1) * gapX
    const totalH  = rows * H + (rows - 1) * gapY
    const startX  = -totalW / 2 + W / 2
    const startY  =  totalH / 2 - H / 2

    videos.forEach((v, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x   = startX + col * (W + gapX)
      const y   = startY - row * (H + gapY)

      const mat = new THREE.ShaderMaterial({
        vertexShader: cardVert,
        fragmentShader: cardFrag,
        uniforms: {
          uHover:      { value: 0 },
          uAlpha:      { value: 0 },
          uTexture:    { value: new THREE.Texture() },
          uHasTexture: { value: 0.0 },
          uCardSize:   { value: new THREE.Vector2(W, H) },
        },
        transparent: true,
        depthWrite: false,
      })

      if (v.thumb) {
        new THREE.TextureLoader().load(v.thumb, tex => {
          tex.colorSpace = THREE.SRGBColorSpace
          mat.uniforms.uTexture.value = tex
          mat.uniforms.uHasTexture.value = 1.0
        })
      }

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat)
      mesh.position.set(x, y, 0)
      mesh.userData.video = v

      // Title label below card
      const label = new Text()
      label.text          = v.title.toUpperCase()
      label.font          = FONT
      label.fontSize      = 0.115
      label.color         = '#F2F2F2'
      label.letterSpacing = 0.06
      label.anchorX       = 'center'
      label.anchorY       = 'middle'
      label.fillOpacity   = 0.60
      label.position.set(0, -(H / 2 + 0.19), 0.02)
      label.raycast = () => {}
      label.sync()
      mesh.add(label)

      if (v.year) {
        const yearLabel = new Text()
        yearLabel.text          = v.year
        yearLabel.font          = FONT
        yearLabel.fontSize      = 0.075
        yearLabel.color         = '#DC3535'
        yearLabel.letterSpacing = 0.20
        yearLabel.anchorX       = 'center'
        yearLabel.anchorY       = 'middle'
        yearLabel.fillOpacity   = 0.55
        yearLabel.position.set(0, -(H / 2 + 0.38), 0.02)
        yearLabel.raycast = () => {}
        yearLabel.sync()
        mesh.add(yearLabel)
      }

      this._group.add(mesh)

      gsap.to(mat.uniforms.uAlpha, {
        value: 1,
        duration: 0.8,
        delay: 0.20 + i * 0.10,
        ease: 'power2.out',
      })

      this._cards.push({ mesh, mat, label, hoverVal: 0, video: v })
    })
  }

  _bindPointer() {
    window.addEventListener('mousemove', e => {
      if (!this.active) return
      const nx =  (e.clientX / window.innerWidth)  * 2 - 1
      const ny = -(e.clientY / window.innerHeight) * 2 + 1
      this._pointer.x  = nx
      this._pointer.y  = ny
      this._rawMouse.x = nx
      this._rawMouse.y = ny
    })

    window.addEventListener('click', () => {
      if (!this.active || !this._lastHit) return
      const { video } = this._lastHit
      if (video.src) {
        window.dispatchEvent(new CustomEvent('roomVideoClick', { detail: video }))
      }
    })
  }

  enter(proj) {
    this.active = true
    this._group.visible = true
    this._buildCards(proj)
  }

  exit() {
    this.active = false
  }

  cleanup() {
    this._group.visible = false
    this._clearCards()
  }

  update(elapsed) {
    if (!this.active) return

    this._elapsed += elapsed || 0.016

    const LERP = 0.055
    this._lerpMouse.x += (this._rawMouse.x - this._lerpMouse.x) * LERP
    this._lerpMouse.y += (this._rawMouse.y - this._lerpMouse.y) * LERP

    const mx = this._lerpMouse.x
    const my = this._lerpMouse.y

    // Camera parallax around base position
    this.camera.position.x += (mx * 0.08 - this.camera.position.x) * 0.04
    this.camera.position.y += (my * 0.06 - this.camera.position.y) * 0.04
    this.camera.position.z = _CAM_Z
    this.camera.lookAt(mx * 0.35, my * 0.25, -ROOM_HALF)

    this._wallMat.uniforms.uTime.value = this._elapsed
    this._edgeMat.opacity = 0.38 + Math.sin(this._elapsed * 0.9) * 0.18

    // Hover raycasting uses room camera
    this._raycaster.setFromCamera(this._pointer, this.camera)
    const meshes = this._cards.map(c => c.mesh)
    const hits   = this._raycaster.intersectObjects(meshes, false)
    const hit    = hits.length
      ? this._cards.find(c => c.mesh === hits[0].object) || null
      : null

    if (hit !== this._lastHit) {
      window.dispatchEvent(new CustomEvent(hit ? 'cardHover' : 'cardLeave', { detail: hit?.video ?? null }))
      this._lastHit = hit
    }

    this._cards.forEach(card => {
      const isHov = card === hit
      card.hoverVal += ((isHov ? 1 : 0) - card.hoverVal) * 0.12
      card.mat.uniforms.uHover.value = card.hoverVal
      const s = 1 + card.hoverVal * 0.045
      card.mesh.scale.set(s, s, 1)
    })
  }

  destroy() {
    this._clearCards()
  }
}
