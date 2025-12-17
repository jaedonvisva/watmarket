import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SuggestedLine } from '../api/client';
import { suggestionsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatDateWithTime } from '../utils/formatters';

interface ReviewModal {
  suggestion: SuggestedLine;
  action: 'approve' | 'reject' | null;
}

export default function AdminSuggestions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<SuggestedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  
  // Review modal state
  const [reviewModal, setReviewModal] = useState<ReviewModal | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [initialLiquidity, setInitialLiquidity] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchSuggestions();
  }, [filter]);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = filter === 'all' 
        ? await suggestionsApi.getAll()
        : await suggestionsApi.getAll(filter);
      setSuggestions(response.data);
    } catch {
      setError('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const openReviewModal = (suggestion: SuggestedLine, action: 'approve' | 'reject') => {
    setReviewModal({ suggestion, action });
    setRejectionReason('');
    setInitialLiquidity(100);
  };

  const closeModal = () => {
    setReviewModal(null);
    setRejectionReason('');
  };

  const handleReview = async () => {
    if (!reviewModal) return;
    
    if (reviewModal.action === 'reject' && !rejectionReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }

    setSubmitting(true);
    setError('');
    
    try {
      await suggestionsApi.review(reviewModal.suggestion.id, {
        action: reviewModal.action!,
        rejection_reason: reviewModal.action === 'reject' ? rejectionReason : undefined,
        initial_liquidity: reviewModal.action === 'approve' ? initialLiquidity : undefined,
      });
      closeModal();
      await fetchSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      pending: 'status-badge pending',
      approved: 'status-badge approved',
      rejected: 'status-badge rejected',
    };
    return classes[status] || 'status-badge';
  };

  const stats = {
    pending: suggestions.filter(s => s.status === 'pending').length,
    approved: suggestions.filter(s => s.status === 'approved').length,
    rejected: suggestions.filter(s => s.status === 'rejected').length,
  };

  if (!user?.is_admin) return null;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <Link to="/admin" className="back-link">← Back to Admin</Link>
          <h1>Review Suggestions</h1>
        </div>
      </div>

      <div className="admin-stats">
        <div className="stat-tile">
          <h4>Pending Review</h4>
          <div className="val" style={{ color: 'var(--gold)' }}>{stats.pending}</div>
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
        <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>
          Pending
        </button>
        <button className={filter === 'approved' ? 'active' : ''} onClick={() => setFilter('approved')}>
          Approved
        </button>
        <button className={filter === 'rejected' ? 'active' : ''} onClick={() => setFilter('rejected')}>
          Rejected
        </button>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : suggestions.length === 0 ? (
        <EmptyState 
          title={`No ${filter} suggestions`}
          description={filter === 'pending' 
            ? 'No suggestions awaiting review'
            : `${filter.charAt(0).toUpperCase() + filter.slice(1)} suggestions will appear here`
          }
        />
      ) : (
        <div className="suggestions-list">
          {suggestions.map((suggestion) => (
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
                <span>Proposed Close: {formatDateWithTime(suggestion.closes_at)}</span>
              </div>

              {suggestion.status === 'pending' && (
                <div className="suggestion-actions">
                  <button 
                    className="btn btn-approve"
                    onClick={() => openReviewModal(suggestion, 'approve')}
                  >
                    Approve
                  </button>
                  <button 
                    className="btn btn-reject"
                    onClick={() => openReviewModal(suggestion, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              )}

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
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            
            <h2>{reviewModal.action === 'approve' ? 'Approve' : 'Reject'} Suggestion</h2>
            
            <div className="suggestion-preview">
              <h3>{reviewModal.suggestion.title}</h3>
              {reviewModal.suggestion.description && (
                <p>{reviewModal.suggestion.description}</p>
              )}
              <small>Closes: {formatDateWithTime(reviewModal.suggestion.closes_at)}</small>
            </div>

            {reviewModal.action === 'approve' && (
              <div className="form-group">
                <label htmlFor="liquidity">Initial Liquidity</label>
                <input
                  id="liquidity"
                  type="number"
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(Number(e.target.value))}
                  min={1}
                  className="form-input"
                />
                <small className="form-hint">Pool depth for the new market</small>
              </div>
            )}

            {reviewModal.action === 'reject' && (
              <div className="form-group">
                <label htmlFor="reason">
                  Rejection Reason <span className="required">*</span>
                </label>
                <textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this suggestion is being rejected..."
                  rows={4}
                  className="form-input"
                  required
                />
                <small className="form-hint">This will be shown to the user</small>
              </div>
            )}

            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={closeModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button 
                className={`btn ${reviewModal.action === 'approve' ? 'btn-approve' : 'btn-reject'}`}
                onClick={handleReview}
                disabled={submitting || (reviewModal.action === 'reject' && !rejectionReason.trim())}
              >
                {submitting ? 'Processing...' : reviewModal.action === 'approve' ? 'Approve & Create Market' : 'Reject Suggestion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
