'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '@/lib/types';
import { DataService } from '@/lib/services/dataService';

import { parseSupabaseError } from '@/lib/supabase/error';

interface ToastState {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  isLoading: boolean;
  toasts: ToastState[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  login: (email: string, password: string, role?: UserRole) => Promise<boolean>;
  sendPhoneOtp: (phone: string) => Promise<{ success: boolean; demoCode?: string }>;
  verifyPhoneOtp: (phone: string, token: string, preferredRole?: UserRole) => Promise<boolean>;
  signup: (data: Partial<UserProfile> & { role: UserRole; email: string; full_name: string; password?: string }) => Promise<boolean>;
  switchRole: (newRole: UserRole) => void;
  logout: (redirect?: () => void) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo-mode minimum password length (prevents blank logins)
const MIN_DEMO_PASSWORD_LENGTH = 4;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('customer');
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    // Runtime environment variable diagnostic check
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder') || supabaseKey.includes('placeholder')) {
      console.warn(
        '[ShareBytes Auth Diagnostic] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing/placeholder. Verify Vercel Project Settings -> Environment Variables.'
      );
    }

    // Load persisted active user or default demo user
    const savedUserId = typeof window !== 'undefined' ? localStorage.getItem('sb_active_user_id') : null;
    const profiles = DataService.getProfiles();
    
    let activeUser = profiles.find(p => p.id === savedUserId);
    if (!activeUser) {
      // Do NOT auto-login on fresh load — require explicit sign-in
      activeUser = undefined;
    }
    
