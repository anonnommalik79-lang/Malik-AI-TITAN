import React, { useState, useEffect, useRef } from 'react';

// ==================== МОЗГ СИСТЕМЫ ====================
const API_URL = `https://backstage-feminism-elves.ngrok-free.dev/api/ask`;

const App: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append('question', input);
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { "ngrok-skip-browser-warning": "true" },
        body: fd
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.content, type: data.status }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Сбой связи с ядром." }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="nexus-wrapper">
      <style>{`
        :root { --bg: #0c0d10; --panel: #121418; --accent: #3376ff; --text: #e1e3e8; }
        body { margin: 0; background: var(--bg); color: var(--text); font-family: sans-serif; overflow: hidden; }
        .nexus-wrapper { display: flex; height: 100vh; width: 100vw; }

        /* SIDEBAR (Боковая панель) */
        .sidebar { width: 260px; background: var(--panel); border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; padding: 20px; transition: 0.3s; }
        .logo-area { font-weight: 800; font-size: 18px; letter-spacing: 2px; margin-bottom: 30px; display: flex; align-items: center; gap: 10px; }
        .btn-new-chat { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; text-align: left; transition: 0.2s; }
        .btn-new-chat:hover { background: rgba(255,255,255,0.1); }
        .nav-label { font-size: 10px; color: #555; text-transform: uppercase; margin: 25px 0 10px; font-weight: bold; }
        .session-item { padding: 10px; font-size: 13px; color: #888; cursor: pointer; border-radius: 6px; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-item.active { background: rgba(51,118,255,0.1); color: #fff; border-left: 3px solid var(--accent); }

        /* MAIN CONTENT */
        .main-content { flex: 1; display: flex; flex-direction: column; position: relative; background: var(--bg); }
        .top-nav { padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); }
        .status-badge { font-size: 12px; display: flex; align-items: center; gap: 6px; color: #00e676; }
        .status-dot { width: 6px; height: 6px; background: #00e676; border-radius: 50%; box-shadow: 0 0 10px #00e676; }

        /* DASHBOARD (Как на фото) */
        .dashboard { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .central-icon { font-size: 50px; margin-bottom: 20px; opacity: 0.8; }
        .main-title { font-size: 42px; font-weight: 800; margin: 0; letter-spacing: -1px; }
        .blue-text { color: var(--accent); }
        .subtitle { color: #555; margin-top: 10px; font-size: 15px; }
        .mode-cards { display: flex; gap: 15px; margin-top: 40px; }
        .card { background: var(--panel); border: 1px solid rgba(255,255,255,0.05); padding: 15px 25px; border-radius: 12px; cursor: pointer; transition: 0.3s; }
        .card:hover { border-color: var(--accent); transform: translateY(-5px); }

        /* CHAT AREA */
        .chat-scroll { flex: 1; overflow-y: auto; padding: 40px 20%; display: flex; flex-direction: column; gap: 30px; }
        .msg { max-width: 85%; line-height: 1.6; font-size: 15px; }
        .msg.user { align-self: flex-end; background: var(--accent); color: #fff; padding: 12px 20px; border-radius: 18px 18px 2px 18px; }
        .msg.ai { align-self: flex-start; }
        .ai-name { font-size: 11px; font-weight: bold; color: var(--accent); margin-bottom: 8px; letter-spacing: 1px; }

        /* INPUT AREA */
        .input-box { padding: 30px 20%; background: linear-gradient(transparent, var(--bg)); }
        .input-container { background: var(--panel); border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; display: flex; align-items: center; padding: 10px 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        input { flex: 1; background: transparent; border: none; color: #fff; font-size: 15px; outline: none; padding: 10px; }
        .btn-send { background: var(--accent); border: none; width: 40px; height: 40px; border-radius: 50%; color: #fff; cursor: pointer; }

        /* MOBILE FIXES */
        @media (max-width: 900px) {
          .sidebar { display: none; }
          .chat-scroll, .input-box { padding: 20px 5%; }
          .main-title { font-size: 28px; }
        }
      `}</style>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="logo-area">🔱 MALIK</div>
        <button className="btn-new-chat">+ Новый чат</button>
        <div className="nav-label">Недавние сессии</div>
        <div className="session-item active">🔎 OSINT Report: Elite</div>
        <div className="session-item">{"<>"} Code Audit Pro</div>
        <div className="session-item">... Data Analysis</div>
      </aside>

      {/* MAIN */}
      <main className="main-content">
        <header className="top-nav">
          <div style={{fontWeight: 'bold'}}>MALIK <span style={{color: '#3376ff'}}>NEXUS</span></div>
          <div className="status-badge"><span className="status-dot"></span> ONLINE</div>
        </header>

        {messages.length === 0 ? (
          <div className="dashboard">
            <div className="central-icon">🧊</div>
            <h2 className="main-title">MALIK AI</h2>
            <h2 className="main-title blue-text">Supreme Nexus Elite</h2>
            <p className="subtitle">Синтез данных активирован. Загрузка нейросети... |</p>

            <div className="mode-cards">
              <div className="card">{"<>"} Код</div>
              <div className="card">🖼 Образ</div>
              <div className="card">🌐 Анализ</div>
            </div>
          </div>
        ) : (
          <div className="chat-scroll">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === 'assistant' && <div className="ai-name">MALIK_AI</div>}
                <div dangerouslySetInnerHTML={{ __html: m.content }} />
              </div>
            ))}
            {loading && <div className="msg ai"><div className="ai-name">MALIK_AI</div>🧠 Анализирую...</div>}
            <div ref={chatEndRef} />
          </div>
        )}

        <footer className="input-box">
          <form className="input-container" onSubmit={handleSend}>
            <span style={{opacity: 0.3, marginRight: 10}}>+</span>
            <input
              placeholder="Введите ваш запрос..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn-send">➤</button>
          </form>
          <center style={{fontSize: 10, color: '#444', marginTop: 15}}>MALIK KERNEL V3.0 ELITE • NEURAL NEXUS</center>
        </footer>
      </main>
    </div>
  );
};

export default App;