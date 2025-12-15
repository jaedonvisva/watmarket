import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Line, Bet, PriceHistoryPoint } from '../api/client';
import { linesApi, betsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PriceChart from '../components/PriceChart';
import LoadingSpinner from '../components/LoadingSpinner';

type TradeMode = 'buy' | 'sell';

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

  // Trade form
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy');
  const [outcome, setOutcome] = useState<'yes' | 'no'>('yes');
  const [stake, setStake] = useState(100);
  const [targetShares, setTargetShares] = useState(100);
  const [sellShares, setSellShares] = useState(0);
  const [buyMode, setBuyMode] = useState<'amount' | 'shares'>('amount');
  const [trading, setTrading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [lineRes, betsRes, historyRes] = await Promise.all([
        linesApi.getOne(id),
        betsApi.getForLine(id),
        linesApi.getHistory(id)
      ]);
      setLine(lineRes.data);
      setMyBets(betsRes.data);
      setHistory(historyRes.data);
    } catch {
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate user's position for the selected outcome
  const userPosition = useMemo(() => {
    const positionBets = myBets.filter(b => b.outcome === outcome && !b.payout);
    const totalShares = positionBets.reduce((sum, b) => sum + (b.shares || 0), 0);
    const totalCost = positionBets.reduce((sum, b) => sum + b.stake, 0);
    return { totalShares, totalCost };
  }, [myBets, outcome]);

  // Calculate sell value using CPMM formula
  const calculateSellValue = (shares: number, out: 'yes' | 'no') => {
    if (!line || shares <= 0) return 0;
    
    const yes_pool = line.yes_pool;
    const no_pool = line.no_pool;
    
    // Quadratic formula: c^2 - c(yes + s + no) + s*pool = 0
    // where pool is no_pool for YES, yes_pool for NO
    const a = 1;
    const b = -(yes_pool + shares + no_pool);
    const c_term = shares * (out === 'yes' ? no_pool : yes_pool);
    
    const discriminant = b * b - 4 * a * c_term;
    if (discriminant < 0) return 0;
    
    const amount = (-b - Math.sqrt(discriminant)) / (2 * a);
    return Math.max(0, amount);
  };

  const handlePlaceBet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line || !user) return;

    // Calculate actual stake to send
    const finalStake = buyMode === 'amount' ? stake : Math.ceil(calculateCostForShares(targetShares, outcome));

    if (finalStake > user.karma_balance) {
      setError(`Insufficient GOOS. Available: ${user.karma_balance}`);
      return;
    }

    setTrading(true);
    setError('');

    try {
      await betsApi.place(line.id, outcome, finalStake);
      await Promise.all([fetchData(), refreshUser()]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Order failed';
      setError(errorMessage);
    } finally {
      setTrading(false);
    }
  };

  const handleSellShares = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line || !user || sellShares <= 0) return;

    if (sellShares > userPosition.totalShares) {
      setError(`Insufficient shares. You have: ${userPosition.totalShares.toFixed(2)}`);
      return;
    }

    setTrading(true);
    setError('');

    try {
      await betsApi.sell(line.id, outcome, sellShares);
      await Promise.all([fetchData(), refreshUser()]);
      setSellShares(0);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Sell failed';
      setError(errorMessage);
    } finally {
      setTrading(false);
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
          <span>Volume: GOOS {(line.volume || 0).toLocaleString()}</span>
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
            <div style={{fontSize: '0.8rem', opacity: 0.7}}>GOOS {line.odds.yes_probability.toFixed(2)}</div>
          </button>
          <button 
            className={`outcome-btn ${outcome === 'no' ? 'selected no' : ''}`}
            onClick={() => isOpen && setOutcome('no')}
          >
            <div style={{fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.25rem'}}>No</div>
            <div style={{fontSize: '1.5rem', fontWeight: 800}}>{(line.odds.no_probability * 100).toFixed(0)}%</div>
            <div style={{fontSize: '0.8rem', opacity: 0.7}}>GOOS {line.odds.no_probability.toFixed(2)}</div>
          </button>
        </div>

        {isOpen && user ? (
          <>
            {/* Buy/Sell Mode Toggle */}
            <div className="trade-mode-tabs">
              <button 
                className={`mode-tab ${tradeMode === 'buy' ? 'active buy' : ''}`}
                onClick={() => setTradeMode('buy')}
              >
                Buy
              </button>
              <button 
                className={`mode-tab ${tradeMode === 'sell' ? 'active sell' : ''}`}
                onClick={() => setTradeMode('sell')}
                disabled={userPosition.totalShares <= 0}
              >
                Sell {userPosition.totalShares > 0 && `(${userPosition.totalShares.toFixed(1)})`}
              </button>
            </div>

            {tradeMode === 'buy' ? (
              <>
                <div className="input-tabs">
                  <button 
                    className={`tab-btn ${buyMode === 'amount' ? 'active' : ''}`}
                    onClick={() => setBuyMode('amount')}
                  >
                    Amount ($G)
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
                    {buyMode === 'amount' && <div className="currency-prefix">GOOS</div>}
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
                       <span className="summary-val">GOOS {estPrice.toFixed(2)}</span>
                     </div>
                     <div className="summary-row">
                       <span className="summary-label">Est Shares</span>
                       <span className="summary-val">{estShares.toFixed(2)}</span>
                     </div>
                     <div className="summary-row">
                       <span className="summary-label">Potential Return</span>
                       <span className="summary-val">GOOS {estShares.toFixed(0)} ({estCost > 0 ? ((estShares / estCost - 1) * 100).toFixed(0) : 0}%)</span>
                     </div>
                     <div className="summary-row">
                       <span className="summary-label">Total Cost</span>
                       <span className="summary-val">GOOS {estCost.toFixed(2)}</span>
                     </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={trading || (buyMode === 'amount' ? stake > user.karma_balance : estCost > user.karma_balance) || estCost <= 0}
                    className={`action-btn ${outcome}`}
                  >
                    {trading ? 'Processing...' : `Buy ${outcome.toUpperCase()}`}
                  </button>
                  
                  <div className="balance-hint">
                    Available: GOOS {user.karma_balance.toLocaleString()}
                  </div>
                </form>
              </>
            ) : (
              <>
                <form onSubmit={handleSellShares}>
                  <div className="trade-input-container">
                    <div className="currency-prefix">Shares</div>
                    <input
                      className="huge-input"
                      type="number"
                      min={0.01}
                      max={userPosition.totalShares}
                      step={0.01}
                      value={sellShares || ''}
                      onChange={(e) => setSellShares(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>

                  <div className="sell-quick-buttons">
                    <button type="button" onClick={() => setSellShares(userPosition.totalShares * 0.25)}>25%</button>
                    <button type="button" onClick={() => setSellShares(userPosition.totalShares * 0.5)}>50%</button>
                    <button type="button" onClick={() => setSellShares(userPosition.totalShares * 0.75)}>75%</button>
                    <button type="button" onClick={() => setSellShares(userPosition.totalShares)}>Max</button>
                  </div>

                  <div className="order-summary-card">
                     <div className="summary-row">
                       <span className="summary-label">Your Position</span>
                       <span className="summary-val">{userPosition.totalShares.toFixed(2)} shares</span>
                     </div>
                     <div className="summary-row">
                       <span className="summary-label">Selling</span>
                       <span className="summary-val">{sellShares.toFixed(2)} shares</span>
                     </div>
                     <div className="summary-row">
                       <span className="summary-label">Est. Sell Price</span>
                       <span className="summary-val">GOOS {sellShares > 0 ? (calculateSellValue(sellShares, outcome) / sellShares).toFixed(2) : '0.00'}</span>
                     </div>
                     <div className="summary-row highlight">
                       <span className="summary-label">You'll Receive</span>
                       <span className="summary-val">GOOS {calculateSellValue(sellShares, outcome).toFixed(0)}</span>
                     </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={trading || sellShares <= 0 || sellShares > userPosition.totalShares}
                    className={`action-btn sell`}
                  >
                    {trading ? 'Processing...' : `Sell ${outcome.toUpperCase()}`}
                  </button>
                  
                  <div className="balance-hint">
                    Position: {userPosition.totalShares.toFixed(2)} {outcome.toUpperCase()} shares
                  </div>
                </form>
              </>
            )}
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
