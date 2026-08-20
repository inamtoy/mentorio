// ─── Super Admin Data ─────────────────────────────────────────────────────────

// ─── Stats ────────────────────────────────────────────────────────────────────

export const SA_STATS = {
  totalCenters: 24,
  totalBranches: 87,
  totalStudents: 18420,
  totalTeachers: 642,
  activeAdmins: 156,
  monthlyRevenue: 284600,
  activeSubscriptions: 81,
  newRegistrations: 347,
};

// ─── Centers ──────────────────────────────────────────────────────────────────

export type CenterStatus = "active" | "suspended" | "trial";
export type SubscriptionTier = "basic" | "pro" | "enterprise";

export interface SACenter {
  id: string;
  name: string;
  owner: string;
  city: string;
  country: string;
  branchCount: number;
  studentCount: number;
  teacherCount: number;
  status: CenterStatus;
  subscription: SubscriptionTier;
  createdAt: string;
  logo?: string;
}

export const SA_CENTERS: SACenter[] = [
  {
    id: "c1",
    name: "Bright Future Academy",
    owner: "James Thompson",
    city: "New York",
    country: "USA",
    branchCount: 12,
    studentCount: 2400,
    teacherCount: 84,
    status: "active",
    subscription: "enterprise",
    createdAt: "2023-02-15",
  },
  {
    id: "c2",
    name: "Nova Learning Hub",
    owner: "Aisha Patel",
    city: "London",
    country: "UK",
    branchCount: 8,
    studentCount: 1800,
    teacherCount: 63,
    status: "active",
    subscription: "pro",
    createdAt: "2023-04-01",
  },
  {
    id: "c3",
    name: "EduStar Institute",
    owner: "Carlos Mendez",
    city: "Madrid",
    country: "Spain",
    branchCount: 5,
    studentCount: 900,
    teacherCount: 32,
    status: "trial",
    subscription: "basic",
    createdAt: "2024-01-10",
  },
  {
    id: "c4",
    name: "Pinnacle Education Center",
    owner: "Fatima Al-Hassan",
    city: "Dubai",
    country: "UAE",
    branchCount: 10,
    studentCount: 2100,
    teacherCount: 75,
    status: "active",
    subscription: "enterprise",
    createdAt: "2023-06-20",
  },
  {
    id: "c5",
    name: "Horizon Academy",
    owner: "Liu Wei",
    city: "Singapore",
    country: "Singapore",
    branchCount: 6,
    studentCount: 1200,
    teacherCount: 44,
    status: "active",
    subscription: "pro",
    createdAt: "2023-09-05",
  },
  {
    id: "c6",
    name: "Maple Leaf Learning",
    owner: "Sophie Tremblay",
    city: "Toronto",
    country: "Canada",
    branchCount: 4,
    studentCount: 760,
    teacherCount: 28,
    status: "active",
    subscription: "basic",
    createdAt: "2024-03-18",
  },
  {
    id: "c7",
    name: "Summit Skills Institute",
    owner: "Ravi Sharma",
    city: "Mumbai",
    country: "India",
    branchCount: 9,
    studentCount: 1950,
    teacherCount: 68,
    status: "suspended",
    subscription: "pro",
    createdAt: "2023-07-12",
  },
  {
    id: "c8",
    name: "Coastal Kids Academy",
    owner: "Elena Rossi",
    city: "Sydney",
    country: "Australia",
    branchCount: 3,
    studentCount: 480,
    teacherCount: 18,
    status: "trial",
    subscription: "basic",
    createdAt: "2024-05-22",
  },
];

// ─── Branches ─────────────────────────────────────────────────────────────────

export type BranchStatus = "active" | "inactive" | "suspended";

export interface SABranch {
  id: string;
  name: string;
  centerId: string;
  centerName: string;
  address: string;
  city: string;
  manager: string;
  phone: string;
  email: string;
  studentCount: number;
  teacherCount: number;
  status: BranchStatus;
  workingHours: string;
  createdAt: string;
}

