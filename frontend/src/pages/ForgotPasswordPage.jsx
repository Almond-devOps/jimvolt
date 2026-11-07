import { useState } from 'react';
import { LoaderCircle, MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/authService.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);

    try {
      setLoading(true);
      const { data } = await requestPasswordReset(email);
      setNotice({ type: 'success', text: data.message || 'Password reset link sent.' });
      setEmail('');
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.response?.data?.message || 'Unable to process your request right now.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-badge"><MailCheck size={22} /></div>
          <div>
            <p className="eyebrow">Password recovery</p>
            <h1>Reset your password</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>

          {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? <><LoaderCircle size={16} className="spin" /> Sending reset link...</> : 'Send reset link'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
