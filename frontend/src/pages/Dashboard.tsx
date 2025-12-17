import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { betsApi, authApi, linesApi } from '../api/client';
import type { Trade } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { TrendingUp, TrendingDown, Wallet, ArrowRight, Clock, CheckCircle, XCircle, Flame } from 'lucide-react';
import { formatDate } from '../utils/formatters';
import { UI } from '../constants';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();

  const { data: portfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      await refreshUser();
      return (await betsApi.getPortfolio()).data;
    },
    enabled: !!user,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await betsApi.getPositions()).data,
    enabled: !!user,
  });

  const { data: trades = [], isLoading: loadingTrades } = useQuery({
    queryKey: ['my-trades'],
    queryFn: async () => (await authApi.getTrades()).data,
    enabled: !!user,
  });

  const { data: trendingLines = [], isLoading: loadingLines } = useQuery({
    queryKey: ['lines-trending'],
    queryFn: async () => {
      const result = await linesApi.getAll();
      // Show unresolved markets, sorted by volume
      return result.data
        .filter(line => !line.resolved)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, UI.TRENDING_MARKETS_LIMIT);
    },
  });

  if (!user) return null;

  const activePositions = positions.filter(p => p.is_active);
  const recentTrades = trades.slice(0, UI.RECENT_TRADES_LIMIT);
  const isLoading = loadingPortfolio || loadingTrades;

  // Calculate quick stats
  const wonTrades = trades.filter((t: Trade) => t.result === 'won').length;
  const lostTrades = trades.filter((t: Trade) => t.result === 'lost').length;

  return (
    <div className="home-dashboard">
      {/* Welcome Header */}
      <div className="home-header">
        <div className="welcome-section">
          <h1>Welcome back</h1>
          <p className="welcome-subtitle">Here's your trading overview</p>
        </div>
      </div>

      {/* Portfolio Summary Card */}
      <div className="portfolio-summary-card">
        <div className="summary-left">
          <div className="portfolio-balance">
            <span className="balance-label">Portfolio Value</span>
            <div className="balance-amount">
              {isLoading ? (
                <span className="loading-shimmer">--</span>
              ) : (
                <><span className="currency">GOOS</span> {portfolio?.total_portfolio_value.toLocaleString() || 0}</>
              )}
            </div>
          </div>
          {portfolio && !isLoading && (
            <div className={`portfolio-change ${portfolio.total_pnl >= 0 ? 'positive' : 'negative'}`}>
              {portfolio.total_pnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span>{portfolio.total_pnl >= 0 ? '+' : ''}{portfolio.total_pnl.toFixed(0)}</span>
              <span className="change-percent">({portfolio.total_pnl_percent >= 0 ? '+' : ''}{portfolio.total_pnl_percent.toFixed(1)}%)</span>
            </div>
          )}
        </div>
        <div className="summary-right">
          <div className="quick-stat">
            <Wallet size={18} />
            <div className="stat-info">
              <span className="stat-value">{portfolio?.cash_balance.toLocaleString() || 0}</span>
              <span className="stat-label">Cash</span>
            </div>
          </div>
          <div className="quick-stat">
            <Clock size={18} />
            <div className="stat-info">
              <span className="stat-value">{activePositions.length}</span>
              <span className="stat-label">Open</span>
            </div>
          </div>
          <div className="quick-stat won">
            <CheckCircle size={18} />
            <div className="stat-info">
              <span className="stat-value">{wonTrades}</span>
              <span className="stat-label">Won</span>
            </div>
          </div>
          <div className="quick-stat lost">
            <XCircle size={18} />
            <div className="stat-info">
              <span className="stat-value">{lostTrades}</span>
              <span className="stat-label">Lost</span>
            </div>
          </div>
        </div>
        <Link to="/portfolio" className="view-portfolio-btn">
          View Full Portfolio <ArrowRight size={16} />
        </Link>
      </div>

      {/* Two Column Layout */}
      <div className="home-grid">
        {/* Trending Markets */}
        <div className="home-section">
          <div className="section-header">
            <h2><Flame size={20} /> Trending Markets</h2>
            <Link to="/markets" className="see-all-link">See all <ArrowRight size={14} /></Link>
          </div>
          <div className="trending-markets">
            {loadingLines ? (
              <LoadingSpinner />
            ) : trendingLines.length === 0 ? (
              <p className="empty-message">No open markets available</p>
            ) : (
              trendingLines.map((line) => (
                <Link to={`/markets/${line.id}`} key={line.id} className="market-card">
                  <div className="market-card-content">
                    <span className="market-title">{line.title}</span>
                    <div className="market-odds">
                      <span className="odds-yes">{Math.round((line.odds?.yes_probability || 0.5) * 100)}%</span>
                      <span className="odds-label">Yes</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="home-section">
          <div className="section-header">
            <h2><Clock size={20} /> Recent Activity</h2>
            <Link to="/portfolio" className="see-all-link">See all <ArrowRight size={14} /></Link>
          </div>
          <div className="recent-activity">
            {recentTrades.length === 0 ? (
              <div className="empty-activity">
                <p>No trades yet</p>
                <Link to="/markets" className="start-trading-btn">Start Trading</Link>
              </div>
            ) : (
              recentTrades.map((trade: Trade) => {
                const isBuy = trade.type === 'buy';
                let pnl = 0;
                let status = 'pending';
                
                if (isBuy && trade.result === 'won') {
                  pnl = (trade.payout || 0) - trade.amount;
                  status = 'won';
                } else if (isBuy && trade.result === 'lost') {
                  pnl = -trade.amount;
                  status = 'lost';
                } else if (isBuy) {
                  pnl = -trade.amount;
                  status = 'pending';
                } else {
                  pnl = trade.amount;
                  status = 'sold';
                }

                return (
                  <Link to={`/markets/${trade.line_id}`} key={trade.id} className={`activity-item ${status}`}>
                    <div className="activity-info">
                      <span className="activity-title">{trade.line_title}</span>
                      <span className="activity-meta">
                        {isBuy ? 'Bought' : 'Sold'} {trade.outcome.toUpperCase()} · {formatDate(trade.created_at)}
                      </span>
                    </div>
                    <div className={`activity-pnl ${pnl >= 0 ? 'positive' : 'negative'}`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