export const SA_BRANCHES: SABranch[] = [
  {
    id: "b1",
    name: "Manhattan Campus",
    centerId: "c1",
    centerName: "Bright Future Academy",
    address: "150 W 34th St",
    city: "New York",
    manager: "Rachel Kim",
    phone: "+1 212-555-0101",
    email: "manhattan@brightfuture.edu",
    studentCount: 420,
    teacherCount: 15,
    status: "active",
    workingHours: "Mon–Fri 8am–6pm",
    createdAt: "2023-02-20",
  },
  {
    id: "b2",
    name: "Brooklyn Branch",
    centerId: "c1",
    centerName: "Bright Future Academy",
    address: "89 Atlantic Ave",
    city: "Brooklyn",
    manager: "Marcus Davis",
    phone: "+1 718-555-0202",
    email: "brooklyn@brightfuture.edu",
    studentCount: 380,
    teacherCount: 13,
    status: "active",
    workingHours: "Mon–Sat 8am–5pm",
    createdAt: "2023-04-10",
  },
  {
    id: "b3",
    name: "Central London Hub",
    centerId: "c2",
    centerName: "Nova Learning Hub",
    address: "12 Oxford Street",
    city: "London",
    manager: "Oliver Hughes",
    phone: "+44 20-555-0303",
    email: "central@novalearn.co.uk",
    studentCount: 310,
    teacherCount: 11,
    status: "active",
    workingHours: "Mon–Fri 9am–7pm",
    createdAt: "2023-04-15",
  },
  {
    id: "b4",
    name: "East London Campus",
    centerId: "c2",
    centerName: "Nova Learning Hub",
    address: "45 Mile End Road",
    city: "London",
    manager: "Priya Nair",
    phone: "+44 20-555-0404",
    email: "east@novalearn.co.uk",
    studentCount: 265,
    teacherCount: 9,
    status: "active",
    workingHours: "Mon–Sat 9am–6pm",
    createdAt: "2023-08-01",
  },
  {
    id: "b5",
    name: "Madrid Centro",
    centerId: "c3",
    centerName: "EduStar Institute",
    address: "Gran Vía 28",
    city: "Madrid",
    manager: "Ana García",
    phone: "+34 91-555-0505",
    email: "centro@edustar.es",
    studentCount: 190,
    teacherCount: 7,
    status: "active",
    workingHours: "Mon–Fri 9am–6pm",
    createdAt: "2024-01-15",
  },
  {
    id: "b6",
    name: "Dubai Marina Campus",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    address: "Marina Walk, Tower B",
    city: "Dubai",
    manager: "Khalid Al-Mansouri",
    phone: "+971 4-555-0606",
    email: "marina@pinnacle.ae",
    studentCount: 350,
    teacherCount: 12,
    status: "active",
    workingHours: "Sun–Thu 8am–6pm",
    createdAt: "2023-06-25",
  },
  {
    id: "b7",
    name: "Downtown Dubai Branch",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    address: "Sheikh Zayed Rd, Unit 4",
    city: "Dubai",
    manager: "Nour Khalil",
    phone: "+971 4-555-0707",
    email: "downtown@pinnacle.ae",
    studentCount: 290,
    teacherCount: 10,
    status: "active",
    workingHours: "Sun–Thu 9am–7pm",
    createdAt: "2023-10-01",
  },
  {
    id: "b8",
    name: "Orchard Road Campus",
    centerId: "c5",
    centerName: "Horizon Academy",
    address: "313 Orchard Road",
    city: "Singapore",
    manager: "Chen Mei Ling",
    phone: "+65 6555-0808",
    email: "orchard@horizonacademy.sg",
    studentCount: 240,
    teacherCount: 9,
    status: "active",
    workingHours: "Mon–Sat 8am–7pm",
    createdAt: "2023-09-10",
  },
  {
    id: "b9",
    name: "Jurong West Branch",
    centerId: "c5",
    centerName: "Horizon Academy",
    address: "50 Jurong Gateway Rd",
    city: "Singapore",
    manager: "Ahmad Faris",
    phone: "+65 6555-0909",
    email: "jurong@horizonacademy.sg",
    studentCount: 180,
    teacherCount: 7,
    status: "inactive",
    workingHours: "Mon–Fri 9am–6pm",
    createdAt: "2024-01-20",
  },
  {
    id: "b10",
    name: "Toronto Downtown",
    centerId: "c6",
    centerName: "Maple Leaf Learning",
    address: "200 Bay Street",
    city: "Toronto",
    manager: "Isabelle Côté",
    phone: "+1 416-555-1010",
    email: "downtown@mapleleaf.ca",
    studentCount: 210,
    teacherCount: 8,
    status: "active",
    workingHours: "Mon–Fri 8am–6pm",
    createdAt: "2024-03-25",
  },
  {
    id: "b11",
    name: "Mumbai Andheri Branch",
    centerId: "c7",
    centerName: "Summit Skills Institute",
    address: "Andheri West, Link Road",
    city: "Mumbai",
    manager: "Deepika Joshi",
    phone: "+91 22-555-1111",
    email: "andheri@summitskills.in",
    studentCount: 320,
    teacherCount: 11,
    status: "suspended",
    workingHours: "Mon–Sat 9am–6pm",
    createdAt: "2023-07-18",
  },
  {
    id: "b12",
    name: "Sydney CBD Campus",
    centerId: "c8",
    centerName: "Coastal Kids Academy",
    address: "100 George Street",
    city: "Sydney",
    manager: "Liam O'Brien",
    phone: "+61 2-555-1212",
    email: "cbd@coastalkids.com.au",
    studentCount: 160,
    teacherCount: 6,
    status: "active",
    workingHours: "Mon–Fri 8am–5pm",
    createdAt: "2024-05-28",
  },
];


