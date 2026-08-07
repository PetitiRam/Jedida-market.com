import { Link } from 'react-router-dom';

// Legal Center documents use a deliberately small markdown subset (#/##
// headings, numbered and bulleted lists, **bold**, and [text](/legal/slug)
// links) — enough to render every generated policy correctly without
// pulling in a full markdown dependency. Internal /legal/... links become
// client-side <Link> navigation; anything else is a plain <a>.
function renderInline(text, keyPrefix) {
  const parts = [];
  let remaining = text;
  let i = 0;

  const pattern = /(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/;
  while (remaining.length > 0) {
    const m = pattern.exec(remaining);
    if (!m) {
      parts.push(remaining);
      break;
    }
    if (m.index > 0) parts.push(remaining.slice(0, m.index));
    if (m[1]) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{m[2]}</strong>);
    } else if (m[3]) {
      const href = m[5];
      if (href.startsWith('/legal/')) {
        parts.push(<Link key={`${keyPrefix}-${i++}`} to={href}>{m[4]}</Link>);
      } else {
        parts.push(<a key={`${keyPrefix}-${i++}`} href={href} target="_blank" rel="noreferrer">{m[4]}</a>);
      }
    }
    remaining = remaining.slice(m.index + m[0].length);
  }
  return parts;
}

export default function LegalMarkdown({ content }) {
  const lines = (content || '').split('\n');
  const blocks = [];
  let listBuffer = [];
  let listType = null;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`list-${blocks.length}`} style={{ paddingLeft: 22, lineHeight: 1.7 }}>
        {listBuffer.map((item, idx) => <li key={idx}>{renderInline(item, `li-${blocks.length}-${idx}`)}</li>)}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();

    if (/^##\s+/.test(line)) {
      flushList();
      blocks.push(<h2 key={idx} style={{ marginTop: 28, marginBottom: 8, fontSize: '1.15rem' }}>{line.replace(/^##\s+/, '')}</h2>);
      return;
    }
    if (/^#\s+/.test(line)) {
      flushList();
      blocks.push(<h1 key={idx} style={{ marginBottom: 4 }}>{line.replace(/^#\s+/, '')}</h1>);
      return;
    }
    if (/^-\s+/.test(line)) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listBuffer.push(line.replace(/^-\s+/, ''));
      return;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listBuffer.push(line.replace(/^\d+\.\s+/, ''));
      return;
    }
    if (/^\*.*\*$/.test(line.trim()) && line.trim().length > 1) {
      flushList();
      blocks.push(<p key={idx} className="product-card-meta" style={{ fontStyle: 'italic' }}>{renderInline(line.trim().replace(/^\*/, '').replace(/\*$/, ''), `em-${idx}`)}</p>);
      return;
    }
    if (line.trim() === '') {
      flushList();
      return;
    }
    flushList();
    blocks.push(<p key={idx} style={{ lineHeight: 1.7, marginBottom: 10 }}>{renderInline(line, `p-${idx}`)}</p>);
  });
  flushList();

  return <div>{blocks}</div>;
}
