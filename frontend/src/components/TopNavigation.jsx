import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../AppContext';
import ShareButton from './ShareButton';
import { formatAlert } from '../utils/shareFormatter';

const TopNavigation = () => {
  const { logout, navigate, currentScreen, user, sessionData, API_BASE_URL } = useAppContext();

  const displayName = user?.displayName || 'Relief Team';
  const userEmail = user?.email || 'Signed in with Google';
  const avatarSrc = user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0D7377&color=fff&rounded=true`;

  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [bellRef]);

  // Real notifications from backend
  const [notifications, setNotifications] = useState([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);

  useEffect(() => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (!sessionId || !API_BASE_URL) return;

    let cancelled = false;
    fetch(`${API_BASE_URL}/alerts/${sessionId}`)
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
  }, [sessionData, API_BASE_URL]);

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
          className={`btn minimal ${currentScreen === 'screen-map' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-map')}
        >
          Map View
        </button>
        <button 
          className={`btn minimal ${currentScreen === 'screen-logistics' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-logistics')}
        >
          AI Logistics
        </button>
        <button 
          className={`btn minimal ${currentScreen === 'screen-reports' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-reports')}
        >
          Reports
        </button>
        <button 
          className={`btn minimal ${currentScreen === 'screen-nlq' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-nlq')}
        >
          AI Query
        </button>
        <button
          className={`btn minimal ${currentScreen === 'screen-profile' ? 'primary-light' : ''}`}
          onClick={() => navigate('screen-profile')}
        >
          Profile
        </button>
      </div>
      <div className="nav-user-actions" style={{ marginLeft: 'auto' }}>
        <div className="notification-wrapper" ref={bellRef} style={{ position: 'relative' }}>
          <i 
            className="ph ph-bell notification-bell text-muted" 
            style={{ cursor: 'pointer', position: 'relative' }}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            {notifications.length > 0 && (
              <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', background: '#EF4444', borderRadius: '50%', border: '2px solid var(--glass-bg)' }}></span>
            )}
          </i>
          
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
                {notifications.length > 0 ? (
                  notifications.map(notif => {
                    const iconMap = {
                      urgent: { icon: 'ph-fill ph-warning-circle', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.05)' },
                      warning: { icon: 'ph-fill ph-warning', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.05)' },
                      info: { icon: 'ph-fill ph-info', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.05)' },
                      success: { icon: 'ph-fill ph-check-circle', color: '#10B981', bg: 'transparent' },
                    };
                    const style = iconMap[notif.type] || iconMap.info;
                    return (
                    <div key={notif.id} style={{ padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.03)', cursor: 'pointer', background: style.bg, transition: 'background 0.2s' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <i className={style.icon} style={{ marginTop: '3px', color: style.color, flexShrink: 0 }}></i>
                        <div>
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
                  })
                ) : (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--clr-text-muted)', fontSize: '0.85rem' }}>
                    <i className="ph ph-check-circle" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block', color: 'var(--clr-success)' }}></i>
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
            <img
              src={avatarSrc}
              alt={`${displayName} avatar`}
              className="user-avatar"
            />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default TopNavigation;
