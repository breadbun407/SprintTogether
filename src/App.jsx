import { useEffect, useState } from 'react';
import './App.css';

let ws = null;

function App() {
  const [roomId, setRoomId] = useState(window.location.hash.slice(1));
  const [inRoom, setInRoom] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [name, setName] = useState('');
  const [goal, setGoal] = useState(500);
  const [displayMode, setDisplayMode] = useState('numbers');

  const [roomState, setRoomState] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [myText, setMyText] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);

  // Updated: Holds historical logs. Prepending new ones so they appear on top.
  const [sprintLogs, setSprintLogs] = useState([]);
  const [breakDuration, setBreakDuration] = useState(5); // Host break config

  useEffect(() => {
    const handleHash = () => setRoomId(window.location.hash.slice(1));
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!timeLeft) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const connectAndJoin = (isCreating) => {
    if (!name.trim()) return alert("Please enter a name");

    const rawWsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    const cleanWsUrl = rawWsUrl.split('#')[0]; // Prevents fragment crash
    ws = new WebSocket(cleanWsUrl);

    ws.onopen = () => {
      const payload = {
        type: isCreating ? 'CREATE_ROOM' : 'JOIN_ROOM',
        roomId: isCreating ? null : roomId,
        user: { name, goal, displayMode }
      };
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'ERROR') {
        alert(data.message);
        window.location.hash = '';
      }
      if (data.type === 'ROOM_STATE') {
        setRoomState(data);
        setInRoom(true);
        window.location.hash = data.roomId;
      }
      if (data.type === 'SPRINT_STARTED' || data.type === 'BREAK_STARTED') {
        setTimeLeft(Math.max(0, data.endTime - Date.now()));
      }
      if (data.type === 'SPRINT_ENDED') {
        setTimeLeft(0);
        // Prepend the new logs to the top of our history
        setSprintLogs(prev => [{ sprintNumber: data.sprintNumber, logs: data.logs }, ...prev]);
      }
      if (data.type === 'CLEAR_TEXT') {
        setMyText('');
        setTimeLeft(null);
      }
    };
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    ws.send(JSON.stringify({ type: 'CHAT', text: chatInput }));
    setChatInput('');
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    setMyText(text);
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    ws.send(JSON.stringify({ type: 'UPDATE_PROGRESS', wordCount, text }));
  };

  const updateSettings = (duration, shareLog) => {
    ws.send(JSON.stringify({ type: 'UPDATE_SETTINGS', duration, shareLog }));
  };

  const startSprint = () => ws.send(JSON.stringify({ type: 'START_SPRINT' }));
  const startBreak = () => ws.send(JSON.stringify({ type: 'START_BREAK', duration: breakDuration }));
  const setupNewSprint = () => ws.send(JSON.stringify({ type: 'SETUP_NEW_SPRINT' }));
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  if (!inRoom) {
    return (
      <div className="setup-container">
        <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
          <button onClick={toggleTheme} className="theme-toggle">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <h1>✍️ Sprint Writers</h1>
        <div className="setup-card">
          <h3>{roomId ? `Join Room: ${roomId}` : 'Create a New Room'}</h3>
          <input placeholder="Your Name" value={name} onChange={e => setName(e.target.value)} />
          <input type="number" placeholder="Word Count Goal" value={goal} onChange={e => setGoal(Number(e.target.value))} />
          <select value={displayMode} onChange={e => setDisplayMode(e.target.value)}>
            <option value="numbers">Show Goal as Numbers (e.g. 50 / 500)</option>
            <option value="percentage">Show Goal as % (Anonymized)</option>
          </select>
          <button onClick={() => connectAndJoin(!roomId)}>
            {roomId ? 'Join Room' : 'Create Room'}
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (ms) => {
    if (ms === null) return "--:--";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="room-layout">
      <div className="sidebar">
        <div className="panel users-panel">
          <h3>Users ({roomState.users.length})</h3>
          <ul>
            {roomState.users.map((u, i) => (
              <li key={i}>
                <strong>{u.name}</strong>
                <span className="progress-badge">{u.displayProgress}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel chat-panel">
          <h3>Chat</h3>
          <div className="chat-history">
            {roomState.chat.map((c, i) => (
              <div key={i}><strong>{c.name}:</strong> {c.text}</div>
            ))}
          </div>
          <form onSubmit={sendChat} className="chat-form">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ready?" />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>

      <div className="main-area">
        <div className="top-bar">
          <h2>Room: <code>{roomState.roomId}</code></h2>
          <div className="header-actions">

            <div className="timer-container" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                {roomState.status === 'active' ? 'Sprint Time' :
                  roomState.status === 'break' ? 'Break Time' :
                    roomState.status === 'finished' ? 'Finished' : 'Waiting'}
              </div>
              <div className="timer">{formatTime(timeLeft)}</div>
            </div>

            <button onClick={toggleTheme} className="theme-toggle">
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Phase 1: Setup Sprint Controls */}
        {roomState.isHost && roomState.status === 'waiting' && (
          <div className="host-controls">
            <label>
              Sprint (mins):
              <input type="number" style={{ marginLeft: '10px', width: '60px', padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} value={roomState.duration} onChange={e => updateSettings(Number(e.target.value), roomState.shareLog)} min="1" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={roomState.shareLog} onChange={e => updateSettings(roomState.duration, e.target.checked)} />
              Share writing at the end
            </label>
            <button onClick={startSprint} className="start-btn" style={{ marginLeft: 'auto' }}>Start Sprint</button>
          </div>
        )}

        {/* Phase 2: Post-Sprint Controls (Break Timer / Setup Next) */}
        {(roomState.status === 'finished' || roomState.status === 'break') && roomState.isHost && (
          <div className="host-controls" style={{ borderColor: 'var(--primary)' }}>
            {roomState.status === 'finished' && (
              <>
                <label>
                  Break (mins):
                  <input type="number" style={{ marginLeft: '10px', width: '60px', padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} value={breakDuration} onChange={e => setBreakDuration(Number(e.target.value))} min="1" />
                </label>
                <button onClick={startBreak} className="start-btn" style={{ background: '#3b82f6' }}>
                  Start Break
                </button>
              </>
            )}
            <button onClick={setupNewSprint} className="start-btn" style={{ marginLeft: 'auto', background: '#8b5cf6' }}>
              Setup Next Sprint
            </button>
          </div>
        )}

        <textarea
          className="writer-canvas"
          placeholder={roomState.status === 'waiting' ? "Waiting for sprint to start..." : "Start writing..."}
          disabled={roomState.status !== 'active'}
          value={myText}
          onChange={handleTextChange}
        />

        {/* Logs Area (shows if any historical logs exist) */}
        {sprintLogs.length > 0 && (
          <div className="logs-area">
            <h3>Sprint History</h3>
            {sprintLogs.map((sprint, i) => (
              <div key={i} className="sprint-group">
                <h4 style={{ color: 'var(--primary)', marginBottom: '10px' }}>
                  Sprint {sprint.sprintNumber}
                </h4>
                {sprint.logs.length === 0 ? (
                  <p style={{ color: 'var(--text-light)' }}><em>Sharing writing was disabled by the host for this sprint.</em></p>
                ) : (
                  sprint.logs.map((log, j) => (
                    <div key={j} className="log-entry">
                      <strong>{log.name}</strong>
                      <p>{log.text || <em>(No text written)</em>}</p>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;