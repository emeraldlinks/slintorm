
// AUTO-GENERATED SCHEMA - DO NOT EDIT
// Schema Hash: 50a592c81766ee43
// Source Hash: 6f6c2d5f6bd88322

export interface User {
  id?: number;
  name: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: string;
  status?: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  country?: string;
  createdAt?: string;
  updatedAt?: string;
  payments?: Payment[];
  enrollments?: Enrollment[];
}

export interface Post {
  id?: number;
  title: string;
  body?: string;
  userId?: number;
  user?: User;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface Todo {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Profile {
  id?: number;
  userId: number;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Team {
  id?: number;
  title: string;
  detail?: string;
  open?: boolean;
  tested?: boolean;
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
  commentableType: string;
  commentableId: number;
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
  certifications?: Certification[];
  courseClass?: CourseClass;
  cohorts?: Cohort[];
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
  track?: Track;
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
  user?: User;
  reviewedBy?: number;
  reviewNote?: string;
  aptitudeScore?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Enrollment {
  id?: number;
  userId: number;
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
  cohort?: Cohort;
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
  resources?: {label : string ; url : string ; type ? : string; }[];
  isPublished?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  attachments?: Record <string ,any >[];
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
  enrollment?: Enrollment;
  trackId?: number;
  track?: Track;
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
  sender?: User;
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
  track?: Track;
  tutor?: Tutor;
  cohort?: Cohort;
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
  class?: CourseClass;
  track?: Track;
  tutor?: Tutor;
  cohort?: Cohort;
}

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
  placements?: Placement[];
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
  user?: User;
  partnerId?: number;
  jobListingId?: number;
  classId?: number;
  enrollmentId?: number;
  trackId?: number;
  cohortId?: number;
  cohort?: Cohort;
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
  enrollment?: Enrollment;
  partner?: PlacementPartner;
}

export interface ActivityLog {
  id?: number;
  userId?: number;
  role?: string;
  action: string;
  path?: string;
  method?: string;
  details?: Record <string ,any > | string;
  createdAt?: string;
  updatedAt?: string;
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
  metadata?: Record <string ,any >;
  createdAt?: string;
  updatedAt?: string;
  user?: User;
  cohort?: Cohort;
  enrollment?: Enrollment;
  track?: Track;
}

export interface AlumniReport {
  id?: number;
  userId: number;
  placementId?: number;
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

export interface PPT {
  id?: number;
  companyName: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ModelMap = {
  User: User;
  Post: Post;
  Todo: Todo;
  Profile: Profile;
  Team: Team;
  AggTest: AggTest;
  Comment: Comment;
  Track: Track;
  Cohort: Cohort;
  Application: Application;
  Enrollment: Enrollment;
  Module: Module;
  Assessment: Assessment;
  Submission: Submission;
  Certification: Certification;
  Message: Message;
  PortfolioItem: PortfolioItem;
  Tutor: Tutor;
  TutorAssignment: TutorAssignment;
  CourseClass: CourseClass;
  Timetable: Timetable;
  PlacementPartner: PlacementPartner;
  JobListing: JobListing;
  Placement: Placement;
  ActivityLog: ActivityLog;
  Payment: Payment;
  AlumniReport: AlumniReport;
  Announcement: Announcement;
  Attendance: Attendance;
  PPT: PPT;
};

export const schema = {
  "User": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "email": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "password": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "phone": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "role": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "avatarUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "bio": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "city": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "country": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "payments": {
        "type": "Payment[] | undefined",
        "originalType": "Payment[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Payment",
          "foreignKey": "userId"
        }
      },
      "enrollments": {
        "type": "Enrollment[] | undefined",
        "originalType": "Enrollment[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Enrollment",
          "foreignKey": "senderId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "User",
        "fieldName": "payments",
        "kind": "onetomany",
        "targetModel": "Payment",
        "foreignKey": "userId",
        "meta": {
          "@relation onetomany": "Payment",
          "foreignKey": "userId"
        }
      },
      {
        "sourceModel": "User",
        "fieldName": "enrollments",
        "kind": "onetomany",
        "targetModel": "Enrollment",
        "foreignKey": "senderId",
        "meta": {
          "@relation onetomany": "Enrollment",
          "foreignKey": "senderId"
        }
      }
    ],
    "table": "users"
  },
  "Post": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "body": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation manytoone": "User",
          "foreignKey": "userId"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Post",
        "fieldName": "user",
        "kind": "manytoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation manytoone": "User",
          "foreignKey": "userId"
        }
      }
    ],
    "table": "posts"
  },
  "Todo": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "detail": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "todos"
  },
  "Profile": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "bio": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "profiles"
  },
  "Team": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "detail": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "open": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "tested": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "members": {
        "type": "User[] | undefined",
        "originalType": "User[]",
        "optional": true,
        "meta": {
          "@relation manytomany": "User",
          "through": "team_members",
          "foreignKey": "teamId",
          "relatedKey": "userId"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Team",
        "fieldName": "members",
        "kind": "manytomany",
        "targetModel": "User",
        "foreignKey": "teamId",
        "through": "team_members",
        "meta": {
          "@relation manytomany": "User",
          "through": "team_members",
          "foreignKey": "teamId",
          "relatedKey": "userId"
        }
      }
    ],
    "table": "teams"
  },
  "AggTest": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "value": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "category": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      }
    },
    "relations": [],
    "table": "agg_tests"
  },
  "Comment": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "body": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "commentableType": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "commentableId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      }
    },
    "relations": [],
    "table": "comments"
  },
  "Track": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "slug": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "durationWeeks": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "price": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "isActive": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "certifications": {
        "type": "Certification[] | undefined",
        "originalType": "Certification[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Certification",
          "foreignKey": "trackId"
        }
      },
      "courseClass": {
        "type": "CourseClass | undefined",
        "originalType": "CourseClass",
        "optional": true,
        "meta": {
          "@relation onetoone": "CourseClass",
          "foreignKey": "trackId"
        }
      },
      "cohorts": {
        "type": "Cohort[] | undefined",
        "originalType": "Cohort[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Cohort",
          "foreignKey": "trackId"
        }
      },
      "modules": {
        "type": "Module[] | undefined",
        "originalType": "Module[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Module",
          "foreignKey": "trackId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Track",
        "fieldName": "certifications",
        "kind": "onetomany",
        "targetModel": "Certification",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetomany": "Certification",
          "foreignKey": "trackId"
        }
      },
      {
        "sourceModel": "Track",
        "fieldName": "courseClass",
        "kind": "onetoone",
        "targetModel": "CourseClass",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetoone": "CourseClass",
          "foreignKey": "trackId"
        }
      },
      {
        "sourceModel": "Track",
        "fieldName": "cohorts",
        "kind": "onetomany",
        "targetModel": "Cohort",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetomany": "Cohort",
          "foreignKey": "trackId"
        }
      },
      {
        "sourceModel": "Track",
        "fieldName": "modules",
        "kind": "onetomany",
        "targetModel": "Module",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetomany": "Module",
          "foreignKey": "trackId"
        }
      }
    ],
    "table": "tracks"
  },
  "Cohort": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "trackId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "slug": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "startDate": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "endDate": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "maxStudents": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "track": {
        "type": "Track | undefined",
        "originalType": "Track",
        "optional": true,
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      },
      "enrollments": {
        "type": "Enrollment[] | undefined",
        "originalType": "Enrollment[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Enrollment",
          "foreignKey": "cohortId"
        }
      },
      "price": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Cohort",
        "fieldName": "track",
        "kind": "onetoone",
        "targetModel": "Track",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      },
      {
        "sourceModel": "Cohort",
        "fieldName": "enrollments",
        "kind": "onetomany",
        "targetModel": "Enrollment",
        "foreignKey": "cohortId",
        "meta": {
          "@relation onetomany": "Enrollment",
          "foreignKey": "cohortId"
        }
      }
    ],
    "table": "cohorts"
  },
  "Application": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "trackId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "motivation": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "goals": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "priorExperience": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      "reviewedBy": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "reviewNote": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "aptitudeScore": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Application",
        "fieldName": "user",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      }
    ],
    "table": "applications"
  },
  "Enrollment": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      "cohortId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "weeklyScore": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "overallScore": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "tier": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "completedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "paidAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "paymentRef": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "cohort": {
        "type": "Cohort | undefined",
        "originalType": "Cohort",
        "optional": true,
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      "payments": {
        "type": "Payment[] | undefined",
        "originalType": "Payment[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Payment",
          "foreignKey": "enrollmentId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Enrollment",
        "fieldName": "user",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      {
        "sourceModel": "Enrollment",
        "fieldName": "cohort",
        "kind": "onetoone",
        "targetModel": "Cohort",
        "foreignKey": "cohortId",
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      {
        "sourceModel": "Enrollment",
        "fieldName": "payments",
        "kind": "onetomany",
        "targetModel": "Payment",
        "foreignKey": "enrollmentId",
        "meta": {
          "@relation onetomany": "Payment",
          "foreignKey": "enrollmentId"
        }
      }
    ],
    "table": "enrollments"
  },
  "Module": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "trackId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "weekNumber": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "durationHours": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "learningObjectives": {
        "type": "string[] | undefined",
        "originalType": "string[]",
        "optional": true,
        "meta": {}
      },
      "resources": {
        "type": "{label : string ; url : string ; type ? : string; }[] | undefined",
        "originalType": "{label : string ; url : string ; type ? : string; }[]",
        "optional": true,
        "meta": {}
      },
      "isPublished": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "track": {
        "type": "Track | undefined",
        "originalType": "Track",
        "optional": true,
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Module",
        "fieldName": "track",
        "kind": "onetoone",
        "targetModel": "Track",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      }
    ],
    "table": "modules"
  },
  "Assessment": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "moduleId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "type": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "maxScore": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "dueOffsetDays": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "isRequired": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "module": {
        "type": "Module | undefined",
        "originalType": "Module",
        "optional": true,
        "meta": {
          "@relation onetoone": "Module",
          "foreignKey": "moduleId"
        }
      },
      "submitted": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Assessment",
        "fieldName": "module",
        "kind": "onetoone",
        "targetModel": "Module",
        "foreignKey": "moduleId",
        "meta": {
          "@relation onetoone": "Module",
          "foreignKey": "moduleId"
        }
      }
    ],
    "table": "assessments"
  },
  "Submission": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "enrollmentId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "assessmentId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "submittedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "fileUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "notes": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "score": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "gradedBy": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "gradedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "feedback": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "type": {
        "type": "\"quiz\" | \"project\" | \"assignment\" | undefined",
        "originalType": "\"quiz\" | \"project\" | \"assignment\"",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "attachments": {
        "type": "Record <string ,any >[] | undefined",
        "originalType": "Record <string ,any >[]",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "submissions"
  },
  "Certification": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "enrollmentId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "platform": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "type": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "badgeUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "verificationUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "certificationCode": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "verifiedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "completedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "enrollment": {
        "type": "Enrollment | undefined",
        "originalType": "Enrollment",
        "optional": true,
        "meta": {
          "@relation onetoone": "Enrollment",
          "foreignKey": "enrollmentId"
        }
      },
      "trackId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "track": {
        "type": "Track | undefined",
        "originalType": "Track",
        "optional": true,
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Certification",
        "fieldName": "enrollment",
        "kind": "onetoone",
        "targetModel": "Enrollment",
        "foreignKey": "enrollmentId",
        "meta": {
          "@relation onetoone": "Enrollment",
          "foreignKey": "enrollmentId"
        }
      },
      {
        "sourceModel": "Certification",
        "fieldName": "track",
        "kind": "onetoone",
        "targetModel": "Track",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      }
    ],
    "table": "certifications"
  },
  "Message": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "conversationId": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "senderId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "recipientId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "senderRole": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "recipientRole": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "content": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "attachmentUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "attachmentType": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isRead": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "sender": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "senderId"
        }
      },
      "recepient": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "recipientId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Message",
        "fieldName": "sender",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "senderId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "senderId"
        }
      },
      {
        "sourceModel": "Message",
        "fieldName": "recepient",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "recipientId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "recipientId"
        }
      }
    ],
    "table": "messages"
  },
  "PortfolioItem": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "fileUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "fileType": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "visibility": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "tags": {
        "type": "string[] | undefined",
        "originalType": "string[]",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "portfolio_items"
  },
  "Tutor": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "specialisation": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "trackIds": {
        "type": "number[] | undefined",
        "originalType": "number[]",
        "optional": true,
        "meta": {}
      },
      "linkedinUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isActive": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "contractType": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "tutors"
  },
  "TutorAssignment": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "tutorId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "cohortId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "weekStart": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "weekEnd": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "role": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "tutor": {
        "type": "Tutor | undefined",
        "originalType": "Tutor",
        "optional": true,
        "meta": {
          "@relation onetoone": "Tutor",
          "foreignKey": "tutorId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "TutorAssignment",
        "fieldName": "tutor",
        "kind": "onetoone",
        "targetModel": "Tutor",
        "foreignKey": "tutorId",
        "meta": {
          "@relation onetoone": "Tutor",
          "foreignKey": "tutorId"
        }
      }
    ],
    "table": "tutor_assignments"
  },
  "CourseClass": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "trackId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "room": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "conferenceLink": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "capacity": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "tutorId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "cohortId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "startDate": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "endDate": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isActive": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "track": {
        "type": "Track | undefined",
        "originalType": "Track",
        "optional": true,
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      },
      "tutor": {
        "type": "Tutor | undefined",
        "originalType": "Tutor",
        "optional": true,
        "meta": {
          "@relation onetoone": "Tutor",
          "foreignKey": "tutorId"
        }
      },
      "cohort": {
        "type": "Cohort | undefined",
        "originalType": "Cohort",
        "optional": true,
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      "timetable": {
        "type": "Timetable[] | undefined",
        "originalType": "Timetable[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Timetable",
          "foreignKey": "classId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "CourseClass",
        "fieldName": "track",
        "kind": "onetoone",
        "targetModel": "Track",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      },
      {
        "sourceModel": "CourseClass",
        "fieldName": "tutor",
        "kind": "onetoone",
        "targetModel": "Tutor",
        "foreignKey": "tutorId",
        "meta": {
          "@relation onetoone": "Tutor",
          "foreignKey": "tutorId"
        }
      },
      {
        "sourceModel": "CourseClass",
        "fieldName": "cohort",
        "kind": "onetoone",
        "targetModel": "Cohort",
        "foreignKey": "cohortId",
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      {
        "sourceModel": "CourseClass",
        "fieldName": "timetable",
        "kind": "onetomany",
        "targetModel": "Timetable",
        "foreignKey": "classId",
        "meta": {
          "@relation onetomany": "Timetable",
          "foreignKey": "classId"
        }
      }
    ],
    "table": "classes"
  },
  "Timetable": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "classId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "trackId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "cohortId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "tutorId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "sessionDate": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "startTime": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "endTime": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "location": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "mode": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "class": {
        "type": "CourseClass | undefined",
        "originalType": "CourseClass",
        "optional": true,
        "meta": {
          "@relation onetoone": "CourseClass",
          "foreignKey": "classId"
        }
      },
      "track": {
        "type": "Track | undefined",
        "originalType": "Track",
        "optional": true,
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      },
      "tutor": {
        "type": "Tutor | undefined",
        "originalType": "Tutor",
        "optional": true,
        "meta": {
          "@relation onetoone": "Tutor",
          "foreignKey": "tutorId"
        }
      },
      "cohort": {
        "type": "Cohort | undefined",
        "originalType": "Cohort",
        "optional": true,
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Timetable",
        "fieldName": "class",
        "kind": "onetoone",
        "targetModel": "CourseClass",
        "foreignKey": "classId",
        "meta": {
          "@relation onetoone": "CourseClass",
          "foreignKey": "classId"
        }
      },
      {
        "sourceModel": "Timetable",
        "fieldName": "track",
        "kind": "onetoone",
        "targetModel": "Track",
        "foreignKey": "trackId",
        "meta": {
          "@relation onetoone": "Track",
          "foreignKey": "trackId"
        }
      },
      {
        "sourceModel": "Timetable",
        "fieldName": "tutor",
        "kind": "onetoone",
        "targetModel": "Tutor",
        "foreignKey": "tutorId",
        "meta": {
          "@relation onetoone": "Tutor",
          "foreignKey": "tutorId"
        }
      },
      {
        "sourceModel": "Timetable",
        "fieldName": "cohort",
        "kind": "onetoone",
        "targetModel": "Cohort",
        "foreignKey": "cohortId",
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      }
    ],
    "table": "timetables"
  },
  "PlacementPartner": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "companyName": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "industry": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "website": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "contactName": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "contactEmail": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "contactPhone": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "size": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "location": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "country": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "partnerSince": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isActive": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "assignedInterns": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "lastAllocatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "notes": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "placements": {
        "type": "Placement[] | undefined",
        "originalType": "Placement[]",
        "optional": true,
        "meta": {
          "@relation onetomany": "Placement",
          "foreignKey": "partnerId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "PlacementPartner",
        "fieldName": "placements",
        "kind": "onetomany",
        "targetModel": "Placement",
        "foreignKey": "partnerId",
        "meta": {
          "@relation onetomany": "Placement",
          "foreignKey": "partnerId"
        }
      }
    ],
    "table": "placement_partners"
  },
  "JobListing": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "partnerId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "trackId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "description": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "type": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "location": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isRemote": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "salaryRange": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "requirements": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "applicationUrl": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "postedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "closesAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "job_listings"
  },
  "Placement": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      "partnerId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "jobListingId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "classId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "enrollmentId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "trackId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "cohortId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "cohort": {
        "type": "Cohort | undefined",
        "originalType": "Cohort",
        "optional": true,
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      "courseClass": {
        "type": "CourseClass | undefined",
        "originalType": "CourseClass",
        "optional": true,
        "meta": {
          "@relation onetoone": "CourseClass",
          "foreignKey": "classId"
        }
      },
      "companyName": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "role": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "type": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "level": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isRemote": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "salaryRange": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "startDate": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "endDate": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "wasExtended": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "studentReport": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "partnerReport": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "durationWeeks": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "sourcedBy": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "enrollment": {
        "type": "Enrollment | undefined",
        "originalType": "Enrollment",
        "optional": true,
        "meta": {
          "@relation onetoone": "Enrollment",
          "foreignKey": "enrollmentId"
        }
      },
      "partner": {
        "type": "PlacementPartner | undefined",
        "originalType": "PlacementPartner",
        "optional": true,
        "meta": {
          "@relation onetoone": "PlacementPartner",
          "foreignKey": "partnerId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Placement",
        "fieldName": "user",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      {
        "sourceModel": "Placement",
        "fieldName": "cohort",
        "kind": "onetoone",
        "targetModel": "Cohort",
        "foreignKey": "cohortId",
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      {
        "sourceModel": "Placement",
        "fieldName": "courseClass",
        "kind": "onetoone",
        "targetModel": "CourseClass",
        "foreignKey": "classId",
        "meta": {
          "@relation onetoone": "CourseClass",
          "foreignKey": "classId"
        }
      },
      {
        "sourceModel": "Placement",
        "fieldName": "enrollment",
        "kind": "onetoone",
        "targetModel": "Enrollment",
        "foreignKey": "enrollmentId",
        "meta": {
          "@relation onetoone": "Enrollment",
          "foreignKey": "enrollmentId"
        }
      },
      {
        "sourceModel": "Placement",
        "fieldName": "partner",
        "kind": "onetoone",
        "targetModel": "PlacementPartner",
        "foreignKey": "partnerId",
        "meta": {
          "@relation onetoone": "PlacementPartner",
          "foreignKey": "partnerId"
        }
      }
    ],
    "table": "placements"
  },
  "ActivityLog": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "role": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "action": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "path": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "e.g., \"login\", \"logout\", \"page_view\", \"form_submit\"": true
        }
      },
      "method": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "details": {
        "type": "Record <string ,any > | string | undefined",
        "originalType": "Record <string ,any > | string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      }
    },
    "relations": [],
    "table": "activity_logs"
  },
  "Payment": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "enrollmentId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "cohortId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "trackId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "amount": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "currency": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "method": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "reference": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "metadata": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      "cohort": {
        "type": "Cohort | undefined",
        "originalType": "Cohort",
        "optional": true,
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      "enrollment": {
        "type": "Enrollment | undefined",
        "originalType": "Enrollment",
        "optional": true,
        "meta": {
          "@relation onetoone": "Enrollment",
          "foreignKey": "enrollmentId"
        }
      },
      "track": {
        "type": "Track | undefined",
        "originalType": "Track",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Payment",
        "fieldName": "user",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      {
        "sourceModel": "Payment",
        "fieldName": "cohort",
        "kind": "onetoone",
        "targetModel": "Cohort",
        "foreignKey": "cohortId",
        "meta": {
          "@relation onetoone": "Cohort",
          "foreignKey": "cohortId"
        }
      },
      {
        "sourceModel": "Payment",
        "fieldName": "enrollment",
        "kind": "onetoone",
        "targetModel": "Enrollment",
        "foreignKey": "enrollmentId",
        "meta": {
          "@relation onetoone": "Enrollment",
          "foreignKey": "enrollmentId"
        }
      }
    ],
    "table": "payments"
  },
  "AlumniReport": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "placementId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "placement": {
        "type": "Placement | undefined",
        "originalType": "Placement",
        "optional": true,
        "meta": {
          "@relation onetoone": "Placement",
          "foreignKey": "placementId"
        }
      },
      "reportedAt": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "currentStatus": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "currentRole": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "currentCompany": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "monthlySalary": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "isRemote": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "satisfactionScore": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "programmeRating": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "testimonial": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "isPublic": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "AlumniReport",
        "fieldName": "placement",
        "kind": "onetoone",
        "targetModel": "Placement",
        "foreignKey": "placementId",
        "meta": {
          "@relation onetoone": "Placement",
          "foreignKey": "placementId"
        }
      }
    ],
    "table": "alumni_reports"
  },
  "Announcement": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "authorId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "author": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "authorId"
        }
      },
      "cohortId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "trackId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "body": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "priority": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "publishedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "expiresAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "Announcement",
        "fieldName": "author",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "authorId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "authorId"
        }
      }
    ],
    "table": "announcements"
  },
  "Attendance": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "enrollmentId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "moduleId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "sessionDate": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "attended": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "excused": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "note": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "attendances"
  },
  "PPT": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "companyName": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "createdAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      }
    },
    "relations": [],
    "table": "ppts"
  }
} as const;

export type Schema = typeof schema;
export type ModelName = keyof ModelMap;
