import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { Renderer }    from './core/Renderer.js'
import { Scene }       from './core/Scene.js'
import { RafLoop }     from './core/RafLoop.js'
import { AssetLoader } from './core/AssetLoader.js'
import { Background, FLOOR1_Y, FLOOR2_Y } from './components/Background.js'
import { ProjectGrid } from './components/floor3/ProjectGrid.js'
import { Cursor }      from './components/Cursor.js'
import { Nav }         from './components/Nav.js'
import { Transition }  from './components/Transition.js'
import { LogoHero }                          from './components/floor1/LogoHero.js'
import { CAM_Y_START, CAM_Y_RANGE, THETA_MAX, ROT_DELAY } from './components/floor3/ProjectGrid.js'
import { SpineColumn }      from './components/floor3/SpineColumn.js'
import { SmokeCursor }      from './components/SmokeCursor.js'
import { VideoLight }       from './components/VideoLight.js'
import { HeroText }         from './components/floor2/HeroText.js'
import { DetailRoom }        from './components/floor3/DetailRoom.js'
import { Compositor }        from './components/Compositor.js'
import { CAM_RADIUS }        from './core/Scene.js'

gsap.registerPlugin(ScrollTrigger)

// Reset scroll to top on every reload
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)
window.addEventListener('beforeunload', () => window.scrollTo(0, 0))

const TEXTURE_URLS = [
  '/textures/proj1.jpg',
  '/textures/proj2.jpg',
  '/textures/proj3.jpg',
  '/textures/proj4.jpg',
  '/textures/proj5.jpg',
]

// 3 sections, mỗi cái 1 viewport — targetY = idx * innerHeight
const SECTION_COUNT = 3
const sectionScroll = (idx) => Math.max(0, idx) * window.innerHeight

