import { useState } from 'react';
import { ArrowRight, CheckCircle2, Cpu, Loader2, AlertCircle } from 'lucide-react';
import { getRelativeDateStr } from '../data/seedCatalog';
import type { AiEquipmentMatch, AiRecommendationResponse, Equipment, SlotBlock } from '../types';

interface AiMatcherPanelProps {
  equipment: Equipment[];
  slotBlocks: SlotBlock[];
  onSelectRecommendation: (equipment: Equipment, startIso: string, endIso: string, projectTitle: string, projectDescription: string, deadlineIso: string) => void;
}

export function AiMatcherPanel({
  equipment,
  slotBlocks,
  onSelectRecommendation,
}: AiMatcherPanelProps) {
  const [projectTitle, setProjectTitle] = useState('Autonomous Drone Optical Flow & Motor Profiling');
  const [department, setDepartment] = useState('Robotics & Mechatronics');
  const [projectDescription, setProjectDescription] = useState(
    'Need real-time FPGA hardware-in-the-loop timing verification and brushless actuator closed-loop latency profiling under 20 kHz PWM.'
  );
  const [preferredDate, setPreferredDate] = useState(getRelativeDateStr(1));
  const [deadlineIso, setDeadlineIso] = useState(`${getRelativeDateStr(4)}T17:00`);
  const [durationHours, setDurationHours] = useState(2);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiRecommendationResponse | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/recommend-equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTitle,
          projectDescription,
          department,
          deadlineIso,
          preferredDate,
          durationHours,
          equipment: equipment.map((eq) => ({
            id: eq.id,
            name: eq.name,
            department: eq.department,
            category: eq.category,
            labRoom: eq.labRoom,
            building: eq.building,
            status: eq.status,
            requiresFacultyApproval: eq.requiresFacultyApproval,
            specs: eq.specs,
            capabilities: eq.capabilities,
            maxHoursPerSlot: eq.maxHoursPerSlot,
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
        throw new Error(data.error || 'Unable to generate equipment recommendations.');
      }
      setResult(data as AiRecommendationResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recommendation request failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleBookMatch(rec: AiEquipmentMatch) {
    const matched = equipment.find((e) => e.id === rec.equipmentId);
    if (!matched) return;
    onSelectRecommendation(
      matched,
      rec.suggestedStartIso,
      rec.suggestedEndIso,
      projectTitle,
      projectDescription,
      deadlineIso
    );
  }

  return (
    <section
      id="ai-project-matcher"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-blue-600">Intelligent Equipment & Slot Matching</p>
          <h2 className="text-xl font-semibold text-slate-900">
            Match Project Requirements to Available Lab Benches
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Describe your experiment, target date, and deadline. LabLink evaluates cross-department instrument specs and live occupancy to suggest conflict-free slots.
          </p>
        </div>
      </div>

      <form onSubmit={handleAnalyze} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label htmlFor="matcher-title" className="block text-xs font-medium text-slate-700 mb-1.5">
              Project Title
            </label>
            <input
              id="matcher-title"
              type="text"
              required
              maxLength={140}
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="matcher-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                Home Department
              </label>
              <select
                id="matcher-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="Electrical & Computer Eng.">Electrical & Computer Eng.</option>
                <option value="Computer Science & AI">Computer Science & AI</option>
                <option value="Robotics & Mechatronics">Robotics & Mechatronics</option>
                <option value="Applied Physics & Bioengineering">Applied Physics & Bioeng.</option>
                <option value="Mechanical & Materials Eng.">Mechanical & Materials Eng.</option>
              </select>
            </div>

            <div>
              <label htmlFor="matcher-duration" className="block text-xs font-medium text-slate-700 mb-1.5">
                Session Duration
              </label>
              <select
                id="matcher-duration"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 font-mono tabular-nums"
              >
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
                <option value={3}>3 hours</option>
                <option value={4}>4 hours</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="matcher-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                Target Lab Date
              </label>
              <input
                id="matcher-date"
                type="date"
                required
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="matcher-deadline" className="block text-xs font-medium text-slate-700 mb-1.5">
                Project Deadline
              </label>
              <input
                id="matcher-deadline"
                type="datetime-local"
                required
                value={deadlineIso}
                onChange={(e) => setDeadlineIso(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="flex-1 flex flex-col">
            <label htmlFor="matcher-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
              Technical Specifications & Experiment Requirements
            </label>
            <textarea
              id="matcher-desc"
              required
              rows={5}
              maxLength={600}
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Specify bandwidth, GPU VRAM, optical wavelength, voltage/current ranges, or software stack..."
              className="w-full flex-1 px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-500">
              Evaluates <span className="font-mono tabular-nums text-slate-700">{equipment.length}</span> instruments and{' '}
              <span className="font-mono tabular-nums text-slate-700">{slotBlocks.length}</span> active bookings
            </span>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing Compatibility...
                </>
              ) : (
                <>
                  <Cpu className="w-4 h-4" />
                  Find Compatible Equipment
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3 text-sm text-rose-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-900">Scheduling Guidance</p>
              <p className="text-sm text-slate-700 leading-relaxed">{result.workflowAdvice}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {result.recommendations.map((rec, idx) => {
              const matchedEq = equipment.find((e) => e.id === rec.equipmentId);
              return (
                <div
                  key={`${rec.equipmentId}-${idx}`}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums font-medium text-blue-700">
                        Match 0{idx + 1}
                      </span>
                      <span className="font-mono tabular-nums">
                        Setup ~{rec.estimatedSetupMinutes}m
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                      {rec.equipmentName}
                    </h3>

                    <p className="text-xs text-slate-600 leading-relaxed">{rec.fitReason}</p>

                    <div className="pt-2 border-t border-slate-100 space-y-1">
                      <p className="text-xs font-medium text-slate-700">Suggested Open Window</p>
                      <p className="text-xs font-mono tabular-nums text-slate-900">
                        {rec.suggestedStartIso.replace('T', ' ')} → {rec.suggestedEndIso.slice(11, 16)}
                      </p>
                    </div>

                    {rec.safetyChecklist.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-xs font-medium text-slate-700">Pre-Session Checklist</p>
                        <ul className="space-y-1">
                          {rec.safetyChecklist.slice(0, 3).map((item, cIdx) => (
                            <li key={cIdx} className="text-xs text-slate-600 leading-snug">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!matchedEq}
                    onClick={() => handleBookMatch(rec)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Reserve This Window
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
