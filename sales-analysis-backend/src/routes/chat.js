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

  // Never hard-error to user: gracefully handle missing question
  if (!question || typeof question !== 'string') {
    const answer =
      'Please provide your question as text, for example: "Show me total COD sales for last month" or "Hi".';
    return res.json({
      answer,
      rowCount: 0,
      mode: 'invalid_input'
    });
  }

  try {
    // 1) Decide mode: chat / clarify / sql
    const plan = await generateSqlFromQuestion(question, history);
    console.log('Router plan:', plan);

    // 2) Handle non-SQL modes directly
    if (plan.mode === 'chat' || plan.mode === 'clarify') {
      return res.json({
        answer: plan.message || 'I am here to help with your ecommerce analytics questions.',
        rowCount: null,
        mode: plan.mode
      });
    }

    // 3) SQL mode: validate and execute
    const sqlText = (plan.sql || '').trim();

    if (!sqlText) {
      console.warn('Empty SQL generated for SQL mode. Falling back to chat.');
      const fallbackAnswer = await generalChatResponse(question, history);
      return res.json({
        answer: fallbackAnswer,
        rowCount: 0,
        mode: 'fallback'
      });
    }

    if (!isSqlSafe(sqlText)) {
      console.warn('Blocked unsafe SQL from LLM:', sqlText);
      const fallbackAnswer =
        (plan.message &&
          `${plan.message}\n\nHowever, the generated SQL looked unsafe. Please rephrase or narrow your question.`) ||
        'I could not safely generate a query for that. Please try rephrasing or narrowing your request (e.g., specify a time range, branch, or store).';

      return res.json({
        answer: fallbackAnswer,
        rowCount: 0,
        mode: 'sql_rejected'
      });
    }

    console.log('Executing SQL:\n', sqlText);

    const rows = await runQuery(sqlText);

    // 4) Turn data into business explanation
    const answer = await answerFromData(question, rows, {
      rowCount: rows.length,
      sql: sqlText
    });

    return res.json({
      answer,
      rowCount: rows.length,
      mode: 'sql',
      sql: sqlText
    });
  } catch (err) {
    // NEVER leak internal errors to user; always return a friendly chat answer
    console.error('Chat endpoint internal error:', err);
    console.error('Error stack:', err.stack);

    try {
      const fallbackAnswer = await generalChatResponse(
        'The system had an internal issue while handling this user question: ' +
          question +
          '. Respond in a friendly way and ask them to try again or narrow their query, without mentioning any technical errors or databases.',
        history
      );

      return res.json({
        answer: fallbackAnswer,
        rowCount: 0,
        mode: 'error_fallback'
      });
    } catch (fallbackErr) {
      console.error('Fallback chat error:', fallbackErr);
      return res.json({
        answer:
          'Something went wrong while processing your request. Please try again with a slightly different or more specific question.',
        rowCount: 0,
        mode: 'error_fallback'
      });
    }
  }
});
