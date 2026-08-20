// ─── Teacher Profile ──────────────────────────────────────────────────────────

export const TEACHER_PROFILE = {
  id: "t1",
  name: "Dr. Sarah Connor",
  loginId: "TCH-2001",
  phone: "+1 555-0201",
  subject: "Mathematics",
  specialization: "Algebra & Calculus",
  bio: "Dr. Sarah Connor is a passionate mathematics educator with over 8 years of experience teaching algebra and calculus. She holds a PhD in Applied Mathematics from MIT and is known for her engaging teaching style that makes complex concepts accessible to all students.",
  joinedAt: "2022-01-15",
  avatar: undefined,
  rating: 4.9,
  totalStudents: 42,
  totalGroups: 3,
  yearsExperience: 8,
};

// Teacher Groups mock array (TEACHER_GROUPS) was removed here (2026-08-21)
// once app/teacher/resources/page.tsx's group picker (its last remaining
// consumer) switched to the real groups API — see lib/queries/groups.ts.
// app/teacher/groups/page.tsx itself has used the real API all along.

// ─── Teacher Students ─────────────────────────────────────────────────────────

export const TEACHER_STUDENTS = [
  {
    id: "s1",
    name: "Alice Johnson",
    loginId: "STU-2101",
    phone: "+1 555-0101",
    groupId: "g1",
    groupName: "Algebra A1",
    attendanceRate: 95,
    avgGrade: 88,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Mary Johnson",
    parentPhone: "+1 555-0100",
    notes: "Consistently performs well. Participates actively in class.",
  },
  {
    id: "s2",
    name: "Bob Smith",
    loginId: "STU-2102",
    phone: "+1 555-0102",
    groupId: "g1",
    groupName: "Algebra A1",
    attendanceRate: 88,
    avgGrade: 74,
    lastActive: "2026-07-03",
    status: "active" as const,
    parentName: "Tom Smith",
    parentPhone: "+1 555-0099",
    notes: "Struggles with word problems. Extra practice recommended.",
  },
  {
    id: "s3",
    name: "Carol White",
    loginId: "STU-2103",
    phone: "+1 555-0103",
    groupId: "g2",
    groupName: "Algebra A2",
    attendanceRate: 92,
    avgGrade: 85,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "David White",
    parentPhone: "+1 555-0098",
    notes: "Good progress in recent weeks.",
  },
  {
    id: "s4",
    name: "Daniel Brown",
    loginId: "STU-2104",
    phone: "+1 555-0104",
    groupId: "g2",
    groupName: "Algebra A2",
    attendanceRate: 62,
    avgGrade: 58,
    lastActive: "2026-06-28",
    status: "inactive" as const,
    parentName: "Susan Brown",
    parentPhone: "+1 555-0097",
    notes: "Frequent absences. Parent meeting scheduled.",
  },
  {
    id: "s5",
    name: "Eva Martinez",
    loginId: "STU-2105",
    phone: "+1 555-0105",
    groupId: "g3",
    groupName: "Calculus B1",
    attendanceRate: 98,
    avgGrade: 94,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Carlos Martinez",
    parentPhone: "+1 555-0096",
    notes: "Top student. Excellent understanding of derivatives.",
  },
  {
    id: "s6",
    name: "Frank Lee",
    loginId: "STU-2106",
    phone: "+1 555-0106",
    groupId: "g3",
    groupName: "Calculus B1",
    attendanceRate: 85,
    avgGrade: 80,
    lastActive: "2026-07-02",
    status: "active" as const,
    parentName: "Lisa Lee",
    parentPhone: "+1 555-0095",
    notes: "Good overall performance.",
  },
  {
    id: "s7",
    name: "Grace Kim",
    loginId: "STU-2107",
    phone: "+1 555-0107",
    groupId: "g3",
    groupName: "Calculus B1",
    attendanceRate: 91,
    avgGrade: 88,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "James Kim",
    parentPhone: "+1 555-0094",
    notes: "Strong analytical skills.",
  },
  {
    id: "s11",
    name: "Kate Adams",
    loginId: "STU-2111",
    phone: "+1 555-0111",
    groupId: "g1",
    groupName: "Algebra A1",
    attendanceRate: 93,
    avgGrade: 91,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Mike Adams",
    parentPhone: "+1 555-0090",
    notes: "Excellent student. Helps peers during group work.",
  },
  {
    id: "s12",
    name: "Liam Turner",
    loginId: "STU-2112",
    phone: "+1 555-0112",
    groupId: "g2",
    groupName: "Algebra A2",
    attendanceRate: 45,
    avgGrade: 52,
    lastActive: "2026-06-20",
    status: "inactive" as const,
    parentName: "Nancy Turner",
    parentPhone: "+1 555-0089",
    notes: "At risk of failing. Urgent intervention needed.",
  },
  {
    id: "s13",
    name: "Noah Evans",
    loginId: "STU-2113",
    phone: "+1 555-0113",
    groupId: "g1",
    groupName: "Algebra A1",
    attendanceRate: 82,
    avgGrade: 79,
    lastActive: "2026-07-03",
    status: "active" as const,
    parentName: "Anna Evans",
    parentPhone: "+1 555-0088",
    notes: "Improving steadily.",
  },
  {
    id: "s14",
    name: "Olivia Harris",
    loginId: "STU-2114",
    phone: "+1 555-0114",
    groupId: "g1",
    groupName: "Algebra A1",
    attendanceRate: 97,
    avgGrade: 95,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Peter Harris",
    parentPhone: "+1 555-0087",
    notes: "Outstanding student. Strong candidate for honors.",
  },
  {
    id: "s15",
    name: "Sophia Clark",
    loginId: "STU-2115",
    phone: "+1 555-0115",
    groupId: "g2",
    groupName: "Algebra A2",
    attendanceRate: 90,
    avgGrade: 87,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Helen Clark",
    parentPhone: "+1 555-0086",
    notes: "Consistent effort and good attitude.",
  },
  {
    id: "s16",
    name: "Mason Lewis",
    loginId: "STU-2116",
    phone: "+1 555-0116",
    groupId: "g2",
    groupName: "Algebra A2",
    attendanceRate: 85,
    avgGrade: 76,
    lastActive: "2026-07-03",
    status: "active" as const,
    parentName: "George Lewis",
    parentPhone: "+1 555-0085",
    notes: "Needs more practice on factoring.",
  },
  {
    id: "s17",
    name: "Ethan Walker",
    loginId: "STU-2117",
    phone: "+1 555-0117",
    groupId: "g3",
    groupName: "Calculus B1",
    attendanceRate: 88,
    avgGrade: 83,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Sandra Walker",
    parentPhone: "+1 555-0084",
    notes: "Good progress on integration concepts.",
  },
  {
    id: "s18",
    name: "Ava Hall",
    loginId: "STU-2118",
    phone: "+1 555-0118",
    groupId: "g3",
    groupName: "Calculus B1",
    attendanceRate: 94,
    avgGrade: 92,
    lastActive: "2026-07-04",
    status: "active" as const,
    parentName: "Brian Hall",
    parentPhone: "+1 555-0083",
    notes: "Excellent grasp of limits and continuity.",
  },
];

