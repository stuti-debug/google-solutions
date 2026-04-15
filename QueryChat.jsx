import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import toast from 'react-hot-toast';

const QueryChat = () => {
  const { runQuery } = useAppContext();
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const MAX_QUESTION_LENGTH = 500;

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
    setLoading(true);
    
    const result = await runQuery(text);
    
    setLoading(false);
    if (result && result.answer) {
      setMessages((prev) => [
        ...prev, 
        { 
          role: 'ai', 
          text: result.answer,
          sql: result.sql,
          result_count: result.result_count
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
    <section id="screen-nlq" className="screen active with-nav header-offset fade-in">
       <div className="nlq-container chat-layout">
          <div className="nlq-header text-center">
            <h2 className="nlq-title">Ask anything about your data.</h2>
          </div>

          <div className="search-box prominent-search">
            <i className="ph-fill ph-sparkle spark-icon"></i>
            <input 
              type="text" 
              id="nlq-input" 
              placeholder="e.g. Which villages haven't received food kits yet?"
              value={inputValue}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuery(); }}
            />
            <button className="btn primary send-btn" onClick={() => handleQuery()} disabled={loading}>
              {loading ? <i className="ph ph-spinner ph-spin"></i> : <i className="ph ph-arrow-right"></i>}
            </button>
          </div>

          {messages.length === 0 && (
            <div className="suggestions quick-questions" id="nlq-suggestions">
              <span className="suggestion-chip" onClick={() => handleSuggestionClick("Which camps are running low on supplies?")}>
                Which camps are running low on supplies?
              </span>
              <span className="suggestion-chip" onClick={() => handleSuggestionClick("How much donor fund is unspent?")}>
                How much donor fund is unspent?
              </span>
              <span className="suggestion-chip" onClick={() => handleSuggestionClick("Which beneficiaries have not been reached?")}>
                Which beneficiaries have not been reached?
              </span>
            </div>
          )}

          <div className="chat-history mt-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`query-results mt-4 ${msg.role === 'user' ? 'user-msg-block' : 'ai-msg-block'}`}
                style={msg.role === 'user' ? { display: 'flex', justifyContent: 'flex-end' } : {}}
              >
                {msg.role === 'user' ? (
                   <div style={{ padding: '1rem 1.5rem', background: 'var(--clr-border)', borderRadius: '20px', alignSelf: 'flex-end', display: 'inline-block', marginBottom: '1rem', fontWeight: 500 }}>
                     {msg.text}
                   </div>
                ) : (
                  <div className="response-card">
                    <div className="response-header">
                      <i className="ph-fill ph-sparkle text-primary"></i>
                      <span>CrisisGrid AI Analysis</span>
                    </div>
                    
                    <div className="ai-answer">
                      <p>{msg.text}</p>
                    </div>

                    {msg.sql && (
                      <div className="source-label mt-6" style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'var(--clr-bg)', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                        <i className="ph ph-database"></i> <strong>SQL:</strong> {msg.sql}
                      </div>
                    )}

                    {msg.result_count != null && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', marginTop: '0.5rem' }}>
                        <i className="ph ph-rows"></i> {msg.result_count} record{msg.result_count !== 1 ? 's' : ''} matched
                      </div>
                    )}

                    <div className="response-actions mt-4 right-align">
                       <button className="btn minimal"><i className="ph ph-thumbs-up"></i> Helpful</button>
                       <button className="btn minimal"><i className="ph ph-copy"></i> Copy</button>
                       <button className="btn secondary outline"><i className="ph ph-export"></i> Export Report</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

       </div>
    </section>
  );
};

export default QueryChat;
