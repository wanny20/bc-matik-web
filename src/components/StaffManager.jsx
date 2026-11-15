import { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as signOutSecondary } from 'firebase/auth';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { 
  UserPlus, Power, Mail, Building, Users, Shield, Search, X, ShieldCheck, Lock, Eye, Edit3, KeyRound,
  Download, ChevronDown, RotateCcw, FileText, FileSpreadsheet, Printer, Calendar, ArrowUpDown
} from 'lucide-react';
import { useUI } from './UIContext';
import { SkeletonTableRows } from './Skeleton';
import TablePagination from './TablePagination';
import './StaffManager.css';

const getSecondaryAuth = () => {
  const secondaryAppName = 'SecondaryAuthApp';
  const existingApp = getApps().find(app => app.name === secondaryAppName);
  const secondaryApp = existingApp || initializeApp(auth.app.options, secondaryAppName);
  return getAuth(secondaryApp);
};

const sanitizeNameInput = (raw) => {
  return (raw || '')
    .replace(/[^a-zA-ZÀ-ÿñÑ\s.-]/g, '')
    .toUpperCase()
    .slice(0, 50);
};

const formatFullName = (first, middle, last) => {
  const f = (first || '').trim();
  const m = (middle || '').trim();
  const l = (last || '').trim();
  if (!l && !f) return '';
  return m ? `${l}, ${f} ${m}` : `${l}, ${f}`;
};

const parseLegacyName = (staffObj) => {
  if (staffObj.first_name || staffObj.last_name) {
    return {
      first: sanitizeNameInput(staffObj.first_name || ''),
      middle: sanitizeNameInput(staffObj.middle_name || ''),
      last: sanitizeNameInput(staffObj.last_name || '')
    };
  }
  const raw = (staffObj.name || '').trim();
  if (raw.includes(',')) {
    const [l, rest] = raw.split(',');
    const parts = (rest || '').trim().split(/\s+/);
    return {
      last: sanitizeNameInput(l),
      first: sanitizeNameInput(parts[0] || ''),
      middle: sanitizeNameInput(parts.slice(1).join(' '))
    };
  }
  const parts = raw.split(/\s+/);
  if (parts.length === 1) {
    return { first: sanitizeNameInput(parts[0]), middle: '', last: '' };
  }
  return {
    first: sanitizeNameInput(parts[0]),
    middle: sanitizeNameInput(parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
    last: sanitizeNameInput(parts[parts.length - 1])
  };
};

const showHideBtnStyle = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  padding: '4px 10px',
  borderRadius: '999px',
  border: '1px solid #E2E8F0',
  backgroundColor: '#F8FAFC',
  color: 'var(--quest-primary, #9E0B03)',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.04em',
  cursor: 'pointer'
};

