// Post-processing compositor — blend giữa scene chính và detail room, easing tuỳ chỉnh
import * as THREE from 'three'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(CustomEase)
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
  uniform vec2      uOrigin;

  void main() {
    float t = uTransition;

    float zoom = 1.0 + t * 0.18;
    vec2 mainUV = (vUv - uOrigin) / zoom + uOrigin;
    vec4 main = texture2D(tMain, clamp(mainUV, 0.001, 0.999));

    float roomZoom = 1.0 + (1.0 - t) * 0.07;
    vec2 roomUV = (vUv - 0.5) / roomZoom + 0.5;
    vec4 room = texture2D(tRoom, clamp(roomUV, 0.001, 0.999));

    float blend = smoothstep(0.1, 0.9, t);
    gl_FragColor = mix(main, room, blend);
  }
`

const distortVert = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const distortFrag = `
  varying vec2 vUv;
  uniform sampler2D tScreen;
  uniform sampler2D tSmoke;
  uniform float     uDistortStr;

  void main() {
    const float e = 0.004;
    float r0 = texture2D(tSmoke, vUv).r;
    float rx = texture2D(tSmoke, vUv + vec2(e,   0.0)).r;
    float ry = texture2D(tSmoke, vUv + vec2(0.0,  e )).r;
    vec2 distort = vec2(rx - r0, ry - r0) * uDistortStr;
    gl_FragColor = texture2D(tScreen, clamp(vUv + distort, 0.001, 0.999));
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
    this._mainRT  = new THREE.WebGLRenderTarget(w, h, rtOpts)
    this._roomRT  = new THREE.WebGLRenderTarget(w, h, rtOpts)
    this._finalRT = new THREE.WebGLRenderTarget(w, h, rtOpts)

    this._uTransition = { value: 0 }
    this._uOrigin     = new THREE.Vector2(0.5, 0.5)

    this._smokeTex = new THREE.CanvasTexture(document.createElement('canvas'))

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
    this._compScene = new THREE.Scene()
    this._compScene.add(mesh)
    this._compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this._postMat = new THREE.ShaderMaterial({
      vertexShader:   distortVert,
      fragmentShader: distortFrag,
      uniforms: {
        tScreen:     { value: this._finalRT.texture },
        tSmoke:      { value: this._smokeTex },
        uDistortStr: { value: 5.0 },
      },
      depthTest:  false,
      depthWrite: false,
    })
    const postMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._postMat)
    postMesh.frustumCulled = false
    this._postScene = new THREE.Scene()
    this._postScene.add(postMesh)

    window.addEventListener('resize', () => {
      const pr = Math.min(window.devicePixelRatio, 2)
      const rw = Math.round(window.innerWidth  * pr)
      const rh = Math.round(window.innerHeight * pr)
      this._mainRT.setSize(rw, rh)
      this._roomRT.setSize(rw, rh)
      this._finalRT.setSize(rw, rh)
    })
  }

  get t()           { return this._uTransition.value }
  get mainTexture() { return this._mainRT.texture }
  get finalTarget() { return this._finalRT }

  setSmoke(canvas) {
    this._smokeTex.image       = canvas
    this._smokeTex.needsUpdate = true
  }

  applyDistortion(renderer) {
    renderer.setRenderTarget(null)
    renderer.render(this._postScene, this._compCam)
  }

  // Composite mainScene + roomScene → _finalRT (không ra screen trực tiếp)
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

    this._gl.setRenderTarget(this._finalRT)
    this._gl.render(this._compScene, this._compCam)
  }

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
    this._finalRT.dispose()
    this._mat.dispose()
    this._postMat.dispose()
  }
}
