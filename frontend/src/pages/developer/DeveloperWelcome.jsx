import { useNavigate } from 'react-router-dom';
import '../../styles/developer-platform.css';

// Reached only via the hidden 12-tap-the-logo gesture (see
// hooks/useSecretTapGesture.js + MarketplaceHeader.jsx). Revealing this
// screen never grants access by itself — every path from here still goes
// through sign-in and, for new developers, an application that an admin
// must approve.
export default function DeveloperWelcome() {
  const navigate = useNavigate();

  const options = [
    { ic: '🧑\u200d💻', label: 'Register as Developer', sub: 'Independent developer or freelancer', to: '/developer/register?type=individual' },
    { ic: '🏢', label: 'Register as Developer Organization', sub: 'Startups and software companies', to: '/developer/register?type=organization' },
    { ic: '🔗', label: 'Register as Integration Partner', sub: 'Building integrations for other businesses', to: '/developer/register?type=integration_partner' },
    { ic: '🏛️', label: 'Register as Enterprise Partner', sub: 'Large-scale or strategic partnerships', to: '/developer/register?type=enterprise' },
    { ic: '🔑', label: 'Existing Developer Login', sub: 'Sign in to your developer dashboard', to: '/signin?next=/developer/dashboard' },
  ];

  return (
    <div className="jdp">
      <div className="jdp-center">
        <div className="jdp-card jdp-welcome">
          <div className="jdp-mark">J</div>
          <h1>Welcome to Jedida Developer &amp; Partner Platform</h1>
          <p>
            You've found the hidden door. From here you can apply as a developer or
            partner organization, or sign in if you already have a developer account.
            Every application is reviewed by our team before it's approved.
          </p>
          <div className="jdp-option-list">
            {options.map((o) => (
              <button key={o.label} className="jdp-option" onClick={() => navigate(o.to)}>
                <span className="ic">{o.ic}</span>
                <span>
                  {o.label}
                  <small>{o.sub}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="jdp-back-link" onClick={() => navigate('/')}>← Back to the marketplace</div>
        </div>
      </div>
    </div>
  );
}
