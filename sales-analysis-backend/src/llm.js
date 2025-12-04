// llm.js
import fetch from 'node-fetch';
import { schemaDescription } from './schemaConfig.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function getModel() {
  // Use any OpenAI model ID, default to gpt-4.1
  return process.env.OPENAI_MODEL || 'gpt-4.1';
}

export async function callOpenAI(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set in environment variables');
    throw new Error('OPENAI_API_KEY is not set');
  }

  const body = {
    model: getModel(),
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 800
  };

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('OpenAI API error:', json);
    throw new Error(json.error?.message || 'OpenAI API request failed');
  }

  return json.choices[0].message.content;
}

/**
 * Router + SQL generator.
 *
 * It can:
 * - Handle chit-chat / gibberish (mode = "chat")
 * - Ask clarification questions (mode = "clarify")
 * - Generate SQL (mode = "sql")
 *
 * ALWAYS returns an object: { mode, sql, message }
 */
export async function generateSqlFromQuestion(question, history = []) {
  const system = `
You are an expert AI assistant and SQL Server data analyst for an ecommerce, logistics, and inventory business in Karachi.

Your responsibilities:
1) Decide how to respond to the user's message.
2) Either:
   - respond as a normal chatbot (no SQL),
   - ask for clarification,
   - or generate a safe SQL Server SELECT query.

You have FULL access to ALL tables and views defined in the schema below.
You are NOT restricted to any specific table or view; dynamically choose what is most appropriate
based on the user's question (including advanced analysis like basket analysis, cohort analysis, etc.).

======================
MODES (YOU MUST ALWAYS CHOOSE ONE)
======================
You MUST respond using STRICT JSON with fields:
{
  "mode": "chat" | "clarify" | "sql",
  "sql": string | null,
  "message": string | null
}

Rules:
- mode = "chat":
    Use this when:
      • The message is small talk or gibberish (e.g. "hi", "how are you", "kjdfnjoadfna").
      • The user is asking a conceptual question not requiring live data.
    - "sql" MUST be null.
    - "message" MUST contain the natural language reply.

- mode = "clarify":
    Use this when:
      • The user wants data/analysis but their request is ambiguous or missing key details
        (e.g. missing time range, store, branch, city, status filters, etc.)
    - "sql" MUST be null.
    - "message" MUST be a brief clarification question for the user.

- mode = "sql":
    Use this when:
      • The request is clear enough to run a query on the database
        (e.g. sales by branch, basket analysis for last 3 months, COD performance by courier, etc.).
    - "sql" MUST contain ONE safe SQL Server query (SELECT or WITH + SELECT).
    - "message" can be a short human-readable description OR null.

======================
SQL SAFETY RULES (WHEN mode = "sql")
======================
- Only use SELECT queries (and optional CTEs with WITH).
- NEVER use INSERT, UPDATE, DELETE, MERGE, DROP, ALTER, TRUNCATE.
- NEVER modify schema, data, indexes, or constraints.
- NEVER use EXEC, sp_executesql, xp_cmdshell, OPENROWSET or any dynamic SQL.
- NEVER reference tables or columns that are not described in the schema.
- DO NOT include a trailing semicolon.
- Use GROUP BY correctly when aggregating.
- Use CAST/CONVERT when needed.
- Limit result size using TOP or an appropriate WHERE clause for "large" queries.

======================
SCHEMA USAGE RULES
======================
- You may use ANY table or view from the schema; do NOT assume preference for any single view.
- Use multiple tables with correct joins if required (e.g. basket analysis requires order header + line items + products).
- Respect all relationships explicitly defined in the schemaDescription.
- If needed, combine:
    • tbl_OrderMasterHeader (orders)
    • tbl_OrderMasterLineItem (line items)
    • tbl_Product_Master (product info)
    • OrderReportCache / AllOrderReport (denormalized order reporting)
    • Inventory-related tables for stock analysis
  or any others as suitable.

======================
OUTPUT FORMAT (VERY IMPORTANT)
======================
- Return ONLY raw JSON.
- NO markdown, NO backticks, NO explanations outside JSON.
- The JSON MUST be valid and parseable.

======================
SCHEMA (SOURCE OF TRUTH)
======================
${schemaDescription}
  `.trim();

  const messages = [
    { role: 'system', content: system },
    ...(history || []).slice(-4),
    {
      role: 'user',
      content: question
    }
  ];

  const raw = await callOpenAI(messages, { temperature: 0.1, max_tokens: 700 });

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse router/SQL JSON from LLM:', raw);
    // Fallback: treat as normal chat response
    plan = {
      mode: 'chat',
      sql: null,
      message: raw
    };
  }

  // Basic normalization
  if (!plan || typeof plan !== 'object') {
    plan = {
      mode: 'chat',
      sql: null,
      message: 'Sorry, I could not understand that. Please try asking your question again.'
    };
  }

  if (!['chat', 'clarify', 'sql'].includes(plan.mode)) {
    plan.mode = 'chat';
  }

  if (plan.mode !== 'sql') {
    plan.sql = null;
  } else if (typeof plan.sql !== 'string') {
    plan.sql = '';
  }

  if (typeof plan.message !== 'string' && plan.message !== null) {
    plan.message = null;
  }

  return plan;
}

