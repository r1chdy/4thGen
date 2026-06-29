import { FluidSimulation, SPLAT_FORCE } from './FluidSimulation.js'

const RED = { r: 0.6, g: 0.145, b: 0.145 }

export class SmokeCursor {
  constructor () {
    this._canvas = this._createCanvas()
    this._sim    = new FluidSimulation(this._canvas)

    this._pointer = {
      texcoordX: 0, texcoordY: 0,
      prevTexcoordX: 0, prevTexcoordY: 0,
      deltaX: 0, deltaY: 0,
      moved: false,
      color: RED,
    }

    this._lastT = performance.now()

    this._resize()
    this._bindEvents()
    this._loop()
  }

  get canvas () { return this._canvas }

  _createCanvas () {
    const c = document.createElement('canvas')
    Object.assign(c.style, {
      position:      'fixed',
      inset:         '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '5',
      opacity:       '0',
    })
    document.body.appendChild(c)
    return c
  }

  _resize () {
    const dpr = Math.min(window.devicePixelRatio, 2)
    this._canvas.width  = Math.round(window.innerWidth  * dpr)
    this._canvas.height = Math.round(window.innerHeight * dpr)
  }

  _bindEvents () {
    const c = this._canvas

    window.addEventListener('mousemove', e => {
      const rect = c.getBoundingClientRect()
      const dpr  = window.devicePixelRatio || 1
      this._updateMove((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr)
    })

    window.addEventListener('touchmove', e => {
      const rect  = c.getBoundingClientRect()
      const dpr   = window.devicePixelRatio || 1
      const touch = e.targetTouches[0]
      this._updateMove((touch.clientX - rect.left) * dpr, (touch.clientY - rect.top) * dpr)
    }, { passive: true })

    window.addEventListener('resize', () => this._resize())
  }

  _updateMove (posX, posY) {
    const c = this._canvas
    const p = this._pointer
    p.prevTexcoordX = p.texcoordX
    p.prevTexcoordY = p.texcoordY
    p.texcoordX = posX / c.width
    p.texcoordY = 1.0 - posY / c.height
    const aspect = c.width / c.height
    let dx = p.texcoordX - p.prevTexcoordX
    let dy = p.texcoordY - p.prevTexcoordY
    if (aspect < 1) dx *= aspect
    if (aspect > 1) dy /= aspect
    p.deltaX = dx
    p.deltaY = dy
    p.moved  = Math.abs(dx) > 0 || Math.abs(dy) > 0
  }

  _loop () {
    const now = performance.now()
    const dt  = Math.min((now - this._lastT) / 1000, 0.016667)
    this._lastT = now

    const p = this._pointer
    if (p.moved) {
      p.moved = false
      this._sim.splat(
        p.texcoordX, p.texcoordY,
        p.deltaX * SPLAT_FORCE, -p.deltaY * SPLAT_FORCE,
        RED.r, RED.g, RED.b,
      )
    }

    const gl = this._sim.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this._sim.step(dt)
    this._sim.render()

    requestAnimationFrame(() => this._loop())
  }
}
