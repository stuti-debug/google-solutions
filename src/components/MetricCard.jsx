import React from 'react';

const MetricCard = ({ label, value, trendText, trendClass, icon, valueClass = '' }) => {
  return (
    <div className="metric-card">
      <div className="metric-info">
        <span className="label">{label}</span>
        <span className={`value ${valueClass}`}>{value}</span>
        <span className={`trend ${trendClass}`}>
          <i className={`ph ${icon}`}></i> {trendText}
        </span>
      </div>
    </div>
  );
};

export default MetricCard;
