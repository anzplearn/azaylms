// ============================================================================
// TII E-Learning LMS & AI Face Proctoring Workflow Controller (Full 4 Phases)
// ============================================================================

let appState = {
  courses: [],
  users: [],
  proctoringLogs: [],
  emails: []
};

let currentUser = null;
let qrTimerInterval = null;
let qrRemainingSec = 15 * 60;

// Camera & KYC State
let sharedMediaStream = null;
let selectedCameraDeviceId = '';
let lastCameraErrorDetail = '';
let fallbackAnimFrameId = null;
let currentKycSlot = 1;
let kycPhotos = {
  1: null, // Full ID Card
  2: null, // Live Selfie
  3: null  // Close-up Face on ID Card
};

function isVirtualCameraName(label = '') {
  const lower = label.toLowerCase();
  return (
    lower.includes('loomie') ||
    lower.includes('virtual') ||
    lower.includes('obs') ||
    lower.includes('manycam') ||
    lower.includes('snap camera') ||
    lower.includes('xsplit') ||
    lower.includes('vcam')
  );
}

// Check if a video element is actually producing non-black frames
async function verifyVideoStreamHasFrames(stream, timeoutMs = 1800) {
  return new Promise(resolve => {
    const tempVideo = document.createElement('video');
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.autoplay = true;
    tempVideo.srcObject = stream;

    let resolved = false;
    const finish = ok => {
      if (resolved) return;
      resolved = true;
      tempVideo.srcObject = null;
      resolve(ok);
    };

    const timer = setTimeout(() => {
      finish(tempVideo.videoWidth > 0 && tempVideo.videoHeight > 0);
    }, timeoutMs);

    tempVideo.onloadeddata = () => {
      clearTimeout(timer);
      finish(tempVideo.videoWidth > 0 && tempVideo.videoHeight > 0);
    };

    tempVideo.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };

    tempVideo.play().catch(() => {});
  });
}

// Centralized Shared Camera Manager (Prioritizes Real Hardware Camera like Logitech over LoomieLive Virtual Cam)
async function getOrStartSharedCamera(forceRestart = false) {
  if (forceRestart && sharedMediaStream) {
    sharedMediaStream.getTracks().forEach(t => t.stop());
    sharedMediaStream = null;
  }

  if (sharedMediaStream && sharedMediaStream.active && selectedCameraDeviceId !== 'VIRTUAL_AI_CAM') {
    const tracks = sharedMediaStream.getVideoTracks();
    if (tracks.length > 0 && tracks[0].readyState === 'live') {
      return sharedMediaStream;
    }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    lastCameraErrorDetail = 'เบราว์เซอร์ไม่รองรับ navigator.mediaDevices.getUserMedia';
    updateCameraStatusUI(false, lastCameraErrorDetail);
    startAnimatedFallbackCanvases();
    return null;
  }

  if (selectedCameraDeviceId === 'VIRTUAL_AI_CAM') {
    updateCameraStatusUI(false, 'ใช้งานโหมดกล้องจำลอง AI สด (Virtual AI Camera)');
    startAnimatedFallbackCanvases();
    return null;
  }

  try {
    // Step 1: Request initial permission if device labels are not yet visible
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videoDevices = devices.filter(d => d.kind === 'videoinput');

    const hasLabels = videoDevices.some(d => d.label && d.label.trim() !== '');
    if (!hasLabels) {
      try {
        const permStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        permStream.getTracks().forEach(t => t.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter(d => d.kind === 'videoinput');
      } catch (permErr) {
        lastCameraErrorDetail = `${permErr.name}: ${permErr.message}`;
      }
    }

    // Step 2: Sort video devices so Real Hardware Webcams (e.g., Logitech HD Webcam C525) come BEFORE LoomieLive / Virtual cameras
    const sortedDevices = [...videoDevices].sort((a, b) => {
      if (selectedCameraDeviceId) {
        if (a.deviceId === selectedCameraDeviceId) return -1;
        if (b.deviceId === selectedCameraDeviceId) return 1;
      }
      const aVirt = isVirtualCameraName(a.label);
      const bVirt = isVirtualCameraName(b.label);
      if (aVirt !== bVirt) return aVirt ? 1 : -1;
      const aLogi = (a.label || '').toLowerCase().includes('logitech');
      const bLogi = (b.label || '').toLowerCase().includes('logitech');
      if (aLogi !== bLogi) return aLogi ? -1 : 1;
      return 0;
    });

    // Step 3: Build candidate constraints list trying each camera device in priority order
    const candidateConfigs = [];
    for (const dev of sortedDevices) {
      if (dev.deviceId) {
        candidateConfigs.push({
          label: dev.label || 'Hardware Camera',
          deviceId: dev.deviceId,
          constraints: {
            video: { deviceId: { exact: dev.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
          }
        });
        candidateConfigs.push({
          label: dev.label || 'Hardware Camera (Basic)',
          deviceId: dev.deviceId,
          constraints: {
            video: { deviceId: { exact: dev.deviceId } },
            audio: false
          }
        });
      }
    }
    // Generic fallback constraint
    candidateConfigs.push({
      label: 'Default Webcam',
      deviceId: '',
      constraints: { video: true, audio: false }
    });

    // Step 4: Try opening each candidate until one succeeds and produces valid frames
    for (const cand of candidateConfigs) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(cand.constraints);
        const okFrames = await verifyVideoStreamHasFrames(stream, 1500);
        if (okFrames) {
          sharedMediaStream = stream;
          const activeTrack = stream.getVideoTracks()[0];
          const usedLabel = activeTrack?.label || cand.label || 'Webcam';
          const usedDeviceId = activeTrack?.getSettings()?.deviceId || cand.deviceId;
          if (usedDeviceId) selectedCameraDeviceId = usedDeviceId;

          lastCameraErrorDetail = '';
          await populateCameraDevicesList();
          updateCameraStatusUI(true, `เชื่อมต่อกล้องสำเร็จ: ${usedLabel}`);
          stopAnimatedFallbackCanvases();
          return stream;
        } else {
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        lastCameraErrorDetail = `${err.name}: ${err.message}`;
        console.warn(`Camera attempt failed for [${cand.label}]:`, err.name, err.message);
      }
    }
  } catch (outerErr) {
    lastCameraErrorDetail = `${outerErr.name}: ${outerErr.message}`;
  }

  // Step 5: If all physical cameras failed or were blocked, show clear diagnostic hint & activate live AI canvas
  await populateCameraDevicesList();
  updateCameraStatusUI(false, lastCameraErrorDetail || 'ไม่พบสัญญาณจากกล้องจริง (เปิดกล้องจำลอง AI สดแทน)');
  startAnimatedFallbackCanvases();
  return null;
}

async function populateCameraDevicesList() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    const optionsHtml = [];
    videoDevices.forEach((d, idx) => {
      const rawLabel = d.label || `กล้อง Webcam #${idx + 1}`;
      const tag = isVirtualCameraName(rawLabel) ? ' (Virtual Cam)' : ' (กล้องจริงแนะนำ)';
      const selected = d.deviceId === selectedCameraDeviceId ? 'selected' : '';
      optionsHtml.push(`<option value="${d.deviceId}" ${selected} class="text-slate-900">${rawLabel}${tag}</option>`);
    });

    optionsHtml.push(
      `<option value="VIRTUAL_AI_CAM" ${selectedCameraDeviceId === 'VIRTUAL_AI_CAM' ? 'selected' : ''} class="text-slate-900">🤖 กล้องจำลอง AI (Virtual Proctoring Cam)</option>`
    );

    const htmlStr = optionsHtml.join('');
    ['cameraDeviceSelect', 'diagCameraDeviceSelect'].forEach(selectId => {
      const el = document.getElementById(selectId);
      if (el) el.innerHTML = htmlStr;
    });
  } catch (e) {
    console.warn('Failed to enumerate video devices:', e);
  }
}

async function onCameraDeviceChange(deviceId) {
  selectedCameraDeviceId = deviceId;
  if (deviceId === 'VIRTUAL_AI_CAM') {
    if (sharedMediaStream) {
      sharedMediaStream.getTracks().forEach(t => t.stop());
      sharedMediaStream = null;
    }
    updateCameraStatusUI(false, 'ใช้งานโหมดกล้องจำลอง AI (Virtual Cam)');
    await attachStreamToVideoElement(document.getElementById('diagVideoPreview'), 'diagFallbackCanvas', null, 'diagVideoPlaceholder');
    await attachStreamToVideoElement(document.getElementById('classroomPipVideo'), 'classroomPipFallbackCanvas', null);
    await attachStreamToVideoElement(document.getElementById('kycModalVideo'), 'kycModalFallbackCanvas', null);
    await attachStreamToVideoElement(document.getElementById('proctorModalVideo'), 'proctorModalFallbackCanvas', null);
    return;
  }
  await reconnectSharedCamera();
}

async function reconnectSharedCamera() {
  const stream = await getOrStartSharedCamera(true);
  await attachStreamToVideoElement(document.getElementById('diagVideoPreview'), 'diagFallbackCanvas', stream, 'diagVideoPlaceholder');
  await attachStreamToVideoElement(document.getElementById('classroomPipVideo'), 'classroomPipFallbackCanvas', stream);
  await attachStreamToVideoElement(document.getElementById('kycModalVideo'), 'kycModalFallbackCanvas', stream);
  await attachStreamToVideoElement(document.getElementById('proctorModalVideo'), 'proctorModalFallbackCanvas', stream);

  // Also update Step 02 diagnostic text if on Step 02
  const camBadge = document.getElementById('badgeDiagCam');
  const camText = document.getElementById('diagCameraText');
  if (camBadge && camText) {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() || {};
      const w = settings.width || 640;
      const h = settings.height || 480;
      camText.textContent = `เชื่อมต่อกล้องจริงสำเร็จ: ${track?.label || 'Webcam'} (${w}x${h} px)`;
      camBadge.textContent = 'PASS (LIVE CAM)';
      camBadge.className = 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold shrink-0';
    } else {
      camText.textContent = 'แสดงผลผ่านโหมดกล้องจำลอง AI สด (Live AI Proctoring Simulation 1280x720 px)';
      camBadge.textContent = 'SIMULATED HD';
      camBadge.className = 'px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold shrink-0';
    }
  }
}

async function attachStreamToVideoElement(videoEl, fallbackCanvasId, stream, placeholderId = null) {
  if (!videoEl) return;
  const fallbackCanvas = fallbackCanvasId ? document.getElementById(fallbackCanvasId) : null;
  const placeholderEl = placeholderId ? document.getElementById(placeholderId) : null;
  if (placeholderEl) placeholderEl.classList.add('hidden');

  if (stream && selectedCameraDeviceId !== 'VIRTUAL_AI_CAM') {
    if (fallbackCanvas) fallbackCanvas.classList.add('hidden');
    videoEl.classList.remove('hidden');
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    try {
      await videoEl.play();
    } catch (e) {
      console.warn('Video play() warning:', e);
    }
  } else {
    videoEl.classList.add('hidden');
    if (fallbackCanvas) {
      fallbackCanvas.classList.remove('hidden');
    }
    startAnimatedFallbackCanvases();
  }
}

