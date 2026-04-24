import React, { useEffect } from 'react';
import { useAppContext } from '../AppContext';

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

const Profile = () => {
  const { user, loading, navigate, logout, sessionData, cleanedData } = useAppContext();

  useEffect(() => {
    if (!loading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [loading, navigate, user]);

  if (!user) {
    return null;
  }

  const initials = (user.displayName || user.email || 'CR')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sessionId = sessionData || localStorage.getItem('crisisgrid_session') || 'No active data session';
  const fileCount = Object.values(cleanedData?.cleanedDocuments || {}).length || cleanedData?.recordCount || 0;

  return (
    <section id="screen-profile" className="screen active with-nav header-offset fade-in">
      <div className="profile-shell">
        <header className="page-header profile-page-header">
          <div>
            <h2>Profile</h2>
            <p className="text-muted">Your CrisisGrid workspace and sign-in details.</p>
          </div>
          <button className="btn secondary" onClick={() => navigate('screen-dashboard')}>
            <i className="ph ph-squares-four"></i>
            Dashboard
          </button>
        </header>

        <div className="profile-grid">
          <section className="profile-hero">
            <div className="profile-identity">
              {user.photoURL ? (
                <img src={user.photoURL} alt={`${user.displayName || 'User'} avatar`} className="profile-avatar-large" />
              ) : (
                <div className="profile-avatar-fallback">{initials}</div>
              )}
              <div className="profile-copy">
                <span className="profile-kicker">Google account</span>
                <h1>{user.displayName || 'CrisisGrid User'}</h1>
                <p>{user.email || 'No email available'}</p>
              </div>
            </div>

            <div className="profile-actions">
              <button className="btn primary" onClick={() => navigate('screen-dashboard')}>
                <i className="ph ph-chart-bar"></i>
                Open dashboard
              </button>
              <button className="btn secondary" onClick={logout}>
                <i className="ph ph-sign-out"></i>
                Log out
              </button>
            </div>
          </section>

          <section className="profile-card">
            <div className="profile-card-header">
              <h3>Account</h3>
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
                <span>Last sign-in</span>
                <strong>{formatDate(user.metadata?.lastSignInTime)}</strong>
              </div>
            </div>
          </section>

          <section className="profile-card">
            <div className="profile-card-header">
              <h3>Workspace</h3>
            </div>
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-label">Current session</span>
                <strong className="profile-stat-value">{sessionId}</strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Records loaded</span>
                <strong className="profile-stat-value">{fileCount}</strong>
              </div>
            </div>
            <div className="profile-inline-actions">
              <button className="btn minimal" onClick={() => navigate('screen-nlq')}>
                <i className="ph ph-sparkle"></i>
                Ask data questions
              </button>
              <button className="btn minimal" onClick={() => navigate('screen-reports')}>
                <i className="ph ph-file-text"></i>
                Open reports
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
};

export default Profile;
