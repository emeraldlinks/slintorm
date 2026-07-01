"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DB = void 0;
exports.initializeDatabaseModule = initializeDatabaseModule;
exports.seedDatabase = seedDatabase;
var index_1 = require("./index");
/** =========================
 *  ORM INIT
 *  ========================= */
var orm = null;
function getORM() {
    if (!orm) {
        orm = new index_1.default({
            driver: "sqlite",
            databaseUrl: "./testx.db",
            dir: "src",
            modelMap: {},
        });
    }
    return orm;
}
/** =========================
 *  INITIALIZE DATABASE AT MODULE LOAD
 *  ========================= */
function initializeDatabaseModule() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = getORM();
                    return [4 /*yield*/, db.defineModel("users", "User")];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("tracks", "Track")];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("cohorts", "Cohort")];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("applications", "Application")];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("enrollments", "Enrollment")];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("modules", "Module")];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("assessments", "Assessment")];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("submissions", "Submission")];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("certifications", "Certification")];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("messages", "Message")];
                case 10:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("portfolio_items", "PortfolioItem")];
                case 11:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("tutors", "Tutor")];
                case 12:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("tutor_assignments", "TutorAssignment")];
                case 13:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("classes", "CourseClass")];
                case 14:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("timetables", "Timetable")];
                case 15:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("placement_partners", "PlacementPartner")];
                case 16:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("job_listings", "JobListing")];
                case 17:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("placements", "Placement")];
                case 18:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("activity_logs", "ActivityLog")];
                case 19:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("payments", "Payment")];
                case 20:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("alumni_reports", "AlumniReport")];
                case 21:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("announcements", "Announcement")];
                case 22:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("attendances", "Attendance")];
                case 23:
                    _a.sent();
                    return [4 /*yield*/, db.defineModel("ppts", "PPT")];
                case 24:
                    _a.sent();
                    // await db.migrate();
                    // await seedDatabase()
                    return [2 /*return*/, db.DB];
            }
        });
    });
}
initializeDatabaseModule().then(function (d) { exports.DB = d; });
/** =========================
 *  SEED DATABASE
 *  ========================= */
