import type {
  Student,
  Teacher,
  Transaction,
} from "@/types";

// ─── Students ─────────────────────────────────────────────────────────────────

export const STUDENTS: Student[] = [
  { id: "s1", name: "Alice Johnson", loginId: "STU-1001", phone: "+1 555-0101", gender: "female", dateOfBirth: "2008-03-15", address: "123 Main St, NY", parentName: "Mary Johnson", parentPhone: "+1 555-0100", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s2", name: "Bob Smith", loginId: "STU-1002", phone: "+1 555-0102", gender: "male", dateOfBirth: "2007-07-22", address: "456 Oak Ave, NY", parentName: "Tom Smith", parentPhone: "+1 555-0099", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s3", name: "Carol White", loginId: "STU-1003", phone: "+1 555-0103", gender: "female", dateOfBirth: "2009-01-10", address: "789 Pine Rd, NY", parentName: "David White", parentPhone: "+1 555-0098", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s4", name: "Daniel Brown", loginId: "STU-1004", phone: "+1 555-0104", gender: "male", dateOfBirth: "2008-11-05", address: "321 Elm St, NY", parentName: "Susan Brown", parentPhone: "+1 555-0097", status: "inactive", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s5", name: "Eva Martinez", loginId: "STU-1005", phone: "+1 555-0105", gender: "female", dateOfBirth: "2007-05-18", address: "654 Maple Dr, NY", parentName: "Carlos Martinez", parentPhone: "+1 555-0096", status: "active", enrolledAt: "2024-08-15", avatar: undefined },
  { id: "s6", name: "Frank Lee", loginId: "STU-1006", phone: "+1 555-0106", gender: "male", dateOfBirth: "2009-09-30", address: "987 Cedar Ln, NY", parentName: "Lisa Lee", parentPhone: "+1 555-0095", status: "active", enrolledAt: "2024-08-15", avatar: undefined },
  { id: "s7", name: "Grace Kim", loginId: "STU-1007", phone: "+1 555-0107", gender: "female", dateOfBirth: "2008-12-20", address: "147 Birch Blvd, NY", parentName: "James Kim", parentPhone: "+1 555-0094", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s8", name: "Henry Davis", loginId: "STU-1008", phone: "+1 555-0108", gender: "male", dateOfBirth: "2007-04-14", address: "258 Walnut Way, NY", parentName: "Rachel Davis", parentPhone: "+1 555-0093", status: "pending", enrolledAt: "2024-10-01", avatar: undefined },
  { id: "s9", name: "Iris Chen", loginId: "STU-1009", phone: "+1 555-0109", gender: "female", dateOfBirth: "2009-06-08", address: "369 Ash Ave, NY", parentName: "Wei Chen", parentPhone: "+1 555-0092", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s10", name: "Jake Wilson", loginId: "STU-1010", phone: "+1 555-0110", gender: "male", dateOfBirth: "2008-08-25", address: "741 Spruce St, NY", parentName: "Karen Wilson", parentPhone: "+1 555-0091", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s11", name: "Kate Adams", loginId: "STU-1011", phone: "+1 555-0111", gender: "female", dateOfBirth: "2007-02-12", address: "852 Poplar Pl, NY", parentName: "Mike Adams", parentPhone: "+1 555-0090", status: "active", enrolledAt: "2024-09-01", avatar: undefined },
  { id: "s12", name: "Liam Turner", loginId: "STU-1012", phone: "+1 555-0112", gender: "male", dateOfBirth: "2009-10-17", address: "963 Oak Ct, NY", parentName: "Nancy Turner", parentPhone: "+1 555-0089", status: "suspended", enrolledAt: "2024-09-01", avatar: undefined },
];

// ─── Teachers ─────────────────────────────────────────────────────────────────

export const TEACHERS: Teacher[] = [
  { id: "t1", name: "Dr. Sarah Connor", loginId: "TCH-2001", phone: "+1 555-0201", gender: "female", specialization: "Mathematics", subjects: ["Algebra", "Calculus", "Statistics"], groupCount: 3, studentCount: 45, status: "active", joinedAt: "2022-01-15", salary: 4500, rating: 4.9 },
  { id: "t2", name: "Prof. James Wilson", loginId: "TCH-2002", phone: "+1 555-0202", gender: "male", specialization: "Physics", subjects: ["Classical Physics", "Quantum Mechanics"], groupCount: 2, studentCount: 30, status: "active", joinedAt: "2021-08-01", salary: 4800, rating: 4.7 },
  { id: "t3", name: "Ms. Emily Carter", loginId: "TCH-2003", phone: "+1 555-0203", gender: "female", specialization: "English Literature", subjects: ["English", "Writing", "Literature"], groupCount: 4, studentCount: 60, status: "active", joinedAt: "2023-02-10", salary: 3800, rating: 4.8 },
  { id: "t4", name: "Dr. Robert Chen", loginId: "TCH-2004", phone: "+1 555-0204", gender: "male", specialization: "Chemistry", subjects: ["Organic Chemistry", "Inorganic Chemistry"], groupCount: 2, studentCount: 28, status: "active", joinedAt: "2022-09-01", salary: 4600, rating: 4.6 },
  { id: "t5", name: "Ms. Lisa Park", loginId: "TCH-2005", phone: "+1 555-0205", gender: "female", specialization: "Biology", subjects: ["Cell Biology", "Genetics", "Ecology"], groupCount: 3, studentCount: 42, status: "active", joinedAt: "2023-01-20", salary: 4000, rating: 4.9 },
  { id: "t6", name: "Mr. David Nguyen", loginId: "TCH-2006", phone: "+1 555-0206", gender: "male", specialization: "Computer Science", subjects: ["Programming", "Data Structures", "Web Dev"], groupCount: 2, studentCount: 35, status: "inactive", joinedAt: "2023-06-01", salary: 5000, rating: 4.5 },
];

// Admin's LESSONS mock array was removed here (2026-08-07) once the real
// Schedule backend + Admin page landed — see lib/api/schedule.ts. The
// Teacher/Student portals' own mocks (lib/teacher-data.ts::TEACHER_SCHEDULE,
// lib/student-data.ts::STUDENT_SCHEDULE) were replaced the same day — see
// their respective pages.

// Admin's ATTENDANCE_RECORDS mock array was removed here (2026-08) once the
// real Attendance backend + Admin page landed — see lib/api/attendance.ts.
// The Teacher portal's own mock (lib/teacher-data.ts::TEACHER_ATTENDANCE)
// was untouched at the time — that portal wasn't wired to real data yet.
// It has been since (2026-08-21); see that file's own removal note.

// ─── Finance ──────────────────────────────────────────────────────────────────

// Admin's INVOICES mock array was removed here (2026-08) once the real
// Finance backend + Admin page landed — see lib/api/finance.ts. TRANSACTIONS
// below is untouched: the Admin Dashboard's "Recent Transactions" widget
// still reads it and hasn't been wired to real Payment data yet.

export const TRANSACTIONS: Transaction[] = [
  { id: "tr1", studentName: "Alice Johnson", amount: 299, method: "card", description: "Monthly tuition - Algebra A1", date: "2026-06-28", status: "paid" },
  { id: "tr2", studentName: "Carol White", amount: 349, method: "transfer", description: "Monthly tuition - Physics B2", date: "2026-06-27", status: "paid" },
  { id: "tr3", studentName: "Eva Martinez", amount: 249, method: "cash", description: "Monthly tuition - English C1", date: "2026-06-25", status: "paid" },
  { id: "tr4", studentName: "Grace Kim", amount: 399, method: "online", description: "Monthly tuition - Chemistry D1", date: "2026-06-24", status: "paid" },
  { id: "tr5", studentName: "Iris Chen", amount: 329, method: "card", description: "Monthly tuition - Biology E2", date: "2026-06-23", status: "paid" },
  { id: "tr6", studentName: "Bob Smith", amount: 149, method: "cash", description: "Partial payment - Algebra A1", date: "2026-06-20", status: "paid" },
];

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const DASHBOARD_STATS = {
  totalStudents: 240,
  totalTeachers: 18,
  totalCourses: 12,
  totalGroups: 32,
  monthlyRevenue: 48600,
  avgAttendance: 87,
  newEnrollments: 24,
  pendingPayments: 8,
};

export const MONTHLY_REVENUE_DATA = [
  { name: "Jan", revenue: 38000, expenses: 21000 },
  { name: "Feb", revenue: 41000, expenses: 22000 },
  { name: "Mar", revenue: 39000, expenses: 20000 },
  { name: "Apr", revenue: 43000, expenses: 23000 },
  { name: "May", revenue: 45000, expenses: 24000 },
  { name: "Jun", revenue: 42000, expenses: 22500 },
  { name: "Jul", revenue: 48600, expenses: 25000 },
];

export const ATTENDANCE_TREND_DATA = [
  { name: "Mon", present: 92, absent: 8 },
  { name: "Tue", present: 88, absent: 12 },
  { name: "Wed", present: 95, absent: 5 },
  { name: "Thu", present: 85, absent: 15 },
  { name: "Fri", present: 90, absent: 10 },
  { name: "Sat", present: 78, absent: 22 },
];

export const ENROLLMENT_BY_COURSE = [
  { name: "Mathematics", value: 45, color: "#6366f1" },
  { name: "Physics", value: 30, color: "#3b82f6" },
  { name: "English", value: 60, color: "#22c55e" },
  { name: "Chemistry", value: 28, color: "#f59e0b" },
  { name: "Biology", value: 42, color: "#ec4899" },
  { name: "Web Dev", value: 35, color: "#a855f7" },
];
