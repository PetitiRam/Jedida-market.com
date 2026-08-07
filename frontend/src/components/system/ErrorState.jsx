import { normalizeError } from '../../api/client';

// For "a request failed" (network/timeout/5xx/etc.), as opposed to
// ErrorBoundary which is for "a component crashed while rendering".
// Pass the caught axios error directly — it will be normalized for you.
//
//   {error && <ErrorState error={error} onRetry={refetch} />}
export default function ErrorState({ error, onRetry, compact = false }) {
  const { friendlyMessage, kind } = normalizeError(error);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        textAlign: 'center',
        padding: compact ? '1.25rem 1rem' : '2.5rem 1.5rem',
        color: 'var(--ink, #10241A)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{friendlyMessage}</p>
      {onRetry && kind !== 'auth' && (
        <button
          onClick={onRetry}
          style={{
            padding: '0.4rem 1.1rem',
            borderRadius: '999px',
            border: '1px solid var(--line, #DCEAE0)',
            background: 'transparent',
            color: 'var(--forest, #0B3D24)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
      {kind === 'auth' && onRetry === undefined && (
        <a href="/signin" style={{ color: 'var(--forest, #0B3D24)', fontWeight: 600 }}>
          Sign in again
        </a>
      )}
    </div>
  );
}
