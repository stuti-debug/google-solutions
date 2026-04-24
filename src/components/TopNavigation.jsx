import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../AppContext';

const TopNavigation = () => {
  const { logout, navigate, currentScreen, user } = useAppContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const displayName = user?.displayName || 'Relief Team';
  const userEmail = user?.email || 'Signed in with Google';
  const avatarSrc = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D7377&color=fff&rounded=true`;

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
        <button
          className={`btn minimal ${currentScreen === 'screen-profile' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-profile')}
        >
          Profile
        </button>
      </div>
      <div className="nav-user-actions" style={{ marginLeft: 'auto' }}>
        <i className="ph ph-bell notification-bell text-muted"></i>
        <div className="nav-user-profile" ref={menuRef}>
          <div className="user-details">
            <span className="user-ngo">{displayName}</span>
            <span className="user-role">{userEmail}</span>
          </div>
          <button
            type="button"
            className={`avatar-trigger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Open account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <img
              src={avatarSrc}
              alt={`${displayName} avatar`}
              className="user-avatar"
            />
          </button>

          {menuOpen && (
            <div className="profile-menu" role="menu" aria-label="Profile menu">
              <div className="profile-menu-header">
                <span className="profile-menu-name">{displayName}</span>
                <span className="profile-menu-email">{userEmail}</span>
              </div>
              <button
                type="button"
                className="profile-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('screen-profile');
                }}
                role="menuitem"
              >
                <i className="ph ph-user-circle" aria-hidden="true"></i>
                Profile
              </button>
              <button
                type="button"
                className="profile-menu-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                role="menuitem"
              >
                <i className="ph ph-sign-out" aria-hidden="true"></i>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopNavigation;
