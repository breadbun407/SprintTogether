// src/App.jsx
import { useEffect, useState } from 'react';
import './App.css';

let ws = null;

function App() {
  const [roomId, setRoomId] = useState(window.location.hash.slice(1));
  const [inRoom, setInRoom] = useState(false);

  // User setup
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(500);
  const [displayMode, setDisplayMode] = useState('numbers');

  // Room state
  const [roomState, setRoomState] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [myText, setMyText] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [sprintLogs, setSprintLogs] = useState([]);

  useEffect(() => {
    const handleHash = () => setRoomId(window.location.hash.slice(1));
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Timer countdown hook
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

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    ws = new WebSocket(wsUrl);
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
      if (data.type === 'SPRINT_STARTED') {
        setTimeLeft(data.endTime - Date.now());
      }
      if (data.type === 'SPRINT_ENDED') {
        setTimeLeft(0);
        setSprintLogs(data.logs);
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

  if (!inRoom) {
    return (
      <div className="setup-container">
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
            {roomState.users.map(u => (
              <li key={u.id}>
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
          <div className="timer">{formatTime(timeLeft)}</div>
        </div>

        {roomState.isHost && roomState.status === 'waiting' && (
          <div className="host-controls">
            <label>
              Duration (mins):
              <input type="number" value={roomState.duration} onChange={e => updateSettings(Number(e.target.value), roomState.shareLog)} min="1" />
            </label>
            <label>
              <input type="checkbox" checked={roomState.shareLog} onChange={e => updateSettings(roomState.duration, e.target.checked)} />
              Share writing at the end
            </label>
            <button onClick={startSprint} className="start-btn">Start Sprint</button>
          </div>
        )}

        <textarea
          className="writer-canvas"
          placeholder={roomState.status === 'waiting' ? "Waiting for sprint to start..." : "Start writing..."}
          disabled={roomState.status !== 'active'}
          value={myText}
          onChange={handleTextChange}
        />

        {roomState.status === 'finished' && (
          <div className="logs-area">
            <h3>Sprint Logs</h3>
            {!roomState.shareLog && <p><em>Sharing writing was disabled by the host.</em></p>}
            {roomState.shareLog && sprintLogs.map((log, i) => (
              <div key={i} className="log-entry">
                <h4>{log.name}'s Writing</h4>
                <p>{log.text || <em>(No text written)</em>}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;