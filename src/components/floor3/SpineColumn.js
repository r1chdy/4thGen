// Model 3D trung tâm (cột xương sống) — load file GLTF, tự xoay, nằm giữa các tấm card khi scroll
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CAM_Y_START, CAM_Y_RANGE } from './ProjectGrid.js'

const COL_CENTER_Y = CAM_Y_START - CAM_Y_RANGE * 0.5
const COL_X = -1.6
const COL_Y = -30
const COL_Z = -7.7
const COL_ROT_Y = -3.14

const EYE_NAMES = ['Eye_L.003', 'Eye_R.003']

export class SpineColumn {
  constructor(scene) {
    this._group = new THREE.Group()
    this._group.position.set(COL_X, COL_Y, COL_Z)
    this._group.rotation.y = COL_ROT_Y
    scene.instance.add(this._group)
    this._mixer = null
    this._addLights()
    this._load()
  }

  _addLights() {
    const key = new THREE.PointLight(0xd4af37, 6, 30)
    key.position.set(3, 8, 5)
    this._group.add(key)

    const rim = new THREE.PointLight(0x4488ff, 4, 25)
    rim.position.set(-4, 2, -6)
    this._group.add(rim)

    const under = new THREE.PointLight(0xDC3535, 3, 20)
    under.position.set(0, -6, 3)
    this._group.add(under)
  }

  _load() {
    const loader = new GLTFLoader()
    loader.load(
      '/models/Dragon/Dragon_Head_web.glb',
      (gltf) => {
        const model = gltf.scene

        // Auto-fit: center + scale to fit within the scroll column
        const box    = new THREE.Box3().setFromObject(model)
        const size   = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)

        const maxDim    = Math.max(size.x, size.y, size.z)
        const targetSize = 35         // world units tall
        const scale     = targetSize / maxDim

        model.scale.setScalar(scale)
        model.position.sub(center.multiplyScalar(scale))  // re-center after scale

        model.traverse(child => {
          if (!child.isMesh) return

          // Hide baked-in eye meshes — dedicated glowing eyes load separately
          if (EYE_NAMES.includes(child.name)) {
            child.visible = false
            return
          }

          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(m => {
            m.emissive = m.color.clone()
            m.emissiveIntensity = 0
          })
        })

        this._group.add(model)

        // Play animations if any
        if (gltf.animations?.length) {
          this._mixer = new THREE.AnimationMixer(model)
          gltf.animations.forEach(clip => {
            this._mixer.clipAction(clip).play()
          })
        }

        this._loadEyes(model)
      },
      undefined,
      (err) => console.error('[SpineColumn] load error:', err)
    )
  }

  _loadEyes(model) {
    const loader = new GLTFLoader()
    loader.load(
      '/models/Dragon/Dragon_Eyes_web.glb',
      (gltf) => {
        const eyes = gltf.scene
        eyes.position.copy(model.position)
        eyes.scale.copy(model.scale)
        eyes.quaternion.copy(model.quaternion)

        eyes.traverse(child => {
          if (!child.isMesh) return
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach(m => {
            m.color.set(0xd4af37)
            m.roughness = 0.2
            m.metalness = 0.9
            m.emissiveIntensity = 0
          })

          const glowLight = new THREE.PointLight(0xffaa00, 4, 6)
          child.add(glowLight)
        })

        this._group.add(eyes)
      },
      undefined,
      (err) => console.error('[SpineColumn] eyes load error:', err)
    )
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
