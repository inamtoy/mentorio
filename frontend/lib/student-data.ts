// ─── Student Profile ──────────────────────────────────────────────────────────

export const STUDENT_PROFILE = {
  id: "s1",
  name: "Alice Johnson",
  loginId: "STU-2025-0142",
  phone: "+1 555-0101",
  avatar: undefined,
  studentIdNumber: "STU-2025-0142",
  grade: "10th Grade",
  groupId: "g1",
  groupName: "Algebra A1",
  parentName: "Mary Johnson",
  parentPhone: "+1 555-0100",
  joinedAt: "2025-09-01",
  bio: "Alice is a dedicated 10th-grade student with a strong interest in mathematics and biology. She consistently participates in class discussions and enjoys collaborative problem-solving.",
};

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

// Student Messages mock array (STUDENT_MESSAGES) and its page
// (app/student/messages/page.tsx) were removed here (2026-08-21) — same
// call as Teacher Messages: no user-to-user messaging backend exists
// anywhere in this app (checked database migrations + every backend app),
// so there was nothing real to convert to. See lib/teacher-data.ts for the
// full note.

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
// with it rather than ported (Student Messages was later removed
// entirely — see the note above).
