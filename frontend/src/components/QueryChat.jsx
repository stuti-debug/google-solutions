import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { exportToPdf } from '../utils/exportPdf';
import toast from 'react-hot-toast';
import { incrementUsage } from '../utils/usageTracker';

const playSoundCue = (type) => {
  try {
    const isSoundsEnabled = localStorage.getItem('crisisgrid_sounds_enabled') !== 'false';
    if (!isSoundsEnabled) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'start') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(554.37, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(277.18, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    }
  } catch (err) {
    console.error('Audio cue error:', err);
  }
};

const QueryChat = () => {
  const { runQuery, user, loading: authLoading, navigate } = useAppContext();
  const [inputValue, setInputValue] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const MAX_QUESTION_LENGTH = 500;

  // ─── Speech Recognition ───
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechSupported = !!SpeechRecognition;
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState(() => localStorage.getItem('crisisgrid_speech_lang') || 'hi-IN');

  const toggleLang = () => {
    const next = speechLang === 'hi-IN' ? 'en-IN' : 'hi-IN';
    setSpeechLang(next);
    localStorage.setItem('crisisgrid_speech_lang', next);
  };

  const startListening = useCallback(() => {
    if (!speechSupported) { toast.error('Speech not supported in this browser.'); return; }
    if (recognitionRef.current) { recognitionRef.current.abort(); }

    const rec = new SpeechRecognition();
    rec.lang = speechLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onstart = () => {
      setListening(true);
      playSoundCue('start');
    };
    rec.onend = () => {
      setListening(false);
      playSoundCue('stop');
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') toast.error('Microphone permission denied.');
      else if (e.error !== 'aborted') toast.error('Voice input failed. Try again.');
    };
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInputValue(transcript);
    };

    rec.start();
  }, [speechSupported, speechLang]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [authLoading, navigate, user]);

  if (!user) {
    return null;
  }

  const handleQuery = async (queryText = inputValue) => {
    const text = queryText.trim();
    if (!text) {
      toast.error('Please enter a question.');
      return;
    }
    if (text.length > MAX_QUESTION_LENGTH) {
      toast.error(`Question must be under ${MAX_QUESTION_LENGTH} characters.`);
      return;
    }
    
    // Add user message to state
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInputValue('');
    setQueryLoading(true);
    
    const result = await runQuery(text);
    
    setQueryLoading(false);
    if (result && result.answer) {
      try { incrementUsage('queries'); } catch (e) {}
      setMessages((prev) => [
        ...prev, 
        { 
          role: 'ai', 
          text: result.answer,
          explanation: result.explanation,
          result_count: result.result_count,
          source: result.source,
          warning: result.warning
        }
      ]);
    } else {
      setMessages((prev) => [
        ...prev, 
        { role: 'ai', text: 'Failed to retrieve answer. Please try again.' }
      ]);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
    handleQuery(suggestion);
  };

  return (
    <main id="screen-nlq" className="screen active with-nav header-offset fade-in" aria-label="AI Query Chat">
       <div className="nlq-container chat-layout">
          <div className={messages.length === 0 ? "nlq-header text-center" : "nlq-header"} style={{ display: 'flex', justifyContent: messages.length === 0 ? 'center' : 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', width: '100%' }}>
            <h2 className="nlq-title" style={{ margin: 0, width: messages.length === 0 ? '100%' : 'auto' }}>Ask anything about your data.</h2>
            {messages.length > 0 && (
              <button 
                className="btn secondary outline" 
                onClick={() => {
                  setMessages([]);
                  toast.success('Conversation cleared!');
                }}
                style={{ borderRadius: '20px', padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                aria-label="Start new conversation"
              >
                <i className="ph ph-trash" aria-hidden="true"></i> New Conversation
              </button>
            )}
          </div>

          <div className="search-box prominent-search">
            <i className="ph-fill ph-sparkle spark-icon" aria-hidden="true"></i>
            <input 
              type="text" 
              id="nlq-input" 
              placeholder={listening ? (speechLang === 'hi-IN' ? 'सुन रहा हूँ... बोलिए' : 'Listening... speak now') : "e.g. Which villages haven't received food kits yet?"}
              value={inputValue}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuery(); }}
              aria-label="Ask anything about your data"
            />
            {speechSupported && (
              <div className="voice-controls">
                <button
                  className="voice-lang-toggle"
                  onClick={toggleLang}
                  title={`Switch to ${speechLang === 'hi-IN' ? 'English' : 'Hindi'}`}
                >
                  {speechLang === 'hi-IN' ? 'हि' : 'EN'}
                </button>
                <button
                  className={`voice-mic-btn ${listening ? 'voice-mic-active' : ''}`}
                  onClick={listening ? stopListening : startListening}
                  title={listening ? 'Stop listening' : 'Voice input'}
                >
                  <i className={listening ? 'ph-fill ph-stop-circle' : 'ph ph-microphone'} aria-hidden="true"></i>
                </button>
              </div>
            )}
            <button className="btn primary send-btn" onClick={() => handleQuery()} disabled={queryLoading} aria-label="Send query">
              {queryLoading ? <i className="ph ph-spinner ph-spin" aria-hidden="true"></i> : <i className="ph ph-arrow-right" aria-hidden="true"></i>}
            </button>
          </div>

          {messages.length === 0 && (
            <div className="suggestions quick-questions" id="nlq-suggestions">
              <button className="suggestion-chip" onClick={() => handleSuggestionClick("Which camps are running low on supplies?")} style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--clr-text)' }}>
                Which camps are running low on supplies?
              </button>
              <button className="suggestion-chip" onClick={() => handleSuggestionClick("How much donor fund is unspent?")} style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--clr-text)' }}>
                How much donor fund is unspent?
              </button>
              <button className="suggestion-chip" onClick={() => handleSuggestionClick("Which beneficiaries have not been reached?")} style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--clr-text)' }}>
                Which beneficiaries have not been reached?
              </button>
            </div>
          )}

          <div className="chat-history mt-4" id="nlq-chat-history" aria-live="polite">
            {messages.map((msg, idx) => (
              <div key={idx} id={`nlq-response-${idx}`} className={`query-results mt-4 ${msg.role === 'user' ? 'user-msg-block' : 'ai-msg-block'}`}
                style={msg.role === 'user' ? { display: 'flex', justifyContent: 'flex-end' } : {}}
              >
                {msg.role === 'user' ? (
                   <div style={{ padding: '1rem 1.5rem', background: 'var(--clr-border)', borderRadius: '20px', alignSelf: 'flex-end', display: 'inline-block', marginBottom: '1rem', fontWeight: 500 }}>
                     {msg.text}
                   </div>
                ) : (
                  <div className="response-card">
                    <div className="response-header">
                      {msg.source === 'fallback' ? (
                        <i className="ph-fill ph-hard-drives text-warning" aria-hidden="true"></i>
                      ) : msg.source === 'conversational' ? (
                        <i className="ph-fill ph-chat-circle text-primary" aria-hidden="true"></i>
                      ) : (
                        <i className="ph-fill ph-sparkle text-primary" aria-hidden="true"></i>
                      )}
                      <span>
                        {msg.source === 'fallback' ? 'CrisisGrid Local Analysis' : 
                         msg.source === 'conversational' ? 'CrisisGrid Assistant' : 
                         'CrisisGrid AI Analysis'}
                      </span>
                    </div>
                    
                    {msg.warning && (
                      <div className="warning-banner" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', padding: '0.8rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(245, 158, 11, 0.2)' }} role="alert">
                        <i className="ph-fill ph-warning-circle" aria-hidden="true"></i>
                        {msg.warning}
                      </div>
                    )}

                    <div className="ai-answer">
                      <p>{msg.text}</p>
                    </div>

                    {msg.explanation && (
                      <div className="source-label mt-6" style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'var(--clr-bg)', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                        <i className="ph ph-funnel" aria-hidden="true"></i> <strong>Query:</strong> {msg.explanation}
                      </div>
                    )}

                    {msg.result_count != null && msg.source !== 'conversational' && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', marginTop: '0.5rem' }}>
                        <i className="ph ph-rows" aria-hidden="true"></i> {msg.result_count} record{msg.result_count !== 1 ? 's' : ''} matched
                      </div>
                    )}

                    {msg.source !== 'conversational' && (
                      <div className="response-actions mt-4 right-align">
                         <button className="btn minimal" aria-label="Mark helpful"><i className="ph ph-thumbs-up" aria-hidden="true"></i> Helpful</button>
                         <button className="btn minimal" onClick={() => { navigator.clipboard.writeText(msg.text); toast.success('Copied!'); }} aria-label="Copy to clipboard"><i className="ph ph-copy" aria-hidden="true"></i> Copy</button>
                         <button className="btn secondary outline" aria-label="Export to PDF" onClick={() => {
                           const tid = toast.loading('Generating PDF...');
                            exportToPdf(`nlq-response-${idx}`, `CrisisGrid-Query-${idx + 1}`)
                              .then(() => {
                                toast.success('PDF downloaded!', { id: tid });
                                try { incrementUsage('exports'); } catch (e) {}
                              })
                              .catch(() => toast.error('Export failed.', { id: tid }));
                         }}><i className="ph ph-file-pdf" aria-hidden="true"></i> Export PDF</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

       </div>
    </main>
  );
};

export default QueryChat;
