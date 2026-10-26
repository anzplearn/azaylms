const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/ai-models', express.static(path.join(__dirname, 'node_modules', '@vladmandic', 'face-api', 'model')));
app.use('/ai-lib', express.static(path.join(__dirname, 'node_modules', '@vladmandic', 'face-api', 'dist')));

// Ensure data & uploads directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initial seed data matching TII E-Learning LMS 0-3 courses
const INITIAL_DB = {
  courses: [
    {
      id: 'LB0',
      category: 'life',
      roleType: 'broker',
      renewalStep: 0,
      code: 'LB0',
      title: 'หลักสูตรขอรับใบอนุญาตเป็นนายหน้าประกันชีวิต',
      hours: 10,
      price: 1594.30,
      batches: [
        { id: 'B-2026-11A', label: 'รอบวันที่ 1 - 5 พฤศจิกายน 2569 (5 วัน)', startDate: '2026-11-01', endDate: '2026-11-05', seats: 50, enrolled: 12 },
        { id: 'B-2026-11B', label: 'รอบวันที่ 8 - 12 พฤศจิกายน 2569 (5 วัน)', startDate: '2026-11-08', endDate: '2026-11-12', seats: 50, enrolled: 8 },
        { id: 'B-2026-11C', label: 'รอบวันที่ 15 - 19 พฤศจิกายน 2569 (5 วัน)', startDate: '2026-11-15', endDate: '2026-11-19', seats: 50, enrolled: 25 }
      ],
      lessons: [
        {
          id: 'L1',
          youtubeId: 'mqcsLggV9LI',
          youtubeUrl: 'https://www.youtube.com/watch?v=mqcsLggV9LI',
          section: 'ก. ภาพรวมองค์กรและพันธกิจ อลิอันซ์ อยุธยา (Allianz Ayudhya)',
          title: '1. อลิอันซ์ อยุธยา บริษัทประกันที่เคียงข้างคุณทุกจังหวะชีวิต',
          realDurationSec: 167,
          durationSec: 167,
          displayDuration: '02:47 นาที (YouTube Official)',
          checkpoints: [45, 115]
        },
        {
          id: 'L2',
          youtubeId: 'lBa6fWSb_94',
          youtubeUrl: 'https://www.youtube.com/watch?v=lBa6fWSb_94',
          section: 'ข. นวัตกรรมดิจิทัลและการบริหารจัดการกรมธรรม์',
          title: '2. การบริหารจัดการกรมธรรม์และบริการดิจิทัลผ่านแอปฯ My Allianz',
          realDurationSec: 327,
          durationSec: 327,
          displayDuration: '05:27 นาที (YouTube Official)',
          checkpoints: [90, 220]
        },
        {
          id: 'L3',
          youtubeId: 'xnT8CFcnEIk',
          youtubeUrl: 'https://www.youtube.com/watch?v=xnT8CFcnEIk',
          section: 'ค. สิทธิประโยชน์ของผู้รับประโยชน์และการเรียกร้องสินไหม',
          title: '3. ขั้นตอนการแจ้งเคลมประกันชีวิตและสิทธิประโยชน์ตามกรมธรรม์',
          realDurationSec: 76,
          durationSec: 76,
          displayDuration: '01:16 นาที (YouTube Official)',
          checkpoints: [30, 60]
        }
      ],
      examQuestions: [
        {
          id: 'Q1',
          question: 'ข้อใดคือเกณฑ์คะแนนขั้นต่ำในการทำแบบทดสอบประเมินความรู้หลังการอบรมตามระเบียบ คปภ.?',
          choices: [
            'ไม่น้อยกว่าร้อยละ 50 (สอบได้ 3 ครั้ง)',
            'ไม่น้อยกว่าร้อยละ 60 (สอบได้ 5 ครั้ง)',
            'ไม่น้อยกว่าร้อยละ 70 (สอบได้ไม่จำกัดครั้ง)',
            'ไม่น้อยกว่าร้อยละ 80 (สอบได้ 1 ครั้ง)'
          ],
          correctIndex: 1
        },
        {
          id: 'Q2',
          question: 'ในระหว่างการอบรมออนไลน์ หากระบบสุ่มตรวจจับใบหน้า (Face Recognition) ผู้เข้าอบรมต้องกดยืนยันตัวตนภายในเวลากี่นาที?',
          choices: [
            'ภายใน 1 นาที',
            'ภายใน 2 นาที',
            'ภายใน 5 นาที',
            'ภายใน 15 นาที'
          ],
          correctIndex: 1
        },
        {
          id: 'Q3',
          question: 'หากไม่มีการตอบสนองจากผู้อบรมนานเกินกี่นาที ระบบจะนำออกจากห้องเรียนอัตโนมัติและย้อนกลับไปยังจุด Checkpoint ล่าสุด?',
          choices: [
            '5 นาที',
            '10 นาที',
            '15 นาที',
            '30 นาที'
          ],
          correctIndex: 2
        },
        {
          id: 'Q4',
          question: 'ในกรณีที่เป็นการอบรมเพื่อขอต่ออายุใบอนุญาตฯ รอบอบรมที่เลือกจะต้องจบก่อนวันที่บัตรเดิมหมดอายุอย่างน้อยกี่วันทำการ?',
          choices: [
            'อย่างน้อย 1 วันทำการ',
            'อย่างน้อย 2 วันทำการ',
            'อย่างน้อย 5 วันทำการ',
            'อย่างน้อย 7 วันทำการ'
          ],
          correctIndex: 1
        },
        {
          id: 'Q5',
          question: 'บุคคลใดเป็นผู้มีสิทธิรับเงินตามกรมธรรม์ประกันชีวิตเมื่อผู้เอาประกันภัยเสียชีวิตตามเงื่อนไขสัญญา?',
          choices: [
            'ตัวแทนประกันชีวิต',
            'นายหน้าประกันชีวิต',
            'ผู้รับประโยชน์ที่ระบุไว้ในกรมธรรม์',
            'นายทะเบียน คปภ.'
          ],
          correctIndex: 2
        }
      ]
    },
    {
      id: 'LB1',
      category: 'life',
      roleType: 'broker',
      renewalStep: 1,
      code: 'LB1',
      title: 'หลักสูตรขอต่ออายุใบอนุญาตเป็นนายหน้าประกันชีวิต ครั้งที่ 1',
      hours: 10,
      price: 1594.30
    },
    {
      id: 'LB2',
      category: 'life',
      roleType: 'broker',
      renewalStep: 2,
      code: 'LB2',
      title: 'หลักสูตรขอต่ออายุใบอนุญาตเป็นนายหน้าประกันชีวิต ครั้งที่ 2',
      hours: 10,
      price: 1594.30
    },
    {
      id: 'LB3',
      category: 'life',
      roleType: 'broker',
      renewalStep: 3,
      code: 'LB3',
      title: 'หลักสูตรขอต่ออายุใบอนุญาตเป็นนายหน้าประกันชีวิต ครั้งที่ 3',
      hours: 10,
      price: 1594.30
    },
    {
      id: 'LA0',
      category: 'life',
      roleType: 'agent',
      renewalStep: 0,
      code: 'LA0',
      title: 'หลักสูตรขอรับใบอนุญาตเป็นตัวแทนประกันชีวิต',
      hours: 10,
      price: 1284.00
    },
    {
      id: 'LA1',
      category: 'life',
      roleType: 'agent',
      renewalStep: 1,
      code: 'LA1',
      title: 'หลักสูตรขอต่ออายุใบอนุญาตเป็นตัวแทนประกันชีวิต ครั้งที่ 1',
      hours: 10,
      price: 1284.00
    },
    {
      id: 'NB0',
      category: 'nonlife',
      roleType: 'broker',
      renewalStep: 0,
      code: 'NB0',
      title: 'หลักสูตรขอรับใบอนุญาตเป็นนายหน้าประกันวินาศภัย',
      hours: 10,
      price: 1594.30
    },
    {
      id: 'NB1',
      category: 'nonlife',
      roleType: 'broker',
      renewalStep: 1,
      code: 'NB1',
      title: 'หลักสูตรขอต่ออายุใบอนุญาตเป็นนายหน้าประกันวินาศภัย ครั้งที่ 1',
      hours: 10,
      price: 1594.30
    }
  ],
  users: [],
  proctoringLogs: [],
  activityLogs: [],
  emails: [],
  webhooks: [],
  proctorSettings: {
    demoEdition: process.env.DEMO_SYSTEM_NAME === 'azay-torean' ? 'azay-torean' : 'standard',
    lessonDurationSec: process.env.DEMO_SYSTEM_NAME === 'azay-torean' ? 15 : 0, // 0 = ใช้ความยาววิดีโอ YouTube จริง (167s, 327s, 76s), 15 = โหมดเดโมด่วน azay-torean (15 วินาที)
    enforceFullscreenMode: true,
    faceMatchThresholdPct: 72,
    euclideanThreshold: 0.58,
    randomPromptTimeoutSec: process.env.DEMO_SYSTEM_NAME === 'azay-torean' ? 20 : 120,
    inactivityTimeoutSec: process.env.DEMO_SYSTEM_NAME === 'azay-torean' ? 30 : 900,
    pauseOnTabSwitch: true,
    maxTabSwitchWarnings: 5,
    detectMultipleFaces: true,
    detectHeadPoseLookingAway: true,
    blockCopyPasteRightClick: true,
    enableActiveLivenessChallenge: true,
    enableVoiceNoiseDetection: true,
    enableMultiMonitorDetection: true,
    enableDynamicWatermark: true,
    enableQuestionChoiceShuffle: true,
    examPassPercentage: 60,
    maxExamAttempts: 5
  }
};

