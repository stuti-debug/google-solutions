import React, { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { getUsageStats, getSessionHistory } from '../utils/usageTracker';
import { getShareLog } from '../utils/shareFormatter';
import toast from 'react-hot-toast';

const formatDate = (value) => {
  if (!value) return 'Not available';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTimeAgo = (isoString) => {
  try {
    const date = new Date(isoString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
};

const Profile = () => {
  const { user, loading, navigate, logout, sessionData, loadSession } = useAppContext();
  
  // Local state for interactive preferences & stats
  const [stats, setStats] = useState({ queries: 0, reports: 0, shares: 0, uploads: 0, exports: 0 });
  const [history, setHistory] = useState([]);
  const [shareLog, setShareLog] = useState([]);
  
  const [voiceLang, setVoiceLang] = useState(() => localStorage.getItem('crisisgrid_voice_lang') || 'hi-IN');
  const [theme, setTheme] = useState(() => localStorage.getItem('crisisgrid_theme') || 'light');
  const [soundsEnabled, setSoundsEnabled] = useState(() => localStorage.getItem('crisisgrid_sounds_enabled') !== 'false');

  useEffect(() => {
    if (!loading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [loading, navigate, user]);

  // Load interactive state on mount and on focus
  useEffect(() => {
    if (!user) return;

    const reloadData = () => {
      setStats(getUsageStats());
      setHistory(getSessionHistory());
      setShareLog(getShareLog().slice(0, 10)); // Show last 10 shares
    };

    reloadData();

    window.addEventListener('focus', reloadData);
    return () => {
      window.removeEventListener('focus', reloadData);
    };
  }, [user]);

  if (!user) {
    return null;
  }

  const initials = (user.displayName || user.email || 'CR')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const currentSessionId = sessionData || localStorage.getItem('crisisgrid_session');

  // Preference Handlers
  const handleVoiceLangChange = (e) => {
    const val = e.target.value;
    setVoiceLang(val);
    localStorage.setItem('crisisgrid_voice_lang', val);
    toast.success(`Speech recognition set to ${val === 'hi-IN' ? 'Hindi (Hinglish)' : 'English (India)'}`);
  };

  const handleThemeChange = (e) => {
    const val = e.target.value;
    setTheme(val);
    document.documentElement.setAttribute('data-theme', val);
    localStorage.setItem('crisisgrid_theme', val);
    toast.success(`Theme updated to ${val}`);
  };

  const handleSoundsToggle = (e) => {
    const val = e.target.value === 'true';
    setSoundsEnabled(val);
    localStorage.setItem('crisisgrid_sounds_enabled', String(val));
    toast.success(`Alert sounds ${val ? 'enabled' : 'disabled'}`);
  };

  const handleLoadSession = async (sid) => {
    if (sid === currentSessionId) {
      toast.error('This session is already active.');
      return;
    }
    const loadToast = toast.loading('Loading selected session data...');
    try {
      await loadSession(sid);
      toast.dismiss(loadToast);
    } catch (err) {
      toast.dismiss(loadToast);
      toast.error('Failed to load session.');
    }
  };

  const clearShares = () => {
    localStorage.removeItem('crisisgrid_share_log');
    setShareLog([]);
    toast.success('Share log cleared.');
  };

  return (
    <section id="screen-profile" className="screen active with-nav header-offset fade-in">
      <div className="profile-shell">
        <header className="page-header profile-page-header">
          <div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Command Profile</h2>
            <p className="text-muted">Manage your crisis session, settings, and view workspace analytics.</p>
          </div>
        </header>

        <div className="profile-grid">
          {/* Hero Section */}
          <section className="profile-hero">
            <div className="profile-identity">
              {user.photoURL ? (
                <img src={user.photoURL} alt={`${user.displayName || 'User'} avatar`} className="profile-avatar-large" />
              ) : (
                <div className="profile-avatar-fallback">{initials}</div>
              )}
              <div className="profile-copy">
                <h1>{user.displayName || 'CrisisGrid User'}</h1>
                <p>{user.email || 'No email available'}</p>
              </div>
            </div>

            <div className="profile-actions">
              <button className="btn primary animate-pulse" onClick={() => navigate('screen-dashboard')}>
                <i className="ph ph-chart-bar"></i>
                Dashboard
              </button>
              <button className="btn secondary" style={{ borderColor: 'rgba(255, 80, 80, 0.4)', color: '#ff6b6b' }} onClick={logout}>
                <i className="ph ph-sign-out"></i>
                Sign Out
              </button>
            </div>
          </section>

          {/* Two-Column Details and Actions */}
          <div className="profile-grid-two-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
            
            {/* Left Side: Account, Preferences */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Account Details Card */}
              <section className="profile-card">
                <div className="profile-card-header">
                  <h3>Account Credentials</h3>
                </div>
                <div className="profile-detail-list">
                  <div className="profile-detail-row">
                    <span>Name</span>
                    <strong>{user.displayName || 'Not available'}</strong>
                  </div>
                  <div className="profile-detail-row">
                    <span>Email</span>
                    <strong>{user.email || 'Not available'}</strong>
                  </div>
                  <div className="profile-detail-row">
                    <span>Email verified</span>
                    <strong>{user.emailVerified ? 'Yes' : 'No'}</strong>
                  </div>
                  <div className="profile-detail-row">
                    <span>Created</span>
                    <strong>{formatDate(user.metadata?.creationTime)}</strong>
                  </div>
                  <div className="profile-detail-row">
                    <span>Last Sign-In</span>
                    <strong>{formatDate(user.metadata?.lastSignInTime)}</strong>
                  </div>
                </div>
              </section>

              {/* Quick Preferences Card */}
              <section className="profile-card">
                <div className="profile-card-header">
                  <h3>Quick Preferences</h3>
                </div>
                <div className="preference-list">
                  
                  {/* Voice Lang Preference */}
                  <div className="preference-row">
                    <div className="preference-info">
                      <span className="preference-label">Voice-to-Text Language</span>
                      <span className="preference-desc">Default language locale for speech recognition input</span>
                    </div>
                    <div className="preference-control">
                      <select value={voiceLang} onChange={handleVoiceLangChange}>
                        <option value="hi-IN">हिन्दी / Hinglish (hi-IN)</option>
                        <option value="en-IN">English (India) (en-IN)</option>
                        <option value="en-US">English (United States) (en-US)</option>
                      </select>
                    </div>
                  </div>

                  {/* Theme Preference */}
                  <div className="preference-row">
                    <div className="preference-info">
                      <span className="preference-label">Workspace Theme</span>
                      <span className="preference-desc">Customize UI color mode for optimal visibility</span>
                    </div>
                    <div className="preference-control">
                      <select value={theme} onChange={handleThemeChange}>
                        <option value="light">☀️ Light Theme</option>
                        <option value="dark">🌙 Dark Theme</option>
                      </select>
                    </div>
                  </div>

                  {/* Sounds Toggle */}
                  <div className="preference-row">
                    <div className="preference-info">
                      <span className="preference-label">Alert Sound Notifications</span>
                      <span className="preference-desc">Play audio cue when a new critical shortage is detected</span>
                    </div>
                    <div className="preference-control">
                      <select value={String(soundsEnabled)} onChange={handleSoundsToggle}>
                        <option value="true">🔊 Enabled</option>
                        <option value="false">🔇 Muted</option>
                      </select>
                    </div>
                  </div>

                </div>
              </section>

            </div>

            {/* Right Side: Session History, Share Logs, Analytics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* Session History Card */}
              <section className="profile-card">
                <div className="profile-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Session History</h3>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>Last 20 uploads</span>
                </div>
                <div className="session-history-list">
                  {history.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>No historical upload sessions found.</p>
                  ) : (
                    history.map((session) => {
                      const isActive = session.id === currentSessionId;
                      return (
                        <div key={session.id} className={`session-history-item ${isActive ? 'active-session' : ''}`}>
                          <div className="session-history-left">
                            <i className="ph ph-database" style={{ fontSize: '1.4rem', color: isActive ? 'var(--clr-primary)' : 'var(--clr-text-muted)' }}></i>
                            <div className="session-history-details">
                              <span className="session-history-title">{session.label || `Upload Session`}</span>
                              <div className="session-history-meta">
                                <span>{session.recordCount || 0} records</span>
                                <span>•</span>
                                <span>{new Date(session.timestamp).toLocaleDateString()}</span>
                                {session.fileTypes && session.fileTypes.map(ft => (
                                  <span key={ft} className="session-type-pill">{ft}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="session-history-right">
                            {isActive ? (
                              <span className="badge" style={{ backgroundColor: 'rgba(10, 108, 116, 0.1)', color: 'var(--clr-primary)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>Active</span>
                            ) : (
                              <button className="btn secondary btn-sm" onClick={() => handleLoadSession(session.id)}>
                                Load
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Share Activity Log Card */}
              <section className="profile-card">
                <div className="profile-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Recent Share Logs</h3>
                  {shareLog.length > 0 && (
                    <button className="btn minimal" style={{ color: '#ff6b6b', fontSize: '0.8rem' }} onClick={clearShares}>
                      <i className="ph ph-trash"></i> Clear Logs
                    </button>
                  )}
                </div>
                <div className="share-log-list">
                  {shareLog.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>No recent share actions found.</p>
                  ) : (
                    shareLog.map((log, index) => {
                      let icon = 'ph-copy';
                      let badgeClass = 'badge-copy';
                      if (log.channel === 'whatsapp') {
                        icon = 'ph-whatsapp-logo';
                        badgeClass = 'badge-whatsapp';
                      } else if (log.channel === 'sms') {
                        icon = 'ph-chat-circle-dots';
                        badgeClass = 'badge-sms';
                      }
                      return (
                        <div key={index} className="share-log-item">
                          <div className="share-log-left">
                            <div className={`share-channel-badge ${badgeClass}`}>
                              <i className={`ph-fill ${icon}`}></i>
                            </div>
                            <div className="share-log-details">
                              <span className="share-log-preview">{log.preview}</span>
                              <span className="share-log-time">{formatTimeAgo(log.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Usage Stats Card */}
              <section className="profile-card">
                <div className="profile-card-header">
                  <h3>Workspace Analytics</h3>
                </div>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-card-value">{stats.queries}</div>
                    <div className="stat-card-label">Queries Asked</div>
                  </div>
                  <div className="stat-card-value-wrapper stat-card">
                    <div className="stat-card-value">{stats.reports}</div>
                    <div className="stat-card-label">Reports Built</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-value">{stats.shares}</div>
                    <div className="stat-card-label">Shares Sent</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-value">{stats.uploads}</div>
                    <div className="stat-card-label">Data Uploads</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-value">{stats.exports}</div>
                    <div className="stat-card-label">PDF Exports</div>
                  </div>
                </div>
              </section>

            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default Profile;