export default function StaffManager({ setAdminSection }) {
  const { showToast, confirmAction } = useUI();
  const [staffList, setStaffList] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter, Sort & Export Dropdown States
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Provision Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [assignedOffice, setAssignedOffice] = useState('');
  const [selectedRole, setSelectedRole] = useState('staff');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View & Edit Personnel Modal States
  const [viewingStaff, setViewingStaff] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editOffice, setEditOffice] = useState('');
  const [editRole, setEditRole] = useState('staff');
  const [editStatus, setEditStatus] = useState('active');
  const [editErrors, setEditErrors] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);

  const getStaffDateObj = (s) => {
    const raw = s.created_at || s.updated_at;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatStaffDate = (s) => {
    const d = getStaffDateObj(s);
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const formatStaffYMD = (s) => {
    const d = getStaffDateObj(s);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getRoleLabel = (role) => {
    if (role === 'mini_admin') return 'OFFICE MINI ADMIN';
    if (role === 'guard') return 'ENTRANCE GUARD';
    return 'DESK STAFF';
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const officeSnap = await getDocs(collection(db, 'offices'));
      const officeData = officeSnap.docs.map(d => d.data().office_name);
      setOffices(officeData);
      if (officeData.length > 0 && !assignedOffice) setAssignedOffice(officeData[0]);

      const [usersSnap, staffUsersSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'staff_users'))
      ]);

      const mergedMap = new Map();

      staffUsersSnap.docs.forEach(d => {
        const data = d.data();
        if (data.role === 'staff' || data.role === 'mini_admin' || data.role === 'guard') {
          const key = (data.email || d.id).toLowerCase().trim();
          mergedMap.set(key, {
            id: d.id,
            sourceCollection: 'staff_users',
            email: data.email || 'Legacy UID Account',
            name: (data.name || `${data.assigned_office || 'Office'} Staff`).toUpperCase(),
            first_name: data.first_name || '',
            middle_name: data.middle_name || '',
            last_name: data.last_name || '',
            role: data.role,
            assigned_office: data.assigned_office || 'Main Entrance Gate',
            status: data.status || 'active',
            created_at: data.created_at || null,
            updated_at: data.updated_at || null
          });
        }
      });

      usersSnap.docs.forEach(d => {
        const data = d.data();
        if (data.role === 'staff' || data.role === 'mini_admin' || data.role === 'guard') {
          const key = (data.email || d.id).toLowerCase().trim();
          mergedMap.set(key, {
            id: d.id,
            sourceCollection: 'users',
            ...data,
            status: data.status || 'active',
            name: (data.name || '').toUpperCase()
          });
        }
      });

      setStaffList(Array.from(mergedMap.values()));
    } catch (error) {
      console.error("Error loading staff accounts:", error);
      showToast('Failed to load personnel accounts from Firestore.', 'error');
    }
    setLoading(false);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setOfficeFilter('ALL');
    setDateFilter('');
    setSortOrder('desc');
    setCurrentPage(1);
    showToast('All search, office, and date filters have been reset.', 'success', 'Filters Cleared');
  };

  const handleBlur = (field, value, label) => {
    if (!value.trim()) {
      setErrors(prev => ({ ...prev, [field]: `${label} is required` }));
    }
  };

  const checkEmailExistsInFirestore = async (cleanEmail) => {
    const inLocalList = staffList.some(
      s => (s.email || '').toLowerCase().trim() === cleanEmail || s.id.toLowerCase() === cleanEmail
    );
    if (inLocalList) return true;

    const userDocRef = doc(db, 'users', cleanEmail);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) return true;

    const [qUsers, qStaffUsers] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('email', '==', cleanEmail))),
      getDocs(query(collection(db, 'staff_users'), where('email', '==', cleanEmail)))
    ]);

    return !qUsers.empty || !qStaffUsers.empty;
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    const newErrors = {};
    const cleanEmail = email.toLowerCase().trim();

    if (!firstName.trim()) newErrors.firstName = 'First Name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last Name is required';
    if (!cleanEmail) newErrors.email = 'Staff Email Address is required';
    if (!password.trim()) {
      newErrors.password = 'Initial Password is required';
    } else if (password.trim().length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'Confirm Password is required';
    } else if (password.trim() !== confirmPassword.trim()) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (selectedRole !== 'guard' && !assignedOffice) {
      newErrors.assignedOffice = 'Office Assignment is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const combinedName = formatFullName(firstName, middleName, lastName);

    setIsSubmitting(true);
    try {
      const alreadyExists = await checkEmailExistsInFirestore(cleanEmail);
      if (alreadyExists) {
        setErrors({ email: `${cleanEmail} is already registered in the system` });
        showToast(`Account with email "${cleanEmail}" already exists!`, 'error', 'Duplicate Account Blocked');
        setIsSubmitting(false);
        return;
      }

      let createdUid = null;
      try {
        const secondaryAuth = getSecondaryAuth();
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password.trim());
        createdUid = userCredential.user.uid;
        await signOutSecondary(secondaryAuth);
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          setErrors({ email: `${cleanEmail} already exists in Firebase Authentication` });
          showToast(`"${cleanEmail}" is already registered in Firebase Auth!`, 'error', 'Duplicate Email Blocked');
          setIsSubmitting(false);
          return;
        }
        throw authErr;
      }

      const finalOffice = selectedRole === 'guard' ? 'Main Entrance Gate' : assignedOffice;
      const payload = {
        uid: createdUid,
        email: cleanEmail,
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
        name: combinedName,
        role: selectedRole,
        assigned_office: finalOffice,
        created_at: new Date(),
        status: 'active'
      };

      await setDoc(doc(db, 'users', cleanEmail), payload);
      if (createdUid) {
        await setDoc(doc(db, 'staff_users', createdUid), payload);
      }

      const roleLabel = selectedRole === 'mini_admin' ? 'Office Mini Admin' : selectedRole === 'guard' ? 'Entrance Guard' : 'Desk Staff';
      showToast(`${combinedName} (${cleanEmail}) provisioned as ${roleLabel}.`, 'success', 'Account Created');
      
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setSelectedRole('staff');
      setErrors({});
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error provisioning staff:", err);
      showToast(err.message || 'Failed to provision account.', 'error');
    }
    setIsSubmitting(false);
  };

  const openEditModal = (staff) => {
    const parsed = parseLegacyName(staff);
    setEditingStaff(staff);
    setEditFirstName(parsed.first);
    setEditMiddleName(parsed.middle);
    setEditLastName(parsed.last);
    setEditOffice(staff.assigned_office || offices[0] || '');
    setEditRole(staff.role || 'staff');
    setEditStatus(staff.status || 'active');
    setEditErrors({});
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    const newErr = {};
    if (!editFirstName.trim()) newErr.firstName = 'First Name is required';
    if (!editLastName.trim()) newErr.lastName = 'Last Name is required';

    if (Object.keys(newErr).length > 0) {
      setEditErrors(newErr);
      return;
    }

    const updatedFullName = formatFullName(editFirstName, editMiddleName, editLastName);

    setIsUpdating(true);
    try {
      const targetCol = editingStaff.sourceCollection || 'users';
      const updates = {
        first_name: editFirstName.trim(),
        middle_name: editMiddleName.trim(),
        last_name: editLastName.trim(),
        name: updatedFullName,
        assigned_office: editRole === 'guard' ? 'Main Entrance Gate' : editOffice,
        role: editRole,
        status: editStatus,
        updated_at: new Date()
      };

      await updateDoc(doc(db, targetCol, editingStaff.id), updates);
      if (editingStaff.uid && targetCol === 'users') {
        await updateDoc(doc(db, 'staff_users', editingStaff.uid), updates).catch(() => {});
      }

      showToast(`Updated account details for ${updatedFullName}.`, 'success', 'Personnel Updated');
      setEditingStaff(null);
      fetchData();
    } catch (e) {
      showToast('Failed to update personnel account.', 'error');
    }
    setIsUpdating(false);
  };