// ─── Admins ───────────────────────────────────────────────────────────────────

export type AdminRole = "center_admin" | "branch_admin" | "moderator";
export type AdminStatus = "active" | "inactive" | "suspended";

export interface SAAdmin {
  id: string;
  name: string;
  loginId: string;
  phone: string;
  centerId: string;
  centerName: string;
  branchId: string;
  branchName: string;
  role: AdminRole;
  status: AdminStatus;
  lastLogin: string;
  createdAt: string;
  permissions: string[];
}

export const SA_ADMINS: SAAdmin[] = [
  {
    id: "a1",
    name: "Rachel Kim",
    loginId: "EDU-3001",
    phone: "+1 212-555-1001",
    centerId: "c1",
    centerName: "Bright Future Academy",
    branchId: "b1",
    branchName: "Manhattan Campus",
    role: "center_admin",
    status: "active",
    lastLogin: "2026-07-04T10:30:00Z",
    createdAt: "2023-02-20",
    permissions: ["manage_teachers", "manage_students", "view_reports", "manage_schedule", "manage_payments"],
  },
  {
    id: "a2",
    name: "Marcus Davis",
    loginId: "EDU-3002",
    phone: "+1 718-555-1002",
    centerId: "c1",
    centerName: "Bright Future Academy",
    branchId: "b2",
    branchName: "Brooklyn Branch",
    role: "branch_admin",
    status: "active",
    lastLogin: "2026-07-03T15:45:00Z",
    createdAt: "2023-04-10",
    permissions: ["manage_teachers", "manage_students", "view_reports", "manage_schedule"],
  },
  {
    id: "a3",
    name: "Oliver Hughes",
    loginId: "EDU-3003",
    phone: "+44 20-555-1003",
    centerId: "c2",
    centerName: "Nova Learning Hub",
    branchId: "b3",
    branchName: "Central London Hub",
    role: "center_admin",
    status: "active",
    lastLogin: "2026-07-04T09:00:00Z",
    createdAt: "2023-04-15",
    permissions: ["manage_teachers", "manage_students", "view_reports", "manage_schedule", "manage_payments", "manage_branches"],
  },
  {
    id: "a4",
    name: "Ana García",
    loginId: "EDU-3004",
    phone: "+34 91-555-1004",
    centerId: "c3",
    centerName: "EduStar Institute",
    branchId: "b5",
    branchName: "Madrid Centro",
    role: "center_admin",
    status: "active",
    lastLogin: "2026-07-02T11:20:00Z",
    createdAt: "2024-01-15",
    permissions: ["manage_teachers", "manage_students", "view_reports"],
  },
  {
    id: "a5",
    name: "Khalid Al-Mansouri",
    loginId: "EDU-3005",
    phone: "+971 4-555-1005",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    branchId: "b6",
    branchName: "Dubai Marina Campus",
    role: "center_admin",
    status: "active",
    lastLogin: "2026-07-04T07:15:00Z",
    createdAt: "2023-06-25",
    permissions: ["manage_teachers", "manage_students", "view_reports", "manage_schedule", "manage_payments", "manage_branches"],
  },
  {
    id: "a6",
    name: "Nour Khalil",
    loginId: "EDU-3006",
    phone: "+971 4-555-1006",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    branchId: "b7",
    branchName: "Downtown Dubai Branch",
    role: "branch_admin",
    status: "active",
    lastLogin: "2026-07-03T13:00:00Z",
    createdAt: "2023-10-01",
    permissions: ["manage_teachers", "manage_students", "view_reports", "manage_schedule"],
  },
  {
    id: "a7",
    name: "Chen Mei Ling",
    loginId: "EDU-3007",
    phone: "+65 6555-1007",
    centerId: "c5",
    centerName: "Horizon Academy",
    branchId: "b8",
    branchName: "Orchard Road Campus",
    role: "center_admin",
    status: "active",
    lastLogin: "2026-07-04T08:45:00Z",
    createdAt: "2023-09-10",
    permissions: ["manage_teachers", "manage_students", "view_reports", "manage_schedule", "manage_payments"],
  },
  {
    id: "a8",
    name: "Isabelle Côté",
    loginId: "EDU-3008",
    phone: "+1 416-555-1008",
    centerId: "c6",
    centerName: "Maple Leaf Learning",
    branchId: "b10",
    branchName: "Toronto Downtown",
    role: "center_admin",
    status: "active",
    lastLogin: "2026-07-01T16:30:00Z",
    createdAt: "2024-03-25",
    permissions: ["manage_teachers", "manage_students", "view_reports"],
  },
  {
    id: "a9",
    name: "Deepika Joshi",
    loginId: "EDU-3009",
    phone: "+91 22-555-1009",
    centerId: "c7",
    centerName: "Summit Skills Institute",
    branchId: "b11",
    branchName: "Mumbai Andheri Branch",
    role: "center_admin",
    status: "suspended",
    lastLogin: "2026-06-15T10:00:00Z",
    createdAt: "2023-07-18",
    permissions: ["manage_teachers", "manage_students"],
  },
  {
    id: "a10",
    name: "Liam O'Brien",
    loginId: "EDU-3010",
    phone: "+61 2-555-1010",
    centerId: "c8",
    centerName: "Coastal Kids Academy",
    branchId: "b12",
    branchName: "Sydney CBD Campus",
    role: "moderator",
    status: "active",
    lastLogin: "2026-07-03T14:00:00Z",
    createdAt: "2024-05-28",
    permissions: ["view_reports", "manage_students"],
  },
];

