import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../AppContext';
import { apiFetch } from '../utils/api';
import ShareButton from './ShareButton';
import { formatAlert } from '../utils/shareFormatter';

const TopNavigation = () => {
  const { logout, navigate, currentScreen, user, sessionData, API_BASE_URL } = useAppContext();

  const displayName = user?.displayName || 'Relief Team';
  const userEmail = user?.email || 'Signed in with Google';
  const avatarSrc = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D7377&color=fff&rounded=true`;

  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [bellRef]);

  const [notifications, setNotifications] = useState([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);

  useEffect(() => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (!sessionId || API_BASE_URL == null || !user) return;
    let cancelled = false;
    apiFetch(`${API_BASE_URL}/alerts/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && Array.isArray(data.alerts)) {
          setNotifications(data.alerts);
          setAlertsLoaded(true);
        }
      })
      .catch(err => {
        console.error('Failed to fetch alerts', err);
        if (!cancelled) setAlertsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [sessionData, API_BASE_URL, user]);

  const navLinks = [
    { screen: 'screen-dashboard', label: 'Dashboard', icon: 'ph-squares-four' },
    { screen: 'screen-map', label: 'Map View', icon: 'ph-map-trifold' },
    { screen: 'screen-logistics', label: 'AI Logistics', icon: 'ph-truck' },
    { screen: 'screen-reports', label: 'Reports', icon: 'ph-chart-bar' },
    { screen: 'screen-nlq', label: 'AI Query', icon: 'ph-robot' },
    { screen: 'screen-profile', label: 'Profile', icon: 'ph-user-circle' },
  ];

  return (
    <nav id="main-nav" aria-label="Main Navigation" style={{ position: 'relative' }}>
      <div className="nav-brand" onClick={() => navigate('screen-dashboard')} style={{ cursor: 'pointer' }}>
        <i className="ph-fill ph-grid-four brand-icon" aria-hidden="true"></i>
        <span>CrisisGrid</span>
      </div>

      {/* Desktop nav links — hidden on mobile */}
      <div className="nav-links nav-links-desktop" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '2rem' }}>
        {navLinks.map(link => (
          <button
            key={link.screen}
            className={`btn minimal ${currentScreen === link.screen ? 'primary-light' : ''}`}
            onClick={() => navigate(link.screen)}
            aria-label={`Go to ${link.label}`}
            aria-current={currentScreen === link.screen ? 'page' : undefined}
          >
            {link.label}
          </button>
        ))}
      </div>

      <div className="nav-user-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

        {/* Hamburger button — mobile only */}
        <button
          className="hamburger-btn"
          onClick={() => setShowMobileMenu(prev => !prev)}
          aria-label={showMobileMenu ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={showMobileMenu}
          aria-controls="mobile-nav-menu"
        >
          <i className={`ph ${showMobileMenu ? 'ph-x' : 'ph-list'}`} aria-hidden="true"></i>
        </button>

        {/* Notifications bell */}
        <div className="notification-wrapper" ref={bellRef} style={{ position: 'relative' }}>
          <button
            className="notification-bell-btn"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={`Notifications${notifications.length > 0 ? ` (${notifications.length} unread)` : ''}`}
          >
            <i className="ph ph-bell notification-bell text-muted" style={{ position: 'relative', fontSize: '1.5rem' }}>
              {notifications.length > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', background: '#EF4444', borderRadius: '50%', border: '2px solid var(--glass-bg)' }}></span>
              )}
            </i>
          </button>

          {showNotifications && (
            <div className="notifications-dropdown" style={{
              position: 'absolute', top: '140%', right: '-10px', width: '300px', background: 'var(--clr-surface)',
              border: '1px solid var(--glass-border)', borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden'
            }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--clr-text)' }}>Alerts</h4>
                {notifications.length > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--clr-primary)', cursor: 'pointer', fontWeight: 500 }} onClick={() => setNotifications([])}>Mark all read</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '400px', overflowY: 'auto' }}>
                {notifications.length > 0 ? notifications.map(notif => {
                  const iconMap = {
                    urgent: { icon: 'ph-fill ph-warning-circle', color: '#EF4444', bg: 'rgba(239,68,68,0.05)' },
                    warning: { icon: 'ph-fill ph-warning', color: '#F59E0B', bg: 'rgba(245,158,11,0.05)' },
                    info: { icon: 'ph-fill ph-info', color: '#3B82F6', bg: 'rgba(59,130,246,0.05)' },
                    success: { icon: 'ph-fill ph-check-circle', color: '#10B981', bg: 'transparent' },
                  };
                  const s = iconMap[notif.type] || iconMap.info;
                  return (
                    <div key={notif.id} style={{ padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.03)', cursor: 'pointer', background: s.bg }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <i className={s.icon} style={{ marginTop: '3px', color: s.color, flexShrink: 0 }} aria-hidden="true"></i>
                        <div aria-live="polite">
                          <h5 style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: 'var(--clr-text)' }}>{notif.title}</h5>
                          <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8rem', color: 'var(--clr-text-muted)', lineHeight: 1.3 }}>{notif.message}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-muted)', opacity: 0.7 }}>{notif.time}</span>
                            <ShareButton getText={() => formatAlert(notif)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--clr-text-muted)', fontSize: '0.85rem' }} aria-live="polite">
                    <i className="ph ph-check-circle" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block', color: 'var(--clr-success)' }} aria-hidden="true"></i>
                    You're all caught up!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="nav-user-profile">
          <div className="user-details">
            <span className="user-ngo">{displayName}</span>
            <span className="user-role">{userEmail}</span>
          </div>
          <button
            type="button"
            className="avatar-trigger"
            onClick={() => navigate('screen-profile')}
            aria-label="Open profile page"
          >
            <img src={avatarSrc} alt={`${displayName} avatar`} className="user-avatar" />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {showMobileMenu && (
        <div
          id="mobile-nav-menu"
          role="menu"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'var(--clr-surface)', borderBottom: '1px solid var(--glass-border)',
            boxShadow: 'var(--shadow-lg)', zIndex: 200,
            padding: '0.5rem 1rem 1rem',
            display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}
        >
          {navLinks.map(link => (
            <button
              key={link.screen}
              className={`btn minimal ${currentScreen === link.screen ? 'primary-light' : ''}`}
              onClick={() => { navigate(link.screen); setShowMobileMenu(false); }}
              aria-label={`Go to ${link.label}`}
              aria-current={currentScreen === link.screen ? 'page' : undefined}
              role="menuitem"
              style={{ justifyContent: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem' }}
            >
              <i className={`ph ${link.icon}`} aria-hidden="true"></i>
              {link.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .hamburger-btn {
          display: none;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
          color: var(--clr-text);
          font-size: 1.5rem;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .user-details { display: none !important; }
        }
      `}</style>
    </nav>
  );
};

export default TopNavigation;
