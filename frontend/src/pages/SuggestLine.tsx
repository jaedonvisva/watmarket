import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { suggestionsApi } from '../api/client';

export default function SuggestLine() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await suggestionsApi.create({
        title,
        description: description || undefined,
        closes_at: new Date(closesAt).toISOString(),
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/suggestions/my');
      }, 2000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit suggestion';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setHours(now.getHours());
    
    const pad = (num: number) => num.toString().padStart(2, '0');
    
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const minDateTime = getMinDateTime();

  if (success) {
    return (
      <div className="create-line-page">
        <div className="create-line-container">
          <div className="success-message" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
            <h2>Suggestion Submitted!</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
              Your market suggestion has been submitted for admin review.
              You'll be notified once it's approved or rejected.
            </p>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Redirecting to your suggestions...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="create-line-page">
      <div className="create-line-container">
        <div className="create-line-header">
          <button className="back-btn" onClick={() => navigate('/markets')}>
            ← Back to Markets
          </button>
          <h1>Suggest a Market</h1>
          <p className="subtitle">
            Submit your market idea for admin review. If approved, it will become a live market.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="create-line-form">
          {error && <div className="error-banner">{error}</div>}

          <div className="form-group">
            <label htmlFor="title">
              Market Question <span className="required">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Will X happen by Y date?"
              required
              maxLength={500}
              className="form-input"
            />
            <small className="form-hint">Ask a clear yes/no question</small>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (Optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add context, rules, or resolution criteria..."
              rows={4}
              className="form-input"
            />
            <small className="form-hint">Help explain what the market is about</small>
          </div>

          <div className="form-group">
            <label htmlFor="closesAt">
              Suggested Close Date <span className="required">*</span>
            </label>
            <input
              id="closesAt"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              min={minDateTime}
              required
              className="form-input"
            />
            <small className="form-hint">When should betting end?</small>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              onClick={() => navigate('/markets')} 
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="btn btn-primary"
            >
              {loading ? 'Submitting...' : 'Submit Suggestion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
