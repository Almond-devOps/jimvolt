import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createAd, getCategories, updateAd } from '../services/listingService.js';
import { getMyAds } from '../services/userService.js';
import { useAuth } from '../context/AuthContext.jsx';
import { NIGERIAN_STATES } from '../utils/constants.js';
import ImageUpload from '../components/ImageUpload.jsx';

const initialForm = {
  categoryId: '',
  title: '',
  brand: '',
  specifications: '',
  description: '',
  price: '',
  conditionType: 'new',
  state: '',
  city: '',
  phone: '',
  whatsapp: '',
};

export default function PostAdPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const [form, setForm] = useState({ ...initialForm, phone: user?.phone || '' });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getCategories(), id ? getMyAds() : Promise.resolve(null)])
      .then(([result, adsResponse]) => {
        if (!active) return;
        setCategories(result);
        const ad = adsResponse?.data.advertisements.find((item) => String(item.id) === String(id));
        if (!ad) {
          if (id) setError('You do not have permission to edit this advertisement, or it no longer exists.');
          return;
        }
        setForm({
          categoryId: String(ad.category?.id),
          title: ad.title,
          brand: ad.brand || '',
          specifications: ad.specifications || '',
          description: ad.description,
          price: String(ad.price),
          conditionType: ad.condition_type,
          state: ad.state,
          city: ad.city,
          phone: ad.phone,
          whatsapp: ad.whatsapp || '',
        });
        setExistingImages(ad.images || (ad.image ? [ad.image] : []));
      })
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load product categories.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setUploadProgress(0);
    try {
      const payload = new FormData();
      Object.entries({
        ...form,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
      }).forEach(([key, value]) => payload.append(key, value));
      payload.append('images', JSON.stringify(existingImages));
      imageFiles.forEach((file) => payload.append('images', file));
      const onUploadProgress = (progressEvent) => {
        if (progressEvent.total) setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      };
      if (id) await updateAd(id, payload, onUploadProgress);
      else await createAd(payload, onUploadProgress);
      navigate('/dashboard', { state: { notice: `Your advertisement has been ${id ? 'updated and submitted' : 'submitted'} for review.` } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Your advertisement could not be submitted. Please review your details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container section">
      <header className="form-page-heading"><p className="eyebrow">Sell on Jimvolt</p><h1>{id ? 'Edit advertisement' : 'Post a new advertisement'}</h1><p className="muted">Share clear product details so buyers can find the right renewable energy solution.</p></header>
      <form className="panel listing-form" onSubmit={submit}>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="form-grid">
          <label className="field"><span>Product title</span><input name="title" required minLength="3" maxLength="180" value={form.title} onChange={update} placeholder="e.g. 5kVA hybrid solar inverter" /></label>
          <label className="field"><span>Brand (optional)</span><input name="brand" maxLength="120" value={form.brand} onChange={update} placeholder="e.g. Jinko, Felicity, Huawei" /></label>
          <label className="field"><span>Category</span><select name="categoryId" required value={form.categoryId} onChange={update}><option value="">{loading ? 'Loading categories...' : 'Choose a category'}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Price (NGN)</span><input name="price" type="number" min="0" step="0.01" required value={form.price} onChange={update} /></label>
          <label className="field"><span>Condition</span><select name="conditionType" value={form.conditionType} onChange={update}><option value="new">New</option><option value="used">Used</option></select></label>
          <label className="field"><span>State</span><select name="state" required value={form.state} onChange={update}><option value="">Select state</option>{NIGERIAN_STATES.map((state) => <option key={state}>{state}</option>)}</select></label>
          <label className="field"><span>City / area</span><input name="city" required maxLength="120" value={form.city} onChange={update} placeholder="e.g. Ikeja" /></label>
          <label className="field"><span>Contact phone</span><input name="phone" type="tel" required maxLength="32" value={form.phone} onChange={update} /></label>
          <label className="field"><span>WhatsApp number (optional)</span><input name="whatsapp" type="tel" maxLength="32" value={form.whatsapp} onChange={update} /></label>
        </div>
        <label className="field"><span>Description</span><textarea name="description" rows="7" required minLength="10" maxLength="10000" value={form.description} onChange={update} placeholder="Describe the product, specifications, condition, warranty, and delivery options." /></label>
        <label className="field"><span>Specifications (optional)</span><textarea name="specifications" rows="4" maxLength="10000" value={form.specifications} onChange={update} placeholder="e.g. 5kVA, 48V, MPPT 100A, 10kWh lithium compatible" /></label>
        <ImageUpload
          existingImages={existingImages}
          onExistingImagesChange={setExistingImages}
          files={imageFiles}
          onFilesChange={setImageFiles}
          disabled={submitting}
          error={imageError}
          onError={setImageError}
        />
        <p className="muted">New advertisements are reviewed before appearing publicly.</p>
        {submitting && imageFiles.length > 0 && <div className="upload-progress" role="status" aria-live="polite"><div className="upload-progress-label"><span>Uploading images</span><strong>{uploadProgress}%</strong></div><progress max="100" value={uploadProgress} aria-label="Image upload progress" /></div>}
        <button type="submit" className="btn btn-primary" disabled={submitting || loading || Boolean(id && error)}>{submitting ? 'Submitting...' : id ? 'Save and submit for review' : 'Submit for review'}</button>
      </form>
    </div>
  );
}