// ─── Teachers ─────────────────────────────────────────────────────────────────

export type TeacherStatus = "active" | "inactive";

export interface SATeacher {
  id: string;
  name: string;
  loginId: string;
  phone: string;
  centerId: string;
  centerName: string;
  branchName: string;
  subject: string;
  status: TeacherStatus;
  joinedAt: string;
  rating: number;
}

export const SA_TEACHERS: SATeacher[] = [
  {
    id: "t1",
    name: "Dr. Sarah Connor",
    loginId: "TCH-4001",
    phone: "+1 212-555-2001",
    centerId: "c1",
    centerName: "Bright Future Academy",
    branchName: "Manhattan Campus",
    subject: "Mathematics",
    status: "active",
    joinedAt: "2023-03-01",
    rating: 4.9,
  },
  {
    id: "t2",
    name: "Prof. Henry Walsh",
    loginId: "TCH-4002",
    phone: "+1 718-555-2002",
    centerId: "c1",
    centerName: "Bright Future Academy",
    branchName: "Brooklyn Branch",
    subject: "Physics",
    status: "active",
    joinedAt: "2023-04-15",
    rating: 4.7,
  },
  {
    id: "t3",
    name: "Ms. Priya Nair",
    loginId: "TCH-4003",
    phone: "+44 20-555-2003",
    centerId: "c2",
    centerName: "Nova Learning Hub",
    branchName: "East London Campus",
    subject: "English Literature",
    status: "active",
    joinedAt: "2023-05-01",
    rating: 4.8,
  },
  {
    id: "t4",
    name: "Mr. Diego Ruiz",
    loginId: "TCH-4004",
    phone: "+34 91-555-2004",
    centerId: "c3",
    centerName: "EduStar Institute",
    branchName: "Madrid Centro",
    subject: "History",
    status: "active",
    joinedAt: "2024-02-01",
    rating: 4.5,
  },
  {
    id: "t5",
    name: "Dr. Layla Hassan",
    loginId: "TCH-4005",
    phone: "+971 4-555-2005",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    branchName: "Dubai Marina Campus",
    subject: "Chemistry",
    status: "active",
    joinedAt: "2023-07-10",
    rating: 4.9,
  },
  {
    id: "t6",
    name: "Mr. Tan Jia Wei",
    loginId: "TCH-4006",
    phone: "+65 6555-2006",
    centerId: "c5",
    centerName: "Horizon Academy",
    branchName: "Orchard Road Campus",
    subject: "Computer Science",
    status: "active",
    joinedAt: "2023-10-01",
    rating: 4.6,
  },
  {
    id: "t7",
    name: "Ms. Claire Bouchard",
    loginId: "TCH-4007",
    phone: "+1 416-555-2007",
    centerId: "c6",
    centerName: "Maple Leaf Learning",
    branchName: "Toronto Downtown",
    subject: "French",
    status: "active",
    joinedAt: "2024-04-01",
    rating: 4.7,
  },
  {
    id: "t8",
    name: "Mr. Arjun Mehta",
    loginId: "TCH-4008",
    phone: "+91 22-555-2008",
    centerId: "c7",
    centerName: "Summit Skills Institute",
    branchName: "Mumbai Andheri Branch",
    subject: "Business Studies",
    status: "inactive",
    joinedAt: "2023-08-01",
    rating: 4.3,
  },
  {
    id: "t9",
    name: "Ms. Emma Collins",
    loginId: "TCH-4009",
    phone: "+61 2-555-2009",
    centerId: "c8",
    centerName: "Coastal Kids Academy",
    branchName: "Sydney CBD Campus",
    subject: "Art & Design",
    status: "active",
    joinedAt: "2024-06-01",
    rating: 4.8,
  },
  {
    id: "t10",
    name: "Dr. Yusuf Al-Rashid",
    loginId: "TCH-4010",
    phone: "+971 4-555-2010",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    branchName: "Downtown Dubai Branch",
    subject: "Biology",
    status: "active",
    joinedAt: "2023-11-01",
    rating: 4.9,
  },
];

