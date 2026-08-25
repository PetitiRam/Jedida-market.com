import { useEffect } from 'react';

// Makes every horizontally-scrollable rail on the platform auto-advance on
// its own, instead of relying purely on the user to swipe/drag. Mounted
// once near the app root (see App.jsx, next to PetitiStyleInjector) so it
// applies platform-wide without every page/component needing its own timer.
//
// Deliberately generic: it targets the existing rail *classes* rather than
// specific pages, so any new section built with the established rail
// pattern gets this for free. On breakpoints where a rail renders as a
// non-scrolling grid (e.g. desktop product/shop grids), scrollWidth equals
// clientWidth and each tick is a harmless no-op.
//
// Rails are grouped with their own pace: ad/promo strips carry marketing
// copy people need a beat to read, so they move slower than plain card
// rails. Adjust GROUPS below to add a section or retune speed — nothing
// else in the app needs to change.
const GROUPS = [
  {
    // Ad / promo strips — slower, more reading time.
    selector: '.jd-promo-row, .jd-bottom-banners, .deal-strip',
    stepIntervalMs: 5000,
  },
  {
    // Product & shop card rails.
    selector: [
      '.product-grid-v2.is-rail',
      '.shop-grid-v2.is-rail',
      '.jd-flash-row',
      '.trending-row',
      '.related-products-row',
    ].join(', '),
    stepIntervalMs: 3200,
  },
  {
    // Lighter browse rails (category tiles etc.) — quick, icon-sized steps.
    selector: '.category-scroll',
    stepIntervalMs: 3800,
  },
];

const RESUME_DELAY_MS = 4500; // after touch/drag/keyboard interaction
const HOVER_RESUME_DELAY_MS = 1200; // after the mouse simply leaves (desktop)
const RESCAN_DEBOUNCE_MS = 400;
const EDGE_EPSILON = 3;

function stepFor(el) {
  const first = el.firstElementChild;
  if (first) {
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
    const w = first.getBoundingClientRect().width;
    if (w > 0) return w + gap;
  }
  return el.clientWidth * 0.85;
}

function attach(el, stepIntervalMs, trackedNodes) {
  if (el.dataset.jdAutoScroll) return;
  el.dataset.jdAutoScroll = '1';

  let paused = false;
  let visible = false;
  let resumeTimer = null;
  let tickTimer = null;

  const pauseFor = (delayMs) => {
    paused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { paused = false; }, delayMs);
  };
  const pause = () => pauseFor(RESUME_DELAY_MS);

  const tick = () => {
    if (paused || !visible) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= EDGE_EPSILON) return; // not actually scrollable at this breakpoint
    const next = el.scrollLeft + stepFor(el);
    if (next >= max - EDGE_EPSILON) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      el.scrollTo({ left: next, behavior: 'smooth' });
    }
  };

  // Any sign of the user taking manual control pauses autoplay for a while
  // rather than fighting them mid-swipe/mid-read.
  ['pointerdown', 'touchstart', 'wheel'].forEach((evt) => {
    el.addEventListener(evt, pause, { passive: true });
  });
  el.addEventListener('focusin', pause);

  // Desktop: pause the instant the cursor is over the rail (mouse users
  // don't "let go" the way touch users do), resume shortly after it leaves.
  el.addEventListener('mouseenter', () => {
    paused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
  });
  el.addEventListener('mouseleave', () => pauseFor(HOVER_RESUME_DELAY_MS));

  const io = new IntersectionObserver(
    ([entry]) => { visible = entry.isIntersecting; },
    { threshold: 0.15 },
  );
  io.observe(el);

  tickTimer = setInterval(tick, stepIntervalMs);

  el._jdAutoScrollCleanup = () => {
    clearInterval(tickTimer);
    if (resumeTimer) clearTimeout(resumeTimer);
    io.disconnect();
  };

  trackedNodes.add(el);
}

export default function AutoScrollRails() {
  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    const trackedNodes = new Set();

    const scan = () => {
      GROUPS.forEach(({ selector, stepIntervalMs }) => {
        document.querySelectorAll(selector).forEach((el) => attach(el, stepIntervalMs, trackedNodes));
      });
    };

    scan();

    // SPA route changes / async data renders new rails after this effect's
    // first pass — rescan (debounced) whenever the DOM changes.
    let debounceTimer = null;
    const mo = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scan, RESCAN_DEBOUNCE_MS);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      trackedNodes.forEach((el) => el._jdAutoScrollCleanup?.());
    };
  }, []);

  return null;
}
