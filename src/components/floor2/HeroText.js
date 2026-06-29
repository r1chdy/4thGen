import * as THREE from 'three'

let Text = null
let _troika = null
const ensureText = () => (_troika ??= import('troika-three-text').then(m => { Text = m.Text }))
import gsap from 'gsap'

const FONT = '/fonts/SpaceMono-Bold.ttf'

const LOGO_PATH    = '/images/4thGen.png'
const LOGO_HEIGHT  = 0.32
const LOGO_LOCAL_Y = 0.0

const POS_Z  = 0
const POS_Y  = 0
const LEFT_X  = -0.72
const RIGHT_X =  0.38

const RIGHT_TEXT = `At 4th Gen Studio, we specialise in turning LED displays into the heartbeat of the casino floor, blending motion, light, and sound to create visuals that stop players in their tracks and keep them coming back.\n\nFrom the shimmer of jackpot reveals to the drama of tournament intros, our tailored 2D and 3D animations transform static branding into living, breathing attractions. Whether it’s a looping LED stadium, a fully themed gaming zone, or cinematic content for a high-limit room, we make your brand the main event.`

const MOBILE_RIGHT_TEXT = `At 4th Gen Studio, we specialise in turning LED displays into the heartbeat of the casino floor — blending motion, light, and sound to create visuals that stop players in their tracks and keep them coming back.`

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
    this._rightText = null

    this.scene.add(this.group)
    this._initText()
    window.addEventListener('resize', () => this._applyScale())
  }

  async _initText() {
    await ensureText()
    this._build()
    this._buildRight()
    this._loadLogo()
    this._applyScale()
  }

  _applyScale() {
    const aspect = window.innerWidth / window.innerHeight
    const isMobile = aspect < 1
    const s = isMobile ? Math.max(0.50, aspect * 0.90) : 1.0
    this.group.scale.setScalar(s)

    const lx = isMobile ? 0 : LEFT_X
    // Mobile: logo → title → subtitle (top to bottom)
    const targetY = isMobile
      ? [0.38, -0.52]
      : [LINES[0].localY, LINES[1].localY]
    const logoY = isMobile ? 0.68 : LOGO_LOCAL_Y

    this.texts.forEach((t, i) => {
      t.position.x = lx
      t.position.y = targetY[i]
      t.userData.targetY = targetY[i]
    })
    if (this._logoMesh) {
      this._logoMesh.position.x = lx
      this._logoMesh.position.y = logoY
      this._logoMesh.userData.targetY = logoY
    }
    if (this._rightText) {
      this._rightText.visible = true
      if (isMobile) {
        this._rightText.text        = MOBILE_RIGHT_TEXT
        this._rightText.fontSize    = 0.055
        this._rightText.maxWidth    = 1.50
        this._rightText.anchorX     = 'center'
        this._rightText.position.x  = 0
        this._rightText.position.y  = -0.64
        this._rightText.userData.targetY = -0.64
      } else {
        this._rightText.text        = RIGHT_TEXT
        this._rightText.fontSize    = 0.028
        this._rightText.maxWidth    = 0.78
        this._rightText.anchorX     = 'left'
        this._rightText.position.x  = RIGHT_X
        this._rightText.position.y  = this._rightText.userData.targetY ?? 0.30
      }
    }
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

      t.position.set(LEFT_X, line.localY - 0.18, 0)
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

  _buildRight() {
    const t = new Text()
    t.text          = RIGHT_TEXT
    t.font          = FONT
    t.fontSize      = 0.028
    t.color         = '#F2F2F2'
    t.maxWidth      = 0.78
    t.lineHeight    = 1.55
    t.letterSpacing = 0.04
    t.anchorX       = 'left'
    t.anchorY       = 'top'
    t.fillOpacity   = 0
    t.position.set(RIGHT_X, 0.30 - 0.18, 0)
    t.userData.targetY  = 0.30
    t.userData.maxAlpha = 0.58
    t.userData.delay    = 0.55
    t.sync()
    this.group.add(t)
    this._rightText = t
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
      mesh.position.set(LEFT_X, LOGO_LOCAL_Y - 0.18, 0)
      mesh.userData.targetY  = LOGO_LOCAL_Y
      mesh.userData.maxAlpha = 1.0

      this.group.add(mesh)
      this._logoMesh = mesh
      this._applyScale()

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
    if (this._rightText) {
      gsap.to(this._rightText.position, {
        y: this._rightText.userData.targetY,
        duration: 1.2,
        delay: this._rightText.userData.delay,
        ease: 'power3.out',
      })
    }
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
    if (this._rightText) this._rightText.fillOpacity = this._rightText.userData.maxAlpha
    if (this._logoMesh) this._logoMesh.material.opacity = this._logoMesh.userData.maxAlpha
  }

  destroy() {
    this.texts.forEach(t => { t.dispose(); this.group.remove(t) })
    if (this._rightText) { this._rightText.dispose(); this.group.remove(this._rightText) }
    if (this._logoMesh) {
      this._logoMesh.geometry.dispose()
      this._logoMesh.material.map?.dispose()
      this._logoMesh.material.dispose()
      this.group.remove(this._logoMesh)
    }
    this.scene.remove(this.group)
  }
}
