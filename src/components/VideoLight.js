// Ánh sáng động lấy màu từ video — đặt gần tấm card đầu tiên, đổi màu theo frame video
import * as THREE from 'three'
import { SPIRAL } from './floor3/ProjectGrid.js'

const CARD_RADIUS = 3.2

export class VideoLight {
  constructor(scene, videoEl) {
    this._scene    = scene.instance
    this._videoEl  = videoEl
    this._frame    = 0
    this._color    = new THREE.Color(0.1, 0.05, 0.05)
    this._colorTarget = new THREE.Color(0.1, 0.05, 0.05)

    // Card 0 world position
    const { angle, y } = SPIRAL[0]
    const cx = CARD_RADIUS * Math.sin(angle)
    const cz = CARD_RADIUS * Math.cos(angle)

    // Inward direction (toward column center)
    const inX = -Math.sin(angle)
    const inZ = -Math.cos(angle)

    // 3 lights: center + top-left + bottom-right offsets
    const positions = [
      new THREE.Vector3(cx,        y,        cz),
      new THREE.Vector3(cx + inX * 0.2 - 0.5, y + 0.6,  cz + inZ * 0.2),
      new THREE.Vector3(cx + inX * 0.2 + 0.5, y - 0.6,  cz + inZ * 0.2),
    ]
    const intensities = [2.2, 1.0, 1.0]

    this._lights = positions.map((pos, i) => {
      const light = new THREE.PointLight(0xffffff, intensities[i], 6.0, 1.5)
      light.position.copy(pos)
      this._scene.add(light)
      return light
    })

    // Tiny canvas for color sampling
    this._canvas = document.createElement('canvas')
    this._canvas.width = this._canvas.height = 4
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true })
  }

  _sampleVideo() {
    try {
      this._ctx.drawImage(this._videoEl, 0, 0, 4, 4)
      const data = this._ctx.getImageData(0, 0, 4, 4).data
      let r = 0, g = 0, b = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]
      }
      // Boost saturation: subtract grey base so colour pops
      const gr = r / n / 255
      const gg = g / n / 255
      const gb = b / n / 255
      const grey = (gr + gg + gb) / 3
      const sat  = 2.2
      this._colorTarget.setRGB(
        grey + (gr - grey) * sat,
        grey + (gg - grey) * sat,
        grey + (gb - grey) * sat,
      )
    } catch (_) {}
  }

  update() {
    this._frame++

    // Sample every 6 frames (~10fps at 60fps)
    if (this._frame % 6 === 0) this._sampleVideo()

    // Smooth color lerp
    this._color.lerp(this._colorTarget, 0.08)

    this._lights.forEach(l => l.color.copy(this._color))
  }

  destroy() {
    this._lights.forEach(l => this._scene.remove(l))
  }
}
