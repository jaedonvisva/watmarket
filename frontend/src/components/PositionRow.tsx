import { Link } from 'react-router-dom';
import type { Position } from '../api/client';

interface PositionRowProps {
  position: Position;
}

export default function PositionRow({ position }: PositionRowProps) {
  const pnlClass = position.pnl >= 0 ? 'positive' : 'negative';

  return (
    <tr>
      <td className="market-cell">
        <Link to={`/markets/${position.line_id}`} className="market-link">
          {position.line_title}
        </Link>
      </td>
      <td>
        <span className={`side-badge ${position.outcome}`}>
          {position.outcome.toUpperCase()}
        </span>
      </td>
      <td className="shares-cell">{position.total_shares.toFixed(2)}</td>
      <td className="price-cell">{position.avg_buy_price.toFixed(2)}</td>
      <td className="price-cell">{position.current_price.toFixed(2)}</td>
      <td className="value-cell">{position.current_value.toFixed(0)}</td>
      <td className={`return-cell ${pnlClass}`}>
        <div className="return-value">
          <span>{position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(0)}</span>
          <span className="return-percent">({position.pnl_percent >= 0 ? '+' : ''}{position.pnl_percent.toFixed(1)}%)</span>
        </div>
      </td>
      <td className="action-cell">
        <Link to={`/markets/${position.line_id}`} className="trade-btn">
          Trade
        </Link>
      </td>
    </tr>
  );
}