// ─── Teacher Attendance ───────────────────────────────────────────────────────

export const TEACHER_ATTENDANCE = [
  { id: "ta1", studentId: "s1", studentName: "Alice Johnson", groupId: "g1", groupName: "Algebra A1", date: "2026-07-04", status: "present" as const },
  { id: "ta2", studentId: "s2", studentName: "Bob Smith", groupId: "g1", groupName: "Algebra A1", date: "2026-07-04", status: "late" as const, note: "Arrived 10 minutes late" },
  { id: "ta3", studentId: "s11", studentName: "Kate Adams", groupId: "g1", groupName: "Algebra A1", date: "2026-07-04", status: "present" as const },
  { id: "ta4", studentId: "s13", studentName: "Noah Evans", groupId: "g1", groupName: "Algebra A1", date: "2026-07-04", status: "absent" as const, note: "No notification" },
  { id: "ta5", studentId: "s14", studentName: "Olivia Harris", groupId: "g1", groupName: "Algebra A1", date: "2026-07-04", status: "present" as const },
  { id: "ta6", studentId: "s3", studentName: "Carol White", groupId: "g2", groupName: "Algebra A2", date: "2026-07-03", status: "present" as const },
  { id: "ta7", studentId: "s4", studentName: "Daniel Brown", groupId: "g2", groupName: "Algebra A2", date: "2026-07-03", status: "absent" as const, note: "Parent notified" },
  { id: "ta8", studentId: "s12", studentName: "Liam Turner", groupId: "g2", groupName: "Algebra A2", date: "2026-07-03", status: "absent" as const },
  { id: "ta9", studentId: "s15", studentName: "Sophia Clark", groupId: "g2", groupName: "Algebra A2", date: "2026-07-03", status: "present" as const },
  { id: "ta10", studentId: "s16", studentName: "Mason Lewis", groupId: "g2", groupName: "Algebra A2", date: "2026-07-03", status: "late" as const, note: "Bus delay" },
  { id: "ta11", studentId: "s5", studentName: "Eva Martinez", groupId: "g3", groupName: "Calculus B1", date: "2026-07-02", status: "present" as const },
  { id: "ta12", studentId: "s6", studentName: "Frank Lee", groupId: "g3", groupName: "Calculus B1", date: "2026-07-02", status: "present" as const },
  { id: "ta13", studentId: "s7", studentName: "Grace Kim", groupId: "g3", groupName: "Calculus B1", date: "2026-07-02", status: "excused" as const, note: "Medical appointment" },
  { id: "ta14", studentId: "s17", studentName: "Ethan Walker", groupId: "g3", groupName: "Calculus B1", date: "2026-07-02", status: "present" as const },
  { id: "ta15", studentId: "s18", studentName: "Ava Hall", groupId: "g3", groupName: "Calculus B1", date: "2026-07-02", status: "present" as const },
  { id: "ta16", studentId: "s1", studentName: "Alice Johnson", groupId: "g1", groupName: "Algebra A1", date: "2026-07-01", status: "present" as const },
  { id: "ta17", studentId: "s2", studentName: "Bob Smith", groupId: "g1", groupName: "Algebra A1", date: "2026-07-01", status: "present" as const },
  { id: "ta18", studentId: "s3", studentName: "Carol White", groupId: "g2", groupName: "Algebra A2", date: "2026-06-30", status: "present" as const },
  { id: "ta19", studentId: "s4", studentName: "Daniel Brown", groupId: "g2", groupName: "Algebra A2", date: "2026-06-30", status: "absent" as const },
  { id: "ta20", studentId: "s5", studentName: "Eva Martinez", groupId: "g3", groupName: "Calculus B1", date: "2026-06-30", status: "present" as const },
];


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

