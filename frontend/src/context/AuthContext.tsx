import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../api/client';
import { authApi } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initialize state from localStorage synchronously to avoid flash
const getInitialToken = () => localStorage.getItem('access_token');
const getInitialUser = (): User | null => {
  const stored = localStorage.getItem('user');
  return stored ? JSON.parse(stored) : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getInitialUser);
  const [token, setToken] = useState<string | null>(getInitialToken);
  const [isLoading] = useState(false);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const { access_token, user } = response.data;
    
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('user', JSON.stringify(user));
    
    setToken(access_token);
    setUser(user);
  };

  const register = async (email: string, password: string, display_name: string) => {
    const response = await authApi.register(email, password, display_name);
    const { access_token, user } = response.data;
    
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('user', JSON.stringify(user));
    
    setToken(access_token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const response = await authApi.getMe();
      setUser(response.data);
      localStorage.setItem('user', JSON.stringify(response.data));
    } catch {
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
