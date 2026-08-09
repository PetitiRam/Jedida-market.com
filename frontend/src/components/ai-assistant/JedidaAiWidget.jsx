import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import {
  sendAssistantMessage,
  teachAssistant,
} from '../../api/aiAssistantApi';
import { aiTrainingApi } from '../../api/aiTrainingApi';
import ChatPanelV2 from '../ChatPanelV2';
import '../../styles/ai-assistant.css';

// Roles that receive the seller dashboard experience.
const SELLER_ROLES = [
  'seller',
  'manufacturer',
  'supplier',
  'dropshipper',
  'farmer',
];

const SUGGESTIONS_BY_AUDIENCE = {
  seller: [
    {
      key: 'design',
      label: 'Design my store',
      prompt: 'Help me design my storefront — where do I start?',
    },
    {
      key: 'review',
      label: 'Review a listing',
      prompt:
        'Can you review a product listing for me before I publish it?',
    },
    {
      key: 'marketing',
      label: 'Marketing ideas',
      prompt:
        'Give me some marketing ideas to bring more buyers to my shop.',
    },
    {
      key: 'analytics',
      label: "How's my shop doing?",
      prompt: 'How is my shop performing lately?',
    },
  ],

  buyer: [
    {
      key: 'track',
      label: 'Track my order',
      prompt: 'Where is my order?',
    },
    {
      key: 'return',
      label: 'Start a return',
      prompt: 'How do I return or get a refund for an order?',
    },
    {
      key: 'find',
      label: 'Find a product',
      prompt: "Help me find a product I'm looking for.",
    },
    {
      key: 'payment',
      label: 'Payment question',
      prompt: 'How does payment and escrow work on Jedida?',
    },
  ],
};

const EMPTY_STATE_TEXT = {
  seller:
    "Hi, I'm Jedida AI. Ask me about your storefront, a listing, marketing, or how your shop's doing.",

  buyer:
    "Hi, I'm Jedida AI. Ask me about an order, a return, payments, or finding a product.",
};

const BRAND_SUBTITLE = {
  seller: 'Your commerce co-pilot',
  buyer: 'Your shopping assistant',
};

const LEARNING_INTRO =
  "Learning Mode is on. Anything you tell me now, I'll save as trusted " +
  'knowledge and use going forward when buyers or sellers ask something ' +
  'related — no review queue, since it is coming straight from an admin. ' +
  'Toggle it off any time to go back to normal chat.';

const LEARNING_EMPTY_TEXT =
  "Tell me anything and I'll save it as trusted knowledge — a policy, " +
  "a correction, a fact about the platform. I'll confirm each one back to you.";

function Icon({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'plus':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      );

    case 'mic':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
        </svg>
      );

    case 'send':
      return (
        <svg {...common} strokeWidth={2} aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      );

    case 'new':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 4v5h5M20 20v-5h-5" />
          <path d="M4.5 15a8 8 0 0 0 14.7 2.3M19.5 9A8 8 0 0 0 4.8 6.7" />
        </svg>
      );

    case 'expand':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      );

    case 'collapse':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 3v6H3M15 21v-6h6M3 9l6-6M21 15l-6 6" />
        </svg>
      );

    case 'close':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );

    case 'copy':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      );

    case 'up':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Z" />
          <path d="m7 10 4.5-8a2 2 0 0 1 3.8 1l-1 5.5H19a2 2 0 0 1 2 2.3l-1.5 8A2 2 0 0 1 17.5 21H10a3 3 0 0 1-3-3" />
        </svg>
      );

    case 'down':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3Z" />
          <path d="m17 14-4.5 8a2 2 0 0 1-3.8-1l1-5.5H5a2 2 0 0 1-2-2.3l1.5-8A2 2 0 0 1 6.5 3H14a3 3 0 0 1 3 3" />
        </svg>
      );

    case 'learn':
      return (
        <svg {...common} aria-hidden="true">
          <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
          <path d="M6.5 9.75V15c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V9.75" />
        </svg>
      );

    default:
      return null;
  }
}

