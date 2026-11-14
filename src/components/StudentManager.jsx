import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { 
  Plus, Search, Eye, Edit3, X, Users, Lock, 
  Download, ChevronDown, RotateCcw, FileText, FileSpreadsheet, Printer, Calendar, ArrowUpDown 
} from 'lucide-react';
import { useUI } from './UIContext';
import { SkeletonTableRows } from './Skeleton';
import { ACADEMIC_DIVISIONS, ROSTER_PROGRAMS } from '../constants/academicPrograms';
import TablePagination from './TablePagination';

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

// Normalizes course so legacy 'GUEST' entries in the roster display as 'ALUMNI'
const normalizeRosterCourse = (studentObj) => {
  const rawCourse = (studentObj?.course || '').toUpperCase().trim();
  if (rawCourse === 'GUEST') return 'ALUMNI';
  return rawCourse || 'BSCS';
};

// Ensures Alumni / External records never display "Year 1"
const formatStudentYearDisplay = (studentObj) => {
  const course = normalizeRosterCourse(studentObj);
  const div = (studentObj?.division || '').toUpperCase().trim();
  const yr = String(studentObj?.year || '').toUpperCase().trim();

  if (div === 'EXTERNAL' || course === 'ALUMNI' || yr === 'GRADUATED' || yr === 'N/A') {
    return course === 'FACULTY' ? '— (Faculty)' : '— (Alumni)';
  }
  return `Year ${yr || '1'}`;
};

