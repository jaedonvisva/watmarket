import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Line } from '../api/client';
import { linesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  const [resolving, setResolving] = useState<string | null>(null);

  // Redirect non-admins
  useEffect(() => {
    if (user && !user.is_admin) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchLines();
  }, []);

  const fetchLines = async () => {
    setLoading(true);
    try {
      const response = await linesApi.getAll();
      setLines(response.data);
    } catch {
      setError('Failed to load markets');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (lineId: string, outcome: 'yes' | 'no') => {
    if (!confirm(`Resolve this market as ${outcome.toUpperCase()}?`)) return;
    
    setResolving(lineId);
    try {
      await linesApi.resolve(lineId, outcome);
      await fetchLines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setResolving(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const now = new Date();
  
  const getStatus = (line: Line) => {
    if (line.resolved) return 'resolved';
    if (new Date(line.closes_at) <= now) return 'closed';
    return 'open';
  };

  const filteredLines = lines.filter(line => {
    if (filter === 'all') return true;
    return getStatus(line) === filter;
  });

  if (!user?.is_admin) return null;

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <Link to="/lines/create" className="btn btn-primary">
          + Create Market
        </Link>
      </div>

      <div className="admin-stats">
        <div className="stat-tile">
          <h4>Total Markets</h4>
          <div className="val">{lines.length}</div>
        </div>
        <div className="stat-tile">
          <h4>Active</h4>
          <div className="val">{lines.filter(l => getStatus(l) === 'open').length}</div>
        </div>
        <div className="stat-tile">
          <h4>Pending Resolution</h4>
          <div className="val">{lines.filter(l => getStatus(l) === 'closed').length}</div>
        </div>
        <div className="stat-tile">
          <h4>Resolved</h4>
          <div className="val">{lines.filter(l => l.resolved).length}</div>
        </div>
      </div>

      <div className="filter-tabs" style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
          Active
        </button>
        <button className={filter === 'closed' ? 'active' : ''} onClick={() => setFilter('closed')}>
          Pending Resolution
        </button>
        <button className={filter === 'resolved' ? 'active' : ''} onClick={() => setFilter('resolved')}>
          Resolved
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : filteredLines.length === 0 ? (
        <EmptyState 
          title={filter === 'all' ? 'No markets yet' : `No ${filter} markets`}
          description={filter === 'closed' ? 'Markets pending resolution will appear here' : 'Markets will appear here once created'}
        />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Status</th>
              <th>Yes %</th>
              <th>Volume</th>
              <th>Closes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.map((line) => {
              const status = getStatus(line);
              return (
                <tr key={line.id}>
                  <td>
                    <Link to={`/lines/${line.id}`} style={{ color: 'var(--gold)' }}>
                      {line.title.length > 50 ? line.title.slice(0, 50) + '...' : line.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`status-badge ${status}`}>
                      {status === 'resolved' && line.correct_outcome 
                        ? `${line.correct_outcome.toUpperCase()}` 
                        : status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </td>
                  <td>{(line.odds.yes_probability * 100).toFixed(0)}%</td>
                  <td>{line.yes_pool + line.no_pool}</td>
                  <td>{formatDate(line.closes_at)}</td>
                  <td>
                    {status === 'closed' && (
                      <div className="resolve-actions">
                        <button
                          className="btn-resolve yes"
                          onClick={() => handleResolve(line.id, 'yes')}
                          disabled={resolving === line.id}
                        >
                          Yes
                        </button>
                        <button
                          className="btn-resolve no"
                          onClick={() => handleResolve(line.id, 'no')}
                          disabled={resolving === line.id}
                        >
                          No
                        </button>
                      </div>
                    )}
                    {status === 'open' && (
                      <span style={{ color: 'var(--text-muted)' }}>Trading</span>
                    )}
                    {status === 'resolved' && (
                      <span style={{ color: 'var(--text-muted)' }}>Done</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
