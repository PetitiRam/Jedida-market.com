import { useEffect, useState } from 'react';
import { getAdsByPlacement, trackAdClick } from '../api/homeApi';
import Icon from './icons/icon';

// Reusable, placement-aware ad carousel — real ads pulled straight from the
// admin-managed `ads` table (see AdminAdsPanel + backend/src/routes/ads.js).
// Every impression the widget renders and every click on it is recorded
// server-side, exactly like the hero/deals placements on the homepage feed.
export default function AdsBanner({
  placement = 'sidebar',
  title = 'Sponsored',
  height = 190,
  autoPlayMs = 6000,
  emptyFallback = null,
}) {
  const [ads, setAds] = useState(null); // null = loading, [] = loaded-empty
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdsByPlacement(placement)
      .then(({ data }) => { if (!cancelled) setAds(data.ads || []); })
      .catch(() => { if (!cancelled) setAds([]); });
    return () => { cancelled = true; };
  }, [placement]);

  useEffect(() => {
    if (!ads || ads.length < 2) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % ads.length), autoPlayMs);
    return () => clearInterval(t);
  }, [ads, autoPlayMs]);

  if (ads === null) {
    return (
      <div className="jd-ads-card jd-ads-card-loading" style={{ height }}>
        <div className="skeleton" style={{ height: '100%', borderRadius: 16 }} />
      </div>
    );
  }

  if (ads.length === 0) return emptyFallback;

  const ad = ads[index % ads.length];
  const go = (delta) => setIndex((i) => (i + delta + ads.length) % ads.length);
  const handleClick = () => trackAdClick(ad.id);

  return (
    <div className="jd-ads-card">
      {title && (
        <div className="jd-ads-card-head">
          <span>{title}</span>
        </div>
      )}
      <a
        className="jd-ads-card-media"
        style={{ height, ...(ad.video_url ? {} : { backgroundImage: `url(${ad.thumbnail_url || ad.image_url})` }) }}
        href={ad.link_url || '#'}
        onClick={handleClick}
        target={ad.link_url?.startsWith('http') ? '_blank' : undefined}
        rel="noreferrer"
      >
        {ad.video_url && (
          <video
            className="jd-ads-card-video"
            style={{ height }}
            src={ad.video_url}
            poster={ad.thumbnail_url || ad.image_url}
            autoPlay={ad.autoplay !== false}
            muted={ad.muted !== false}
            loop={ad.loop_video !== false}
            playsInline
          />
        )}
        <span className="jd-ads-sponsored-tag">{ad.video_url ? '▶ Sponsored' : 'Sponsored'}</span>
        {ads.length > 1 && (
          <>
            <button
              type="button"
              className="jd-ads-arrow jd-ads-arrow-left"
              aria-label="Previous ad"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(-1); }}
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <button
              type="button"
              className="jd-ads-arrow jd-ads-arrow-right"
              aria-label="Next ad"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(1); }}
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </>
        )}
        <div className="jd-ads-card-scrim" />
        <div className="jd-ads-card-caption">
          {ad.badge_text && <span className="jd-ads-card-badge">{ad.badge_text}</span>}
          <strong>{ad.title}</strong>
          {ad.subtitle && <span>{ad.subtitle}</span>}
        </div>
      </a>
      {ads.length > 1 && (
        <div className="jd-ads-dots">
          {ads.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`jd-ads-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Show ad ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
