export default function AuthSkeleton({ fields = 3 }) {
  return (
    <div>
      <div className="jd-skel" style={{ height: 14, width: '40%', marginBottom: 10, borderRadius: 6 }} />
      <div className="jd-skel" style={{ height: 26, width: '75%', marginBottom: 24, borderRadius: 8 }} />
      <div className="jd-skel" style={{ height: 44, marginBottom: 18, borderRadius: 12 }} />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="jd-skel jd-skel-field" />
      ))}
      <div className="jd-skel jd-skel-btn" />
    </div>
  );
}
