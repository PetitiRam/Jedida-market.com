import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer
      style={{
        textAlign: 'center',
        padding: '18px 16px',
        fontSize: '0.78rem',
        color: '#8A9189',
        letterSpacing: '0.02em',
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <Link to="/legal" style={{ color: '#8A9189' }}>Legal Center</Link>
        {' · '}
        <Link to="/legal/terms_of_service" style={{ color: '#8A9189' }}>Terms of Service</Link>
        {' · '}
        <Link to="/legal/privacy_policy" style={{ color: '#8A9189' }}>Privacy Policy</Link>
        {' · '}
        <Link to="/partner-with-jedida" style={{ color: '#8A9189' }}>Partner With Jedida</Link>
        {' · '}
        <Link to="/partner-apps" style={{ color: '#8A9189' }}>Partner Apps</Link>
      </div>
      Ancient of Days Technologies
    </footer>
  );
}
