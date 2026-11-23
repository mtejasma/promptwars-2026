import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_ID = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getErrorStatusAndMessage(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('GEMINI_API_KEY is not configured')) {
    return { status: 503, message: msg };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please verify your API key in Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Gemini API quota temporarily reached. Please retry shortly or check Settings > Secrets.',
    };
  }
  return { status: 500, message: msg || 'Failed to generate AI recommendation.' };
}

interface EquipmentSummary {
  id: string;
  name: string;
  department: string;
  category: string;
  labRoom: string;
  building: string;
  status: string;
  requiresFacultyApproval: boolean;
  specs: string;
  capabilities: string[];
  maxHoursPerSlot: number;
}

interface SlotBlockSummary {
  equipmentId: string;
  startIso: string;
  endIso: string;
  status: string;
  projectLabel: string;
}

interface ConflictBookingSummary {
  id: string;
  requesterName: string;
  department: string;
  equipmentId: string;
  equipmentName: string;
  projectTitle: string;
  projectSummary: string;
  courseOrLabCode: string;
  deadlineIso: string;
  startIso: string;
  endIso: string;
  status: string;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'lablink-api' });
});

app.post('/api/ai/recommend-equipment', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      projectTitle?: unknown;
      projectDescription?: unknown;
      department?: unknown;
      deadlineIso?: unknown;
      preferredDate?: unknown;
      durationHours?: unknown;
      equipment?: unknown;
      slotBlocks?: unknown;
    };

    if (
      typeof body.projectTitle !== 'string' ||
      body.projectTitle.trim().length < 2 ||
      typeof body.projectDescription !== 'string' ||
      body.projectDescription.trim().length < 5 ||
      !Array.isArray(body.equipment) ||
      body.equipment.length === 0
    ) {
      res.status(400).json({ error: 'Please provide a project title, description, and equipment catalog.' });
      return;
    }

    const ai = getAiClient();
    const equipmentList = (body.equipment as EquipmentSummary[]).slice(0, 30);
    const slotList = Array.isArray(body.slotBlocks) ? (body.slotBlocks as SlotBlockSummary[]).slice(0, 60) : [];
    const durationHours = typeof body.durationHours === 'number' && body.durationHours >= 1 && body.durationHours <= 12
      ? body.durationHours
      : 2;
    const preferredDate = typeof body.preferredDate === 'string' && body.preferredDate.length >= 10
      ? body.preferredDate
      : new Date().toISOString().slice(0, 10);

    const prompt = [
      `Student Project Title: ${body.projectTitle.slice(0, 160)}`,
      `Student Department: ${typeof body.department === 'string' ? body.department.slice(0, 80) : 'Interdisciplinary'}`,
      `Project Technical Requirements: ${body.projectDescription.slice(0, 800)}`,
      `Project Deadline ISO: ${typeof body.deadlineIso === 'string' ? body.deadlineIso.slice(0, 40) : 'Not specified'}`,
      `Preferred Target Date: ${preferredDate}`,
      `Requested Session Duration (hours): ${durationHours}`,
      ``,
      `Available Campus Equipment Catalog (JSON):`,
      JSON.stringify(equipmentList),
      ``,
      `Existing Occupied Slot Blocks (JSON):`,
      JSON.stringify(slotList),
      ``,
      `Task: Recommend up to 3 feasible equipment units from the catalog that best fulfill the student's technical requirements, respecting maintenance status (never recommend 'maintenance' units unless as a last note) and avoiding overlaps with existing occupied slot blocks. Suggest realistic ISO 8601 start/end times on or near ${preferredDate} during lab operating hours (08:00 to 21:00 local time, e.g. ${preferredDate}T10:00 and ${preferredDate}T12:00).`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        systemInstruction:
          'You are LabLink Academic Resource Planner, an expert university laboratory engineer helping students match project requirements to cross-departmental instruments and conflict-free time slots. Only reference equipmentId values that exist in the provided catalog. Keep rationales concise, technical, and factual.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            workflowAdvice: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence operational recommendation for completing the work before the deadline.',
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  equipmentId: { type: Type.STRING },
                  equipmentName: { type: Type.STRING },
                  fitReason: { type: Type.STRING },
                  suggestedStartIso: { type: Type.STRING, description: 'ISO local datetime YYYY-MM-DDTHH:MM' },
                  suggestedEndIso: { type: Type.STRING, description: 'ISO local datetime YYYY-MM-DDTHH:MM' },
                  estimatedSetupMinutes: { type: Type.INTEGER },
                  safetyChecklist: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'equipmentId',
                  'equipmentName',
                  'fitReason',
                  'suggestedStartIso',
                  'suggestedEndIso',
                  'estimatedSetupMinutes',
                  'safetyChecklist',
                ],
              },
            },
          },
          required: ['workflowAdvice', 'recommendations'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    const { status, message } = getErrorStatusAndMessage(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/ai/resolve-conflicts', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      bookings?: unknown;
      equipment?: unknown;
      slotBlocks?: unknown;
    };

    if (!Array.isArray(body.bookings) || body.bookings.length === 0 || !Array.isArray(body.equipment)) {
      res.status(400).json({ error: 'Bookings and equipment catalog are required for conflict resolution.' });
      return;
    }

    const ai = getAiClient();
    const bookings = (body.bookings as ConflictBookingSummary[]).slice(0, 20);
    const equipment = (body.equipment as EquipmentSummary[]).slice(0, 30);
    const slotBlocks = Array.isArray(body.slotBlocks) ? (body.slotBlocks as SlotBlockSummary[]).slice(0, 80) : [];

    const prompt = [
      `Conflicting or Pending Lab Booking Requests (JSON):`,
      JSON.stringify(bookings),
      ``,
      `Full Campus Equipment Catalog (JSON):`,
      JSON.stringify(equipment),
      ``,
      `All Current Occupied Slot Blocks (JSON):`,
      JSON.stringify(slotBlocks),
      ``,
      `Task: Resolve every overlapping scheduling conflict fairly and feasibly.`,
      `Prioritization principles:`,
      `1. Earliest hard project deadline receives primary slot priority when requirements cannot be served on alternate hardware.`,
      `2. If an adjacent or cross-department instrument in the catalog satisfies the project's technical requirements with zero overlap, recommend 'reassign_alternative' to unlock immediate parallel progress.`,
      `3. Otherwise, recommend 'shift_slot' to the nearest conflict-free lab window (08:00–21:00) prior to that student's deadline.`,
      `4. Output exact ISO local datetimes (YYYY-MM-DDTHH:MM) and valid equipmentId values from the catalog.`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        systemInstruction:
          'You are the LabLink Fair Scheduling Arbitrator for a multi-department university engineering & science campus. Produce deterministic, zero-overlap equipment allocations with transparent fairness reasoning grounded strictly in project deadlines, technical compatibility, and lab utilization.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            conflictSummary: {
              type: Type.STRING,
              description: 'Objective 2-sentence diagnosis of the resource collision and scheduling strategy.',
            },
            utilizationGainNote: {
              type: Type.STRING,
              description: 'Concise note explaining how the proposed schedule balances load across benches and meets deadlines.',
            },
            allocations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  bookingId: { type: Type.STRING },
                  recommendedAction: {
                    type: Type.STRING,
                    description: "One of: 'approve_primary', 'shift_slot', 'reassign_alternative'",
                  },
                  assignedEquipmentId: { type: Type.STRING },
                  assignedEquipmentName: { type: Type.STRING },
                  assignedStartIso: { type: Type.STRING, description: 'YYYY-MM-DDTHH:MM' },
                  assignedEndIso: { type: Type.STRING, description: 'YYYY-MM-DDTHH:MM' },
                  fairnessRationale: { type: Type.STRING },
                },
                required: [
                  'bookingId',
                  'recommendedAction',
                  'assignedEquipmentId',
                  'assignedEquipmentName',
                  'assignedStartIso',
                  'assignedEndIso',
                  'fairnessRationale',
                ],
              },
            },
          },
          required: ['conflictSummary', 'utilizationGainNote', 'allocations'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    const { status, message } = getErrorStatusAndMessage(err);
    res.status(status).json({ error: message });
  }
});

