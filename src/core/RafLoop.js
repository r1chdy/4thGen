export class RafLoop {
  constructor() {
    this.callbacks = new Set()
    this.isRunning = false
    this.clock = { last: 0, delta: 0, elapsed: 0 }
    this._tick = this._tick.bind(this)
  }

  add(fn) { this.callbacks.add(fn) }
  remove(fn) { this.callbacks.delete(fn) }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    requestAnimationFrame(this._tick)
  }

  stop() { this.isRunning = false }

  _tick(timestamp) {
    if (!this.isRunning) return
    const delta = Math.min((timestamp - this.clock.last) / 1000, 0.05)
    this.clock.delta = delta
    this.clock.elapsed += delta
    this.clock.last = timestamp

    for (const fn of this.callbacks) {
      fn({ delta, elapsed: this.clock.elapsed })
    }

    requestAnimationFrame(this._tick)
  }
}
