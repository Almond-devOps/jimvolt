import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Bell, BriefcaseBusiness, CheckCircle2, CircleHelp, Eye, FileCheck2, FolderOpen,
  Globe2, LayoutDashboard, LogOut, Menu, MessageSquareText, Plus, Search, Settings, ShieldCheck,
  TimerReset, Trash2, UserCircle2, X, XCircle, Copy, Pause, Play, Pencil, ExternalLink,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getCategories } from '../services/listingService.js';
import { deleteAd } from '../services/listingService.js';
import {
  duplicateSellerAd, getAdvertisementAnalytics, getBusinessProfile, getSellerAds,
  getSellerAnalytics, getSellerDashboard, getSellerNotifications, getSellerVerification,
  markSellerNotificationRead, saveBusinessProfile, submitSellerVerification, updateSellerVerification,
  updateSellerAdStatus,
} from '../services/sellerService.js';
import { NIGERIAN_STATES } from '../utils/constants.js';
import { formatNaira } from '../utils/format.js';
import { resolveImageUrl } from '../utils/imageUrl.js';
import VerifiedBusinessBadge from '../components/VerifiedBusinessBadge.jsx';

const navigation = [
  { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { label: 'My Advertisements', path: '/dashboard/ads', icon: FolderOpen },
  { label: 'Post New Ad', path: '/post-ad', icon: Plus },
  { label: 'Messages', path: '/messages', icon: MessageSquareText },
  { label: 'Analytics', path: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Business Profile', path: '/dashboard/business-profile', icon: BriefcaseBusiness },
  { label: 'Verification', path: '/dashboard/verification', icon: FileCheck2 },
  { label: 'Notifications', path: '/dashboard/notifications', icon: Bell },
  { label: 'Account Settings', path: '/account-settings', icon: Settings },
];

const sectionTitles = {
  '/dashboard': 'Overview',
  '/dashboard/ads': 'My Advertisements',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/business-profile': 'Business Profile',
  '/dashboard/verification': 'Seller Verification',
  '/dashboard/notifications': 'Notifications',
};

function messageFrom(error, fallback) {
  return error.response?.data?.message || fallback;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAnalyticsPath = location.pathname.startsWith('/dashboard/analytics');
  const [unread, setUnread] = useState(0);
  const [unreadError, setUnreadError] = useState('');
  const [toast, setToast] = useState(location.state?.notice || '');
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = isAnalyticsPath ? 'Analytics' : sectionTitles[location.pathname] || 'Overview';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileOpen]);

  useEffect(() => {
    let active = true;
    setUnreadError('');
    getSellerNotifications()
      .then(({ data }) => active && setUnread(data.notifications.filter((item) => !item.is_read).length))
      .catch((requestError) => {
        if (active) setUnreadError(requestError.response?.data?.message || 'Notification status could not be loaded.');
      });
    return () => { active = false; };
  }, [location.pathname]);

  const signOut = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={`dashboard-shell seller-dashboard-shell${mobileOpen ? ' mobile-open' : ''}`}>
      {mobileOpen && <button className="seller-drawer-overlay" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className="dashboard-sidebar seller-sidebar" id="seller-navigation">
        <div className="seller-sidebar-heading">
          <Link to="/" className="dashboard-brand" onClick={() => setMobileOpen(false)}>Jimvolt</Link>
          <button type="button" className="seller-drawer-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <div className="seller-mini-profile">
          {user?.profile_image ? <img src={user.profile_image} alt="" /> : <span>{user?.full_name?.[0] || 'S'}</span>}
          <div><strong>{user?.full_name || 'Seller'} <VerifiedBusinessBadge verified={Boolean(user?.is_verified)} /></strong><small>Seller account</small></div>
        </div>
        <nav className="dashboard-nav" aria-label="Seller dashboard">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink key={label} to={path} end={path === '/dashboard'} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive || (path === '/dashboard/analytics' && isAnalyticsPath) ? 'active' : ''}>
              <Icon size={18} /><span>{label}</span>
              {label === 'Notifications' && unread > 0 && <span className="notification-count">{unread}</span>}
            </NavLink>
          ))}
          {user?.role === 'admin' && <Link to="/admin" onClick={() => setMobileOpen(false)}><ShieldCheck size={18} /><span>Admin review</span></Link>}
          <button type="button" className="dashboard-logout" onClick={signOut}><LogOut size={18} /><span>Logout</span></button>
        </nav>
      </aside>

      <main className="dashboard-main seller-dashboard-main">
        <header className="dashboard-header seller-dashboard-header">
          <button type="button" className="seller-mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="seller-navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={21} />
          </button>
          <div>
            <p className="eyebrow"><Link to="/dashboard">Dashboard</Link> / {title}</p>
            <h1>{title === 'Overview' ? `Welcome back, ${user?.full_name?.split(' ')[0] || 'seller'}.` : title}</h1>
          </div>
          <div className="dashboard-header-actions">
            <Link to="/dashboard/notifications" className="icon-link" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell size={20} />{unread > 0 && <span>{unread}</span>}
            </Link>
            <Link to="/post-ad" className="btn btn-primary seller-post-ad" aria-label="Post a new advertisement"><Plus size={17} /><span className="seller-post-ad-label">Post new ad</span></Link>
          </div>
        </header>
        {toast && <div className="notice success dashboard-toast" role="status">{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss"><X size={15} /></button></div>}
        {unreadError && <div className="notice error dashboard-toast" role="alert">{unreadError}</div>}
        {location.pathname === '/dashboard' && <Overview setToast={setToast} />}
        {location.pathname === '/dashboard/ads' && <AdvertisementManagement setToast={setToast} />}
        {isAnalyticsPath && <Analytics />}
        {location.pathname === '/dashboard/business-profile' && <BusinessProfile setToast={setToast} />}
        {location.pathname === '/dashboard/verification' && <Verification setToast={setToast} />}
        {location.pathname === '/dashboard/notifications' && <Notifications setUnread={setUnread} />}
      </main>
    </div>
  );
}

