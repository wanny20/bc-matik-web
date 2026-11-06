import { useState, useEffect } from 'react';
import { collection, query, where, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { 
  Play, PauseCircle, XCircle, CheckCircle, Clock, 
  BellRing, User, FileText, Hash, Volume2, ShieldAlert 
} from 'lucide-react';
import './StaffDashboard.css';

export default function StaffDashboard({ assignedOffice = "Registrar" }) {
  const [currentTicket, setCurrentTicket] = useState(null);
  const [activeQueue, setActiveQueue] = useState([]); 
  const [processingQueue, setProcessingQueue] = useState([]); 
  const [leftTab, setLeftTab] = useState('live');
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [statusOnline, setStatusOnline] = useState(true);
  const [priorityEnabled, setPriorityEnabled] = useState(true);
  
  const windowNumber = "Window 1";

  // Clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Firebase Listeners
  useEffect(() => {
    if (!assignedOffice) return;

    const currentQuery = query(
      collection(db, "tickets"),
      where("status", "in", ["called", "pending_requirements"]),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribeCurrent = onSnapshot(currentQuery, (snapshot) => {
      if (!snapshot.empty) setCurrentTicket({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      else setCurrentTicket(null);
    });

    const queueQuery = query(
      collection(db, "tickets"),
      where("status", "in", ["active", "resolved_requirements"]),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribeQueue = onSnapshot(queueQuery, (snapshot) => {
      const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      tickets.sort((a, b) => {
        if (a.status === "resolved_requirements" && b.status !== "resolved_requirements") return -1;
        if (b.status === "resolved_requirements" && a.status !== "resolved_requirements") return 1;
        if (priorityEnabled) {
          if (a.is_priority && !b.is_priority) return -1;
          if (!a.is_priority && b.is_priority) return 1;
        }
        return (a.timestamps?.activated_at?.toMillis() || 0) - (b.timestamps?.activated_at?.toMillis() || 0);
      });
      setActiveQueue(tickets); 
    });

    const processingQuery = query(
      collection(db, "tickets"),
      where("status", "==", "processing"),
      where("target_office_id", "==", assignedOffice)
    );
    const unsubscribeProcessing = onSnapshot(processingQuery, (snapshot) => {
      setProcessingQueue(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeCurrent();
      unsubscribeQueue();
      unsubscribeProcessing();
    };
  }, [assignedOffice, priorityEnabled]);

  const handleCallNext = async () => {
    if (activeQueue.length === 0) return alert("No students currently waiting in the live queue.");
    let nextTicket = activeQueue.find(t => t.status === "resolved_requirements") 
                  || (priorityEnabled ? activeQueue.find(t => t.is_priority === true) : null)
                  || activeQueue[0];

    await updateDoc(doc(db, "tickets", nextTicket.id), {
      status: "called",
      "timestamps.called_at": new Date()
    });
  };

  const handleRecallCurrent = async () => {
    if (!currentTicket) return;
    await updateDoc(doc(db, "tickets", currentTicket.id), {
      "timestamps.called_at": new Date()
    });
  };

  const updateCurrentTicketStatus = async (newStatus) => {
    if (!currentTicket) return;
    if (newStatus === "missed" && !window.confirm(`Mark ticket ${currentTicket.queue_number} as No-Show / Skipped?`)) {
      return;
    }
    await updateDoc(doc(db, "tickets", currentTicket.id), {
      status: newStatus,
      "timestamps.completed_at": newStatus === "completed" ? new Date() : null
    });
  };

  const handleRecallDocument = async (ticketId) => {
    await updateDoc(doc(db, "tickets", ticketId), {
      status: "ready_for_pickup",
      "timestamps.recalled_at": new Date()
    });
  };

  const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const queuerName = currentTicket?.student_name || "Guest Student (Walk-In)";
  const queuerId = currentTicket?.student_id || "N/A (Guest Pass)";
  const queuerPurpose = currentTicket?.transaction_purpose || "General Document Inquiry";

  return (
    <div>
      {/* Top Office Header Bar */}
      <div className="quest-card" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="quest-badge badge-primary">OFFICE TERMINAL</span>
            <span style={{ fontSize: '13px', color: 'var(--quest-text-secondary)', fontWeight: 500 }}>
              {dateStr} • {timeStr}
            </span>
          </div>
          <h1 style={{ fontSize: '28px', margin: 0 }}>
            {assignedOffice} Office — {windowNumber}
          </h1>
        </div>

        {/* Desk Controls */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={statusOnline} 
              onChange={() => setStatusOnline(!statusOnline)} 
              style={{ accentColor: 'var(--quest-primary)', width: '16px', height: '16px' }}
            />
            Window Open
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={priorityEnabled} 
              onChange={() => setPriorityEnabled(!priorityEnabled)} 
              style={{ accentColor: 'var(--quest-primary)', width: '16px', height: '16px' }}
            />
            Priority Lane (PWD/Senior)
          </label>
        </div>
      </div>

      {/* Main 3-Column Operational Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Column 1: Live Waiting Queue & Multi-Day Processing */}
        <div className="quest-card" style={{ padding: 0, overflow: 'hidden', minHeight: '540px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--quest-border)', backgroundColor: 'var(--quest-bg-secondary)' }}>
            <button 
              onClick={() => setLeftTab('live')}
              style={{ 
                flex: 1, padding: '14px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                backgroundColor: leftTab === 'live' ? 'var(--quest-surface)' : 'transparent',
                color: leftTab === 'live' ? 'var(--quest-primary)' : 'var(--quest-text-secondary)',
                borderBottom: leftTab === 'live' ? '2px solid var(--quest-primary)' : '2px solid transparent'
              }}
            >
              Waiting Queue ({activeQueue.length})
            </button>
            <button 
              onClick={() => setLeftTab('processing')}
              style={{ 
                flex: 1, padding: '14px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                backgroundColor: leftTab === 'processing' ? 'var(--quest-surface)' : 'transparent',
                color: leftTab === 'processing' ? 'var(--quest-primary)' : 'var(--quest-text-secondary)',
                borderBottom: leftTab === 'processing' ? '2px solid var(--quest-primary)' : '2px solid transparent'
              }}
            >
              For Release ({processingQueue.length})
            </button>
          </div>

          <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
            {leftTab === 'live' ? (
              activeQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--quest-text-muted)' }}>
                  No students currently checked in at the hallway.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeQueue.map((ticket, index) => (
                    <div 
                      key={ticket.id} 
                      style={{ 
                        padding: '14px 16px', 
                        borderRadius: '12px',
                        border: index === 0 ? '1.5px solid var(--quest-primary)' : '1px solid var(--quest-border)',
                        backgroundColor: index === 0 ? 'var(--quest-primary-light)' : 'var(--quest-surface)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div className="outfit-number" style={{ fontSize: '22px', fontWeight: 800, color: index === 0 ? 'var(--quest-primary)' : 'var(--quest-text-primary)' }}>
                          {ticket.queue_number}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--quest-text-secondary)' }}>
                          {ticket.transaction_purpose || 'Standard Transaction'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {index === 0 && <span className="quest-badge badge-primary">NEXT IN LINE</span>}
                        {ticket.is_priority && <span className="quest-badge badge-warning">PRIORITY</span>}
                        {ticket.status === 'resolved_requirements' && <span className="quest-badge badge-info">CALLBACK</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              processingQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--quest-text-muted)' }}>
                  No multi-day documents pending release.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {processingQueue.map(ticket => (
                    <div key={ticket.id} style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--quest-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="outfit-number" style={{ fontSize: '20px', fontWeight: 700 }}>{ticket.queue_number}</div>
                        <div style={{ fontSize: '12px', color: 'var(--quest-text-secondary)' }}>{ticket.transaction_purpose}</div>
                      </div>
                      <button onClick={() => handleRecallDocument(ticket.id)} className="quest-btn quest-btn-primary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                        <BellRing size={14} /> Notify Pickup
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Column 2: Center Currently Serving Card (Subtle Claymorphism) */}
        <div className="quest-card-clay" style={{ textAlign: 'center', minHeight: '540px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span className={`quest-badge ${currentTicket ? 'badge-success' : 'badge-warning'}`} style={{ marginBottom: '12px' }}>
              {currentTicket ? '● CURRENTLY SERVING AT WINDOW' : '● WINDOW IDLE — READY FOR NEXT'}
            </span>
            
            <div style={{ 
              margin: '16px 0 24px', 
              padding: '28px 16px', 
              backgroundColor: 'var(--quest-primary-light)', 
              borderRadius: '16px',
              border: '1px solid #F5D0CE'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--quest-primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Queue Ticket Number
              </div>
              <div className="outfit-number" style={{ fontSize: '84px', fontWeight: 800, color: 'var(--quest-primary)', lineHeight: 1.05, marginTop: '4px' }}>
                {currentTicket ? currentTicket.queue_number : "---"}
              </div>
            </div>
          </div>

          {/* Primary & Secondary Action Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              onClick={handleCallNext} 
              disabled={currentTicket !== null} 
              className="quest-btn quest-btn-primary" 
              style={{ padding: '16px', fontSize: '16px', width: '100%' }}
            >
              <Play size={18} /> Call Next Student
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button 
                onClick={() => updateCurrentTicketStatus("completed")} 
                disabled={currentTicket === null} 
                className="quest-btn quest-btn-success"
                style={{ padding: '13px' }}
              >
                <CheckCircle size={17} /> Complete
              </button>

              <button 
                onClick={handleRecallCurrent} 
                disabled={currentTicket === null} 
                className="quest-btn quest-btn-outline"
                style={{ padding: '13px' }}
              >
                <Volume2 size={17} /> Recall Audio
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button 
                onClick={() => updateCurrentTicketStatus("pending_requirements")} 
                disabled={currentTicket === null} 
                className="quest-btn quest-btn-warning"
                style={{ padding: '12px' }}
              >
                <PauseCircle size={16} /> Mark Pending
              </button>

              <button 
                onClick={() => updateCurrentTicketStatus("processing")} 
                disabled={currentTicket === null} 
                className="quest-btn quest-btn-outline"
                style={{ padding: '12px' }}
              >
                <Clock size={16} /> Multi-Day Process
              </button>
            </div>

            <button 
              onClick={() => updateCurrentTicketStatus("missed")} 
              disabled={currentTicket === null} 
              className="quest-btn quest-btn-danger"
              style={{ padding: '12px', width: '100%', marginTop: '4px' }}
            >
              <XCircle size={16} /> Skip / Mark No-Show
            </button>
          </div>
        </div>

        {/* Column 3: Student & Transaction Details Panel */}
        <div className="quest-card" style={{ minHeight: '540px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--quest-primary)" /> Student Verification Profile
            </h3>

            {/* Anonymous Avatar Box */}
            <div style={{ 
              width: '100%', 
              height: '210px', 
              backgroundColor: 'var(--quest-bg-secondary)', 
              borderRadius: '14px', 
              border: '1px solid var(--quest-border)',
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: '20px',
              overflow: 'hidden'
            }}>
              <div style={{ width: '68px', height: '68px', borderRadius: '50%', backgroundColor: 'var(--quest-primary-light)', color: 'var(--quest-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                <User size={34} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--quest-text-secondary)' }}>
                {currentTicket ? 'Guest / Walk-In Queuer' : 'No Active Student'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--quest-text-muted)' }}>
                {currentTicket ? 'Standard Verification Mode' : 'Call a ticket to view details'}
              </span>
            </div>

            {/* Structured Metadata Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--quest-bg-main)', borderRadius: '10px', border: '1px solid var(--quest-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--quest-text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} /> Student ID Number
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--quest-text-primary)', marginTop: '2px' }}>
                  {currentTicket ? queuerId : '---'}
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--quest-bg-main)', borderRadius: '10px', border: '1px solid var(--quest-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--quest-text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={13} /> Full Name
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--quest-text-primary)', marginTop: '2px' }}>
                  {currentTicket ? queuerName : '---'}
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--quest-bg-main)', borderRadius: '10px', border: '1px solid var(--quest-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--quest-text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={13} /> Selected Transaction
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--quest-primary)', marginTop: '2px' }}>
                  {currentTicket ? queuerPurpose : '---'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px', padding: '10px 12px', backgroundColor: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '10px', fontSize: '12px', color: '#854D0E', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={16} color="#EAB308" style={{ flexShrink: 0 }} />
            <span>Verify school ID or claim stub before releasing official documents.</span>
          </div>
        </div>

      </div>
    </div>
  );
}