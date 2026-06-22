import * as THREE from 'three'

export class Renderer {
  constructor() {
    this.canvas = document.getElementById('webgl')
    this.width = window.innerWidth
    this.height = window.innerHeight

    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })

    this.instance.setSize(this.width, this.height)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.instance.setClearColor(0x020202, 1)
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.2

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  _onResize() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.instance.setSize(this.width, this.height)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render(scene, camera) {
    this.instance.render(scene, camera)
  }

  destroy() {
    window.removeEventListener('resize', this._onResize)
    this.instance.dispose()
  }
}
