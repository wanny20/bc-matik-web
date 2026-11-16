import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, updateDoc, doc, getDoc, onSnapshot, addDoc, deleteField } from 'firebase/firestore';
import { db, auth, sendAutomatedClientEmail } from '../firebaseConfig';
import { 
  Play, PauseCircle, XCircle, CheckCircle, Clock, BellRing, User, Volume2, 
  PlusCircle, KeyRound, QrCode, RefreshCw, RotateCcw, Maximize2, X, ListFilter, Lock 
} from 'lucide-react';
import { useUI } from './UIContext';
import './StaffDashboard.css';

const CLAIM_VALIDITY_DAYS = 7;

// Unified label for all general / walk-in inquiries so the checklist stays clean
const GENERAL_INQUIRY_LABEL = "General / Walk-In Inquiry";
const GENERAL_FALLBACK_PURPOSES = [
  "general / walk-in inquiry",
  "general inquiry / transaction",
  "walk-in request",
  "walk-in inquiry / transaction",
  "general transaction"
];

// Window lock expires automatically if a browser crashes and sends no heartbeat for 2 minutes
const WINDOW_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

// Strips priority suffix tags like "[Senior Citizen (OSCA ID)]" when matching transaction purpose
const normalizePurposeBase = (rawPurpose = '') => {
  return String(rawPurpose || '')
    .replace(/\s*\[.*?\]\s*$/, '')
    .trim();
};

const isGeneralOrWalkInPurpose = (rawPurpose = '', assignedOffice = '') => {
  const base = normalizePurposeBase(rawPurpose).toLowerCase();
  if (!base) return true;
  if (GENERAL_FALLBACK_PURPOSES.includes(base)) return true;
  if (assignedOffice && base === `${assignedOffice.toLowerCase()} visit`) return true;
  return false;
};

