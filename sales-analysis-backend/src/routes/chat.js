import express from 'express';
import { runQuery } from '../db.js';
import { generateSqlFromQuestion, isSqlSafe, answerFromData } from '../llm.js';

export const chatRouter = express.Router();

chatRouter.post('/', async (req, res) => {
  const { question, history } = req.body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const sqlText = await generateSqlFromQuestion(question, history);

    if (!isSqlSafe(sqlText)) {
      console.warn('Blocked unsafe SQL from LLM:', sqlText);
      return res.status(400).json({
        error: 'Generated SQL was considered unsafe. Please rephrase your question or narrow the scope.'
      });
    }

    console.log('Generated SQL:\n', sqlText);

    const rows = await runQuery(sqlText);

    const answer = await answerFromData(question, rows, {
      rowCount: rows.length,
      sql: sqlText
    });

    res.json({
      answer,
      rowCount: rows.length
    });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


