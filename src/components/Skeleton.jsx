import './Skeleton.css';

export function SkeletonBlock({ width = '100%', height = '16px', className = '', style = {} }) {
  return (
    <div 
      className={`quest-skeleton ${className}`} 
      style={{ width, height, ...style }} 
    />
  );
}

/* Reusable Table Rows Skeleton */
export function SkeletonTableRows({ rows = 5, cols = 5 }) {
  const widths = ['65%', '80%', '55%', '70%', '50%', '60%'];
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx}>
          {Array.from({ length: cols }).map((__, cIdx) => (
            <td key={cIdx} style={{ padding: '16px' }}>
              {cIdx === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <SkeletonBlock width="32px" height="32px" className="skeleton-circle" />
                  <SkeletonBlock width="110px" height="14px" />
                </div>
              ) : (
                <SkeletonBlock 
                  width={widths[(rIdx + cIdx) % widths.length]} 
                  height="14px" 
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* Reusable Workflow Cards Skeleton */
export function SkeletonWorkflowCards({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#FFFFFF' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ width: '60%' }}>
              <SkeletonBlock width="55%" height="18px" style={{ marginBottom: '8px' }} />
              <SkeletonBlock width="85%" height="12px" />
            </div>
            <SkeletonBlock width="24px" height="24px" />
          </div>
          <SkeletonBlock width="100%" height="38px" style={{ marginBottom: '12px', borderRadius: '8px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <SkeletonBlock width="80px" height="22px" className="skeleton-pill" />
            <SkeletonBlock width="95px" height="22px" className="skeleton-pill" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* System Configuration Page Skeleton */
export function SkeletonConfigPage() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <SkeletonBlock width="260px" height="28px" style={{ marginBottom: '8px' }} />
          <SkeletonBlock width="380px" height="14px" />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <SkeletonBlock width="140px" height="40px" />
          <SkeletonBlock width="140px" height="40px" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="quest-card">
          <SkeletonBlock width="200px" height="20px" style={{ marginBottom: '20px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <SkeletonBlock width="100%" height="42px" />
            <SkeletonBlock width="100%" height="42px" />
          </div>
          <SkeletonBlock width="90%" height="12px" />
        </div>
        <div className="quest-card">
          <SkeletonBlock width="200px" height="20px" style={{ marginBottom: '20px' }} />
          <SkeletonBlock width="100%" height="84px" />
        </div>
      </div>
    </div>
  );
}

/* Full App Boot Shell Skeleton */
export function SkeletonAppShell() {
  return (
    <div className="skeleton-app-shell">
      <div className="skeleton-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #E2E8F0' }}>
          <SkeletonBlock width="38px" height="38px" style={{ borderRadius: '10px' }} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="100px" height="16px" style={{ marginBottom: '6px' }} />
            <SkeletonBlock width="130px" height="11px" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} width="100%" height="40px" style={{ borderRadius: '8px' }} />
        ))}
      </div>
      <div className="skeleton-main">
        <div className="skeleton-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SkeletonBlock width="32px" height="32px" />
            <SkeletonBlock width="110px" height="24px" className="skeleton-pill" />
            <SkeletonBlock width="240px" height="14px" />
          </div>
          <SkeletonBlock width="180px" height="36px" className="skeleton-pill" />
        </div>
        <div className="skeleton-content">
          <SkeletonBlock width="280px" height="30px" style={{ marginBottom: '10px' }} />
          <SkeletonBlock width="420px" height="15px" style={{ marginBottom: '28px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="quest-card" style={{ padding: '20px' }}>
                <SkeletonBlock width="60%" height="12px" style={{ marginBottom: '12px' }} />
                <SkeletonBlock width="40%" height="32px" />
              </div>
            ))}
          </div>
          <div className="quest-card" style={{ height: '320px' }}>
            <SkeletonBlock width="100%" height="100%" />
          </div>
        </div>
      </div>
    </div>
  );
}