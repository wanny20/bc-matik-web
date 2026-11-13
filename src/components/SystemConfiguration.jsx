import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Save, AlertTriangle, Power, Tv, Clock, ShieldCheck, Smartphone, CheckSquare } from 'lucide-react';
import { useUI } from './UIContext';
import { SkeletonConfigPage } from './Skeleton';
import { ACADEMIC_DIVISIONS, BC_PROGRAMS, ALL_PROGRAM_CODES } from '../constants/academicPrograms';
import './SystemConfiguration.css';

export default function SystemConfiguration({ setAdminSection }) {
  const { showToast, confirmAction } = useUI();
  const [operatingHours, setOperatingHours] = useState({ start: '08:00', end: '17:00' });
  const [tvAnnouncement, setTvAnnouncement] = useState('');
  
  const [accessMode, setAccessMode] = useState('ALL'); // 'ALL' or 'RESTRICTED'
  const [allowedPrograms, setAllowedPrograms] = useState(['BSCS']);
  const [appAnnouncement, setAppAnnouncement] = useState('');
  const [errors, setErrors] = useState({});

  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(db, 'settings', 'global');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.operatingHours) setOperatingHours(data.operatingHours);
        if (data.tvAnnouncement !== undefined) setTvAnnouncement(data.tvAnnouncement);
        if (data.accessMode) setAccessMode(data.accessMode);
        if (data.allowedPrograms) setAllowedPrograms(data.allowedPrograms);
        if (data.appAnnouncement !== undefined) setAppAnnouncement(data.appAnnouncement);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const toggleProgramChip = (code) => {
    setAllowedPrograms(prev => {
      const next = prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code];
      if (next.length > 0 && errors.allowedPrograms) {
        setErrors({ ...errors, allowedPrograms: '' });
      }
      return next;
    });
  };

  const toggleEntireDepartment = (deptKey) => {
    const codes = (BC_PROGRAMS[deptKey] || []).map(p => p.code);
    const allSelected = codes.every(c => allowedPrograms.includes(c));
    if (allSelected) {
      setAllowedPrograms(prev => prev.filter(c => !codes.includes(c)));
    } else {
      setAllowedPrograms(prev => Array.from(new Set([...prev, ...codes])));
      if (errors.allowedPrograms) setErrors({ ...errors, allowedPrograms: '' });
    }
  };

  const selectAllPrograms = () => {
    const allCodes = ALL_PROGRAM_CODES.map(p => p.code);
    setAllowedPrograms(allCodes);
    if (errors.allowedPrograms) setErrors({ ...errors, allowedPrograms: '' });
  };

  const clearAllPrograms = () => {
    setAllowedPrograms([]);
  };

  const handleSaveChanges = async () => {
    const newErrors = {};
    if (accessMode === 'RESTRICTED' && allowedPrograms.length === 0) {
      newErrors.allowedPrograms = 'At least one program or group is required when Restricted Mode is active';
    }
    if (accessMode === 'RESTRICTED' && !appAnnouncement.trim()) {
      newErrors.appAnnouncement = 'Mobile App Schedule Announcement is required when restricting programs';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast('Please complete the required Program Gatekeeper fields.', 'error', 'Validation Error');
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        operatingHours,
        tvAnnouncement,
        accessMode,
        allowedPrograms: accessMode === 'ALL' ? ['ALL'] : allowedPrograms,
        appAnnouncement: appAnnouncement.trim(),
        last_updated: new Date()
      }, { merge: true });
      setErrors({});
      showToast("Operating hours, Department Gatekeeper, and App/TV broadcasts updated.", "success", "Configuration Saved");
    } catch (error) {
      console.error("Error saving settings:", error);
      showToast("Failed to save system configurations.", "error");
    }
    setIsSaving(false);
  };

  const handleEndOfDayReset = () => {
    confirmAction({
      title: 'Force End-of-Day Reset?',
      message: 'WARNING: This will archive ALL active, waiting, and processing tickets across the entire campus and reset queues for tomorrow. This action cannot be undone.',
      confirmText: 'Yes, Purge & Archive Queues',
      variant: 'danger',
      onConfirm: async () => {
        setIsResetting(true);
        try {
          const batch = writeBatch(db);
          const activeStatuses = ["booked", "active", "called", "resolved_requirements", "pending_requirements", "ready_for_pickup", "processing"];
          const q = query(collection(db, "tickets"), where("status", "in", activeStatuses));
          const snap = await getDocs(q);
          
          if (snap.empty) {
            showToast("No active tickets found. The campus queues are already clear!", "warning", "Queues Already Clear");
            setIsResetting(false);
            return;
          }

          snap.docs.forEach((ticketDoc) => {
            batch.update(ticketDoc.ref, { 
              status: 'archived',
              "timestamps.archived_at": new Date() 
            });
          });

          await batch.commit();
          showToast(`Archived ${snap.size} active tickets. System is ready for the next business day!`, "success", "End-of-Day Reset Complete");
        } catch (error) {
          console.error("Error resetting queues:", error);
          showToast("Failed to execute End-of-Day reset.", "error");
        }
        setIsResetting(false);
      }
    });
  };

  if (loading) return <SkeletonConfigPage />;

