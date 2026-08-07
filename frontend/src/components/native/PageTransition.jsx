import { useLocation } from 'react-router-dom';

// A key change on the wrapping div remounts it on every route change, which
// restarts the CSS animation defined in native-shell.css — a lightweight
// fade+slide that reads as a native push transition instead of a browser's
// instant swap. Pure presentation: no routing or data logic lives here.
export default function PageTransition({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="native-page-transition">
      {children}
    </div>
  );
}
