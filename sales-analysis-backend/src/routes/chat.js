// routes/chat.js
import express from 'express';
import { runQuery } from '../db.js';
import {
  generateSqlFromQuestion,
  isSqlSafe,
  answerFromData,
  generalChatResponse
} from '../llm.js';

export const chatRouter = express.Router();

chatRouter.post('/', async (req, res) => {
  const { question, history } = req.body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    // 1) Ask LLM how to handle this message
    const plan = await generateSqlFromQuestion(question, history);

    console.log('Router plan:', JSON.stringify(plan, null, 2));

    // 2) Pure chat / clarification path (no SQL)
    if (plan.mode === 'chat' || plan.mode === 'clarify') {
      const answer =
        plan.message ||
        "I'm here to help with your ecommerce, logistics, and inventory questions.";

      return res.json({
        answer,
        rowCount: 0,
        mode: plan.mode
      });
    }

    // 3) SQL path
    let sqlText = (plan.sql || '').trim();
    if (!sqlText) {
      console.warn('LLM returned mode=sql but empty SQL, falling back to chat.');
      const fallback = await generalChatResponse(question, history);
      return res.json({
        answer: fallback,
        rowCount: 0,
        mode: 'chat'
      });
    }

    if (!isSqlSafe(sqlText)) {
      console.warn('Blocked unsafe SQL from LLM:', sqlText);
      const fallback = await generalChatResponse(
        `User asked: "${question}". 
Internal safety checks blocked the generated SQL. 
Ignore any database details and instead give a high-level, helpful explanation or suggestions.`,
        history
      );
      return res.json({
        answer: fallback,
        rowCount: 0,
        mode: 'chat'
      });
    }

    console.log('Generated SQL:\n', sqlText);

    // 4) Run SQL
    const rows = await runQuery(sqlText);

    // 5) Turn rows into business answer (including forecasts if requested)
    const answer = await answerFromData(question, rows, {
      rowCount: rows.length,
      sql: sqlText
    });

    return res.json({
      answer,
      rowCount: rows.length,
      mode: 'sql'
    });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    console.error('Error stack:', err.stack);

    // 6) Never show raw errors to the user — fall back to general chat help
    try {
      const fallback = await generalChatResponse(
        `User asked: "${question}". 
There was an internal issue accessing or processing the data. 
Ignore any technical details and instead provide a helpful, high-level explanation, 
suggestions, or alternative ways the user can explore their sales and performance.`,
        history
      );

      return res.json({
        answer: fallback,
        rowCount: 0,
        mode: 'chat'
      });
    } catch (innerErr) {
      console.error('Fallback chat error:', innerErr);
      return res.json({
        answer:
          'Sorry, I had trouble processing your request just now. Please try again in a moment or slightly rephrase your question.',
        rowCount: 0,
        mode: 'chat'
      });
    }
  }
});