// ─── Teacher Messages ─────────────────────────────────────────────────────────

export const TEACHER_MESSAGES = [
  {
    id: "msg1",
    participantName: "Alice Johnson",
    participantRole: "student" as const,
    lastMessage: "Thank you for the feedback on my assignment!",
    lastTime: "2026-07-04T10:15:00Z",
    unread: 1,
    avatar: undefined,
    messages: [
      { id: "m1a", senderId: "t1", text: "Hi Alice, I've reviewed your polynomial worksheet. Great work overall!", time: "2026-07-04T09:50:00Z", isMe: true },
      { id: "m1b", senderId: "s1", text: "Thank you for the feedback on my assignment!", time: "2026-07-04T10:15:00Z", isMe: false },
    ],
  },
  {
    id: "msg2",
    participantName: "Mary Johnson",
    participantRole: "parent" as const,
    lastMessage: "Can we schedule a meeting to discuss Alice's progress?",
    lastTime: "2026-07-03T16:30:00Z",
    unread: 2,
    avatar: undefined,
    messages: [
      { id: "m2a", senderId: "parent1", text: "Hello Dr. Connor, I wanted to check in on Alice.", time: "2026-07-03T15:00:00Z", isMe: false },
      { id: "m2b", senderId: "t1", text: "Hi Mary! Alice is doing wonderfully. She scored 92 on her last assignment.", time: "2026-07-03T15:45:00Z", isMe: true },
      { id: "m2c", senderId: "parent1", text: "Can we schedule a meeting to discuss Alice's progress?", time: "2026-07-03T16:30:00Z", isMe: false },
    ],
  },
  {
    id: "msg3",
    participantName: "Admin Office",
    participantRole: "admin" as const,
    lastMessage: "Please submit your mid-term grade reports by July 20.",
    lastTime: "2026-07-03T09:00:00Z",
    unread: 0,
    avatar: undefined,
    messages: [
      { id: "m3a", senderId: "admin", text: "Please submit your mid-term grade reports by July 20.", time: "2026-07-03T09:00:00Z", isMe: false },
      { id: "m3b", senderId: "t1", text: "Understood, I'll have them ready by July 18.", time: "2026-07-03T09:30:00Z", isMe: true },
    ],
  },
  {
    id: "msg4",
    participantName: "Daniel Brown",
    participantRole: "student" as const,
    lastMessage: "I'll try to attend all classes from now on.",
    lastTime: "2026-07-02T14:00:00Z",
    unread: 0,
    avatar: undefined,
    messages: [
      { id: "m4a", senderId: "t1", text: "Daniel, I'm concerned about your recent absences. Is everything okay?", time: "2026-07-02T13:00:00Z", isMe: true },
      { id: "m4b", senderId: "s4", text: "I'm sorry Dr. Connor. I've been dealing with some personal issues.", time: "2026-07-02T13:40:00Z", isMe: false },
      { id: "m4c", senderId: "t1", text: "I understand. Please let me know if you need any support.", time: "2026-07-02T13:50:00Z", isMe: true },
      { id: "m4d", senderId: "s4", text: "I'll try to attend all classes from now on.", time: "2026-07-02T14:00:00Z", isMe: false },
    ],
  },
  {
    id: "msg5",
    participantName: "Eva Martinez",
    participantRole: "student" as const,
    lastMessage: "Could you recommend extra reading for calculus?",
    lastTime: "2026-07-01T18:00:00Z",
    unread: 0,
    avatar: undefined,
    messages: [
      { id: "m5a", senderId: "s5", text: "Hi Dr. Connor! Could you recommend extra reading for calculus?", time: "2026-07-01T18:00:00Z", isMe: false },
      { id: "m5b", senderId: "t1", text: "Absolutely! Check out 'Calculus' by James Stewart, chapters 2–4.", time: "2026-07-01T18:30:00Z", isMe: true },
    ],
  },
  {
    id: "msg6",
    participantName: "Nancy Turner",
    participantRole: "parent" as const,
    lastMessage: "We will make sure Liam attends regularly.",
    lastTime: "2026-06-30T11:00:00Z",
    unread: 0,
    avatar: undefined,
    messages: [
      { id: "m6a", senderId: "t1", text: "Dear Mrs. Turner, Liam's attendance is critically low at 45%. We need to discuss this urgently.", time: "2026-06-30T10:00:00Z", isMe: true },
      { id: "m6b", senderId: "parent6", text: "We are so sorry. We were not aware. We will make sure Liam attends regularly.", time: "2026-06-30T11:00:00Z", isMe: false },
    ],
  },
];

