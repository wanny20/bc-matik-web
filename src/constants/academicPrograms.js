// src/constants/academicPrograms.js

export const ACADEMIC_DIVISIONS = [
  { id: 'CRIM', label: 'Criminal Justice Education' },
  { id: 'BUSINESS', label: 'Business Education' },
  { id: 'ASTE', label: 'Arts, Sciences & Teacher Education' },
  { id: 'CCS', label: 'Computer Studies' },
  { id: 'LAW', label: 'School of Law' },
  { id: 'GRADUATE', label: 'Graduate School' },
  { id: 'EXTERNAL', label: 'Alumni & Guests' }
];

export const BC_PROGRAMS = {
  CRIM: [
    { code: 'BSCRIM', name: 'BS in Criminology' },
    { code: 'BSCRIMETEEAP', name: 'BS in Criminology (ETEEAP)' }
  ],
  BUSINESS: [
    { code: 'BSAIS', name: 'BS in Accounting Information System' },
    { code: 'BSA', name: 'BS in Accountancy' },
    { code: 'BSBA', name: 'BS in Business Administration' },
    { code: 'BSE', name: 'BS Entrepreneurship' },
    { code: 'BSTM', name: 'BS in Tourism Management' },
    { code: 'BSHM', name: 'BS in Hospitality Management' }
  ],
  ASTE: [
    { code: 'ABENGLISH', name: 'AB English' },
    { code: 'ABPOLSCI', name: 'AB Political Science' },
    { code: 'BEED', name: 'Bachelor of Elementary Education' },
    { code: 'BECED', name: 'Bachelor of Early Childhood Education' },
    { code: 'BPED', name: 'Bachelor of Physical Education' },
    { code: 'BSED', name: 'Bachelor of Secondary Education' }
  ],
  CCS: [
    { code: 'BSCS', name: 'BS in Computer Science' },
    { code: 'BLIS', name: 'Bachelor of Library and Information Science' }
  ],
  LAW: [
    { code: 'JD', name: 'Juris Doctor (Bachelor of Laws)' }
  ],
  GRADUATE: [
    { code: 'EDD.', name: 'Doctor of Education' },
    { code: 'PHD', name: 'Doctor of Philosophy in Management' },
    { code: 'MAED', name: 'Master of Arts in Education' },
    { code: 'MED', name: 'Master in Education' },
    { code: 'MM', name: 'Master in Management' },
    { code: 'MSCJ', name: 'Master of Science in Criminal Justice' }
  ],
  EXTERNAL: [
    { code: 'ALUMNI', name: 'Bicol College Alumni / Graduate' },
    { code: 'GUEST', name: 'Walk-In Guest / Parent / Visitor' }
  ]
};

// Backwards-compatibility alias for any legacy 'COLLEGE' student records
BC_PROGRAMS.COLLEGE = [
  ...BC_PROGRAMS.CRIM,
  ...BC_PROGRAMS.BUSINESS,
  ...BC_PROGRAMS.ASTE,
  ...BC_PROGRAMS.CCS
];

export const ALL_PROGRAM_CODES = [
  ...BC_PROGRAMS.CRIM,
  ...BC_PROGRAMS.BUSINESS,
  ...BC_PROGRAMS.ASTE,
  ...BC_PROGRAMS.CCS,
  ...BC_PROGRAMS.LAW,
  ...BC_PROGRAMS.GRADUATE,
  ...BC_PROGRAMS.EXTERNAL
];