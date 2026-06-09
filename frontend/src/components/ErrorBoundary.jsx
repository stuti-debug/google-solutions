import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CrisisGrid ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Clear session and reload to landing
    localStorage.removeItem('crisisgrid_session');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--clr-bg, #f5f5f5)',
          fontFamily: 'Outfit, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <i className="ph-fill ph-warning-circle" style={{ fontSize: '4rem', color: '#e05c5c', marginBottom: '1rem' }}></i>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1a1a2e' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#6c6c8a', marginBottom: '1.5rem', maxWidth: '500px' }}>
            CrisisGrid encountered an unexpected error. Your data is safe — please try again.
          </p>
          <pre style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '1rem',
            maxWidth: '600px',
            width: '100%',
            overflow: 'auto',
            fontSize: '0.85rem',
            color: '#e05c5c',
            marginBottom: '2rem',
            textAlign: 'left',
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.8rem 2rem',
              borderRadius: '8px',
              border: 'none',
              background: '#0d7377',
              color: '#fff',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Restart CrisisGrid
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
