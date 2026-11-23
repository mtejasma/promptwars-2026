import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, X } from 'lucide-react';
import { getRelativeDateStr } from '../data/seedCatalog';
import { hasOverlap } from '../lib/labService';
import type { Equipment, SlotBlock } from '../types';

interface AlternativeSlot {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
}

interface BookingModalProps {
  isOpen: boolean;
  equipment: Equipment | null;
  allEquipment: Equipment[];
  initialStartIso?: string;
  initialEndIso?: string;
  initialTitle?: string;
  initialSummary?: string;
  initialDeadlineIso?: string;
  initialCourseCode?: string;
  isDemoMode?: boolean;
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
    allowConflictQueue?: boolean;
  }) => Promise<void>;
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr || '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function computeDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 && diff <= 480 ? diff : 120;
}

function findAlternativeSlots(
  equipmentId: string,
  targetDate: string,
  durationMinutes: number,
  slotBlocks: SlotBlock[]
): AlternativeSlot[] {
  const alternatives: AlternativeSlot[] = [];
  const eqBlocks = slotBlocks.filter((s) => s.equipmentId === equipmentId);
  const todayStr = getRelativeDateStr(0);
  const startSearchDate = targetDate >= todayStr ? targetDate : getRelativeDateStr(1);

  const candidateDates = [startSearchDate];
  const dObj = new Date(`${startSearchDate}T00:00:00`);
  for (let offset = 1; offset <= 2; offset++) {
    const next = new Date(dObj);
    next.setDate(dObj.getDate() + offset);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    candidateDates.push(`${yyyy}-${mm}-${dd}`);
  }

  for (const dateStr of candidateDates) {
    for (let startMin = 8 * 60; startMin + durationMinutes <= 20 * 60; startMin += 60) {
      const endMin = startMin + durationMinutes;
      const startTime = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(
        startMin % 60
      ).padStart(2, '0')}`;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(
        endMin % 60
      ).padStart(2, '0')}`;
      const startIso = `${dateStr}T${startTime}`;
      const endIso = `${dateStr}T${endTime}`;

      const collides = eqBlocks.some((b) => hasOverlap(startIso, endIso, b.startIso, b.endIso));
      if (!collides) {
        const dayPrefix = dateStr === startSearchDate ? '' : `${dateStr.slice(5)} · `;
        alternatives.push({
          date: dateStr,
          startTime,
          endTime,
          label: `${dayPrefix}${formatTime12h(startTime)} – ${formatTime12h(endTime)}`,
        });
        if (alternatives.length === 3) return alternatives;
      }
    }
  }

  return alternatives;
}

