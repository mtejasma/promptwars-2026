import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  ArrowRight,
  Building2,
  LogOut,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { AiMatcherPanel } from './components/AiMatcherPanel';
import { ApprovalsPanel } from './components/ApprovalsPanel';
import { BookingModal } from './components/BookingModal';
import { ConflictResolverPanel } from './components/ConflictResolverPanel';
import { EquipmentCard } from './components/EquipmentCard';
import { ScheduleMatrix } from './components/ScheduleMatrix';
import {
  buildInitialBookingsAndSlots,
  HERO_FACILITY_IMAGE,
  INITIAL_EQUIPMENT,
} from './data/seedCatalog';
import { ADMIN_EMAIL, auth, googleProvider, testConnection } from './lib/firebase';
import {
  applyConflictResolutionPlan,
  cancelOwnBooking,
  createProjectBooking,
  facultyDecideBooking,
  seedCampusDatabaseIfEmpty,
  subscribeBookings,
  subscribeEquipment,
  subscribeSlotBlocks,
  syncUserRecords,
  updateEquipmentStatus,
} from './lib/labService';
import type {
  AiConflictResolutionResponse,
  Booking,
  Equipment,
  EquipmentCategory,
  SlotBlock,
  UserProfile,
  UserRoleMode,
  WorkspaceTab,
} from './types';

