import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import logoDark from './assets/watmarket_dark.png';
import logoLight from './assets/watmarket_light.png';
import Login from './pages/Login';
import Register from './pages/Register';
import Lines from './pages/Lines';
import LineDetail from './pages/LineDetail';
import CreateLine from './pages/CreateLine';
import Portfolio from './pages/Portfolio';
import Admin from './pages/Admin';
import LoadingSpinner from './components/LoadingSpinner';
import './App.css';

const queryClient = new QueryClient();

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
          <span className="icon">📈</span>
          <span className="nav-label">Markets</span>
        </Link>
        <Link to="/dashboard" className={`nav-item ${isActive('/dashboard')}`}>
          <span className="icon">👤</span>
          <span className="nav-label">Portfolio</span>
        </Link>
        {user.is_admin && (
          <Link to="/admin" className={`nav-item ${isActive('/admin')}`}>
            <span className="icon">🛠️</span>
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
            <span className="label">GOOS</span>
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
  
  if (isLoading) return <LoadingSpinner fullScreen />;
  if (!user) return <Navigate to="/login" />;
  
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route path="/" element={<Layout><Lines /></Layout>} />
        <Route path="/lines/:id" element={<Layout><LineDetail /></Layout>} />
        <Route path="/lines/create" element={<Layout><CreateLine /></Layout>} />
        <Route path="/dashboard" element={<Layout><Portfolio /></Layout>} />
        <Route path="/admin" element={<Layout><Admin /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