function seedDatabase(db) {
    return __awaiter(this, void 0, void 0, function () {
        var existingAdmin, now, endDate, admin, dmTrack, csTrack, daTrack, dmCohort, csCohort, daCohort, tutorUser1, _a, _b, tutorUser2, _c, _d, tutorUser3, _e, _f, tutor1, tutor2, tutor3, dmClass, csClass, daClass, dmMod1, dmMod2, dmMod3, csMod1, csMod2, csMod3, daMod1, daMod2, daMod3, dmAssess1, csAssess1, daAssess1, student1, _g, _h, student2, _j, _k, student3, _l, _m, enrollment1, enrollment2, enrollment3, partner1, partner2, partner3, placement1, placement2, placement3;
        var _o, _p, _q, _r, _s, _t;
        return __generator(this, function (_u) {
            switch (_u.label) {
                case 0: return [4 /*yield*/, db.User
                        .query()
                        .where("email", "=", "admin@cofoundracademy.ng")
                        .first()];
                case 1:
                    existingAdmin = _u.sent();
                    if (existingAdmin) {
                        console.log("Database already seeded.");
                        return [2 /*return*/];
                    }
                    console.log("Seeding database...");
                    now = new Date();
                    endDate = new Date(now.getTime() + 84 * 86400000);
                    return [4 /*yield*/, db.User.insert({
                            name: "Admin User",
                            email: "admin@cofoundracademy.ng",
                            password: ("admin123"),
                            phone: "+2348000000000",
                            role: "admin",
                            status: "active",
                            city: "Port Harcourt",
                            country: "Nigeria",
                            bio: "Platform administrator for Cofoundr Academy.",
                        })];
                case 2:
                    admin = _u.sent();
                    return [4 /*yield*/, db.Track.insert({
                            name: "Digital Marketing",
                            description: "Comprehensive training in SEO, paid advertising, content strategy, social media management, email marketing, analytics, and personal branding. Includes free certifications from Google, Meta, HubSpot, and Semrush.",
                            slug: ("Digital Marketing"),
                            durationWeeks: 12,
                            price: 15000,
                            isActive: true,
                        })];
                case 3:
                    dmTrack = _u.sent();
                    return [4 /*yield*/, db.Track.insert({
                            name: "Cybersecurity",
                            description: "Intensive training in networking fundamentals, Linux security, ethical hacking, OSINT, web application security, incident response, and compliance. Includes free certifications from ISC2, Cisco, Google, and Microsoft.",
                            slug: ("Cybersecurity"),
                            durationWeeks: 12,
                            price: 15000,
                            isActive: true,
                        })];
                case 4:
                    csTrack = _u.sent();
                    return [4 /*yield*/, db.Track.insert({
                            name: "Data Analysis",
                            description: "Hands-on training in data wrangling, statistical analysis, SQL, Python (pandas, matplotlib), Power BI, and storytelling with data. Prepares students for real-world analyst roles across industries.",
                            slug: ("Data Analysis"),
                            durationWeeks: 12,
                            price: 15000,
                            isActive: true,
                        })];
                case 5:
                    daTrack = _u.sent();
                    return [4 /*yield*/, db.Cohort.insert({
                            name: "Digital Marketing — Cohort 1",
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            slug: ("Digital Marketing Cohort 1"),
                            status: "active",
                            startDate: now.toISOString(),
                            endDate: endDate.toISOString(),
                            maxStudents: 30,
                            price: 15000,
                        })];
                case 6:
                    dmCohort = _u.sent();
                    return [4 /*yield*/, db.Cohort.insert({
                            name: "Cybersecurity — Cohort 1",
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            slug: ("Cybersecurity Cohort 1"),
                            status: "active",
                            startDate: now.toISOString(),
                            endDate: endDate.toISOString(),
                            maxStudents: 25,
                            price: 15000,
                        })];
                case 7:
                    csCohort = _u.sent();
                    return [4 /*yield*/, db.Cohort.insert({
                            name: "Data Analysis — Cohort 1",
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            slug: ("Data Analysis Cohort 1"),
                            status: "active",
                            startDate: now.toISOString(),
                            endDate: endDate.toISOString(),
                            maxStudents: 25,
                            price: 15000,
                        })];
                case 8:
                    daCohort = _u.sent();
                    _b = (_a = db.User).insert;
                    _o = {
                        name: "Chisom Eze",
                        email: "chisom@cofoundracademy.ng"
                    };
                    return [4 /*yield*/, ("tutor123")];
                case 9: return [4 /*yield*/, _b.apply(_a, [(_o.password = _u.sent(),
                            _o.phone = "+2348011111111",
                            _o.role = "tutor",
                            _o.status = "active",
                            _o.city = "Lagos",
                            _o.country = "Nigeria",
                            _o.bio = "Digital marketing strategist with 5 years experience in SEO and paid media.",
                            _o)])];
                case 10:
                    tutorUser1 = _u.sent();
                    _d = (_c = db.User).insert;
                    _p = {
                        name: "Emeka Nwosu",
                        email: "emeka@cofoundracademy.ng"
                    };
                    return [4 /*yield*/, ("tutor123")];
                case 11: return [4 /*yield*/, _d.apply(_c, [(_p.password = _u.sent(),
                            _p.phone = "+2348022222222",
                            _p.role = "tutor",
                            _p.status = "active",
                            _p.city = "Abuja",
                            _p.country = "Nigeria",
                            _p.bio = "Certified ethical hacker and security engineer with SOC operations experience.",
                            _p)])];
                case 12:
                    tutorUser2 = _u.sent();
                    _f = (_e = db.User).insert;
                    _q = {
                        name: "Ngozi Okafor",
                        email: "ngozi@cofoundracademy.ng"
                    };
                    return [4 /*yield*/, ("tutor123")];
                case 13: return [4 /*yield*/, _f.apply(_e, [(_q.password = _u.sent(),
                            _q.phone = "+2348033333333",
                            _q.role = "tutor",
                            _q.status = "active",
                            _q.city = "Port Harcourt",
                            _q.country = "Nigeria",
                            _q.bio = "Data analyst and BI specialist with experience in fintech and healthcare sectors.",
                            _q)])];
                case 14:
                    tutorUser3 = _u.sent();
                    return [4 /*yield*/, db.Tutor.insert({
                            userId: tutorUser1 === null || tutorUser1 === void 0 ? void 0 : tutorUser1.id,
                            specialisation: "SEO, Content Strategy & Paid Advertising",
                            trackIds: [dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id],
                            linkedinUrl: "https://linkedin.com/in/chisom-eze",
                            isActive: true,
                            contractType: "paid",
                        })];
                case 15:
                    tutor1 = _u.sent();
                    return [4 /*yield*/, db.Tutor.insert({
                            userId: tutorUser2 === null || tutorUser2 === void 0 ? void 0 : tutorUser2.id,
                            specialisation: "Ethical Hacking, Network Security & Incident Response",
                            trackIds: [csTrack === null || csTrack === void 0 ? void 0 : csTrack.id],
                            linkedinUrl: "https://linkedin.com/in/emeka-nwosu",
                            isActive: true,
                            contractType: "paid",
                        })];
                case 16:
                    tutor2 = _u.sent();
                    return [4 /*yield*/, db.Tutor.insert({
                            userId: tutorUser3 === null || tutorUser3 === void 0 ? void 0 : tutorUser3.id,
                            specialisation: "Data Analysis, SQL & Power BI",
                            trackIds: [daTrack === null || daTrack === void 0 ? void 0 : daTrack.id],
                            linkedinUrl: "https://linkedin.com/in/ngozi-okafor",
                            isActive: true,
                            contractType: "paid",
                        })];
                case 17:
                    tutor3 = _u.sent();
                    return [4 /*yield*/, db.CourseClass.insert({
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            title: "Digital Marketing — Cohort 1 Class",
                            description: "Main class for Digital Marketing Cohort 1.",
                            conferenceLink: "https://meet.google.com/dm-cohort-1",
                            capacity: 30,
                            tutorId: tutor1 === null || tutor1 === void 0 ? void 0 : tutor1.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            startDate: now.toISOString(),
                            endDate: endDate.toISOString(),
                            isActive: true,
                        })];
                case 18:
                    dmClass = _u.sent();
                    return [4 /*yield*/, db.CourseClass.insert({
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            title: "Cybersecurity — Cohort 1 Class",
                            description: "Main class for Cybersecurity Cohort 1.",
                            conferenceLink: "https://meet.google.com/cs-cohort-1",
                            capacity: 25,
                            tutorId: tutor2 === null || tutor2 === void 0 ? void 0 : tutor2.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            startDate: now.toISOString(),
                            endDate: endDate.toISOString(),
                            isActive: true,
                        })];
                case 19:
                    csClass = _u.sent();
                    return [4 /*yield*/, db.CourseClass.insert({
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            title: "Data Analysis — Cohort 1 Class",
                            description: "Main class for Data Analysis Cohort 1.",
                            conferenceLink: "https://meet.google.com/da-cohort-1",
                            capacity: 25,
                            tutorId: tutor3 === null || tutor3 === void 0 ? void 0 : tutor3.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            startDate: now.toISOString(),
                            endDate: endDate.toISOString(),
                            isActive: true,
                        })];
                case 20:
                    daClass = _u.sent();
                    // ── Tutor Assignments ──────────────────────────────────
                    return [4 /*yield*/, db.TutorAssignment.insert({
                            tutorId: tutor1 === null || tutor1 === void 0 ? void 0 : tutor1.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            weekStart: 1,
                            weekEnd: 12,
                            role: "lead",
                        })];
                case 21:
                    // ── Tutor Assignments ──────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.TutorAssignment.insert({
                            tutorId: tutor2 === null || tutor2 === void 0 ? void 0 : tutor2.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            weekStart: 1,
                            weekEnd: 12,
                            role: "lead",
                        })];
                case 22:
                    _u.sent();
                    return [4 /*yield*/, db.TutorAssignment.insert({
                            tutorId: tutor3 === null || tutor3 === void 0 ? void 0 : tutor3.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            weekStart: 1,
                            weekEnd: 12,
                            role: "lead",
                        })];
                case 23:
                    _u.sent();
                    // ── Timetables ─────────────────────────────────────────
                    return [4 /*yield*/, db.Timetable.insert({
                            classId: dmClass === null || dmClass === void 0 ? void 0 : dmClass.id,
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            tutorId: tutor1 === null || tutor1 === void 0 ? void 0 : tutor1.id,
                            title: "DM Week 1 — Foundations of Digital Marketing",
                            description: "Kick-off session covering the digital marketing landscape and funnel thinking.",
                            sessionDate: now.toISOString().split("T")[0],
                            startTime: "10:00",
                            endTime: "12:00",
                            mode: "online",
                        })];
                case 24:
                    // ── Timetables ─────────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Timetable.insert({
                            classId: csClass === null || csClass === void 0 ? void 0 : csClass.id,
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            tutorId: tutor2 === null || tutor2 === void 0 ? void 0 : tutor2.id,
                            title: "CS Week 1 — Networking & Internet Fundamentals",
                            description: "Introduction to TCP/IP, OSI model, and network basics.",
                            sessionDate: now.toISOString().split("T")[0],
                            startTime: "14:00",
                            endTime: "16:00",
                            mode: "online",
                        })];
                case 25:
                    _u.sent();
                    return [4 /*yield*/, db.Timetable.insert({
                            classId: daClass === null || daClass === void 0 ? void 0 : daClass.id,
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            tutorId: tutor3 === null || tutor3 === void 0 ? void 0 : tutor3.id,
                            title: "DA Week 1 — Introduction to Data Analysis",
                            description: "Overview of the data analysis process, tools, and career paths.",
                            sessionDate: now.toISOString().split("T")[0],
                            startTime: "16:00",
                            endTime: "18:00",
                            mode: "online",
                        })];
                case 26:
                    _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
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
                        })];
                case 27:
                    dmMod1 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
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
                        })];
                case 28:
                    dmMod2 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
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
                        })];
                case 29:
                    dmMod3 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
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
                        })];
                case 30:
                    csMod1 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
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
                        })];
                case 31:
                    csMod2 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
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
                        })];
                case 32:
                    csMod3 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
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
                        })];
                case 33:
                    daMod1 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
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
                        })];
                case 34:
                    daMod2 = _u.sent();
                    return [4 /*yield*/, db.Module.insert({
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
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
                        })];
                case 35:
                    daMod3 = _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: dmMod1 === null || dmMod1 === void 0 ? void 0 : dmMod1.id,
                            title: "Week 1 Quiz — Digital Marketing Basics",
                            type: "quiz",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 36:
                    dmAssess1 = _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: dmMod2 === null || dmMod2 === void 0 ? void 0 : dmMod2.id,
                            title: "SEO Audit — Peer Website Review",
                            description: "Audit a classmate's or local business website for on-page SEO issues.",
                            type: "project",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 37:
                    _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: dmMod3 === null || dmMod3 === void 0 ? void 0 : dmMod3.id,
                            title: "Week 3 Case Study — Campaign Analysis",
                            type: "case-study",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 38:
                    _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: csMod1 === null || csMod1 === void 0 ? void 0 : csMod1.id,
                            title: "Week 1 Quiz — Networking Fundamentals",
                            type: "quiz",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 39:
                    csAssess1 = _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: csMod2 === null || csMod2 === void 0 ? void 0 : csMod2.id,
                            title: "Linux Hardening Project",
                            description: "Harden a provided Linux VM and document all changes made.",
                            type: "project",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 40:
                    _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: csMod3 === null || csMod3 === void 0 ? void 0 : csMod3.id,
                            title: "OSINT Challenge — Recon Report",
                            description: "Perform passive recon on a provided test target and submit a structured report.",
                            type: "project",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 41:
                    _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: daMod1 === null || daMod1 === void 0 ? void 0 : daMod1.id,
                            title: "Week 1 Quiz — Data Analysis Fundamentals",
                            type: "quiz",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 42:
                    daAssess1 = _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: daMod2 === null || daMod2 === void 0 ? void 0 : daMod2.id,
                            title: "SQL Query Challenge",
                            description: "Complete a set of 10 increasingly complex SQL queries against a provided dataset.",
                            type: "project",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 43:
                    _u.sent();
                    return [4 /*yield*/, db.Assessment.insert({
                            moduleId: daMod3 === null || daMod3 === void 0 ? void 0 : daMod3.id,
                            title: "Power BI Dashboard Presentation",
                            description: "Build and present a 3-page Power BI dashboard on a provided business dataset.",
                            type: "presentation",
                            maxScore: 100,
                            dueOffsetDays: 7,
                            isRequired: true,
                        })];
                case 44:
                    _u.sent();
                    _h = (_g = db.User).insert;
                    _r = {
                        name: "Adebayo Ogunlesi",
                        email: "adebayo@example.com"
                    };
                    return [4 /*yield*/, ("student123")];
                case 45: return [4 /*yield*/, _h.apply(_g, [(_r.password = _u.sent(),
                            _r.phone = "+2348012345678",
                            _r.role = "student",
                            _r.status = "active",
                            _r.city = "Lagos",
                            _r.country = "Nigeria",
                            _r)])];
                case 46:
                    student1 = _u.sent();
                    _k = (_j = db.User).insert;
                    _s = {
                        name: "Fatima Aliyu",
                        email: "fatima@example.com"
                    };
                    return [4 /*yield*/, ("student123")];
                case 47: return [4 /*yield*/, _k.apply(_j, [(_s.password = _u.sent(),
                            _s.phone = "+2348023456789",
                            _s.role = "student",
                            _s.status = "active",
                            _s.city = "Kano",
                            _s.country = "Nigeria",
                            _s)])];
                case 48:
                    student2 = _u.sent();
                    _m = (_l = db.User).insert;
                    _t = {
                        name: "Chukwuemeka Eze",
                        email: "emeka.student@example.com"
                    };
                    return [4 /*yield*/, ("student123")];
                case 49: return [4 /*yield*/, _m.apply(_l, [(_t.password = _u.sent(),
                            _t.phone = "+2348034567890",
                            _t.role = "student",
                            _t.status = "active",
                            _t.city = "Enugu",
                            _t.country = "Nigeria",
                            _t)])];
                case 50:
                    student3 = _u.sent();
                    // ── Applications ───────────────────────────────────────
                    return [4 /*yield*/, db.Application.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            motivation: "I want to grow my family's fashion business online and attract more customers through digital channels.",
                            goals: "Learn paid ads and SEO well enough to manage campaigns independently within 3 months.",
                            priorExperience: "Basic social media management for 6 months on Instagram.",
                            status: "accepted",
                            reviewedBy: admin === null || admin === void 0 ? void 0 : admin.id,
                            reviewNote: "Strong motivation and clear goals. Accepted.",
                            aptitudeScore: 78,
                        })];
                case 51:
                    // ── Applications ───────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Application.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            motivation: "I am passionate about keeping systems and people safe online. Cybersecurity is the future.",
                            goals: "Earn the ISC2 CC certification and land a junior SOC analyst role.",
                            priorExperience: "Studied computer science for 2 years before dropping out. Comfortable with Linux.",
                            status: "accepted",
                            reviewedBy: admin === null || admin === void 0 ? void 0 : admin.id,
                            reviewNote: "Prior CS background is a plus. Accepted.",
                            aptitudeScore: 85,
                        })];
                case 52:
                    _u.sent();
                    return [4 /*yield*/, db.Application.insert({
                            userId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            motivation: "I work in a bank and want to stop relying on manual Excel reports by automating insights with proper data tools.",
                            goals: "Build Power BI dashboards for my department and transition into a data analyst role.",
                            priorExperience: "2 years using Excel and basic pivot tables in a banking operations role.",
                            status: "accepted",
                            reviewedBy: admin === null || admin === void 0 ? void 0 : admin.id,
                            reviewNote: "Practical workplace motivation. Excel background helpful. Accepted.",
                            aptitudeScore: 80,
                        })];
                case 53:
                    _u.sent();
                    return [4 /*yield*/, db.Enrollment.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            weeklyScore: 85,
                            overallScore: 82,
                            tier: "B",
                            status: "active",
                            paidAt: now.toISOString(),
                            paymentRef: "PSK_DM_REF_001",
                        })];
                case 54:
                    enrollment1 = _u.sent();
                    return [4 /*yield*/, db.Enrollment.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            weeklyScore: 90,
                            overallScore: 88,
                            tier: "A",
                            status: "active",
                            paidAt: now.toISOString(),
                            paymentRef: "PSK_CS_REF_001",
                        })];
                case 55:
                    enrollment2 = _u.sent();
                    return [4 /*yield*/, db.Enrollment.insert({
                            userId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            weeklyScore: 75,
                            overallScore: 72,
                            tier: "B",
                            status: "active",
                            paidAt: now.toISOString(),
                            paymentRef: "PSK_DA_REF_001",
                        })];
                case 56:
                    enrollment3 = _u.sent();
                    // ── Payments ───────────────────────────────────────────
                    return [4 /*yield*/, db.Payment.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            enrollmentId: enrollment1 === null || enrollment1 === void 0 ? void 0 : enrollment1.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            amount: 15000,
                            currency: "NGN",
                            method: "card",
                            status: "completed",
                            reference: "PSK_DM_REF_001",
                        })];
                case 57:
                    // ── Payments ───────────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Payment.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            enrollmentId: enrollment2 === null || enrollment2 === void 0 ? void 0 : enrollment2.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            amount: 15000,
                            currency: "NGN",
                            method: "card",
                            status: "completed",
                            reference: "PSK_CS_REF_001",
                        })];
                case 58:
                    _u.sent();
                    return [4 /*yield*/, db.Payment.insert({
                            userId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            enrollmentId: enrollment3 === null || enrollment3 === void 0 ? void 0 : enrollment3.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            amount: 15000,
                            currency: "NGN",
                            method: "transfer",
                            status: "completed",
                            reference: "PSK_DA_REF_001",
                        })];
                case 59:
                    _u.sent();
                    // ── Submissions ────────────────────────────────────────
                    return [4 /*yield*/, db.Submission.insert({
                            enrollmentId: enrollment1 === null || enrollment1 === void 0 ? void 0 : enrollment1.id,
                            assessmentId: dmAssess1 === null || dmAssess1 === void 0 ? void 0 : dmAssess1.id,
                            submittedAt: now.toISOString(),
                            notes: "Completed all 20 questions.",
                            score: 84,
                            gradedBy: tutorUser1 === null || tutorUser1 === void 0 ? void 0 : tutorUser1.id,
                            gradedAt: now.toISOString(),
                            feedback: "Good grasp of core concepts. Review the funnel stages once more.",
                            status: "graded",
                        })];
                case 60:
                    // ── Submissions ────────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Submission.insert({
                            enrollmentId: enrollment2 === null || enrollment2 === void 0 ? void 0 : enrollment2.id,
                            assessmentId: csAssess1 === null || csAssess1 === void 0 ? void 0 : csAssess1.id,
                            submittedAt: now.toISOString(),
                            notes: "All questions answered. Confident with OSI model section.",
                            score: 92,
                            gradedBy: tutorUser2 === null || tutorUser2 === void 0 ? void 0 : tutorUser2.id,
                            gradedAt: now.toISOString(),
                            feedback: "Excellent work. Strong understanding of networking fundamentals.",
                            status: "graded",
                        })];
                case 61:
                    _u.sent();
                    return [4 /*yield*/, db.Submission.insert({
                            enrollmentId: enrollment3 === null || enrollment3 === void 0 ? void 0 : enrollment3.id,
                            assessmentId: daAssess1 === null || daAssess1 === void 0 ? void 0 : daAssess1.id,
                            submittedAt: now.toISOString(),
                            notes: "First quiz attempt.",
                            score: 74,
                            gradedBy: tutorUser3 === null || tutorUser3 === void 0 ? void 0 : tutorUser3.id,
                            gradedAt: now.toISOString(),
                            feedback: "Solid foundation. Revisit the difference between structured and unstructured data.",
                            status: "graded",
                        })];
                case 62:
                    _u.sent();
                    // ── Certifications ─────────────────────────────────────
                    return [4 /*yield*/, db.Certification.insert({
                            enrollmentId: enrollment1 === null || enrollment1 === void 0 ? void 0 : enrollment1.id,
                            name: "Google Analytics Certification (GA4)",
                            platform: "Google Skillshop",
                            type: "required",
                            verificationUrl: "https://skillshop.google.com",
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                        })];
                case 63:
                    // ── Certifications ─────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Certification.insert({
                            enrollmentId: enrollment2 === null || enrollment2 === void 0 ? void 0 : enrollment2.id,
                            name: "ISC2 Certified in Cybersecurity (CC)",
                            platform: "ISC2",
                            type: "required",
                            verificationUrl: "https://www.isc2.org/certifications/cc",
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                        })];
                case 64:
                    _u.sent();
                    return [4 /*yield*/, db.Certification.insert({
                            enrollmentId: enrollment3 === null || enrollment3 === void 0 ? void 0 : enrollment3.id,
                            name: "Google Data Analytics Certificate",
                            platform: "Coursera / Google",
                            type: "required",
                            verificationUrl: "https://grow.google/certificates/data-analytics",
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                        })];
                case 65:
                    _u.sent();
                    // ── Attendance ─────────────────────────────────────────
                    return [4 /*yield*/, db.Attendance.insert({
                            enrollmentId: enrollment1 === null || enrollment1 === void 0 ? void 0 : enrollment1.id,
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            moduleId: dmMod1 === null || dmMod1 === void 0 ? void 0 : dmMod1.id,
                            sessionDate: now.toISOString().split("T")[0],
                            attended: true,
                            excused: false,
                        })];
                case 66:
                    // ── Attendance ─────────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Attendance.insert({
                            enrollmentId: enrollment2 === null || enrollment2 === void 0 ? void 0 : enrollment2.id,
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            moduleId: csMod1 === null || csMod1 === void 0 ? void 0 : csMod1.id,
                            sessionDate: now.toISOString().split("T")[0],
                            attended: true,
                            excused: false,
                        })];
                case 67:
                    _u.sent();
                    return [4 /*yield*/, db.Attendance.insert({
                            enrollmentId: enrollment3 === null || enrollment3 === void 0 ? void 0 : enrollment3.id,
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            moduleId: daMod1 === null || daMod1 === void 0 ? void 0 : daMod1.id,
                            sessionDate: now.toISOString().split("T")[0],
                            attended: true,
                            excused: false,
                        })];
                case 68:
                    _u.sent();
                    return [4 /*yield*/, db.PlacementPartner.insert({
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
                        })];
                case 69:
                    partner1 = _u.sent();
                    return [4 /*yield*/, db.PlacementPartner.insert({
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
                        })];
                case 70:
                    partner2 = _u.sent();
                    return [4 /*yield*/, db.PlacementPartner.insert({
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
                        })];
                case 71:
                    partner3 = _u.sent();
                    // ── Job Listings ───────────────────────────────────────
                    return [4 /*yield*/, db.JobListing.insert({
                            partnerId: partner1 === null || partner1 === void 0 ? void 0 : partner1.id,
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            title: "Junior Security Analyst",
                            description: "Monitor and respond to security alerts in our SOC environment.",
                            type: "entry-level",
                            location: "Lagos",
                            isRemote: false,
                            salaryRange: "₦150,000 – ₦200,000/month",
                            status: "open",
                            postedAt: now.toISOString(),
                        })];
                case 72:
                    // ── Job Listings ───────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.JobListing.insert({
                            partnerId: partner2 === null || partner2 === void 0 ? void 0 : partner2.id,
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            title: "Digital Marketing Intern",
                            description: "Support growth campaigns across paid and organic channels.",
                            type: "internship",
                            location: "Lagos",
                            isRemote: true,
                            salaryRange: "₦80,000 – ₦100,000/month",
                            status: "open",
                            postedAt: now.toISOString(),
                        })];
                case 73:
                    _u.sent();
                    return [4 /*yield*/, db.JobListing.insert({
                            partnerId: partner3 === null || partner3 === void 0 ? void 0 : partner3.id,
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            title: "Data Analyst Intern",
                            description: "Analyse sales and customer data to generate actionable insights for the growth team.",
                            type: "internship",
                            location: "Lagos",
                            isRemote: true,
                            salaryRange: "₦90,000 – ₦120,000/month",
                            status: "open",
                            postedAt: now.toISOString(),
                        })];
                case 74:
                    _u.sent();
                    return [4 /*yield*/, db.Placement.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            partnerId: partner2 === null || partner2 === void 0 ? void 0 : partner2.id,
                            enrollmentId: enrollment1 === null || enrollment1 === void 0 ? void 0 : enrollment1.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            trackId: dmTrack === null || dmTrack === void 0 ? void 0 : dmTrack.id,
                            classId: dmClass === null || dmClass === void 0 ? void 0 : dmClass.id,
                            companyName: "Paystack",
                            role: "Digital Marketing Intern",
                            type: "internship",
                            isRemote: true,
                            salaryRange: "₦80,000 – ₦100,000/month",
                            status: "active",
                            startDate: now.toISOString(),
                            durationWeeks: 8,
                            sourcedBy: "academy",
                        })];
                case 75:
                    placement1 = _u.sent();
                    return [4 /*yield*/, db.Placement.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            partnerId: partner1 === null || partner1 === void 0 ? void 0 : partner1.id,
                            enrollmentId: enrollment2 === null || enrollment2 === void 0 ? void 0 : enrollment2.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            trackId: csTrack === null || csTrack === void 0 ? void 0 : csTrack.id,
                            classId: csClass === null || csClass === void 0 ? void 0 : csClass.id,
                            companyName: "Flutterwave",
                            role: "Junior Security Analyst",
                            type: "entry-level",
                            isRemote: false,
                            salaryRange: "₦150,000 – ₦200,000/month",
                            status: "active",
                            startDate: now.toISOString(),
                            durationWeeks: 12,
                            sourcedBy: "academy",
                        })];
                case 76:
                    placement2 = _u.sent();
                    return [4 /*yield*/, db.Placement.insert({
                            userId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            partnerId: partner3 === null || partner3 === void 0 ? void 0 : partner3.id,
                            enrollmentId: enrollment3 === null || enrollment3 === void 0 ? void 0 : enrollment3.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            trackId: daTrack === null || daTrack === void 0 ? void 0 : daTrack.id,
                            classId: daClass === null || daClass === void 0 ? void 0 : daClass.id,
                            companyName: "Konga",
                            role: "Data Analyst Intern",
                            type: "internship",
                            isRemote: true,
                            salaryRange: "₦90,000 – ₦120,000/month",
                            status: "active",
                            startDate: now.toISOString(),
                            durationWeeks: 8,
                            sourcedBy: "academy",
                        })];
                case 77:
                    placement3 = _u.sent();
                    // ── Alumni Reports ─────────────────────────────────────
                    return [4 /*yield*/, db.AlumniReport.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            placementId: placement1 === null || placement1 === void 0 ? void 0 : placement1.id,
                            reportedAt: now.toISOString(),
                            currentStatus: "employed",
                            currentRole: "Digital Marketing Intern",
                            currentCompany: "Paystack",
                            monthlySalary: 90000,
                            isRemote: true,
                            satisfactionScore: 9,
                            programmeRating: 5,
                            testimonial: "The programme gave me real hands-on skills I could apply from day one at Paystack. Highly recommend.",
                            isPublic: true,
                        })];
                case 78:
                    // ── Alumni Reports ─────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.AlumniReport.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            placementId: placement2 === null || placement2 === void 0 ? void 0 : placement2.id,
                            reportedAt: now.toISOString(),
                            currentStatus: "employed",
                            currentRole: "Junior Security Analyst",
                            currentCompany: "Flutterwave",
                            monthlySalary: 175000,
                            isRemote: false,
                            satisfactionScore: 10,
                            programmeRating: 5,
                            testimonial: "Cofoundr Academy structured the cybersecurity content perfectly for someone starting from scratch. I passed my CC exam on the first attempt.",
                            isPublic: true,
                        })];
                case 79:
                    _u.sent();
                    return [4 /*yield*/, db.AlumniReport.insert({
                            userId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            placementId: placement3 === null || placement3 === void 0 ? void 0 : placement3.id,
                            reportedAt: now.toISOString(),
                            currentStatus: "employed",
                            currentRole: "Data Analyst Intern",
                            currentCompany: "Konga",
                            monthlySalary: 105000,
                            isRemote: true,
                            satisfactionScore: 8,
                            programmeRating: 4,
                            testimonial: "I now build dashboards my entire department uses. The SQL and Power BI modules were incredibly practical.",
                            isPublic: true,
                        })];
                case 80:
                    _u.sent();
                    // ── Portfolio Items ─────────────────────────────────────
                    return [4 /*yield*/, db.PortfolioItem.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            title: "SEO Audit — Local Fashion Brand",
                            description: "A full on-page SEO audit with recommendations for a Port Harcourt fashion brand.",
                            fileType: "pdf",
                            visibility: "public",
                            status: "published",
                            tags: ["SEO", "Digital Marketing", "Content"],
                        })];
                case 81:
                    // ── Portfolio Items ─────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.PortfolioItem.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            title: "Linux Hardening Checklist & Report",
                            description: "Documented steps taken to harden an Ubuntu 22.04 server as part of the cybersecurity programme.",
                            fileType: "pdf",
                            visibility: "public",
                            status: "published",
                            tags: ["Linux", "Cybersecurity", "Hardening"],
                        })];
                case 82:
                    _u.sent();
                    return [4 /*yield*/, db.PortfolioItem.insert({
                            userId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            title: "Sales Dashboard — Retail Dataset",
                            description: "Interactive Power BI dashboard analysing 12-month retail sales data with slicers and KPI cards.",
                            fileType: "pbix",
                            visibility: "public",
                            status: "published",
                            tags: ["Power BI", "Data Analysis", "Dashboard"],
                        })];
                case 83:
                    _u.sent();
                    // ── Messages ───────────────────────────────────────────
                    return [4 /*yield*/, db.Message.insert({
                            senderId: tutorUser1 === null || tutorUser1 === void 0 ? void 0 : tutorUser1.id,
                            recipientId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            senderRole: "tutor",
                            recipientRole: "student",
                            content: "Hi Adebayo, great job on the Week 1 quiz! Keep up the momentum going into the SEO module.",
                            isRead: false,
                        })];
                case 84:
                    // ── Messages ───────────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Message.insert({
                            senderId: tutorUser2 === null || tutorUser2 === void 0 ? void 0 : tutorUser2.id,
                            recipientId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            senderRole: "tutor",
                            recipientRole: "student",
                            content: "Fatima, your networking quiz score was outstanding. Make sure you set up your TryHackMe account before Week 2.",
                            isRead: false,
                        })];
                case 85:
                    _u.sent();
                    return [4 /*yield*/, db.Message.insert({
                            senderId: tutorUser3 === null || tutorUser3 === void 0 ? void 0 : tutorUser3.id,
                            recipientId: student3 === null || student3 === void 0 ? void 0 : student3.id,
                            senderRole: "tutor",
                            recipientRole: "student",
                            content: "Emeka, good effort on the quiz. I'd like you to revisit the data types section — it will help a lot with the SQL module.",
                            isRead: false,
                        })];
                case 86:
                    _u.sent();
                    // ── Announcements ──────────────────────────────────────
                    return [4 /*yield*/, db.Announcement.insert({
                            authorId: admin === null || admin === void 0 ? void 0 : admin.id,
                            cohortId: dmCohort === null || dmCohort === void 0 ? void 0 : dmCohort.id,
                            title: "Welcome to Digital Marketing Cohort 1!",
                            body: "Your learning portal is now live. Check the modules section to get started with Week 1. Reach out to your tutor if you have any questions.",
                            priority: "normal",
                            publishedAt: now.toISOString(),
                        })];
                case 87:
                    // ── Announcements ──────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.Announcement.insert({
                            authorId: admin === null || admin === void 0 ? void 0 : admin.id,
                            cohortId: csCohort === null || csCohort === void 0 ? void 0 : csCohort.id,
                            title: "Welcome to Cybersecurity Cohort 1!",
                            body: "Classes begin this week. Ensure you have access to a Linux environment — we recommend setting up WSL or a VirtualBox VM before your first session.",
                            priority: "urgent",
                            publishedAt: now.toISOString(),
                        })];
                case 88:
                    _u.sent();
                    return [4 /*yield*/, db.Announcement.insert({
                            authorId: admin === null || admin === void 0 ? void 0 : admin.id,
                            cohortId: daCohort === null || daCohort === void 0 ? void 0 : daCohort.id,
                            title: "Welcome to Data Analysis Cohort 1!",
                            body: "Please install Power BI Desktop and create a free Kaggle account before your first session. Links are in the Week 1 module resources.",
                            priority: "normal",
                            publishedAt: now.toISOString(),
                        })];
                case 89:
                    _u.sent();
                    return [4 /*yield*/, db.Announcement.insert({
                            authorId: admin === null || admin === void 0 ? void 0 : admin.id,
                            title: "Platform Maintenance — Sunday 2AM–4AM",
                            body: "The academy platform will be briefly unavailable this Sunday between 2AM and 4AM for scheduled maintenance. Please plan accordingly.",
                            priority: "low",
                            publishedAt: now.toISOString(),
                        })];
                case 90:
                    _u.sent();
                    // ── Activity Logs ──────────────────────────────────────
                    return [4 /*yield*/, db.ActivityLog.insert({
                            userId: admin === null || admin === void 0 ? void 0 : admin.id,
                            role: "admin",
                            action: "login",
                            path: "/admin/login",
                            method: "POST",
                            details: { ip: "197.210.0.1" },
                        })];
                case 91:
                    // ── Activity Logs ──────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.ActivityLog.insert({
                            userId: student1 === null || student1 === void 0 ? void 0 : student1.id,
                            role: "student",
                            action: "page_view",
                            path: "/dashboard/modules",
                            method: "GET",
                            details: { module: "Foundations of Digital Marketing" },
                        })];
                case 92:
                    _u.sent();
                    return [4 /*yield*/, db.ActivityLog.insert({
                            userId: student2 === null || student2 === void 0 ? void 0 : student2.id,
                            role: "student",
                            action: "form_submit",
                            path: "/assessments/submit",
                            method: "POST",
                            details: { assessmentId: csAssess1 === null || csAssess1 === void 0 ? void 0 : csAssess1.id, score: 92 },
                        })];
                case 93:
                    _u.sent();
                    // ── PPTs ───────────────────────────────────────────────
                    return [4 /*yield*/, db.PPT.insert({ companyName: "Flutterwave" })];
                case 94:
                    // ── PPTs ───────────────────────────────────────────────
                    _u.sent();
                    return [4 /*yield*/, db.PPT.insert({ companyName: "Paystack" })];
                case 95:
                    _u.sent();
                    return [4 /*yield*/, db.PPT.insert({ companyName: "Konga" })];
                case 96:
                    _u.sent();
                    console.log("Database seeded successfully!");
                    return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var db, enrollment, allRelated, byId, byModuleId, relatedToEnrollment, relatedToCohort, cohort, relatedToTrack, throughModule, throughModuleTrack, throughFull, builder, throughFullx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, initializeDatabaseModule()];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, seedDatabase(db)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.Enrollment.query().first()];
                case 3:
                    enrollment = _a.sent();
                    console.log("enrollment:", enrollment === null || enrollment === void 0 ? void 0 : enrollment.id, "cohortId:", enrollment === null || enrollment === void 0 ? void 0 : enrollment.cohortId);
                    console.log("\n=== whereRelated ===");
                    return [4 /*yield*/, db.Assessment.query()
                            .whereRelated("module.track.cohorts.enrollments", "id", enrollment === null || enrollment === void 0 ? void 0 : enrollment.id)
                            .get()];
                case 4:
                    allRelated = _a.sent();
                    console.log("1. all related:", allRelated.map(function (a) { return ({ id: a.id, moduleId: a.moduleId }); }));
                    return [4 /*yield*/, db.Assessment.query()
                            .whereRelated("module.track.cohorts.enrollments", "id", enrollment === null || enrollment === void 0 ? void 0 : enrollment.id)
                            .where("id", "=", 9)
                            .first()];
                case 5:
                    byId = _a.sent();
                    console.log("2. by id=9:", byId ? { id: byId.id, moduleId: byId.moduleId } : null);
                    return [4 /*yield*/, db.Assessment.query()
                            .whereRelated("module.track.cohorts.enrollments", "id", enrollment === null || enrollment === void 0 ? void 0 : enrollment.id)
                            .where("module.id", "=", 3)
                            .first({ id: 11 })];
                case 6:
                    byModuleId = _a.sent();
                    console.log("3. by module.id=3 and id=11:", byModuleId ? { id: byModuleId.id, moduleId: byModuleId.moduleId } : null);
                    console.log("\n=== relatedTo ===");
                    return [4 /*yield*/, db.Assessment.query()
                            .relatedTo("Enrollment", "id", enrollment === null || enrollment === void 0 ? void 0 : enrollment.id)
                            .get()];
                case 7:
                    relatedToEnrollment = _a.sent();
                    console.log("1. relatedTo Enrollment id=1:", relatedToEnrollment.map(function (a) { return ({ id: a.id, moduleId: a.moduleId }); }));
                    return [4 /*yield*/, db.Assessment.query()
                            .relatedTo("Cohort", "id", enrollment === null || enrollment === void 0 ? void 0 : enrollment.cohortId)
                            .get()];
                case 8:
                    relatedToCohort = _a.sent();
                    console.log("2. relatedTo Cohort id=2:", relatedToCohort.map(function (a) { return ({ id: a.id, moduleId: a.moduleId }); }));
                    return [4 /*yield*/, db.Cohort.query().first({ id: enrollment === null || enrollment === void 0 ? void 0 : enrollment.cohortId })];
                case 9:
                    cohort = _a.sent();
                    return [4 /*yield*/, db.Assessment.query()
                            .relatedTo("Track", "id", cohort === null || cohort === void 0 ? void 0 : cohort.trackId)
                            .where("id", "=", 9)
                            .first()];
                case 10:
                    relatedToTrack = _a.sent();
                    console.log("3. relatedTo Track id=2, assessment id=9:", relatedToTrack ? { id: relatedToTrack.id, moduleId: relatedToTrack.moduleId } : null);
                    console.log("\n=== throughRelation ===");
                    return [4 /*yield*/, db.Assessment.query()
                            .throughRelation("module")
                            .whereRaw("modules.trackId = ".concat(cohort === null || cohort === void 0 ? void 0 : cohort.trackId))
                            .get()];
                case 11:
                    throughModule = _a.sent();
                    console.log("1. throughRelation module, trackId filter:", throughModule.map(function (a) { return ({ id: a.id, moduleId: a.moduleId }); }));
                    return [4 /*yield*/, db.Assessment.query()
                            .throughRelation("module.track")
                            .whereRaw("tracks.id = ".concat(cohort === null || cohort === void 0 ? void 0 : cohort.trackId))
                            .where("id", "=", 11)
                            .first()];
                case 12:
                    throughModuleTrack = _a.sent();
                    console.log("2. throughRelation module.track, id=11:", throughModuleTrack ? { id: throughModuleTrack.id, moduleId: throughModuleTrack.moduleId } : null);
                    return [4 /*yield*/, db.Assessment.query()
                            .throughRelation("module.track.cohorts.enrollments")
                            .whereRaw("enrollments.id = ".concat(enrollment === null || enrollment === void 0 ? void 0 : enrollment.id))
                            .get()];
                case 13:
                    throughFull = _a.sent();
                    console.log("3. throughRelation full chain:", throughFull.map(function (a) { return ({ id: a.id, moduleId: a.moduleId }); }));
                    builder = db.Assessment.query()
                        .throughRelation("module.track.cohorts.enrollments")
                        .whereRaw("enrollments.id = ".concat(enrollment === null || enrollment === void 0 ? void 0 : enrollment.id));
                    console.log(builder.buildSql());
                    return [4 /*yield*/, builder.get()];
                case 14:
                    throughFullx = _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main();