function applyCustomLessonDurationToCourses(db) {
  if (!db.courses || !db.courses[0]) return;
  db.courses[0].lessons = JSON.parse(JSON.stringify(INITIAL_DB.courses[0].lessons));
  const customDur = Number(db.proctorSettings.lessonDurationSec) || 0;
  if (customDur > 0 && customDur !== 60) {
    db.courses[0].lessons.forEach((l) => {
      l.durationSec = customDur;
      l.displayDuration = `⚡ โหมดเดโม ${customDur} วินาที (จากคลิปจริง ${Math.floor(l.realDurationSec / 60)}:${String(l.realDurationSec % 60).padStart(2, '0')} นาที)`;
      // Place checkpoint halfway (e.g., at 7s for a 15s demo lesson) so random face check triggers automatically during demo
      const midSec = Math.max(4, Math.floor(customDur / 2));
      l.checkpoints = [midSec];
    });
  }
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const seed = JSON.parse(JSON.stringify(INITIAL_DB));
    applyCustomLessonDurationToCourses(seed);
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Ensure new fields exist on existing db.json
    if (!db.activityLogs) db.activityLogs = [];
    if (!db.proctorSettings) db.proctorSettings = INITIAL_DB.proctorSettings;
    if (typeof db.proctorSettings.enforceFullscreenMode !== 'boolean') {
      db.proctorSettings.enforceFullscreenMode = true;
    }
    if (!db.proctorSettings.demoEdition) {
      db.proctorSettings.demoEdition = process.env.DEMO_SYSTEM_NAME === 'azay-torean' ? 'azay-torean' : 'standard';
    }
    applyCustomLessonDurationToCourses(db);
    return db;
  } catch (e) {
    return JSON.parse(JSON.stringify(INITIAL_DB));
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function saveBase64Image(base64Str, prefix = 'img') {
  if (!base64Str || !base64Str.includes('base64,')) return null;
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

function addEmailNotification(db, toEmail, subject, body, actionLinkText = '', actionTargetPhase = '') {
  const emailObj = {
    id: 'EM-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    to: toEmail,
    subject,
    body,
    actionLinkText,
    actionTargetPhase,
    timestamp: new Date().toISOString()
  };
  db.emails.unshift(emailObj);
  return emailObj;
}

// 1. Health & Latency Ping API (for Device Requirement Check <= 500ms)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, serverTime: Date.now() });
});

