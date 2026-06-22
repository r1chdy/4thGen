// Chữ hero 3D nổi trên màn hình đầu — dùng troika-three-text, animation chữ xuất hiện theo từng dòng
import { Text } from 'troika-three-text'
import * as THREE from 'three'
import gsap from 'gsap'

const FONT = '/fonts/SpaceMono-Bold.ttf'

const LOGO_PATH    = '/images/4thGen.png'
const LOGO_HEIGHT  = 0.32
const LOGO_LOCAL_Y = 0.0

const POS_Z = 0
const POS_Y = 0

const LINES = [
  {
    text:    'YOUR CREATIVE PASSPORT',
    size:    0.034,
    color:   '#DC3535',
    opacity: 0.70,
    spacing: 0.28,
    localY:  0.42,
  },
  {
    text:    'LED FOCUSED · VISUALLY OBSESSIVE · RESULTS DRIVEN',
    size:    0.029,
    color:   '#F2F2F2',
    opacity: 0.38,
    spacing: 0.14,
    localY: -0.40,
    delay:   0.36,
  },
]

export class HeroText {
  constructor(scene) {
    this.scene  = scene.instance
    this.group  = new THREE.Group()
    this.texts  = []
    this._ready = false
    this._logoMesh    = null
    this._logoPending = false

    this.group.position.set(0, POS_Y, POS_Z)
    this.group.rotation.y = 0

    this.scene.add(this.group)
    this._build()
    this._loadLogo()
    this._applyScale()
    window.addEventListener('resize', () => this._applyScale())
  }

  _applyScale() {
    const aspect = window.innerWidth / window.innerHeight
    const s = aspect < 1 ? Math.max(0.50, aspect * 0.90) : 1.0
    this.group.scale.setScalar(s)
  }

  _build() {
    LINES.forEach((line, i) => {
      const t = new Text()

      t.text          = line.text
      t.font          = line.font ?? FONT
      t.fontSize      = line.size
      t.color         = line.color
      t.letterSpacing = line.spacing
      t.anchorX       = 'center'
      t.anchorY       = 'middle'
      t.fillOpacity   = 0

      t.position.set(0, line.localY - 0.18, 0)
      t.userData.targetY  = line.localY
      t.userData.maxAlpha = line.opacity
      t.userData.delay    = line.delay ?? (0.06 + i * 0.10)

      t.sync()
      this.group.add(t)
      this.texts.push(t)
    })

    this.texts[0].addEventListener('synccomplete', () => {
      if (this._ready) return
      this._ready = true
    }, { once: true })
  }

  _loadLogo() {
    const loader = new THREE.TextureLoader()
    loader.load(LOGO_PATH, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      const aspect = tex.image.width / tex.image.height
      const h = LOGO_HEIGHT
      const w = h * aspect

      const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      mesh.position.set(0, LOGO_LOCAL_Y - 0.18, 0)
      mesh.userData.targetY  = LOGO_LOCAL_Y
      mesh.userData.maxAlpha = 1.0

      this.group.add(mesh)
      this._logoMesh = mesh

      if (this._logoPending) this._animateLogoIn()
    })
  }

  // Called from main.js after reveal sequence completes
  animateIn() {
    if (!this._ready) {
      // Retry once font syncs
      this.texts[0].addEventListener('synccomplete', () => this.animateIn(), { once: true })
      return
    }
    this.texts.forEach(t => {
      gsap.to(t.position, {
        y: t.userData.targetY,
        duration: 1.1,
        delay: t.userData.delay,
        ease: 'power3.out',
      })
    })
    this._animateLogoIn()
  }

  _animateLogoIn() {
    if (!this._logoMesh) {
      this._logoPending = true
      return
    }
    gsap.to(this._logoMesh.position, {
      y: this._logoMesh.userData.targetY,
      duration: 1.1,
      delay: 0.20,
      ease: 'power3.out',
    })
  }

  update({ progress, camY = 0, vertScale = 7 }) {
    if (!this._ready) return

    const textY = -(camY + 4.5) * 2 / vertScale
    this.group.position.y = textY

    this.texts.forEach(t => { t.fillOpacity = t.userData.maxAlpha })
    if (this._logoMesh) this._logoMesh.material.opacity = this._logoMesh.userData.maxAlpha
  }

  destroy() {
    this.texts.forEach(t => { t.dispose(); this.group.remove(t) })
    if (this._logoMesh) {
      this._logoMesh.geometry.dispose()
      this._logoMesh.material.map?.dispose()
      this._logoMesh.material.dispose()
      this.group.remove(this._logoMesh)
    }
    this.scene.remove(this.group)
  }
}