// ─── Teacher Resources ────────────────────────────────────────────────────────

export const TEACHER_RESOURCES = [
  { id: "res1", title: "Algebra Fundamentals Textbook", subject: "Algebra", type: "pdf" as const, size: "8.4 MB", uploadedAt: "2026-01-10", groupId: "g1", groupName: "Algebra A1", downloads: 34, shared: true },
  { id: "res2", title: "Polynomial Operations Video Lecture", subject: "Algebra", type: "video" as const, size: "245 MB", uploadedAt: "2026-03-05", groupId: "g1", groupName: "Algebra A1", downloads: 28, shared: true },
  { id: "res3", title: "Systems of Equations Notes", subject: "Algebra", type: "document" as const, size: "1.2 MB", uploadedAt: "2026-04-15", groupId: "g2", groupName: "Algebra A2", downloads: 22, shared: false },
  { id: "res4", title: "Calculus Quick Reference Sheet", subject: "Calculus", type: "pdf" as const, size: "540 KB", uploadedAt: "2026-02-20", groupId: "g3", groupName: "Calculus B1", downloads: 41, shared: true },
  { id: "res5", title: "Derivatives Practice Problems", subject: "Calculus", type: "document" as const, size: "2.1 MB", uploadedAt: "2026-06-01", groupId: "g3", groupName: "Calculus B1", downloads: 19, shared: true },
  { id: "res6", title: "Khan Academy – Algebra Playlist", subject: "Algebra", type: "link" as const, size: "—", uploadedAt: "2026-01-20", downloads: 56, shared: true },
  { id: "res7", title: "Graphing Calculator Tutorial", subject: "Mathematics", type: "video" as const, size: "112 MB", uploadedAt: "2026-05-10", downloads: 37, shared: true },
  { id: "res8", title: "Exam Formula Sheet", subject: "Mathematics", type: "pdf" as const, size: "320 KB", uploadedAt: "2026-06-25", downloads: 45, shared: true },
  { id: "res9", title: "Quadratic Equations Diagram", subject: "Algebra", type: "image" as const, size: "780 KB", uploadedAt: "2026-04-02", groupId: "g2", groupName: "Algebra A2", downloads: 14, shared: false },
  { id: "res10", title: "Mid-Term Study Guide", subject: "Algebra", type: "document" as const, size: "1.8 MB", uploadedAt: "2026-07-01", groupId: "g1", groupName: "Algebra A1", downloads: 12, shared: false },
];

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

// ─── Teacher Stats ────────────────────────────────────────────────────────────

export const TEACHER_STATS = {
  todayClasses: 2,
  totalStudents: 42,
  avgAttendance: 84,
  pendingGrading: 7,
  upcomingExams: 3,
  unreadMessages: 3,
};

// ─── Chart Data ───────────────────────────────────────────────────────────────

export const WEEKLY_ATTENDANCE_DATA = [
  { name: "Mon", present: 38, absent: 3, late: 1 },
  { name: "Tue", present: 28, absent: 5, late: 2 },
  { name: "Wed", present: 37, absent: 4, late: 1 },
  { name: "Thu", present: 27, absent: 6, late: 2 },
  { name: "Fri", present: 36, absent: 5, late: 1 },
  { name: "Sat", present: 0, absent: 0, late: 0 },
];

export const GRADE_DISTRIBUTION_DATA = [
  { name: "A (90–100)", value: 7, color: "#22c55e" },
  { name: "B (80–89)", value: 5, color: "#6366f1" },
  { name: "C (70–79)", value: 2, color: "#f59e0b" },
  { name: "F (below 70)", value: 1, color: "#ef4444" },
];
