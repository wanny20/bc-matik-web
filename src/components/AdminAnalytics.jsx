import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, Clock, Users, CheckCircle } from 'lucide-react';

export default function AdminAnalytics() {
  const [metrics, setMetrics] = useState({
    total: 0,
    completed: 0,
    avgWaitTime: 0,
    chartData: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      const querySnapshot = await getDocs(collection(db, "tickets"));
      const tickets = querySnapshot.docs.map(doc => doc.data());

      let totalWaitMins = 0;
      let validWaitCount = 0;
      const officeStats = {};

      tickets.forEach(ticket => {
        const office = ticket.target_office_id || "Unknown";
        if (!officeStats[office]) {
          officeStats[office] = { name: office, total: 0, completed: 0, waitTime: 0, waitCount: 0 };
        }

        officeStats[office].total += 1;

        if (ticket.status === "completed") {
          officeStats[office].completed += 1;
        }

        if (ticket.timestamps?.activated_at && ticket.timestamps?.called_at) {
          const activated = ticket.timestamps.activated_at.toMillis();
          const called = ticket.timestamps.called_at.toMillis();
          const waitMins = (called - activated) / 1000 / 60; 
          
          if (waitMins >= 0) { 
            officeStats[office].waitTime += waitMins;
            officeStats[office].waitCount += 1;
            totalWaitMins += waitMins;
            validWaitCount += 1;
          }
        }
      });

      const chartData = Object.values(officeStats).map(stat => ({
        name: stat.name,
        Volume: stat.total,
        Completed: stat.completed,
        AvgWait: stat.waitCount > 0 ? Math.round(stat.waitTime / stat.waitCount) : 0
      }));

      setMetrics({
        total: tickets.length,
        completed: tickets.filter(t => t.status === "completed").length,
        avgWaitTime: validWaitCount > 0 ? Math.round(totalWaitMins / validWaitCount) : 0,
        chartData: chartData
      });
      setLoading(false);
    };

    fetchAnalytics();
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--quest-text-secondary)' }}>Crunching Campus Data...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', marginBottom: '4px' }}>System Performance Overview</h1>
          <p style={{ margin: 0, color: 'var(--quest-text-secondary)', fontSize: '14px' }}>
            Live metrics and historical analytics for Bicol College service offices.
          </p>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <MetricCard icon={<Users size={24} color="var(--quest-primary)" />} bg="var(--quest-primary-light)" title="Total Generated Tickets" value={metrics.total} />
        <MetricCard icon={<CheckCircle size={24} color="var(--quest-success)" />} bg="var(--quest-success-bg)" title="Completed Transactions" value={metrics.completed} />
        <MetricCard icon={<Clock size={24} color="#B45309" />} bg="var(--quest-warning-bg)" title="Campus Avg Wait Time" value={`${metrics.avgWaitTime} mins`} />
        <MetricCard icon={<TrendingUp size={24} color="var(--quest-info)" />} bg="var(--quest-info-bg)" title="Completion Rate" value={`${metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0}%`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        
        <div className="quest-card" style={{ padding: '24px', overflow: 'hidden' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>Transaction Volume by Office</h3>
          <div style={{ height: '320px', width: '100%', position: 'relative' }}>
            {/* Added debounce={50} to prevent ResizeObserver crash during sidebar animation */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={metrics.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--quest-border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--quest-text-secondary)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--quest-text-secondary)' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--quest-surface)', border: '1px solid var(--quest-border)', borderRadius: '8px', fontSize: '13px' }}
                    cursor={{fill: 'var(--quest-bg-secondary)'}} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                  <Bar dataKey="Volume" fill="var(--quest-primary)" radius={[4, 4, 0, 0]} name="Total Tickets" />
                  <Bar dataKey="Completed" fill="var(--quest-success)" radius={[4, 4, 0, 0]} name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="quest-card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>Bottleneck Report (Wait Times)</h3>
          
          {metrics.chartData.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--quest-text-muted)' }}>No wait time data recorded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* CRITICAL FIX: Added [...metrics.chartData] to create a shallow copy before sorting, preventing fatal state mutation */}
              {[...metrics.chartData].sort((a, b) => b.AvgWait - a.AvgWait).map((office, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', backgroundColor: 'var(--quest-bg-main)', border: '1px solid var(--quest-border)', borderRadius: '10px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--quest-text-primary)' }}>{office.name}</span>
                  <span className={`quest-badge ${office.AvgWait > 15 ? 'badge-danger' : 'badge-success'}`}>
                    {office.AvgWait} mins
                  </span>
                </div>
              ))}
            </div>
          )}
          
          <p style={{ fontSize: '12px', color: 'var(--quest-text-secondary)', marginTop: '24px', lineHeight: 1.5 }}>
            * Offices with wait times exceeding 15 minutes highlight potential staffing bottlenecks and should be monitored.
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, bg, title, value }) {
  return (
    <div className="quest-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ backgroundColor: bg, padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: '0 0 2px 0', fontSize: '12px', color: 'var(--quest-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{title}</p>
        <h2 className="outfit-number" style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>{value}</h2>
      </div>
    </div>
  );
}