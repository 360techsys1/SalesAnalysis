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

  const choice = json.choices[0];
  if (json.usage || choice.finish_reason) {
    console.log('LLM finish_reason:', choice.finish_reason, 'usage:', json.usage);
  }

  return choice.message.content;
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
based on the user's question (including advanced analysis like basket analysis, cohort analysis, forecasting, etc.).

======================
WHEN TO USE EACH MODE
======================
You MUST respond using STRICT JSON with fields:
{
  "mode": "chat" | "clarify" | "sql",
  "sql": string | null,
  "message": string | null
}

General rules:

- mode = "chat":
    Use this when:
      • The message is small talk or gibberish (e.g. "hi", "how are you", "kjdfnjoadfna").
      • The user is asking a conceptual question NOT requiring live database data.
    - "sql" MUST be null.
    - "message" MUST contain the natural language reply.

- mode = "clarify":
    Use this when:
      • The user clearly wants data/analysis but their request is ambiguous or missing key details
        (e.g. missing time range, store, branch, city, status filters, metric type).
    - "sql" MUST be null.
    - "message" MUST be a brief clarification question for the user.

- mode = "sql":
    Use this for ANY request that asks for:
      • concrete numbers (totals, averages, counts, rankings),
      • comparisons (top/bottom, % share),
      • trends over time,
      • or FORECASTS / PREDICTIONS.
    In other words: if the answer depends on live sales / orders / inventory data,
    you SHOULD choose "sql" unless the question is genuinely unclear.
    - "sql" MUST contain ONE safe SQL Server query (SELECT or WITH + SELECT).
    - "message" can be a short human-readable description OR null.

======================
FORECASTING / PREDICTION REQUESTS
======================
When the user asks to FORECAST or PREDICT future metrics, for example:
- "predict next month sales of Sunset based on recent performance"
- "forecast next quarter orders for Trend Arabia"
- "based on past sales, what will revenue be next year?"

you MUST:

1) Choose **"mode": "sql"** (NOT "chat" and NOT "clarify", unless the request is genuinely ambiguous).

2) Generate SQL that returns the HISTORICAL data needed for that forecast:
   - Use the time window and level of detail requested by the user whenever they specify it
     (e.g. "last 3 months", "last year", "since January 2024").
   - If the user does NOT specify a lookback window, choose a sensible period
     (for example, 6–12 recent months or the full available history) based on the metric.

3) The SQL should return aggregated data at an appropriate time grain, such as:
   - Monthly totals, weekly totals, or daily totals,
   - And aggregated metrics such as total sales amount and/or order count.
   If the user is not explicit, return BOTH total sales amount and order count at a reasonable time grain.

4) Do NOT say that "SQL cannot predict". SQL is only used to fetch the historical baseline.
   Forecasting will be done later using the result rows.


======================
NAMING & FILTERING (VERY IMPORTANT)
======================
- When the user mentions store, branch, courier, or city names in free text
  (e.g. "Sunset store", "Sun & Sands", "Trend arabia"),
  you MUST:
    • Interpret the core name, and
    • Use **case-insensitive LIKE filters with wildcards** in SQL, for example:
        WHERE s.Name LIKE '%Sunset%'
        WHERE s.Name LIKE '%Trend Arabia%'
  This avoids missing data due to minor wording differences.

======================
ENTITY DISAMBIGUATION (STORES / BRANCHES / COURIERS)
======================
- You may use conversation history to see previously listed store / branch / courier names
  (for example, from a prior "top stores" answer).
- If the user refers to a single entity (e.g. "Sunset store", "Sun & Sands") but, based on
  history, there are multiple possible matches (e.g. "Sunset" and "Sunset Arrive"),
  you MUST NOT arbitrarily choose one.

In that situation:
  - Choose **"mode": "clarify"**.
  - "sql" MUST be null.
  - "message" MUST:
      • briefly say you found multiple matching entities, and
      • list the top 2–5 candidate names, and
      • ask the user to select which one they mean.

