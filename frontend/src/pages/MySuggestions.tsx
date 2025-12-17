import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { SuggestedLine } from '../api/client';
import { suggestionsApi } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatDateWithTime } from '../utils/formatters';

export default function MySuggestions() {
  const [suggestions, setSuggestions] = useState<SuggestedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await suggestionsApi.getMy();
      setSuggestions(response.data);
    } catch {
      setError('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const filteredSuggestions = suggestions.filter(s => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      pending: 'status-badge pending',
      approved: 'status-badge approved',
      rejected: 'status-badge rejected',
    };
    return classes[status] || 'status-badge';
  };

  const stats = {
    total: suggestions.length,
    pending: suggestions.filter(s => s.status === 'pending').length,
    approved: suggestions.filter(s => s.status === 'approved').length,
    rejected: suggestions.filter(s => s.status === 'rejected').length,
  };

  return (
    <div className="my-suggestions-page">
      <div className="page-header">
        <h1>My Suggestions</h1>
        <Link to="/markets/suggest" className="btn btn-primary">
          + Suggest Market
        </Link>
      </div>

      <div className="admin-stats">
        <div className="stat-tile">
          <h4>Total</h4>
          <div className="val">{stats.total}</div>
        </div>
        <div className="stat-tile">
          <h4>Pending</h4>
          <div className="val" style={{ color: 'var(--text-secondary)' }}>{stats.pending}</div>
        </div>
        <div className="stat-tile">
          <h4>Approved</h4>
          <div className="val" style={{ color: 'var(--yes)' }}>{stats.approved}</div>
        </div>
        <div className="stat-tile">
          <h4>Rejected</h4>
          <div className="val" style={{ color: 'var(--no)' }}>{stats.rejected}</div>
        </div>
      </div>

      <div className="filter-tabs" style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>
          Pending
        </button>
        <button className={filter === 'approved' ? 'active' : ''} onClick={() => setFilter('approved')}>
          Approved
        </button>
        <button className={filter === 'rejected' ? 'active' : ''} onClick={() => setFilter('rejected')}>
          Rejected
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : filteredSuggestions.length === 0 ? (
        <EmptyState 
          title={filter === 'all' ? 'No suggestions yet' : `No ${filter} suggestions`}
          description={filter === 'all' 
            ? "You haven't suggested any markets yet. Click 'Suggest Market' to submit one!"
            : `Your ${filter} suggestions will appear here`
          }
        />
      ) : (
        <div className="suggestions-list">
          {filteredSuggestions.map((suggestion) => (
            <div key={suggestion.id} className={`suggestion-card ${suggestion.status}`}>
              <div className="suggestion-header">
                <h3>{suggestion.title}</h3>
                <span className={getStatusBadge(suggestion.status)}>
                  {suggestion.status.charAt(0).toUpperCase() + suggestion.status.slice(1)}
                </span>
              </div>
              
              {suggestion.description && (
                <p className="suggestion-description">{suggestion.description}</p>
              )}
              
              <div className="suggestion-meta">
                <span>Submitted: {formatDateWithTime(suggestion.created_at)}</span>
                <span>Closes: {formatDateWithTime(suggestion.closes_at)}</span>
              </div>

              {suggestion.status === 'rejected' && suggestion.rejection_reason && (
                <div className="rejection-reason">
                  <strong>Rejection Reason:</strong>
                  <p>{suggestion.rejection_reason}</p>
                </div>
              )}

              {suggestion.status === 'approved' && suggestion.approved_line_id && (
                <div className="approval-info">
                  <Link to={`/markets/${suggestion.approved_line_id}`} className="btn btn-small">
                    View Live Market →
                  </Link>
                </div>
              )}

              {suggestion.reviewed_at && (
                <div className="review-info">
                  <small>Reviewed: {formatDateWithTime(suggestion.reviewed_at)}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
