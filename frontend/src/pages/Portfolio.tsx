import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { betsApi, authApi } from '../api/client';
import type { Trade } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import ActivityFeed from '../components/ActivityFeed';
import GroupedTradesView from '../components/GroupedTradesView';
import PositionRow from '../components/PositionRow';
import { TrendingUp, TrendingDown, Wallet, PieChart, Download, Layers, List, Filter, X, Search, Coins, BarChart3 } from 'lucide-react';
import { formatDateWithTime, formatPnL, formatPercent } from '../utils/formatters';
import { REFETCH_INTERVALS } from '../constants';

type ResultFilter = 'all' | 'won' | 'lost' | 'open';
type SideFilter = 'all' | 'yes' | 'no';

type TabType = 'positions' | 'history';

export default function Portfolio() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [groupByMarket, setGroupByMarket] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data: portfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      // Refresh user balance in navbar when portfolio loads
      await refreshUser();
      return (await betsApi.getPortfolio()).data;
    },
    enabled: !!user,
    refetchInterval: REFETCH_INTERVALS.LIVE_DATA,
  });

  const { data: positions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await betsApi.getPositions()).data,
    enabled: !!user,
    refetchInterval: REFETCH_INTERVALS.LIVE_DATA,
  });

  const { data: trades = [], isLoading: loadingTrades } = useQuery({
    queryKey: ['my-trades'],
    queryFn: async () => (await authApi.getTrades()).data,
    enabled: !!user && activeTab === 'history',
  });

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
            <Coins size={16} />
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
            <GroupedTradesView trades={filteredTrades} positions={positions} formatDate={formatDateWithTime} />
          ) : (
            <ActivityFeed trades={filteredTrades} formatDate={formatDateWithTime} />
          )}
        </div>
      )}
    </div>
  );
}
