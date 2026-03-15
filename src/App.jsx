import { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import posthog from 'posthog-js'

let ws = null;

const GENRES = ["Any Genre", "Fantasy", "Sci-Fi", "Romance", "Thriller", "Horror", "Mystery", "Non-Fiction", "General Fiction"];

const SWATCHES = [
  { key: 'green', color: '#6ecf9f' },
  { key: 'teal', color: '#2bbcb0' },
  { key: 'blue', color: '#5b9cf6' },
  { key: 'slate', color: '#6e8ef0' },
  { key: 'purple', color: '#9b6ef3' },
  { key: 'pink', color: '#e8609a' },
  { key: 'red', color: '#f05a6e' },
  { key: 'orange', color: '#f5894a' },
];

function DarkToggle({ isDarkMode, setIsDarkMode }) {
  return (
    <button className="btn-theme-toggle" onClick={() => setIsDarkMode(d => !d)}>
      {isDarkMode ? 'Light' : 'Dark'}
    </button>
  );
}

function ColorPicker({ colorTheme, setColorTheme }) {
  return (
    <div className="theme-picker-swatches">
      {SWATCHES.map(s => (
        <button
          key={s.key}
          className={`swatch ${colorTheme === s.key ? 'active' : ''}`}
          style={{ background: s.color }}
          onClick={() => setColorTheme(s.key)}
          title={s.key.charAt(0).toUpperCase() + s.key.slice(1)}
        />
      ))}
    </div>
  );
}

function App() {
  const [appView, setAppView] = useState('setup'); // 'setup', 'lobby', 'room'
  const [roomIdFromUrl, setRoomIdFromUrl] = useState(window.location.hash.slice(1));

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('colorTheme') || 'green');

  // User Profile
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('Any Genre');
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
  const [activePane, setActivePane] = useState('write'); // 'write' | 'read'

  // Manuscript progress (set inside the room)
  const [manuscriptWords, setManuscriptWords] = useState(0);
  const [manuscriptGoal, setManuscriptGoal] = useState(500);
  const [showWordCounts, setShowWordCounts] = useState(false);

  // Settings panel (host only)
  const [showSettings, setShowSettings] = useState(false);
  const [draftDuration, setDraftDuration] = useState(15);
  const [draftShareLog, setDraftShareLog] = useState(true);
  const [draftIsPrivate, setDraftIsPrivate] = useState(false);

  // Refs — declared after all state so initial values are defined
  const chatEndRef = useRef(null);
  const appViewRef = useRef(appView);
  const myTextRef = useRef(myText);
  const roomStateRef = useRef(roomState);
  const editorRef = useRef(null);
  const sprintStartWordsRef = useRef(0); // snapshot of manuscriptWords when sprint begins
  const manuscriptWordsRef = useRef(manuscriptWords);
  const goalSetRef = useRef(false);     // has the user set a goal this session?
  const goalReachedRef = useRef(false); // have we already fired goal_reached this session?

  useEffect(() => { appViewRef.current = appView; }, [appView]);
  useEffect(() => { myTextRef.current = myText; }, [myText]);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => { manuscriptWordsRef.current = manuscriptWords; }, [manuscriptWords]);

  // Clear the rich editor when CLEAR_TEXT fires (sets myText to '')
  useEffect(() => {
    if (myText === '' && editorRef.current) {
      editorRef.current.innerHTML = '';
    }
  }, [myText]);

  useEffect(() => {
    if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
      posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
        api_host: 'https://us.i.posthog.com',
        defaults: '2026-01-30',
        person_profiles: 'never',
      });
    }
  }, []);

  useEffect(() => {
    const handleUnload = () => ws?.close();
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

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
    if (colorTheme === 'green') {
      document.documentElement.removeAttribute('data-color');
    } else {
      document.documentElement.setAttribute('data-color', colorTheme);
    }
    localStorage.setItem('colorTheme', colorTheme);
  }, [colorTheme]);

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

  // ─── WebSocket Handlers ────────────────────────────────────────────────────

  const joinLobby = useCallback(() => {
    setAppView('lobby');
    window.location.hash = '';
    ws.send(JSON.stringify({
      type: 'JOIN_LOBBY',
      user: { name, goal: 500, genre, displayMode: 'numbers', shareMyLog }
    }));
  }, [name, genre, shareMyLog]);

  const joinRoom = useCallback((targetRoomId) => {
    posthog.capture('room_joined', {
      source: window.location.hash ? 'invite_link' : 'matchmaking',
    });
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      roomId: targetRoomId,
      user: { name, goal: 500, genre, displayMode: 'numbers', shareMyLog }
    }));
  }, [name, genre, shareMyLog]);

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
      // Seed timer for users who join mid-sprint or mid-break
      if ((data.status === 'active' || data.status === 'break') && data.endTime) {
        setTimeLeft(prev => prev ?? Math.max(0, data.endTime - Date.now()));
      }
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
      if (data.type === 'SPRINT_STARTED') {
        sprintStartWordsRef.current = parseInt(manuscriptWordsRef.current) || 0;
      }
      setTimeLeft(Math.max(0, data.endTime - Date.now()));
    }
    if (data.type === 'SPRINT_ENDED') {
      setTimeLeft(0);
      setSprintLogs(prev => [{ sprintNumber: data.sprintNumber, logs: data.logs }, ...prev]);
      if (data.logs.length > 0) setActivePane('read');

      const finalWordCount = myTextRef.current.trim() === '' ? 0 : myTextRef.current.trim().split(/\s+/).length;
      posthog.capture('sprint_completed', {
        sprint_number: data.sprintNumber,
        word_count: finalWordCount,
        duration_min: roomStateRef.current?.duration,
        writers_shared: data.logs.length,
      });
      if (data.sprintNumber > 1) {
        posthog.capture('multiple_sprints_completed', {
          sprint_number: data.sprintNumber,
        });
      }
    }
    if (data.type === 'CLEAR_TEXT') {
      setMyText('');
      setTimeLeft(null);
      setActivePane('write');
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
      is_private: isPrivate,
    });
    ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      user: { name, goal: 500, genre, displayMode: 'numbers', shareMyLog, isPrivate }
    }));
  };

  const leaveRoom = () => {
    if (roomState?.status === 'active') {
      posthog.capture('left_during_sprint', {
        duration_min: roomState.duration,
      });
    }
    // Track room_empty if we're the last writer
    if (roomState?.users?.length === 1) {
      posthog.capture('room_empty', {
        sprint_count: roomState.sprintCount ?? 0,
      });
    }
    goalSetRef.current = false;
    goalReachedRef.current = false;
    ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    setRoomState(null);
    setSprintLogs([]);
    setMyText('');
    setTimeLeft(null);
    setManuscriptWords(0);
    setManuscriptGoal(500);
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

  const handleEditorInput = () => {
    const text = editorRef.current?.innerText || '';
    const html = editorRef.current?.innerHTML || '';
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    setMyText(text);
    ws.send(JSON.stringify({ type: 'UPDATE_PROGRESS', wordCount, text: html }));

    // Auto-advance manuscript word count during sprint
    const updatedTotal = sprintStartWordsRef.current + wordCount;
    setManuscriptWords(updatedTotal);
    updateManuscript(updatedTotal, manuscriptGoal);
  };

  const handleEditorKeyDown = (e) => {
    // Tab inserts indent instead of leaving the field
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '\u00a0\u00a0\u00a0\u00a0');
    }
  };

  const format = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const updateManuscript = (currentWords, goal) => {
    const current = parseInt(currentWords) || 0;
    const target = parseInt(goal) || 0;

    // First time a goal is set this session
    if (target > 0 && !goalSetRef.current) {
      goalSetRef.current = true;
      posthog.capture('manuscript_goal_set', { goal: target });
    }

    // First time current words meets or exceeds goal
    if (target > 0 && current >= target && !goalReachedRef.current) {
      goalReachedRef.current = true;
      posthog.capture('goal_reached', { goal: target, current_words: current });
    }

    ws.send(JSON.stringify({ type: 'UPDATE_MANUSCRIPT', currentWords: current, goal: target }));
  };

  const toggleShareMyLog = () => {
    const next = !shareMyLog;
    setShareMyLog(next);
    ws.send(JSON.stringify({ type: 'UPDATE_SHARE_PREF', shareMyLog: next }));
  };

  const startSprint = () => {
    posthog.capture('sprint_started', {
      duration_min: roomStateRef.current?.duration,
      writer_count: roomStateRef.current?.users?.length ?? 1,
    });
    ws.send(JSON.stringify({ type: 'START_SPRINT' }));
  };
  const startBreak = () => {
    posthog.capture('break_started', { duration_min: breakDuration });
    ws.send(JSON.stringify({ type: 'START_BREAK', duration: breakDuration }));
  };
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

  const getPct = (current, goal) => {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.floor((current / goal) * 100));
  };

  // ─── Views ─────────────────────────────────────────────────────────────────

  if (appView === 'setup') {
    return (
      <div className="view setup-view">
        <div className="setup-card">
          <DarkToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
          <h1 className="logo" style={{ textAlign: 'center' }}>SprintR</h1>
          <p className="tagline" style={{ textAlign: 'center' }}>Matching you with other writers for productivity and collaboration</p>
          <p className="tagline" style={{ textAlign: 'center' }}>Create a room and send an invite to your writing partners.</p>
          <p className="tagline" style={{ textAlign: 'center' }}>Or search for an existing room to join others in your genre.</p>

          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connectAndFindMatches()}
              placeholder="Public Display Name"
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label>Genre</label>
            <select value={genre} onChange={e => setGenre(e.target.value)}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Share Writing Log</label>
              <div className="toggle-group">
                <button className={shareMyLog ? 'active' : ''} onClick={() => setShareMyLog(true)}>Yes</button>
                <button className={!shareMyLog ? 'active' : ''} onClick={() => setShareMyLog(false)}>No</button>
              </div>
            </div>

            {!roomIdFromUrl && (
              <div className="form-group">
                <label>Room Visibility</label>
                <div className="toggle-group">
                  <button className={!isPrivate ? 'active' : ''} onClick={() => setIsPrivate(false)}>Public</button>
                  <button className={isPrivate ? 'active' : ''} onClick={() => setIsPrivate(true)}>Private</button>
                </div>
              </div>
            )}
          </div>

          {roomIdFromUrl && (
            <p className="direct-link-notice">
              You have a room invite link. You'll join directly.
            </p>
          )}

          <button className="btn-primary" onClick={connectAndFindMatches}>
            {roomIdFromUrl ? 'Join Room →' : 'Find a Match →'}
          </button>

          <ColorPicker colorTheme={colorTheme} setColorTheme={setColorTheme} />
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
            <span className="lobby-user-chip">{name} · {genre}</span>
            <button className="btn-ghost" onClick={() => setAppView('setup')}>← Edit Profile</button>
            <DarkToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
            <ColorPicker colorTheme={colorTheme} setColorTheme={setColorTheme} />
          </div>
        </header>

        <div className="lobby-body">
          <div className="lobby-intro">
            <h2>Rooms Matched For You</h2>
            <p>Sorted by genre compatibility. Join one or start your own.</p>
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
                    {room.genre === genre && <span className="room-tag match-tag">Genre match</span>}
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
            <DarkToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
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
            {roomState.users.map(u => {
              return (
                <div key={u.id} className="participant-row">
                  <div className="participant-info">
                    <span className="participant-name">
                      {u.id === roomState.hostId && <span className="host-crown" title="Host">👑</span>}
                      {u.name}
                    </span>
                    <span className="participant-sprint-words">
                      {(status === 'active' || status === 'finished') && `+${u.sprintWords.toLocaleString()} this sprint`}
                    </span>
                  </div>
                  {showWordCounts && u.goal > 0 && (
                    <div className="participant-wordcount">
                      <span>{u.currentWords.toLocaleString()} words</span>
                      <span>{u.goal.toLocaleString()} goal</span>
                    </div>
                  )}
                  {u.goal > 0 ? (
                    <div className="progress-bar-track" title={`${getPct(u.currentWords, u.goal)}%`}>
                      <div className="progress-bar-fill" style={{ width: `${getPct(u.currentWords, u.goal)}%` }} />
                    </div>
                  ) : (
                    <div className="progress-bar-track progress-bar-empty" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Writer Settings */}
          <div className="my-settings">
            <p className="settings-section-label">My Progress</p>

            <div className="manuscript-inputs">
              <div className="manuscript-field">
                <label>Current words</label>
                <input
                  type="number"
                  min={0}
                  value={manuscriptWords}
                  placeholder="e.g. 15000"
                  disabled={status === 'active'}
                  onChange={e => {
                    setManuscriptWords(e.target.value);
                    updateManuscript(e.target.value, manuscriptGoal);
                  }}
                />
              </div>
              <div className="manuscript-field">
                <label>Goal</label>
                <input
                  type="number"
                  min={0}
                  value={manuscriptGoal}
                  placeholder="e.g. 50000"
                  disabled={status === 'active'}
                  onChange={e => {
                    setManuscriptGoal(e.target.value);
                    updateManuscript(manuscriptWords, e.target.value);
                  }}
                />
              </div>
            </div>

            <label className="inline-toggle">
              <span>Show word counts</span>
              <input
                type="checkbox"
                checked={showWordCounts}
                onChange={e => setShowWordCounts(e.target.checked)}
              />
            </label>

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

              {/* Nothing shown while sprint is active — it runs to completion */}

              {status === 'finished' && (
                <div className="post-sprint-controls">
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
                  <button className="btn-primary full" onClick={setupNewSprint}>
                    ▶ New Sprint
                  </button>
                </div>
              )}

              {status === 'break' && (
                <button className="btn-primary full" onClick={setupNewSprint}>
                  ▶ New Sprint
                </button>
              )}
            </div>
          )}

          {/* Leave */}
          <div className="sidebar-footer">
            <ColorPicker colorTheme={colorTheme} setColorTheme={setColorTheme} />
            <button className="btn-danger" onClick={leaveRoom}>← Leave Room</button>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <main className="room-main">

          {/* Status Bar + Tabs */}
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
            <span className="my-word-count">{myWordCount.toLocaleString()} words this sprint</span>

            <div className="pane-tabs">
              <button
                className={`pane-tab ${activePane === 'write' ? 'active' : ''}`}
                onClick={() => setActivePane('write')}
              >Write</button>
              <button
                className={`pane-tab ${activePane === 'read' ? 'active' : ''} ${sprintLogs.length === 0 ? 'pane-tab-disabled' : ''}`}
                onClick={() => sprintLogs.length > 0 && setActivePane('read')}
                title={sprintLogs.length === 0 ? 'No logs yet — complete a sprint first' : ''}
              >
                Read
                {sprintLogs.length > 0 && <span className="pane-tab-badge">{sprintLogs.length}</span>}
              </button>
            </div>
          </div>

          {/* Write Pane — always mounted to preserve editor content */}
          <div style={{ display: activePane === 'write' ? 'contents' : 'none' }}>
            {/* Toolbar */}
            <div className={`editor-toolbar ${status !== 'active' ? 'toolbar-disabled' : ''}`}>
              <div className="toolbar-group">
                <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); format('bold'); }} title="Bold"><b>B</b></button>
                <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); format('italic'); }} title="Italic"><i>I</i></button>
                <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); format('underline'); }} title="Underline"><u>U</u></button>
              </div>
              <div className="toolbar-divider" />
              <div className="toolbar-group">
                <select
                  className="toolbar-select"
                  defaultValue=""
                  onChange={e => { format('fontName', e.target.value); editorRef.current?.focus(); }}
                  title="Font"
                >
                  <option value="" disabled>Font</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Palatino Linotype">Palatino</option>
                  <option value="Courier New">Courier</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                </select>
                <select
                  className="toolbar-select"
                  defaultValue=""
                  onChange={e => { format('fontSize', e.target.value); editorRef.current?.focus(); }}
                  title="Size"
                >
                  <option value="" disabled>Size</option>
                  <option value="1">Small</option>
                  <option value="3">Normal</option>
                  <option value="4">Large</option>
                  <option value="5">XL</option>
                  <option value="6">XXL</option>
                </select>
              </div>
            </div>

            {/* Rich Writing Area */}
            <div
              ref={editorRef}
              className="writing-area rich-editor"
              contentEditable={status === 'active'}
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
              data-placeholder={
                status === 'waiting' ? 'Waiting for the host to start the sprint…' :
                  status === 'active' ? 'Time to write…' :
                    status === 'break' ? 'Sprint over. Stretch your fingers.' :
                      'Sprint complete.'
              }
            />
          </div>

          {/* Read Pane */}
          {activePane === 'read' && (
            <div className="read-pane">
              {sprintLogs.length === 0 ? (
                <p className="read-pane-empty">No sprint logs yet. Complete a sprint to see writing here.</p>
              ) : (
                sprintLogs.map(log => (
                  <div key={log.sprintNumber} className="read-sprint-group">
                    <h2 className="read-sprint-heading">Sprint {log.sprintNumber}</h2>
                    {log.logs.length === 0 ? (
                      <p className="read-no-logs">No one shared their writing this sprint.</p>
                    ) : (
                      log.logs.map((l, i) => (
                        <details key={i} className="read-entry">
                          <summary className="read-entry-summary">
                            <span className="read-author">{l.name}</span>
                          </summary>
                          <div
                            className="read-text"
                            dangerouslySetInnerHTML={{ __html: l.text }}
                          />
                        </details>
                      ))
                    )}
                  </div>
                ))
              )}
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