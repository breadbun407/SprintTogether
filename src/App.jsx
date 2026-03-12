import { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import posthog from 'posthog-js'

let ws = null;

const GENRES = ["Any Genre", "Fantasy", "Sci-Fi", "Romance", "Thriller", "Horror", "Mystery", "Non-Fiction", "General Fiction"];

function App() {
  const [appView, setAppView] = useState('setup'); // 'setup', 'lobby', 'room'
  const [roomIdFromUrl, setRoomIdFromUrl] = useState(window.location.hash.slice(1));

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // User Profile
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(500);
  const [genre, setGenre] = useState('Any Genre');
  const [displayMode, setDisplayMode] = useState('numbers');
  const [shareMyLog, setShareMyLog] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);

  // Matchmaking Lobby
  const [lobbyRooms, setLobbyRooms] = useState([]);

  // Room State
  const [roomState, setRoomState] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [myText, setMyText] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [sprintLogs, setSprintLogs] = useState([]);
  const [breakDuration, setBreakDuration] = useState(5);

  // Settings panel (host only)
  const [showSettings, setShowSettings] = useState(false);
  const [draftDuration, setDraftDuration] = useState(15);
  const [draftShareLog, setDraftShareLog] = useState(true);
  const [draftIsPrivate, setDraftIsPrivate] = useState(false);

  // Chat scroll ref
  const chatEndRef = useRef(null);
  const appViewRef = useRef(appView);

  const myTextRef = useRef(myText);
  const roomStateRef = useRef(roomState);
  const goalRef = useRef(goal);

  useEffect(() => {
    appViewRef.current = appView;
  }, [appView]);

  useEffect(() => {
    const handleHash = () => setRoomIdFromUrl(window.location.hash.slice(1));
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

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roomState?.chat]);

  useEffect(() => { myTextRef.current = myText; }, [myText]);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);

  useEffect(() => { goalRef.current = goal; }, [goal]);

  // ─── WebSocket Handlers ────────────────────────────────────────────────────

  const joinLobby = useCallback(() => {
    setAppView('lobby');
    window.location.hash = '';
    ws.send(JSON.stringify({
      type: 'JOIN_LOBBY',
      user: { name, goal, genre, displayMode, shareMyLog }
    }));
  }, [name, goal, genre, displayMode, shareMyLog]);

  const joinRoom = useCallback((targetRoomId) => {
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      roomId: targetRoomId,
      user: { name, goal, genre, displayMode, shareMyLog }
    }));
  }, [name, goal, genre, displayMode, shareMyLog]);

  const handleWebSocketMessages = useCallback((event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'ERROR') {
      alert(data.message);
      window.location.hash = '';
      setAppView('lobby');
    }
    if (data.type === 'LOBBY_STATE') {
      setLobbyRooms(data.rooms);
      if (appViewRef.current !== 'room') setAppView('lobby');
    }
    if (data.type === 'ROOM_STATE') {
      setRoomState(data);
      setDraftDuration(data.duration);
      setDraftShareLog(data.shareLog);
      setDraftIsPrivate(data.isPrivate ?? false);
      setAppView('room');
      window.location.hash = data.roomId;
    }
    if (data.type === 'ROOM_CLOSED') {
      alert("The host has left and the room was closed.");
      setRoomState(null);
      window.location.hash = '';
      joinLobby();
    }
    if (data.type === 'SPRINT_STARTED' || data.type === 'BREAK_STARTED') {
      setTimeLeft(Math.max(0, data.endTime - Date.now()));
    }
    if (data.type === 'SPRINT_ENDED') {
      setTimeLeft(0);
      setSprintLogs(prev => [{ sprintNumber: data.sprintNumber, logs: data.logs }, ...prev]);

      const finalWordCount = myTextRef.current.trim() === '' ? 0 : myTextRef.current.trim().split(/\s+/).length;
      posthog.capture('sprint_completed', {
        sprint_number: data.sprintNumber,
        word_count: finalWordCount,
        word_goal: goalRef.current,
        goal_reached: finalWordCount >= goalRef.current,
        duration_min: roomStateRef.current?.duration,
        writers_shared: data.logs.length,
      });
    }
    if (data.type === 'CLEAR_TEXT') {
      setMyText('');
      setTimeLeft(null);
    }
  }, [joinLobby]);

  const connectAndFindMatches = () => {
    if (!name.trim()) return alert("Please enter a name.");

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const rawWsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
      ws = new WebSocket(rawWsUrl.split('#')[0]);

      ws.onopen = () => {
        if (roomIdFromUrl) {
          joinRoom(roomIdFromUrl);
        } else {
          joinLobby();
        }
      };

      ws.onmessage = handleWebSocketMessages;

      ws.onclose = () => {
        if (appViewRef.current !== 'setup') {
          alert("Connection lost. Please refresh.");
          setAppView('setup');
          setRoomState(null);
        }
      };
    } else {
      joinLobby();
    }
  };

  const createRoom = () => {
    posthog.capture('room_created', {
      genre,
      word_goal: goal,
      is_private: isPrivate,
    });
    ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      user: { name, goal, genre, displayMode, shareMyLog, isPrivate }
    }));
  };

  const leaveRoom = () => {
    if (roomState?.status === 'active') {
      posthog.capture('left_during_sprint', {
        word_count: myText.trim() === '' ? 0 : myText.trim().split(/\s+/).length,
        word_goal: goal,
        duration_min: roomState.duration,
      });
    }
    ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    setRoomState(null);
    setSprintLogs([]);
    setMyText('');
    setTimeLeft(null);
    joinLobby();
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    ws.send(JSON.stringify({ type: 'CHAT', text: chatInput.trim() }));
    setChatInput('');
  };

  const saveSettings = () => {
    ws.send(JSON.stringify({ type: 'UPDATE_SETTINGS', duration: draftDuration, shareLog: draftShareLog, isPrivate: draftIsPrivate }));
    setShowSettings(false);
  };

  const updateProgress = (text) => {
    setMyText(text);
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    ws.send(JSON.stringify({ type: 'UPDATE_PROGRESS', wordCount, text }));
  };

  const toggleShareMyLog = () => {
    const next = !shareMyLog;
    setShareMyLog(next);
    ws.send(JSON.stringify({ type: 'UPDATE_SHARE_PREF', shareMyLog: next }));
  };

  const startSprint = () => ws.send(JSON.stringify({ type: 'START_SPRINT' }));
  const startBreak = () => ws.send(JSON.stringify({ type: 'START_BREAK', duration: breakDuration }));
  const setupNewSprint = () => ws.send(JSON.stringify({ type: 'SETUP_NEW_SPRINT' }));

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = (ms) => {
    if (ms === null || ms === undefined) return '--:--';
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const statusLabel = (status) => {
    if (status === 'active') return 'Sprinting';
    if (status === 'finished') return 'Finished';
    if (status === 'break') return 'On Break';
    return 'Waiting';
  };

  // ─── Views ─────────────────────────────────────────────────────────────────

  if (appView === 'setup') {
    return (
      <div className="view setup-view">
        <div className="setup-card">
          <h1 className="logo" style={{ textAlign: 'center' }}>SprintR</h1>
          <p className="tagline" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>Matching you with other writers for productivity and collaboration</p>
          <p className="tagline" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>Create a room and send an invite to your writing partners.</p>
          <p className="tagline" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>Or search for an existing room to join others, in your genre, or with similar word count goals.</p>

          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connectAndFindMatches()}
              placeholder="Public Display Name"
              maxLength={10}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Word Count Goal</label>
              <input
                type="number"
                value={goal}
                onChange={e => setGoal(Math.max(1, parseInt(e.target.value) || 0))}
                min={1}
                max={99999}
              />
            </div>

            <div className="form-group">
              <label>Genre</label>
              <select value={genre} onChange={e => setGenre(e.target.value)}>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Display Progress As</label>
              <div className="toggle-group">
                <button
                  className={displayMode === 'numbers' ? 'active' : ''}
                  onClick={() => setDisplayMode('numbers')}
                >
                  Numbers
                </button>
                <button
                  className={displayMode === 'percentage' ? 'active' : ''}
                  onClick={() => setDisplayMode('percentage')}
                >
                  Percentage
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Share Writing Log</label>
              <div className="toggle-group">
                <button
                  className={shareMyLog ? 'active' : ''}
                  onClick={() => setShareMyLog(true)}
                >
                  Yes
                </button>
                <button
                  className={!shareMyLog ? 'active' : ''}
                  onClick={() => setShareMyLog(false)}
                >
                  No
                </button>
              </div>
            </div>
          </div>

          <div className="form-group">
            {!roomIdFromUrl && (
              <p >
                <label>Room Visibility (if creating)</label>

              </p>
            )}

            <div className="toggle-group">
              {!roomIdFromUrl && (
                <button
                  className={!isPrivate ? 'active' : ''}
                  onClick={() => setIsPrivate(false)}
                >
                  Public
                </button>
              )}
              {!roomIdFromUrl && (
                <button
                  className={isPrivate ? 'active' : ''}
                  onClick={() => setIsPrivate(true)}
                >
                  Private
                </button>
              )}

            </div>

          </div>

          {roomIdFromUrl && (
            <p className="direct-link-notice">
              You have a room invite link. You'll join directly.
            </p>
          )}

          <button className="btn-primary" onClick={connectAndFindMatches}>
            {roomIdFromUrl ? 'Join Room →' : 'Find a Match →'}
          </button>

          <button className="btn-theme-toggle" onClick={() => setIsDarkMode(d => !d)}>
            {isDarkMode ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
    );
  }

  if (appView === 'lobby') {
    return (
      <div className="view lobby-view">
        <header className="lobby-header">
          <h1 className="logo" style={{ textAlign: 'center' }}>SprintR</h1>
          <div className="lobby-meta">
            <span className="lobby-user-chip">
              ✍️ {name} · {goal} words · {genre}
            </span>
            <button className="btn-ghost" onClick={() => setAppView('setup')}>← Edit Profile</button>
            <button className="btn-theme-toggle" onClick={() => setIsDarkMode(d => !d)}>
              {isDarkMode ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        <div className="lobby-body">
          <div className="lobby-intro">
            <h2>Rooms Matched For You</h2>
            <p>Sorted by genre & goal compatibility. Join one or start your own.</p>
          </div>

          <div className="room-cards">
            {lobbyRooms.length === 0 ? (
              <div className="empty-state">
                <p>No rooms yet — be the first!</p>
              </div>
            ) : (
              lobbyRooms.map(room => (
                <div key={room.roomId} className={`room-card ${room.genre === genre ? 'matched' : ''}`}>
                  <div className="room-card-top">
                    <div>
                      <span className="room-host">{room.hostName}'s Room</span>
                      <span className={`room-status-badge status-${room.status}`}>
                        {statusLabel(room.status)}
                      </span>
                    </div>
                    <span className="room-users">{room.usersCount} writer{room.usersCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="room-card-details">
                    <span className="room-tag">{room.genre}</span>
                    <span className="room-tag">{room.goal.toLocaleString()} words</span>
                    {room.genre === genre && <span className="room-tag match-tag">🎯 Genre match</span>}
                  </div>
                  <button
                    className="btn-join"
                    onClick={() => joinRoom(room.roomId)}
                    disabled={room.status === 'active'}
                    title={room.status === 'active' ? 'Sprint in progress — wait for the next one' : ''}
                  >
                    {room.status === 'active' ? 'In Progress' : 'Join Room →'}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="lobby-create">
            <button className="btn-primary" onClick={createRoom}>+ Create New Room</button>
          </div>
        </div>
      </div>
    );
  }

  if (appView === 'room' && roomState) {
    const isHost = roomState.isHost;
    const status = roomState.status;
    const myWordCount = myText.trim() === '' ? 0 : myText.trim().split(/\s+/).length;

    return (
      <div className="view room-view">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <h1 className="logo" style={{ textAlign: 'center' }}>SprintR</h1>
            <button className="btn-theme-toggle icon-only" onClick={() => setIsDarkMode(d => !d)}>
              {isDarkMode ? 'Light' : 'Dark'}
            </button>
          </div>

          {/* Room Info */}
          <div className="room-info-block">
            <p className="room-id-label">Room</p>
            <p className="room-id-value">{roomState.roomId}</p>
            {roomState.isPrivate && <span className="room-tag privacy-tag">🔒 Private</span>}
            <button
              className="btn-ghost small"
              onClick={() => navigator.clipboard.writeText(window.location.href)}
            >
              Copy Invite Link
            </button>
          </div>

          {/* Participants */}
          <div className="participants">
            <h3>Writers</h3>

            {roomState.users.map(u => (
              <div key={u.id} className="participant-row">
                <span className="participant-name">{u.name}</span>
                <span>{u.id === roomState.hostId && '(Host)'}</span>
                <span className="participant-progress">{u.displayProgress}</span>
              </div>
            ))}
          </div>

          {/* My Settings */}
          <div className="my-settings">
            <label className="inline-toggle">
              <span>Share my log</span>
              <input type="checkbox" checked={shareMyLog} onChange={toggleShareMyLog} />
            </label>
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className="host-controls">
              <h3>Host Controls</h3>

              {status === 'waiting' && (
                <>
                  <button className="btn-primary full" onClick={startSprint}>
                    Start Sprint ({roomState.duration} min)
                  </button>
                  <button className="btn-ghost full settings-btn" onClick={() => setShowSettings(s => !s)}>
                    ⚙ Settings
                  </button>
                  {showSettings && (
                    <div className="settings-panel">
                      <label>Duration (min)
                        <input
                          type="number"
                          value={draftDuration}
                          min={1}
                          max={120}
                          onChange={e => setDraftDuration(parseInt(e.target.value) || 1)}
                        />
                      </label>
                      <label className="inline-toggle">
                        <span>Share logs at end</span>
                        <input
                          type="checkbox"
                          checked={draftShareLog}
                          onChange={e => setDraftShareLog(e.target.checked)}
                        />
                      </label>
                      <label className="inline-toggle">
                        <span>Private room</span>
                        <input
                          type="checkbox"
                          checked={draftIsPrivate}
                          onChange={e => setDraftIsPrivate(e.target.checked)}
                        />
                      </label>
                      <button className="btn-primary small" onClick={saveSettings}>Save</button>
                    </div>
                  )}
                </>
              )}

              {status === 'active' && (
                <div className="break-controls">
                  <label>Break duration (min)
                    <input
                      type="number"
                      value={breakDuration}
                      min={1}
                      max={60}
                      onChange={e => setBreakDuration(parseInt(e.target.value) || 1)}
                    />
                  </label>
                  <button className="btn-secondary full" onClick={startBreak}>
                    Start Break
                  </button>
                </div>
              )}

              {(status === 'finished' || status === 'break') && (
                <button className="btn-primary full" onClick={setupNewSprint}>
                  New Sprint
                </button>
              )}
            </div>
          )}

          {/* Leave */}
          <div className="sidebar-footer">
            <button className="btn-danger" onClick={leaveRoom}>← Leave Room</button>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <main className="room-main">

          {/* Status Bar */}
          <div className={`status-bar status-${status}`}>
            <span className="status-label">{statusLabel(status)}</span>
            {status === 'waiting' && (
              <span className="timer">{String(roomState.duration).padStart(2, '0')}:00</span>
            )}
            {status !== 'waiting' && timeLeft !== null && timeLeft > 0 && (
              <span className="timer">{formatTime(timeLeft)}</span>
            )}
            {status !== 'waiting' && timeLeft === 0 && (
              <span className="timer done">Time's up!</span>
            )}
            <span className="my-word-count">{myWordCount.toLocaleString()} / {goal.toLocaleString()} words</span>
          </div>

          {/* Writing Area */}
          <textarea
            className="writing-area"
            value={myText}
            onChange={e => updateProgress(e.target.value)}
            placeholder={
              status === 'waiting' ? "Waiting for the host to start the sprint…" :
                status === 'active' ? "Time to write" :
                  status === 'break' ? "Sprint over. Stretch your fingers" :
                    "Sprint complete."
            }
            disabled={status !== 'active'}
            spellCheck={true}
          />

          {/* Sprint Logs */}
          {sprintLogs.length > 0 && (
            <div className="sprint-logs">
              {sprintLogs.map(log => (
                <details key={log.sprintNumber} className="sprint-log-entry">
                  <summary>Sprint #{log.sprintNumber} — {log.logs.length} shared log{log.logs.length !== 1 ? 's' : ''}</summary>
                  {log.logs.length === 0 ? (
                    <p className="no-logs">No one shared their writing this sprint.</p>
                  ) : (
                    log.logs.map((l, i) => (
                      <div key={i} className="log-block">
                        <p className="log-author">{l.name}</p>
                        <p className="log-text">{l.text}</p>
                      </div>
                    ))
                  )}
                </details>
              ))}
            </div>
          )}
        </main>

        {/* ── Chat ── */}
        <aside className="chat-panel">
          <h3>Chat</h3>
          <div className="chat-messages">
            {roomState.chat.length === 0 && (
              <p className="chat-empty">No messages yet. <br />Say hi!</p>
            )}
            {roomState.chat.map((msg, i) => (
              <div key={i} className="chat-message">
                <span className="chat-name">{msg.name}</span>
                <span className="chat-text">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message…"
              maxLength={200}
            />
            <button type="submit">Send</button>
          </form>
        </aside>

      </div>
    );
  }

  // Fallback
  return <div className="view"><p>Connecting…</p></div>;
}

export default App;