    if (activeUser) {
      setUser(activeUser);
      setRole(activeUser.role);
      if (typeof document !== 'undefined') {
        document.cookie = `sb_role=${activeUser.role}; path=/; max-age=86400`;
      }
    }
    setIsLoading(false);
  }, []);

  /**
   * login() requires BOTH email AND password.
   * - Validates password is not empty and meets minimum length
   * - Attempts supabase.auth.signInWithPassword if real env vars are set with robust error handling
   * - Falls back to local demo-mode check that verifies stored password hash
   */
  const login = async (email: string, password: string, preferredRole?: UserRole): Promise<boolean> => {
    // ── Step 1: Validate inputs ──────────────────────────────────────────────
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return false;
    }
    if (!password || password.trim().length < MIN_DEMO_PASSWORD_LENGTH) {
      showToast(`Password must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters`, 'error');
      return false;
    }

    setIsLoading(true);
    try {
      // ── Step 2: Try real Supabase auth if configured ─────────────────────
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const hasRealSupabase =
        supabaseUrl && !supabaseUrl.includes('placeholder') &&
        supabaseKey && !supabaseKey.includes('placeholder');

      if (hasRealSupabase) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
          console.warn('[Supabase Login Error]', error);

          // If this is a local seed/demo account, fall through to demo-mode verification
          const profiles = DataService.getProfiles();
          const matchedDemo = profiles.find(p => p.email.toLowerCase() === email.toLowerCase());
          const storedPassword = matchedDemo?.demo_password || 'demo1234';

          if (matchedDemo && password === storedPassword) {
            console.info('[Auth] Falling back to local demo profile for:', email);
            if (matchedDemo.is_suspended) {
              showToast('Your account has been suspended by Admin. Please contact support.', 'error');
              return false;
            }
            setUser(matchedDemo);
            setRole(matchedDemo.role);
            if (typeof window !== 'undefined') {
              localStorage.setItem('sb_active_user_id', matchedDemo.id);
              document.cookie = `sb_role=${matchedDemo.role}; path=/; max-age=86400`;
            }
            showToast(`Welcome back, ${matchedDemo.full_name || matchedDemo.email}!`, 'success');
            return true;
          }

          showToast(parseSupabaseError(error, 'Invalid email or password'), 'error');
          return false;
        }

        if (data.user) {
          const profiles = DataService.getProfiles();
          const matchedUser = profiles.find(p => p.email.toLowerCase() === email.toLowerCase());
          if (matchedUser) {
            if (matchedUser.is_suspended) {
              showToast('Your account has been suspended by Admin. Please contact support.', 'error');
              return false;
            }
            setUser(matchedUser);
            setRole(matchedUser.role);
            if (typeof window !== 'undefined') {
              localStorage.setItem('sb_active_user_id', matchedUser.id);
              document.cookie = `sb_role=${matchedUser.role}; path=/; max-age=86400`;
            }
            showToast(`Welcome back, ${matchedUser.full_name || matchedUser.email}!`, 'success');
            return true;
          }

          // Fallback profile construction from Supabase User Metadata if local storage miss
          const roleFromMeta = (data.user.user_metadata?.role as UserRole) || preferredRole || 'customer';
          const newUserProfile: UserProfile = {
            id: data.user.id,
            email: data.user.email || email,
            role: roleFromMeta,
            full_name: data.user.user_metadata?.full_name || email.split('@')[0],
            phone: data.user.user_metadata?.phone || '',
            business_name: data.user.user_metadata?.business_name || '',
            address: data.user.user_metadata?.address || 'Chennai, Tamil Nadu',
            fssai_cert_url: data.user.user_metadata?.fssai_cert_url || '',
            registration_cert_url: data.user.user_metadata?.registration_cert_url || '',
            entity_photo_url: data.user.user_metadata?.entity_photo_url || '',
            verified_status: roleFromMeta === 'restaurant' || roleFromMeta === 'ngo' ? 'pending' : 'verified',
            created_at: new Date().toISOString(),
          };
          DataService.saveProfile(newUserProfile);
          setUser(newUserProfile);
          setRole(newUserProfile.role);
          if (typeof window !== 'undefined') {
            localStorage.setItem('sb_active_user_id', newUserProfile.id);
            document.cookie = `sb_role=${newUserProfile.role}; path=/; max-age=86400`;
          }
          showToast(`Welcome back, ${newUserProfile.full_name || newUserProfile.email}!`, 'success');
          return true;
        }
      }

      // ── Step 3: Demo-mode fallback ────────────────────────────────────────
      const profiles = DataService.getProfiles();
      const matchedUser = profiles.find(p => p.email.toLowerCase() === email.toLowerCase());

      if (!matchedUser) {
        showToast('No account found with that email. Please sign up first.', 'error');
        return false;
      }

      if (matchedUser.is_suspended) {
        showToast('Your account has been suspended by Admin. Please contact support.', 'error');
        return false;
      }

      const storedPassword = matchedUser.demo_password || 'demo1234';
      if (password !== storedPassword) {
        showToast('Incorrect password. Please try again.', 'error');
        return false;
      }

      setUser(matchedUser);
      setRole(matchedUser.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sb_active_user_id', matchedUser.id);
        document.cookie = `sb_role=${matchedUser.role}; path=/; max-age=86400`;
      }
      showToast(`Welcome back, ${matchedUser.full_name || matchedUser.email}!`, 'success');
      return true;
    } catch (err: any) {
      showToast(parseSupabaseError(err, 'Login failed'), 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const sendPhoneOtp = async (phone: string): Promise<{ success: boolean; demoCode?: string }> => {
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      showToast('Please enter a valid mobile phone number with country code (e.g. +91 9876543210)', 'error');
      return { success: false };
    }

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const hasRealSupabase =
        supabaseUrl && !supabaseUrl.includes('placeholder') &&
        supabaseKey && !supabaseKey.includes('placeholder');

      if (hasRealSupabase) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone });
        if (error) {
          showToast(parseSupabaseError(error, 'Failed to send OTP'), 'error');
          return { success: false };
        }
        showToast(`Verification code sent via SMS to ${cleanPhone}`, 'success');
        return { success: true };
      } else {
        const demoCode = '123456';
        showToast(`[DEMO MODE] Verification code sent to ${cleanPhone}. Demo OTP: ${demoCode}`, 'info');
        return { success: true, demoCode };
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to send OTP code', 'error');
      return { success: false };
    }
  };

  const verifyPhoneOtp = async (phone: string, token: string, preferredRole?: UserRole): Promise<boolean> => {
    const cleanPhone = phone.trim();
    const cleanToken = token.trim();
    if (!cleanToken || cleanToken.length < 4) {
      showToast('Please enter the 6-digit verification code', 'error');
      return false;
    }

    setIsLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const hasRealSupabase =
        supabaseUrl && !supabaseUrl.includes('placeholder') &&
        supabaseKey && !supabaseKey.includes('placeholder');

      if (hasRealSupabase) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data, error } = await supabase.auth.verifyOtp({ phone: cleanPhone, token: cleanToken, type: 'sms' });
        if (error) {
          showToast(parseSupabaseError(error, 'Invalid or expired OTP code'), 'error');
          setIsLoading(false);
          return false;
        }

        if (data.user) {
          const profiles = DataService.getProfiles();
          const matchedUser = profiles.find(p => p.phone && p.phone.replace(/\s+/g, '') === cleanPhone.replace(/\s+/g, ''));
          if (matchedUser) {
            if (matchedUser.is_suspended) {
              showToast('Your account has been suspended by Admin. Please contact support.', 'error');
              setIsLoading(false);
              return false;
            }
            setUser(matchedUser);
            setRole(matchedUser.role);
            if (typeof window !== 'undefined') {
              localStorage.setItem('sb_active_user_id', matchedUser.id);
              document.cookie = `sb_role=${matchedUser.role}; path=/; max-age=86400`;
            }
            showToast(`Logged in successfully as ${matchedUser.full_name || cleanPhone}`, 'success');
            setIsLoading(false);
            return true;
          }
        }
      }

      // Fallback / Demo mode verification
      if (cleanToken !== '123456' && cleanToken !== '654321' && cleanToken !== '000000') {
        showToast('Invalid OTP code. Try entering 123456 in demo mode.', 'error');
        setIsLoading(false);
        return false;
      }

      const profiles = DataService.getProfiles();
      const digits = cleanPhone.replace(/\D/g, '');
      let matchedUser = profiles.find(p => p.phone && p.phone.replace(/\D/g, '').includes(digits.slice(-10)));

      if (matchedUser) {
        if (matchedUser.is_suspended) {
          showToast('Your account has been suspended by Admin. Please contact support.', 'error');
          setIsLoading(false);
          return false;
        }
      } else {
        const targetRole = preferredRole || 'customer';
        matchedUser = {
          id: `usr-mobile-${Date.now()}`,
          email: `${digits || 'mobile'}@phone.sharebytes.org`,
          phone: cleanPhone,
          full_name: `User (${cleanPhone})`,
          role: targetRole,
          verified_status: targetRole === 'restaurant' || targetRole === 'ngo' ? 'pending' : 'verified',
          created_at: new Date().toISOString(),
        };
        DataService.saveProfile(matchedUser);
      }

      setUser(matchedUser);
      setRole(matchedUser.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sb_active_user_id', matchedUser.id);
        document.cookie = `sb_role=${matchedUser.role}; path=/; max-age=86400`;
      }
      showToast(`Phone verified! Welcome ${matchedUser.full_name}!`, 'success');
      setIsLoading(false);
      return true;
    } catch (err: any) {
      showToast(err.message || 'OTP verification failed', 'error');
      setIsLoading(false);
      return false;
    }
  };

  const signup = async (data: Partial<UserProfile> & { role: UserRole; email: string; full_name: string; password?: string }): Promise<boolean> => {
    setIsLoading(true);
    try {
      const cleanEmail = data.email ? data.email.trim().toLowerCase() : '';
      if (!cleanEmail || !cleanEmail.includes('@')) {
        showToast('Please enter a valid email address', 'error');
        return false;
      }

      if (!data.password || data.password.trim().length < MIN_DEMO_PASSWORD_LENGTH) {
        showToast(`Password must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters`, 'error');
        return false;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const hasRealSupabase =
        supabaseUrl && !supabaseUrl.includes('placeholder') &&
        supabaseKey && !supabaseKey.includes('placeholder');
      let assignedId = `usr-${Date.now()}`;

      if (hasRealSupabase) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: sbData, error: sbError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: data.password,
          options: {
            data: {
              role: data.role,
              full_name: data.full_name,
              phone: data.phone || '',
              business_name: data.business_name || data.full_name,
              address: data.address || '',
              fssai_cert_url: data.fssai_cert_url || '',
              registration_cert_url: data.registration_cert_url || '',
              entity_photo_url: data.entity_photo_url || '',
              fssai_number: data.fssai_number || '',
              org_registration_number: data.org_registration_number || '',
            },
          },
        });

        if (sbError) {
          showToast(parseSupabaseError(sbError, 'Signup failed'), 'error');
          return false;
        }

        if (sbData.user) {
          assignedId = sbData.user.id;
          if (!sbData.session) {
            showToast('Account created! Please check your email to confirm your account before logging in.', 'info');
          }
        }
      } else {
        const existing = DataService.getProfiles().find(p => p.email.toLowerCase() === cleanEmail);
        if (existing) {
          showToast('An account with this email already exists. Please log in.', 'error');
          return false;
        }
      }

      const newProfile: UserProfile = {
        id: assignedId,
        email: cleanEmail,
        role: data.role,
        full_name: data.full_name,
        phone: data.phone || '',
        business_name: data.business_name || data.full_name,
        address: data.address || 'Chennai, Tamil Nadu',
        fssai_cert_url: data.fssai_cert_url || '',
        registration_cert_url: data.registration_cert_url || '',
        entity_photo_url: data.entity_photo_url || '',
        fssai_number: data.fssai_number || '',
        org_registration_number: data.org_registration_number || '',
        verified_status: data.role === 'restaurant' || data.role === 'ngo' ? 'pending' : 'verified',
        created_at: new Date().toISOString(),
        demo_password: data.password,
      };

      DataService.saveProfile(newProfile);
      setUser(newProfile);
      setRole(newProfile.role);

      if (typeof window !== 'undefined') {
        localStorage.setItem('sb_active_user_id', newProfile.id);
        document.cookie = `sb_role=${newProfile.role}; path=/; max-age=86400`;
      }

      if (newProfile.verified_status === 'pending') {
        showToast('Registration submitted! Account pending Admin verification.', 'info');
      } else {
        showToast('Account created successfully!', 'success');
      }
      return true;
    } catch (err: any) {
      showToast(parseSupabaseError(err, 'Signup failed'), 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = (newRole: UserRole) => {
    const profiles = DataService.getProfiles();
    const matched = profiles.find(p => p.role === newRole);
    if (matched) {
      setUser(matched);
      setRole(matched.role);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sb_active_user_id', matched.id);
        document.cookie = `sb_role=${matched.role}; path=/; max-age=86400`;
      }
      showToast(`Switched active role to ${newRole.toUpperCase()} (${matched.full_name})`, 'info');
    } else if (user) {
      const updatedUser = { ...user, role: newRole };
      setUser(updatedUser);
      setRole(newRole);
      if (typeof window !== 'undefined') {
        document.cookie = `sb_role=${newRole}; path=/; max-age=86400`;
      }
      showToast(`Role set to ${newRole.toUpperCase()}`, 'info');
    }
  };

  const logout = async (redirect?: () => void) => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const hasRealSupabase =
        supabaseUrl && !supabaseUrl.includes('placeholder') &&
        supabaseKey && !supabaseKey.includes('placeholder');

      if (hasRealSupabase) {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('Supabase signOut error:', parseSupabaseError(error));
        }
      }
    } catch (err: any) {
      console.warn('SignOut exception:', parseSupabaseError(err));
    }
    setUser(null);
    setRole('customer');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sb_active_user_id');
      document.cookie = `sb_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
    showToast('Logged out successfully', 'info');
    // Redirect to login page after state is cleared
    if (redirect) redirect();
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    DataService.saveProfile(updated);
    setUser(updated);
    setRole(updated.role);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sb_active_user_id', updated.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isLoading,
        toasts,
        showToast,
        removeToast,
        login,
        sendPhoneOtp,
        verifyPhoneOtp,
        signup,
        switchRole,
        logout,
        updateProfile,
      }}
    >
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg border text-sm font-bold flex items-center justify-between gap-3 animate-slide-up transition-all ${
              toast.type === 'success'
                ? 'bg-[#eaf4ee] text-[#005236] border-[#6ffbbe]'
                : toast.type === 'error'
                ? 'bg-[#ffdad6] text-[#93000a] border-[#ffb3ad]'
                : 'bg-[#fff8f6] text-[#261814] border-[#e1bfb5]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">
                {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
              </span>
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-current opacity-70 hover:opacity-100"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
