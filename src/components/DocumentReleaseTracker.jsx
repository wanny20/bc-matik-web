import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, updateDoc, deleteDoc, doc, addDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { 
  FileCheck2, BellRing, Clock, AlertTriangle, CheckCircle, Search, Sparkles, Eye, Trash2, X, Calendar,
  Download, ChevronDown, RotateCcw, FileText, FileSpreadsheet, Printer, ArrowUpDown
} from 'lucide-react';
import { useUI } from './UIContext';
import { SkeletonTableRows } from './Skeleton';
import TablePagination from './TablePagination';
import './DocumentReleaseTracker.css';

const CLAIM_VALIDITY_DAYS = 7;
const EXPIRY_WARNING_HOURS = 48;

export default function DocumentReleaseTracker({ role, assignedOffice, setAdminSection }) {
  const { showToast, confirmAction } = useUI();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter, Sort & Export Dropdown States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Pagination States (Declared INSIDE DocumentReleaseTracker!)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [viewingDoc, setViewingDoc] = useState(null);

  // Set / Edit Target Release Date Modal State
  const [schedulingDoc, setSchedulingDoc] = useState(null);
  const [releaseDateInput, setReleaseDateInput] = useState('');
  const [isSavingDate, setIsSavingDate] = useState(false);

  const getDocDateObj = (ticket) => {
    const raw = ticket.timestamps?.target_release_at || ticket.timestamps?.recalled_at || ticket.timestamps?.booked_at || ticket.created_at;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDocDate = (ticket) => {
    const d = getDocDateObj(ticket);
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const formatDocYMD = (ticket) => {
    const d = getDocDateObj(ticket);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const computeHoursRemaining = (ticket) => {
    if (ticket.status !== 'ready_for_pickup') return null;
    const now = Date.now();
    let expiryMs = ticket.timestamps?.expires_at?.toMillis?.() || 
                   (ticket.timestamps?.expires_at ? new Date(ticket.timestamps.expires_at).getTime() : null);

    if (!expiryMs) {
      const recalledMs = ticket.timestamps?.recalled_at?.toMillis?.() || 
                         (ticket.timestamps?.recalled_at ? new Date(ticket.timestamps.recalled_at).getTime() : now);
      expiryMs = recalledMs + CLAIM_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
    }
    return Math.round((expiryMs - now) / (1000 * 60 * 60));
  };

  const formatTargetReleaseDate = (ticket) => {
    const raw = ticket.timestamps?.target_release_at;
    if (!raw) return 'Not Scheduled';
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isReleaseDateDue = (ticket) => {
    if (ticket.status !== 'processing') return false;
    const raw = ticket.timestamps?.target_release_at;
    if (!raw) return false;
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return d.getTime() <= Date.now();
  };

  const fetchAndRunExpiryAutomation = useCallback(async () => {
    setLoading(true);
    try {
      const ticketsRef = collection(db, 'tickets');
      const q = query(ticketsRef, where('status', 'in', ['processing', 'ready_for_pickup']));
      const snap = await getDocs(q);

      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (role === 'mini_admin' && assignedOffice) {
        list = list.filter(t => t.target_office_id === assignedOffice);
      }

      const batch = writeBatch(db);
      let autoNotifiedCount = 0;

      for (const item of list) {
        const hrsLeft = computeHoursRemaining(item);
        const isRegisteredStudent = item.student_id && item.student_id !== 'N/A' && item.user_id !== 'walk_in_guest';

        if (
          item.status === 'ready_for_pickup' &&
          hrsLeft !== null &&
          hrsLeft <= EXPIRY_WARNING_HOURS &&
          !item.expiry_warning_sent &&
          isRegisteredStudent
        ) {
          const ticketRef = doc(db, 'tickets', item.id);
          batch.update(ticketRef, {
            near_expiry: true,
            expiry_warning_sent: true,
            'timestamps.expiry_notified_at': new Date()
          });

          const notifRef = doc(collection(db, 'student_notifications'));
          batch.set(notifRef, {
            student_id: item.student_id,
            student_name: item.student_name || 'Student',
            ticket_id: item.id,
            queue_number: item.queue_number,
            office: item.target_office_id,
            type: 'DOCUMENT_NEAR_EXPIRY',
            title: `Urgent: Document Claim Expiring (${item.target_office_id})`,
            message: `Your requested document (${item.transaction_purpose}) under Ticket ${item.queue_number} will expire in ${Math.max(0, hrsLeft)} hours. Please claim it at ${item.target_office_id}.`,
            created_at: new Date(),
            is_read: false
          });

          item.near_expiry = true;
          item.expiry_warning_sent = true;
          autoNotifiedCount++;
        }
      }

      if (autoNotifiedCount > 0) {
        await batch.commit();
        showToast(
          `Auto-dispatched ${autoNotifiedCount} near-expiry alert(s) to registered students.`,
          'warning',
          'Automated Expiry Engine'
        );
      }

      setDocuments(list);
    } catch (error) {
      console.error('Error loading documents:', error);
      showToast('Failed to load document processing queue.', 'error');
    }
    setLoading(false);
  }, [role, assignedOffice, showToast]);

  useEffect(() => {
    fetchAndRunExpiryAutomation();
  }, [fetchAndRunExpiryAutomation]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setDateFilter('');
    setSortOrder('desc');
    setCurrentPage(1);
    showToast('All search, status, and date filters have been reset.', 'success', 'Filters Cleared');
  };

  const openScheduleModal = (ticket) => {
    setSchedulingDoc(ticket);
    const raw = ticket.timestamps?.target_release_at;
    const defaultDate = raw
      ? (raw.toDate ? raw.toDate() : new Date(raw))
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    setReleaseDateInput(defaultDate.toISOString().slice(0, 10));
  };

  const handleSaveReleaseDate = async (e) => {
    e.preventDefault();
    if (!schedulingDoc || !releaseDateInput) return;
    setIsSavingDate(true);
    try {
      const targetDate = new Date(`${releaseDateInput}T09:00:00`);
      const formattedDate = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      await updateDoc(doc(db, 'tickets', schedulingDoc.id), {
        'timestamps.target_release_at': targetDate
      });

      await addDoc(collection(db, 'student_notifications'), {
        student_id: schedulingDoc.student_id || 'GUEST',
        student_name: schedulingDoc.student_name || 'Student',
        ticket_id: schedulingDoc.id,
        queue_number: schedulingDoc.queue_number,
        office: schedulingDoc.target_office_id,
        type: 'PROCESSING_SCHEDULED',
        title: `Estimated Release Date Set (${schedulingDoc.target_office_id})`,
        message: `Your ${schedulingDoc.transaction_purpose} (Ticket ${schedulingDoc.queue_number}) is now in processing at ${schedulingDoc.target_office_id}. Target release date: ${formattedDate}.`,
        created_at: new Date(),
        is_read: false
      });

      showToast(`Scheduled target release date for ${schedulingDoc.queue_number} on ${formattedDate} & notified student!`, 'success', 'Release Date Scheduled');
      setSchedulingDoc(null);
      fetchAndRunExpiryAutomation();
    } catch (e) {
      showToast('Failed to save target release date.', 'error');
    }
    setIsSavingDate(false);
  };

  const handleNotifyReady = async (ticket) => {
    const recalledAt = new Date();
    const expiresAt = new Date(recalledAt.getTime() + CLAIM_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    try {
      await updateDoc(doc(db, 'tickets', ticket.id), {
        status: 'ready_for_pickup',
        near_expiry: false,
        expiry_warning_sent: false,
        'timestamps.recalled_at': recalledAt,
        'timestamps.expires_at': expiresAt
      });

      await addDoc(collection(db, 'student_notifications'), {
        student_id: ticket.student_id || 'GUEST',
        student_name: ticket.student_name || 'Walk-in Guest',
        ticket_id: ticket.id,
        queue_number: ticket.queue_number,
        office: ticket.target_office_id,
        type: 'DOCUMENT_READY',
        title: `Document Ready for Pickup (${ticket.target_office_id})`,
        message: `Good news! Your ${ticket.transaction_purpose} (Ticket ${ticket.queue_number}) is ready for release at ${ticket.target_office_id}. Valid for ${CLAIM_VALIDITY_DAYS} days.`,
        created_at: new Date(),
        is_read: false
      });

      showToast(
        `Notified ${ticket.student_name || 'Student'} (${ticket.queue_number}) that their document is ready for release!`,
        'success',
        'Release Notification Sent'
      );
      fetchAndRunExpiryAutomation();
    } catch (e) {
      showToast('Failed to send release notification.', 'error');
    }
  };

  const handleSendReminder = async (ticket) => {
    const hrs = computeHoursRemaining(ticket);
    try {
      await addDoc(collection(db, 'student_notifications'), {
        student_id: ticket.student_id || 'GUEST',
        student_name: ticket.student_name || 'Walk-in Guest',
        ticket_id: ticket.id,
        queue_number: ticket.queue_number,
        office: ticket.target_office_id,
        type: 'DOCUMENT_REMINDER',
        title: `Reminder: Unclaimed Document at ${ticket.target_office_id}`,
        message: `Please claim your ${ticket.transaction_purpose} (Ticket ${ticket.queue_number}) at ${ticket.target_office_id}. ${hrs !== null ? `Remaining claim window: ${Math.max(0, hrs)} hours.` : ''}`,
        created_at: new Date(),
        is_read: false
      });
      showToast(`Sent claim reminder to ${ticket.student_name || ticket.queue_number}.`, 'success', 'Reminder Sent');
    } catch (e) {
      showToast('Failed to send reminder.', 'error');
    }
  };

  const handleMarkClaimed = (ticket) => {
    confirmAction({
      title: `Confirm Document Release (${ticket.queue_number})`,
      message: `Has ${ticket.student_name || 'the student'} officially claimed their "${ticket.transaction_purpose}" document?`,
      confirmText: 'Mark as Claimed',
      variant: 'primary',
      onConfirm: async () => {
        await updateDoc(doc(db, 'tickets', ticket.id), {
          status: 'completed',
          'timestamps.completed_at': new Date()
        });
        showToast(`Document ${ticket.queue_number} marked as claimed and completed.`, 'success', 'Released');
        fetchAndRunExpiryAutomation();
      }
    });
  };

  const handleDeleteDocRecord = (ticket) => {
    confirmAction({
      title: `Delete Document Request (${ticket.queue_number})?`,
      message: `Are you sure you want to permanently remove Ticket ${ticket.queue_number} (${ticket.student_name || 'Guest'}) from the release tracker?`,
      confirmText: 'Delete Record',
      variant: 'danger',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'tickets', ticket.id));
        showToast(`Removed ${ticket.queue_number} from document tracker.`, 'success', 'Record Deleted');
        fetchAndRunExpiryAutomation();
      }
    });
  };

  const filteredDocs = documents
    .filter(d => {
      const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
      const matchesDate = !dateFilter || formatDocYMD(d) === dateFilter;
      const matchesSearch = 
        (d.queue_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.student_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.transaction_purpose || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesDate && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = getDocDateObj(a)?.getTime() || 0;
      const timeB = getDocDateObj(b)?.getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  // STEP 3: Slice filtered documents for the current page
  const paginatedDocs = filteredDocs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleExportCSV = () => {
    setExportDropdownOpen(false);
    if (filteredDocs.length === 0) {
      showToast('No document records available to export.', 'warning');
      return;
    }
    const headers = ['Date,Ticket Number,Student Name,Student ID,Releasing Office,Document / Purpose,Status,Target Release Date'];
    const rows = filteredDocs.map(d => 
      `"${formatDocDate(d)}","${d.queue_number || ''}","${d.student_name || 'Walk-in Guest'}","${d.student_id || 'GUEST'}","${d.target_office_id || ''}","${d.transaction_purpose || 'Document Request'}","${(d.status || '').toUpperCase()}","${formatTargetReleaseDate(d)}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `BC_Matik_Document_Releases_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredDocs.length} document records to CSV.`, 'success', 'CSV Downloaded');
  };

  const handleExportExcel = () => {
    setExportDropdownOpen(false);
    if (filteredDocs.length === 0) {
      showToast('No document records available to export.', 'warning');
      return;
    }
    const tableRows = filteredDocs.map((d, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatDocDate(d)}</td>
        <td><b>${d.queue_number || ''}</b></td>
        <td>${d.student_name || 'Walk-in Guest'}</td>
        <td>${d.student_id || 'GUEST'}</td>
        <td>${d.target_office_id || ''}</td>
        <td>${d.transaction_purpose || 'Document Request'}</td>
        <td>${(d.status || '').toUpperCase()}</td>
        <td>${formatTargetReleaseDate(d)}</td>
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
              <th>Date</th>
              <th>Ticket No.</th>
              <th>Student / Guest</th>
              <th>Student ID</th>
              <th>Releasing Office</th>
              <th>Document / Transaction</th>
              <th>Status</th>
              <th>Target Release Date</th>
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
    link.download = `BC_Matik_Document_Releases_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredDocs.length} document records to Excel (.xls).`, 'success', 'Excel Downloaded');
  };

  const handleExportPDF = () => {
    setExportDropdownOpen(false);
    if (filteredDocs.length === 0) {
      showToast('No document records available to export.', 'warning');
      return;
    }
    const printWin = window.open('', '_blank', 'width=960,height=700');
    if (!printWin) {
      showToast('Please allow popups in your browser to generate PDF reports.', 'error');
      return;
    }

    const rowsHtml = filteredDocs.map((d, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatDocDate(d)}</td>
        <td><strong>${d.queue_number || ''}</strong></td>
        <td>${d.student_name || 'Walk-in Guest'}</td>
        <td>${d.student_id || 'GUEST'}</td>
        <td>${d.target_office_id || ''}</td>
        <td>${d.transaction_purpose || 'Document Request'}</td>
        <td>${(d.status || '').toUpperCase()}</td>
        <td>${formatTargetReleaseDate(d)}</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <html>
        <head>
          <title>BC-Matik Document Release Report</title>
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
              <h1>BICOL COLLEGE • DOCUMENT PROCESSING & RELEASE REPORT</h1>
              <p>Scope: ${role === 'mini_admin' ? assignedOffice : 'All Campus Offices'} ${dateFilter ? `• Date: ${dateFilter}` : ''}</p>
            </div>
            <p>Generated: ${new Date().toLocaleString()} • Total Documents: ${filteredDocs.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Ticket No.</th>
                <th>Student / Guest</th>
                <th>Student ID</th>
                <th>Office</th>
                <th>Document / Transaction</th>
                <th>Status</th>
                <th>Target Release</th>
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

  const processingCount = documents.filter(d => d.status === 'processing').length;
  const readyCount = documents.filter(d => d.status === 'ready_for_pickup').length;
  const nearExpiryCount = documents.filter(d => {
    const hrs = computeHoursRemaining(d);
    return (d.status === 'ready_for_pickup' && hrs !== null && hrs <= EXPIRY_WARNING_HOURS) || isReleaseDateDue(d);
  }).length;

  return (
    <div>
      <div className="quest-page-banner">
        <div>
          <h1>
            Document Processing & Release Tracker {role === 'mini_admin' ? `(${assignedOffice})` : ''}
          </h1>
          <p>
            Schedule target release dates, notify students when documents are ready, and automate 48-hour expiry alerts.
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="doc-tracker-stats">
        <div className="doc-stat-card">
          <div className="doc-stat-icon" style={{ backgroundColor: '#FCEAE9', color: '#9E0B03' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--quest-text-secondary)', textTransform: 'uppercase' }}>In Processing</div>
            <div className="outfit-number" style={{ fontSize: '28px', fontWeight: 800 }}>{processingCount}</div>
          </div>
        </div>

        <div className="doc-stat-card">
          <div className="doc-stat-icon" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
            <FileCheck2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--quest-text-secondary)', textTransform: 'uppercase' }}>Ready for Pickup</div>
            <div className="outfit-number" style={{ fontSize: '28px', fontWeight: 800 }}>{readyCount}</div>
          </div>
        </div>

        <div className="doc-stat-card">
          <div className="doc-stat-icon" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--quest-text-secondary)', textTransform: 'uppercase' }}>Due Today / Near Expiry</div>
            <div className="outfit-number" style={{ fontSize: '28px', fontWeight: 800 }}>{nearExpiryCount}</div>
          </div>
        </div>
      </div>

      <div className="quest-card">
        <div className="doc-controls-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '290px' }}>
              <Search size={17} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '13px', top: '11px' }} />
              <input 
                type="text" 
                className="quest-input" 
                style={{ paddingLeft: '38px' }}
                placeholder="Search ticket, ID, name, or doc..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <select
              className="quest-input"
              style={{ width: '190px' }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Document States</option>
              <option value="processing">In Processing</option>
              <option value="ready_for_pickup">Ready for Pickup</option>
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
                title="Filter by Date"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#15803D', backgroundColor: '#DCFCE7', padding: '7px 12px', borderRadius: '999px', fontWeight: 700 }}>
              <Sparkles size={14} /> Auto-Expiry Active
            </div>

            <button
              type="button"
              onClick={handleExportPDF}
              className="quest-btn quest-btn-outline"
              style={{ padding: '9px 12px', borderRadius: '10px' }}
              title="Print Document Tracker"
            >
              <Printer size={17} color="var(--quest-primary)" />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="quest-btn quest-btn-primary"
                style={{
                  padding: '9px 15px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              >
                <Download size={15} /> Export <ChevronDown size={14} />
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
          </div>
        </div>

        <div className="quest-table-container">
          <table className="quest-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticket No.</th>
                <th>Student / Guest</th>
                <th>Releasing Office</th>
                <th>Document / Transaction</th>
                <th>Status</th>
                <th>Target Release / Claim Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={5} cols={8} />
              ) : paginatedDocs.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--quest-text-secondary)' }}>
                    No documents currently matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedDocs.map(docItem => {
                  const hrsLeft = computeHoursRemaining(docItem);
                  const isNearExpiry = hrsLeft !== null && hrsLeft <= EXPIRY_WARNING_HOURS && hrsLeft > 0;
                  const isExpired = hrsLeft !== null && hrsLeft <= 0;
                  const dueForRelease = isReleaseDateDue(docItem);

                  return (
                    <tr key={docItem.id}>
                      <td style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                        {formatDocDate(docItem)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, color: 'var(--quest-primary)' }}>
                        {docItem.queue_number}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--quest-text-primary)' }}>
                          {docItem.student_name || 'Walk-in Guest'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--quest-text-secondary)' }}>
                          {docItem.student_id && docItem.student_id !== 'N/A' ? `ID: ${docItem.student_id}` : 'Guest / Unregistered'}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--quest-primary)' }}>{docItem.target_office_id}</td>
                      <td>{docItem.transaction_purpose || 'Document Request'}</td>
                      <td>
                        <span className={`quest-badge ${docItem.status === 'ready_for_pickup' ? 'badge-success' : dueForRelease ? 'badge-danger' : 'badge-warning'}`}>
                          {docItem.status === 'ready_for_pickup' ? 'READY FOR PICKUP' : dueForRelease ? 'DUE FOR RELEASE TODAY' : 'PROCESSING'}
                        </span>
                      </td>
                      <td>
                        {docItem.status === 'processing' ? (
                          <button
                            onClick={() => openScheduleModal(docItem)}
                            className="quest-btn quest-btn-outline"
                            style={{ padding: '5px 10px', fontSize: '11.5px', borderColor: dueForRelease ? '#DC2626' : '#CBD5E1', color: dueForRelease ? '#DC2626' : '#0F172A' }}
                            title="Click to set or update Target Release Date"
                          >
                            <Calendar size={13} /> Target: {formatTargetReleaseDate(docItem)}
                          </button>
                        ) : (
                          <span className={`doc-expiry-pill ${isExpired ? 'expired' : isNearExpiry ? 'urgent' : 'safe'}`}>
                            <Clock size={13} />
                            {isExpired 
                              ? 'EXPIRED (Unclaimed)' 
                              : isNearExpiry 
                                ? `${hrsLeft}h left (Auto-Notified)` 
                                : `${Math.ceil(hrsLeft / 24)} days left`}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="quest-action-group">
                          {docItem.status === 'processing' ? (
                            <>
                              <button 
                                onClick={() => openScheduleModal(docItem)} 
                                className="quest-btn quest-btn-outline" 
                                style={{ padding: '6px 10px', fontSize: '11.5px' }}
                                title="Set Target Release Date"
                              >
                                <Calendar size={13} /> Set Date
                              </button>
                              <button 
                                onClick={() => handleNotifyReady(docItem)} 
                                className="quest-btn quest-btn-primary" 
                                style={{ padding: '6px 10px', fontSize: '11.5px' }}
                              >
                                <BellRing size={13} /> Notify Ready
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleSendReminder(docItem)} 
                                className="quest-btn quest-btn-outline" 
                                style={{ padding: '6px 10px', fontSize: '11.5px' }}
                                title="Send Manual Claim Reminder"
                              >
                                <BellRing size={13} /> Ping
                              </button>
                              <button 
                                onClick={() => handleMarkClaimed(docItem)} 
                                className="quest-btn quest-btn-success" 
                                style={{ padding: '6px 10px', fontSize: '11.5px' }}
                              >
                                <CheckCircle size={13} /> Claimed
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setViewingDoc(docItem)}
                            className="quest-icon-btn view"
                            title="View Document Details"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteDocRecord(docItem)}
                            className="quest-icon-btn delete"
                            title="Delete Document Record"
                          >
                            <Trash2 size={15} />
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

        {/* STEP 4: Render Pagination Footer */}
        <TablePagination
          totalItems={filteredDocs.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* 1. SCHEDULE TARGET RELEASE DATE MODAL */}
      {schedulingDoc && (
        <div className="quest-modal-backdrop" onClick={() => setSchedulingDoc(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '19px', color: '#0F172A' }}>Set Target Release Date</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Ticket {schedulingDoc.queue_number} • {schedulingDoc.student_name || 'Student'}
                </p>
              </div>
              <button onClick={() => setSchedulingDoc(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveReleaseDate}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Estimated Release Date <span className="quest-req-star">*</span>
                </label>
                <input
                  type="date"
                  className="quest-input"
                  value={releaseDateInput}
                  onChange={(e) => setReleaseDateInput(e.target.value)}
                  required
                />
                <p style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px' }}>
                  Saving this date automatically sends an in-app notification to the student and alerts {schedulingDoc.target_office_id} on release day.
                </p>
              </div>

              <div className="quest-modal-actions">
                <button type="button" onClick={() => setSchedulingDoc(null)} className="quest-btn quest-btn-outline">Cancel</button>
                <button type="submit" disabled={isSavingDate} className="quest-btn quest-btn-primary">
                  {isSavingDate ? 'Saving...' : 'Save & Notify Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. VIEW DOCUMENT DETAILS MODAL */}
      {viewingDoc && (
        <div className="quest-modal-backdrop" onClick={() => setViewingDoc(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B' }}>Ticket {viewingDoc.queue_number}</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Document Processing & Release Record</p>
              </div>
              <button onClick={() => setViewingDoc(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div className="quest-detail-box">
              <div className="quest-detail-row">
                <span className="quest-detail-label">Queue Number</span>
                <span className="quest-detail-value" style={{ color: 'var(--quest-primary)' }}>{viewingDoc.queue_number}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Client Full Name</span>
                <span className="quest-detail-value">{viewingDoc.student_name || 'Walk-in Guest'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Student / Client ID</span>
                <span className="quest-detail-value">{viewingDoc.student_id || 'GUEST'}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Releasing Office</span>
                <span className="quest-detail-value">{viewingDoc.target_office_id}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Document / Purpose</span>
                <span className="quest-detail-value">{viewingDoc.transaction_purpose}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Target Release Date</span>
                <span className="quest-detail-value">{formatTargetReleaseDate(viewingDoc)}</span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Current Status</span>
                <span className={`quest-badge ${viewingDoc.status === 'ready_for_pickup' ? 'badge-success' : 'badge-warning'}`}>
                  {viewingDoc.status?.toUpperCase().replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setViewingDoc(null)} className="quest-btn quest-btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}