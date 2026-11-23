import { useState } from 'react';
import { getRelativeDateStr } from '../data/seedCatalog';
import { hasOverlap } from '../lib/labService';
import type { Equipment, SlotBlock } from '../types';

interface ScheduleMatrixProps {
  equipment: Equipment[];
  slotBlocks: SlotBlock[];
  onBookSlot: (equipment: Equipment, startIso: string, endIso: string) => void;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export function ScheduleMatrix({ equipment, slotBlocks, onBookSlot }: ScheduleMatrixProps) {
  const dayOptions = [
    { label: 'Today', date: getRelativeDateStr(0) },
    { label: 'Tomorrow', date: getRelativeDateStr(1) },
    { label: '+2 Days', date: getRelativeDateStr(2) },
    { label: '+3 Days', date: getRelativeDateStr(3) },
  ];

  const [selectedDate, setSelectedDate] = useState(dayOptions[0].date);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">Campus Bench Schedule Matrix</h2>
          <p className="text-sm text-slate-600">
            Click any open hour cell to reserve that instrument window, or inspect active conflicts.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          {dayOptions.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedDate === d.date
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {d.label} <span className="font-mono tabular-nums text-slate-400 ml-1">{d.date.slice(5)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[920px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="py-3 px-4 text-xs font-semibold text-slate-700 w-64">
                Equipment & Room
              </th>
              {HOURS.map((hr) => (
                <th
                  key={hr}
                  className="py-3 px-2 text-center text-xs font-mono tabular-nums font-medium text-slate-500 border-l border-slate-200"
                >
                  {String(hr).padStart(2, '0')}:00
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {equipment.map((eq) => {
              const eqSlots = slotBlocks.filter((s) => s.equipmentId === eq.id);
              return (
                <tr key={eq.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 align-middle">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-900 line-clamp-1">{eq.name}</p>
                      <p className="text-xs text-slate-500">
                        {eq.labRoom} · {eq.status === 'maintenance' ? '✕ Maint.' : `${eq.utilizationPct}% util`}
                      </p>
                    </div>
                  </td>

                  {HOURS.map((hr) => {
                    const cellStart = `${selectedDate}T${String(hr).padStart(2, '0')}:00`;
                    const cellEnd = `${selectedDate}T${String(hr + 1).padStart(2, '0')}:00`;
                    const slotEnd2h = `${selectedDate}T${String(Math.min(hr + 2, 20)).padStart(2, '0')}:00`;

                    const matching = eqSlots.filter((s) =>
                      hasOverlap(cellStart, cellEnd, s.startIso, s.endIso)
                    );
                    const hasConflict = matching.length > 1 || matching.some((m) => m.status === 'conflict');
                    const isPending = !hasConflict && matching.some((m) => m.status === 'pending');
                    const isReserved = !hasConflict && !isPending && matching.length > 0;

                    if (eq.status === 'maintenance') {
                      return (
                        <td
                          key={hr}
                          className="p-1.5 border-l border-slate-200 bg-slate-100 text-center"
                          title="Instrument under maintenance"
                        >
                          <span className="text-[11px] font-mono text-slate-400">—</span>
                        </td>
                      );
                    }

                    if (hasConflict) {
                      return (
                        <td
                          key={hr}
                          className="p-1 border-l border-slate-200 bg-amber-50 text-center"
                          title={matching.map((m) => m.projectLabel).join(' / ')}
                        >
                          <div className="py-1.5 px-1 rounded bg-amber-100/80 text-[11px] font-medium text-amber-900 truncate">
                            ▲ Overlap
                          </div>
                        </td>
                      );
                    }

                    if (isPending) {
                      return (
                        <td
                          key={hr}
                          className="p-1 border-l border-slate-200 bg-slate-50 text-center"
                          title={matching[0]?.projectLabel}
                        >
                          <div className="py-1.5 px-1 rounded bg-blue-50 text-[11px] font-medium text-blue-800 truncate">
                            ◆ Pending
                          </div>
                        </td>
                      );
                    }

                    if (isReserved) {
                      return (
                        <td
                          key={hr}
                          className="p-1 border-l border-slate-200 bg-slate-50 text-center"
                          title={matching[0]?.projectLabel}
                        >
                          <div className="py-1.5 px-1 rounded bg-slate-200/80 text-[11px] font-medium text-slate-800 truncate">
                            ✓ Booked
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={hr} className="p-1 border-l border-slate-200">
                        <button
                          type="button"
                          onClick={() => onBookSlot(eq, cellStart, slotEnd2h)}
                          aria-label={`Book ${eq.name} at ${cellStart}`}
                          className="w-full py-1.5 rounded text-[11px] text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          Open
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-6 text-xs text-slate-600">
        <span>Open = Click to book 2h window</span>
        <span className="text-slate-800 font-medium">✓ Booked = Confirmed slot</span>
        <span className="text-blue-800 font-medium">◆ Pending = Awaiting faculty sign-off</span>
        <span className="text-amber-800 font-medium">▲ Overlap = Scheduling conflict queued for resolution</span>
      </div>
    </section>
  );
}
