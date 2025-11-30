import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { betsApi, authApi } from '../api/client';
import type { Position } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { TrendingUp, TrendingDown, Wallet, PieChart, Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';

type TabType = 'positions' | 'history';

export default function Portfolio() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [showResolved, setShowResolved] = useState(false);

  const { data: portfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => (await betsApi.getPortfolio()).data,
    enabled: !!user,
    refetchInterval: 10000, // Refresh every 10s for live prices
  });

  const { data: positions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await betsApi.getPositions()).data,
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['my-transactions'],
    queryFn: async () => (await authApi.getTransactions()).data,
    enabled: !!user && activeTab === 'history',
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPnL = (value: number, showSign = true) => {
    const sign = value >= 0 ? '+' : '';
    return showSign ? `${sign}${value.toFixed(0)}` : value.toFixed(0);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const exportToCSV = () => {
    const headers = ['Type', 'Amount', 'Date', 'Reference ID'];
    const rows = transactions.map(tx => [
      tx.type,
      tx.amount.toString(),
      new Date(tx.created_at).toISOString(),
      tx.reference_id || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watmarket-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  const activePositions = positions.filter(p => p.is_active);
  const resolvedPositions = positions.filter(p => !p.is_active);
  const displayPositions = showResolved ? resolvedPositions : activePositions;

  const isLoading = loadingPortfolio || loadingPositions;

  return (
    <div className="portfolio-page">
      {/* Hero Section */}
      <div className="portfolio-hero">
        <div className="hero-main">
          <div className="portfolio-value-section">
            <span className="label">Portfolio Value</span>
            <div className="portfolio-value">
              {isLoading ? (
                <span className="loading-shimmer">--</span>
              ) : (
                <><span className="currency">GOOS</span>{portfolio?.total_portfolio_value.toFixed(0) || 0}</>
              )}
            </div>
          </div>
          
          {portfolio && !isLoading && (
            <div className={`pnl-badge ${portfolio.total_pnl >= 0 ? 'positive' : 'negative'}`}>
              {portfolio.total_pnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              <span className="pnl-value">{formatPnL(portfolio.total_pnl)}</span>
              <span className="pnl-percent">({formatPercent(portfolio.total_pnl_percent)})</span>
            </div>
          )}
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <Wallet size={16} />
            <div className="stat-content">
              <span className="stat-label">GOOS Available</span>
              <span className="stat-value">{portfolio?.cash_balance.toLocaleString() || 0}</span>
            </div>
          </div>
          <div className="hero-stat">
            <PieChart size={16} />
            <div className="stat-content">
              <span className="stat-label">Invested</span>
              <span className="stat-value">{portfolio?.invested_value.toFixed(0) || 0}</span>
            </div>
          </div>
          <div className="hero-stat">
            <TrendingUp size={16} />
            <div className="stat-content">
              <span className="stat-label">Positions Value</span>
              <span className="stat-value">{portfolio?.positions_value.toFixed(0) || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="portfolio-tabs">
        <div className="tab-group">
          <button
            className={activeTab === 'positions' ? 'active' : ''}
            onClick={() => setActiveTab('positions')}
          >
            Open Positions
            {activePositions.length > 0 && (
              <span className="tab-badge">{activePositions.length}</span>
            )}
          </button>
          <button
            className={activeTab === 'history' ? 'active' : ''}
            onClick={() => setActiveTab('history')}
          >
            Trade History
          </button>
        </div>
        
        {activeTab === 'history' && transactions.length > 0 && (
          <button className="export-btn" onClick={exportToCSV}>
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === 'positions' ? (
        <div className="positions-section">
          {/* Position type toggle */}
          <div className="position-toggle">
            <button
              className={!showResolved ? 'active' : ''}
              onClick={() => setShowResolved(false)}
            >
              Active ({activePositions.length})
            </button>
            <button
              className={showResolved ? 'active' : ''}
              onClick={() => setShowResolved(true)}
            >
              Resolved ({resolvedPositions.length})
            </button>
          </div>

          {loadingPositions ? (
            <LoadingSpinner />
          ) : displayPositions.length === 0 ? (
            <EmptyState
              title={showResolved ? "No resolved positions" : "No active positions"}
              description={showResolved 
                ? "Your resolved positions will appear here after markets close."
                : "You haven't placed any bets yet. Browse markets to start trading!"
              }
              icon={showResolved ? "📊" : "💼"}
              action={!showResolved && (
                <Link to="/" className="btn-primary">Browse Markets</Link>
              )}
            />
          ) : (
            <div className="positions-table-wrapper">
              <table className="positions-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Shares</th>
                    <th>Avg Price</th>
                    <th>Current</th>
                    <th>Value</th>
                    <th>Return</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayPositions.map((pos) => (
                    <PositionRow key={`${pos.line_id}-${pos.outcome}`} position={pos} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="history-section">
          {loadingTx ? (
            <LoadingSpinner />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No transactions"
              description="Your trade history will appear here."
              icon="📝"
            />
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <span className={`tx-type ${tx.type}`}>
                          {tx.type === 'bet' ? 'Buy' : tx.type === 'payout' ? 'Payout' : 'Initial'}
                        </span>
                      </td>
                      <td>
                        <div className={`amount-wrapper ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                          {tx.amount >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Math.abs(tx.amount).toLocaleString()}
                        </div>
                      </td>
                      <td className="date-cell">{formatDate(tx.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const pnlClass = position.pnl >= 0 ? 'positive' : 'negative';
  
  // Determine if this was a winning bet (for resolved)
  const isWinner = position.line_resolved && position.line_correct_outcome === position.outcome;

  return (
    <tr className={position.line_resolved ? 'resolved' : ''}>
      <td className="market-cell">
        <Link to={`/lines/${position.line_id}`} className="market-link">
          {position.line_title}
        </Link>
        {position.line_resolved && (
          <span className={`result-badge ${isWinner ? 'won' : 'lost'}`}>
            {isWinner ? 'Won' : 'Lost'}
          </span>
        )}
      </td>
      <td>
        <span className={`side-badge ${position.outcome}`}>
          {position.outcome.toUpperCase()}
        </span>
      </td>
      <td className="shares-cell">{position.total_shares.toFixed(2)}</td>
      <td className="price-cell">{position.avg_buy_price.toFixed(2)}</td>
      <td className="price-cell">
        {position.line_resolved ? (
          <span className="resolved-price">{isWinner ? '1.00' : '0.00'}</span>
        ) : (
          position.current_price.toFixed(2)
        )}
      </td>
      <td className="value-cell">
        {position.line_resolved ? (
          position.payout?.toFixed(0) || 0
        ) : (
          position.current_value.toFixed(0)
        )}
      </td>
      <td className={`return-cell ${pnlClass}`}>
        <div className="return-value">
          <span>{position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(0)}</span>
          <span className="return-percent">({position.pnl_percent >= 0 ? '+' : ''}{position.pnl_percent.toFixed(1)}%)</span>
        </div>
      </td>
      <td className="action-cell">
        {!position.line_resolved && (
          <Link to={`/lines/${position.line_id}`} className="trade-btn">
            Trade
          </Link>
        )}
      </td>
    </tr>
  );
}
