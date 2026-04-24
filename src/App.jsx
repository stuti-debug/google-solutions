import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useAppContext } from './AppContext';
import TopNavigation from './components/TopNavigation';
import LandingPage from './components/LandingPage';
import UploadOnboarding from './components/UploadOnboarding';
import Dashboard from './components/Dashboard';
import QueryChat from './components/QueryChat';
import Reports from './components/Reports';
import Profile from './components/Profile';

function App() {
  const { currentScreen, user, loading } = useAppContext();

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner"></div>
        <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Verifying session...</p>
      </div>
    );
  }

  const requiresNav = ['screen-dashboard', 'screen-nlq', 'screen-reports', 'screen-profile'].includes(currentScreen);

  return (
    <>
      <Toaster position="top-right" />
      {requiresNav && user && <TopNavigation />}

      <main id="app-container">
        {currentScreen === 'screen-login' && <LandingPage />}
        {currentScreen?.startsWith('screen-onboard') && <UploadOnboarding />}
        {currentScreen === 'screen-dashboard' && <Dashboard />}
        {currentScreen === 'screen-nlq' && <QueryChat />}
        {currentScreen === 'screen-reports' && <Reports />}
        {currentScreen === 'screen-profile' && <Profile />}
      </main>
    </>
  );
}

export default App;
