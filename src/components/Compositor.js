// Post-processing compositor — blend giữa scene chính và detail room, easing tuỳ chỉnh
import * as THREE from 'three'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(CustomEase)
// Active Theory's workInOut easing — cubic-bezier(.29,.05,.06,.92)
CustomEase.create('workInOut', 'M0,0 C0.29,0.05 0.06,0.92 1,1')

/* ── Compositor shaders ──────────────────────────────────────────── */
const vert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const frag = `
  varying vec2 vUv;
  uniform sampler2D tMain;
  uniform sampler2D tRoom;
  uniform float     uTransition;
  uniform vec2      uOrigin;    // card screen UV (0-1, Y=0 bottom)

  void main() {
    float t = uTransition;

    // Gentle zoom toward card — subtle push-in feel
    float zoom = 1.0 + t * 0.18;
    vec2 mainUV = (vUv - uOrigin) / zoom + uOrigin;
    vec4 main = texture2D(tMain, clamp(mainUV, 0.001, 0.999));

    // Room eases in softly from a slight pull-back
    float roomZoom = 1.0 + (1.0 - t) * 0.07;
    vec2 roomUV = (vUv - 0.5) / roomZoom + 0.5;
    vec4 room = texture2D(tRoom, clamp(roomUV, 0.001, 0.999));

    // Wide, gradual crossfade — no hard edges
    float blend = smoothstep(0.1, 0.9, t);
    gl_FragColor = mix(main, room, blend);
  }
`

/* ── Compositor ──────────────────────────────────────────────────── */
export class Compositor {
  constructor(rendererInstance) {
    this._gl = rendererInstance

    const pr = Math.min(window.devicePixelRatio, 2)
    const w  = Math.round(window.innerWidth  * pr)
    const h  = Math.round(window.innerHeight * pr)

    const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this._mainRT = new THREE.WebGLRenderTarget(w, h, rtOpts)
    this._roomRT = new THREE.WebGLRenderTarget(w, h, rtOpts)

    this._uTransition = { value: 0 }
    this._uOrigin     = new THREE.Vector2(0.5, 0.5)

    this._mat = new THREE.ShaderMaterial({
      vertexShader:   vert,
      fragmentShader: frag,
      uniforms: {
        tMain:       { value: this._mainRT.texture },
        tRoom:       { value: this._roomRT.texture },
        uTransition: this._uTransition,
        uOrigin:     { value: this._uOrigin },
      },
      depthTest:  false,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat)
    mesh.frustumCulled = false
    this._compScene  = new THREE.Scene()
    this._compScene.add(mesh)
    this._compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    window.addEventListener('resize', () => {
      const pr = Math.min(window.devicePixelRatio, 2)
      this._mainRT.setSize(Math.round(window.innerWidth  * pr), Math.round(window.innerHeight * pr))
      this._roomRT.setSize(Math.round(window.innerWidth  * pr), Math.round(window.innerHeight * pr))
    })
  }

  get t()           { return this._uTransition.value }
  get mainTexture() { return this._mainRT.texture }

  // Render both scenes to their RTs, then composite to screen
  render(mainScene, mainCamera, roomScene, roomCamera) {
    const t = this._uTransition.value

    if (t < 0.999) {
      this._gl.setRenderTarget(this._mainRT)
      this._gl.render(mainScene, mainCamera)
    }
    if (t > 0.001) {
      this._gl.setRenderTarget(this._roomRT)
      this._gl.render(roomScene, roomCamera)
    }

    this._gl.setRenderTarget(null)
    this._gl.render(this._compScene, this._compCam)
  }

  // originX/Y: card screen position in CSS UV (0-1, Y=0 top)
  enter(originX, originY) {
    this._uOrigin.set(originX, 1.0 - originY)
    gsap.killTweensOf(this._uTransition)
    gsap.to(this._uTransition, { value: 1, duration: 1.5, ease: 'workInOut' })
  }

  exit() {
    gsap.killTweensOf(this._uTransition)
    gsap.to(this._uTransition, { value: 0, duration: 0.8, ease: 'workInOut' })
  }

  destroy() {
    this._mainRT.dispose()
    this._roomRT.dispose()
    this._mat.dispose()
  }
}