// 2. Get all courses & system state
app.get('/api/state', (req, res) => {
  const db = loadDB();
  res.json(db);
});

// 3. Register Candidate (Step 01)
app.post('/api/register', (req, res) => {
  const db = loadDB();
  const {
    idCard, titleTh, firstNameTh, lastNameTh, titleEn, firstNameEn, lastNameEn,
    birthDate, gender, education, company, position, phone, email,
    courseId, batchId, licenseExpiryDate, withholdTax
  } = req.body;

  if (!idCard || idCard.length !== 13) {
    return res.status(400).json({ error: 'กรุณากรอกเลขบัตรประจำตัวประชาชน 13 หลักให้ถูกต้อง' });
  }

  let user = db.users.find(u => u.idCard === idCard);
  const paymentRef = '#' + Math.floor(10000 + Math.random() * 90000);
  const now = new Date().toISOString();

  const userData = {
    id: user ? user.id : 'USR-' + Date.now(),
    idCard,
    titleTh: titleTh || 'นาย',
    firstNameTh: firstNameTh || 'ผู้เข้าอบรม',
    lastNameTh: lastNameTh || 'ทดสอบระบบ',
    titleEn: titleEn || 'Mr.',
    firstNameEn: firstNameEn || 'Candidate',
    lastNameEn: lastNameEn || 'Demo',
    birthDate: birthDate || '01/01/2535',
    gender: gender || 'ชาย',
    education: education || 'ปริญญาตรี',
    company: company || 'บมจ. อลิอันซ์ อยุธยา ประกันชีวิต',
    position: position || 'ตัวแทน/นายหน้าประกันภัย',
    phone: phone || '081-234-5678',
    email: email || 'candidate@allianz.co.th',
    courseId: courseId || 'LB0',
    batchId: batchId || 'B-2026-11A',
    licenseExpiryDate: licenseExpiryDate || '',
    withholdTax: !!withholdTax,
    paymentRef,
    paymentStatus: 'PENDING', // PENDING, PAID
    paymentCreatedAt: Date.now(),
    password: user ? user.password : null,
    pdpaAccepted: false,
    lmsTermsAccepted: false,
    kycStatus: 'NOT_STARTED', // NOT_STARTED, PENDING_ADMIN, APPROVED, REJECTED
    kycData: {
      idCardFullImg: null,
      selfieImg: null,
      idCardFaceImg: null,
      similarityScore: null,
      qualityChecks: null,
      submittedAt: null,
      reviewedBy: null
    },
    preSessionVerified: false,
    preSessionImg: null,
    lessonProgress: {
      L1: { watchedSec: 0, maxCheckpointSec: 0, completed: false },
      L2: { watchedSec: 0, maxCheckpointSec: 0, completed: false },
      L3: { watchedSec: 0, maxCheckpointSec: 0, completed: false }
    },
    evaluationCompleted: false,
    evaluationData: null,
    examAttempts: [], // { attemptNo, score, total, percentage, passed, timestamp }
    courseSubmitted: false,
    certificateId: null,
    certificateIssuedAt: null,
    createdAt: user ? user.createdAt : now,
    updatedAt: now
  };

  if (user) {
    Object.assign(user, userData);
  } else {
    db.users.unshift(userData);
    user = userData;
  }

  saveDB(db);
  res.json({ success: true, user });
});

// 4. Confirm QR Payment (Step 01.7 - 01.8) & Trigger Email Links (Step 03)
app.post('/api/payment/confirm', (req, res) => {
  const db = loadDB();
  const { idCard } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้สมัคร' });

  user.paymentStatus = 'PAID';
  user.updatedAt = new Date().toISOString();

  // Send Email 1: Payment Receipt & Registration Summary
  addEmailNotification(
    db,
    user.email,
    'ยืนยันการชำระเงินและสรุปรายละเอียดการเข้าอบรม | อลิอันซ์ อยุธยา (Allianz Ayudhya)',
    `เรียนคุณ ${user.firstNameTh} ${user.lastNameTh} การสมัครอบรมสำเร็จ (เลขที่การชำระเงิน ${user.paymentRef}) รายละเอียดการอบรมได้ถูกบันทึกเรียบร้อยแล้ว`,
    'ตรวจสอบรายชื่อผู้มีสิทธิ์อบรม',
    'step2'
  );

  // Send Email 2: First-time Password Setup Link (1-2 days before training)
  addEmailNotification(
    db,
    user.email,
    'โปรดตั้งรหัสผ่านใหม่เพื่อเข้าอบรม | อลิอันซ์ อยุธยา (Allianz Ayudhya LMS)',
    `เรียนคุณ ${user.firstNameTh} ${user.lastNameTh} คุณสามารถเข้าสู่ระบบอบรม E-learning (LMS) โดยใช้เลขบัตรประจำตัวประชาชน (${user.idCard}) กรุณาคลิกปุ่มด้านล่างเพื่อกำหนดรหัสผ่านในการเข้าใช้งานครั้งแรก`,
    'คลิก "ตั้งรหัสผ่าน" ครั้งแรก',
    'step3'
  );

  saveDB(db);
  res.json({ success: true, user, emails: db.emails });
});

