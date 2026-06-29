import * as THREE from 'three'
import { CAM_Y_START, CAM_Y_RANGE } from './ProjectGrid.js'

const COL_CENTER_Y = CAM_Y_START - CAM_Y_RANGE * 0.5
const COL_X = 0
const COL_Y = -25
const COL_Z = 0
const COL_ROT_Y = -3.14

export class SpineColumn {
  constructor(scene, gltf) {
    this._group = new THREE.Group()
    this._group.position.set(COL_X, COL_Y, COL_Z)
    this._group.rotation.y = COL_ROT_Y
    scene.instance.add(this._group)
    this._mixer = null
    this._addLights()
    if (gltf) this._applyModel(gltf)
  }

  _addLights() {
    const key = new THREE.PointLight(0xfff8e7, 14, 60)
    key.position.set(6, 16, 10)
    this._group.add(key)

    const rimR = new THREE.PointLight(0xd4af37, 16, 55)
    rimR.position.set(7, 12, -16)
    this._group.add(rimR)

    const rimL = new THREE.PointLight(0x4466dd, 10, 50)
    rimL.position.set(-8, 8, -14)
    this._group.add(rimL)

    const fill = new THREE.PointLight(0x8090cc, 2, 35)
    fill.position.set(-8, 4, 8)
    this._group.add(fill)

    const under = new THREE.PointLight(0xDC3535, 4, 25)
    under.position.set(0, -10, 5)
    this._group.add(under)
  }

  _applyModel(gltf) {
    const model = gltf.scene
    const box   = new THREE.Box3().setFromObject(model)
    const size  = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const scale = 35 / Math.max(size.x, size.y, size.z)
    model.scale.setScalar(scale)
    model.position.sub(center.multiplyScalar(scale))

    model.traverse(child => {
      if (!child.isMesh) return
    })

    this._group.add(model)
    if (gltf.animations?.length) {
      this._mixer = new THREE.AnimationMixer(model)
      gltf.animations.forEach(clip => this._mixer.clipAction(clip).play())
    }
  }

  get group() { return this._group }

  update({ elapsed, delta = 0.016 }) {
    if (this._mixer) this._mixer.update(delta)
  }

  destroy() {
    this._group.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material.dispose()
      }
    })
    this._group.parent?.remove(this._group)
  }
}
