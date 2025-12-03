import fetch from 'node-fetch';
import { schemaDescription } from './schemaConfig.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function getModel() {
  // Default to a widely available Groq model; override via GROQ_MODEL in .env.
  // You can set GROQ_MODEL to any current Groq model ID, e.g. a 70B variant from the Groq console.
  return process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
}

export async function callGroq(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const body = {
    model: getModel(),
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 800
  };

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('Groq API error:', json);
    throw new Error(json.error?.message || 'Groq API request failed');
  }

  return json.choices[0].message.content;
}

export async function generateSqlFromQuestion(question, history = []) {
  const system = `
You are an expert SQL Server data analyst for an ecommerce/sales business in Karachi.
Your job is to translate the user's question into a SINGLE safe SQL SELECT query (or CTE + SELECT)
that runs against the given schema.

STRICT RULES:
- Only use SELECT queries (and optional CTEs with WITH).
- NEVER use INSERT, UPDATE, DELETE, MERGE, DROP, ALTER, TRUNCATE or any data-changing statement.
- Do not modify schema, indexes, or constraints.
- Do not use EXEC, sp_executesql, xp_cmdshell, OPENROWSET or any dynamic SQL.
- Do not reference tables or columns that are not described in the schema.
- Limit result size using TOP or an appropriate WHERE clause when returning many rows.
- Prefer using the AllOrderReport view for order-level analysis when possible.
- When the question is about counts or aggregates (totals, averages, top N), return only aggregated results, not raw detail rows.
- Always alias columns with business-friendly names when useful.
- DO NOT include a trailing semicolon.

Schema:
${schemaDescription}
  `.trim();

  const messages = [
    { role: 'system', content: system },
    ...(history || []).slice(-4),
    {
      role: 'user',
      content: `User question:\n${question}\n\nReturn ONLY the SQL query, nothing else.`
    }
  ];

  const sqlText = await callGroq(messages, { temperature: 0.1, max_tokens: 400 });
  return sqlText.trim();
}

function isSqlSafe(sqlText) {
  const sql = sqlText.trim().toUpperCase();

  if (!sql.startsWith('SELECT') && !sql.startsWith('WITH')) return false;
  if (sql.includes(';')) return false;

  const forbidden = ['INSERT ', 'UPDATE ', 'DELETE ', 'MERGE ', 'DROP ', 'ALTER ', 'TRUNCATE ', 'EXEC ', 'XP_', 'SP_EXECUTESQL'];
  if (forbidden.some(word => sql.includes(word))) return false;

  return true;
}

export async function answerFromData(question, rows, meta = {}) {
  const system = `
You are an enterprise-grade sales and operations analyst for an ecommerce company in Karachi.
You receive:
- The user's question.
- The SQL result rows as JSON.
- Optional metadata (e.g., time range, filters, table used).

Your job:
- Explain insights clearly in business language.
- Summarize key metrics (totals, averages, trends, top/bottom performers).
- When relevant, highlight risks, anomalies, and actionable recommendations.
- If the data is insufficient or empty, clearly say so and suggest what additional data or filters are needed.
- NEVER fabricate numbers that are not present in the data.
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

  return callGroq(messages, { temperature: 0.4, max_tokens: 800 });
}

export { isSqlSafe };


