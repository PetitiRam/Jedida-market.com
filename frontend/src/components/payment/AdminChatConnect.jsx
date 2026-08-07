import { useState } from "react";
import Icon from "../icons/icon";
import ChatPanelV2 from "../ChatPanelV2";

/**
 * Drops a "Need help?" card into any payment form. Tapping it opens the
 * existing admin chat (ChatPanelV2 / the same buyer<->admin bridge used
 * elsewhere) in a modal — no new chat backend, just surfacing what's
 * already there right where a buyer needs it during payment.
 */
export default function AdminChatConnect({ context = "" }) {
  const [open, setOpen] = useState(false);
  const isSignedIn = !!localStorage.getItem("jedida_access_token");

  if (!isSignedIn) return null;

  return (
    <>
      <button
        type="button"
        className="jp-support-card"
        style={{ width: "100%", border: "1px solid var(--jp-line)", cursor: "pointer", textAlign: "left" }}
        onClick={() => setOpen(true)}
      >
        <div className="jp-support-icon">
          <Icon name="headset" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>Need help with this payment?</div>
          <div style={{ fontSize: "0.8rem", color: "#6B756E" }}>Chat with a JEDIDA admin now</div>
        </div>
        <Icon name="chevronRight" size={18} />
      </button>

      {open && (
        <div className="jp-modal-overlay" onClick={() => setOpen(false)}>
          <div className="jp-modal" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", borderBottom: "1px solid var(--jp-line)"
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {context ? `Support · ${context}` : "Chat with Support"}
              </div>
              <button
                type="button"
                className="jp-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <ChatPanelV2 />
          </div>
        </div>
      )}
    </>
  );
}
