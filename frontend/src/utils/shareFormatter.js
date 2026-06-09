/**
 * CrisisGrid Share Message Formatter
 * Generates clean, actionable messages for WhatsApp/SMS from app data.
 */

const DIVIDER = '━━━━━━━━━━━━━━━';
const timestamp = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const footer = () => `\n${DIVIDER}\nSent via CrisisGrid • ${timestamp()}`;

// ─── ALERT ───────────────────────────────────────────────
export function formatAlert(alert) {
  const emoji = { urgent: '🚨', warning: '⚠️', info: 'ℹ️', success: '✅' };
  return [
    `${emoji[alert.type] || '🔔'} CRISISGRID ALERT`,
    DIVIDER,
    alert.title,
    alert.message,
    footer(),
  ].join('\n');
}

// ─── PRIORITY ZONE ───────────────────────────────────────
export function formatPriorityZone(zone) {
  const urgency = zone.score >= 80 ? '🔴 CRITICAL' : zone.score >= 60 ? '🟠 HIGH' : zone.score >= 40 ? '🟡 MEDIUM' : '🟢 LOW';
  return [
    `🚨 CRISISGRID ZONE UPDATE`,
    DIVIDER,
    `Zone: ${zone.location || zone.name}`,
    `Priority: ${zone.score}/100 (${urgency})`,
    zone.affected ? `Affected: ${Number(zone.affected).toLocaleString()} civilians` : null,
    zone.gap ? `Gap: ${zone.gap}` : null,
    zone.action ? `Action: ${zone.action}` : null,
    footer(),
  ].filter(Boolean).join('\n');
}

// ─── SUPPLY DISPATCH ─────────────────────────────────────
export function formatDispatch(match) {
  return [
    `📦 DISPATCH ORDER`,
    DIVIDER,
    `Item: ${match.item || match.name} × ${match.quantity || match.qty}`,
    `From: ${match.source || match.from}`,
    `To: ${match.destination || match.to}`,
    `Urgency: ${(match.urgency || 'NORMAL').toUpperCase()}`,
    ``,
    `Reply ✅ to confirm receipt`,
    footer(),
  ].join('\n');
}

// ─── BURN-DOWN CRITICAL ──────────────────────────────────
export function formatBurnDown(item) {
  const daysText = item.days_remaining <= 2 ? '🔴 CRITICAL' : item.days_remaining <= 4 ? '🟠 LOW' : '🟢 OK';
  return [
    `⚠️ STOCK ALERT`,
    DIVIDER,
    `Item: ${item.item}`,
    `Current Stock: ${Math.round(item.current_stock)} units`,
    `Days Remaining: ${item.days_remaining.toFixed(1)} (${daysText})`,
    `Daily Burn Rate: ${Math.round(item.daily_rate)}/day`,
    ``,
    item.days_remaining <= 3 ? `⚡ Immediate replenishment needed` : `📋 Monitor closely`,
    footer(),
  ].join('\n');
}

// ─── REPORT SUMMARY ──────────────────────────────────────
export function formatReportSummary(report) {
  return [
    `📋 CRISISGRID REPORT`,
    DIVIDER,
    `Type: ${report.title || 'Report'}`,
    ``,
    report.summary || 'No summary available.',
    footer(),
  ].join('\n');
}

// ─── SITREP (condensed) ──────────────────────────────────
export function formatSitRepBrief(sitrepMarkdown) {
  // Extract the executive summary section
  const lines = sitrepMarkdown.split('\n');
  const summaryLines = [];
  let inSummary = false;

  for (const line of lines) {
    if (line.includes('Executive Summary')) { inSummary = true; continue; }
    if (inSummary && line.startsWith('## ')) break;
    if (inSummary && line.trim()) summaryLines.push(line.trim());
  }

  const brief = summaryLines.join(' ').replace(/\*\*/g, '').slice(0, 500);

  return [
    `📋 CRISISGRID SITREP`,
    DIVIDER,
    brief || 'Situation report generated. View full report in the app.',
    footer(),
  ].join('\n');
}

// ─── SHARE ACTIONS ───────────────────────────────────────

export function shareViaWhatsApp(text, phoneNumber = '') {
  const encoded = encodeURIComponent(text);
  const url = phoneNumber
    ? `https://wa.me/${phoneNumber}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
  logShare('whatsapp', text);
}

export function shareViaSMS(text, phoneNumber = '') {
  const encoded = encodeURIComponent(text);
  const url = phoneNumber
    ? `sms:${phoneNumber}?body=${encoded}`
    : `sms:?body=${encoded}`;
  window.location.href = url;
  logShare('sms', text);
}

export function copyShareText(text) {
  navigator.clipboard.writeText(text);
  logShare('copy', text);
}

// ─── SHARE LOG ───────────────────────────────────────────

const SHARE_LOG_KEY = 'crisisgrid_share_log';

function logShare(channel, text) {
  try {
    const log = JSON.parse(localStorage.getItem(SHARE_LOG_KEY) || '[]');
    log.unshift({
      channel,
      preview: text.slice(0, 100),
      timestamp: new Date().toISOString(),
    });
    // Keep last 50 entries
    localStorage.setItem(SHARE_LOG_KEY, JSON.stringify(log.slice(0, 50)));
  } catch (e) {
    // Silent fail
  }
}

export function getShareLog() {
  try {
    return JSON.parse(localStorage.getItem(SHARE_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}
