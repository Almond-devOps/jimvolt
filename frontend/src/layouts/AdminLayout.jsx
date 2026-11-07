import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, BriefcaseBusiness, ChevronLeft, ChevronRight, CreditCard, FileCheck2,
  Flag, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Tags, Users, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const navigation = [
  { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/advertisements', label: 'Advertisements', icon: BriefcaseBusiness },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/sellers', label: 'Sellers', icon: ShieldCheck },
  { to: '/admin/verifications', label: 'Verification', icon: FileCheck2 },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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

  const signOut = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className={`admin-console${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      {mobileOpen && <button className="admin-drawer-overlay" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className="admin-sidebar" id="admin-navigation">
        <div className="admin-sidebar-heading">
          <NavLink to="/admin/dashboard" className="logo admin-brand" onClick={() => setMobileOpen(false)}>
          <span className="logo-mark"><ShieldCheck size={19} aria-hidden="true" /></span>
          <span>Jimvolt <small>ADMIN</small></span>
          </NavLink>
          <button
            type="button"
            className="admin-collapse-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button type="button" className="admin-drawer-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <p className="admin-nav-caption">ADMINISTRATION</p>
        <nav className="admin-nav" aria-label="Administrator navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-account" title={collapsed ? user?.full_name || 'Administrator' : undefined}>
            <span className="admin-avatar">{user?.full_name?.trim()?.[0]?.toUpperCase() || 'A'}</span>
            <span className="admin-account-name"><strong>{user?.full_name || 'Administrator'}</strong><small>{user?.role?.replace('_', ' ')}</small></span>
          </div>
          <button type="button" className="admin-logout" onClick={signOut} title={collapsed ? 'Log out' : undefined}><LogOut size={17} /><span>Log out</span></button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="admin-mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="admin-navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={21} />
          </button>
          <div><p className="eyebrow">JIMVOLT ADMINISTRATION</p><p className="admin-welcome">Marketplace operations</p></div>
          <span className="admin-secure"><ShieldCheck size={16} /> Secure session</span>
        </header>
        <div className="admin-content"><Outlet /></div>
      </main>
    </div>
  );
}
