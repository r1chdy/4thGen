// Hiệu ứng chuyển cảnh toàn màn hình — fullscreen quad shader, ripple từ vị trí click
import * as THREE from 'three'
import gsap from 'gsap'

// ── Shaders ──────────────────────────────────────────────────────────

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Clip-space fullscreen quad — bypasses projection matrix
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uProgress;
  uniform vec2  uOrigin;

  void main() {
    vec3 col = texture2D(uTexture, vUv).rgb;

    float dist = length(vUv - uOrigin);

    // Radial circle: expands from origin covering screen, then contracts revealing new scene
    // threshold peaks at progress=0.65 (screen fully dark), covers max screen corner ~0.85
    float fadeOut = (uProgress / 0.65) * 0.85;
    float fadeIn  = (1.0 - (uProgress - 0.65) / 0.35) * 0.85;
    float threshold = uProgress < 0.65 ? fadeOut : fadeIn;
    threshold = clamp(threshold, 0.0, 0.85);

    // Smooth dark circle edge
    float dark = 1.0 - smoothstep(threshold - 0.05, threshold + 0.05, dist);
    col *= (1.0 - dark);

    gl_FragColor = vec4(col, 1.0);
  }
`

// ── Transition ────────────────────────────────────────────────────────

export class Transition {
  constructor(rendererInstance) {
    this._gl = rendererInstance   // THREE.WebGLRenderer (from Renderer.js)
    this.isPlaying = false
    this._midFired  = false

    // Render target — scene snaps here each transition frame
    const pr = Math.min(window.devicePixelRatio, 2)
    this._target = new THREE.WebGLRenderTarget(
      Math.round(window.innerWidth  * pr),
      Math.round(window.innerHeight * pr),
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    )

    // Orthographic scene: fullscreen quad stays exactly 1:1 with viewport
    this._tScene  = new THREE.Scene()
    this._tCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this._mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture:  { value: this._target.texture },
        uProgress: { value: 0 },
        uOrigin:   { value: new THREE.Vector2(0.5, 0.5) },
      },
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat)
    mesh.frustumCulled = false
    this._tScene.add(mesh)

    window.addEventListener('resize', () => {
      const pr = Math.min(window.devicePixelRatio, 2)
      this._target.setSize(
        Math.round(window.innerWidth  * pr),
        Math.round(window.innerHeight * pr)
      )
    })
  }

  // ── Call from RAF instead of renderer.render() during transition ──
  renderFrame(mainScene, mainCamera) {
    // 1. Render scene → texture
    this._gl.setRenderTarget(this._target)
    this._gl.render(mainScene, mainCamera)

    // 2. Render transition quad → screen
    this._gl.setRenderTarget(null)
    this._gl.render(this._tScene, this._tCamera)
  }

  // ── Trigger ───────────────────────────────────────────────────────
  // origin: { x, y } in screen UV (0-1, Y flipped so WebGL bottom = 0)
  // onMidpoint: fires at ~55% progress — navigate / change scene here
  trigger(origin, onMidpoint, duration = 1.4) {
    if (this.isPlaying) return
    this.isPlaying = true
    this._midFired = false

    this._mat.uniforms.uOrigin.value.set(
      origin?.x ?? 0.5,
      1.0 - (origin?.y ?? 0.5)  // flip Y: screen top → UV bottom
    )

    gsap.to(this._mat.uniforms.uProgress, {
      value: 1,
      duration,
      ease: 'power1.inOut',
      onUpdate: () => {
        const p = this._mat.uniforms.uProgress.value
        if (p >= 0.65 && !this._midFired) {
          this._midFired = true
          onMidpoint?.()
        }
      },
      onComplete: () => {
        // Reset progress — alpha shader will return to 0 naturally
        this._mat.uniforms.uProgress.value = 0
        this.isPlaying = false
      },
    })
  }

  destroy() {
    this._target.dispose()
    this._mat.dispose()
  }
}
