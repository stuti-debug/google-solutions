import React from 'react';
import { useAppContext } from '../AppContext';

const TopNavigation = () => {
  const { logout, navigate, currentScreen } = useAppContext();

  return (
    <nav id="main-nav">
      <div className="nav-brand" onClick={() => navigate('screen-dashboard')} style={{ cursor: 'pointer' }}>
        <i className="ph-fill ph-grid-four brand-icon"></i>
        <span>CrisisGrid</span>
      </div>
      <div className="nav-links" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginLeft: '2rem' }}>
        <button 
          className={`btn minimal ${currentScreen === 'screen-dashboard' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={`btn minimal ${currentScreen === 'screen-nlq' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-nlq')}
        >
          AI Query
        </button>
        <button 
          className={`btn minimal ${currentScreen === 'screen-reports' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-reports')}
        >
          Reports
        </button>
      </div>
      <div className="nav-user-actions" style={{ marginLeft: 'auto' }}>
        <i className="ph ph-bell notification-bell text-muted"></i>
        <div className="nav-user-profile">
          <div className="user-details">
            <span className="user-ngo">Global Relief Org</span>
            <span className="user-role">Administrator</span>
          </div>
          <img 
            src="https://ui-avatars.com/api/?name=GRO&background=0D7377&color=fff&rounded=true" 
            alt="User Avatar" 
            className="user-avatar" 
            title="Click to log out"
            onClick={logout}
          />
        </div>
      </div>
    </nav>
  );
};

export default TopNavigation;
