import { useMemo, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isValidNigerianPhone } from '../utils/phone.js';

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

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);

    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
      setNotice({ type: 'error', text: 'Please complete all fields.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setNotice({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    if (!isValidNigerianPhone(form.phone)) {
      setNotice({ type: 'error', text: 'Please enter a valid Nigerian phone number.' });
      return;
    }

    if (form.password.length < 8) {
      setNotice({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }

    if (form.password !== form.confirmPassword) {
      setNotice({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    try {
      setLoading(true);
      await register({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      navigate('/dashboard');
    } catch (error) {
      const responseMessage = error.response?.data?.message;
      const networkMessage = error.code === 'ECONNABORTED'
        ? 'The registration request timed out. Check your connection and try again.'
        : !error.response
          ? 'Could not reach the Jimvolt server. Check that the backend is running and try again.'
          : null;
      setNotice({
        type: 'error',
        text: responseMessage || networkMessage || 'Registration failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-wide">
        <div className="auth-header">
          <div className="auth-badge"><ShieldCheck size={22} /></div>
          <div>
            <p className="eyebrow">Create account</p>
            <h1>Start selling with Jimvolt</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="field-grid">
            <label className="field">
              <span>Full name</span>
              <input name="fullName" value={form.fullName} onChange={updateField} placeholder="Ada Okafor" />
            </label>
            <label className="field">
              <span>Email address</span>
              <input type="email" name="email" value={form.email} onChange={updateField} placeholder="you@example.com" />
            </label>
            <label className="field">
              <span>Phone number</span>
              <input name="phone" value={form.phone} onChange={updateField} placeholder="0803 123 4567" />
            </label>

            <label className="field field-password">
              <span>Password</span>
              <div className="password-wrap">
                <input type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={updateField} placeholder="Minimum 8 characters" />
                <button type="button" className="icon-btn" onClick={() => setShowPassword((current) => !current)} aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <label className="field field-password">
              <span>Confirm password</span>
              <div className="password-wrap">
                <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={form.confirmPassword} onChange={updateField} placeholder="Re-enter password" />
                <button type="button" className="icon-btn" onClick={() => setShowConfirmPassword((current) => !current)} aria-label="Toggle password visibility">
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
          </div>

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
            {loading ? <><LoaderCircle size={16} className="spin" /> Creating account...</> : 'Create my account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