return (
    <div>
      {/* Unified Page Header Banner (Only Back to Dashboard Button) */}
      <div className="quest-page-banner">
        <div>
          <h1>System Configuration</h1>
          <p>
            Manage global operating hours, department/program queue schedules, and App/TV broadcasts.
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="config-container">
        
        {/* Daily Department & Program Queue Gatekeeper (With Save Changes Button Inside!) */}
        <div className="config-full-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h3 className="config-title" style={{ margin: 0 }}>
                <ShieldCheck size={20} color="var(--quest-primary)" /> Daily Department & Client Queue Gatekeeper
              </h3>
              <span className={`quest-badge ${accessMode === 'ALL' ? 'badge-success' : 'badge-warning'}`}>
                {accessMode === 'ALL' 
                  ? '● OPEN TO ALL STUDENTS, ALUMNI & GUESTS TODAY' 
                  : `● RESTRICTED (${allowedPrograms.length} SELECTED): ${allowedPrograms.slice(0, 6).join(', ')}${allowedPrograms.length > 6 ? '...' : ''}`}
              </span>
            </div>

            <button 
              onClick={handleSaveChanges} 
              disabled={isSaving}
              className="quest-btn quest-btn-primary" 
              style={{ borderRadius: '999px', padding: '10px 22px' }}
            >
              <Save size={17} /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: '24px', alignItems: 'start' }}>
            {/* Left Column: Access Policy & Mobile App Banner */}
            <div>
              <label className="config-label">
                Queue Access Policy Today <span className="quest-req-star">*</span>
              </label>
              <select 
                className="quest-input" 
                value={accessMode} 
                onChange={(e) => {
                  setAccessMode(e.target.value);
                  setErrors({});
                }}
                style={{ marginBottom: '16px' }}
              >
                <option value="ALL">All Clients Allowed (Regular Campus Operations)</option>
                <option value="RESTRICTED">Specific Departments / Programs Only (Scheduled Days)</option>
              </select>

              <label className="config-label">
                <Smartphone size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Student Mobile App Announcement Banner {accessMode === 'RESTRICTED' && <span className="quest-req-star">*</span>}
              </label>
              <textarea 
                className={`quest-input ${errors.appAnnouncement ? 'input-error' : ''}`}
                rows="4"
                placeholder="e.g. ENROLLMENT SCHEDULE TODAY: Computer Studies (BSCS, BLIS) and Criminal Justice (BSCRIM) students only. Alumni & Guests are welcome."
                value={appAnnouncement}
                onBlur={() => {
                  if (accessMode === 'RESTRICTED' && !appAnnouncement.trim()) {
                    setErrors(prev => ({ ...prev, appAnnouncement: 'Mobile App Schedule Announcement is required' }));
                  }
                }}
                onChange={(e) => {
                  setAppAnnouncement(e.target.value);
                  if (errors.appAnnouncement) setErrors({ ...errors, appAnnouncement: '' });
                }}
                style={{ resize: 'none' }}
              />
              {errors.appAnnouncement && <span className="quest-error-text">{errors.appAnnouncement}</span>}
              <p className="config-hint">
                This live banner appears at the top of the BCMatik Android app so students, alumni, and guests immediately know today's schedule.
              </p>
            </div>

            {/* Right Column: Categorized Department & Program Selector */}
            <div style={{ 
              padding: '20px', 
              borderRadius: '14px', 
              backgroundColor: accessMode === 'ALL' ? '#F8FAFC' : '#FFFFFF',
              border: `1.5px solid ${errors.allowedPrograms ? '#DC2626' : 'var(--quest-border)'}`,
              opacity: accessMode === 'ALL' ? 0.65 : 1,
              pointerEvents: accessMode === 'ALL' ? 'none' : 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #E2E8F0' }}>
                <label className="config-label" style={{ margin: 0 }}>
                  Select Allowed Programs & Groups Today <span className="quest-req-star">*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={selectAllPrograms} className="quest-btn quest-btn-outline" style={{ padding: '5px 10px', fontSize: '11px' }}>
                    Select All
                  </button>
                  <button type="button" onClick={clearAllPrograms} className="quest-btn quest-btn-outline" style={{ padding: '5px 10px', fontSize: '11px' }}>
                    Clear All
                  </button>
                </div>
              </div>

{/* Render Each Department Cleanly (No Duplicate Headers) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {ACADEMIC_DIVISIONS.map((dept) => {
                  const deptPrograms = BC_PROGRAMS[dept.id] || [];
                  const allDeptSelected = deptPrograms.length > 0 && deptPrograms.every(p => allowedPrograms.includes(p.code));

                  return (
                    <div 
                      key={dept.id} 
                      style={{ 
                        padding: '14px 16px', 
                        borderRadius: '12px', 
                        backgroundColor: '#F8FAFC', 
                        border: '1px solid #E2E8F0',
                        gridColumn: ['CRIM', 'BUSINESS', 'ASTE', 'GRADUATE', 'EXTERNAL'].includes(dept.id) ? '1 / -1' : 'auto'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span className="config-division-header" style={{ margin: 0, color: '#1E293B' }}>
                          {dept.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleEntireDepartment(dept.id)}
                          className={`config-dept-select-btn ${allDeptSelected ? 'active' : ''}`}
                          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                          title={allDeptSelected ? `Deselect all ${dept.label} programs` : `Select all ${dept.label} programs`}
                        >
                          <CheckSquare size={12} />
                          {allDeptSelected ? 'All Selected ✓' : '+ Select Dept'}
                        </button>
                      </div>

                      <div className="config-chip-group" style={{ margin: 0 }}>
                        {deptPrograms.map(prog => (
                          <span 
                            key={prog.code} 
                            onClick={() => toggleProgramChip(prog.code)}
                            className={`config-program-chip ${allowedPrograms.includes(prog.code) ? 'selected' : ''}`}
                            title={prog.name}
                          >
                            {prog.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {errors.allowedPrograms && <span className="quest-error-text" style={{ marginTop: '12px', display: 'block' }}>{errors.allowedPrograms}</span>}
            </div>
          </div>
        </div>

        {/* Global Operating Hours Card */}
        <div className="config-card">
          <h3 className="config-title">
            <Clock size={18} color="var(--quest-primary)" /> Campus Operating Hours
          </h3>
          <div className="config-time-grid">
            <div>
              <label className="config-label">System Open <span className="quest-req-star">*</span></label>
              <input 
                type="time" 
                className="quest-input" 
                value={operatingHours.start} 
                onChange={e => setOperatingHours({...operatingHours, start: e.target.value})} 
              />
            </div>
            <div>
              <label className="config-label">System Close (Auto-lock) <span className="quest-req-star">*</span></label>
              <input 
                type="time" 
                className="quest-input" 
                value={operatingHours.end} 
                onChange={e => setOperatingHours({...operatingHours, end: e.target.value})} 
              />
            </div>
          </div>
          <p className="config-hint">
            The Android app will prevent students from generating new tickets outside of these configured hours.
          </p>
        </div>

        {/* TV Announcement Card */}
        <div className="config-card">
          <h3 className="config-title">
            <Tv size={18} color="var(--quest-primary)" /> Hallway TV Broadcast
          </h3>
          <label className="config-label">Scrolling Marquee Announcement</label>
          <textarea 
            className="quest-input" 
            rows="3" 
            placeholder="Type an announcement to display on the Hallway TV screens..."
            value={tvAnnouncement}
            onChange={e => setTvAnnouncement(e.target.value)}
            style={{ resize: 'none' }}
          ></textarea>
        </div>

        {/* Danger Zone: End of Day */}
        <div className="config-danger-card">
          <h3 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px', color: 'var(--quest-danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} /> End of Day Operations
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--quest-text-secondary)', marginBottom: '16px' }}>
            Purging the queues will instantly force-archive all current waiting and processing tickets, returning the live queues to zero for the next business day. <strong>This action cannot be undone.</strong>
          </p>
          <button 
            onClick={handleEndOfDayReset}
            disabled={isResetting}
            className="quest-btn quest-btn-danger"
          >
            <Power size={16} /> {isResetting ? 'Archiving Queues...' : 'Force End-of-Day Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}