import { Link } from 'react-router-dom';
import type { Trade, Position } from '../api/client';

interface GroupedTradesViewProps {
  trades: Trade[];
  positions: Position[];
  formatDate: (d: string) => string;
}

export default function GroupedTradesView({ trades, positions, formatDate }: GroupedTradesViewProps) {
  // Group trades by line_id
  const grouped = trades.reduce((acc, trade) => {
    if (!acc[trade.line_id]) {
      acc[trade.line_id] = {
        line_id: trade.line_id,
        line_title: trade.line_title,
        trades: [],
        totalSpent: 0,
        totalReceived: 0,
        yesBought: 0,
        yesSold: 0,
        yesRemaining: 0,
        noBought: 0,
        noSold: 0,
        noRemaining: 0,
      };
    }
    acc[trade.line_id].trades.push(trade);
    
    if (trade.type === 'buy') {
      acc[trade.line_id].totalSpent += trade.amount;
      if (trade.result === 'won') {
        acc[trade.line_id].totalReceived += trade.payout || 0;
      }
      if (trade.outcome === 'yes') {
        acc[trade.line_id].yesBought += trade.shares;
      } else {
        acc[trade.line_id].noBought += trade.shares;
      }
    } else {
      acc[trade.line_id].totalReceived += trade.amount;
      if (trade.outcome === 'yes') {
        acc[trade.line_id].yesSold += trade.shares;
      } else {
        acc[trade.line_id].noSold += trade.shares;
      }
    }
    
    return acc;
  }, {} as Record<string, { 
    line_id: string; 
    line_title: string; 
    trades: Trade[]; 
    totalSpent: number; 
    totalReceived: number;
    yesBought: number;
    yesSold: number;
    yesRemaining: number;
    noBought: number;
    noSold: number;
    noRemaining: number;
  }>);

  const groups = Object.values(grouped).map(group => {
    const linePositions = positions.filter(p => p.line_id === group.line_id && p.is_active);
    const yesPos = linePositions.find(p => p.outcome === 'yes');
    const noPos = linePositions.find(p => p.outcome === 'no');
    
    const yesValue = yesPos?.current_value || 0;
    const noValue = noPos?.current_value || 0;
    const unrealizedValue = yesValue + noValue;
    const realizedPnL = group.totalReceived - group.totalSpent;
    const totalPnL = realizedPnL + unrealizedValue;
    
    const hasOpenPositions = (yesPos?.total_shares || 0) > 0 || (noPos?.total_shares || 0) > 0;
    
    return {
      ...group,
      yesRemaining: yesPos?.total_shares || 0,
      noRemaining: noPos?.total_shares || 0,
      yesValue,
      noValue,
      unrealizedValue,
      realizedPnL,
      totalPnL,
      hasOpenPositions,
      isResolved: !hasOpenPositions && group.trades.some(t => t.is_resolved),
    };
  }).sort((a, b) => {
    const aLatest = Math.max(...a.trades.map(t => new Date(t.created_at).getTime()));
    const bLatest = Math.max(...b.trades.map(t => new Date(t.created_at).getTime()));
    return bLatest - aLatest;
  });

  return (
    <div className="grouped-trades">
      {groups.map((group) => (
        <div key={group.line_id} className={`trade-group ${group.isResolved ? 'resolved' : ''}`}>
          <div className="group-header">
            <div className="group-header-left">
              <div className="group-title-row">
                <Link to={`/markets/${group.line_id}`} className="group-title">
                  {group.line_title}
                </Link>
                {group.isResolved && <span className="resolved-badge">Resolved</span>}
              </div>
              <span className="group-trade-count">{group.trades.length} trade{group.trades.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="group-pnl-summary">
              <div className="pnl-chip">
                <span className="pnl-label">Spent</span>
                <span className="pnl-amount negative">-{group.totalSpent.toLocaleString()}</span>
              </div>
              <div className="pnl-chip">
                <span className="pnl-label">Received</span>
                <span className="pnl-amount positive">+{group.totalReceived.toLocaleString()}</span>
              </div>
              <div className="pnl-chip">
                <span className="pnl-label">Realized</span>
                <span className={`pnl-amount ${group.realizedPnL >= 0 ? 'positive' : 'negative'}`}>
                  {group.realizedPnL >= 0 ? '+' : ''}{group.realizedPnL.toFixed(0)}
                </span>
              </div>
              {group.hasOpenPositions && (
                <div className="pnl-chip highlight">
                  <span className="pnl-label">+ Open Value</span>
                  <span className="pnl-amount">{group.unrealizedValue.toFixed(0)}</span>
                </div>
              )}
              <div className={`pnl-chip total ${group.totalPnL >= 0 ? 'positive' : 'negative'}`}>
                <span className="pnl-label">Total P&L</span>
                <span className="pnl-amount">
                  {group.totalPnL >= 0 ? '+' : ''}{group.totalPnL.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
          
          {group.hasOpenPositions && (
            <div className="exposure-panel">
              <div className="exposure-title">Open Positions</div>
              <div className="exposure-items">
                {group.yesRemaining > 0 && (
                  <div className="exposure-item yes">
                    <span className="side-badge yes">YES</span>
                    <span className="exposure-shares">{group.yesRemaining.toFixed(2)} shares</span>
                    <span className="exposure-value">≈ {group.yesValue.toFixed(0)} GOOS</span>
                  </div>
                )}
                {group.noRemaining > 0 && (
                  <div className="exposure-item no">
                    <span className="side-badge no">NO</span>
                    <span className="exposure-shares">{group.noRemaining.toFixed(2)} shares</span>
                    <span className="exposure-value">≈ {group.noValue.toFixed(0)} GOOS</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="side-breakdown">
            <div className="side-section yes">
              <div className="side-header">
                <span className="side-badge yes">YES</span>
                <span className="side-stats">
                  Bought: {group.yesBought.toFixed(1)} | Sold: {group.yesSold.toFixed(1)} | Remaining: {group.yesRemaining.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="side-section no">
              <div className="side-header">
                <span className="side-badge no">NO</span>
                <span className="side-stats">
                  Bought: {group.noBought.toFixed(1)} | Sold: {group.noSold.toFixed(1)} | Remaining: {group.noRemaining.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          <table className="history-table compact">
            <thead>
              <tr>
                <th>Type</th>
                <th>Side</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Cash Flow</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {group.trades.map((trade) => {
                const isClosed = trade.type === 'sell' || trade.result !== null;
                return (
                  <tr key={trade.id} className={`${trade.result ? `result-${trade.result}` : ''} ${trade.type === 'sell' ? 'trade-sell' : ''} ${isClosed ? 'trade-closed' : ''}`}>
                    <td>
                      <span className={`type-badge ${trade.type}`}>
                        {trade.type.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`side-badge ${trade.outcome}`}>
                        {trade.outcome.toUpperCase()}
                      </span>
                    </td>
                    <td className="shares-cell">{trade.shares.toFixed(2)}</td>
                    <td className="price-cell">{trade.price.toFixed(2)}</td>
                    <td className={`amount-cell ${trade.type === 'sell' ? 'positive' : 'negative'}`}>
                      {trade.type === 'sell' ? '+' : '-'}{trade.amount.toLocaleString()}
                    </td>
                    <td>
                      {trade.type === 'sell' ? (
                        <span className="status-badge sold">Sold</span>
                      ) : trade.result ? (
                        <span className={`status-badge ${trade.result}`}>
                          {trade.result === 'won' ? `Won +${trade.payout?.toFixed(0) || 0}` : 'Lost'}
                        </span>
                      ) : (
                        <span className="status-badge open">Open</span>
                      )}
                    </td>
                    <td className="date-cell">{formatDate(trade.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
