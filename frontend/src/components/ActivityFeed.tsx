import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { Trade } from '../api/client';

interface ActivityFeedProps {
  trades: Trade[];
  formatDate: (dateStr: string) => string;
}

interface TradeCardProps {
  trade: Trade;
  formatDate: (dateStr: string) => string;
}

function TradeCard({ trade, formatDate }: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  const isBuy = trade.type === 'buy';
  const isSell = trade.type === 'sell';
  
  // Calculate P&L display
  let displayAmount: number;
  let isProfit: boolean;
  
  if (isBuy && trade.result === 'won') {
    displayAmount = (trade.payout || 0) - trade.amount;
    isProfit = displayAmount >= 0;
  } else if (isBuy && trade.result === 'lost') {
    displayAmount = -trade.amount;
    isProfit = false;
  } else if (isBuy) {
    displayAmount = -trade.amount;
    isProfit = false;
  } else {
    displayAmount = trade.amount;
    isProfit = true;
  }
  
  // Status info
  const getStatus = () => {
    if (isSell) return { label: 'Sold', class: 'sold', icon: null };
    if (trade.result === 'won') return { label: 'Won', class: 'won', icon: <CheckCircle size={14} /> };
    if (trade.result === 'lost') return { label: 'Lost', class: 'lost', icon: <XCircle size={14} /> };
    return { label: 'Pending', class: 'pending', icon: <Clock size={14} /> };
  };
  
  const status = getStatus();
  const hasSharesData = trade.shares > 0;

  return (
    <div className={`trade-card ${status.class} ${expanded ? 'expanded' : ''}`}>
      <div className="trade-card-main" onClick={() => setExpanded(!expanded)}>
        {/* Left: Market info */}
        <div className="trade-card-left">
          <Link 
            to={`/markets/${trade.line_id}`} 
            className="trade-card-market"
            onClick={(e) => e.stopPropagation()}
          >
            {trade.line_title}
          </Link>
          <div className="trade-card-meta">
            <span className={`trade-side ${trade.outcome}`}>{trade.outcome.toUpperCase()}</span>
            {hasSharesData && (
              <>
                <span className="meta-dot">·</span>
                <span className="trade-shares">{trade.shares.toFixed(0)} shares @ {trade.price.toFixed(2)} GOOS</span>
              </>
            )}
            <span className="meta-dot">·</span>
            <span className="trade-date">{formatDate(trade.created_at)}</span>
          </div>
        </div>
        
        {/* Right: P&L and status */}
        <div className="trade-card-right">
          <div className={`trade-pnl ${isProfit ? 'positive' : 'negative'}`}>
            {displayAmount >= 0 ? '+' : ''}{displayAmount.toLocaleString()}
          </div>
          <div className={`trade-status ${status.class}`}>
            {status.icon}
            <span>{status.label}</span>
          </div>
        </div>
        
        <button className="trade-expand-btn" aria-label="Toggle details">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
      
      {expanded && (
        <div className="trade-card-details">
          <div className="trade-detail-row">
            <div className="trade-detail">
              <span className="detail-label">Type</span>
              <span className={`detail-value type-${trade.type}`}>{trade.type.toUpperCase()}</span>
            </div>
            <div className="trade-detail">
              <span className="detail-label">Side</span>
              <span className={`detail-value side-${trade.outcome}`}>{trade.outcome.toUpperCase()}</span>
            </div>
            <div className="trade-detail">
              <span className="detail-label">Shares</span>
              <span className="detail-value">{trade.shares.toFixed(2)}</span>
            </div>
            <div className="trade-detail">
              <span className="detail-label">Price</span>
              <span className="detail-value">{trade.price.toFixed(2)} GOOS</span>
            </div>
            <div className="trade-detail">
              <span className="detail-label">Cost/Proceeds</span>
              <span className="detail-value">{trade.amount.toLocaleString()} GOOS</span>
            </div>
            {trade.result === 'won' && trade.payout && (
              <div className="trade-detail">
                <span className="detail-label">Payout</span>
                <span className="detail-value positive">+{trade.payout.toFixed(0)} GOOS</span>
              </div>
            )}
          </div>
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
    <div className="activity-feed-v2">
      {/* Trade Cards */}
      <div className="trade-cards">
        {trades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} formatDate={formatDate} />
        ))}
      </div>
    </div>
  );
}
