import { useEffect, useState } from 'react';
import ChatWorkspace from './chat/ChatWorkspace';
import { OPEN_CHAT_EVENT } from './header/MessagesMenu';
import { jedidaNative } from '../native/jedidaNativeBridge';
import { registerForPush } from '../native/pushNotifications';

// Below this width (or inside the native shell) chat opens full-screen —
// a bottom sheet capped at 50-92vh doesn't give a real "mobile app chat"
// feel, and it can't host a hardware-back-button close. Desktop/tablet
// keeps the existing floating sheet until the full 3-panel workspace page
// ships (a later phase of this stage).
const MOBILE_BREAKPOINT_PX = 768;

function isMobileLayout() {
  return jedidaNative.isNative() || window.innerWidth < MOBILE_BREAKPOINT_PX;
}

export default function FloatingChatButton() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState(null);
  const [mobile, setMobile] = useState(isMobileLayout());
  const isSignedIn = !!localStorage.getItem('jedida_access_token');

  // The header's Messages menu lives on a different part of the tree (it's
  // rendered per-page, this button once at the app root), so it hands off
  // to this panel via a plain window event rather than prop drilling. A
  // push-notification tap uses the same event with a conversationId in
  // `detail`, so both paths land in one place.
  useEffect(() => {
    const openChat = (event) => {
      setInitialConversationId(event?.detail?.conversationId ?? null);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, openChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openChat);
  }, []);

  useEffect(() => {
    const onResize = () => setMobile(isMobileLayout());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Register this device for push once signed in — inert no-op on plain
  // web (see jedidaNativeBridge.isNative()), so this is safe to always run.
  useEffect(() => {
    if (isSignedIn) registerForPush();
  }, [isSignedIn]);

  // Android hardware back button closes the sheet/full-screen chat instead
  // of backing out of the app, but only while chat is actually open —
  // otherwise normal in-app back navigation should win.
  useEffect(() => {
    if (!open) return undefined;
    return jedidaNative.onBackButton(() => {
      setOpen(false);
      return true; // consumed — don't also exit the app / navigate back
    });
  }, [open]);

  if (!isSignedIn) return null;

  const closeChat = () => {
    setOpen(false);
    setInitialConversationId(null);
    setExpanded(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        style={{
          position: 'fixed', bottom: 'var(--chat-button-bottom, 24px)', right: 24, zIndex: 900,
          width: 58, height: 58, borderRadius: '50%', border: 'none',
          background: 'var(--forest, #16803c)', color: '#fff', fontSize: 24,
          boxShadow: '0 10px 24px rgba(0,0,0,0.25)', cursor: 'pointer',
        }}
      >
        💬
      </button>
    );
  }

  if (mobile) {
    // True full-screen app-like chat: fills the viewport (dvh accounts for
    // mobile browser chrome collapsing), respects safe areas inside the
    // native shell, and its only chrome here is the close button —
    // ChatWorkspace's own header carries identity/status/AI-tools.
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          height: '100dvh', width: '100vw',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(165deg, #0B3D24, #062818)',
          paddingTop: 'var(--safe-area-top, 0px)',
          paddingBottom: 'var(--safe-area-bottom, 0px)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '10px 12px 0', flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Close chat"
            style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.08)', color: '#F3FBF6', fontSize: 15,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '10px 0 0', display: 'flex' }}>
          <ChatWorkspace onClose={closeChat} initialConversationId={initialConversationId} />
        </div>
      </div>
    );
  }

  const sheetHeight = expanded ? '92vh' : '50vh';

  return (
    <>
      {/* Soft backdrop so the sheet reads as an overlay on top of the page */}
      <div
        onClick={closeChat}
        style={{ position: 'fixed', inset: 0, zIndex: 899, background: 'rgba(6,15,10,0.28)' }}
      />

      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900,
          height: sheetHeight, maxHeight: '100vh',
          margin: '0 auto', width: '100%', maxWidth: 460,
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(165deg, rgba(11,61,36,0.72), rgba(6,40,24,0.86))',
          backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
          borderTopLeftRadius: 26, borderTopRightRadius: 26,
          borderLeft: '1px solid rgba(255,255,255,0.14)',
          borderRight: '1px solid rgba(255,255,255,0.14)',
          borderTop: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          transition: 'height 0.25s ease',
        }}
      >
        {/* Sheet chrome: close + expand only — ChatWorkspace's own header
            shows the counterpart's identity, trust score, etc. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '10px 12px 0', flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse chat' : 'Expand chat'}
            title={expanded ? 'Collapse' : 'Expand'}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none', background: 'none',
              color: '#F3FBF6', fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {expanded ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Close chat"
            style={{
              width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.08)', color: '#F3FBF6', fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '10px 12px 12px', display: 'flex' }}>
          <ChatWorkspace onClose={closeChat} initialConversationId={initialConversationId} />
        </div>
      </div>
    </>
  );
}
