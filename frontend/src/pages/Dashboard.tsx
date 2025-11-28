import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Bet, Transaction } from '../api/client';
import { betsApi, authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bets' | 'transactions'>('bets');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [betsRes, transRes] = await Promise.all([
        betsApi.getMy(),
        authApi.getTransactions(),
      ]);
      setBets(betsRes.data);
      setTransactions(transRes.data);
      await refreshUser();
    } catch {
      console.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

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
          <h4>Balance</h4>
          <div className="val">{user.karma_balance.toLocaleString()}</div>
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
        <div className="loading">Loading portfolio...</div>
      ) : activeTab === 'bets' ? (
        <div className="bets-list">
          {bets.length === 0 ? (
            <div className="empty">
              No positions yet. <Link to="/">Browse markets</Link> to trade!
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Size</th>
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
                    <td>{bet.stake}</td>
                    <td>{bet.potential_payout?.toFixed(0) || 'Resolved'}</td>
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
            <div className="empty">No transactions found.</div>
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
