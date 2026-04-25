import React from 'react';
import { useAppContext } from '../AppContext';

const LandingPage = () => {
  const { loading, signInWithGoogle } = useAppContext();

  return (
    <section id="screen-login" className="screen active fade-in flex-center">
      <div className="landing-container">
        <div className="landing-content">
          <div className="brand-badge">
            <i className="ph-fill ph-grid-four"></i> CrisisGrid
          </div>
          <h1 className="hero-headline">Turn your messy NGO data into actionable insights in seconds.</h1>
          <p className="hero-subtext">CrisisGrid helps disaster relief NGOs clean, understand, and act on their data — no technical skills needed.</p>
          
          <div className="auth-actions">
            <button className="btn btn-google full-width" onClick={signInWithGoogle} disabled={loading}>
              <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {loading ? 'Checking session...' : 'Sign in with Google'}
            </button>
            <p className="auth-note">Or use SSO via <a href="#">contacting admin</a></p>
          </div>
        </div>

        <div className="landing-visual">
          <div className="clarity-graphic">
            <div className="messy-side">
              <i className="ph ph-file-csv" style={{ transform: 'rotate(-15deg)', top: '10%', left: '10%' }}></i>
              <i className="ph ph-file-xls" style={{ transform: 'rotate(25deg)', bottom: '15%', right: '10%' }}></i>
              <i className="ph ph-table" style={{ transform: 'rotate(5deg)', top: '30%', right: '20%' }}></i>
              <span className="bad-data">NULL</span>
              <span className="bad-data">Duplicate</span>
            </div>
            
            <div className="transformation-arrow">
              <i className="ph ph-arrow-right"></i>
            </div>
            
            <div className="clean-side">
              <div className="clean-box">
                <i className="ph-fill ph-chart-bar"></i>
                <div className="bar-mock w-full"></div>
                <div className="bar-mock w-half"></div>
                <div className="bar-mock w-third"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="landing-footer">
        <p><strong>CrisisGrid</strong> — Where every crisis meets clarity.</p>
      </div>
    </section>
  );
};

export default LandingPage;