// 5. Set Password First Time (Step 03)
app.post('/api/auth/set-password', (req, res) => {
  const db = loadDB();
  const { idCard, password } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบเลขบัตรประจำตัวประชาชนนี้ในระบบ' });

  // Validate TII Password Rule: >= 6 letters and >= 1 number
  const letterCount = (password.match(/[a-zA-Zก-ฮ]/g) || []).length;
  const digitCount = (password.match(/[0-9]/g) || []).length;
  if (letterCount < 6 || digitCount < 1) {
    return res.status(400).json({
      error: 'รหัสผ่านจะต้องประกอบด้วย ตัวอักษรอย่างน้อย 6 ตัว และตัวเลขอย่างน้อย 1 ตัวเลข'
    });
  }

  user.password = password;
  user.updatedAt = new Date().toISOString();

  addEmailNotification(
    db,
    user.email,
    'แจ้งลงทะเบียนหลักสูตรและลิงก์ยืนยันตัวตนก่อนการอบรม | อลิอันซ์ อยุธยา (Allianz Ayudhya)',
    `เรียนคุณ ${user.firstNameTh} ${user.lastNameTh} คุณได้รับมอบหมายในการเรียนหลักสูตร ${user.courseId} สามารถแนบเอกสารหลักฐานการยืนยันตัวตน 3 รูปได้ที่ลิงก์นี้`,
    'คลิกเพื่อเข้าสู่ระบบและยืนยันตัวตน (e-KYC)',
    'step4_login'
  );

  saveDB(db);
  res.json({ success: true, user, emails: db.emails });
});

// 6. Login to LMS (Step 04)
app.post('/api/auth/login', (req, res) => {
  const db = loadDB();
  const { idCard, password } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งานนี้ กรุณาลงทะเบียนก่อน' });
  if (user.password && user.password !== password) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  res.json({ success: true, user });
});

// 7. Accept PDPA & LMS Terms (Step 04.3 - 04.5)
app.post('/api/kyc/consent', (req, res) => {
  const db = loadDB();
  const { idCard, pdpaAccepted, lmsTermsAccepted } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  user.pdpaAccepted = !!pdpaAccepted;
  user.lmsTermsAccepted = !!lmsTermsAccepted;
  user.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ success: true, user });
});

// 8. Submit 3-Photo e-KYC Verification (Step 04.1 - 04.3)
app.post('/api/kyc/submit', (req, res) => {
  const db = loadDB();
  const { idCard, idCardFullImg, selfieImg, idCardFaceImg, similarityScore, qualityChecks, forceManualReview } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  const savedIdFull = saveBase64Image(idCardFullImg, `kyc_idfull_${idCard}`);
  const savedSelfie = saveBase64Image(selfieImg, `kyc_selfie_${idCard}`);
  const savedIdFace = saveBase64Image(idCardFaceImg, `kyc_idface_${idCard}`);

  const score = typeof similarityScore === 'number' ? similarityScore : 88.5;
  const isAutoApproved = !forceManualReview && score >= 75;

  user.kycData = {
    idCardFullImg: savedIdFull || idCardFullImg,
    selfieImg: savedSelfie || selfieImg,
    idCardFaceImg: savedIdFace || idCardFaceImg,
    similarityScore: score,
    qualityChecks: qualityChecks || { brightness: 'PASS', glareFree: 'PASS', faceDetected: 'PASS' },
    submittedAt: new Date().toISOString(),
    approvedAt: isAutoApproved ? new Date().toISOString() : null,
    approvalMethod: isAutoApproved ? 'AI_AUTO' : null,
    reviewedBy: isAutoApproved ? 'AI Auto-Verifier (ResNet-34 128D Face Recognition)' : null
  };

  user.kycStatus = isAutoApproved ? 'APPROVED' : 'PENDING_ADMIN';
  user.updatedAt = new Date().toISOString();

  db.proctoringLogs.unshift({
    id: 'LOG-' + Date.now(),
    idCard: user.idCard,
    studentName: `${user.firstNameTh} ${user.lastNameTh}`,
    eventType: isAutoApproved ? 'KYC_AUTO_APPROVED' : 'KYC_PENDING_MANUAL_REVIEW',
    similarityScore: score,
    snapshotUrl: savedSelfie,
    details: isAutoApproved
      ? `ยืนยันตัวตน 3 รูปผ่านเกณฑ์ AI (ความเหมือน ${score.toFixed(1)}%)`
      : `ส่งคำขอให้ผู้ดูแลระบบตรวจสอบและอนุมัติการยืนยันตัวตน (ความเหมือน ${score.toFixed(1)}%)`,
    timestamp: new Date().toISOString()
  });

  if (isAutoApproved) {
    addEmailNotification(
      db,
      user.email,
      'แจ้งผลการยืนยันตัวตนสำเร็จ | อลิอันซ์ อยุธยา (Allianz Ayudhya)',
      `เรียนคุณ ${user.firstNameTh} ${user.lastNameTh} คุณยืนยันตัวตนหลักสูตร ${user.courseId} เรียบร้อยแล้ว สามารถกด "เริ่มเรียน" ได้ทันที`,
      'เข้าสู่ห้องเรียน',
      'step4_classroom'
    );
  }

  saveDB(db);
  res.json({ success: true, user, kycStatus: user.kycStatus });
});

