import * as THREE from 'three'

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

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
  varying vec2 vUv;
  uniform sampler2D tGalaxy;
  uniform vec2      uLightPos;
  uniform float     uCamY;
  uniform float     uVertScale;
  uniform float     uStrength;

  void main() {
    float worldY  = uCamY + (vUv.y - 0.5) * uVertScale;
    float tiltedY = worldY + (vUv.x - 0.5) * 1.5;
    if (tiltedY < 0.0) discard;

    const int   SAMPLES = 60;
    const float DECAY   = 0.96;
    const float DENSITY = 0.92;
    const float WEIGHT  = 0.04;

    vec2  tc     = vUv;
    vec2  delta  = (tc - uLightPos) * (1.0 / float(SAMPLES)) * DENSITY;
    float jitter = fract(sin(dot(vUv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
    tc -= delta * jitter;
    float decay = 1.0;
    vec4  col   = vec4(0.0);

    for (int i = 0; i < SAMPLES; i++) {
      tc  -= delta;
      col += texture2D(tGalaxy, clamp(tc, 0.001, 0.999)) * decay * WEIGHT;
      decay *= DECAY;
    }

    gl_FragColor = col * uStrength;
  }
`

function makePassScene(mat) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  return scene
}

export class GalaxyGodRay {
  constructor(renderer) {
    this._gl  = renderer

    const W = window.innerWidth
    const H = window.innerHeight
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
    this._rtGalaxy = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)
    this._rtBlurH  = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)
    this._rtBlurV  = new THREE.WebGLRenderTarget(W >> 1, H >> 1, opts)

    this._blurHDir = new THREE.Vector2(1.5 / (W >> 1), 0)
    this._blurVDir = new THREE.Vector2(0, 1.5 / (H >> 1))

    this._blurHScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this._rtGalaxy.texture }, uDir: { value: this._blurHDir } },
      vertexShader: VERT, fragmentShader: BLUR_FRAG,
      depthTest: false, depthWrite: false,
    }))

    this._blurVScene = makePassScene(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this._rtBlurH.texture }, uDir: { value: this._blurVDir } },
      vertexShader: VERT, fragmentShader: BLUR_FRAG,
      depthTest: false, depthWrite: false,
    }))

    this._uLightPos = new THREE.Vector2(0.5, 0.5)
    this._rayMat = new THREE.ShaderMaterial({
      uniforms: {
        tGalaxy:    { value: this._rtBlurV.texture },
        uLightPos:  { value: this._uLightPos },
        uCamY:      { value: 0 },
        uVertScale: { value: 7 },
        uStrength:  { value: 1.8 },
      },
      vertexShader:   VERT,
      fragmentShader: RAY_FRAG,
      blending:    THREE.AdditiveBlending,
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
    })

    this._rayScene = makePassScene(this._rayMat)
    this._fsCam    = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    window.addEventListener('resize', () => {
      const W = window.innerWidth, H = window.innerHeight
      this._rtGalaxy.setSize(W >> 1, H >> 1)
      this._rtBlurH.setSize(W >> 1, H >> 1)
      this._rtBlurV.setSize(W >> 1, H >> 1)
      this._blurHDir.set(1.5 / (W >> 1), 0)
      this._blurVDir.set(0, 1.5 / (H >> 1))
    })
  }

  render(galaxyScene, camera, centerWorld, camY, vertScale, strength = 1.8, outputTarget = null) {
    const v = centerWorld.clone().project(camera)
    this._uLightPos.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5)
    this._rayMat.uniforms.uCamY.value      = camY
    this._rayMat.uniforms.uVertScale.value = vertScale
    this._rayMat.uniforms.uStrength.value  = strength

    const gl   = this._gl
    const prev = gl.autoClear
    gl.autoClear = true
    gl.setRenderTarget(this._rtGalaxy)
    gl.render(galaxyScene, camera)
    gl.autoClear = false

    gl.setRenderTarget(this._rtBlurH)
    gl.clear(true, false, false)
    gl.render(this._blurHScene, this._fsCam)

    gl.setRenderTarget(this._rtBlurV)
    gl.clear(true, false, false)
    gl.render(this._blurVScene, this._fsCam)

    gl.setRenderTarget(outputTarget)
    gl.render(this._rayScene, this._fsCam)
    gl.autoClear = prev
  }

  destroy() {
    this._rtGalaxy.dispose()
    this._rtBlurH.dispose()
    this._rtBlurV.dispose()
    this._rayMat.dispose()
  }
}
