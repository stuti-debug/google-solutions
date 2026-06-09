/**
 * CrisisGrid Usage Tracker
 * Lightweight localStorage-based counters for user activity stats.
 */

const USAGE_KEY = 'crisisgrid_usage';
const SESSION_HISTORY_KEY = 'crisisgrid_session_history';

function getUsage() {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveUsage(data) {
  localStorage.setItem(USAGE_KEY, JSON.stringify(data));
}

export function incrementUsage(key) {
  const usage = getUsage();
  usage[key] = (usage[key] || 0) + 1;
  saveUsage(usage);
}

export function getUsageStats() {
  const usage = getUsage();
  return {
    queries: usage.queries || 0,
    reports: usage.reports || 0,
    shares: usage.shares || 0,
    uploads: usage.uploads || 0,
    exports: usage.exports || 0,
  };
}

// ─── Session History ───

export function addSessionToHistory(sessionId, meta = {}) {
  if (!sessionId) return;
  try {
    const history = getSessionHistory();
    // Don't add duplicates
    if (history.some(s => s.id === sessionId)) return;
    history.unshift({
      id: sessionId,
      timestamp: new Date().toISOString(),
      recordCount: meta.recordCount || 0,
      fileTypes: meta.fileTypes || [],
      label: meta.label || `Session ${history.length + 1}`,
    });
    // Keep last 20
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch (e) { /* silent */ }
}

export function getSessionHistory() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY) || '[]');
  } catch { return []; }
}
