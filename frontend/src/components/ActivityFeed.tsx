import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Trade } from '../api/client';

interface ActivityFeedProps {
  trades: Trade[];
  formatDate: (dateStr: string) => string;
}

interface ActivityRowProps {
  trade: Trade;
  formatDate: (dateStr: string) => string;
}

function ActivityRow({ trade, formatDate }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  
  const isBuy = trade.type === 'buy';
  const cashFlow = isBuy ? -trade.amount : trade.amount;
  
  // Build action summary - handle missing data gracefully
  const actionText = isBuy 
    ? `Bought ${trade.outcome.toUpperCase()}`
    : `Sold ${trade.outcome.toUpperCase()}`;
  
  // Only show shares/price if we have valid data
  const hasSharesData = trade.shares > 0;
  const sharesText = hasSharesData 
    ? `${trade.shares.toFixed(0)} @ ${(trade.price * 100).toFixed(0)}¢`
    : '';

  return (
    <div className={`activity-row ${expanded ? 'expanded' : ''}`}>
      <div className="activity-main" onClick={() => setExpanded(!expanded)}>
        <div className="activity-left">
          <div className="activity-action">
            <span className={`action-type ${trade.type}`}>{actionText}</span>
            {hasSharesData && <span className="action-shares">{sharesText}</span>}
          </div>
          <Link 
            to={`/lines/${trade.line_id}`} 
            className="activity-market"
            onClick={(e) => e.stopPropagation()}
          >
            {trade.line_title}
          </Link>
        </div>
        
        <div className="activity-right">
          <div className="activity-outcome">
            <span className={`activity-cashflow ${cashFlow >= 0 ? 'positive' : 'negative'}`}>
              {cashFlow >= 0 ? '+' : ''}{cashFlow.toLocaleString()}
            </span>
            {isBuy && trade.result === 'won' && (
              <span className="activity-result won">Won</span>
            )}
            {isBuy && trade.result === 'lost' && (
              <span className="activity-result lost">Lost</span>
            )}
            {isBuy && !trade.result && (
              <span className="activity-result open">Open</span>
            )}
          </div>
          <button className="expand-btn" aria-label="Toggle details">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      
      {expanded && (
        <div className="activity-details">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Date</span>
              <span className="detail-value">{formatDate(trade.created_at)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Type</span>
              <span className="detail-value">{trade.type.toUpperCase()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Side</span>
              <span className={`detail-value ${trade.outcome}`}>{trade.outcome.toUpperCase()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Shares</span>
              <span className="detail-value">{trade.shares.toFixed(2)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Price</span>
              <span className="detail-value">{trade.price.toFixed(2)}¢</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Amount</span>
              <span className="detail-value">{trade.amount.toLocaleString()} GOOS</span>
            </div>
            {trade.result && (
              <div className="detail-item">
                <span className="detail-label">Result</span>
                <span className={`detail-value ${trade.result}`}>
                  {trade.result === 'won' ? `Won +${trade.payout?.toFixed(0) || 0}` : 'Lost'}
                </span>
              </div>
            )}
          </div>
          <Link 
            to={`/lines/${trade.line_id}`} 
            className="view-market-btn"
          >
            View Market →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ActivityFeed({ trades, formatDate }: ActivityFeedProps) {
  if (trades.length === 0) {
    return null;
  }

  return (
    <div className="activity-feed">
      {trades.map((trade) => (
        <ActivityRow key={trade.id} trade={trade} formatDate={formatDate} />
      ))}
    </div>
  );
}
