import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, getDoc, onSnapshot, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import OfficeManager from './components/OfficeManager';
import StaffDashboard from './components/StaffDashboard';
import PublicDisplay from './components/PublicDisplay';
import WebLogin from './components/WebLogin';
import AdminAnalytics from './components/AdminAnalytics';
import StudentManager from './components/StudentManager';
import WorkflowManager from './components/WorkflowManager';
import SystemConfiguration from './components/SystemConfiguration';
import StaffManager from './components/StaffManager';
import ImportCSV from './components/ImportCSV';
import DocumentReleaseTracker from './components/DocumentReleaseTracker';
import TablePagination from './components/TablePagination';
import { UIProvider, useUI } from './components/UIContext';
import { SkeletonAppShell, SkeletonTableRows } from './components/Skeleton';
import { 
  LayoutDashboard, Radio, ListChecks, Building2, 
  Tv, LogOut, UserCheck, Menu, Users, ChevronDown, ChevronRight, ChevronLeft, Download, Search, Bell, Eye, Trash2, X,
  RotateCcw, FileText, FileSpreadsheet, Printer, Calendar, ArrowUpDown
} from 'lucide-react';
import './index.css';
import './Layout.css';
import { sendOtpVerificationEmail } from './utils/brevoEmail';

function AppContent() {
  const { showToast, confirmAction } = useUI();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [assignedOffice, setAssignedOffice] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [adminSection, setAdminSection] = useState('dashboard');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [adminDocAlerts, setAdminDocAlerts] = useState([]);

  const [announcementModalText, setAnnouncementModalText] = useState(null);
  // 1. Live Internet Connection Monitor (Shows Toast on Offline / Online)
  useEffect(() => {
    const handleOffline = () => {
      showToast(
        'You are currently offline. Live queue updates will pause until internet is restored.',
        'error',
        'No Internet Connection'
      );
    };
    const handleOnline = () => {
      showToast(
        'Your internet connection has been restored. Syncing live queues...',
        'success',
        'Back Online'
      );
    };

    if (!navigator.onLine) {
      handleOffline();
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [showToast]);

const [broadcastModalData, setBroadcastModalData] = useState(null);

// 3. Real-Time Brevo Email Outbox Relay (Dispatches 6-Digit OTPs requested from Android App)
  useEffect(() => {
    if (!user || !role) return;
    const unsubOutbox = onSnapshot(collection(db, 'mail_outbox'), (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const mailDoc = change.doc;
          const data = mailDoc.data();
          if (data.status === 'sent' || data.status === 'failed') return;

          if (data.to && data.otp_code) {
            const res = await sendOtpVerificationEmail({
              toEmail: data.to,
              studentId: data.student_id || 'Student',
              otpCode: data.otp_code
            });
            await updateDoc(doc(db, 'mail_outbox', mailDoc.id), {
              status: res.ok ? 'sent' : 'failed',
              sent_at: new Date()
            });
          }
        }
      });
    });
    return () => unsubOutbox();
  }, [user, role]);

  // 2. Real-Time Global Announcement & Allowed Programs Schedule Listener
  useEffect(() => {
    if (!user || !role) return;
    const unsubGlobal = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const latestBanner = (data.appAnnouncement || 'All campus service offices are open for queuing today.').trim();
        const mode = data.accessMode || 'ALL';
        const progs = Array.isArray(data.allowedPrograms) ? [...data.allowedPrograms].sort() : ['ALL'];
        const hours = data.operatingHours || { start: '08:00', end: '17:00' };

        const signature = `${mode}|${progs.join(',')}|${latestBanner}`;
        const lastSeen = localStorage.getItem('bcmatik_last_seen_schedule_sig') || '';

        if (signature !== lastSeen) {
          setBroadcastModalData({
            signature,
            banner: latestBanner,
            accessMode: mode,
            allowedPrograms: progs,
            hours: `${hours.start || '08:00'} - ${hours.end || '17:00'}`
          });
        }
      }
    });
    return () => unsubGlobal();
  }, [user, role]);

  useEffect(() => {
    if (!user || !role) return;
    const q = query(
      collection(db, 'tickets'),
      where('status', 'in', ['processing', 'ready_for_pickup'])
    );
    const unsub = onSnapshot(q, (snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (role !== 'admin' && assignedOffice) {
        docs = docs.filter(t => t.target_office_id === assignedOffice);
      }
      setAdminDocAlerts(docs);
    });
    return () => unsub();
  }, [user, role, assignedOffice]);
  
  const [expandedMenus, setExpandedMenus] = useState({
    adminMenu: false,
    reports: false,
    userManagement: false
  });

  const getMenuGroupForSection = (section) => {
    if (['offices', 'workflows', 'settings', 'documents', 'live-desk'].includes(section)) return 'adminMenu';
    if (['records'].includes(section)) return 'reports';
    if (['students', 'staff', 'import-csv'].includes(section)) return 'userManagement';
    return null;
  };

  const toggleMenu = (menuKey) => {
    const activeGroup = getMenuGroupForSection(adminSection);
    setExpandedMenus((prev) => {
      const willExpand = !prev[menuKey];
      return {
        adminMenu: menuKey === 'adminMenu' ? willExpand : activeGroup === 'adminMenu',
        reports: menuKey === 'reports' ? willExpand : activeGroup === 'reports',
        userManagement: menuKey === 'userManagement' ? willExpand : activeGroup === 'userManagement'
      };
    });
  };

  const navigateAdminSection = (section) => {
    setAdminSection(section);
    const activeGroup = getMenuGroupForSection(section);
    setExpandedMenus({
      adminMenu: activeGroup === 'adminMenu',
      reports: activeGroup === 'reports',
      userManagement: activeGroup === 'userManagement'
    });
  };

