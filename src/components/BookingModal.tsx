import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { getRelativeDateStr } from '../data/seedCatalog';
import { hasOverlap } from '../lib/labService';
import type { Equipment, SlotBlock } from '../types';

interface BookingModalProps {
  isOpen: boolean;
  equipment: Equipment | null;
  initialStartIso?: string;
  initialEndIso?: string;
  initialTitle?: string;
  initialSummary?: string;
  initialDeadlineIso?: string;
  slotBlocks: SlotBlock[];
  isSignedIn: boolean;
  defaultDepartment: string;
  onClose: () => void;
  onSignIn: () => void;
  onSubmit: (payload: {
    equipment: Equipment;
    department: string;
    projectTitle: string;
    projectSummary: string;
    courseOrLabCode: string;
    deadlineIso: string;
    startIso: string;
    endIso: string;
  }) => Promise<void>;
}

export function BookingModal({
  isOpen,
  equipment,
  initialStartIso,
  initialEndIso,
  initialTitle,
  initialSummary,
  initialDeadlineIso,
  slotBlocks,
  isSignedIn,
  defaultDepartment,
  onClose,
  onSignIn,
  onSubmit,
}: BookingModalProps) {
  const defaultDate = getRelativeDateStr(1);
  const [department, setDepartment] = useState(defaultDepartment);
  const [courseOrLabCode, setCourseOrLabCode] = useState('ECE 482');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectSummary, setProjectSummary] = useState('');
  const [startIso, setStartIso] = useState(`${defaultDate}T10:00`);
  const [endIso, setEndIso] = useState(`${defaultDate}T12:00`);
  const [deadlineIso, setDeadlineIso] = useState(`${getRelativeDateStr(4)}T17:00`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setDepartment(defaultDepartment);
    setProjectTitle(initialTitle || '');
    setProjectSummary(initialSummary || '');
    setStartIso(initialStartIso || `${defaultDate}T10:00`);
    setEndIso(initialEndIso || `${defaultDate}T12:00`);
    setDeadlineIso(initialDeadlineIso || `${getRelativeDateStr(4)}T17:00`);
  }, [isOpen, equipment, initialStartIso, initialEndIso, initialTitle, initialSummary, initialDeadlineIso, defaultDepartment, defaultDate]);

  if (!isOpen || !equipment) return null;

  const overlappingSlots = slotBlocks.filter(
    (s) => s.equipmentId === equipment.id && hasOverlap(startIso, endIso, s.startIso, s.endIso)
  );
  const isInvalidWindow = !startIso || !endIso || startIso >= endIso;

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!equipment) return;
    if (isInvalidWindow) {
      setError('End time must be strictly after the start time.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        equipment,
        department,
        projectTitle,
        projectSummary,
        courseOrLabCode,
        deadlineIso,
        startIso,
        endIso,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit booking.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              {equipment.department} · {equipment.labRoom}, {equipment.building}
            </p>
            <h2 id="booking-modal-title" className="text-lg font-semibold text-slate-900">
              {equipment.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking dialog"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          {!isSignedIn && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                Sign in with your Google campus account to save project bookings and route approvals.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="px-3.5 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign in with Google
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bk-course" className="block text-xs font-medium text-slate-700 mb-1.5">
                Course or Lab Code
              </label>
              <input
                id="bk-course"
                type="text"
                required
                minLength={2}
                maxLength={40}
                value={courseOrLabCode}
                onChange={(e) => setCourseOrLabCode(e.target.value)}
                placeholder="e.g. ECE 482 / Capstone"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="bk-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                Requester Department
              </label>
              <input
                id="bk-dept"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bk-title" className="block text-xs font-medium text-slate-700 mb-1.5">
              Project Title
            </label>
            <input
              id="bk-title"
              type="text"
              required
              minLength={3}
              maxLength={140}
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Concise title of your experiment or prototype"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div>
            <label htmlFor="bk-summary" className="block text-xs font-medium text-slate-700 mb-1.5">
              Technical Justification & Setup Requirements
            </label>
            <textarea
              id="bk-summary"
              required
              minLength={5}
              maxLength={600}
              rows={3}
              value={projectSummary}
              onChange={(e) => setProjectSummary(e.target.value)}
              placeholder="Explain what measurements, compute, or fabrication runs you need and any prerequisite safety prep."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="bk-start" className="block text-xs font-medium text-slate-700 mb-1.5">
                Slot Start
              </label>
              <input
                id="bk-start"
                type="datetime-local"
                required
                value={startIso}
                onChange={(e) => setStartIso(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="bk-end" className="block text-xs font-medium text-slate-700 mb-1.5">
                Slot End
              </label>
              <input
                id="bk-end"
                type="datetime-local"
                required
                value={endIso}
                onChange={(e) => setEndIso(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="bk-deadline" className="block text-xs font-medium text-slate-700 mb-1.5">
                Project Deadline
              </label>
              <input
                id="bk-deadline"
                type="datetime-local"
                required
                value={deadlineIso}
                onChange={(e) => setDeadlineIso(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          {overlappingSlots.length > 0 ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">
                  ▲ Schedule Overlap Detected ({overlappingSlots.length} existing slot)
                </p>
                <p className="text-amber-800 leading-relaxed">
                  Submitting this window will flag it for the AI Conflict Resolver so faculty can weigh your project deadline ({deadlineIso.replace('T', ' ')}) against {overlappingSlots[0].projectLabel}.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-700">
              {equipment.requiresFacultyApproval ? (
                <>
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                  <span>
                    No overlap detected. Because this instrument requires faculty sign-off, your request will enter the coordinator approval queue.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  <span>
                    No overlap detected. This bench qualifies for instant slot confirmation upon submission.
                  </span>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isSignedIn || submitting || isInvalidWindow}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : overlappingSlots.length > 0 ? (
                'Submit & Queue Conflict'
              ) : equipment.requiresFacultyApproval ? (
                'Submit Access Request'
              ) : (
                'Confirm Slot Booking'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