// ─── Students ─────────────────────────────────────────────────────────────────

export type StudentStatus = "active" | "inactive" | "suspended";

export interface SAStudent {
  id: string;
  name: string;
  loginId: string;
  phone: string;
  centerId: string;
  centerName: string;
  branchName: string;
  groupName: string;
  status: StudentStatus;
  enrolledAt: string;
  balance: number;
}

export const SA_STUDENTS: SAStudent[] = [
  {
    id: "s1",
    name: "Emily Johnson",
    loginId: "STU-4001",
    phone: "+1 212-555-3001",
    centerId: "c1",
    centerName: "Bright Future Academy",
    branchName: "Manhattan Campus",
    groupName: "Grade 10 – Alpha",
    status: "active",
    enrolledAt: "2023-09-01",
    balance: 0,
  },
  {
    id: "s2",
    name: "Noah Williams",
    loginId: "STU-4002",
    phone: "+1 718-555-3002",
    centerId: "c1",
    centerName: "Bright Future Academy",
    branchName: "Brooklyn Branch",
    groupName: "Grade 11 – Beta",
    status: "active",
    enrolledAt: "2023-09-01",
    balance: 150,
  },
  {
    id: "s3",
    name: "Sophia Brown",
    loginId: "STU-4003",
    phone: "+44 20-555-3003",
    centerId: "c2",
    centerName: "Nova Learning Hub",
    branchName: "Central London Hub",
    groupName: "A-Level Sciences",
    status: "active",
    enrolledAt: "2023-09-05",
    balance: 0,
  },
  {
    id: "s4",
    name: "Luca Fernández",
    loginId: "STU-4004",
    phone: "+34 91-555-3004",
    centerId: "c3",
    centerName: "EduStar Institute",
    branchName: "Madrid Centro",
    groupName: "Bachillerato 2",
    status: "active",
    enrolledAt: "2024-01-20",
    balance: 200,
  },
  {
    id: "s5",
    name: "Mariam Al-Farsi",
    loginId: "STU-4005",
    phone: "+971 4-555-3005",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    branchName: "Dubai Marina Campus",
    groupName: "Advanced Science Track",
    status: "active",
    enrolledAt: "2023-08-15",
    balance: 0,
  },
  {
    id: "s6",
    name: "Kai Tanaka",
    loginId: "STU-4006",
    phone: "+65 6555-3006",
    centerId: "c5",
    centerName: "Horizon Academy",
    branchName: "Orchard Road Campus",
    groupName: "IP Year 3",
    status: "active",
    enrolledAt: "2023-09-10",
    balance: 75,
  },
  {
    id: "s7",
    name: "Zoe Tremblay",
    loginId: "STU-4007",
    phone: "+1 416-555-3007",
    centerId: "c6",
    centerName: "Maple Leaf Learning",
    branchName: "Toronto Downtown",
    groupName: "Grade 9 – Enrichment",
    status: "active",
    enrolledAt: "2024-04-10",
    balance: 0,
  },
  {
    id: "s8",
    name: "Rohan Kapoor",
    loginId: "STU-4008",
    phone: "+91 22-555-3008",
    centerId: "c7",
    centerName: "Summit Skills Institute",
    branchName: "Mumbai Andheri Branch",
    groupName: "MBA Prep",
    status: "suspended",
    enrolledAt: "2023-08-01",
    balance: -500,
  },
  {
    id: "s9",
    name: "Ava Thompson",
    loginId: "STU-4009",
    phone: "+61 2-555-3009",
    centerId: "c8",
    centerName: "Coastal Kids Academy",
    branchName: "Sydney CBD Campus",
    groupName: "Year 7 – Creative Arts",
    status: "active",
    enrolledAt: "2024-06-05",
    balance: 0,
  },
  {
    id: "s10",
    name: "Omar Al-Sayed",
    loginId: "STU-4010",
    phone: "+971 4-555-3010",
    centerId: "c4",
    centerName: "Pinnacle Education Center",
    branchName: "Downtown Dubai Branch",
    groupName: "IGCSE Track A",
    status: "active",
    enrolledAt: "2023-09-01",
    balance: 0,
  },
  {
    id: "s11",
    name: "Isabella Rossi",
    loginId: "STU-4011",
    phone: "+44 20-555-3011",
    centerId: "c2",
    centerName: "Nova Learning Hub",
    branchName: "East London Campus",
    groupName: "GCSE Group B",
    status: "inactive",
    enrolledAt: "2023-09-05",
    balance: 300,
  },
  {
    id: "s12",
    name: "Ethan Park",
    loginId: "STU-4012",
    phone: "+65 6555-3012",
    centerId: "c5",
    centerName: "Horizon Academy",
    branchName: "Jurong West Branch",
    groupName: "O-Level Maths",
    status: "active",
    enrolledAt: "2024-01-25",
    balance: 0,
  },
];