const CATEGORIES: Array<'All' | EquipmentCategory> = [
  'All',
  'Electronics & RF',
  'AI & Compute',
  'Robotics & FPGA',
  'Fabrication & Photonics',
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Initial local showcase state so campus catalog and conflicts are immediately visible
  const initialDemo = useMemo(() => buildInitialBookingsAndSlots(), []);
  const [equipment, setEquipment] = useState<Equipment[]>(INITIAL_EQUIPMENT);
  const [slotBlocks, setSlotBlocks] = useState<SlotBlock[]>(initialDemo.slotBlocks);
  const [bookings, setBookings] = useState<Booking[]>(initialDemo.bookings);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Workspace navigation & filtering
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('discover');
  const [roleMode, setRoleMode] = useState<UserRoleMode>('student');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | EquipmentCategory>('All');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [showAiMatcher, setShowAiMatcher] = useState(true);

  // Booking Modal state
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingTargetEq, setBookingTargetEq] = useState<Equipment | null>(null);
  const [bookingPrefill, setBookingPrefill] = useState<{
    startIso?: string;
    endIso?: string;
    title?: string;
    summary?: string;
    deadlineIso?: string;
  }>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const isAdminUser = Boolean(
    user && user.emailVerified && user.email === ADMIN_EMAIL
  );

  // Test Firestore connection on boot
  useEffect(() => {
    void testConnection();
  }, []);

  // Auth listener & automatic user/catalog initialization
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (firebaseUser) {
        try {
          const synced = await syncUserRecords(firebaseUser);
          setProfile(synced);
          const isAdm = Boolean(
            firebaseUser.emailVerified && firebaseUser.email === ADMIN_EMAIL
          );
          if (isAdm) {
            setRoleMode('faculty');
            await seedCampusDatabaseIfEmpty(true);
          }
        } catch (err) {
          setFirestoreError(
            err instanceof Error ? err.message : 'Unable to synchronize user profile.'
          );
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsubAuth();
  }, []);

  // Live Firestore subscriptions for Equipment and Public SlotBlocks
  useEffect(() => {
    const unsubEq = subscribeEquipment(
      (items) => {
        if (items.length > 0) {
          setEquipment(items);
        }
      },
      (err) => setFirestoreError(err.message)
    );

    const unsubSlots = subscribeSlotBlocks(
      (items) => {
        if (items.length > 0) {
          setSlotBlocks(items);
        } else if (user && isAdminUser) {
          setSlotBlocks([]);
        }
      },
      (err) => setFirestoreError(err.message)
    );

    return () => {
      unsubEq();
      unsubSlots();
    };
  }, [user, isAdminUser]);

  // Live Firestore subscription for Bookings (admin sees all, student sees own)
  useEffect(() => {
    if (!authReady || !user) {
      setBookings(initialDemo.bookings);
      return;
    }

    const unsubBookings = subscribeBookings(
      user.uid,
      isAdminUser,
      (items) => {
        setBookings(items);
      },
      (err) => setFirestoreError(err.message)
    );
    return () => unsubBookings();
  }, [authReady, user, isAdminUser, initialDemo.bookings]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 5000);
  }

  async function handleSignIn() {
    try {
      setFirestoreError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setFirestoreError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.'
      );
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setRoleMode('student');
    showToast('Signed out of LabLink.');
  }

  function openBookingModal(
    eq: Equipment,
    prefill?: {
      startIso?: string;
      endIso?: string;
      title?: string;
      summary?: string;
      deadlineIso?: string;
    }
  ) {
    setBookingTargetEq(eq);
    setBookingPrefill(prefill || {});
    setBookingModalOpen(true);
  }

  async function handleSubmitBooking(payload: {
    equipment: Equipment;
    department: string;
    projectTitle: string;
    projectSummary: string;
    courseOrLabCode: string;
    deadlineIso: string;
    startIso: string;
    endIso: string;
  }) {
    if (!user) {
      await handleSignIn();
      return;
    }
    const result = await createProjectBooking({
      requesterUid: user.uid,
      requesterName: profile?.displayName || user.displayName || 'Student Researcher',
      department: payload.department,
      equipment: payload.equipment,
      projectTitle: payload.projectTitle,
      projectSummary: payload.projectSummary,
      courseOrLabCode: payload.courseOrLabCode,
      deadlineIso: payload.deadlineIso,
      startIso: payload.startIso,
      endIso: payload.endIso,
      existingSlotBlocks: slotBlocks,
    });

    if (result.status === 'conflict') {
      showToast('Booking submitted with overlap — queued in AI Conflict Resolver.');
      setActiveTab('conflicts');
    } else if (result.status === 'pending') {
      showToast('Project access request submitted for faculty review.');
    } else {
      showToast('Laboratory slot confirmed and added to campus schedule.');
    }
  }

  async function handleApproveBooking(booking: Booking, notes: string) {
    if (user && isAdminUser) {
      await facultyDecideBooking({
        booking,
        decision: 'approved',
        facultyNotes: notes,
      });
    } else {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === booking.id ? { ...b, status: 'approved', facultyNotes: notes } : b
        )
      );
      setSlotBlocks((prev) =>
        prev.map((s) => (s.bookingId === booking.id ? { ...s, status: 'reserved' } : s))
      );
    }
    showToast(`Approved "${booking.projectTitle}" for ${booking.requesterName}.`);
  }

  async function handleRejectBooking(booking: Booking, notes: string) {
    if (user && isAdminUser) {
      await facultyDecideBooking({
        booking,
        decision: 'rejected',
        facultyNotes: notes,
      });
    } else {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === booking.id ? { ...b, status: 'rejected', facultyNotes: notes } : b
        )
      );
      setSlotBlocks((prev) => prev.filter((s) => s.bookingId !== booking.id));
    }
    showToast(`Declined "${booking.projectTitle}".`);
  }

  async function handleApplyConflictPlan(plan: AiConflictResolutionResponse) {
    if (user && isAdminUser) {
      await applyConflictResolutionPlan(plan.allocations, bookings);
    } else {
      // Local preview update for non-admin explorer
      setBookings((prev) =>
        prev.map((b) => {
          const alloc = plan.allocations.find((a) => a.bookingId === b.id);
          if (!alloc) return b;
          return {
            ...b,
            status: 'approved',
            equipmentId: alloc.assignedEquipmentId,
            equipmentName: alloc.assignedEquipmentName,
            startIso: alloc.assignedStartIso,
            endIso: alloc.assignedEndIso,
            aiResolutionNote: alloc.fairnessRationale,
          };
        })
      );
      setSlotBlocks((prev) =>
        prev.map((s) => {
          const alloc = plan.allocations.find((a) => a.bookingId === s.bookingId);
          if (!alloc) return s;
          return {
            ...s,
            equipmentId: alloc.assignedEquipmentId,
            equipmentName: alloc.assignedEquipmentName,
            startIso: alloc.assignedStartIso,
            endIso: alloc.assignedEndIso,
            status: 'reserved',
          };
        })
      );
    }
    showToast('Fair scheduling allocations applied.');
  }

  async function handleToggleMaintenance(eq: Equipment) {
    const nextStatus = eq.status === 'maintenance' ? 'available' : 'maintenance';
    if (user && isAdminUser) {
      await updateEquipmentStatus(eq.id, nextStatus);
    } else {
      setEquipment((prev) =>
        prev.map((item) => (item.id === eq.id ? { ...item, status: nextStatus } : item))
      );
    }
    showToast(`${eq.name} marked as ${nextStatus}.`);
  }

  const filteredEquipment = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return equipment.filter((eq) => {
      if (selectedCategory !== 'All' && eq.category !== selectedCategory) return false;
      if (onlyAvailable && eq.status !== 'available') return false;
      if (!q) return true;
      return (
        eq.name.toLowerCase().includes(q) ||
        eq.department.toLowerCase().includes(q) ||
        eq.specs.toLowerCase().includes(q) ||
        eq.capabilities.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [equipment, selectedCategory, onlyAvailable, searchQuery]);

  // Dynamic KPI strip metrics
  const availableCount = equipment.filter((e) => e.status === 'available').length;
  const conflictCount = bookings.filter((b) => b.status === 'conflict').length;
  const pendingCount = bookings.filter(
    (b) => b.status === 'pending' || b.status === 'conflict'
  ).length;
  const avgUtil =
    equipment.length > 0
      ? Math.round(equipment.reduce((sum, e) => sum + e.utilizationPct, 0) / equipment.length)
      : 0;

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Exactly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('discover');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            LabLink
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'discover'
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-blue-600'
                  : 'hover:text-slate-900'
              }`}
            >
              Equipment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'schedule'
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-blue-600'
                  : 'hover:text-slate-900'
              }`}
            >
              Schedule
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conflicts')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'conflicts'
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-blue-600'
                  : 'hover:text-slate-900'
              }`}
            >
              Conflict Lab
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'approvals'
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-blue-600'
                  : 'hover:text-slate-900'
              }`}
            >
              Approvals
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  const firstAvail =
                    equipment.find((e) => e.status === 'available') || equipment[0];
                  if (firstAvail) openBookingModal(firstAvail);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Book Equipment
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 space-y-8">
        {toastMsg && (
          <div
            role="status"
            className="px-4 py-3 bg-slate-900 text-white text-sm rounded-lg flex items-center justify-between gap-4"
          >
            <span>{toastMsg}</span>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {firestoreError && (
          <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
            {firestoreError}
          </div>
        )}

        {/* Asymmetric 2-Column Hero Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-600">
                Cross-Departmental Campus Laboratory Network
              </p>
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-[1.15]"
                style={{ textWrap: 'balance' }}
              >
                Making College Laboratories Accessible Across Every Department
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Discover specialized instruments, development kits, and high-compute workstations. Submit project-based access requests, coordinate faculty sign-offs, and resolve overlapping reservations fairly using deadline-aware AI scheduling.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('discover');
                  setShowAiMatcher(true);
                  setTimeout(() => {
                    document
                      .getElementById('ai-project-matcher')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Match Equipment with AI
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('conflicts')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Resolve Conflicts ({conflictCount})
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[260px]">
            {!heroImgFailed ? (
              <img
                src={HERO_FACILITY_IMAGE}
                alt="University interdisciplinary engineering and photonics laboratory"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-300 p-6 text-center">
                <Building2 className="w-10 h-10 mb-2 text-slate-400" />
                <span className="text-sm font-medium">Campus Interdisciplinary Lab Wing</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
              <p className="text-xs font-medium text-slate-200">
                4 Departments · Maxwell Hall, Turing Center & Curie Pavilion
              </p>
              <p className="text-sm font-semibold">
                Shared Bench Hours: 08:00 – 21:00 Daily
              </p>
            </div>
          </div>
        </section>

        {/* Full-Width 4-Column KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Shared Instruments</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {equipment.length}
            </p>
            <p className="text-xs text-slate-500">
              <span className="font-mono tabular-nums text-emerald-700 font-medium">
                {availableCount}
              </span>{' '}
              ready for booking
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Campus Utilization</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {avgUtil}%
            </p>
            <p className="text-xs text-slate-500">Weekly bench capacity</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Active Collisions</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-amber-700">
              {conflictCount}
            </p>
            <p className="text-xs text-slate-500">Queued for AI arbitration</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Faculty Sign-Off Queue</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {pendingCount}
            </p>
            <p className="text-xs text-slate-500">Project-based requests</p>
          </div>
        </section>

        {/* Workspace Toolbar: Tab Navigation + Role Perspective Switcher + Account Controls */}
        <section className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'discover'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              01. Equipment Discovery
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'schedule'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              02. Schedule Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conflicts')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'conflicts'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              03. AI Conflict Resolver ({conflictCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'approvals'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              04. Approvals & Requests
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-between lg:justify-end">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setRoleMode('student')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  roleMode === 'student'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Student View
              </button>
              <button
                type="button"
                onClick={() => setRoleMode('faculty')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  roleMode === 'faculty'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Faculty Coordinator
              </button>
            </div>

            {user && (
              <div className="flex items-center gap-2.5 text-xs text-slate-600 pl-2 border-l border-slate-200">
                <span className="font-medium text-slate-900 truncate max-w-[160px]">
                  {profile?.displayName || user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign out"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Active Workspace Viewport */}
        {activeTab === 'discover' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h2 className="text-lg font-semibold text-slate-900">
                  Cross-Departmental Equipment Inventory
                </h2>
                <p className="text-sm text-slate-600">
                  Search instruments by capability, filter by engineering division, or run AI project matching.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAiMatcher((v) => !v)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {showAiMatcher ? 'Hide AI Matcher' : 'Open AI Matcher'}
              </button>
            </div>

            {showAiMatcher && (
              <AiMatcherPanel
                equipment={equipment}
                slotBlocks={slotBlocks}
                onSelectRecommendation={(eq, startIso, endIso, title, summary, deadlineIso) =>
                  openBookingModal(eq, { startIso, endIso, title, summary, deadlineIso })
                }
              />
            )}

            {/* Filter & Search Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search FPGA, H100, RF, UV-Vis..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyAvailable((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    onlyAvailable
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Available Only
                </button>
              </div>
            </div>

            {filteredEquipment.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  No instruments match your current filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                    setOnlyAvailable(false);
                  }}
                  className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEquipment.map((eq) => (
                  <EquipmentCard
                    key={eq.id}
                    equipment={eq}
                    isFacultyMode={roleMode === 'faculty'}
                    onBook={(item) => openBookingModal(item)}
                    onToggleMaintenance={handleToggleMaintenance}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedule' && (
          <ScheduleMatrix
            equipment={equipment}
            slotBlocks={slotBlocks}
            onBookSlot={(eq, startIso, endIso) =>
              openBookingModal(eq, { startIso, endIso })
            }
          />
        )}

        {activeTab === 'conflicts' && (
          <ConflictResolverPanel
            bookings={bookings}
            equipment={equipment}
            slotBlocks={slotBlocks}
            isAdminUser={isAdminUser}
            isSignedIn={Boolean(user)}
            onApplyPlan={handleApplyConflictPlan}
            onSignIn={handleSignIn}
          />
        )}

        {activeTab === 'approvals' && (
          <ApprovalsPanel
            bookings={bookings}
            equipment={equipment}
            roleMode={roleMode}
            currentUid={user?.uid ?? null}
            isAdminUser={isAdminUser}
            onApprove={handleApproveBooking}
            onReject={handleRejectBooking}
            onCancelOwn={async (id) => {
              await cancelOwnBooking(id);
              showToast('Booking request cancelled.');
            }}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1280px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>LabLink · Campus Laboratory Resource Sharing & Scheduling</span>
          <span>Cross-Department Equipment Access · Maxwell Hall · Turing Center · Curie Pavilion</span>
        </div>
      </footer>

      <BookingModal
        isOpen={bookingModalOpen}
        equipment={bookingTargetEq}
        initialStartIso={bookingPrefill.startIso}
        initialEndIso={bookingPrefill.endIso}
        initialTitle={bookingPrefill.title}
        initialSummary={bookingPrefill.summary}
        initialDeadlineIso={bookingPrefill.deadlineIso}
        slotBlocks={slotBlocks}
        isSignedIn={Boolean(user)}
        defaultDepartment={profile?.department || 'Electrical & Computer Eng.'}
        onClose={() => setBookingModalOpen(false)}
        onSignIn={handleSignIn}
        onSubmit={handleSubmitBooking}
      />
    </div>
  );
}