// 1. Persistent Auth & Role Guard (Restores role & office on F5 refresh or URL change)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRole(null);
        setAssignedOffice(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const cleanEmail = (currentUser.email || '').toLowerCase().trim();
        let userData = null;

        if (cleanEmail) {
          const emailDocSnap = await getDoc(doc(db, 'users', cleanEmail));
          if (emailDocSnap.exists()) {
            userData = emailDocSnap.data();
          }
        }

        if (!userData) {
          const uidDocSnap = await getDoc(doc(db, 'staff_users', currentUser.uid));
          if (uidDocSnap.exists()) {
            userData = uidDocSnap.data();
          }
        }

        if (!userData && cleanEmail) {
          const qSnap = await getDocs(query(collection(db, 'users'), where('email', '==', cleanEmail)));
          if (!qSnap.empty) {
            userData = qSnap.docs[0].data();
          }
        }

        if (userData && (userData.role === 'admin' || userData.status !== 'disabled')) {
          setUser(currentUser);
          setRole(userData.role);
          setAssignedOffice(userData.assigned_office || null);
        } else {
          // Account disabled or unauthorized
          await signOut(auth);
          setUser(null);
          setRole(null);
          setAssignedOffice(null);
        }
      } catch (err) {
        console.error('Auth Guard verification error:', err);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Browser Back-Button Lock (Prevents logged-in users from backing out to the Login page)
  useEffect(() => {
    if (!user || !role) return;
    const targetPath = role === 'admin' || role === 'mini_admin' ? '/admin' : '/staff';
    window.history.pushState(null, '', targetPath);

    const handlePopState = () => {
      if (window.location.pathname !== '/tv') {
        window.history.pushState(null, '', targetPath);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, role]);

  const handleLogout = () => {
    setUserMenuOpen(false);
    confirmAction({
      title: 'Sign Out of BCMatik',
      message: 'Are you sure you want to log out of your current session?',
      confirmText: 'Log Out',
      variant: 'danger',
      onConfirm: async () => {
        await signOut(auth);
        showToast('You have been safely logged out.', 'success', 'Signed Out');
      }
    });
  };

  if (loading) {
    return <SkeletonAppShell />;
  }

  const isAdminOrMini = role === 'admin' || role === 'mini_admin';

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/tv" element={<PublicDisplay />} />
        <Route path="/" element={
          user && role ? (
            <Navigate to={isAdminOrMini ? "/admin" : "/staff"} replace />
          ) : (
            <WebLogin setRole={setRole} setOffice={setAssignedOffice} />
          )
        } />

        <Route path="/*" element={
          user && role ? (
            <div className="quest-layout">
              <aside className={`quest-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
                <div className="quest-brand">
                  <img 
                    src="/LOGO.png" 
                    alt="BC-Matik Logo" 
                    className="quest-logo-mark" 
                    style={{ width: '40px', height: '40px', objectFit: 'contain', backgroundColor: 'transparent', padding: 0 }} 
                    onError={(e) => {
                      if (!e.currentTarget.src.endsWith('/logo.png')) e.currentTarget.src = '/logo.png';
                    }}
                  />
                  <div className="quest-brand-text">
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '18px', color: 'var(--quest-primary)', lineHeight: 1.1 }}>
                      BCMatik
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--quest-text-secondary)', fontWeight: 500 }}>
                      {role === 'mini_admin' ? `${assignedOffice} Mini Admin` : 'Bicol College Queuing'}
                    </div>
                  </div>
                </div>

                <nav className="quest-nav-list">
                  {isAdminOrMini ? (
                    <>
                      <button 
                        className={`quest-nav-item ${adminSection === 'dashboard' ? 'active' : ''}`} 
                        onClick={() => navigateAdminSection('dashboard')}
                        style={{ marginBottom: '8px' }}
                      >
                        <LayoutDashboard size={18} /> <span className="nav-label">Dashboard Overview</span>
                      </button>

                      <div>
                        <div 
                          className={`quest-nav-group ${(['offices', 'workflows', 'settings', 'documents', 'live-desk'].includes(adminSection)) && !expandedMenus.adminMenu ? 'active' : ''}`}
                          onClick={() => toggleMenu('adminMenu')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Building2 size={18} /> <span className="nav-label">{role === 'mini_admin' ? `${assignedOffice} Controls` : 'Admin Menu'}</span>
                          </div>
                          {expandedMenus.adminMenu ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <div className={`quest-nav-submenu ${expandedMenus.adminMenu ? 'expanded' : ''}`}>
                          <button 
                            className={`quest-nav-subitem ${adminSection === 'offices' ? 'active' : ''}`} 
                            onClick={() => navigateAdminSection('offices')}
                          >
                            {role === 'mini_admin' ? 'Manage Windows' : 'Manage Offices'}
                          </button>
                          <button 
                            className={`quest-nav-subitem ${adminSection === 'workflows' ? 'active' : ''}`} 
                            onClick={() => navigateAdminSection('workflows')}
                          >
                            Transaction Workflows
                          </button>
                          <button 
                            className={`quest-nav-subitem ${adminSection === 'documents' ? 'active' : ''}`} 
                            onClick={() => navigateAdminSection('documents')}
                          >
                            Document Releases
                          </button>
                          {role === 'mini_admin' && (
                            <button 
                              className={`quest-nav-subitem ${adminSection === 'live-desk' ? 'active' : ''}`} 
                              onClick={() => navigateAdminSection('live-desk')}
                            >
                              Live Queue Desk
                            </button>
                          )}
                          {role === 'admin' && (
                            <button 
                              className={`quest-nav-subitem ${adminSection === 'settings' ? 'active' : ''}`} 
                              onClick={() => navigateAdminSection('settings')}
                            >
                              System Configuration
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div 
                          className={`quest-nav-group ${adminSection === 'records' && !expandedMenus.reports ? 'active' : ''}`}
                          onClick={() => toggleMenu('reports')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <ListChecks size={18} /> <span className="nav-label">Reports</span>
                          </div>
                          {expandedMenus.reports ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <div className={`quest-nav-submenu ${expandedMenus.reports ? 'expanded' : ''}`}>
                          <button 
                            className={`quest-nav-subitem ${adminSection === 'records' ? 'active' : ''}`} 
                            onClick={() => navigateAdminSection('records')}
                          >
                            Queue Records & Logs
                          </button>
                        </div>
                      </div>

                      {role === 'admin' && (
                        <div>
                          <div 
                            className={`quest-nav-group ${(adminSection === 'students' || adminSection === 'staff' || adminSection === 'import-csv') && !expandedMenus.userManagement ? 'active' : ''}`}
                            onClick={() => toggleMenu('userManagement')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <Users size={18} /> <span className="nav-label">User Management</span>
                            </div>
                            {expandedMenus.userManagement ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                          <div className={`quest-nav-submenu ${expandedMenus.userManagement ? 'expanded' : ''}`}>
                            <button 
                              className={`quest-nav-subitem ${adminSection === 'students' ? 'active' : ''}`} 
                              onClick={() => navigateAdminSection('students')}
                            >
                              Student Roster
                            </button>
                            <button 
                              className={`quest-nav-subitem ${adminSection === 'staff' ? 'active' : ''}`} 
                              onClick={() => navigateAdminSection('staff')}
                            >
                              Staff & Mini Admins
                            </button>
                            <button 
                              className={`quest-nav-subitem ${adminSection === 'import-csv' ? 'active' : ''}`} 
                              onClick={() => navigateAdminSection('import-csv')}
                            >
                              Import CSV
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--quest-text-muted)', padding: '8px 14px 4px', textTransform: 'uppercase' }}>
                        Office Operations
                      </div>
                      <Link to="/staff" className="quest-nav-item active">
                        <Radio size={18} /> <span className="nav-label">Live Queue Desk</span>
                      </Link>
                    </>
                  )}

                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--quest-text-muted)', padding: '20px 14px 4px', textTransform: 'uppercase' }}>
                    Public Screens
                  </div>
                  <Link to="/tv" target="_blank" className="quest-nav-item">
                    <Tv size={18} /> <span className="nav-label">Hallway TV Monitor</span>
                  </Link>
                </nav>
              </aside>

              <div className={`quest-main-wrapper ${!isSidebarOpen ? 'expanded' : ''}`}>
                <header className="quest-topbar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                      className="quest-btn"
                      style={{ padding: '6px', background: 'transparent', color: 'var(--quest-text-primary)' }}
                    >
                      <Menu size={22} />
                    </button>
                    <span className="quest-badge badge-success">● System Online</span>
                    <span style={{ fontSize: '13px', color: 'var(--quest-text-secondary)' }}>
                      BCMatik Smart Queuing • Bicol College Main Campus
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                    <button
                      onClick={() => {
                        setNotifMenuOpen(!notifMenuOpen);
                        setUserMenuOpen(false);
                      }}
                      className="quest-btn quest-btn-outline"
                      style={{
                        position: 'relative',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Document Processing & Release Notifications"
                    >
                      <Bell size={18} color="var(--quest-text-primary)" />
                      {adminDocAlerts.length > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          backgroundColor: 'var(--quest-primary)',
                          color: '#FFFFFF',
                          fontSize: '10px',
                          fontWeight: 800,
                          minWidth: '18px',
                          height: '18px',
                          borderRadius: '999px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 4px',
                          border: '2px solid #FFFFFF'
                        }}>
                          {adminDocAlerts.length}
                        </span>
                      )}
                    </button>

                    {notifMenuOpen && (
                      <div className="quest-card" style={{ position: 'absolute', top: '52px', right: '180px', width: '360px', padding: '16px', zIndex: 120, boxShadow: '0 16px 36px rgba(15,23,42,0.14)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--quest-border)', marginBottom: '10px' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>
                              Document Release Alerts
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              {role === 'admin' ? 'All Campus Offices (Super Admin)' : `${assignedOffice} Department Scope`}
                            </div>
                          </div>
                          <span className="quest-badge badge-primary">{adminDocAlerts.length} Active</span>
                        </div>

                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {adminDocAlerts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 12px', color: '#64748B', fontSize: '12.5px' }}>
                              No documents pending processing or release.
                            </div>
                          ) : (
                            adminDocAlerts.map(item => {
                              const isReady = item.status === 'ready_for_pickup';
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => {
                                    setNotifMenuOpen(false);
                                    if (isAdminOrMini) navigateAdminSection('documents');
                                  }}
                                  style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    backgroundColor: item.near_expiry ? '#FEF2F2' : isReady ? '#F0FDF4' : '#FFFBEB',
                                    border: `1px solid ${item.near_expiry ? '#FECACA' : isReady ? '#BBF7D0' : '#FDE68A'}`,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--quest-primary)' }}>
                                      {item.queue_number} • {item.target_office_id}
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: item.near_expiry ? '#DC2626' : isReady ? '#15803D' : '#B45309' }}>
                                      {item.near_expiry ? 'NEAR EXPIRY' : isReady ? 'READY TO CLAIM' : 'NEEDS PROCESSING'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>
                                    {item.student_name || 'Student'} — {item.transaction_purpose}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {isAdminOrMini && (
                          <button
                            onClick={() => {
                              setNotifMenuOpen(false);
                              navigateAdminSection('documents');
                            }}
                            className="quest-btn quest-btn-primary"
                            style={{ width: '100%', marginTop: '12px', padding: '9px', fontSize: '12px' }}
                          >
                            Open Document Release Tracker
                          </button>
                        )}
                      </div>
                    )}

                    <button 
                      onClick={() => {
                        setUserMenuOpen(!userMenuOpen);
                        setNotifMenuOpen(false);
                      }}
                      className="quest-btn quest-btn-outline" 
                      style={{ padding: '8px 16px', borderRadius: '999px', border: '1px solid var(--quest-border)' }}
                    >
                      <UserCheck size={16} color="var(--quest-primary)" />
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        {role === 'admin' ? 'Super Administrator' : role === 'mini_admin' ? `${assignedOffice} Mini Admin` : `${assignedOffice} Staff`}
                      </span>
                    </button>

                    {userMenuOpen && (
                      <div className="quest-card" style={{ position: 'absolute', top: '52px', right: 0, width: '240px', padding: '8px', zIndex: 100 }}>
                        <div style={{ padding: '12px', borderBottom: '1px solid var(--quest-border)', marginBottom: '8px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--quest-text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
                            Signed in as
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--quest-text-primary)', wordBreak: 'break-all' }}>
                            {user.email}
                          </div>
                        </div>
                        <button onClick={handleLogout} className="quest-nav-item" style={{ color: 'var(--quest-danger)' }}>
                          <LogOut size={16} /> Log Out
                        </button>
                      </div>
                    )}
                  </div>
                </header>

                <main className="quest-content">
                  <div key={adminSection} className="quest-page-View">
                    <Routes>
                      <Route path="/admin" element={
                        isAdminOrMini ? (
                          adminSection === 'dashboard' ? <AdminAnalytics /> :
                          adminSection === 'records' ? <QueueRecordsTable setAdminSection={navigateAdminSection} role={role} assignedOffice={assignedOffice} /> :
                          adminSection === 'documents' ? <DocumentReleaseTracker role={role} assignedOffice={assignedOffice} setAdminSection={navigateAdminSection} /> :
                          adminSection === 'live-desk' ? <StaffDashboard assignedOffice={assignedOffice} /> :
                          adminSection === 'workflows' ? <WorkflowManager setAdminSection={navigateAdminSection} role={role} assignedOffice={assignedOffice} /> :
                          adminSection === 'offices' ? <OfficeManager setAdminSection={navigateAdminSection} role={role} assignedOffice={assignedOffice} /> :
                          role === 'admin' && adminSection === 'settings' ? <SystemConfiguration setAdminSection={navigateAdminSection} /> :
                          role === 'admin' && adminSection === 'students' ? <StudentManager setAdminSection={navigateAdminSection} /> :
                          role === 'admin' && adminSection === 'staff' ? <StaffManager setAdminSection={navigateAdminSection} /> :
                          role === 'admin' && adminSection === 'import-csv' ? <ImportCSV setAdminSection={navigateAdminSection} /> :
                          <AdminAnalytics />
                        ) : <Navigate to="/staff" replace />
                      } />
                      <Route path="/staff" element={
                        role === 'staff' ? <StaffDashboard assignedOffice={assignedOffice} /> : <Navigate to="/admin" replace />
                      } />
                    </Routes>
                  </div>
                </main>
              </div>
            </div>
          ) : <Navigate to="/" replace />
        } />
      </Routes>
{/* GLOBAL ANNOUNCEMENT & ALLOWED PROGRAMS SCHEDULE MODAL */}
      {broadcastModalData && (
        <div
          className="quest-modal-backdrop"
          onClick={() => {
            localStorage.setItem('bcmatik_last_seen_schedule_sig', broadcastModalData.signature);
            setBroadcastModalData(null);
          }}
        >
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary">
                  <Bell size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#0F172A' }}>Campus Schedule & Broadcast</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                    Live Gatekeeper & Announcement Update
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  localStorage.setItem('bcmatik_last_seen_schedule_sig', broadcastModalData.signature);
                  setBroadcastModalData(null);
                }}
                className="quest-toast-close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              padding: '14px 16px',
              backgroundColor: '#FCEAE9',
              border: '1px solid #F5D0CE',
              borderRadius: '14px',
              color: '#0F172A',
              fontSize: '13.5px',
              fontWeight: 600,
              lineHeight: 1.55,
              marginBottom: '14px'
            }}>
              {broadcastModalData.banner}
            </div>

            <div className="quest-detail-box" style={{ marginBottom: '20px' }}>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Queue Access Mode</span>
                <span className={`quest-badge ${broadcastModalData.accessMode === 'ALL' ? 'badge-success' : 'badge-warning'}`}>
                  {broadcastModalData.accessMode === 'ALL' ? 'OPEN TO ALL' : 'SCHEDULED BY PROGRAM'}
                </span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Allowed Programs Today</span>
                <span className="quest-detail-value" style={{ maxWidth: '240px', textAlign: 'right' }}>
                  {broadcastModalData.accessMode === 'ALL' || broadcastModalData.allowedPrograms.includes('ALL')
                    ? 'All Academic Programs & Guests'
                    : broadcastModalData.allowedPrograms.join(', ')}
                </span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Operating Hours</span>
                <span className="quest-detail-value">{broadcastModalData.hours}</span>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('bcmatik_last_seen_schedule_sig', broadcastModalData.signature);
                  setBroadcastModalData(null);
                }}
                className="quest-btn quest-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Acknowledge & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}

/* Searchable & Paginated Queue Records Table with Custom Date Range (From - To) Filter & Export */
function QueueRecordsTable({ setAdminSection, role, assignedOffice }) {
  const { showToast, confirmAction } = useUI();
  const [records, setRecords] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Custom Date Range States (From Date -> To Date)
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState(role === 'mini_admin' && assignedOffice ? assignedOffice : 'ALL');
  const [startDate, setStartDate] = useState(''); // YYYY-MM-DD (From)
  const [endDate, setEndDate] = useState('');     // YYYY-MM-DD (To)
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Export Dropdown & View Modal States
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState(null);

  const getRecordDateObj = (rec) => {
    const raw = rec.timestamps?.booked_at || rec.timestamps?.activated_at || rec.created_at;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatRecordDate = (rec) => {
    const d = getRecordDateObj(rec);
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };
const formatRecordTime = (rec) => {
    const d = getRecordDateObj(rec);
    if (!d) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatRecordDateTime = (rec) => {
    const d = getRecordDateObj(rec);
    if (!d) return 'N/A';
    return `${formatRecordDate(rec)} • ${formatRecordTime(rec)}`;
  };

  const formatRecordYMD = (rec) => {
    const d = getRecordDateObj(rec);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const fetchRecords = async () => {
    setLoading(true);
    const [ticketSnap, officeSnap] = await Promise.all([
      getDocs(collection(db, "tickets")),
      getDocs(collection(db, "offices"))
    ]);
    setOffices(officeSnap.docs.map(d => d.data().office_name));

    let list = ticketSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (role === 'mini_admin' && assignedOffice) {
      list = list.filter(r => r.target_office_id === assignedOffice);
    }
    setRecords(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [role, assignedOffice]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSortOrder('desc');
    setCurrentPage(1);
    if (role === 'admin') setOfficeFilter('ALL');
    showToast('All search, date range, and office filters have been reset.', 'success', 'Filters Cleared');
  };

  const handleDeleteRecord = (rec) => {
    confirmAction({
      title: `Delete Queue Log (${rec.queue_number || 'Record'})?`,
      message: `Are you sure you want to permanently delete the transaction log for Ticket ${rec.queue_number || '---'} (${rec.student_name || 'Guest'})?`,
      confirmText: 'Delete Log',
      variant: 'danger',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'tickets', rec.id));
        showToast(`Deleted queue record ${rec.queue_number || ''}.`, 'success', 'Record Deleted');
        fetchRecords();
      }
    });
  };

  const filtered = records
    .filter(r => {
      const matchesOffice = officeFilter === 'ALL' || r.target_office_id === officeFilter;
      const recYMD = formatRecordYMD(r);

      let matchesDateRange = true;
      if (startDate && endDate) {
        matchesDateRange = Boolean(recYMD) && recYMD >= startDate && recYMD <= endDate;
      } else if (startDate) {
        matchesDateRange = Boolean(recYMD) && recYMD >= startDate;
      } else if (endDate) {
        matchesDateRange = Boolean(recYMD) && recYMD <= endDate;
      }

      const matchesSearch =
        (r.queue_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.transaction_purpose || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.student_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.student_name || 'Guest Student').toLowerCase().includes(searchTerm.toLowerCase());

      return matchesOffice && matchesDateRange && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = getRecordDateObj(a)?.getTime() || 0;
      const timeB = getRecordDateObj(b)?.getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  // Pagination Math
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, totalItems);
  const paginatedRecords = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const getDateRangeLabel = () => {
    if (startDate && endDate) return `${startDate}_to_${endDate}`;
    if (startDate) return `From_${startDate}`;
    if (endDate) return `Until_${endDate}`;
    return new Date().toISOString().slice(0, 10);
  };

  const getDateRangeDisplay = () => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Up to ${endDate}`;
    return 'All Dates';
  };

  const handleExportCSV = () => {
    setExportDropdownOpen(false);
    if (filtered.length === 0) {
      showToast('No records in the selected date range to export.', 'warning');
      return;
    }
    const headers = ['Date,Queue Number,Student Name,Student ID,Office,Transaction,Status'];
    const rows = filtered.map(r => 
      `"${formatRecordDateTime(r)}","${r.queue_number || ''}","${r.student_name || 'Walk-in Guest'}","${r.student_id || 'GUEST'}","${r.target_office_id || ''}","${r.transaction_purpose || 'General'}","${(r.status || '').toUpperCase()}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `BCMatik_Queue_Logs_${getDateRangeLabel()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filtered.length} queue records (${getDateRangeDisplay()}) to CSV.`, 'success', 'CSV Downloaded');
  };

  const handleExportExcel = () => {
    setExportDropdownOpen(false);
    if (filtered.length === 0) {
      showToast('No records in the selected date range to export.', 'warning');
      return;
    }
    const tableRows = filtered.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatRecordDateTime(r)}</td>
        <td><b>${r.queue_number || ''}</b></td>
        <td>${r.student_name || 'Walk-in Guest'}</td>
        <td>${r.student_id || 'GUEST'}</td>
        <td>${r.target_office_id || ''}</td>
        <td>${r.transaction_purpose || 'General'}</td>
        <td>${(r.status || '').toUpperCase()}</td>
      </tr>
    `).join('');

    const excelTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"></head>
      <body>
        <table border="1">
          <thead>
            <tr style="background-color:#9E0B03; color:#FFFFFF; font-weight:bold;">
              <th>#</th>
              <th>Date & Time</th>
              <th>Queue No.</th>
              <th>Client Name</th>
              <th>Student ID</th>
              <th>Office</th>
              <th>Transaction</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BCMatik_Queue_Logs_${getDateRangeLabel()}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} queue records (${getDateRangeDisplay()}) to Excel (.xls).`, 'success', 'Excel Downloaded');
  };

  const handleExportPDF = () => {
    setExportDropdownOpen(false);
    if (filtered.length === 0) {
      showToast('No records in the selected date range to export.', 'warning');
      return;
    }
    const printWin = window.open('', '_blank', 'width=960,height=700');
    if (!printWin) {
      showToast('Please allow popups in your browser to generate PDF reports.', 'error');
      return;
    }

    const rowsHtml = filtered.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatRecordDateTime(r)}</td>
        <td><strong>${r.queue_number || ''}</strong></td>
        <td>${r.student_name || 'Walk-in Guest'}</td>
        <td>${r.student_id || 'GUEST'}</td>
        <td>${r.target_office_id || ''}</td>
        <td>${r.transaction_purpose || 'General'}</td>
        <td>${(r.status || '').toUpperCase()}</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <html>
        <head>
          <title>BCMatik Queue Records Report</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 28px; color: #0F172A; }
            .header { border-bottom: 3px solid #9E0B03; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            h1 { margin: 0; color: #9E0B03; font-size: 22px; }
            p { margin: 4px 0 0; color: #64748B; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background-color: #9E0B03; color: #FFFFFF; text-align: left; padding: 10px 8px; text-transform: uppercase; font-size: 11px; }
            td { padding: 9px 8px; border-bottom: 1px solid #E2E8F0; }
            tr:nth-child(even) { background-color: #F8FAFC; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>BICOL COLLEGE • BCMATIK QUEUE REPORT</h1>
              <p>Scope: ${role === 'mini_admin' ? assignedOffice : officeFilter === 'ALL' ? 'All Campus Offices' : officeFilter} • Date Range: <strong>${getDateRangeDisplay()}</strong></p>
            </div>
            <p>Generated: ${new Date().toLocaleString()} • Total Records: ${filtered.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Queue No.</th>
                <th>Client Name</th>
                <th>Student ID</th>
                <th>Office</th>
                <th>Transaction</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 300);
    showToast('Opened PDF / Print preview window.', 'success', 'PDF Report Ready');
  };

  return (
    <div>
      <div className="quest-page-banner">
        <div>
          <h1>
            Queue Records & Logs {role === 'mini_admin' ? `(${assignedOffice})` : ''}
          </h1>
          <p>
            Filter historical queue records by custom date range (From – To) and export reports in PDF, Excel, or CSV.
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="quest-card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', gap: '10px', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 1. Search Input */}
            <div style={{ position: 'relative', minWidth: '210px', flex: 1, maxWidth: '260px' }}>
              <Search size={17} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '13px', top: '11px' }} />
              <input 
                type="text" 
                className="quest-input" 
                style={{ paddingLeft: '38px' }}
                placeholder="Search ID, name, or queue no..." 
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* 2. Custom Date Range: From Date -> To Date */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#F8FAFC',
              padding: '4px 10px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0'
            }}>
              <Calendar size={15} color="var(--quest-primary)" />
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>From</span>
              <input
                type="date"
                className="quest-input"
                style={{ width: '142px', padding: '6px 8px', fontSize: '12.5px' }}
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                title="Start Date (From)"
              />
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>To</span>
              <input
                type="date"
                className="quest-input"
                style={{ width: '142px', padding: '6px 8px', fontSize: '12.5px' }}
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                title="End Date (To)"
              />
            </div>

            {/* 3. Date Sort Order */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="quest-btn quest-btn-outline"
              style={{ padding: '9px 13px', fontSize: '12.5px', backgroundColor: '#FFFFFF' }}
              title="Toggle Date Sort Order"
            >
              <ArrowUpDown size={15} color="var(--quest-primary)" />
              {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
            </button>

            {/* 4. Office Filter */}
            {role === 'admin' && (
              <select
                className="quest-input"
                style={{ width: '165px' }}
                value={officeFilter}
                onChange={(e) => {
                  setOfficeFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Offices</option>
                {offices.map(off => (
                  <option key={off} value={off}>{off}</option>
                ))}
              </select>
            )}

            {/* 5. Clear Filters */}
            <button
              type="button"
              onClick={handleClearFilters}
              className="quest-btn"
              style={{
                backgroundColor: '#16A34A',
                color: '#FFFFFF',
                padding: '9px 14px',
                fontSize: '12.5px',
                fontWeight: 700,
                borderRadius: '10px',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} /> Clear Filters
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            <button
              type="button"
              onClick={handleExportPDF}
              className="quest-btn quest-btn-outline"
              style={{ padding: '9px 13px', borderRadius: '10px' }}
              title="Print Filtered Range"
            >
              <Printer size={17} color="var(--quest-primary)" />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="quest-btn quest-btn-primary"
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              >
                <Download size={16} /> Export <ChevronDown size={15} />
              </button>

              {exportDropdownOpen && (
                <div
                  className="quest-card"
                  style={{
                    position: 'absolute',
                    top: '46px',
                    right: 0,
                    width: '165px',
                    padding: '6px',
                    zIndex: 90,
                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    className="quest-nav-item"
                    style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
                  >
                    <FileText size={16} color="#DC2626" /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="quest-nav-item"
                    style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
                  >
                    <FileSpreadsheet size={16} color="#16A34A" /> Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="quest-nav-item"
                    style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
                  >
                    <FileText size={16} color="#0284C7" /> CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="quest-table-container">
          <table className="quest-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Queue No.</th>
                <th>Student / Guest Name</th>
                <th>Student ID</th>
                <th>Office</th>
                <th>Transaction</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={6} cols={8} />
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--quest-text-secondary)' }}>
                    No matching queue records found for the selected date range.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec) => (
                  <tr key={rec.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                        {formatRecordDate(rec)}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                        {formatRecordTime(rec)}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--quest-primary)' }}>
                      {rec.queue_number || '---'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{rec.student_name || 'Walk-in / Guest Student'}</td>
                    <td style={{ color: 'var(--quest-text-secondary)' }}>{rec.student_id || 'GUEST'}</td>
                    <td style={{ fontWeight: 600 }}>{rec.target_office_id || '---'}</td>
                    <td>{rec.transaction_purpose || 'General Inquiry'}</td>
                    <td>
                      <span className={`quest-badge ${
                        rec.status === 'completed' ? 'badge-success' :
                        rec.status === 'called' ? 'badge-info' :
                        rec.status === 'missed' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {rec.status?.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="quest-action-group">
                        <button
                          onClick={() => setViewingRecord(rec)}
                          className="quest-icon-btn view"
                          title="View Transaction Log Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(rec)}
                          className="quest-icon-btn delete"
                          title="Delete Log Record"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* BUILT-IN PAGINATION BAR */}
        {totalItems > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            paddingTop: '16px',
            marginTop: '16px',
            borderTop: '1px solid #E2E8F0',
            fontSize: '13px',
            color: '#475569'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <span>
                Showing <strong style={{ color: '#0F172A' }}>{startIdx}</strong> to <strong style={{ color: '#0F172A' }}>{endIdx}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong> records
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 600 }}>
                <label>Rows per page:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(safePage - 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: safePage <= 1 ? 0.45 : 1
                }}
              >
                <ChevronLeft size={15} /> Prev
              </button>

              {getPageNumbers().map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCurrentPage(num)}
                  style={{
                    minWidth: '34px',
                    height: '34px',
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: `1px solid ${num === safePage ? 'var(--quest-primary, #9E0B03)' : '#E2E8F0'}`,
                    backgroundColor: num === safePage ? 'var(--quest-primary, #9E0B03)' : '#FFFFFF',
                    color: num === safePage ? '#FFFFFF' : '#0F172A',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(safePage + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: safePage >= totalPages ? 0.45 : 1
                }}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW RECORD DETAILS MODAL */}
      {viewingRecord && (
        <div className="quest-modal-backdrop" onClick={() => setViewingRecord(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B' }}>Log Details: {viewingRecord.queue_number || '---'}</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Historical Queue Transaction Record</p>
              </div>
              <button onClick={() => setViewingRecord(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div className="quest-detail-box">
              <div className="quest-detail-row">
                <span className="quest-detail-label">Date Booked</span>
                <span className="quest-detail-value">{formatRecordDateTime(viewingRecord)}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Queue Number</span>
                <span className="quest-detail-value" style={{ color: 'var(--quest-primary)' }}>{viewingRecord.queue_number || '---'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Client Name</span>
                <span className="quest-detail-value">{viewingRecord.student_name || 'Walk-in Guest'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Student / Client ID</span>
                <span className="quest-detail-value">{viewingRecord.student_id || 'GUEST'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Office</span>
                <span className="quest-detail-value">{viewingRecord.target_office_id || '---'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Purpose</span>
                <span className="quest-detail-value">{viewingRecord.transaction_purpose || 'General Inquiry'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Priority Lane</span>
                <span className="quest-detail-value">{viewingRecord.is_priority ? 'Yes (Priority)' : 'Regular Lane'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Status</span>
                <span className="quest-badge badge-info">{viewingRecord.status?.toUpperCase()}</span>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setViewingRecord(null)} className="quest-btn quest-btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <UIProvider>
      <AppContent />
    </UIProvider>
  );
}