import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useAppContext } from '../AppContext';
import { apiFetch } from '../utils/api';

const containerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '16px'
};

// Center on Chennai
const center = {
  lat: 13.03,
  lng: 80.20
};

const lightMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] }
];

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] }
];

const MapPinningModal = ({ isOpen, onClose, locationName, initialLat, initialLng, onSave, isDarkMode }) => {
  const [pin, setPin] = useState({ lat: initialLat || 13.0827, lng: initialLng || 80.2707 });

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', 
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content fade-in" style={{
        background: 'var(--clr-surface)', padding: '1.5rem', borderRadius: '24px', 
        width: '90%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--clr-text)', fontSize: '1.4rem' }}>Pin Location: {locationName}</h3>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--clr-text-muted)', fontSize: '0.9rem' }}>
              We couldn't automatically locate this area. Click on the map to pin it manually.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--clr-background)', border: '1px solid var(--glass-border)', color: 'var(--clr-text)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ph ph-x" style={{ fontSize: '1.2rem' }}></i>
          </button>
        </div>
        
        <div style={{ flex: 1, borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--glass-border)', position: 'relative' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={pin}
            zoom={12}
            onClick={(e) => setPin({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
            options={{
              styles: isDarkMode ? darkMapStyle : lightMapStyle,
              disableDefaultUI: true,
              zoomControl: true,
            }}
          >
            <Marker position={pin} animation={window.google.maps.Animation.DROP} />
          </GoogleMap>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '1rem' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(pin.lat, pin.lng)}>
            <i className="ph-fill ph-map-pin"></i> Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
};

const MapView = () => {
  const { API_BASE_URL, sessionData, mapFocusPriorityId, setMapFocusPriorityId } = useAppContext();
  const [priorities, setPriorities] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [activeMarker, setActiveMarker] = useState(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalLocation, setPinModalLocation] = useState(null);

  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const fetchPriorities = async () => {
    if (!sessionId) return;
    setLoadingData(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/priority/${sessionId}`);
      const data = await response.json();
      if (data.status === 'success') {
        setPriorities(data.priorities || []);
      }
    } catch (err) {
      console.error('Failed to fetch map data', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleOpenPinModal = (e, item) => {
    e.stopPropagation();
    setPinModalLocation(item);
    setPinModalOpen(true);
  };

  const handleSavePin = async (lat, lng) => {
    if (!sessionId || !pinModalLocation) return;
    try {
      const response = await apiFetch(`${API_BASE_URL}/priority/${sessionId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: pinModalLocation.location,
          lat,
          lng
        })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setPinModalOpen(false);
        setPinModalLocation(null);
        fetchPriorities();
      } else {
        alert("Failed to save location override: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error saving location override");
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchPriorities();
    }
  }, [sessionId]);

  useEffect(() => {
    if (mapFocusPriorityId && priorities.length > 0) {
      const target = priorities.find(p => p.id === mapFocusPriorityId);
      if (target) {
        setActiveMarker(target);
        setMapFocusPriorityId(null);
      }
    }
  }, [mapFocusPriorityId, priorities, setMapFocusPriorityId]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          setIsDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  const getMarkerIcon = (score) => {
    let color = '#22C55E'; // Green
    if (score >= 90) color = '#EF4444'; // Red
    else if (score >= 75) color = '#F97316'; // Orange
    else if (score >= 60) color = '#EAB308'; // Yellow

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 56" width="20" height="46">
      <defs>
        <linearGradient id="needle" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#71717a" />
          <stop offset="50%" stop-color="#d4d4d8" />
          <stop offset="100%" stop-color="#52525b" />
        </linearGradient>
        <radialGradient id="sphere" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4" />
          <stop offset="20%" stop-color="${color}" />
          <stop offset="100%" stop-color="${color}" />
        </radialGradient>
      </defs>
      <!-- Needle -->
      <path d="M11 12 h2 v38 l-1 6 l-1 -6 z" fill="url(#needle)" />
      <!-- Shadow under head -->
      <ellipse cx="12" cy="13" rx="12" ry="4" fill="#000000" opacity="0.2" />
      <!-- Glossy Head -->
      <circle cx="12" cy="12" r="12" fill="url(#sphere)" />
      <!-- Specular highlight -->
      <ellipse cx="7" cy="7" rx="3" ry="2" fill="#ffffff" opacity="0.8" transform="rotate(-40 7 7)" />
    </svg>`;

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new window.google.maps.Size(20, 46),
      anchor: new window.google.maps.Point(10, 46)
    };
  };

  const getUrgencyColor = (score) => {
    if (score >= 90) return '#EF4444';
    if (score >= 75) return '#F97316';
    if (score >= 60) return '#EAB308';
    return '#22C55E';
  };

  if (!isLoaded) {
    return (
      <section id="screen-map" className="screen active with-nav fade-in dashboard-premium">
        <div className="dashboard-wrapper header-offset flex-center" style={{ minHeight: '80vh' }}>
           <div className="spinner"></div>
        </div>
      </section>
    );
  }

  return (
    <section id="screen-map" className="screen active with-nav fade-in dashboard-premium">
      <div className="dashboard-wrapper header-offset map-dashboard-wrapper">
        
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--clr-text)' }}>Geospatial Heatmap</h2>
            <p style={{ color: 'var(--clr-text-muted)', marginTop: '0.2rem', fontSize: '0.95rem' }}>Live tracking of priority crisis zones and resource logistics.</p>
          </div>
          <button className="btn primary" onClick={fetchPriorities} disabled={loadingData} style={{ boxShadow: '0 8px 16px rgba(13, 115, 119, 0.2)' }}>
             <i className={`ph-fill ph-arrows-clockwise ${loadingData ? 'spin' : ''}`}></i> Sync Map Data
          </button>
        </div>

        <div className="map-view-main-layout">
          
          {/* Left Sidebar: Zone List */}
          <div className="map-sidebar">
            {loadingData && priorities.length === 0 ? (
              <>
                <div className="insight-card-skeleton" style={{ height: '110px', borderRadius: '16px', width: '100%', flexShrink: 0 }}></div>
                <div className="insight-card-skeleton delay-1" style={{ height: '110px', borderRadius: '16px', width: '100%', flexShrink: 0 }}></div>
                <div className="insight-card-skeleton delay-2" style={{ height: '110px', borderRadius: '16px', width: '100%', flexShrink: 0 }}></div>
              </>
            ) : priorities.map((item) => (
              <div 
                key={item.id}
                onClick={() => setActiveMarker(item)}
                onMouseEnter={() => setHoveredMarkerId(item.id)}
                onMouseLeave={() => setHoveredMarkerId(null)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  background: 'var(--clr-surface)',
                  border: activeMarker?.id === item.id ? `2px solid ${getUrgencyColor(item.score)}` : '1px solid var(--glass-border)',
                  borderRadius: '16px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: activeMarker?.id === item.id ? `0 8px 24px ${getUrgencyColor(item.score)}33` : (hoveredMarkerId === item.id ? '0 4px 12px rgba(0,0,0,0.1)' : 'var(--shadow-sm)'),
                  transform: activeMarker?.id === item.id || hoveredMarkerId === item.id ? 'translateY(-2px)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--clr-text)' }}>{item.location}</h4>
                  {item.needs_geocoding ? (
                    <button 
                      onClick={(e) => handleOpenPinModal(e, item)}
                      style={{
                        background: '#EF444422',
                        color: '#EF4444',
                        border: '1px solid #EF444455',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '20px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <i className="ph-fill ph-map-pin"></i> Needs Pin
                    </button>
                  ) : (
                    <span style={{ 
                      background: `${getUrgencyColor(item.score)}15`, 
                      color: getUrgencyColor(item.score),
                      padding: '0.15rem 0.5rem',
                      borderRadius: '20px',
                      fontSize: '0.7rem',
                      fontWeight: 700
                    }}>
                      {item.score}/100
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--clr-text-muted)', marginBottom: '0.4rem' }}>
                  <i className="ph-fill ph-users text-primary"></i> <b>{item.affected}</b> civilians affected
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--clr-text-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.reasoning}
                </p>
              </div>
            ))}
          </div>

          {/* Right Area: Map */}
          <div className="map-canvas-container">
            <div style={{ borderRadius: '20px', overflow: 'hidden', height: '100%', width: '100%' }}>
              <GoogleMap
                mapContainerStyle={containerStyle}
                center={activeMarker ? { lat: activeMarker.lat, lng: activeMarker.lng } : center}
                zoom={activeMarker ? 13 : 11}
                options={{
                  styles: isDarkMode ? darkMapStyle : lightMapStyle,
                  disableDefaultUI: true,
                  zoomControl: true,
                }}
              >
                {priorities.map((item) => (
                  <Marker
                    key={item.id}
                    position={{ lat: item.lat, lng: item.lng }}
                    icon={getMarkerIcon(item.score)}
                    onClick={() => setActiveMarker(item)}
                    animation={activeMarker?.id === item.id ? window.google.maps.Animation.BOUNCE : (hoveredMarkerId === item.id ? window.google.maps.Animation.BOUNCE : null)}
                  />
                ))}


              </GoogleMap>
            </div>

            {/* Custom Premium Info Card Overlay */}
            {activeMarker && (
              <div className="fade-in map-info-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-text)' }}>{activeMarker.location}</h4>
                  <button 
                    onClick={() => setActiveMarker(null)} 
                    style={{ 
                      background: 'rgba(0,0,0,0.05)', 
                      border: 'none', 
                      color: 'var(--clr-text)', 
                      cursor: 'pointer', 
                      padding: '0.3rem', 
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                  >
                    <i className="ph ph-x" style={{ fontSize: '1.05rem', fontWeight: 'bold' }}></i>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    background: `${getUrgencyColor(activeMarker.score)}15`, 
                    color: getUrgencyColor(activeMarker.score),
                    padding: '0.2rem 0.6rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}>
                    {activeMarker.urgency_level} Priority
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)' }}>
                    Score: <b>{activeMarker.score}/100</b>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>
                  <i className="ph-fill ph-users text-primary"></i> <b>{activeMarker.affected}</b> affected
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0.2rem 0' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--clr-text-muted)', lineHeight: 1.5 }}>
                  {activeMarker.reasoning}
                </p>
                {activeMarker.needs_geocoding && (
                  <div style={{ marginTop: '1rem' }}>
                    <button className="btn primary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }} onClick={(e) => handleOpenPinModal(e, activeMarker)}>
                      <i className="ph-fill ph-map-pin"></i> Set Exact Location
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Map Legend overlay */}
            <div className="map-legend-overlay">
               <h5 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--clr-text)' }}>Urgency Legend</h5>
               <div className="map-legend-items">
                 <div className="map-legend-item"><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)' }}></span> Critical (90+)</div>
                 <div className="map-legend-item"><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F97316', boxShadow: '0 0 0 3px rgba(249, 115, 22, 0.2)' }}></span> High (75-89)</div>
                 <div className="map-legend-item"><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EAB308', boxShadow: '0 0 0 3px rgba(234, 179, 8, 0.2)' }}></span> Medium (60-74)</div>
                 <div className="map-legend-item"><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.2)' }}></span> Low (&lt;60)</div>
               </div>
            </div>
          </div>

        </div>
      </div>
      
      <MapPinningModal 
        isOpen={pinModalOpen} 
        onClose={() => setPinModalOpen(false)} 
        locationName={pinModalLocation?.location}
        initialLat={pinModalLocation?.lat}
        initialLng={pinModalLocation?.lng}
        onSave={handleSavePin}
        isDarkMode={isDarkMode}
      />
    </section>
  );
};

export default MapView;
