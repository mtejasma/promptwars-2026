export type EquipmentCategory =
  | 'Electronics & RF'
  | 'AI & Compute'
  | 'Robotics & FPGA'
  | 'Fabrication & Photonics';

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance';

export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'conflict'
  | 'rejected'
  | 'cancelled'
  | 'completed';

export type SlotBlockStatus = 'reserved' | 'pending' | 'conflict';

export type UserRoleMode = 'student' | 'faculty';

export type WorkspaceTab = 'discover' | 'schedule' | 'conflicts' | 'approvals';

export interface Equipment {
  id: string;
  name: string;
  department: string;
  category: EquipmentCategory;
  labRoom: string;
  building: string;
  status: EquipmentStatus;
  requiresFacultyApproval: boolean;
  specs: string;
  capabilities: string[];
  imageUrl: string;
  utilizationPct: number;
  maxHoursPerSlot: number;
  isActive: boolean;
}

export interface Booking {
  id: string;
  requesterUid: string;
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
  status: BookingStatus;
  requiresFacultyApproval: boolean;
  facultyNotes?: string;
  aiResolutionNote?: string;
}

export interface SlotBlock {
  id: string;
  equipmentId: string;
  equipmentName: string;
  bookingId: string;
  startIso: string;
  endIso: string;
  status: SlotBlockStatus;
  projectLabel: string;
  isPublicSlot: boolean;
  createdByUid: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  department: string;
  role: UserRoleMode;
}

export interface AiEquipmentMatch {
  equipmentId: string;
  equipmentName: string;
  fitReason: string;
  suggestedStartIso: string;
  suggestedEndIso: string;
  estimatedSetupMinutes: number;
  safetyChecklist: string[];
}

export interface AiRecommendationResponse {
  workflowAdvice: string;
  recommendations: AiEquipmentMatch[];
}

export interface AiConflictAllocation {
  bookingId: string;
  recommendedAction: 'approve_primary' | 'shift_slot' | 'reassign_alternative';
  assignedEquipmentId: string;
  assignedEquipmentName: string;
  assignedStartIso: string;
  assignedEndIso: string;
  fairnessRationale: string;
}

export interface AiConflictResolutionResponse {
  conflictSummary: string;
  utilizationGainNote: string;
  allocations: AiConflictAllocation[];
}

export interface AiFacultyBriefResponse {
  feasibilityCheck: string;
  riskAndPrepNotes: string;
  recommendedDecision: 'approve' | 'request_clarification' | 'suggest_alternative';
  draftReviewerNote: string;
}
