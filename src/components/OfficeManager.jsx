import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, compressImageFile } from '../firebaseConfig';
import { Building2, Plus, Power, MonitorUp, Trash2, X, Eye, Edit3, KeyRound, RefreshCw, ImagePlus, Users } from 'lucide-react';
import { useUI } from './UIContext';
import { SkeletonTableRows } from './Skeleton';
import TablePagination from './TablePagination';

const PRESET_WINDOWS = [
  "Window 0",
  "Window 1",
  "Window 2",
  "Window 3",
  "Window 4",
  "Releasing Counter",
  "Verification Desk",
  "Counter A",
  "Counter B"
];

export default function OfficeManager({ setAdminSection, role = 'admin', assignedOffice = null }) {
  const { showToast, confirmAction } = useUI();
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Register Office Popup Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newOfficeName, setNewOfficeName] = useState('');
  const [newOfficeType, setNewOfficeType] = useState('minor');
  const [newLimitMode, setNewLimitMode] = useState('unlimited'); // 'unlimited' | 'custom'
  const [newDailyLimit, setNewDailyLimit] = useState('100');
  const [newOfficePhotoFile, setNewOfficePhotoFile] = useState(null);
  const [newOfficePhotoPreview, setNewOfficePhotoPreview] = useState('');
  const [officeError, setOfficeError] = useState('');
  const [limitError, setLimitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Window Manager Modal State
  const [managingOffice, setManagingOffice] = useState(null);
  const [selectedPresetWindow, setSelectedPresetWindow] = useState('Window 0');
  const [customWindowInput, setCustomWindowInput] = useState('');
  const [windowError, setWindowError] = useState('');

  // Minor Office Unique 4-Digit Code Modal State
  const [codeOffice, setCodeOffice] = useState(null);

  // View & Edit Office Modal States
  const [viewingOffice, setViewingOffice] = useState(null);
  const [editingOffice, setEditingOffice] = useState(null);
  const [editOfficeName, setEditOfficeName] = useState('');
  const [editOfficeType, setEditOfficeType] = useState('minor');
  const [editOfficeOnline, setEditOfficeOnline] = useState(true);
  const [editLimitMode, setEditLimitMode] = useState('unlimited'); // 'unlimited' | 'custom'
  const [editDailyLimit, setEditDailyLimit] = useState('100');
  const [editOfficePhotoFile, setEditOfficePhotoFile] = useState(null);
  const [editOfficePhotoPreview, setEditOfficePhotoPreview] = useState('');
  const [editOfficeError, setEditOfficeError] = useState('');
  const [editLimitError, setEditLimitError] = useState('');
  const [isUpdatingOffice, setIsUpdatingOffice] = useState(false);

  const isMiniAdmin = role === 'mini_admin';

  const fetchOffices = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'offices'));
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isMiniAdmin && assignedOffice) {
      list = list.filter(o => o.office_name === assignedOffice);
    }
    setOffices(list);
    setLoading(false);
  }, [isMiniAdmin, assignedOffice]);

  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  const uploadCompressedOfficePhoto = async (file, officeNameKey) => {
    if (!file) return null;
    const { blob, dataUrl } = await compressImageFile(file, 800, 450, 0.70);
    try {
      const cleanSlug = officeNameKey.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const storageRef = ref(storage, `office_pictures/${cleanSlug}_${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      return await getDownloadURL(storageRef);
    } catch (storageErr) {
      console.warn('Storage upload fallback to compressed DataURL:', storageErr);
      return dataUrl;
    }
  };

  const handleSelectPhoto = async (e, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (JPG, PNG, WebP).', 'error', 'Invalid File');
      return;
    }
    const { dataUrl } = await compressImageFile(file, 800, 450, 0.70);
    if (isEdit) {
      setEditOfficePhotoFile(file);
      setEditOfficePhotoPreview(dataUrl);
    } else {
      setNewOfficePhotoFile(file);
      setNewOfficePhotoPreview(dataUrl);
    }
  };

  const handleAddOffice = async (e) => {
    e.preventDefault();
    if (isMiniAdmin) return;
    if (!newOfficeName.trim()) {
      setOfficeError('Office Name is required');
      return;
    }

    const parsedLimit = newLimitMode === 'unlimited' ? 0 : parseInt(newDailyLimit, 10);
    if (newLimitMode === 'custom' && (isNaN(parsedLimit) || parsedLimit <= 0)) {
      setLimitError('Please enter a valid daily limit greater than 0');
      return;
    }
    
    const cleanName = newOfficeName.trim();
    const isDuplicate = offices.some(
      (office) => office.office_name.toLowerCase() === cleanName.toLowerCase()
    );

    if (isDuplicate) {
      setOfficeError(`${cleanName} is already registered`);
      showToast(`${cleanName} is already registered in the system.`, 'error', 'Duplicate Office');
      return;
    }

    const initialCode = String(Math.floor(1000 + Math.random() * 9000));

    setIsSubmitting(true);
    try {
      let uploadedPhotoUrl = '';
      if (newOfficePhotoFile) {
        uploadedPhotoUrl = await uploadCompressedOfficePhoto(newOfficePhotoFile, cleanName);
      }

      await addDoc(collection(db, 'offices'), {
        office_name: cleanName,
        is_major: newOfficeType === 'major',
        is_online: true,
        windows: ["Window 0"],
        clearance_code: initialCode,
        daily_limit: parsedLimit,
        image_url: uploadedPhotoUrl || '',
        created_at: new Date()
      });
      showToast(`${cleanName} registered with ${parsedLimit > 0 ? `${parsedLimit}/day limit` : 'No Daily Limit'}!`, 'success', 'Office Registered');
      setNewOfficeName('');
      setNewOfficeType('minor');
      setNewLimitMode('unlimited');
      setNewDailyLimit('100');
      setNewOfficePhotoFile(null);
      setNewOfficePhotoPreview('');
      setOfficeError('');
      setLimitError('');
      setIsAddModalOpen(false);
      fetchOffices();
    } catch (error) {
      console.error("Error adding office: ", error);
      showToast("Failed to register office in database.", 'error');
    }
    setIsSubmitting(false);
  };

  const handleRefreshClearanceCode = async (office) => {
    const newCode = String(Math.floor(1000 + Math.random() * 9000));
    try {
      await updateDoc(doc(db, 'offices', office.id), {
        clearance_code: newCode,
        code_updated_at: new Date()
      });
      showToast(`Refreshed 4-digit code for ${office.office_name} to [ ${newCode} ].`, 'success', 'Code Refreshed');
      fetchOffices();
      if (codeOffice && codeOffice.id === office.id) {
        setCodeOffice({ ...codeOffice, clearance_code: newCode });
      }
    } catch (e) {
      showToast('Failed to refresh office clearance code.', 'error');
    }
  };

  const openEditModal = (office) => {
    const currentLim = Number(office.daily_limit || 0);
    setEditingOffice(office);
    setEditOfficeName(office.office_name || '');
    setEditOfficeType(office.is_major ? 'major' : 'minor');
    setEditOfficeOnline(office.is_online ?? true);
    setEditLimitMode(currentLim > 0 ? 'custom' : 'unlimited');
    setEditDailyLimit(currentLim > 0 ? String(currentLim) : '100');
    setEditOfficePhotoFile(null);
    setEditOfficePhotoPreview(office.image_url || '');
    setEditOfficeError('');
    setEditLimitError('');
  };

  const handleUpdateOffice = async (e) => {
    e.preventDefault();
    if (!editingOffice) return;
    const cleanName = editOfficeName.trim();
    if (!cleanName) {
      setEditOfficeError('Office Name is required');
      return;
    }

    const parsedLimit = editLimitMode === 'unlimited' ? 0 : parseInt(editDailyLimit, 10);
    if (editLimitMode === 'custom' && (isNaN(parsedLimit) || parsedLimit <= 0)) {
      setEditLimitError('Please enter a valid daily limit greater than 0');
      return;
    }

    const isDuplicate = offices.some(
      (o) => o.id !== editingOffice.id && o.office_name.toLowerCase() === cleanName.toLowerCase()
    );
    if (isDuplicate) {
      setEditOfficeError(`${cleanName} already exists`);
      showToast(`Another office named "${cleanName}" already exists.`, 'error', 'Duplicate Name');
      return;
    }

    setIsUpdatingOffice(true);
    try {
      let finalPhotoUrl = editOfficePhotoPreview || '';
      if (editOfficePhotoFile) {
        finalPhotoUrl = await uploadCompressedOfficePhoto(editOfficePhotoFile, cleanName);
      }

      await updateDoc(doc(db, 'offices', editingOffice.id), {
        office_name: cleanName,
        is_major: editOfficeType === 'major',
        is_online: editOfficeOnline,
        daily_limit: parsedLimit,
        image_url: finalPhotoUrl,
        updated_at: new Date()
      });
      showToast(`${cleanName} updated (${parsedLimit > 0 ? `Max ${parsedLimit} clients/day` : 'No Daily Limit'})!`, 'success', 'Office Updated');
      setEditingOffice(null);
      fetchOffices();
    } catch (e) {
      showToast('Failed to update office details.', 'error');
    }
    setIsUpdatingOffice(false);
  };

  const handleDeleteOffice = (office) => {
    if (isMiniAdmin) {
      showToast('Only the Super Administrator can delete an office.', 'warning', 'Restricted');
      return;
    }
    confirmAction({
      title: `Delete ${office.office_name}?`,
      message: `Are you sure you want to permanently remove "${office.office_name}" from the system? This cannot be undone.`,
      confirmText: 'Delete Office',
      variant: 'danger',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'offices', office.id));
        showToast(`"${office.office_name}" has been deleted.`, 'success', 'Office Removed');
        fetchOffices();
      }
    });
  };

  const toggleStatus = (office) => {
    if (office.is_online) {
      confirmAction({
        title: `Take ${office.office_name} Offline?`,
        message: `Taking ${office.office_name} offline will hide it from the student mobile app and Hallway TV immediately.`,
        confirmText: 'Take Offline',
        variant: 'danger',
        onConfirm: async () => {
          await updateDoc(doc(db, 'offices', office.id), { is_online: false });
          showToast(`${office.office_name} is now offline.`, 'warning', 'Status Updated');
          fetchOffices();
        }
      });
    } else {
      updateDoc(doc(db, 'offices', office.id), { is_online: true }).then(() => {
        showToast(`${office.office_name} is now online and visible to students.`, 'success', 'Status Updated');
        fetchOffices();
      });
    }
  };

  const toggleClassification = async (office) => {
    if (isMiniAdmin) {
      showToast('Only the Super Administrator can change Major/Minor office classifications.', 'warning', 'Restricted');
      return;
    }
    await updateDoc(doc(db, 'offices', office.id), { is_major: !office.is_major });
    showToast(`${office.office_name} switched to ${!office.is_major ? 'Major' : 'Minor'} classification.`, 'success');
    fetchOffices();
  };

  const handleAddWindow = async (useCustom = false) => {
    if (!managingOffice) return;
    const windowNameToAdd = useCustom ? customWindowInput.trim() : selectedPresetWindow;
    if (!windowNameToAdd) {
      setWindowError('Window Name is required');
      return;
    }
    if ((managingOffice.windows || []).includes(windowNameToAdd)) {
      showToast(`${windowNameToAdd} already exists for ${managingOffice.office_name}.`, 'error');
      return;
    }
    await updateDoc(doc(db, 'offices', managingOffice.id), {
      windows: arrayUnion(windowNameToAdd)
    });
    setCustomWindowInput('');
    setWindowError('');
    showToast(`Added ${windowNameToAdd} to ${managingOffice.office_name}.`, 'success');
    fetchOffices();
    setManagingOffice({ ...managingOffice, windows: [...(managingOffice.windows || []), windowNameToAdd] });
  };

  const handleRemoveWindow = (windowName) => {
    confirmAction({
      title: 'Remove Service Window',
      message: `Are you sure you want to remove "${windowName}" from ${managingOffice.office_name}?`,
      confirmText: 'Remove Window',
      variant: 'danger',
      onConfirm: async () => {
        await updateDoc(doc(db, 'offices', managingOffice.id), {
          windows: arrayRemove(windowName)
        });
        showToast(`Removed ${windowName} from ${managingOffice.office_name}.`, 'success');
        fetchOffices();
        setManagingOffice({ ...managingOffice, windows: managingOffice.windows.filter(w => w !== windowName) });
      }
    });
  };

  const guardModalClose = (isDirty, closeFn) => {
    if (!isDirty) {
      closeFn();
      return;
    }
    confirmAction({
      title: 'Discard Unsaved Changes?',
      message: 'You have unsaved input in this form. Are you sure you want to cancel and lose your changes?',
      confirmText: 'Discard Changes',
      variant: 'danger',
      onConfirm: () => closeFn()
    });
  };

  const closeAddOfficeModal = () => {
    const isDirty = newOfficeName.trim() !== '' || newOfficeType !== 'minor' || newLimitMode !== 'unlimited' || newOfficePhotoFile !== null;
    guardModalClose(isDirty, () => {
      setIsAddModalOpen(false);
      setNewOfficeName('');
      setNewOfficeType('minor');
      setNewLimitMode('unlimited');
      setNewDailyLimit('100');
      setNewOfficePhotoFile(null);
      setNewOfficePhotoPreview('');
      setOfficeError('');
      setLimitError('');
    });
  };

  const closeEditOfficeModal = () => {
    if (!editingOffice) return;
    const origLim = Number(editingOffice.daily_limit || 0);
    const currentPlannedLim = editLimitMode === 'unlimited' ? 0 : parseInt(editDailyLimit, 10) || 0;
    const isDirty =
      editOfficeName.trim() !== (editingOffice.office_name || '') ||
      editOfficeType !== (editingOffice.is_major ? 'major' : 'minor') ||
      editOfficeOnline !== (editingOffice.is_online ?? true) ||
      currentPlannedLim !== origLim ||
      editOfficePhotoFile !== null ||
      editOfficePhotoPreview !== (editingOffice.image_url || '');
    guardModalClose(isDirty, () => setEditingOffice(null));
  };

  const closeWindowModal = () => {
    const isDirty = customWindowInput.trim() !== '';
    guardModalClose(isDirty, () => {
      setManagingOffice(null);
      setCustomWindowInput('');
      setWindowError('');
    });
  };

  const paginatedOffices = offices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div>
      <div className="quest-page-banner">
        <div>
          <h1>
            {isMiniAdmin ? `${assignedOffice} Window & Daily Limit Setup` : 'Office & Department Management'}
          </h1>
          <p>
            {isMiniAdmin 
              ? `Configure active service windows, daily queue limit, office photo, and online availability for ${assignedOffice}.`
              : 'Control office visibility, daily queue accommodation limits, façade photos, windows, and 4-digit clearance codes.'}
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="quest-card">
        {!isMiniAdmin && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--quest-text-primary)' }}>
              Registered Campus Offices ({offices.length})
            </div>
            <button
              onClick={() => {
                setNewOfficeName('');
                setNewOfficeType('minor');
                setNewLimitMode('unlimited');
                setNewDailyLimit('100');
                setNewOfficePhotoFile(null);
                setNewOfficePhotoPreview('');
                setOfficeError('');
                setLimitError('');
                setIsAddModalOpen(true);
              }}
              className="quest-btn quest-btn-primary"
              style={{ borderRadius: '999px', padding: '10px 20px' }}
            >
              <Plus size={16} /> Register New Office
            </button>
          </div>
        )}
        <div className="quest-table-container">
          <table className="quest-table">
            <thead>
              <tr>
                <th>Office Photo & Name</th>
                <th>Classification</th>
                <th>App Visibility</th>
                <th>Daily Queue Limit</th>
                <th>Window Setup</th>
                <th>Unique Code (Minor)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={isMiniAdmin ? 1 : 4} cols={7} />
              ) : paginatedOffices.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--quest-text-secondary)' }}>No offices configured.</td></tr>
              ) : (
                paginatedOffices.map(office => {
                  const dailyLim = Number(office.daily_limit || 0);
                  return (
                    <tr key={office.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {office.image_url ? (
                            <img
                              src={office.image_url}
                              alt={office.office_name}
                              style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E2E8F0', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{
                              width: '48px',
                              height: '36px',
                              borderRadius: '8px',
                              backgroundColor: '#FCEAE9',
                              color: 'var(--quest-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Building2 size={18} />
                            </div>
                          )}
                          <span style={{ fontWeight: 700, color: 'var(--quest-text-primary)' }}>{office.office_name}</span>
                        </div>
                      </td>
                      <td>
                        <button 
                          onClick={() => toggleClassification(office)} 
                          className={`quest-badge ${office.is_major ? 'badge-primary' : 'badge-warning'}`} 
                          style={{ border: 'none', cursor: isMiniAdmin ? 'default' : 'pointer' }}
                        >
                          {office.is_major ? 'MAJOR' : 'MINOR'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: office.is_online ? 'var(--quest-success)' : 'var(--quest-text-muted)' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: office.is_online ? 'var(--quest-success)' : 'var(--quest-text-muted)' }}></div>
                          {office.is_online ? 'Online' : 'Offline'}
                        </div>
                      </td>
                      <td>
                        <span
                          onClick={() => openEditModal(office)}
                          className={`quest-badge ${dailyLim > 0 ? 'badge-warning' : 'badge-success'}`}
                          style={{ cursor: 'pointer' }}
                          title="Click to configure daily client accommodation limit"
                        >
                          <Users size={12} /> {dailyLim > 0 ? `Max ${dailyLim} / Day` : 'No Limit'}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => { setManagingOffice(office); setWindowError(''); }} 
                          className="quest-btn quest-btn-outline" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          <MonitorUp size={14} /> {office.windows?.length || 1} Windows
                        </button>
                      </td>
                      <td>
                        {!office.is_major ? (
                          <button
                            onClick={() => setCodeOffice(office)}
                            className="quest-badge badge-info"
                            style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            title="Click to view & refresh 4-digit clearance code"
                          >
                            <KeyRound size={13} /> Code: <strong>{office.clearance_code || '4892'}</strong>
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--quest-text-muted)', fontWeight: 600 }}>
                            Live Queue (No Code)
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="quest-action-group">
                          <button
                            onClick={() => toggleStatus(office)}
                            className={`quest-icon-btn ${office.is_online ? 'power-off' : 'power-on'}`}
                            title={office.is_online ? 'Take Office Offline' : 'Set Office Online'}
                          >
                            <Power size={15} />
                          </button>
                          <button
                            onClick={() => setViewingOffice(office)}
                            className="quest-icon-btn view"
                            title="View Office Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => openEditModal(office)}
                            className="quest-icon-btn edit"
                            title="Edit Office, Daily Limit & Photo"
                          >
                            <Edit3 size={15} />
                          </button>
                          {!isMiniAdmin && (
                            <button
                              onClick={() => handleDeleteOffice(office)}
                              className="quest-icon-btn delete"
                              title="Delete Office"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          totalItems={offices.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* 1. REGISTER NEW OFFICE POPUP MODAL (With Daily Queue Limit & Photo Upload!) */}
      {isAddModalOpen && (
        <div className="quest-modal-backdrop" onClick={closeAddOfficeModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '490px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary">
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontFamily: 'var(--font-heading)' }}>Register New Office</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Initializes at Window 0 with daily limit & optional photo.</p>
                </div>
              </div>
              <button onClick={closeAddOfficeModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddOffice} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Office Name <span className="quest-req-star">*</span>
                </label>
                <input 
                  type="text" 
                  className={`quest-input ${officeError ? 'input-error' : ''}`} 
                  placeholder="e.g. Clinic, Guidance Office, Library" 
                  value={newOfficeName} 
                  onBlur={() => { if (!newOfficeName.trim()) setOfficeError('Office Name is required'); }}
                  onChange={(e) => {
                    setNewOfficeName(e.target.value);
                    if (officeError) setOfficeError('');
                  }} 
                />
                {officeError && <span className="quest-error-text">{officeError}</span>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Classification <span className="quest-req-star">*</span>
                </label>
                <select 
                  className="quest-input" 
                  value={newOfficeType} 
                  onChange={(e) => setNewOfficeType(e.target.value)}
                >
                  <option value="minor">Minor Office (Quick Transaction / Clearance)</option>
                  <option value="major">Major Office (Full Dashboard & Hallway TV)</option>
                </select>
              </div>

              {/* Daily Client Accommodation Limit Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Daily Client Accommodation Limit <span className="quest-req-star">*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: newLimitMode === 'custom' ? '1.3fr 1fr' : '1fr', gap: '10px' }}>
                  <select
                    className="quest-input"
                    value={newLimitMode}
                    onChange={(e) => {
                      setNewLimitMode(e.target.value);
                      setLimitError('');
                    }}
                  >
                    <option value="unlimited">No Limit (Unlimited Daily Queues)</option>
                    <option value="custom">Set Custom Daily Limit</option>
                  </select>

                  {newLimitMode === 'custom' && (
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`quest-input ${limitError ? 'input-error' : ''}`}
                      placeholder="Max / day (e.g. 100)"
                      value={newDailyLimit}
                      onChange={(e) => {
                        setNewDailyLimit(e.target.value.replace(/[^0-9]/g, '').slice(0, 5));
                        if (limitError) setLimitError('');
                      }}
                    />
                  )}
                </div>
                {limitError && <span className="quest-error-text">{limitError}</span>}
              </div>

              {/* Office Banner Image Upload */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Office Window / Building Photo (Shown in Student App • Auto-Compressed)
                </label>
                {newOfficePhotoPreview && (
                  <div style={{ position: 'relative', marginBottom: '10px' }}>
                    <img
                      src={newOfficePhotoPreview}
                      alt="Office Preview"
                      style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #CBD5E1' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setNewOfficePhotoFile(null); setNewOfficePhotoPreview(''); }}
                      className="quest-icon-btn delete"
                      style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: '#FFFFFF' }}
                      title="Remove Photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <label className="quest-btn quest-btn-outline" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', padding: '10px' }}>
                  <ImagePlus size={16} color="var(--quest-primary)" />
                  {newOfficePhotoPreview ? 'Change Office Photo' : 'Upload Office Photo'}
                  <input type="file" accept="image/*" onChange={(e) => handleSelectPhoto(e, false)} style={{ display: 'none' }} />
                </label>
              </div>

              <div className="quest-modal-actions" style={{ marginTop: '8px' }}>
                <button type="button" onClick={closeAddOfficeModal} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="quest-btn quest-btn-primary">
                  {isSubmitting ? 'Uploading & Registering...' : 'Register Office'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. UNIQUE 4-DIGIT CLEARANCE CODE MODAL */}
      {codeOffice && (
        <div className="quest-modal-backdrop" onClick={() => setCodeOffice(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary" style={{ backgroundColor: '#E0F2FE', color: '#0284C7' }}>
                  <KeyRound size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#1E293B' }}>{codeOffice.office_name} Code</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Unique Office Clearance & Transition Code</p>
                </div>
              </div>
              <button onClick={() => setCodeOffice(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div style={{
              textAlign: 'center',
              padding: '24px 16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '16px',
              border: '1.5px dashed #CBD5E1',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Active 4-Digit Security Code
              </div>
              <div className="outfit-number" style={{ fontSize: '56px', fontWeight: 900, color: 'var(--quest-primary)', letterSpacing: '0.15em', margin: '8px 0' }}>
                {codeOffice.clearance_code || '4892'}
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: 0, maxWidth: '280px', marginInline: 'auto' }}>
                Queuers enter this 4-digit code on their mobile app to validate completion and advance to the next workflow step.
              </p>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setCodeOffice(null)} className="quest-btn quest-btn-outline">Close</button>
              <button onClick={() => handleRefreshClearanceCode(codeOffice)} className="quest-btn quest-btn-primary">
                <RefreshCw size={15} /> Refresh 4-Digit Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. VIEW OFFICE DETAILS MODAL */}
      {viewingOffice && (
        <div className="quest-modal-backdrop" onClick={() => setViewingOffice(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary">
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#1E293B' }}>{viewingOffice.office_name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Department Configuration Details</p>
                </div>
              </div>
              <button onClick={() => setViewingOffice(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            {viewingOffice.image_url && (
              <img
                src={viewingOffice.image_url}
                alt={viewingOffice.office_name}
                style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '14px', marginBottom: '16px', border: '1px solid #E2E8F0' }}
              />
            )}

            <div className="quest-detail-box">
              <div className="quest-detail-row">
                <span className="quest-detail-label">Office Name</span>
                <span className="quest-detail-value">{viewingOffice.office_name}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Classification</span>
                <span className={`quest-badge ${viewingOffice.is_major ? 'badge-primary' : 'badge-warning'}`}>
                  {viewingOffice.is_major ? 'MAJOR OFFICE' : 'MINOR OFFICE'}
                </span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">App & TV Status</span>
                <span className={`quest-badge ${viewingOffice.is_online ? 'badge-success' : 'badge-danger'}`}>
                  {viewingOffice.is_online ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Daily Queue Limit</span>
                <span className={`quest-badge ${Number(viewingOffice.daily_limit || 0) > 0 ? 'badge-warning' : 'badge-success'}`}>
                  {Number(viewingOffice.daily_limit || 0) > 0 ? `Max ${viewingOffice.daily_limit} Clients / Day` : 'No Limit (Unlimited)'}
                </span>
              </div>
              {viewingOffice.is_major ? (
                <div className="quest-detail-row">
                  <span className="quest-detail-label">Arrival Check-In Token</span>
                  <code style={{ fontWeight: 800, color: 'var(--quest-primary)' }}>
                    BC-ARRIVE-{viewingOffice.office_name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase()}
                  </code>
                </div>
              ) : (
                <div className="quest-detail-row">
                  <span className="quest-detail-label">4-Digit Clearance Code</span>
                  <code style={{ fontWeight: 800, color: '#0284C7' }}>{viewingOffice.clearance_code || '4892'}</code>
                </div>
              )}
              <div className="quest-detail-row">
                <span className="quest-detail-label">Service Windows ({viewingOffice.windows?.length || 1})</span>
                <span className="quest-detail-value">{(viewingOffice.windows || ['Window 0']).join(', ')}</span>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setViewingOffice(null)} className="quest-btn quest-btn-outline">Close</button>
              <button 
                onClick={() => {
                  const target = viewingOffice;
                  setViewingOffice(null);
                  openEditModal(target);
                }} 
                className="quest-btn quest-btn-primary"
              >
                <Edit3 size={15} /> Edit Office
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. EDIT OFFICE MODAL (With Daily Queue Limit & Photo Upload!) */}
      {editingOffice && (
        <div className="quest-modal-backdrop" onClick={closeEditOfficeModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '490px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B' }}>Edit Office, Limit & Photo</h3>
              <button onClick={closeEditOfficeModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateOffice} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Office Name <span className="quest-req-star">*</span>
                </label>
                <input
                  type="text"
                  className={`quest-input ${editOfficeError ? 'input-error' : ''}`}
                  value={editOfficeName}
                  disabled={isMiniAdmin}
                  onChange={(e) => {
                    setEditOfficeName(e.target.value);
                    if (editOfficeError) setEditOfficeError('');
                  }}
                />
                {editOfficeError && <span className="quest-error-text">{editOfficeError}</span>}
              </div>

              {!isMiniAdmin && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    Classification <span className="quest-req-star">*</span>
                  </label>
                  <select className="quest-input" value={editOfficeType} onChange={(e) => setEditOfficeType(e.target.value)}>
                    <option value="minor">Minor Office (Quick Transaction)</option>
                    <option value="major">Major Office (Full Dashboard & Hallway TV)</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Visibility Status <span className="quest-req-star">*</span>
                </label>
                <select className="quest-input" value={editOfficeOnline ? 'online' : 'offline'} onChange={(e) => setEditOfficeOnline(e.target.value === 'online')}>
                  <option value="online">Online (Visible on Mobile App & Hallway TV)</option>
                  <option value="offline">Offline (Hidden)</option>
                </select>
              </div>

              {/* Daily Client Accommodation Limit Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Daily Client Accommodation Limit <span className="quest-req-star">*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: editLimitMode === 'custom' ? '1.3fr 1fr' : '1fr', gap: '10px' }}>
                  <select
                    className="quest-input"
                    value={editLimitMode}
                    onChange={(e) => {
                      setEditLimitMode(e.target.value);
                      setEditLimitError('');
                    }}
                  >
                    <option value="unlimited">No Limit (Unlimited Daily Queues)</option>
                    <option value="custom">Set Custom Daily Limit</option>
                  </select>

                  {editLimitMode === 'custom' && (
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`quest-input ${editLimitError ? 'input-error' : ''}`}
                      placeholder="Max / day (e.g. 100)"
                      value={editDailyLimit}
                      onChange={(e) => {
                        setEditDailyLimit(e.target.value.replace(/[^0-9]/g, '').slice(0, 5));
                        if (editLimitError) setEditLimitError('');
                      }}
                    />
                  )}
                </div>
                {editLimitError && <span className="quest-error-text">{editLimitError}</span>}
              </div>

              {/* Office Photo Upload / Replace */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Office Window / Building Photo (Displayed in Student Mobile App)
                </label>
                {editOfficePhotoPreview && (
                  <div style={{ position: 'relative', marginBottom: '10px' }}>
                    <img
                      src={editOfficePhotoPreview}
                      alt="Office Preview"
                      style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #CBD5E1' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setEditOfficePhotoFile(null); setEditOfficePhotoPreview(''); }}
                      className="quest-icon-btn delete"
                      style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: '#FFFFFF' }}
                      title="Remove Photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <label className="quest-btn quest-btn-outline" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', padding: '10px' }}>
                  <ImagePlus size={16} color="var(--quest-primary)" />
                  {editOfficePhotoPreview ? 'Replace Office Photo' : 'Upload Office Photo'}
                  <input type="file" accept="image/*" onChange={(e) => handleSelectPhoto(e, true)} style={{ display: 'none' }} />
                </label>
              </div>

              <div className="quest-modal-actions" style={{ marginTop: '8px' }}>
                <button type="button" onClick={closeEditOfficeModal} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isUpdatingOffice} className="quest-btn quest-btn-primary">
                  {isUpdatingOffice ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. WINDOW MANAGER MODAL */}
      {managingOffice && (
        <div className="quest-modal-backdrop" onClick={closeWindowModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontFamily: 'var(--font-heading)' }}>Windows for {managingOffice.office_name}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>Select a preset window or add a custom counter.</p>
              </div>
              <button onClick={closeWindowModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>
            
            <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)' }}>
                Select Preset Window <span className="quest-req-star">*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="quest-input"
                  value={selectedPresetWindow}
                  onChange={(e) => setSelectedPresetWindow(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {PRESET_WINDOWS.map(win => (
                    <option key={win} value={win}>{win}</option>
                  ))}
                </select>
                <button onClick={() => handleAddWindow(false)} className="quest-btn quest-btn-primary" style={{ padding: '0 16px' }}>
                  <Plus size={16} /> Add Window
                </button>
              </div>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginTop: '4px' }}>
                Or Custom Counter Name (Optional)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className={`quest-input ${windowError ? 'input-error' : ''}`} 
                  placeholder="e.g. Assessment Counter B" 
                  value={customWindowInput} 
                  onChange={e => {
                    setCustomWindowInput(e.target.value);
                    if (windowError) setWindowError('');
                  }} 
                  style={{ flex: 1 }}
                />
                <button onClick={() => handleAddWindow(true)} className="quest-btn quest-btn-outline" style={{ padding: '0 14px' }}>
                  Add Custom
                </button>
              </div>
              {windowError && <span className="quest-error-text">{windowError}</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '260px', overflowY: 'auto' }}>
              {(managingOffice.windows || []).map((win, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#1E293B' }}>{win}</span>
                  <button 
                    onClick={() => handleRemoveWindow(win)} 
                    className="quest-icon-btn delete"
                    title="Remove Window"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {(!managingOffice.windows || managingOffice.windows.length === 0) && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>
                  No windows configured.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}