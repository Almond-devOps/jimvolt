import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="auth-shell"><div className="auth-card loading-card">Loading your account...</div></div>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate
      to={adminOnly ? '/admin/login' : '/login'}
      replace
      state={{ from: `${location.pathname}${location.search}` }}
    />;
  }

  if (adminOnly && !['admin', 'super_admin'].includes(user.role)) {
    return <Navigate to="/admin/login" replace state={{ unauthorized: true }} />;
  }

  return children;
}
