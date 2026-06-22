import {
  baseVertexShader,
  clearShader,
  splatShader,
  advectionShader,
  divergenceShader,
  curlShader,
  vorticityShader,
  pressureShader,
  gradientSubtractShader,
  displayShader,
} from './Shaders.js'

const SIM_RESOLUTION       = 128
const DYE_RESOLUTION       = 1440
const DENSITY_DISSIPATION  = 3.5
const VELOCITY_DISSIPATION = 2
const CURL                 = 10
const PRESSURE             = 0.1
const PRESSURE_ITERATIONS  = 20

export const SPLAT_RADIUS = 0.5
export const SPLAT_FORCE  = 6000

export class FluidSimulation {
  constructor (canvas) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL2 not supported')
    this.gl = gl

    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    this._initFormats()
    this._initQuad()
    this._initPrograms()
    this._initFBOs()

    gl.clearColor(0, 0, 0, 0)
  }

  _initFormats () {
    const gl = this.gl
    const hf = gl.HALF_FLOAT
    const ok = this._testFBO(gl.R16F, gl.RED, hf)
    if (ok) {
      this._velFmt = { i: gl.RG16F,   f: gl.RG,   t: hf,               filter: gl.LINEAR  }
      this._dyeFmt = { i: gl.RGBA16F, f: gl.RGBA,  t: hf,               filter: gl.LINEAR  }
      this._scrFmt = { i: gl.R16F,    f: gl.RED,   t: hf,               filter: gl.NEAREST }
    } else {
      this._velFmt = { i: gl.RGBA8,   f: gl.RGBA,  t: gl.UNSIGNED_BYTE, filter: gl.LINEAR  }
      this._dyeFmt = { i: gl.RGBA8,   f: gl.RGBA,  t: gl.UNSIGNED_BYTE, filter: gl.LINEAR  }
      this._scrFmt = { i: gl.RGBA8,   f: gl.RGBA,  t: gl.UNSIGNED_BYTE, filter: gl.NEAREST }
    }
  }

  _testFBO (internalFormat, format, type) {
    const gl  = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteTexture(tex)
    gl.deleteFramebuffer(fbo)
    return ok
  }

  _initQuad () {
    const gl   = this.gl
    const vbo  = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW)
    const ibo  = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW)
    this._vao = gl.createVertexArray()
    gl.bindVertexArray(this._vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bindVertexArray(null)
  }

  _compile (type, src) {
    const gl = this.gl
    const s  = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s))
    return s
  }

  _link (fsSrc) {
    const gl   = this.gl
    const vert = this._compile(gl.VERTEX_SHADER,   baseVertexShader)
    const frag = this._compile(gl.FRAGMENT_SHADER, fsSrc)
    const prog = gl.createProgram()
    gl.attachShader(prog, vert)
    gl.attachShader(prog, frag)
    gl.bindAttribLocation(prog, 0, 'aPosition')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error(gl.getProgramInfoLog(prog))
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    return prog
  }

  _initPrograms () {
    this._prog = {
      clear:            this._link(clearShader),
      splat:            this._link(splatShader),
      advection:        this._link(advectionShader),
      divergence:       this._link(divergenceShader),
      curl:             this._link(curlShader),
      vorticity:        this._link(vorticityShader),
      pressure:         this._link(pressureShader),
      gradientSubtract: this._link(gradientSubtractShader),
      display:          this._link(displayShader),
    }
  }

  _makeFBO (w, h, { i, f, t, filter }) {
    const gl  = this.gl
    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, i, w, h, 0, f, t, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return {
      texture: tex, fbo, width: w, height: h,
      texelSizeX: 1/w, texelSizeY: 1/h,
      attach: (unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        return unit
      },
    }
  }

  _makeDoubleFBO (w, h, fmt) {
    let a = this._makeFBO(w, h, fmt)
    let b = this._makeFBO(w, h, fmt)
    return {
      width: w, height: h,
      texelSizeX: a.texelSizeX, texelSizeY: a.texelSizeY,
      get read  () { return a },
      get write () { return b },
      swap ()     { [a, b] = [b, a] },
    }
  }

  _initFBOs () {
    const s = SIM_RESOLUTION
    const d = DYE_RESOLUTION
    this._velocity   = this._makeDoubleFBO(s, s, this._velFmt)
    this._dye        = this._makeDoubleFBO(d, d, this._dyeFmt)
    this._divergence = this._makeFBO(s, s, this._scrFmt)
    this._curl       = this._makeFBO(s, s, this._scrFmt)
    this._pressure   = this._makeDoubleFBO(s, s, this._scrFmt)
  }

  _blit (target) {
    const gl = this.gl
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    } else {
      gl.viewport(0, 0, target.width, target.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    }
    gl.bindVertexArray(this._vao)
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    gl.bindVertexArray(null)
  }

  _u1i (p, n, v) { this.gl.uniform1i(this.gl.getUniformLocation(p, n), v) }
  _u1f (p, n, v) { this.gl.uniform1f(this.gl.getUniformLocation(p, n), v) }
  _u2f (p, n, x, y) { this.gl.uniform2f(this.gl.getUniformLocation(p, n), x, y) }
  _u3f (p, n, x, y, z) { this.gl.uniform3f(this.gl.getUniformLocation(p, n), x, y, z) }

  splat (x, y, dx, dy, r, g, b) {
    const gl     = this.gl
    const aspect = gl.canvas.width / gl.canvas.height
    const radius = _correctRadius(SPLAT_RADIUS / 100, aspect)

    gl.useProgram(this._prog.splat)
    this._u2f(this._prog.splat, 'texelSize', this._velocity.texelSizeX, this._velocity.texelSizeY)
    this._u1i(this._prog.splat, 'uTarget', this._velocity.read.attach(0))
    this._u1f(this._prog.splat, 'aspectRatio', aspect)
    this._u2f(this._prog.splat, 'point', x, y)
    this._u3f(this._prog.splat, 'color', dx, dy, 0)
    this._u1f(this._prog.splat, 'radius', radius)
    this._u1i(this._prog.splat, 'uMode', 0)
    this._blit(this._velocity.write)
    this._velocity.swap()

    this._u1i(this._prog.splat, 'uTarget', this._dye.read.attach(0))
    this._u2f(this._prog.splat, 'texelSize', this._dye.texelSizeX, this._dye.texelSizeY)
    this._u3f(this._prog.splat, 'color', r, g, b)
    this._u1f(this._prog.splat, 'radius', radius)
    this._u1i(this._prog.splat, 'uMode', 1)
    this._blit(this._dye.write)
    this._dye.swap()
  }

  step (dt) {
    const gl   = this.gl
    const prog = this._prog
    const vel  = this._velocity

    const dyeDecay = 1.0 / (1.0 + DENSITY_DISSIPATION  * dt)
    const velDecay = 1.0 / (1.0 + VELOCITY_DISSIPATION * dt)

    gl.disable(gl.BLEND)

    gl.useProgram(prog.curl)
    this._u2f(prog.curl, 'texelSize', vel.texelSizeX, vel.texelSizeY)
    this._u1i(prog.curl, 'uVelocity', vel.read.attach(0))
    this._blit(this._curl)

    gl.useProgram(prog.vorticity)
    this._u2f(prog.vorticity, 'texelSize', vel.texelSizeX, vel.texelSizeY)
    this._u1i(prog.vorticity, 'uVelocity', vel.read.attach(0))
    this._u1i(prog.vorticity, 'uCurl',     this._curl.attach(1))
    this._u1f(prog.vorticity, 'curl',      CURL)
    this._u1f(prog.vorticity, 'dt',        dt)
    this._blit(vel.write)
    vel.swap()

    gl.useProgram(prog.divergence)
    this._u2f(prog.divergence, 'texelSize', vel.texelSizeX, vel.texelSizeY)
    this._u1i(prog.divergence, 'uVelocity', vel.read.attach(0))
    this._blit(this._divergence)

    gl.useProgram(prog.clear)
    this._u2f(prog.clear, 'texelSize', this._pressure.texelSizeX, this._pressure.texelSizeY)
    this._u1i(prog.clear, 'uTexture', this._pressure.read.attach(0))
    this._u1f(prog.clear, 'value', PRESSURE)
    this._blit(this._pressure.write)
    this._pressure.swap()

    gl.useProgram(prog.pressure)
    this._u2f(prog.pressure, 'texelSize', this._pressure.texelSizeX, this._pressure.texelSizeY)
    this._u1i(prog.pressure, 'uDivergence', this._divergence.attach(0))
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      this._u1i(prog.pressure, 'uPressure', this._pressure.read.attach(1))
      this._blit(this._pressure.write)
      this._pressure.swap()
    }

    gl.useProgram(prog.gradientSubtract)
    this._u2f(prog.gradientSubtract, 'texelSize', vel.texelSizeX, vel.texelSizeY)
    this._u1i(prog.gradientSubtract, 'uPressure', this._pressure.read.attach(0))
    this._u1i(prog.gradientSubtract, 'uVelocity', vel.read.attach(1))
    this._blit(vel.write)
    vel.swap()

    gl.useProgram(prog.advection)
    this._u2f(prog.advection, 'texelSize',    vel.texelSizeX, vel.texelSizeY)
    this._u2f(prog.advection, 'dyeTexelSize', vel.texelSizeX, vel.texelSizeY)
    this._u1i(prog.advection, 'uVelocity', vel.read.attach(0))
    this._u1i(prog.advection, 'uSource',   vel.read.attach(0))
    this._u1f(prog.advection, 'dt',          dt)
    this._u1f(prog.advection, 'dissipation', velDecay)
    this._blit(vel.write)
    vel.swap()

    const dye = this._dye
    this._u2f(prog.advection, 'texelSize',    vel.texelSizeX, vel.texelSizeY)
    this._u2f(prog.advection, 'dyeTexelSize', dye.texelSizeX, dye.texelSizeY)
    this._u1i(prog.advection, 'uVelocity', vel.read.attach(0))
    this._u1i(prog.advection, 'uSource',   dye.read.attach(1))
    this._u1f(prog.advection, 'dt',          dt)
    this._u1f(prog.advection, 'dissipation', dyeDecay)
    this._blit(dye.write)
    dye.swap()
  }

  render () {
    const gl = this.gl
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this._prog.display)
    this._u1i(this._prog.display, 'uTexture', this._dye.read.attach(0))
    this._u2f(this._prog.display, 'texelSize', 1.0 / gl.drawingBufferWidth, 1.0 / gl.drawingBufferHeight)
    this._blit(null)
  }
}

function _correctRadius (radius, aspect) {
  if (aspect > 1) radius *= aspect
  return radius
}
