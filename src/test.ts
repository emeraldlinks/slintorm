import { ModelMap } from "./schema/generated";
import ORMManager, { DBStore } from "./index";

/** =========================
 *  MODEL INTERFACES
 *  ========================= */

export interface User {
  id?: number;
  name: string;
  email?: string;
  password?: string;
  phone?: string;
  role?:string // "admin" | "student" | "tutor" | "trainer" | "coordinator";
  status?: string //"active" | "inactive" | "banned";
  avatarUrl?: string;
  bio?: string;
  city?: string;
  country?: string;
  createdAt?: string;
  updatedAt?: string;
  
  // @relation onetomany:Payment;foreignKey:userId
  payments?: Payment[];
 // @relation onetomany:Enrollment;foreignKey:senderId
  enrollments?: Enrollment[];
}

export interface Track {
  id?: number;
  name: string;
  description: string;
  
  slug: string;
  durationWeeks?: number;
  price?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
 // @relation onetomany:Certification;foreignKey:trackId
  certifications?: Certification[]
  // @relation onetoone:CourseClass;foreignKey:trackId
  courseClass?: CourseClass;
  // @relation onetomany:Cohort;foreignKey:trackId
  cohorts?: Cohort[];
  // @relation onetomany:Module;foreignKey:trackId
  modules?: Module[];
}

export interface Cohort {
  id?: number;
  name: string;
  trackId: number;
  slug?: string
  status?: string //"upcoming" | "active" | "completed" | "cancelled";
  startDate?: string;
  endDate?: string;
  maxStudents?: number;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Track;foreignKey:trackId
  track?: Track;
  // @relation onetomany:Enrollment;foreignKey:cohortId
  enrollments?: Enrollment[];
  price?: number;
}

