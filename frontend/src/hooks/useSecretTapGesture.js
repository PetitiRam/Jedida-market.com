import { useCallback, useRef } from 'react';

// Detects N consecutive taps on an element within a rolling time window and
// fires onTrigger() once the count is reached. Used to reveal the hidden
// Developer & Partner Platform (12 taps on the marketplace logo) — this
// only ever *reveals the door*; it never grants access on its own (that
// still requires signing in / an approved developer application).
//
// A stray tap outside the window resets the counter, so it can't be
// triggered by accident over the course of ordinary browsing.
export function useSecretTapGesture({ taps = 12, windowMs = 1500, onTrigger }) {
  const countRef = useRef(0);
  const lastTapRef = useRef(0);
  const timeoutRef = useRef(null);

  const registerTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current > windowMs) {
      countRef.current = 0;
    }
    lastTapRef.current = now;
    countRef.current += 1;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      countRef.current = 0;
    }, windowMs);

    if (countRef.current >= taps) {
      countRef.current = 0;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onTrigger?.();
    }
  }, [taps, windowMs, onTrigger]);

  return registerTap;
}
