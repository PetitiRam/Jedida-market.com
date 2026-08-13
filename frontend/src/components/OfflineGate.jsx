import useNetworkStatus from '../hooks/useNetworkStatus';
import OfflineScreen from './OfflineScreen';

// Mounted exactly once, near the top of the app (see App.jsx), so the
// offline state lives in exactly one place regardless of which route or
// component is on screen when connectivity drops. Renders nothing while
// online; when offline, renders the full-screen takeover on top of
// whatever page is underneath — the app tree underneath is never
// unmounted, so the current route, scroll position, form state, and
// auth session are all untouched and simply resume the moment this
// stops rendering.
export default function OfflineGate() {
  const { isOffline, checking, lastCheckFailed, checkNow } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <OfflineScreen
      onRetry={checkNow}
      checking={checking}
      lastCheckFailed={lastCheckFailed}
    />
  );
}
