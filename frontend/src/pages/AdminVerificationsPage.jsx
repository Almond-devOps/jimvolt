import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, FileCheck2, Search, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import UserAvatar from '../components/UserAvatar.jsx';

const tabs = [
  { value: '', label: 'All applications' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'information_requested', label: 'Information requested' },
];

function Status({ value }) {
  return <span className={`status status-${value}`}>{String(value || 'pending').replaceAll('_', ' ')}</span>;
}

function Detail({ label, children }) {
  return <div><dt>{label}</dt><dd>{children || '—'}</dd></div>;
}

export default function AdminVerificationsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [application, setApplication] = useState(null);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [documents, setDocuments] = useState({});
  const documentUrls = useRef(new Set());

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/verifications', {
        params: { page, limit: 20, ...(tab ? { status: tab } : {}), ...(q.trim() ? { q: q.trim() } : {}) },
      });
      setApplications(data.verifications || []);
      setStats(data.stats || {});
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load verification applications.');
    } finally { setLoading(false); }
  }, [page, q, tab]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    setApplication(null);
    setDocuments({});
    try {
      const { data } = await api.get(`/admin/verifications/${id}`);
      setApplication(data.verification);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load the verification application.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    if (id) loadDetail();
    else loadList();
  }, [id, loadDetail, loadList]);

  useEffect(() => () => {
    documentUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const openDocument = async (type) => {
    setError('');
    try {
      const { data } = await api.get(`/admin/verifications/${id}/document/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      documentUrls.current.add(url);
      setDocuments((current) => ({ ...current, [type]: url }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not retrieve this private document.');
    }
  };

  const submitDecision = async (event) => {
    event?.preventDefault();
    if (working || !id || !['approve', 'reject', 'request-information', 'revoke'].includes(action)) return;
    if (action !== 'approve' && !reason.trim()) {
      setError('A decision reason is required.');
      return;
    }
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      let response;
      if (action === 'approve') response = await api.put(`/admin/verifications/${id}/approve`);
      if (action === 'reject') response = await api.put(`/admin/verifications/${id}/reject`, { reason: reason.trim() });
      if (action === 'request-information') response = await api.put(`/admin/verifications/${id}/request-information`, { reason: reason.trim() });
      if (action === 'revoke') response = await api.post(`/admin/verifications/${id}/revoke`, { reason: reason.trim() });
      setSuccess(response?.data?.message || 'Verification action completed.');
      setAction('');
      setReason('');
      await loadDetail();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The verification decision could not be saved.');
    } finally { setWorking(false); }
  };

  if (loading) return <div className="admin-loading"><span className="skeleton" />Loading verification records...</div>;
  if (error && id && !application) return <div className="notice error" role="alert">{error}<p><Link className="link" to="/admin/verifications">Return to applications</Link></p></div>;

  if (id && application) {
    const docs = [
      ['cac', 'CAC certificate', application.has_cac_document],
      ['identity', 'Business identity / supporting document', application.has_identity_document],
      ['additional', 'Additional supporting document', application.has_additional_document],
    ].filter(([, , available]) => available);
    return (
      <section>
        <Link className="admin-back-link" to="/admin/verifications"><ArrowLeft size={17} /> Back to applications</Link>
        <header className="admin-page-heading">
          <div><p className="eyebrow">BUSINESS VERIFICATION · #{application.id}</p><h1>{application.business_name}</h1><p className="muted">{application.owner_name} · Submitted {new Date(application.submitted_at).toLocaleString('en-NG')}</p></div>
          <Status value={application.status} />
        </header>
        {success && <div className="notice success" role="status">{success}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="admin-verification-detail-grid">
          <section className="panel">
            <div className="panel-header"><div><h2>Application information</h2><p className="muted">Submitted business and owner details.</p></div></div>
            <dl className="admin-user-details">
              <Detail label="Business name">{application.business_name}</Detail>
              <Detail label="Business owner">{application.business_owner || application.owner_name}</Detail>
              <Detail label="Account email">{application.owner_email}</Detail>
              <Detail label="Business email">{application.business_email}</Detail>
              <Detail label="Business phone">{application.business_phone}</Detail>
              <Detail label="WhatsApp">{application.whatsapp}</Detail>
              <Detail label="Business address">{application.business_address}</Detail>
              <Detail label="City / state">{[application.city, application.state].filter(Boolean).join(', ')}</Detail>
              <Detail label="Business category">{application.business_category}</Detail>
              <Detail label="CAC registration number">{application.registration_number}</Detail>
              <Detail label="Website">{application.website && <a className="link" href={application.website} target="_blank" rel="noreferrer">{application.website}</a>}</Detail>
              <Detail label="Business description">{application.business_description}</Detail>
              <Detail label="Review feedback">{application.rejection_reason || application.admin_notes}</Detail>
            </dl>
          </section>
          <section className="panel">
            <div className="panel-header"><div><h2>Private documents</h2><p className="muted">Accessible only to authorized administrators.</p></div></div>
            {!docs.length ? <p className="muted">No documents attached.</p> : docs.map(([type, label]) => (
              <article className="admin-private-document" key={type}>
                <div><FileCheck2 size={19} /><strong>{label}</strong></div>
                <button className="btn btn-white" type="button" onClick={() => openDocument(type)}><Download size={15} /> Load securely</button>
                {documents[type] && (
                  <div className="admin-document-preview">
                    <iframe title={label} src={documents[type]} />
                    <a className="link" href={documents[type]} target="_blank" rel="noreferrer">Open document in a new tab</a>
                  </div>
                )}
              </article>
            ))}
          </section>
        </div>
        {application.status !== 'verified' && application.status !== 'revoked' && application.status !== 'rejected' && (
          <div className="admin-decision-actions">
            <button type="button" className="btn btn-primary" onClick={() => setAction('approve')}>Approve application</button>
            <button type="button" className="btn btn-white" onClick={() => setAction('request-information')}>Request information</button>
            <button type="button" className="btn btn-white admin-danger-button" onClick={() => setAction('reject')}>Reject application</button>
          </div>
        )}
        {application.status === 'verified' && user?.role === 'super_admin' && (
          <div className="admin-decision-actions"><button type="button" className="btn btn-white admin-danger-button" onClick={() => setAction('revoke')}>Revoke verification</button></div>
        )}
        {action && (
          <div className="admin-modal-backdrop" role="presentation">
            <section className="admin-decision-modal" role="dialog" aria-modal="true" aria-labelledby="admin-decision-title">
              <h2 id="admin-decision-title">{action === 'approve' ? 'Approve business verification?' : action === 'reject' ? 'Reject business verification' : action === 'revoke' ? 'Revoke business verification' : 'Request additional information'}</h2>
              <p className="muted">{action === 'approve' ? 'This confirms the submitted business details. The seller will be notified.' : 'Enter a clear explanation. The seller will receive this feedback in their dashboard.'}</p>
              {error && <div className="notice error" role="alert">{error}</div>}
              {action !== 'approve' && <label className="field"><span>{action === 'reject' ? 'Rejection reason *' : action === 'revoke' ? 'Revocation reason *' : 'Information required *'}</span><textarea rows="4" maxLength="1000" required value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
              <div className="admin-decision-actions">
                <button className="btn btn-white" type="button" disabled={working} onClick={() => { setAction(''); setReason(''); }}>Cancel</button>
                <button className={`btn ${action === 'approve' ? 'btn-primary' : 'btn-white admin-danger-button'}`} type="button" disabled={working || (action !== 'approve' && !reason.trim())} onClick={submitDecision}>
                  {working ? <><span className="admin-button-spinner" aria-hidden="true" /> Saving...</> : action === 'approve' ? 'Confirm approval' : action === 'reject' ? 'Confirm rejection' : action === 'revoke' ? 'Confirm revocation' : 'Send request'}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <header className="admin-page-heading"><div><p className="eyebrow">SELLER TRUST</p><h1>Business verification</h1><p className="muted">Review and manage seller verification applications.</p></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="admin-metrics verification-metrics">
        {[['Total applications', stats.total], ['Pending applications', stats.pending], ['Verified businesses', stats.verified], ['Rejected applications', stats.rejected]].map(([label, value], index) => {
          const Icon = [FileCheck2, Search, ShieldCheck, FileCheck2][index];
          return <article className="admin-metric-card" key={label}><span className="admin-metric-icon"><Icon size={20} /></span><span><small>{label}</small><strong>{Number(value || 0).toLocaleString('en-NG')}</strong></span></article>;
        })}
      </div>
      <section className="panel admin-verification-list">
        <div className="admin-verification-tabs" role="tablist" aria-label="Filter verification applications">
          {tabs.map((item) => <button key={item.value || 'all'} role="tab" aria-selected={tab === item.value} className={tab === item.value ? 'active' : ''} onClick={() => { setTab(item.value); setPage(1); }}>{item.label}</button>)}
        </div>
        <label className="admin-user-search verification-search"><Search size={17} /><input placeholder="Search business, owner, email or phone" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></label>
        {applications.length === 0 ? <div className="empty-state"><h2>No applications found</h2><p>There are no applications matching this filter.</p></div> : (
          <div className="table-wrap"><table className="admin-users-table"><thead><tr><th>Business</th><th>Owner</th><th>Contact</th><th>Location</th><th>Submitted</th><th>Status</th><th>Review</th></tr></thead><tbody>
            {applications.map((item) => <tr key={item.id}>
              <td><span className="admin-business-cell"><UserAvatar src={item.business_logo || item.profile_image} name={item.business_name} className="admin-avatar" /><strong>{item.business_name || 'Business application'}</strong></span></td>
              <td>{item.business_owner || item.full_name}</td><td>{item.business_email || item.email}<small className="admin-table-sub">{item.business_phone}</small></td>
              <td>{[item.city, item.state].filter(Boolean).join(', ') || item.business_address}</td>
              <td>{new Date(item.submitted_at).toLocaleDateString('en-NG')}</td><td><Status value={item.status} /></td>
              <td><Link className="btn btn-white admin-review-link" to={`/admin/verifications/${item.id}`}>Review</Link></td>
            </tr>)}
          </tbody></table></div>
        )}
        {pagination.pages > 1 && <div className="pagination"><button className="btn btn-white" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pagination.pages}</span><button className="btn btn-white" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
      </section>
    </section>
  );
}
