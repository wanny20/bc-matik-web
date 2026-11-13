import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, QrCode, Tv, AlertTriangle } from 'lucide-react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import './PublicDisplay.css'; 

export default function PublicDisplay() {
  const [announcement, setAnnouncement] = useState('');
  const [calledTickets, setCalledTickets] = useState([]);
  const [activeTickets, setActiveTickets] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Dynamic Major Offices State
  const [offices, setOffices] = useState([]);
  const [loadingOffices, setLoadingOffices] = useState(true);
  
  const announcedMapRef = useRef({});

  const speakTicket = (ticket) => {
    if (!soundEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const formattedNumber = (ticket.queue_number || '').split('').join(' ');
    const text = `Attention please. Ticket ${formattedNumber}, please proceed to ${ticket.target_office_id}, ${ticket.window_number || 'Window 0'}.`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // 1. Listen for Global TV Announcements
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAnnouncement(data.tvAnnouncement || '');
      }
    });
    return () => unsubSettings();
  }, []);

  // 2. Listen ONLY for Online MAJOR Offices & Auto-Generate Tokens (Minor Offices Excluded!)
  useEffect(() => {
    const q = query(collection(db, 'offices'), where('is_online', '==', true));
    const unsubOffices = onSnapshot(q, (snapshot) => {
      const uniqueMajorMap = new Map();

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        // Strictly include ONLY Major Offices on the Public Display
        if (data.is_major === true && data.office_name) {
          const cleanKey = data.office_name.trim().toLowerCase();
          if (!uniqueMajorMap.has(cleanKey)) {
            const tokenPrefix = data.office_name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
            uniqueMajorMap.set(cleanKey, {
              id: docSnap.id,
              name: data.office_name.trim(),
              is_major: true,
              token: `BC-ARRIVE-${tokenPrefix}`
            });
          }
        }
      });

      const fetchedMajorOffices = Array.from(uniqueMajorMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      
      setOffices(fetchedMajorOffices);
      setLoadingOffices(false);
    });

    return () => unsubOffices();
  }, []);
  
  // 3. Listen for Ticket Updates
  useEffect(() => {
    const ticketsRef = collection(db, "tickets");

    const calledQuery = query(ticketsRef, where("status", "==", "called"));
    const unsubCalled = onSnapshot(calledQuery, (snapshot) => {
      const currentCalled = [];
      snapshot.docChanges().forEach((change) => {
        const docData = { id: change.doc.id, ...change.doc.data() };
        const calledTime = docData.timestamps?.called_at?.seconds || 0;
        if ((change.type === "added" || change.type === "modified") && announcedMapRef.current[docData.id] !== calledTime) {
          announcedMapRef.current[docData.id] = calledTime;
          speakTicket(docData);
        }
      });
      snapshot.docs.forEach((d) => { currentCalled.push({ id: d.id, ...d.data() }); });
      setCalledTickets(currentCalled);
    });

    const activeQuery = query(ticketsRef, where("status", "in", ["active", "resolved_requirements"]));
    const unsubActive = onSnapshot(activeQuery, (snapshot) => {
      const waiting = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setActiveTickets(waiting);
    });

    return () => { unsubCalled(); unsubActive(); };
  }, [soundEnabled]);

  return (
    <div className="tv-wrapper">
      <header className="tv-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="tv-header-icon" style={{ overflow: 'hidden', padding: '4px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <img
              src="/LOGO.png"
              alt="BC-Matik Logo"
              style={{ width: '42px', height: '42px', objectFit: 'contain' }}
              onError={(e) => {
                if (!e.currentTarget.src.endsWith('/logo.png')) {
                  e.currentTarget.src = '/logo.png';
                }
              }}
            />
          </div>
          <div>
            <h1 className="tv-header-title">BICOL COLLEGE • LIVE QUEUE MONITOR</h1>
            <p className="tv-header-subtitle">BCMatik Smart Multi-Office Queuing & Guidance System</p>
          </div>
        </div>

        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`tv-sound-btn ${soundEnabled ? 'active' : 'muted'}`}
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          {soundEnabled ? 'Voice Audio: ON' : 'Voice Audio: MUTED'}
        </button>
      </header>

      {/* Dynamic Announcement Marquee */}
      {announcement && (
        <div style={{ 
          backgroundColor: 'var(--quest-warning-bg)', 
          color: '#B45309', 
          padding: '12px 24px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          display: 'flex', 
          alignItems: 'center',
          gap: '12px',
          fontWeight: '700',
          border: '1px solid #FDE68A',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <span style={{ backgroundColor: '#F59E0B', color: 'white', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', flexShrink: 0 }}>CAMPUS ADVISORY</span>
          <marquee scrollamount="6" style={{ fontSize: '18px', letterSpacing: '0.5px' }}>{announcement}</marquee>
        </div>
      )}

      {/* Dynamic Major Office Grid */}
      {loadingOffices ? (
        <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--quest-text-secondary)' }}>
          <Tv size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
          <h2>Syncing Campus Layout...</h2>
        </div>
      ) : offices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 20px', backgroundColor: 'var(--quest-surface)', borderRadius: '24px', border: '1px dashed var(--quest-border)' }}>
          <AlertTriangle size={48} color="var(--quest-text-muted)" style={{ marginBottom: '16px' }} />
          <h2 style={{ color: 'var(--quest-text-secondary)', margin: 0 }}>No Major Service Offices Are Currently Online</h2>
          <p style={{ color: 'var(--quest-text-muted)' }}>Waiting for system administrators to open Major Office service windows...</p>
        </div>
      ) : (
        <div className="tv-grid">
          {offices.map((office) => {
            const nowServing = calledTickets.find((t) => t.target_office_id === office.name);
            // Sort resolved_requirements first, then priority tickets, then activation timestamp
            const upNextList = activeTickets
              .filter((t) => t.target_office_id === office.name)
              .sort((a, b) => {
                if (a.status === 'resolved_requirements' && b.status !== 'resolved_requirements') return -1;
                if (b.status === 'resolved_requirements' && a.status !== 'resolved_requirements') return 1;
                if ((b.is_priority === true) !== (a.is_priority === true)) {
                  return (b.is_priority === true) - (a.is_priority === true);
                }
                const timeA = a.timestamps?.activated_at?.toMillis?.() || 0;
                const timeB = b.timestamps?.activated_at?.toMillis?.() || 0;
                return timeA - timeB;
              })
              .slice(0, 5);
            
            const isServing = !!nowServing;

            return (
              <div key={office.id} className="tv-card">
                <div className="tv-card-banner" style={{ backgroundColor: 'var(--quest-primary, #9E0B03)' }}>
                  <h2 style={{ color: '#FFFFFF', margin: 0 }}>{office.name.toUpperCase()}</h2>
                </div>

                <div className={`tv-serving-box ${isServing ? 'active' : 'idle'}`}>
                  <span className={`tv-serving-label ${isServing ? 'active' : 'idle'}`}>
                    NOW SERVING
                  </span>
                  <div className={`outfit-number tv-serving-number ${isServing ? 'active' : 'idle'}`}>
                    {isServing ? nowServing.queue_number : '---'}
                  </div>
                  <span className={`tv-serving-window ${isServing ? 'active' : 'idle'}`}>
                    {isServing ? (nowServing.window_number || 'Window 0') : 'Standby'}
                  </span>
                </div>

                <div className="tv-waiting-container">
                  <h4 className="tv-waiting-header">
                    WAITING IN HALLWAY ({upNextList.length})
                  </h4>
                  {upNextList.length === 0 ? (
                    <p className="tv-waiting-empty">No active tickets waiting</p>
                  ) : (
                    <div className="tv-waiting-list">
                      {upNextList.map((t, idx) => {
                        const isFirst = idx === 0;
                        return (
                          <div key={t.id} className={`tv-waiting-item ${isFirst ? 'first' : 'standard'}`}>
                            <span className={`outfit-number tv-waiting-item-number ${isFirst ? 'first' : 'standard'}`}>
                              {t.queue_number}
                            </span>
                            {t.is_priority && (
                              <span className="tv-priority-badge">PRIORITY</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="tv-qr-footer">
                  <div>
                    <div className="tv-qr-label">
                      <QrCode size={16} /> Arrival Check-In
                    </div>
                    <p className="tv-qr-text">Scan code or enter token:</p>
                    <code className="tv-qr-token">{office.token}</code>
                  </div>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${office.token}`} 
                    alt={`${office.name} QR`}
                    className="tv-qr-image"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}