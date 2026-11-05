import { useEffect, useRef } from 'react'

// Hur långt innehållet som mest följer fingret förbi början eller slutet, i pixlar.
const MAX_PULL = 48
// Hur långt man drar innan rörelsen planar ut. Större tal ger ett tyngre motstånd.
const PULL_DISTANCE = 140
// Studsen när en svepning rullar hela vägen fram till kanten, utan att fingret är kvar.
const MAX_KICK = 26
const KICK_PER_SPEED = 12
const MIN_KICK_SPEED = 0.4
const KICK_MS = 420
const RETURN_MS = 320
const RETURN_EASING = 'cubic-bezier(0.2, 0.8, 0.3, 1)'
// Hur länge efter att fingret släppt en svepning fortfarande kan räknas som samma svepning.
const MOMENTUM_MS = 1500

function canScroll(element) {
  return element.scrollHeight > element.clientHeight + 1
}

function shifted(px) {
  return `translate3d(0, ${px}px, 0)`
}

// Närmaste ruta inuti sidan som kan scrolla själv, till exempel en chatt eller ett textfält.
function innerScroller(target, page) {
  for (let element = target; element && element !== page; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element)
    if ((overflowY === 'auto' || overflowY === 'scroll') && canScroll(element)) return element
  }
  return null
}

// En liten studs när en sida i ett block når sin början eller sitt slut på en pekskärm. Webbläsarens egen
// studs går inte att göra mindre, så den är avstängd (overscroll-behavior i map.css) och den här ersätter den.
// Sidor som inte går att scrolla står stilla, och en ruta som scrollar själv får göra klart sitt först.
// Innehållet flyttas direkt med transform och högst en gång per bildruta, och återgången körs som en animation
// i webbläsaren, så att studsen inte behöver räkna om stilarna för allt i sidan.
function usePadBounce() {
  const pageRef = useRef(null)

  useEffect(() => {
    const page = pageRef.current
    if (!page) return undefined
    if (!window.matchMedia('(pointer: coarse)').matches) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let touch = null
    let animations = []
    let frame = null
    let offset = 0
    let momentumUntil = 0
    let lastTop = page.scrollTop
    let lastTime = 0
    let speed = 0

    function stopAnimations() {
      animations.forEach((animation) => animation.cancel())
      animations = []
    }

    function place() {
      frame = null
      const transform = shifted(offset)
      for (const part of page.children) part.style.transform = transform
    }

    function setOffset(px) {
      offset = px
      if (frame === null) frame = requestAnimationFrame(place)
    }

    function clearOffset() {
      cancelAnimationFrame(frame)
      frame = null
      offset = 0
      for (const part of page.children) part.style.transform = ''
    }

    function play(keyframes, options) {
      stopAnimations()
      page.classList.add('is-bouncing')
      animations = [...page.children].map((part) => part.animate(keyframes, options))
      const current = animations
      Promise.all(current.map((animation) => animation.finished))
        .then(() => {
          if (animations === current) {
            animations = []
            page.classList.remove('is-bouncing')
          }
        })
        .catch(() => {})
    }

    function release() {
      const from = offset
      clearOffset()
      play([{ transform: shifted(from) }, { transform: shifted(0) }], { duration: RETURN_MS, easing: RETURN_EASING })
    }

    function kick(direction, currentSpeed) {
      const size = direction * Math.min(MAX_KICK, Math.abs(currentSpeed) * KICK_PER_SPEED)
      play(
        [
          { transform: shifted(0), easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
          { transform: shifted(size), offset: 0.3, easing: RETURN_EASING },
          { transform: shifted(0) },
        ],
        { duration: KICK_MS },
      )
    }

    function onTouchStart(event) {
      momentumUntil = 0
      speed = 0
      if (event.touches.length !== 1 || !canScroll(page) || event.target.closest('dialog')) {
        touch = null
        return
      }
      const { clientX, clientY } = event.touches[0]
      touch = { startX: clientX, startY: clientY, anchorY: null, axis: null, scroller: innerScroller(event.target, page) }
    }

    function onTouchMove(event) {
      if (!touch || event.touches.length !== 1) return
      const { clientX, clientY } = event.touches[0]
      if (!touch.axis) {
        const dx = Math.abs(clientX - touch.startX)
        const dy = Math.abs(clientY - touch.startY)
        if (dx < 6 && dy < 6) return
        touch.axis = dy >= dx ? 'y' : 'x'
      }
      if (touch.axis !== 'y') return

      const down = clientY > (touch.lastY ?? touch.startY)
      touch.lastY = clientY

      if (touch.anchorY === null) {
        const max = page.scrollHeight - page.clientHeight
        const atTop = page.scrollTop <= 0
        const atBottom = page.scrollTop >= max - 1
        const { scroller } = touch
        const innerBusy =
          scroller &&
          (down ? scroller.scrollTop > 0 : scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 1)
        // Börja studsa först när fingret drar vidare från kanten.
        if (innerBusy || !((down && atTop) || (!down && atBottom))) return
        touch.anchorY = clientY
        touch.top = atTop && down
        stopAnimations()
        page.classList.add('is-bouncing')
      }

      const pulled = clientY - touch.anchorY
      if (pulled === 0) return
      if (touch.top ? pulled < 0 : pulled > 0) {
        // Fingret är på väg tillbaka förbi där studsen började: sidan scrollar som vanligt igen.
        touch.anchorY = null
        release()
        return
      }
      setOffset(Math.sign(pulled) * MAX_PULL * (1 - Math.exp(-Math.abs(pulled) / PULL_DISTANCE)))
    }

    function onTouchEnd(event) {
      if (event.touches.length > 0) return
      if (touch?.anchorY != null) release()
      else if (touch?.axis === 'y') momentumUntil = performance.now() + MOMENTUM_MS
      touch = null
    }

    function onScroll() {
      const now = performance.now()
      const top = page.scrollTop
      const moved = top - lastTop
      const elapsed = now - lastTime
      lastTop = top
      lastTime = now
      if (now > momentumUntil) return
      const max = page.scrollHeight - page.clientHeight
      const reachedEnd = (moved < 0 && top <= 0) || (moved > 0 && top >= max - 1)
      if (reachedEnd && Math.abs(speed) >= MIN_KICK_SPEED) {
        momentumUntil = 0
        kick(moved < 0 ? 1 : -1, speed)
      }
      if (elapsed > 0 && elapsed < 100) speed = moved / elapsed
    }

    page.addEventListener('touchstart', onTouchStart, { passive: true })
    page.addEventListener('touchmove', onTouchMove, { passive: true })
    page.addEventListener('touchend', onTouchEnd, { passive: true })
    page.addEventListener('touchcancel', onTouchEnd, { passive: true })
    page.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      stopAnimations()
      cancelAnimationFrame(frame)
      page.removeEventListener('touchstart', onTouchStart)
      page.removeEventListener('touchmove', onTouchMove)
      page.removeEventListener('touchend', onTouchEnd)
      page.removeEventListener('touchcancel', onTouchEnd)
      page.removeEventListener('scroll', onScroll)
    }
  }, [])

  return pageRef
}

export default usePadBounce
