const { prisma } = require('../../../config/database');
const {
  getLastUserMessage,
  detectAiIntent,
  parseTransactionHints,
  resolveBookFromMessage,
  extractTransactionPreviewNotes,
  stripAiActionBlocks,
  AI_ACTION_BLOCK_REGEX,
  resolveAiTransactionNote,
} = require('./parse');
const {
  formatBalanceDataBlock,
  formatTransactionsDataBlock,
} = require('./format');
const { saveAiChatTurn } = require('./chat');

const buildTransactionAction = (hints, lastUserMessage, bookRecord) => ({
  action: 'create_transaction',
  data: {
    bookId: bookRecord.id,
    bookName: bookRecord.name,
    orgName: bookRecord.organization?.name || 'Unknown',
    type: hints.type,
    amount: hints.amount,
    category: hints.category,
    note: resolveAiTransactionNote({
      note: '',
      description: '',
      amount: hints.amount,
      previewNotes: [{ note: lastUserMessage, amount: hints.amount }],
      lastUserMessage,
      category: hints.category,
    }),
    dateTime: new Date().toISOString(),
    contact: '',
    recipientUserId: null,
    orgFundId: null,
  },
  valid: true,
});

const tryDeterministicAiResponse = async (messages, agentCtx, userId) => {
  return { handled: false };
};