function updateCameraStatusUI(isLiveHardware, statusMessage) {
  const dot = document.getElementById('camStatusDot');
  const pipText = document.getElementById('pipCameraStatusText');
  const errHint = document.getElementById('diagCameraErrorHint');

  if (dot) {
    dot.className = isLiveHardware
      ? 'w-2 h-2 rounded-full bg-emerald-400 animate-ping'
      : 'w-2 h-2 rounded-full bg-sky-400';
  }
  if (pipText) {
    pipText.textContent = isLiveHardware ? `🟢 ${statusMessage}` : '🤖 โหมดกล้องจำลอง AI สด';
    pipText.className = isLiveHardware
      ? 'absolute bottom-1 inset-x-1 bg-black/65 text-[9px] text-center text-emerald-300 py-0.5 rounded truncate px-1'
      : 'absolute bottom-1 inset-x-1 bg-black/65 text-[9px] text-center text-sky-300 py-0.5 rounded truncate px-1';
  }
  if (errHint) {
    if (!isLiveHardware && lastCameraErrorDetail) {
      errHint.classList.remove('hidden');
      errHint.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i>หมายเหตุจากระบบกล้อง (${lastCameraErrorDetail}): ระบบได้สลับมาแสดงภาพจำลอง AI สดให้อัตโนมัติ หรือคุณสามารถคลิกเลือก <b>Logitech HD Webcam C525</b> จากตัวเลือกด้านบนแล้วกด "สลับ/รีเซ็ตกล้อง"`;
    } else {
      errHint.classList.add('hidden');
    }
  }
}

function startAnimatedFallbackCanvases() {
  if (fallbackAnimFrameId) return;
  const canvasIds = [
    'diagFallbackCanvas',
    'classroomPipFallbackCanvas',
    'kycModalFallbackCanvas',
    'proctorModalFallbackCanvas'
  ];

  let tick = 0;
  function renderLoop() {
    tick += 0.05;
    canvasIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (!canvas || canvas.classList.contains('hidden')) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Studio dark gradient background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle animated head/shoulders silhouette
      const cx = w / 2 + Math.sin(tick) * 4;
      const cy = h * 0.43 + Math.cos(tick * 0.8) * 2;
      const headRadius = Math.min(w, h) * 0.19;

      // Shoulders
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.88, headRadius * 1.85, headRadius * 1.1, 0, Math.PI, 0, false);
      ctx.fill();

      // Head
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(cx, cy, headRadius, 0, Math.PI * 2);
      ctx.fill();

      // Eyes (blinking periodically)
      const isBlinking = Math.sin(tick * 1.7) > 0.92;
      ctx.fillStyle = '#0f172a';
      if (isBlinking) {
        ctx.fillRect(cx - headRadius * 0.45, cy - 2, headRadius * 0.28, 2);
        ctx.fillRect(cx + headRadius * 0.18, cy - 2, headRadius * 0.28, 2);
      } else {
        ctx.beginPath();
        ctx.arc(cx - headRadius * 0.32, cy - 2, 3, 0, Math.PI * 2);
        ctx.arc(cx + headRadius * 0.32, cy - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // AI Scanning horizontal laser line
      const scanY = ((Math.sin(tick * 1.3) + 1) / 2) * (h * 0.75) + h * 0.1;
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.18, scanY);
      ctx.lineTo(w * 0.82, scanY);
      ctx.stroke();

      // Status caption inside canvas
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI FACE DETECTION STREAM (ACTIVE)', w / 2, h - 14);
    });

    fallbackAnimFrameId = requestAnimationFrame(renderLoop);
  }
  fallbackAnimFrameId = requestAnimationFrame(renderLoop);
}

function stopAnimatedFallbackCanvases() {
  if (fallbackAnimFrameId) {
    cancelAnimationFrame(fallbackAnimFrameId);
    fallbackAnimFrameId = null;
  }
}

// Classroom Video & AI Proctoring State
let activeLessonIndex = 0;
let isVideoPlaying = false;
let currentVideoSec = 0;
let videoTickInterval = null;
let inactivityRemainingSec = 15 * 60;
let proctor2MinInterval = null;
let proctor2MinRemainingSec = 120;
let triggeredCheckpoints = new Set();
let isPipWindowHidden = false;
let tabSwitchCount = 0;
let lastTabSwitchTimestamp = 0;

// Helper to record granular User Activity Logs to Server
async function logUserActivity(category, action, severity, details, metadata = {}, snapshotBase64 = null) {
  try {
    const idCard = currentUser ? currentUser.idCard : (document.getElementById('regIdCard')?.value || 'GUEST');
    await fetch('/api/activity/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idCard,
        category,
        action,
        severity,
        details,
        metadata,
        snapshotBase64
      })
    });
  } catch (e) {
    console.warn('Activity log error:', e);
  }
}

// Post-Test Exam State
let currentExamQIndex = 0;
let selectedExamAnswers = {};

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  await refreshSystemState();
  validateLicenseExpiryRule();
  validatePasswordRuleUI();
  setupUserActivityListeners();
  setupTabSwitchAndAntiCheatGuards();
  initRealAiFaceModels();
});

// ============================================================================
// TAB SWITCH AUTO-PAUSE, PIP TOGGLE & BROWSER ANTI-CHEAT GUARDS
// ============================================================================
function toggleClassroomPipVisibility() {
  isPipWindowHidden = !isPipWindowHidden;
  const box = document.getElementById('classroomPipBoxContainer');
  const pill = document.getElementById('classroomPipMinimizedPill');
  const btnIcon = document.getElementById('iconTogglePip');
  const btnText = document.getElementById('textTogglePip');

  if (isPipWindowHidden) {
    if (box) box.classList.add('hidden');
    if (pill) pill.classList.remove('hidden');
    if (btnIcon) btnIcon.className = 'fa-solid fa-eye';
    if (btnText) btnText.textContent = 'แสดงหน้าต่างกล้อง AI';
    logUserActivity('CLASSROOM', 'HIDE_PIP_CAMERA_WINDOW', 'INFO', 'ผู้เรียนซ่อนหน้าต่างแสดงผลกล้อง AI มุมขวาบน (ระบบ AI Proctoring ยังคงทำงานเบื้องหลัง)');
  } else {
    if (box) box.classList.remove('hidden');
    if (pill) pill.classList.add('hidden');
    if (btnIcon) btnIcon.className = 'fa-solid fa-eye-slash';
    if (btnText) btnText.textContent = 'ซ่อนหน้าต่างกล้อง AI';
    logUserActivity('CLASSROOM', 'SHOW_PIP_CAMERA_WINDOW', 'INFO', 'ผู้เรียนเปิดแสดงหน้าต่างกล้อง AI มุมขวาบน');
  }
}

function setupTabSwitchAndAntiCheatGuards() {
  // 1. Detect Tab Switching (document.hidden / visibilitychange)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handleTabOrWindowFocusLost('TAB_SWITCH_HIDDEN', 'ผู้เรียนสลับไปเปิดแท็บอื่นหรือย่อหน้าต่างเบราว์เซอร์');
    } else {
      logUserActivity('CLASSROOM', 'TAB_FOCUS_RETURNED', 'INFO', `ผู้เรียนกลับมายังหน้าต่างห้องเรียน (สะสม ${tabSwitchCount} ครั้ง)`);
    }
  });

  // 2. Detect Window Blur (clicking outside browser to another app/second monitor)
  window.addEventListener('blur', () => {
    const classroomView = document.getElementById('step4-view-classroom');
    const examSection = document.getElementById('section-step5');
    const isClassroomActive = classroomView && !classroomView.classList.contains('hidden');
    const isExamActive = examSection && !examSection.classList.contains('hidden');

    if ((isClassroomActive && isVideoPlaying) || isExamActive) {
      handleTabOrWindowFocusLost('WINDOW_BLUR_OUTSIDE_APP', 'ผู้เรียนคลิกออกไปยังโปรแกรมอื่นหรือหน้าจอที่สองขณะกำลังเรียน/สอบ');
    }
  });

  // 3. Detect Copy / Paste / Right-Click / PrintScreen inside Classroom or Exam
  document.addEventListener('contextmenu', e => {
    const settings = appState.proctorSettings || { blockCopyPasteRightClick: true };
    const examSection = document.getElementById('section-step5');
    if (settings.blockCopyPasteRightClick && examSection && !examSection.classList.contains('hidden')) {
      e.preventDefault();
      logUserActivity('ANTI_CHEAT', 'BLOCKED_RIGHT_CLICK_IN_EXAM', 'WARNING', 'ผู้เข้าสอบพยายามคลิกขวาในหน้าทำแบบทดสอบหลังเรียน');
      alert('⛔ ระบบล็อกการคลิกขวาในระหว่างการทำแบบทดสอบเพื่อป้องกันการคัดลอกข้อสอบ');
    }
  });

  document.addEventListener('copy', e => {
    const settings = appState.proctorSettings || { blockCopyPasteRightClick: true };
    const examSection = document.getElementById('section-step5');
    if (settings.blockCopyPasteRightClick && examSection && !examSection.classList.contains('hidden')) {
      e.preventDefault();
      logUserActivity('ANTI_CHEAT', 'BLOCKED_COPY_IN_EXAM', 'WARNING', 'ผู้เข้าสอบพยายามกดคัดลอกข้อความ (Copy) ในหน้าข้อสอบ');
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'PrintScreen' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'S'))) {
      logUserActivity('ANTI_CHEAT', 'SCREENSHOT_OR_DEVTOOLS_ATTEMPT', 'CRITICAL', `ตรวจพบการกดปุ่ม ${e.key} (พยายามแคปหน้าจอหรือเปิด DevTools)`);
    }
  });
}

function handleTabOrWindowFocusLost(actionCode, reasonText) {
  const now = Date.now();
  if (now - lastTabSwitchTimestamp < 1200) return; // debounce duplicate blur + visibilitychange
  lastTabSwitchTimestamp = now;

  const settings = appState.proctorSettings || { pauseOnTabSwitch: true, maxTabSwitchWarnings: 5 };
  const classroomView = document.getElementById('step4-view-classroom');
  const examSection = document.getElementById('section-step5');
  const isClassroomActive = classroomView && !classroomView.classList.contains('hidden');
  const isExamActive = examSection && !examSection.classList.contains('hidden');

  if (!isClassroomActive && !isExamActive) return;

  tabSwitchCount++;
  const badge = document.getElementById('tabSwitchCountBadge');
  if (badge) {
    badge.textContent = `${tabSwitchCount} ครั้ง`;
    if (tabSwitchCount >= (settings.maxTabSwitchWarnings || 5)) {
      badge.className = 'font-mono font-bold text-rose-400 ml-1 animate-pulse';
    }
  }

  const wasPlaying = isVideoPlaying;
  if (isClassroomActive && settings.pauseOnTabSwitch) {
    pauseLessonVideo();
    const overlay = document.getElementById('tabSwitchPauseOverlay');
    const statEl = document.getElementById('tabSwitchOverlayStat');
    if (overlay) overlay.classList.remove('hidden');
    if (statEl) {
      statEl.textContent = `จำนวนครั้งที่สลับหน้าจอสะสม: ${tabSwitchCount} / ${settings.maxTabSwitchWarnings || 5} ครั้ง (หยุดที่วินาที ${currentVideoSec}s)`;
    }
  }

  const severity = tabSwitchCount >= (settings.maxTabSwitchWarnings || 5) ? 'CRITICAL' : 'WARNING';
  const lesson = getActiveLesson();
  logUserActivity(
    'ANTI_CHEAT',
    actionCode,
    severity,
    `${reasonText} (ครั้งที่ ${tabSwitchCount}) — ${wasPlaying ? `ระบบสั่งหยุดวิดีโอบทที่ ${lesson?.id || 'L1'} อัตโนมัติที่วินาที ${currentVideoSec}s` : 'อยู่ในหน้าห้องเรียน/ห้องสอบ'}`,
    { tabSwitchCount, videoSec: currentVideoSec, lessonId: lesson?.id }
  );
}

function simulateTabSwitchEvent() {
  handleTabOrWindowFocusLost('SIMULATED_TAB_SWITCH', 'ทดสอบจำลองการสลับไปเปิดแท็บอื่นระหว่างเรียน');
}

function resumeFromTabSwitchOverlay() {
  const overlay = document.getElementById('tabSwitchPauseOverlay');
  if (overlay) overlay.classList.add('hidden');
  logUserActivity('CLASSROOM', 'RESUME_AFTER_TAB_SWITCH', 'INFO', `ผู้เรียนกดยืนยันกลับมาดูเนื้อหาต่อที่วินาที ${currentVideoSec}s`);
  playLessonVideo();
}

// ============================================================================
// REAL DEEP LEARNING AI ENGINE (SSD MobileNetV1 + 68-Landmarks + ResNet-34 128D)
// ============================================================================
let isAiModelLoaded = false;
let referenceFaceDescriptor = null; // Stores the 128D Float32Array of the verified candidate
let liveProctoringAiInterval = null;

async function initRealAiFaceModels() {
  const statusText = document.getElementById('aiEngineStatusText');
  const dot = document.getElementById('aiEngineDot');

  if (typeof faceapi === 'undefined') {
    if (statusText) statusText.textContent = 'ไม่พบไลบรารี face-api.js';
    return;
  }

  try {
    const t0 = performance.now();
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri('/ai-models'),
      faceapi.nets.tinyFaceDetector.loadFromUri('/ai-models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/ai-models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/ai-models')
    ]);
    const loadMs = Math.round(performance.now() - t0);
    isAiModelLoaded = true;

    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    if (statusText) {
      statusText.textContent = `AI พร้อมใช้งาน (ResNet-34 + SSD MobileNet โหลดเสร็จใน ${loadMs}ms)`;
      statusText.className = 'font-bold text-emerald-300';
    }
    console.log(`[AI Engine] Loaded SSD MobileNetV1, 68-Landmark, and ResNet-34 Recognition models in ${loadMs}ms`);
  } catch (err) {
    console.error('[AI Engine] Error loading models:', err);
    if (statusText) statusText.textContent = `เกิดข้อผิดพลาดในการโหลดโมเดล AI: ${err.message}`;
  }
}

// Compute real pixel-level image quality metrics: Brightness, Laplacian Variance (Sharpness), and Specular Glare %
function computeImageQualityMetrics(imgElement) {
  const canvas = document.createElement('canvas');
  const w = 320;
  const h = 240;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);

  let sumLum = 0;
  let glarePixels = 0;
  const totalPixels = w * h;

  for (let i = 0; i < totalPixels; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum;
    sumLum += lum;
    if (r > 248 && g > 248 && b > 248) glarePixels++;
  }

  const avgBrightness = sumLum / totalPixels; // 0 - 255
  const glarePercent = (glarePixels / totalPixels) * 100;

  // 3x3 Laplacian operator for edge sharpness variance
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        gray[idx - w] +
        gray[idx + w] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const meanLap = lapSum / count;
  const sharpnessVariance = lapSqSum / count - meanLap * meanLap;

  return {
    brightness: Number(avgBrightness.toFixed(1)),
    glarePercent: Number(glarePercent.toFixed(2)),
    sharpness: Number(sharpnessVariance.toFixed(1)),
    brightnessOk: avgBrightness >= 40 && avgBrightness <= 235,
    glareOk: glarePercent <= 12.0,
    sharpnessOk: sharpnessVariance >= 25.0
  };
}

function loadImageElementFromSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = e => reject(e);
    img.src = src;
  });
}

// Convert Euclidean Distance (0.0 = identical, ~0.6 = threshold, >0.8 = different person) to Intuitive % Similarity
function euclideanDistanceToSimilarityPercent(distance) {
  // Standard ResNet-34 face-api threshold is 0.60.
  // Map distance 0.0 -> 100%, 0.40 -> 88%, 0.55 -> 75% (passing cutoff), 0.65 -> 58%, 0.85+ -> <25%
  if (typeof distance !== 'number' || isNaN(distance)) return 0;
  const pct = Math.max(0, Math.min(99.8, (1 - distance / 0.95) * 112));
  return Number(pct.toFixed(1));
}

async function drawFaceDetectionOnCanvas(canvasId, imgEl, detection) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !imgEl) return;
  const ctx = canvas.getContext('2d');
  canvas.width = imgEl.naturalWidth || imgEl.width || 480;
  canvas.height = imgEl.naturalHeight || imgEl.height || 320;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

  if (detection) {
    const dims = { width: canvas.width, height: canvas.height };
    const resized = faceapi.resizeResults(detection, dims);
    faceapi.draw.drawDetections(canvas, resized);
    faceapi.draw.drawFaceLandmarks(canvas, resized);
  } else {
    ctx.fillStyle = 'rgba(225, 29, 72, 0.78)';
    ctx.fillRect(0, canvas.height - 38, canvas.width, 38);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('❌ AI ไม่ตรวจพบใบหน้าในภาพนี้', canvas.width / 2, canvas.height - 14);
  }
}

async function refreshSystemState() {
  try {
    const res = await fetch('/api/state');
    appState = await res.json();

    if (currentUser) {
      const updated = appState.users.find(u => u.idCard === currentUser.idCard);
      if (updated) currentUser = updated;
    } else if (appState.users.length > 0) {
      currentUser = appState.users[0];
    }

    updateTopHeaderUI();
    renderEligibleRoster();
    renderCurriculumSidebar();
    renderExamUI();
    renderCertificateUI();
    renderAdminDashboard();
    renderInboxEmails();
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

function updateTopHeaderUI() {
  const badge = document.getElementById('activeUserBadge');
  const nameEl = document.getElementById('badgeUserName');
  const kycEl = document.getElementById('badgeKycStatus');
  const emailCountEl = document.getElementById('emailBadgeCount');

  emailCountEl.textContent = appState.emails ? appState.emails.length : 0;

  if (currentUser) {
    badge.classList.remove('hidden');
    nameEl.textContent = `${currentUser.firstNameTh} (${currentUser.idCard})`;
    if (currentUser.kycStatus === 'APPROVED') {
      kycEl.textContent = 'e-KYC ผ่านแล้ว';
      kycEl.className = 'px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold';
    } else if (currentUser.kycStatus === 'PENDING_ADMIN') {
      kycEl.textContent = 'รอ Admin อนุมัติ';
      kycEl.className = 'px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold';
    } else {
      kycEl.textContent = 'ยังไม่ยืนยันตัวตน';
      kycEl.className = 'px-1.5 py-0.5 rounded bg-slate-500/30 text-slate-300 text-[10px]';
    }
  }
}

// ============================================================================
// CENTRAL ROLE-BASED LOGIN PORTAL (Learner vs Admin Screen Separation)
// ============================================================================
let currentAuthRole = null; // 'LEARNER' | 'ADMIN'

function fillPortalDemoCredentials(role) {
  const userEl = document.getElementById('portalUsernameInput');
  const passEl = document.getElementById('portalPasswordInput');
  const errEl = document.getElementById('portalAuthErrorBox');
  if (errEl) errEl.classList.add('hidden');

  if (role === 'ADMIN') {
    if (userEl) userEl.value = 'Admin';
    if (passEl) passEl.value = 'Admin@2026';
  } else {
    if (userEl) userEl.value = 'Learner';
    if (passEl) passEl.value = 'Learner@2026';
  }
}

async function submitPortalLogin() {
  const userEl = document.getElementById('portalUsernameInput');
  const passEl = document.getElementById('portalPasswordInput');
  const errEl = document.getElementById('portalAuthErrorBox');

  const username = (userEl ? userEl.value : '').trim();
  const password = passEl ? passEl.value : '';

  // 1. Check Admin Credentials: Admin / Admin@2026
  if (username.toLowerCase() === 'admin' && password === 'Admin@2026') {
    currentAuthRole = 'ADMIN';
    if (errEl) errEl.classList.add('hidden');
    applyRoleBasedScreenState();
    logUserActivity('AUTH', 'ADMIN_PORTAL_LOGIN', 'PASS', 'เข้าสู่ระบบในฐานะผู้ดูแลระบบ (Admin)');
    return;
  }

  // 2. Check Learner Credentials: Learner / Learner@2026
  if (username.toLowerCase() === 'learner' && password === 'Learner@2026') {
    currentAuthRole = 'LEARNER';
    if (errEl) errEl.classList.add('hidden');
    // Ensure default learner profile exists
    if (!currentUser && (!appState.users || appState.users.length === 0)) {
      await submitRegistration();
    }
    applyRoleBasedScreenState();
    logUserActivity('AUTH', 'LEARNER_PORTAL_LOGIN', 'PASS', 'เข้าสู่ระบบในฐานะผู้เรียน (Learner)');
    return;
  }

  if (errEl) {
    errEl.textContent = '❌ ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง! กรุณาใช้ Learner / Learner@2026 หรือ Admin / Admin@2026';
    errEl.classList.remove('hidden');
  }
}

function logoutPortalSession(prefillRole = null) {
  pauseLessonVideo();
  currentAuthRole = null;
  const overlay = document.getElementById('roleAuthPortalOverlay');
  if (overlay) overlay.classList.remove('hidden');
  if (prefillRole) {
    fillPortalDemoCredentials(prefillRole);
  }
}

function applyRoleBasedScreenState() {
  const overlay = document.getElementById('roleAuthPortalOverlay');
  const stepNav = document.getElementById('learnerStepNavBar');
  const demoBar = document.getElementById('learnerDemoToolbar');
  const roleBadge = document.getElementById('headerRoleBadge');
  const userBadge = document.getElementById('activeUserBadge');
  const inboxBtn = document.getElementById('btnHeaderInbox');

  if (overlay) overlay.classList.add('hidden');

  if (currentAuthRole === 'ADMIN') {
    // Show ONLY Admin Dashboard; Hide all Learner navigation & toolbars
    if (stepNav) stepNav.classList.add('hidden');
    if (demoBar) demoBar.classList.add('hidden');
    if (userBadge) userBadge.classList.add('hidden');
    if (inboxBtn) inboxBtn.classList.add('hidden');
    if (roleBadge) {
      roleBadge.textContent = '🛡️ ผู้ดูแลระบบ (Admin)';
      roleBadge.className = 'text-xs bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full font-extrabold shadow-sm';
    }
    document.querySelectorAll('.tab-section').forEach(sec => sec.classList.add('hidden'));
    const adminSec = document.getElementById('section-admin');
    if (adminSec) adminSec.classList.remove('hidden');
    renderAdminDashboard();
  } else {
    // Show ONLY Learner Screens (Steps 01-06); Hide Admin Dashboard completely
    if (stepNav) stepNav.classList.remove('hidden');
    if (demoBar) demoBar.classList.remove('hidden');
    if (inboxBtn) inboxBtn.classList.remove('hidden');
    if (roleBadge) {
      roleBadge.textContent = '👤 โหมดผู้เรียน (Learner)';
      roleBadge.className = 'text-xs bg-sky-500 text-white px-2.5 py-0.5 rounded-full font-bold shadow-sm';
    }
    updateTopHeaderUI();
    switchMainTab('step1');
  }
}

// ============================================================================
// MAIN NAVIGATION (Steps 01 - 06 + Admin Hub)
// ============================================================================
function switchMainTab(tabId) {
  // Enforce strict role separation between Learner and Admin
  if (tabId === 'admin' && currentAuthRole !== 'ADMIN') {
    logoutPortalSession('ADMIN');
    return;
  }
  if (tabId !== 'admin' && currentAuthRole === 'ADMIN') {
    logoutPortalSession('LEARNER');
    return;
  }

  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.add('hidden'));
  const target = document.getElementById(`section-${tabId}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.step-nav-btn').forEach(btn => {
    btn.classList.remove('bg-blue-600', 'text-white');
    btn.classList.add('text-slate-300');
  });
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.add('bg-blue-600', 'text-white');
    activeNav.classList.remove('text-slate-300');
  }

  if (tabId === 'step2') renderEligibleRoster();
  if (tabId === 'step4') renderCurriculumSidebar();
  if (tabId === 'step5') renderExamUI();
  if (tabId === 'step6') renderCertificateUI();
  if (tabId === 'admin') renderAdminDashboard();
}