// 9. Admin Approve / Reject e-KYC (Step 04 Page 21)
app.post('/api/admin/kyc-review', (req, res) => {
  const db = loadDB();
  const { idCard, decision, note } = req.body; // decision: 'APPROVED' | 'REJECTED'
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  user.kycStatus = decision;
  user.kycData.approvedAt = decision === 'APPROVED' ? new Date().toISOString() : null;
  user.kycData.approvalMethod = decision === 'APPROVED' ? 'ADMIN_MANUAL' : 'ADMIN_REJECTED';
  user.kycData.reviewedBy = `Admin (${note || 'Manual Verification'})`;
  user.updatedAt = new Date().toISOString();

  db.proctoringLogs.unshift({
    id: 'LOG-' + Date.now(),
    idCard: user.idCard,
    studentName: `${user.firstNameTh} ${user.lastNameTh}`,
    eventType: `ADMIN_KYC_${decision}`,
    similarityScore: user.kycData.similarityScore,
    snapshotUrl: user.kycData.selfieImg,
    details: `ผู้ดูแลระบบทำการ ${decision === 'APPROVED' ? 'อนุมัติ' : 'ไม่อนุมัติ'} การยืนยันตัวตน (${note || '-'})`,
    timestamp: new Date().toISOString()
  });

  if (decision === 'APPROVED') {
    addEmailNotification(
      db,
      user.email,
      'แจ้งผลการยืนยันตัวตน (อนุมัติโดยผู้ดูแลระบบ) | อลิอันซ์ อยุธยา (Allianz Ayudhya)',
      `เรียนคุณ ${user.firstNameTh} ${user.lastNameTh} ผู้ดูแลระบบได้อนุมัติการยืนยันตัวตนของคุณเรียบร้อยแล้ว สามารถเข้าเรียนได้ทันที`,
      'เริ่มเรียน',
      'step4_classroom'
    );
  }

  saveDB(db);
  res.json({ success: true, user });
});

// 10. Pre-Session & Random Proctoring Face Check (Step 04 Page 23 & 25)
app.post('/api/proctoring/verify-face', (req, res) => {
  const db = loadDB();
  const { idCard, checkType, snapshotBase64, similarityScore, lessonId, currentVideoSec } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  const savedSnap = saveBase64Image(snapshotBase64, `proctor_${checkType}_${idCard}`);
  const score = typeof similarityScore === 'number' ? similarityScore : 91.2;

  if (checkType === 'PRE_SESSION') {
    user.preSessionVerified = true;
    user.preSessionImg = savedSnap || snapshotBase64;
  } else if (checkType === 'RANDOM_CHECKPOINT' && lessonId) {
    if (!user.lessonProgress[lessonId]) {
      user.lessonProgress[lessonId] = { watchedSec: 0, maxCheckpointSec: 0, completed: false };
    }
    user.lessonProgress[lessonId].maxCheckpointSec = Math.max(
      user.lessonProgress[lessonId].maxCheckpointSec,
      Math.floor(currentVideoSec || 0)
    );
  }

  user.updatedAt = new Date().toISOString();

  const logEntry = {
    id: 'LOG-' + Date.now(),
    idCard: user.idCard,
    studentName: `${user.firstNameTh} ${user.lastNameTh}`,
    eventType: checkType, // PRE_SESSION, RANDOM_CHECKPOINT, TIMEOUT_2MIN_KICK, INACTIVE_15MIN_KICK, TAB_SWITCH_WARNING
    similarityScore: score,
    snapshotUrl: savedSnap,
    details:
      checkType === 'PRE_SESSION'
        ? `ยืนยันใบหน้าก่อนเริ่มอบรมสำเร็จ (ความเหมือน ${score.toFixed(1)}%)`
        : checkType === 'RANDOM_CHECKPOINT'
        ? `ผ่านจุดสุ่มตรวจใบหน้าระหว่างเรียน บทที่ ${lessonId} วินาทีที่ ${Math.floor(currentVideoSec || 0)} (บันทึก Checkpoint)`
        : `เหตุการณ์ควบคุมการสอบ: ${checkType}`,
    timestamp: new Date().toISOString()
  };

  db.proctoringLogs.unshift(logEntry);
  saveDB(db);
  res.json({ success: true, user, logEntry });
});

// 11. Log Proctoring Violation / Kick & Rollback to Checkpoint
app.post('/api/proctoring/violation', (req, res) => {
  const db = loadDB();
  const { idCard, reason, lessonId, attemptedSec } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  const progress = user.lessonProgress[lessonId] || { watchedSec: 0, maxCheckpointSec: 0, completed: false };
  const rollbackSec = progress.completed ? progress.watchedSec : progress.maxCheckpointSec;

  // Reset pre-session verification if kicked out
  if (reason === 'TIMEOUT_2MIN_KICK' || reason === 'INACTIVE_15MIN_KICK') {
    user.preSessionVerified = false;
    progress.watchedSec = rollbackSec;
    user.lessonProgress[lessonId] = progress;
  }

  const logEntry = {
    id: 'LOG-' + Date.now(),
    idCard: user.idCard,
    studentName: `${user.firstNameTh} ${user.lastNameTh}`,
    eventType: reason,
    similarityScore: null,
    snapshotUrl: null,
    details:
      reason === 'TIMEOUT_2MIN_KICK'
        ? `ไม่ยืนยันตัวตนภายใน 2 นาที: นำออกจากระบบอัตโนมัติ และย้อนเวลาบทที่ ${lessonId} กลับไปที่ Checkpoint (${rollbackSec}s)`
        : reason === 'INACTIVE_15MIN_KICK'
        ? `ไม่มีการตอบสนองเกิน 15 นาที: นำออกจากระบบอัตโนมัติ และย้อนเวลาบทที่ ${lessonId} กลับไปที่ Checkpoint (${rollbackSec}s)`
        : `แจ้งเตือนการควบคุมวิดีโอ/หน้าจอ (${reason}) ที่วินาที ${Math.floor(attemptedSec || 0)}`,
    timestamp: new Date().toISOString()
  };

  db.proctoringLogs.unshift(logEntry);
  saveDB(db);
  res.json({ success: true, user, rollbackSec, logEntry });
});

