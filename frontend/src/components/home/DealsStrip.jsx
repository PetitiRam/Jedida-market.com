import { trackAdClick } from '../../api/homeApi';

export default function DealsStrip({ dealBanners }) {
  if (!dealBanners || dealBanners.length === 0) return null;

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>Deals</h2>
      </div>
      <div className="deal-strip">
        {dealBanners.map((ad) => (
          <a
            key={ad.id}
            href={ad.link_url || '#'}
            onClick={() => trackAdClick(ad.id)}
            target={ad.link_url?.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            className="deal-strip-card"
            style={ad.video_url ? undefined : { backgroundImage: `url(${ad.thumbnail_url || ad.image_url})` }}
          >
            {ad.video_url && (
              <video
                className="deal-strip-video"
                src={ad.video_url}
                poster={ad.thumbnail_url || ad.image_url}
                autoPlay={ad.autoplay !== false}
                muted={ad.muted !== false}
                loop={ad.loop_video !== false}
                playsInline
              />
            )}
            <div className="deal-strip-scrim" />
            <div className="deal-strip-content">
              {ad.badge_text && <span style={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>{ad.badge_text}</span>}
              <h4>{ad.title}</h4>
              {ad.subtitle && <span>{ad.subtitle}</span>}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
