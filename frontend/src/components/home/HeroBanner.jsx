import { useEffect, useState } from 'react';
import Icon from '../icons/icon';
import { trackAdClick } from '../../api/homeApi';

export default function HeroBanner({ banners }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!banners || banners.length < 2) return undefined;
    const current = banners[index];
    const intervalMs = (current?.duration_seconds ? current.duration_seconds : 7) * 1000;
    const t = setInterval(() => setIndex((i) => (i + 1) % banners.length), intervalMs);
    return () => clearInterval(t);
  }, [banners, index]);

  if (!banners || banners.length === 0) return null;
  const ad = banners[index];
  const isVideo = ad.media_type === 'video' || Boolean(ad.video_url);

  const handleClick = () => { trackAdClick(ad.id); };
  const go = (delta) => setIndex((i) => (i + delta + banners.length) % banners.length);

  return (
    <div className="hero-shell">
      <div className="hero-banner">
        {isVideo && ad.video_url ? (
          <video
            key={ad.id}
            className="hero-banner-video"
            src={ad.video_url}
            poster={ad.thumbnail_url || ad.image_url}
            autoPlay={ad.autoplay !== false}
            muted={ad.muted !== false}
            loop={ad.loop_video !== false}
            playsInline
          />
        ) : (
          <div className="hero-banner-bg" style={{ backgroundImage: `url(${ad.thumbnail_url || ad.image_url})` }} />
        )}
        <div className="hero-banner-scrim" />
        <div className="hero-banner-content">
          {ad.badge_text && <span className="hero-badge">{ad.badge_text}</span>}
          <h1>{ad.title}</h1>
          {ad.subtitle && <p>{ad.subtitle}</p>}
          {ad.link_url && (
            <a href={ad.link_url} className="hero-cta" onClick={handleClick} target={ad.link_url.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {ad.cta_text || 'Shop now'}
              <Icon name="chevronRight" size={16} />
            </a>
          )}
        </div>

        {banners.length > 1 && (
          <>
            <button type="button" className="hero-arrow hero-arrow-left" aria-label="Previous banner" onClick={() => go(-1)}>
              <Icon name="chevronLeft" size={18} />
            </button>
            <button type="button" className="hero-arrow hero-arrow-right" aria-label="Next banner" onClick={() => go(1)}>
              <Icon name="chevronRight" size={18} />
            </button>
          </>
        )}

        {banners.length > 1 && (
          <div className="hero-dots">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`hero-dot ${i === index ? 'active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`Show banner ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
