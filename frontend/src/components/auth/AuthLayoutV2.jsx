import Logo from '../Logo';
import Icon from '../icons/icon';
import ThemeToggle from '../ThemeToggle';
import Footer from '../Footer';
import '../../styles/auth-v2.css';

const POINTS = [
  { icon: 'bag', text: 'Your own shareable storefront' },
  { icon: 'shield', text: 'Escrow-protected payments' },
  { icon: 'checkShield', text: 'AI-assisted listings' },
];

export default function AuthLayoutV2({ children }) {
  return (
    <div className="jd-auth">
      <span className="jd-auth-glow-a" />
      <span className="jd-auth-glow-b" />

      <aside className="jd-auth-brand">
        <span className="jd-auth-brand-orb" />
        <div className="jd-auth-brand-top">
          <Logo size={38} light />
          <h2 className="jd-auth-brand-heading">One marketplace. Buyers, sellers, and delivery — together.</h2>
        </div>
        <div className="jd-auth-brand-bottom">
          <div className="jd-auth-brand-points">
            {POINTS.map((p) => (
              <div className="jd-auth-brand-point" key={p.text}>
                <span className="jd-auth-brand-point-icon"><Icon name={p.icon} size={15} /></span>
                {p.text}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="jd-auth-panel">
        <div className="jd-auth-topbar">
          <ThemeToggle />
        </div>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div className="jd-auth-card">{children}</div>
          <div className="jd-auth-page-footer">
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