export function isSqlSafe(sqlText) {
  if (!sqlText || typeof sqlText !== 'string') return false;
  const sql = sqlText.trim().toUpperCase();

  if (!sql.startsWith('SELECT') && !sql.startsWith('WITH')) return false;
  if (sql.includes(';')) return false;

  const forbidden = [
    'INSERT ', 'UPDATE ', 'DELETE ', 'MERGE ', 'DROP ', 'ALTER ', 'TRUNCATE ',
    'EXEC ', 'XP_', 'SP_EXECUTESQL', 'CREATE ', 'ATTACH ', 'DETACH '
  ];

  if (forbidden.some(word => sql.includes(word))) return false;

  return true;
}

/**
 * Turn SQL result rows into a business explanation.
 */
export async function answerFromData(question, rows, meta = {}) {
  const system = `
You are a senior enterprise analytics expert for a major ecommerce and fulfillment company in Karachi.

You ALWAYS follow these strict rules:

1. You NEVER invent or guess numbers — all values must come ONLY from "rows" (the JSON data provided).
2. If something cannot be computed from the data, explicitly say so.
3. If the dataset is empty, say that clearly and suggest what additional data, filters, or time range would help.
4. Provide clear, structured business insights for sales, operations, inventory, or courier performance:
   - totals, averages, counts
   - trends or comparisons
   - top/bottom performers
   - operational risks, bottlenecks, or anomalies
   - actionable recommendations when relevant
5. Never mention internal errors, SQL, or database internals to the user.
6. Never hallucinate or speculate data you do not have.

Your tone: concise, professional, and easy to understand.
`.trim();

  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        question,
        meta,
        rows
      })
    }
  ];

  return callOpenAI(messages, { temperature: 0.6, max_tokens: 800 });
}

/**
 * Generic fallback / small-talk chat responder.
 * Used when:
 * - input is not suitable for SQL
 * - an internal error occurs
 * - we need a graceful, non-technical reply
 */
export async function generalChatResponse(question, history = []) {
  const system = `
You are a friendly, helpful AI assistant for an ecommerce company in Karachi.
You can:
- Chat normally (greetings, small talk, gibberish).
- Answer conceptual questions about ecommerce, logistics, and analytics.
- If you suspect an internal error occurred, you MUST NOT mention technical details.
  Instead, give a polite, general response and suggest the user try again or narrow their question.
`.trim();

  const messages = [
    { role: 'system', content: system },
    ...(history || []).slice(-4),
    { role: 'user', content: question }
  ];

  return callOpenAI(messages, { temperature: 0.7, max_tokens: 400 });
}
