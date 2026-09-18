'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UserRole, UserNotification } from '@/lib/types';
import { DataService } from '@/lib/services/dataService';

interface SidebarLink {
  href: string;
  label: string;
  icon: string;
}

const roleLinks: Record<UserRole, SidebarLink[]> = {
  customer: [
    { href: '/dashboard/customer', label: 'Overview / Browse', icon: 'storefront' },
    { href: '/dashboard/customer/orders', label: 'My Orders', icon: 'shopping_bag' },
    { href: '/dashboard/customer/saved-addresses', label: 'Saved Addresses', icon: 'location_on' },
    { href: '/dashboard/customer/favorites', label: 'Favorites', icon: 'favorite' },
    { href: '/dashboard/customer/profile', label: 'Profile', icon: 'person' },
    { href: '/dashboard/customer/settings', label: 'Settings', icon: 'settings' },
    { href: '/help', label: 'Help & Support', icon: 'help_outline' },
  ],
  restaurant: [
    { href: '/dashboard/restaurant', label: 'Overview', icon: 'grid_view' },
    { href: '/dashboard/restaurant/listings', label: 'Listings', icon: 'inventory' },
    { href: '/dashboard/restaurant/orders', label: 'Orders', icon: 'receipt_long' },
    { href: '/dashboard/restaurant/donations', label: 'Donations', icon: 'volunteer_activism' },
    { href: '/dashboard/restaurant/analytics', label: 'Analytics', icon: 'analytics' },
    { href: '/dashboard/restaurant/reviews', label: 'Reviews', icon: 'star' },
    { href: '/dashboard/restaurant/profile', label: 'Profile', icon: 'person' },
    { href: '/dashboard/restaurant/settings', label: 'Settings', icon: 'settings' },
    { href: '/help', label: 'Help & Support', icon: 'help_outline' },
  ],
  food_donor: [
    { href: '/dashboard/donor', label: 'Overview', icon: 'grid_view' },
    { href: '/dashboard/donor/donations', label: 'My Donations', icon: 'volunteer_activism' },
    { href: '/dashboard/donor/nearby-ngos', label: 'Nearby NGOs', icon: 'handshake' },
    { href: '/dashboard/donor/profile', label: 'Profile', icon: 'person' },
    { href: '/dashboard/donor/settings', label: 'Settings', icon: 'settings' },
    { href: '/help', label: 'Help & Support', icon: 'help_outline' },
  ],
  ngo: [
    { href: '/dashboard/ngo', label: 'Overview', icon: 'grid_view' },
    { href: '/dashboard/ngo/incoming', label: 'Incoming Requests', icon: 'inbox' },
    { href: '/dashboard/ngo/claim-history', label: 'Claim History', icon: 'history' },
    { href: '/dashboard/ngo/profile', label: 'Profile', icon: 'person' },
    { href: '/dashboard/ngo/settings', label: 'Settings', icon: 'settings' },
    { href: '/help', label: 'Help & Support', icon: 'help_outline' },
  ],
  admin: [
    { href: '/dashboard/admin', label: 'Overview', icon: 'grid_view' },
    { href: '/dashboard/admin/verify-restaurants', label: 'Verify Restaurants', icon: 'restaurant' },
    { href: '/dashboard/admin/verify-ngos', label: 'Verify NGOs/Trusts', icon: 'handshake' },
    { href: '/dashboard/admin/manage-users', label: 'Manage Users', icon: 'group' },
    { href: '/dashboard/admin/reports', label: 'Reports', icon: 'bug_report' },
    { href: '/dashboard/admin/contact-messages', label: 'Contact Messages', icon: 'mail' },
    { href: '/dashboard/admin/analytics', label: 'Analytics', icon: 'analytics' },
    { href: '/dashboard/admin/profile', label: 'Admin Profile', icon: 'person' },
    { href: '/dashboard/admin/settings', label: 'Settings', icon: 'settings' },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, logout } = useAuth();
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<UserNotification[]>([]);

  const loadNotifications = React.useCallback(() => {
    if (!user) return;
    const notifs = DataService.getNotifications(user.id);
    setNotifications(notifs);
  }, [user]);

  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications, pathname]);

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotifClick = (n: UserNotification) => {
    DataService.markNotificationRead(n.id);
    loadNotifications();
    if (n.link) {
      setNotifOpen(false);
      router.push(n.link);
    }
  };

  // Infer role from current URL path (e.g. /dashboard/admin/reports -> 'admin')
  const pathSegment = pathname.split('/')[2];
  const segmentToRoleMap: Record<string, UserRole> = {
    admin: 'admin',
    restaurant: 'restaurant',
    donor: 'food_donor',
    ngo: 'ngo',
    customer: 'customer',
  };
  const pathRole = segmentToRoleMap[pathSegment];

  // Determine active role priority:
  // 1. Logged-in user's assigned role
  // 2. Inferred role from URL path
  // 3. Auth context role fallback
  const activeRole: UserRole = user?.role || pathRole || role || 'customer';
  const links = roleLinks[activeRole] || roleLinks.customer;

  // Client-side route protection guard: prevent cross-role dashboard navigation leaks
  useEffect(() => {
    if (!user) return;
    const userRoleSegment = user.role === 'food_donor' ? 'donor' : user.role;
    if (pathSegment && ['admin', 'restaurant', 'donor', 'ngo', 'customer'].includes(pathSegment)) {
      if (pathSegment !== userRoleSegment) {
        router.replace(`/dashboard/${userRoleSegment}`);
      }
    }
  }, [user, pathSegment, router]);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside className="relative z-10 w-72 max-w-[80vw] bg-surface-container-low border-r border-[#e1bfb5]/40 h-full flex flex-col py-6 px-4 shadow-2xl animate-slide-up">
            <div className="px-2 mb-6 flex items-center justify-between">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center">
                <Image
                  src="/logo.png"
                  alt="ShareBytes Logo"
                  width={140}
                  height={40}
                  className="h-8 w-auto object-contain"
                />
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Close menu"
                id="close-mobile-menu"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
              <div className="px-3 py-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                {activeRole.replace('_', ' ')} Portal
              </div>
              {links.map((link, idx) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={`mobile-${link.href}-${idx}`}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-[#e1bfb5]/40 space-y-3 shrink-0">
              <div className="bg-surface-container rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">eco</span>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Role Persona</p>
                    <p className="text-xs font-bold text-on-surface capitalize">{activeRole.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-2 text-xs font-bold text-on-surface-variant">
                <span className="truncate max-w-[140px]">{user?.full_name || user?.email}</span>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout(() => router.push('/auth?tab=login'));
                  }}
                  className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                >
                  Logout
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar (Desktop) */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low border-r border-[#e1bfb5]/40 z-50 hidden lg:flex flex-col py-6 px-4 shadow-sm">
        <div className="px-2 mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="ShareBytes Logo"
              width={140}
              height={40}
              className="h-9 w-auto object-contain"
            />
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="px-3 py-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            {activeRole.replace('_', ' ')} Portal
          </div>
          {links.map((link, idx) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={`${link.href}-${idx}`}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Role Switcher Widget */}
        <div className="pt-4 border-t border-[#e1bfb5]/40 space-y-3">
          <div className="bg-surface-container rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">eco</span>
              <div>
                <p className="text-[10px] font-bold uppercase text-on-surface-variant">Role Persona</p>
                <p className="text-xs font-bold text-on-surface capitalize">{activeRole.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2 text-xs font-bold text-on-surface-variant">
            <span className="truncate max-w-[120px]">{user?.full_name || user?.email}</span>
            <button
              onClick={() => logout(() => router.push('/auth?tab=login'))}
              className="text-primary hover:underline flex items-center gap-1 text-[11px]"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-64 flex-1 flex flex-col">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-[#e1bfb5]/40 h-16 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center shrink-0"
              aria-label="Open navigation menu"
              id="open-mobile-menu"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <Link href="/" className="lg:hidden">
              <Image src="/logo.png" alt="Logo" width={110} height={32} className="h-7 w-auto" />
            </Link>
            <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-surface-container text-xs font-bold text-on-surface">
              Role: <strong className="text-primary uppercase">{activeRole.replace('_', ' ')}</strong>
            </span>
          </div>

          {/* Quick Nav Links + Notification Bell */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-bold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">home</span>
              Home
            </Link>
            <Link
              href="/dashboard/customer"
              className="text-xs font-bold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">storefront</span>
              Marketplace
            </Link>

            {/* Notification Bell Icon & Popover Panel */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors relative"
                title="Notifications"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Popover Dropdown Panel */}
              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-[#e1bfb5]/40 z-50 overflow-hidden">
                  <div className="p-4 bg-surface-container-low border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">notifications</span>
                      <h3 className="text-sm font-bold text-on-surface">Notifications</h3>
                    </div>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-xs text-on-surface-variant font-medium">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => handleNotifClick(n)}
                          className={`p-4 hover:bg-surface-container-low cursor-pointer transition-colors space-y-1 ${
                            !n.read ? 'bg-primary-fixed/20' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-on-surface">{n.title}</span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-on-surface-variant font-medium">{n.message}</p>
                          <span className="text-[9px] text-on-surface-variant/70 block">
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Verification Banner — only for restaurant/ngo, NEVER admin */}
        {user && user.verified_status === 'pending' && activeRole !== 'admin' && (
          <div className="bg-tertiary-container/40 text-on-tertiary-container px-6 py-2.5 text-xs font-bold flex items-center justify-between border-b border-tertiary/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
              <span>Verification Pending: Your uploaded certificates are currently being reviewed by Admin.</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-tertiary text-white text-[10px] uppercase font-bold">
              In Review
            </span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-container-max w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