// ─── Subscriptions ────────────────────────────────────────────────────────────

export type BillingCycle = "monthly" | "annual";

export interface SASubscription {
  id: string;
  name: "Basic" | "Pro" | "Enterprise" | "Starter" | "Custom";
  price: number;
  billingCycle: BillingCycle;
  maxBranches: number;
  maxStudents: number;
  maxTeachers: number;
  features: string[];
  activeCount: number;
  color: string;
}

export const SA_SUBSCRIPTIONS: SASubscription[] = [
  {
    id: "sub1",
    name: "Starter",
    price: 49,
    billingCycle: "monthly",
    maxBranches: 1,
    maxStudents: 100,
    maxTeachers: 10,
    features: ["Basic dashboard", "Student management", "Attendance tracking", "Email support"],
    activeCount: 12,
    color: "#94a3b8",
  },
  {
    id: "sub2",
    name: "Basic",
    price: 99,
    billingCycle: "monthly",
    maxBranches: 3,
    maxStudents: 500,
    maxTeachers: 30,
    features: ["All Starter features", "Multi-branch support", "Grade management", "Reports", "Chat support"],
    activeCount: 24,
    color: "#6366f1",
  },
  {
    id: "sub3",
    name: "Pro",
    price: 249,
    billingCycle: "monthly",
    maxBranches: 10,
    maxStudents: 2000,
    maxTeachers: 100,
    features: ["All Basic features", "Advanced analytics", "API access", "Custom branding", "Priority support", "Bulk import"],
    activeCount: 31,
    color: "#8b5cf6",
  },
  {
    id: "sub4",
    name: "Enterprise",
    price: 599,
    billingCycle: "annual",
    maxBranches: 999,
    maxStudents: 999999,
    maxTeachers: 9999,
    features: ["All Pro features", "Unlimited branches", "Dedicated account manager", "SLA guarantee", "Custom integrations", "On-site training", "White-label option"],
    activeCount: 11,
    color: "#f59e0b",
  },
  {
    id: "sub5",
    name: "Custom",
    price: 0,
    billingCycle: "annual",
    maxBranches: 999,
    maxStudents: 999999,
    maxTeachers: 9999,
    features: ["Fully tailored plan", "Custom pricing", "Dedicated infrastructure", "24/7 support", "Full API access", "Custom SLA"],
    activeCount: 3,
    color: "#10b981",
  },
];

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentMethod = "card" | "transfer" | "online";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded";

