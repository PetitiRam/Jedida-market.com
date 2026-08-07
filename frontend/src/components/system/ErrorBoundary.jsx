import React from 'react';

// Catches render/lifecycle errors in its subtree. Without this, an
// uncaught error anywhere in the tree unmounts the entire React app and
// the user sees a blank white page with no way to recover.
//
// Usage:
//   <ErrorBoundary><Marketplace /></ErrorBoundary>
//   <ErrorBoundary level="section" resetKey={productId}><ProductTabs /></ErrorBoundary>
//
// `level="page"` (default) shows a full-page recovery screen.
// `level="section"` shows a small inline card so the rest of the page
// (header, nav, other widgets) keeps working.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Swap for real telemetry (Sentry, etc.) — kept minimal here since no
    // error-reporting service is wired up in this codebase yet.
    console.error('ErrorBoundary caught an error:', error, info);
  }

  componentDidUpdate(prevProps) {
    // Allows a parent to recover the boundary when the underlying data
    // changes (e.g. navigating to a different product) without a full reload.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const isSection = this.props.level === 'section';

    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          textAlign: 'center',
          padding: isSection ? '2rem 1rem' : '4rem 1.5rem',
          minHeight: isSection ? 'auto' : '60vh',
          background: 'var(--cream-dim, #EAF3EC)',
          border: '1px solid var(--line, #DCEAE0)',
          borderRadius: 'var(--radius, 14px)',
          color: 'var(--ink, #10241A)',
          fontFamily: 'var(--font-body, system-ui, sans-serif)',
        }}
      >
        <p style={{ fontFamily: 'var(--font-display, sans-serif)', fontSize: isSection ? '1rem' : '1.25rem', margin: 0 }}>
          {isSection ? 'This section had a problem loading.' : 'Something went wrong.'}
        </p>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.9rem' }}>
          {isSection ? 'The rest of the page is still available.' : "We've noted the issue. Try again, or head back home."}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '999px',
              border: 'none',
              background: 'var(--forest, #0B3D24)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {!isSection && (
            <a
              href="/"
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '999px',
                border: '1px solid var(--line, #DCEAE0)',
                color: 'var(--ink, #10241A)',
                fontWeight: 600,
              }}
            >
              Go home
            </a>
          )}
        </div>
      </div>
    );
  }
}
