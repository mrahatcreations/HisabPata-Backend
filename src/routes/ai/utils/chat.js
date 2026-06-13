const { prisma } = require('../../../config/database');

const saveAiChatTurn = async ({ userId, userMessage, assistantMessage, bookId, model, provider, intent }) => {
  const userText = String(userMessage || '').trim();
  const assistantText = String(assistantMessage || '').trim();
  if (!userId || !userText || !assistantText) return;
  try {
    await prisma.aiChatMessage.createMany({
      data: [
        { userId, role: 'user', content: userText, bookId: bookId || null, model: model || null, provider: provider || null, intent: intent || null },
        { userId, role: 'assistant', content: assistantText, bookId: bookId || null, model: model || null, provider: provider || null, intent: intent || null },
      ],
    });
  } catch (error) {
    console.error('[AI Chat] Failed to save turn:', error);
  }
};

async function loadUserAiConfig(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiConfig: true },
  });
  return user?.aiConfig || null;
}

function resolveAiRequestConfig(body, storedConfig) {
  const cfg = storedConfig && typeof storedConfig === 'object' ? storedConfig : {};
  return {
    provider: body.provider || cfg.provider,
    apiKey: body.apiKey || cfg.apiKey,
    model: body.model || cfg.selectedModel,
    baseUrl: body.baseUrl || cfg.baseUrl || null,
    temperature: body.temperature != null ? parseFloat(body.temperature) : cfg.temperature,
    maxTokens: body.maxTokens != null ? parseInt(body.maxTokens, 10) : cfg.maxTokens,
  };
}

const fs = require('fs');
const path = require('path');

async function saveNativeAiLog(userMessage, systemPrompt, assistantMessage, model) {
  try {
    const logDir = path.join(__dirname, '../../../../data');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'native_ai_logs.jsonl');
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      model: model,
      messages: [
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: userMessage || '' },
        { role: 'assistant', content: assistantMessage || '' }
      ]
    };
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
  } catch (error) {
    console.error('[AI Log] Failed to save native AI JSON log:', error);
  }
}

module.exports = {
  saveAiChatTurn,
  loadUserAiConfig,
  resolveAiRequestConfig,
  saveNativeAiLog,
};
