import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { useUI } from './UIContext';
import './AdminAnalytics.css';

export default function AdminAnalytics() {
  const { showToast } = useUI();
  const [tickets, setTickets] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('ALL'); // 'TODAY' | '7D' | 'ALL'

  useEffect(() => {
    const unsubOffices = onSnapshot(collection(db, 'offices'), (snap) => {
      setOffices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubTickets = onSnapshot(collection(db, 'tickets'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTickets(list);
      setLoading(false);
    });

    return () => {
      unsubOffices();
      unsubTickets();
    };
  }, []);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  // Helper to extract JS Date from Firestore Timestamp
  const getTicketDate = (t) => {
    const raw = t.timestamps?.booked_at || t.timestamps?.activated_at || t.created_at;
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  // 1. Filter tickets by selected Time Range & ignore blank legacy records without an office
  const validTickets = tickets.filter(t => {
    const hasValidOffice = t.target_office_id && t.target_office_id.trim() !== '' && t.target_office_id !== 'Unknown';
    if (!hasValidOffice) return false;

    if (timeRange === 'ALL') return true;
    const d = getTicketDate(t);
    if (!d) return false;
    const ms = d.getTime();
    if (timeRange === 'TODAY') return ms >= startOfToday;
    if (timeRange === '7D') return ms >= sevenDaysAgo;
    return true;
  });

  // 2. Compute Core KPIs
  const totalCount = validTickets.length;
  const completedCount = validTickets.filter(t => t.status === 'completed').length;
  const activeWaitingCount = validTickets.filter(t => ['active', 'called', 'resolved_requirements', 'booked'].includes(t.status)).length;
  const processingDocsCount = validTickets.filter(t => ['processing', 'ready_for_pickup'].includes(t.status)).length;
  const priorityCount = validTickets.filter(t => t.is_priority).length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  let totalWaitMins = 0;
  let validWaitCount = 0;
  const officeStatsMap = {};

  // Seed officeStatsMap with registered offices so all campus offices appear cleanly
  offices.forEach(off => {
    if (off.office_name) {
      officeStatsMap[off.office_name] = {
        name: off.office_name,
        total: 0,
        completed: 0,
        active: 0,
        waitTime: 0,
        waitCount: 0
      };
    }
  });

  validTickets.forEach(ticket => {
    const offName = ticket.target_office_id.trim();
    if (!officeStatsMap[offName]) {
      officeStatsMap[offName] = { name: offName, total: 0, completed: 0, active: 0, waitTime: 0, waitCount: 0 };
    }

    officeStatsMap[offName].total += 1;
    if (ticket.status === 'completed') officeStatsMap[offName].completed += 1;
    if (['active', 'called', 'resolved_requirements'].includes(ticket.status)) officeStatsMap[offName].active += 1;

    if (ticket.timestamps?.activated_at && ticket.timestamps?.called_at) {
      const actMs = ticket.timestamps.activated_at?.toMillis?.() || new Date(ticket.timestamps.activated_at).getTime();
      const callMs = ticket.timestamps.called_at?.toMillis?.() || new Date(ticket.timestamps.called_at).getTime();
      const waitMins = (callMs - actMs) / 1000 / 60;
      if (waitMins >= 0 && waitMins < 360) {
        officeStatsMap[offName].waitTime += waitMins;
        officeStatsMap[offName].waitCount += 1;
        totalWaitMins += waitMins;
        validWaitCount += 1;
      }
    }
  });

  const avgWaitTime = validWaitCount > 0 ? Math.round(totalWaitMins / validWaitCount) : 0;

  const chartData = Object.values(officeStatsMap)
    .filter(stat => stat.total > 0 || offices.some(o => o.office_name === stat.name))
    .map(stat => ({
      name: stat.name,
      Volume: stat.total,
      Completed: stat.completed,
      Active: stat.active,
      AvgWait: stat.waitCount > 0 ? Math.round(stat.waitTime / stat.waitCount) : 0
    }));

  // 3. Department / Client Group Distribution
  const deptCounts = {};
  validTickets.forEach(t => {
    const group = t.user_id?.includes('walk_in') || t.student_id === 'WALK-IN' || t.student_id?.startsWith('GUEST')
      ? 'WALK-IN / GUEST'
      : (t.student_course || t.student_division || 'REGISTERED STUDENT').toUpperCase();
    deptCounts[group] = (deptCounts[group] || 0) + 1;
  });

  const deptDistribution = Object.entries(deptCounts)
    .map(([label, count]) => ({
      label,
      count,
      pct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 4. Recent 5 Queue Events Across Campus
  const recentActivity = [...validTickets]
    .sort((a, b) => (getTicketDate(b)?.getTime() || 0) - (getTicketDate(a)?.getTime() || 0))
    .slice(0, 5);

  return (
    <div>
      {/* Unified Cream/Gold Page Header Banner */}
      <div className="quest-page-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ margin: 0 }}>System Performance Overview</h1>
            <span className="quest-badge badge-success" style={{ fontSize: '10.5px' }}>● LIVE TELEMETRY</span>
          </div>
          <p>
            Real-time queue telemetry, office workload distribution, and service bottleneck analytics across Bicol College.
          </p>
        </div>

        {/* Time Range Filter Pills */}
        <div className="analytics-range-bar">
          {[
            { id: 'TODAY', label: 'Today' },
            { id: '7D', label: 'Last 7 Days' },
            { id: 'ALL', label: 'All Time' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTimeRange(tab.id)}
              className={`analytics-range-pill ${timeRange === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => showToast('Live Firestore telemetry is synchronized.', 'success', 'Metrics Synced')}
            className="analytics-sync-btn"
            title="Sync Live Metrics"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 4-Column Typography-First Executive KPI Row (No Cluttered Icon Boxes) */}
      <div className="analytics-metrics-grid">
        <MetricCard
          accentColor="#9E0B03"
          title="Total Generated Tickets"
          value={totalCount}
          subLabel={`${priorityCount} Priority • ${Math.max(0, totalCount - priorityCount)} Regular`}
          badgeText={timeRange === 'TODAY' ? 'TODAY' : timeRange === '7D' ? '7 DAYS' : 'TOTAL'}
          badgeClass="badge-primary"
        />
        <MetricCard
          accentColor="#16A34A"
          title="Completed Transactions"
          value={completedCount}
          subLabel={`${activeWaitingCount} active in queue • ${processingDocsCount} in release`}
          badgeText="SERVED"
          badgeClass="badge-success"
        />
        <MetricCard
          accentColor="#D97706"
          title="Campus Avg Wait Time"
          value={`${avgWaitTime} mins`}
          subLabel={avgWaitTime <= 10 ? 'Within optimal SLA (<10m)' : 'Elevated hallway wait time'}
          badgeText={avgWaitTime <= 10 ? 'OPTIMAL' : 'HIGH LOAD'}
          badgeClass={avgWaitTime <= 10 ? 'badge-success' : 'badge-warning'}
        />
        <MetricCard
          accentColor="#0284C7"
          title="Completion Rate"
          value={`${completionRate}%`}
          subLabel={`${completedCount} of ${totalCount} total requests resolved`}
          badgeText={`${completionRate}% SLA`}
          badgeClass="badge-info"
        />
      </div>

      {/* Live Campus Office Terminal Status Strip */}
      {offices.length > 0 && (
        <div className="quest-card analytics-live-strip-card">
          <div className="analytics-strip-header">
            <span className="analytics-strip-title">LIVE CAMPUS TERMINALS ({offices.length})</span>
            <span className="analytics-strip-hint">Real-time hallway queue & counter status</span>
          </div>
          <div className="analytics-office-strip-grid">
            {offices.map(off => {
              const offTickets = tickets.filter(t => t.target_office_id === off.office_name);
              const nowServing = offTickets.find(t => t.status === 'called');
              const waitingCount = offTickets.filter(t => ['active', 'resolved_requirements'].includes(t.status)).length;

              return (
                <div key={off.id} className="analytics-office-mini-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{off.office_name}</span>
                    <span className="analytics-online-dot" style={{ color: off.is_online ? '#16A34A' : '#94A3B8' }}>
                      ● {off.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>
                      {nowServing ? (
                        <>Serving: <strong style={{ color: 'var(--quest-primary)' }}>{nowServing.queue_number}</strong></>
                      ) : (
                        'Counter Idle'
                      )}
                    </span>
                    <span style={{ fontWeight: 700, color: waitingCount > 0 ? '#B45309' : '#64748B' }}>
                      {waitingCount} waiting
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Middle Row: Volume Bar Chart + Bottleneck SLA Report */}
      <div className="analytics-charts-grid">
        {/* Left: Bar Chart Card */}
        <div className="quest-card analytics-panel-card" style={{ overflow: 'hidden' }}>
          <div className="analytics-panel-header">
            <div>
              <h3 className="analytics-panel-title">Transaction Volume by Office</h3>
              <p className="analytics-panel-subtitle">Comparison of total generated tickets vs. completed transactions</p>
            </div>
          </div>
          <div className="analytics-chart-wrapper">
            <div className="analytics-chart-inner">
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '13px', boxShadow: '0 10px 20px -5px rgba(0,0,0,0.08)' }}
                    cursor={{ fill: '#F8FAFC' }} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12.5px', paddingTop: '12px', fontWeight: 600 }} />
                  <Bar dataKey="Volume" fill="#9E0B03" radius={[6, 6, 0, 0]} name="Total Tickets" barSize={32} />
                  <Bar dataKey="Completed" fill="#16A34A" radius={[6, 6, 0, 0]} name="Completed" barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right: Bottleneck Wait Time & Load Bar Report */}
        <div className="quest-card analytics-panel-card">
          <div className="analytics-panel-header">
            <div>
              <h3 className="analytics-panel-title">Bottleneck Report (Wait Times)</h3>
              <p className="analytics-panel-subtitle">Average hallway wait duration per service office</p>
            </div>
          </div>
          
          {chartData.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
              No wait time data recorded yet.
            </div>
          ) : (
            <div className="analytics-bottleneck-list">
              {[...chartData].sort((a, b) => b.AvgWait - a.AvgWait).map((office, idx) => {
                const loadPct = Math.min(100, Math.max(8, Math.round((office.AvgWait / 20) * 100)));
                const isBottleneck = office.AvgWait > 15;
                return (
                  <div key={idx} className="analytics-bottleneck-item">
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span className="analytics-office-name">{office.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                            {office.Volume} ticket(s)
                          </span>
                          <span className={`quest-badge ${isBottleneck ? 'badge-danger' : 'badge-success'}`}>
                            {office.AvgWait} mins
                          </span>
                        </div>
                      </div>
                      <div className="analytics-load-bar-track">
                        <div
                          className="analytics-load-bar-fill"
                          style={{
                            width: `${loadPct}%`,
                            backgroundColor: isBottleneck ? '#DC2626' : office.AvgWait > 8 ? '#D97706' : '#16A34A'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          <p className="analytics-footnote">
            * Offices with wait times exceeding 15 minutes highlight potential staffing bottlenecks and should be monitored.
          </p>
        </div>
      </div>

      {/* Bottom Row: Client Program Breakdown + Live Activity Stream */}
      <div className="analytics-bottom-grid">
        {/* Left: Client & Program Breakdown */}
        <div className="quest-card analytics-panel-card">
          <div className="analytics-panel-header">
            <div>
              <h3 className="analytics-panel-title">Queues by Program & Client Type</h3>
              <p className="analytics-panel-subtitle">Top academic programs and walk-in visitors using BCMatik</p>
            </div>
          </div>

          {deptDistribution.length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              No program distribution data available.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {deptDistribution.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 700, marginBottom: '5px' }}>
                    <span style={{ color: '#0F172A' }}>{item.label}</span>
                    <span style={{ color: '#64748B' }}>{item.count} tickets ({item.pct}%)</span>
                  </div>
                  <div className="analytics-load-bar-track">
                    <div
                      className="analytics-load-bar-fill"
                      style={{ width: `${Math.max(6, item.pct)}%`, backgroundColor: 'var(--quest-primary, #9E0B03)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Recent Live Activity Feed */}
        <div className="quest-card analytics-panel-card">
          <div className="analytics-panel-header">
            <div>
              <h3 className="analytics-panel-title">Recent Campus Queue Activity</h3>
              <p className="analytics-panel-subtitle">Latest 5 tickets booked or processed across offices</p>
            </div>
          </div>

          {recentActivity.length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              No recent ticket activity recorded.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentActivity.map(act => (
                <div key={act.id} className="analytics-activity-row">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '14px', color: 'var(--quest-primary)' }}>
                        {act.queue_number}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                        {act.student_name || 'Walk-in Guest'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      {act.target_office_id} • {act.transaction_purpose || 'General Inquiry'}
                    </div>
                  </div>
                  <span className={`quest-badge ${
                    act.status === 'completed' ? 'badge-success' :
                    act.status === 'called' ? 'badge-info' :
                    act.status === 'missed' ? 'badge-danger' : 'badge-warning'
                  }`}>
                    {(act.status || 'booked').toUpperCase().replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Clean Typography-First KPI Card (No Cluttered Icon Box) */
function MetricCard({ accentColor, title, value, subLabel, badgeText, badgeClass }) {
  return (
    <div className="quest-card analytics-metric-card" style={{ borderTop: `3.5px solid ${accentColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <p className="analytics-metric-label">{title}</p>
        <span className={`quest-badge ${badgeClass}`} style={{ fontSize: '10px', padding: '3px 8px' }}>
          {badgeText}
        </span>
      </div>
      <h2 className="outfit-number analytics-metric-value">{value}</h2>
      <p className="analytics-metric-sublabel">{subLabel}</p>
    </div>
  );
}

/* Custom Skeletal Loader for the Analytics Dashboard */
function AnalyticsSkeleton() {
  return (
    <div>
      <div className="quest-page-banner">
        <div>
          <SkeletonBlock width="280px" height="28px" style={{ marginBottom: '8px' }} />
          <SkeletonBlock width="380px" height="14px" />
        </div>
        <SkeletonBlock width="220px" height="38px" style={{ borderRadius: '999px' }} />
      </div>

      <div className="analytics-metrics-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="quest-card analytics-metric-card">
            <SkeletonBlock width="65%" height="12px" style={{ marginBottom: '12px' }} />
            <SkeletonBlock width="45%" height="32px" style={{ marginBottom: '10px' }} />
            <SkeletonBlock width="80%" height="11px" />
          </div>
        ))}
      </div>

      <div className="analytics-charts-grid">
        <div className="quest-card analytics-panel-card">
          <SkeletonBlock width="220px" height="20px" style={{ marginBottom: '24px' }} />
          <div style={{ height: '300px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '0 24px 16px', borderBottom: '1px solid #E2E8F0' }}>
            <SkeletonBlock width="14%" height="65%" style={{ borderRadius: '6px 6px 0 0' }} />
            <SkeletonBlock width="14%" height="90%" style={{ borderRadius: '6px 6px 0 0' }} />
            <SkeletonBlock width="14%" height="45%" style={{ borderRadius: '6px 6px 0 0' }} />
          </div>
        </div>

        <div className="quest-card analytics-panel-card">
          <SkeletonBlock width="240px" height="20px" style={{ marginBottom: '24px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} width="100%" height="54px" style={{ borderRadius: '12px' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}