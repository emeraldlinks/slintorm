/**
 * interfaces.ts — consolidated model interfaces for SlintORM
 * Schema generator picks these up from source and generates schema from them.
 * Import and reuse across example.ts, test.ts, slintorm.test.ts, etc.
 */

export interface Post {
  id?: number;
  title: string;
  body?: string;
  userId?: number;
  // @relation manytoone:User;foreignKey:userId
  user?: User;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface User {
  id?: number;
  name: string;
  email?: string;
  password?: string;
  phone?: string;
  role?:string
  status?: string
  avatarUrl?: string;
  bio?: string;
  city?: string;
  country?: string;
  // @json
  meta?: Record<string, any>;
  score?: number;
  category?: string;
  isActive?: boolean;
  // @mask:ssn
  ssn?: string;
  // @mask:creditcard
  creditCard?: string;
  // @mask:email
  maskedEmail?: string;
  // @mask:phone
  phoneNumber?: string;
  // @mask:showFirst:4
  showFirst4?: string;
  // @mask:showLast:4
  showLast4?: string;
  // @mask:char:*
  starMasked?: string;
  // @mask:pattern:###-##-####
  patternMasked?: string;
  // @omitdb
  internalNote?: string;
  // @omitjson
  auditData?: string;
  // @omitmigrate
  tempField?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  // @relation onetomany:Payment;foreignKey:userId
  payments?: Payment[];
  // @relation onetomany:Enrollment;foreignKey:senderId
  enrollments?: Enrollment[];
}

export interface Profile {
  id?: number;
  userId: number;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Todo {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Team {
  id?: number;
  title: string;
  detail?: string;
  open?: boolean;
  tested?: boolean;
  // @relation manytomany:User;through:team_members;foreignKey:teamId;relatedKey:userId
  members?: User[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AggTest {
  id?: number;
  name: string;
  value: number;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Comment {
  id?: number;
  body: string;
  // @polymorphicType
  commentableType: string;
  // @polymorphicId
  commentableId: number;
  createdAt?: string;
}

export interface RandomKey {
  // @primaryKey;@random:string:16
  id?: string;
  // @unique;@random:string(24)
  uid?: string;
  // @random:number:4
  pin?: number;
  createdAt?: string;
  updatedAt?: string;
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
  slug?: string;
  status?: string;
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
  status?: string;
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
  tier?: string;
  status?: string;
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
  type?: string;
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
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: Record<string, any>[];
}

export interface Certification {
  id?: number;
  enrollmentId: number;
  name: string;
  platform: string;
  type?: string;
  badgeUrl?: string;
  verificationUrl?: string;
  certificationCode?: string;
  verifiedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  // @relation onetoone:Enrollment;foreignKey:enrollmentId
  enrollment?: Enrollment;
  trackId?: number;
  // @relation onetoone:Track;foreignKey:trackId
  track?: Track;
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
  contractType?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TutorAssignment {
  id?: number;
  tutorId: number;
  cohortId: number;
  weekStart?: number;
  weekEnd?: number;
  role?: string;
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
  mode?: string;
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
  size?: string;
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
  visibility?: string;
  status?: string;
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
  type?: string;
  location?: string;
  isRemote?: boolean;
  salaryRange?: string;
  requirements?: string;
  applicationUrl?: string;
  status?: string;
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
  type?: string;
  level?: string;
  isRemote?: boolean;
  salaryRange?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  wasExtended?: boolean;
  studentReport?: string;
  partnerReport?: string;
  durationWeeks?: number;
  sourcedBy?: string;
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
  currentStatus?: string;
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
  priority?: string;
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
  action: string;
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
  status?: string;
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
