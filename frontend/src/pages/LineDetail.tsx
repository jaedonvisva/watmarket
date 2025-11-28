import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Line, Bet, PriceHistoryPoint } from '../api/client';
import { linesApi, betsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PriceChart from '../components/PriceChart';

export default function LineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [line, setLine] = useState<Line | null>(null);
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  // Bet form
  const [outcome, setOutcome] = useState<'yes' | 'no'>('yes');
  const [stake, setStake] = useState(100);
  const [betting, setBetting] = useState(false);

  // Resolve form (admin)
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lineRes, betsRes, historyRes] = await Promise.all([
        linesApi.getOne(id!),
        betsApi.getForLine(id!),
        linesApi.getHistory(id!)
      ]);
      setLine(lineRes.data);
      setMyBets(betsRes.data);
      setHistory(historyRes.data);
    } catch {
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceBet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line || !user) return;

    if (stake > user.karma_balance) {
      setError(`Insufficient funds. Balance: ${user.karma_balance}`);
      return;
    }

    setBetting(true);
    setError('');

    try {
      await betsApi.place(line.id, outcome, stake);
      await Promise.all([fetchData(), refreshUser()]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Order failed';
      setError(errorMessage);
    } finally {
      setBetting(false);
    }
  };

  const handleResolve = async (correctOutcome: 'yes' | 'no') => {
    if (!line) return;
    if (!confirm(`Confirm resolution: ${correctOutcome.toUpperCase()}?`)) return;

    setResolving(true);
    try {
      await linesApi.resolve(line.id, correctOutcome);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setResolving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOpen = line && !line.resolved && new Date(line.closes_at) > now;

  if (loading) return <div className="loading">Loading market data...</div>;
  if (!line) return <div className="error">Market not found</div>;

  return (
    <div className="market-detail-container">
      <button className="back-btn" onClick={() => navigate('/')}>
        ← Back to Markets
      </button>

      <div className="market-title-section">
        <h1>{line.title}</h1>
        <div className="market-stats">
          <span>Volume: {line.yes_stake + line.no_stake}</span>
          <span>Ends: {formatDate(line.closes_at)}</span>
          <span className={`status-badge ${line.resolved ? 'resolved' : isOpen ? 'open' : 'closed'}`}>
            {line.resolved ? 'Resolved' : isOpen ? 'Trading Open' : 'Trading Closed'}
          </span>
        </div>
      </div>

      {line.description && <p className="line-description">{line.description}</p>}
      
      <PriceChart data={history} />
      
      {error && <div className="error">{error}</div>}

      <div className="trading-section">
        {/* Order Book / Price Display */}
        <div 
          className={`order-book-card yes ${outcome === 'yes' ? 'selected' : ''}`}
          onClick={() => isOpen && setOutcome('yes')}
        >
          <h3>Buy Yes</h3>
          <div className="big-percentage">{(line.odds.yes_probability * 100).toFixed(0)}%</div>
          <div className="price-info">Price: {line.odds.yes_odds.toFixed(2)}x</div>
        </div>

        <div 
          className={`order-book-card no ${outcome === 'no' ? 'selected' : ''}`}
          onClick={() => isOpen && setOutcome('no')}
        >
          <h3>Buy No</h3>
          <div className="big-percentage">{(line.odds.no_probability * 100).toFixed(0)}%</div>
          <div className="price-info">Price: {line.odds.no_odds.toFixed(2)}x</div>
        </div>
      </div>

      {isOpen && user && (
        <div className="order-form">
          <h3>New Order: Buy {outcome.toUpperCase()}</h3>
          <form onSubmit={handlePlaceBet}>
            <div className="input-group">
              <label>Amount (WARRIORS)</label>
              <input
                type="number"
                min={1}
                max={user.karma_balance}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
              />
            </div>
            <div className="order-summary">
               <p>Est. Payout: <strong>{(stake * (outcome === 'yes' ? line.odds.yes_odds : line.odds.no_odds)).toFixed(0)}</strong></p>
               <p className="balance">Available: {user.karma_balance}</p>
            </div>
            <button 
              type="submit" 
              disabled={betting}
              className={`buy-btn ${outcome}`}
            >
              {betting ? 'Processing...' : `Place Buy Order`}
            </button>
          </form>
        </div>
      )}

      {user?.is_admin && !line.resolved && (
        <div className="admin-section" style={{marginTop: '3rem'}}>
          <h3>Admin Controls</h3>
          <div className="resolve-buttons">
            <button className="btn btn-yes" onClick={() => handleResolve('yes')} disabled={resolving}>
              Resolve Yes
            </button>
            <button className="btn btn-no" onClick={() => handleResolve('no')} disabled={resolving}>
              Resolve No
            </button>
          </div>
        </div>
      )}

      {myBets.length > 0 && (
        <div style={{ marginTop: '3rem' }}>
          <h3>Your Positions</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Side</th>
                <th>Size</th>
                <th>Value</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {myBets.map((bet) => (
                <tr key={bet.id}>
                  <td className={bet.outcome}>{bet.outcome.toUpperCase()}</td>
                  <td>{bet.stake}</td>
                  <td>{bet.potential_payout?.toFixed(0) || '-'}</td>
                  <td>{formatDate(bet.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
