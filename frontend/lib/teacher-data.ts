// Teacher Profile mock object (TEACHER_PROFILE) and its
// lib/store/teacher-profile-store.ts wrapper were removed here (2026-08-21)
// once app/teacher/settings/page.tsx's Account tab (its last consumer)
// switched to the real useMyTeacherProfileQuery/useUpdateTeacherMutation —
// see lib/queries/teachers.ts. app/teacher/profile/page.tsx has used the
// real API all along; Settings' Account tab now mirrors its exact
// "sync at mount, not via useEffect" pattern, same as Student Settings.

// Teacher Groups mock array (TEACHER_GROUPS) was removed here (2026-08-21)
// once app/teacher/resources/page.tsx's group picker (its last remaining
// consumer) switched to the real groups API — see lib/queries/groups.ts.
// app/teacher/groups/page.tsx itself has used the real API all along.

// Teacher Students mock array (TEACHER_STUDENTS) was removed here
// (2026-08-21): lib/store/teacher-students-store.ts, its only consumer,
// was already fully orphaned before this pass — the real Teacher
// Students page has used the real Students/Attendance APIs all along
// and never imported this store.

// Teacher Attendance mock array (TEACHER_ATTENDANCE) was removed here
// (2026-08-21): lib/store/teacher-attendance-store.ts, its only
// consumer, was already fully orphaned before this pass — the real
// Teacher Attendance page has used the real Attendance API all along
// and never imported this store.

// Teacher Schedule mock array (TEACHER_SCHEDULE) was removed here
// (2026-08-07) once the real Schedule backend + Teacher page landed — see
// lib/api/schedule.ts.

// Teacher Assignments mock array (TEACHER_ASSIGNMENTS) was removed here
// (2026-08-21) once app/teacher/groups/page.tsx's Homework tab switched to
// the real homework API — see lib/queries/homework.ts.

// ─── Teacher Submissions ──────────────────────────────────────────────────────

export const TEACHER_SUBMISSIONS = [
  { id: "sub1", assignmentId: "asgn1", studentId: "s1", studentName: "Alice Johnson", submittedAt: "2026-07-06T10:30:00Z", score: 92, maxScore: 100, status: "submitted" as const, feedback: "Excellent work on multiplication!" },
  { id: "sub2", assignmentId: "asgn1", studentId: "s2", studentName: "Bob Smith", submittedAt: "2026-07-08T22:10:00Z", score: 71, maxScore: 100, status: "late" as const, feedback: "A few errors in subtraction section." },
  { id: "sub3", assignmentId: "asgn1", studentId: "s11", studentName: "Kate Adams", submittedAt: "2026-07-05T09:00:00Z", score: 98, maxScore: 100, status: "submitted" as const, feedback: "Perfect score almost! Great job." },
  { id: "sub4", assignmentId: "asgn1", studentId: "s14", studentName: "Olivia Harris", submittedAt: "2026-07-06T14:00:00Z", score: 96, maxScore: 100, status: "submitted" as const },
  { id: "sub5", assignmentId: "asgn2", studentId: "s3", studentName: "Carol White", submittedAt: "2026-07-08T11:45:00Z", score: 88, maxScore: 100, status: "submitted" as const, feedback: "Good use of elimination method." },
  { id: "sub6", assignmentId: "asgn2", studentId: "s15", studentName: "Sophia Clark", submittedAt: "2026-07-08T16:00:00Z", score: 84, maxScore: 100, status: "submitted" as const },
  { id: "sub7", assignmentId: "asgn3", studentId: "s5", studentName: "Eva Martinez", submittedAt: "2026-07-05T08:00:00Z", score: 100, maxScore: 100, status: "submitted" as const, feedback: "Outstanding! All limits correctly evaluated." },
  { id: "sub8", assignmentId: "asgn3", studentId: "s6", studentName: "Frank Lee", submittedAt: "2026-07-06T17:30:00Z", score: 82, maxScore: 100, status: "submitted" as const, feedback: "Review L'Hôpital's rule applications." },
  { id: "sub9", assignmentId: "asgn3", studentId: "s7", studentName: "Grace Kim", submittedAt: "2026-07-05T20:00:00Z", score: 91, maxScore: 100, status: "submitted" as const },
  { id: "sub10", assignmentId: "asgn5", studentId: "s5", studentName: "Eva Martinez", submittedAt: "2026-07-08T09:15:00Z", score: 97, maxScore: 100, status: "submitted" as const, feedback: "Flawless application of chain rule." },
  { id: "sub11", assignmentId: "asgn5", studentId: "s18", studentName: "Ava Hall", submittedAt: "2026-07-09T23:55:00Z", score: 89, maxScore: 100, status: "late" as const },
  { id: "sub12", assignmentId: "asgn6", studentId: "s3", studentName: "Carol White", submittedAt: "2026-06-27T14:00:00Z", score: 90, maxScore: 100, status: "submitted" as const },
  { id: "sub13", assignmentId: "asgn6", studentId: "s16", studentName: "Mason Lewis", submittedAt: "2026-06-29T10:00:00Z", score: 74, maxScore: 100, status: "late" as const, feedback: "Late submission. Vertex calculations had errors." },
  { id: "sub14", assignmentId: "asgn8", studentId: "s7", studentName: "Grace Kim", submittedAt: "2026-06-24T15:30:00Z", score: 76, maxScore: 80, status: "submitted" as const, feedback: "Solid understanding of power rule." },
  { id: "sub15", assignmentId: "asgn8", studentId: "s17", studentName: "Ethan Walker", submittedAt: "2026-06-25T23:50:00Z", score: 65, maxScore: 80, status: "late" as const, feedback: "Review integration constants." },
];


