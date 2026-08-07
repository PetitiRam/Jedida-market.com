import { Link } from 'react-router-dom';
import { OPEN_CHAT_EVENT } from '../header/MessagesMenu';

export default function PromoCardsRow() {
  const openAssistant = () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT));

  return (
    <div className="jd-promo-row">
      <div className="jd-promo-card">
        <div className="jd-promo-card-icon">✅</div>
        <div className="jd-promo-card-title">Verified Shops</div>
        <div className="jd-promo-card-sub">Shop from trusted stores with confidence</div>
        <Link to="/marketplace?view=shops" className="jd-promo-card-btn">View all Shops</Link>
      </div>

      <div className="jd-promo-card">
        <div className="jd-promo-card-icon">✨</div>
        <div className="jd-promo-card-title">AI Shopping Assistant</div>
        <div className="jd-promo-card-sub">Let our AI help you find exactly what you need.</div>
        <button type="button" className="jd-promo-card-btn" onClick={openAssistant}>Chat with the Assistant</button>
      </div>

      <div className="jd-promo-card">
        <div className="jd-promo-card-icon">📈</div>
        <div className="jd-promo-card-title">Sell on Jedida</div>
        <div className="jd-promo-card-sub">Reach thousands of buyers across Uganda and beyond.</div>
        <Link to="/seller/upgrade" className="jd-promo-card-btn">Start Selling Now</Link>
      </div>

      <div className="jd-promo-card">
        <div className="jd-promo-card-icon">📱</div>
        <div className="jd-promo-card-title">Download Jedida App</div>
        <div className="jd-promo-card-sub">Shop on the go, anytime, anywhere.</div>
        <Link to="/download" className="jd-promo-card-btn">Get the App</Link>
      </div>
    </div>
  );
}