const [staffResetCooldowns, setStaffResetCooldowns] = useState({});
  const [isSendingStaffReset, setIsSendingStaffReset] = useState(false);

  const handleSendStaffResetEmail = async (staffObj) => {
    const targetMail = (staffObj?.email || '').trim().toLowerCase();
    if (!targetMail || !targetMail.includes('@')) {
      showToast('This account does not have a valid email address.', 'error');
      return;
    }

    const cooldownUntil = staffResetCooldowns[targetMail] || 0;
    const remainingSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (remainingSec > 0) {
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      showToast(
        `Please wait ${m}m ${s}s before sending another reset email to ${targetMail}.`,
        'warning',
        'Cooldown Active'
      );
      return;
    }

    confirmAction({
      title: 'Send Password Reset Email?',
      message: `Send an official Firebase password reset link to ${staffObj.name} (${targetMail})?`,
      confirmText: 'Send Reset Email',
      variant: 'primary',
      onConfirm: async () => {
        setIsSendingStaffReset(true);
        try {
          await sendPasswordResetEmail(auth, targetMail);
          setStaffResetCooldowns(prev => ({
            ...prev,
            [targetMail]: Date.now() + 5 * 60 * 1000
          }));
          showToast(
            `Password reset email sent to ${targetMail}.`,
            'success',
            'Reset Link Dispatched'
          );
        } catch (err) {
          showToast('Failed to send password reset email. Verify Firebase Auth account.', 'error');
        }
        setIsSendingStaffReset(false);
      }
    });
  };

  const handleToggleMiniAdmin = async (staff) => {
    const newRole = staff.role === 'mini_admin' ? 'staff' : 'mini_admin';
    const roleTitle = newRole === 'mini_admin' ? 'Mini Admin' : 'Desk Staff';
    try {
      const targetCol = staff.sourceCollection || 'users';
      await updateDoc(doc(db, targetCol, staff.id), { role: newRole });
      if (staff.uid && targetCol === 'users') {
        await updateDoc(doc(db, 'staff_users', staff.uid), { role: newRole }).catch(() => {});
      }
      showToast(`${staff.name} is now a ${roleTitle} for ${staff.assigned_office}.`, 'success', 'Role Updated');
      fetchData();
    } catch (e) {
      showToast('Failed to update role.', 'error');
    }
  };

  const handleToggleStaffStatus = (staff) => {
    const isCurrentlyDisabled = staff.status === 'disabled';
    const nextStatus = isCurrentlyDisabled ? 'active' : 'disabled';

    confirmAction({
      title: isCurrentlyDisabled ? 'Enable Personnel Account?' : 'Disable Personnel Account?',
      message: isCurrentlyDisabled
        ? `Re-enable system login access for ${staff.name} (${staff.email})?`
        : `Are you sure you want to disable access for ${staff.name} (${staff.email})? Their historical records will be preserved, but they will not be able to sign in.`,
      confirmText: isCurrentlyDisabled ? 'Enable Account' : 'Disable Account',
      variant: isCurrentlyDisabled ? 'primary' : 'danger',
      onConfirm: async () => {
        const targetCol = staff.sourceCollection || 'users';
        await updateDoc(doc(db, targetCol, staff.id), { status: nextStatus, updated_at: new Date() });
        if (staff.uid) {
          await updateDoc(doc(db, 'staff_users', staff.uid), { status: nextStatus, updated_at: new Date() }).catch(() => {});
        }
        showToast(
          `${staff.name} is now ${nextStatus === 'active' ? 'Active' : 'Disabled'}.`,
          nextStatus === 'active' ? 'success' : 'warning',
          nextStatus === 'active' ? 'Account Enabled' : 'Account Disabled'
        );
        fetchData();
      }
    });
  };

  const filteredStaff = staffList
    .filter(staff => {
      const matchesOffice = officeFilter === 'ALL' || staff.assigned_office === officeFilter;
      const matchesDate = !dateFilter || formatStaffYMD(staff) === dateFilter;
      const matchesSearch =
        (staff.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (staff.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (staff.assigned_office || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesOffice && matchesDate && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = getStaffDateObj(a)?.getTime() || 0;
      const timeB = getStaffDateObj(b)?.getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  const paginatedStaff = filteredStaff.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const miniAdminCount = staffList.filter(s => s.role === 'mini_admin').length;

  const handleExportCSV = () => {
    setExportDropdownOpen(false);
    if (filteredStaff.length === 0) {
      showToast('No personnel records available to export.', 'warning');
      return;
    }
    const headers = ['Created Date,Personnel Name,Email Address,Office Assignment,System Role,Status'];
    const rows = filteredStaff.map(s => 
      `"${formatStaffDate(s)}","${s.name || ''}","${s.email || ''}","${s.assigned_office || ''}","${getRoleLabel(s.role)}","${s.status === 'disabled' ? 'DISABLED' : 'ACTIVE'}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `BCMatik_Personnel_List_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredStaff.length} personnel records to CSV.`, 'success', 'CSV Downloaded');
  };

  const handleExportExcel = () => {
    setExportDropdownOpen(false);
    if (filteredStaff.length === 0) {
      showToast('No personnel records available to export.', 'warning');
      return;
    }
    const tableRows = filteredStaff.map((s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatStaffDate(s)}</td>
        <td><b>${s.name || ''}</b></td>
        <td>${s.email || ''}</td>
        <td>${s.assigned_office || ''}</td>
        <td>${getRoleLabel(s.role)}</td>
        <td>${s.status === 'disabled' ? 'DISABLED' : 'ACTIVE'}</td>
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
              <th>Created Date</th>
              <th>Personnel Name</th>
              <th>Email Address</th>
              <th>Office Assignment</th>
              <th>System Role</th>
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
    link.download = `BCMatik_Personnel_List_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredStaff.length} personnel records to Excel (.xls).`, 'success', 'Excel Downloaded');
  };

  const handleExportPDF = () => {
    setExportDropdownOpen(false);
    if (filteredStaff.length === 0) {
      showToast('No personnel records available to export.', 'warning');
      return;
    }
    const printWin = window.open('', '_blank', 'width=960,height=700');
    if (!printWin) {
      showToast('Please allow popups in your browser to generate PDF reports.', 'error');
      return;
    }

    const rowsHtml = filteredStaff.map((s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatStaffDate(s)}</td>
        <td><strong>${s.name || ''}</strong></td>
        <td>${s.email || ''}</td>
        <td>${s.assigned_office || ''}</td>
        <td>${getRoleLabel(s.role)}</td>
        <td>${s.status === 'disabled' ? 'DISABLED' : 'ACTIVE'}</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <html>
        <head>
          <title>BCMatik Personnel & Mini Admin Report</title>
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
              <h1>BICOL COLLEGE • STAFF & MINI ADMIN DIRECTORY</h1>
              <p>Office Scope: ${officeFilter === 'ALL' ? 'All Campus Offices' : officeFilter} ${dateFilter ? `• Date: ${dateFilter}` : ''}</p>
            </div>
            <p>Generated: ${new Date().toLocaleString()} • Total Personnel: ${filteredStaff.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Created</th>
                <th>Personnel Name</th>
                <th>Email Address</th>
                <th>Office Assignment</th>
                <th>System Role</th>
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

  const closeProvisionModal = () => {
    const isDirty =
      firstName.trim() !== '' ||
      middleName.trim() !== '' ||
      lastName.trim() !== '' ||
      email.trim() !== '' ||
      password.trim() !== '' ||
      confirmPassword.trim() !== '' ||
      selectedRole !== 'staff';
    if (!isDirty) {
      setIsModalOpen(false);
      setErrors({});
      return;
    }
    confirmAction({
      title: 'Discard Personnel Form?',
      message: 'You have entered personnel details that have not been saved. Discard these changes?',
      confirmText: 'Discard',
      variant: 'danger',
      onConfirm: () => {
        setFirstName('');
        setMiddleName('');
        setLastName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setSelectedRole('staff');
        setErrors({});
        setIsModalOpen(false);
      }
    });
  };

  const closeEditStaffModal = () => {
    if (!editingStaff) return;
    const orig = parseLegacyName(editingStaff);
    const isDirty =
      editFirstName.trim() !== orig.first ||
      editMiddleName.trim() !== orig.middle ||
      editLastName.trim() !== orig.last ||
      editOffice !== (editingStaff.assigned_office || '') ||
      editRole !== (editingStaff.role || 'staff') ||
      editStatus !== (editingStaff.status || 'active');
    if (!isDirty) {
      setEditingStaff(null);
      return;
    }
    confirmAction({
      title: 'Discard Unsaved Edits?',
      message: `Discard your unsaved changes to ${editingStaff.name}'s account?`,
      confirmText: 'Discard Changes',
      variant: 'danger',
      onConfirm: () => setEditingStaff(null)
    });
  };

  return (
    <div>
      <div className="quest-page-banner">
        <div>
          <h1>Staff & Mini Admin Management</h1>
          <p>
            Provision desk staff, Entrance Guards, and Office Mini Admins, or disable inactive personnel accounts.
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="staff-stats-grid">
        <div className="staff-stat-card">
          <div className="staff-stat-icon"><Users size={24} /></div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', textTransform: 'uppercase' }}>Total Personnel</div>
            <div className="outfit-number" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--quest-text-primary)' }}>{staffList.length}</div>
          </div>
        </div>
        <div className="staff-stat-card">
          <div className="staff-stat-icon"><ShieldCheck size={24} /></div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', textTransform: 'uppercase' }}>Office Mini Admins</div>
            <div className="outfit-number" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--quest-text-primary)' }}>{miniAdminCount}</div>
          </div>
        </div>
        <div className="staff-stat-card">
          <div className="staff-stat-icon"><Building size={24} /></div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', textTransform: 'uppercase' }}>Offices Covered</div>
            <div className="outfit-number" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--quest-text-primary)' }}>
              {new Set(staffList.map(s => s.assigned_office)).size}
            </div>
          </div>
        </div>
      </div>

      <div className="staff-list-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '280px' }}>
              <Search size={17} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '13px', top: '11px' }} />
              <input 
                type="text" 
                className="quest-input" 
                style={{ paddingLeft: '38px' }}
                placeholder="Search name, email, or office..." 
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <select 
              className="quest-input" 
              style={{ width: '185px' }} 
              value={officeFilter} 
              onChange={e => {
                setOfficeFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Offices</option>
              {offices.map(off => (
                <option key={off} value={off}>{off}</option>
              ))}
              <option value="Main Entrance Gate">Main Entrance Gate</option>
            </select>

            <div style={{ position: 'relative', width: '165px' }}>
              <Calendar size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
              <input
                type="date"
                className="quest-input"
                style={{ paddingLeft: '36px', fontSize: '12.5px' }}
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter by Provision Date"
              />
            </div>

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
              style={{ padding: '9px 12px', borderRadius: '10px' }}
              title="Print Personnel Directory"
            >
              <Printer size={17} color="var(--quest-primary)" />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="quest-btn quest-btn-outline"
                style={{
                  padding: '9px 14px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: '#FFFFFF'
                }}
              >
                <Download size={15} color="var(--quest-primary)" /> Export <ChevronDown size={14} />
              </button>

              {exportDropdownOpen && (
                <div
                  className="quest-card"
                  style={{
                    position: 'absolute',
                    top: '45px',
                    right: 0,
                    width: '160px',
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

            <button 
              onClick={() => { setIsModalOpen(true); setErrors({}); }} 
              className="quest-btn quest-btn-primary"
              style={{ padding: '9px 16px', borderRadius: '10px' }}
            >
              <UserPlus size={17} /> Provision Personnel
            </button>
          </div>
        </div>

        <div className="quest-table-container">
          <table className="quest-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Created</th>
                <th>Personnel Name</th>
                <th>Email Address</th>
                <th>Office Assignment</th>
                <th>System Role (Click to Toggle)</th>
                <th>Account Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={4} cols={7} />
              ) : paginatedStaff.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--quest-text-secondary)' }}>No personnel accounts found.</td></tr>
              ) : (
                paginatedStaff.map(staff => {
                  const isDisabled = staff.status === 'disabled';
                  return (
                    <tr key={staff.id} style={{ opacity: isDisabled ? 0.65 : 1 }}>
                      <td style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                        {formatStaffDate(staff)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div className="staff-avatar">{(staff.name || 'S').charAt(0).toUpperCase()}</div>
                          <span style={{ fontWeight: 700, color: 'var(--quest-text-primary)' }}>{staff.name}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--quest-text-secondary)' }}>{staff.email}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--quest-primary)' }}>
                          {staff.assigned_office}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleMiniAdmin(staff)}
                          className={`quest-badge ${
                            staff.role === 'mini_admin' ? 'badge-primary' :
                            staff.role === 'guard' ? 'badge-warning' : 'badge-info'
                          }`}
                          style={{ border: 'none', cursor: 'pointer', padding: '6px 12px' }}
                          title="Click to switch role"
                        >
                          <Shield size={12} />
                          {staff.role === 'mini_admin'
                            ? `MINI ADMIN (${staff.assigned_office})`
                            : staff.role === 'guard'
                            ? 'ENTRANCE GUARD (MOBILE)'
                            : 'DESK STAFF'}
                        </button>
                      </td>
                      <td>
                        <span className={`quest-badge ${isDisabled ? 'badge-danger' : 'badge-success'}`}>
                          {isDisabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="quest-action-group">
                          <button
                            onClick={() => setViewingStaff(staff)}
                            className="quest-icon-btn view"
                            title="View Personnel Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => openEditModal(staff)}
                            className="quest-icon-btn edit"
                            title="Edit Personnel Account"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button 
                            onClick={() => handleToggleStaffStatus(staff)}
                            className={`quest-icon-btn ${isDisabled ? 'power-on' : 'delete'}`}
                            title={isDisabled ? 'Enable Personnel Account' : 'Disable Personnel Account'}
                          >
                            <Power size={15} />
                          </button>
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
          totalItems={filteredStaff.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* 1. VIEW PERSONNEL DETAILS MODAL */}
      {viewingStaff && (
        <div className="quest-modal-backdrop" onClick={() => setViewingStaff(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="staff-avatar" style={{ width: '44px', height: '44px', fontSize: '18px' }}>
                  {(viewingStaff.name || 'S').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#1E293B' }}>{viewingStaff.name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>{viewingStaff.email}</p>
                </div>
              </div>
              <button onClick={() => setViewingStaff(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div className="quest-detail-box">
              <div className="quest-detail-row">
                <span className="quest-detail-label">Created Date</span>
                <span className="quest-detail-value">{formatStaffDate(viewingStaff)}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Personnel Full Name</span>
                <span className="quest-detail-value">{viewingStaff.name}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Email Address</span>
                <span className="quest-detail-value">{viewingStaff.email}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Assigned Office</span>
                <span className="quest-detail-value" style={{ color: 'var(--quest-primary)' }}>{viewingStaff.assigned_office}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Privilege Level</span>
                <span className={`quest-badge ${viewingStaff.role === 'mini_admin' ? 'badge-primary' : viewingStaff.role === 'guard' ? 'badge-warning' : 'badge-info'}`}>
                  {viewingStaff.role === 'mini_admin' ? 'OFFICE MINI ADMIN' : viewingStaff.role === 'guard' ? 'ENTRANCE GUARD' : 'DESK STAFF'}
                </span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Account Status</span>
                <span className={`quest-badge ${viewingStaff.status === 'disabled' ? 'badge-danger' : 'badge-success'}`}>
                  {viewingStaff.status === 'disabled' ? 'DISABLED' : 'ACTIVE'}
                </span>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setViewingStaff(null)} className="quest-btn quest-btn-outline">Close</button>
              <button 
                onClick={() => {
                  const target = viewingStaff;
                  setViewingStaff(null);
                  openEditModal(target);
                }} 
                className="quest-btn quest-btn-primary"
              >
                <Edit3 size={15} /> Edit Personnel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. EDIT PERSONNEL MODAL */}
      {editingStaff && (
        <div className="quest-modal-backdrop" onClick={closeEditStaffModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B' }}>Edit Personnel Account</h3>
              <button onClick={closeEditStaffModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateStaff} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="staff-form-group">
                  <label className="staff-label">
                    First Name <span className="quest-req-star">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    className={`quest-input ${editErrors.firstName ? 'input-error' : ''}`}
                    placeholder="MARIA"
                    value={editFirstName}
                    onChange={(e) => {
                      setEditFirstName(sanitizeNameInput(e.target.value));
                      if (editErrors.firstName) setEditErrors({ ...editErrors, firstName: '' });
                    }}
                  />
                  {editErrors.firstName && <span className="quest-error-text">{editErrors.firstName}</span>}
                </div>

                <div className="staff-form-group">
                  <label className="staff-label">
                    Last Name <span className="quest-req-star">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    className={`quest-input ${editErrors.lastName ? 'input-error' : ''}`}
                    placeholder="SANTOS"
                    value={editLastName}
                    onChange={(e) => {
                      setEditLastName(sanitizeNameInput(e.target.value));
                      if (editErrors.lastName) setEditErrors({ ...editErrors, lastName: '' });
                    }}
                  />
                  {editErrors.lastName && <span className="quest-error-text">{editErrors.lastName}</span>}
                </div>
              </div>

              <div className="staff-form-group">
                <label className="staff-label">Middle Name (Optional • Max 50 Chars)</label>
                <input
                  type="text"
                  maxLength={50}
                  className="quest-input"
                  placeholder="CRUZ"
                  value={editMiddleName}
                  onChange={(e) => setEditMiddleName(sanitizeNameInput(e.target.value))}
                />
              </div>

              <div className="staff-form-group">
                <label className="staff-label">Email Address (Read-Only)</label>
                <input type="text" className="quest-input" value={editingStaff.email} readOnly style={{ backgroundColor: '#F1F5F9', color: '#64748B' }} />
              </div>
                    <div className="staff-form-group">
                <label className="staff-label">Password Recovery (Firebase Authentication)</label>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px'
                }}>
                  <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.4 }}>
                    Staff passwords are encrypted in Firebase Auth. Send a secure reset link to <strong>{editingStaff.email}</strong>.
                  </div>
                  <button
                    type="button"
                    disabled={isSendingStaffReset}
                    onClick={() => handleSendStaffResetEmail(editingStaff)}
                    className="quest-btn quest-btn-outline"
                    style={{ whiteSpace: 'nowrap', padding: '7px 12px', fontSize: '12px', fontWeight: 800, backgroundColor: '#FFFFFF' }}
                  >
                    <KeyRound size={14} color="var(--quest-primary)" />
                    {isSendingStaffReset ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </div>
              
              <div className="staff-form-group">
                <label className="staff-label">
                  Privilege Level / Role <span className="quest-req-star">*</span>
                </label>
                <select className="quest-input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  <option value="staff">Desk Staff (Live Queue Terminal Only)</option>
                  <option value="mini_admin">Office Mini Admin (Manage Windows, Workflows & Releases)</option>
                  <option value="guard">Entrance Guard (Mobile App Triage & Priority Verification)</option>
                </select>
              </div>

              {editRole !== 'guard' && (
                <div className="staff-form-group">
                  <label className="staff-label">
                    Office Assignment <span className="quest-req-star">*</span>
                  </label>
                  <select className="quest-input" value={editOffice} onChange={(e) => setEditOffice(e.target.value)}>
                    {offices.map(off => <option key={off} value={off}>{off}</option>)}
                  </select>
                </div>
              )}

              <div className="staff-form-group" style={{ marginBottom: '24px' }}>
                <label className="staff-label">
                  Account Status <span className="quest-req-star">*</span>
                </label>
                <select className="quest-input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="active">Active (Authorized to Sign In)</option>
                  <option value="disabled">Disabled (Sign-In Blocked)</option>
                </select>
              </div>

              <div className="quest-modal-actions">
                <button type="button" onClick={closeEditStaffModal} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isUpdating} className="quest-btn quest-btn-primary">
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. PROVISION NEW PERSONNEL MODAL */}
      {isModalOpen && (
        <div className="quest-modal-backdrop" onClick={closeProvisionModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontFamily: 'var(--font-heading)' }}>Provision Personnel Account</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Letters only (auto-capitalized, max 50 characters per name field).</p>
              </div>
              <button onClick={closeProvisionModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateStaff} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="staff-form-group">
                  <label className="staff-label">
                    First Name <span className="quest-req-star">*</span>
                  </label>
                  <input 
                    type="text" 
                    maxLength={50}
                    className={`quest-input ${errors.firstName ? 'input-error' : ''}`} 
                    placeholder="e.g. MARIA" 
                    value={firstName} 
                    onBlur={() => handleBlur('firstName', firstName, 'First Name')}
                    onChange={e => {
                      setFirstName(sanitizeNameInput(e.target.value));
                      if (errors.firstName) setErrors({ ...errors, firstName: '' });
                    }} 
                  />
                  {errors.firstName && <span className="quest-error-text">{errors.firstName}</span>}
                </div>

                <div className="staff-form-group">
                  <label className="staff-label">
                    Last Name <span className="quest-req-star">*</span>
                  </label>
                  <input 
                    type="text" 
                    maxLength={50}
                    className={`quest-input ${errors.lastName ? 'input-error' : ''}`} 
                    placeholder="e.g. SANTOS" 
                    value={lastName} 
                    onBlur={() => handleBlur('lastName', lastName, 'Last Name')}
                    onChange={e => {
                      setLastName(sanitizeNameInput(e.target.value));
                      if (errors.lastName) setErrors({ ...errors, lastName: '' });
                    }} 
                  />
                  {errors.lastName && <span className="quest-error-text">{errors.lastName}</span>}
                </div>
              </div>

              <div className="staff-form-group">
                <label className="staff-label">
                  Middle Name <span style={{ color: '#94A3B8', fontWeight: 500 }}>(Optional)</span>
                </label>
                <input 
                  type="text" 
                  maxLength={50}
                  className="quest-input" 
                  placeholder="e.g. CRUZ" 
                  value={middleName} 
                  onChange={e => setMiddleName(sanitizeNameInput(e.target.value))} 
                />
              </div>

              <div className="staff-form-group">
                <label className="staff-label">
                  Staff Email Address <span className="quest-req-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                  <input 
                    type="email" 
                    className={`quest-input ${errors.email ? 'input-error' : ''}`} 
                    style={{ paddingLeft: '40px' }} 
                    placeholder="cashier_admin@bc.edu" 
                    value={email} 
                    onBlur={() => handleBlur('email', email, 'Staff Email Address')}
                    onChange={e => {
                      const safeEmail = e.target.value.toLowerCase().replace(/[^a-z0-9@._-]/g, '').slice(0, 80);
                      setEmail(safeEmail);
                      if (errors.email) setErrors({ ...errors, email: '' });
                    }}
                  />
                </div>
                {errors.email && <span className="quest-error-text">{errors.email}</span>}
              </div>

              <div className="staff-form-group">
                <label className="staff-label">
                  Initial Password <span className="quest-req-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className={`quest-input ${errors.password ? 'input-error' : ''}`} 
                    style={{ paddingLeft: '40px', paddingRight: '68px' }} 
                    placeholder="Minimum 6 characters" 
                    value={password} 
                    onBlur={() => handleBlur('password', password, 'Initial Password')}
                    onChange={e => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors({ ...errors, password: '' });
                    }} 
                  />
                  <button
                    type="button"
                    style={showHideBtnStyle}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {errors.password && <span className="quest-error-text">{errors.password}</span>}
              </div>

              <div className="staff-form-group">
                <label className="staff-label">
                  Confirm Password <span className="quest-req-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                  <input 
                    type={showConfirmPassword ? 'text' : 'password'} 
                    className={`quest-input ${errors.confirmPassword ? 'input-error' : ''}`} 
                    style={{ paddingLeft: '40px', paddingRight: '68px' }} 
                    placeholder="Re-enter initial password" 
                    value={confirmPassword} 
                    onBlur={() => {
                      if (!confirmPassword.trim()) {
                        setErrors(prev => ({ ...prev, confirmPassword: 'Confirm Password is required' }));
                      } else if (password.trim() && confirmPassword.trim() !== password.trim()) {
                        setErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
                      }
                    }}
                    onChange={e => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                    }} 
                  />
                  <button
                    type="button"
                    style={showHideBtnStyle}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {errors.confirmPassword && <span className="quest-error-text">{errors.confirmPassword}</span>}
              </div>

              <div className="staff-form-group">
                <label className="staff-label">
                  Privilege Level / Role <span className="quest-req-star">*</span>
                </label>
                <select className="quest-input" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                  <option value="staff">Desk Staff (Live Queue Terminal Only)</option>
                  <option value="mini_admin">Office Mini Admin (Manage Office Windows, Workflows & Document Releases)</option>
                  <option value="guard">Entrance Guard (Mobile App Triage & Priority Verification)</option>
                </select>
              </div>

              {selectedRole !== 'guard' && (
                <div className="staff-form-group" style={{ marginBottom: '24px' }}>
                  <label className="staff-label">
                    Office Assignment <span className="quest-req-star">*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Building size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                    <select className="quest-input" style={{ paddingLeft: '40px' }} value={assignedOffice} onChange={e => setAssignedOffice(e.target.value)}>
                      {offices.map(off => <option key={off} value={off}>{off}</option>)}
                    </select>
                  </div>
                  {errors.assignedOffice && <span className="quest-error-text">{errors.assignedOffice}</span>}
                </div>
              )}

              <div className="quest-modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" onClick={closeProvisionModal} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="quest-btn quest-btn-primary">
                  {isSubmitting ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}