export default function StaffDashboard({ assignedOffice = "Registrar" }) {
  const { showToast, confirmAction } = useUI();
  const [currentTicket, setCurrentTicket] = useState(null);
  const [currentStudentProfile, setCurrentStudentProfile] = useState(null);
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState(null);

  const [activeQueue, setActiveQueue] = useState([]); 
  const [processingQueue, setProcessingQueue] = useState([]); 
  const [pendingQueue, setPendingQueue] = useState([]);
  const [leftTab, setLeftTab] = useState('live');
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [statusOnline, setStatusOnline] = useState(true);
  const [priorityEnabled, setPriorityEnabled] = useState(true);
  
  const [officeId, setOfficeId] = useState(null);
  const [officeData, setOfficeData] = useState(null);
  const [selectedWindow, setSelectedWindow] = useState("Window 1");
  const [printTicketData, setPrintTicketData] = useState(null);

  // Per-Window Transaction Checklist Filter States
  const [officeWorkflowTitles, setOfficeWorkflowTitles] = useState([]);
  const [isTxFilterModalOpen, setIsTxFilterModalOpen] = useState(false);
  const [draftCheckedTransactions, setDraftCheckedTransactions] = useState([]);
  const [isSavingTxFilter, setIsSavingTxFilter] = useState(false);

  // Unique Session ID per browser tab + Firebase Auth identity for Window Occupancy Locking
  const tabSessionId = useMemo(() => {
    let sid = sessionStorage.getItem('bcmatik_staff_tab_sid');
    if (!sid) {
      sid = `tab_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
      sessionStorage.setItem('bcmatik_staff_tab_sid', sid);
    }
    return sid;
  }, []);

  const currentOperatorId = `${auth.currentUser?.uid || 'staff'}_${tabSessionId}`;
  const currentOperatorLabel = auth.currentUser?.email || 'Another Staff';
  const hasAutoAssignedWindowRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper to check if a window is currently locked by a DIFFERENT staff session
  const getWindowLockInfo = (winName, dataObj = officeData, nowMs = Date.now()) => {
    const locks = dataObj?.active_window_operators || {};
    const entry = locks[winName];
    if (!entry || !entry.operator_id) return null;
    if (entry.operator_id === currentOperatorId) return null; // Locked by me
    const lastBeat = entry.heartbeat_ms || 0;
    if (nowMs - lastBeat > WINDOW_LOCK_TIMEOUT_MS) return null; // Expired stale lock
    return entry;
  };

  // 1. Real-time listener for Office Config (Windows, Major/Minor Status, Window Filters & Window Locks)
  useEffect(() => {
    if (!assignedOffice) return;
    hasAutoAssignedWindowRef.current = false;

    const q = query(collection(db, "offices"), where("office_name", "==", assignedOffice));
    const unsubOffice = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        setOfficeId(docSnap.id);
        setOfficeData(data);

        const winList = Array.isArray(data.windows) && data.windows.length > 0 ? data.windows : ["Window 1"];
        const nowMs = Date.now();

        setSelectedWindow((prev) => {
          const currentValid = prev && winList.includes(prev) ? prev : winList[0];
          const conflict = getWindowLockInfo(currentValid, data, nowMs);

          // If current window is occupied by another staff member, auto-switch to the first free window!
          if (conflict) {
            const firstFree = winList.find((w) => !getWindowLockInfo(w, data, nowMs));
            if (firstFree && firstFree !== currentValid) {
              setTimeout(() => {
                showToast(
                  `${currentValid} is currently in use by ${conflict.operator_label}. Auto-switched your terminal to ${firstFree}.`,
                  "warning",
                  "Window Occupied"
                );
              }, 100);
              return firstFree;
            }
          } else if (!hasAutoAssignedWindowRef.current) {
            hasAutoAssignedWindowRef.current = true;
            const firstFreeOnLoad = winList.find((w) => !getWindowLockInfo(w, data, nowMs)) || winList[0];
            return firstFreeOnLoad;
          }
          return currentValid;
        });
      } else {
        setOfficeData({ office_name: assignedOffice, is_major: true, windows: ["Window 1"] });
        setSelectedWindow("Window 1");
      }
    });
    return () => unsubOffice();
  }, [assignedOffice]);

  // 1A. Claim & Heartbeat the Selected Window Lock in Firestore (Releases on window switch or tab close)
  useEffect(() => {
    if (!officeId || !selectedWindow || !statusOnline) return;

    // Don't overwrite if another active staff member already holds this window lock
    const existingLock = getWindowLockInfo(selectedWindow, officeData, Date.now());
    if (existingLock) return;

    const claimWindow = async () => {
      try {
        await updateDoc(doc(db, "offices", officeId), {
          [`active_window_operators.${selectedWindow}`]: {
            operator_id: currentOperatorId,
            operator_label: currentOperatorLabel,
            claimed_at: new Date(),
            heartbeat_ms: Date.now()
          }
        });
      } catch (_e) { }
    };

    claimWindow();
    const beatTimer = setInterval(claimWindow, 45000);

    const releaseWindow = () => {
      updateDoc(doc(db, "offices", officeId), {
        [`active_window_operators.${selectedWindow}`]: deleteField()
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', releaseWindow);

    return () => {
      clearInterval(beatTimer);
      window.removeEventListener('beforeunload', releaseWindow);
      releaseWindow();
    };
  }, [officeId, selectedWindow, statusOnline, currentOperatorId, currentOperatorLabel]);

  // 1B. Real-time listener for Workflows linked to this Office (Builds the Checklist Options)
  useEffect(() => {
    if (!assignedOffice) return;
    const unsubWf = onSnapshot(collection(db, "workflows"), (snap) => {
      const titles = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const steps = Array.isArray(data.steps) ? data.steps : [];
        const matchesOffice = steps.some(
          (st) => String(st).toLowerCase() === assignedOffice.toLowerCase()
        );
        if (matchesOffice && data.title) {
          titles.push(data.title.trim());
        }
      });
      setOfficeWorkflowTitles(Array.from(new Set(titles)));
    });
    return () => unsubWf();
  }, [assignedOffice]);

  // 2. Real-time listeners for Tickets
  useEffect(() => {
    if (!assignedOffice) return;

    const currentQuery = query(
      collection(db, "tickets"),
      where("status", "==", "called"),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribeCurrent = onSnapshot(currentQuery, (snapshot) => {
      const myWindowTicket = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(t => !t.window_number || t.window_number === selectedWindow) || null;
      setCurrentTicket(myWindowTicket);
    });

    const queueQuery = query(
      collection(db, "tickets"),
      where("status", "in", ["active", "resolved_requirements"]),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribeQueue = onSnapshot(queueQuery, (snapshot) => {
      const tickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      tickets.sort((a, b) => {
        if (a.status === "resolved_requirements" && b.status !== "resolved_requirements") return -1;
        if (b.status === "resolved_requirements" && a.status !== "resolved_requirements") return 1;
        if (priorityEnabled) {
          if (a.is_priority && !b.is_priority) return -1;
          if (!a.is_priority && b.is_priority) return 1;
        }
        const timeA = a.timestamps?.activated_at?.toMillis?.() || 0;
        const timeB = b.timestamps?.activated_at?.toMillis?.() || 0;
        return timeA - timeB;
      });
      setActiveQueue(tickets); 
    });

    const processingQuery = query(
      collection(db, "tickets"),
      where("status", "==", "processing"),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribeProcessing = onSnapshot(processingQuery, (snapshot) => {
      setProcessingQueue(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const pendingQuery = query(
      collection(db, "tickets"),
      where("status", "==", "pending_requirements"),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      setPendingQueue(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubscribeCurrent();
      unsubscribeQueue();
      unsubscribeProcessing();
      unsubscribePending();
    };
  }, [assignedOffice, priorityEnabled, selectedWindow]);

  // 3. Fetch Full Student Profile (Photo URL + Email Preferences) whenever currentTicket changes
  useEffect(() => {
    if (!currentTicket || !currentTicket.student_id || currentTicket.student_id === "WALK-IN" || currentTicket.student_id.startsWith("GUEST")) {
      setCurrentStudentProfile(null);
      return;
    }
    const unsubStudent = onSnapshot(doc(db, "students", currentTicket.student_id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentStudentProfile(docSnap.data());
      } else {
        setCurrentStudentProfile(null);
      }
    });
    return () => unsubStudent();
  }, [currentTicket?.id, currentTicket?.student_id]);

  // Clean Checklist Options: 100% Firestore Workflows + 1 Unified "General / Walk-In Inquiry" + Any Custom Live Purposes
  const allAvailableTransactions = useMemo(() => {
    const customLivePurposes = activeQueue
      .map((t) => normalizePurposeBase(t.transaction_purpose))
      .filter((p) => p && !isGeneralOrWalkInPurpose(p, assignedOffice));
    const combined = [
      ...officeWorkflowTitles,
      GENERAL_INQUIRY_LABEL,
      ...customLivePurposes
    ];
    return Array.from(new Set(combined));
  }, [officeWorkflowTitles, activeQueue, assignedOffice]);

  // Saved allowed transactions for the currently selected window (empty/null = ALL allowed)
  const savedWindowFilterList = useMemo(() => {
    const map = officeData?.window_transactions || {};
    const list = map[selectedWindow];
    return Array.isArray(list) ? list : null;
  }, [officeData, selectedWindow]);

  const isCustomFilterActive = Array.isArray(savedWindowFilterList) && savedWindowFilterList.length > 0;

  // Filtered Waiting Queue for the Selected Window
  const filteredActiveQueue = useMemo(() => {
    if (!isCustomFilterActive) return activeQueue;
    const allowedLower = savedWindowFilterList.map((item) => item.toLowerCase().trim());
    const generalAllowed = allowedLower.includes(GENERAL_INQUIRY_LABEL.toLowerCase());

    return activeQueue.filter((ticket) => {
      if (generalAllowed && isGeneralOrWalkInPurpose(ticket.transaction_purpose, assignedOffice)) {
        return true;
      }
      const basePurpose = normalizePurposeBase(ticket.transaction_purpose).toLowerCase();
      return allowedLower.includes(basePurpose);
    });
  }, [activeQueue, isCustomFilterActive, savedWindowFilterList, assignedOffice]);

  const hiddenOtherTxCount = activeQueue.length - filteredActiveQueue.length;

  const openTransactionChecklistModal = () => {
    if (isCustomFilterActive) {
      setDraftCheckedTransactions(savedWindowFilterList);
    } else {
      setDraftCheckedTransactions(allAvailableTransactions);
    }
    setIsTxFilterModalOpen(true);
  };

  const handleToggleChecklistTx = (txName) => {
    setDraftCheckedTransactions((prev) =>
      prev.includes(txName) ? prev.filter((item) => item !== txName) : [...prev, txName]
    );
  };

  const handleSaveWindowTransactionFilter = async (resetToAll = false) => {
    if (!officeId) {
      showToast("Office configuration document not found in Firestore.", "error");
      return;
    }
    if (!resetToAll && draftCheckedTransactions.length === 0) {
      showToast("Please check at least 1 transaction for this window, or click 'Serve All Transactions'.", "warning", "Selection Required");
      return;
    }

    setIsSavingTxFilter(true);
    try {
      const existingMap = { ...(officeData?.window_transactions || {}) };
      const isSelectingAll =
        resetToAll || draftCheckedTransactions.length >= allAvailableTransactions.length;

      if (isSelectingAll) {
        delete existingMap[selectedWindow];
      } else {
        existingMap[selectedWindow] = draftCheckedTransactions;
      }

      await updateDoc(doc(db, "offices", officeId), {
        window_transactions: existingMap,
        updated_at: new Date()
      });

      showToast(
        isSelectingAll
          ? `${selectedWindow} is now serving ALL transactions for ${assignedOffice}.`
          : `${selectedWindow} configured to serve ${draftCheckedTransactions.length} selected transaction(s).`,
        "success",
        "Window Filter Updated"
      );
      setIsTxFilterModalOpen(false);
    } catch (e) {
      showToast("Failed to save window transaction filter.", "error");
    }
    setIsSavingTxFilter(false);
  };

  // Force Takeover a Window if a Staff Member Left Their Browser Open at Another Desk
  const handleForceTakeoverWindow = (targetWin, lockInfo) => {
    confirmAction({
      title: `Take Over ${targetWin}?`,
      message: `${targetWin} is currently marked as occupied by ${lockInfo.operator_label}. Do you want to take over ${targetWin} on this computer?`,
      confirmText: `Take Over ${targetWin}`,
      variant: 'warning',
      onConfirm: async () => {
        if (officeId) {
          await updateDoc(doc(db, "offices", officeId), {
            [`active_window_operators.${targetWin}`]: {
              operator_id: currentOperatorId,
              operator_label: currentOperatorLabel,
              claimed_at: new Date(),
              heartbeat_ms: Date.now()
            }
          });
        }
        setSelectedWindow(targetWin);
        showToast(`You have taken over ${targetWin}.`, "success", "Window Claimed");
      }
    });
  };

  // 4. Staff Keyboard Shortcuts (Alt+N = Call Next, Alt+R = Recall)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'n' && !currentTicket) {
        e.preventDefault();
        handleCallNext();
      } else if (e.altKey && e.key.toLowerCase() === 'r' && currentTicket) {
        e.preventDefault();
        handleRecallStudent();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const getActiveArrivalQrToken = () => {
    if (officeData?.arrival_qr_token) return officeData.arrival_qr_token;
    const prefix = (assignedOffice || '').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'OFC';
    return `BC-ARRIVE-${prefix}`;
  };

  const handleRefreshOfficeQrToken = async () => {
    if (!officeId) return;
    const prefix = (assignedOffice || '').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'OFC';
    const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
    const newQrToken = `BC-ARRIVE-${prefix}-${randSuffix}`;
    try {
      await updateDoc(doc(db, "offices", officeId), {
        arrival_qr_token: newQrToken,
        qr_updated_at: new Date()
      });
      showToast(`New Arrival QR Token for ${assignedOffice}: [ ${newQrToken} ]`, "success", "QR Token Refreshed");
    } catch (e) {
      showToast("Failed to refresh Arrival QR Token.", "error");
    }
  };

  const handleRefreshOfficeCode = async () => {
    if (!officeId) return;
    const newCode = String(Math.floor(1000 + Math.random() * 9000));
    try {
      await updateDoc(doc(db, "offices", officeId), {
        clearance_code: newCode,
        code_updated_at: new Date()
      });
      showToast(`New 4-Digit Clearance Code for ${assignedOffice}: [ ${newCode} ]`, "success", "Code Refreshed");
    } catch (e) {
      showToast("Failed to refresh clearance code.", "error");
    }
  };

  const handleCallNext = async () => {
    if (!statusOnline) {
      showToast("Your window is currently Paused. Check 'Window Open' first.", "warning", "Window Paused");
      return;
    }
    const activeConflict = getWindowLockInfo(selectedWindow, officeData, Date.now());
    if (activeConflict) {
      handleForceTakeoverWindow(selectedWindow, activeConflict);
      return;
    }
    if (filteredActiveQueue.length === 0) {
      if (hiddenOtherTxCount > 0) {
        showToast(
          `No waiting tickets match ${selectedWindow}'s filter, but ${hiddenOtherTxCount} client(s) are waiting for other transactions. Click 'Serving Transaction(s)' to assist them.`,
          "warning",
          "Filtered Queue Empty"
        );
      } else {
        showToast("No students are currently waiting in the live queue.", "warning", "Queue Empty");
      }
      return;
    }
    let nextTicket = filteredActiveQueue.find(t => t.status === "resolved_requirements") || 
                     (priorityEnabled ? filteredActiveQueue.find(t => t.is_priority === true) : null) || 
                     filteredActiveQueue[0];
    try {
      await updateDoc(doc(db, "tickets", nextTicket.id), {
        status: "called",
        window_number: selectedWindow,
        "timestamps.called_at": new Date()
      });
      showToast(`Calling Ticket ${nextTicket.queue_number} to ${selectedWindow}.`, "success", "Student Called");

      // Check if registered student has Email Notifications enabled
      if (nextTicket.student_id && !nextTicket.student_id.startsWith("GUEST") && nextTicket.student_id !== "WALK-IN") {
        const sSnap = await getDoc(doc(db, "students", nextTicket.student_id));
        if (sSnap.exists()) {
          const sData = sSnap.data();
          if (sData.email_notifications_enabled && sData.email) {
            await sendAutomatedClientEmail({
              toEmail: sData.email,
              toName: sData.name || nextTicket.student_name,
              subject: `BCMatik Alert: Ticket ${nextTicket.queue_number} Now Serving at ${assignedOffice}`,
              htmlContent: `<p>Hello <b>${sData.name || nextTicket.student_name}</b>,</p><p>Your queue ticket <b>${nextTicket.queue_number}</b> is now being served at <b>${assignedOffice} (${selectedWindow})</b>. Please proceed to the counter immediately.</p>`
            });
          }
        }
      }
    } catch (e) {
      showToast("Failed to call next ticket.", "error");
    }
  };

  const updateCurrentTicketStatus = async (newStatus) => {
    if (!currentTicket) return;

    if (newStatus === "missed") {
      confirmAction({
        title: `Mark ${currentTicket.queue_number} as No-Show?`,
        message: `Are you sure you want to skip Ticket ${currentTicket.queue_number} (${currentTicket.student_name || 'Walk-in Guest'})?`,
        confirmText: 'Mark as Missed',
        variant: 'danger',
        onConfirm: async () => {
          await updateDoc(doc(db, "tickets", currentTicket.id), {
            status: "missed",
            "timestamps.completed_at": null
          });
          showToast(`Ticket ${currentTicket.queue_number} marked as No-Show.`, "warning", "Ticket Skipped");
        }
      });
      return;
    }

    try {
      const targetReleaseDate = newStatus === "processing"
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        : null;

      const updatePayload = {
        status: newStatus,
        "timestamps.completed_at": newStatus === "completed" ? new Date() : null
      };
      if (targetReleaseDate) {
        updatePayload["timestamps.target_release_at"] = targetReleaseDate;
      }

      await updateDoc(doc(db, "tickets", currentTicket.id), updatePayload);

      // Send In-App Notification + Email for On-Hold (Pending Requirements) & Multi-Day Processing
      if (newStatus === "pending_requirements" || newStatus === "processing") {
        const isPendingReq = newStatus === "pending_requirements";
        const notifTitle = isPendingReq
          ? `Action Required: Ticket ${currentTicket.queue_number} On Hold (${assignedOffice})`
          : `Document In Processing: Ticket ${currentTicket.queue_number} (${assignedOffice})`;
        const notifMsg = isPendingReq
          ? `Your transaction (${currentTicket.transaction_purpose}) at ${assignedOffice} was placed on hold due to missing requirements. Please fulfill the requirements and approach ${selectedWindow} to resume your priority turn.`
          : `Your request (${currentTicket.transaction_purpose}, Ticket ${currentTicket.queue_number}) is now in multi-day processing at ${assignedOffice}. You will receive an alert as soon as it is Ready for Pickup.`;

        await addDoc(collection(db, "student_notifications"), {
          student_id: currentTicket.student_id || "GUEST",
          student_name: currentTicket.student_name || "Walk-in Guest",
          ticket_id: currentTicket.id,
          queue_number: currentTicket.queue_number,
          office: assignedOffice,
          type: isPendingReq ? "PENDING_REQUIREMENTS" : "PROCESSING",
          title: notifTitle,
          message: notifMsg,
          created_at: new Date(),
          is_read: false
        });

        let recipientEmail = currentTicket.guest_email || "";
        let recipientName = currentTicket.student_name || "Client";

        if (currentTicket.student_id && !currentTicket.student_id.startsWith("GUEST") && currentTicket.student_id !== "WALK-IN") {
          const sSnap = await getDoc(doc(db, "students", currentTicket.student_id));
          if (sSnap.exists()) {
            const sData = sSnap.data();
            recipientName = sData.name || recipientName;
            if (sData.email_notifications_enabled && sData.email) {
              recipientEmail = sData.email;
            } else {
              recipientEmail = "";
            }
          }
        }

        if (recipientEmail) {
          await sendAutomatedClientEmail({
            toEmail: recipientEmail,
            toName: recipientName,
            subject: `BCMatik Update: ${notifTitle}`,
            htmlContent: `<p>Hello <b>${recipientName}</b>,</p><p>${notifMsg}</p>`
          });
        }
      }

      if (newStatus === "completed") {
        showToast(`Transaction for ${currentTicket.queue_number} marked as complete!`, "success", "Completed");
      } else if (newStatus === "pending_requirements") {
        showToast(`Ticket ${currentTicket.queue_number} placed On Hold & client notified.`, "warning", "Placed On Hold");
      } else if (newStatus === "processing") {
        showToast(`Ticket ${currentTicket.queue_number} moved to Multi-Day Processing & client notified.`, "success", "Moved to Processing");
      }
    } catch (e) {
      showToast("Failed to update ticket status.", "error");
    }
  };

  const handleResumePendingTicket = async (ticket) => {
    try {
      await updateDoc(doc(db, "tickets", ticket.id), {
        status: "resolved_requirements",
        "timestamps.activated_at": new Date()
      });
      showToast(`Ticket ${ticket.queue_number} prioritized at the top of the Waiting Queue!`, "success", "Requirements Resolved");
      setLeftTab('live');
    } catch (e) {
      showToast("Failed to resume ticket.", "error");
    }
  };

  const handleUpgradeTicketToPriority = (ticket) => {
    if (!ticket || ticket.is_priority) return;
    const oldQ = ticket.queue_number || '';
    const stripped = oldQ.replace(/^W-/, '').replace(/-/g, '');
    const newPriorityQ = oldQ.startsWith('P-') ? oldQ : `P-${stripped}`;

    confirmAction({
      title: `Upgrade ${oldQ} to Priority Lane?`,
      message: `Confirm that you have verified the PWD, Senior Citizen, or Pregnant ID for ${ticket.student_name || 'this client'}? This will upgrade Ticket ${oldQ} to ${newPriorityQ} and move them to the Priority Lane.`,
      confirmText: `Upgrade to ${newPriorityQ}`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "tickets", ticket.id), {
            is_priority: true,
            queue_number: newPriorityQ,
            verified_by_staff: true
          });
          showToast(`Upgraded Ticket ${oldQ} to ${newPriorityQ} (Priority Lane).`, "success", "Priority Verified");
        } catch (e) {
          showToast("Failed to upgrade ticket to priority.", "error");
        }
      }
    });
  };

  const handleRecallStudent = async () => {
    if (!currentTicket) return;
    try {
      await updateDoc(doc(db, "tickets", currentTicket.id), {
        window_number: selectedWindow,
        "timestamps.called_at": new Date()
      });
      showToast(`Re-announcing Ticket ${currentTicket.queue_number} on Hallway TV.`, "success", "Audio Recall Triggered");
    } catch (e) {
      showToast("Failed to trigger recall.", "error");
    }
  };