// 12. Update Lesson Progress / Complete Lesson
app.post('/api/classroom/progress', (req, res) => {
  const db = loadDB();
  const { idCard, lessonId, watchedSec, completed } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  if (!user.lessonProgress[lessonId]) {
    user.lessonProgress[lessonId] = { watchedSec: 0, maxCheckpointSec: 0, completed: false };
  }

  const lp = user.lessonProgress[lessonId];
  lp.watchedSec = Math.max(lp.watchedSec, Math.floor(watchedSec || 0));
  if (completed) {
    lp.completed = true;
    lp.maxCheckpointSec = lp.watchedSec;
  }

  user.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ success: true, user });
});

// 13. Submit Course Evaluation Survey (Step 04 Page 27)
app.post('/api/classroom/evaluation', (req, res) => {
  const db = loadDB();
  const { idCard, ratings } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  user.evaluationCompleted = true;
  user.evaluationData = ratings || { q1: 5, q2: 5, q3: 5 };
  user.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ success: true, user });
});

// 14. Submit Post-Test Exam (Step 05 Page 28-29: >= 60% to pass, max 5 attempts)
app.post('/api/exam/submit', (req, res) => {
  const db = loadDB();
  const { idCard, answers, questionOrder } = req.body; // answers: map of { Q1: selectedOriginalChoiceIndex } or array
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  const settings = db.proctorSettings || INITIAL_DB.proctorSettings;
  const maxAttempts = settings.maxExamAttempts || 5;
  const passPct = settings.examPassPercentage || 60;

  if (user.courseSubmitted) {
    return res.status(400).json({ error: 'คุณได้กดส่งผลการอบรมไปแล้ว ไม่สามารถทำแบบทดสอบซ้ำได้อีก' });
  }

  if (user.examAttempts.length >= maxAttempts && !user.examAttempts.some(a => a.passed)) {
    return res.status(400).json({ error: `คุณทำแบบทดสอบครบ ${maxAttempts} ครั้งแล้วและยังไม่ผ่านเกณฑ์ ต้องทำการสมัครใหม่ตามระเบียบ คปภ.` });
  }

  const course = db.courses[0];
  const questions = course.examQuestions;
  let score = 0;
  questions.forEach((q, idx) => {
    if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
      if (answers[q.id] === q.correctIndex) score++;
    } else if (Array.isArray(answers)) {
      if (answers[idx] === q.correctIndex) score++;
    }
  });

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);
  const passed = percentage >= passPct;

  const attemptObj = {
    attemptNo: user.examAttempts.length + 1,
    score,
    total,
    percentage,
    passed,
    timestamp: new Date().toISOString()
  };

  user.examAttempts.push(attemptObj);
  user.updatedAt = new Date().toISOString();

  db.proctoringLogs.unshift({
    id: 'LOG-' + Date.now(),
    idCard: user.idCard,
    studentName: `${user.firstNameTh} ${user.lastNameTh}`,
    eventType: passed ? 'EXAM_PASSED' : 'EXAM_FAILED',
    similarityScore: null,
    snapshotUrl: null,
    details: `ทำแบบทดสอบหลังเรียน ครั้งที่ ${attemptObj.attemptNo}/5 ได้คะแนน ${score}/${total} (${percentage}%) - ${passed ? 'ผ่านเกณฑ์ (>=60%)' : 'ไม่ผ่านเกณฑ์'}`,
    timestamp: new Date().toISOString()
  });

  saveDB(db);
  res.json({ success: true, attempt: attemptObj, user });
});

