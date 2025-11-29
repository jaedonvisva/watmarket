import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Line, Bet, PriceHistoryPoint } from '../api/client';
import { linesApi, betsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PriceChart from '../components/PriceChart';
import LoadingSpinner from '../components/LoadingSpinner';

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
  const [targetShares, setTargetShares] = useState(100);
  const [buyMode, setBuyMode] = useState<'amount' | 'shares'>('amount');
  const [betting, setBetting] = useState(false);

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

    // Calculate actual stake to send
    const finalStake = buyMode === 'amount' ? stake : Math.ceil(calculateCostForShares(targetShares, outcome));

    if (finalStake > user.karma_balance) {
      setError(`Insufficient funds. Balance: ${user.karma_balance}`);
      return;
    }

    setBetting(true);
    setError('');

    try {
      await betsApi.place(line.id, outcome, finalStake);
      await Promise.all([fetchData(), refreshUser()]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Order failed';
      setError(errorMessage);
    } finally {
      setBetting(false);
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

  const calculateEstShares = (invest: number, out: 'yes' | 'no') => {
    if (!line) return 0;
    const k = line.yes_pool * line.no_pool;
    let shares = 0;
    if (out === 'yes') {
      const newNo = line.no_pool + invest;
      const newYes = k / newNo;
      shares = invest + (line.yes_pool - newYes);
    } else {
      const newYes = line.yes_pool + invest;
      const newNo = k / newYes;
      shares = invest + (line.no_pool - newNo);
    }
    return shares;
  };

  const calculateCostForShares = (shares: number, out: 'yes' | 'no') => {
    if (!line) return 0;
    // Quadratic: I^2 + I(Y+N-S) - SN = 0
    // I = Investment/Cost
    const Y = out === 'yes' ? line.yes_pool : line.no_pool;
    const N = out === 'yes' ? line.no_pool : line.yes_pool;
    
    const a = 1;
    const b = Y + N - shares;
    const c = -shares * N;
    
    const delta = b*b - 4*a*c;
    if (delta < 0) return 0;
    
    const I = (-b + Math.sqrt(delta)) / (2*a);
    return I;
  };

  // Estimates based on mode
  const estShares = buyMode === 'amount' 
    ? calculateEstShares(stake, outcome)
    : targetShares;
    
  const estCost = buyMode === 'amount'
    ? stake
    : calculateCostForShares(targetShares, outcome);

  const estPrice = estShares > 0 ? estCost / estShares : 0;

  if (loading) return <LoadingSpinner />;
  if (!line) return <div className="error">Market not found</div>;

  return (
    <div className="market-detail-container">
      <button className="back-btn" onClick={() => navigate('/')}>
        ← Back to Markets
      </button>

      <div className="market-title-section">
        <h1>{line.title}</h1>
        <div className="market-stats">
          <span>Liquidity: {(line.yes_pool + line.no_pool).toFixed(0)}</span>
          <span>Ends: {formatDate(line.closes_at)}</span>
          <span className={`status-badge ${line.resolved ? 'resolved' : isOpen ? 'open' : 'closed'}`}>
            {line.resolved ? 'Resolved' : isOpen ? 'Trading Open' : 'Trading Closed'}
          </span>
        </div>
      </div>

      {line.description && <p className="line-description">{line.description}</p>}
      
      <div className="headline-stats">
        <div className="headline-primary">
          <span className="headline-percentage yes">{(line.odds.yes_probability * 100).toFixed(0)}%</span>
          <span className="headline-label">chance of Yes</span>
        </div>
      </div>

      <PriceChart data={history} />
      
      {error && <div className="error">{error}</div>}

      <div className="trading-panel">
        <div className="outcome-selector">
          <button 
            className={`outcome-btn ${outcome === 'yes' ? 'selected yes' : ''}`}
            onClick={() => isOpen && setOutcome('yes')}
          >
            <div style={{fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.25rem'}}>Yes</div>
            <div style={{fontSize: '1.5rem', fontWeight: 800}}>{(line.odds.yes_probability * 100).toFixed(0)}%</div>
            <div style={{fontSize: '0.8rem', opacity: 0.7}}>${line.odds.yes_probability.toFixed(2)}</div>
          </button>
          <button 
            className={`outcome-btn ${outcome === 'no' ? 'selected no' : ''}`}
            onClick={() => isOpen && setOutcome('no')}
          >
            <div style={{fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.25rem'}}>No</div>
            <div style={{fontSize: '1.5rem', fontWeight: 800}}>{(line.odds.no_probability * 100).toFixed(0)}%</div>
            <div style={{fontSize: '0.8rem', opacity: 0.7}}>${line.odds.no_probability.toFixed(2)}</div>
          </button>
        </div>

        {isOpen && user ? (
          <>
            <div className="input-tabs">
              <button 
                className={`tab-btn ${buyMode === 'amount' ? 'active' : ''}`}
                onClick={() => setBuyMode('amount')}
              >
                Buy in Dollars
              </button>
              <button 
                className={`tab-btn ${buyMode === 'shares' ? 'active' : ''}`}
                onClick={() => setBuyMode('shares')}
              >
                Buy in Shares
              </button>
            </div>

            <form onSubmit={handlePlaceBet}>
              <div className="trade-input-container">
                {buyMode === 'amount' && <div className="currency-prefix">$</div>}
                <input
                  className="huge-input"
                  type="number"
                  min={1}
                  max={buyMode === 'amount' ? user.karma_balance : undefined}
                  value={buyMode === 'amount' ? stake : targetShares}
                  onChange={(e) => buyMode === 'amount' ? setStake(Number(e.target.value)) : setTargetShares(Number(e.target.value))}
                  placeholder="0"
                />
              </div>

              <div className="order-summary-card">
                 <div className="summary-row">
                   <span className="summary-label">Avg Price</span>
                   <span className="summary-val">${estPrice.toFixed(2)}</span>
                 </div>
                 <div className="summary-row">
                   <span className="summary-label">Est Shares</span>
                   <span className="summary-val">{estShares.toFixed(2)}</span>
                 </div>
                 <div className="summary-row">
                   <span className="summary-label">Potential Return</span>
                   <span className="summary-val">${estShares.toFixed(0)} ({estCost > 0 ? ((estShares / estCost - 1) * 100).toFixed(0) : 0}%)</span>
                 </div>
                 <div className="summary-row">
                   <span className="summary-label">Total Cost</span>
                   <span className="summary-val">${estCost.toFixed(2)}</span>
                 </div>
              </div>

              <button 
                type="submit" 
                disabled={betting || (buyMode === 'amount' ? stake > user.karma_balance : estCost > user.karma_balance) || estCost <= 0}
                className={`action-btn ${outcome}`}
              >
                {betting ? 'Processing...' : 'Submit Order'}
              </button>
              
              <div className="balance-hint">
                Available Balance: ${user.karma_balance.toLocaleString()}
              </div>
            </form>
          </>
        ) : (
          <div style={{textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem'}}>
            {!user ? 'Log in to trade' : 'Trading is closed'}
          </div>
        )}
      </div>

      {myBets.length > 0 && (
        <div style={{ marginTop: '3rem' }}>
          <h3>Your Positions</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Side</th>
                <th>Shares</th>
                <th>Avg Price</th>
                <th>Cost</th>
                <th>Value</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {myBets.map((bet) => (
                <tr key={bet.id}>
                  <td className={bet.outcome}>{bet.outcome.toUpperCase()}</td>
                  <td>{bet.shares?.toFixed(2) || '-'}</td>
                  <td>{bet.buy_price ? '$' + bet.buy_price.toFixed(2) : '-'}</td>
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
