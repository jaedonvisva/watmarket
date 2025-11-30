import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { betsApi, authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'bets' | 'transactions'>('bets');

  const { data: bets = [], isLoading: loadingBets } = useQuery({
    queryKey: ['my-bets'],
    queryFn: async () => (await betsApi.getMy()).data,
    enabled: !!user,
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['my-transactions'],
    queryFn: async () => (await authApi.getTransactions()).data,
    enabled: !!user,
  });

  const loading = activeTab === 'bets' ? loadingBets : loadingTx;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) return null;

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Portfolio</h1>
      </div>

      <div className="dashboard-grid">
        <div className="stat-tile">
          <h4>GOOS Balance</h4>
          <div className="val"><span style={{fontSize: '0.5em', opacity: 0.7}}>GOOS</span> {user.karma_balance.toLocaleString()}</div>
        </div>
        <div className="stat-tile">
          <h4>Total Bets</h4>
          <div className="val">{bets.length}</div>
        </div>
        <div className="stat-tile">
          <h4>Active Positions</h4>
          <div className="val">{bets.filter(b => b.potential_payout !== null).length}</div>
        </div>
      </div>

      <div className="filter-tabs" style={{ marginBottom: '2rem' }}>
        <button
          className={activeTab === 'bets' ? 'active' : ''}
          onClick={() => setActiveTab('bets')}
        >
          Positions
        </button>
        <button
          className={activeTab === 'transactions' ? 'active' : ''}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : activeTab === 'bets' ? (
        <div className="bets-list">
          {bets.length === 0 ? (
            <EmptyState 
              title="No positions yet"
              description="You haven't placed any bets. Browse markets to start trading!"
              icon="💼"
              action={<Link to="/" className="btn btn-primary" style={{display: 'inline-block', padding: '0.5rem 1rem', background: 'var(--gold)', color: '#000', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 'bold'}}>Browse Markets</Link>}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Buy Price</th>
                  <th>Shares</th>
                  <th>Cost</th>
                  <th>Value</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((bet) => (
                  <tr key={bet.id}>
                    <td>
                      <Link to={`/lines/${bet.line_id}`}>View Market</Link>
                    </td>
                    <td className={bet.outcome}>{bet.outcome.toUpperCase()}</td>
                    <td>
                      {bet.buy_price ? bet.buy_price.toFixed(2) : '-'}
                    </td>
                    <td>{bet.shares ? bet.shares.toFixed(2) : '-'}</td>
                    <td>{bet.stake}</td>
                    <td className={bet.payout !== undefined && bet.payout !== null ? (bet.payout > bet.stake ? 'positive' : 'negative') : ''}>
                      {bet.payout !== undefined && bet.payout !== null 
                        ? bet.payout.toFixed(0) 
                        : bet.shares 
                          ? `${bet.shares.toFixed(0)}` 
                          : '-'}
                    </td>
                    <td>{formatDate(bet.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="transactions-list">
          {transactions.length === 0 ? (
            <EmptyState 
              title="No transactions found"
              description="Your transaction history is empty."
              icon="📝"
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ textTransform: 'capitalize' }}>{tx.type}</td>
                    <td className={tx.amount >= 0 ? 'positive' : 'negative'}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount}
                    </td>
                    <td>{formatDate(tx.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
