import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';

export default function WebLogin({ setRole, setOffice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const userDoc = await getDoc(doc(db, 'staff_users', uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setRole(userData.role);
        if (userData.role === 'admin') {
          navigate('/admin');
        } else if (userData.role === 'staff') {
          setOffice(userData.assigned_office);
          navigate('/staff');
        }
      } else {
        setError('Unauthorized account: No BC-Matik staff profile assigned.');
        auth.signOut();
      }
    } catch (err) {
      setError('Invalid institutional email or password.');
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: 'var(--quest-bg-main)', padding: '24px' }}>
      <div className="quest-card-clay" style={{ width: '100%', maxWidth: '420px', padding: '40px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div className="quest-logo-mark" style={{ width: '52px', height: '52px', fontSize: '20px', margin: '0 auto 14px', borderRadius: '14px' }}>
            BC
          </div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>BC-Matik Portal</h1>
          <p style={{ color: 'var(--quest-text-secondary)', marginTop: '6px', fontSize: '14px' }}>
            Bicol College Smart Multi-Office Queuing System
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'var(--quest-danger-bg)', color: 'var(--quest-danger)', padding: '12px', borderRadius: '10px', marginBottom: '18px', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: 'var(--quest-text-primary)' }}>
              Staff / Admin Email
            </label>
            <input 
              type="email" 
              className="quest-input"
              placeholder="registrar@bc.edu.ph"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: 'var(--quest-text-primary)' }}>
              Password
            </label>
            <input 
              type="password" 
              className="quest-input"
              placeholder="••••••••"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
            />
          </div>

          <button type="submit" disabled={loading} className="quest-btn-primary" style={{ marginTop: '8px', padding: '14px', fontSize: '15px', width: '100%' }}>
            <Lock size={16} /> {loading ? 'Verifying Credentials...' : 'Sign In to BC-Matik'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}