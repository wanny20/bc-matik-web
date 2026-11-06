import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, QrCode, Tv } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function PublicDisplay() {
  const [calledTickets, setCalledTickets] = useState([]);
  const [activeTickets, setActiveTickets] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastAnnouncedId, setLastAnnouncedId] = useState(null);

  // Track already-announced timestamps so we only speak newly called tickets
  const announcedMapRef = useRef({});

  // Voice Announcement Engine (Native Web Speech API)
  const speakTicket = (ticket) => {
    if (!soundEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel(); // Clear overlapping audio
    const formattedNumber = ticket.queue_number.split('').join(' ');
    const text = `Attention please. Ticket ${formattedNumber}, please proceed to ${ticket.target_office_id}, ${ticket.window_number || 'Window 1'}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const ticketsRef = collection(db, "tickets");

    // 1. Listen to all currently CALLED tickets across campus
    const calledQuery = query(ticketsRef, where("status", "==", "called"));
    const unsubCalled = onSnapshot(calledQuery, (snapshot) => {
      const currentCalled = [];
      snapshot.docChanges().forEach((change) => {
        const docData = { id: change.doc.id, ...change.doc.data() };
        const calledTime = docData.timestamps?.called_at?.seconds || 0;

        if (
          (change.type === "added" || change.type === "modified") &&
          announcedMapRef.current[docData.id] !== calledTime
        ) {
          announcedMapRef.current[docData.id] = calledTime;
          setLastAnnouncedId(docData.id);
          speakTicket(docData);
        }
      });

      snapshot.docs.forEach((doc) => {
        currentCalled.push({ id: doc.id, ...doc.data() });
      });
      setCalledTickets(currentCalled);
    });

    // 2. Listen to all ACTIVE (waiting) tickets across campus
    const activeQuery = query(ticketsRef, where("status", "==", "active"));
    const unsubActive = onSnapshot(activeQuery, (snapshot) => {
      const waiting = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setActiveTickets(waiting);
    });

    return () => {
      unsubCalled();
      unsubActive();
    };
  }, [soundEnabled]);

  const offices = [
    { name: "Accounting", token: "BC-ARRIVE-ACC" },
    { name: "Cashier", token: "BC-ARRIVE-CSH" },
    { name: "Registrar", token: "BC-ARRIVE-REG" }
  ];

  return (
    <div style={{ backgroundColor: '#001F3F', minHeight: '100vh', padding: '24px', color: 'white' }}>
      {/* TV Header Bar */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: '#003366', 
        padding: '16px 28px', 
        borderRadius: '16px',
        borderBottom: '4px solid #FFCC00',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Tv size={36} color="#FFCC00" />
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', color: '#FFFFFF', letterSpacing: '1px' }}>
              BICOL COLLEGE • LIVE QUEUE MONITOR
            </h1>
            <p style={{ margin: '4px 0 0 0', color: '#FFCC00', fontSize: '14px', fontWeight: 'bold' }}>
              BC-Matik Smart Multi-Office Queuing & Guidance System
            </p>
          </div>
        </div>

        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: soundEnabled ? '#FFCC00' : '#455A64',
            color: soundEnabled ? '#003366' : '#FFFFFF',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '12px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          {soundEnabled ? 'Voice Audio: ON' : 'Voice Audio: MUTED'}
        </button>
      </header>

      {/* 3-Column Office Display Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {offices.map((office) => {
          const nowServing = calledTickets.find((t) => t.target_office_id === office.name);
          const upNextList = activeTickets
            .filter((t) => t.target_office_id === office.name)
            .slice(0, 4);

          return (
            <div key={office.name} style={{
              backgroundColor: '#FFFFFF',
              color: '#1C1B1F',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              {/* Office Title Banner */}
              <div style={{ backgroundColor: '#003366', color: 'white', padding: '16px', textAlign: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '24px', letterSpacing: '1px' }}>
                  {office.name.toUpperCase()}
                </h2>
              </div>

              {/* Currently Serving Box */}
              <div style={{ 
                padding: '28px 16px', 
                textAlign: 'center', 
                backgroundColor: nowServing ? '#E8F5E9' : '#FAFAFA',
                borderBottom: '2px solid #EEE'
              }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#666', letterSpacing: '1px' }}>
                  NOW SERVING
                </span>
                <div style={{ 
                  fontSize: '68px', 
                  fontWeight: '900', 
                  color: nowServing ? '#2E7D32' : '#B0BEC5',
                  margin: '8px 0'
                }}>
                  {nowServing ? nowServing.queue_number : '---'}
                </div>
                <span style={{ 
                  display: 'inline-block',
                  backgroundColor: nowServing ? '#2E7D32' : '#E0E0E0',
                  color: nowServing ? 'white' : '#757575',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  {nowServing ? (nowServing.window_number || 'Window 1') : 'Standby'}
                </span>
              </div>

              {/* Up Next Waiting List */}
              <div style={{ padding: '16px 24px', flexGrow: 1 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#003366', borderBottom: '2px solid #EEE', paddingBottom: '8px' }}>
                  WAITING IN HALLWAY ({upNextList.length})
                </h4>
                {upNextList.length === 0 ? (
                  <p style={{ color: '#9E9E9E', fontSize: '14px', textAlign: 'center', margin: '20px 0' }}>
                    No active tickets waiting
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {upNextList.map((t, idx) => (
                      <div key={t.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        backgroundColor: idx === 0 ? '#E3F2FD' : '#F5F5F5',
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        fontSize: '18px',
                        color: '#003366'
                      }}>
                        <span>{t.queue_number}</span>
                        {t.is_priority && (
                          <span style={{ backgroundColor: '#FFCC00', color: '#003366', fontSize: '11px', padding: '3px 8px', borderRadius: '8px' }}>
                            PRIORITY
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hallway Arrival Check-In QR Footer */}
              <div style={{ 
                backgroundColor: '#F4F7F9', 
                padding: '16px', 
                borderTop: '2px dashed #CFD8DC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#003366', fontWeight: 'bold', fontSize: '14px' }}>
                    <QrCode size={16} /> Hallway Arrival Check-In
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#546E7A' }}>
                    Scan in BC-Matik App or enter token:
                  </p>
                  <code style={{ 
                    display: 'inline-block',
                    marginTop: '4px',
                    backgroundColor: '#FFCC00', 
                    color: '#003366', 
                    padding: '2px 8px', 
                    borderRadius: '6px', 
                    fontWeight: 'bold',
                    fontSize: '13px'
                  }}>
                    {office.token}
                  </code>
                </div>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${office.token}`} 
                  alt={`${office.name} QR`}
                  style={{ width: '72px', height: '72px', borderRadius: '8px', border: '2px solid #003366' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}