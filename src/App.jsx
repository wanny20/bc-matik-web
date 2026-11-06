import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import OfficeManager from './components/OfficeManager';
import StaffDashboard from './components/StaffDashboard';
import PublicDisplay from './components/PublicDisplay';
import WebLogin from './components/WebLogin';
import AdminAnalytics from './components/AdminAnalytics';
import StudentManager from './components/StudentManager';
import { 
  LayoutDashboard, Radio, ListChecks, Building2, 
  Tv, LogOut, UserCheck, Menu, Users 
} from 'lucide-react';
import './index.css';
import './Layout.css';

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [assignedOffice, setAssignedOffice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminSection, setAdminSection] = useState('dashboard');
  
  // Navigation & Menu States
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setRole(null);
        setAssignedOffice(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await signOut(auth);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <div className="quest-logo-mark">BC</div>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, color: 'var(--quest-text-secondary)' }}>
          Initializing BC-Matik System...
        </span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Hallway TV Display (No Sidebar) */}
        <Route path="/tv" element={<PublicDisplay />} />

        {/* Login Portal */}
        <Route path="/" element={
          user && role ? (
            <Navigate to={role === 'admin' ? "/admin" : "/staff"} replace />
          ) : (
            <WebLogin setRole={setRole} setOffice={setAssignedOffice} />
          )
        } />

        {/* Protected Admin & Staff Shell */}
        <Route path="/*" element={
          user && role ? (
            <div className="quest-layout">
              {/* Left Sidebar */}
              <aside className={`quest-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
                <div className="quest-brand">
                  <div className="quest-logo-mark" style={{ fontSize: '16px' }}>BC</div>
                  <div className="quest-brand-text">
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '18px', color: 'var(--quest-primary)', lineHeight: 1.1 }}>
                      BC-Matik
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--quest-text-secondary)', fontWeight: 500 }}>
                      Bicol College Queuing
                    </div>
                  </div>
                </div>

                <nav className="quest-nav-list">
                  {role === 'admin' ? (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--quest-text-muted)', padding: '8px 14px 4px', textTransform: 'uppercase' }}>
                        Administration
                      </div>
                      <button className={`quest-nav-item ${adminSection === 'dashboard' ? 'active' : ''}`} onClick={() => setAdminSection('dashboard')}>
                        <LayoutDashboard size={18} /> <span className="nav-label">Dashboard & Analytics</span>
                      </button>
                      <button className={`quest-nav-item ${adminSection === 'records' ? 'active' : ''}`} onClick={() => setAdminSection('records')}>
                        <ListChecks size={18} /> <span className="nav-label">Queue Records</span>
                      </button>
                      <button className={`quest-nav-item ${adminSection === 'students' ? 'active' : ''}`} onClick={() => setAdminSection('students')}>
                        <Users size={18} /> <span className="nav-label">Student Roster</span>
                      </button>
                      <button className={`quest-nav-item ${adminSection === 'offices' ? 'active' : ''}`} onClick={() => setAdminSection('offices')}>
                        <Building2 size={18} /> <span className="nav-label">Offices & Transactions</span>
                      </button>
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

              {/* Main Content Area */}
              <div className={`quest-main-wrapper ${!isSidebarOpen ? 'expanded' : ''}`}>
                
                {/* Top Navigation Bar */}
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
                      BC-Matik Smart Queuing • Bicol College Main Campus
                    </span>
                  </div>

                  {/* Right User Profile & Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
                    <button 
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="quest-btn quest-btn-outline" 
                      style={{ padding: '8px 16px', borderRadius: '999px', border: '1px solid var(--quest-border)' }}
                    >
                      <UserCheck size={16} color="var(--quest-primary)" />
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        {role === 'admin' ? 'System Administrator' : `${assignedOffice} Staff`}
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

                {/* Page Content */}
                <main className="quest-content">
                  <Routes>
                    <Route path="/admin" element={
                      role === 'admin' ? (
                        adminSection === 'dashboard' ? <AdminAnalytics /> :
                        adminSection === 'records' ? <QueueRecordsTable /> :
                        adminSection === 'students' ? <StudentManager /> :
                        <OfficeManager />
                      ) : <Navigate to="/staff" replace />
                    } />
                    <Route path="/staff" element={
                      role === 'staff' ? <StaffDashboard assignedOffice={assignedOffice} /> : <Navigate to="/admin" replace />
                    } />
                  </Routes>
                </main>
              </div>
            </div>
          ) : <Navigate to="/" replace />
        } />
      </Routes>
    </BrowserRouter>
  );
}

/* Searchable Queue Records Table for Admin */
function QueueRecordsTable() {
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState('ALL');

  useEffect(() => {
    const fetchRecords = async () => {
      const snap = await getDocs(collection(db, "tickets"));
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchRecords();
  }, []);

  const filtered = records.filter(r => {
    const matchesOffice = officeFilter === 'ALL' || r.target_office_id === officeFilter;
    const matchesSearch = (r.queue_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.transaction_purpose || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.student_name || 'Guest Student').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesOffice && matchesSearch;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', marginBottom: '4px' }}>Queue Records & Logs</h1>
          <p style={{ margin: 0, color: 'var(--quest-text-secondary)', fontSize: '14px' }}>
            Complete historical transaction records across all student service offices.
          </p>
        </div>
      </div>

      <div className="quest-card">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input 
              type="text" 
              className="quest-input" 
              placeholder="Search queue number, student name, or transaction..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="quest-input" style={{ width: '200px' }} value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
            <option value="ALL">All Offices</option>
            <option value="Accounting">Accounting</option>
            <option value="Cashier">Cashier</option>
            <option value="Registrar">Registrar</option>
          </select>
        </div>

        <div className="quest-table-container">
          <table className="quest-table">
            <thead>
              <tr>
                <th>Queue No.</th>
                <th>Student Name</th>
                <th>Student ID</th>
                <th>Office</th>
                <th>Transaction</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => (
                <tr key={rec.id}>
                  <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--quest-primary)' }}>
                    {rec.queue_number}
                  </td>
                  <td style={{ fontWeight: 500 }}>{rec.student_name || 'Walk-in / Guest Student'}</td>
                  <td style={{ color: 'var(--quest-text-secondary)' }}>{rec.student_id || 'BC-2026-GUEST'}</td>
                  <td>{rec.target_office_id}</td>
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--quest-text-secondary)' }}>
                    No matching queue records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;