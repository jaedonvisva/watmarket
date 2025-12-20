import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import WelcomeModal, { useOnboarding } from './components/WelcomeModal';
import { useCurrentTime } from './hooks/useCurrentTime';
import logoDark from './assets/watmarket_dark.png';
import logoLight from './assets/watmarket_light.png';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Markets from './pages/Markets';
import LineDetail from './pages/LineDetail';
import CreateLine from './pages/CreateLine';
import Portfolio from './pages/Portfolio';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import AdminSuggestions from './pages/AdminSuggestions';
import SuggestLine from './pages/SuggestLine';
import MySuggestions from './pages/MySuggestions';
import Leaderboard from './pages/Leaderboard';
import LoadingSpinner from './components/LoadingSpinner';
import './App.css';

const queryClient = new QueryClient();

function Clock() {
  const time = useCurrentTime();

  return (
    <div className="sidebar-clock">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
}

function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link to="/" className="brand-link">
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="WatMarket" 
            className="brand-logo" 
          />
        </Link>
      </div>

      <div className="sidebar-nav">
        <Link to="/" className={`nav-item ${isActive('/')}`}>
          <span className="nav-label">Home</span>
        </Link>
        <Link to="/markets" className={`nav-item ${isActive('/markets')}`}>
          <span className="nav-label">Markets</span>
        </Link>
        <Link to="/portfolio" className={`nav-item ${isActive('/portfolio')}`}>
          <span className="nav-label">Portfolio</span>
        </Link>
        <Link to="/leaderboard" className={`nav-item ${isActive('/leaderboard')}`}>
          <span className="nav-label">Leaderboard</span>
        </Link>
        <Link to="/suggestions/my" className={`nav-item ${isActive('/suggestions/my')}`}>
          <span className="nav-label">My Suggestions</span>
        </Link>
        {user.is_admin && (
          <Link to="/admin" className={`nav-item ${isActive('/admin')}`}>
            <span className="nav-label">Admin</span>
          </Link>
        )}
      </div>

      <div className="sidebar-footer">
        <button 
          onClick={toggleTheme} 
          className="theme-toggle-btn"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          <span className="nav-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        <div className="sidebar-footer-content">
          <Clock />
          <div className="user-balance">
            <span className="currency">GOOS</span>
            <span className="amount">{user.karma_balance.toLocaleString()}</span>
          </div>
          <button onClick={logout} className="logout-btn">
            <span className="nav-label">Sign Out</span>
            <span className="icon-only">🚪</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { showWelcome, completeOnboarding } = useOnboarding(user?.id);
  
  if (isLoading) return <LoadingSpinner fullScreen />;
  if (!user) return <Navigate to="/" />;
  
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
      {showWelcome && <WelcomeModal onComplete={completeOnboarding} />}
    </div>
  );
}

function HomePage() {
  const { user, isLoading } = useAuth();
  const { showWelcome, completeOnboarding } = useOnboarding(user?.id);
  
  if (isLoading) return <LoadingSpinner fullScreen />;
  
  if (!user) {
    return <Landing />;
  }
  
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Dashboard />
      </main>
      {showWelcome && <WelcomeModal onComplete={completeOnboarding} />}
    </div>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        <Route path="/markets" element={<Layout><Markets /></Layout>} />
        <Route path="/markets/:id" element={<Layout><LineDetail /></Layout>} />
        <Route path="/lines/:id" element={<Layout><LineDetail /></Layout>} />
        <Route path="/markets/create" element={<Layout><CreateLine /></Layout>} />
        <Route path="/markets/suggest" element={<Layout><SuggestLine /></Layout>} />
        <Route path="/suggestions/my" element={<Layout><MySuggestions /></Layout>} />
        <Route path="/portfolio" element={<Layout><Portfolio /></Layout>} />
        <Route path="/leaderboard" element={<Layout><Leaderboard /></Layout>} />
        <Route path="/admin" element={<Layout><Admin /></Layout>} />
        <Route path="/admin/suggestions" element={<Layout><AdminSuggestions /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