// 15. Finalize & Submit Course Result -> Issue Certificate (Step 05 Page 29 & Step 06 Page 30)
app.post('/api/exam/finalize', (req, res) => {
  const db = loadDB();
  const { idCard } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });

  const hasPassed = user.examAttempts.some(a => a.passed);
  if (!hasPassed) {
    return res.status(400).json({ error: 'ยังไม่มีผลสอบที่ผ่านเกณฑ์ร้อยละ 60' });
  }

  user.courseSubmitted = true;
  user.certificateId = `AZAY-CERT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  user.certificateIssuedAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();

  addEmailNotification(
    db,
    user.email,
    'ใบรับรองผ่านการอบรมออนไลน์ E-LEARNING (LMS) | อลิอันซ์ อยุธยา (Allianz Ayudhya)',
    `เรียนคุณ ${user.firstNameTh} ${user.lastNameTh} ข้อมูลการเข้าอบรมของคุณผ่านเกณฑ์ที่กำหนดทุกประการ รหัสใบรับรอง: ${user.certificateId} สามารถยื่นเอกสารผ่านระบบ e-Licensing ของสำนักงาน คปภ. ได้หลังจากวันจบรอบอบรม 2 วันเป็นต้นไป และต้องดำเนินการก่อนวันที่ใบอนุญาตหมดอายุ`,
    'คลิกที่นี่เพื่อดาวน์โหลดใบประกาศนียบัตร',
    'step6'
  );

  saveDB(db);
  res.json({ success: true, user });
});

// 16. Demo Reset / Quick Jump Helper for testing
app.post('/api/demo/reset-user', (req, res) => {
  const db = loadDB();
  const { idCard } = req.body;
  db.users = db.users.filter(u => u.idCard !== idCard);
  saveDB(db);
  res.json({ success: true });
});

// 17. Log Granular User Activity & Anti-Cheat Telemetry (For Admin Decision Making)
app.post('/api/activity/log', (req, res) => {
  const db = loadDB();
  const { idCard, category, action, severity, details, metadata, snapshotBase64 } = req.body;
  const user = db.users.find(u => u.idCard === idCard);
  const studentName = user ? `${user.firstNameTh} ${user.lastNameTh}` : 'ผู้เข้าอบรม (Guest)';

  const savedSnap = snapshotBase64 ? saveBase64Image(snapshotBase64, `act_${action}_${idCard || 'guest'}`) : null;

  const entry = {
    id: 'ACT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    idCard: idCard || 'UNKNOWN',
    studentName,
    category: category || 'GENERAL', // AUTH, KYC, CLASSROOM, ANTI_CHEAT, EXAM, ADMIN
    action: action || 'EVENT',
    severity: severity || 'INFO', // INFO, PASS, WARNING, CRITICAL
    details: details || '',
    metadata: metadata || {},
    snapshotUrl: savedSnap,
    timestamp: new Date().toISOString()
  };

  db.activityLogs.unshift(entry);
  if (db.activityLogs.length > 500) db.activityLogs.length = 500;

  // Also mirror WARNING / CRITICAL anti-cheat events into proctoringLogs
  if (severity === 'WARNING' || severity === 'CRITICAL') {
    db.proctoringLogs.unshift({
      id: 'LOG-' + Date.now(),
      idCard: entry.idCard,
      studentName: entry.studentName,
      eventType: entry.action,
      similarityScore: metadata?.similarityScore || null,
      snapshotUrl: savedSnap,
      details: `[${severity}] ${entry.details}`,
      timestamp: entry.timestamp
    });
  }

  saveDB(db);
  res.json({ success: true, entry });
});

// 18. Update Admin Proctoring Control Settings
app.post('/api/admin/settings', (req, res) => {
  const db = loadDB();
  const newSettings = req.body || {};

  db.proctorSettings = {
    ...db.proctorSettings,
    demoEdition: newSettings.demoEdition || db.proctorSettings.demoEdition || 'standard',
    lessonDurationSec: Number(newSettings.lessonDurationSec) >= 0 ? Number(newSettings.lessonDurationSec) : 0,
    enforceFullscreenMode: typeof newSettings.enforceFullscreenMode === 'boolean' ? newSettings.enforceFullscreenMode : true,
    faceMatchThresholdPct: Number(newSettings.faceMatchThresholdPct) || 72,
    euclideanThreshold: Number(newSettings.euclideanThreshold) || 0.58,
    randomPromptTimeoutSec: Number(newSettings.randomPromptTimeoutSec) || 120,
    inactivityTimeoutSec: Number(newSettings.inactivityTimeoutSec) || 900,
    pauseOnTabSwitch: !!newSettings.pauseOnTabSwitch,
    maxTabSwitchWarnings: Number(newSettings.maxTabSwitchWarnings) || 5,
    detectMultipleFaces: !!newSettings.detectMultipleFaces,
    detectHeadPoseLookingAway: !!newSettings.detectHeadPoseLookingAway,
    blockCopyPasteRightClick: !!newSettings.blockCopyPasteRightClick,
    enableActiveLivenessChallenge: !!newSettings.enableActiveLivenessChallenge,
    enableVoiceNoiseDetection: !!newSettings.enableVoiceNoiseDetection,
    enableMultiMonitorDetection: !!newSettings.enableMultiMonitorDetection,
    enableDynamicWatermark: !!newSettings.enableDynamicWatermark,
    enableQuestionChoiceShuffle: !!newSettings.enableQuestionChoiceShuffle,
    examPassPercentage: Number(newSettings.examPassPercentage) || 60,
    maxExamAttempts: Number(newSettings.maxExamAttempts) || 5
  };

  // Update lesson durations & checkpoints dynamically
  applyCustomLessonDurationToCourses(db);

  db.activityLogs.unshift({
    id: 'ACT-' + Date.now(),
    idCard: 'ADMIN',
    studentName: 'ผู้ดูแลระบบ (Admin)',
    category: 'ADMIN',
    action: 'UPDATE_PROCTOR_SETTINGS',
    severity: 'INFO',
    details: `อัปเดตตั้งค่าควบคุมการสอบ: ความยาวบทเรียน ${db.proctorSettings.lessonDurationSec}s, บังคับเต็มจอ=${db.proctorSettings.enforceFullscreenMode ? 'เปิด' : 'ปิด'}, เกณฑ์ใบหน้า >=${db.proctorSettings.faceMatchThresholdPct}%, หยุดวิดีโอเมื่อสลับแท็บ=${db.proctorSettings.pauseOnTabSwitch ? 'เปิด' : 'ปิด'}`,
    metadata: db.proctorSettings,
    snapshotUrl: null,
    timestamp: new Date().toISOString()
  });

  saveDB(db);
  res.json({ success: true, proctorSettings: db.proctorSettings, courses: db.courses });
});

// 19. Switch between Standard OIC Mode and "azay-torean" Fast Demo Mode (15s Lessons)
app.post('/api/demo-mode/switch', (req, res) => {
  const db = loadDB();
  const mode = (req.body && req.body.mode) === 'azay-torean' ? 'azay-torean' : 'standard';

  if (mode === 'azay-torean') {
    db.proctorSettings = {
      ...db.proctorSettings,
      demoEdition: 'azay-torean',
      lessonDurationSec: 15,
      randomPromptTimeoutSec: 20,
      inactivityTimeoutSec: 30,
      enforceFullscreenMode: true
    };
  } else {
    db.proctorSettings = {
      ...db.proctorSettings,
      demoEdition: 'standard',
      lessonDurationSec: 0,
      randomPromptTimeoutSec: 120,
      inactivityTimeoutSec: 900
    };
  }

  applyCustomLessonDurationToCourses(db);
  db.activityLogs.unshift({
    id: 'ACT-' + Date.now(),
    idCard: 'SYSTEM',
    studentName: 'ระบบสาธิต (Demo Engine)',
    category: 'ADMIN',
    action: mode === 'azay-torean' ? 'ACTIVATE_AZAY_TOREAN_DEMO' : 'ACTIVATE_STANDARD_OIC_MODE',
    severity: 'INFO',
    details:
      mode === 'azay-torean'
        ? 'เปิดใช้งานระบบสาธิตด่วน azay-torean: ปรับเวลาบทเรียนเหลือ 15 วินาที/บท, สุ่มตรวจใบหน้าที่วินาทีที่ 7, Timeout 20 วินาที'
        : 'สลับกลับสู่โหมดเวลาเรียนจริงตามมาตรฐาน คปภ. (ความยาววิดีโอจริง, Timeout 2 นาที / 15 นาที)',
    metadata: db.proctorSettings,
    snapshotUrl: null,
    timestamp: new Date().toISOString()
  });

  saveDB(db);
  res.json({ success: true, mode, proctorSettings: db.proctorSettings, courses: db.courses });
});

// Dedicated URL entry point for the "azay-torean" fast demo system
app.get(['/azay-torean', '/azay-torean/*'], (req, res) => {
  const db = loadDB();
  db.proctorSettings = {
    ...db.proctorSettings,
    demoEdition: 'azay-torean',
    lessonDurationSec: 15,
    randomPromptTimeoutSec: 20,
    inactivityTimeoutSec: 30,
    enforceFullscreenMode: true
  };
  applyCustomLessonDurationToCourses(db);
  saveDB(db);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 20. Clear Activity Logs (Admin utility)
app.post('/api/admin/clear-logs', (req, res) => {
  const db = loadDB();
  db.activityLogs = [];
  db.proctoringLogs = [];
  saveDB(db);
  res.json({ success: true });
});

const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

const RENDER_PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || 'https://azaylms.onrender.com';

// 24/7 Cloud Keep-Alive Self-Pinger (Prevents Render Free Tier from spinning down after 15 mins of inactivity)
function startCloudKeepAliveLoop() {
  const intervalMs = 10 * 60 * 1000; // Every 10 minutes
  console.log(`[Keep-Alive] Activated 24/7 Cloud Keep-Alive pinger for ${RENDER_PUBLIC_URL} (every 10 mins)`);
  setInterval(() => {
    https
      .get(`${RENDER_PUBLIC_URL}/api/ping`, res => {
        console.log(`[Keep-Alive] Ping ${RENDER_PUBLIC_URL}/api/ping -> Status ${res.statusCode}`);
      })
      .on('error', err => {
        console.warn(`[Keep-Alive] Ping warning: ${err.message}`);
      });
  }, intervalMs);
}

let currentCloudflarePublicUrl = null;
let cloudflaredProcess = null;

function getLocalNetworkUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}

// Self-Healing Embedded Cloudflare Tunnel Manager inside server.js
function startEmbeddedCloudflareTunnel(port) {
  const exePath = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(exePath)) {
    console.log('[Tunnel] cloudflared.exe not found, skipping public tunnel.');
    return;
  }

  if (cloudflaredProcess) {
    try { cloudflaredProcess.kill(); } catch (e) {}
  }

  console.log('[Tunnel] Starting embedded Cloudflare HTTPS tunnel...');
  cloudflaredProcess = spawn(exePath, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
    cwd: __dirname,
    windowsHide: true
  });

  const parseTunnelOutput = data => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && match[0]) {
      currentCloudflarePublicUrl = match[0];
      const urlFile = path.join(__dirname, 'CURRENT_PUBLIC_URL.txt');
      fs.writeFileSync(
        urlFile,
        `Allianz Ayudhya LMS & AI Proctoring Public HTTPS URL (Updated: ${new Date().toLocaleString('th-TH')}):\n${currentCloudflarePublicUrl}\n\nLocal URL:\nhttp://localhost:${port}\n`,
        'utf8'
      );
      console.log(`====================================================`);
      console.log(`🌐 PUBLIC HTTPS URL READY: ${currentCloudflarePublicUrl}`);
      console.log(`====================================================`);
    }
  };

  cloudflaredProcess.stdout.on('data', parseTunnelOutput);
  cloudflaredProcess.stderr.on('data', parseTunnelOutput);

  cloudflaredProcess.on('close', code => {
    console.log(`[Tunnel] cloudflared exited with code ${code}. Auto-restarting in 4 seconds...`);
    currentCloudflarePublicUrl = null;
    setTimeout(() => startEmbeddedCloudflareTunnel(port), 4000);
  });
}

app.get('/api/share-info', (req, res) => {
  res.json({
    localUrl: `http://localhost:${PORT}`,
    lanUrls: getLocalNetworkUrls(PORT),
    publicHttpsUrl: currentCloudflarePublicUrl || RENDER_PUBLIC_URL
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const lanUrls = getLocalNetworkUrls(PORT);
  console.log(`====================================================`);
  console.log(`Allianz Ayudhya E-Learning LMS & AI Proctoring Server`);
  console.log(`Permanent Cloud URL: ${RENDER_PUBLIC_URL}`);
  console.log(`Local Access:        http://localhost:${PORT}`);
  if (lanUrls.length > 0) {
    console.log(`Team LAN Share:      ${lanUrls.join(' , ')}`);
  }
  console.log(`====================================================`);
  startCloudKeepAliveLoop();
  if (!process.env.RENDER && !process.env.RAILWAY_ENVIRONMENT && !process.env.FLY_APP_NAME) {
    startEmbeddedCloudflareTunnel(PORT);
  }
});