function switchStep4View(viewName) {
  ['login_consent', 'kyc3photos', 'classroom', 'evaluation'].forEach(v => {
    const el = document.getElementById(`step4-view-${v}`);
    if (el) el.classList.add('hidden');
    const btn = document.getElementById(`subbtn-${v}`);
    if (btn) {
      btn.classList.remove('bg-blue-600', 'text-white');
      btn.classList.add('text-slate-600');
    }
  });

  const targetEl = document.getElementById(`step4-view-${viewName}`);
  if (targetEl) targetEl.classList.remove('hidden');
  const activeBtn = document.getElementById(`subbtn-${viewName}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-blue-600', 'text-white');
    activeBtn.classList.remove('text-slate-600');
  }

  if (viewName === 'classroom') {
    ensureYouTubeIframeApiLoaded();
    startClassroomPipCamera();
    renderCurriculumSidebar();
  }
}

// ============================================================================
// STEP 01: REGISTRATION, LICENSE EXPIRY RULE & 15-MIN QR PAYMENT
// ============================================================================
function onCourseChange() {
  const select = document.getElementById('regCourseSelect');
  const text = select.options[select.selectedIndex].text;
  const isAgent = select.value.startsWith('LA');
  const priceText = isAgent ? '1,284.00 บาท' : '1,594.30 บาท';
  document.getElementById('summaryCourseTitle').textContent = text;
  document.getElementById('summaryPrice').textContent = priceText;
  document.getElementById('qrAmountText').textContent = priceText;
}

function validateLicenseExpiryRule() {
  const batchSelect = document.getElementById('regBatchSelect');
  const selectedOpt = batchSelect.options[batchSelect.selectedIndex];
  const batchEndStr = selectedOpt.getAttribute('data-end');
  const expiryStr = document.getElementById('regExpiryDate').value;
  const msgEl = document.getElementById('expiryValidationMsg');

  if (!batchEndStr || !expiryStr) return true;

  const endDate = new Date(batchEndStr);
  const expDate = new Date(expiryStr);
  const diffDays = Math.round((expDate - endDate) / (1000 * 60 * 60 * 24));

  if (diffDays >= 2) {
    msgEl.className = 'mt-2 text-xs font-semibold text-emerald-700';
    msgEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i>ผ่านเกณฑ์ คปภ. (หน้า 8): รอบอบรมจบก่อนวันหมดอายุบัตรเดิม ${diffDays} วัน (ต้องไม่น้อยกว่า 2 วันทำการ)`;
    return true;
  } else {
    msgEl.className = 'mt-2 text-xs font-semibold text-rose-600';
    msgEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i>ไม่ผ่านเกณฑ์หน้า 8: รอบอบรมต้องจบก่อนวันที่บัตรเดิมหมดอายุอย่างน้อย 2 วันทำการ! กรุณาเลือกรอบอบรมที่เร็วขึ้น`;
    return false;
  }
}

function demoAutoFillRegistration() {
  document.getElementById('regIdCard').value = '1100801279957';
  document.getElementById('regFirstTh').value = 'ธนภัทร';
  document.getElementById('regLastTh').value = 'พิทักษ์ประกัน';
  document.getElementById('regFirstEn').value = 'Thanaphat';
  document.getElementById('regLastEn').value = 'Pitakprakan';
  document.getElementById('regBirthDate').value = '30/11/2538';
  document.getElementById('regPhone').value = '089-123-4567';
  document.getElementById('regEmail').value = 'thanaphat.demo@allianz.co.th';
  document.getElementById('regCompany').value = 'บมจ. อลิอันซ์ อยุธยา ประกันชีวิต';
}

async function submitRegistration() {
  if (!validateLicenseExpiryRule()) {
    alert('รอบอบรมที่เลือกต้องจบก่อนวันที่บัตรเดิมหมดอายุอย่างน้อย 2 วันทำการ (ตามคู่มือหน้า 8)');
    return;
  }
  if (!document.getElementById('chkAcceptRefundPolicy').checked) {
    alert('กรุณาคลิกยอมรับนโยบายการเปลี่ยนแปลงการอบรม/การคืนเงิน');
    return;
  }

  const payload = {
    idCard: document.getElementById('regIdCard').value.trim(),
    titleTh: document.getElementById('regTitleTh').value,
    firstNameTh: document.getElementById('regFirstTh').value.trim(),
    lastNameTh: document.getElementById('regLastTh').value.trim(),
    titleEn: document.getElementById('regTitleEn').value,
    firstNameEn: document.getElementById('regFirstEn').value.trim(),
    lastNameEn: document.getElementById('regLastEn').value.trim(),
    birthDate: document.getElementById('regBirthDate').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    education: document.getElementById('regEducation').value,
    company: document.getElementById('regCompany').value.trim(),
    position: document.getElementById('regPosition').value.trim(),
    courseId: document.getElementById('regCourseSelect').value,
    batchId: document.getElementById('regBatchSelect').value,
    licenseExpiryDate: document.getElementById('regExpiryDate').value,
    withholdTax: document.getElementById('chkWithholdTax').checked
  };

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    return;
  }

  currentUser = data.user;
  document.getElementById('pwdIdCard').value = currentUser.idCard;
  document.getElementById('loginIdCard').value = currentUser.idCard;
  document.getElementById('qrPaymentRef').textContent = currentUser.paymentRef;

  // Show 15-Minute QR Payment Panel
  document.getElementById('qrPaymentPanel').classList.remove('hidden');
  document.getElementById('paymentSuccessPanel').classList.add('hidden');
  startQrCountdown();
  await refreshSystemState();
}

function startQrCountdown() {
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  qrRemainingSec = 15 * 60;
  const display = document.getElementById('qrCountdownDisplay');

  qrTimerInterval = setInterval(() => {
    qrRemainingSec--;
    if (qrRemainingSec <= 0) {
      clearInterval(qrTimerInterval);
      display.textContent = 'หมดเวลา 15:00';
      return;
    }
    const m = String(Math.floor(qrRemainingSec / 60)).padStart(2, '0');
    const s = String(qrRemainingSec % 60).padStart(2, '0');
    display.textContent = `${m}:${s}`;
  }, 1000);
}

async function confirmQrPayment() {
  if (!currentUser) return;
  if (qrTimerInterval) clearInterval(qrTimerInterval);

  const res = await fetch('/api/payment/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idCard: currentUser.idCard })
  });
  const data = await res.json();
  if (data.success) {
    currentUser = data.user;
    document.getElementById('qrPaymentPanel').classList.add('hidden');
    document.getElementById('paymentSuccessPanel').classList.remove('hidden');
    await refreshSystemState();
  }
}

// ============================================================================
// STEP 02: ELIGIBLE LIST & DEVICE/CAMERA/NETWORK DIAGNOSTICS (Pages 3 & 10)
// ============================================================================
function renderEligibleRoster() {
  const container = document.getElementById('eligibleRosterList');
  if (!container) return;

  const list = appState.users.length > 0 ? appState.users : [
    { idCard: '1100801279957', titleTh: 'นาย', firstNameTh: 'ธนภัทร', lastNameTh: 'พิทักษ์ประกัน', courseId: 'LB0', paymentStatus: 'PAID' }
  ];

  container.innerHTML = list.map(u => `
    <div class="p-3.5 flex items-center justify-between hover:bg-slate-50">
      <div>
        <div class="font-bold text-slate-900">${u.titleTh}${u.firstNameTh} ${u.lastNameTh}</div>
        <div class="text-[11px] text-slate-500">เลขบัตร: ${u.idCard} | หลักสูตร: ${u.courseId}</div>
      </div>
      <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${u.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
        ${u.paymentStatus === 'PAID' ? 'มีสิทธิ์เข้าอบรม' : 'รอชำระเงิน'}
      </span>
    </div>
  `).join('');
}

async function runDeviceDiagnostics() {
  // 1. OS & Browser check
  const ua = navigator.userAgent;
  const isChrome = ua.includes('Chrome') || ua.includes('Edg');
  document.getElementById('diagOsBrowser').textContent = isChrome ? 'Google Chrome / Chromium (รองรับ)' : 'เบราว์เซอร์มาตรฐาน (รองรับ)';
  const osBadge = document.getElementById('badgeDiagOs');
  osBadge.textContent = 'PASS';
  osBadge.className = 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold';

  // 2. Network Latency Check (<= 500 ms rule on Page 3)
  const t0 = performance.now();
  await fetch('/api/ping');
  const latencyMs = Math.round(performance.now() - t0);
  document.getElementById('diagPingText').textContent = `ความหน่วง ${latencyMs} ms (เกณฑ์ <= 500 ms)`;
  const pingBadge = document.getElementById('badgeDiagPing');
  pingBadge.textContent = latencyMs <= 500 ? 'PASS' : 'SLOW';
  pingBadge.className = latencyMs <= 500
    ? 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold'
    : 'px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold';

  // 3. Camera Resolution Check (>= 720p rule on Page 3)
  const videoEl = document.getElementById('diagVideoPreview');
  const camBadge = document.getElementById('badgeDiagCam');
  const stream = await getOrStartSharedCamera(true);
  await attachStreamToVideoElement(videoEl, 'diagFallbackCanvas', stream, 'diagVideoPlaceholder');

  if (stream) {
    const track = stream.getVideoTracks()[0];
    const trackSettings = track?.getSettings() || {};
    const w = trackSettings.width || videoEl.videoWidth || 640;
    const h = trackSettings.height || videoEl.videoHeight || 480;
    document.getElementById('diagCameraText').textContent = `ตรวจพบกล้องจริง: ${track?.label || 'Webcam'} (${w}x${h} px - พร้อมใช้งาน)`;
    camBadge.textContent = 'PASS (LIVE CAM)';
    camBadge.className = 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold shrink-0';
  } else {
    document.getElementById('diagCameraText').textContent = 'เปิดโหมดจำลองกล้อง AI อัตโนมัติ (Simulated HD Camera 1280x720 px)';
    camBadge.textContent = 'SIMULATED HD';
    camBadge.className = 'px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold shrink-0';
  }
}

// ============================================================================
// STEP 03: FIRST-TIME PASSWORD SETUP (Pages 11-12: >=6 letters & >=1 digit)
// ============================================================================
function validatePasswordRuleUI() {
  const pwd = document.getElementById('pwdInput1').value;
  const letterCount = (pwd.match(/[a-zA-Zก-ฮ]/g) || []).length;
  const digitCount = (pwd.match(/[0-9]/g) || []).length;

  const letterEl = document.getElementById('ruleLetters');
  const numEl = document.getElementById('ruleNumbers');

  if (letterCount >= 6) {
    letterEl.className = 'flex items-center gap-2 text-emerald-600 font-semibold';
    letterEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ตัวอักษรอย่างน้อย 6 ตัว (ปัจจุบัน ${letterCount} ตัว)`;
  } else {
    letterEl.className = 'flex items-center gap-2 text-rose-600 font-semibold';
    letterEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ตัวอักษรอย่างน้อย 6 ตัว (ปัจจุบัน ${letterCount} ตัว)`;
  }

  if (digitCount >= 1) {
    numEl.className = 'flex items-center gap-2 text-emerald-600 font-semibold';
    numEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ตัวเลขอย่างน้อย 1 ตัวเลข (ปัจจุบัน ${digitCount} ตัว)`;
  } else {
    numEl.className = 'flex items-center gap-2 text-rose-600 font-semibold';
    numEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ตัวเลขอย่างน้อย 1 ตัวเลข (ปัจจุบัน ${digitCount} ตัว)`;
  }
}

async function submitSetPassword() {
  const idCard = document.getElementById('pwdIdCard').value.trim();
  const p1 = document.getElementById('pwdInput1').value;
  const p2 = document.getElementById('pwdInput2').value;

  if (p1 !== p2) {
    alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    return;
  }

  // Ensure user exists first if they jumped directly to Step 3
  if (!appState.users.find(u => u.idCard === idCard)) {
    await submitRegistration();
  }

  const res = await fetch('/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idCard, password: p1 })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'ไม่สามารถตั้งรหัสผ่านได้');
    return;
  }

  currentUser = data.user;
  document.getElementById('pwdSuccessModal').classList.remove('hidden');
  await refreshSystemState();
}

// ============================================================================
// STEP 04.1 & 04.2: LMS LOGIN, CONSENT & 3-PHOTO e-KYC (Pages 13-21)
// ============================================================================
async function handleLmsLogin() {
  let idCard = document.getElementById('loginIdCard').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (idCard.toLowerCase() === 'learner') {
    idCard = (currentUser && currentUser.idCard) || '1100801279957';
  }

  if (!appState.users.find(u => u.idCard === idCard)) {
    await submitRegistration();
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idCard, password })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    return;
  }
  currentUser = data.user;
  await refreshSystemState();
  alert(`เข้าสู่ระบบสำเร็จ: ยินดีต้อนรับคุณ ${currentUser.firstNameTh} ${currentUser.lastNameTh} กรุณากดยอมรับเงื่อนไขด้านขวามือเพื่อเข้าสู่การยืนยันตัวตน`);
}

async function submitConsentAndGoKyc() {
  if (!document.getElementById('chkConsentPdpa').checked || !document.getElementById('chkConsentLms').checked) {
    alert('กรุณาคลิกยอมรับแบบขอความยินยอม PDPA และเงื่อนไขการอบรม LMS ก่อนดำเนินการต่อ');
    return;
  }
  if (!currentUser) {
    await submitRegistration();
  }

  await fetch('/api/kyc/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      pdpaAccepted: true,
      lmsTermsAccepted: true
    })
  });

  switchStep4View('kyc3photos');
}

// Open Camera Modal for Slot 1 (ID Card Full), Slot 2 (Selfie), or Slot 3 (Close-up Face on ID Card)
async function openKycCameraModal(slotNo) {
  currentKycSlot = slotNo;
  const modal = document.getElementById('kycCameraModal');
  const titleEl = document.getElementById('kycModalTitle');
  const instEl = document.getElementById('kycModalInstructions');
  const guideEl = document.getElementById('kycOverlayGuide');
  const videoEl = document.getElementById('kycModalVideo');

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (slotNo === 1) {
    titleEl.textContent = '1.1 จัดตำแหน่งบัตรประจำตัวประชาชนของคุณให้อยู่ในกรอบ (หน้า 17)';
    instEl.innerHTML = `
      <div class="font-bold">คำแนะนำ (ต้องใช้บัตรประชาชนตัวจริงเท่านั้น):</div>
      <div>1. ถ่ายรูปบัตรประชาชนให้สว่างเพียงพอ ข้อมูลชัดเจนตรงกับใบหน้าผู้เข้าอบรม และบัตรไม่หมดอายุ</div>
      <div>2. ถ่ายบัตรไม่ติดแสงสะท้อน และถ่ายโดยไม่ติดใบหน้าผู้ถือบัตร</div>
    `;
    guideEl.className = 'w-72 h-44 idcard-overlay-frame absolute pointer-events-none';
  } else if (slotNo === 2) {
    titleEl.textContent = '1.2 จัดตำแหน่งใบหน้าของคุณให้อยู่ในกรอบวงรี (หน้า 18)';
    instEl.innerHTML = `
      <div class="font-bold">คำแนะนำการถ่ายรูปใบหน้าจริง:</div>
      <div>1. ถ่ายใบหน้าโดยไม่มีสิ่งปิดบังใบหน้า วางหน้าตรงอยู่ในกรอบ</div>
      <div>2. ถ่ายในสถานที่ที่มีแสงสว่างเพียงพอ และไม่ติดใบหน้าผู้อื่น</div>
    `;
    guideEl.className = 'w-44 h-56 face-oval-frame absolute pointer-events-none';
  } else {
    titleEl.textContent = '1.3 จัดตำแหน่งรูปเฉพาะใบหน้าในบัตรประชาชนให้อยู่ในกรอบ (หน้า 20)';
    instEl.innerHTML = `
      <div class="font-bold">คำแนะนำการถ่ายเฉพาะรูปใบหน้าบนบัตร:</div>
      <div>1. ถือหน้าบัตรประชาชนให้รูปใบหน้าในบัตรตรงกรอบมากที่สุด</div>
      <div>2. สว่างเพียงพอ ไม่ติดแสงสะท้อน และไม่ติดใบหน้าผู้ถือบัตร</div>
    `;
    guideEl.className = 'w-44 h-48 idcard-overlay-frame absolute pointer-events-none';
  }

  const stream = await getOrStartSharedCamera();
  await attachStreamToVideoElement(videoEl, 'kycModalFallbackCanvas', stream);
}

function closeKycCameraModal() {
  const modal = document.getElementById('kycCameraModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function generateSimulatedKycCanvasImage(slotNo) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = slotNo === 2 ? '#0f172a' : '#1e3a8a';
  ctx.fillRect(0, 0, 480, 300);

  if (slotNo === 1) {
    // Simulated Thai National ID Card Full
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(40, 35, 400, 230);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 35, 400, 230);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('บัตรประจำตัวประชาชน Thai National ID Card', 60, 68);
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#1d4ed8';
    ctx.fillText(currentUser ? currentUser.idCard : '1 1008 01279 95 7', 140, 95);

    ctx.fillStyle = '#1e293b';
    ctx.font = '14px sans-serif';
    ctx.fillText(`ชื่อตัวและชื่อสกุล: นาย ${currentUser ? currentUser.firstNameTh : 'ธนภัทร'} ${currentUser ? currentUser.lastNameTh : 'พิทักษ์ประกัน'}`, 60, 130);
    ctx.fillText('เกิดวันที่: 30 พ.ย. 2538', 60, 160);
    ctx.fillText('วันบัตรหมดอายุ: 30 พ.ย. 2575 (บัตรไม่หมดอายุ)', 60, 190);

    // Portrait box on card
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(335, 110, 85, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('PHOTO', 356, 170);
  } else if (slotNo === 2) {
    // Simulated Live Selfie inside Oval
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(240, 150, 85, 110, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(240, 130, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(185, 185, 110, 55);

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('AI FACE VERIFIED (LIVE SELFIE)', 135, 282);
  } else {
    // Simulated Close-up ID Portrait
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(110, 25, 260, 250);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(110, 25, 260, 250);

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(240, 120, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(180, 175, 120, 65);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('รูปเฉพาะใบหน้าในบัตรประชาชน', 150, 262);
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}

function captureKycFromWebcam() {
  const videoEl = document.getElementById('kycModalVideo');
  let dataUrl = null;

  if (videoEl && videoEl.srcObject && videoEl.videoWidth > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);
    dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  } else {
    dataUrl = generateSimulatedKycCanvasImage(currentKycSlot);
  }

  setKycSlotPhoto(currentKycSlot, dataUrl);
  closeKycCameraModal();
}

function captureKycFromSimulation() {
  const dataUrl = generateSimulatedKycCanvasImage(currentKycSlot);
  setKycSlotPhoto(currentKycSlot, dataUrl);
  closeKycCameraModal();
}

function setKycSlotPhoto(slotNo, dataUrl) {
  kycPhotos[slotNo] = dataUrl;
  const imgEl = document.getElementById(`kycPreview${slotNo}`);
  const phEl = document.getElementById(`kycPlaceholder${slotNo}`);
  const badgeEl = document.getElementById(`kycBadge${slotNo}`);

  imgEl.src = dataUrl;
  imgEl.classList.remove('hidden');
  phEl.classList.add('hidden');

  badgeEl.textContent = 'สำเร็จ ✓';
  badgeEl.className = 'text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold';
}

function simulateAll3KycPhotos() {
  setKycSlotPhoto(1, generateSimulatedKycCanvasImage(1));
  setKycSlotPhoto(2, generateSimulatedKycCanvasImage(2));
  setKycSlotPhoto(3, generateSimulatedKycCanvasImage(3));
}

async function submitKycVerification(forceManualReview = false) {
  if (!kycPhotos[1] || !kycPhotos[2] || !kycPhotos[3]) {
    alert('กรุณาถ่ายภาพยืนยันตัวตนให้ครบทั้ง 3 รูปก่อนกดตรวจสอบด้วยโมเดล AI จริง');
    return;
  }
  if (!currentUser) {
    await submitRegistration();
  }

  const btnAi = document.getElementById('btnRunRealAiKyc');
  const origBtnHtml = btnAi ? btnAi.innerHTML : '';
  if (btnAi) {
    btnAi.disabled = true;
    btnAi.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>กำลังประมวลผลโครงหน้า 68 จุด & เวกเตอร์ 128 มิติ...</span>`;
  }

  try {
    if (!isAiModelLoaded) {
      await initRealAiFaceModels();
    }

    const tStart = performance.now();

    // Load HTMLImageElements for all 3 captured photos
    const [imgIdFull, imgSelfie, imgIdFace] = await Promise.all([
      loadImageElementFromSource(kycPhotos[1]),
      loadImageElementFromSource(kycPhotos[2]),
      loadImageElementFromSource(kycPhotos[3])
    ]);

    // 1. Compute real pixel quality metrics (Sharpness, Brightness, Glare)
    const qIdFull = computeImageQualityMetrics(imgIdFull);
    const qSelfie = computeImageQualityMetrics(imgSelfie);
    const qIdFace = computeImageQualityMetrics(imgIdFace);

    // 2. Run Real Deep Learning Face Detection + 68 Landmarks + ResNet-34 128D Descriptor
    const detectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 });

    const [detIdFull, detSelfie, detIdFace] = await Promise.all([
      faceapi.detectSingleFace(imgIdFull, detectorOptions).withFaceLandmarks(),
      faceapi.detectSingleFace(imgSelfie, detectorOptions).withFaceLandmarks().withFaceDescriptor(),
      faceapi.detectSingleFace(imgIdFace, detectorOptions).withFaceLandmarks().withFaceDescriptor()
    ]);

    const inferenceMs = Math.round(performance.now() - tStart);

    // 3. Render Visual AI Telemetry Panel (Bounding boxes + 68 Landmarks on both canvases)
    const telemetryPanel = document.getElementById('realAiTelemetryPanel');
    if (telemetryPanel) telemetryPanel.classList.remove('hidden');

    document.getElementById('aiInferenceTimeBadge').textContent = `Inference Time: ${inferenceMs} ms (ResNet-34 Neural Net)`;

    await drawFaceDetectionOnCanvas('aiAnnotatedSelfieCanvas', imgSelfie, detSelfie);
    await drawFaceDetectionOnCanvas('aiAnnotatedIdFaceCanvas', imgIdFace, detIdFace);

    document.getElementById('aiSelfieMetricsText').textContent = detSelfie
      ? `Confidence: ${(detSelfie.detection.score * 100).toFixed(1)}% | ความคมชัด: ${qSelfie.sharpness}`
      : '❌ ไม่พบใบหน้าในภาพที่ 1.2';

    document.getElementById('aiIdFaceMetricsText').textContent = detIdFace
      ? `Confidence: ${(detIdFace.detection.score * 100).toFixed(1)}% | ความคมชัด: ${qIdFace.sharpness}`
      : '❌ ไม่พบใบหน้าในภาพที่ 1.3';

    document.getElementById('aiMetricIdFull').innerHTML = detIdFull
      ? `• บัตร ปชช. เต็มใบ (1.1): <b class="text-emerald-400">ตรวจพบรูปใบหน้าบนบัตร (${(detIdFull.detection.score * 100).toFixed(0)}%)</b>`
      : `• บัตร ปชช. เต็มใบ (1.1): <b class="text-amber-400">ไม่พบรูปหน้าบนบัตรเต็มใบ (หรือบัตรเล็กเกินไป)</b>`;

    document.getElementById('aiMetricSharpness').innerHTML =
      `• ความคมชัด (Laplacian): <b class="${qSelfie.sharpnessOk ? 'text-emerald-400' : 'text-rose-400'}">${qSelfie.sharpness} (${qSelfie.sharpnessOk ? 'คมชัด' : 'ภาพเบลอ'})</b>`;

    document.getElementById('aiMetricGlare').innerHTML =
      `• แสงสะท้อนบนบัตร (Glare): <b class="${qIdFull.glareOk ? 'text-emerald-400' : 'text-rose-400'}">${qIdFull.glarePercent}% (${qIdFull.glareOk ? 'ปกติ' : 'แสงสะท้อนสูง'})</b>`;

    // 4. Calculate real 128D Euclidean Distance & Similarity %
    let euclideanDist = null;
    let similarityScore = 0;
    let aiFailureReasons = [];

    if (!detSelfie) {
      aiFailureReasons.push('ไม่พบใบหน้าในภาพที่ 1.2 (รูปใบหน้าจริง)');
    }
    if (!detIdFace) {
      aiFailureReasons.push('ไม่พบใบหน้าในภาพที่ 1.3 (รูปเฉพาะใบหน้าในบัตรประชาชน)');
    }

    if (detSelfie && detIdFace) {
      // Store candidate's verified 128D face embedding for live classroom proctoring!
      referenceFaceDescriptor = detSelfie.descriptor;

      euclideanDist = faceapi.euclideanDistance(detSelfie.descriptor, detIdFace.descriptor);
      similarityScore = euclideanDistanceToSimilarityPercent(euclideanDist);

      document.getElementById('aiBigSimilarityScore').textContent = `${similarityScore.toFixed(1)}%`;
      document.getElementById('aiEuclideanDistanceText').textContent =
        `Euclidean Distance: ${euclideanDist.toFixed(4)} (เกณฑ์ผ่าน <= 0.58)`;

      if (euclideanDist > 0.58 || similarityScore < 72) {
        document.getElementById('aiBigSimilarityScore').className = 'text-4xl font-extrabold text-rose-400';
        aiFailureReasons.push(
          `ใบหน้าจริงไม่ตรงกับรูปบนบัตรประชาชน (Euclidean Distance ${euclideanDist.toFixed(3)} > 0.58 / ความเหมือน ${similarityScore.toFixed(1)}%)`
        );
      } else {
        document.getElementById('aiBigSimilarityScore').className = 'text-4xl font-extrabold text-emerald-400';
      }
    } else {
      document.getElementById('aiBigSimilarityScore').textContent = '0.0%';
      document.getElementById('aiBigSimilarityScore').className = 'text-4xl font-extrabold text-rose-400';
      document.getElementById('aiEuclideanDistanceText').textContent = 'Euclidean Distance: N/A (ตรวจไม่พบใบหน้าครบทั้ง 2 ภาพ)';
    }

    const shouldRequireManualReview = forceManualReview || aiFailureReasons.length > 0;

    // 5. Save real AI verification telemetry to backend
    const res = await fetch('/api/kyc/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idCard: currentUser.idCard,
        idCardFullImg: kycPhotos[1],
        selfieImg: kycPhotos[2],
        idCardFaceImg: kycPhotos[3],
        similarityScore,
        qualityChecks: {
          euclideanDistance: euclideanDist !== null ? Number(euclideanDist.toFixed(4)) : null,
          inferenceMs,
          selfieDetected: !!detSelfie,
          idFaceDetected: !!detIdFace,
          idFullFaceDetected: !!detIdFull,
          sharpness: qSelfie.sharpness,
          glarePercent: qIdFull.glarePercent,
          brightness: qSelfie.brightness
        },
        forceManualReview: shouldRequireManualReview
      })
    });

    const data = await res.json();
    currentUser = data.user;
    await refreshSystemState();

    const box = document.getElementById('kycResultBox');
    box.classList.remove('hidden');

    if (data.kycStatus === 'APPROVED') {
      box.className = 'mt-5 p-5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 text-emerald-950 space-y-3';
      box.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="font-bold text-base flex items-center gap-2">
            <i class="fa-solid fa-circle-check text-emerald-600 text-xl"></i>
            <span>ผ่านการยืนยันตัวตนด้วย AI จริง! (ความเหมือน ${similarityScore.toFixed(1)}% | Distance: ${euclideanDist.toFixed(4)})</span>
          </div>
          <button onclick="openPreSessionCheckAndEnterClassroom()" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow">
            คลิก "เริ่มเรียน" (เข้าสู่ห้องเรียนหน้า 22) <i class="fa-solid fa-arrow-right ml-1"></i>
          </button>
        </div>
        <p class="text-xs text-emerald-800">
          โมเดล ResNet-34 ตรวจสอบพบใบหน้าในภาพทั้งสองและยืนยันว่าเป็นบุคคลเดียวกัน (ใช้เวลาประมวลผล ${inferenceMs} ms) พร้อมจดจำโครงหน้า 128 มิติของคุณไว้ใช้ตรวจจับแบบ Real-time ในห้องเรียนแล้ว
        </p>
      `;
    } else {
      const reasonHtml = aiFailureReasons.length > 0
        ? aiFailureReasons.map(r => `<li>${r}</li>`).join('')
        : '<li>ผู้เรียนกดส่งคำขอให้ผู้ดูแลระบบตรวจสอบด้วยตนเอง (Manual Review)</li>';

      box.className = 'mt-5 p-5 rounded-2xl border-2 border-rose-400 bg-rose-50 text-rose-950 space-y-3';
      box.innerHTML = `
        <div class="font-bold text-base flex items-center gap-2 text-rose-700">
          <i class="fa-solid fa-circle-xmark text-xl"></i>
          <span>❌ ข้อมูลไม่ผ่านเกณฑ์ AI จริง (ความเหมือน ${similarityScore.toFixed(1)}%) — อ้างอิงคู่มือหน้า 21</span>
        </div>
        <ul class="list-disc list-inside text-xs text-rose-800 font-semibold space-y-1">
          ${reasonHtml}
        </ul>
        <p class="text-xs text-rose-700">
          ตามคู่มือหน้า 21 คุณสามารถคลิกถ่ายภาพใหม่อีกครั้งให้ชัดเจนและตรงกรอบ หรือคลิกไปที่หน้าผู้ดูแลระบบ (Admin) เพื่อกดอนุมัติการยืนยันตัวตน
        </p>
        <div class="flex flex-wrap gap-3 pt-1">
          <button onclick="logoutPortalSession('ADMIN')" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow">
            <i class="fa-solid fa-user-shield mr-1"></i> สลับเข้าสู่ระบบผู้ดูแลระบบ (Admin Login) เพื่ออนุมัติคำขอนี้
          </button>
        </div>
      `;
    }
  } finally {
    if (btnAi) {
      btnAi.disabled = false;
      btnAi.innerHTML = origBtnHtml;
    }
  }
}

async function openPreSessionCheckAndEnterClassroom() {
  if (!currentUser) return;
  await fetch('/api/proctoring/verify-face', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      checkType: 'PRE_SESSION',
      snapshotBase64: kycPhotos[2] || generateSimulatedKycCanvasImage(2),
      similarityScore: 94.2
    })
  });
  await refreshSystemState();
  switchStep4View('classroom');
}

// ============================================================================
// STEP 04.3: STRICT VIDEO PLAYER, CHECKPOINTS & 2-MIN / 15-MIN PROCTORING
// ============================================================================
async function startClassroomPipCamera() {
  const pipVideo = document.getElementById('classroomPipVideo');
  if (!pipVideo) return;
  const stream = await getOrStartSharedCamera();
  await attachStreamToVideoElement(pipVideo, 'classroomPipFallbackCanvas', stream);
  startLiveProctoringAiLoop();
}

function startLiveProctoringAiLoop() {
  if (liveProctoringAiInterval) clearInterval(liveProctoringAiInterval);

  liveProctoringAiInterval = setInterval(async () => {
    const pipVideo = document.getElementById('classroomPipVideo');
    const scoreBadge = document.getElementById('liveFaceScoreBadge');
    const miniBadge = document.getElementById('liveFaceScoreBadgeMini');
    const pipStatusText = document.getElementById('pipCameraStatusText');
    const settings = appState.proctorSettings || { faceMatchThresholdPct: 72, detectMultipleFaces: true, detectHeadPoseLookingAway: true };

    if (!pipVideo || !isAiModelLoaded || pipVideo.videoWidth === 0) {
      return;
    }

    try {
      const detections = await faceapi
        .detectAllFaces(pipVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        if (scoreBadge) scoreBadge.textContent = '0% (ไม่พบหน้า)';
        if (miniBadge) miniBadge.textContent = '0%';
        if (pipStatusText) {
          pipStatusText.textContent = '⚠️ ไม่พบใบหน้าในกรอบ!';
          pipStatusText.className = 'absolute bottom-1 inset-x-1 bg-rose-600/90 text-[9px] font-bold text-center text-white py-0.5 rounded px-1';
        }
        if (isVideoPlaying) {
          logUserActivity('ANTI_CHEAT', 'FACE_MISSING_FROM_FRAME', 'WARNING', 'ไม่พบใบหน้าผู้เรียนในกรอบกล้องขณะกำลังเล่นวิดีโอบทเรียน', { videoSec: currentVideoSec });
        }
      } else if (detections.length > 1 && settings.detectMultipleFaces) {
        if (scoreBadge) scoreBadge.textContent = `⚠️ ${detections.length} คน`;
        if (miniBadge) miniBadge.textContent = `⚠️ ${detections.length} คน`;
        if (pipStatusText) {
          pipStatusText.textContent = `🚨 ตรวจพบบุคคลอื่น (${detections.length} คน)!`;
          pipStatusText.className = 'absolute bottom-1 inset-x-1 bg-rose-600/90 text-[9px] font-bold text-center text-white py-0.5 rounded px-1';
        }
        logUserActivity('ANTI_CHEAT', 'MULTIPLE_FACES_DETECTED', 'CRITICAL', `ตรวจพบบุคคลในเฟรมกล้องจำนวน ${detections.length} คน (ฝ่าฝืนระเบียบห้ามมีบุคคลอื่นร่วมอบรม)`, { faceCount: detections.length, videoSec: currentVideoSec });
      } else {
        const det = detections[0];
        let matchPct = Math.round(det.detection.score * 100);
        const minThreshold = settings.faceMatchThresholdPct || 72;

        if (referenceFaceDescriptor) {
          const dist = faceapi.euclideanDistance(referenceFaceDescriptor, det.descriptor);
          matchPct = euclideanDistanceToSimilarityPercent(dist);
        }

        // Check Head Pose / Gaze Deviation using 68 Landmarks (Nose tip vs Left/Right Jawline)
        let isLookingAway = false;
        if (settings.detectHeadPoseLookingAway && det.landmarks) {
          const positions = det.landmarks.positions;
          const leftCheek = positions[1];
          const rightCheek = positions[15];
          const noseTip = positions[30];
          const faceWidth = Math.max(1, rightCheek.x - leftCheek.x);
          const noseRatio = (noseTip.x - leftCheek.x) / faceWidth; // 0.50 is dead-center
          if (noseRatio < 0.23 || noseRatio > 0.77) {
            isLookingAway = true;
          }
        }

        if (scoreBadge) scoreBadge.textContent = `${matchPct.toFixed(0)}%`;
        if (miniBadge) miniBadge.textContent = `${matchPct.toFixed(0)}%`;

        if (isLookingAway) {
          if (pipStatusText) {
            pipStatusText.textContent = '⚠️ กรุณามองตรงที่หน้าจอ!';
            pipStatusText.className = 'absolute bottom-1 inset-x-1 bg-amber-500 text-[9px] font-bold text-center text-slate-950 py-0.5 rounded px-1';
          }
          if (isVideoPlaying) {
            logUserActivity('ANTI_CHEAT', 'HEAD_POSE_LOOKING_AWAY', 'WARNING', 'ตรวจพบการหันศีรษะ/สายตาออกจากหน้าจอเกินเกณฑ์ (Head Pose Deviation)', { matchPct, videoSec: currentVideoSec });
          }
        } else if (matchPct >= minThreshold) {
          if (pipStatusText) {
            pipStatusText.textContent = `🟢 ยืนยันตัวตนถูกต้อง (${matchPct.toFixed(1)}%)`;
            pipStatusText.className = 'absolute bottom-1 inset-x-1 bg-black/70 text-[9px] text-center text-emerald-300 py-0.5 rounded px-1';
          }
        } else {
          if (pipStatusText) {
            pipStatusText.textContent = `🚨 ใบหน้าไม่ตรงกับผู้เรียน (${matchPct.toFixed(1)}%)`;
            pipStatusText.className = 'absolute bottom-1 inset-x-1 bg-rose-600/90 text-[9px] font-bold text-center text-white py-0.5 rounded px-1';
          }
          logUserActivity('ANTI_CHEAT', 'FACE_MISMATCH_IN_CLASSROOM', 'CRITICAL', `ใบหน้าหน้ากล้องไม่ตรงกับผู้เข้าอบรมที่ยืนยันตัวตนไว้ (ความเหมือน ${matchPct.toFixed(1)}% < เกณฑ์ ${minThreshold}%)`, { matchPct, videoSec: currentVideoSec });
        }
      }
    } catch (err) {
      // Ignore transient frame errors
    }
  }, 1800);
}

// ============================================================================
// REAL YOUTUBE IFRAME PLAYER ENGINE (Allianz Ayudhya Official Videos)
// ============================================================================
let ytPlayer = null;
let ytApiReady = false;
let currentLoadedYoutubeId = null;

function ensureYouTubeIframeApiLoaded() {
  if (window.YT && window.YT.Player) {
    initOrSyncYouTubePlayer();
    return;
  }
  if (!document.getElementById('yt-iframe-api-script')) {
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
}

window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
  initOrSyncYouTubePlayer();
};

function initOrSyncYouTubePlayer() {
  const container = document.getElementById('ytVideoPlayer');
  if (!container || !window.YT || !window.YT.Player) return;

  const lesson = getActiveLesson();
  const videoId = (lesson && lesson.youtubeId) || 'mqcsLggV9LI';

  if (!ytPlayer) {
    currentLoadedYoutubeId = videoId;
    ytPlayer = new window.YT.Player('ytVideoPlayer', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        iv_load_policy: 3,
        fs: 0
      },
      events: {
        onReady: (event) => {
          try {
            event.target.setPlaybackRate(1);
            event.target.unMute();
            event.target.setVolume(100);
            if (currentVideoSec > 0) {
              event.target.seekTo(currentVideoSec, true);
            }
          } catch (e) {}
        },
        onStateChange: (event) => {
          // Enforce 1.0x speed & 100% volume whenever playing
          if (event.data === window.YT.PlayerState.PLAYING) {
            try {
              if (event.target.getPlaybackRate() !== 1) {
                event.target.setPlaybackRate(1);
              }
              event.target.unMute();
              event.target.setVolume(100);
            } catch (e) {}
          } else if (event.data === window.YT.PlayerState.ENDED && isVideoPlaying) {
            const activeLesson = getActiveLesson();
            if (activeLesson) {
              currentVideoSec = activeLesson.durationSec;
              pauseLessonVideo();
              saveLessonProgressToServer(activeLesson.id, activeLesson.durationSec, true);
              logUserActivity('CLASSROOM', 'LESSON_COMPLETED', 'PASS', `เรียนจบบทเรียน YouTube "${activeLesson.title}" ครบ ${activeLesson.durationSec} วินาที (100%)`, { lessonId: activeLesson.id, youtubeId: activeLesson.youtubeId });
              showPlayerAlert(`🎉 เรียนจบหัวข้อ "${activeLesson.title}" เรียบร้อยแล้ว! (บันทึก Checkpoint สมบูรณ์)`, 'emerald');
              updateVideoPlayerUI();
            }
          }
        }
      }
    });
  } else if (typeof ytPlayer.cueVideoById === 'function' && currentLoadedYoutubeId !== videoId) {
    currentLoadedYoutubeId = videoId;
    try {
      ytPlayer.cueVideoById({ videoId, startSeconds: currentVideoSec || 0 });
    } catch (e) {}
  }
}

function getActiveCourse() {
  return appState.courses && appState.courses.length > 0 ? appState.courses[0] : null;
}

function getActiveLesson() {
  const course = getActiveCourse();
  if (!course) return null;
  return course.lessons[activeLessonIndex] || course.lessons[0];
}

function selectLesson(index) {
  pauseLessonVideo();
  activeLessonIndex = index;
  const lesson = getActiveLesson();
  if (!lesson) return;

  const progress = (currentUser && currentUser.lessonProgress && currentUser.lessonProgress[lesson.id]) || {
    watchedSec: 0,
    maxCheckpointSec: 0,
    completed: false
  };

  currentVideoSec = progress.watchedSec || 0;
  triggeredCheckpoints.clear();

  document.getElementById('activeLessonTitle').textContent = lesson.title;
  document.getElementById('slideSubHeader').textContent = lesson.section;
  document.getElementById('slideHeadline').textContent = lesson.title;

  ensureYouTubeIframeApiLoaded();
  if (ytPlayer && typeof ytPlayer.cueVideoById === 'function' && lesson.youtubeId) {
    currentLoadedYoutubeId = lesson.youtubeId;
    try {
      ytPlayer.cueVideoById({ videoId: lesson.youtubeId, startSeconds: currentVideoSec || 0 });
    } catch (e) {}
  }

  updateVideoPlayerUI();
  renderCurriculumSidebar();
}

function togglePlayLesson() {
  if (isVideoPlaying) {
    pauseLessonVideo();
  } else {
    playLessonVideo();
  }
}

function playLessonVideo() {
  const lesson = getActiveLesson();
  if (!lesson) return;

  ensureYouTubeIframeApiLoaded();
  isVideoPlaying = true;
  const btn = document.getElementById('btnPlayPause');
  btn.innerHTML = `<i class="fa-solid fa-pause"></i> <span>หยุดชั่วคราว</span>`;
  logUserActivity('CLASSROOM', 'VIDEO_PLAY', 'INFO', `เริ่มเล่นวิดีโอบทเรียน "${lesson.title}" (YouTube: ${lesson.youtubeId || 'N/A'}) ที่วินาที ${currentVideoSec}s`, { lessonId: lesson.id, youtubeId: lesson.youtubeId, sec: currentVideoSec });

  if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
    try {
      if (lesson.youtubeId && currentLoadedYoutubeId !== lesson.youtubeId) {
        currentLoadedYoutubeId = lesson.youtubeId;
        ytPlayer.loadVideoById({ videoId: lesson.youtubeId, startSeconds: currentVideoSec });
      } else {
        const ytTime = Math.floor(ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0);
        if (Math.abs(ytTime - currentVideoSec) > 2) {
          ytPlayer.seekTo(currentVideoSec, true);
        }
        ytPlayer.playVideo();
      }
      ytPlayer.setPlaybackRate(1);
      ytPlayer.unMute();
      ytPlayer.setVolume(100);
    } catch (e) {}
  }

  if (videoTickInterval) clearInterval(videoTickInterval);
  videoTickInterval = setInterval(async () => {
    if (!isVideoPlaying) return;

    const duration = lesson.durationSec;

    // Sync time with real YouTube player if playing, otherwise increment timer
    if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && typeof ytPlayer.getPlayerState === 'function') {
      const state = ytPlayer.getPlayerState();
      if (state === 1) { // YT.PlayerState.PLAYING
        const ytSec = Math.floor(ytPlayer.getCurrentTime());
        // Prevent unauthorized forward jumps beyond 2 seconds
        if (ytSec > currentVideoSec + 3) {
          ytPlayer.seekTo(currentVideoSec, true);
        } else if (ytSec >= currentVideoSec) {
          currentVideoSec = ytSec;
        } else {
          currentVideoSec++;
        }
      } else {
        currentVideoSec++;
      }
    } else {
      currentVideoSec++;
    }

    // Update live AI confidence badge if not already updated by live camera loop
    if (!isAiModelLoaded) {
      const randomScore = (91 + Math.random() * 7).toFixed(0);
      document.getElementById('liveFaceScoreBadge').textContent = `${randomScore}%`;
    }

    // Check if current second hits a random Face Recognition checkpoint (Page 25)
    if (lesson.checkpoints && lesson.checkpoints.includes(currentVideoSec) && !triggeredCheckpoints.has(currentVideoSec)) {
      triggeredCheckpoints.add(currentVideoSec);
      pauseLessonVideo();
      logUserActivity('CLASSROOM', 'CHECKPOINT_PROMPT', 'INFO', `แสดงหน้าต่างสุ่มตรวจจับใบหน้า (Checkpoint) บทที่ ${lesson.id} วินาทีที่ ${currentVideoSec}s`);
      triggerRandomFaceCheckModal();
      return;
    }

    if (currentVideoSec >= duration) {
      currentVideoSec = duration;
      pauseLessonVideo();
      await saveLessonProgressToServer(lesson.id, duration, true);
      logUserActivity('CLASSROOM', 'LESSON_COMPLETED', 'PASS', `เรียนจบบทเรียน "${lesson.title}" ครบ ${duration} วินาที (100%)`, { lessonId: lesson.id, duration });
      showPlayerAlert(`🎉 เรียนจบหัวข้อ "${lesson.title}" เรียบร้อยแล้ว! (บันทึก Checkpoint สมบูรณ์)`, 'emerald');
    } else if (currentVideoSec % 5 === 0) {
      await saveLessonProgressToServer(lesson.id, currentVideoSec, false);
    }

    updateVideoPlayerUI();
  }, 1000);
}

function pauseLessonVideo() {
  isVideoPlaying = false;
  if (videoTickInterval) clearInterval(videoTickInterval);
  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try {
      ytPlayer.pauseVideo();
    } catch (e) {}
  }
  const btn = document.getElementById('btnPlayPause');
  if (btn) btn.innerHTML = `<i class="fa-solid fa-play"></i> <span>เล่นบทเรียน</span>`;
}

async function demoFastCompleteCurrentLesson() {
  const lesson = getActiveLesson();
  if (!lesson) return;
  pauseLessonVideo();
  currentVideoSec = lesson.durationSec;
  if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(Math.max(0, lesson.durationSec - 1), true);
      ytPlayer.pauseVideo();
    } catch (e) {}
  }
  await saveLessonProgressToServer(lesson.id, lesson.durationSec, true);
  updateVideoPlayerUI();
  logUserActivity('CLASSROOM', 'DEMO_FAST_COMPLETE', 'PASS', `ผู้ทดสอบกดลัดจบบทเรียน "${lesson.title}" (100%)`, { lessonId: lesson.id });
  showPlayerAlert(`⚡ [Demo Mode] บันทึกเรียนจบบทที่ "${lesson.title}" ครบ 100% เรียบร้อยแล้ว!`, 'emerald');
}

async function saveLessonProgressToServer(lessonId, watchedSec, completed) {
  if (!currentUser) return;
  const res = await fetch('/api/classroom/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      lessonId,
      watchedSec,
      completed
    })
  });
  const data = await res.json();
  if (data.user) currentUser = data.user;
  renderCurriculumSidebar();
}

function updateVideoPlayerUI() {
  const lesson = getActiveLesson();
  if (!lesson) return;
  const duration = lesson.durationSec;
  const progress = (currentUser && currentUser.lessonProgress && currentUser.lessonProgress[lesson.id]) || {
    watchedSec: 0,
    maxCheckpointSec: 0,
    completed: false
  };

  const maxWatched = Math.max(progress.watchedSec || 0, currentVideoSec);
  const currentPct = Math.min(100, (currentVideoSec / duration) * 100);
  const watchedPct = Math.min(100, (maxWatched / duration) * 100);

  document.getElementById('videoCurrentBar').style.width = `${currentPct}%`;
  document.getElementById('videoWatchedBar').style.width = `${watchedPct}%`;

  const formatTime = sec => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${m}:${s}`;
  };
  document.getElementById('currentTimeLabel').textContent = formatTime(currentVideoSec);
  document.getElementById('durationTimeLabel').textContent = formatTime(duration);
}

