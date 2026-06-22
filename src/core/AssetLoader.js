import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Palette cho 5 project cards khi chưa có ảnh thật
const PLACEHOLDER_PALETTES = [
  { from: '#050e1a', to: '#0a2d4a', accent: '#00D4FF' }, // Navy → Cyan
  { from: '#140a00', to: '#3d2000', accent: '#FFB84D' }, // Dark → Gold
  { from: '#0a0020', to: '#1a0050', accent: '#7B5CFF' }, // Black → Purple
  { from: '#001a12', to: '#003d28', accent: '#00FFB0' }, // Black → Teal
  { from: '#1a0010', to: '#3d0028', accent: '#FF4DAA' }, // Black → Magenta
]

function buildPlaceholder(index) {
  const canvas = document.createElement('canvas')
  canvas.width  = 512
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  const pal = PLACEHOLDER_PALETTES[index % PLACEHOLDER_PALETTES.length]

  // Base gradient
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  grad.addColorStop(0, pal.from)
  grad.addColorStop(1, pal.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Subtle grid
  ctx.strokeStyle = `${pal.accent}18`
  ctx.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
  }
  for (let y = 0; y <= canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
  }

  // Corner accent dot
  ctx.fillStyle = `${pal.accent}66`
  ctx.beginPath()
  ctx.arc(20, 20, 4, 0, Math.PI * 2)
  ctx.fill()

  // Centre glow
  const glow = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.4
  )
  glow.addColorStop(0, `${pal.accent}22`)
  glow.addColorStop(1, `${pal.accent}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class AssetLoader {
  constructor() {
    this.textureLoader = new THREE.TextureLoader()
    this.assets = new Map()
    this.total  = 0
    this.loaded = 0
    this._placeholderIdx = 0
    this.onProgress = null // callback(0→1)
  }

  queue(key, url) {
    this.assets.set(key, { url, resource: null })
    this.total++
  }

  load() {
    return new Promise((resolve) => {
      if (this.total === 0) { resolve(); return }
      for (const [key, entry] of this.assets) {
        if (entry.url.match(/\.(mp4|webm)$/i)) {
          this._loadVideo(key, entry, resolve)
        } else if (entry.url.match(/\.(glb|gltf)$/i)) {
          this._loadGLTF(key, entry, resolve)
        } else {
          this._loadTexture(key, entry, resolve)
        }
      }
    })
  }

  _loadTexture(key, entry, resolve) {
    const idx = this._placeholderIdx++
    this.textureLoader.load(
      entry.url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        entry.resource = tex
        this._onAssetLoaded(resolve)
      },
      undefined,
      () => {
        // Real image missing — use branded placeholder
        entry.resource = buildPlaceholder(idx)
        this._onAssetLoaded(resolve)
      }
    )
  }

  _loadVideo(key, entry, resolve) {
    const video = document.createElement('video')
    video.src = entry.url
    video.muted = true
    video.loop  = true
    video.playsInline = true
    video.oncanplaythrough = () => {
      video.play()
      entry.resource = new THREE.VideoTexture(video)
      entry.resource.colorSpace = THREE.SRGBColorSpace
      this._onAssetLoaded(resolve)
    }
    video.onerror = () => this._onAssetLoaded(resolve)
  }

  _loadGLTF(key, entry, resolve) {
    new GLTFLoader().load(
      entry.url,
      (gltf) => {
        entry.resource = gltf
        this._onAssetLoaded(resolve)
      },
      undefined,
      () => {
        entry.resource = null
        this._onAssetLoaded(resolve)
      }
    )
  }

  _onAssetLoaded(resolve) {
    this.loaded++
    if (this.onProgress) this.onProgress(this.loaded / this.total)
    if (this.loaded >= this.total) resolve()
  }

  get(key) {
    return this.assets.get(key)?.resource ?? null
  }
}
