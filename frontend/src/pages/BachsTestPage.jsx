import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api.js';

export default function BachsTestPage() {
  const [searchParams] = useSearchParams();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const status = searchParams.get('status');

  async function startCheckout(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/tests/bachs/checkout', { amount });
      window.location.assign(data.checkoutUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not create a Bachs checkout. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="container section bachs-test-page">
      <article className="panel bachs-test-panel">
        <p className="eyebrow">PAYMENT TEST</p>
        <h1>Bachs checkout test</h1>
        <p className="muted">Enter a Naira amount to create a sandbox checkout. You will be redirected to Bachs to complete the test.</p>

        {status === 'returned' && (
          <div className="notice success" role="status">
            You returned from checkout. This does not confirm that a payment was completed.
          </div>
        )}
        {status === 'cancelled' && (
          <div className="notice" role="status">Checkout was cancelled.</div>
        )}
        {error && <div className="notice error" role="alert">{error}</div>}

        <form className="bachs-test-form" onSubmit={startCheckout}>
          <label className="field" htmlFor="bachs-amount">
            <span>Amount (NGN)</span>
            <input
              id="bachs-amount"
              type="number"
              min="0.01"
              max="999999999.99"
              step="0.01"
              inputMode="decimal"
              placeholder="1000.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating checkout…' : 'Create checkout and continue'}
          </button>
        </form>

        <p className="bachs-test-note">This page only accepts sandbox credentials. Do not enter real payment details outside the Bachs sandbox.</p>
      </article>
    </main>
  );
}