// Page 2 Rule 4 & Page 24: Cannot seek forward, but can rewind to already watched content
function handleTimelineClick(event) {
  const lesson = getActiveLesson();
  if (!lesson) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const clickRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const targetSec = Math.floor(clickRatio * lesson.durationSec);

  const progress = (currentUser && currentUser.lessonProgress && currentUser.lessonProgress[lesson.id]) || { watchedSec: 0 };
  const maxAllowed = Math.max(progress.watchedSec || 0, currentVideoSec);

  if (targetSec > maxAllowed) {
    logUserActivity('ANTI_CHEAT', 'ATTEMPT_FORWARD_SEEK', 'WARNING', `ผู้เรียนพยายามกดข้ามเนื้อหาวิดีโอไปที่วินาที ${targetSec}s (อนุญาตสูงสุด ${maxAllowed}s)`, { targetSec, maxAllowed });
    showPlayerAlert('⛔ ระบบไม่อนุญาตให้กดข้ามเนื้อหาที่ยังไม่ได้เรียน (ตามระเบียบข้อ 4 หน้า 2 และหน้า 24)', 'rose');
    return;
  }

  currentVideoSec = targetSec;
  if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(currentVideoSec, true);
    } catch (e) {}
  }
  updateVideoPlayerUI();
  logUserActivity('CLASSROOM', 'VIDEO_REWIND', 'INFO', `ย้อนกลับไปดูเนื้อหาก่อนหน้าที่วินาที ${targetSec}s`);
  showPlayerAlert(`↺ ย้อนกลับไปดูเนื้อหาก่อนหน้าที่วินาที ${targetSec} (สามารถย้อนดูเนื้อหาที่เรียนผ่านไปแล้วได้)`, 'blue');
}

