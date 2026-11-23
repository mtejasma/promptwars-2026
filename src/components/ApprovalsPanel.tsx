import { useState } from 'react';
import { Check, FileText, Loader2, X } from 'lucide-react';
import type { AiFacultyBriefResponse, Booking, Equipment, UserRoleMode } from '../types';

interface ApprovalsPanelProps {
  bookings: Booking[];
  equipment: Equipment[];
  roleMode: UserRoleMode;
  currentUid: string | null;
  isAdminUser: boolean;
  onApprove: (booking: Booking, notes: string) => Promise<void>;
  onReject: (booking: Booking, notes: string) => Promise<void>;
  onCancelOwn: (bookingId: string) => Promise<void>;
}

export function ApprovalsPanel({
  bookings,
  equipment,
  roleMode,
  currentUid,
  isAdminUser,
  onApprove,
  onReject,
  onCancelOwn,
}: ApprovalsPanelProps) {
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [briefById, setBriefById] = useState<Record<string, AiFacultyBriefResponse>>({});
  const [briefLoadingId, setBriefLoadingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facultyQueue = bookings.filter(
    (b) => b.status === 'pending' || b.status === 'conflict'
  );
  const myBookings = currentUid
    ? bookings.filter((b) => b.requesterUid === currentUid || b.requesterUid === 'demo_user')
    : bookings;

  async function handleRunBrief(booking: Booking) {
    const eq = equipment.find((e) => e.id === booking.equipmentId);
    if (!eq) return;
    setBriefLoadingId(booking.id);
    setError(null);
    try {
      const response = await fetch('/api/ai/faculty-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking, equipment: eq }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to generate faculty brief.');
      }
      const brief = data as AiFacultyBriefResponse;
      setBriefById((prev) => ({ ...prev, [booking.id]: brief }));
      if (!notesById[booking.id]) {
        setNotesById((prev) => ({ ...prev, [booking.id]: brief.draftReviewerNote }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brief generation failed.');
    } finally {
      setBriefLoadingId(null);
    }
  }

  async function handleDecision(booking: Booking, decision: 'approved' | 'rejected') {
    setBusyId(booking.id);
    setError(null);
    try {
      const note =
        notesById[booking.id] ||
        (decision === 'approved'
          ? 'Approved for scheduled lab window.'
          : 'Declined due to resource constraints.');
      if (decision === 'approved') {
        await onApprove(booking, note);
      } else {
        await onReject(booking, note);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update request status.');
    } finally {
      setBusyId(null);
    }
  }

  function renderStatusLabel(status: Booking['status']) {
    switch (status) {
      case 'approved':
        return <span className="text-emerald-700 font-medium">✓ Approved</span>;
      case 'pending':
        return <span className="text-blue-700 font-medium">◆ Pending Review</span>;
      case 'conflict':
        return <span className="text-amber-700 font-medium">▲ Conflict Queued</span>;
      case 'rejected':
        return <span className="text-rose-700 font-medium">✕ Declined</span>;
      case 'cancelled':
        return <span className="text-slate-500 font-medium">Cancelled</span>;
      default:
        return <span className="text-slate-700 font-medium">Completed</span>;
    }
  }

  return (
    <section className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Always show My Bookings so newly submitted bookings are immediately visible */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">My Bookings</h2>
            <p className="text-sm text-slate-600">
              Your confirmed laboratory slots, project access requests, and scheduling status.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap shrink-0">
            {myBookings.length} bookings
          </span>
        </div>

        {myBookings.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            You have no laboratory bookings yet. Click &ldquo;Try Demo Booking&rdquo; or choose an instrument from Equipment Discovery to reserve a slot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-5">Project & Course</th>
                  <th className="py-3 px-4">Equipment</th>
                  <th className="py-3 px-4">Scheduled Window</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {myBookings.map((bk) => (
                  <tr key={bk.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-5">
                      <p className="font-medium text-slate-900">{bk.projectTitle}</p>
                      <p className="text-xs text-slate-500">
                        {bk.courseOrLabCode} · {bk.requesterName} · Due {bk.deadlineIso.slice(0, 10)}
                      </p>
                      {(bk.aiResolutionNote || bk.facultyNotes) && (
                        <p className="text-xs text-slate-600 mt-1 max-w-md">
                          {bk.aiResolutionNote || bk.facultyNotes}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 font-medium">
                      {bk.equipmentName}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {bk.startIso.replace('T', ' ')} → {bk.endIso.slice(11, 16)}
                    </td>
                    <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                      {renderStatusLabel(bk.status)}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {(bk.requesterUid === currentUid || bk.requesterUid === 'demo_user' || !currentUid) &&
                      bk.status !== 'cancelled' &&
                      bk.status !== 'rejected' &&
                      bk.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => onCancelOwn(bk.id)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:text-rose-700 hover:border-rose-200 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {roleMode === 'faculty' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Faculty Access Approval Queue
              </h2>
              <p className="text-sm text-slate-600">
                Review project-based requests for restricted instruments, inspect AI safety & feasibility briefs, and approve or decline access.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap shrink-0">
              {facultyQueue.length} pending items
            </span>
          </div>

          {facultyQueue.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              All project-based access requests have been reviewed.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {facultyQueue.map((bk) => {
                const brief = briefById[bk.id];
                const isBusy = busyId === bk.id;
                const isBriefLoading = briefLoadingId === bk.id;

                return (
                  <div key={bk.id} className="p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-medium text-slate-900">{bk.requesterName}</span>
                          <span>·</span>
                          <span>{bk.department}</span>
                          <span>·</span>
                          <span>{bk.courseOrLabCode}</span>
                          <span>·</span>
                          {renderStatusLabel(bk.status)}
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">{bk.projectTitle}</h3>
                        <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                          {bk.projectSummary}
                        </p>
                      </div>

                      <div className="text-left md:text-right space-y-1 shrink-0">
                        <p className="text-xs font-semibold text-slate-900">{bk.equipmentName}</p>
                        <p className="text-xs font-mono tabular-nums text-slate-600">
                          Slot: {bk.startIso.replace('T', ' ')} → {bk.endIso.slice(11, 16)}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-rose-700">
                          Deadline: {bk.deadlineIso.replace('T', ' ')}
                        </p>
                      </div>
                    </div>

                    {brief && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            AI Feasibility & Safety Brief
                          </span>
                          <span className="font-medium text-blue-700">
                            Suggested: {brief.recommendedDecision.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          <strong>Technical Fit:</strong> {brief.feasibilityCheck}
                        </p>
                        <p className="text-slate-700 leading-relaxed">
                          <strong>Safety & Prep:</strong> {brief.riskAndPrepNotes}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                      <input
                        type="text"
                        maxLength={400}
                        value={notesById[bk.id] ?? ''}
                        onChange={(e) =>
                          setNotesById((prev) => ({ ...prev, [bk.id]: e.target.value }))
                        }
                        placeholder="Add faculty reviewer note or safety condition..."
                        className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBriefLoading}
                          onClick={() => handleRunBrief(bk)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {isBriefLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                          AI Brief
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(bk, 'rejected')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Decline
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDecision(bk, 'approved')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Approve
                        </button>
                      </div>
                    </div>

                    {!isAdminUser && currentUid && (
                      <p className="text-[11px] text-slate-500">
                        Preview mode for non-admin accounts: approval updates session view only.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
