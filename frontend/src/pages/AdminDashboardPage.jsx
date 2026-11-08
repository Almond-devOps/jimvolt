import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, BriefcaseBusiness, ClipboardList, CreditCard, RefreshCw, ShieldCheck, Users, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import { formatNaira } from '../utils/format.js';

const metrics = [
  { key: 'totalUsers', label: 'Total users', icon: Users },
  { key: 'sellers', label: 'Sellers', icon: BriefcaseBusiness },
  { key: 'totalAdvertisements', label: 'Total advertisements', icon: BriefcaseBusiness },
  { key: 'pendingAdvertisements', label: 'Pending advertisements', icon: ClipboardList },
  { key: 'verifiedBusinesses', label: 'Verified businesses', icon: BadgeCheck },
  { key: 'openReports', label: 'Open reports', icon: ShieldCheck },
];

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/dashboard');
      setDashboard(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) return <div className="admin-loading"><span className="skeleton" />Loading dashboard data...</div>;
  if (error) return <div className="notice error" role="alert">{error} <button type="button" className="admin-inline-button" onClick={loadDashboard}>Try again</button></div>;
  if (!dashboard) return null;

  const stats = dashboard.stats || {};
  return (
    <section>
      <header className="admin-page-heading">
        <div><p className="eyebrow">OVERVIEW</p><h1>Administrator dashboard</h1><p className="muted">Live marketplace totals from the Jimvolt database.</p></div>
        <button type="button" className="btn btn-white" onClick={loadDashboard}><RefreshCw size={16} /> Refresh data</button>
      </header>
      <div className="admin-metrics">
        {metrics.map(({ key, label, icon: Icon }) => (
          <article className="admin-metric-card" key={key}>
            <span className="admin-metric-icon"><Icon size={20} aria-hidden="true" /></span>
            <span><small>{label}</small><strong>{Number(stats[key] || 0).toLocaleString('en-NG')}</strong></span>
          </article>
        ))}
        <article className="admin-metric-card">
          <span className="admin-metric-icon"><CreditCard size={20} aria-hidden="true" /></span>
          <span><small>Verified revenue</small><strong>{formatNaira(stats.revenue || 0)}</strong></span>
        </article>
        <article className="admin-metric-card">
          <span className="admin-metric-icon"><CreditCard size={20} aria-hidden="true" /></span>
          <span><small>Successful payments</small><strong>{Number(stats.successfulPayments || 0).toLocaleString('en-NG')}</strong></span>
        </article>
        <article className="admin-metric-card">
          <span className="admin-metric-icon"><TrendingUp size={20} aria-hidden="true" /></span>
          <span><small>Active promotions</small><strong>{Number(stats.activePromotions || 0).toLocaleString('en-NG')}</strong></span>
        </article>
      </div>
      <AdminAnalytics />
      <MonetizationSummary />
      <div className="admin-dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><h2>Recent advertisements</h2><p className="muted">Latest listings across the marketplace.</p></div></div>
          {dashboard.recentAdvertisements?.length ? (
            <div className="table-wrap"><table><thead><tr><th>Advertisement</th><th>Seller</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>{dashboard.recentAdvertisements.map((ad) => <tr key={ad.id}>
                <td><strong>{ad.title}</strong><small className="admin-table-sub">{ad.category_name} · {formatNaira(ad.price)}</small></td>
                <td>{ad.seller_name}</td><td><span className={`status status-${ad.status}`}>{ad.status}</span></td>
                <td>{new Date(ad.created_at).toLocaleDateString('en-NG')}</td>
              </tr>)}</tbody>
            </table></div>
          ) : <p className="muted">No advertisements have been posted yet.</p>}
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2>Recent users</h2><p className="muted">Newest marketplace accounts.</p></div></div>
          {dashboard.recentUsers?.length ? (
            <ul className="admin-recent-users">{dashboard.recentUsers.map((account) => (
              <li key={account.id}><span className="admin-avatar">{account.full_name?.trim()?.[0]?.toUpperCase() || 'U'}</span>
                <span><strong>{account.full_name}</strong><small>{account.email}</small></span>
                <span className={`status status-${account.account_status}`}>{account.role.replace('_', ' ')}</span>
              </li>
            ))}</ul>
          ) : <p className="muted">No users have registered yet.</p>}
        </section>
        <section className="panel admin-attention-panel">
          <div className="panel-header"><div><h2>Verification queue</h2><p className="muted">Applications awaiting review.</p></div><Link className="link" to="/admin/verifications">View all</Link></div>
          {dashboard.pendingVerifications?.length ? (
            <ul className="admin-recent-users">{dashboard.pendingVerifications.map((application) => (
              <li key={application.id}>
                <span className="admin-avatar"><ShieldCheck size={17} aria-hidden="true" /></span>
                <span><strong>{application.business_name || 'Business application'}</strong><small>{application.full_name} · {new Date(application.submitted_at).toLocaleDateString('en-NG')}</small></span>
                <Link className="admin-review-shortcut" to={`/admin/verifications/${application.id}`}>Review</Link>
              </li>
            ))}</ul>
          ) : <p className="muted">No applications are waiting for review.</p>}
        </section>
      </div>
    </section>
  );
}

const chartSeries = [
  { key: 'registrations', label: 'User registrations', color: '#1264D8' },
  { key: 'advertisementGrowth', label: 'Advertisements', color: '#16A36A' },
  { key: 'revenue', label: 'Verified revenue', color: '#8B5CF6' },
];

function MonetizationSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/admin/monetization')
      .then(({ data }) => active && setSummary(data))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load monetization summary.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <section className="panel admin-analytics-panel"><div className="loading-card">Loading monetization summary...</div></section>;
  if (error) return <section className="panel admin-analytics-panel"><div className="notice error" role="alert">{error}</div></section>;
  if (!summary) return null;

  const stats = summary.stats || {};
  return <section className="panel admin-analytics-panel">
    <div className="panel-header"><div><h2>Revenue & Monetization</h2><p className="muted">Successful payment value, active campaigns and recent performance.</p></div></div>
    <div className="stats-grid analytics-summary">
      <StatCardMini label="Total revenue" value={formatNaira(stats.revenue || 0)} />
      <StatCardMini label="Today" value={formatNaira(stats.todayRevenue || 0)} />
      <StatCardMini label="Monthly" value={formatNaira(stats.monthRevenue || 0)} />
      <StatCardMini label="Pending" value={Number(stats.pendingPayments || 0).toLocaleString('en-NG')} />
      <StatCardMini label="Failed" value={Number(stats.failedPayments || 0).toLocaleString('en-NG')} />
    </div>
    {summary.topPromotions?.length ? (
      <div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Seller</th><th>Impressions</th><th>Clicks</th></tr></thead><tbody>{summary.topPromotions.map((item) => (
        <tr key={item.id}><td>{item.title || 'Promotion'}</td><td>{item.seller_name}</td><td>{Number(item.impressions || 0).toLocaleString('en-NG')}</td><td>{Number(item.clicks || 0).toLocaleString('en-NG')}</td></tr>
      ))}</tbody></table></div>
    ) : <p className="muted">No active promotions are available yet.</p>}
  </section>;
}

function StatCardMini({ label, value }) {
  return <div className="stat-card"><div className="stat-icon"><CreditCard size={18} /></div><div><p>{label}</p><strong>{value}</strong></div></div>;
}

function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seriesKey, setSeriesKey] = useState('registrations');
  const [months, setMonths] = useState(12);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/analytics');
      setAnalytics(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load marketplace analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const selectedSeries = chartSeries.find((item) => item.key === seriesKey) || chartSeries[0];
  const rows = (analytics?.[selectedSeries.key] || []).slice(-months);
  const maxValue = Math.max(1, ...rows.map((item) => Number(item.total || 0)));
  const points = rows.map((item, index) => {
    const x = rows.length <= 1 ? 360 : 16 + (index / (rows.length - 1)) * 688;
    const y = 172 - (Number(item.total || 0) / maxValue) * 148;
    return `${x},${y}`;
  }).join(' ');
  const total = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const periodLabel = (period) => {
    const date = new Date(`${period}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? period : date.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' });
  };
  const formatValue = (value) => seriesKey === 'revenue' ? formatNaira(value) : Number(value || 0).toLocaleString('en-NG');

  return (
    <section className="panel admin-analytics-panel">
      <div className="admin-analytics-heading">
        <div><h2>Marketplace trends</h2><p className="muted">Historical totals from recorded platform activity.</p></div>
        <label className="admin-range-select"><span className="sr-only">Chart time range</span><select value={months} onChange={(event) => setMonths(Number(event.target.value))}><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="24">Last 24 months</option></select></label>
      </div>
      <div className="admin-chart-tabs" role="group" aria-label="Select trend metric">
        {chartSeries.map((series) => <button key={series.key} type="button" className={seriesKey === series.key ? 'active' : ''} onClick={() => setSeriesKey(series.key)}>{series.label}</button>)}
      </div>
      {error && <div className="notice error" role="alert">{error}<button type="button" className="admin-inline-button" onClick={loadAnalytics}>Try again</button></div>}
      {loading ? <div className="admin-chart-loading" role="status">Loading marketplace trends...</div> : !error && (
        <div className="admin-chart-content">
          <div className="admin-chart-summary"><strong>{formatValue(total)}</strong><span>{selectedSeries.label.toLowerCase()} in displayed period</span></div>
          {!rows.length || !total ? <p className="muted">No recorded data is available for this period.</p> : (
            <>
              <div className="admin-chart-plot">
                <svg viewBox="0 0 720 190" role="img" aria-label={`${selectedSeries.label} by month`}>
                  {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2="720" y1={24 + line * 49} y2={24 + line * 49} className="admin-chart-gridline" />)}
                  <polyline points={points} fill="none" stroke={selectedSeries.color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                  {rows.map((item, index) => {
                    const x = rows.length <= 1 ? 360 : 16 + (index / (rows.length - 1)) * 688;
                    const y = 172 - (Number(item.total || 0) / maxValue) * 148;
                    return <circle key={item.period} cx={x} cy={y} r="4" fill={selectedSeries.color}><title>{periodLabel(item.period)}: {formatValue(item.total)}</title></circle>;
                  })}
                </svg>
              </div>
              <div className="admin-chart-axis"><span>{periodLabel(rows[0]?.period)}</span>{rows.length > 2 && <span>{periodLabel(rows[Math.floor(rows.length / 2)]?.period)}</span>}<span>{periodLabel(rows.at(-1)?.period)}</span></div>
            </>
          )}
        </div>
      )}
      {analytics?.notes?.revenue && seriesKey === 'revenue' && <p className="admin-chart-note">{analytics.notes.revenue}</p>}
    </section>
  );
}