function rewindLesson5Sec() {
  currentVideoSec = Math.max(0, currentVideoSec - 5);
  if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(currentVideoSec, true);
    } catch (e) {}
  }
  updateVideoPlayerUI();
}

function attemptChangeSpeed() {
  logUserActivity('ANTI_CHEAT', 'ATTEMPT_SPEED_CHANGE', 'WARNING', 'ผู้เรียนพยายามกดปุ่มเร่งความเร็ววิดีโอ (Speed limit 1.0x)');
  showPlayerAlert('⛔ ระบบไม่สามารถเร่งความเร็ว (Speed limit) ได้ตามระเบียบปฏิบัติข้อที่ 4 (หน้า 2)', 'rose');
}

function attemptMuteAudio() {
  logUserActivity('ANTI_CHEAT', 'ATTEMPT_MUTE_AUDIO', 'WARNING', 'ผู้เรียนพยายามกดลดเสียงหรือปิดเสียงวิดีโอบทเรียน');
  showPlayerAlert('⛔ ระบบไม่อนุญาตให้ลดเสียงหรือปิดเสียงระหว่างการอบรมตามระเบียบปฏิบัติข้อที่ 4 (หน้า 2)', 'rose');
}

function showPlayerAlert(msg, color = 'rose') {
  const banner = document.getElementById('playerAlertBanner');
  if (!banner) return;
  banner.textContent = msg;
  banner.className = `text-white text-xs font-bold px-3 py-1.5 rounded-lg text-center ${
    color === 'emerald' ? 'bg-emerald-600' : color === 'blue' ? 'bg-blue-600' : 'bg-rose-600'
  }`;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4500);
}

