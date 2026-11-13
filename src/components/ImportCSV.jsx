import { useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUI } from './UIContext';
import { BC_PROGRAMS } from '../constants/academicPrograms';

// Digits only for Student / Alumni ID (e.g. 202401012)
const sanitizeStudentId = (raw) => {
  return String(raw || '').replace(/[^0-9]/g, '').slice(0, 15);
};

// Letters only, auto-uppercase, max 50 chars per name field
const sanitizeNamePart = (raw) => {
  return String(raw || '')
    .replace(/[^a-zA-ZÀ-ÿñÑ\s.-]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, 50);
};

const formatFullName = (first, middle, last) => {
  const f = (first || '').trim();
  const m = (middle || '').trim();
  const l = (last || '').trim();
  if (!l && !f) return '';
  return m ? `${l}, ${f} ${m}` : `${l}, ${f}`;
};

export default function ImportCSV({ setAdminSection }) {
  const { showToast, confirmAction } = useUI();
  const [file, setFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [fileError, setFileError] = useState('');

  // Updated Sample CSV: Numbers-only IDs + First, Middle, Last Name + Official Department Codes
  const handleDownloadSample = () => {
    const headers = 'Student ID,First Name,Middle Name,Last Name,Division,Course,Year';
    const sampleRows = [
      '202401012,JUAN,REYES,DELA CRUZ,CCS,BSCS,3',
      '202401013,MARIA,SANTOS,CLARA,CRIM,BSCRIM,2',
      '202401014,JOSE,MERCADO,RIZAL,LAW,JD,1',
      '202001055,PEDRO,LOPEZ,PENDUKO,EXTERNAL,ALUMNI,GRADUATED',
      '202502019,GABRIELA,CARIÑO,SILANG,GRADUATE,MM,2'
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...sampleRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'BC_Matik_Student_Sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded sample CSV with numeric Student IDs (e.g. 202401012).', 'success', 'Sample Downloaded');
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    setFile(selected || null);
    if (selected) setFileError('');
  };

  const handleImport = (e) => {
    e.preventDefault();
    if (!file) {
      setFileError('Please select a valid .csv file to upload');
      showToast('Please select a CSV file before clicking Import.', 'error', 'No File Selected');
      return;
    }

    confirmAction({
      title: 'Import Student & Alumni Roster?',
      message: `Are you sure you want to parse and import "${file.name}" into the official BC-Matik roster? Student IDs will be validated as numbers only.`,
      confirmText: 'Yes, Import CSV',
      variant: 'primary',
      onConfirm: () => processCSVFile(file)
    });
  };

  const processCSVFile = (csvFile) => {
    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        if (lines.length < 2) {
          showToast('The CSV file is empty or missing student rows.', 'error', 'Import Failed');
          setIsImporting(false);
          return;
        }

        const headerCols = lines[0].split(',').map(h => h.trim().toLowerCase());
        const isSevenColFormat = headerCols.length >= 7 || headerCols.includes('first name');

        const batch = writeBatch(db);
        let importedCount = 0;
        let skippedCount = 0;

        const validDivs = ['CRIM', 'BUSINESS', 'ASTE', 'CCS', 'LAW', 'GRADUATE', 'EXTERNAL', 'COLLEGE'];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));

          let rawId = '';
          let firstName = '';
          let middleName = '';
          let lastName = '';
          let rawDiv = '';
          let rawCourse = '';
          let rawYear = '';

          if (isSevenColFormat && cols.length >= 7) {
            [rawId, firstName, middleName, lastName, rawDiv, rawCourse, rawYear] = cols;
          } else if (cols.length >= 5) {
            // Backwards compatibility if admin uploads a 5-column CSV
            let fullName = '';
            [rawId, fullName, rawDiv, rawCourse, rawYear] = cols;
            const parts = fullName.trim().split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.length > 1 ? parts[parts.length - 1] : '';
            middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
          } else {
            skippedCount++;
            continue;
          }

          const cleanId = sanitizeStudentId(rawId);
          const cleanFirst = sanitizeNamePart(firstName);
          const cleanMiddle = sanitizeNamePart(middleName);
          const cleanLast = sanitizeNamePart(lastName);
          const cleanDiv = (rawDiv || '').toUpperCase().trim();
          const cleanCourse = (rawCourse || '').toUpperCase().trim();
          const cleanYear = (rawYear || '1').toUpperCase().trim();

          // Require numeric ID and at least First + Last name
          if (!cleanId || !cleanFirst || !cleanLast || !cleanCourse) {
            skippedCount++;
            continue;
          }

          const finalDiv = validDivs.includes(cleanDiv) ? cleanDiv : 'CCS';
          const combinedName = formatFullName(cleanFirst, cleanMiddle, cleanLast);

          const studentRef = doc(collection(db, 'students'), cleanId);
          batch.set(studentRef, {
            student_id: cleanId,
            first_name: cleanFirst,
            middle_name: cleanMiddle,
            last_name: cleanLast,
            name: combinedName,
            initial_password: cleanId, // Default initial password is their numeric Student ID
            division: finalDiv,
            course: cleanCourse,
            year: cleanYear,
            status: 'active',
            registered_at: new Date()
          }, { merge: true });

          importedCount++;
        }

        if (importedCount === 0) {
          showToast('No valid rows found. Make sure Student IDs contain numbers only (e.g. 202401012).', 'error', 'Import Failed');
          setIsImporting(false);
          return;
        }

        await batch.commit();
        showToast(
          `Imported ${importedCount} student/alumni record(s) into the roster!${skippedCount > 0 ? ` (${skippedCount} invalid row(s) skipped)` : ''}`,
          'success',
          'CSV Import Complete'
        );
        setFile(null);
      } catch (err) {
        console.error('CSV Import Error:', err);
        showToast('Failed to parse and upload CSV file.', 'error', 'Import Error');
      }
      setIsImporting(false);
    };

    reader.readAsText(csvFile);
  };

  return (
    <div>
      {/* Unified Page Header Banner */}
      <div className="quest-page-banner">
        <div>
          <h1>Import Student & Alumni Roster</h1>
          <p>
            Batch-upload numeric Student IDs (e.g. 202401012), uppercase names, and department assignments via CSV.
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      {/* 3-Step Guide Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="quest-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              1
            </div>
            <div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#0F172A' }}>Download the sample CSV</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#64748B', lineHeight: 1.5 }}>
                Includes sample rows with numeric IDs (<code>202401012</code>), First/Middle/Last Name columns, and official department codes.
              </p>
              <button onClick={handleDownloadSample} className="quest-btn quest-btn-outline" style={{ padding: '7px 14px', fontSize: '12px' }}>
                <Download size={14} /> Download Sample CSV
              </button>
            </div>
          </div>
        </div>

        <div className="quest-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              2
            </div>
            <div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#0F172A' }}>Fill in the columns</h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B', lineHeight: 1.5 }}>
                <strong>Student ID</strong> must contain numbers only (e.g. <code>202401012</code>). Names are automatically capitalized and sanitized.
              </p>
            </div>
          </div>
        </div>

        <div className="quest-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              3
            </div>
            <div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#0F172A' }}>Upload and import</h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B', lineHeight: 1.5 }}>
                Upload the completed CSV file below, confirm the prompt, and records will sync directly to the Student Roster.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Column Headers Reference Card */}
      <div className="quest-card" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#0F172A' }}>CSV Column Headers</h3>
        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748B' }}>
          Keep these column headers in your spreadsheet so every student and alumni profile maps cleanly:
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
          {['Student ID * (Numbers Only)', 'First Name *', 'Middle Name', 'Last Name *', 'Division *', 'Course *', 'Year *'].map((col) => (
            <span
              key={col}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                fontWeight: 700,
                color: '#0F172A'
              }}
            >
              {col.replace('*', '')} {col.includes('*') && <span className="quest-req-star">*</span>}
            </span>
          ))}
        </div>

        <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '16px 20px', fontSize: '12.5px', color: '#92400E', lineHeight: 1.65 }}>
          <strong style={{ display: 'block', marginBottom: '4px' }}>Important Notes for Roster Formatting:</strong>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li><strong>Student ID</strong> must be numbers only (e.g., <code>202401012</code>) with no hyphens or letters.</li>
            <li><strong>First Name, Middle Name, Last Name</strong> are automatically capitalized (max 50 characters each, letters only).</li>
            <li><strong>Division</strong> must be one of: <code>CCS</code>, <code>CRIM</code>, <code>BUSINESS</code>, <code>ASTE</code>, <code>LAW</code>, <code>GRADUATE</code>, or <code>EXTERNAL</code>.</li>
            <li><strong>Course</strong> must use official BC codes (e.g., <code>BSCS</code>, <code>BLIS</code>, <code>BSCRIM</code>, <code>BSA</code>, <code>BSBA</code>, <code>BEED</code>, <code>BSED</code>, <code>JD</code>, <code>MM</code>, <code>MAED</code>, <code>ALUMNI</code>).</li>
          </ul>
        </div>
      </div>

      {/* Upload Form Card */}
      <div className="quest-card">
        <form onSubmit={handleImport} noValidate>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>
            Upload Student CSV <span className="quest-req-star">*</span>
          </label>

          <div
            style={{
              border: `1.5px dashed ${fileError ? '#DC2626' : '#CBD5E1'}`,
              backgroundColor: fileError ? '#FEF2F2' : '#F8FAFC',
              borderRadius: '14px',
              padding: '28px 20px',
              textAlign: 'center',
              marginBottom: '16px'
            }}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ fontSize: '13px', color: '#475569' }}
            />
            {file && (
              <div style={{ marginTop: '10px', fontSize: '12.5px', fontWeight: 700, color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} /> Selected: {file.name}
              </div>
            )}
            {fileError && (
              <div className="quest-error-text" style={{ marginTop: '8px', justifyContent: 'center' }}>
                {fileError}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isImporting}
            className="quest-btn quest-btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '14px' }}
          >
            <Upload size={17} /> {isImporting ? 'Validating & Importing Roster...' : 'Import CSV'}
          </button>
        </form>
      </div>
    </div>
  );
}