export interface SAPayment {
  id: string;
  centerName: string;
  amount: number;
  plan: string;
  method: PaymentMethod;
  date: string;
  status: PaymentStatus;
  invoiceId: string;
}

export const SA_PAYMENTS: SAPayment[] = [
  { id: "p1",  centerName: "Bright Future Academy",     amount: 599,  plan: "Enterprise", method: "card",     date: "2026-07-01", status: "paid",    invoiceId: "INV-2026-0701" },
  { id: "p2",  centerName: "Nova Learning Hub",         amount: 249,  plan: "Pro",        method: "transfer", date: "2026-07-01", status: "paid",    invoiceId: "INV-2026-0702" },
  { id: "p3",  centerName: "Pinnacle Education Center", amount: 599,  plan: "Enterprise", method: "card",     date: "2026-07-02", status: "paid",    invoiceId: "INV-2026-0703" },
  { id: "p4",  centerName: "Horizon Academy",           amount: 249,  plan: "Pro",        method: "online",   date: "2026-07-02", status: "paid",    invoiceId: "INV-2026-0704" },
  { id: "p5",  centerName: "EduStar Institute",         amount: 99,   plan: "Basic",      method: "card",     date: "2026-07-03", status: "pending", invoiceId: "INV-2026-0705" },
  { id: "p6",  centerName: "Maple Leaf Learning",       amount: 99,   plan: "Basic",      method: "online",   date: "2026-07-03", status: "paid",    invoiceId: "INV-2026-0706" },
  { id: "p7",  centerName: "Summit Skills Institute",   amount: 249,  plan: "Pro",        method: "transfer", date: "2026-06-30", status: "failed",  invoiceId: "INV-2026-0707" },
  { id: "p8",  centerName: "Coastal Kids Academy",      amount: 49,   plan: "Starter",    method: "card",     date: "2026-07-01", status: "paid",    invoiceId: "INV-2026-0708" },
  { id: "p9",  centerName: "Bright Future Academy",     amount: 599,  plan: "Enterprise", method: "card",     date: "2026-06-01", status: "paid",    invoiceId: "INV-2026-0601" },
  { id: "p10", centerName: "Nova Learning Hub",         amount: 249,  plan: "Pro",        method: "transfer", date: "2026-06-01", status: "paid",    invoiceId: "INV-2026-0602" },
  { id: "p11", centerName: "Pinnacle Education Center", amount: 599,  plan: "Enterprise", method: "card",     date: "2026-06-02", status: "paid",    invoiceId: "INV-2026-0603" },
  { id: "p12", centerName: "EduStar Institute",         amount: 99,   plan: "Basic",      method: "online",   date: "2026-06-15", status: "refunded",invoiceId: "INV-2026-0604" },
  { id: "p13", centerName: "Horizon Academy",           amount: 249,  plan: "Pro",        method: "card",     date: "2026-06-02", status: "paid",    invoiceId: "INV-2026-0605" },
  { id: "p14", centerName: "Maple Leaf Learning",       amount: 99,   plan: "Basic",      method: "online",   date: "2026-06-05", status: "paid",    invoiceId: "INV-2026-0606" },
  { id: "p15", centerName: "Summit Skills Institute",   amount: 249,  plan: "Pro",        method: "transfer", date: "2026-05-31", status: "paid",    invoiceId: "INV-2026-0501" },
];

