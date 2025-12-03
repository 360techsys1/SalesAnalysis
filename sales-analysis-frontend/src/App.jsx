import { useState, useRef, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function MessageBubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-bot'}`}>
      <div className="bubble-meta">
        <span className="bubble-role">{isUser ? 'You' : 'Sales Analyst AI'}</span>
      </div>
      <div className="bubble-content">{content}</div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hi, I am your Sales Analysis Copilot. Ask me about orders, cancellations, hero products, top stores, or patterns in your sales data.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const question = input.trim();
    if (!question || loading) return;

    const newMessages = [...messages, { role: 'user', content: question }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const history = newMessages.slice(-6); // small context window

      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: history.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer || 'No answer returned.' }
      ]);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I could not complete that request due to an error. Please try again or narrow your question.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    'Which store had the highest sales last month?',
    'How many orders were cancelled in the last 15 days?',
    'Which products are top sellers this month?',
    'Which areas are generating the most orders?',
    'Do you see any pattern in order cancellations?',
    'Who are my top 10 stores by revenue?'
  ];

  const handleQuickQuestion = (q) => {
    setInput(q);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Sales Analysis Copilot</h1>
          <p className="subtitle">
            Ask deep questions about your orders, stores, products, and cancellations – powered by
            live SQL data and LLM analysis.
          </p>
        </div>
        <div className="badge">Enterprise Ready</div>
      </header>

      <main className="layout">
        <section className="chat-panel glass">
          <div className="chat-messages">
            {messages.map((m, idx) => (
              <MessageBubble key={idx} role={m.role} content={m.content} />
            ))}
            {loading && (
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
                <p>Analyzing your sales data...</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Example: Which store has the most cancelled orders in the last 30 days?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </form>
          {error && <div className="error-banner">{error}</div>}
        </section>

        <aside className="side-panel">
          <div className="card">
            <h2>Suggested questions</h2>
            <div className="chips">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chip"
                  onClick={() => handleQuickQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="card secondary">
            <h2>Tips for better insights</h2>
            <ul className="tips">
              <li>Specify a time range: “last month”, “last 7 days”, “Q1 2025”.</li>
              <li>Mention dimensions: store, city, area, product, courier, status.</li>
              <li>Ask for comparisons: “compare product A vs product B by revenue”.</li>
              <li>Ask for patterns and root causes, not just raw numbers.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}


