import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X, KeyRound, Clock } from 'lucide-react';
import { useUI } from './UIContext';
import './WebLogin.css';

const RESET_COOLDOWN_MS = 5 * 60 * 1000; // 5 Minutes (300 seconds)
const RESET_COOLDOWN_KEY = 'bcmatik_web_reset_cooldown_until';

// Anti-Scripting Email Sanitizer: Allows ONLY a-z, 0-9, @, ., _, and - (Max 1 '@')
export const sanitizeEmailInput = (raw) => {
  let cleaned = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '') // Strip all XSS/scripting symbols: + ( ) < > ' " ; / \ spaces
    .replace(/\.{2,}/g, '.');      // Prevent consecutive dots (..)

  // Ensure at most one '@' symbol can exist
  const parts = cleaned.split('@');
  if (parts.length > 2) {
    cleaned = parts[0] + '@' + parts.slice(1).join('');
  }
  return cleaned.slice(0, 80);
};

export const isValidEmailFormat = (emailStr) => {
  return /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test((emailStr || '').trim());
};

export default function WebLogin({ setRole, setOffice }) {
  const { showToast } = useUI();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Forgot Password Modal & 5-Minute Rate-Limit Cooldown States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState(() => {
    const saved = Number(localStorage.getItem(RESET_COOLDOWN_KEY) || '0');
    return isNaN(saved) ? 0 : saved;
  });
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const navigate = useNavigate();

  // Live 1-Second Countdown Timer for Forgot Password Rate Limiting
  useEffect(() => {
    const updateRemaining = () => {
      const diffMs = cooldownUntilMs - Date.now();
      if (diffMs <= 0) {
        setRemainingSeconds(0);
        return false;
      }
      setRemainingSeconds(Math.ceil(diffMs / 1000));
      return true;
    };

    if (!updateRemaining()) return;

    const timer = setInterval(() => {
      if (!updateRemaining()) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownUntilMs]);

  const formatCooldownMMSS = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const validateField = (field, value) => {
    const cleanVal = value.trim();
    if (!cleanVal) {
      setErrors(prev => ({
        ...prev,
        [field]: field === 'email' ? 'Email Address is required' : 'Password is required'
      }));
    } else if (field === 'email' && !isValidEmailFormat(cleanVal)) {
      setErrors(prev => ({
        ...prev,
        email: 'Please enter a valid email address (letters, numbers, @, ., _, - only)'
      }));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const newErrors = {};
    const cleanEmail = sanitizeEmailInput(email).trim();

    if (!cleanEmail) {
      newErrors.email = 'Email Address is required';
    } else if (!isValidEmailFormat(cleanEmail)) {
      newErrors.email = 'Please enter a valid email address (e.g. registrar@bc.edu.ph)';
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast('Please enter a valid email address and password.', 'error', 'Invalid Credentials');
      return;
    }

    setIsSigningIn(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);

      let userData = null;
      const emailDocSnap = await getDoc(doc(db, 'users', cleanEmail));
      if (emailDocSnap.exists()) {
        userData = emailDocSnap.data();
      }

      if (!userData) {
        const uidDocSnap = await getDoc(doc(db, 'staff_users', userCred.user.uid));
        if (uidDocSnap.exists()) {
          userData = uidDocSnap.data();
        }
      }

      if (!userData) {
        const qSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanEmail)));
        if (!qSnap.empty) {
          userData = qSnap.docs[0].data();
        }
      }

      if (userData) {
        // Block login if staff or mini_admin account has been disabled by Super Admin
        if (userData.role !== 'admin' && userData.status === 'disabled') {
          await auth.signOut();
          setErrors({ email: 'This personnel account is currently disabled' });
          showToast(
            'Your personnel account has been disabled by the Super Administrator.',
            'error',
            'Account Disabled'
          );
          setIsSigningIn(false);
          return;
        }

        setRole(userData.role);

        if (userData.role === 'admin') {
          showToast('Welcome back, Super Administrator.', 'success', 'Authentication Successful');
          navigate('/admin', { replace: true });
        } else if (userData.role === 'mini_admin') {
          setOffice(userData.assigned_office);
          showToast(`Signed in as ${userData.assigned_office} Mini Admin.`, 'success', 'Mini Admin Authenticated');
          navigate('/admin', { replace: true });
        } else if (userData.role === 'staff') {
          setOffice(userData.assigned_office);
          showToast(`Signed in to ${userData.assigned_office} terminal.`, 'success', 'Staff Authenticated');
          navigate('/staff', { replace: true });
        } else {
          showToast('Account role is not authorized for the web portal.', 'error', 'Access Denied');
          await auth.signOut();
        }
      } else {
        showToast('No administrative profile found for this account.', 'error', 'Profile Not Found');
        await auth.signOut();
      }
    } catch (err) {
      showToast('Invalid email or password. Please verify your credentials.', 'error', 'Authentication Failed');
    }
    setIsSigningIn(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    // 1. Check 5-Minute Rate-Limit Cooldown
    if (remainingSeconds > 0) {
      const waitFormatted = formatCooldownMMSS(remainingSeconds);
      setResetError(`Please wait ${waitFormatted} before requesting another password reset link.`);
      showToast(
        `Rate limit active: Please wait ${waitFormatted} before requesting again.`,
        'warning',
        'Cooldown Active'
      );
      return;
    }

    const cleanReset = sanitizeEmailInput(resetEmail).trim();
    if (!cleanReset) {
      setResetError('Email Address is required');
      return;
    }
    if (!isValidEmailFormat(cleanReset)) {
      setResetError('Please enter a valid email address');
      return;
    }

    setIsSendingReset(true);
    try {
      // 2. Verify account exists in Firestore 'users' before consuming cooldown
      const emailDocSnap = await getDoc(doc(db, 'users', cleanReset));
      let accountExists = emailDocSnap.exists();
      if (!accountExists) {
        const qSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanReset)));
        accountExists = !qSnap.empty;
      }

      if (!accountExists) {
        setResetError('No registered personnel account found with this email address.');
        setIsSendingReset(false);
        return;
      }

      // 3. Dispatch Reset Email & Lock for 5 Minutes (300 Seconds)
      await sendPasswordResetEmail(auth, cleanReset);

      const nextAllowed = Date.now() + RESET_COOLDOWN_MS;
      localStorage.setItem(RESET_COOLDOWN_KEY, String(nextAllowed));
      setCooldownUntilMs(nextAllowed);

      showToast(
        `Password reset link sent to ${cleanReset}. You must wait 5 minutes before requesting again.`,
        'success',
        'Reset Email Sent'
      );
      setShowResetModal(false);
      setResetEmail('');
      setResetError('');
    } catch (err) {
      if (err?.code === 'auth/too-many-requests') {
        const nextAllowed = Date.now() + RESET_COOLDOWN_MS;
        localStorage.setItem(RESET_COOLDOWN_KEY, String(nextAllowed));
        setCooldownUntilMs(nextAllowed);
        setResetError('Too many requests. Please wait 5 minutes before trying again.');
      } else {
        setResetError('Could not send reset email. Verify that the email is registered.');
      }
    }
    setIsSendingReset(false);
  };

  return (
    <div className="bc-login-split-wrapper">
      {/* LEFT BRANDING & HERO PANEL */}
      <section className="bc-login-left">
        <div className="bc-login-shape-top" />
        <div className="bc-login-shape-bottom" />

        {/* Top Left Official Logo */}
        <div className="bc-login-brand-header">
          <img
            src="/LOGO.png"
            alt="BCMatik Logo"
            className="bc-login-logo-box"
            style={{ objectFit: 'contain', padding: '4px', backgroundColor: '#FFFFFF' }}
            onError={(e) => {
              if (!e.currentTarget.src.endsWith('/logo.png')) {
                e.currentTarget.src = '/logo.png';
              }
            }}
          />
          <span className="bc-login-brand-name">BCMatik</span>
        </div>

        {/* Center Hero Typography */}
        <div className="bc-login-hero-content">
          <span className="bc-login-access-pill">Admin Assigned Access</span>
          <h1 className="bc-login-hero-headline">
            <span className="accent-gold">Queue.</span>
            <span className="accent-white">Guide.</span>
            <span className="accent-white">Serve.</span>
          </h1>
          <p className="bc-login-hero-subtext">
            Use the account assigned by your administrator. Desk personnel, office mini admins, and super administrators are managed through the Bicol College smart queuing system.
          </p>
        </div>

        {/* Bottom Role Pills */}
        <div className="bc-login-role-pills">
          <span className="bc-login-role-pill">Desk Staff</span>
          <span className="bc-login-role-pill">Office Mini Admin</span>
          <span className="bc-login-role-pill">Super Admin</span>
        </div>
      </section>

      {/* RIGHT LOGIN CARD PANEL */}
      <section className="bc-login-right">
        <div className="bc-login-card">
          <h2 className="bc-login-card-title">Welcome back</h2>
          <p className="bc-login-card-subtitle">
            Enter your assigned email and password to access your BCMatik dashboard.
          </p>

          <form onSubmit={handleLogin} noValidate>
            <div className="bc-login-field-group">
              <label className="bc-login-label">
                Email Address <span className="quest-req-star">*</span>
              </label>
              <div className="bc-login-input-wrap">
                <input
                  type="email"
                  maxLength={80}
                  autoComplete="username"
                  className={`bc-login-input ${errors.email ? 'input-error' : ''}`}
                  placeholder="registrar@bc.edu.ph"
                  value={email}
                  onBlur={() => validateField('email', email)}
                  onChange={(e) => {
                    const sanitized = sanitizeEmailInput(e.target.value);
                    setEmail(sanitized);
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                />
              </div>
              {errors.email && <span className="quest-error-text">{errors.email}</span>}
            </div>

            <div className="bc-login-field-group">
              <label className="bc-login-label">
                Password <span className="quest-req-star">*</span>
              </label>
              <div className="bc-login-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  maxLength={64}
                  autoComplete="current-password"
                  className={`bc-login-input ${errors.password ? 'input-error' : ''}`}
                  style={{ paddingRight: '74px' }}
                  placeholder="Enter your password"
                  value={password}
                  onBlur={() => validateField('password', password)}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: '' });
                  }}
                />
                <button
                  type="button"
                  className="bc-login-show-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              {errors.password && <span className="quest-error-text">{errors.password}</span>}
            </div>

            <div className="bc-login-forgot-row">
              <button
                type="button"
                className="bc-login-forgot-btn"
                onClick={() => {
                  setResetEmail(email);
                  setResetError('');
                  setShowResetModal(true);
                }}
              >
                {remainingSeconds > 0
                  ? `Forgot password? (${formatCooldownMMSS(remainingSeconds)})`
                  : 'Forgot password?'}
              </button>
            </div>

            <button type="submit" disabled={isSigningIn} className="bc-login-submit-btn">
              <span>{isSigningIn ? 'Signing In...' : 'Access Dashboard'}</span>
              <span className="bc-login-arrow-circle">
                <ArrowRight size={15} />
              </span>
            </button>
          </form>
        </div>
      </section>

      {/* FORGOT PASSWORD MODAL WITH 5-MINUTE RATE-LIMIT COOLDOWN */}
      {showResetModal && (
        <div className="quest-modal-backdrop" onClick={() => setShowResetModal(false)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#0F172A' }}>Reset Password</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                    Receive a password recovery link via email (1 request per 5 mins)
                  </p>
                </div>
              </div>
              <button onClick={() => setShowResetModal(false)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            {remainingSeconds > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: '12px',
                  color: '#B45309',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  marginBottom: '16px'
                }}
              >
                <Clock size={16} color="#D97706" style={{ flexShrink: 0 }} />
                <span>
                  Rate limit active: You can request another reset link in{' '}
                  <strong>{formatCooldownMMSS(remainingSeconds)}</strong>.
                </span>
              </div>
            )}

            <form onSubmit={handleForgotPassword} noValidate>
              <div style={{ marginBottom: '20px' }}>
                <label className="bc-login-label">
                  Assigned Email Address <span className="quest-req-star">*</span>
                </label>
                <input
                  type="email"
                  maxLength={80}
                  disabled={remainingSeconds > 0}
                  className={`bc-login-input ${resetError ? 'input-error' : ''}`}
                  placeholder="Enter your registered BC email"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(sanitizeEmailInput(e.target.value));
                    if (resetError) setResetError('');
                  }}
                />
                {resetError && <span className="quest-error-text">{resetError}</span>}
              </div>

              <div className="quest-modal-actions">
                <button type="button" onClick={() => setShowResetModal(false)} className="quest-btn quest-btn-outline">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingReset || remainingSeconds > 0}
                  className="quest-btn quest-btn-primary"
                  style={{
                    opacity: remainingSeconds > 0 ? 0.65 : 1,
                    cursor: remainingSeconds > 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSendingReset
                    ? 'Sending...'
                    : remainingSeconds > 0
                    ? `Wait ${formatCooldownMMSS(remainingSeconds)}`
                    : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}