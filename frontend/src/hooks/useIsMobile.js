import { useEffect, useState } from 'react';

// Small, dependency-free viewport hook — matchMedia-driven (not a resize
// listener + manual width math) so it doesn't fire on every pixel of a
// drag-resize, only when the breakpoint is actually crossed. Used to pick
// between a true mobile-first screen flow and a desktop multi-panel
// layout at the component level (see MobileAgentConsole.jsx /
// JedidaCommandCenter.jsx) — NOT for shrinking a desktop layout with CSS
// alone, which the Agent Communication Center spec explicitly rules out.
export default function useIsMobile(breakpointPx = 860) {
  const query = `(max-width: ${breakpointPx}px)`;
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}
