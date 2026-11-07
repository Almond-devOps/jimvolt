import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api.js';
import { formatNaira } from '../utils/format.js';

const sections = {
  '/admin/users': { title: 'Users', endpoint: '/admin/users', description: 'Marketplace accounts and current account status.' },
  '/admin/sellers': { title: 'Sellers', endpoint: '/admin/sellers', description: 'Seller accounts and their marketplace activity.' },
  '/admin/categories': { title: 'Categories', endpoint: '/admin/categories', description: 'Marketplace product categories.' },
  '/admin/reports': { title: 'Reports', endpoint: '/admin/reports', description: 'User-submitted marketplace reports and investigation status.' },
  '/admin/payments': { title: 'Payments', endpoint: '/admin/payments', description: 'Payment transactions and verification status.' },
  '/admin/analytics': { title: 'Analytics', endpoint: '/admin/analytics', description: 'Marketplace activity trends calculated from stored data.' },
  '/admin/settings': { title: 'Administrator settings', endpoint: '/admin/settings/administrators', description: 'Authorized administrator accounts. Super administrator access may be required.' },
};

function displayValue(value, key) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (key === 'amount' || key === 'revenue' || key === 'price') return formatNaira(value);
  if (typeof value === 'boolean' || value === 0 || value === 1) {
    if (key.startsWith('is_') || key.startsWith('has_')) return value ? 'Yes' : 'No';
  }
  return String(value);
}

function DataTable({ title, rows }) {
  if (!rows.length) return <p className="muted">No records to display.</p>;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 8);
  return (
    <section className="panel admin-data-panel">
      {title && <div className="panel-header"><h2>{title.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</h2></div>}
      <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll('_', ' ')}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id || row.period || `${title}-${index}`}>
          {columns.map((column) => <td key={column}>{displayValue(row[column], column)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>
  );
}

export default function AdminWorkspacePage() {
  const location = useLocation();
  const section = sections[location.pathname];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!section) {
      setData(null);
      setError('This administrator section is unavailable.');
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');
    api.get(section.endpoint, { params: { page: 1, limit: 20 } })
      .then(({ data: result }) => { if (active) setData(result); })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || `Could not load ${section.title.toLowerCase()}.`);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [section]);

  if (!section) {
    return (
      <section>
        <header className="admin-page-heading">
          <div><p className="eyebrow">ADMINISTRATOR</p><h1>Section unavailable</h1><p className="muted">This management view could not be resolved from the current URL.</p></div>
        </header>
        <div className="empty-state"><h2>Missing admin section</h2><p>Return to the administrator overview to continue managing the marketplace.</p></div>
      </section>
    );
  }

  const datasets = data && Object.entries(data).filter(([, value]) => Array.isArray(value));
  return (
    <section>
      <header className="admin-page-heading">
        <div><p className="eyebrow">MARKETPLACE MANAGEMENT</p><h1>{section.title}</h1><p className="muted">{section.description}</p></div>
      </header>
      {loading && <div className="admin-loading"><span className="skeleton" />Loading live data...</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {!loading && !error && datasets?.length > 0 && (
        <div className="admin-data-list">{datasets.map(([key, rows]) => <DataTable key={key} title={key} rows={rows} />)}</div>
      )}
      {!loading && !error && (!datasets || datasets.length === 0) && (
        <div className="empty-state"><h2>No records available</h2><p>The API returned no records for this section.</p></div>
      )}
      {!loading && !error && data?.pagination && (
        <p className="admin-pagination-note">
          Showing page {data.pagination.page} of {data.pagination.pages || 1} ({Number(data.pagination.total || 0).toLocaleString('en-NG')} total)
        </p>
      )}
    </section>
  );
}