app.post('/api/ai/faculty-brief', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      booking?: unknown;
      equipment?: unknown;
    };

    if (!body.booking || typeof body.booking !== 'object' || !body.equipment || typeof body.equipment !== 'object') {
      res.status(400).json({ error: 'Booking and equipment details are required.' });
      return;
    }

    const ai = getAiClient();
    const prompt = [
      `Booking Request:`,
      JSON.stringify(body.booking),
      ``,
      `Target Equipment Specification:`,
      JSON.stringify(body.equipment),
      ``,
      `Provide a concise faculty coordinator briefing assessing technical fit, lab safety/calibration prerequisites, recommended decision, and a short draft note to the student.`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        systemInstruction:
          'You are a university laboratory safety and equipment coordinator assistant. Evaluate whether the student project matches the instrument capabilities and summarize prerequisite lab safety checks clearly.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            feasibilityCheck: { type: Type.STRING },
            riskAndPrepNotes: { type: Type.STRING },
            recommendedDecision: {
              type: Type.STRING,
              description: "One of: 'approve', 'request_clarification', 'suggest_alternative'",
            },
            draftReviewerNote: { type: Type.STRING },
          },
          required: ['feasibilityCheck', 'riskAndPrepNotes', 'recommendedDecision', 'draftReviewerNote'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    const { status, message } = getErrorStatusAndMessage(err);
    res.status(status).json({ error: message });
  }
});

async function startServer(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LabLink server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LabLink server:', err);
  process.exit(1);
});
