// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Root route
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Sales & Operations Chat Analytics API',
    endpoints: {
      health: '/health',
      chat: '/api/chat'
    }
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/chat', chatRouter);

// Export for serverless environment (e.g. Vercel)
export default app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Analytics chatbot backend listening on http://localhost:${PORT}`);
  });
}
