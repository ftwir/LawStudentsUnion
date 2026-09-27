function normalizePhone(value) {
  return String(value || "").replace(/[^0-9+]/g, "");
}

function evaluateRegistration(input, db = {}) {
  const flags = [];
  let score = 0;
  const fullName = String(input.full_name || "").trim();
  const studentId = String(input.student_id || "").trim();
  const phone = normalizePhone(input.phone);
  const email = String(input.email || "").trim().toLowerCase();

  if (fullName.length < 5) { flags.push("short_name"); score += 15; }
  if (!/^[\p{L}][\p{L}\s.'-]{3,149}$/u.test(fullName)) { flags.push("name_format"); score += 15; }
  if (!studentId || studentId.length < 2) { flags.push("invalid_student_id"); score += 30; }
  if (phone.length < 8) { flags.push("invalid_phone"); score += 25; }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) { flags.push("invalid_email"); score += 20; }
  if (db.studentIdExists) { flags.push("duplicate_student_id"); score += 70; }
  if (db.emailExists) { flags.push("duplicate_email"); score += 60; }
  if (db.phoneExists) { flags.push("duplicate_phone"); score += 50; }
  if (db.pendingRegistrationExists) { flags.push("duplicate_pending_registration"); score += 45; }

  const risk = score >= 70 ? "high" : score >= 35 ? "medium" : "low";
  return {
    risk_level:risk,
    score:Math.min(100,score),
    flags,
    normalized:{ full_name:fullName, student_id:studentId, phone, email }
  };
}

function registrationPrompt(input, assessment) {
  const labels = {
    high:"يتطلب مراجعة إدارية",
    medium:"مراجعة عادية مطلوبة",
    low:"لا توجد إشارات غير اعتيادية"
  };
  return labels[assessment.risk_level] || "مراجعة إدارية";
}

module.exports = { normalizePhone, evaluateRegistration, registrationPrompt };