export default function JedidaAiWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [messages, setMessages] = useState([]);

  const [humanChatOpen, setHumanChatOpen] = useState(false);
  const [humanChatReason, setHumanChatReason] = useState(null);

  const [input, setInput] = useState('');
  const [deepMode, setDeepMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const [audience, setAudience] = useState(null);
  const [conversationId, setConversationId] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [learningMode, setLearningMode] = useState(false);

  const scrollRef = useRef(null);

  const isSignedIn = Boolean(
    localStorage.getItem('jedida_access_token')
  );

  /*
   * Resolve the current user once the widget mounts.
   */
  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    let mounted = true;

    const loadUser = async () => {
      try {
        const { data } = await client.get('/auth/me');

        if (!mounted) {
          return;
        }

        const user = data?.user;

        const resolvedAudience = SELLER_ROLES.includes(
          user?.primary_role
        )
          ? 'seller'
          : 'buyer';

        setAudience(resolvedAudience);
        setIsAdmin(Boolean(user?.is_admin));
      } catch (error) {
        if (mounted) {
          setAudience('buyer');
          setIsAdmin(false);
        }
      }
    };

    loadUser();

    return () => {
      mounted = false;
    };
  }, [isSignedIn]);

  /*
   * Keep the chat scrolled to the newest message.
   */
  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  /*
   * Send either a normal AI message or an admin teaching instruction.
   */
  const send = async (text) => {
    const content = (text ?? input).trim();

    if (!content || busy) {
      return;
    }

    const history = messages;

    setMessages((current) => [
      ...current,
      {
        role: 'user',
        content,
        taught: isAdmin && learningMode,
      },
    ]);

    setInput('');
    setBusy(true);

    /*
     * ADMIN LEARNING MODE
     *
     * The message is sent to the teaching endpoint instead of the
     * normal assistant endpoint.
     */
    if (isAdmin && learningMode) {
      try {
        const { data } = await teachAssistant(
          content,
          conversationId,
          audience || 'buyer'
        );

        if (data?.conversationId) {
          setConversationId(data.conversationId);
        }

        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content:
              data?.reply ||
              'I saved that as trusted knowledge.',
            messageId: data?.messageId || null,
            learned: true,
            collection:
              data?.knowledgeItem?.collection || null,
          },
        ]);
      } catch (error) {
        const responseData = error?.response?.data;

        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content:
              responseData?.error ||
              "Couldn't save that just now — try again in a moment.",
            learned: false,
            flagged: Boolean(responseData?.flags),
          },
        ]);

        if (responseData?.conversationId) {
          setConversationId(responseData.conversationId);
        }
      } finally {
        setBusy(false);
      }

      return;
    }

    /*
     * NORMAL AI CHAT
     */
    try {
      const { data } = await sendAssistantMessage(
        content,
        history,
        deepMode,
        audience || 'buyer',
        conversationId
      );

      if (data?.conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            data?.reply ||
            'I received your message, but I do not have a response yet.',
          messageId: data?.messageId || null,
          needsHuman: Boolean(data?.needsHuman),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            error?.response?.data?.error ||
            "I couldn't reach Jedida AI just now — try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  /*
   * Toggle administrator Learning Mode.
   */
  const toggleLearningMode = () => {
    setLearningMode((current) => {
      const next = !current;

      if (next) {
        setMessages((messages) => [
          ...messages,
          {
            role: 'assistant',
            content: LEARNING_INTRO,
            learningIntro: true,
          },
        ]);
      }

      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    send();
  };

  const copyMessage = (text) => {
    if (!text || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(text).catch(() => {});
  };

  /*
   * Submit helpful / not-helpful feedback.
   */
  const setFeedback = (index, value) => {
    let targetMessageId = null;

    setMessages((current) =>
      current.map((message, messageIndex) => {
        if (messageIndex !== index) {
          return message;
        }

        targetMessageId = message.messageId || null;

        return {
          ...message,
          feedback:
            message.feedback === value ? null : value,
        };
      })
    );

    aiTrainingApi
      .submitFeedback({
        rating: value === 'up' ? 'helpful' : 'not_helpful',
        source: 'assistant_widget',
        conversationId,
        messageId: targetMessageId,
      })
      .catch(() => {});
  };

  /*
   * Start a completely new conversation.
   */
  const newChat = () => {
    setMessages([]);
    setInput('');
    setConversationId(null);
  };

  /*
   * The widget is intentionally hidden for signed-out users.
   */
  if (!isSignedIn || !audience) {
    return null;
  }

  /*
   * Compact launcher.
   */
  if (!open) {
    return (
      <button
        type="button"
        className="jai-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open Jedida AI"
      >
        <span className="jai-orb jai-orb-sm" />
        <span>Ask Jedida AI anything</span>
      </button>
    );
  }

  const panelClassName = [
    'jai-panel',
    expanded ? 'jai-panel-expanded' : '',
    learningMode ? 'jai-panel-learning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={panelClassName}
      role="dialog"
      aria-label="Jedida AI Assistant"
    >
      {/* HEADER */}
      <div className="jai-header">
        <div className="jai-brand">
          <span className="jai-orb jai-orb-sm" />

          <div>
            <b>Jedida AI</b>

            <span>
              {learningMode
                ? '🎓 Learning Mode — teaching Jedida AI'
                : BRAND_SUBTITLE[audience]}
            </span>
          </div>
        </div>

        <div className="jai-header-actions">
          {isAdmin && (
            <button
              type="button"
              onClick={toggleLearningMode}
              title={
                learningMode
                  ? 'Exit Learning Mode'
                  : 'Teach Jedida AI (admin)'
              }
              aria-label="Toggle Learning Mode"
              className={
                learningMode ? 'jai-learning-active' : ''
              }
            >
              <Icon name="learn" />
            </button>
          )}

          <button
            type="button"
            onClick={newChat}
            title="New chat"
            aria-label="New chat"
          >
            <Icon name="new" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            title={expanded ? 'Collapse' : 'Expand'}
            aria-label="Toggle size"
            className="jai-hide-mobile"
          >
            <Icon
              name={expanded ? 'collapse' : 'expand'}
            />
          </button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="jai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="jai-empty">
            <span className="jai-orb jai-orb-lg" />

            <p>
              {learningMode
                ? LEARNING_EMPTY_TEXT
                : EMPTY_STATE_TEXT[audience]}
            </p>

            {!learningMode && (
              <div className="jai-suggestions">
                {SUGGESTIONS_BY_AUDIENCE[audience].map(
                  (suggestion) => (
                    <button
                      type="button"
                      key={suggestion.key}
                      onClick={() =>
                        send(suggestion.prompt)
                      }
                    >
                      {suggestion.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {messages.map((message, index) => {
          const messageClassName = [
            'jai-msg',
            `jai-msg-${message.role}`,
          ].join(' ');

          const bubbleClassName = [
            'jai-bubble',
            message.learningIntro
              ? 'jai-bubble-learning-intro'
              : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={`${message.messageId || 'message'}-${index}`}
              className={messageClassName}
            >
              <div className={bubbleClassName}>
                {message.learned && (
                  <span className="jai-learned-tag">
                    🎓 Learned
                  </span>
                )}

                {message.flagged && (
                  <span className="jai-flagged-tag">
                    🛡️ Flagged
                  </span>
                )}

                {message.content}
              </div>

              {/* NORMAL AI RESPONSE ACTIONS */}
              {message.role === 'assistant' &&
                !message.learningIntro &&
                typeof message.learned === 'undefined' && (
                  <div className="jai-msg-actions">
                    <button
                      type="button"
                      onClick={() =>
                        copyMessage(message.content)
                      }
                      title="Copy"
                      aria-label="Copy response"
                    >
                      <Icon name="copy" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFeedback(index, 'up')
                      }
                      title="Good response"
                      aria-label="Good response"
                      className={
                        message.feedback === 'up'
                          ? 'jai-active'
                          : ''
                      }
                    >
                      <Icon name="up" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFeedback(index, 'down')
                      }
                      title="Poor response"
                      aria-label="Poor response"
                      className={
                        message.feedback === 'down'
                          ? 'jai-active'
                          : ''
                      }
                    >
                      <Icon name="down" />
                    </button>
                  </div>
                )}

              {/* HUMAN ADMIN HANDOFF */}
              {message.role === 'assistant' &&
                message.needsHuman && (
                  <button
                    type="button"
                    className="jai-handoff-btn"
                    onClick={() => {
                      const reason =
                        `Jedida AI: "${message.content}"`;

                      setHumanChatReason(
                        reason.slice(0, 280)
                      );

                      setHumanChatOpen(true);
                    }}
                  >
                    Talk to a human admin
                  </button>
                )}
            </div>
          );
        })}

        {/* THINKING / SAVING STATE */}
        {busy && (
          <div className="jai-msg jai-msg-assistant">
            <div className="jai-bubble jai-typing">
              <span className="jai-orb jai-orb-xs jai-pulsing" />

              {learningMode
                ? 'Saving what you taught me…'
                : 'Jedida AI is thinking…'}
            </div>
          </div>
        )}
      </div>

      {/* INPUT BAR */}
      <form
        className="jai-input-bar"
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="jai-icon-btn"
          disabled
          title="Attachments — coming soon"
          aria-label="Attachments"
        >
          <Icon name="plus" />
        </button>

        <input
          value={input}
          onChange={(event) =>
            setInput(event.target.value)
          }
          placeholder={
            learningMode
              ? 'Teach Jedida AI something new…'
              : 'Ask anything'
          }
          aria-label="Message Jedida AI"
          autoComplete="off"
        />

        {!learningMode && (
          <label
            className="jai-deep-toggle"
            title="Ask for a more thorough answer"
          >
            <input
              type="checkbox"
              checked={deepMode}
              onChange={(event) =>
                setDeepMode(event.target.checked)
              }
            />

            <span className="jai-toggle-track">
              <span className="jai-toggle-thumb" />
            </span>

            <span className="jai-toggle-label jai-hide-mobile">
              Think deeper
            </span>
          </label>
        )}

        <button
          type="button"
          className="jai-icon-btn"
          disabled
          title="Voice — coming soon"
          aria-label="Voice input"
        >
          <Icon name="mic" />
        </button>

        <button
          type="submit"
          className="jai-send-btn"
          disabled={!input.trim() || busy}
          aria-label="Send message"
        >
          <Icon name="send" />
        </button>
      </form>

      {/* HUMAN ADMIN CHAT MODAL */}
      {humanChatOpen && (
        <div
          className="jp-modal-overlay"
          onClick={() => setHumanChatOpen(false)}
        >
          <div
            className="jp-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom:
                  '1px solid var(--jp-line)',
              }}
            >
              <div style={{ fontWeight: 800 }}>
                Chat with a human admin
              </div>

              <button
                type="button"
                className="jp-icon-btn"
                onClick={() =>
                  setHumanChatOpen(false)
                }
                aria-label="Close chat"
              >
                <Icon name="close" />
              </button>
            </div>

            <ChatPanelV2
              autoEscalateReason={humanChatReason}
            />
          </div>
        </div>
      )}
    </div>
  );
}
