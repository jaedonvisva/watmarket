import { Link } from 'react-router-dom';
import { TrendingUp, Users, Zap, Shield, ChevronRight } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import logoDark from '../assets/watmarket_dark.png';
import logoLight from '../assets/watmarket_light.png';
import './Landing.css';

export default function Landing() {
  const { theme } = useTheme();

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <header className="landing-header">
        <nav className="landing-nav">
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="WatMarket" 
            className="landing-logo" 
          />
          <div className="landing-nav-links">
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/register" className="btn btn-primary">Get Started</Link>
          </div>
        </nav>

        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            University Prediction Market
          </div>
          <h1 className="hero-title">
            Trade on <span className="highlight">What You Know</span>
          </h1>
          <p className="hero-subtitle">
            WatMarket is a play-money prediction market where you trade GOOS tokens 
            on real campus events. Put your knowledge to the test and climb the leaderboard.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              Start Trading
              <ChevronRight size={20} />
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Sign In
            </Link>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="stat-value">1,000</span>
              <span className="stat-label">Starting GOOS</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">YES/NO</span>
              <span className="stat-label">Binary Markets</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">CPMM</span>
              <span className="stat-label">Fair Pricing</span>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-header">
          <h2>How It Works</h2>
          <p>Simple, transparent, and fun prediction trading</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <TrendingUp size={28} />
            </div>
            <h3>Trade Predictions</h3>
            <p>
              Buy YES or NO shares on campus events. Prices reflect the crowd's 
              probability estimate and update in real-time.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Zap size={28} />
            </div>
            <h3>Instant Liquidity</h3>
            <p>
              Our automated market maker (CPMM) ensures you can always buy or sell. 
              No waiting for counterparties.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Users size={28} />
            </div>
            <h3>Community Driven</h3>
            <p>
              Suggest new markets, vote on ideas, and help shape what gets traded. 
              The best predictions come from the crowd.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Shield size={28} />
            </div>
            <h3>Play Money</h3>
            <p>
              Trade with GOOS tokens—no real money involved. Learn prediction 
              markets risk-free and compete for bragging rights.
            </p>
          </div>
        </div>
      </section>

      {/* Example Markets Section */}
      <section className="examples-section">
        <div className="section-header">
          <h2>Example Markets</h2>
          <p>See what kinds of predictions you can trade</p>
        </div>
        <div className="example-cards">
          <div className="example-card">
            <div className="example-question">
              Will the engineering building construction finish by Fall 2025?
            </div>
            <div className="example-odds">
              <div className="odds-item yes">
                <span className="odds-label">YES</span>
                <span className="odds-value">34%</span>
              </div>
              <div className="odds-item no">
                <span className="odds-label">NO</span>
                <span className="odds-value">66%</span>
              </div>
            </div>
          </div>
          <div className="example-card">
            <div className="example-question">
              Will the Warriors win the intramural basketball championship?
            </div>
            <div className="example-odds">
              <div className="odds-item yes">
                <span className="odds-label">YES</span>
                <span className="odds-value">72%</span>
              </div>
              <div className="odds-item no">
                <span className="odds-label">NO</span>
                <span className="odds-value">28%</span>
              </div>
            </div>
          </div>
          <div className="example-card">
            <div className="example-question">
              Will campus dining add a new vegan option this semester?
            </div>
            <div className="example-odds">
              <div className="odds-item yes">
                <span className="odds-label">YES</span>
                <span className="odds-value">58%</span>
              </div>
              <div className="odds-item no">
                <span className="odds-label">NO</span>
                <span className="odds-value">42%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to start trading?</h2>
          <p>Join WatMarket today and put your predictions to the test.</p>
          <Link to="/register" className="btn btn-primary btn-lg">
            Create Free Account
            <ChevronRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="WatMarket" 
            className="footer-logo" 
          />
          <p className="footer-text">
            A university-focused prediction market. Play money only.
          </p>
          <div className="footer-links">
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
