import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { linesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function CreateLine() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [initialLiquidity, setInitialLiquidity] = useState(100);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect non-admins
  if (!user?.is_admin) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await linesApi.create({
        title,
        description: description || undefined,
        closes_at: new Date(closesAt).toISOString(),
        initial_liquidity: initialLiquidity,
      });
      navigate(`/lines/${response.data.id}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create line';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Get minimum datetime (now + 1 hour) in local time format
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

  return (
    <div className="create-line-page">
      <div className="create-line-container">
        <div className="create-line-header">
          <button className="back-btn" onClick={() => navigate('/admin')}>
            ← Back to Admin
          </button>
          <h1>Create New Market</h1>
          <p className="subtitle">Set up a new prediction market for users to trade on</p>
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
            <small className="form-hint">Help users understand what they're betting on</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="liquidity">
                Initial Liquidity <span className="required">*</span>
              </label>
              <input
                id="liquidity"
                type="number"
                value={initialLiquidity}
                onChange={(e) => setInitialLiquidity(Number(e.target.value))}
                min={1}
                required
                className="form-input"
              />
              <small className="form-hint">
                Pool depth (higher = less slippage)
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="closesAt">
                Closes At <span className="required">*</span>
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
              <small className="form-hint">When betting ends</small>
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              onClick={() => navigate('/admin')} 
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
              {loading ? 'Creating Market...' : '✨ Create Market'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