// Teacher Grades mock array (TEACHER_GRADES) was removed here (2026-08-21)
// once app/teacher/groups/page.tsx's Grades tab switched to the real,
// computed grades API — see lib/queries/grades.ts.

// Teacher Messages mock array (TEACHER_MESSAGES) and its page
// (app/teacher/messages/page.tsx) were removed here (2026-08-21): there is
// no backend for user-to-user messaging anywhere in this app (checked both
// the database migrations and every backend app — only one-way SMS/
// Telegram/email notification logs exist, no conversation/message table),
// so this was a pure frontend mock with nothing real to convert to.
// Building it for real means a new backend module (conversations, messages,
// RBAC, delivery), not a page-level conversion — out of scope for this pass.

// Teacher Resources mock array (TEACHER_RESOURCES) and its page
// (app/teacher/resources/page.tsx) were removed here (2026-08-21) — same
// call as Teacher/Student Messages: no backend exists for it at all.
// course.course_materials is defined in the database SQL design docs but
// explicitly not modeled at the Django layer yet (see
// backend/course/models/course.py's own docstring: "course_materials
// isn't modeled at all (no file-upload flow exists yet either)"), and the
// mock page's "Upload" button never took an actual file either — nothing
// real to convert to. Building this for real means a new backend module
// (model, serializer, viewset, file storage), not a page-level conversion.

// ─── Teacher Notifications ────────────────────────────────────────────────────

export const TEACHER_NOTIFICATIONS = [
  { id: "tn1", title: "New Message from Parent", message: "Mary Johnson sent you a message about Alice's progress.", type: "info" as const, read: false, createdAt: "2026-07-04T10:20:00Z", category: "message" as const },
  { id: "tn2", title: "Assignment Due Soon", message: "Polynomial Expressions Worksheet is due tomorrow for Algebra A1.", type: "warning" as const, read: false, createdAt: "2026-07-04T09:00:00Z", category: "assignment" as const },
  { id: "tn3", title: "Low Attendance Alert", message: "Liam Turner's attendance has dropped to 45% in Algebra A2.", type: "error" as const, read: false, createdAt: "2026-07-03T14:00:00Z", category: "class" as const },
  { id: "tn4", title: "Exam Scheduled", message: "Algebra A1 Mid-Term Exam is confirmed for July 15 in Exam Hall A.", type: "info" as const, read: false, createdAt: "2026-07-03T11:00:00Z", category: "exam" as const },
  { id: "tn5", title: "Grade Reports Due", message: "Admin requests mid-term grade reports submission by July 20.", type: "warning" as const, read: false, createdAt: "2026-07-03T09:00:00Z", category: "admin" as const },
  { id: "tn6", title: "Assignment Submitted", message: "Eva Martinez submitted the Limits Problem Set ahead of schedule.", type: "success" as const, read: true, createdAt: "2026-07-02T08:00:00Z", category: "assignment" as const },
  { id: "tn7", title: "New Message from Student", message: "Eva Martinez is asking for extra reading recommendations.", type: "info" as const, read: true, createdAt: "2026-07-01T18:05:00Z", category: "message" as const },
  { id: "tn8", title: "Class Cancelled Notice", message: "Algebra A1 session on July 10 has been cancelled due to school event.", type: "warning" as const, read: true, createdAt: "2026-07-01T12:00:00Z", category: "class" as const },
  { id: "tn9", title: "Exam Results Submitted", message: "Results for Calculus B1 Limits Quiz have been recorded successfully.", type: "success" as const, read: true, createdAt: "2026-06-26T16:00:00Z", category: "exam" as const },
  { id: "tn10", title: "Resource Uploaded", message: "Mid-Term Study Guide was successfully uploaded and shared with Algebra A1.", type: "success" as const, read: true, createdAt: "2026-07-01T10:00:00Z", category: "class" as const },
  { id: "tn11", title: "Late Submission", message: "Bob Smith submitted the Polynomial worksheet 12 hours late.", type: "warning" as const, read: true, createdAt: "2026-07-09T07:00:00Z", category: "assignment" as const },
  { id: "tn12", title: "Profile Updated", message: "Your profile information has been updated successfully.", type: "success" as const, read: true, createdAt: "2026-06-29T09:00:00Z", category: "admin" as const },
];

// Teacher Stats mock object (TEACHER_STATS) and its WEEKLY_ATTENDANCE_DATA
// chart-data sibling were already fully orphaned before this pass —
// app/teacher/page.tsx's Dashboard moved every one of these fields to real
// queries in an earlier session (see that page's own "derive don't store"
// comment on weeklyData) and never used either export again.

// Grade Distribution mock array (GRADE_DISTRIBUTION_DATA) was removed here
// (2026-08-21) once app/teacher/page.tsx (its last consumer) dropped the
// A/B/C/F letter-bucket pie chart rather than rebuilding it on the real
// Grades module — same "don't invent a grading scale nobody specified"
// call already made for Teacher Grades' identical Distribution card.
