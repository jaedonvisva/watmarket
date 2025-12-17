import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Line, AdminBet } from '../api/client';
import { linesApi, betsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatDateWithTime } from '../utils/formatters';
import { getMarketStatus } from '../utils/market';

interface LineDetailModal {
  line: Line;
  bets: AdminBet[];
}

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'resolved'>('all');
  const [resolving, setResolving] = useState<string | null>(null);
  
  // Detail modal state
  const [selectedLine, setSelectedLine] = useState<LineDetailModal | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  const openLineDetail = async (line: Line) => {
    setLoadingDetail(true);
    setSelectedLine({ line, bets: [] });
    try {
      const betsRes = await betsApi.getAllForLine(line.id);
      setSelectedLine({ line, bets: betsRes.data });
    } catch {
      setError('Failed to load line details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeModal = () => {
    setSelectedLine(null);
  };

  const handleResolve = async (lineId: string, outcome: 'yes' | 'no') => {
    if (!confirm(`Resolve this market as ${outcome.toUpperCase()}?`)) return;
    
    setResolving(lineId);
    try {
      await linesApi.resolve(lineId, outcome);
      await fetchLines();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setResolving(null);
    }
  };

  const now = new Date();
  
  const getStatus = (line: Line) => getMarketStatus(line, now);

  const filteredLines = lines.filter(line => {
    if (filter === 'all') return true;
    return getStatus(line) === filter;
  });

  // Aggregate positions by user
  const aggregatePositions = (bets: AdminBet[]) => {
    const positions: Record<string, { email: string; yesShares: number; noShares: number; totalStake: number }> = {};
    
    for (const bet of bets) {
      if (!positions[bet.user_id]) {
        positions[bet.user_id] = { email: bet.user_email, yesShares: 0, noShares: 0, totalStake: 0 };
      }
      if (bet.outcome === 'yes') {
        positions[bet.user_id].yesShares += bet.shares || 0;
      } else {
        positions[bet.user_id].noShares += bet.shares || 0;
      }
      positions[bet.user_id].totalStake += bet.stake;
    }
    
    return Object.values(positions);
  };

  if (!user?.is_admin) return null;

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <Link to="/markets/create" className="btn btn-primary">
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
                    <span 
                      style={{ color: 'var(--gold)', cursor: 'pointer' }}
                      onClick={() => openLineDetail(line)}
                    >
                      {line.title.length > 50 ? line.title.slice(0, 50) + '...' : line.title}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${status}`}>
                      {status === 'resolved' && line.correct_outcome 
                        ? `${line.correct_outcome.toUpperCase()}` 
                        : status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </td>
                  <td>{(line.odds.yes_probability * 100).toFixed(0)}%</td>
                  <td>GOOS {(line.volume || 0).toLocaleString()}</td>
                  <td>{formatDateWithTime(line.closes_at)}</td>
                  <td>
                    <button 
                      className="btn-view"
                      onClick={() => openLineDetail(line)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Market Detail Modal */}
      {selectedLine && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content admin-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            
            <h2>{selectedLine.line.title}</h2>
            {selectedLine.line.description && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                {selectedLine.line.description}
              </p>
            )}

            <div className="admin-detail-stats">
              <div className="detail-stat">
                <span className="label">Status</span>
                <span className={`status-badge ${getStatus(selectedLine.line)}`}>
                  {getStatus(selectedLine.line).toUpperCase()}
                </span>
              </div>
              <div className="detail-stat">
                <span className="label">Volume</span>
                <span className="value">GOOS {(selectedLine.line.volume || 0).toLocaleString()}</span>
              </div>
              <div className="detail-stat">
                <span className="label">Yes Pool</span>
                <span className="value yes">{selectedLine.line.yes_pool.toFixed(2)}</span>
              </div>
              <div className="detail-stat">
                <span className="label">No Pool</span>
                <span className="value no">{selectedLine.line.no_pool.toFixed(2)}</span>
              </div>
              <div className="detail-stat">
                <span className="label">Yes Price</span>
                <span className="value">{(selectedLine.line.odds.yes_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="detail-stat">
                <span className="label">No Price</span>
                <span className="value">{(selectedLine.line.odds.no_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="detail-stat">
                <span className="label">Closes At</span>
                <span className="value">{formatDateWithTime(selectedLine.line.closes_at)}</span>
              </div>
            </div>

            {/* Resolution Controls */}
            {!selectedLine.line.resolved && (
              <div className="admin-resolve-section">
                <h3>Resolve Market</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  {getStatus(selectedLine.line) === 'open' 
                    ? 'This will close trading early and resolve the market.'
                    : 'Select the winning outcome to distribute payouts.'}
                </p>
                <div className="resolve-actions">
                  <button
                    className="btn-resolve yes"
                    onClick={() => handleResolve(selectedLine.line.id, 'yes')}
                    disabled={resolving === selectedLine.line.id}
                  >
                    Resolve YES
                  </button>
                  <button
                    className="btn-resolve no"
                    onClick={() => handleResolve(selectedLine.line.id, 'no')}
                    disabled={resolving === selectedLine.line.id}
                  >
                    Resolve NO
                  </button>
                </div>
              </div>
            )}

            {selectedLine.line.resolved && selectedLine.line.correct_outcome && (
              <div className="admin-resolve-section resolved">
                <h3>Resolution</h3>
                <p>
                  This market resolved to <strong className={selectedLine.line.correct_outcome}>
                    {selectedLine.line.correct_outcome.toUpperCase()}
                  </strong>
                </p>
              </div>
            )}

            {/* Positions Table */}
            <div className="admin-positions-section">
              <h3>Positions ({selectedLine.bets.length} trades)</h3>
              {loadingDetail ? (
                <LoadingSpinner />
              ) : selectedLine.bets.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No positions yet</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Yes Shares</th>
                      <th>No Shares</th>
                      <th>Total Invested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatePositions(selectedLine.bets).map((pos, idx) => (
                      <tr key={idx}>
                        <td>{pos.email}</td>
                        <td className="yes">{pos.yesShares.toFixed(2)}</td>
                        <td className="no">{pos.noShares.toFixed(2)}</td>
                        <td>{pos.totalStake.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
