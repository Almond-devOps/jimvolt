import { useEffect, useState } from 'react';
import { CheckCircle2, Pencil, Plus, X } from 'lucide-react';
import { formatNaira } from '../utils/format.js';
import { getAdminPromotionPackages, saveAdminPromotionPackage } from '../services/promotionService.js';

const emptyPackage = {
  name: '',
  description: '',
  price: '',
  durationDays: '',
  benefits: '',
  isActive: true,
};

function messageFrom(error) {
  return error.response?.data?.message || 'Could not save promotion package. Please try again.';
}

export default function AdminPromotionPackagesPage() {
  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState(emptyPackage);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPackages = () => getAdminPromotionPackages()
    .then(({ data }) => setPackages(data.packages || []))
    .catch((requestError) => setError(requestError.response?.data?.message || 'Could not load promotion packages.'))
    .finally(() => setLoading(false));

  useEffect(() => {
    loadPackages();
  }, []);

  const resetForm = () => {
    setForm(emptyPackage);
    setEditingId(null);
    setError('');
    setNotice('');
  };

  const editPackage = (item) => {
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      durationDays: String(item.duration_days),
      benefits: item.benefits || '',
      isActive: Boolean(item.is_active),
    });
    setEditingId(item.id);
    setError('');
    setNotice('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const action = editingId ? 'updated' : 'created';
    try {
      await saveAdminPromotionPackage({
        ...form,
        price: Number(form.price),
        durationDays: Number(form.durationDays),
      }, editingId);
      resetForm();
      await loadPackages();
      setNotice(`Promotion package ${action}.`);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving(false);
    }
  };

  const togglePackage = async (item) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveAdminPromotionPackage({
        name: item.name,
        description: item.description || '',
        price: Number(item.price),
        durationDays: Number(item.duration_days),
        benefits: item.benefits || '',
        isActive: !item.is_active,
      }, item.id);
      setNotice(`${item.name} ${item.is_active ? 'deactivated' : 'activated'}.`);
      await loadPackages();
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <header className="admin-page-heading">
        <div><p className="eyebrow">MARKETPLACE MANAGEMENT</p><h1>Promotion packages</h1><p className="muted">Update package pricing, duration, benefits, and seller availability.</p></div>
      </header>
      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice success" role="status">{notice}</div>}
      <div className="admin-promotion-layout">
        <form className="panel admin-promotion-form" onSubmit={submit}>
          <div className="panel-header"><h2>{editingId ? 'Edit package' : 'Add package'}</h2>
            {editingId && <button className="btn btn-ghost" type="button" onClick={resetForm}><X size={16} /> Cancel edit</button>}
          </div>
          <label className="field"><span>Package name</span><input value={form.name} minLength="2" maxLength="100" required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field"><span>Description</span><textarea value={form.description} maxLength="1000" rows="3" onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="admin-promotion-form-row">
            <label className="field"><span>Price (NGN)</span><input type="number" min="1" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
            <label className="field"><span>Duration (days)</span><input type="number" min="1" max="365" step="1" required value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} /></label>
          </div>
          <label className="field"><span>Benefits</span><textarea value={form.benefits} maxLength="2000" rows="3" onChange={(event) => setForm({ ...form, benefits: event.target.value })} /></label>
          <label className="admin-promotion-active"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Available to sellers</label>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save package' : <><Plus size={16} /> Create package</>}</button>
        </form>

        <section className="admin-promotion-package-list" aria-label="Existing promotion packages">
          {loading ? <div className="admin-loading"><span className="skeleton" />Loading packages...</div> : !packages.length
            ? <div className="empty-state"><h2>No promotion packages</h2><p>Create a package to make it available to sellers.</p></div>
            : packages.map((item) => (
              <article className="panel admin-promotion-package" key={item.id}>
                <div className="admin-promotion-package-heading">
                  <div><h2>{item.name}</h2><span className={`status ${item.is_active ? 'status-approved' : 'status-rejected'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></div>
                  <strong>{formatNaira(item.price)}</strong>
                </div>
                <p>{item.description || 'No description provided.'}</p>
                <div className="muted">{item.duration_days} days · {item.benefits || 'No benefits provided.'}</div>
                <div className="admin-promotion-actions">
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => editPackage(item)}><Pencil size={15} /> Edit</button>
                  <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => togglePackage(item)}><CheckCircle2 size={15} /> {item.is_active ? 'Deactivate' : 'Activate'}</button>
                </div>
              </article>
            ))}
        </section>
      </div>
    </section>
  );
}
