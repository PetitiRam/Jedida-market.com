import { useEffect, useState } from 'react';
import DropdownShell from './DropdownShell';
import RippleIconButton from './RippleIconButton';
import Icon from '../icons/icon';
import client from '../../api/client';
import { getUser } from '../../utils/auth';

// Custom event the header dispatches and FloatingChatButton listens for —
// keeps the two decoupled (the header renders per-page, the chat button
// mounts once at the app root) while still sharing one conversation UI.
export const OPEN_CHAT_EVENT = 'jedida:open-chat';

export default function MessagesMenu({ showLabel = false }) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const me = getUser();

  const load = () => {
    client.get('/chat-v2/mine').then(({ data }) => {
      const conversationId = data.conversation?.id;
      if (!conversationId) { setLoaded(true); return; }
      client.get(`/chat-v2/${conversationId}/messages`).then(({ data: msgData }) => {
        setMessages(msgData.messages || []);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }).catch(() => setLoaded(true));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const bump = () => load();
    window.addEventListener('jedida:unread-bump', bump);
    return () => window.removeEventListener('jedida:unread-bump', bump);
  }, []);

  const unreadCount = messages.filter((m) => m.sender_id !== me?.id && m.status !== 'read').length;
  const recent = messages.slice(-5).reverse();

  const openFullChat = (close) => {
    close();
    window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
  };

  return (
    <DropdownShell
      onOpen={load}
      width={320}
      trigger={({ open, toggle }) => (
        <RippleIconButton
          label="Messages"
          active={open}
          onClick={toggle}
          showLabel={showLabel}
          badge={unreadCount > 0 && <span className="jd-badge jd-badge-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        >
          <Icon name="message" size={19} />
        </RippleIconButton>
      )}
    >
      {({ close }) => (
        <>
          <div className="jd-menu-header"><span>Messages</span></div>
          <div className="jd-menu-list">
            {!loaded && <div className="jd-menu-empty">Loading…</div>}
            {loaded && recent.length === 0 && (
              <div className="jd-menu-empty">No messages yet — say hello to the JEDIDA admin team.</div>
            )}
            {recent.map((m) => (
              <div key={m.id} className={`jd-menu-row jd-menu-row-static ${m.sender_id !== me?.id && m.status !== 'read' ? 'is-unread' : ''}`}>
                <span className="jd-menu-row-dot" />
                <span className="jd-menu-row-body">
                  <span className="jd-menu-row-title">{m.sender_id === me?.id ? 'You' : 'JEDIDA Admin'}</span>
                  <span className="jd-menu-row-sub">{m.display_body || m.body}</span>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="jd-menu-footer-action" onClick={() => openFullChat(close)}>
            Open full conversation
          </button>
        </>
      )}
    </DropdownShell>
  );
}
