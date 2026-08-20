import ChatWorkspace from './ChatWorkspace';

export default function EmbeddedSupportChat() {
  return (
    <div
      className="card-surface"
      style={{
        height: 560,
        minHeight: 0,
        display: 'flex',
        borderRadius: 14,
        overflow: 'hidden',
        padding: 0,
      }}
    >
      <ChatWorkspace />
    </div>
  );
}
