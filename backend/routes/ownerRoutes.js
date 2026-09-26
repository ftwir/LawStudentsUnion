const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { Octokit } = require('@octokit/rest');

// تهيئة Gemini API و Octokit
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const REPO_OWNER = 'ftwir';
const REPO_NAME = 'LawStudentsUnion';

/**
 * Middleware: التحقق المرن من رمز الحماية للمالك
 */
function authenticateOwner(req, res, next) {
  const masterPasscode = process.env.OWNER_MASTER_PASSCODE || '123456';
  
  // استقبال الرمز من كل الطرق الممكنة (Headers أو Body أو Query)
  const providedPasscode = 
    req.headers['x-owner-passcode'] || 
    req.body?.passcode || 
    req.query?.passcode;

  if (providedPasscode && providedPasscode === masterPasscode) {
    return next();
  }

  return res.status(401).json({
    status: 'error',
    message: 'Manager authentication required. يرجى كتابة رمز الحماية الصحيح.'
  });
}

// تطبيق الحماية على جميع المسارات
router.use(authenticateOwner);

/**
 * 👑 POST /api/owner/ai-execute
 */
router.post('/ai-execute', async (req, res) => {
  const { command, filePath } = req.body;

  if (!command || !filePath) {
    return res.status(400).json({ error: 'يرجى تحديد الأمر ومسار الملف.' });
  }

  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      ref: 'main',,
    });

    const currentCode = Buffer.from(fileData.content, 'base64').toString('utf-8');

    const prompt = `
You are the Executive Owner AI Architect for "Law Students Union".
Target File: ${filePath}
Current Code:
${currentCode}

Owner Command:
${command}

Return ONLY valid code without markdown or explanation.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { temperature: 0.1 },
    });

    let updatedCode = response.text.trim();
    if (updatedCode.startsWith('```')) {
      updatedCode = updatedCode.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    }

    const commitMessage = `feat(acm-owner): ${command.slice(0, 50)}`;
    const { data: commitResult } = await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      message: commitMessage,
      content: Buffer.from(updatedCode).toString('base64'),
      sha: fileData.sha,
      branch: 'main',
    });

    res.json({
      status: 'success',
      message: 'تم تنفيذ التعديل بنجاح ورفعه على main.',
      filePath,
      commitSha: commitResult.commit.sha,
      commitUrl: commitResult.commit.html_url,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'حدث خطأ أثناء معالجة الأمر.' });
  }
});

/**
 * 📊 GET /api/owner/metrics
 */
router.get('/metrics', (req, res) => {
  res.json({
    activeStudents: 142,
    totalPosts: 389,
    activeChats: 12,
    systemStatus: 'Healthy (Render CD Active)',
    lastDeploy: new Date().toISOString(),
  });
});

module.exports = router;
