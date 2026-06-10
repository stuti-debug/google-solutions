import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import ShareButton from './ShareButton';
import { formatPriorityZone } from '../utils/shareFormatter';

const PriorityScores = () => {
  const { API_BASE_URL, sessionData, navigate } = useAppContext();
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  const fetchPriorities = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/priority/${sessionId}`);
      const data = await response.json();
      if (data.status === 'success') {
        setPriorities(data.priorities || []);
      } else {
        setError(data.message || 'Failed to fetch priorities.');
      }
    } catch (err) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchPriorities();
    }
  }, [sessionId]);

  if (!sessionId) return null;

  const getUrgencyColor = (score) => {
    if (score >= 90) return '#EF4444'; // Red
    if (score >= 75) return '#F97316'; // Orange
    if (score >= 60) return '#EAB308'; // Yellow
    return '#22C55E'; // Green
  };

  const handleCardClick = (id) => {
    try {
      if (navigate) {
        navigate('screen-map');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="priority-scores-container">
      <div className="flex justify-between items-center mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="ph-fill ph-target text-danger"></i> AI Priority Hotspots
        </h3>
        <button 
          className="btn minimal primary-light" 
          onClick={fetchPriorities}
          disabled={loading}
          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
        >
          {loading ? <i className="ph ph-spinner ph-spin"></i> : <i className="ph ph-arrows-clockwise"></i>} Refresh
        </button>
      </div>

      {error && (
        <div className="warning-banner" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <i className="ph-fill ph-warning-circle"></i> {error}
        </div>
      )}

      {loading && priorities.length === 0 ? (
        <div className="priority-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="insight-card-skeleton" style={{ height: '110px', borderRadius: '12px' }}></div>
          <div className="insight-card-skeleton delay-1" style={{ height: '110px', borderRadius: '12px' }}></div>
          <div className="insight-card-skeleton delay-2" style={{ height: '110px', borderRadius: '12px' }}></div>
        </div>
      ) : priorities.length > 0 ? (
        <div className="priority-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {priorities.map((item) => (
            <div 
              key={item.id} 
              className="priority-card" 
              onClick={() => handleCardClick(item.id)}
              style={{
                background: 'var(--clr-surface)',
                border: '1px solid var(--glass-border)',
                borderRadius: '12px',
                padding: '1.2rem',
                boxShadow: 'var(--shadow-sm)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                    <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--clr-text)' }}>{item.location}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <i className="ph-fill ph-users text-primary"></i> <b>{item.affected}</b> affected
                    </span>
                 </div>
                 
                 {/* Circular Progress Gauge */}
                 <div style={{ position: 'relative', width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <svg width="46" height="46" viewBox="0 0 46 46" style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}>
                     <circle
                       cx="23"
                       cy="23"
                       r="18"
                       fill="transparent"
                       stroke="var(--clr-border)"
                       strokeWidth="4"
                       style={{ opacity: 0.2 }}
                     />
                     <circle
                       cx="23"
                       cy="23"
                       r="18"
                       fill="transparent"
                       stroke={getUrgencyColor(item.score)}
                       strokeWidth="4"
                       strokeDasharray={113.1}
                       strokeDashoffset={113.1 - (item.score / 100) * 113.1}
                       strokeLinecap="round"
                       style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                     />
                   </svg>
                   <div style={{ 
                     fontSize: '0.85rem', 
                     fontWeight: 800, 
                     color: getUrgencyColor(item.score),
                     lineHeight: 1
                   }}>
                     {item.score}
                   </div>
                 </div>
              </div>
              
              <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0' }} />

              {/* Reasoning */}
              <div className="priority-reasoning-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', lineHeight: 1.4 }}>
                  <strong>{item.urgency_level}:</strong> {item.reasoning}
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  <ShareButton variant="inline" getText={() => formatPriorityZone(item)} />
                </div>
              </div>

            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default PriorityScores;
