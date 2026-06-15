# HisabPata AI System - Full Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [System Prompt](#system-prompt)
4. [Intent Detection](#intent-detection)
5. [API Key Management](#api-key-management)
6. [LLM Providers](#llm-providers)
7. [Tools & Actions](#tools--actions)
8. [Data Flow](#data-flow)
9. [API Endpoints](#api-endpoints)
10. [Configuration](#configuration)

---

## Architecture Overview

```
User Message
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                    API ENDPOINT                         │
│              POST /api/ai/agent                         │
│              POST /api/ai/agent/stream                  │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   AGENT LAYER                           │
│                                                         │
│  1. Load user AI config from DB                        │
│  2. Resolve provider, apiKey, model                    │
│  3. Detect intent (balance/transaction/category/etc)   │
│  4. Build system prompt with real-time data            │
│  5. Parse transaction hints from user message          │
│  6. Resolve book context                               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    LLM LAYER                            │
│                                                         │
│  Gemini  │  OpenAI  │  Claude  │  HisabPata AI (Ollama) │
│  (API)   │  (API)   │  (API)   │  (Local)               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  PARSE LAYER                            │
│                                                         │
│  1. Extract action blocks from AI response             │
│  2. Validate transaction data                          │
│  3. Resolve notes and categories                       │
│  4. Clean response text                                │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  FINALIZE LAYER                         │
│                                                         │
│  1. Append data blocks (balance/transactions)          │
│  2. Return clean response + proposed actions           │
│  3. Save chat turn to database                         │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/routes/ai/
├── index.js              # Route loader (loads chat.js + agent.js)
├── chat.js               # POST /api/ai/agent, POST /api/ai/agent/stream
├── agent.js              # POST /api/ai/agent/prepare, /finalize, /tool
└── utils/
    ├── index.js          # Re-exports all utils
    ├── agent.js          # Core: system prompt builder, action parser
    ├── parse.js          # Intent detection, book matching, hints
    ├── format.js         # Data block formatters (balance, transactions)
    ├── chat.js           # DB save for chat turns, config loader
    └── llm.js            # LLM helpers (Gemini URL builder, truncation)
```

---

## System Prompt

### Location
`src/routes/ai/utils/agent.js` → `prepareAiAgentRequest()` function (line 123)

### Full Prompt Template

```javascript
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
  * Good: "ধানমন্ডি থেকে গুলশান অফিসে ক্লায়েন্ট মিটিংয়ে যাওয়ার রিকশা ভাড়া", "টিম মেম্বারদের সাথে মিটিং শেষে কাচ্চি ভাই থেকে দুপুরের খাবার", "রহিম সাহেবকে জরুরি ব্যবসার কাজে আগামী ১০ তারিখ পর্যন্ত হাওলাত দেওয়া হলো"
- SMART CATEGORY: Auto-guess category (e.g. "রিকশা" -> Transport).
- FLOW: 1. Gather missing details (who/where/why) if the user's prompt is too short. 2. Summarize & ask confirmation. 3. ONLY output JSON AFTER explicit "yes/করো".
Format (Normal Expense):
\`\`\`action
{"action":"create_transaction","data":{"bookId":"<id>","type":"expense","amount":500,"category":"Transport","note":"ধানমন্ডি থেকে গুলশান অফিসে জরুরি ক্লায়েন্ট মিটিংয়ে যাওয়ার রিকশা ভাড়া"}}
\`\`\`
Format (Org Fund Expense):
Must use Personal bookId, but set orgFundId to the org's book ID.
\`\`\`action
{"action":"create_transaction","data":{"bookId":"<personal_book_id>","type":"expense","amount":2500,"category":"Food","orgFundId":"<org_fund_id>","note":"টিম মেম্বারদের সাথে প্রজেক্ট মিটিং শেষে ধানমন্ডি কাচ্চি ভাই থেকে দুপুরের খাবার"}}
\`\`\`
Format (Send to Person):
Must set category "Send", type "expense", and recipientUserId.
\`\`\`action
{"action":"create_transaction","data":{"bookId":"<id>","type":"expense","amount":5000,"category":"Send","recipientUserId":"<user_id>","note":"রহিম সাহেবকে জরুরি ব্যবসার কাজে আগামী মাসের ১০ তারিখ পর্যন্ত হাওলাত বা ধার দেওয়া হলো"}}
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
```

### Prompt Components Breakdown

| Component | Purpose | Example |
|-----------|---------|---------|
| **Role** | Defines AI personality | "You are a casual accountant" |
| **Persona** | Behavior rules | "Be concise, talk like a friend" |
| **Language** | Multi-language support | "Match User Lang" |
| **User Context** | Dynamic user data | `User: Rafid \| Today: 2026-06-14` |
| **Book Context** | Active book reference | `Active Book: "Monthly" (abc123)` |
| **Data Section** | Real-time data injection | Balance, transactions, categories |
| **Tools** | Fetch instructions | `[FETCH_BALANCE]`, `[FETCH_RECENT_TXN]` |
| **Transaction Rules** | Creation rules | Amount, category, note mandatory |
| **Action Format** | JSON output format | `\`\`\`action {...}\`\`\`` |

### Dynamic Data Injection

The `dataContextSection` variable is built based on intent:

```javascript
// For balance intent
dataContextSection += `\nREAL-TIME USER BALANCE DATA:\n${balanceBlock}\n`;

// For recent transactions intent
dataContextSection += `\nREAL-TIME RECENT TRANSACTIONS:\n${recentBlock}\n`;

// For category breakdown intent
dataContextSection += `\nREAL-TIME SPENDING BREAKDOWN BY CATEGORY:\n${categoryBlock}\n`;

// If user has org funds
dataContextSection += `\nAVAILABLE ORG FUNDS: ${availableOrgFunds}\n`;
```

---

## Intent Detection

### Location
`src/routes/ai/utils/parse.js` → `detectAiIntent()` function (line 110)

### Intent Types

| Intent | Regex Pattern | Data Fetched |
|--------|--------------|--------------|
| `balance` | `balance\|ব্যালেন্স\|কত টাকা\|how much money` | All book balances |
| `category` | `category\|ক্যাটাগরি\|spending breakdown` | Last 50 transactions, grouped by category |
| `recent` | `recent\|সাম্প্রতিক\|transaction list` | Last 8 transactions |
| `transaction` | `\d.*খরচ\|expense\|income` | Transaction hints (amount, type, category) |
| `help` | `help\|সাহায্য\|কী কর` | None |
| `general` | Default | None |

### Intent Detection Code

```javascript
const detectAiIntent = (messages) => {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const q = (lastUser?.content || '').toLowerCase();

  if (/(balance|ব্যালেন্স|কত টাকা)/i.test(q)) return 'balance';
  if (/(category|ক্যাটাগরি|spending breakdown)/i.test(q)) return 'category';
  if (/(recent|সাম্প্রতিক|transaction list)/i.test(q)) return 'recent';
  if (/\d.*(?:খরচ|expense|income)/i.test(q)) return 'transaction';
  if (/(help|সাহায্য)/i.test(q)) return 'help';
  return 'general';
};
```

### Temperature by Intent

```javascript
const recommendedTemperature =
  intent === 'transaction' ? 0.35 :   // Precise for transactions
  intent === 'general' ? 0.72 :       // Creative for general chat
  0.58;                               // Balanced for others
```

---

## API Key Management

### Location
`src/routes/user.js` (line 64-127)

### Flow

```
User sets API key
       │
       ▼
PUT /api/user/ai-config
       │
       ▼
┌──────────────────────────────────┐
│ normalizeAiConfigPayload()       │
│ - Validate provider             │
│ - Validate API key              │
│ - Validate model                │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ prisma.user.update({            │
│   where: { id: userId },        │
│   data: { aiConfig: config }    │
│ })                              │
└──────────────────────────────────┘
       │
       ▼
Stored in DB as JSON:
{
  "provider": "gemini",
  "apiKey": "AIza...",
  "selectedModel": "gemini-2.0-flash",
  "workingModels": ["gemini-2.0-flash", "gemini-1.5-pro"],
  "baseUrl": "",
  "temperature": 0.7,
  "maxTokens": 2048,
  "updatedAt": "2026-06-14T..."
}
```

### Supported Providers

| Provider | Validation | API Endpoint |
|----------|-----------|--------------|
| `gemini` | API key required | `generativelanguage.googleapis.com` |
| `openai` | API key required | `api.openai.com` |
| `claude` | API key required | `api.anthropic.com` |
| `hisabpata_ai` | No key needed (local Ollama) | `localhost:11434` |

### Config Resolution (Per Request)

```javascript
function resolveAiRequestConfig(body, storedConfig) {
  const cfg = storedConfig || {};
  return {
    provider: body.provider || cfg.provider,
    apiKey: body.apiKey || cfg.apiKey,
    model: body.model || cfg.selectedModel,
    baseUrl: body.baseUrl || cfg.baseUrl,
    temperature: body.temperature || cfg.temperature,
    maxTokens: body.maxTokens || cfg.maxTokens,
  };
}
```

---

## LLM Providers

### Location
`src/routes/ai/chat.js` (line 114-211)

### Gemini

```javascript
// URL Builder
const url = buildGeminiRequestUrl(baseUrl, model, 'generate', apiKey);
// → https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIza...

// Request
{
  contents: [{ role: "user", parts: [{ text: "message" }] }],
  systemInstruction: { parts: [{ text: systemPrompt }] },
  generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
}

// Response parsing
const text = geminiTextFromResponse(data);
// → data.candidates[0].content.parts[0].text
```

### OpenAI

```javascript
// URL
const url = 'https://api.openai.com/v1/chat/completions';

// Request
{
  model: "gpt-4",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: "message" }
  ],
  temperature: 0.7,
  max_tokens: 2048
}

// Headers
{ 'Authorization': `Bearer ${apiKey}` }

// Response parsing
const text = data.choices[0].message.content;
```

### Claude

```javascript
// URL
const url = 'https://api.anthropic.com/v1/messages';

// Request
{
  model: "claude-sonnet-4-20250514",
  max_tokens: 2048,
  temperature: 0.7,
  system: systemPrompt,
  messages: [{ role: "user", content: "message" }]
}

// Headers
{
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01'
}

// Response parsing
const text = data.content[0].text;
```

### HisabPata AI (Ollama)

```javascript
// URL
const url = `${ollamaUrl}/v1/chat/completions`;
// Default: http://localhost:11434/v1/chat/completions

// Request (OpenAI-compatible format)
{
  model: "llama3",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: "message" }
  ],
  temperature: 0.7
}

// Token tracking
const estimatedTokens = Math.ceil((promptText.length + responseText.length) / 4);
// Updates: nativeAiTokensUsedTotal, nativeAiTokensUsedToday, nativeAiTokensUsedMonth
```

---

## Tools & Actions

### Tool Calls (in System Prompt)

The AI writes these on its own line to fetch data:

| Tool | Purpose | Backend Handler |
|------|---------|-----------------|
| `[FETCH_RULE: <id>]` | Get specific rule | Returns rule text |
| `[FETCH_NOTES: <count>]` | Get recent notes | Returns notes |
| `[FETCH_BALANCE]` | Get all book balances | Returns `[DATA type:balance]` |
| `[FETCH_RECENT_TXN]` | Get last 10 transactions | Returns `[DATA type:transactions]` |
| `[FETCH_USER: <name>]` | Search users by name | Returns user IDs |

### Action Blocks (JSON in Code Fences)

The AI outputs actions in `\`\`\`action ... \`\`\`` blocks:

#### Create Transaction
```json
{
  "action": "create_transaction",
  "data": {
    "bookId": "abc123",
    "type": "expense",
    "amount": 500,
    "category": "Transport",
    "note": "ধানমন্ডি থেকে গুলশান অফিসে রিকশা ভাড়া",
    "dateTime": "2026-06-14T10:30:00Z",
    "contact": "",
    "recipientUserId": null,
    "orgFundId": null
  }
}
```

#### Edit Transaction
```json
{
  "action": "edit_transaction",
  "data": {
    "id": "txn_id",
    "amount": 60,
    "note": "Updated note"
  }
}
```

#### Delete Transaction
```json
{
  "action": "delete_transaction",
  "data": {
    "id": "txn_id"
  }
}
```

#### Create Complaint
```json
{
  "action": "create_complaint",
  "data": {
    "subject": "App Issue",
    "message": "Description of the issue",
    "category": "Bug"
  }
}
```

### Action Parsing Flow

```javascript
// 1. Extract action blocks from AI response
const AI_ACTION_BLOCK_REGEX = /```action\s*([\s\S]*?)```/g;
const matches = [...aiResponseText.matchAll(AI_ACTION_BLOCK_REGEX)];

// 2. Parse each action
for (const match of matches) {
  const actionData = JSON.parse(match[1].trim());
  
  if (actionData.action === 'create_transaction') {
    // Validate: amount, category, note required
    // Resolve book access
    // Add to proposedActions[]
  }
}

// 3. Clean response (remove action blocks)
const cleanResponse = stripAiActionBlocks(aiResponseText);

// 4. Return both
return { cleanResponse, proposedActions };
```

---

## Data Flow

### Complete Request Flow

```
1. POST /api/ai/agent
   └─ body: { provider, messages, bookId, temperature, maxTokens }

2. Load user AI config from DB
   └─ prisma.user.findUnique({ where: { id }, select: { aiConfig } })

3. Resolve config (request body > stored config)
   └─ { provider, apiKey, model, baseUrl, temperature, maxTokens }

4. Validate
   └─ provider required, apiKey required (except hisabpata_ai), model required

5. prepareAiAgentRequest()
   ├─ Fetch user's organizations and books
   ├─ Detect intent from messages
   ├─ Parse transaction hints (amount, type, category)
   ├─ Resolve context book
   ├─ Fetch real-time data based on intent
   └─ Build system prompt with dynamic data

6. tryDeterministicAiResponse()
   └─ Check if response can be handled without LLM

7. Call LLM (Gemini/OpenAI/Claude/Ollama)
   ├─ Build request with systemPrompt + messages
   ├- Handle streaming or non-streaming
   └─ Get raw AI response text

8. finalizeAiAgentResponse()
   ├─ Parse action blocks from AI response
   ├- Validate each action
   ├- Clean response text
   ├- Append data blocks (balance/transactions)
   └- Return { cleanResponse, proposedActions }

9. saveAiChatTurn()
   └─ Save user message + assistant response to DB

10. Return response
    └─ { response: cleanResponse, proposedActions: [...] }
```

### Streaming Flow (SSE)

```
1. POST /api/ai/agent/stream
   └─ Same as above, but response is SSE stream

2. Set headers
   ├─ Content-Type: text/event-stream
   ├─ Cache-Control: no-cache
   └─ Connection: keep-alive

3. Send events
   ├─ sendEvent('chunk', { content: "text chunk" })    // Stream chunks
   ├─ sendEvent('actions', { actions: [...] })          // Proposed actions
   ├─ sendEvent('clean', { response: "final text" })   // Clean response
   ├─ sendEvent('error', { message: "error" })         // Errors
   └─ sendEvent('done', {})                            // Stream complete

4. Save chat turn after stream ends
```

---

## API Endpoints

### AI Chat

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/agent` | POST | Non-streaming AI chat |
| `/api/ai/agent/stream` | POST | Streaming AI chat (SSE) |

### AI Agent

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/agent/prepare` | POST | Prepare AI context (system prompt, intent) |
| `/api/ai/agent/finalize` | POST | Parse AI response, return actions |
| `/api/ai/agent/tool` | POST | Execute tool calls (FETCH_BALANCE, etc.) |

### User AI Config

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/user/ai-config` | GET | Get user's AI config (masked API key) |
| `/api/user/ai-config` | PUT | Save AI config (provider, key, model) |
| `/api/user/ai-config` | DELETE | Reset AI config |

### Native AI Access

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/user/request-ai-access` | POST | Request HisabPata AI access |

---

## Configuration

### Environment Variables (.env)

```bash
# Server
PORT=8000
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret"
NODE_ENV=production
CORS_ORIGINS="https://your-domain.com"

# Ollama (HisabPata AI)
OLLAMA_API_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3

# Bangla Speech Recognition
ASR_BASE_URL=https://stotext.shilpigosthi.com
ASR_API_KEY=your_key

# Object Storage (S3/MinIO/R2)
STORAGE_S3_ENDPOINT=
STORAGE_S3_BUCKET=hisabpata
STORAGE_S3_ACCESS_KEY=
STORAGE_S3_SECRET_KEY=
STORAGE_S3_REGION=us-east-1
STORAGE_S3_FORCE_PATH_STYLE=true
```

### LLM Constants (llm.js)

```javascript
const AI_LLM_HISTORY_LIMIT = 6;     // Max messages sent to LLM
const AI_LLM_CONTENT_LIMIT = 1800;  // Max chars per message
const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
```

### Max Tokens by Provider

```javascript
function resolveAiMaxTokens(maxTokens, model, provider) {
  const parsed = maxTokens != null ? parseInt(maxTokens, 10) : 512;
  const safe = Number.isFinite(parsed) ? parsed : 512;
  
  // Gemini thinking models need higher tokens
  if (provider === 'gemini' && isGeminiThinkingModel(model)) {
    return Math.min(Math.max(safe, 2048), 8192);
  }
  
  return Math.min(Math.max(safe, 256), 2048);
}
```

---

## Database Schema (AI-Related)

```prisma
model User {
  id                    String
  aiConfig              Json?    // { provider, apiKey, selectedModel, ... }
  nativeAiStatus        String?  // "pending" | "approved" | null
  nativeAiExpiry        DateTime?
  nativeAiTotalTokenLimit    Int?
  nativeAiDailyTokenLimit    Int?
  nativeAiMonthlyTokenLimit  Int?
  nativeAiTokensUsedTotal    Int?
  nativeAiTokensUsedToday    Int?
  nativeAiTokensUsedMonth    Int?
  nativeAiLastTokenReset     DateTime?
}

model AiChatMessage {
  id        String
  userId    String
  role      String   // "user" | "assistant"
  content   String
  bookId    String?
  model     String?
  provider  String?
  intent    String?
  createdAt DateTime
}

model Complaint {
  id        String
  userId    String
  subject   String
  message   String
  category  String
  status    String
  createdAt DateTime
}
```

---

## Category Keywords

Auto-detection from user message:

```javascript
const CATEGORY_KEYWORDS = [
  { keys: ['rickshaw', 'রিকশা', 'bus', 'বাস', 'transport', 'যাতায়াত', 'pathao', 'uber', 'cng'], cat: 'Transport' },
  { keys: ['food', 'খাবার', 'breakfast', 'lunch', 'dinner', 'snack', 'নাস্তা'], cat: 'Food' },
  { keys: ['bazar', 'বাজার', 'market', 'grocery', 'সবজি'], cat: 'Shopping' },
  { keys: ['bill', 'বিল', 'electric', 'gas', 'internet', 'mobile'], cat: 'Bills' },
  { keys: ['salary', 'বেতন', 'income', 'আয়', 'donation', 'দান'], cat: 'Income' },
  { keys: ['medicine', 'doctor', 'চিকিৎসা', 'hospital'], cat: 'Medical' },
  { keys: ['education', 'school', 'college', 'শিক্ষা', 'book'], cat: 'Education' },
];
```

---

## Key Patterns to Reuse

### 1. Intent-Based Data Loading
```javascript
// Load different data based on user intent
if (intent === 'balance') {
  dataContextSection += `\nBALANCE DATA:\n${formatBalanceDataBlock(books)}\n`;
} else if (intent === 'recent') {
  dataContextSection += `\nRECENT TXN:\n${formatTransactionsDataBlock(txns)}\n`;
}
```

### 2. Dynamic System Prompt
```javascript
const systemPrompt = `You are ${role}.
- User: ${userName}
- Today: ${date}
${dynamicData}
`;
```

### 3. Action Block Pattern
```javascript
// AI outputs
```action
{"action":"create_item","data":{...}}
```

// Backend parses
const regex = /```action\s*([\s\S]*?)```/g;
const matches = [...response.matchAll(regex)];
```

### 4. Multi-Provider Support
```javascript
if (provider === 'gemini') { /* Gemini API */ }
else if (provider === 'openai') { /* OpenAI API */ }
else if (provider === 'claude') { /* Claude API */ }
else if (provider === 'local') { /* Ollama API */ }
```
