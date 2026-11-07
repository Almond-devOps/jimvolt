import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../services/authService.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, refreshUser } = useAuth();
  const [status, setStatus] = useState({ loading: true, message: '' });
  const token = searchParams.get('token');

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus({ loading: false, message: 'The email verification link is missing its token.' });
      return () => { active = false; };
    }

    verifyEmail(token)
      .then(async ({ data }) => {
        if (isAuthenticated) await refreshUser();
        if (active) setStatus({ loading: false, message: data.message });
      })
      .catch((error) => active && setStatus({
        loading: false,
        message: error.response?.data?.message || 'Email verification failed. Request a new link from account settings.',
      }));
    return () => { active = false; };
  }, [isAuthenticated, refreshUser, token]);

  return (
    <div className="auth-shell"><section className="auth-card">
      <p className="eyebrow">Jimvolt account</p>
      <h1>Verify your email</h1>
      {status.loading ? <p className="muted">Checking your verification link...</p> : <><p className={status.message.includes('verified') ? 'notice success' : 'notice error'} role="status">{status.message}</p><Link className="btn btn-primary auth-submit" to={isAuthenticated ? '/account-settings' : '/login'}>{isAuthenticated ? 'Return to account settings' : 'Sign in'}</Link></>}
    </section></div>
  );
}