// Audit Logs mock array (SA_AUDIT_LOGS), its SAAuditLog/AuditSeverity
// types, were removed here (2026-08-21) once app/super-admin/page.tsx (its
// only consumer) switched its Recent Activity card to real Audit Logs —
// see lib/queries/audit-logs.ts (the Super-Admin Audit Logs page already
// used the real one; this Dashboard card was the last mock holdout).

// ─── Chart Data ───────────────────────────────────────────────────────────────

export const MONTHLY_REVENUE_SA: { name: string; revenue: number; subscriptions: number }[] = [
  { name: "Jan", revenue: 198400, subscriptions: 62 },
  { name: "Feb", revenue: 214700, subscriptions: 65 },
  { name: "Mar", revenue: 231500, subscriptions: 68 },
  { name: "Apr", revenue: 248200, subscriptions: 72 },
  { name: "May", revenue: 261900, subscriptions: 76 },
  { name: "Jun", revenue: 273400, subscriptions: 79 },
  { name: "Jul", revenue: 284600, subscriptions: 81 },
];

export const STUDENT_GROWTH_SA: { name: string; students: number }[] = [
  { name: "Jan", students: 13200 },
  { name: "Feb", students: 14100 },
  { name: "Mar", students: 15300 },
  { name: "Apr", students: 16100 },
  { name: "May", students: 17000 },
  { name: "Jun", students: 17800 },
  { name: "Jul", students: 18420 },
];

// Subscription Distribution mock array (SUBSCRIPTION_DIST_SA) was removed
// here (2026-08-21) once app/super-admin/page.tsx (its only consumer)
// switched to a real breakdown of Organization.subscription_plan_detail —
// see lib/queries/organizations.ts.

export const BRANCH_GROWTH_SA: { name: string; branches: number }[] = [
  { name: "Jan", branches: 58 },
  { name: "Feb", branches: 63 },
  { name: "Mar", branches: 68 },
  { name: "Apr", branches: 73 },
  { name: "May", branches: 79 },
  { name: "Jun", branches: 83 },
  { name: "Jul", branches: 87 },
];

// ─── Super Admin Profile ──────────────────────────────────────────────────────

export const SA_PROFILE = {
  name: "Alex Rivera",
  loginId: "EDU-900001",
  phone: "+1 555-0001",
  role: "Super Administrator",
  joinedAt: "2023-01-01",
  lastLogin: "2026-07-04T14:00:00Z",
  avatar: undefined as string | undefined,
};
