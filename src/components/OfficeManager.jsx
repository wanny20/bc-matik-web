import { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function OfficeManager() {
  const [offices, setOffices] = useState([]);
  const [newOfficeName, setNewOfficeName] = useState("");
  const [isMajor, setIsMajor] = useState(true);

  // Fetch offices from Firestore
  const fetchOffices = async () => {
    const querySnapshot = await getDocs(collection(db, "offices"));
    const officesData = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setOffices(officesData);
  };

  useEffect(() => {
    fetchOffices();
  }, []);

  // Add a new office dynamically
  const handleAddOffice = async (e) => {
    e.preventDefault();
    if (!newOfficeName.trim()) return;

    await addDoc(collection(db, "offices"), {
      office_name: newOfficeName,
      is_major: isMajor,
      is_online: true,
      current_pin: isMajor ? null : Math.floor(1000 + Math.random() * 9000).toString()
    });

    setNewOfficeName("");
    fetchOffices(); // Refresh the list
  };

  // Toggle Major/Minor status
  const toggleOfficeType = async (id, currentStatus) => {
    const officeRef = doc(db, "offices", id);
    await updateDoc(officeRef, {
      is_major: !currentStatus
    });
    fetchOffices();
  };

  return (
    <div className="m3-card">
      <h2>Office Management</h2>
      
      {/* Zero-Code Add Form */}
      <form onSubmit={handleAddOffice} className="form-group" style={{ marginBottom: '24px' }}>
        <input 
          type="text" 
          placeholder="New Office Name (e.g. Clinic)" 
          value={newOfficeName}
          onChange={(e) => setNewOfficeName(e.target.value)}
        />
        <select value={isMajor} onChange={(e) => setIsMajor(e.target.value === 'true')}>
          <option value="true">Major Office (Full Dashboard)</option>
          <option value="false">Minor Office (PIN Only)</option>
        </select>
        <button type="submit" className="btn-primary">Add Office</button>
      </form>

      {/* Horizontally Scrollable Data Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Office Name</th>
              <th>Classification</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {offices.map((office) => (
              <tr key={office.id}>
                <td style={{ fontWeight: '600' }}>{office.office_name}</td>
                <td>
                  <span style={{ 
                    padding: '4px 12px', 
                    borderRadius: '12px', 
                    backgroundColor: office.is_major ? '#E3F2FD' : '#FFF9C4',
                    color: office.is_major ? '#1565C0' : '#F57F17',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}>
                    {office.is_major ? 'MAJOR' : 'MINOR'}
                  </span>
                </td>
                <td>{office.is_online ? '🟢 Online' : '🔴 Offline'}</td>
                <td>
                  <button 
                    onClick={() => toggleOfficeType(office.id, office.is_major)}
                    style={{ background: 'none', border: '1px solid #CCC', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Switch to {office.is_major ? 'Minor' : 'Major'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}