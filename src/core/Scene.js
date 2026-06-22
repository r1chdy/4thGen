import * as THREE from 'three'

export const CAM_RADIUS = 13  // telephoto: FOV=30 at 13 ≈ same vertical range as FOV=65 at 5.5

export class Scene {
  constructor() {
    this.instance = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      this._responsiveFOV(),
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 5.0, CAM_RADIUS)

    // Lighting for PBR models
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.instance.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xF2F2F2, 1.0)
    keyLight.position.set(3, 6, 4)
    this.instance.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xC8D8FF, 2.0)
    fillLight.position.set(-4, 2, -3)
    this.instance.add(fillLight)

    const redFill = new THREE.DirectionalLight(0xDC3535, 1.8)
    redFill.position.set(5, -5, 5)
    this.instance.add(redFill)

    this.locked   = false  // set true when DetailRoom takes over camera

    this.mouse    = { x: 0, y: 0 }
    this.lerpMouse = { x: 0, y: 0 }

    window.addEventListener('mousemove', (e) => {
      this.mouse.x =  (e.clientX / window.innerWidth  - 0.5) * 2
      this.mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2
    })

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.fov    = this._responsiveFOV()
      this.camera.updateProjectionMatrix()
    })
  }

  _responsiveFOV() {
    const aspect = window.innerWidth / window.innerHeight
    return aspect < 1 ? Math.min(60, 30 / Math.sqrt(aspect)) : 30
  }

  // scrollY : world-space Y the camera centers on (hero=2.5, decreases with scroll)
  // theta   : orbit angle in radians (0 = front, negative = clockwise when viewed from above)
  update(scrollY = 2.5, theta = 0) {
    if (this.locked) return
    const LERP = 0.06
    this.lerpMouse.x += (this.mouse.x - this.lerpMouse.x) * LERP
    this.lerpMouse.y += (this.mouse.y - this.lerpMouse.y) * LERP

    const ty = scrollY + this.lerpMouse.y * 0.18

    this.camera.position.y += (ty - this.camera.position.y) * 0.05

    this.camera.lookAt(0, scrollY, 0)
  }
}
