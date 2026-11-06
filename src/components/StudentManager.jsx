import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Users, Upload, Plus, Search, FileText, CheckCircle } from 'lucide-react';

export default function StudentManager() {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadStats, setUploadStats] = useState(null);
  
  // Manual Form States
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualData, setManualData] = useState({ student_id: '', name: '', course: '', year: '' });
  
  const fileInputRef = useRef(null);

  const fetchStudents = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'students'));
    setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualData.student_id || !manualData.name) return;
    
    await setDoc(doc(db, 'students', manualData.student_id), {
      student_id: manualData.student_id,
      name: manualData.name,
      course: manualData.course.toUpperCase(),
      year: manualData.year,
      registered_at: new Date()
    });
    
    setManualData({ student_id: '', name: '', course: '', year: '' });
    setShowManualForm(false);
    fetchStudents();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length < 2) {
        alert("Invalid CSV format. Need headers and at least one data row.");
        return;
      }

      // Expected CSV Headers: student_id, name, course, year
      const batch = writeBatch(db);
      let count = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',');
        if (columns.length >= 2) {
          const studentId = columns[0].trim();
          const docRef = doc(db, 'students', studentId);
          batch.set(docRef, {
            student_id: studentId,
            name: columns[1]?.trim() || 'Unknown',
            course: columns[2]?.trim().toUpperCase() || 'N/A',
            year: columns[3]?.trim() || '1',
            registered_at: new Date()
          });
          count++;
        }
      }

      await batch.commit();
      setUploadStats(`Successfully imported ${count} student records.`);
      setTimeout(() => setUploadStats(null), 5000);
      fetchStudents();
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  const filteredStudents = students.filter(s => 
    s.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', marginBottom: '4px' }}>Student Roster Management</h1>
          <p style={{ margin: 0, color: 'var(--quest-text-secondary)', fontSize: '14px' }}>
            Maintain the official database of enrolled students authorized to use the QUEST platform.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowManualForm(!showManualForm)} className="quest-btn quest-btn-outline">
            <Plus size={16} /> Add Manually
          </button>
          
          <input 
            type="file" 
            accept=".csv" 
            style={{ display: 'none' }} 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button onClick={() => fileInputRef.current.click()} className="quest-btn quest-btn-primary">
            <Upload size={16} /> Bulk Upload CSV
          </button>
        </div>
      </div>

      {uploadStats && (
        <div style={{ padding: '16px', backgroundColor: 'var(--quest-success-bg)', color: 'var(--quest-success)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontWeight: 600 }}>
          <CheckCircle size={20} /> {uploadStats}
        </div>
      )}

      {showManualForm && (
        <div className="quest-card-clay" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Register New Student</h3>
          <form onSubmit={handleManualSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--quest-text-secondary)', marginBottom: '4px' }}>Student ID</label>
              <input type="text" className="quest-input" required value={manualData.student_id} onChange={e => setManualData({...manualData, student_id: e.target.value})} placeholder="e.g. 2024-0001" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--quest-text-secondary)', marginBottom: '4px' }}>Full Name</label>
              <input type="text" className="quest-input" required value={manualData.name} onChange={e => setManualData({...manualData, name: e.target.value})} placeholder="Last Name, First Name" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--quest-text-secondary)', marginBottom: '4px' }}>Course</label>
              <input type="text" className="quest-input" value={manualData.course} onChange={e => setManualData({...manualData, course: e.target.value})} placeholder="e.g. BSCS" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--quest-text-secondary)', marginBottom: '4px' }}>Year Level</label>
              <input type="text" className="quest-input" value={manualData.year} onChange={e => setManualData({...manualData, year: e.target.value})} placeholder="e.g. 4" />
            </div>
            <button type="submit" className="quest-btn quest-btn-primary" style={{ padding: '12px 24px' }}>Save Profile</button>
          </form>
        </div>
      )}

      <div className="quest-card">
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={16} color="var(--quest-text-muted)" style={{ position: 'absolute', left: '14px', top: '13px' }} />
            <input 
              type="text" 
              className="quest-input" 
              placeholder="Search by ID or Name..." 
              style={{ paddingLeft: '40px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ fontSize: '13px', color: 'var(--quest-text-secondary)', fontWeight: 600 }}>
            Total Enrolled: {students.length}
          </div>
        </div>

        <div className="quest-table-container">
          <table className="quest-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Full Name</th>
                <th>Course</th>
                <th>Year</th>
                <th>System Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>Loading roster...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--quest-text-secondary)' }}>No students found.</td></tr>
              ) : (
                filteredStudents.map(student => (
                  <tr key={student.id}>
                    <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--quest-primary)' }}>{student.student_id}</td>
                    <td style={{ fontWeight: 500 }}>{student.name}</td>
                    <td>{student.course}</td>
                    <td>{student.year}</td>
                    <td><span className="quest-badge badge-success">Authorized</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}