async function init() {

  // ── Core ─────────────────────────────────────────────────────────
  const renderer = new Renderer()
  const scene    = new Scene()
  const raf      = new RafLoop()

  // ── Assets ───────────────────────────────────────────────────────
  const loader = new AssetLoader()
  TEXTURE_URLS.forEach((url, i) => loader.queue('proj' + (i + 1), url))

  // ── Components ───────────────────────────────────────────────────
  // ── Environments ─────────────────────────────────────────────────
  // Env 1 (scene.instance): SpineColumn + ProjectGrid (cards) + Background
  // Env 2 (logoScene):      LogoHero only
  // Env 3 (heroTextScene):  HeroText only
  const logoScene     = new THREE.Scene()
  const logoWrapper   = { instance: logoScene }
  const heroTextScene = new THREE.Scene()
  const heroTextWrapper = { instance: heroTextScene }

  const _htA = window.innerWidth / window.innerHeight
  const heroOrthoCamera = new THREE.OrthographicCamera(-_htA, _htA, 1, -1, 0.1, 10)
  heroOrthoCamera.position.z = 5
  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight
    heroOrthoCamera.left  = -a
    heroOrthoCamera.right =  a
    heroOrthoCamera.updateProjectionMatrix()
  })

  const bg          = new Background(scene)
  const grid        = new ProjectGrid(scene, loader)
  const spineColumn     = new SpineColumn(scene)
  const SPINE_BASE_Y    = spineColumn.group.position.y
  new SmokeCursor()
  const videoLight      = new VideoLight(scene, grid.videoEl)
  const heroText        = new HeroText(heroTextWrapper)

  const detailRoom      = new DetailRoom()
  const compositor      = new Compositor(renderer.instance)

  const _f2cUniforms = {
    tMain:       { value: compositor.mainTexture },
    uCamY:       { value: 0 },
    uVertScale:  { value: 7 },
    uTransition: { value: 0 },
  }
  const _f2cMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader:   `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tMain;
        uniform float uCamY;
        uniform float uVertScale;
        uniform float uTransition;
        const float FLOOR1 = 0.0;
        const float FLOOR2 = -9.0;
        void main() {
          float worldY  = uCamY + (vUv.y - 0.5) * uVertScale;
          float tiltedY = worldY + (vUv.x - 0.5) * 1.5;
          float z1 = step(FLOOR1, tiltedY);
          float z2 = step(FLOOR2, tiltedY) * (1.0 - z1);
          float z3 = 1.0 - z1 - z2;
          if (z2 > 0.5) {
            if (uTransition < 0.01) discard;
            gl_FragColor = texture2D(tMain, vUv);
            return;
          }
          if (z3 > 0.5 && uTransition > 0.01) discard;
          gl_FragColor = texture2D(tMain, vUv);
        }
      `,
      uniforms:    _f2cUniforms,
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
    })
  )
  _f2cMesh.frustumCulled = false
  _f2cMesh.renderOrder   = 200
  const coverScene = new THREE.Scene()
  coverScene.add(_f2cMesh)

  const cursor      = new Cursor()
  const nav         = new Nav()
  const transition  = new Transition(renderer.instance)
  let logoHero = null   // created after reveal sequence completes

  let _camScrollY = 5.0
  let _camTheta   = 0
  let _targetScrollY = 5.0
  let _targetTheta   = 0

  // Track mouse click position (UV space, Y NOT flipped — Transition flips internally)
  const clickOrigin = { x: 0.5, y: 0.5 }
  document.addEventListener('mousedown', (e) => {
    clickOrigin.x = e.clientX / window.innerWidth
    clickOrigin.y = e.clientY / window.innerHeight
  })

  // ── Step 7: Lenis smooth scroll ──────────────────────────────────
  // Force scroll to top before Lenis reads initial position
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0

  const lenis = new Lenis({
    duration:        1.4,
    easing:          (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel:     true,
    wheelMultiplier: 0.7,
  })
  lenis.scrollTo(0, { immediate: true })

  // Lenis được driven bởi GSAP ticker (không tạo RAF loop thứ 2)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
  lenis.on('scroll', ScrollTrigger.update)

  // ── RAF loop ─────────────────────────────────────────────────────
  raf.add(({ delta, elapsed }) => {
    // progress: 0 → 1 (Hero → About)
    const progress = lenis.progress

    // 0 → 30%  : hero section — camera descends smoothly from 2.5 → CAM_Y_START
    // 30% → 100%: helix scroll — camera follows cards downward
    const HERO_END   = 0.42
    const heroProg   = Math.min(1, progress / HERO_END)
    const cardProg   = Math.max(0, (progress - HERO_END) / (1.0 - HERO_END))

    if (!scene.locked) {
      _targetTheta = Math.max(0, (cardProg - ROT_DELAY) / (1 - ROT_DELAY)) * THETA_MAX

      const rawY = progress < HERO_END
        ? 5.0 + (CAM_Y_START - 5.0) * heroProg
        : CAM_Y_START - cardProg * CAM_Y_RANGE
      const maxDelta = 0.10
      _targetScrollY += Math.max(-maxDelta, Math.min(maxDelta, rawY - _targetScrollY))

      _camScrollY += (_targetScrollY - _camScrollY) * 0.9
      _camTheta   += (_targetTheta   - _camTheta)   * 0.04
    }

    grid.group.position.y        = 0
    spineColumn.group.position.y = SPINE_BASE_Y

    scene.instance.rotation.y = -_camTheta
    scene.update(_camScrollY, _camTheta)

    scene.camera.updateMatrixWorld()
    scene.instance.updateMatrixWorld()

    const fovRad    = THREE.MathUtils.degToRad(scene.camera.fov)
    const vertScale = 2 * Math.tan(fovRad / 2) * CAM_RADIUS
    bg.update({ elapsed, camY: scene.camera.position.y, vertScale })
    grid.update({ elapsed, camY: scene.camera.position.y })
    spineColumn.update({ elapsed, delta })
    videoLight.update()
    if (logoHero) logoHero.update({ elapsed, progress })
    heroText.update({ progress, camY: scene.camera.position.y, vertScale })
    detailRoom.update(delta)
    cursor.update()

    _f2cUniforms.uCamY.value       = scene.camera.position.y
    _f2cUniforms.uVertScale.value  = vertScale
    _f2cUniforms.uTransition.value = compositor.t

    compositor.render(scene.instance, scene.camera, detailRoom.scene, detailRoom.camera)

    const cy = scene.camera.position.y
    const V  = THREE.Vector3

    renderer.instance.autoClear = false

    renderer.instance.clippingPlanes = []
    renderer.instance.clearDepth()
    if (compositor.t < 0.01) renderer.instance.render(heroTextScene, heroOrthoCamera)
    renderer.instance.render(coverScene, scene.camera)

    // floor1: logo clipped to world_y > FLOOR1_Y, renders on top of floor2Cover
    renderer.instance.clippingPlanes = [
      new THREE.Plane(new V(0, 1, 0), cy - FLOOR1_Y),
    ]
    renderer.instance.clearDepth()
    renderer.instance.render(logoScene, scene.camera)

    renderer.instance.clippingPlanes = []
    renderer.instance.autoClear = true
  })
  raf.start()

  // ── Scroll events ─────────────────────────────────────────────
  const scrollHint = document.getElementById('scrollHint')

  lenis.on('scroll', ({ scroll, progress }) => {
    // Scroll hint ẩn sau khi bắt đầu scroll
    if (scroll > 40 && scrollHint) {
      gsap.to(scrollHint, { opacity: 0, duration: 0.4, ease: 'power2.out', overwrite: true })
    } else if (scroll <= 40 && scrollHint) {
      gsap.to(scrollHint, { opacity: 1, duration: 0.4, ease: 'power2.out', overwrite: true })
    }

    // Nav dot tracking — chia 3 sections đều nhau
    const section = Math.min(SECTION_COUNT - 1, Math.floor(progress * SECTION_COUNT))
    nav.setActiveDot(section)
  })

  // ── Nav + dot click → Lenis scroll to section ────────────────
  const SECTION_MAP = { hero: 0, work: 1, about: 2, contact: 2 }

  window.addEventListener('navTo', (e) => {
    const idx = SECTION_MAP[e.detail] ?? 0
    lenis.scrollTo(sectionScroll(idx), {
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
  })

  window.addEventListener('dotClick', (e) => {
    lenis.scrollTo(sectionScroll(e.detail), {
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
  })

  // ── Loader ───────────────────────────────────────────────────────
  const loaderFill    = document.getElementById('loaderFill')
  const loaderPercent = document.getElementById('loaderPercent')
  const counter = { value: 0 }

  loader.onProgress = (pct) => {
    gsap.to(counter, {
      value: pct * 100,
      duration: 0.4,
      ease: 'power1.out',
      onUpdate() {
        const v = Math.round(counter.value)
        if (loaderFill)    loaderFill.style.width = v + '%'
        if (loaderPercent) loaderPercent.textContent = v
      },
    })
  }

  await Promise.all([
    loader.load(),
    new Promise(r => setTimeout(r, 800)),
  ])

  // Counter đến 100
  await new Promise(resolve => {
    gsap.to(counter, {
      value: 100,
      duration: 0.3,
      ease: 'power1.out',
      onUpdate() {
        const v = Math.round(counter.value)
        if (loaderFill)    loaderFill.style.width = v + '%'
        if (loaderPercent) loaderPercent.textContent = v
      },
      onComplete: resolve,
    })
  })

  // ── Reveal sequence ───────────────────────────────────────────────
  const tl = gsap.timeline()

  tl.to('.ls-studio, .ls-eyebrow, .ls-track, .ls-num', {
    opacity: 0, y: -16,
    duration: 0.5, stagger: 0.05,
    ease: 'power2.in',
  })
  .to('#loader-screen', {
    yPercent: -100,
    duration: 0.9,
    ease: 'power3.inOut',
    onComplete: () => {
      document.getElementById('loader-screen').style.display = 'none'
      logoHero = new LogoHero(logoWrapper)
    },
  }, '-=0.1')
  .to('#overlay', { opacity: 1, duration: 0.4, ease: 'power2.out' }, '-=0.4')
  .from('#nav', { y: -20, opacity: 0, duration: 0.8, ease: 'power3.out' }, '-=0.3')
  .from('.scroll-hint', { opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.3')

  // After full reveal — trigger hero text entrance
  tl.then(() => heroText.animateIn())

  // ── Info panel — card hover ────────────────────────────────────
  const infoTitle = document.querySelector('.info-panel__title')
  const infoYear  = document.querySelector('.info-panel__year')

  window.addEventListener('cardHover', (e) => {
    if (!e.detail) return
    gsap.to('#info-panel', { opacity: 1, duration: 0.25, ease: 'power2.out' })
    if (infoTitle) infoTitle.textContent = e.detail.title
    if (infoYear)  infoYear.textContent  = e.detail.year
  })
  window.addEventListener('cardLeave', () => {
    gsap.to('#info-panel', { opacity: 0.35, duration: 0.25, ease: 'power2.out' })
  })

  // ── Detail room (3D) ─────────────────────────────────────────
  const roomBackBtn = document.getElementById('room-back')

  let _clickedMesh  = null
  let _clickedOrigY = 0
  let _clickedMat   = null

  function exitRoom() {
    if (!detailRoom.active) return

    detailRoom.exit()
    compositor.exit()
    grid.fade(1, 0.8)

    if (_clickedMat) {
      gsap.to(_clickedMat.uniforms.uDissolve, { value: 0, duration: 0.35, ease: 'power2.out', overwrite: true })
    }

    const m     = _clickedMesh
    const origY = _clickedOrigY
    _clickedMesh = null
    _clickedMat  = null

    roomBackBtn.style.display = 'none'

    gsap.delayedCall(0.8, () => {
      detailRoom.cleanup()

      if (m) {
        gsap.to(m.position, {
          x: m.userData.baseX, y: origY, z: m.userData.baseZ,
          duration: 0.6, ease: 'power2.inOut',
          onComplete: () => {
            grid.setFlyMode(m, false)
            scene.locked = false
            lenis.start()
          },
        })
        gsap.to(m.scale,    { x: grid.baseScale, y: grid.baseScale, duration: 0.6, ease: 'power2.inOut' })
        gsap.to(m.rotation, { y: m.userData.baseRotY, duration: 0.6, ease: 'power2.inOut' })
      } else {
        scene.locked = false
        lenis.start()
      }
    })
  }

  document.getElementById('room-back').addEventListener('click', exitRoom)

  // Scroll down to exit the room
  let _wheelCooldown = false
  window.addEventListener('wheel', (e) => {
    if (!detailRoom.active || _wheelCooldown) return
    if (Math.abs(e.deltaY) > 30) {
      _wheelCooldown = true
      setTimeout(() => { _wheelCooldown = false }, 1500)
      exitRoom()
    }
  }, { passive: true })

  // ── Video modal (opens when a room card is clicked) ───────────
  const videoModal       = document.getElementById('video-modal')
  const videoModalPlayer = document.getElementById('video-modal-player')
  const videoModalTitle  = document.querySelector('.video-modal-title')

  window.addEventListener('roomVideoClick', (e) => {
    videoModalPlayer.src = e.detail.src
    videoModalTitle.textContent = e.detail.title.toUpperCase()
    videoModalPlayer.load()
    videoModalPlayer.play().catch(() => {})
    videoModal.classList.add('active')
    videoModal.setAttribute('aria-hidden', 'false')
    gsap.to(videoModal, { opacity: 1, duration: 0.35, ease: 'power2.out' })
  })

  document.getElementById('video-modal-close').addEventListener('click', () => {
    gsap.to(videoModal, {
      opacity: 0, duration: 0.3, ease: 'power2.inOut',
      onComplete: () => {
        videoModal.classList.remove('active')
        videoModal.setAttribute('aria-hidden', 'true')
        videoModalPlayer.pause()
        videoModalPlayer.src = ''
      },
    })
  })

  // ── Card click → compositor transition (no camera move) ─────────
  window.addEventListener('cardClick', (e) => {
    if (scene.locked) return

    const { proj, mat, mesh, rotY } = e.detail

    scene.locked = true
    lenis.stop()

    // Store for exit reset
    _clickedMesh  = mesh
    _clickedOrigY = mesh.position.y
    _clickedMat   = mat

    // Disable hover system — GSAP owns this card now
    grid.setFlyMode(mesh, true)
    grid.fade(0, 1.1, mat)

    // Phase 1 (0–0.8s): card glides to center in floor 3 zone
    // Push camera deep enough that the entire screen (incl. tilted boundary) is in floor3
    const fovRad   = THREE.MathUtils.degToRad(scene.camera.fov)
    const vScale   = 2 * Math.tan(fovRad / 2) * CAM_RADIUS
    const floor3Y  = FLOOR2_Y - vScale * 0.52 - 0.85
    const tx = Math.sin(_camTheta) * (CAM_RADIUS - 1.0)
    const tz = Math.cos(_camTheta) * (CAM_RADIUS - 1.0)
    const targetCardY = Math.min(scene.camera.position.y, floor3Y)
    gsap.to(mesh.position, { x: tx, y: targetCardY, z: tz, duration: 0.8, ease: 'power3.out' })
    gsap.to(mesh.scale,    { x: grid.baseScale * 1.06, y: grid.baseScale * 1.06, duration: 0.8, ease: 'power3.out' })
    gsap.to(mesh.rotation, { y: _camTheta,             duration: 0.8, ease: 'power2.out' })

    // Enter room — called once camera is fully in floor3 zone
    const enterRoom = () => {
      detailRoom.enter(proj)
      compositor.enter(0.5, 0.5)
      gsap.to(mat.uniforms.uDissolve, { value: 1, duration: 1.4, ease: 'workInOut' })
      gsap.delayedCall(1.6, () => { roomBackBtn.style.display = 'flex' })
    }

    // Slide camera deep into floor3 so entire screen is in floor3 zone before room reveals
    if (scene.camera.position.y > floor3Y) {
      gsap.to(scene.camera.position, {
        y: floor3Y,
        duration: 0.8,
        ease: 'power3.out',
        onUpdate() {
          _camScrollY = scene.camera.position.y
          scene.camera.lookAt(0, scene.camera.position.y, 0)
        },
        onComplete: enterRoom,
      })
    } else {
      gsap.delayedCall(0.15, enterRoom)
    }
  })
}

init()
