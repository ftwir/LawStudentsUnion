const { GoogleGenAI } = require("@google/genai");

async function answerAssistant({ user, activity, unreadNotifications, conversations, message }) {
  const text = String(message || "").trim().slice(0, 4000);
  if (!text) return "اكتب سؤالك أولاً.";

  const fallback = () => {
    const page = activity?.current_page || "home";
    const resource = activity?.resource_type && activity?.resource_id ? activity.resource_type + " #" + activity.resource_id : "";
    return "أنا مساعد LSU Guardian. آخر نشاط محفوظ لك هو صفحة " + page + (resource ? " (" + resource + ")" : "") +
      ". لديك " + Number(unreadNotifications || 0) + " إشعار غير مقروء و" + Number(conversations || 0) +
      " محادثة. أستطيع مساعدتك في فهم خطوات التسجيل، الدردشة، النشر والتفاعل، لكنني لا أنفذ أوامر برمجية أو أتعامل مع كلمات المرور.";
  };

  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback();

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const prompt = [
      "أنت LSU Guardian، مساعد تشغيلي محدود داخل تطبيق اتحاد طلبة كلية القانون.",
      "مهمتك مساعدة المستخدم في التنقل وفهم التسجيل والدردشة والنشر والإشعارات والنشاط.",
      "لا تطلب كلمة مرور أو رمز جلسة أو مفتاح قاعدة بيانات.",
      "لا تنفذ SQL ولا كود ولا تعد بتغيير النظام. لا تدّعي تنفيذ إجراء لم يحدث.",
      "اعتمد فقط على سياق المستخدم المرفق. إذا لم تعرف، قل ذلك بوضوح واقترح المسار الصحيح داخل التطبيق.",
      "أجب بالعربية الواضحة وباختصار.",
      "",
      "المستخدم: " + JSON.stringify({ id:user?.id, role:user?.role, name:user?.full_name }),
      "النشاط المحفوظ: " + JSON.stringify(activity || null),
      "الإشعارات غير المقروءة: " + Number(unreadNotifications || 0),
      "عدد المحادثات: " + Number(conversations || 0),
      "سؤال المستخدم: " + text
    ].join("\n");
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_ASSISTANT_MODEL || "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0.2 }
    });
    const result = String(response.text || "").trim();
    return result || fallback();
  } catch (error) {
    console.error("assistant generation failed:", error.message);
    return fallback();
  }
}

module.exports = { answerAssistant };