function Overview({ setToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getSellerDashboard()
      .then(({ data: result }) => active && setData(result))
      .catch((requestError) => active && setError(messageFrom(requestError, 'Unable to load your seller dashboard.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const stats = data?.stats || {};
  const cards = [
    { label: 'Total advertisements', value: stats.totalAdvertisements, icon: FolderOpen },
    { label: 'Active', value: stats.activeAdvertisements, icon: CheckCircle2 },
    { label: 'Pending review', value: stats.pendingAdvertisements, icon: TimerReset },
    { label: 'Rejected', value: stats.rejectedAdvertisements, icon: XCircle },
    { label: 'Product views', value: stats.totalProductViews, icon: Eye },
    { label: 'Buyer enquiries', value: stats.totalEnquiries, icon: MessageSquareText },
  ];

  if (loading) return <div className="dashboard-loading"><div className="stats-grid">{cards.map(({ label }) => <div className="stat-card skeleton" key={label} />)}</div><div className="panel loading-card">Loading live seller data...</div></div>;
  return <>
    {error && <div className="notice error" role="alert">{error}</div>}
    <section className="stats-grid seller-stats-grid">
      {cards.map(({ label, value = 0, icon }) => <StatCard key={label} label={label} value={value} Icon={icon} />)}
    </section>
    <div className="dashboard-content-grid">
      <section className="panel dashboard-panel">
        <div className="panel-header"><div><h2>Recent advertisements</h2><p className="muted">Your latest listings and review status</p></div><Link className="link" to="/dashboard/ads">Manage all</Link></div>
        {!data?.recentAdvertisements?.length ? <div className="empty small">No advertisements yet. Post your first product to get started.</div> : <div className="table-wrap">
          <table><thead><tr><th>Advertisement</th><th>Status</th><th>Views</th><th>Enquiries</th><th /></tr></thead><tbody>
            {data.recentAdvertisements.map((ad) => <tr key={ad.id}>
              <td><div className="seller-ad-title">{ad.images?.[0] && <img src={resolveImageUrl(ad.images[0])} alt="" />}<span>{ad.title}<small>{formatNaira(ad.price)}</small></span></div></td>
              <td><StatusBadge status={ad.status} /></td><td>{Number(ad.views || 0).toLocaleString()}</td><td>{ad.enquiries || 0}</td>
              <td><Link className="link" to={`/dashboard/ads/${ad.id}/edit`}>Edit</Link></td>
            </tr>)}
          </tbody></table>
        </div>}
      </section>
      <section className="panel dashboard-panel">
        <div className="panel-header"><div><h2>Recent enquiries</h2><p className="muted">Messages received from buyers</p></div><Link className="link" to="/messages">View messages</Link></div>
        {!data?.recentEnquiries?.length ? <div className="empty small">No buyer enquiries yet.</div> : <div className="seller-enquiry-list">
          {data.recentEnquiries.map((item) => <article key={item.id}><span className="enquiry-avatar">{item.sender_name?.[0] || 'B'}</span><div><strong>{item.sender_name}</strong><p>{item.message}</p><Link to={`/ads/${item.advertisement_id}`}>{item.advertisement_title}</Link></div><time>{new Date(item.created_at).toLocaleDateString('en-NG')}</time></article>)}
        </div>}
      </section>
      <section className="panel dashboard-panel">
        <div className="panel-header"><div><h2>Top viewed products</h2><p className="muted">Ranked using real listing view counts</p></div><Link className="link" to="/dashboard/analytics">Analytics</Link></div>
        {!data?.topAdvertisements?.length ? <div className="empty small">Product performance will appear here.</div> : <div className="seller-top-list">
          {data.topAdvertisements.map((ad) => <div key={ad.id}><Link to={`/dashboard/ads/${ad.id}/edit`}>{ad.title}</Link><span><Eye size={14} /> {Number(ad.views).toLocaleString()}</span></div>)}
        </div>}
      </section>
      <section className="panel dashboard-panel quick-actions">
        <h2>Quick actions</h2>
        <Link to="/post-ad" className="quick-action"><Plus size={18} /> Post an advertisement</Link>
        <Link to="/dashboard/business-profile" className="quick-action"><BriefcaseBusiness size={18} /> Complete business profile</Link>
        <Link to="/dashboard/verification" className="quick-action"><ShieldCheck size={18} /> Request seller verification</Link>
        <Link to="/dashboard/analytics" className="quick-action"><BarChart3 size={18} /> Review performance</Link>
      </section>
    </div>
  </>;
}

function StatCard({ label, value, Icon }) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={19} /></div><div><p>{label}</p><strong>{Number(value || 0).toLocaleString()}</strong></div></div>;
}

function StatusBadge({ status }) {
  const label = status === 'approved' ? 'Active' : status;
  return <span className={`status status-${status}`}>{label}</span>;
}

function AdvertisementManagement({ setToast }) {
  const [ads, setAds] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [filters, setFilters] = useState({ q: '', status: '', sort: 'newest', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getSellerAds({ ...filters, limit: 20 });
      setAds(data.advertisements);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(messageFrom(requestError, 'Could not load your advertisements.'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filters]);

  const remove = async (ad) => {
    if (!window.confirm(`Delete “${ad.title}”? This cannot be undone.`)) return;
    setWorkingId(ad.id);
    try {
      await deleteAd(ad.id);
      setAds((current) => current.filter((item) => item.id !== ad.id));
      setToast('Advertisement deleted.');
    } catch (requestError) { setError(messageFrom(requestError, 'Could not delete that advertisement.')); }
    finally { setWorkingId(null); }
  };

  const statusAction = async (ad, status) => {
    setWorkingId(ad.id);
    setError('');
    try {
      await updateSellerAdStatus(ad.id, status);
      setToast(status === 'paused' ? 'Advertisement paused.' : status === 'sold' ? 'Advertisement marked as sold.' : 'Advertisement reactivated.');
      await load();
    } catch (requestError) { setError(messageFrom(requestError, 'Could not update that advertisement.')); }
    finally { setWorkingId(null); }
  };

  const duplicate = async (ad) => {
    setWorkingId(ad.id);
    try {
      const { data } = await duplicateSellerAd(ad.id);
      setToast(data.message);
      await load();
    } catch (requestError) { setError(messageFrom(requestError, 'Could not duplicate that advertisement.')); }
    finally { setWorkingId(null); }
  };

  return <section className="panel dashboard-panel">
    <div className="seller-listing-toolbar">
      <label className="seller-search"><Search size={17} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value, page: 1 }))} placeholder="Search your advertisements" /></label>
      <select aria-label="Filter by status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))}>
        <option value="">All statuses</option><option value="approved">Active</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="paused">Paused</option><option value="sold">Sold</option><option value="expired">Expired</option>
      </select>
      <select aria-label="Sort advertisements" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="views">Most viewed</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option>
      </select>
      <Link to="/post-ad" className="btn btn-primary"><Plus size={16} /> New ad</Link>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {loading ? <div className="loading-card">Loading your advertisements...</div> : !ads.length ? <div className="empty small">No advertisements match these filters.</div> : <div className="table-wrap seller-ads-table">
      <table><thead><tr><th>Product</th><th>Status</th><th>Views</th><th>Enquiries</th><th>Date published</th><th>Actions</th></tr></thead><tbody>
        {ads.map((ad) => <tr key={ad.id}>
          <td><div className="seller-ad-title">{ad.images?.[0] ? <img src={resolveImageUrl(ad.images[0])} alt="" /> : <span className="seller-ad-placeholder"><FolderOpen size={20} /></span>}<span>{ad.title}<small>{formatNaira(ad.price)}</small></span></div></td>
          <td><StatusBadge status={ad.status} /></td><td>{Number(ad.views || 0).toLocaleString()}</td><td>{ad.enquiries || 0}</td><td>{new Date(ad.created_at).toLocaleDateString('en-NG')}</td>
          <td><div className="seller-row-actions">
            <Link title="Edit advertisement" to={`/dashboard/ads/${ad.id}/edit`}><Pencil size={16} /></Link>
            {ad.status === 'approved' && <button title="Pause advertisement" disabled={workingId === ad.id} onClick={() => statusAction(ad, 'paused')}><Pause size={16} /></button>}
            {ad.status === 'paused' && <button title="Reactivate advertisement" disabled={workingId === ad.id} onClick={() => statusAction(ad, 'approved')}><Play size={16} /></button>}
            {['approved', 'paused'].includes(ad.status) && <button title="Mark as sold" disabled={workingId === ad.id} onClick={() => statusAction(ad, 'sold')}><CheckCircle2 size={16} /></button>}
            {ad.status === 'sold' && <button title="Mark as available" disabled={workingId === ad.id} onClick={() => statusAction(ad, 'approved')}><Play size={16} /></button>}
            <button title="Duplicate advertisement" disabled={workingId === ad.id} onClick={() => duplicate(ad)}><Copy size={16} /></button>
            {ad.status === 'approved' && <Link title="View product" to={`/ads/${ad.id}`}><ExternalLink size={16} /></Link>}
            <button title="Delete advertisement" disabled={workingId === ad.id} onClick={() => remove(ad)}><Trash2 size={16} /></button>
          </div></td>
        </tr>)}
      </tbody></table>
    </div>}
    {pagination.pages > 1 && <div className="pagination"><button className="btn btn-white" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {pagination.page} of {pagination.pages} · {pagination.total} ads</span><button className="btn btn-white" disabled={filters.page >= pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div>}
  </section>;
}

function Analytics() {
  const { advertisementId } = useParams();
  const [range, setRange] = useState(30);
  const [selectedAd, setSelectedAd] = useState(advertisementId || '');
  const [ads, setAds] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    getSellerAds({ limit: 50 }).then(({ data }) => setAds(data.advertisements)).catch(() => setAds([]));
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const request = selectedAd
      ? getAdvertisementAnalytics(selectedAd, { days: range })
      : getSellerAnalytics({ days: range });
    request.then(({ data }) => active && setAnalytics(data))
      .catch((requestError) => active && setError(messageFrom(requestError, 'Could not load analytics.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [range, selectedAd]);

  const chartData = useMemo(() => {
    if (!analytics?.range) return [];
    const from = new Date(`${analytics.range.from}T00:00:00`);
    const rows = new Map(analytics.trackedViews.map((item) => [item.date, { views: item.views }]));
    for (const item of analytics.enquiries) rows.set(item.date, { ...rows.get(item.date), enquiries: item.enquiries });
    return Array.from({ length: range }, (_, index) => {
      const date = new Date(`${analytics.range.from}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, label: date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }), views: rows.get(key)?.views || 0, enquiries: rows.get(key)?.enquiries || 0 };
    });
  }, [analytics, range]);

  return <>
    <section className="panel analytics-toolbar">
      <div><h2>Performance overview</h2><p className="muted">All metrics come from marketplace views and buyer enquiries.</p></div>
      <div className="seller-analytics-controls">
        <label><span>Product</span><select value={selectedAd} onChange={(event) => setSelectedAd(event.target.value)}><option value="">All advertisements</option>{ads.map((ad) => <option key={ad.id} value={ad.id}>{ad.title}</option>)}</select></label>
        <label><span>Date range</span><select value={range} onChange={(event) => setRange(Number(event.target.value))}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></label>
      </div>
    </section>
    {error && <div className="notice error" role="alert">{error}</div>}
    {analytics && <div className="stats-grid analytics-summary">
      <StatCard label="Total product views" value={analytics.totalViews} Icon={Eye} />
      <StatCard label="Advertisements" value={analytics.totalAdvertisements} Icon={FolderOpen} />
      <StatCard label="Enquiries in range" value={analytics.enquiries.reduce((sum, item) => sum + item.enquiries, 0)} Icon={MessageSquareText} />
      <StatCard label="Tracked views in range" value={analytics.trackedViews.reduce((sum, item) => sum + item.views, 0)} Icon={BarChart3} />
    </div>}
    {loading ? <div className="panel loading-card">Loading analytics...</div> : analytics && <>
      <p className="analytics-history-note"><CircleHelp size={15} /> {analytics.historyNote}</p>
      <section className="seller-chart-grid">
        <MetricChart title="Daily product views" metric="views" data={chartData} color="#1264D8" />
        <MetricChart title="Buyer enquiries over time" metric="enquiries" data={chartData} color="#16A34A" />
      </section>
      <section className="panel dashboard-panel">
        <div className="panel-header"><div><h2>Top-performing advertisements</h2><p className="muted">Ranked by real cumulative views and enquiry count</p></div></div>
        {!analytics.topAdvertisements.length ? <div className="empty small">No advertisement activity yet.</div> : <div className="table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>Total views</th><th>Enquiries</th><th>Price</th></tr></thead><tbody>{analytics.topAdvertisements.map((ad) => <tr key={ad.id}><td><Link className="link" to={`/dashboard/ads/${ad.id}/edit`}>{ad.title}</Link></td><td><StatusBadge status={ad.status} /></td><td>{ad.views.toLocaleString()}</td><td>{ad.enquiries}</td><td>{formatNaira(ad.price)}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </>;
}

function MetricChart({ title, metric, data, color }) {
  const width = 720;
  const height = 220;
  const max = Math.max(1, ...data.map((item) => item[metric]));
  const points = data.map((item, index) => `${data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width},${height - (item[metric] / max) * (height - 24)}`).join(' ');
  const total = data.reduce((sum, item) => sum + item[metric], 0);
  return <section className="panel metric-chart">
    <div className="panel-header"><div><h2>{title}</h2><p className="muted">{total.toLocaleString()} recorded in selected period</p></div><span className="chart-legend" style={{ '--series-color': color }}><i /> {metric === 'views' ? 'Views' : 'Enquiries'}</span></div>
    {!total ? <div className="empty small">No tracked {metric} in this period yet.</div> : <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} preserveAspectRatio="none">
        {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={line * (height / 3)} y2={line * (height / 3)} className="chart-gridline" />)}
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-axis"><span>{data[0]?.label}</span><span>{data[Math.floor(data.length / 2)]?.label}</span><span>{data.at(-1)?.label}</span></div>
    </div>}
  </section>;
}

const emptyBusinessProfile = {
  businessName: '', logoUrl: '', description: '', email: '', phone: '', whatsapp: '',
  websiteUrl: '', address: '', state: '', city: '', yearsInBusiness: '', operatingHours: '', categoryId: '',
};

function BusinessProfile({ setToast }) {
  const [form, setForm] = useState(emptyBusinessProfile);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [publicSlug, setPublicSlug] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([getBusinessProfile(), getCategories()])
      .then(([profileResponse, availableCategories]) => {
        if (!active) return;
        const profile = profileResponse.data.profile;
        setCategories(availableCategories);
        if (profile) {
          setForm({
            businessName: profile.business_name || '', logoUrl: profile.logo_url || '',
            description: profile.description || '', email: profile.email || '', phone: profile.phone || '',
            whatsapp: profile.whatsapp || '', websiteUrl: profile.website_url || '', address: profile.address || '',
            state: profile.state || '', city: profile.city || '', yearsInBusiness: profile.years_in_business ?? '',
            operatingHours: profile.operating_hours || '', categoryId: profile.category_id || '',
          });
          setPublicSlug(profile.slug);
        }
      })
      .catch((requestError) => active && setError(messageFrom(requestError, 'Could not load the business profile.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await saveBusinessProfile({
        ...form, yearsInBusiness: form.yearsInBusiness === '' ? '' : Number(form.yearsInBusiness),
        categoryId: form.categoryId || '',
      });
      setForm((current) => ({ ...current, ...{
        businessName: data.profile.business_name,
      } }));
      setPublicSlug(data.profile.slug);
      setToast(data.message);
    } catch (requestError) { setError(messageFrom(requestError, 'Could not save your business profile.')); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="panel loading-card">Loading business profile...</div>;
  return <section className="panel business-profile-panel">
    <div className="panel-header"><div><h2>Your business presence</h2><p className="muted">Create a public profile to help buyers learn about your business.</p></div>{publicSlug && <Link className="btn btn-white" to={`/seller/${publicSlug}`}><Globe2 size={16} /> View public page</Link>}</div>
    {error && <div className="notice error" role="alert">{error}</div>}
    <form className="business-profile-form" onSubmit={submit}>
      <label className="field"><span>Business name *</span><input name="businessName" required minLength="2" maxLength="160" value={form.businessName} onChange={update} /></label>
      <label className="field"><span>Business logo URL</span><input name="logoUrl" type="url" maxLength="2048" placeholder="https://example.com/logo.png" value={form.logoUrl} onChange={update} /></label>
      <label className="field business-description-field"><span>Business description</span><textarea name="description" rows="4" maxLength="5000" value={form.description} onChange={update} placeholder="Describe your renewable energy products, services, experience and coverage." /></label>
      <label className="field"><span>Business email</span><input name="email" type="email" value={form.email} onChange={update} /></label>
      <label className="field"><span>Business phone</span><input name="phone" type="tel" value={form.phone} onChange={update} /></label>
      <label className="field"><span>WhatsApp number</span><input name="whatsapp" type="tel" value={form.whatsapp} onChange={update} /></label>
      <label className="field"><span>Website</span><input name="websiteUrl" type="url" value={form.websiteUrl} onChange={update} placeholder="https://" /></label>
      <label className="field"><span>Business category</span><select name="categoryId" value={form.categoryId} onChange={update}><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="field"><span>Business address</span><input name="address" maxLength="255" value={form.address} onChange={update} /></label>
      <label className="field"><span>State</span><select name="state" value={form.state} onChange={update}><option value="">Select state</option>{NIGERIAN_STATES.map((state) => <option key={state}>{state}</option>)}</select></label>
      <label className="field"><span>City</span><input name="city" maxLength="120" value={form.city} onChange={update} /></label>
      <label className="field"><span>Years in business</span><input name="yearsInBusiness" type="number" min="0" max="200" value={form.yearsInBusiness} onChange={update} /></label>
      <label className="field"><span>Operating hours</span><input name="operatingHours" maxLength="500" value={form.operatingHours} onChange={update} placeholder="Mon–Fri, 9am–5pm" /></label>
      <div className="business-profile-submit"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save business profile'}</button></div>
    </form>
  </section>;
}

function Verification({ setToast }) {
  const [verification, setVerification] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    verificationType: 'registered_business', businessName: '', businessOwner: '', businessEmail: '',
    businessPhone: '', whatsapp: '', businessAddress: '', state: '', city: '',
    businessDescription: '', website: '', businessCategoryId: '', registrationNumber: '',
  });
  const [documents, setDocuments] = useState({ cacDocument: null, identityDocument: null, additionalDocument: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([getSellerVerification(), getCategories()])
      .then(([verificationResult, categoryResult]) => {
        if (!active) return;
        const saved = verificationResult.data.verification;
        setVerification(saved);
        setCategories(categoryResult.data.categories || []);
        if (saved) {
          setForm({
            verificationType: saved.verification_type || 'registered_business',
            businessName: saved.business_name || '',
            businessOwner: saved.business_owner || '',
            businessEmail: saved.business_email || '',
            businessPhone: saved.business_phone || '',
            whatsapp: saved.whatsapp || '',
            businessAddress: saved.business_address || '',
            state: saved.state || '',
            city: saved.city || '',
            businessDescription: saved.business_description || '',
            website: saved.website || '',
            businessCategoryId: saved.business_category_id ? String(saved.business_category_id) : '',
            registrationNumber: saved.registration_number || '',
          });
        }
      })
      .catch((requestError) => active && setError(messageFrom(requestError, 'Could not load verification information.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!documents.identityDocument && !verification?.has_identity_document && !documents.cacDocument && !documents.additionalDocument) {
      setError('Attach at least one PDF, PNG, or JPEG verification document.');
      return;
    }
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    Object.entries(documents).forEach(([key, file]) => { if (file) payload.append(key, file); });
    setSaving(true);
    setError('');
    try {
      const request = verification?.status === 'information_requested'
        ? updateSellerVerification(payload)
        : submitSellerVerification(payload);
      const { data } = await request;
      setVerification(data.verification);
      setDocuments({ cacDocument: null, identityDocument: null, additionalDocument: null });
      setToast(data.message);
    } catch (requestError) { setError(messageFrom(requestError, 'Could not submit verification.')); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="panel loading-card">Loading verification status...</div>;
  return <div className="verification-page">
    <section className="panel verification-status-card">
      <div className="verification-icon"><ShieldCheck size={24} /></div>
      <div><p className="eyebrow">Seller trust</p><h2>{verification ? ({
        pending: 'Pending Review', verified: 'Verified', rejected: 'Rejected',
        information_requested: 'Information Requested', revoked: 'Not Verified',
      }[verification.status] || 'Not Verified') : 'Not Verified'}</h2><p className="muted">{verification?.status === 'pending'
        ? 'Your application is securely stored and awaiting administrator review.'
        : verification?.status === 'verified'
          ? 'Your business verification is approved. The verified badge is displayed only while this status remains approved.'
          : verification?.status === 'information_requested'
            ? 'An administrator needs additional details. Update your application and resubmit it for review.'
            : verification?.status === 'rejected'
              ? 'Your application was not approved. Review the administrator feedback and submit a corrected application.'
              : verification?.status === 'revoked'
                ? 'Your business verification is no longer active.'
                : 'Submit your business information and supporting documents for review.'}</p>{verification?.submitted_at && <small>Submitted {new Date(verification.submitted_at).toLocaleDateString('en-NG')}</small>}</div>
      {verification && <StatusBadge status={verification.status} />}
    </section>
    {error && <div className="notice error" role="alert">{error}</div>}
    {verification?.admin_notes && (verification.status === 'information_requested' || verification.status === 'rejected' || verification.status === 'revoked') && <div className={`notice ${verification.status === 'rejected' ? 'error' : 'success'}`} role="status"><strong>Administrator feedback:</strong> {verification.rejection_reason || verification.admin_notes}</div>}
    {verification?.status !== 'pending' && verification?.status !== 'verified' && verification?.status !== 'revoked' && <section className="panel">
      <div className="panel-header"><div><h2>Submit verification details</h2><p className="muted">Documents are private and accessible only to authorized administrators.</p></div></div>
      <form className="business-profile-form" onSubmit={submit}>
        <label className="field"><span>Verification type *</span><select name="verificationType" value={form.verificationType} onChange={update}><option value="registered_business">Registered business</option><option value="renewable_energy_company">Renewable energy company</option><option value="individual">Individual seller</option></select></label>
        <label className="field"><span>Business name *</span><input name="businessName" required minLength="2" maxLength="160" value={form.businessName} onChange={update} /></label>
        <label className="field"><span>Business owner *</span><input name="businessOwner" required minLength="2" maxLength="120" value={form.businessOwner} onChange={update} /></label>
        <label className="field"><span>Business email</span><input name="businessEmail" type="email" maxLength="254" value={form.businessEmail} onChange={update} /></label>
        <label className="field"><span>Business phone *</span><input name="businessPhone" type="tel" required minLength="8" value={form.businessPhone} onChange={update} /></label>
        <label className="field"><span>WhatsApp number</span><input name="whatsapp" type="tel" value={form.whatsapp} onChange={update} /></label>
        <label className="field"><span>Business address *</span><input name="businessAddress" required minLength="5" maxLength="255" value={form.businessAddress} onChange={update} /></label>
        <label className="field"><span>State</span><select name="state" value={form.state} onChange={update}><option value="">Select state</option>{NIGERIAN_STATES.map((state) => <option key={state}>{state}</option>)}</select></label>
        <label className="field"><span>City</span><input name="city" maxLength="120" value={form.city} onChange={update} /></label>
        <label className="field"><span>Business category</span><select name="businessCategoryId" value={form.businessCategoryId} onChange={update}><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>CAC registration number</span><input name="registrationNumber" maxLength="100" value={form.registrationNumber} onChange={update} /></label>
        <label className="field"><span>Business website</span><input name="website" type="url" maxLength="2048" placeholder="https://" value={form.website} onChange={update} /></label>
        <label className="field business-description-field"><span>Business description</span><textarea name="businessDescription" rows="3" maxLength="5000" value={form.businessDescription} onChange={update} /></label>
        <label className="field verification-file-field"><span>CAC certificate <small>PDF, PNG or JPEG · maximum 5 MB</small></span><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setDocuments((current) => ({ ...current, cacDocument: event.target.files?.[0] || null }))} /></label>
        <label className="field verification-file-field"><span>Business identity / supporting document {verification?.has_identity_document ? '' : '*'} <small>PDF, PNG or JPEG · maximum 5 MB</small></span><input type="file" required={!verification?.has_identity_document} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setDocuments((current) => ({ ...current, identityDocument: event.target.files?.[0] || null }))} /></label>
        <label className="field verification-file-field"><span>Additional supporting document <small>PDF, PNG or JPEG · maximum 5 MB</small></span><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setDocuments((current) => ({ ...current, additionalDocument: event.target.files?.[0] || null }))} /></label>
        <div className="business-profile-submit"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit for review'}</button></div>
      </form>
    </section>}
  </div>;
}

function Notifications({ setUnread }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getSellerNotifications().then(({ data }) => {
      if (!active) return;
      setNotifications(data.notifications);
      setUnread(data.notifications.filter((item) => !item.is_read).length);
    }).catch((requestError) => active && setError(messageFrom(requestError, 'Could not load notifications.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [setUnread]);
  const markRead = async (item) => {
    try {
      await markSellerNotificationRead(item.id);
      setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, is_read: 1 } : notification));
      setUnread((count) => Math.max(0, count - 1));
    } catch (requestError) { setError(messageFrom(requestError, 'Could not update the notification.')); }
  };
  return <section className="panel dashboard-panel">
    {error && <div className="notice error" role="alert">{error}</div>}
    {loading ? <div className="loading-card">Loading notifications...</div> : !notifications.length ? <div className="empty small"><Bell size={28} /><p>You’re all caught up. New account activity will appear here.</p></div> : <div className="seller-notification-list">{notifications.map((item) => <article className={!item.is_read ? 'unread' : ''} key={item.id}>
      <span className="notification-dot" /><div><strong>{item.title}</strong><p>{item.body}</p><time>{new Date(item.created_at).toLocaleString('en-NG')}</time></div>
      {item.related_advertisement_id && <Link className="link" to={`/ads/${item.related_advertisement_id}`}>View</Link>}
      {!item.is_read && <button className="btn btn-white" onClick={() => markRead(item)}>Mark read</button>}
    </article>)}</div>}
  </section>;
}
