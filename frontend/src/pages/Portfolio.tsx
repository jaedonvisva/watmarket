import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { betsApi, authApi } from '../api/client';
import type { Position, Trade } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { TrendingUp, TrendingDown, Wallet, PieChart, Download, Layers, List, Filter, X, Search, DollarSign, BarChart3 } from 'lucide-react';

type ResultFilter = 'all' | 'won' | 'lost' | 'open';
type SideFilter = 'all' | 'yes' | 'no';

type TabType = 'positions' | 'history';

export default function Portfolio() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [groupByMarket, setGroupByMarket] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

  const { data: trades = [], isLoading: loadingTrades } = useQuery({
    queryKey: ['my-trades'],
    queryFn: async () => (await authApi.getTrades()).data,
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

  // Filter trades based on current filters
  const filteredTrades = useMemo(() => {
    return trades.filter((trade: Trade) => {
      // Result filter
      if (resultFilter === 'won' && trade.result !== 'won') return false;
      if (resultFilter === 'lost' && trade.result !== 'lost') return false;
      if (resultFilter === 'open' && trade.result !== null) return false;
      
      // Side filter
      if (sideFilter !== 'all' && trade.outcome !== sideFilter) return false;
      
      // Search filter
      if (searchQuery && !trade.line_title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      return true;
    });
  }, [trades, resultFilter, sideFilter, searchQuery]);

  const hasActiveFilters = resultFilter !== 'all' || sideFilter !== 'all' || searchQuery !== '';

  const clearFilters = () => {
    setResultFilter('all');
    setSideFilter('all');
    setSearchQuery('');
  };

  const exportToCSV = () => {
    const headers = ['Market', 'Type', 'Side', 'Shares', 'Price', 'Amount', 'Result', 'Payout', 'Date'];
    const rows = trades.map((trade: Trade) => [
      trade.line_title,
      trade.type,
      trade.outcome,
      trade.shares.toFixed(2),
      trade.price.toFixed(2),
      trade.amount.toString(),
      trade.result || (trade.type === 'sell' ? 'sold' : 'open'),
      trade.payout?.toString() || '',
      new Date(trade.created_at).toISOString()
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watmarket-trades-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  const activePositions = positions.filter(p => p.is_active);

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
              <span className="stat-label">Cash Available</span>
              <span className="stat-value">{portfolio?.cash_balance.toLocaleString() || 0}</span>
            </div>
          </div>
          <div className="hero-stat">
            <PieChart size={16} />
            <div className="stat-content">
              <span className="stat-label">Total Invested</span>
              <span className="stat-value">{portfolio?.invested_value.toFixed(0) || 0}</span>
            </div>
          </div>
          <div className="hero-stat">
            <BarChart3 size={16} />
            <div className="stat-content">
              <span className="stat-label">Positions Value</span>
              <span className="stat-value">{portfolio?.positions_value.toFixed(0) || 0}</span>
            </div>
          </div>
          <div className="hero-stat">
            <DollarSign size={16} />
            <div className="stat-content">
              <span className="stat-label">Unrealized P&L</span>
              <span className={`stat-value ${(portfolio?.positions_value || 0) - (portfolio?.invested_value || 0) >= 0 ? 'positive' : 'negative'}`}>
                {((portfolio?.positions_value || 0) - (portfolio?.invested_value || 0)) >= 0 ? '+' : ''}
                {((portfolio?.positions_value || 0) - (portfolio?.invested_value || 0)).toFixed(0)}
              </span>
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
            Positions
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
        
        {activeTab === 'history' && trades.length > 0 && (
          <div className="history-controls">
            <button 
              className={`filter-toggle ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle filters"
            >
              <Filter size={14} />
              Filters
              {hasActiveFilters && <span className="filter-count">{[resultFilter !== 'all', sideFilter !== 'all', searchQuery !== ''].filter(Boolean).length}</span>}
            </button>
            <button 
              className={`group-toggle ${groupByMarket ? 'active' : ''}`}
              onClick={() => setGroupByMarket(!groupByMarket)}
              title={groupByMarket ? 'Show flat list' : 'Group by market'}
            >
              {groupByMarket ? <List size={14} /> : <Layers size={14} />}
              {groupByMarket ? 'Flat' : 'Group'}
            </button>
            <button className="export-btn" onClick={exportToCSV}>
              <Download size={14} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      {activeTab === 'history' && showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Search Market</label>
            <div className="search-input-wrapper">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search by market name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="filter-search"
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          
          <div className="filter-group">
            <label>Result</label>
            <div className="filter-buttons">
              {(['all', 'won', 'lost', 'open'] as ResultFilter[]).map((filter) => (
                <button
                  key={filter}
                  className={`filter-btn ${resultFilter === filter ? 'active' : ''} ${filter}`}
                  onClick={() => setResultFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="filter-group">
            <label>Side</label>
            <div className="filter-buttons">
              {(['all', 'yes', 'no'] as SideFilter[]).map((filter) => (
                <button
                  key={filter}
                  className={`filter-btn ${sideFilter === filter ? 'active' : ''} ${filter}`}
                  onClick={() => setSideFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          {hasActiveFilters && (
            <button className="clear-filters-btn" onClick={clearFilters}>
              <X size={14} />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === 'positions' ? (
        <div className="positions-section">
          {loadingPositions ? (
            <LoadingSpinner />
          ) : activePositions.length === 0 ? (
            <EmptyState
              title="No active positions"
              description="You don't have any open positions. Browse markets to start trading!"
              icon="💼"
              action={
                <Link to="/" className="btn-primary">Browse Markets</Link>
              }
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
                  {activePositions.map((pos) => (
                    <PositionRow key={`${pos.line_id}-${pos.outcome}`} position={pos} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="history-section">
          {loadingTrades ? (
            <LoadingSpinner />
          ) : trades.length === 0 ? (
            <EmptyState
              title="No trades"
              description="Your trade history will appear here after you place bets."
              icon="📝"
            />
          ) : filteredTrades.length === 0 && hasActiveFilters ? (
            <EmptyState
              title="No matching trades"
              description="Try adjusting your filters to see more results."
              icon="🔍"
              action={
                <button className="btn-primary" onClick={clearFilters}>Clear Filters</button>
              }
            />
          ) : groupByMarket ? (
            <GroupedTradesView trades={filteredTrades} positions={positions} formatDate={formatDate} />
          ) : (
            <div className="history-table-wrapper">
              <div className="table-legend">
                <span className="legend-item"><span className="legend-dot negative"></span> Cash Out (Buy)</span>
                <span className="legend-item"><span className="legend-dot positive"></span> Cash In (Sell/Payout)</span>
              </div>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Market</th>
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
                  {filteredTrades.map((trade: Trade) => {
                    const isClosed = trade.type === 'sell' || trade.result !== null;
                    return (
                      <tr key={trade.id} className={`${trade.result ? `result-${trade.result}` : ''} ${trade.type === 'sell' ? 'trade-sell' : ''} ${isClosed ? 'trade-closed' : ''}`}>
                        <td className="market-cell">
                          <Link to={`/lines/${trade.line_id}`} className="market-link">
                            {trade.line_title}
                          </Link>
                        </td>
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
                            <span className="status-badge closed">Closed</span>
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
          )}
        </div>
      )}
    </div>
  );
}

interface GroupedTradesViewProps {
  trades: Trade[];
  positions: Position[];
  formatDate: (d: string) => string;
}

function GroupedTradesView({ trades, positions, formatDate }: GroupedTradesViewProps) {
  // Group trades by line_id
  const grouped = trades.reduce((acc, trade) => {
    if (!acc[trade.line_id]) {
      acc[trade.line_id] = {
        line_id: trade.line_id,
        line_title: trade.line_title,
        trades: [],
        totalSpent: 0,
        totalReceived: 0,
        // Track by side
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
      // Track by side
      if (trade.outcome === 'yes') {
        acc[trade.line_id].yesBought += trade.shares;
      } else {
        acc[trade.line_id].noBought += trade.shares;
      }
    } else {
      // Sell
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
                <Link to={`/lines/${group.line_id}`} className="group-title">
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
                        <span className="status-badge closed">Closed</span>
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

function PositionRow({ position }: { position: Position }) {
  const pnlClass = position.pnl >= 0 ? 'positive' : 'negative';

  return (
    <tr>
      <td className="market-cell">
        <Link to={`/lines/${position.line_id}`} className="market-link">
          {position.line_title}
        </Link>
      </td>
      <td>
        <span className={`side-badge ${position.outcome}`}>
          {position.outcome.toUpperCase()}
        </span>
      </td>
      <td className="shares-cell">{position.total_shares.toFixed(2)}</td>
      <td className="price-cell">{position.avg_buy_price.toFixed(2)}</td>
      <td className="price-cell">{position.current_price.toFixed(2)}</td>
      <td className="value-cell">{position.current_value.toFixed(0)}</td>
      <td className={`return-cell ${pnlClass}`}>
        <div className="return-value">
          <span>{position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(0)}</span>
          <span className="return-percent">({position.pnl_percent >= 0 ? '+' : ''}{position.pnl_percent.toFixed(1)}%)</span>
        </div>
      </td>
      <td className="action-cell">
        <Link to={`/lines/${position.line_id}`} className="trade-btn">
          Trade
        </Link>
      </td>
    </tr>
  );
}