export interface Application {
  id?: number;
  trackId: number;
  motivation: string;
  goals: string;
  priorExperience?: string;
  status?: string // "pending" | "accepted" | "rejected" | "withdrawn";
  userId: number;
  // @relation onetoone:User;foreignKey:userId
  user?: User;
  reviewedBy?: number;
  reviewNote?: string;
  aptitudeScore?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PPT {
  id?: number;
  companyName: string;
}

/**
 * Tier is computed from overallScore at programme end:
 * A = 80–100 | B = 65–79 | C = 50–64 | D = below 50
 */
export interface Enrollment {
  id?: number;
  userId: number;
  // @relation onetoone:User;foreignKey:userId
  user?: User;
  cohortId: number;
  weeklyScore?: number;
  overallScore?: number;
  tier?: string // "A" | "B" | "C" | "D";
  status?: string // "active" | "dropped" | "completed" | "suspended";
  completedAt?: string;
  paidAt?: string;
  paymentRef?: string;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Cohort;foreignKey:cohortId
  cohort?: Cohort;
  // @relation onetomany:Payment;foreignKey:enrollmentId
  payments?: Payment[];
}

export interface Module {
  id?: number;
  trackId: number;
  title: string;
  description: string;
  weekNumber: number;
  durationHours: number;
  learningObjectives?: string[];
  resources?: {
    label: string;
    url: string;
    type?: string;
  }[];
  isPublished?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Track;foreignKey:trackId
  track?: Track;
}

export interface Assessment {
  id?: number;
  moduleId: number;
  title: string;
  description?: string;
  type?: string
  maxScore?: number;
  dueOffsetDays?: number;
  isRequired?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Module;foreignKey:moduleId
  module?: Module;
  submitted?: boolean;

}



export interface Submission {
  id?: number;
  enrollmentId: number;
  assessmentId: number;
  submittedAt?: string;
  fileUrl?: string;
  notes?: string;
  score?: number;
  gradedBy?: number;
  gradedAt?: string;
  feedback?: string;
  type?: "quiz" | "project" | "assignment"; 
  status?: string // "pending" | "graded" | "late" | "missing";
  createdAt?: string;
  updatedAt?: string;
  attachments?: Record<string, any>[];

}

export interface Certification {
  id?: number;
  enrollmentId: number;
  name: string;
  platform: string;
  type?: string
  badgeUrl?: string;
  verificationUrl?: string;
  certificationCode?: string;
  verifiedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Enrollment;foreignKey:enrollmentId
  enrollment?: Enrollment
  trackId?: number
  // @relation onetoone:Track;foreignKey:trackId
  track?: Track
}

/**
 * A tutor who delivers and grades content for one or more tracks.
 * contractType: volunteer = no pay, paid = stipend, partner = industry expert
 */
export interface Tutor {
  id?: number;
  userId: number;
  specialisation?: string;
  trackIds?: number[];
  linkedinUrl?: string;
  isActive?: boolean;
  contractType?: string //"volunteer" | "paid" | "partner";
  createdAt?: string;
  updatedAt?: string;
}

export interface TutorAssignment {
  id?: number;
  tutorId: number;
  cohortId: number;
  weekStart?: number;
  weekEnd?: number;
  role?: string //"lead" | "assistant" | "guest";
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Tutor;foreignKey:tutorId
  tutor?: Tutor;
}

export interface CourseClass {
  id?: number;
  trackId: number;
  title: string;
  description?: string;
  room?: string;
  conferenceLink?: string;
  capacity?: number;
  tutorId?: number;
  cohortId?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Track;foreignKey:trackId
  track?: Track;
  // @relation onetoone:Tutor;foreignKey:tutorId
  tutor?: Tutor;
  // @relation onetoone:Cohort;foreignKey:cohortId
  cohort?: Cohort;
  // @relation onetomany:Timetable;foreignKey:classId
  timetable?: Timetable[];
}

export interface Timetable {
  id?: number;
  classId: number;
  trackId: number;
  cohortId?: number;
  tutorId?: number;
  title: string;
  description?: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  mode?: string //"online" | "onsite" | "hybrid";
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:CourseClass;foreignKey:classId
  class?: CourseClass;
  // @relation onetoone:Track;foreignKey:trackId
  track?: Track;
  // @relation onetoone:Tutor;foreignKey:tutorId
  tutor?: Tutor;
  // @relation onetoone:Cohort;foreignKey:cohortId
  cohort?: Cohort;
}

/**
 * No placement fees charged to partners — they opt in voluntarily.
 * Tracked purely for impact reporting and job posting.
 */
export interface PlacementPartner {
  id?: number;
  companyName: string;
  industry?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  size?: string // "startup" | "sme" | "enterprise";
  location?: string;
  country?: string;
  partnerSince?: string;
  isActive?: boolean;
  assignedInterns?: number;
  lastAllocatedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetomany:Placement;foreignKey:partnerId
  placements?: Placement[];  
}

export interface Message {
  id?: number;
  conversationId?: string;
  senderId: number;
  recipientId: number;
  senderRole?: string;
  recipientRole?: string;
  content: string;
  attachmentUrl?: string;
  attachmentType?: string;
  isRead?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:User;foreignKey:senderId
  sender?: User;
  // @relation onetoone:User;foreignKey:recipientId
  recepient?: User;
}

export interface PortfolioItem {
  id?: number;
  userId: number;
  title: string;
  description?: string;
  fileUrl?: string;
  fileType?: string;
  visibility?: string //"public" | "private" | "team";
  status?: string //"draft" | "published" | "review";
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface JobListing {
  id?: number;
  partnerId: number;
  trackId?: number;
  title: string;
  description?: string;
  type?: string //"internship" | "entry-level" | "junior" | "contract" | "freelance";
  location?: string;
  isRemote?: boolean;
  salaryRange?: string;
  requirements?: string;
  applicationUrl?: string;
  status?: string //"open" | "closed" | "filled";
  postedAt?: string;
  closesAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Placement {
  id?: number;
  userId: number;
  // @relation onetoone:User;foreignKey:userId
  user?: User;
  partnerId?: number;
  jobListingId?: number;
  classId?: number;
  enrollmentId?: number;
  trackId?: number;
  cohortId?: number;
  // @relation onetoone:Cohort;foreignKey:cohortId
  cohort?: Cohort;
  // @relation onetoone:CourseClass;foreignKey:classId
  courseClass?: CourseClass;
  companyName: string;
  role: string;
   type?:  string //"internship" | "entry-level" | "junior" | "contract" | "freelance";
  level?: string;
  isRemote?: boolean;
  salaryRange?: string;
  status?: string // "active" | "completed" | "terminated";
  startDate?: string;
  endDate?: string;
  wasExtended?: boolean;
  studentReport?: string;
  partnerReport?: string;
  durationWeeks?: number;
  sourcedBy?: string //"academy" | "self" | "partner-referral";
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Enrollment;foreignKey:enrollmentId
  enrollment?: Enrollment;
  // @relation onetoone:PlacementPartner;foreignKey:partnerId
  partner?: PlacementPartner;
}

/**
 * Post-placement self-reports submitted by alumni periodically.
 * Powers the public impact dashboard and builds employer trust.
 */
export interface AlumniReport {
  id?: number;
  userId: number;
  placementId?: number;
  // @relation onetoone:Placement;foreignKey:placementId
  placement?: Placement;
  reportedAt: string;
  currentStatus?: string //"employed" | "freelancing" | "job-seeking" | "further-study" | "other";
  currentRole?: string;
  currentCompany?: string;
  monthlySalary?: number;
  isRemote?: boolean;
  satisfactionScore?: number;
  programmeRating?: number;
  testimonial?: string;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Announcement {
  id?: number;
  authorId: number;
  // @relation onetoone:User;foreignKey:authorId
  author?: User;
  cohortId?: number;
  trackId?: number;
  title: string;
  body: string;
  priority?: string //"low" | "normal" | "urgent";
  publishedAt?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Attendance {
  id?: number;
  enrollmentId: number;
  moduleId: number;
  sessionDate: string;
  attended?: boolean;
  excused?: boolean;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id?: number;
  userId?: number;
  role?: string;
  action: string; // e.g., "login", "logout", "page_view", "form_submit"
  path?: string;
  method?: string;
  details?: Record<string, any> | string;
  createdAt?: string;
}

export interface Payment {
  id?: number;
  userId: number;
  enrollmentId?: number;
  cohortId?: number;
  trackId?: number;
  amount: number;
  currency?: string;
  method?: string;
  status?: string //"pending" | "completed" | "failed" | "refunded";
  reference?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:User;foreignKey:userId
  user?: User;
  // @relation onetoone:Cohort;foreignKey:cohortId
  cohort?: Cohort;
  // @relation onetoone:Enrollment;foreignKey:enrollmentId
  enrollment?: Enrollment;
  track?: Track;
  // @json;
}

/** =========================
 *  ORM INIT
 *  ========================= */

let orm: ORMManager<ModelMap> | null = null;

function getORM(): ORMManager<ModelMap> {
  if (!orm) {
    orm = new ORMManager<ModelMap>({
      driver: "sqlite",
      databaseUrl: "./testx.db",
      dir: "src",
      modelMap: {} as ModelMap,
    });
  }
  return orm;
}

/** =========================
 *  INITIALIZE DATABASE AT MODULE LOAD
 *  ========================= */

export async function initializeDatabaseModule() {
  const db = getORM();

  await db.defineModel<User>("users", "User");
  await db.defineModel<Track>("tracks", "Track");
  await db.defineModel<Cohort>("cohorts", "Cohort");
  await db.defineModel<Application>("applications", "Application");
  await db.defineModel<Enrollment>("enrollments", "Enrollment");
  await db.defineModel<Module>("modules", "Module");
  await db.defineModel<Assessment>("assessments", "Assessment");
  await db.defineModel<Submission>("submissions", "Submission");
  await db.defineModel<Certification>("certifications", "Certification");
  await db.defineModel<Message>("messages", "Message");
  await db.defineModel<PortfolioItem>("portfolio_items", "PortfolioItem");
  await db.defineModel<Tutor>("tutors", "Tutor");
  await db.defineModel<TutorAssignment>("tutor_assignments", "TutorAssignment");
  await db.defineModel<CourseClass>("classes", "CourseClass");
  await db.defineModel<Timetable>("timetables", "Timetable");
  await db.defineModel<PlacementPartner>("placement_partners", "PlacementPartner");
  await db.defineModel<JobListing>("job_listings", "JobListing");
  await db.defineModel<Placement>("placements", "Placement");
  await db.defineModel<ActivityLog>("activity_logs", "ActivityLog");
  await db.defineModel<Payment>("payments", "Payment");
  await db.defineModel<AlumniReport>("alumni_reports", "AlumniReport");
  await db.defineModel<Announcement>("announcements", "Announcement");
  await db.defineModel<Attendance>("attendances", "Attendance");
  await db.defineModel<PPT>("ppts", "PPT");

 // await db.migrate();
  // await seedDatabase()
  return db.DB;
}

export const DB = await initializeDatabaseModule();

/** =========================
 *  SEED DATABASE
 *  ========================= */

export async function seedDatabase(db: any) {
 
// const db = DB
  const existingAdmin = await db.User
    .query()
    .where("email", "=", "admin@cofoundracademy.ng")
    .first();

  if (existingAdmin) {
    console.log("Database already seeded.");
    return;
  } 

  console.log("Seeding database...");


  const now = new Date();
  const endDate = new Date(now.getTime() + 84 * 86400000); // 12 weeks

  // ── Admin ──────────────────────────────────────────────
  const admin = await db.User.insert({
    name: "Admin User",
    email: "admin@cofoundracademy.ng",
    password:   ("admin123"),
    phone: "+2348000000000",
    role: "admin",
    status: "active",
    city: "Port Harcourt",
    country: "Nigeria",
    bio: "Platform administrator for Cofoundr Academy.",
  });

  // ── Tracks ─────────────────────────────────────────────
  const dmTrack = await db.Track.insert({
    name: "Digital Marketing",
    description:
      "Comprehensive training in SEO, paid advertising, content strategy, social media management, email marketing, analytics, and personal branding. Includes free certifications from Google, Meta, HubSpot, and Semrush.",
    slug:  ("Digital Marketing"),
    durationWeeks: 12,
    price: 15000,
    isActive: true,
  });

  const csTrack = await db.Track.insert({
    name: "Cybersecurity",
    description:
      "Intensive training in networking fundamentals, Linux security, ethical hacking, OSINT, web application security, incident response, and compliance. Includes free certifications from ISC2, Cisco, Google, and Microsoft.",
    slug:  ("Cybersecurity"),
    durationWeeks: 12,
    price: 15000,
    isActive: true,
  });

  const daTrack = await db.Track.insert({
    name: "Data Analysis",
    description:
      "Hands-on training in data wrangling, statistical analysis, SQL, Python (pandas, matplotlib), Power BI, and storytelling with data. Prepares students for real-world analyst roles across industries.",
    slug:  ("Data Analysis"),
    durationWeeks: 12,
    price: 15000,
    isActive: true,
  });

  // ── Cohorts ────────────────────────────────────────────
  const dmCohort = await db.Cohort.insert({
    name: "Digital Marketing — Cohort 1",
    trackId: dmTrack?.id!,
    slug:  ("Digital Marketing Cohort 1"),
    status: "active",
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    maxStudents: 30,
    price: 15000,
  });

  const csCohort = await db.Cohort.insert({
    name: "Cybersecurity — Cohort 1",
    trackId: csTrack?.id!,
    slug:  ("Cybersecurity Cohort 1"),
    status: "active",
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    maxStudents: 25,
    price: 15000,
  });

  const daCohort = await db.Cohort.insert({
    name: "Data Analysis — Cohort 1",
    trackId: daTrack?.id!,
    slug:  ("Data Analysis Cohort 1"),
    status: "active",
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    maxStudents: 25,
    price: 15000,
  });

  // ── Tutor Users ────────────────────────────────────────
  const tutorUser1 = await db.User.insert({
    name: "Chisom Eze",
    email: "chisom@cofoundracademy.ng",
    password: await  ("tutor123"),
    phone: "+2348011111111",
    role: "tutor",
    status: "active",
    city: "Lagos",
    country: "Nigeria",
    bio: "Digital marketing strategist with 5 years experience in SEO and paid media.",
  });

  const tutorUser2 = await db.User.insert({
    name: "Emeka Nwosu",
    email: "emeka@cofoundracademy.ng",
    password: await  ("tutor123"),
    phone: "+2348022222222",
    role: "tutor",
    status: "active",
    city: "Abuja",
    country: "Nigeria",
    bio: "Certified ethical hacker and security engineer with SOC operations experience.",
  });

  const tutorUser3 = await db.User.insert({
    name: "Ngozi Okafor",
    email: "ngozi@cofoundracademy.ng",
    password: await  ("tutor123"),
    phone: "+2348033333333",
    role: "tutor",
    status: "active",
    city: "Port Harcourt",
    country: "Nigeria",
    bio: "Data analyst and BI specialist with experience in fintech and healthcare sectors.",
  });

  // ── Tutors ─────────────────────────────────────────────
  const tutor1 = await db.Tutor.insert({
    userId: tutorUser1?.id!,
    specialisation: "SEO, Content Strategy & Paid Advertising",
    trackIds: [dmTrack?.id!],
    linkedinUrl: "https://linkedin.com/in/chisom-eze",
    isActive: true,
    contractType: "paid",
  });

  const tutor2 = await db.Tutor.insert({
    userId: tutorUser2?.id!,
    specialisation: "Ethical Hacking, Network Security & Incident Response",
    trackIds: [csTrack?.id!],
    linkedinUrl: "https://linkedin.com/in/emeka-nwosu",
    isActive: true,
    contractType: "paid",
  });

  const tutor3 = await db.Tutor.insert({
    userId: tutorUser3?.id!,
    specialisation: "Data Analysis, SQL & Power BI",
    trackIds: [daTrack?.id!],
    linkedinUrl: "https://linkedin.com/in/ngozi-okafor",
    isActive: true,
    contractType: "paid",
  });

  // ── Course Classes ─────────────────────────────────────
  const dmClass = await db.CourseClass.insert({
    trackId: dmTrack?.id!,
    title: "Digital Marketing — Cohort 1 Class",
    description: "Main class for Digital Marketing Cohort 1.",
    conferenceLink: "https://meet.google.com/dm-cohort-1",
    capacity: 30,
    tutorId: tutor1?.id!,
    cohortId: dmCohort?.id!,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true,
  });

  const csClass = await db.CourseClass.insert({
    trackId: csTrack?.id!,
    title: "Cybersecurity — Cohort 1 Class",
    description: "Main class for Cybersecurity Cohort 1.",
    conferenceLink: "https://meet.google.com/cs-cohort-1",
    capacity: 25,
    tutorId: tutor2?.id!,
    cohortId: csCohort?.id!,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true,
  });

  const daClass = await db.CourseClass.insert({
    trackId: daTrack?.id!,
    title: "Data Analysis — Cohort 1 Class",
    description: "Main class for Data Analysis Cohort 1.",
    conferenceLink: "https://meet.google.com/da-cohort-1",
    capacity: 25,
    tutorId: tutor3?.id!,
    cohortId: daCohort?.id!,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    isActive: true,
  });

  // ── Tutor Assignments ──────────────────────────────────
  await db.TutorAssignment.insert({
    tutorId: tutor1?.id!,
    cohortId: dmCohort?.id!,
    weekStart: 1,
    weekEnd: 12,
    role: "lead",
  });

  await db.TutorAssignment.insert({
    tutorId: tutor2?.id!,
    cohortId: csCohort?.id!,
    weekStart: 1,
    weekEnd: 12,
    role: "lead",
  });

  await db.TutorAssignment.insert({
    tutorId: tutor3?.id!,
    cohortId: daCohort?.id!,
    weekStart: 1,
    weekEnd: 12,
    role: "lead",
  });

  // ── Timetables ─────────────────────────────────────────
  await db.Timetable.insert({
    classId: dmClass?.id!,
    trackId: dmTrack?.id!,
    cohortId: dmCohort?.id!,
    tutorId: tutor1?.id!,
    title: "DM Week 1 — Foundations of Digital Marketing",
    description: "Kick-off session covering the digital marketing landscape and funnel thinking.",
    sessionDate: now.toISOString().split("T")[0],
    startTime: "10:00",
    endTime: "12:00",
    mode: "online",
  });

  await db.Timetable.insert({
    classId: csClass?.id!,
    trackId: csTrack?.id!,
    cohortId: csCohort?.id!,
    tutorId: tutor2?.id!,
    title: "CS Week 1 — Networking & Internet Fundamentals",
    description: "Introduction to TCP/IP, OSI model, and network basics.",
    sessionDate: now.toISOString().split("T")[0],
    startTime: "14:00",
    endTime: "16:00",
    mode: "online",
  });

  await db.Timetable.insert({
    classId: daClass?.id!,
    trackId: daTrack?.id!,
    cohortId: daCohort?.id!,
    tutorId: tutor3?.id!,
    title: "DA Week 1 — Introduction to Data Analysis",
    description: "Overview of the data analysis process, tools, and career paths.",
    sessionDate: now.toISOString().split("T")[0],
    startTime: "16:00",
    endTime: "18:00",
    mode: "online",
  });

  // ── Modules — Digital Marketing ────────────────────────
  const dmMod1 = await db.Module.insert({
    trackId: dmTrack?.id!,
    title: "Foundations of Digital Marketing",
    description: "Overview of the digital marketing landscape, channels, and funnel thinking.",
    weekNumber: 1,
    durationHours: 8,
    learningObjectives: [
      "Understand core digital marketing channels",
      "Map a basic customer journey funnel",
      "Identify KPIs for different campaign goals",
    ],
    resources: [
      { label: "Google Digital Garage", url: "https://learndigital.withgoogle.com", type: "platform" },
    ],
    isPublished: true,
  });

  const dmMod2 = await db.Module.insert({
    trackId: dmTrack?.id!,
    title: "SEO & Content Strategy",
    description: "Keyword research, on-page SEO, content planning, and Semrush fundamentals.",
    weekNumber: 2,
    durationHours: 10,
    learningObjectives: [
      "Conduct keyword research using free tools",
      "Optimise on-page SEO elements",
      "Build a 4-week content calendar",
    ],
    resources: [
      { label: "Semrush Academy", url: "https://www.semrush.com/academy", type: "platform" },
    ],
    isPublished: true,
  });

  const dmMod3 = await db.Module.insert({
    trackId: dmTrack?.id!,
    title: "Paid Advertising — Google & Meta",
    description: "Campaign setup, targeting, bidding strategies, and performance analysis.",
    weekNumber: 3,
    durationHours: 10,
    learningObjectives: [
      "Set up a Google Search campaign",
      "Create a Meta Ads audience and creative",
      "Analyse ROAS and optimise budgets",
    ],
    resources: [
      { label: "Google Skillshop", url: "https://skillshop.google.com", type: "platform" },
      { label: "Meta Blueprint", url: "https://www.facebook.com/business/learn", type: "platform" },
    ],
    isPublished: true,
  });

  // ── Modules — Cybersecurity ────────────────────────────
  const csMod1 = await db.Module.insert({
    trackId: csTrack?.id!,
    title: "Networking & Internet Fundamentals",
    description: "TCP/IP, DNS, HTTP, OSI model, and Cisco NetAcad basics.",
    weekNumber: 1,
    durationHours: 10,
    learningObjectives: [
      "Explain the OSI model layers",
      "Trace a packet through a TCP/IP network",
      "Configure basic router and switch settings",
    ],
    resources: [
      { label: "Cisco Networking Basics", url: "https://www.netacad.com", type: "platform" },
    ],
    isPublished: true,
  });

  const csMod2 = await db.Module.insert({
    trackId: csTrack?.id!,
    title: "Linux Security Fundamentals",
    description: "File permissions, user management, hardening basics, and bash scripting.",
    weekNumber: 2,
    durationHours: 10,
    learningObjectives: [
      "Manage Linux users and file permissions",
      "Write basic bash scripts for automation",
      "Apply system hardening best practices",
    ],
    resources: [
      { label: "OverTheWire: Bandit", url: "https://overthewire.org/wargames/bandit", type: "platform" },
      { label: "TryHackMe Pre-Security", url: "https://tryhackme.com", type: "platform" },
    ],
    isPublished: true,
  });

  const csMod3 = await db.Module.insert({
    trackId: csTrack?.id!,
    title: "Ethical Hacking & Reconnaissance",
    description: "OSINT techniques, passive recon, Shodan, Maltego, and intro to Kali Linux.",
    weekNumber: 3,
    durationHours: 12,
    learningObjectives: [
      "Perform passive OSINT on a target",
      "Use Shodan and Maltego for recon",
      "Navigate and use core Kali Linux tools",
    ],
    resources: [
      { label: "TryHackMe Jr Penetration Tester", url: "https://tryhackme.com", type: "platform" },
    ],
    isPublished: true,
  });

  // ── Modules — Data Analysis ────────────────────────────
  const daMod1 = await db.Module.insert({
    trackId: daTrack?.id!,
    title: "Introduction to Data Analysis",
    description: "The data analysis lifecycle, key tools, and thinking like an analyst.",
    weekNumber: 1,
    durationHours: 8,
    learningObjectives: [
      "Describe the end-to-end data analysis process",
      "Compare Excel, SQL, Python, and Power BI use cases",
      "Frame a business problem as an analytical question",
    ],
    resources: [
      { label: "Google Data Analytics Certificate", url: "https://grow.google/certificates/data-analytics", type: "platform" },
    ],
    isPublished: true,
  });

  const daMod2 = await db.Module.insert({
    trackId: daTrack?.id!,
    title: "SQL for Data Analysis",
    description: "Writing queries, joins, aggregations, and subqueries to extract insights from relational databases.",
    weekNumber: 2,
    durationHours: 10,
    learningObjectives: [
      "Write SELECT, JOIN, GROUP BY, and HAVING queries",
      "Use window functions for running totals and rankings",
      "Optimise slow queries with indexing concepts",
    ],
    resources: [
      { label: "Mode SQL Tutorial", url: "https://mode.com/sql-tutorial", type: "article" },
      { label: "SQLZoo", url: "https://sqlzoo.net", type: "platform" },
    ],
    isPublished: true,
  });

  const daMod3 = await db.Module.insert({
    trackId: daTrack?.id!,
    title: "Data Visualisation with Power BI",
    description: "Building interactive dashboards, DAX basics, and storytelling with data.",
    weekNumber: 3,
    durationHours: 10,
    learningObjectives: [
      "Connect Power BI to multiple data sources",
      "Build an interactive multi-page report",
      "Write basic DAX measures for KPI cards",
    ],
    resources: [
      { label: "Microsoft Power BI Learning", url: "https://learn.microsoft.com/en-us/training/powerplatform/power-bi", type: "platform" },
    ],
    isPublished: true,
  });

  // ── Assessments ────────────────────────────────────────
  const dmAssess1 = await db.Assessment.insert({
    moduleId: dmMod1?.id!,
    title: "Week 1 Quiz — Digital Marketing Basics",
    type: "quiz",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  await db.Assessment.insert({
    moduleId: dmMod2?.id!,
    title: "SEO Audit — Peer Website Review",
    description: "Audit a classmate's or local business website for on-page SEO issues.",
    type: "project",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  await db.Assessment.insert({
    moduleId: dmMod3?.id!,
    title: "Week 3 Case Study — Campaign Analysis",
    type: "case-study",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  const csAssess1 = await db.Assessment.insert({
    moduleId: csMod1?.id!,
    title: "Week 1 Quiz — Networking Fundamentals",
    type: "quiz",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  await db.Assessment.insert({
    moduleId: csMod2?.id!,
    title: "Linux Hardening Project",
    description: "Harden a provided Linux VM and document all changes made.",
    type: "project",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  await db.Assessment.insert({
    moduleId: csMod3?.id!,
    title: "OSINT Challenge — Recon Report",
    description: "Perform passive recon on a provided test target and submit a structured report.",
    type: "project",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  const daAssess1 = await db.Assessment.insert({
    moduleId: daMod1?.id!,
    title: "Week 1 Quiz — Data Analysis Fundamentals",
    type: "quiz",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  await db.Assessment.insert({
    moduleId: daMod2?.id!,
    title: "SQL Query Challenge",
    description: "Complete a set of 10 increasingly complex SQL queries against a provided dataset.",
    type: "project",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  await db.Assessment.insert({
    moduleId: daMod3?.id!,
    title: "Power BI Dashboard Presentation",
    description: "Build and present a 3-page Power BI dashboard on a provided business dataset.",
    type: "presentation",
    maxScore: 100,
    dueOffsetDays: 7,
    isRequired: true,
  });

  // ── Student Users ──────────────────────────────────────
  const student1 = await db.User.insert({
    name: "Adebayo Ogunlesi",
    email: "adebayo@example.com",
    password: await  ("student123"),
    phone: "+2348012345678",
    role: "student",
    status: "active",
    city: "Lagos",
    country: "Nigeria",
  });

  const student2 = await db.User.insert({
    name: "Fatima Aliyu",
    email: "fatima@example.com",
    password: await  ("student123"),
    phone: "+2348023456789",
    role: "student",
    status: "active",
    city: "Kano",
    country: "Nigeria",
  });

  const student3 = await db.User.insert({
    name: "Chukwuemeka Eze",
    email: "emeka.student@example.com",
    password: await  ("student123"),
    phone: "+2348034567890",
    role: "student",
    status: "active",
    city: "Enugu",
    country: "Nigeria",
  });

  // ── Applications ───────────────────────────────────────
  await db.Application.insert({
    userId: student1?.id!,
    trackId: dmTrack?.id!,
    motivation: "I want to grow my family's fashion business online and attract more customers through digital channels.",
    goals: "Learn paid ads and SEO well enough to manage campaigns independently within 3 months.",
    priorExperience: "Basic social media management for 6 months on Instagram.",
    status: "accepted",
    reviewedBy: admin?.id!,
    reviewNote: "Strong motivation and clear goals. Accepted.",
    aptitudeScore: 78,
  });

  await db.Application.insert({
    userId: student2?.id!,
    trackId: csTrack?.id!,
    motivation: "I am passionate about keeping systems and people safe online. Cybersecurity is the future.",
    goals: "Earn the ISC2 CC certification and land a junior SOC analyst role.",
    priorExperience: "Studied computer science for 2 years before dropping out. Comfortable with Linux.",
    status: "accepted",
    reviewedBy: admin?.id!,
    reviewNote: "Prior CS background is a plus. Accepted.",
    aptitudeScore: 85,
  });

  await db.Application.insert({
    userId: student3?.id!,
    trackId: daTrack?.id!,
    motivation: "I work in a bank and want to stop relying on manual Excel reports by automating insights with proper data tools.",
    goals: "Build Power BI dashboards for my department and transition into a data analyst role.",
    priorExperience: "2 years using Excel and basic pivot tables in a banking operations role.",
    status: "accepted",
    reviewedBy: admin?.id!,
    reviewNote: "Practical workplace motivation. Excel background helpful. Accepted.",
    aptitudeScore: 80,
  });

  // ── Enrollments ────────────────────────────────────────
  const enrollment1 = await db.Enrollment.insert({
    userId: student1?.id!,
    cohortId: dmCohort?.id!,
    weeklyScore: 85,
    overallScore: 82,
    tier: "B",
    status: "active",
    paidAt: now.toISOString(),
    paymentRef: "PSK_DM_REF_001",
  });

  const enrollment2 = await db.Enrollment.insert({
    userId: student2?.id!,
    cohortId: csCohort?.id!,
    weeklyScore: 90,
    overallScore: 88,
    tier: "A",
    status: "active",
    paidAt: now.toISOString(),
    paymentRef: "PSK_CS_REF_001",
  });

  const enrollment3 = await db.Enrollment.insert({
    userId: student3?.id!,
    cohortId: daCohort?.id!,
    weeklyScore: 75,
    overallScore: 72,
    tier: "B",
    status: "active",
    paidAt: now.toISOString(),
    paymentRef: "PSK_DA_REF_001",
  });

  // ── Payments ───────────────────────────────────────────
  await db.Payment.insert({
    userId: student1?.id!,
    enrollmentId: enrollment1?.id!,
    cohortId: dmCohort?.id!,
    trackId: dmTrack?.id!,
    amount: 15000,
    currency: "NGN",
    method: "card",
    status: "completed",
    reference: "PSK_DM_REF_001",
  });

  await db.Payment.insert({
    userId: student2?.id!,
    enrollmentId: enrollment2?.id!,
    cohortId: csCohort?.id!,
    trackId: csTrack?.id!,
    amount: 15000,
    currency: "NGN",
    method: "card",
    status: "completed",
    reference: "PSK_CS_REF_001",
  });

  await db.Payment.insert({
    userId: student3?.id!,
    enrollmentId: enrollment3?.id!,
    cohortId: daCohort?.id!,
    trackId: daTrack?.id!,
    amount: 15000,
    currency: "NGN",
    method: "transfer",
    status: "completed",
    reference: "PSK_DA_REF_001",
  });

  // ── Submissions ────────────────────────────────────────
  await db.Submission.insert({
    enrollmentId: enrollment1?.id!,
    assessmentId: dmAssess1?.id!,
    submittedAt: now.toISOString(),
    notes: "Completed all 20 questions.",
    score: 84,
    gradedBy: tutorUser1?.id!,
    gradedAt: now.toISOString(),
    feedback: "Good grasp of core concepts. Review the funnel stages once more.",
    status: "graded",
  });

  await db.Submission.insert({
    enrollmentId: enrollment2?.id!,
    assessmentId: csAssess1?.id!,
    submittedAt: now.toISOString(),
    notes: "All questions answered. Confident with OSI model section.",
    score: 92,
    gradedBy: tutorUser2?.id!,
    gradedAt: now.toISOString(),
    feedback: "Excellent work. Strong understanding of networking fundamentals.",
    status: "graded",
  });

  await db.Submission.insert({
    enrollmentId: enrollment3?.id!,
    assessmentId: daAssess1?.id!,
    submittedAt: now.toISOString(),
    notes: "First quiz attempt.",
    score: 74,
    gradedBy: tutorUser3?.id!,
    gradedAt: now.toISOString(),
    feedback: "Solid foundation. Revisit the difference between structured and unstructured data.",
    status: "graded",
  });

  // ── Certifications ─────────────────────────────────────
  await db.Certification.insert({
    enrollmentId: enrollment1?.id!,
    name: "Google Analytics Certification (GA4)",
    platform: "Google Skillshop",
    type: "required",
    verificationUrl: "https://skillshop.google.com",
    trackId: dmTrack?.id!,
  });

  await db.Certification.insert({
    enrollmentId: enrollment2?.id!,
    name: "ISC2 Certified in Cybersecurity (CC)",
    platform: "ISC2",
    type: "required",
    verificationUrl: "https://www.isc2.org/certifications/cc",
    trackId: csTrack?.id!,
  });

  await db.Certification.insert({
    enrollmentId: enrollment3?.id!,
    name: "Google Data Analytics Certificate",
    platform: "Coursera / Google",
    type: "required",
    verificationUrl: "https://grow.google/certificates/data-analytics",
    trackId: daTrack?.id!,
  });

  // ── Attendance ─────────────────────────────────────────
  await db.Attendance.insert({
    enrollmentId: enrollment1?.id!,
    trackId: dmTrack?.id!,
    moduleId: dmMod1?.id!,
    sessionDate: now.toISOString().split("T")[0],
    attended: true,
    excused: false,
  });

  await db.Attendance.insert({
    enrollmentId: enrollment2?.id!,
    trackId: csTrack?.id!,
    moduleId: csMod1?.id!,
    sessionDate: now.toISOString().split("T")[0],
    attended: true,
    excused: false,
  });

  await db.Attendance.insert({
    enrollmentId: enrollment3?.id!,
    trackId: daTrack?.id!,
    moduleId: daMod1?.id!,
    sessionDate: now.toISOString().split("T")[0],
    attended: true,
    excused: false,
  });

  // ── Placement Partners ─────────────────────────────────
  const partner1 = await db.PlacementPartner.insert({
    companyName: "Flutterwave",
    industry: "Fintech",
    website: "https://flutterwave.com",
    contactName: "HR Team",
    contactEmail: "hr@flutterwave.com",
    size: "enterprise",
    location: "Lagos",
    country: "Nigeria",
    partnerSince: now.toISOString(),
    isActive: true,
    notes: "Interested in cybersecurity and digital marketing hires.",
  });

  const partner2 = await db.PlacementPartner.insert({
    companyName: "Paystack",
    industry: "Fintech",
    website: "https://paystack.com",
    contactName: "Talent Team",
    contactEmail: "talent@paystack.com",
    size: "enterprise",
    location: "Lagos",
    country: "Nigeria",
    partnerSince: now.toISOString(),
    isActive: true,
    notes: "Internship opportunities for digital marketing graduates.",
  });

  const partner3 = await db.PlacementPartner.insert({
    companyName: "Konga",
    industry: "E-commerce",
    website: "https://konga.com",
    contactName: "People & Culture",
    contactEmail: "people@konga.com",
    size: "sme",
    location: "Lagos",
    country: "Nigeria",
    partnerSince: now.toISOString(),
    isActive: true,
    notes: "Looking for data analysts and digital marketers.",
  });

  // ── Job Listings ───────────────────────────────────────
  await db.JobListing.insert({
    partnerId: partner1?.id!,
    trackId: csTrack?.id!,
    title: "Junior Security Analyst",
    description: "Monitor and respond to security alerts in our SOC environment.",
    type: "entry-level",
    location: "Lagos",
    isRemote: false,
    salaryRange: "₦150,000 – ₦200,000/month",
    status: "open",
    postedAt: now.toISOString(),
  });

  await db.JobListing.insert({
    partnerId: partner2?.id!,
    trackId: dmTrack?.id!,
    title: "Digital Marketing Intern",
    description: "Support growth campaigns across paid and organic channels.",
    type: "internship",
    location: "Lagos",
    isRemote: true,
    salaryRange: "₦80,000 – ₦100,000/month",
    status: "open",
    postedAt: now.toISOString(),
  });

  await db.JobListing.insert({
    partnerId: partner3?.id!,
    trackId: daTrack?.id!,
    title: "Data Analyst Intern",
    description: "Analyse sales and customer data to generate actionable insights for the growth team.",
    type: "internship",
    location: "Lagos",
    isRemote: true,
    salaryRange: "₦90,000 – ₦120,000/month",
    status: "open",
    postedAt: now.toISOString(),
  });

  // ── Placements ─────────────────────────────────────────
  const placement1 = await db.Placement.insert({
    userId: student1?.id!,
    partnerId: partner2?.id!,
    enrollmentId: enrollment1?.id!,
    cohortId: dmCohort?.id!,
    trackId: dmTrack?.id!,
    classId: dmClass?.id!,
    companyName: "Paystack",
    role: "Digital Marketing Intern",
    type: "internship",
    isRemote: true,
    salaryRange: "₦80,000 – ₦100,000/month",
    status: "active",
    startDate: now.toISOString(),
    durationWeeks: 8,
    sourcedBy: "academy",
  });

  const placement2 = await db.Placement.insert({
    userId: student2?.id!,
    partnerId: partner1?.id!,
    enrollmentId: enrollment2?.id!,
    cohortId: csCohort?.id!,
    trackId: csTrack?.id!,
    classId: csClass?.id!,
    companyName: "Flutterwave",
    role: "Junior Security Analyst",
    type: "entry-level",
    isRemote: false,
    salaryRange: "₦150,000 – ₦200,000/month",
    status: "active",
    startDate: now.toISOString(),
    durationWeeks: 12,
    sourcedBy: "academy",
  });

  const placement3 = await db.Placement.insert({
    userId: student3?.id!,
    partnerId: partner3?.id!,
    enrollmentId: enrollment3?.id!,
    cohortId: daCohort?.id!,
    trackId: daTrack?.id!,
    classId: daClass?.id!,
    companyName: "Konga",
    role: "Data Analyst Intern",
    type: "internship",
    isRemote: true,
    salaryRange: "₦90,000 – ₦120,000/month",
    status: "active",
    startDate: now.toISOString(),
    durationWeeks: 8,
    sourcedBy: "academy",
  });

  // ── Alumni Reports ─────────────────────────────────────
  await db.AlumniReport.insert({
    userId: student1?.id!,
    placementId: placement1?.id!,
    reportedAt: now.toISOString(),
    currentStatus: "employed",
    currentRole: "Digital Marketing Intern",
    currentCompany: "Paystack",
    monthlySalary: 90000,
    isRemote: true,
    satisfactionScore: 9,
    programmeRating: 5,
    testimonial:
      "The programme gave me real hands-on skills I could apply from day one at Paystack. Highly recommend.",
    isPublic: true,
  });

  await db.AlumniReport.insert({
    userId: student2?.id!,
    placementId: placement2?.id!,
    reportedAt: now.toISOString(),
    currentStatus: "employed",
    currentRole: "Junior Security Analyst",
    currentCompany: "Flutterwave",
    monthlySalary: 175000,
    isRemote: false,
    satisfactionScore: 10,
    programmeRating: 5,
    testimonial:
      "Cofoundr Academy structured the cybersecurity content perfectly for someone starting from scratch. I passed my CC exam on the first attempt.",
    isPublic: true,
  });

  await db.AlumniReport.insert({
    userId: student3?.id!,
    placementId: placement3?.id!,
    reportedAt: now.toISOString(),
    currentStatus: "employed",
    currentRole: "Data Analyst Intern",
    currentCompany: "Konga",
    monthlySalary: 105000,
    isRemote: true,
    satisfactionScore: 8,
    programmeRating: 4,
    testimonial:
      "I now build dashboards my entire department uses. The SQL and Power BI modules were incredibly practical.",
    isPublic: true,
  });

  // ── Portfolio Items ─────────────────────────────────────
  await db.PortfolioItem.insert({
    userId: student1?.id!,
    title: "SEO Audit — Local Fashion Brand",
    description: "A full on-page SEO audit with recommendations for a Port Harcourt fashion brand.",
    fileType: "pdf",
    visibility: "public",
    status: "published",
    tags: ["SEO", "Digital Marketing", "Content"],
  });

  await db.PortfolioItem.insert({
    userId: student2?.id!,
    title: "Linux Hardening Checklist & Report",
    description: "Documented steps taken to harden an Ubuntu 22.04 server as part of the cybersecurity programme.",
    fileType: "pdf",
    visibility: "public",
    status: "published",
    tags: ["Linux", "Cybersecurity", "Hardening"],
  });

  await db.PortfolioItem.insert({
    userId: student3?.id!,
    title: "Sales Dashboard — Retail Dataset",
    description: "Interactive Power BI dashboard analysing 12-month retail sales data with slicers and KPI cards.",
    fileType: "pbix",
    visibility: "public",
    status: "published",
    tags: ["Power BI", "Data Analysis", "Dashboard"],
  });

  // ── Messages ───────────────────────────────────────────
  await db.Message.insert({
    senderId: tutorUser1?.id!,
    recipientId: student1?.id!,
    senderRole: "tutor",
    recipientRole: "student",
    content: "Hi Adebayo, great job on the Week 1 quiz! Keep up the momentum going into the SEO module.",
    isRead: false,
  });

  await db.Message.insert({
    senderId: tutorUser2?.id!,
    recipientId: student2?.id!,
    senderRole: "tutor",
    recipientRole: "student",
    content: "Fatima, your networking quiz score was outstanding. Make sure you set up your TryHackMe account before Week 2.",
    isRead: false,
  });

  await db.Message.insert({
    senderId: tutorUser3?.id!,
    recipientId: student3?.id!,
    senderRole: "tutor",
    recipientRole: "student",
    content: "Emeka, good effort on the quiz. I'd like you to revisit the data types section — it will help a lot with the SQL module.",
    isRead: false,
  });

  // ── Announcements ──────────────────────────────────────
  await db.Announcement.insert({
    authorId: admin?.id!,
    cohortId: dmCohort?.id!,
    title: "Welcome to Digital Marketing Cohort 1!",
    body: "Your learning portal is now live. Check the modules section to get started with Week 1. Reach out to your tutor if you have any questions.",
    priority: "normal",
    publishedAt: now.toISOString(),
  });

  await db.Announcement.insert({
    authorId: admin?.id!,
    cohortId: csCohort?.id!,
    title: "Welcome to Cybersecurity Cohort 1!",
    body: "Classes begin this week. Ensure you have access to a Linux environment — we recommend setting up WSL or a VirtualBox VM before your first session.",
    priority: "urgent",
    publishedAt: now.toISOString(),
  });

  await db.Announcement.insert({
    authorId: admin?.id!,
    cohortId: daCohort?.id!,
    title: "Welcome to Data Analysis Cohort 1!",
    body: "Please install Power BI Desktop and create a free Kaggle account before your first session. Links are in the Week 1 module resources.",
    priority: "normal",
    publishedAt: now.toISOString(),
  });

  await db.Announcement.insert({
    authorId: admin?.id!,
    title: "Platform Maintenance — Sunday 2AM–4AM",
    body: "The academy platform will be briefly unavailable this Sunday between 2AM and 4AM for scheduled maintenance. Please plan accordingly.",
    priority: "low",
    publishedAt: now.toISOString(),
  });

  // ── Activity Logs ──────────────────────────────────────
  await db.ActivityLog.insert({
    userId: admin?.id!,
    role: "admin",
    action: "login",
    path: "/admin/login",
    method: "POST",
    details: { ip: "197.210.0.1" },
  });

  await db.ActivityLog.insert({
    userId: student1?.id!,
    role: "student",
    action: "page_view",
    path: "/dashboard/modules",
    method: "GET",
    details: { module: "Foundations of Digital Marketing" },
  });

  await db.ActivityLog.insert({
    userId: student2?.id!,
    role: "student",
    action: "form_submit",
    path: "/assessments/submit",
    method: "POST",
    details: { assessmentId: csAssess1?.id, score: 92 },
  });

  // ── PPTs ───────────────────────────────────────────────
  await db.PPT.insert({ companyName: "Flutterwave" });
  await db.PPT.insert({ companyName: "Paystack" });
  await db.PPT.insert({ companyName: "Konga" });

  console.log("Database seeded successfully!");
}

async function main() { 
  const db = await initializeDatabaseModule();
  await seedDatabase(db)

  const enrollment = await db.Enrollment.query().first();
  console.log("enrollment:", enrollment?.id, "cohortId:", enrollment?.cohortId);

  console.log("\n=== whereRelated ===");

  // 1. All assessments for enrollment
  const allRelated = await db.Assessment.query()
    .whereRelated("module.track.cohorts.enrollments", "id", enrollment?.id)
    .get();
  console.log("1. all related:", allRelated.map(a => ({ id: a.id, moduleId: a.moduleId })));

  // 2. Filter by specific assessment id
  const byId = await db.Assessment.query()
    .whereRelated("module.track.cohorts.enrollments", "id", enrollment?.id)
    .where("id", "=", 9)
    .first();
  console.log("2. by id=9:", byId ? { id: byId.id, moduleId: byId.moduleId } : null);

  // 3. Filter by dotted relation path + inline first condition
  const byModuleId = await db.Assessment.query()
    .whereRelated("module.track.cohorts.enrollments", "id", enrollment?.id)
    .where("module.id", "=", 3)
    .first({ id: 11 });
  console.log("3. by module.id=3 and id=11:", byModuleId ? { id: byModuleId.id, moduleId: byModuleId.moduleId } : null);

  console.log("\n=== relatedTo ===");

  // 1. relatedTo Enrollment by id — BFS finds path automatically
  const relatedToEnrollment = await db.Assessment.query()
    .relatedTo("Enrollment", "id", enrollment?.id)
    .get();
  console.log("1. relatedTo Enrollment id=1:", relatedToEnrollment.map(a => ({ id: a.id, moduleId: a.moduleId })));

  // 2. relatedTo Cohort by id
  const relatedToCohort = await db.Assessment.query()
    .relatedTo("Cohort", "id", enrollment?.cohortId)
    .get();
  console.log("2. relatedTo Cohort id=2:", relatedToCohort.map(a => ({ id: a.id, moduleId: a.moduleId })));

  // 3. relatedTo Track by id with extra where filter
  const cohort = await db.Cohort.query().first({ id: enrollment?.cohortId });
  const relatedToTrack = await db.Assessment.query()
    .relatedTo("Track", "id", cohort?.trackId)
    .where("id", "=", 9)
    .first();
  console.log("3. relatedTo Track id=2, assessment id=9:", relatedToTrack ? { id: relatedToTrack.id, moduleId: relatedToTrack.moduleId } : null);

  console.log("\n=== throughRelation ===");

  // 1. throughRelation then manual whereRaw on the joined table
  const throughModule = await db.Assessment.query()
    .throughRelation("module")
    .whereRaw(`modules.trackId = ${cohort?.trackId}`)
    .get();
  console.log("1. throughRelation module, trackId filter:", throughModule.map(a => ({ id: a.id, moduleId: a.moduleId })));

  // 2. throughRelation across multiple hops with a specific assessment id
  const throughModuleTrack = await db.Assessment.query()
    .throughRelation("module.track")
    .whereRaw(`tracks.id = ${cohort?.trackId}`)
    .where("id", "=", 11)
    .first();
  console.log("2. throughRelation module.track, id=11:", throughModuleTrack ? { id: throughModuleTrack.id, moduleId: throughModuleTrack.moduleId } : null);

  // 3. throughRelation full chain with whereRaw on enrollment
  const throughFull = await db.Assessment.query()
    .throughRelation("module.track.cohorts.enrollments")
    .whereRaw(`enrollments.id = ${enrollment?.id}`)
    .get();
  console.log("3. throughRelation full chain:", throughFull.map(a => ({ id: a.id, moduleId: a.moduleId })));

  const builder = db.Assessment.query()
  .throughRelation("module.track.cohorts.enrollments")
  .whereRaw(`enrollments.id = ${enrollment?.id}`);
console.log((builder as any).buildSql());
const throughFullx = await builder.get();
}

main();