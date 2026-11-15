import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Building2, Plus, Power, MonitorUp, Trash2, X, Eye, Edit3, KeyRound, RefreshCw, ImagePlus, Users, Crop, ZoomIn, ZoomOut, Move, QrCode, Printer } from 'lucide-react';
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
  const [newOfficeRawPhoto, setNewOfficeRawPhoto] = useState('');
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

  // Major Office Refreshable Arrival QR Token Modal State
  const [qrModalOffice, setQrModalOffice] = useState(null);

  // View & Edit Office Modal States
  const [viewingOffice, setViewingOffice] = useState(null);
  const [editingOffice, setEditingOffice] = useState(null);
  const [editOfficeName, setEditOfficeName] = useState('');
  const [editOfficeType, setEditOfficeType] = useState('minor');
  const [editOfficeOnline, setEditOfficeOnline] = useState(true);
  const [editLimitMode, setEditLimitMode] = useState('unlimited'); // 'unlimited' | 'custom'
  const [editDailyLimit, setEditDailyLimit] = useState('100');
  const [editOfficeRawPhoto, setEditOfficeRawPhoto] = useState('');
  const [editOfficePhotoPreview, setEditOfficePhotoPreview] = useState('');
  const [editOfficeError, setEditOfficeError] = useState('');
  const [editLimitError, setEditLimitError] = useState('');
  const [isUpdatingOffice, setIsUpdatingOffice] = useState(false);

  // 1:1 Interactive Image Cropper Modal State
  const [cropSession, setCropSession] = useState({
    isOpen: false,
    isEdit: false,
    rawImageSrc: ''
  });

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

  // Opens the 1:1 Cropper Modal whenever an image file is chosen
  const handleSelectPhoto = (e, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (JPG, PNG, WebP).', 'error', 'Invalid File');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64Source = reader.result;
      if (isEdit) {
        setEditOfficeRawPhoto(base64Source);
      } else {
        setNewOfficeRawPhoto(base64Source);
      }
      setCropSession({
        isOpen: true,
        isEdit,
        rawImageSrc: base64Source
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyCrop = ({ dataUrl }) => {
    if (cropSession.isEdit) {
      setEditOfficePhotoPreview(dataUrl);
    } else {
      setNewOfficePhotoPreview(dataUrl);
    }
    setCropSession({ isOpen: false, isEdit: false, rawImageSrc: '' });
    showToast('Photo cropped to 1:1 square ratio (~28KB).', 'success', 'Crop Applied');
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

    const prefix = cleanName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'OFC';
    const initialQrToken = `BC-ARRIVE-${prefix}-${initialCode}`;

 setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'offices'), {
        office_name: cleanName,
        is_major: newOfficeType === 'major',
        is_online: true,
        windows: ["Window 0"],
        clearance_code: initialCode,
        arrival_qr_token: initialQrToken,
        daily_limit: parsedLimit,
        image_url: newOfficePhotoPreview || '',
        created_at: new Date()
      });
      showToast(`${cleanName} registered with ${parsedLimit > 0 ? `${parsedLimit}/day limit` : 'No Daily Limit'}!`, 'success', 'Office Registered');
      setNewOfficeName('');
      setNewOfficeType('minor');
      setNewLimitMode('unlimited');
      setNewDailyLimit('100');
      setNewOfficeRawPhoto('');
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
const getOfficeArrivalToken = (officeObj) => {
    if (!officeObj) return 'BC-ARRIVE-OFC';
    if (typeof officeObj === 'object' && officeObj.arrival_qr_token) {
      return officeObj.arrival_qr_token;
    }
    const rawName = typeof officeObj === 'string' ? officeObj : (officeObj.office_name || '');
    const prefix = rawName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'OFC';
    return `BC-ARRIVE-${prefix}`;
  };

  const handleRefreshArrivalQrToken = async (office) => {
    if (!office) return;
    const prefix = (office.office_name || '').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'OFC';
    const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
    const newQrToken = `BC-ARRIVE-${prefix}-${randSuffix}`;
    try {
      await updateDoc(doc(db, 'offices', office.id), {
        arrival_qr_token: newQrToken,
        qr_updated_at: new Date()
      });
      showToast(`Refreshed Arrival QR Token for ${office.office_name} to [ ${newQrToken} ]. Print the new poster to update the hallway.`, 'success', 'QR Token Refreshed');
      fetchOffices();
      if (qrModalOffice && qrModalOffice.id === office.id) {
        setQrModalOffice({ ...qrModalOffice, arrival_qr_token: newQrToken });
      }
      if (viewingOffice && viewingOffice.id === office.id) {
        setViewingOffice({ ...viewingOffice, arrival_qr_token: newQrToken });
      }
    } catch (e) {
      showToast('Failed to refresh Arrival QR Token.', 'error');
    }
  };

  const handlePrintOfficeQR = (office) => {
    const token = getOfficeArrivalToken(office);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=8&data=${encodeURIComponent(token)}`;

    const printWin = window.open('', '_blank', 'width=860,height=960');
    if (!printWin) {
      showToast('Please allow popups in your browser to print the QR poster.', 'error', 'Popup Blocked');
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BCMatik Arrival QR Poster - ${office.office_name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              font-family: 'Segoe UI', Inter, Arial, sans-serif;
              background: #FFFFFF;
              color: #0F172A;
              overflow: hidden;
            }
            .poster-sheet {
              width: 100%;
              max-width: 700px;
              max-height: 274mm;
              margin: 0 auto;
              border: 3.5px solid #9E0B03;
              border-radius: 22px;
              padding: 22px 30px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              text-align: center;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .header-banner {
              background-color: #9E0B03;
              color: #FFFFFF;
              padding: 16px 20px;
              border-radius: 16px;
              border-bottom: 4px solid #FACC15;
            }
            .school-sub {
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 0.14em;
              color: #FACC15;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .brand-title {
              font-size: 24px;
              font-weight: 900;
              margin: 0;
              letter-spacing: -0.02em;
            }
            .office-pill {
              display: inline-block;
              margin-top: 12px;
              padding: 5px 16px;
              border-radius: 999px;
              background-color: #FCEAE9;
              color: #9E0B03;
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .office-name {
              font-size: 40px;
              font-weight: 900;
              color: #0F172A;
              margin: 6px 0 4px 0;
              line-height: 1.05;
              text-transform: uppercase;
            }
            .scan-subtitle {
              font-size: 14px;
              font-weight: 600;
              color: #475569;
              margin: 0 0 12px 0;
            }
            .qr-frame {
              display: inline-flex;
              flex-direction: column;
              align-items: center;
              padding: 16px;
              border: 3px dashed #9E0B03;
              border-radius: 22px;
              background-color: #FFFFFF;
              margin: 0 auto;
            }
            .qr-frame img {
              width: 255px;
              height: 255px;
              display: block;
            }
            .token-box {
              margin-top: 12px;
              background-color: #F8FAFC;
              border: 2px solid #E2E8F0;
              border-radius: 14px;
              padding: 8px 22px;
              display: inline-block;
            }
            .token-label {
              font-size: 10px;
              font-weight: 800;
              color: #64748B;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .token-code {
              font-size: 26px;
              font-weight: 900;
              color: #9E0B03;
              letter-spacing: 0.06em;
              font-family: Consolas, monospace;
              margin-top: 2px;
            }
            .steps-box {
              margin-top: 14px;
              background-color: #FEF9E7;
              border: 1.5px solid #FDE68A;
              border-radius: 14px;
              padding: 12px 18px;
              text-align: left;
            }
            .steps-title {
              font-size: 12px;
              font-weight: 900;
              color: #92400E;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              margin-bottom: 6px;
            }
            .step-item {
              font-size: 13px;
              font-weight: 600;
              color: #1E293B;
              margin: 4px 0;
            }
            .footer-note {
              font-size: 11px;
              font-weight: 700;
              color: #64748B;
              margin-top: 8px;
            }
          </style>
        </head>
        <body>
          <div class="poster-sheet">
            <div class="header-banner">
              <div class="school-sub">Bicol College • Main Campus</div>
              <h1 class="brand-title">BCMATIK SMART QUEUING SYSTEM</h1>
            </div>

            <div>
              <div class="office-pill">Official Hallway Arrival Check-In Poster</div>
              <div class="office-name">${office.office_name}</div>
              <p class="scan-subtitle">Scan this QR code using the BCMatik Mobile App upon arriving at the hallway</p>

              <div class="qr-frame">
                <img id="qrPosterImg" src="${qrUrl}" alt="${token}" />
              </div>

              <div>
                <div class="token-box">
                  <div class="token-label">Manual Check-In Token Code</div>
                  <div class="token-code">${token}</div>
                </div>
              </div>
            </div>

            <div>
              <div class="steps-box">
                <div class="steps-title">How to Activate Your Queue Ticket:</div>
                <div class="step-item"><strong>1.</strong> Open the <strong>BCMatik Mobile App</strong> on your phone and view your booked ticket.</div>
                <div class="step-item"><strong>2.</strong> Tap <strong>"Scan Hallway QR"</strong> and point your camera at this poster (or type <strong>${token}</strong>).</div>
                <div class="step-item"><strong>3.</strong> Your ticket will turn <strong>ACTIVE</strong>. Watch the Hallway TV Monitor for your number to be called.</div>
              </div>
              <div class="footer-note">
                BCMatik: Queue. Guide. Serve. • Printed on ${new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
          <script>
            const img = document.getElementById('qrPosterImg');
            img.onload = () => {
              setTimeout(() => {
                window.focus();
                window.print();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
    showToast(`Prepared single-page QR poster for ${office.office_name}.`, 'success', 'QR Poster Ready');
  };

  const openEditModal = (office) => {
    const currentLim = Number(office.daily_limit || 0);
    setEditingOffice(office);
    setEditOfficeName(office.office_name || '');
    setEditOfficeType(office.is_major ? 'major' : 'minor');
    setEditOfficeOnline(office.is_online ?? true);
    setEditLimitMode(currentLim > 0 ? 'custom' : 'unlimited');
    setEditDailyLimit(currentLim > 0 ? String(currentLim) : '100');
    setEditOfficeRawPhoto(office.image_url || '');
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
      await updateDoc(doc(db, 'offices', editingOffice.id), {
        office_name: cleanName,
        is_major: editOfficeType === 'major',
        is_online: editOfficeOnline,
        daily_limit: parsedLimit,
        image_url: editOfficePhotoPreview || '',
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
    const isDirty = newOfficeName.trim() !== '' || newOfficeType !== 'minor' || newLimitMode !== 'unlimited' || newOfficePhotoPreview !== '';
    guardModalClose(isDirty, () => {
      setIsAddModalOpen(false);
      setNewOfficeName('');
      setNewOfficeType('minor');
      setNewLimitMode('unlimited');
      setNewDailyLimit('100');
      setNewOfficeRawPhoto('');
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
              ? `Configure active service windows, daily queue limit, 1:1 office photo, and online availability for ${assignedOffice}.`
              : 'Control office visibility, daily queue accommodation limits, 1:1 office photos, windows, and 4-digit clearance codes.'}
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
                setNewOfficeRawPhoto('');
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
                              style={{
                                width: '44px',
                                height: '44px',
                                aspectRatio: '1 / 1',
                                objectFit: 'cover',
                                borderRadius: '10px',
                                border: '1.5px solid #E2E8F0',
                                flexShrink: 0
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '10px',
                              backgroundColor: '#FCEAE9',
                              color: 'var(--quest-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Building2 size={19} />
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
                          <button
                            onClick={() => setQrModalOffice(office)}
                            className="quest-badge badge-primary"
                            style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            title="Click to view, refresh, or print Hallway Arrival QR Token"
                          >
                            <QrCode size={13} /> {getOfficeArrivalToken(office)} <Printer size={12} />
                          </button>
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

      {/* 1. REGISTER NEW OFFICE POPUP MODAL (Switches cleanly to Cropper when cropping!) */}
      {isAddModalOpen && !cropSession.isOpen && (
        <div className="quest-modal-backdrop" onClick={closeAddOfficeModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '490px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary">
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontFamily: 'var(--font-heading)' }}>Register New Office</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Initializes at Window 0 with daily limit & 1:1 photo.</p>
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

              {/* 1:1 Square Office Photo Upload & Preview */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '8px' }}>
                  Office Photo (1:1 Square Ratio • Auto-Compressed)
                </label>
                {newOfficePhotoPreview && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                      <img
                        src={newOfficePhotoPreview}
                        alt="1:1 Office Preview"
                        style={{
                          width: '140px',
                          height: '140px',
                          aspectRatio: '1 / 1',
                          objectFit: 'cover',
                          borderRadius: '16px',
                          border: '2px solid var(--quest-primary)',
                          boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { setNewOfficeRawPhoto(''); setNewOfficePhotoPreview(''); }}
                        className="quest-icon-btn delete"
                        style={{ position: 'absolute', top: '-8px', right: '-8px', width: '28px', height: '28px', borderRadius: '50%', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                        title="Remove Photo"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
                <label className="quest-btn quest-btn-outline" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', padding: '10px' }}>
                  <ImagePlus size={16} color="var(--quest-primary)" />
                  {newOfficePhotoPreview ? 'Choose Different Photo' : 'Select & Crop Office Photo (1:1)'}
                  <input type="file" accept="image/*" onChange={(e) => handleSelectPhoto(e, false)} style={{ display: 'none' }} />
                </label>
              </div>

              <div className="quest-modal-actions" style={{ marginTop: '8px' }}>
                <button type="button" onClick={closeAddOfficeModal} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="quest-btn quest-btn-primary">
                  {isSubmitting ? 'Saving...' : 'Register Office'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

{/* 2B. MAJOR OFFICE ARRIVAL QR TOKEN REFRESH & PRINT MODAL */}
      {qrModalOffice && (
        <div className="quest-modal-backdrop" onClick={() => setQrModalOffice(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="quest-modal-icon-badge primary">
                  <QrCode size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#1E293B' }}>{qrModalOffice.office_name} Hallway QR</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Dynamic Arrival Check-In QR & Token</p>
                </div>
              </div>
              <button onClick={() => setQrModalOffice(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div style={{
              textAlign: 'center',
              padding: '20px 16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '16px',
              border: '1.5px dashed #CBD5E1',
              marginBottom: '18px'
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(getOfficeArrivalToken(qrModalOffice))}`}
                alt="Office QR Preview"
                style={{ width: '170px', height: '170px', borderRadius: '12px', border: '2px solid #9E0B03', padding: '6px', backgroundColor: '#FFFFFF' }}
              />
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '12px' }}>
                Active Hallway Check-In Token
              </div>
              <div className="outfit-number" style={{ fontSize: '24px', fontWeight: 900, color: 'var(--quest-primary)', letterSpacing: '0.06em', margin: '4px 0' }}>
                {getOfficeArrivalToken(qrModalOffice)}
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: 0, maxWidth: '320px', marginInline: 'auto' }}>
                Refreshing this token invalidates older printed QR posters so clients cannot check in remotely using old photos.
              </p>
            </div>

            <div className="quest-modal-actions" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => handleRefreshArrivalQrToken(qrModalOffice)}
                className="quest-btn quest-btn-outline"
              >
                <RefreshCw size={15} /> Refresh QR Token
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setQrModalOffice(null)} className="quest-btn quest-btn-outline">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintOfficeQR(qrModalOffice)}
                  className="quest-btn quest-btn-primary"
                >
                  <Printer size={15} /> Print 1-Page Poster
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. VIEW OFFICE DETAILS MODAL (With Centered 1:1 Square Frame!) */}
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
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
                <img
                  src={viewingOffice.image_url}
                  alt={viewingOffice.office_name}
                  style={{
                    width: '180px',
                    height: '180px',
                    aspectRatio: '1 / 1',
                    objectFit: 'cover',
                    borderRadius: '18px',
                    border: '2px solid #E2E8F0',
                    boxShadow: '0 10px 24px -6px rgba(15, 23, 42, 0.12)'
                  }}
                />
              </div>
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
                    {getOfficeArrivalToken(viewingOffice)}
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
              {viewingOffice.is_major && (
                <button
                  type="button"
                  onClick={() => handlePrintOfficeQR(viewingOffice)}
                  className="quest-btn quest-btn-outline"
                  style={{ borderColor: 'var(--quest-primary)', color: 'var(--quest-primary)' }}
                >
                  <Printer size={15} /> Print QR Poster
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. EDIT OFFICE MODAL (Switches cleanly to Cropper when cropping!) */}
      {editingOffice && !cropSession.isOpen && (
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

              {/* 1:1 Square Office Photo Upload / Replace */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '8px' }}>
                  Office Photo (1:1 Square Ratio • Displayed in Student App)
                </label>
                {editOfficePhotoPreview && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                      <img
                        src={editOfficePhotoPreview}
                        alt="1:1 Office Preview"
                        style={{
                          width: '140px',
                          height: '140px',
                          aspectRatio: '1 / 1',
                          objectFit: 'cover',
                          borderRadius: '16px',
                          border: '2px solid var(--quest-primary)',
                          boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { setEditOfficeRawPhoto(''); setEditOfficePhotoPreview(''); }}
                        className="quest-icon-btn delete"
                        style={{ position: 'absolute', top: '-8px', right: '-8px', width: '28px', height: '28px', borderRadius: '50%', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                        title="Remove Photo"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
                <label className="quest-btn quest-btn-outline" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', padding: '10px' }}>
                  <ImagePlus size={16} color="var(--quest-primary)" />
                  {editOfficePhotoPreview ? 'Upload & Crop New Photo' : 'Select & Crop Office Photo (1:1)'}
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

      {/* 6. INTERACTIVE 1:1 SQUARE IMAGE CROPPER MODAL */}
      {cropSession.isOpen && (
        <OfficePhotoCropperModal
          imageSrc={cropSession.rawImageSrc}
          onSelectNewFile={(e) => handleSelectPhoto(e, cropSession.isEdit)}
          onCancel={() => setCropSession({ isOpen: false, isEdit: false, rawImageSrc: '' })}
          onCropComplete={handleApplyCrop}
        />
      )}
    </div>
  );
}

/* Interactive HTML5 Canvas 1:1 Square Image Cropper Modal (Zero CORS Failure + Fallback Upload) */
function OfficePhotoCropperModal({ imageSrc, onSelectNewFile, onCancel, onCropComplete }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const VIEWPORT_SIZE = 280;
  const OUTPUT_SIZE = 480;

  useEffect(() => {
    setImgLoaded(false);
    setLoadError(false);
    const img = new Image();

    // Only set crossOrigin if it is NOT a data: URL, and fallback cleanly if bucket blocks CORS
    if (imageSrc && !imageSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      imgRef.current = img;
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setImgLoaded(true);
    };

    img.onerror = () => {
      // Legacy Firebase Storage URL without CORS header: prompt user to pick local image
      setLoadError(true);
    };

    img.src = imageSrc;
  }, [imageSrc]);

  const clampPan = useCallback((candidateX, candidateY, currentZoom) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };

    const baseScale = Math.max(VIEWPORT_SIZE / img.width, VIEWPORT_SIZE / img.height);
    const drawnWidth = img.width * baseScale * currentZoom;
    const drawnHeight = img.height * baseScale * currentZoom;

    const maxOffsetX = Math.max(0, (drawnWidth - VIEWPORT_SIZE) / 2);
    const maxOffsetY = Math.max(0, (drawnHeight - VIEWPORT_SIZE) / 2);

    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, candidateX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, candidateY))
    };
  }, []);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;

    ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

    const baseScale = Math.max(VIEWPORT_SIZE / img.width, VIEWPORT_SIZE / img.height);
    const finalScale = baseScale * zoom;
    const drawW = img.width * finalScale;
    const drawH = img.height * finalScale;
    const drawX = (VIEWPORT_SIZE - drawW) / 2 + pan.x;
    const drawY = (VIEWPORT_SIZE - drawH) / 2 + pan.y;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // 3x3 Rule-of-Thirds Grid Overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    const third = VIEWPORT_SIZE / 3;
    ctx.beginPath();
    ctx.moveTo(third, 0); ctx.lineTo(third, VIEWPORT_SIZE);
    ctx.moveTo(third * 2, 0); ctx.lineTo(third * 2, VIEWPORT_SIZE);
    ctx.moveTo(0, third); ctx.lineTo(VIEWPORT_SIZE, third);
    ctx.moveTo(0, third * 2); ctx.lineTo(VIEWPORT_SIZE, third * 2);
    ctx.stroke();
  }, [imgLoaded, zoom, pan]);

  const handlePointerDown = (clientX, clientY) => {
    if (!imgLoaded) return;
    setIsDragging(true);
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!isDragging || !imgLoaded) return;
    const nextX = clientX - dragStart.x;
    const nextY = clientY - dragStart.y;
    setPan(clampPan(nextX, nextY, zoom));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleZoomChange = (nextZoom) => {
    const clampedZ = Math.max(1, Math.min(3, nextZoom));
    setZoom(clampedZ);
    setPan(prev => clampPan(prev.x, prev.y, clampedZ));
  };

  const handleExportCroppedImage = () => {
    const img = imgRef.current;
    if (!img) return;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = OUTPUT_SIZE;
    outCanvas.height = OUTPUT_SIZE;
    const outCtx = outCanvas.getContext('2d');

    const ratio = OUTPUT_SIZE / VIEWPORT_SIZE;
    const baseScale = Math.max(VIEWPORT_SIZE / img.width, VIEWPORT_SIZE / img.height);
    const finalScale = baseScale * zoom * ratio;

    const drawW = img.width * finalScale;
    const drawH = img.height * finalScale;
    const drawX = (OUTPUT_SIZE - drawW) / 2 + pan.x * ratio;
    const drawY = (OUTPUT_SIZE - drawH) / 2 + pan.y * ratio;

    outCtx.fillStyle = '#FFFFFF';
    outCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    outCtx.drawImage(img, drawX, drawY, drawW, drawH);

    // Exports self-contained compressed DataURL (~28KB) that never suffers from CORS issues!
    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.76);
    onCropComplete({ dataUrl });
  };

  return (
    <div className="quest-modal-backdrop" onClick={onCancel}>
      <div
        className="quest-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '410px', textAlign: 'center' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="quest-modal-icon-badge primary">
              <Crop size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0F172A' }}>Crop Office Photo (1:1)</h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                Drag to reposition and slide to zoom
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="quest-toast-close">
            <X size={18} />
          </button>
        </div>

        {loadError ? (
          <div style={{
            padding: '32px 20px',
            backgroundColor: '#F8FAFC',
            borderRadius: '16px',
            border: '1.5px dashed #CBD5E1',
            marginBottom: '18px'
          }}>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 14px', lineHeight: 1.5 }}>
              This older cloud image was uploaded before the 1:1 cropper was added. Please select the image file from your computer to crop it in 1:1 ratio:
            </p>
            <label className="quest-btn quest-btn-primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              <ImagePlus size={16} /> Choose Image File to Crop
              <input type="file" accept="image/*" onChange={onSelectNewFile} style={{ display: 'none' }} />
            </label>
          </div>
        ) : (
          <>
            {/* 1:1 Interactive Drag & Zoom Canvas */}
            <div
              style={{
                position: 'relative',
                width: `${VIEWPORT_SIZE}px`,
                height: `${VIEWPORT_SIZE}px`,
                margin: '0 auto 14px',
                borderRadius: '18px',
                overflow: 'hidden',
                border: '2.5px solid var(--quest-primary, #9E0B03)',
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                userSelect: 'none'
              }}
              onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (t) handlePointerDown(t.clientX, t.clientY);
              }}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (t) handlePointerMove(t.clientX, t.clientY);
              }}
              onTouchEnd={handlePointerUp}
            >
              <canvas
                ref={canvasRef}
                width={VIEWPORT_SIZE}
                height={VIEWPORT_SIZE}
                style={{ display: 'block', width: '100%', height: '100%' }}
              />
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(15, 23, 42, 0.72)',
                color: '#FFFFFF',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                pointerEvents: 'none'
              }}>
                <Move size={12} /> Drag to Reposition (1:1)
              </div>
            </div>

            {/* Zoom Slider Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#F8FAFC',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '18px'
            }}>
              <ZoomOut
                size={16}
                color="#64748B"
                style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => handleZoomChange(zoom - 0.15)}
              />
              <input
                type="range"
                min="1"
                max="3"
                step="0.02"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--quest-primary, #9E0B03)', cursor: 'pointer' }}
              />
              <ZoomIn
                size={16}
                color="#64748B"
                style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => handleZoomChange(zoom + 0.15)}
              />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', minWidth: '38px', textAlign: 'right' }}>
                {zoom.toFixed(1)}x
              </span>
            </div>
          </>
        )}

        <div className="quest-modal-actions">
          <button type="button" onClick={onCancel} className="quest-btn quest-btn-outline">
            Back to Office Form
          </button>
          {!loadError && (
            <button type="button" disabled={!imgLoaded} onClick={handleExportCroppedImage} className="quest-btn quest-btn-primary">
              <Crop size={15} /> Apply 1:1 Crop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}