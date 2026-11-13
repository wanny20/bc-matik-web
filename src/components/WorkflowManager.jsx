import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Plus, Trash2, FileCheck, ArrowRight, X, Edit3, Eye, Sparkles, Clock } from 'lucide-react';
import { useUI } from './UIContext';
import { SkeletonWorkflowCards } from './Skeleton';
import './WorkflowManager.css';

export default function WorkflowManager({ setAdminSection, role = 'admin', assignedOffice = null }) {
  const { showToast, confirmAction } = useUI();
  const [workflows, setWorkflows] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create / Edit Workflow Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingWorkflow, setViewingWorkflow] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('');
  const [requirements, setRequirements] = useState([]);
  const [reqInput, setReqInput] = useState('');

  // Multi-Day Document Processing Settings
  const [requiresProcessing, setRequiresProcessing] = useState(false);
  const [processingDays, setProcessingDays] = useState(3);
  const [releasingOffice, setReleasingOffice] = useState('Registrar');

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMiniAdmin = role === 'mini_admin';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const officeSnap = await getDocs(collection(db, 'offices'));
    const officeData = officeSnap.docs.map(d => d.data().office_name);
    setOffices(officeData);

    if (isMiniAdmin && assignedOffice) {
      setSelectedOffice(assignedOffice);
      setReleasingOffice(assignedOffice);
    } else if (officeData.length > 0) {
      setSelectedOffice(officeData[0]);
      setReleasingOffice(officeData.includes('Registrar') ? 'Registrar' : officeData[0]);
    }

    const flowSnap = await getDocs(collection(db, 'workflows'));
    let flowList = flowSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (isMiniAdmin && assignedOffice) {
      flowList = flowList.filter(
        f => f.owner_office === assignedOffice || (f.steps || []).includes(assignedOffice) || f.releasing_office === assignedOffice
      );
    }

    setWorkflows(flowList);
    setLoading(false);
  }, [isMiniAdmin, assignedOffice]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSeedDefaultWorkflows = async () => {
    setIsSubmitting(true);
    try {
      const defaults = [
        {
          title: 'TOR / Diploma Request',
          description: '3-Step Guided Route for Official Transcript and Diploma Release',
          steps: ['Accounting', 'Cashier', 'Registrar'],
          requirements: ['Valid Bicol College Student / Alumni ID', 'Signed Clearance Form'],
          requires_processing: true,
          processing_days: 5,
          releasing_office: 'Registrar',
          owner_office: 'ALL',
          created_at: new Date()
        },
        {
          title: 'Good Moral Certificate Request',
          description: '2-Step Route: Cashier Payment ➔ OSA Processing & Release',
          steps: ['Cashier', 'OSA'],
          requirements: ['Official Receipt from Cashier', 'Valid Student ID'],
          requires_processing: true,
          processing_days: 2,
          releasing_office: 'OSA',
          owner_office: 'ALL',
          created_at: new Date()
        },
        {
          title: 'Enrollment / Exam Permit',
          description: 'Same-Day Guided Route for Tuition Assessment and Payment',
          steps: ['Accounting', 'Cashier'],
          requirements: ['Assessment Form', 'Previous Official Receipt'],
          requires_processing: false,
          processing_days: 0,
          releasing_office: 'Cashier',
          owner_office: 'ALL',
          created_at: new Date()
        }
      ];

      for (const wf of defaults) {
        await addDoc(collection(db, 'workflows'), wf);
      }
      showToast('Default Bicol College workflows (with multi-day processing settings) synced!', 'success', 'Workflows Synced');
      fetchData();
    } catch (e) {
      showToast('Failed to seed default workflows.', 'error');
    }
    setIsSubmitting(false);
  };

  const addStep = () => {
    if (selectedOffice) {
      const updated = [...steps, selectedOffice];
      setSteps(updated);
      setReleasingOffice(updated[updated.length - 1]);
      if (errors.steps) setErrors({ ...errors, steps: '' });
    }
  };

  const addRequirement = () => {
    if (reqInput.trim()) {
      setRequirements([...requirements, reqInput.trim()]);
      setReqInput('');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setSteps(isMiniAdmin && assignedOffice ? [assignedOffice] : []);
    setRequirements([]);
    setReqInput('');
    setRequiresProcessing(false);
    setProcessingDays(3);
    setReleasingOffice(isMiniAdmin && assignedOffice ? assignedOffice : 'Registrar');
    setErrors({});
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEditSelect = (flow) => {
    setEditingId(flow.id);
    setTitle(flow.title || '');
    setDescription(flow.description || '');
    setSteps(flow.steps || []);
    setRequirements(flow.requirements || []);
    setRequiresProcessing(flow.requires_processing || false);
    setProcessingDays(flow.processing_days || 3);
    setReleasingOffice(flow.releasing_office || (flow.steps?.slice(-1)[0]) || 'Registrar');
    setReqInput('');
    setErrors({});
    setIsModalOpen(true);
  };

  const closeWorkflowModal = () => {
    const isDirty = title.trim() !== '' || description.trim() !== '' || requirements.length > 0 || reqInput.trim() !== '';
    if (!isDirty) {
      resetForm();
      return;
    }
    confirmAction({
      title: 'Discard Workflow Changes?',
      message: 'You have unsaved workflow steps or requirements. Are you sure you want to close and lose your changes?',
      confirmText: 'Discard',
      variant: 'danger',
      onConfirm: () => resetForm()
    });
  };

  const handleSaveWorkflow = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Transaction Title is required';
    if (steps.length === 0) newErrors.steps = 'Routing Sequence is required (add at least 1 step)';
    if (isMiniAdmin && assignedOffice && !steps.includes(assignedOffice)) {
      newErrors.steps = `As ${assignedOffice} Mini Admin, the workflow must include ${assignedOffice}`;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const finalReleasingOffice = requiresProcessing ? (releasingOffice || steps[steps.length - 1]) : steps[steps.length - 1];
      const payload = {
        title: title.trim(),
        description: description.trim(),
        steps,
        requirements,
        requires_processing: requiresProcessing,
        processing_days: requiresProcessing ? Number(processingDays) || 3 : 0,
        releasing_office: finalReleasingOffice,
        owner_office: isMiniAdmin ? assignedOffice : 'ALL',
        updated_at: new Date()
      };

      if (editingId) {
        await updateDoc(doc(db, 'workflows', editingId), payload);
        showToast(`"${title.trim()}" workflow updated.`, "success", "Workflow Updated");
      } else {
        await addDoc(collection(db, 'workflows'), {
          ...payload,
          created_at: new Date()
        });
        showToast(`"${title.trim()}" workflow deployed to the student mobile app.`, "success", "Workflow Deployed");
      }
      resetForm();
      fetchData();
    } catch (e) {
      showToast("Failed to save transaction workflow.", "error");
    }
    setIsSubmitting(false);
  };

  const handleDelete = (flow) => {
    confirmAction({
      title: 'Delete Transaction Workflow?',
      message: `Are you sure you want to delete "${flow.title}"? Students will no longer see this guided route in the mobile app.`,
      confirmText: 'Delete Workflow',
      variant: 'danger',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'workflows', flow.id));
        showToast(`Deleted "${flow.title}" workflow.`, "success");
        if (editingId === flow.id) resetForm();
        fetchData();
      }
    });
  };

