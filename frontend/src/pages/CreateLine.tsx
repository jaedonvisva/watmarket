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
    <div className="create-line">
      <button className="back-btn" onClick={() => navigate('/')}>
        ← Back to Lines
      </button>

      <h1>Create Prediction Line</h1>

      <form onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Will X happen by Y date?"
            required
            maxLength={500}
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional context or rules for this prediction..."
            rows={4}
          />
        </div>

        <div className="form-group">
          <label htmlFor="closesAt">Betting Closes At *</label>
          <input
            id="closesAt"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            min={minDateTime}
            required
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Creating...' : 'Create Line'}
        </button>
      </form>
    </div>
  );
}