Example structure for the message (you can adapt wording):
  "I found multiple stores that match 'Sunset': Sunset, Sunset Arrive.
   Which store do you want me to analyse or forecast?"


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
 * Turn SQL result rows into a business explanation (including forecasts).
 */
export async function answerFromData(question, rows, meta = {}) {
  const system = `
You are a senior enterprise analytics expert for a major ecommerce and fulfillment company in KSA (Saudi Arabia).

You ALWAYS follow these strict rules:

1. You do NOT invent arbitrary numbers. All numeric values must come either:
   - directly from "rows" (the JSON data provided), OR
   - from clear calculations based on those rows (sums, averages, growth rates, forecasts, etc.).

2. FORECASTING / PREDICTION:
   - When the user asks to PREDICT or FORECAST future metrics (e.g., "predict next month", "forecast next quarter", "next 12 months"),
     you ARE allowed to produce forecasted numbers **as long as rows are not empty**.
   - These forecasts MUST be derived from the historical data in "rows" using simple, transparent statistical methods such as:
       • moving average over recent periods,
       • year-over-year growth rate,
       • simple linear trend over time,
       • or another reasonable basic forecasting method.
   - Choose the method that best fits the pattern and horizon implied by the user's question.
   - Briefly state which method you used (e.g. "based on the average of the last 6 full months", or "based on a simple linear trend").
   - Clearly label results as "estimates" or "projections", not guarantees.

   IMPORTANT:
   - If meta.rowCount > 0 and the question clearly requests a prediction, you MUST provide numeric forecast values.
   - Do NOT respond with only generic advice like "review your dashboard" in those cases.

3. ENTITY AMBIGUITY IN ROWS:
   - If the user is clearly asking about a **single** store / branch / courier
     (e.g. "Sunset store", "Sun & Sands", "predict next month sales of Sunset"),
     but the rows you receive contain data for **more than one** distinct entity
     of that type (for example both "Sunset" and "Sunset Arrive"):
       • Do NOT silently merge them into one forecast.
       • Instead, treat this as an ambiguity.
       • Respond with a short clarification, e.g.:

         "Your request mentions 'Sunset', but I found multiple stores:
          Sunset, Sunset Arrive. Which store should I forecast?"

       • You may also show a brief recent summary for each option if helpful,
         but you MUST ask the user to choose before giving a single-store forecast.


4. EMPTY DATASETS:
   - If meta.rowCount is 0 (the query returned no rows):
       • Do NOT assert specific periods like "no data for the last 12 months" unless the question explicitly specified that period.
       • Instead, explain that the query returned no matching records for the filters (store name, date range, status etc.).
       • Suggest that the user verify the store/branch name, spelling, or broaden the date range.
       • You may also suggest asking for "top stores" or "recent orders for <name>" to confirm that the store exists in data.

5. If something truly cannot be computed from the data provided, explicitly say so and explain why.

6. Provide clear, structured business insights for sales, operations, inventory, or courier performance:
   - totals, averages, counts
   - trends or comparisons
   - top/bottom performers
   - operational risks, bottlenecks, or anomalies
   - actionable recommendations when relevant

7. Never mention internal errors, SQL text, or database internals to the user.

8. Your tone is concise, professional, and easy to understand.
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

  // Give a bit more room for forecasts & explanations
  return callOpenAI(messages, { temperature: 0.5, max_tokens: 1200 });
}

/**
 * Generic fallback / small-talk chat responder.
 */
export async function generalChatResponse(question, history = []) {
  const system = `
You are a friendly, helpful AI assistant for an ecommerce company in KSA (Saudi Arabia).
You can:
- Chat normally (greetings, small talk, gibberish).
- Answer conceptual questions about ecommerce, logistics, and analytics.
- If you suspect an internal error occurred, you MUST NOT mention technical details
  or claim that data "is unavailable".
  Instead, give a polite, general response and suggest the user try again
  or narrow their question.
`.trim();

  const messages = [
    { role: 'system', content: system },
    ...(history || []).slice(-4),
    { role: 'user', content: question }
  ];

  return callOpenAI(messages, { temperature: 0.7, max_tokens: 400 });
}