return (
    <div>
      {/* Unified Page Header Banner (Only Back to Dashboard Button) */}
      <div className="quest-page-banner">
        <div>
          <h1>
            Transaction Workflows {isMiniAdmin ? `(${assignedOffice} Scope)` : '(All Campus Offices)'}
          </h1>
          <p>
            {isMiniAdmin 
              ? `Create and modify transaction workflows and multi-day document processing rules for ${assignedOffice}.`
              : 'Define multi-office guided routes, document checklists, and automated multi-day processing schedules.'}
          </p>
        </div>
        <button onClick={() => setAdminSection('dashboard')} className="quest-back-pill-btn">
          Back to Dashboard
        </button>
      </div>

      <div className="flow-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '12px' }}>
          <h3 className="flow-title" style={{ margin: 0 }}>
            {isMiniAdmin ? `${assignedOffice} Active Workflows (${workflows.length})` : `All Active Campus Workflows (${workflows.length})`}
          </h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!isMiniAdmin && workflows.length === 0 && !loading && (
              <button
                onClick={handleSeedDefaultWorkflows}
                disabled={isSubmitting}
                className="quest-btn quest-btn-outline"
                style={{ borderRadius: '999px', fontSize: '12px', padding: '9px 16px' }}
              >
                <Sparkles size={15} color="var(--quest-primary)" /> Load Default BC Workflows
              </button>
            )}
            <button
              onClick={openCreateModal}
              className="quest-btn quest-btn-primary"
              style={{ borderRadius: '999px', padding: '10px 20px' }}
            >
              <Plus size={16} /> Build New Workflow
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonWorkflowCards count={3} />
        ) : workflows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--quest-text-secondary)' }}>
            <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: '#0F172A' }}>No workflows configured in Firestore yet.</p>
            <p style={{ margin: 0, fontSize: '13px' }}>
              Click <strong>"+ Build New Workflow"</strong> at the top right or <strong>"Load Default BC Workflows"</strong> to sync routes with the Android app.
            </p>
          </div>
        ) : (
          <div className="flow-grid">
            {workflows.map(flow => (
              <div key={flow.id} className="flow-item-card">
                <div className="flow-item-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--quest-primary)' }}>{flow.title}</h4>
                      {flow.requires_processing ? (
                        <span className="quest-badge badge-warning" style={{ fontSize: '10px' }}>
                          <Clock size={11} /> {flow.processing_days || 3}-DAY PROCESSING ({flow.releasing_office || flow.steps?.slice(-1)[0]})
                        </span>
                      ) : (
                        <span className="quest-badge badge-success" style={{ fontSize: '10px' }}>SAME-DAY TRANSACTION</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--quest-text-secondary)' }}>{flow.description || 'Guided multi-office transaction'}</p>
                  </div>
                  <div className="quest-action-group">
                    <button onClick={() => setViewingWorkflow(flow)} className="quest-icon-btn view" title="View Workflow Details">
                      <Eye size={16} />
                    </button>
                    <button onClick={() => handleEditSelect(flow)} className="quest-icon-btn edit" title="Edit Workflow">
                      <Edit3 size={15} />
                    </button>
                    <button onClick={() => handleDelete(flow)} className="quest-icon-btn delete" title="Delete Workflow">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', backgroundColor: 'var(--quest-bg-secondary)', padding: '10px', borderRadius: '8px' }}>
                  {(flow.steps || []).map((step, idx) => (
                    <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}>
                      {step} {idx < flow.steps.length - 1 && <ArrowRight size={14} color="var(--quest-text-muted)" />}
                    </span>
                  ))}
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--quest-text-muted)', marginBottom: '4px' }}>
                    REQUIRED DOCUMENTS ({flow.requirements?.length || 0})
                  </div>
                  {flow.requirements?.map((req, idx) => <span key={idx} className="flow-req-tag">{req}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 1. VIEW WORKFLOW DETAILS MODAL */}
      {viewingWorkflow && (
        <div className="quest-modal-backdrop" onClick={() => setViewingWorkflow(null)}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B' }}>{viewingWorkflow.title}</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>{viewingWorkflow.description || 'Guided Transaction Workflow'}</p>
              </div>
              <button onClick={() => setViewingWorkflow(null)} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <div className="quest-detail-box">
              <div className="quest-detail-row">
                <span className="quest-detail-label">Routing Sequence</span>
                <span className="quest-detail-value" style={{ color: 'var(--quest-primary)' }}>
                  {(viewingWorkflow.steps || []).join(' ➔ ')}
                </span>
              </div>
              <div className="quest-detail-row">
                <span className="quest-detail-label">Document Processing Type</span>
                <span className={`quest-badge ${viewingWorkflow.requires_processing ? 'badge-warning' : 'badge-success'}`}>
                  {viewingWorkflow.requires_processing ? `Multi-Day (${viewingWorkflow.processing_days || 3} Working Days)` : 'Same-Day Completion'}
                </span>
              </div>
              {viewingWorkflow.requires_processing && (
                <div className="quest-detail-row">
                  <span className="quest-detail-label">Releasing Department</span>
                  <span className="quest-detail-value">{viewingWorkflow.releasing_office || viewingWorkflow.steps?.slice(-1)[0]}</span>
                </div>
              )}
              <div className="quest-detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                <span className="quest-detail-label">Required Documents Checklist</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {(viewingWorkflow.requirements || []).length === 0 ? (
                    <span style={{ fontSize: '12px', color: '#64748B' }}>None specified</span>
                  ) : (
                    viewingWorkflow.requirements.map((r, i) => (
                      <span key={i} className="flow-req-tag" style={{ margin: 0 }}>{r}</span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="quest-modal-actions">
              <button onClick={() => setViewingWorkflow(null)} className="quest-btn quest-btn-outline">Close</button>
              <button
                onClick={() => {
                  const target = viewingWorkflow;
                  setViewingWorkflow(null);
                  handleEditSelect(target);
                }}
                className="quest-btn quest-btn-primary"
              >
                <Edit3 size={15} /> Edit Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. BUILD / EDIT WORKFLOW POPUP MODAL */}
      {isModalOpen && (
        <div className="quest-modal-backdrop" onClick={closeWorkflowModal}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontFamily: 'var(--font-heading)' }}>
                  {editingId ? 'Modify Transaction Workflow' : 'Build New Transaction Workflow'}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Configure the office routing sequence, mandatory checklist, and document processing days.
                </p>
              </div>
              <button onClick={closeWorkflowModal} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveWorkflow} noValidate>
              <div className="flow-form-group">
                <label className="flow-label">
                  Transaction Title <span className="quest-req-star">*</span>
                </label>
                <input 
                  type="text" 
                  className={`quest-input ${errors.title ? 'input-error' : ''}`} 
                  placeholder={isMiniAdmin ? `e.g. ${assignedOffice} Transcript Request` : "e.g. TOR / Diploma Request"} 
                  value={title} 
                  onBlur={() => { if (!title.trim()) setErrors(prev => ({ ...prev, title: 'Transaction Title is required' })); }}
                  onChange={e => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors({ ...errors, title: '' });
                  }} 
                />
                {errors.title && <span className="quest-error-text">{errors.title}</span>}
              </div>
              
              <div className="flow-form-group">
                <label className="flow-label">Short Description</label>
                <input type="text" className="quest-input" placeholder="e.g. For alumni and graduating students" value={description} onChange={e => setDescription(e.target.value)} />
              </div>

              <div className="flow-form-group">
                <label className="flow-label">
                  Routing Sequence (The Queue Flow) <span className="quest-req-star">*</span>
                </label>
                {isMiniAdmin ? (
                  <div style={{ fontSize: '12px', color: 'var(--quest-text-secondary)', marginBottom: '8px' }}>
                    Assigned department included: <strong>{assignedOffice}</strong>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select className="quest-input" value={selectedOffice} onChange={e => setSelectedOffice(e.target.value)}>
                    {offices.map(off => <option key={off} value={off}>{off}</option>)}
                  </select>
                  <button type="button" onClick={addStep} className="quest-btn quest-btn-outline" style={{ whiteSpace: 'nowrap' }}>
                    <Plus size={16} /> Add Step
                  </button>
                </div>
                {errors.steps && <span className="quest-error-text" style={{ marginBottom: '8px' }}>{errors.steps}</span>}
                
                {steps.length > 0 && (
                  <div style={{ padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', maxHeight: '130px', overflowY: 'auto' }}>
                    {steps.map((step, idx) => (
                      <div key={idx} className="flow-list-item">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div className="flow-step-badge">{idx + 1}</div>
                          {step}
                        </div>
                        <button type="button" onClick={() => setSteps(steps.filter((_, i) => i !== idx))} className="quest-icon-btn delete" style={{ width: '28px', height: '28px' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MULTI-DAY DOCUMENT PROCESSING & RELEASE SCHEDULE */}
              <div style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: requiresProcessing ? '#FEF3C7' : '#F8FAFC',
                border: `1.5px solid ${requiresProcessing ? '#F59E0B' : '#E2E8F0'}`,
                marginBottom: '16px'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>
                      Requires Multi-Day Document Processing?
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                      Enable for requests like TOR, Diploma, or Certificates that take days before release
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={requiresProcessing}
                    onChange={(e) => setRequiresProcessing(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--quest-primary)', cursor: 'pointer' }}
                  />
                </label>

                {requiresProcessing && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #FCD34D' }}>
                    <div>
                      <label className="flow-label" style={{ fontSize: '11px' }}>
                        Est. Processing Days <span className="quest-req-star">*</span>
                      </label>
                      <select
                        className="quest-input"
                        value={processingDays}
                        onChange={(e) => setProcessingDays(Number(e.target.value))}
                      >
                        <option value={1}>1 Working Day</option>
                        <option value={2}>2 Working Days</option>
                        <option value={3}>3 Working Days</option>
                        <option value={5}>5 Working Days</option>
                        <option value={7}>7 Working Days</option>
                        <option value={14}>14 Working Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="flow-label" style={{ fontSize: '11px' }}>
                        Releasing Office (Receives Alerts) <span className="quest-req-star">*</span>
                      </label>
                      <select
                        className="quest-input"
                        value={releasingOffice}
                        onChange={(e) => setReleasingOffice(e.target.value)}
                      >
                        {offices.map(off => <option key={off} value={off}>{off}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flow-form-group">
                <label className="flow-label">Required Documents Checklist</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    className="quest-input"
                    placeholder="e.g. Valid ID, Clearance Form"
                    value={reqInput}
                    onChange={e => setReqInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRequirement())}
                  />
                  <button type="button" onClick={addRequirement} className="quest-btn quest-btn-outline">
                    <Plus size={16} />
                  </button>
                </div>
                
                {requirements.length > 0 && (
                  <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                    {requirements.map((req, idx) => (
                      <div key={idx} className="flow-list-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileCheck size={16} color="var(--quest-primary)" /> {req}
                        </div>
                        <button type="button" onClick={() => setRequirements(requirements.filter((_, i) => i !== idx))} className="quest-icon-btn delete" style={{ width: '28px', height: '28px' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="quest-modal-actions" style={{ marginTop: '18px' }}>
                <button type="button" onClick={closeWorkflowModal} className="quest-btn quest-btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="quest-btn quest-btn-primary">
                  {isSubmitting ? 'Saving...' : editingId ? 'Save Workflow Changes' : 'Deploy to Student App'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}