const prepareAiAgentRequest = async (userId, bookId, messages) => {
  const userOrgs = await prisma.organizationMember.findMany({
    where: { userId, status: 'active' },
    include: { organization: { include: { books: true } } },
  });

  const booksWithOrg = userOrgs.flatMap(m =>
    m.organization.books.map(b => ({
      book: b,
      orgName: m.organization.name,
      isPersonal: m.organization.isPersonal,
      role: m.role,
    }))
  );

  const availableOrgFunds = booksWithOrg
    .filter(x => !x.isPersonal && (x.role === 'admin' || x.role === 'editor'))
    .map(x => `"${x.orgName}" (orgFundId: ${x.book.id})`)
    .join(', ');

  const allBooks = booksWithOrg.map(x => x.book);
  let contextBookId = resolveBookFromMessage(getLastUserMessage(messages), booksWithOrg, bookId);
  if (!contextBookId && allBooks.length > 0) {
    contextBookId = (allBooks.find(b => b.isDefault) || allBooks[0]).id;
  }

  const userData = await prisma.user.findUnique({ where: { id: userId } });
  const intent = detectAiIntent(messages);
  const lastUserMessage = getLastUserMessage(messages);
  const booksForAiTxn = booksWithOrg.filter(({ role, isPersonal }) =>
    isPersonal || role === 'admin' || role === 'editor'
  );
  const transactionHints = parseTransactionHints(lastUserMessage, booksForAiTxn, contextBookId);
  const activeBookEntry = booksWithOrg.find(x => x.book.id === contextBookId);
  const recommendedTemperature =
    intent === 'transaction' ? 0.35 : intent === 'general' ? 0.72 : 0.58;

  const today = new Date().toISOString().split('T')[0];

  let dataContextSection = '';
  const serverToolData = {};
  
  if (availableOrgFunds.length > 0) {
    dataContextSection += `\nAVAILABLE ORG FUNDS: ${availableOrgFunds}\n`;
  }

  if (intent === 'balance') {
    const balanceBlock = formatBalanceDataBlock(allBooks);
    serverToolData.balanceBlock = balanceBlock;
    dataContextSection += `\nREAL-TIME USER BALANCE DATA:\n${balanceBlock}\n`;
  } else if (intent === 'recent' && contextBookId) {
    const txns = await prisma.transaction.findMany({
      where: { bookId: contextBookId },
      orderBy: { dateTime: 'desc' },
      take: 8,
    });
    const recentBlock = formatTransactionsDataBlock(txns);
    serverToolData.recentBlock = recentBlock;
    dataContextSection += `\nREAL-TIME RECENT TRANSACTIONS:\n${recentBlock}\n`;
  } else if (intent === 'category' && contextBookId) {
    const txns = await prisma.transaction.findMany({
      where: { bookId: contextBookId },
      orderBy: { dateTime: 'desc' },
      take: 50,
    });
    const breakdown = {};
    txns.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'General';
      breakdown[cat] = (breakdown[cat] || 0) + t.amount;
    });
    const payload = Object.entries(breakdown).map(([cat, amt]) => ({ category: cat, amount: amt }));
    const categoryBlock = `[DATA type:category]\n${JSON.stringify(payload)}\n[/DATA]`;
    serverToolData.categoryBlock = categoryBlock;
    dataContextSection += `\nREAL-TIME SPENDING BREAKDOWN BY CATEGORY:\n${categoryBlock}\n`;
  }

  const systemPrompt = `You are a casual accountant. Be concise.

PERSONA & RULES:
- Match User Lang: Speak English if they do. If they speak Bangla/Banglish, reply in Bangla AND write JSON descriptions strictly in beautiful Bangla.
- No AI preambles. Talk like a friend.
- User: ${userData?.name || 'User'} | Today: ${today}
- Active Book: ${activeBookEntry ? `"${activeBookEntry.book.name}" (${activeBookEntry.book.id})` : 'None'}
${dataContextSection}
TOOLS:
Write on its own line to fetch data (only if missing):
[FETCH_RULE: <id>]
[FETCH_NOTES: <count>]
[FETCH_BALANCE]
[FETCH_RECENT_TXN]
[FETCH_USER: <name>] -> Find user IDs for sending money

TXN CREATION:
- Mandatory: amount, category, note.
- STRICT NOTE RULES: The "note" field is the ONLY place for the description. It MUST be a complete, professional, and highly detailed sentence explaining WHO, WHAT, WHERE, and WHY. Never use a single word or short phrase.
  * Bad: "রিকশা", "লাঞ্চ", "রহিমকে দিলাম", "অফিস ফান্ড থেকে খরচ"
  * Good: "ধানমন্ডি থেকে গুলশান অফিসে ক্লায়েন্ট মিটিংয়ে যাওয়ার রিকশা ভাড়া", "টিম মেম্বারদের সাথে মিটিং শেষে কাচ্চি ভাই থেকে দুপুরের খাবার", "রহিম সাহেবকে জরুরি ব্যবসার কাজে আগামী ১০ তারিখ পর্যন্ত হাওলাত দেওয়া হলো"
- SMART CATEGORY: Auto-guess category (e.g. "রিকশা" -> Transport).
- FLOW: 1. Gather missing details (who/where/why) if the user's prompt is too short. 2. Summarize & ask confirmation. 3. ONLY output JSON AFTER explicit "yes/করো".
Format (Normal Expense):
\`\`\`action
{"action":"create_transaction","data":{"bookId":"<id>","type":"expense","amount":500,"category":"Transport","note":"ধানমন্ডি থেকে গুলশান অফিসে জরুরি ক্লায়েন্ট মিটিংয়ে যাওয়ার রিকশা ভাড়া"}}
\`\`\`
Format (Org Fund Expense):
Must use Personal bookId, but set orgFundId to the org's book ID.
\`\`\`action
{"action":"create_transaction","data":{"bookId":"<personal_book_id>","type":"expense","amount":2500,"category":"Food","orgFundId":"<org_fund_id>","note":"টিম মেম্বারদের সাথে প্রজেক্ট মিটিং শেষে ধানমন্ডি কাচ্চি ভাই থেকে দুপুরের খাবার"}}
\`\`\`
Format (Send to Person):
Must set category "Send", type "expense", and recipientUserId.
\`\`\`action
{"action":"create_transaction","data":{"bookId":"<id>","type":"expense","amount":5000,"category":"Send","recipientUserId":"<user_id>","note":"রহিম সাহেবকে জরুরি ব্যবসার কাজে আগামী মাসের ১০ তারিখ পর্যন্ত হাওলাত বা ধার দেওয়া হলো"}}
\`\`\`

TXN EDIT/DELETE:
- Use [FETCH_RECENT_TXN] to find ID if needed.
Edit:
\`\`\`action
{"action":"edit_transaction","data":{"id":"<id>","amount":60,"note":"নতুন বিস্তারিত নোট এখানে লিখুন"}}
\`\`\`
Delete:
\`\`\`action
{"action":"delete_transaction","data":{"id":"<id>"}}
\`\`\`
`;

  return {
    systemPrompt,
    contextBookId,
    intent,
    serverToolData,
    transactionHints,
    recommendedTemperature,
  };
};

