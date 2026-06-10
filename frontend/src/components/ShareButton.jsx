import React, { useState, useRef, useEffect } from 'react';
import { shareViaWhatsApp, shareViaSMS, copyShareText } from '../utils/shareFormatter';
import toast from 'react-hot-toast';
import { incrementUsage } from '../utils/usageTracker';

/**
 * Reusable ShareButton component.
 *
 * Props:
 *   getText  – function that returns the formatted share text
 *   size     – 'sm' | 'md' (default 'sm')
 *   label    – optional button label (default: icon only)
 *   variant  – 'dropdown' | 'inline' (default 'dropdown')
 *              'inline' renders 3 small icon buttons in a row (no dropdown)
 */
const ShareButton = ({ getText, size = 'sm', label, variant = 'dropdown' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fire = (action, msg) => {
    const text = getText();
    if (!text) { toast.error('Nothing to share.'); return; }
    action(text);
    try {
      incrementUsage('shares');
    } catch (e) {
      console.error(e);
    }
    toast.success(msg);
    setOpen(false);
  };

  // ─── Inline variant: 3 tiny icons in a row ───
  if (variant === 'inline') {
    return (
      <div className="share-inline-row" role="group" aria-label="Share options">
        <button
          className="share-inline-btn share-inline-whatsapp"
          title="Share via WhatsApp"
          aria-label="Share via WhatsApp"
          onClick={() => fire(shareViaWhatsApp, 'Opening WhatsApp...')}
        >
          <i className="ph-fill ph-whatsapp-logo" aria-hidden="true"></i>
        </button>
        <button
          className="share-inline-btn share-inline-sms"
          title="Share via SMS"
          aria-label="Share via SMS"
          onClick={() => fire(shareViaSMS, 'Opening Messages...')}
        >
          <i className="ph-fill ph-chat-circle-dots" aria-hidden="true"></i>
        </button>
        <button
          className="share-inline-btn share-inline-copy"
          title="Copy to clipboard"
          aria-label="Copy to clipboard"
          onClick={() => fire(copyShareText, 'Copied!')}
        >
          <i className="ph-fill ph-copy" aria-hidden="true"></i>
        </button>
      </div>
    );
  }

  // ─── Dropdown variant ───
  const btnClass = size === 'md' ? 'btn minimal' : 'share-btn-trigger';

  return (
    <div ref={ref} className="share-btn-wrapper">
      <button
        className={btnClass}
        onClick={() => setOpen(!open)}
        title="Share via WhatsApp, SMS, or Copy"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Share options"
      >
        <i className="ph ph-share-network" aria-hidden="true"></i>
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div className="share-dropdown" role="menu">
          <div className="share-dropdown-header" role="presentation">Share via</div>
          <button className="share-dropdown-option" role="menuitem" aria-label="Share via WhatsApp" onClick={() => fire(shareViaWhatsApp, 'Opening WhatsApp...')}>
            <span className="share-option-icon share-icon-whatsapp">
              <i className="ph-fill ph-whatsapp-logo" aria-hidden="true"></i>
            </span>
            <span className="share-option-label">WhatsApp</span>
            <i className="ph ph-arrow-up-right share-option-arrow" aria-hidden="true"></i>
          </button>
          <button className="share-dropdown-option" role="menuitem" aria-label="Share via SMS" onClick={() => fire(shareViaSMS, 'Opening Messages...')}>
            <span className="share-option-icon share-icon-sms">
              <i className="ph-fill ph-chat-circle-dots" aria-hidden="true"></i>
            </span>
            <span className="share-option-label">SMS</span>
            <i className="ph ph-arrow-up-right share-option-arrow" aria-hidden="true"></i>
          </button>
          <div className="share-dropdown-divider" role="separator"></div>
          <button className="share-dropdown-option" role="menuitem" aria-label="Copy to clipboard" onClick={() => fire(copyShareText, 'Copied to clipboard!')}>
            <span className="share-option-icon share-icon-copy">
              <i className="ph-fill ph-copy" aria-hidden="true"></i>
            </span>
            <span className="share-option-label">Copy Text</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ShareButton;