const handleRecallDocument = async (ticket) => {
    const recalledAt = new Date();
    const expiresAt = new Date(recalledAt.getTime() + CLAIM_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    try {
      await updateDoc(doc(db, "tickets", ticket.id), {
        status: "ready_for_pickup",
        window_number: selectedWindow,
        near_expiry: false,
        expiry_warning_sent: false,
        "timestamps.recalled_at": recalledAt,
        "timestamps.expires_at": expiresAt
      });

      await addDoc(collection(db, "student_notifications"), {
        student_id: ticket.student_id || "GUEST",
        student_name: ticket.student_name || "Walk-in Guest",
        ticket_id: ticket.id,
        queue_number: ticket.queue_number,
        office: assignedOffice,
        type: "DOCUMENT_READY",
        title: `Document Ready for Pickup (${assignedOffice})`,
        message: `Good news! Your ${ticket.transaction_purpose || 'requested document'} (Ticket ${ticket.queue_number}) is ready for pickup at ${assignedOffice} (${selectedWindow}). Valid for ${CLAIM_VALIDITY_DAYS} days.`,
        created_at: new Date(),
        is_read: false
      });

      // Resolve Email for either Registered Student (if alerts enabled) or Walk-In Guest
      let recipientEmail = (ticket.guest_email || "").trim();
      let recipientName = ticket.student_name || "Client";

      if (ticket.student_id && !ticket.student_id.startsWith("GUEST") && ticket.student_id !== "WALK-IN") {
        const sSnap = await getDoc(doc(db, "students", ticket.student_id));
        if (sSnap.exists()) {
          const sData = sSnap.data();
          recipientName = sData.name || recipientName;
          if (sData.email_notifications_enabled && sData.email) {
            recipientEmail = sData.email.trim();
          } else {
            recipientEmail = "";
          }
        }
      }

      if (recipientEmail && recipientEmail.includes("@")) {
        await sendAutomatedClientEmail({
          toEmail: recipientEmail,
          toName: recipientName,
          subject: `BCMatik Document Ready: ${ticket.transaction_purpose} (${assignedOffice})`,
          htmlContent: `<p>Hello <b>${recipientName}</b>,</p><p>Your requested document (<b>${ticket.transaction_purpose}</b>, Ticket <b>${ticket.queue_number}</b>) is now <b>Ready for Pickup</b> at <b>${assignedOffice} (${selectedWindow})</b>. Please claim it within ${CLAIM_VALIDITY_DAYS} days.</p>`
        });
      }

      showToast(
        recipientEmail
          ? `Notified ${ticket.queue_number} via App & Email (${recipientEmail}) that documents are ready!`
          : `Notified ${ticket.queue_number} (${ticket.student_name || 'Student'}) in-app that documents are ready!`,
        "success",
        "Release Alert Sent"
      );
    } catch (e) {
      showToast("Failed to recall document.", "error");
    }
  };

  const handleGenerateWalkIn = async () => {
    const prefix = assignedOffice.charAt(0).toUpperCase();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    const queueNumber = `W-${prefix}${randomNum}`;

    const newTicket = {
      queue_number: queueNumber,
      status: "active",
      target_office_id: assignedOffice,
      transaction_purpose: "Walk-In Request",
      is_priority: false,
      user_id: "walk_in_guest",
      student_name: "WALK-IN GUEST",
      student_id: "WALK-IN",
      route_steps: [assignedOffice],
      current_step_index: 0,
      timestamps: { booked_at: new Date(), activated_at: new Date() }
    };

    try {
      const docRef = await addDoc(collection(db, "tickets"), newTicket);
      setPrintTicketData({ id: docRef.id, ...newTicket });
      showToast(`Generated Walk-In Ticket ${queueNumber}. Opening print dialog...`, "success", "Walk-In Created");
      setTimeout(() => { window.print(); }, 500);
    } catch (e) {
      showToast("Failed to generate walk-in ticket.", "error");
    }
  };

  const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const availableWindows = Array.isArray(officeData?.windows) && officeData.windows.length > 0
    ? officeData.windows
    : ["Window 1"];

  const activePhotoUrl = currentTicket?.student_photo_url || currentStudentProfile?.photo_url || null;
  const activeClientEmail = currentStudentProfile?.email || currentTicket?.guest_email || null;
  const emailAlertsOn = currentStudentProfile?.email_notifications_enabled ?? false;

// Check if any OTHER window is currently occupied by another staff member
  const occupiedOtherWindows = availableWindows
    .map((w) => ({ windowName: w, lock: getWindowLockInfo(w, officeData, currentTime.getTime()) }))
    .filter((item) => item.lock !== null);

  // Count how many windows are actively OPEN right now (including this terminal if Window Open is ON)
  const openWindowsCount = useMemo(() => {
    const locks = officeData?.active_window_operators || {};
    const nowMs = currentTime.getTime();
    const activeSet = new Set();

    availableWindows.forEach((w) => {
      const entry = locks[w];
      if (entry && entry.operator_id && nowMs - (entry.heartbeat_ms || 0) <= WINDOW_LOCK_TIMEOUT_MS) {
        activeSet.add(w);
      }
    });

    if (statusOnline && selectedWindow && availableWindows.includes(selectedWindow)) {
      activeSet.add(selectedWindow);
    } else if (!statusOnline && selectedWindow) {
      const myEntry = locks[selectedWindow];
      if (myEntry?.operator_id === currentOperatorId) {
        activeSet.delete(selectedWindow);
      }
    }
    return activeSet.size;
  }, [officeData, availableWindows, currentTime, statusOnline, selectedWindow, currentOperatorId]);

  const pillToggleStyle = (isChecked, activeColor = 'var(--quest-primary)') => ({
    width: '38px',
    height: '21px',
    borderRadius: '999px',
    backgroundColor: isChecked ? activeColor : '#CBD5E1',
    position: 'relative',
    transition: 'background-color 0.2s ease',
    display: 'inline-block',
    flexShrink: 0
  });

  const pillKnobStyle = (isChecked) => ({
    width: '17px',
    height: '17px',
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: '2px',
    left: isChecked ? '19px' : '2px',
    transition: 'left 0.2s ease',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
  });

  return (
    <div>
      {/* Top Office Header Bar */}
      <div className="quest-card staff-header-card no-print">
        <div>
          <div className="staff-header-meta" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="quest-badge badge-primary">
              {officeData?.is_major !== false ? 'MAJOR OFFICE' : 'MINOR OFFICE'} TERMINAL
            </span>

            {/* Live Open Windows / Total Windows Counter Badge */}
            {officeData?.is_major !== false && (
              <span
                className={`quest-badge ${openWindowsCount > 0 ? 'badge-success' : 'badge-warning'}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                title="Number of actively open counter windows vs. total configured windows"
              >
                ● {openWindowsCount} of {availableWindows.length} Window{availableWindows.length === 1 ? '' : 's'} Open
              </span>
            )}

            {officeData && officeData.is_major === false ? (
              <span className="quest-badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <KeyRound size={12} /> 4-Digit Clearance Code: <strong>{officeData?.clearance_code || '4892'}</strong>
                <button
                  onClick={handleRefreshOfficeCode}
                  style={{ background: 'none', border: 'none', color: '#0369A1', cursor: 'pointer', padding: '0 2px', display: 'inline-flex' }}
                  title="Refresh 4-Digit Office Clearance Code"
                >
                  <RefreshCw size={12} />
                </button>
              </span>
            ) : (
              <span className="quest-badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <QrCode size={12} /> Arrival QR Token: <strong>{getActiveArrivalQrToken()}</strong>
                <button
                  onClick={handleRefreshOfficeQrToken}
                  style={{ background: 'none', border: 'none', color: '#0369A1', cursor: 'pointer', padding: '0 2px', display: 'inline-flex' }}
                  title="Generate New Hallway Arrival QR Token"
                >
                  <RefreshCw size={12} />
                </button>
              </span>
            )}

            <span className="staff-header-datetime">{dateStr} • {timeStr}</span>
          </div>

          <div className="staff-header-title-row" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <h1 className="staff-header-title">{assignedOffice} — </h1>
            <select 
              className="quest-input staff-window-select" 
              value={selectedWindow}
              onChange={(e) => {
                const targetWin = e.target.value;
                const conflict = getWindowLockInfo(targetWin, officeData, Date.now());
                if (conflict) {
                  handleForceTakeoverWindow(targetWin, conflict);
                  return;
                }
                if (officeId && selectedWindow) {
                  updateDoc(doc(db, "offices", officeId), {
                    [`active_window_operators.${selectedWindow}`]: deleteField()
                  }).catch(() => {});
                }
                setSelectedWindow(targetWin);
                showToast(`Switched active counter to ${targetWin}.`, "success", "Window Changed");
              }}
            >
              {availableWindows.map((w) => {
                const lockInfo = getWindowLockInfo(w, officeData, currentTime.getTime());
                return (
                  <option key={w} value={w}>
                    {lockInfo ? `${w} (Occupied by ${lockInfo.operator_label})` : w}
                  </option>
                );
              })}
            </select>

            {/* Per-Window Transaction Checklist Filter Button */}
            <button
              type="button"
              onClick={openTransactionChecklistModal}
              className={`quest-btn ${isCustomFilterActive ? 'quest-btn-primary' : 'quest-btn-outline'}`}
              style={{
                padding: '7px 13px',
                fontSize: '12px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Customize which transactions this window serves"
            >
              <ListFilter size={15} />
              {isCustomFilterActive
                ? `Serving ${savedWindowFilterList.length} Transaction(s)`
                : 'Serving All Transactions'}
            </button>

            {occupiedOtherWindows.length > 0 && (
              <span
                className="quest-badge badge-warning"
                style={{ fontSize: '10.5px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                title="Other active counter windows in this office"
              >
                <Lock size={11} />
                {occupiedOtherWindows.map((o) => `${o.windowName}: In Use`).join(' • ')}
              </span>
            )}
          </div>
        </div>

        <div className="staff-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button onClick={handleGenerateWalkIn} className="quest-btn quest-btn-outline" style={{ borderColor: 'var(--quest-primary)', color: 'var(--quest-primary)' }}>
            <PlusCircle size={16} /> Walk-In / Print Ticket
          </button>

          {/* Toggle Switch 1: Window Open */}
          <label
            className="staff-toggle-label"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 10px',
              borderRadius: '10px',
              backgroundColor: statusOnline ? '#F0FDF4' : '#F8FAFC',
              border: `1px solid ${statusOnline ? '#BBF7D0' : '#E2E8F0'}`
            }}
          >
            <input
              type="checkbox"
              checked={statusOnline}
              onChange={() => {
                const nextState = !statusOnline;
                setStatusOnline(nextState);
                if (!nextState && officeId && selectedWindow) {
                  updateDoc(doc(db, "offices", officeId), {
                    [`active_window_operators.${selectedWindow}`]: deleteField()
                  }).catch(() => {});
                }
                showToast(`Counter status set to ${nextState ? 'Open' : 'Paused'}.`, nextState ? "success" : "warning");
              }}
              style={{ display: 'none' }}
            />
            <span style={pillToggleStyle(statusOnline, '#16A34A')}>
              <span style={pillKnobStyle(statusOnline)} />
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: statusOnline ? '#15803D' : '#64748B' }}>
              Window Open
            </span>
          </label>

          {/* Toggle Switch 2: Priority Lane */}
          <label
            className="staff-toggle-label"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 10px',
              borderRadius: '10px',
              backgroundColor: priorityEnabled ? '#FFFBEB' : '#F8FAFC',
              border: `1px solid ${priorityEnabled ? '#FDE68A' : '#E2E8F0'}`
            }}
          >
            <input
              type="checkbox"
              checked={priorityEnabled}
              onChange={() => {
                setPriorityEnabled(!priorityEnabled);
                showToast(`Priority Lane sorting ${!priorityEnabled ? 'enabled' : 'disabled'}.`, "success");
              }}
              style={{ display: 'none' }}
            />
            <span style={pillToggleStyle(priorityEnabled, 'var(--quest-primary)')}>
              <span style={pillKnobStyle(priorityEnabled)} />
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: priorityEnabled ? '#B45309' : '#64748B' }}>
              Priority Lane
            </span>
          </label>
        </div>
      </div>

      {/* Main 3-Column Grid */}
      <div className="staff-main-grid no-print">
        
        {/* Left Column: Waiting, On-Hold Pending, & For Release Tabs */}
        <div className="quest-card staff-queue-card">
          <div className="staff-tab-bar">
            <button onClick={() => setLeftTab('live')} className={`staff-tab-btn ${leftTab === 'live' ? 'active' : ''}`}>
              Waiting ({filteredActiveQueue.length})
            </button>
            <button onClick={() => setLeftTab('pending')} className={`staff-tab-btn ${leftTab === 'pending' ? 'active' : ''}`}>
              On Hold ({pendingQueue.length})
            </button>
            <button onClick={() => setLeftTab('processing')} className={`staff-tab-btn ${leftTab === 'processing' ? 'active' : ''}`}>
              Release ({processingQueue.length})
            </button>
          </div>

          {/* Active Window Filter Pill Strip */}
          {leftTab === 'live' && isCustomFilterActive && (
            <div style={{
              margin: '0 0 10px 0',
              padding: '8px 12px',
              backgroundColor: '#FEF9E7',
              border: '1px solid #FDE68A',
              borderRadius: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11.5px',
              color: '#92400E',
              fontWeight: 700
            }}>
              <span>
                Filter Active ({selectedWindow}): {savedWindowFilterList.length} Transaction(s)
              </span>
              <button
                type="button"
                onClick={openTransactionChecklistModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--quest-primary)',
                  fontWeight: 800,
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Edit Checklist
              </button>
            </div>
          )}

          <div className="staff-queue-list">
            {leftTab === 'live' ? (
              filteredActiveQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--quest-text-secondary)', fontSize: '13px' }}>
                  <div>No active tickets waiting for {selectedWindow}.</div>
                  {hiddenOtherTxCount > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginBottom: '8px' }}>
                        {hiddenOtherTxCount} client(s) are waiting in the hallway for other transactions.
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveWindowTransactionFilter(true)}
                        className="quest-btn quest-btn-outline"
                        style={{ padding: '6px 12px', fontSize: '11.5px' }}
                      >
                        Show & Serve All Transactions
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {filteredActiveQueue.map((ticket, index) => (
                    <div key={ticket.id} className={`staff-queue-item ${index === 0 ? 'next-up' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {ticket.student_photo_url ? (
                          <img
                            src={ticket.student_photo_url}
                            alt={ticket.student_name}
                            style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--quest-primary)', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            backgroundColor: '#FCEAE9',
                            color: 'var(--quest-primary)',
                            fontWeight: 800,
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {(ticket.student_name || 'G').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="outfit-number staff-queue-number">{ticket.queue_number}</span>
                            {ticket.is_priority && <span className="quest-badge badge-warning">PRIORITY</span>}
                            {ticket.status === 'resolved_requirements' && <span className="quest-badge badge-info">RESOLVED</span>}
                          </div>
                          <div className="staff-queue-purpose">{ticket.student_name || 'Guest'} • {ticket.transaction_purpose}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {!ticket.is_priority && (
                          <button
                            type="button"
                            onClick={() => handleUpgradeTicketToPriority(ticket)}
                            className="quest-btn quest-btn-outline"
                            style={{
                              padding: '4px 8px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              borderColor: '#FDE68A',
                              backgroundColor: '#FFFBEB',
                              color: '#B45309'
                            }}
                            title="Verify PWD / Senior / Pregnant ID & Upgrade to Priority Lane"
                          >
                            Set Priority
                          </button>
                        )}
                        {index === 0 && <span className="quest-badge badge-primary">NEXT</span>}
                      </div>
                    </div>
                  ))}

                  {hiddenOtherTxCount > 0 && (
                    <div style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      backgroundColor: '#F8FAFC',
                      border: '1px dashed #CBD5E1',
                      borderRadius: '10px',
                      fontSize: '11.5px',
                      color: '#64748B',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>+{hiddenOtherTxCount} waiting in other transactions</span>
                      <button
                        type="button"
                        onClick={openTransactionChecklistModal}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--quest-primary)',
                          fontWeight: 800,
                          fontSize: '11.5px',
                          cursor: 'pointer'
                        }}
                      >
                        Adjust Filter
                      </button>
                    </div>
                  )}
                </>
              )
            ) : leftTab === 'pending' ? (
              pendingQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--quest-text-secondary)', fontSize: '13px' }}>
                  No tickets on hold for requirements.
                </div>
              ) : (
                pendingQueue.map(ticket => (
                  <div key={ticket.id} className="staff-queue-item">
                    <div>
                      <div className="outfit-number" style={{ fontSize: '18px', fontWeight: 700, color: '#D97706' }}>{ticket.queue_number}</div>
                      <div className="staff-queue-purpose">{ticket.student_name || 'Student'} • Missing Req</div>
                    </div>
                    <button
                      onClick={() => handleResumePendingTicket(ticket)}
                      className="quest-btn quest-btn-success"
                      style={{ padding: '6px 10px', fontSize: '11px' }}
                      title="Student fulfilled requirements - Move to front of queue"
                    >
                      <RotateCcw size={13} /> Resume
                    </button>
                  </div>
                ))
              )
            ) : (
              processingQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--quest-text-secondary)', fontSize: '13px' }}>
                  No multi-day documents in processing.
                </div>
              ) : (
                processingQueue.map(ticket => (
                  <div key={ticket.id} className="staff-queue-item">
                    <div>
                      <div className="outfit-number" style={{ fontSize: '18px', fontWeight: 700 }}>{ticket.queue_number}</div>
                      <div className="staff-queue-purpose">{ticket.student_name || 'Student'} • {ticket.transaction_purpose}</div>
                    </div>
                    <button 
                      onClick={() => handleRecallDocument(ticket)} 
                      className="quest-btn quest-btn-primary" 
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                      title="Mark Ready for Pickup & Notify Student"
                    >
                      <BellRing size={14} /> Ready
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Center Currently Serving Card */}
        <div className="quest-card-clay staff-serving-card">
          <div>
            <span className={`quest-badge ${currentTicket ? 'badge-success' : 'badge-warning'}`} style={{ marginBottom: '12px' }}>
              {currentTicket ? `CURRENTLY SERVING AT ${selectedWindow.toUpperCase()}` : `${selectedWindow.toUpperCase()} IDLE`}
            </span>
            <div className="staff-serving-banner">
              <div className="staff-serving-subtitle">Queue Ticket Number</div>
              <div className="outfit-number staff-serving-huge-number">
                {currentTicket ? currentTicket.queue_number : "---"}
              </div>
              {currentTicket?.is_priority && (
                <span className="quest-badge badge-warning" style={{ marginTop: '8px' }}>
                  VERIFIED PRIORITY LANE CLIENT
                </span>
              )}
            </div>
          </div>

          <div className="staff-controls-stack">
            <button onClick={handleCallNext} disabled={currentTicket !== null} className="quest-btn quest-btn-primary" style={{ padding: '16px', fontSize: '16px', width: '100%' }} title="Shortcut: Alt + N">
              <Play size={18} /> Call Next Student
            </button>
            <div className="staff-controls-row">
              <button onClick={() => updateCurrentTicketStatus("completed")} disabled={currentTicket === null} className="quest-btn quest-btn-success" style={{ padding: '13px' }}>
                <CheckCircle size={17} /> Complete
              </button>
              <button onClick={handleRecallStudent} disabled={currentTicket === null} className="quest-btn quest-btn-outline" style={{ padding: '13px' }} title="Shortcut: Alt + R">
                <Volume2 size={17} /> Recall
              </button>
            </div>
            <div className="staff-controls-row">
              <button onClick={() => updateCurrentTicketStatus("pending_requirements")} disabled={currentTicket === null} className="quest-btn quest-btn-warning" style={{ padding: '12px' }}>
                <PauseCircle size={16} /> Mark Pending
              </button>
              <button onClick={() => updateCurrentTicketStatus("processing")} disabled={currentTicket === null} className="quest-btn quest-btn-outline" style={{ padding: '12px' }}>
                <Clock size={16} /> Multi-Day
              </button>
            </div>
            <button onClick={() => updateCurrentTicketStatus("missed")} disabled={currentTicket === null} className="quest-btn quest-btn-danger" style={{ padding: '12px', width: '100%', marginTop: '4px' }}>
              <XCircle size={16} /> Skip / No-Show
            </button>
          </div>
        </div>

        {/* Redesigned Visual Client Verification Profile Card (Right Column) */}
        <div className="quest-card staff-profile-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--quest-primary)" /> Verification Profile
            </h3>
            {currentTicket && (
              <span className={`quest-badge ${activePhotoUrl ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '10px' }}>
                {activePhotoUrl ? 'PHOTO VERIFIED' : 'ROSTER ID'}
              </span>
            )}
          </div>

          {/* Visual Identity Portrait Box */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px 12px',
            marginBottom: '14px',
            borderRadius: '14px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0'
          }}>
            {activePhotoUrl ? (
              <div
                onClick={() => setZoomPhotoUrl(activePhotoUrl)}
                style={{ position: 'relative', cursor: 'pointer' }}
                title="Click to enlarge client verification photo"
              >
                <img
                  src={activePhotoUrl}
                  alt={currentTicket?.student_name || "Client Photo"}
                  style={{
                    width: '104px',
                    height: '104px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid var(--quest-primary)',
                    boxShadow: '0 6px 16px rgba(158, 11, 3, 0.18)'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  bottom: '2px',
                  right: '2px',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  borderRadius: '50%',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Maximize2 size={13} />
                </span>
              </div>
            ) : (
              <div style={{
                width: '88px',
                height: '88px',
                borderRadius: '50%',
                backgroundColor: currentTicket ? '#FCEAE9' : '#E2E8F0',
                color: currentTicket ? 'var(--quest-primary)' : '#94A3B8',
                fontSize: '32px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {currentTicket ? (currentTicket.student_name || 'S').charAt(0).toUpperCase() : <User size={36} />}
              </div>
            )}

            <div style={{ marginTop: '10px', fontWeight: 800, fontSize: '15px', color: '#0F172A', textAlign: 'center' }}>
              {currentTicket?.student_name || 'No Active Client'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              {currentTicket ? `ID: ${currentTicket.student_id || 'GUEST'}` : 'Call next ticket to view profile'}
            </div>
          </div>

          <div className="staff-profile-field">
            <div className="staff-profile-label">PROGRAM / DEPARTMENT</div>
            <div className="staff-profile-value">
              {currentTicket?.student_course ? `${currentTicket.student_course} (${currentTicket.student_division || 'CCS'})` : '---'}
            </div>
          </div>

          <div className="staff-profile-field">
            <div className="staff-profile-label">TRANSACTION PURPOSE</div>
            <div className="staff-profile-value" style={{ color: 'var(--quest-primary)', fontWeight: 800 }}>
              {currentTicket?.transaction_purpose || '---'}
            </div>
          </div>

          {currentTicket?.route_steps?.length > 1 && (
            <div className="staff-profile-field">
              <div className="staff-profile-label">WORKFLOW ROUTE</div>
              <div className="staff-profile-value" style={{ fontSize: '12px' }}>
                {currentTicket.route_steps.join(' -> ')}
              </div>
            </div>
          )}

          <div className="staff-profile-field" style={{ marginBottom: 0 }}>
            <div className="staff-profile-label">EMAIL NOTIFICATION STATUS</div>
            <div className="staff-profile-value" style={{ fontSize: '12px', color: emailAlertsOn ? '#15803D' : '#64748B' }}>
              {activeClientEmail
                ? `${activeClientEmail} (${emailAlertsOn ? 'Alerts ON' : 'Alerts OFF'})`
                : 'No email linked'}
            </div>
          </div>
        </div>
      </div>

      {/* PER-WINDOW TRANSACTION CHECKLIST FILTER MODAL */}
      {isTxFilterModalOpen && (
        <div className="quest-modal-backdrop" onClick={() => setIsTxFilterModalOpen(false)}>
          <div
            className="quest-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '19px', color: '#0F172A' }}>
                  {selectedWindow} — Transaction Checklist
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Check the transactions that <strong>{selectedWindow}</strong> at <strong>{assignedOffice}</strong> will view and call.
                </p>
              </div>
              <button onClick={() => setIsTxFilterModalOpen(false)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              backgroundColor: '#F8FAFC',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              marginBottom: '12px'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                {draftCheckedTransactions.length} of {allAvailableTransactions.length} Checked
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDraftCheckedTransactions(allAvailableTransactions)}
                  style={{ background: 'none', border: 'none', color: 'var(--quest-primary)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
                >
                  Check All
                </button>
                <button
                  type="button"
                  onClick={() => setDraftCheckedTransactions([])}
                  style={{ background: 'none', border: 'none', color: '#64748B', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                >
                  Uncheck All
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
              {allAvailableTransactions.map((txTitle) => {
                const isChecked = draftCheckedTransactions.includes(txTitle);
                const waitingCountForTx = activeQueue.filter((t) => {
                  if (txTitle === GENERAL_INQUIRY_LABEL) {
                    return isGeneralOrWalkInPurpose(t.transaction_purpose, assignedOffice);
                  }
                  return normalizePurposeBase(t.transaction_purpose).toLowerCase() === txTitle.toLowerCase();
                }).length;

                return (
                  <label
                    key={txTitle}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: `1.5px solid ${isChecked ? 'var(--quest-primary)' : '#E2E8F0'}`,
                      backgroundColor: isChecked ? '#FFF5F5' : '#FFFFFF',
                      cursor: 'pointer',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleChecklistTx(txTitle)}
                        style={{ width: '17px', height: '17px', accentColor: 'var(--quest-primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                        {txTitle}
                      </span>
                    </div>
                    {waitingCountForTx > 0 && (
                      <span className="quest-badge badge-warning" style={{ fontSize: '10.5px' }}>
                        {waitingCountForTx} Waiting
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="quest-modal-actions" style={{ marginTop: '18px', justifyContent: 'space-between' }}>
              <button
                type="button"
                disabled={isSavingTxFilter}
                onClick={() => handleSaveWindowTransactionFilter(true)}
                className="quest-btn quest-btn-outline"
              >
                Serve All Transactions
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsTxFilterModalOpen(false)}
                  className="quest-btn quest-btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingTxFilter}
                  onClick={() => handleSaveWindowTransactionFilter(false)}
                  className="quest-btn quest-btn-primary"
                >
                  {isSavingTxFilter ? 'Saving...' : 'Save Window Checklist'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal to Enlarge Student Verification Photo */}
      {zoomPhotoUrl && (
        <div className="quest-modal-backdrop" onClick={() => setZoomPhotoUrl(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0F172A' }}>
                {currentTicket?.student_name} ({currentTicket?.student_id})
              </h3>
              <button onClick={() => setZoomPhotoUrl(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>
            <img
              src={zoomPhotoUrl}
              alt="Enlarged Verification Portrait"
              style={{ width: '100%', maxHeight: '340px', objectFit: 'cover', borderRadius: '16px', border: '2px solid var(--quest-primary)' }}
            />
          </div>
        </div>
      )}

      {/* Hidden Print Container */}
      {printTicketData && (
        <div className="print-ticket-container" style={{ display: 'none', textAlign: 'center', fontFamily: 'monospace', width: '300px', margin: '0 auto', color: 'black' }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '24px' }}>BICOL COLLEGE</h2>
          <p style={{ margin: '0 0 20px 0', fontSize: '14px' }}>{assignedOffice.toUpperCase()} DEPARTMENT</p>
          
          <div style={{ borderTop: '1px dashed black', borderBottom: '1px dashed black', padding: '20px 0', margin: '20px 0' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '12px' }}>YOUR QUEUE NUMBER:</p>
            <h1 style={{ margin: 0, fontSize: '48px', fontWeight: 'bold' }}>{printTicketData.queue_number}</h1>
          </div>
          
          <p style={{ fontSize: '12px', margin: '5px 0' }}>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
          <p style={{ fontSize: '12px', margin: '5px 0' }}>Walk-in Guest Transaction</p>
          <p style={{ fontSize: '12px', margin: '20px 0 0 0' }}>Please wait for your number to be called.</p>
        </div>
      )}
    </div>
  );
}