export function BookingModal({
  isOpen,
  equipment,
  allEquipment,
  initialStartIso,
  initialEndIso,
  initialTitle,
  initialSummary,
  initialDeadlineIso,
  initialCourseCode,
  isDemoMode = false,
  slotBlocks,
  isSignedIn,
  defaultDepartment,
  onClose,
  onSignIn,
  onSubmit,
}: BookingModalProps) {
  const todayStr = getRelativeDateStr(0);
  const tomorrowStr = getRelativeDateStr(1);

  const [selectedEqId, setSelectedEqId] = useState(equipment?.id || '');
  const [department, setDepartment] = useState(defaultDepartment);
  const [courseOrLabCode, setCourseOrLabCode] = useState('ECE 482');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectSummary, setProjectSummary] = useState('');
  const [bookingDate, setBookingDate] = useState(tomorrowStr);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [deadlineDate, setDeadlineDate] = useState(getRelativeDateStr(4));
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitAttempted(false);
    setSelectedEqId(equipment?.id || allEquipment[0]?.id || '');
    setDepartment(defaultDepartment);
    setCourseOrLabCode(initialCourseCode || 'ECE 482');
    setProjectTitle(initialTitle || '');
    setProjectSummary(initialSummary || '');

    const parsedStart = initialStartIso || `${tomorrowStr}T10:00`;
    const parsedEnd = initialEndIso || `${tomorrowStr}T12:00`;
    setBookingDate(parsedStart.slice(0, 10));
    setStartTime(parsedStart.slice(11, 16) || '10:00');
    setEndTime(parsedEnd.slice(11, 16) || '12:00');
    setDeadlineDate((initialDeadlineIso || getRelativeDateStr(4)).slice(0, 10));
  }, [
    isOpen,
    equipment,
    allEquipment,
    initialStartIso,
    initialEndIso,
    initialTitle,
    initialSummary,
    initialDeadlineIso,
    initialCourseCode,
    defaultDepartment,
    tomorrowStr,
  ]);

  const activeEquipment = useMemo(
    () => allEquipment.find((e) => e.id === selectedEqId) || equipment,
    [allEquipment, selectedEqId, equipment]
  );

  const startIso = `${bookingDate}T${startTime}`;
  const endIso = `${bookingDate}T${endTime}`;
  const deadlineIso = `${deadlineDate}T17:00`;

  const isPastDate = Boolean(bookingDate && bookingDate < todayStr);
  const isEndBeforeStart = Boolean(startTime && endTime && endTime <= startTime);

  const overlappingSlots = useMemo(() => {
    if (!activeEquipment || isPastDate || isEndBeforeStart) return [];
    return slotBlocks.filter(
      (s) =>
        s.equipmentId === activeEquipment.id &&
        hasOverlap(startIso, endIso, s.startIso, s.endIso)
    );
  }, [activeEquipment, slotBlocks, startIso, endIso, isPastDate, isEndBeforeStart]);

  const alternativeSlots = useMemo(() => {
    if (!activeEquipment || overlappingSlots.length === 0) return [];
    const durationMins = computeDurationMinutes(startTime, endTime);
    return findAlternativeSlots(activeEquipment.id, bookingDate, durationMins, slotBlocks);
  }, [activeEquipment, overlappingSlots.length, startTime, endTime, bookingDate, slotBlocks]);

  if (!isOpen || !activeEquipment) return null;

  const dateValidationError = isPastDate ? 'Please select a future date' : null;
  const timeValidationError = isEndBeforeStart ? 'End time must be after start time' : null;
  const conflictError =
    overlappingSlots.length > 0 ? 'Conflict Detected - This slot is already booked' : null;

  async function handleFormSubmit(e: React.FormEvent, allowConflictQueue = false) {
    e.preventDefault();
    if (!activeEquipment) return;
    setSubmitAttempted(true);

    if (isPastDate) {
      setError('Please select a future date');
      return;
    }
    if (isEndBeforeStart) {
      setError('End time must be after start time');
      return;
    }
    if (overlappingSlots.length > 0 && !allowConflictQueue) {
      setError('Conflict Detected - This slot is already booked');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        equipment: activeEquipment,
        department,
        projectTitle,
        projectSummary,
        courseOrLabCode,
        deadlineIso,
        startIso,
        endIso,
        allowConflictQueue,
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
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              {isDemoMode ? 'Demo Mode · ' : ''}
              {activeEquipment.department} · {activeEquipment.labRoom}, {activeEquipment.building}
            </p>
            <h2 id="booking-modal-title" className="text-lg font-semibold text-slate-900">
              {activeEquipment.name}
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

        <form onSubmit={(e) => handleFormSubmit(e, false)} className="p-6 space-y-4">
          {!isSignedIn && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                Demo Mode active — bookings save immediately to your session. Sign in with Google to persist across devices.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign in with Google
              </button>
            </div>
          )}

          <div>
            <label htmlFor="bk-equipment" className="block text-xs font-medium text-slate-700 mb-1.5">
              Equipment
            </label>
            <select
              id="bk-equipment"
              value={activeEquipment.id}
              onChange={(e) => {
                setSelectedEqId(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {allEquipment
                .filter((eq) => eq.status !== 'maintenance')
                .map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name} ({eq.labRoom})
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bk-title" className="block text-xs font-medium text-slate-700 mb-1.5">
                Project Name
              </label>
              <input
                id="bk-title"
                type="text"
                required
                minLength={3}
                maxLength={140}
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g. AI Image Classification"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

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
                placeholder="e.g. CS 442 / Capstone"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div>
              <label htmlFor="bk-deadline" className="block text-xs font-medium text-slate-700 mb-1.5">
                Project Deadline
              </label>
              <input
                id="bk-deadline"
                type="date"
                required
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
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
              rows={2}
              value={projectSummary}
              onChange={(e) => setProjectSummary(e.target.value)}
              placeholder="Explain what measurements, compute, or fabrication runs you need."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="bk-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                Date
              </label>
              <input
                id="bk-date"
                type="date"
                required
                value={bookingDate}
                onChange={(e) => {
                  setBookingDate(e.target.value);
                  setError(null);
                }}
                className={`w-full px-2.5 py-2 text-xs font-mono tabular-nums border rounded-lg focus:outline-none focus:ring-2 ${
                  isPastDate
                    ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500/20 focus:border-rose-500'
                    : 'border-slate-200 focus:ring-blue-600/20 focus:border-blue-600'
                }`}
              />
            </div>

            <div>
              <label htmlFor="bk-start-time" className="block text-xs font-medium text-slate-700 mb-1.5">
                Start Time
              </label>
              <input
                id="bk-start-time"
                type="time"
                required
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setError(null);
                }}
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="bk-end-time" className="block text-xs font-medium text-slate-700 mb-1.5">
                End Time
              </label>
              <input
                id="bk-end-time"
                type="time"
                required
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setError(null);
                }}
                className={`w-full px-2.5 py-2 text-xs font-mono tabular-nums border rounded-lg focus:outline-none focus:ring-2 ${
                  isEndBeforeStart
                    ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500/20 focus:border-rose-500'
                    : 'border-slate-200 focus:ring-blue-600/20 focus:border-blue-600'
                }`}
              />
            </div>
          </div>

          {dateValidationError && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2.5 text-xs font-medium text-rose-800"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{dateValidationError}</span>
            </div>
          )}

          {timeValidationError && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2.5 text-xs font-medium text-rose-800"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{timeValidationError}</span>
            </div>
          )}

          {conflictError && (
            <div
              role="alert"
              className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3 text-xs text-amber-950"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm text-amber-900">
                    {conflictError}
                  </p>
                  <p className="text-amber-800 leading-relaxed">
                    Existing reservation: {overlappingSlots[0].projectLabel} (
                    {formatTime12h(overlappingSlots[0].startIso.slice(11, 16))} –{' '}
                    {formatTime12h(overlappingSlots[0].endIso.slice(11, 16))}). Select one of 3 open alternative slots below:
                  </p>
                </div>
              </div>

              {alternativeSlots.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {alternativeSlots.map((alt, idx) => (
                    <button
                      key={`${alt.date}-${alt.startTime}-${idx}`}
                      type="button"
                      onClick={() => {
                        setBookingDate(alt.date);
                        setStartTime(alt.startTime);
                        setEndTime(alt.endTime);
                        setError(null);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-900 bg-white border border-amber-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 hover:text-blue-800 transition-colors cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="font-mono tabular-nums truncate">{alt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!dateValidationError && !timeValidationError && !conflictError && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-700">
              {activeEquipment.requiresFacultyApproval ? (
                <>
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                  <span>
                    Slot is open ({formatTime12h(startTime)} – {formatTime12h(endTime)}). Submitting routes this request for faculty approval.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  <span>
                    Slot is open ({formatTime12h(startTime)} – {formatTime12h(endTime)}). This workstation confirms immediately upon submission.
                  </span>
                </>
              )}
            </div>
          )}

          {submitAttempted && error && !dateValidationError && !timeValidationError && !conflictError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              {overlappingSlots.length > 0 && (
                <button
                  type="button"
                  disabled={submitting || isPastDate || isEndBeforeStart}
                  onClick={(e) => handleFormSubmit(e, true)}
                  className="text-xs font-medium text-amber-800 hover:text-amber-950 underline underline-offset-4 cursor-pointer"
                >
                  Or queue overlap for AI Conflict Resolver
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || isPastDate || isEndBeforeStart}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : activeEquipment.requiresFacultyApproval ? (
                  'Submit Access Request'
                ) : (
                  'Confirm Slot Booking'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