const parseLegacyStudentName = (studentObj) => {
  if (studentObj.first_name || studentObj.last_name) {
    return {
      first: sanitizeNameInput(studentObj.first_name || ''),
      middle: sanitizeNameInput(studentObj.middle_name || ''),
      last: sanitizeNameInput(studentObj.last_name || '')
    };
  }
  const raw = (studentObj.name || '').trim();
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

export default function StudentManager({ setAdminSection }) {
  const { showToast, confirmAction } = useUI();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter, Sort & Export Dropdown States
  const [searchTerm, setSearchTerm] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Add Student / Alumni Popup Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualData, setManualData] = useState({ 
    first_name: '',
    middle_name: '',
    last_name: '',
    student_id: '', 
    password: '',
    confirmPassword: '',
    division: 'CCS', 
    course: 'BSCS', 
    year: '1' 
  });
  const [showStudentPass, setShowStudentPass] = useState(false);
  const [showStudentConfirmPass, setShowStudentConfirmPass] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View & Edit Student Modal States
  const [viewingStudent, setViewingStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editData, setEditData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    division: 'CCS',
    course: 'BSCS',
    year: '1'
  });
  const [editErrors, setEditErrors] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);

  const getStudentDateObj = (s) => {
    const raw = s.registered_at || s.updated_at;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatStudentDate = (s) => {
    const d = getStudentDateObj(s);
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const formatStudentYMD = (s) => {
    const d = getStudentDateObj(s);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const fetchStudents = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'students'));
    setStudents(snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        course: normalizeRosterCourse(data),
        name: (data.name || '').toUpperCase()
      };
    }));
    setLoading(false);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleClearFilters = () => {
    setSearchTerm('');
    setDivisionFilter('ALL');
    setDateFilter('');
    setSortOrder('desc');
    setCurrentPage(1);
    showToast('All search, department, and date filters have been reset.', 'success', 'Filters Cleared');
  };

  const handleBlur = (field, value, label) => {
    if (!String(value || '').trim()) {
      setErrors(prev => ({ ...prev, [field]: `${label} is required` }));
    }
  };

  const handleDivisionChange = (newDiv) => {
    const defaultProg = ROSTER_PROGRAMS[newDiv]?.[0]?.code || '';
    const defaultYear = newDiv === 'EXTERNAL' ? 'GRADUATED' : '1';
    setManualData({ ...manualData, division: newDiv, course: defaultProg, year: defaultYear });
    if (errors.division || errors.course) {
      setErrors({ ...errors, division: '', course: '' });
    }
  };

  const handleEditDivisionChange = (newDiv) => {
    const defaultProg = ROSTER_PROGRAMS[newDiv]?.[0]?.code || '';
    const defaultYear = newDiv === 'EXTERNAL' ? 'GRADUATED' : (editData.year === 'GRADUATED' ? '1' : editData.year);
    setEditData({ ...editData, division: newDiv, course: defaultProg, year: defaultYear });
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    const cleanFirst = manualData.first_name.trim();
    const cleanMiddle = manualData.middle_name.trim();
    const cleanLast = manualData.last_name.trim();
    const cleanId = manualData.student_id.trim();
    const cleanPass = manualData.password.trim();
    const cleanConfirmPass = manualData.confirmPassword.trim();

    if (!cleanFirst) newErrors.first_name = 'First Name is required';
    if (!cleanLast) newErrors.last_name = 'Last Name is required';
    if (!cleanId) newErrors.student_id = 'Student / Alumni ID Number is required';
    if (!cleanPass) {
      newErrors.password = 'Initial Password is required';
    } else if (cleanPass.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    if (!cleanConfirmPass) {
      newErrors.confirmPassword = 'Confirm Password is required';
    } else if (cleanPass !== cleanConfirmPass) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!manualData.division) newErrors.division = 'Department / Group is required';
    if (!manualData.course) newErrors.course = 'Program / Course is required';

    const finalYear = manualData.division === 'EXTERNAL' || manualData.course === 'ALUMNI' || manualData.course === 'FACULTY'
      ? 'GRADUATED'
      : String(manualData.year || '1').trim();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const isDuplicateId = students.some(
      (s) => (s.student_id || s.id).toLowerCase() === cleanId.toLowerCase()
    );

    if (isDuplicateId) {
      setErrors({ student_id: `Student ID ${cleanId} is already registered` });
      showToast(`Student ID "${cleanId}" already exists in the roster!`, 'error', 'Duplicate Student Blocked');
      return;
    }

    const combinedName = formatFullName(cleanFirst, cleanMiddle, cleanLast);
    
    setIsSubmitting(true);
    try {
      await setDoc(doc(db, 'students', cleanId), {
        student_id: cleanId,
        first_name: cleanFirst,
        middle_name: cleanMiddle,
        last_name: cleanLast,
        name: combinedName,
        password: cleanPass,
        initial_password: cleanPass,
        division: manualData.division,
        course: manualData.course.toUpperCase().trim(),
        year: finalYear,
        registered_at: new Date(),
        status: 'active'
      });
      
      showToast(`${combinedName} (${manualData.course}) added to the roster.`, 'success', 'Client Registered');
      setManualData({
        first_name: '',
        middle_name: '',
        last_name: '',
        student_id: '',
        password: '',
        confirmPassword: '',
        division: 'CCS',
        course: 'BSCS',
        year: '1'
      });
      setShowStudentPass(false);
      setShowStudentConfirmPass(false);
      setErrors({});
      setIsAddModalOpen(false);
      fetchStudents();
    } catch (e) {
      showToast('Failed to register student.', 'error');
    }
    setIsSubmitting(false);
  };

  const openEditModal = (student) => {
    const parsed = parseLegacyStudentName(student);
    const cleanDiv = student.division || 'CCS';
    const cleanCourse = normalizeRosterCourse(student);
    const isExt = cleanDiv === 'EXTERNAL' || cleanCourse === 'ALUMNI' || cleanCourse === 'FACULTY';

    setEditingStudent(student);
    setEditData({
      first_name: parsed.first,
      middle_name: parsed.middle,
      last_name: parsed.last,
      division: cleanDiv,
      course: cleanCourse,
      year: isExt ? 'GRADUATED' : String(student.year || '1')
    });
    setEditErrors({});
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;
    const newErr = {};
    if (!editData.first_name.trim()) newErr.first_name = 'First Name is required';
    if (!editData.last_name.trim()) newErr.last_name = 'Last Name is required';

    if (Object.keys(newErr).length > 0) {
      setEditErrors(newErr);
      return;
    }

    const updatedFullName = formatFullName(editData.first_name, editData.middle_name, editData.last_name);
    const finalYear = editData.division === 'EXTERNAL' || editData.course === 'ALUMNI' || editData.course === 'FACULTY'
      ? 'GRADUATED'
      : String(editData.year || '1').trim();

    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'students', editingStudent.id), {
        first_name: editData.first_name.trim(),
        middle_name: editData.middle_name.trim(),
        last_name: editData.last_name.trim(),
        name: updatedFullName,
        division: editData.division,
        course: editData.course.toUpperCase().trim(),
        year: finalYear,
        updated_at: new Date()
      });
      showToast(`Updated record for ${updatedFullName}.`, 'success', 'Student Updated');
      setEditingStudent(null);
      fetchStudents();
    } catch (e) {
      showToast('Failed to update student profile.', 'error');
    }
    setIsUpdating(false);
  };

  const filteredStudents = students
    .filter(s => {
      const matchesDivision = divisionFilter === 'ALL' || (s.division || 'COLLEGE') === divisionFilter;
      const matchesDate = !dateFilter || formatStudentYMD(s) === dateFilter;
      const matchesSearch = 
        (s.student_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.course || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDivision && matchesDate && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = getStudentDateObj(a)?.getTime() || 0;
      const timeB = getStudentDateObj(b)?.getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleExportCSV = () => {
    setExportDropdownOpen(false);
    if (filteredStudents.length === 0) {
      showToast('No student records available to export.', 'warning');
      return;
    }
    const headers = ['Registered Date,Student ID,Full Name,Department,Program,Year'];
    const rows = filteredStudents.map(s => 
      `"${formatStudentDate(s)}","${s.student_id || ''}","${s.name || ''}","${s.division || 'COLLEGE'}","${s.course || ''}","${formatStudentYearDisplay(s)}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `BCMatik_Student_Roster_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredStudents.length} student records to CSV.`, 'success', 'CSV Downloaded');
  };

  const handleExportExcel = () => {
    setExportDropdownOpen(false);
    if (filteredStudents.length === 0) {
      showToast('No student records available to export.', 'warning');
      return;
    }
    const tableRows = filteredStudents.map((s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatStudentDate(s)}</td>
        <td><b>${s.student_id || ''}</b></td>
        <td>${s.name || ''}</td>
        <td>${s.division || 'COLLEGE'}</td>
        <td>${s.course || ''}</td>
        <td>${formatStudentYearDisplay(s)}</td>
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
              <th>Registered Date</th>
              <th>Student ID</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Program</th>
              <th>Year / Status</th>
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
    link.download = `BCMatik_Student_Roster_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredStudents.length} student records to Excel (.xls).`, 'success', 'Excel Downloaded');
  };

  const handleExportPDF = () => {
    setExportDropdownOpen(false);
    if (filteredStudents.length === 0) {
      showToast('No student records available to export.', 'warning');
      return;
    }
    const printWin = window.open('', '_blank', 'width=960,height=700');
    if (!printWin) {
      showToast('Please allow popups in your browser to generate PDF reports.', 'error');
      return;
    }

    const rowsHtml = filteredStudents.map((s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatStudentDate(s)}</td>
        <td><strong>${s.student_id || ''}</strong></td>
        <td>${s.name || ''}</td>
        <td>${s.division || 'COLLEGE'}</td>
        <td>${s.course || ''}</td>
        <td>${formatStudentYearDisplay(s)}</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <html>
        <head>
          <title>BCMatik Student & Alumni Roster Report</title>
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
              <h1>BICOL COLLEGE • STUDENT & ALUMNI ROSTER</h1>
              <p>Department Scope: ${divisionFilter === 'ALL' ? 'All Departments & Alumni' : divisionFilter} ${dateFilter ? `• Date: ${dateFilter}` : ''}</p>
            </div>
            <p>Generated: ${new Date().toLocaleString()} • Total Records: ${filteredStudents.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Registered</th>
                <th>Student ID</th>
                <th>Full Name</th>
                <th>Department</th>
                <th>Program</th>
                <th>Year / Status</th>
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

  const closeAddStudentModal = () => {
    const isDirty =
      manualData.first_name.trim() !== '' ||
      manualData.middle_name.trim() !== '' ||
      manualData.last_name.trim() !== '' ||
      manualData.student_id.trim() !== '' ||
      manualData.password.trim() !== '' ||
      manualData.confirmPassword.trim() !== '';
    if (!isDirty) {
      setIsAddModalOpen(false);
      setErrors({});
      return;
    }
    confirmAction({
      title: 'Discard Student Registration?',
      message: 'You have unsaved student details in this form. Are you sure you want to cancel?',
      confirmText: 'Discard',
      variant: 'danger',
      onConfirm: () => {
        setManualData({
          first_name: '',
          middle_name: '',
          last_name: '',
          student_id: '',
          password: '',
          confirmPassword: '',
          division: 'CCS',
          course: 'BSCS',
          year: '1'
        });
        setShowStudentPass(false);
        setShowStudentConfirmPass(false);
        setErrors({});
        setIsAddModalOpen(false);
      }
    });
  };

  const closeEditStudentModal = () => {
    if (!editingStudent) return;
    const orig = parseLegacyStudentName(editingStudent);
    const isDirty =
      editData.first_name.trim() !== orig.first ||
      editData.middle_name.trim() !== orig.middle ||
      editData.last_name.trim() !== orig.last ||
      editData.division !== (editingStudent.division || 'CCS') ||
      editData.course !== normalizeRosterCourse(editingStudent) ||
      String(editData.year) !== String(editingStudent.year || '1');

    if (!isDirty) {
      setEditingStudent(null);
      return;
    }
    confirmAction({
      title: 'Discard Unsaved Changes?',
      message: `Discard your unsaved edits to ${editingStudent.name}'s profile?`,
      confirmText: 'Discard Changes',
      variant: 'danger',
      onConfirm: () => setEditingStudent(null)
    });
  };

  const isAddExternal = manualData.division === 'EXTERNAL' || manualData.course === 'ALUMNI' || manualData.course === 'FACULTY';
  const isEditExternal = editData.division === 'EXTERNAL' || editData.course === 'ALUMNI' || editData.course === 'FACULTY';

  return (
    <div>
      <div className="quest-page-banner">
        <div>
          <h1>Student & Alumni Roster Management</h1>
          <p>
            Maintain the official database of Undergraduate Departments, School of Law, Graduate School, and Alumni clients.
          </p>
        </div>
        
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="quest-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '280px' }}>
              <Search size={17} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '13px', top: '11px' }} />
              <input 
                type="text" 
                className="quest-input" 
                placeholder="Search ID, Name, or Program..." 
                style={{ paddingLeft: '38px' }}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <select 
              className="quest-input" 
              style={{ width: '215px' }} 
              value={divisionFilter} 
              onChange={e => {
                setDivisionFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Departments & Alumni</option>
              {ACADEMIC_DIVISIONS.map(div => (
                <option key={div.id} value={div.id}>{div.label}</option>
              ))}
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
                title="Filter by Registration Date"
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
              title="Print Roster"
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
              onClick={() => {
                setErrors({});
                setIsAddModalOpen(true);
              }} 
              className="quest-btn quest-btn-primary"
              style={{ padding: '9px 16px', borderRadius: '10px' }}
            >
              <Plus size={16} /> Add Manually
            </button>
          </div>
        </div>

        <div className="quest-table-container">
          <table className="quest-table">
            <thead>
              <tr>
                <th>Registered</th>
                <th>Student / Alumni ID</th>
                <th>Full Name</th>
                <th>Department / Group</th>
                <th>Program / Course</th>
                <th>Year</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={5} cols={7} />
              ) : paginatedStudents.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--quest-text-secondary)' }}>No records found.</td></tr>
              ) : (
                paginatedStudents.map(student => (
                  <tr key={student.id}>
                    <td style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                      {formatStudentDate(student)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--quest-primary)' }}>{student.student_id}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {student.photo_url ? (
                          <img
                            src={student.photo_url}
                            alt={student.name}
                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--quest-primary)', flexShrink: 0 }}
                          />
                        ) : null}
                        <span style={{ fontWeight: 700, color: 'var(--quest-text-primary)' }}>{student.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`quest-badge ${
                        student.division === 'LAW' ? 'badge-primary' :
                        student.division === 'GRADUATE' ? 'badge-warning' : 'badge-info'
                      }`}>
                        {student.division || 'COLLEGE'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{student.course}</td>
                    <td style={{ color: student.division === 'EXTERNAL' || student.course === 'ALUMNI' ? '#64748B' : 'inherit', fontWeight: 600 }}>
                      {formatStudentYearDisplay(student)}
                    </td>
                    <td>
                      <div className="quest-action-group">
                        <button
                          onClick={() => setViewingStudent(student)}
                          className="quest-icon-btn view"
                          title="View Profile"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEditModal(student)}
                          className="quest-icon-btn edit"
                          title="Edit Profile"
                        >
                          <Edit3 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          totalItems={filteredStudents.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* 1. REGISTER NEW STUDENT / ALUMNI POPUP MODAL */}
      {isAddModalOpen && (
        <div className="quest-modal-backdrop" onClick={closeAddStudentModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontFamily: 'var(--font-heading)' }}>Register Student / Alumni</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Letters only (auto-capitalized, max 50 characters per name field).</p>
              </div>
              <button onClick={closeAddStudentModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    First Name <span className="quest-req-star">*</span>
                  </label>
                  <input 
                    type="text" 
                    maxLength={50}
                    className={`quest-input ${errors.first_name ? 'input-error' : ''}`} 
                    value={manualData.first_name} 
                    onBlur={() => handleBlur('first_name', manualData.first_name, 'First Name')}
                    onChange={e => {
                      setManualData({...manualData, first_name: sanitizeNameInput(e.target.value)});
                      if (errors.first_name) setErrors({...errors, first_name: ''});
                    }} 
                    placeholder="e.g. JUAN" 
                  />
                  {errors.first_name && <span className="quest-error-text">{errors.first_name}</span>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    Last Name <span className="quest-req-star">*</span>
                  </label>
                  <input 
                    type="text" 
                    maxLength={50}
                    className={`quest-input ${errors.last_name ? 'input-error' : ''}`} 
                    value={manualData.last_name} 
                    onBlur={() => handleBlur('last_name', manualData.last_name, 'Last Name')}
                    onChange={e => {
                      setManualData({...manualData, last_name: sanitizeNameInput(e.target.value)});
                      if (errors.last_name) setErrors({...errors, last_name: ''});
                    }} 
                    placeholder="e.g. DELA CRUZ" 
                  />
                  {errors.last_name && <span className="quest-error-text">{errors.last_name}</span>}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Middle Name <span style={{ color: '#94A3B8', fontWeight: 500 }}>(Optional)</span>
                </label>
                <input 
                  type="text" 
                  maxLength={50}
                  className="quest-input" 
                  value={manualData.middle_name} 
                  onChange={e => setManualData({...manualData, middle_name: sanitizeNameInput(e.target.value)})} 
                  placeholder="e.g. REYES" 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Student / Alumni ID Number <span className="quest-req-star">*</span>
                </label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  maxLength={15}
                  className={`quest-input ${errors.student_id ? 'input-error' : ''}`} 
                  value={manualData.student_id} 
                  onBlur={() => handleBlur('student_id', manualData.student_id, 'Student / Alumni ID Number')}
                  onChange={e => {
                    const digitsOnly = e.target.value.replace(/[^0-9]/g, '').slice(0, 15);
                    setManualData({...manualData, student_id: digitsOnly});
                    if (errors.student_id) setErrors({...errors, student_id: ''});
                  }} 
                  placeholder="e.g. 202401012 (Numbers Only)" 
                />
                {errors.student_id && <span className="quest-error-text">{errors.student_id}</span>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Initial Password <span className="quest-req-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                  <input 
                    type={showStudentPass ? 'text' : 'password'} 
                    className={`quest-input ${errors.password ? 'input-error' : ''}`} 
                    style={{ paddingLeft: '40px', paddingRight: '68px' }} 
                    placeholder="Minimum 6 characters" 
                    value={manualData.password} 
                    onBlur={() => handleBlur('password', manualData.password, 'Initial Password')}
                    onChange={e => {
                      setManualData({...manualData, password: e.target.value});
                      if (errors.password) setErrors({...errors, password: ''});
                    }} 
                  />
                  <button
                    type="button"
                    style={showHideBtnStyle}
                    onClick={() => setShowStudentPass(!showStudentPass)}
                  >
                    {showStudentPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {errors.password && <span className="quest-error-text">{errors.password}</span>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Confirm Password <span className="quest-req-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '12px' }} />
                  <input 
                    type={showStudentConfirmPass ? 'text' : 'password'} 
                    className={`quest-input ${errors.confirmPassword ? 'input-error' : ''}`} 
                    style={{ paddingLeft: '40px', paddingRight: '68px' }} 
                    placeholder="Re-enter initial password" 
                    value={manualData.confirmPassword} 
                    onBlur={() => {
                      if (!manualData.confirmPassword.trim()) {
                        setErrors(prev => ({ ...prev, confirmPassword: 'Confirm Password is required' }));
                      } else if (manualData.password.trim() && manualData.confirmPassword.trim() !== manualData.password.trim()) {
                        setErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
                      }
                    }}
                    onChange={e => {
                      setManualData({...manualData, confirmPassword: e.target.value});
                      if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''});
                    }} 
                  />
                  <button
                    type="button"
                    style={showHideBtnStyle}
                    onClick={() => setShowStudentConfirmPass(!showStudentConfirmPass)}
                  >
                    {showStudentConfirmPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {errors.confirmPassword && <span className="quest-error-text">{errors.confirmPassword}</span>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Department / Group <span className="quest-req-star">*</span>
                </label>
                <select 
                  className="quest-input" 
                  value={manualData.division} 
                  onChange={e => handleDivisionChange(e.target.value)}
                >
                  {ACADEMIC_DIVISIONS.map(div => (
                    <option key={div.id} value={div.id}>{div.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isAddExternal ? '1fr' : '1.6fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    Program / Course <span className="quest-req-star">*</span>
                  </label>
                  <select 
                    className="quest-input" 
                    value={manualData.course} 
                    onChange={e => setManualData({...manualData, course: e.target.value})}
                  >
                    {(ROSTER_PROGRAMS[manualData.division] || []).map(prog => (
                      <option key={prog.code} value={prog.code}>{prog.code} — {prog.name}</option>
                    ))}
                  </select>
                </div>

                {!isAddExternal && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                      Year Level <span className="quest-req-star">*</span>
                    </label>
                    <select 
                      className="quest-input" 
                      value={manualData.year} 
                      onChange={e => setManualData({...manualData, year: e.target.value})}
                    >
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                      <option value="5">5th Year</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="quest-modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" onClick={closeAddStudentModal} className="quest-btn quest-btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="quest-btn quest-btn-primary">
                  {isSubmitting ? 'Saving...' : 'Save Student Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. VIEW STUDENT DETAILS MODAL (With Uploaded Client Picture & Email Status!) */}
      {viewingStudent && (
        <div className="quest-modal-backdrop" onClick={() => setViewingStudent(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {viewingStudent.photo_url ? (
                  <img
                    src={viewingStudent.photo_url}
                    alt={viewingStudent.name}
                    style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2.5px solid var(--quest-primary)' }}
                  />
                ) : (
                  <div className="quest-modal-icon-badge primary" style={{ width: '60px', height: '60px', borderRadius: '50%' }}>
                    <Users size={26} />
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#1E293B' }}>{viewingStudent.name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>ID: {viewingStudent.student_id}</p>
                </div>
              </div>
              <button onClick={() => setViewingStudent(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div className="quest-detail-box">
              <div className="quest-detail-row">
                <span className="quest-detail-label">Registered Date</span>
                <span className="quest-detail-value">{formatStudentDate(viewingStudent)}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Full Name</span>
                <span className="quest-detail-value">{viewingStudent.name}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Student / Alumni ID</span>
                <span className="quest-detail-value" style={{ color: 'var(--quest-primary)' }}>{viewingStudent.student_id}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Department / Group</span>
                <span className="quest-badge badge-info">{viewingStudent.division || 'COLLEGE'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Program / Course</span>
                <span className="quest-detail-value">{viewingStudent.course}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Year / Status</span>
                <span className="quest-detail-value">{formatStudentYearDisplay(viewingStudent)}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Email Notifications</span>
                <span className="quest-detail-value">
                  {viewingStudent.email
                    ? `${viewingStudent.email} (${viewingStudent.email_notifications_enabled ? 'ON' : 'OFF'})`
                    : 'Not Configured'}
                </span>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setViewingStudent(null)} className="quest-btn quest-btn-outline">Close</button>
              <button 
                onClick={() => {
                  const target = viewingStudent;
                  setViewingStudent(null);
                  openEditModal(target);
                }} 
                className="quest-btn quest-btn-primary"
              >
                <Edit3 size={15} /> Edit Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. EDIT STUDENT MODAL */}
      {editingStudent && (
        <div className="quest-modal-backdrop" onClick={closeEditStudentModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B' }}>Edit Student Record</h3>
              <button onClick={closeEditStudentModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateStudent} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    First Name <span className="quest-req-star">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    className={`quest-input ${editErrors.first_name ? 'input-error' : ''}`}
                    value={editData.first_name}
                    onChange={(e) => {
                      setEditData({ ...editData, first_name: sanitizeNameInput(e.target.value) });
                      if (editErrors.first_name) setEditErrors({ ...editErrors, first_name: '' });
                    }}
                  />
                  {editErrors.first_name && <span className="quest-error-text">{editErrors.first_name}</span>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    Last Name <span className="quest-req-star">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={50}
                    className={`quest-input ${editErrors.last_name ? 'input-error' : ''}`}
                    value={editData.last_name}
                    onChange={(e) => {
                      setEditData({ ...editData, last_name: sanitizeNameInput(e.target.value) });
                      if (editErrors.last_name) setEditErrors({ ...editErrors, last_name: '' });
                    }}
                  />
                  {editErrors.last_name && <span className="quest-error-text">{editErrors.last_name}</span>}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Middle Name <span style={{ color: '#94A3B8', fontWeight: 500 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  className="quest-input"
                  value={editData.middle_name}
                  onChange={(e) => setEditData({ ...editData, middle_name: sanitizeNameInput(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Student ID Number (Read-Only)
                </label>
                <input type="text" className="quest-input" value={editingStudent.student_id} readOnly style={{ backgroundColor: '#F1F5F9', color: '#64748B' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                  Department / Group <span className="quest-req-star">*</span>
                </label>
                <select className="quest-input" value={editData.division} onChange={(e) => handleEditDivisionChange(e.target.value)}>
                  {ACADEMIC_DIVISIONS.map(div => (
                    <option key={div.id} value={div.id}>{div.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isEditExternal ? '1fr' : '1.6fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                    Program / Course <span className="quest-req-star">*</span>
                  </label>
                  <select className="quest-input" value={editData.course} onChange={(e) => setEditData({ ...editData, course: e.target.value })}>
                    {(ROSTER_PROGRAMS[editData.division] || []).map(prog => (
                      <option key={prog.code} value={prog.code}>{prog.code} — {prog.name}</option>
                    ))}
                  </select>
                </div>

                {!isEditExternal && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--quest-text-secondary)', marginBottom: '6px' }}>
                      Year Level <span className="quest-req-star">*</span>
                    </label>
                    <select className="quest-input" value={editData.year} onChange={(e) => setEditData({ ...editData, year: e.target.value })}>
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                      <option value="5">5th Year</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="quest-modal-actions" style={{ marginTop: '8px' }}>
                <button type="button" onClick={closeEditStudentModal} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isUpdating} className="quest-btn quest-btn-primary">
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}