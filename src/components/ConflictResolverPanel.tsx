import { useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, GitMerge, Loader2 } from 'lucide-react';
import { hasOverlap } from '../lib/labService';
import type { AiConflictResolutionResponse, Booking, Equipment, SlotBlock } from '../types';

interface ConflictResolverPanelProps {
  bookings: Booking[];
  equipment: Equipment[];
  slotBlocks: SlotBlock[];
  isAdminUser: boolean;
  isSignedIn: boolean;
  onApplyPlan: (plan: AiConflictResolutionResponse) => Promise<void>;
  onSignIn: () => void;
}

export function ConflictResolverPanel({
  bookings,
  equipment,
  slotBlocks,
  isAdminUser,
  isSignedIn,
  onApplyPlan,
  onSignIn,
}: ConflictResolverPanelProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AiConflictResolutionResponse | null>(null);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

  // Identify bookings marked as conflict or overlapping another active booking on the same equipment
  const activeBookings = bookings.filter(
    (b) => b.status === 'conflict' || b.status === 'pending' || b.status === 'approved'
  );

  const conflictingBookings = activeBookings.filter((b) => {
    if (b.status === 'conflict') return true;
    return activeBookings.some(
      (other) =>
        other.id !== b.id &&
        other.equipmentId === b.equipmentId &&
        hasOverlap(b.startIso, b.endIso, other.startIso, other.endIso)
    );
  });

  // Group conflicts by equipment
  const groupedByEquipment = conflictingBookings.reduce<Record<string, Booking[]>>((acc, b) => {
    if (!acc[b.equipmentId]) acc[b.equipmentId] = [];
    acc[b.equipmentId].push(b);
    return acc;
  }, {});

  async function handleGeneratePlan() {
    if (conflictingBookings.length === 0) return;
    setLoading(true);
    setError(null);
    setAppliedBanner(null);

    try {
      const response = await fetch('/api/ai/resolve-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookings: conflictingBookings.map((b) => ({
            id: b.id,
            requesterName: b.requesterName,
            department: b.department,
            equipmentId: b.equipmentId,
            equipmentName: b.equipmentName,
            projectTitle: b.projectTitle,
            projectSummary: b.projectSummary,
            courseOrLabCode: b.courseOrLabCode,
            deadlineIso: b.deadlineIso,
            startIso: b.startIso,
            endIso: b.endIso,
            status: b.status,
          })),
          equipment: equipment.map((e) => ({
            id: e.id,
            name: e.name,
            department: e.department,
            category: e.category,
            labRoom: e.labRoom,
            building: e.building,
            status: e.status,
            requiresFacultyApproval: e.requiresFacultyApproval,
            specs: e.specs,
            capabilities: e.capabilities,
            maxHoursPerSlot: e.maxHoursPerSlot,
          })),
          slotBlocks: slotBlocks.map((s) => ({
            equipmentId: s.equipmentId,
            startIso: s.startIso,
            endIso: s.endIso,
            status: s.status,
            projectLabel: s.projectLabel,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to compute conflict resolution plan.');
      }
      setPlan(data as AiConflictResolutionResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resolve conflicts.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCommitPlan() {
    if (!plan) return;
    setApplying(true);
    setError(null);
    try {
      await onApplyPlan(plan);
      setAppliedBanner('Fair allocation plan applied across all conflicting bookings and schedule slots.');
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply allocation plan.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-blue-600">Fair Scheduling Arbitrator</p>
          <h2 className="text-xl font-semibold text-slate-900">
            Resolve Overlapping Equipment Requests
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Compares hard project deadlines, cross-departmental hardware compatibility, and open lab windows to eliminate collisions without delaying urgent submissions.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || conflictingBookings.length === 0}
          onClick={handleGeneratePlan}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Computing Fair Allocations...
            </>
          ) : (
            <>
              <GitMerge className="w-4 h-4" />
              Generate Fair Allocation Plan
            </>
          )}
        </button>
      </div>

      {appliedBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-sm text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{appliedBanner}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-800">
          <AlertCircle className="w-4 h-4 mt-0.5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {conflictingBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-900">Zero Active Scheduling Conflicts</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            All current laboratory slot allocations are collision-free. Submit an overlapping request on any instrument to test automatic conflict arbitration.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {Object.entries(groupedByEquipment).map(([eqId, items]) => {
            const eq = equipment.find((e) => e.id === eqId);
            return (
              <div key={eqId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">
                      {eq ? `${eq.department} · ${eq.labRoom}` : 'Shared Laboratory Instrument'}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {items[0]?.equipmentName}
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
                    ▲ {items.length} Colliding Requests
                  </span>
                </div>

                <div className="divide-y divide-slate-200">
                  {items.map((bk) => (
                    <div key={bk.id} className="p-5 space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-slate-900">
                          {bk.requesterName} <span className="text-slate-400">·</span>{' '}
                          <span className="text-slate-600">{bk.courseOrLabCode}</span>
                        </span>
                        <span className="font-mono tabular-nums text-rose-700 font-medium">
                          Due {bk.deadlineIso.replace('T', ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{bk.projectTitle}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{bk.projectSummary}</p>
                      <p className="text-xs font-mono tabular-nums text-slate-700 pt-1">
                        Requested: {bk.startIso.replace('T', ' ')} → {bk.endIso.slice(11, 16)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {plan && (
        <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-blue-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-700">Proposed Fair Allocation Plan</p>
              <p className="text-sm text-slate-800 leading-relaxed">{plan.conflictSummary}</p>
              <p className="text-xs text-slate-600">{plan.utilizationGainNote}</p>
            </div>

            {!isSignedIn ? (
              <button
                type="button"
                onClick={onSignIn}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign in to Apply Plan
              </button>
            ) : (
              <button
                type="button"
                disabled={applying}
                onClick={handleCommitPlan}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Applying Changes...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isAdminUser ? 'Apply Allocation Plan' : 'Apply Preview Plan'}
                  </>
                )}
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-200">
            {plan.allocations.map((alloc) => {
              const orig = bookings.find((b) => b.id === alloc.bookingId);
              const actionLabel =
                alloc.recommendedAction === 'approve_primary'
                  ? '✓ Keep Primary Slot'
                  : alloc.recommendedAction === 'reassign_alternative'
                  ? '⇄ Reassign Compatible Hardware'
                  : '→ Shift to Conflict-Free Window';

              return (
                <div key={alloc.bookingId} className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <div className="lg:col-span-4 space-y-1">
                    <p className="text-xs font-semibold text-blue-700">{actionLabel}</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {orig ? `${orig.requesterName} — ${orig.projectTitle}` : alloc.bookingId}
                    </p>
                    {orig && (
                      <p className="text-xs font-mono tabular-nums text-slate-500">
                        Was: {orig.startIso.replace('T', ' ')} ({orig.equipmentName.slice(0, 28)}…)
                      </p>
                    )}
                  </div>

                  <div className="lg:col-span-4 space-y-1">
                    <p className="text-xs font-medium text-slate-500">Assigned Instrument & Slot</p>
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{alloc.assignedEquipmentName}</span>
                    </p>
                    <p className="text-xs font-mono tabular-nums text-emerald-700 font-medium">
                      {alloc.assignedStartIso.replace('T', ' ')} → {alloc.assignedEndIso.slice(11, 16)}
                    </p>
                  </div>

                  <div className="lg:col-span-4 space-y-1">
                    <p className="text-xs font-medium text-slate-500">Fairness Rationale</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{alloc.fairnessRationale}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {!isAdminUser && isSignedIn && (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Signed in as student: applying updates your local preview; faculty coordinator credentials persist changes campus-wide.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