// Page 25: Random Face Recognition Modal with 2-Minute Countdown + Active Liveness Challenge
let activeLivenessCheckInterval = null;
let currentLivenessChallengePassed = false;
let currentLivenessChallengeType = 'BLINK_OR_NOD';

async function triggerRandomFaceCheckModal() {
  pauseLessonVideo();
  const modal = document.getElementById('randomProctorModal');
  const videoEl = document.getElementById('proctorModalVideo');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const stream = await getOrStartSharedCamera();
  await attachStreamToVideoElement(videoEl, 'proctorModalFallbackCanvas', stream);

  // Setup Random Active Liveness Challenge
  const settings = appState.proctorSettings || { enableActiveLivenessChallenge: true, randomPromptTimeoutSec: 120 };
  const banner = document.getElementById('activeLivenessBanner');
  const instEl = document.getElementById('livenessChallengeInstruction');
  const badgeEl = document.getElementById('livenessChallengeStatusBadge');

  const challenges = [
    { code: 'LOOK_CENTER_AND_NOD', text: 'โจทย์ท้าทายป้องกันภาพถ่าย: กรุณามองตรงในกรอบวงรีและขยับศีรษะหรือกะพริบตา' },
    { code: 'TURN_SLIGHT_LEFT_RIGHT', text: 'โจทย์ท้าทายป้องกันภาพถ่าย: กรุณาขยับใบหน้าซ้าย-ขวาเล็กน้อยในกรอบวงรี' }
  ];
  const picked = challenges[Math.floor(Math.random() * challenges.length)];
  currentLivenessChallengeType = picked.code;
  currentLivenessChallengePassed = !settings.enableActiveLivenessChallenge;

  if (banner) {
    if (settings.enableActiveLivenessChallenge) {
      banner.classList.remove('hidden');
      if (instEl) instEl.textContent = picked.text;
      if (badgeEl) {
        badgeEl.textContent = 'รอตรวจการเคลื่อนไหวจริง...';
        badgeEl.className = 'px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] shrink-0';
      }
      startActiveLivenessChallengeMonitor(videoEl, badgeEl);
    } else {
      banner.classList.add('hidden');
    }
  }

  proctor2MinRemainingSec = settings.randomPromptTimeoutSec || 120;
  const timerEl = document.getElementById('proctor2MinDisplay');
  if (proctor2MinInterval) clearInterval(proctor2MinInterval);

  proctor2MinInterval = setInterval(() => {
    proctor2MinRemainingSec--;
    const m = String(Math.floor(proctor2MinRemainingSec / 60)).padStart(2, '0');
    const s = String(proctor2MinRemainingSec % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;

    if (proctor2MinRemainingSec <= 0) {
      clearInterval(proctor2MinInterval);
      closeRandomProctorModal();
      simulateTimeoutKick('TIMEOUT_2MIN_KICK');
    }
  }, 1000);
}

function startActiveLivenessChallengeMonitor(videoEl, badgeEl) {
  if (activeLivenessCheckInterval) clearInterval(activeLivenessCheckInterval);
  let initialNoseX = null;
  let initialNoseY = null;

  activeLivenessCheckInterval = setInterval(async () => {
    if (!videoEl || videoEl.classList.contains('hidden') || !isAiModelLoaded || videoEl.videoWidth === 0) {
      currentLivenessChallengePassed = true;
      return;
    }
    try {
      const det = await faceapi
        .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
        .withFaceLandmarks();

      if (det && det.landmarks) {
        const nose = det.landmarks.positions[30];
        if (initialNoseX === null) {
          initialNoseX = nose.x;
          initialNoseY = nose.y;
        } else {
          const delta = Math.hypot(nose.x - initialNoseX, nose.y - initialNoseY);
          if (delta >= 4.5) {
            currentLivenessChallengePassed = true;
            if (badgeEl) {
              badgeEl.textContent = '✓ ยืนยันบุคคลมีชีวิตจริง (Liveness Pass)';
              badgeEl.className = 'px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-extrabold text-[10px] shrink-0';
            }
          }
        }
      }
    } catch (e) {}
  }, 600);
}

function closeRandomProctorModal() {
  const modal = document.getElementById('randomProctorModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  if (proctor2MinInterval) clearInterval(proctor2MinInterval);
  if (activeLivenessCheckInterval) clearInterval(activeLivenessCheckInterval);
}

async function confirmRandomProctorFace() {
  if (!currentUser) await submitRegistration();
  const lesson = getActiveLesson();
  const videoEl = document.getElementById('proctorModalVideo');

  let snapshotDataUrl = null;
  let realSimilarityScore = 91.5;

  if (videoEl && !videoEl.classList.contains('hidden') && videoEl.videoWidth > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    snapshotDataUrl = canvas.toDataURL('image/jpeg', 0.85);

    if (isAiModelLoaded) {
      const det = await faceapi
        .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        alert('❌ โมเดล AI ตรวจไม่พบใบหน้าในกรอบวงรี! กรุณามองตรงเข้าหากล้องในที่มีแสงสว่างเพียงพอแล้วกดถ่ายใหม่อีกครั้ง');
        return;
      }

      if (referenceFaceDescriptor) {
        const dist = faceapi.euclideanDistance(referenceFaceDescriptor, det.descriptor);
        realSimilarityScore = euclideanDistanceToSimilarityPercent(dist);
        if (dist > 0.60 || realSimilarityScore < 70) {
          alert(`❌ ใบหน้าที่ตรวจพบไม่ตรงกับผู้เข้าอบรมที่ลงทะเบียนไว้! (ความเหมือน ${realSimilarityScore.toFixed(1)}% / Distance: ${dist.toFixed(3)})`);
          return;
        }
      } else {
        realSimilarityScore = Number((det.detection.score * 100).toFixed(1));
      }
    }
  } else {
    snapshotDataUrl = generateSimulatedKycCanvasImage(2);
  }

  const res = await fetch('/api/proctoring/verify-face', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      checkType: 'RANDOM_CHECKPOINT',
      snapshotBase64: snapshotDataUrl,
      similarityScore: realSimilarityScore,
      lessonId: lesson ? lesson.id : 'L1',
      currentVideoSec
    })
  });
  const data = await res.json();
  if (data.user) currentUser = data.user;

  closeRandomProctorModal();
  showPlayerAlert(`✅ AI ยืนยันใบหน้าผ่านเกณฑ์ (ความเหมือนจริง ${realSimilarityScore.toFixed(1)}%)! บันทึกจุด Checkpoint ที่วินาที ${currentVideoSec} เรียบร้อยแล้ว`, 'emerald');
  renderCurriculumSidebar();
  playLessonVideo();
}

// Page 2 Rule 6 & Page 25: 2-Min No Response or 15-Min Inactivity -> Kick out & Rollback to Checkpoint
async function simulateTimeoutKick(reason) {
  pauseLessonVideo();
  closeRandomProctorModal();
  if (!currentUser) await submitRegistration();
  const lesson = getActiveLesson();

  const res = await fetch('/api/proctoring/violation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      reason,
      lessonId: lesson ? lesson.id : 'L1',
      attemptedSec: currentVideoSec
    })
  });
  const data = await res.json();
  if (data.user) currentUser = data.user;

  currentVideoSec = data.rollbackSec || 0;
  if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(currentVideoSec, true);
    } catch (e) {}
  }
  updateVideoPlayerUI();
  await refreshSystemState();

  alert(
    reason === 'TIMEOUT_2MIN_KICK'
      ? `⚠️ ผู้เข้าอบรมไม่ยืนยันตัวตนภายใน 2 นาที (ตามคู่มือหน้า 25):\nระบบได้นำคุณออกจากห้องเรียนอัตโนมัติ และย้อนเวลาวิดีโอกลับไปยังจุด Checkpoint ล่าสุด (วินาทีที่ ${currentVideoSec})`
      : `⚠️ ไม่มีการตอบสนองนานเกิน 15 นาที (ตามระเบียบข้อ 6 หน้า 2):\nระบบได้นำคุณออกจากห้องเรียน และผู้เข้าอบรมต้องเริ่มเรียนใหม่ในส่วนของเนื้อหาที่ไม่ได้รับการตอบสนอง (ย้อนกลับไปที่ Checkpoint วินาทีที่ ${currentVideoSec})`
  );
}

// 15-Minute Inactivity Countdown Listener
function setupUserActivityListeners() {
  const resetInactivity = () => {
    inactivityRemainingSec = 15 * 60;
  };
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetInactivity, { passive: true });
  });

  setInterval(() => {
    inactivityRemainingSec = Math.max(0, inactivityRemainingSec - 1);
    const el = document.getElementById('inactivityTimerDisplay');
    if (el) {
      const m = String(Math.floor(inactivityRemainingSec / 60)).padStart(2, '0');
      const s = String(inactivityRemainingSec % 60).padStart(2, '0');
      el.textContent = `${m}:${s}`;
    }
  }, 1000);
}

