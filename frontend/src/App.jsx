import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useAppContext } from './AppContext';
import TopNavigation from './components/TopNavigation';
import LandingPage from './components/LandingPage';
import UploadOnboarding from './components/UploadOnboarding';
import Dashboard from './components/Dashboard';
import MapView from './components/MapView';
import QueryChat from './components/QueryChat';
import Reports from './components/Reports';
import Profile from './components/Profile';
import Logistics from './components/Logistics';
import ThemeToggle from './components/ThemeToggle';

function App() {
  const { currentScreen, user, loading, navigate } = useAppContext();

  React.useEffect(() => {
    import('./utils/indexed_db_sync').then(({ setupOfflineSync }) => {
      setupOfflineSync();
    });
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (user) {
          navigate('screen-nlq');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner"></div>
        <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Verifying session...</p>
      </div>
    );
  }

  const requiresNav = ['screen-dashboard', 'screen-map', 'screen-nlq', 'screen-reports', 'screen-profile', 'screen-logistics'].includes(currentScreen);

  return (
    <>
      <Toaster position="top-right" />
      {requiresNav && user && <TopNavigation />}

      <main id="app-container">
        {currentScreen === 'screen-login' && <LandingPage />}
        {currentScreen?.startsWith('screen-onboard') && <UploadOnboarding />}
        {currentScreen === 'screen-dashboard' && <Dashboard />}
        {currentScreen === 'screen-map' && <MapView />}
        {currentScreen === 'screen-nlq' && <QueryChat />}
        {currentScreen === 'screen-reports' && <Reports />}
        {currentScreen === 'screen-profile' && <Profile />}
        {currentScreen === 'screen-logistics' && <Logistics />}
      </main>
      
      <ThemeToggle />
      
      {currentScreen !== 'screen-login' && (
        <div style={{
          padding: '1.5rem 0',
          width: '100%',
          textAlign: 'center',
          fontWeight: '700',
          color: 'var(--clr-text-muted)',
          fontSize: '1.1rem',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          fontFamily: '"Stack Sans Headline", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          opacity: 0.8,
          marginTop: 'auto'
        }}>
          CRISISGRID — WHERE EVERY CRISIS MEETS CLARITY
        </div>
      )}
    </>
  );
}

export default App;
