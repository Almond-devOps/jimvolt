import { useState } from 'react';
import { Eye, EyeOff, LoaderCircle, ShieldCheck, Zap } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminLoginPage() {
  const { loginAdmin, loading: authLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(
    location.state?.unauthorized ? 'This account does not have administrator access.' : '',
  );

  if (authLoading) {
    return <main className="admin-login-page"><div className="admin-login-card loading-card">Checking your session...</div></main>;
  }
  if (isAuthenticated && ['admin', 'super_admin'].includes(user?.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginAdmin({ email, password, rememberMe });
      const destination = location.state?.from?.startsWith('/admin/')
        ? location.state.from
        : '/admin/dashboard';
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Administrator sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <Link to="/" className="logo admin-login-logo" aria-label="Jimvolt homepage">
          <span className="logo-mark"><Zap size={21} fill="white" aria-hidden="true" /></span>
          Jimvolt
        </Link>
        <div className="admin-login-heading">
          <span className="admin-login-icon"><ShieldCheck size={23} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">Secure administrator access</p>
            <h1 id="admin-login-title">Sign in to Admin</h1>
          </div>
        </div>
        <p className="muted">Use your authorized administrator account to continue.</p>

        <form className="auth-form admin-login-form" onSubmit={submit}>
          <label className="field" htmlFor="admin-email">
            <span>Email address</span>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className="field" htmlFor="admin-password">
            <span>Password</span>
            <div className="password-wrap">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <label className="check-row admin-remember">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span>Remember me on this device</span>
          </label>
          {error && <div className="notice error" role="alert">{error}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? <><LoaderCircle size={17} className="spin" /> Signing in...</>
              : 'Sign in securely'}
          </button>
        </form>
        <p className="admin-login-footer"><Link to="/">Return to Jimvolt marketplace</Link></p>
      </section>
    </main>
  );
}
