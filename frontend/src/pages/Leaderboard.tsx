import { useQuery } from '@tanstack/react-query';
import { leaderboardApi } from '../api/client';
import type { LeaderboardEntry } from '../api/types';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { Trophy, TrendingUp, TrendingDown, Target, BarChart3, Award, Info } from 'lucide-react';
import { REFETCH_INTERVALS } from '../constants';

function formatScore(score: number): string {
  if (score >= 0) {
    return `+${score.toFixed(3)}`;
  }
  return score.toFixed(3);
}

function formatProfit(profit: number): string {
  if (profit >= 0) {
    return `+${profit.toLocaleString()}`;
  }
  return profit.toLocaleString();
}

function getRankBadge(rank: number): { icon: React.ReactNode; className: string } {
  switch (rank) {
    case 1:
      return { icon: '🥇', className: 'rank-gold' };
    case 2:
      return { icon: '🥈', className: 'rank-silver' };
    case 3:
      return { icon: '🥉', className: 'rank-bronze' };
    default:
      return { icon: null, className: '' };
  }
}

export default function Leaderboard() {
  const { user } = useAuth();

  const { data: leaderboard, isLoading: loadingLeaderboard, error } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => (await leaderboardApi.getLeaderboard(100, 3)).data,
    enabled: !!user,
    refetchInterval: REFETCH_INTERVALS.MARKET_DATA,
  });

  const { data: myStats, isLoading: loadingMyStats } = useQuery({
    queryKey: ['my-leaderboard-stats'],
    queryFn: async () => (await leaderboardApi.getMyStats(3)).data,
    enabled: !!user,
    refetchInterval: REFETCH_INTERVALS.MARKET_DATA,
  });

  if (!user) return null;

  const isLoading = loadingLeaderboard || loadingMyStats;

  return (
    <div className="leaderboard-page">
      {/* Hero Section */}
      <div className="leaderboard-hero">
        <div className="hero-main">
          <div className="hero-title-section">
            <Trophy size={32} className="hero-icon" />
            <div>
              <h1>Skill Leaderboard</h1>
              <p className="hero-subtitle">Ranked by Risk-Adjusted Return</p>
            </div>
          </div>
        </div>

        {/* User's Stats Card */}
        {myStats && (
          <div className="my-stats-card">
            <div className="my-stats-header">
              <span className="my-stats-label">Your Stats</span>
              {myStats.qualifies ? (
                <span className="rank-badge qualified">
                  <Award size={14} />
                  Rank #{myStats.rank}
                </span>
              ) : (
                <span className="rank-badge not-qualified">
                  <Info size={14} />
                  {myStats.min_markets_required - myStats.markets_participated} more market{myStats.min_markets_required - myStats.markets_participated !== 1 ? 's' : ''} needed
                </span>
              )}
            </div>
            <div className="my-stats-grid">
              <div className="my-stat">
                <span className="stat-label">Skill Score</span>
                <span className={`stat-value ${myStats.skill_score >= 0 ? 'positive' : 'negative'}`}>
                  {formatScore(myStats.skill_score)}
                </span>
              </div>
              <div className="my-stat">
                <span className="stat-label">Total P&L</span>
                <span className={`stat-value ${myStats.total_profit >= 0 ? 'positive' : 'negative'}`}>
                  {formatProfit(myStats.total_profit)}
                </span>
              </div>
              <div className="my-stat">
                <span className="stat-label">Win Rate</span>
                <span className="stat-value">{myStats.win_rate.toFixed(1)}%</span>
              </div>
              <div className="my-stat">
                <span className="stat-label">Markets</span>
                <span className="stat-value">{myStats.markets_participated}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="leaderboard-info-card">
        <div className="info-header">
          <Info size={18} />
          <h3>How Skill Score works</h3>
        </div>
        
        <div className="info-grid">
          <div className="info-section">
            <span className="info-label">The Math</span>
            <div className="skill-equation">
              <span>Score = Σ log</span>
              <span style={{ fontSize: '1.2em', margin: '0 4px' }}>(</span>
              <span>1 + </span>
              <span className="fraction">
                <span className="numerator">Profit</span>
                <span>Risk</span>
              </span>
              <span style={{ fontSize: '1.2em', margin: '0 4px' }}>)</span>
            </div>
          </div>

          <div className="info-section">
            <span className="info-label">What it means</span>
            <p>
              We measure <strong>Risk-Adjusted Return</strong>. It's not just about how much you make, but how much you risked to make it. Consistent wins grow your score faster than one lucky "all-in" bet.
            </p>
          </div>

          <div className="info-section">
            <span className="info-label">How to improve</span>
            <p>
              Participate in more markets (min. {leaderboard?.min_markets_required || 3} to qualify).
              Focus on <strong>positive expected value</strong> (+EV) trades where the potential reward justifies the risk. Avoid "all-or-nothing" reckless bets.
            </p>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      {error && <div className="error">Failed to load leaderboard</div>}

      {isLoading ? (
        <LoadingSpinner />
      ) : !leaderboard || leaderboard.entries.length === 0 ? (
        <EmptyState
          title="No rankings yet"
          description="Be the first to qualify! Participate in at least 3 resolved markets to appear on the leaderboard."
          icon="🏆"
        />
      ) : (
        <div className="leaderboard-table-wrapper">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th>Trader</th>
                <th className="numeric-col">
                  <div className="th-with-icon">
                    <BarChart3 size={14} />
                    Skill Score
                  </div>
                </th>
                <th className="numeric-col">
                  <div className="th-with-icon">
                    {leaderboard.entries[0]?.total_profit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    Total P&L
                  </div>
                </th>
                <th className="numeric-col">
                  <div className="th-with-icon">
                    <Target size={14} />
                    Win Rate
                  </div>
                </th>
                <th className="numeric-col">Markets</th>
                <th className="numeric-col">Avg Return</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.entries.map((entry: LeaderboardEntry) => {
                const rankBadge = getRankBadge(entry.rank);
                return (
                  <tr 
                    key={entry.user_id} 
                    className={`${entry.is_current_user ? 'current-user-row' : ''} ${rankBadge.className}`}
                  >
                    <td className="rank-col">
                      <div className="rank-cell">
                        {rankBadge.icon && <span className="rank-medal">{rankBadge.icon}</span>}
                        <span className="rank-number">{entry.rank}</span>
                      </div>
                    </td>
                    <td className="trader-col">
                      <span className="trader-name">
                        {entry.display_name}
                        {entry.is_current_user && <span className="you-badge">You</span>}
                      </span>
                    </td>
                    <td className={`numeric-col ${entry.skill_score >= 0 ? 'positive' : 'negative'}`}>
                      {formatScore(entry.skill_score)}
                    </td>
                    <td className={`numeric-col ${entry.total_profit >= 0 ? 'positive' : 'negative'}`}>
                      {formatProfit(entry.total_profit)}
                    </td>
                    <td className="numeric-col">{entry.win_rate.toFixed(1)}%</td>
                    <td className="numeric-col">{entry.markets_participated}</td>
                    <td className={`numeric-col ${entry.avg_return_per_market >= 0 ? 'positive' : 'negative'}`}>
                      {entry.avg_return_per_market >= 0 ? '+' : ''}{entry.avg_return_per_market.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Total Participants Footer */}
      {leaderboard && leaderboard.entries.length > 0 && (
        <div className="leaderboard-footer">
          <span className="total-participants">
            {leaderboard.total_participants} qualified trader{leaderboard.total_participants !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
