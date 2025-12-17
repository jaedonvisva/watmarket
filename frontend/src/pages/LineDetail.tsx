import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { linesApi, betsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import PriceChart from '../components/PriceChart';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDateFull } from '../utils/formatters';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { isMarketOpen } from '../utils/market';
import { calculateEstimatedShares, calculateCostForShares, calculateSellValue } from '../utils/cpmm';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { REFETCH_INTERVALS, DEFAULTS } from '../constants';

type TradeMode = 'buy' | 'sell';

export default function LineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const now = useCurrentTime();

  // Trade form state
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy');
  const [outcome, setOutcome] = useState<'yes' | 'no'>('yes');
  const [stake, setStake] = useState<number>(DEFAULTS.INITIAL_STAKE);
  const [targetShares, setTargetShares] = useState<number>(DEFAULTS.INITIAL_SHARES);
  const [sellShares, setSellShares] = useState(0);
  const [buyMode, setBuyMode] = useState<'amount' | 'shares'>('amount');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [trading, setTrading] = useState(false);
  const [error, setError] = useState('');

  const { data: line, isLoading: loadingLine } = useQuery({
    queryKey: ['line', id],
    queryFn: async () => (await linesApi.getOne(id!)).data,
    enabled: !!id,
    refetchInterval: REFETCH_INTERVALS.MARKET_DATA,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['line-history', id],
    queryFn: async () => (await linesApi.getHistory(id!)).data,
    enabled: !!id,
  });

  const { data: myBets = [] } = useQuery({
    queryKey: ['line-bets', id],
    queryFn: async () => (await betsApi.getForLine(id!)).data,
    enabled: !!id && !!user,
  });

  const refetchData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['line', id] }),
      queryClient.invalidateQueries({ queryKey: ['line-bets', id] }),
      refreshUser(),
    ]);
  };

  // Calculate user's position for the selected outcome
  const userPosition = useMemo(() => {
    const positionBets = myBets.filter(b => b.outcome === outcome && !b.payout);
    const totalShares = positionBets.reduce((sum, b) => sum + (b.shares || 0), 0);
    const totalCost = positionBets.reduce((sum, b) => sum + b.stake, 0);
    return { totalShares, totalCost };
  }, [myBets, outcome]);

  const getSellValue = (shares: number, out: 'yes' | 'no') => {
    if (!line || shares <= 0) return 0;
    return calculateSellValue({ yes_pool: line.yes_pool, no_pool: line.no_pool }, shares, out);
  };

  const handlePlaceBet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line || !user) return;

    const finalStake = buyMode === 'amount' ? stake : Math.ceil(getEstCost);

    if (finalStake > user.karma_balance) {
      setError(`Insufficient GOOS. Available: ${user.karma_balance}`);
      return;
    }

    setTrading(true);
    setError('');

    try {
      await betsApi.place(line.id, outcome, finalStake);
      await refetchData();
      toast.success(`Bought ${getEstShares.toFixed(0)} ${outcome.toUpperCase()} shares for ${finalStake} GOOS`);
      setStake(100);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Order failed';
      setError(errorMessage);
      toast.error(errorMessage);
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
      const value = getSellValue(sellShares, outcome);
      await betsApi.sell(line.id, outcome, sellShares);
      await refetchData();
      toast.success(`Sold ${sellShares.toFixed(0)} ${outcome.toUpperCase()} shares for ${value.toFixed(0)} GOOS`);
      setSellShares(0);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Sell failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setTrading(false);
    }
  };

  const isOpen = line ? isMarketOpen(line, now) : false;

  const pool = line ? { yes_pool: line.yes_pool, no_pool: line.no_pool } : { yes_pool: 0, no_pool: 0 };
  
  const getEstShares = buyMode === 'amount' 
    ? calculateEstimatedShares(pool, stake, outcome)
    : targetShares;
    
  const getEstCost = buyMode === 'amount'
    ? stake
    : calculateCostForShares(pool, targetShares, outcome);

  const estPrice = getEstShares > 0 ? getEstCost / getEstShares : 0;

  if (loadingLine) return <LoadingSpinner />;
  if (!line) return <div className="error">Market not found</div>;

  return (
    <div className="market-detail-container">
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="market-title-section">
        <h1>{line.title}</h1>
        <div className="market-stats">
          <span>Volume: GOOS {(line.volume || 0).toLocaleString()}</span>
          <span>Ends: {formatDateFull(line.closes_at)}</span>
          <span className={`status-badge ${line.resolved ? 'resolved' : isOpen ? 'open' : 'closed'}`}>
            {line.resolved ? 'Resolved' : isOpen ? 'Trading Open' : 'Trading Closed'}
          </span>
        </div>
      </div>

      {line.description && <p className="line-description">{line.description}</p>}

      <PriceChart data={history} currentYesPrice={line.odds.yes_probability} />
      
      {error && <div className="error">{error}</div>}

      <div className="trading-panel">
        <div className="outcome-selector">
          <button 
            className={`outcome-btn ${outcome === 'yes' ? 'selected yes' : ''}`}
            onClick={() => isOpen && setOutcome('yes')}
          >
            <div className="outcome-label-text">Yes</div>
            <div className="outcome-percentage">{(line.odds.yes_probability * 100).toFixed(0)}%</div>
            <div className="outcome-price">{(line.odds.yes_probability * 100).toFixed(1)}%</div>
          </button>
          <button 
            className={`outcome-btn ${outcome === 'no' ? 'selected no' : ''}`}
            onClick={() => isOpen && setOutcome('no')}
          >
            <div className="outcome-label-text">No</div>
            <div className="outcome-percentage">{(line.odds.no_probability * 100).toFixed(0)}%</div>
            <div className="outcome-price">{(line.odds.no_probability * 100).toFixed(1)}%</div>
          </button>
        </div>

        {isOpen && user ? (
          <>
            {/* Buy/Sell Mode Toggle - only show sell if user has position */}
            {userPosition.totalShares > 0 && (
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
                >
                  Sell ({userPosition.totalShares.toFixed(1)} shares)
                </button>
              </div>
            )}

            {tradeMode === 'buy' ? (
              <>
                <p className="trading-guidance">How much do you want to bet?</p>
                
                <form onSubmit={handlePlaceBet}>
                  <div className="trade-input-container">
                    <div className="currency-prefix">GOOS</div>
                    <input
                      className="huge-input"
                      type="number"
                      min={1}
                      max={user.karma_balance}
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>

                  {/* Simplified summary - just show profit */}
                  <div className="simple-summary">
                    <div className="profit-preview">
                      +{(getEstShares - getEstCost).toFixed(0)} GOOS ({getEstCost > 0 ? (((getEstShares - getEstCost) / getEstCost) * 100).toFixed(0) : 0}%)
                    </div>
                    <div className="profit-label">Potential profit if {outcome.toUpperCase()} wins</div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={trading || stake > user.karma_balance || getEstCost <= 0}
                    className={`action-btn ${outcome}`}
                  >
                    {trading ? 'Processing...' : `Buy ${outcome.toUpperCase()} for ${stake} GOOS`}
                  </button>
                  
                  <div className="balance-hint">
                    Balance: GOOS {user.karma_balance.toLocaleString()}
                  </div>

                  {/* Advanced options - hidden by default */}
                  <button 
                    type="button" 
                    className="advanced-toggle"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showAdvanced ? 'Hide' : 'Show'} details
                  </button>

                  {showAdvanced && (
                    <div className="advanced-options">
                      <div className="input-tabs">
                        <button 
                          type="button"
                          className={`tab-btn ${buyMode === 'amount' ? 'active' : ''}`}
                          onClick={() => setBuyMode('amount')}
                        >
                          Amount (GOOS)
                        </button>
                        <button 
                          type="button"
                          className={`tab-btn ${buyMode === 'shares' ? 'active' : ''}`}
                          onClick={() => setBuyMode('shares')}
                        >
                          Shares
                        </button>
                      </div>
                      
                      {buyMode === 'shares' && (
                        <div className="trade-input-container" style={{marginTop: '1rem'}}>
                          <div className="currency-prefix">Shares</div>
                          <input
                            className="huge-input"
                            type="number"
                            min={1}
                            value={targetShares}
                            onChange={(e) => setTargetShares(Number(e.target.value))}
                            placeholder="0"
                          />
                        </div>
                      )}

                      <div className="order-summary-card">
                        <div className="summary-row">
                          <span className="summary-label">Avg Price</span>
                          <span className="summary-val">GOOS {estPrice.toFixed(2)}</span>
                        </div>
                        <div className="summary-row">
                          <span className="summary-label">Est Shares</span>
                          <span className="summary-val">{getEstShares.toFixed(2)}</span>
                        </div>
                        <div className="summary-row">
                          <span className="summary-label">Payout if {outcome.toUpperCase()} wins</span>
                          <span className="summary-val">GOOS {getEstShares.toFixed(0)}</span>
                        </div>
                        <div className="summary-row">
                          <span className="summary-label">Total Cost</span>
                          <span className="summary-val">GOOS {getEstCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
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
                       <span className="summary-val">GOOS {sellShares > 0 ? (getSellValue(sellShares, outcome) / sellShares).toFixed(2) : '0.00'}</span>
                     </div>
                     <div className="summary-row highlight">
                       <span className="summary-label">You'll Receive</span>
                       <span className="summary-val">GOOS {getSellValue(sellShares, outcome).toFixed(0)}</span>
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
          <div className="trading-closed-message">
            {!user ? 'Log in to trade' : 'Trading is closed'}
          </div>
        )}
      </div>

      {myBets.length > 0 && (
        <div className="positions-section">
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
                  <td>{bet.buy_price ? `GOOS ${bet.buy_price.toFixed(2)}` : '-'}</td>
                  <td>{bet.stake}</td>
                  <td>{bet.potential_payout?.toFixed(0) || '-'}</td>
                  <td>{formatDateFull(bet.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
