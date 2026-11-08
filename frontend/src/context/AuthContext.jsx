import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, loginAdministrator, loginUser, logoutUser, registerUser } from '../services/authService.js';
import { getConversations } from '../services/messageService.js';
import { getFavorites } from '../services/userService.js';

const AuthContext = createContext(null);

const getStoredUser = () => {
  const cachedUser = localStorage.getItem('jimvolt_user') || sessionStorage.getItem('jimvolt_user');
  if (!cachedUser) return null;
  try {
    return JSON.parse(cachedUser);
  } catch {
    localStorage.removeItem('jimvolt_user');
    sessionStorage.removeItem('jimvolt_user');
    return null;
  }
};

const getStoredToken = () => localStorage.getItem('jimvolt_token') || sessionStorage.getItem('jimvolt_token');

const persistAuth = (nextUser, nextToken, rememberMe = true) => {
  const store = rememberMe ? localStorage : sessionStorage;
  store.setItem('jimvolt_user', JSON.stringify(nextUser));
  store.setItem('jimvolt_token', nextToken);
  if (rememberMe) {
    sessionStorage.removeItem('jimvolt_user');
    sessionStorage.removeItem('jimvolt_token');
  } else {
    localStorage.removeItem('jimvolt_user');
    localStorage.removeItem('jimvolt_token');
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const socketRef = useRef(null);

  const refreshFavorites = useCallback(async () => {
    if (!token || !user) {
      setFavoriteIds([]);
      setFavoriteCount(0);
      setFavoritesLoaded(false);
      return;
    }
    const { data } = await getFavorites({ limit: 1 });
    setFavoriteIds((data.favoriteIds || []).map(String));
    setFavoriteCount(Number(data.total || 0));
    setFavoritesLoaded(true);
  }, [token, user?.id]);

  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('jimvolt_token');
      localStorage.removeItem('jimvolt_user');
      sessionStorage.removeItem('jimvolt_token');
      sessionStorage.removeItem('jimvolt_user');
      setToken(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('jimvolt:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('jimvolt:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    getCurrentUser()
      .then(({ data }) => {
        if (!active) return;
        setUser(data.user);
        const storage = localStorage.getItem('jimvolt_token') ? localStorage : sessionStorage;
        storage.setItem('jimvolt_user', JSON.stringify(data.user));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem('jimvolt_token');
        localStorage.removeItem('jimvolt_user');
        sessionStorage.removeItem('jimvolt_token');
        sessionStorage.removeItem('jimvolt_user');
        setToken(null);
        setUser(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    let connection;
    if (!token || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setUnreadMessageCount(0);
      return () => { active = false; };
    }

    const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (apiUrl.startsWith('/') ? '' : apiUrl.replace(/\/api\/?$/, ''));
    const refreshUnread = () => {
      getConversations()
        .then(({ data }) => setUnreadMessageCount(Number(data.unreadCount || 0)))
        .catch((error) => console.error('Could not refresh the unread message count:', error.message));
    };

    if (!socketUrl) {
      refreshUnread();
      return () => { active = false; };
    }

    import('socket.io-client')
      .then(({ io }) => {
        if (!active) return;
        connection = io(socketUrl, { autoConnect: false, auth: { token } });
        socketRef.current = connection;
        setSocket(connection);
        connection.on('messages:unread_count', ({ count }) => {
          setUnreadMessageCount(Number(count || 0));
        });
        connection.on('connect', refreshUnread);
        connection.connect();
        refreshUnread();
      })
      .catch((error) => {
        if (active) console.error('Could not initialize real-time messaging:', error.message);
      });

    return () => {
      active = false;
      connection?.disconnect();
      if (socketRef.current === connection) socketRef.current = null;
      setSocket((current) => current === connection ? null : current);
    };
  }, [token, user?.id]);

  useEffect(() => {
    let active = true;
    if (!token || !user) {
      setFavoriteIds([]);
      setFavoriteCount(0);
      setFavoritesLoaded(false);
      return () => { active = false; };
    }
    refreshFavorites()
      .catch((error) => {
        if (active) console.error('Could not load saved product state:', error.message);
      })
    return () => { active = false; };
  }, [refreshFavorites]);

  const login = async (payload) => {
    const { data } = await loginUser(payload);
    const rememberMe = Boolean(payload.rememberMe);
    persistAuth(data.user, data.token, rememberMe);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const loginAdmin = async (payload) => {
    const { data } = await loginAdministrator({ email: payload.email, password: payload.password });
    const rememberMe = Boolean(payload.rememberMe);
    persistAuth(data.user, data.token, rememberMe);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await registerUser(payload);
    persistAuth(data.user, data.token, true);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const logout = useCallback(() => {
    const activeToken = token || getStoredToken();
    if (activeToken) {
      logoutUser(activeToken).catch((error) => {
        console.error('Could not invalidate the server session:', error.message);
      });
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setUser(null);
    setToken(null);
    setUnreadMessageCount(0);
    setFavoriteIds([]);
    setFavoriteCount(0);
    setFavoritesLoaded(false);
    localStorage.removeItem('jimvolt_user');
    localStorage.removeItem('jimvolt_token');
    localStorage.removeItem('jimvolt_recently_viewed');
    sessionStorage.removeItem('jimvolt_user');
    sessionStorage.removeItem('jimvolt_token');
    sessionStorage.removeItem('jimvolt_recently_viewed');
  }, [token]);

  const refreshUser = useCallback(async (updatedUser) => {
    if (!token) return null;
    const userToSet = updatedUser || (await getCurrentUser()).data.user;
    setUser(userToSet);
    const storage = localStorage.getItem('jimvolt_token') ? localStorage : sessionStorage;
    storage.setItem('jimvolt_user', JSON.stringify(userToSet));
    return userToSet;
  }, [token]);

  const setFavorite = useCallback((advertisementId, saved) => {
    const id = String(advertisementId);
    const existed = favoriteIds.includes(id);
    setFavoriteIds((current) => {
      const exists = current.includes(id);
      if (saved && !exists) return [...current, id];
      if (!saved && exists) return current.filter((item) => item !== id);
      return current;
    });
    if (saved && !existed) setFavoriteCount((count) => count + 1);
    if (!saved && existed) setFavoriteCount((count) => Math.max(0, count - 1));
    setFavoritesLoaded(true);
  }, [favoriteIds]);

  const value = useMemo(() => ({
    user,
    token,
    socket,
    unreadMessageCount,
    setUnreadMessageCount,
    favoriteIds,
    favoritesLoaded,
    favoriteCount,
    setFavorite,
    refreshFavorites,
    loading,
    isAuthenticated: Boolean(user && token),
    login,
    loginAdmin,
    register,
    logout,
    refreshUser,
  }), [user, token, socket, unreadMessageCount, favoriteIds, favoriteCount, favoritesLoaded, setFavorite, refreshFavorites, logout, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
