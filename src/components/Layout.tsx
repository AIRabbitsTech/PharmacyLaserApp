import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, List, BarChart3, Upload, Menu, X, Pill, UserCircle, LogOut } from 'lucide-react';
import { getPharmacyProfile } from '../hooks/usePharmacyProfile';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/quick-sale', icon: PlusCircle, label: 'Quick Sale' },
  { to: '/sales-list', icon: List, label: 'Sales Register' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/import', icon: Upload, label: 'Import Data' },
  { to: '/profile', icon: UserCircle, label: 'Profile' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { name } = getPharmacyProfile();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-blue-900 text-white z-30 transform transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:flex lg:flex-col`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-blue-800">
          <div className="w-9 h-9 bg-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
            <Pill size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{name}</p>
            <p className="text-blue-300 text-xs">Sales Ledger</p>
          </div>
          <button
            className="ml-auto lg:hidden text-blue-300 hover:text-white flex-shrink-0"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-blue-800 space-y-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-blue-300 hover:text-white text-sm w-full transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
          <p className="text-blue-400 text-xs">© 2026 Pharmacy Ledger</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 bg-blue-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-blue-200 hover:text-white"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Pill size={18} className="flex-shrink-0" />
            <span className="font-bold text-base truncate">{name}</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

    </div>
  );
}
