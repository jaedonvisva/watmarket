import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Lines from './pages/Lines';
import LineDetail from './pages/LineDetail';
import CreateLine from './pages/CreateLine';
import Dashboard from './pages/Dashboard';
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
  const location = useLocation();

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link to="/" className="brand">WatMarket</Link>
      </div>

      <div className="sidebar-nav">
        <Link to="/" className={`nav-item ${isActive('/')}`}>
          <span className="icon">📈</span> Markets
        </Link>
        <Link to="/dashboard" className={`nav-item ${isActive('/dashboard')}`}>
          <span className="icon">👤</span> Portfolio
        </Link>
        {user.is_admin && (
          <Link to="/lines/create" className={`nav-item ${isActive('/lines/create')}`}>
            <span className="icon">⚡</span> Create Market
          </Link>
        )}
      </div>

      <div className="sidebar-footer">
        <Clock />
        <div className="user-balance">
          <span className="label">Balance</span>
          <span className="amount">{user.karma_balance.toLocaleString()}</span>
          <span className="currency">WARRIORS</span>
        </div>
        <button onClick={logout} className="logout-btn">Sign Out</button>
      </div>
    </aside>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="loading-screen">Loading...</div>;
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
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
