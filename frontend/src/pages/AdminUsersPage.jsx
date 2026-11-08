import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react';
import api from '../services/api.js';
import { formatNaira } from '../utils/format.js';
import UserAvatar from '../components/UserAvatar.jsx';

function VerificationStatus({ value }) {
  const status = value || 'not_submitted';
  return <span className={`status status-${status}`}>{status.replaceAll('_', ' ')}</span>;
}

function AccountStatus({ value }) {
  return <span className={`status status-${value}`}>{value}</span>;
}

export default function AdminUsersPage() {
  const { id } = useParams();
  const [users, setUsers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ q: '', role: '', status: '', verificationStatus: '', sort: 'newest' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState(1);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/users', {
        params: { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')) },
      });
      setUsers(data.users || []);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load users.');
    } finally { setLoading(false); }
  }, [page, filters]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    setDetail(null);
    try {
      const { data } = await api.get(`/admin/users/${id}`);
      setDetail(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load this user profile.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    if (id) loadDetail();
    else loadUsers();
  }, [id, loadDetail, loadUsers]);

  const changeStatus = async (target, status) => {
    const action = status === 'suspended' ? 'suspend' : 'activate';
    const confirmed = window.confirm(`Are you sure you want to ${action} ${target.full_name}'s account?`);
    if (!confirmed) return;
    setWorking(true);
    setError('');
    try {
      await api.put(`/admin/users/${target.id}/${action}`);
      if (id) await loadDetail();
      else await loadUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Could not ${action} this account.`);
    } finally { setWorking(false); }
  };

  if (loading) return <div className="admin-loading"><span className="skeleton" />Loading user data...</div>;
  if (id) {
    const account = detail?.user;
    if (!account) return <div className="notice error" role="alert">{error || 'User not found.'}</div>;
    return (
      <section>
        <Link className="admin-back-link" to="/admin/users"><ArrowLeft size={17} /> Back to users</Link>
        <header className="admin-page-heading">
          <div><p className="eyebrow">USER PROFILE · ID {account.id}</p><h1>{account.full_name}</h1><p className="muted">Registered {new Date(account.created_at).toLocaleString('en-NG')}</p></div>
          <button className="btn btn-white" type="button" disabled={working} onClick={() => changeStatus(account, account.account_status === 'active' ? 'suspended' : 'active')}>
            {account.account_status === 'active' ? 'Suspend account' : 'Reactivate account'}
          </button>
        </header>
        {error && <div className="notice error" role="alert">{error}</div>}
        <section className="panel admin-user-profile">
          <UserAvatar src={account.profile_image} name={account.full_name} className="admin-user-profile-avatar" />
          <div><h2>{account.full_name}</h2><p>{account.email}</p><p>{account.phone || 'Phone not provided'}</p><div className="admin-user-tags"><AccountStatus value={account.account_status} /><VerificationStatus value={account.is_verified ? 'verified' : 'not_verified'} /><span className="status status-pending">{account.role.replaceAll('_', ' ')}</span></div></div>
        </section>
        <div className="admin-data-list">
          <section className="panel"><div className="panel-header"><h2>Registration information</h2></div>
            <dl className="admin-user-details"><div><dt>User ID</dt><dd>{account.id}</dd></div><div><dt>Account type</dt><dd>{account.role.replaceAll('_', ' ')}</dd></div><div><dt>Registered</dt><dd>{new Date(account.created_at).toLocaleString('en-NG')}</dd></div><div><dt>Last updated</dt><dd>{new Date(account.updated_at).toLocaleString('en-NG')}</dd></div><div><dt>Business verification</dt><dd>{detail.verification?.status ? <VerificationStatus value={detail.verification.status} /> : 'No application'}</dd></div></dl>
          </section>
          <section className="panel"><div className="panel-header"><h2>User advertisements ({detail.advertisements?.length || 0})</h2></div>
            {!detail.advertisements?.length ? <p className="muted">No advertisements found.</p> : <div className="table-wrap"><table><thead><tr><th>Advertisement</th><th>Price</th><th>Status</th><th>Views</th><th>Posted</th></tr></thead><tbody>
              {detail.advertisements.map((ad) => <tr key={ad.id}><td>{ad.title}</td><td>{formatNaira(ad.price)}</td><td><span className={`status status-${ad.status}`}>{ad.status}</span></td><td>{Number(ad.views || 0).toLocaleString()}</td><td>{new Date(ad.created_at).toLocaleDateString('en-NG')}</td></tr>)}
            </tbody></table></div>}
          </section>
        </div>
      </section>
    );
  }

  return (
    <section>
      <header className="admin-page-heading"><div><p className="eyebrow">ACCOUNT MANAGEMENT</p><h1>Users</h1><p className="muted">Search and manage marketplace accounts from the MySQL database.</p></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}
      <section className="panel admin-users-panel">
        <div className="admin-user-filters">
          <label className="admin-user-search"><Search size={17} /><input aria-label="Search users" placeholder="Search name, email or phone" value={filters.q} onChange={(event) => { setFilters({ ...filters, q: event.target.value }); setPage(1); }} /></label>
          <select aria-label="Filter by account type" value={filters.role} onChange={(event) => { setFilters({ ...filters, role: event.target.value }); setPage(1); }}><option value="">All account types</option><option value="user">User</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select>
          <select aria-label="Filter by verification status" value={filters.verificationStatus} onChange={(event) => { setFilters({ ...filters, verificationStatus: event.target.value }); setPage(1); }}><option value="">All verification states</option><option value="none">No application</option><option value="pending">Pending</option><option value="information_requested">Information requested</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="revoked">Revoked</option></select>
          <select aria-label="Filter by account status" value={filters.status} onChange={(event) => { setFilters({ ...filters, status: event.target.value }); setPage(1); }}><option value="">All account statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
          <select aria-label="Sort registration date" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        {loading ? <div className="admin-loading">Loading users...</div> : !users.length ? <div className="empty-state"><h2>No users found</h2><p>Change the search or filters to see other accounts.</p></div> : (
          <div className="table-wrap"><table className="admin-users-table"><thead><tr><th>User</th><th>Contact</th><th>Type</th><th>Verification</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody>
            {users.map((account) => <tr key={account.id}>
              <td><Link className="admin-user-cell" to={`/admin/users/${account.id}`}><UserAvatar src={account.profile_image} name={account.full_name} className="admin-avatar" /><span><strong>{account.full_name}</strong><small>#{account.id}</small></span></Link></td>
              <td>{account.email}<small className="admin-table-sub">{account.phone || 'No phone'}</small></td>
              <td>{account.role.replaceAll('_', ' ')}</td><td><VerificationStatus value={account.verification_status || (account.is_verified ? 'verified' : 'not_verified')} /></td>
              <td><AccountStatus value={account.account_status} /></td><td>{new Date(account.created_at).toLocaleDateString('en-NG')}</td>
              <td><div className="admin-user-actions"><Link to={`/admin/users/${account.id}`}>View</Link><button type="button" disabled={working} onClick={() => changeStatus(account, account.account_status === 'active' ? 'suspended' : 'active')}>{account.account_status === 'active' ? 'Suspend' : 'Activate'}</button></div></td>
            </tr>)}
          </tbody></table></div>
        )}
        {pagination.pages > 1 && <div className="pagination"><button className="btn btn-white" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pagination.pages} · {pagination.total} users</span><button className="btn btn-white" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
      </section>
    </section>
  );
}
