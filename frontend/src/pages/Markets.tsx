import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Line } from '../api/client';
import { linesApi } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatDate } from '../utils/formatters';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { isMarketOpen } from '../utils/market';

export default function Markets() {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const now = useCurrentTime();

  const { data: lines = [], isLoading: loading, error } = useQuery({
    queryKey: ['lines', filter],
    queryFn: async () => {
      const resolved = filter === 'all' ? undefined : filter === 'resolved';
      return (await linesApi.getAll(resolved)).data;
    }
  });

  const isOpen = (line: Line) => isMarketOpen(line, now);

  const getEmptyMessage = () => {
    switch (filter) {
      case 'open': return 'There are no active prediction markets at the moment.';
      case 'resolved': return 'There are no resolved markets yet.';
      default: return 'No markets found matching your criteria.';
    }
  };

  return (
    <div className="lines-page">
      <div className="page-header">
        <h1>Markets</h1>
        <div className="filter-tabs">
          <button
            className={filter === 'open' ? 'active' : ''}
            onClick={() => setFilter('open')}
          >
            Active
          </button>
          <button
            className={filter === 'resolved' ? 'active' : ''}
            onClick={() => setFilter('resolved')}
          >
            Resolved
          </button>
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      {error && <div className="error">Failed to load markets</div>}

      {loading ? (
        <LoadingSpinner />
      ) : lines.length === 0 ? (
        <EmptyState 
          title="No markets found"
          description={getEmptyMessage()}
          icon="📉"
        />
      ) : (
        <div className="lines-grid">
          {lines.map((line) => (
            <Link to={`/markets/${line.id}`} key={line.id} className="market-card">
              <div className="market-header">
                <h3>{line.title}</h3>
                <div className="market-meta">
                  <span className={`status-badge ${line.resolved ? (line.correct_outcome === 'invalid' ? 'cancelled' : 'resolved') : isOpen(line) ? 'open' : 'closed'}`}>
                    {line.resolved 
                      ? (line.correct_outcome === 'invalid' ? 'Cancelled' : 'Resolved')
                      : isOpen(line) ? 'Open' : 'Closed'}
                  </span>
                  <span>• Ends {formatDate(line.closes_at)}</span>
                </div>
              </div>
              
              <div className="market-outcomes">
                <div className="outcome-row">
                  <span className="outcome-label yes">YES</span>
                  <span className="outcome-value">{(line.odds.yes_probability * 100).toFixed(0)}%</span>
                </div>
                <div className="outcome-row">
                  <span className="outcome-label no">NO</span>
                  <span className="outcome-value">{(line.odds.no_probability * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="market-footer">
                <span className="volume-label">GOOS {(line.volume || 0).toLocaleString()} Vol</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
