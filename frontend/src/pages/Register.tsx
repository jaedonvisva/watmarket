import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email domain
    if (!email.toLowerCase().endsWith('@uwaterloo.ca')) {
      setError('Please use your UWaterloo email address (@uwaterloo.ca)');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (displayName.length < 3 || displayName.length > 30) {
      setError('Display name must be between 3 and 30 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(displayName)) {
      setError('Display name can only contain letters, numbers, and underscores');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, displayName);
      navigate('/');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Registration failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h1>Register</h1>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="error">
            {error.includes('already exists') ? (
              <>
                An account with this email already exists. Please{' '}
                <Link to="/login" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  log in
                </Link>{' '}
                instead.
              </>
            ) : (
              error
            )}
          </div>
        )}
        <div className="form-group">
          <label htmlFor="displayName">Display Name</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="CoolTrader123"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only"
          />
          <small className="form-help">Visible on leaderboards. Letters, numbers, and underscores only.</small>
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yourwatiam@uwaterloo.ca"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
