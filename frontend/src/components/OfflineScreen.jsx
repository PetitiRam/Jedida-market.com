import { useEffect, useRef } from 'react';
import '../styles/offline-screen.css';

// The actual full-screen overlay UI. Purely presentational — all the
// "when do we show this" logic lives in useNetworkStatus.js; this
// component just renders it and wires up the Try Again button.
//
// Rendered by OfflineGate (see App.jsx) only while isOffline is true, so
// mount/unmount IS the show/hide transition — no internal visibility
// state needed here.
export default function OfflineScreen({ onRetry, checking, lastCheckFailed }) {
  const retryBtnRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    // Remember what had focus in the app underneath, then move focus to
    // the retry button so keyboard/screen-reader users land somewhere
    // useful immediately instead of on a now-hidden element.
    previouslyFocusedRef.current = document.activeElement;
    retryBtnRef.current?.focus();

    return () => {
      // Hand focus back to wherever the person was when connectivity
      // returns and this unmounts — the app resumes exactly where they
      // left off, including keyboard focus.
      if (previouslyFocusedRef.current && document.contains(previouslyFocusedRef.current)) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, []);

  // A simple focus trap: Tab/Shift+Tab on this screen's one interactive
  // element just keeps focus on it, since there's nothing else to tab to.
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      retryBtnRef.current?.focus();
    }
  };

  return (
    <div
      className="jd-offline-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jd-offline-title"
      aria-describedby="jd-offline-desc"
      onKeyDown={handleKeyDown}
    >
      <div className="jd-offline-content">
        <div className="jd-offline-globe-wrap" aria-hidden="true">
          <div className="jd-offline-globe-glow" />
          <div className="jd-offline-orbit-ring" />
          <div className="jd-offline-node-orbit">
            <span className="jd-offline-node" />
          </div>
          <div className="jd-offline-node-orbit is-reverse">
            <span className="jd-offline-node" />
          </div>

          <div className="jd-offline-globe">
            <div className="jd-offline-globe-band band-a" />
            <div className="jd-offline-globe-band band-b" />
            <div className="jd-offline-globe-band band-c" />
          </div>

          {/* Wordmark curved along the globe's upper arc — a static
              layer on top of the rotating rings/sheen, so it's never
              carried into the rotation and stays fully readable. */}
          <svg className="jd-offline-globe-label" viewBox="0 0 200 200">
            <defs>
              <path id="jd-offline-text-path" d="M 28,138 A 74,74 0 1,1 172,138" />
            </defs>
            <text textLength="150" lengthAdjust="spacingAndGlyphs">
              <textPath href="#jd-offline-text-path" startOffset="50%" textAnchor="middle">
                Jedida-market.com
              </textPath>
            </text>
          </svg>
        </div>

        <h2 id="jd-offline-title" className="jd-offline-title">No Internet Connection</h2>
        <p id="jd-offline-desc" className="jd-offline-desc">
          You're currently offline. Check your Wi-Fi or mobile data connection and try again.
        </p>

        <button
          ref={retryBtnRef}
          type="button"
          className="jd-offline-retry-btn"
          onClick={onRetry}
          disabled={checking}
          aria-busy={checking}
        >
          {checking ? 'Checking…' : 'Try Again'}
        </button>

        <p className="jd-offline-hint" role="status" aria-live="polite">
          {lastCheckFailed ? 'Still offline. Please check your connection.' : ''}
        </p>
      </div>
    </div>
  );
}
