// Student Profile mock object (STUDENT_PROFILE) was removed here
// (2026-08-21) once app/student/layout.tsx's header user-dropdown (its
// last consumer) switched to the real logged-in user via useAuthStore —
// same authUser.fullName/loginId + getInitials pattern already used by
// app/teacher/layout.tsx's TeacherHeader. app/student/profile/page.tsx
// has used the real Student Profile API all along.

// Student Payment mock object (STUDENT_PAYMENT) was removed here
// (2026-08-21) once student/profile/page.tsx switched to a real
// outstanding-balance summary sourced from useInvoicesQuery — see
// lib/queries/finance.ts.

// Student Courses/Groups mock array (STUDENT_COURSES) was removed here
// (2026-08-21) once student/groups/page.tsx and student/profile/page.tsx
// (its last two real consumers) switched to real
// useMyGroupMembershipsQuery+useGroupsQuery joins — see lib/queries/groups.ts.

// Student Schedule mock array (STUDENT_SCHEDULE) was removed here
// (2026-08-07) once the real Schedule backend + Student page landed — see
// lib/api/schedule.ts.

// Student Homework mock array (STUDENT_HOMEWORK) was removed here
// (2026-08-07) once the real Homework backend + Student page landed — see
// lib/api/homework.ts.

// Student Grades mock array (STUDENT_GRADES) and its GRADE_TREND_DATA
// trend-chart sibling were removed here (2026-08-21) once
// student/grades/page.tsx and student/page.tsx (its last two consumers)
// switched to the real, computed Grades module — see lib/queries/grades.ts.
// The monthly trend chart itself wasn't ported: no real "average score by
// month" concept exists to back it (confirmed with the user — same "don't
// invent" call as Teacher Grades' dropped letter-grade/distribution card).

// Student Attendance mock array (STUDENT_ATTENDANCE) and its
// WEEKLY_ATTENDANCE_TREND sibling were already fully orphaned before this
// pass — app/student/attendance/page.tsx moved to the real Attendance
// backend in an earlier session and never used these; removed here
// (2026-08-21) while cleaning up this file for the Dashboard conversion.

// ─── Student Messages ─────────────────────────────────────────────────────────

export const STUDENT_MESSAGES = [
  {
    id: "smsg1",
    participantName: "Dr. Sarah Connor",
    participantRole: "teacher" as const,
    lastMessage: "Great job on the polynomial worksheet, Alice!",
    lastTime: "2026-07-06T11:00:00Z",
    unread: 1,
    avatar: undefined,
    messages: [
      { id: "sm1a", senderId: "s1", text: "Hi Dr. Connor, I submitted my worksheet a bit early, could you check it?", time: "2026-07-06T10:35:00Z", isMe: true },
      { id: "sm1b", senderId: "t1", text: "Great job on the polynomial worksheet, Alice!", time: "2026-07-06T11:00:00Z", isMe: false },
    ],
  },
  {
    id: "smsg2",
    participantName: "Admin Office",
    participantRole: "admin" as const,
    lastMessage: "Mid-term exam schedule has been posted. Please check your Exams page.",
    lastTime: "2026-07-03T09:00:00Z",
    unread: 1,
    avatar: undefined,
    messages: [
      { id: "sm2a", senderId: "admin", text: "Mid-term exam schedule has been posted. Please check your Exams page.", time: "2026-07-03T09:00:00Z", isMe: false },
    ],
  },
  {
    id: "smsg3",
    participantName: "Mr. James Cole",
    participantRole: "teacher" as const,
    lastMessage: "Don't forget the essay is due this Wednesday.",
    lastTime: "2026-07-02T14:20:00Z",
    unread: 0,
    avatar: undefined,
    messages: [
      { id: "sm3a", senderId: "t2", text: "Don't forget the essay is due this Wednesday.", time: "2026-07-02T14:20:00Z", isMe: false },
      { id: "sm3b", senderId: "s1", text: "Thank you for the reminder, I'm almost done!", time: "2026-07-02T14:35:00Z", isMe: true },
    ],
  },
  {
    id: "smsg4",
    participantName: "Ms. Elena Ruiz",
    participantRole: "teacher" as const,
    lastMessage: "Your lab report was well organized, nice work.",
    lastTime: "2026-06-30T16:00:00Z",
    unread: 0,
    avatar: undefined,
    messages: [
      { id: "sm4a", senderId: "t3", text: "Your lab report was well organized, nice work.", time: "2026-06-30T16:00:00Z", isMe: false },
    ],
  },
];

// Student Notifications mock array (STUDENT_NOTIFICATIONS) was already
// fully orphaned before this pass — app/student/notifications/page.tsx
// reads the real Notification API and never used this. Removed here
// (2026-08-21) while cleaning up this file for the Dashboard conversion.

// Student Stats mock object (STUDENT_STATS) was removed here (2026-08-21)
// once app/student/page.tsx (its last consumer) switched every rendered
// field to a real source: attendanceRate/avgGrade to the same
// Attendance/Grades queries app/student/profile/page.tsx already uses,
// enrolledCourses to useStudentGroupMembershipsQuery. unreadMessages was
// computed but never actually rendered anywhere in that page — dropped
// with it rather than ported (Student Messages itself is still its own
// separate, not-yet-converted page — see student/messages/page.tsx).
