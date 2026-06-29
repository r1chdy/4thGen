import * as THREE from 'three'

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const THRESH_FRAG = `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float w = smoothstep(uThreshold * 0.5, uThreshold * 1.5, lum);
    gl_FragColor = c * w;
  }
`

const BLUR_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec4 c = vec4(0.0);
    c += texture2D(tDiffuse, vUv - uDir * 4.0) * 0.0162;
    c += texture2D(tDiffuse, vUv - uDir * 3.0) * 0.0540;
    c += texture2D(tDiffuse, vUv - uDir * 2.0) * 0.1216;
    c += texture2D(tDiffuse, vUv - uDir       ) * 0.1946;
    c += texture2D(tDiffuse, vUv              ) * 0.2270;
    c += texture2D(tDiffuse, vUv + uDir       ) * 0.1946;
    c += texture2D(tDiffuse, vUv + uDir * 2.0) * 0.1216;
    c += texture2D(tDiffuse, vUv + uDir * 3.0) * 0.0540;
    c += texture2D(tDiffuse, vUv + uDir * 4.0) * 0.0162;
    gl_FragColor = c;
  }
`

const RAY_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2  uLightPos;
  uniform float uDecay;
  uniform float uDensity;
  uniform float uWeight;
  uniform float uExposure;
  varying vec2 vUv;
  void main() {
    vec2 tc    = vUv;
    vec2 delta = (tc - uLightPos) * (1.0 / 60.0) * uDensity;
    float jitter = fract(sin(dot(vUv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
    tc -= delta * jitter;
    float decay = 1.0;
    vec4  col   = vec4(0.0);
    for (int i = 0; i < 60; i++) {
      tc -= delta;
      col += texture2D(tDiffuse, clamp(tc, 0.0, 1.0)) * decay * uWeight;
      decay *= uDecay;
    }
    gl_FragColor = col * uExposure;
  }
`

const BLEND_FRAG = `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`

function makePassScene(mat) {
  const mesh  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  return scene
}

export class GodRayBloom {
  constructor(renderer, scene, camera) {
    this._gl     = renderer
    this._scene  = scene
    this._camera = camera
    this._fsCam  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const W    = window.innerWidth
    const H    = window.innerHeight
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }

    this._rtScene  = new THREE.WebGLRenderTarget(W,      H,      opts)
    this._rtBright = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)
    this._rtBlurH  = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)
    this._rtBlurV  = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)
    this._rtRay    = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)

    this._threshScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:   { value: this._rtScene.texture },
        uThreshold: { value: 0.20 },
      },
      vertexShader: VERT, fragmentShader: THRESH_FRAG,
      depthTest: false, depthWrite: false,
    }))

    this._blurHDir = new THREE.Vector2(1.5 / (W >> 1), 0)
    this._blurVDir = new THREE.Vector2(0, 1.5 / (H >> 1))

    this._blurHScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this._rtBright.texture },
        uDir:     { value: this._blurHDir },
      },
      vertexShader: VERT, fragmentShader: BLUR_FRAG,
      depthTest: false, depthWrite: false,
    }))

    this._blurVScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this._rtBlurH.texture },
        uDir:     { value: this._blurVDir },
      },
      vertexShader: VERT, fragmentShader: BLUR_FRAG,
      depthTest: false, depthWrite: false,
    }))

    this._rayUniforms = {
      tDiffuse:  { value: this._rtBlurV.texture },
      uLightPos: { value: new THREE.Vector2(0.75, 0.70) },
      uDecay:    { value: 0.94 },
      uDensity:  { value: 0.95 },
      uWeight:   { value: 0.06 },
      uExposure: { value: 0.70 },
    }
    this._rayScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: this._rayUniforms,
      vertexShader: VERT, fragmentShader: RAY_FRAG,
      depthTest: false, depthWrite: false,
    }))

    this._blendScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this._rtRay.texture } },
      vertexShader: VERT, fragmentShader: BLEND_FRAG,
      blending:    THREE.AdditiveBlending,
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
    }))

    window.addEventListener('resize', () => {
      const W = window.innerWidth, H = window.innerHeight
      this._rtScene.setSize(W,      H     )
      this._rtBright.setSize(W >> 1, H >> 1)
      this._rtBlurH.setSize(W >> 1, H >> 1)
      this._rtBlurV.setSize(W >> 1, H >> 1)
      this._rtRay.setSize(W >> 1, H >> 1)
      this._blurHDir.set(1.5 / (W >> 1), 0)
      this._blurVDir.set(0, 1.5 / (H >> 1))
    })
  }

  setLightPos(x, y) { this._rayUniforms.uLightPos.value.set(x, y) }

  render(outputTarget = null) {
    const gl = this._gl

    const prevColor = new THREE.Color()
    const prevAlpha = gl.getClearAlpha()
    gl.getClearColor(prevColor)
    gl.setClearColor(0x000000, 0)

    gl.setRenderTarget(this._rtScene)
    gl.clear(true, false, false)
    gl.render(this._scene, this._camera)

    gl.setRenderTarget(this._rtBright)
    gl.clear(true, false, false)
    gl.render(this._threshScene, this._fsCam)

    gl.setRenderTarget(this._rtBlurH)
    gl.clear(true, false, false)
    gl.render(this._blurHScene, this._fsCam)

    gl.setRenderTarget(this._rtBlurV)
    gl.clear(true, false, false)
    gl.render(this._blurVScene, this._fsCam)

    gl.setRenderTarget(this._rtRay)
    gl.clear(true, false, false)
    gl.render(this._rayScene, this._fsCam)

    gl.setClearColor(prevColor, prevAlpha)
    gl.setRenderTarget(outputTarget)

    gl.clearDepth()
    gl.render(this._scene, this._camera)
    gl.render(this._blendScene, this._fsCam)
  }

  destroy() {
    this._rtScene.dispose()
    this._rtBright.dispose()
    this._rtBlurH.dispose()
    this._rtBlurV.dispose()
    this._rtRay.dispose()
  }
}
