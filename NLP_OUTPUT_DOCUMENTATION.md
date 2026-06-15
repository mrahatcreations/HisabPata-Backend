# NLP Output Documentation - HisabPata

## Table of Contents
1. [NLP Pipeline Overview](#nlp-pipeline-overview)
2. [Output Format 1: Intent Classification](#1-intent-classification)
3. [Output Format 2: Entity Extraction (NER)](#2-entity-extraction)
4. [Output Format 3: Action Generation](#3-action-generation)
5. [Output Format 4: Response Generation](#4-response-generation)
6. [Output Format 5: Complete NLP Response](#5-complete-nlp-response)
7. [Input/Output Examples](#inputoutput-examples)
8. [JSON Schema Reference](#json-schema-reference)

---

## NLP Pipeline Overview

```
User Input: "রিকশায় ৫০০ টাকা খরচ হয়েছে"
            │
            ▼
┌───────────────────────────────────────────────────┐
│              NLP PIPELINE                        │
│                                                   │
│  Step 1: Intent Classification                   │
│  Output: { intent: "transaction" }               │
│                                                   │
│  Step 2: Entity Extraction (NER)                 │
│  Output: { amount: 500, category: "Transport",   │
│            type: "expense", language: "bn" }     │
│                                                   │
│  Step 3: Action Generation                       │
│  Output: { action: "create_transaction",         │
│            data: { ... } }                       │
│                                                   │
│  Step 4: Response Generation                     │
│  Output: "ধানমন্ডি থেকে গুলশান অফিসে রিকশা      │
│           ভাড়ায় ৫০০ টাকা খরচ হয়েছে।            │
│           কি যোগ করব?"                          │
└───────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────┐
│           FINAL OUTPUT (Combined)                │
│                                                   │
│  {                                               │
│    "intent": "transaction",                      │
│    "entities": { ... },                          │
│    "action": { ... },                            │
│    "response": "...",                            │
│    "needsConfirmation": true                     │
│  }                                               │
└───────────────────────────────────────────────────┘
```

---

## 1. Intent Classification

### Output Format
```json
{
  "intent": "balance|transaction|category|recent|help|general",
  "confidence": 0.95
}
```

### Intent Types

| Intent | Description | Example Input |
|--------|-------------|---------------|
| `balance` | Query book balance | "কত টাকা আছে?" |
| `transaction` | Create/edit/delete transaction | "রিকশায় ৫০০ টাকা খরচ" |
| `category` | Spending breakdown | "খরচের হার দেখাও" |
| `recent` | Recent transactions | "সাম্প্রতিক লেনদেন দেখাও" |
| `help` | How-to questions | "কিভাবে যোগ করব?" |
| `general` | Default/fallback | "হ্যালো" |

### Example Outputs

**Input:** "আমার ব্যালেন্স কত?"
```json
{
  "intent": "balance",
  "confidence": 0.98
}
```

**Input:** "রিকশায় ৫০০ টাকা"
```json
{
  "intent": "transaction",
  "confidence": 0.92
}
```

**Input:** "খরচের হার দেখাও"
```json
{
  "intent": "category",
  "confidence": 0.95
}
```

---

## 2. Entity Extraction (NER)

### Output Format
```json
{
  "amount": 500.00,
  "type": "expense|income",
  "category": "Transport|Food|Shopping|Bills|Income|Medical|Education|General",
  "note": "Detailed description in Bangla",
  "date": "2026-06-14",
  "time": "10:30:00",
  "person": "রহিম",
  "bookName": "Monthly",
  "language": "bn|en|bn-en"
}
```

### Entity Types

| Entity | Type | Description | Example |
|--------|------|-------------|---------|
| `amount` | float | Money amount | 500, 1500.50 |
| `type` | string | Transaction type | "expense" or "income" |
| `category` | string | Auto-detected category | "Transport", "Food" |
| `note` | string | Detailed description | "ধানমন্ডি থেকে রিকশা ভাড়া" |
| `date` | string | Transaction date | "2026-06-14" |
| `time` | string | Transaction time | "10:30:00" |
| `person` | string | Person name (if mentioned) | "রহিম" |
| `bookName` | string | Book name (if mentioned) | "Monthly" |
| `language` | string | Detected language | "bn", "en", "bn-en" |

### Example Outputs

**Input:** "আজ রিকশায় ৫০০ টাকা খরচ হয়েছে"
```json
{
  "amount": 500.00,
  "type": "expense",
  "category": "Transport",
  "note": "আজ রিকশায় ৫০০ টাকা খরচ হয়েছে",
  "date": "2026-06-14",
  "time": null,
  "person": null,
  "bookName": null,
  "language": "bn"
}
```

**Input:** "lunch 300 taka"
```json
{
  "amount": 300.00,
  "type": "expense",
  "category": "Food",
  "note": "lunch 300 taka",
  "date": "2026-06-14",
  "time": null,
  "person": null,
  "bookName": null,
  "language": "en"
}
```

**Input:** "রহিমকে ১০০০ টাকা দিলাম"
```json
{
  "amount": 1000.00,
  "type": "expense",
  "category": "Send",
  "note": "রহিমকে ১০০০ টাকা দিলাম",
  "date": "2026-06-14",
  "time": null,
  "person": "রহিম",
  "bookName": null,
  "language": "bn"
}
```

**Input:** "গতকাল বাজারে ২০০০ টাকা খরচ"
```json
{
  "amount": 2000.00,
  "type": "expense",
  "category": "Shopping",
  "note": "গতকাল বাজারে ২০০০ টাকা খরচ",
  "date": "2026-06-13",
  "time": null,
  "person": null,
  "bookName": null,
  "language": "bn"
}
```

### Category Detection Rules

```python
CATEGORY_KEYWORDS = {
    "Transport": ["rickshaw", "রিকশা", "bus", "বাস", "uber", "pathao", "cng", "যাতায়াত"],
    "Food": ["food", "খাবার", "lunch", "dinner", "breakfast", "snack", "নাস্তা", "কাচ্চি"],
    "Shopping": ["bazar", "বাজার", "market", "grocery", "সবজি", "shopping"],
    "Bills": ["bill", "বিল", "electric", "gas", "internet", "mobile", "phone"],
    "Income": ["salary", "বেতন", "income", "আয়", "donation", "দান", "জমা"],
    "Medical": ["medicine", "doctor", "চিকিৎসা", "hospital", "pharmacy"],
    "Education": ["education", "school", "college", "শিক্ষা", "book", "tuition"],
    "Send": ["send", "পাঠ", "দিলাম", "পাঠালাম", "হাওলাত", "ধার"],
}
```

---

## 3. Action Generation

### Output Format
```json
{
  "action": "create_transaction|edit_transaction|delete_transaction|create_complaint|none",
  "data": { ... },
  "needsConfirmation": true|false,
  "preview": "Summary text for user confirmation"
}
```

### Action Types

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
  },
  "needsConfirmation": true,
  "preview": "রিকশা ভাড়ায় ৫০০ টাকা খরচ যোগ করবো। ঠিক আছে?"
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
  },
  "needsConfirmation": true,
  "preview": "লেনদেন আপডেট করবো। ঠিক আছে?"
}
```

#### Delete Transaction
```json
{
  "action": "delete_transaction",
  "data": {
    "id": "txn_id"
  },
  "needsConfirmation": true,
  "preview": "লেনদেন মুছে ফেলবো। নিশ্চিত?"
}
```

#### No Action Needed
```json
{
  "action": "none",
  "data": null,
  "needsConfirmation": false,
  "preview": null
}
```

---

## 4. Response Generation

### Output Format
```json
{
  "response": "Conversational response in user's language",
  "language": "bn|en",
  "tone": "friendly|formual"
}
```

### Response Rules

| Rule | Description |
|------|-------------|
| **Language Match** | If user speaks Bangla → reply in Bangla |
| **No Preamble** | Don't start with "আমি আপনাকে সাহায্য করতে পারি..." |
| **Talk Like Friend** | Casual, conversational tone |
| **Concise** | Short, to-the-point responses |
| **Detailed Notes** | Transaction notes must be detailed |

### Example Responses

**Input:** "কত টাকা আছে?"
```json
{
  "response": "আপনার মূল বইয়ে ১৫,০০০ টাকা আছে।",
  "language": "bn",
  "tone": "friendly"
}
```

**Input:** "রিকশায় ৫০০ টাকা"
```json
{
  "response": "রিকশায় ৫০০ টাকা খরচ যোগ করবো। বিস্তারিত লিখুন - কোথায় গেছেন, কেন গেছেন?",
  "language": "bn",
  "tone": "friendly"
}
```

**Input:** "yes"
```json
{
  "response": "হ্যাঁ, ৫০০ টাকা রিকশা ভাড়া যোগ হয়ে গেছে!",
  "language": "bn",
  "tone": "friendly"
}
```

---

## 5. Complete NLP Response

### Final Output Format (Combined)

```json
{
  "intent": "transaction",
  "confidence": 0.92,
  "entities": {
    "amount": 500.00,
    "type": "expense",
    "category": "Transport",
    "note": "রিকশায় ৫০০ টাকা",
    "date": "2026-06-14",
    "language": "bn"
  },
  "action": {
    "type": "create_transaction",
    "data": {
      "bookId": "abc123",
      "type": "expense",
      "amount": 500,
      "category": "Transport",
      "note": "ধানমন্ডি থেকে গুলশান অফিসে রিকশা ভাড়া",
      "dateTime": "2026-06-14T10:30:00Z"
    },
    "needsConfirmation": true
  },
  "response": "রিকশায় ৫০০ টাকা খরচ যোগ করবো। ঠিক আছে?",
  "toolCalls": [],
  "metadata": {
    "processingTime": 45,
    "model": "hisabpata-nlp-v1",
    "version": "1.0.0"
  }
}
```

---

## Input/Output Examples

### Example 1: Simple Transaction

**Input:** "রিকশায় ৫০০ টাকা"

**Output:**
```json
{
  "intent": "transaction",
  "confidence": 0.92,
  "entities": {
    "amount": 500.00,
    "type": "expense",
    "category": "Transport",
    "note": "রিকশায় ৫০০ টাকা",
    "date": "2026-06-14",
    "language": "bn"
  },
  "action": {
    "type": "create_transaction",
    "data": {
      "bookId": "abc123",
      "type": "expense",
      "amount": 500,
      "category": "Transport",
      "note": "ধানমন্ডি থেকে গুলশান অফিসে রিকশা ভাড়া",
      "dateTime": "2026-06-14T10:30:00Z"
    },
    "needsConfirmation": true
  },
  "response": "রিকশায় ৫০০ টাকা খরচ যোগ করবো। ঠিক আছে?",
  "toolCalls": []
}
```

### Example 2: Balance Query

**Input:** "আমার ব্যালেন্স কত?"

**Output:**
```json
{
  "intent": "balance",
  "confidence": 0.98,
  "entities": {
    "amount": null,
    "type": null,
    "category": null,
    "note": null,
    "date": null,
    "language": "bn"
  },
  "action": {
    "type": "none",
    "data": null,
    "needsConfirmation": false
  },
  "response": "আপনার মূল বইয়ে ১৫,০০০ টাকা আছে।",
  "toolCalls": ["FETCH_BALANCE"]
}
```

### Example 3: Category Breakdown

**Input:** "খরচের হার দেখাও"

**Output:**
```json
{
  "intent": "category",
  "confidence": 0.95,
  "entities": {
    "amount": null,
    "type": null,
    "category": null,
    "note": null,
    "date": null,
    "language": "bn"
  },
  "action": {
    "type": "none",
    "data": null,
    "needsConfirmation": false
  },
  "response": "আপনার খরচের হার:",
  "toolCalls": ["FETCH_CATEGORY_BREAKDOWN"]
}
```

### Example 4: Recent Transactions

**Input:** "সাম্প্রতিক লেনদেন দেখাও"

**Output:**
```json
{
  "intent": "recent",
  "confidence": 0.94,
  "entities": {
    "amount": null,
    "type": null,
    "category": null,
    "note": null,
    "date": null,
    "language": "bn"
  },
  "action": {
    "type": "none",
    "data": null,
    "needsConfirmation": false
  },
  "response": "সাম্প্রতিক লেনদেন:",
  "toolCalls": ["FETCH_RECENT_TXN"]
}
```

### Example 5: Confirmation

**Input:** "হ্যাঁ"

**Output:**
```json
{
  "intent": "general",
  "confidence": 0.85,
  "entities": {
    "amount": null,
    "type": null,
    "category": null,
    "note": null,
    "date": null,
    "language": "bn"
  },
  "action": {
    "type": "create_transaction",
    "data": {
      "bookId": "abc123",
      "type": "expense",
      "amount": 500,
      "category": "Transport",
      "note": "ধানমন্ডি থেকে গুলশান অফিসে রিকশা ভাড়া",
      "dateTime": "2026-06-14T10:30:00Z"
    },
    "needsConfirmation": false
  },
  "response": "হ্যাঁ, ৫০০ টাকা রিকশা ভাড়া যোগ হয়ে গেছে!",
  "toolCalls": []
}
```

### Example 6: English Input

**Input:** "lunch 300 taka"

**Output:**
```json
{
  "intent": "transaction",
  "confidence": 0.90,
  "entities": {
    "amount": 300.00,
    "type": "expense",
    "category": "Food",
    "note": "lunch 300 taka",
    "date": "2026-06-14",
    "language": "en"
  },
  "action": {
    "type": "create_transaction",
    "data": {
      "bookId": "abc123",
      "type": "expense",
      "amount": 300,
      "category": "Food",
      "note": "Lunch expense at local restaurant",
      "dateTime": "2026-06-14T12:30:00Z"
    },
    "needsConfirmation": true
  },
  "response": "Adding 300 taka lunch expense. Is that correct?",
  "toolCalls": []
}
```

### Example 7: With Person

**Input:** "রহিমকে ১০০০ টাকা দিলাম"

**Output:**
```json
{
  "intent": "transaction",
  "confidence": 0.93,
  "entities": {
    "amount": 1000.00,
    "type": "expense",
    "category": "Send",
    "note": "রহিমকে ১০০০ টাকা দিলাম",
    "date": "2026-06-14",
    "person": "রহিম",
    "language": "bn"
  },
  "action": {
    "type": "create_transaction",
    "data": {
      "bookId": "abc123",
      "type": "expense",
      "amount": 1000,
      "category": "Send",
      "recipientUserId": "user_id_rahim",
      "note": "রহিম সাহেবকে ১০০০ টাকা দেওয়া হয়েছে",
      "dateTime": "2026-06-14T10:30:00Z"
    },
    "needsConfirmation": true
  },
  "response": "রহিমকে ১০০০ টাকা দেবো। ঠিক আছে?",
  "toolCalls": ["FETCH_USER:রহিম"]
}
```

---

## JSON Schema Reference

### NLP Response Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NLP Response",
  "type": "object",
  "properties": {
    "intent": {
      "type": "string",
      "enum": ["balance", "transaction", "category", "recent", "help", "general"]
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "entities": {
      "type": "object",
      "properties": {
        "amount": { "type": ["number", "null"] },
        "type": { "type": "string", "enum": ["expense", "income", null] },
        "category": { "type": ["string", "null"] },
        "note": { "type": ["string", "null"] },
        "date": { "type": ["string", "null"], "format": "date" },
        "time": { "type": ["string", "null"], "format": "time" },
        "person": { "type": ["string", "null"] },
        "bookName": { "type": ["string", "null"] },
        "language": { "type": "string", "enum": ["bn", "en", "bn-en"] }
      }
    },
    "action": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["create_transaction", "edit_transaction", "delete_transaction", "create_complaint", "none"] },
        "data": { "type": ["object", "null"] },
        "needsConfirmation": { "type": "boolean" }
      }
    },
    "response": { "type": "string" },
    "toolCalls": {
      "type": "array",
      "items": { "type": "string" }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "processingTime": { "type": "number" },
        "model": { "type": "string" },
        "version": { "type": "string" }
      }
    }
  },
  "required": ["intent", "confidence", "entities", "action", "response"]
}
```

---

## Training Data Format

For training your custom NLP model:

```json
{
  "examples": [
    {
      "input": "রিকশায় ৫০০ টাকা",
      "output": {
        "intent": "transaction",
        "entities": {
          "amount": 500,
          "type": "expense",
          "category": "Transport",
          "language": "bn"
        }
      }
    },
    {
      "input": "কত টাকা আছে?",
      "output": {
        "intent": "balance",
        "entities": {
          "language": "bn"
        }
      }
    },
    {
      "input": "lunch 300 taka",
      "output": {
        "intent": "transaction",
        "entities": {
          "amount": 300,
          "type": "expense",
          "category": "Food",
          "language": "en"
        }
      }
    }
  ]
}
```
