import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TEACHER_PROFILE } from "@/lib/teacher-data";

export interface TeacherProfile {
  id: string;
  name: string;
  loginId: string;
  phone: string;
  subject: string;
  specialization: string;
  bio: string;
  joinedAt: string;
  avatar?: string;
  rating: number;
  totalStudents: number;
  totalGroups: number;
  yearsExperience: number;
}

interface TeacherProfileState {
  profile: TeacherProfile;
  update: (patch: Partial<TeacherProfile>) => void;
  /** False until zustand's persist middleware finishes reading
   * localStorage — a component that copies `profile` into local editable
   * state at mount (e.g. Settings' account form) would otherwise capture
   * this store's pre-hydration default. Consumers key a remount off this
   * flag instead of re-syncing via useEffect (see
   * react_compiler_zustand_bug/zustand_persist_rehydration_timing memory
   * notes — same rehydration-timing class of bug, fixed here at the
   * store level instead of per-consumer). */
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
}

export const useTeacherProfileStore = create<TeacherProfileState>()(
  persist(
    (set) => ({
      profile: TEACHER_PROFILE,
      update: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "educore-teacher-profile",
      version: 1,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
