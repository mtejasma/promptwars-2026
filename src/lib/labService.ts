import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { buildInitialBookingsAndSlots, INITIAL_EQUIPMENT } from '../data/seedCatalog';
import type {
  AiConflictAllocation,
  Booking,
  Equipment,
  SlotBlock,
  UserProfile,
} from '../types';
import { ADMIN_EMAIL, db, handleFirestoreError, OperationType } from './firebase';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function hasOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export async function syncUserRecords(user: User, department = 'Electrical & Computer Eng.'): Promise<UserProfile> {
  const isDefaultAdmin = Boolean(user.emailVerified && user.email === ADMIN_EMAIL);
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const snap = await getDoc(userRef);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Campus Researcher').slice(0, 100);

    if (!snap.exists()) {
      const profile: UserProfile = {
        uid: user.uid,
        displayName,
        department,
        role: isDefaultAdmin ? 'faculty' : 'student',
      };
      const batch = writeBatch(db);
      batch.set(userRef, {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        uid: user.uid,
        email: (user.email || 'user@campus.edu').slice(0, 160),
        campusId: `LL-${user.uid.slice(0, 6).toUpperCase()}`,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return profile;
    }

    const data = snap.data();
    return {
      uid: user.uid,
      displayName: String(data.displayName || displayName),
      department: String(data.department || department),
      role: data.role === 'faculty' || isDefaultAdmin ? 'faculty' : 'student',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function seedCampusDatabaseIfEmpty(isAdminUser: boolean): Promise<boolean> {
  if (!isAdminUser) return false;
  try {
    const eqQuery = query(collection(db, 'equipment'), where('isActive', '==', true));
    const existingEq = await getDocs(eqQuery);
    if (!existingEq.empty) return false;

    const batch = writeBatch(db);
    for (const eq of INITIAL_EQUIPMENT) {
      batch.set(doc(db, 'equipment', eq.id), {
        ...eq,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const { bookings, slotBlocks } = buildInitialBookingsAndSlots();
    for (const b of bookings) {
      const { id, ...rest } = b;
      batch.set(doc(db, 'bookings', id), {
        ...rest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    for (const s of slotBlocks) {
      const { id, ...rest } = s;
      batch.set(doc(db, 'slotBlocks', id), {
        ...rest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'equipment');
  }
}

export function subscribeEquipment(
  onData: (items: Equipment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'equipment'), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Equipment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || ''),
          department: String(data.department || ''),
          category: data.category,
          labRoom: String(data.labRoom || ''),
          building: String(data.building || ''),
          status: data.status,
          requiresFacultyApproval: Boolean(data.requiresFacultyApproval),
          specs: String(data.specs || ''),
          capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [],
          imageUrl: String(data.imageUrl || ''),
          utilizationPct: Number(data.utilizationPct ?? 0),
          maxHoursPerSlot: Number(data.maxHoursPerSlot ?? 4),
          isActive: Boolean(data.isActive),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'equipment');
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export function subscribeSlotBlocks(
  onData: (items: SlotBlock[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'slotBlocks'), where('isPublicSlot', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: SlotBlock[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          equipmentId: String(data.equipmentId || ''),
          equipmentName: String(data.equipmentName || ''),
          bookingId: String(data.bookingId || ''),
          startIso: String(data.startIso || ''),
          endIso: String(data.endIso || ''),
          status: data.status,
          projectLabel: String(data.projectLabel || ''),
          isPublicSlot: Boolean(data.isPublicSlot),
          createdByUid: String(data.createdByUid || ''),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'slotBlocks');
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export function subscribeBookings(
  uid: string,
  isAdminUser: boolean,
  onData: (items: Booking[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const bookingsRef = collection(db, 'bookings');
  const q = isAdminUser ? query(bookingsRef) : query(bookingsRef, where('requesterUid', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Booking[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          requesterUid: String(data.requesterUid || ''),
          requesterName: String(data.requesterName || ''),
          department: String(data.department || ''),
          equipmentId: String(data.equipmentId || ''),
          equipmentName: String(data.equipmentName || ''),
          projectTitle: String(data.projectTitle || ''),
          projectSummary: String(data.projectSummary || ''),
          courseOrLabCode: String(data.courseOrLabCode || ''),
          deadlineIso: String(data.deadlineIso || ''),
          startIso: String(data.startIso || ''),
          endIso: String(data.endIso || ''),
          status: data.status,
          requiresFacultyApproval: Boolean(data.requiresFacultyApproval),
          facultyNotes: typeof data.facultyNotes === 'string' ? data.facultyNotes : undefined,
          aiResolutionNote: typeof data.aiResolutionNote === 'string' ? data.aiResolutionNote : undefined,
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export async function createProjectBooking(params: {
  requesterUid: string;
  requesterName: string;
  department: string;
  equipment: Equipment;
  projectTitle: string;
  projectSummary: string;
  courseOrLabCode: string;
  deadlineIso: string;
  startIso: string;
  endIso: string;
  existingSlotBlocks: SlotBlock[];
}): Promise<{ bookingId: string; status: Booking['status'] }> {
  const bookingId = sanitizeId(`bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const overlaps = params.existingSlotBlocks.some(
    (s) =>
      s.equipmentId === params.equipment.id &&
      hasOverlap(params.startIso, params.endIso, s.startIso, s.endIso)
  );

  const status: Booking['status'] = overlaps
    ? 'conflict'
    : params.equipment.requiresFacultyApproval
    ? 'pending'
    : 'approved';

  const slotStatus: SlotBlock['status'] = overlaps
    ? 'conflict'
    : status === 'approved'
    ? 'reserved'
    : 'pending';

  const bookingPayload = {
    requesterUid: params.requesterUid,
    requesterName: params.requesterName.slice(0, 100),
    department: params.department.slice(0, 80),
    equipmentId: params.equipment.id,
    equipmentName: params.equipment.name.slice(0, 120),
    projectTitle: params.projectTitle.trim().slice(0, 140),
    projectSummary: params.projectSummary.trim().slice(0, 600),
    courseOrLabCode: params.courseOrLabCode.trim().slice(0, 40),
    deadlineIso: params.deadlineIso.slice(0, 40),
    startIso: params.startIso.slice(0, 40),
    endIso: params.endIso.slice(0, 40),
    status,
    requiresFacultyApproval: params.equipment.requiresFacultyApproval,
    ...(overlaps
      ? { facultyNotes: 'Detected schedule overlap at submission; queued for AI Conflict Resolver.' }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const slotPayload = {
    equipmentId: params.equipment.id,
    equipmentName: params.equipment.name.slice(0, 120),
    bookingId,
    startIso: params.startIso.slice(0, 40),
    endIso: params.endIso.slice(0, 40),
    status: slotStatus,
    projectLabel: `${params.courseOrLabCode.trim().slice(0, 20)} · ${params.projectTitle.trim().slice(0, 48)}`,
    isPublicSlot: true,
    createdByUid: params.requesterUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'bookings', bookingId), bookingPayload);
    batch.set(doc(db, 'slotBlocks', bookingId), slotPayload);
    await batch.commit();
    return { bookingId, status };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `bookings/${bookingId}`);
  }
}

export async function cancelOwnBooking(bookingId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', bookingId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'slotBlocks', bookingId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function facultyDecideBooking(params: {
  booking: Booking;
  decision: 'approved' | 'rejected';
  facultyNotes: string;
}): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', params.booking.id), {
      status: params.decision,
      facultyNotes: params.facultyNotes.slice(0, 400),
      updatedAt: serverTimestamp(),
    });
    if (params.decision === 'approved') {
      batch.update(doc(db, 'slotBlocks', params.booking.id), {
        status: 'reserved',
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.delete(doc(db, 'slotBlocks', params.booking.id));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${params.booking.id}`);
  }
}

export async function applyConflictResolutionPlan(
  allocations: AiConflictAllocation[],
  currentBookings: Booking[]
): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const alloc of allocations) {
      const target = currentBookings.find((b) => b.id === alloc.bookingId);
      if (!target) continue;

      batch.update(doc(db, 'bookings', target.id), {
        status: 'approved',
        equipmentId: alloc.assignedEquipmentId,
        equipmentName: alloc.assignedEquipmentName.slice(0, 120),
        startIso: alloc.assignedStartIso.slice(0, 40),
        endIso: alloc.assignedEndIso.slice(0, 40),
        aiResolutionNote: alloc.fairnessRationale.slice(0, 500),
        facultyNotes: `Resolved via LabLink Fair Scheduler (${alloc.recommendedAction.replace('_', ' ')}).`,
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'slotBlocks', target.id), {
        equipmentId: alloc.assignedEquipmentId,
        equipmentName: alloc.assignedEquipmentName.slice(0, 120),
        startIso: alloc.assignedStartIso.slice(0, 40),
        endIso: alloc.assignedEndIso.slice(0, 40),
        status: 'reserved',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'bookings/conflict_resolution');
  }
}

export async function updateEquipmentStatus(
  equipmentId: string,
  status: Equipment['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'equipment', equipmentId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `equipment/${equipmentId}`);
  }
}