const parseAiAgentActions = async (aiResponseText, contextBookId, userId, { onComplaint, lastUserMessage, previewNotes } = {}) => {
  const matches = [...aiResponseText.matchAll(AI_ACTION_BLOCK_REGEX)];
  let cleanResponse = stripAiActionBlocks(aiResponseText);
  const proposedActions = [];
  const txnPreviews = previewNotes || extractTransactionPreviewNotes(aiResponseText);
  const userMsg = lastUserMessage || '';

  for (const match of matches) {
    try {
      const actionData = JSON.parse(match[1].trim());
      if (actionData.action === 'create_transaction' && actionData.data) {
        const { bookId: txnBookId, type, amount, category, note, dateTime, contact, recipientUserId, orgFundId, description } = actionData.data;
        
        if (!amount || !category || (!note && !description)) {
          proposedActions.push({
            action: 'create_transaction',
            data: { ...actionData.data },
            valid: false,
            reason: 'Missing required strict fields: amount, category, or note',
          });
          continue;
        }

        const resolvedNote = resolveAiTransactionNote({
          note,
          description,
          amount,
          previewNotes: txnPreviews,
          lastUserMessage: userMsg,
          category,
        });
        const book = await prisma.book.findFirst({
          where: { id: txnBookId || contextBookId },
          include: { organization: { include: { members: { where: { userId } } } } },
        });
        if (!book || book.organization.members.length === 0) {
          proposedActions.push({
            action: 'create_transaction',
            data: { ...actionData.data, note: resolvedNote },
            valid: false,
            reason: 'Book not found or access denied',
          });
        } else {
          proposedActions.push({
            action: 'create_transaction',
            data: {
              bookId: book.id,
              bookName: book.name,
              orgName: book.organization?.name || 'Unknown',
              type,
              amount: parseFloat(amount),
              category: category || 'General',
              note: resolvedNote,
              dateTime: dateTime ? new Date(dateTime) : new Date().toISOString(),
              contact: contact || '',
              recipientUserId: recipientUserId || null,
              orgFundId: orgFundId || null,
              description: description || '',
            },
            valid: true,
          });
        }
      }
      if (actionData.action === 'edit_transaction' && actionData.data) {
        if (!actionData.data.id) {
           proposedActions.push({
             action: 'edit_transaction',
             data: actionData.data,
             valid: false,
             reason: 'Missing transaction ID',
           });
        } else {
           proposedActions.push({
             action: 'edit_transaction',
             data: actionData.data,
             valid: true,
           });
        }
      }
      if (actionData.action === 'delete_transaction' && actionData.data) {
        if (!actionData.data.id) {
           proposedActions.push({
             action: 'delete_transaction',
             data: actionData.data,
             valid: false,
             reason: 'Missing transaction ID',
           });
        } else {
           proposedActions.push({
             action: 'delete_transaction',
             data: actionData.data,
             valid: true,
           });
        }
      }
      if (actionData.action === 'create_complaint' && actionData.data) {
        const { subject, message, category } = actionData.data;
        if (subject && message) {
          try {
            const complaint = await prisma.complaint.create({
              data: { userId, subject, message, category: category || 'Other' },
            });
            if (onComplaint) {
              onComplaint({ subject, id: complaint.id });
            } else {
              cleanResponse += `\n\nআপনার রিপোর্ট "${subject}" জমা হয়েছে।`;
            }
          } catch (err) {
            console.error('[AI Agent] Auto-execute complaint failed:', err);
          }
        }
      }
    } catch (parseErr) {
      console.error('[AI Agent] Action parse error:', parseErr);
    }
  }

  return { cleanResponse, proposedActions };
};

const finalizeAiAgentResponse = async (aiResponseText, { contextBookId, userId, intent, serverToolData, onComplaint, messages }) => {
  const lastUserMessage = getLastUserMessage(messages);
  const previewNotes = extractTransactionPreviewNotes(aiResponseText);
  const { cleanResponse: baseClean, proposedActions } = await parseAiAgentActions(
    aiResponseText,
    contextBookId,
    userId,
    { onComplaint, lastUserMessage, previewNotes }
  );
  let cleanResponse = baseClean;

  if (intent === 'balance' && serverToolData?.balanceBlock && !cleanResponse.includes('[DATA type:balance]')) {
    cleanResponse = cleanResponse
      ? `${cleanResponse}\n\n${serverToolData.balanceBlock}`
      : serverToolData.balanceBlock;
  }
  if (intent === 'category' && serverToolData?.categoryBlock && !cleanResponse.includes('[DATA type:category]')) {
    cleanResponse = cleanResponse
      ? `${cleanResponse}\n\n${serverToolData.categoryBlock}`
      : serverToolData.categoryBlock;
  }
  if (intent === 'recent' && serverToolData?.recentBlock && !cleanResponse.includes('[DATA type:transactions]')) {
    cleanResponse = cleanResponse
      ? `${cleanResponse}\n\n${serverToolData.recentBlock}`
      : serverToolData.recentBlock;
  }

  return { cleanResponse: cleanResponse.trim(), proposedActions };
};

const emitAiStreamFinal = async (sendEvent, fullText, agentCtx, userId, messages, meta = {}) => {
  const { cleanResponse, proposedActions } = await finalizeAiAgentResponse(fullText, {
    ...agentCtx,
    userId,
    messages,
    onComplaint: ({ subject, id }) => sendEvent('auto_action', { action: 'create_complaint', subject, id }),
  });
  if (proposedActions.length > 0) sendEvent('actions', { actions: proposedActions });
  sendEvent('clean', { response: cleanResponse });
  await saveAiChatTurn({
    userId,
    userMessage: getLastUserMessage(messages),
    assistantMessage: cleanResponse,
    bookId: agentCtx.contextBookId,
    model: meta.model || null,
    provider: meta.provider || null,
    intent: agentCtx.intent || null,
  });
};

module.exports = {
  buildTransactionAction,
  tryDeterministicAiResponse,
  prepareAiAgentRequest,
  parseAiAgentActions,
  finalizeAiAgentResponse,
  emitAiStreamFinal,
};
