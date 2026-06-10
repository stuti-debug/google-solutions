import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import ShareButton from './ShareButton';
import { formatDispatch } from '../utils/shareFormatter';
import toast from 'react-hot-toast';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const playSuccessSound = () => {
  try {
    const isSoundsEnabled = localStorage.getItem('crisisgrid_sounds_enabled') !== 'false';
    if (!isSoundsEnabled) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Dual note pleasant chime
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (err) {
    console.error('Audio cue error:', err);
  }
};

const Logistics = () => {
  const { API_BASE_URL, sessionData } = useAppContext();
  const [matches, setMatches] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  const fetchData = async (showToast = false) => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch AI Matches
      const matchRes = await fetch(`${API_BASE_URL}/match/${sessionId}`);
      const matchData = await matchRes.json();
      if (matchData.status === 'success') {
        setMatches(matchData.matches || []);
      } else {
        setError(matchData.message || 'Failed to fetch logistics matches.');
      }

      // Fetch Inventory items
      const invRes = await fetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200&file_type=inventory`);
      if (invRes.ok) {
        const invData = await invRes.json();
        setInventory(invData.rows || []);
      }
      
      if (showToast) {
        toast.success('Logistics data synchronized.');
      }
    } catch (err) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!sessionId) return;
    setRecalculating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/match/${sessionId}`);
      const data = await response.json();
      if (data.status === 'success') {
        setMatches(data.matches || []);
        
        // Refresh inventory in case quantities changed
        const invRes = await fetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200&file_type=inventory`);
        if (invRes.ok) {
          const invData = await invRes.json();
          setInventory(invData.rows || []);
        }

        playSuccessSound();
        toast.success('AI Match Plan recalculated.');
      } else {
        toast.error(data.message || 'Failed to recalculate match plan.');
      }
    } catch (err) {
      toast.error('Network error during recalculation.');
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchData();
    }
  }, [sessionId]);

  // Calculations for stats strip
  const totalAllocations = matches.length;
  const totalItemsAllocated = matches.reduce((sum, m) => sum + (Number(m.allocated) || 0), 0);
  const activeWarehouses = new Set(matches.map(m => m.source)).size;

  // Aggregate inventory by item category for the Pie Chart Breakdown
  const chartData = useMemo(() => {
    if (inventory.length === 0) {
      return [
        { name: 'Water', value: 450, color: '#0088FE' },
        { name: 'Food', value: 300, color: '#00C49F' },
        { name: 'Medical', value: 200, color: '#FFBB28' },
        { name: 'Blankets', value: 150, color: '#FF8042' },
      ];
    }

    const categoryCounts = {};
    inventory.forEach(item => {
      const name = item.item_name || item.Item || 'Item';
      // Normalize category (Water, Food, Medical, Shelter, Hygiene, General)
      let category = item.category || item.Category || 'General';
      
      // Map category name to cleaner standard categories if general
      if (category === 'General') {
        const n = name.toLowerCase();
        if (n.includes('water')) category = 'Water';
        else if (n.includes('food') || n.includes('rice') || n.includes('milk') || n.includes('biscuit')) category = 'Food';
        else if (n.includes('med') || n.includes('aid') || n.includes('health') || n.includes('kit')) category = 'Medical';
        else if (n.includes('blanket') || n.includes('tent') || n.includes('tarp')) category = 'Shelter';
        else if (n.includes('hygiene') || n.includes('soap') || n.includes('pad')) category = 'Hygiene';
      }

      const qty = Number(item.quantity || item.Quantity || 0);
      if (qty > 0) {
        categoryCounts[category] = (categoryCounts[category] || 0) + qty;
      }
    });

    const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ec4899', '#06b6d4'];
    return Object.keys(categoryCounts).map((cat, idx) => ({
      name: cat,
      value: categoryCounts[cat],
      color: colors[idx % colors.length]
    }));
  }, [inventory]);

  // Filter matches based on search query
  const filteredMatches = matches.filter(m => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (m.beneficiary || '').toLowerCase().includes(query) ||
      (m.need || '').toLowerCase().includes(query) ||
      (m.source || '').toLowerCase().includes(query)
    );
  });

  const getUrgencyColor = (urgency) => {
    const norm = String(urgency || '').toLowerCase();
    if (norm.includes('high') || norm.includes('crit')) return '#EF4444';
    if (norm.includes('med') || norm.includes('warn')) return '#F97316';
    return '#22C55E';
  };

  const getInventoryStatusBadge = (qty, unit) => {
    let color = '#22C55E'; // Healthy
    let label = 'Healthy';
    const num = Number(qty) || 0;
    
    // Scale status thresholds relative to units
    const unitLower = String(unit || '').toLowerCase();
    const isSmallUnit = unitLower.includes('box') || unitLower.includes('kit');
    
    const criticalThreshold = isSmallUnit ? 10 : 30;
    const lowThreshold = isSmallUnit ? 30 : 100;

    if (num <= criticalThreshold) {
      color = '#EF4444';
      label = 'Critical';
    } else if (num <= lowThreshold) {
      color = '#F59E0B';
      label = 'Low';
    }
    
    return (
      <span style={{ 
        fontSize: '0.65rem', 
        fontWeight: 700, 
        textTransform: 'uppercase', 
        letterSpacing: '0.05em', 
        padding: '0.15rem 0.4rem', 
        borderRadius: '6px', 
        background: `${color}15`, 
        color: color 
      }}>
        {label}
      </span>
    );
  };

  if (!sessionId) {
    return (
      <main id="screen-logistics" className="screen active with-nav fade-in dashboard-premium" aria-label="Logistics">
        <div className="dashboard-wrapper header-offset flex-center" style={{ minHeight: '80vh', flexDirection: 'column' }}>
           <i className="ph ph-lock" style={{ fontSize: '3rem', color: 'var(--clr-text-muted)', marginBottom: '1rem' }} aria-hidden="true"></i>
           <p style={{ color: 'var(--clr-text-muted)' }}>No active operational session. Please upload datasets to get started.</p>
        </div>
      </main>
    );
  }

  return (
    <main id="screen-logistics" className="screen active with-nav fade-in dashboard-premium" aria-label="Logistics">
      <div className="dashboard-wrapper header-offset" style={{ maxWidth: '1600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Workspace Header */}
        <header className="page-header" style={{ padding: '0 1rem' }}>
          <div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--clr-text)' }}>AI Supply Logistics</h2>
            <p style={{ color: 'var(--clr-text-muted)', marginTop: '0.2rem', fontSize: '0.95rem' }}>Automated resource dispatch, allocation matching, and stock health tracking.</p>
          </div>
          <div className="logistics-actions">
            <button className="btn secondary" onClick={() => fetchData(true)} disabled={loading} style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }} aria-label="Synchronize logistics data">
               <i className={`ph ph-arrows-clockwise ${loading && !recalculating ? 'spin' : ''}`} aria-hidden="true"></i> Sync Data
            </button>
            <button className="btn primary" onClick={handleRecalculate} disabled={recalculating} style={{ boxShadow: '0 8px 16px rgba(13, 115, 119, 0.2)' }} aria-label={matches.length === 0 ? "Generate Match Plan" : "Recalculate Match Plan"}>
               <i className={`ph ph-sparkle ${recalculating ? 'spin' : ''}`} aria-hidden="true"></i> {matches.length === 0 ? "Generate Match Plan" : "Recalculate Match"}
            </button>
          </div>
        </header>

        {/* Stats Strip */}
        <div className="logistics-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem', padding: '0 1rem' }}>
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', padding: '1.2rem', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Allocations</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.4rem', color: 'var(--clr-text)' }}>{totalAllocations} active routes</div>
          </div>
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', padding: '1.2rem', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplies Dispatched</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.4rem', color: 'var(--clr-primary)' }}>{totalItemsAllocated.toLocaleString()} units</div>
          </div>
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', padding: '1.2rem', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Supply Sources</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.4rem', color: 'var(--clr-accent)' }}>{activeWarehouses} warehouses</div>
          </div>
        </div>

        {/* Two-Column Workspace Layout */}
        <div className="logistics-main-layout">
          
          {/* Left Area: Matches List (2/3 width) */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
            
            {/* Search filter for matches */}
            <div className="logistics-search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '0.4rem 0.8rem', boxShadow: 'var(--shadow-sm)' }}>
              <i className="ph ph-magnifying-glass text-muted" style={{ fontSize: '1.1rem', marginRight: '0.5rem' }} aria-hidden="true"></i>
              <input 
                type="text" 
                placeholder="Filter dispatches by beneficiary camp, warehouse, or item need..."
                value={searchQuery}
                aria-label="Filter dispatches"
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.9rem', color: 'var(--clr-text)' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--clr-text-muted)', cursor: 'pointer', padding: '0.2rem' }} aria-label="Clear search">
                  <i className="ph ph-x-circle" aria-hidden="true"></i>
                </button>
              )}
            </div>

            {/* Match Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-live="polite">
              {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '1rem', borderRadius: '12px', borderLeft: '4px solid #EF4444' }} role="alert">
                  <i className="ph-fill ph-warning-circle" aria-hidden="true"></i> {error}
                </div>
              )}

              {loading && matches.length === 0 ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="insight-card-skeleton" style={{ height: '100px', borderRadius: '16px' }}></div>
                  <div className="insight-card-skeleton" style={{ height: '100px', borderRadius: '16px' }}></div>
                </div>
              ) : filteredMatches.length > 0 ? (
                filteredMatches.map((match) => (
                  <div key={match.id} className="logistics-match-card" style={{
                    background: 'var(--clr-surface)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '16px',
                    padding: '1.2rem',
                    boxShadow: 'var(--shadow-sm)',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                    flexShrink: 0
                  }}>
                    {/* Urgency indicator strip */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0, width: '5px',
                      background: getUrgencyColor(match.urgency)
                    }}></div>

                    <div className="logistics-match-card-content">
                      {/* Flow Diagram */}
                      <div className="logistics-flow-diagram">
                        
                        {/* Source */}
                        <div className="logistics-flow-node logistics-flow-source">
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--clr-text-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>Source</div>
                          <div className="logistics-node-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--clr-bg)', padding: '0.4rem 0.7rem', borderRadius: '8px', border: '1px dashed var(--clr-border)' }}>
                            <i className="ph-fill ph-warehouse text-primary" style={{ fontSize: '0.95rem' }}></i>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--clr-text)' }}>{match.source}</span>
                          </div>
                        </div>

                        {/* Quantity Line */}
                        <div className="logistics-flow-center">
                           <div className="logistics-quantity-pill" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-primary)', background: 'var(--clr-surface)', padding: '0.2rem 0.6rem', borderRadius: '12px', border: '1px solid var(--glass-border)', zIndex: 2 }}>
                             {match.allocated} {match.unit}
                           </div>
                           <div className="logistics-flow-line">
                             <i className="ph-fill ph-caret-right text-primary" style={{ position: 'absolute', right: '-4px', top: '-6px' }}></i>
                           </div>
                           <div className="logistics-need-label" style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', marginTop: '0.4rem', fontWeight: 500 }}>{match.need}</div>
                        </div>

                        {/* Destination */}
                        <div className="logistics-flow-node logistics-flow-dest">
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--clr-text-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>Destination</div>
                          <div className="logistics-node-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--clr-bg)', padding: '0.4rem 0.7rem', borderRadius: '8px', border: '1px solid var(--clr-border)' }}>
                            <i className="ph-fill ph-map-pin text-danger" style={{ fontSize: '0.95rem' }}></i>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--clr-text)' }}>{match.beneficiary}</span>
                          </div>
                        </div>

                      </div>

                      {/* Reasoning Box & Share */}
                      <div className="logistics-reasoning-container">
                        <div className="logistics-reasoning-card" style={{ flex: 1, background: 'var(--clr-bg)', padding: '0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--clr-text-muted)', borderLeft: '3px solid var(--clr-primary)', lineHeight: 1.45 }}>
                          <i className="ph-fill ph-sparkle text-primary" style={{ marginRight: '0.4rem' }}></i>
                          {match.reasoning}
                        </div>
                        <ShareButton variant="inline" getText={() => formatDispatch({
                          item: match.need,
                          quantity: match.allocated,
                          source: match.source,
                          destination: match.beneficiary,
                          urgency: match.urgency,
                        })} />
                      </div>
                    </div>

                  </div>
                ))
              ) : (
                <div style={{ 
                  background: 'var(--clr-surface)', border: '1px dashed var(--clr-border)', 
                  borderRadius: '16px', padding: '4rem 2rem', textAlign: 'center' 
                }}>
                   <div style={{ background: 'var(--clr-bg)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                      <i className="ph-fill ph-arrows-merge text-primary" style={{ fontSize: '2rem' }}></i>
                   </div>
                   <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--clr-text)' }}>No matching dispatches found</h4>
                   <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
                     {searchQuery ? "No matches fit your search criteria. Try modifying the filter keyword." : "Click 'Generate Match Plan' above to run the matching engine and calculate logistics dispatches."}
                   </p>
                </div>
              )}
            </div>

          </div>

          {/* Right Area: Warehouse Stocks (1/3 width) */}
          <aside className="logistics-stock-sidebar" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: '320px', height: 'fit-content' }}>
            
            {/* Stocks Container */}
            <section style={{ 
              background: 'var(--clr-surface)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: '24px', 
              padding: '1.2rem', 
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              height: 'fit-content'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="ph-fill ph-package text-accent"></i> Warehouse Stock Summary
                </h3>
                <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>Current inventory counts and status tracking across all depots.</p>
              </div>

              {/* Warehouse stock table list */}
              <div className="table-responsive">
                {inventory.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontWeight: 600 }}>
                        <th style={{ padding: '0.5rem 0.25rem' }}>Item</th>
                        <th style={{ padding: '0.5rem 0.25rem' }}>Depot</th>
                        <th style={{ padding: '0.5rem 0.25rem', textAlign: 'right' }}>Stock</th>
                        <th style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}>Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((item, idx) => {
                        const itemName = item.item_name || item.Item || 'Item';
                        const warehouse = item.warehouse || item.Warehouse || 'Main Warehouse';
                        const quantity = Number(item.quantity || item.Quantity || 0);
                        const unit = item.unit || item.Unit || 'pcs';
                        
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.02)', color: 'var(--clr-text)' }}>
                            <td style={{ padding: '0.8rem 0.25rem', fontWeight: 600 }}>{itemName}</td>
                            <td style={{ padding: '0.8rem 0.25rem', color: 'var(--clr-text-muted)', fontSize: '0.75rem' }}>{warehouse}</td>
                            <td style={{ padding: '0.8rem 0.25rem', textAlign: 'right', fontWeight: 700 }}>{quantity} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--clr-text-muted)' }}>{unit}</span></td>
                            <td style={{ padding: '0.8rem 0.25rem', textAlign: 'center' }}>{getInventoryStatusBadge(quantity, unit)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--clr-text-muted)' }}>
                    <i className="ph ph-package" style={{ fontSize: '2rem', opacity: 0.4, marginBottom: '0.5rem', display: 'block' }} aria-hidden="true"></i>
                    No warehouse inventory loaded.
                  </div>
                )}
              </div>

            </section>

            {/* Inventory Breakdown Chart Card */}
            <section style={{ 
              background: 'var(--clr-surface)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: '24px', 
              padding: '1.5rem', 
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
              height: 'fit-content'
            }}>
               <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                 <i className="ph-fill ph-chart-pie text-success"></i> Inventory Breakdown
               </h3>
               <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.75rem', marginTop: '0.1rem', margin: 0 }}>Distribution of current supply stocks by item category.</p>
               <div style={{ width: '100%', height: 220, marginTop: '0.5rem' }}>
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={chartData}
                       cx="50%"
                       cy="50%"
                       innerRadius={45}
                       outerRadius={65}
                       paddingAngle={4}
                       dataKey="value"
                       stroke="none"
                     >
                       {chartData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                     </Pie>
                     <Tooltip 
                       contentStyle={{ background: 'var(--clr-surface)', borderRadius: '12px', border: '1px solid var(--glass-border)', color: 'var(--clr-text)' }}
                       itemStyle={{ color: 'var(--clr-text)' }}
                     />
                     <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', color: 'var(--clr-text)' }} />
                   </PieChart>
                 </ResponsiveContainer>
               </div>
            </section>

          </aside>

        </div>

      </div>
    </main>
  );
};

export default Logistics;
