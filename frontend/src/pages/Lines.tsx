import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Line } from '../api/client';
import { linesApi } from '../api/client';

export default function Lines() {
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchLines();
  }, [filter]);

  const fetchLines = async () => {
    setLoading(true);
    try {
      const resolved = filter === 'all' ? undefined : filter === 'resolved';
      const response = await linesApi.getAll(resolved);
      setLines(response.data);
    } catch {
      setError('Failed to load lines');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isOpen = (line: Line) => {
    return !line.resolved && new Date(line.closes_at) > now;
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

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">Loading markets...</div>
      ) : lines.length === 0 ? (
        <div className="empty">No markets found</div>
      ) : (
        <div className="lines-grid">
          {lines.map((line) => (
            <Link to={`/lines/${line.id}`} key={line.id} className="market-card">
              <div className="market-header">
                <h3>{line.title}</h3>
                <div className="market-meta">
                  <span className={`status-badge ${line.resolved ? 'resolved' : isOpen(line) ? 'open' : 'closed'}`}>
                    {line.resolved ? 'Resolved' : isOpen(line) ? 'Open' : 'Closed'}
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