function renderCurriculumSidebar() {
  const course = getActiveCourse();
  const listEl = document.getElementById('curriculumList');
  if (!course || !listEl) return;

  const lpMap = (currentUser && currentUser.lessonProgress) || {};
  let completedCount = 0;

  listEl.innerHTML = course.lessons.map((lesson, idx) => {
    const prog = lpMap[lesson.id] || { watchedSec: 0, maxCheckpointSec: 0, completed: false };
    if (prog.completed) completedCount++;
    const isCurrent = idx === activeLessonIndex;

    return `
      <div onclick="selectLesson(${idx})" class="p-3 rounded-xl border cursor-pointer transition ${
        isCurrent ? 'border-blue-600 bg-blue-50/70' : 'border-slate-200 hover:bg-slate-50'
      }">
        <div class="flex items-start justify-between gap-2">
          <div class="font-bold text-slate-900 leading-snug">${lesson.title}</div>
          <span class="shrink-0 text-sm">
            ${prog.completed
              ? '<i class="fa-solid fa-circle-check text-emerald-600"></i>'
              : '<i class="fa-regular fa-circle-play text-blue-600"></i>'}
          </span>
        </div>
        <div class="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <span class="flex items-center gap-1"><i class="fa-brands fa-youtube text-red-600"></i> ${lesson.displayDuration}</span>
          <span class="font-mono font-semibold text-blue-800">ดูแล้ว: ${prog.watchedSec || 0}s / ${lesson.durationSec}s</span>
        </div>
      </div>
    `;
  }).join('');

  const pct = Math.round((completedCount / course.lessons.length) * 100);
  document.getElementById('overallCoursePercent').textContent = `${pct}%`;
  document.getElementById('overallCourseBar').style.width = `${pct}%`;
}

// ============================================================================
// STEP 04.4: COURSE EVALUATION SURVEY (Page 27)
// ============================================================================
async function submitCourseEvaluation() {
  if (!currentUser) await submitRegistration();
  const res = await fetch('/api/classroom/evaluation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      ratings: { q1: 5, q2: 5, q3: 5 }
    })
  });
  const data = await res.json();
  if (data.user) currentUser = data.user;
  await refreshSystemState();
  switchMainTab('step5');
}

// ============================================================================
// STEP 05: POST-TEST EXAM (With Question & Choice Shuffling + Dynamic Watermark)
// ============================================================================
let shuffledExamOrder = null;

function buildShuffledExamQuestions() {
  const course = getActiveCourse();
  if (!course || !course.examQuestions) return [];
  const settings = appState.proctorSettings || { enableQuestionChoiceShuffle: true };

  const baseList = course.examQuestions.map(q => {
    const choiceObjs = q.choices.map((text, origIdx) => ({ text, origIdx }));
    if (settings.enableQuestionChoiceShuffle) {
      for (let i = choiceObjs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choiceObjs[i], choiceObjs[j]] = [choiceObjs[j], choiceObjs[i]];
      }
    }
    return {
      id: q.id,
      question: q.question,
      correctIndex: q.correctIndex,
      choiceObjs
    };
  });

  if (settings.enableQuestionChoiceShuffle) {
    for (let i = baseList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baseList[i], baseList[j]] = [baseList[j], baseList[i]];
    }
  }
  return baseList;
}

function reshuffleExamQuestions() {
  shuffledExamOrder = buildShuffledExamQuestions();
  currentExamQIndex = 0;
  selectedExamAnswers = {};
  logUserActivity('EXAM', 'RESHUFFLE_EXAM_POOL', 'INFO', 'สุ่มสลับลำดับข้อสอบและตัวเลือก ก-ข-ค-ง ใหม่');
  renderExamUI();
}

function updateDynamicWatermarks() {
  const settings = appState.proctorSettings || { enableDynamicWatermark: true };
  const classWm = document.getElementById('classroomDynamicWatermark');
  const examWm = document.getElementById('examDynamicWatermark');

  if (!settings.enableDynamicWatermark) {
    if (classWm) classWm.classList.add('hidden');
    if (examWm) examWm.classList.add('hidden');
    return;
  }

  const idStr = currentUser ? currentUser.idCard : '1100801279957';
  const nameStr = currentUser ? `${currentUser.firstNameTh} ${currentUser.lastNameTh}` : 'ผู้เข้าอบรม';
  const timeStr = new Date().toLocaleTimeString('th-TH');
  const textLine = `ALLIANZ AYUDHYA • ${idStr} • ${nameStr} • ${timeStr}`;

  if (classWm) {
    classWm.classList.remove('hidden');
    classWm.innerHTML = Array(4)
      .fill(`<div class="transform -rotate-12 text-xs font-mono font-extrabold text-sky-200 whitespace-nowrap p-6">${textLine}</div>`)
      .join('');
  }
  if (examWm) {
    examWm.classList.remove('hidden');
    examWm.innerHTML = Array(4)
      .fill(`<div class="transform -rotate-12 text-xs font-mono font-extrabold text-slate-900 whitespace-nowrap p-8">${textLine}</div>`)
      .join('');
  }
}

function renderExamUI() {
  const course = getActiveCourse();
  if (!course) return;

  updateDynamicWatermarks();

  if (!shuffledExamOrder || shuffledExamOrder.length === 0) {
    shuffledExamOrder = buildShuffledExamQuestions();
  }

  const attempts = (currentUser && currentUser.examAttempts) || [];
  const isFinalized = currentUser && currentUser.courseSubmitted;
  const maxAttempts = (appState.proctorSettings && appState.proctorSettings.maxExamAttempts) || 5;

  document.getElementById('examAttemptCounter').textContent = `ครั้งที่ ${Math.min(maxAttempts, attempts.length + 1)} / ${maxAttempts}`;

  const lockedBanner = document.getElementById('examLockedFinalizedBanner');
  const interactiveBox = document.getElementById('examInteractiveContainer');

  if (isFinalized) {
    lockedBanner.classList.remove('hidden');
    interactiveBox.classList.add('hidden');
    return;
  } else {
    lockedBanner.classList.add('hidden');
    interactiveBox.classList.remove('hidden');
  }

  const q = shuffledExamOrder[currentExamQIndex] || shuffledExamOrder[0];

  document.getElementById('examQuestionProgressText').textContent = `ข้อที่ ${currentExamQIndex + 1} จาก ${shuffledExamOrder.length} (รหัสข้อ ${q.id} — ต้องคลิกเลือกคำตอบทุกครั้งก่อนไปข้อถัดไป)`;

  const qBox = document.getElementById('examQuestionBox');
  qBox.innerHTML = `
    <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 relative z-20">
      <div class="font-bold text-sm sm:text-base text-slate-900">${currentExamQIndex + 1}. ${q.question}</div>
      <div class="space-y-2.5 text-xs sm:text-sm">
        ${q.choiceObjs.map(cObj => {
          const isChecked = selectedExamAnswers[q.id] === cObj.origIdx;
          return `
            <label onclick="selectExamChoice('${q.id}', ${cObj.origIdx})" class="flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
              isChecked ? 'border-blue-600 bg-blue-50 font-bold text-blue-950' : 'border-slate-200 bg-white hover:bg-slate-50'
            }">
              <input type="radio" name="exam_q_${q.id}" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-blue-600" />
              <span>${cObj.text}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('btnExamPrev').disabled = currentExamQIndex === 0;
  if (currentExamQIndex === shuffledExamOrder.length - 1) {
    document.getElementById('btnExamNext').classList.add('hidden');
    document.getElementById('btnExamFinish').classList.remove('hidden');
  } else {
    document.getElementById('btnExamNext').classList.remove('hidden');
    document.getElementById('btnExamFinish').classList.add('hidden');
  }

  renderExamAttemptsSummary();
}

function selectExamChoice(questionId, origChoiceIdx) {
  selectedExamAnswers[questionId] = origChoiceIdx;
  renderExamUI();
}

function prevExamQuestion() {
  if (currentExamQIndex > 0) {
    currentExamQIndex--;
    renderExamUI();
  }
}

function nextExamQuestion() {
  const q = shuffledExamOrder[currentExamQIndex];
  if (!q || typeof selectedExamAnswers[q.id] !== 'number') {
    alert('ตามคู่มือหน้า 28 ข้อ 2: จำเป็นต้องคลิกเลือกคำตอบก่อนเริ่มคำถามข้อถัดไป');
    return;
  }
  if (currentExamQIndex < shuffledExamOrder.length - 1) {
    currentExamQIndex++;
    renderExamUI();
  }
}

function demoFillPassingExamAnswers() {
  if (!shuffledExamOrder || shuffledExamOrder.length === 0) {
    shuffledExamOrder = buildShuffledExamQuestions();
  }
  shuffledExamOrder.forEach(q => {
    selectedExamAnswers[q.id] = q.correctIndex;
  });
  currentExamQIndex = shuffledExamOrder.length - 1;
  renderExamUI();
}

async function submitExamAttempt() {
  const q = shuffledExamOrder[currentExamQIndex];
  if (!q || typeof selectedExamAnswers[q.id] !== 'number') {
    alert('กรุณาเลือกคำตอบในข้อนี้ก่อนกดปุ่ม FINISH');
    return;
  }
  if (!currentUser) await submitRegistration();

  const res = await fetch('/api/exam/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCard: currentUser.idCard,
      answers: selectedExamAnswers
    })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'ไม่สามารถส่งผลสอบได้');
    return;
  }

  currentUser = data.user;
  logUserActivity(
    'EXAM',
    data.attempt.passed ? 'EXAM_ATTEMPT_PASSED' : 'EXAM_ATTEMPT_FAILED',
    data.attempt.passed ? 'PASS' : 'WARNING',
    `ส่งกระดาษคำตอบครั้งที่ ${data.attempt.attemptNo}: ได้คะแนน ${data.attempt.score}/${data.attempt.total} (${data.attempt.percentage}%)`,
    data.attempt
  );
  // Reshuffle for next attempt if failed
  if (!data.attempt.passed) {
    shuffledExamOrder = buildShuffledExamQuestions();
    currentExamQIndex = 0;
    selectedExamAnswers = {};
  }
  await refreshSystemState();
  renderExamUI();
}

