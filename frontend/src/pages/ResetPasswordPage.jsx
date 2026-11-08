import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/authService.js';

function getPasswordStrength(password) {
  let score = 0;
  if (!password) return { score: 0, label: 'No password', color: '#94A3B8' };
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score: 1, label: 'Weak', color: '#EF4444' };
  if (score === 2) return { score: 2, label: 'Fair', color: '#F59E0B' };
  if (score === 3) return { score: 3, label: 'Good', color: '#3B82F6' };
  return { score: 4, label: 'Strong', color: '#16A34A' };
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);

    if (!token) {
      setNotice({ type: 'error', text: 'Password reset token is missing or invalid.' });
      return;
    }

    if (form.password.length < 8 || form.password !== form.confirmPassword) {
      setNotice({ type: 'error', text: 'Password must be at least 8 characters and match the confirmation.' });
      return;
    }

    try {
      setLoading(true);
      const { data } = await resetPassword({ token, password: form.password, confirmPassword: form.confirmPassword });
      setNotice({ type: 'success', text: data.message || 'Password reset successful.' });
      setTimeout(() => navigate('/login'), 1200);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Unable to reset your password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Link to="/" className="auth-logo" aria-label="Jimvolt home"><img className="brand-logo auth-brand-image" src="/jimvolt-logo.png" alt="Jimvolt" /></Link>
        <div className="auth-header">
          <div className="auth-badge"><ShieldCheck size={22} /></div>
          <div>
            <p className="eyebrow">Secure password</p>
            <h1>Create a new password</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field field-password">
            <span>New password</span>
            <div className="password-wrap">
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Minimum 8 characters" />
              <button type="button" className="icon-btn" onClick={() => setShowPassword((current) => !current)} aria-label="Toggle password visibility">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="field field-password">
            <span>Confirm password</span>
            <div className="password-wrap">
              <input type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Re-enter password" />
              <button type="button" className="icon-btn" onClick={() => setShowConfirmPassword((current) => !current)} aria-label="Toggle password visibility">
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {form.password && (
            <div className="strength-box" aria-live="polite">
              <div className="strength-bar">
                <span style={{ width: `${(strength.score / 4) * 100}%`, background: strength.color }} />
              </div>
              <div className="strength-copy">
                <strong>Password strength:</strong> {strength.label}
                {strength.score >= 3 && <CheckCircle2 size={16} className="ok" />}
              </div>
            </div>
          )}

          {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? <><LoaderCircle size={16} className="spin" /> Updating password...</> : 'Reset password'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
