import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'

const CLIP_VERT_INJECT = `
  varying vec2 vScreenUV_clip;
`
const CLIP_VERT_MAIN = `
  vScreenUV_clip = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
`
const CLIP_FRAG_INJECT = `
  varying vec2  vScreenUV_clip;
  uniform float uCamY;
  uniform float uVertScale;
`
const CLIP_FRAG_MAIN = `
  {
    float _worldY  = uCamY + (vScreenUV_clip.y - 0.5) * uVertScale;
    float _tiltedY = _worldY + (vScreenUV_clip.x - 0.5) * 1.5;
    if (_tiltedY >= 0.0)   discard;
    if (_tiltedY < -9.0)   discard;
  }
`

export class Floor2Sphere {
  constructor(scene, gltf) {
    this._uniforms = {
      uCamY:      { value: 0 },
      uVertScale: { value: 7 },
    }

    this._root = gltf.scene.clone()
    this._root.renderOrder = 101

    this._root.frustumCulled = false
    this._root.traverse((obj) => {
      obj.frustumCulled = false
if (!obj.isMesh) return
      obj.renderOrder = 101

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        mat.transparent = true
        mat.depthWrite  = false
        mat.depthTest   = false

        const uCamY      = this._uniforms.uCamY
        const uVertScale = this._uniforms.uVertScale

        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uCamY      = uCamY
          shader.uniforms.uVertScale = uVertScale

          shader.vertexShader = CLIP_VERT_INJECT + shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>\n${CLIP_VERT_MAIN}`
          )
          shader.fragmentShader = CLIP_FRAG_INJECT + shader.fragmentShader
            .replace(
              'void main() {',
              `void main() {\n${CLIP_FRAG_MAIN}`
            )
            .replace(
              '#include <dithering_fragment>',
              mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial
                ? `#include <dithering_fragment>
                  {
                    vec3  _vd  = normalize(vViewPosition);
                    float _fr  = pow(1.0 - max(0.0, dot(normal, _vd)), 4.5);
                    gl_FragColor.rgb += vec3(1.0, 0.05, 0.03) * _fr * 0.5;
                  }`
                : '#include <dithering_fragment>'
            )
        }
        mat.needsUpdate = true
      })
    })

    // Scale and position to match previous sphere
    this._root.scale.setScalar(20)
    this._root.position.set(0.0, -17.0, 0.0)

    scene.instance.add(this._root)

    RectAreaLightUniformsLib.init()

    this._areaLight = new THREE.RectAreaLight(0xdc3535, 8, 40, 40)
    this._areaLight.position.set(0, 10, -30)
    this._areaLight.lookAt(0, -17, 0)
    scene.instance.add(this._areaLight)

  }

  update({ camY, vertScale }) {
    this._uniforms.uCamY.value      = camY
    this._uniforms.uVertScale.value = vertScale

    // Slow rotation
    this._root.rotation.y += 0.001
  }

  destroy() {
    this._areaLight.parent?.remove(this._areaLight)
    this._root.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => m.dispose())
      }
    })
    this._root.parent?.remove(this._root)
  }
}