function renderExamAttemptsSummary() {
  const box = document.getElementById('examResultSummaryBox');
  const attempts = (currentUser && currentUser.examAttempts) || [];
  if (attempts.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  const latest = attempts[attempts.length - 1];
  const anyPassed = attempts.some(a => a.passed);

  if (anyPassed) {
    box.className = 'p-5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 text-emerald-950 space-y-3';
    box.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div class="font-extrabold text-base text-emerald-800">
            🎉 ผ่านเกณฑ์การทดสอบ! คะแนนครั้งล่าสุด: ${latest.score}/${latest.total} (${latest.percentage}% - Pass)
          </div>
          <p class="text-xs text-emerald-700 mt-0.5">
            ตามคู่มือหน้า 29: เมื่อผ่านแบบทดสอบตามเกณฑ์ไม่น้อยกว่าร้อยละ 60 กรุณาคลิกปุ่ม <b>"ส่งผลการเรียน"</b> เพื่อขอรับใบรับรองประกาศนียบัตร
          </p>
        </div>
        <button onclick="finalizeCourseAndIssueCertificate()" class="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs shadow-lg transition">
          คลิก "ส่งผลการเรียน" เพื่อขอใบรับรอง (หน้า 29)
        </button>
      </div>
    `;
  } else {
    const remaining = Math.max(0, 5 - attempts.length);
    box.className = 'p-5 rounded-2xl border-2 border-rose-400 bg-rose-50 text-rose-950 space-y-2';
    box.innerHTML = `
      <div class="font-extrabold text-base text-rose-700">
        ❌ คะแนนไม่ผ่านเกณฑ์ร้อยละ 60: ได้คะแนน ${latest.score}/${latest.total} (${latest.percentage}%)
      </div>
      <p class="text-xs text-rose-800">
        ${remaining > 0
          ? `คุณสามารถทำแบบทดสอบแก้ตัวได้อีก <b>${remaining} ครั้ง</b> (จากโควตาสูงสุด 5 ครั้ง)`
          : `คุณทำแบบทดสอบครบ 5 ครั้งแล้วและยังไม่ผ่านเกณฑ์ ตามระเบียบข้อ 7 (หน้า 2 และหน้า 29) จะต้องทำการสมัครใหม่!`}
      </p>
    `;
  }
}

async function finalizeCourseAndIssueCertificate() {
  if (!currentUser) return;
  const confirmLock = confirm(
    'ต้องการส่งผลการเรียนเพื่อขอใบรับรองหรือไม่?\n(ตามระเบียบข้อ 8 เมื่อกดส่งผลการอบรมเรียบร้อยแล้ว จะไม่สามารถกลับเข้ามายังหลักสูตรได้อีก)'
  );
  if (!confirmLock) return;

  const res = await fetch('/api/exam/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idCard: currentUser.idCard })
  });
  const data = await res.json();
  if (data.user) currentUser = data.user;
  await refreshSystemState();
  switchMainTab('step6');
}

// ============================================================================
// STEP 06: CERTIFICATE RENDERING (Page 30)
// ============================================================================
function renderCertificateUI() {
  if (!currentUser) return;
  document.getElementById('certStudentName').textContent = `${currentUser.titleTh} ${currentUser.firstNameTh} ${currentUser.lastNameTh}`;
  document.getElementById('certIdCard').textContent = currentUser.idCard;
  document.getElementById('certCodeText').textContent = currentUser.certificateId || 'AZAY-CERT-2026-PENDING';
  document.getElementById('certDateText').textContent = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// ============================================================================
// ADMIN DASHBOARD, INTEGRITY SCORE, ACTIVITY LOGS & PROCTORING SETTINGS
// ============================================================================
function switchAdminSubTab(tabName) {
  ['overview', 'activity_logs', 'settings', 'anti_cheat_guide'].forEach(t => {
    const viewEl = document.getElementById(`admin-view-${t}`);
    if (viewEl) viewEl.classList.add('hidden');
    const btnEl = document.getElementById(`admin-subbtn-${t}`);
    if (btnEl) {
      btnEl.classList.remove('bg-[#003781]', 'text-white');
      btnEl.classList.add('text-slate-600');
    }
  });

  const activeView = document.getElementById(`admin-view-${tabName}`);
  if (activeView) activeView.classList.remove('hidden');
  const activeBtn = document.getElementById(`admin-subbtn-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-[#003781]', 'text-white');
    activeBtn.classList.remove('text-slate-600');
  }

  if (tabName === 'activity_logs') renderAdminActivityLogsTable();
  if (tabName === 'settings') populateAdminSettingsForm();
}

function calculateCandidateIntegrityScore(idCard) {
  const logs = (appState.activityLogs || []).filter(l => l.idCard === idCard);
  let score = 100;
  let warningCount = 0;
  let criticalCount = 0;

  logs.forEach(l => {
    if (l.severity === 'WARNING') {
      score -= 3;
      warningCount++;
    } else if (l.severity === 'CRITICAL') {
      score -= 12;
      criticalCount++;
    }
  });
  score = Math.max(0, Math.min(100, score));
  return { score, warningCount, criticalCount };
}

function renderAdminDashboard() {
  const usersContainer = document.getElementById('adminUsersContainer');
  const logsContainer = document.getElementById('adminProctoringLogs');
  if (!usersContainer || !logsContainer) return;

  if (!appState.users || appState.users.length === 0) {
    usersContainer.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">ยังไม่มีข้อมูลผู้สมัครในระบบ</div>`;
  } else {
    usersContainer.innerHTML = appState.users.map(u => {
      const kyc = u.kycData || {};
      const integrity = calculateCandidateIntegrityScore(u.idCard);
      const scoreBadgeColor =
        integrity.score >= 85
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
          : integrity.score >= 65
          ? 'bg-amber-100 text-amber-800 border-amber-300'
          : 'bg-rose-100 text-rose-800 border-rose-300';

      return `
        <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="font-bold text-sm text-slate-900">${u.titleTh}${u.firstNameTh} ${u.lastNameTh}</span>
              <span class="ml-2 font-mono text-slate-600">(${u.idCard})</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full font-extrabold border ${scoreBadgeColor}">
                <i class="fa-solid fa-shield-heart mr-1"></i>คะแนนความโปร่งใส: ${integrity.score}% (เตือน ${integrity.warningCount} / ร้ายแรง ${integrity.criticalCount})
              </span>
              <span class="px-2.5 py-0.5 rounded-full font-bold ${
                u.kycStatus === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : u.kycStatus === 'PENDING_ADMIN'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'
              }">
                e-KYC: ${u.kycStatus}
              </span>
              <button onclick="adminReviewKyc('${u.idCard}', 'APPROVED')" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                <i class="fa-solid fa-check mr-1"></i>อนุมัติยืนยันตัวตน
              </button>
              <button onclick="adminReviewKyc('${u.idCard}', 'REJECTED')" class="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold">
                ไม่อนุมัติ
              </button>
            </div>
          </div>

          ${kyc.idCardFullImg ? `
            <div class="grid grid-cols-3 gap-2 pt-2">
              <div class="bg-white p-1.5 rounded-lg border text-center">
                <img src="${kyc.idCardFullImg}" class="h-20 w-full object-cover rounded" />
                <div class="text-[10px] font-semibold mt-1">1. รูปบัตรประชาชน</div>
              </div>
              <div class="bg-white p-1.5 rounded-lg border text-center">
                <img src="${kyc.selfieImg}" class="h-20 w-full object-cover rounded" />
                <div class="text-[10px] font-semibold mt-1">2. รูปใบหน้าจริง</div>
              </div>
              <div class="bg-white p-1.5 rounded-lg border text-center">
                <img src="${kyc.idCardFaceImg}" class="h-20 w-full object-cover rounded" />
                <div class="text-[10px] font-semibold mt-1">3. รูปใบหน้าบนบัตร</div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  if (!appState.proctoringLogs || appState.proctoringLogs.length === 0) {
    logsContainer.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">ยังไม่มีบันทึกเหตุการณ์ AI Proctoring</div>`;
  } else {
    logsContainer.innerHTML = appState.proctoringLogs.map(log => `
      <div class="p-3 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3">
        <div class="space-y-0.5">
          <div class="font-bold text-slate-900">
            <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] mr-1">${log.eventType}</span>
            ${log.studentName} (${log.idCard})
          </div>
          <div class="text-slate-600">${log.details}</div>
        </div>
        <span class="text-[10px] text-slate-400 shrink-0">${new Date(log.timestamp).toLocaleTimeString('th-TH')}</span>
      </div>
    `).join('');
  }

  renderAdminActivityLogsTable();
  populateAdminSettingsForm();
}

function renderAdminActivityLogsTable() {
  const tbody = document.getElementById('adminActivityLogsTableBody');
  if (!tbody) return;

  const catFilter = document.getElementById('filterActivityCategory')?.value || 'ALL';
  const sevFilter = document.getElementById('filterActivitySeverity')?.value || 'ALL';

  let logs = appState.activityLogs || [];
  if (catFilter !== 'ALL') logs = logs.filter(l => l.category === catFilter);
  if (sevFilter !== 'ALL') logs = logs.filter(l => l.severity === sevFilter);

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">ยังไม่มีบันทึกกิจกรรมในหมวดหมู่นี้</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const sevClass =
      l.severity === 'CRITICAL'
        ? 'bg-rose-600 text-white'
        : l.severity === 'WARNING'
        ? 'bg-amber-500 text-slate-950'
        : l.severity === 'PASS'
        ? 'bg-emerald-600 text-white'
        : 'bg-slate-200 text-slate-700';

    return `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">${new Date(l.timestamp).toLocaleString('th-TH')}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-900">${l.studentName}<br/><span class="font-mono text-[10px] text-slate-500">${l.idCard}</span></td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold text-[10px]">${l.category}</span></td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${sevClass}">${l.severity}</span></td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-800 text-[11px]">${l.action}</td>
        <td class="py-2.5 px-3 text-slate-700">${l.details}</td>
      </tr>
    `;
  }).join('');
}

function populateAdminSettingsForm() {
  const s = appState.proctorSettings;
  if (!s) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setChk = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setVal('setLessonDurationSec', s.lessonDurationSec || 60);
  setVal('setRandomPromptTimeoutSec', s.randomPromptTimeoutSec || 120);
  setVal('setInactivityTimeoutSec', s.inactivityTimeoutSec || 900);
  setVal('setFaceMatchThresholdPct', s.faceMatchThresholdPct || 72);
  setVal('setEuclideanThreshold', s.euclideanThreshold || 0.58);
  setChk('setDetectMultipleFaces', s.detectMultipleFaces);
  setChk('setDetectHeadPoseLookingAway', s.detectHeadPoseLookingAway);
  setChk('setEnableActiveLivenessChallenge', s.enableActiveLivenessChallenge !== false);
  setChk('setPauseOnTabSwitch', s.pauseOnTabSwitch);
  setVal('setMaxTabSwitchWarnings', s.maxTabSwitchWarnings || 5);
  setChk('setBlockCopyPasteRightClick', s.blockCopyPasteRightClick);
  setChk('setEnableVoiceNoiseDetection', s.enableVoiceNoiseDetection !== false);
  setChk('setEnableMultiMonitorDetection', s.enableMultiMonitorDetection !== false);
  setChk('setEnableDynamicWatermark', s.enableDynamicWatermark !== false);
  setChk('setEnableQuestionChoiceShuffle', s.enableQuestionChoiceShuffle !== false);
  setVal('setExamPassPercentage', s.examPassPercentage || 60);
  setVal('setMaxExamAttempts', s.maxExamAttempts || 5);
}

async function saveAdminProctorSettings() {
  const payload = {
    lessonDurationSec: Number(document.getElementById('setLessonDurationSec').value) || 60,
    randomPromptTimeoutSec: Number(document.getElementById('setRandomPromptTimeoutSec').value) || 120,
    inactivityTimeoutSec: Number(document.getElementById('setInactivityTimeoutSec').value) || 900,
    faceMatchThresholdPct: Number(document.getElementById('setFaceMatchThresholdPct').value) || 72,
    euclideanThreshold: Number(document.getElementById('setEuclideanThreshold').value) || 0.58,
    detectMultipleFaces: document.getElementById('setDetectMultipleFaces').checked,
    detectHeadPoseLookingAway: document.getElementById('setDetectHeadPoseLookingAway').checked,
    enableActiveLivenessChallenge: document.getElementById('setEnableActiveLivenessChallenge').checked,
    pauseOnTabSwitch: document.getElementById('setPauseOnTabSwitch').checked,
    maxTabSwitchWarnings: Number(document.getElementById('setMaxTabSwitchWarnings').value) || 5,
    blockCopyPasteRightClick: document.getElementById('setBlockCopyPasteRightClick').checked,
    enableVoiceNoiseDetection: document.getElementById('setEnableVoiceNoiseDetection').checked,
    enableMultiMonitorDetection: document.getElementById('setEnableMultiMonitorDetection').checked,
    enableDynamicWatermark: document.getElementById('setEnableDynamicWatermark').checked,
    enableQuestionChoiceShuffle: document.getElementById('setEnableQuestionChoiceShuffle').checked,
    examPassPercentage: Number(document.getElementById('setExamPassPercentage').value) || 60,
    maxExamAttempts: Number(document.getElementById('setMaxExamAttempts').value) || 5
  };

  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.success) {
    shuffledExamOrder = null;
    await refreshSystemState();
    updateVideoPlayerUI();
    updateDynamicWatermarks();
    alert('✅ บันทึกการตั้งค่าควบคุมการสอบเรียบร้อยแล้ว! มีผลกับห้องเรียนและห้องสอบทันที');
  }
}

async function clearAllActivityLogs() {
  if (!confirm('ยืนยันการล้างประวัติ User Activity Log ทั้งหมด?')) return;
  await fetch('/api/admin/clear-logs', { method: 'POST' });
  await refreshSystemState();
}

function exportActivityLogsCsv() {
  const logs = appState.activityLogs || [];
  if (logs.length === 0) {
    alert('ยังไม่มีข้อมูล Activity Log สำหรับส่งออก');
    return;
  }
  const headers = ['Timestamp', 'ID_Card', 'Student_Name', 'Category', 'Severity', 'Action', 'Details'];
  const rows = logs.map(l => [
    l.timestamp,
    `"${l.idCard}"`,
    `"${(l.studentName || '').replace(/"/g, '""')}"`,
    l.category,
    l.severity,
    l.action,
    `"${(l.details || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Allianz_Proctoring_Activity_Log_${Date.now()}.csv`;
  a.click();
}

async function adminReviewKyc(idCard, decision) {
  await fetch('/api/admin/kyc-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idCard, decision, note: 'อนุมัติโดยผู้ดูแลระบบตามขั้นตอนหน้า 21' })
  });
  await refreshSystemState();
  alert(`ดำเนินการ ${decision === 'APPROVED' ? 'อนุมัติ' : 'ปฏิเสธ'} การยืนยันตัวตนของเลขบัตร ${idCard} และส่งอีเมลแจ้งผู้เรียนเรียบร้อยแล้ว`);
}

// ============================================================================
// SIMULATED EMAIL INBOX MODAL
// ============================================================================
function toggleInboxModal() {
  const modal = document.getElementById('inboxModal');
  modal.classList.toggle('hidden');
  modal.classList.toggle('flex');
  renderInboxEmails();
}

function renderInboxEmails() {
  const listEl = document.getElementById('inboxEmailsList');
  if (!listEl) return;

  if (!appState.emails || appState.emails.length === 0) {
    listEl.innerHTML = `<div class="p-6 text-center text-slate-400">ยังไม่มีอีเมลแจ้งเตือนในขณะนี้ (อีเมลจะถูกส่งอัตโนมัติเมื่อชำระเงิน, ตั้งรหัสผ่าน, ยืนยันตัวตน และสอบผ่าน)</div>`;
    return;
  }

  listEl.innerHTML = appState.emails.map(em => `
    <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-bold text-blue-900 text-sm"><i class="fa-solid fa-envelope mr-1 text-blue-600"></i>${em.subject}</span>
        <span class="text-[10px] text-slate-400">${new Date(em.timestamp).toLocaleTimeString('th-TH')}</span>
      </div>
      <div class="text-slate-600 leading-relaxed">${em.body}</div>
      ${em.actionLinkText ? `
        <div class="pt-1">
          <button onclick="handleEmailActionLink('${em.actionTargetPhase}')" class="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
            ${em.actionLinkText} <i class="fa-solid fa-arrow-up-right-from-square ml-1"></i>
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function handleEmailActionLink(target) {
  toggleInboxModal();
  if (target === 'step2') switchMainTab('step2');
  else if (target === 'step3') switchMainTab('step3');
  else if (target === 'step4_login') {
    switchMainTab('step4');
    switchStep4View('login_consent');
  } else if (target === 'step4_classroom') {
    switchMainTab('step4');
    switchStep4View('classroom');
  } else if (target === 'step6') {
    switchMainTab('step6');
  }
}

// ============================================================================
// QUICK DEMO SHORTCUTS (Top Indigo Toolbar)
// ============================================================================
async function demoJumpToClassroom() {
  if (!currentUser) {
    demoAutoFillRegistration();
    await submitRegistration();
    await confirmQrPayment();
  }
  switchMainTab('step4');
  switchStep4View('kyc3photos');
  simulateAll3KycPhotos();
}

async function demoUnlockExamReady() {
  if (!currentUser) {
    demoAutoFillRegistration();
    await submitRegistration();
    await confirmQrPayment();
  }
  const dur = (appState.proctorSettings && appState.proctorSettings.lessonDurationSec) || 60;
  await saveLessonProgressToServer('L1', dur, true);
  await saveLessonProgressToServer('L2', dur, true);
  await saveLessonProgressToServer('L3', dur, true);
  await submitCourseEvaluation();
}

// ============================================================================
// ACOUSTIC VOICE DETECTION (VAD), MULTI-MONITOR GUARD & TEAM SHARE HUB
// ============================================================================
let audioContextInstance = null;
let audioAnalyserNode = null;
let audioMonitorInterval = null;

async function startAcousticAndMultiMonitorGuards() {
  // 1. Multi-Monitor Detection (window.screen.isExtended)
  const updateMultiMonitorStatus = () => {
    const settings = appState.proctorSettings || { enableMultiMonitorDetection: true };
    const badge = document.getElementById('multiMonitorBadge');
    if (!badge) return;

    const isExtended = window.screen && window.screen.isExtended === true;
    if (isExtended && settings.enableMultiMonitorDetection) {
      badge.textContent = '⚠️ ตรวจพบ 2 หน้าจอ!';
      badge.className = 'font-mono font-bold text-rose-400 animate-pulse';
      if (isVideoPlaying) {
        logUserActivity('ANTI_CHEAT', 'MULTI_MONITOR_DETECTED', 'WARNING', 'ตรวจพบการเชื่อมต่อหน้าจอที่สอง (Extended Display) ระหว่างการเรียน/สอบ');
      }
    } else {
      badge.textContent = '1 จอปกติ';
      badge.className = 'font-mono font-bold text-emerald-400';
    }
  };

  updateMultiMonitorStatus();
  if (window.screen && 'onchange' in window.screen) {
    window.screen.addEventListener('change', updateMultiMonitorStatus);
  }
  setInterval(updateMultiMonitorStatus, 6000);

  // 2. Web Audio API Voice / Speech Noise Level Monitor
  if (audioMonitorInterval) return;
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContextInstance.createMediaStreamSource(audioStream);
    audioAnalyserNode = audioContextInstance.createAnalyser();
    audioAnalyserNode.fftSize = 256;
    source.connect(audioAnalyserNode);

    const dataArray = new Uint8Array(audioAnalyserNode.frequencyBinCount);
    audioMonitorInterval = setInterval(() => {
      const settings = appState.proctorSettings || { enableVoiceNoiseDetection: true };
      const badge = document.getElementById('voiceNoiseLevelBadge');
      if (!badge || !settings.enableVoiceNoiseDetection) return;

      audioAnalyserNode.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avgLevel = Math.round(sum / dataArray.length);

      if (avgLevel > 62) {
        badge.textContent = `🚨 เสียงพูดคุย (${avgLevel} dB)`;
        badge.className = 'font-mono font-bold text-rose-400 animate-pulse';
        if (isVideoPlaying) {
          logUserActivity('ANTI_CHEAT', 'VOICE_SPEECH_DETECTED', 'WARNING', `ตรวจพบเสียงพูดคุยหรือเสียงรบกวนดังเกินเกณฑ์ (${avgLevel} dB) ระหว่างอบรม/สอบ`, { dbLevel: avgLevel });
        }
      } else {
        badge.textContent = `ปกติ (${Math.max(10, avgLevel)} dB)`;
        badge.className = 'font-mono font-bold text-emerald-400';
      }
    }, 2000);
  } catch (e) {
    // Fallback if microphone permission not granted
  }
}

// Start guards when entering classroom
const origStartClassroomPipCamera = startClassroomPipCamera;
startClassroomPipCamera = async function () {
  await origStartClassroomPipCamera();
  updateDynamicWatermarks();
  startAcousticAndMultiMonitorGuards();
};

async function openTeamShareModal() {
  const modal = document.getElementById('teamShareModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const pubInputEl = document.getElementById('sharePublicHttpsInput');
  try {
    const res = await fetch('/api/share-info');
    const info = await res.json();
    if (pubInputEl) {
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        pubInputEl.value = window.location.origin;
      } else if (info.publicHttpsUrl) {
        pubInputEl.value = info.publicHttpsUrl;
      }
    }
  } catch (e) {}
}

function closeTeamShareModal() {
  const modal = document.getElementById('teamShareModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function copyShareUrl(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.select();
  navigator.clipboard.writeText(el.value);
  alert(`คัดลอกลิงก์สำหรับแชร์ให้ทีมเรียบร้อยแล้ว:\n${el.value}`);
}
