// Con trỏ chuột tuỳ chỉnh — vòng tròn theo chuột, phóng to khi hover vào element
import gsap from 'gsap'

// HTML elements that expand the ring
const INTERACTIVE = 'a, button, .nav-dot, .nav-logo, .mobile-menu__link, [data-cursor]'

export class Cursor {
  constructor() {
    this.dot  = document.querySelector('.cursor-dot')
    this.ring = document.querySelector('.cursor-ring')

    // Raw mouse position (dot follows this directly)
    this.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    // Lerped position (ring lags behind)
    this.lerp = { x: this.pos.x, y: this.pos.y }

    // Hover state — cursor is single source of truth for cursor-hover
    this._hoverHtml = false
    this._hoverCard = false
    this._visible   = false

    this._bindMove()
    this._bindVisibility()
    this._bindClick()
    this._bindHover()

    // Start hidden — show on first mousemove
    document.body.classList.add('cursor-hidden')
  }

  // ── Mouse move ─────────────────────────────────────────────────
  _bindMove() {
    document.addEventListener('mousemove', (e) => {
      this.pos.x = e.clientX
      this.pos.y = e.clientY
      if (!this._visible) {
        // Snap ring to position on first entry (no trail from 0,0)
        this.lerp.x = e.clientX
        this.lerp.y = e.clientY
        this._show()
      }
    })
  }

  // ── Cursor show / hide (window enter/leave) ────────────────────
  _bindVisibility() {
    document.addEventListener('mouseleave', () => this._hide())
    document.addEventListener('mouseenter', () => {
      // Sync lerp to prevent ring jumping from last known position
      this.lerp.x = this.pos.x
      this.lerp.y = this.pos.y
      this._show()
    })
  }

  _show() {
    this._visible = true
    document.body.classList.remove('cursor-hidden')
  }

  _hide() {
    this._visible = false
    document.body.classList.add('cursor-hidden')
  }

  // ── Click animation ────────────────────────────────────────────
  _bindClick() {
    document.addEventListener('mousedown', () => {
      document.body.classList.add('cursor-click')
      // GSAP pulse on the ring
      gsap.to(this.ring, {
        scale: 1.6,
        opacity: 0.5,
        duration: 0.15,
        ease: 'power2.out',
        overwrite: true,
      })
    })

    document.addEventListener('mouseup', () => {
      document.body.classList.remove('cursor-click')
      gsap.to(this.ring, {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: 'elastic.out(1, 0.5)',
        overwrite: true,
      })
    })
  }

  // ── Hover detection ────────────────────────────────────────────
  // Cursor is the single source of truth for body.cursor-hover
  _bindHover() {
    // HTML interactive elements
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(INTERACTIVE)) {
        this._hoverHtml = true
        this._syncHover()
      }
    })
    document.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget?.closest(INTERACTIVE)) {
        this._hoverHtml = false
        this._syncHover()
      }
    })

    // WebGL card hover — via events from ProjectGrid
    window.addEventListener('cardHover', () => { this._hoverCard = true;  this._syncHover() })
    window.addEventListener('cardLeave', () => { this._hoverCard = false; this._syncHover() })
  }

  _syncHover() {
    document.body.classList.toggle('cursor-hover', this._hoverCard || this._hoverHtml)
  }

  // ── RAF update — called every frame ───────────────────────────
  update() {
    if (!this._visible) return

    // Dot: near-instant follow (LERP 1.0 = snaps to raw position)
    const DOT_LERP  = 1.0
    // Ring: lags behind for the trailing effect
    const RING_LERP = 0.10

    this.lerp.x += (this.pos.x - this.lerp.x) * RING_LERP
    this.lerp.y += (this.pos.y - this.lerp.y) * RING_LERP

    if (this.dot) {
      this.dot.style.left = this.pos.x + 'px'
      this.dot.style.top  = this.pos.y + 'px'
    }
    if (this.ring) {
      this.ring.style.left = this.lerp.x + 'px'
      this.ring.style.top  = this.lerp.y + 'px'
    }
  }
}
