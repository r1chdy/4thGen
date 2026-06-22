// Thanh điều hướng (navigation bar) — logo, các link menu, và animation hiện/ẩn khi scroll
import gsap from 'gsap'

export class Nav {
  constructor() {
    this.hamburger   = document.getElementById('navHamburger')
    this.mobileMenu  = document.getElementById('mobile-menu')
    this.navLinks    = document.querySelectorAll('.nav-links a')
    this.mobileLinks = document.querySelectorAll('.mobile-menu__link')
    this.navDots     = document.querySelectorAll('.nav-dot')
    this.isOpen      = false

    this._bindHamburger()
    this._bindNavLinks()
    this._bindNavDots()
    this._bindKeyboard()
  }

  // ── Mobile hamburger ───────────────────────────────────────────
  _bindHamburger() {
    this.hamburger?.addEventListener('click', () => {
      this.isOpen ? this.closeMenu() : this.openMenu()
    })
  }

  openMenu() {
    this.isOpen = true
    this.hamburger?.classList.add('open')
    this.hamburger?.setAttribute('aria-expanded', 'true')
    this.mobileMenu?.classList.add('open')
    this.mobileMenu?.setAttribute('aria-hidden', 'false')

    // Animate overlay in via clip-path
    gsap.to(this.mobileMenu, {
      clipPath: 'inset(0 0 0% 0)',
      duration: 0.65,
      ease: 'power3.inOut',
    })

    // Links slide up staggered
    gsap.to('.mobile-menu__link', {
      opacity: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.08,
      delay: 0.3,
      ease: 'power3.out',
    })
  }

  closeMenu() {
    this.isOpen = false
    this.hamburger?.classList.remove('open')
    this.hamburger?.setAttribute('aria-expanded', 'false')

    // Links fade out quickly
    gsap.to('.mobile-menu__link', {
      opacity: 0,
      y: 20,
      duration: 0.25,
      stagger: 0.03,
      ease: 'power2.in',
    })

    // Overlay wipes back up
    gsap.to(this.mobileMenu, {
      clipPath: 'inset(0 0 100% 0)',
      duration: 0.5,
      delay: 0.1,
      ease: 'power3.inOut',
      onComplete: () => {
        this.mobileMenu?.classList.remove('open')
        this.mobileMenu?.setAttribute('aria-hidden', 'true')
      },
    })
  }

  // ── Nav links (desktop + mobile) ───────────────────────────────
  _bindNavLinks() {
    const allLinks = [
      ...this.navLinks,
      ...this.mobileLinks,
    ]

    allLinks.forEach(link => {
      link.addEventListener('click', () => {
        const section = link.dataset.section
        window.dispatchEvent(new CustomEvent('navTo', { detail: section }))

        // Active state on desktop links
        this.navLinks.forEach(l => l.classList.remove('active'))
        const match = [...this.navLinks].find(l => l.dataset.section === section)
        if (match) match.classList.add('active')

        // Close mobile menu if open
        if (this.isOpen) {
          setTimeout(() => this.closeMenu(), 150)
        }
      })
    })
  }

  // ── Nav dots ───────────────────────────────────────────────────
  _bindNavDots() {
    this.navDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = +dot.dataset.index
        window.dispatchEvent(new CustomEvent('dotClick', { detail: idx }))
        this.setActiveDot(idx)
      })
    })
  }

  setActiveDot(idx) {
    this.navDots.forEach((d, i) => d.classList.toggle('active', i === idx))
  }

  // ── Keyboard ───────────────────────────────────────────────────
  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.closeMenu()
    })
  }
}
