import { useState } from 'react';

export default function AIAssistantPanel({
  onAskAboutProduct, onCreateQuotation, onExplainPricing, onSummarize, onConnectHuman,
  languages, myLanguage, onChangeLanguage, hasProduct, connecting
}) {
  const [open, setOpen] = useState(false);
  const [showLangs, setShowLangs] = useState(false);

  const run = (fn) => { fn?.(); setOpen(false); setShowLangs(false); };

  return (
    <>
      <button type="button" className="cw-ai-fab" onClick={() => setOpen((v) => !v)} aria-label="Jedida AI Assistant" title="Jedida AI Assistant">
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div className="cw-ai-panel">
          <div className="cw-ai-panel-head">
            <span style={{ fontSize: '1.4rem' }}>🤖</span>
            <div>
              <b>Jedida AI Assistant</b>
              <span>Your commerce co-pilot for this chat</span>
            </div>
          </div>
          <div className="cw-ai-actions">
            <button type="button" className="cw-ai-action-btn" disabled={!hasProduct} onClick={() => run(onAskAboutProduct)}>
              <span className="icon">🛍️</span> Ask about product
            </button>
            <button type="button" className="cw-ai-action-btn" disabled={!hasProduct} onClick={() => run(onCreateQuotation)}>
              <span className="icon">📄</span> Create quotation
            </button>
            <button type="button" className="cw-ai-action-btn" disabled={!hasProduct} onClick={() => run(onExplainPricing)}>
              <span className="icon">💰</span> Explain pricing
            </button>
            <button type="button" className="cw-ai-action-btn" onClick={() => setShowLangs((v) => !v)}>
              <span className="icon">🌐</span> Translate message
            </button>
            {showLangs && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 8px 8px' }}>
                {languages.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => run(() => onChangeLanguage(l.key))}
                    style={{
                      fontSize: '0.68rem', padding: '4px 8px', borderRadius: 999,
                      border: 'none', cursor: 'pointer',
                      background: myLanguage === l.key ? 'var(--cw-grad-gold)' : 'var(--cw-card-bg-alt)'
                    }}
                  >
                    {l.label.split(' (')[0]}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="cw-ai-action-btn" onClick={() => run(onSummarize)}>
              <span className="icon">🧾</span> Summarize conversation
            </button>
            <button type="button" className="cw-ai-action-btn" onClick={() => run(onConnectHuman)} disabled={connecting}>
              <span className="icon">👤</span> {connecting ? 'Connecting…' : 'Connect to human support'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
