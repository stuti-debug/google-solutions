import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useAppContext } from './AppContext';
import TopNavigation from './components/TopNavigation';
import LandingPage from './components/LandingPage';
import UploadOnboarding from './components/UploadOnboarding';
import Dashboard from './components/Dashboard';
import QueryChat from './components/QueryChat';
import Reports from './components/Reports';

function App() {
  const { currentScreen } = useAppContext();

  const requiresNav = ['screen-dashboard', 'screen-nlq', 'screen-reports'].includes(currentScreen);

  return (
    <>
      <Toaster position="top-right" />
      {requiresNav && <TopNavigation />}
      
      <main id="app-container">
        {currentScreen === 'screen-login' && <LandingPage />}
        {currentScreen?.startsWith('screen-onboard') && <UploadOnboarding />}
        {currentScreen === 'screen-dashboard' && <Dashboard />}
        {currentScreen === 'screen-nlq' && <QueryChat />}
        {currentScreen === 'screen-reports' && <Reports />}
      </main>
    </>
  );
}

export default App;
