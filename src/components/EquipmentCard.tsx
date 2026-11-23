import { useState } from 'react';
import { CalendarPlus, Cpu, ShieldCheck } from 'lucide-react';
import type { Equipment } from '../types';

interface EquipmentCardProps {
  equipment: Equipment;
  onBook: (equipment: Equipment) => void;
  isFacultyMode: boolean;
  onToggleMaintenance?: (equipment: Equipment) => void;
}

export function EquipmentCard({
  equipment,
  onBook,
  isFacultyMode,
  onToggleMaintenance,
}: EquipmentCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const statusConfig =
    equipment.status === 'available'
      ? { label: '● Available', cls: 'text-emerald-700' }
      : equipment.status === 'in_use'
      ? { label: '▲ Active Session', cls: 'text-amber-700' }
      : { label: '✕ Maintenance', cls: 'text-rose-700' };

  return (
    <article className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between transition-colors hover:border-slate-300">
      <div>
        <div className="relative aspect-[4/3] w-full bg-slate-100 border-b border-slate-200 overflow-hidden">
          {!imgFailed && equipment.imageUrl ? (
            <img
              src={equipment.imageUrl}
              alt={equipment.name}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 p-4 text-center">
              <Cpu className="w-8 h-8 mb-2 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">{equipment.category}</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 truncate">
              {equipment.department} <span aria-hidden="true">·</span> {equipment.labRoom}
            </span>
            <span className={`font-medium whitespace-nowrap shrink-0 ${statusConfig.cls}`}>
              {statusConfig.label}
            </span>
          </div>

          <h3 className="text-base font-semibold text-slate-900 leading-snug">
            {equipment.name}
          </h3>

          <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
            {equipment.specs}
          </p>

          <p className="text-xs text-slate-500 leading-relaxed">
            {equipment.capabilities.slice(0, 3).join(' · ')}
          </p>
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-slate-500 min-w-0">
          <span className="font-mono tabular-nums text-slate-700 font-medium whitespace-nowrap">
            {equipment.utilizationPct}% util
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 truncate">
            {equipment.requiresFacultyApproval ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Faculty Sign-off</span>
              </>
            ) : (
              <span>Direct Slot</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isFacultyMode && onToggleMaintenance && (
            <button
              type="button"
              onClick={() => onToggleMaintenance(equipment)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 bg-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {equipment.status === 'maintenance' ? 'Restore' : 'Maint.'}
            </button>
          )}
          <button
            type="button"
            disabled={equipment.status === 'maintenance'}
            onClick={() => onBook(equipment)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Book Slot
          </button>
        </div>
      </div>
    </article>
  );
}
