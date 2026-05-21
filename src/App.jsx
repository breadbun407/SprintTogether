/* eslint-disable no-unused-vars */
import { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import posthog from 'posthog-js'

let ws = null;

const GENRES = ["Any Genre", "Fantasy", "Sci-Fi", "Romance", "Thriller", "Horror", "Mystery", "Non-Fiction", "General Fiction"];

const NAMES_ADJ = ["Amber", "Bold", "Crisp", "Dusky", "Eager", "Faint", "Golden", "Hushed", "Inky", "Jolly", "Keen", "Lofty", "Misty", "Noble", "Quiet", "Rustic", "Swift", "Tawny", "Vivid", "Wry"];
const NAMES_NOUN = ["Author", "Bard", "Chronicler", "Dreamer", "Fable", "Inkwell", "Muse", "Narrator", "Quill", "Scribe", "Storyweaver", "Wordsmith"];
const randomName = () => `${NAMES_ADJ[Math.floor(Math.random() * NAMES_ADJ.length)]}${NAMES_NOUN[Math.floor(Math.random() * NAMES_NOUN.length)]}`;

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
  const [appView, setAppView] = useState('setup');
  const [roomIdFromUrl, setRoomIdFromUrl] = useState(window.location.hash.slice(1));

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('colorTheme') || 'green');

  // User Profile
  const [name, setName] = useState(randomName);
  const [genre, setGenre] = useState('Any Genre');
  const [shareMyLog, setShareMyLog] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAdult, setIsAdult] = useState(false);

  // Matchmaking Lobby
  const [lobbyRooms, setLobbyRooms] = useState([]);
  const [kickedNotice, setKickedNotice] = useState(false);
  const [adultConfirmPending, setAdultConfirmPending] = useState(null);

  // Room State
  const [roomState, setRoomState] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [myText, setMyText] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [sprintLogs, setSprintLogs] = useState([]);
  const [activePane, setActivePane] = useState('write');
  const [keepWriting, setKeepWriting] = useState(false);

  // Manuscript progress
  const [manuscriptWords, setManuscriptWords] = useState(0);
  const [manuscriptGoal, setManuscriptGoal] = useState(500);
  const [showWordCounts, setShowWordCounts] = useState(false);

  // Settings panel (host only)
  const [showSettings, setShowSettings] = useState(false);
  const [draftDuration, setDraftDuration] = useState(15);
  const [draftBreakDuration, setDraftBreakDuration] = useState(5);
  const [draftShareLog, setDraftShareLog] = useState(true);
  const [draftIsPrivate, setDraftIsPrivate] = useState(false);
  const [draftIsAdult, setDraftIsAdult] = useState(false);
  const [showBreakSettings, setShowBreakSettings] = useState(false);

  // Refs
  const chatEndRef = useRef(null);
  const appViewRef = useRef(appView);
  const myTextRef = useRef(myText);
  const roomStateRef = useRef(roomState);
  const editorRef = useRef(null);
  const sprintStartWordsRef = useRef(0);
  const manuscriptWordsRef = useRef(manuscriptWords);
  const goalSetRef = useRef(false);
  const goalReachedRef = useRef(false);

  useEffect(() => { appViewRef.current = appView; }, [appView]);
  useEffect(() => { myTextRef.current = myText; }, [myText]);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => { manuscriptWordsRef.current = manuscriptWords; }, [manuscriptWords]);

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
    const interval = setInterval(() => {
      const state = roomStateRef.current;
      if ((state?.status === 'active' || state?.status === 'break') && state?.endTime) {
        setTimeLeft(Math.max(0, state.endTime - Date.now()));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!timeLeft) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) { clearInterval(interval); return 0; }
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

  // Server is now authoritative for the age gate — just send ageConfirmed flag.
  // No client-side lobbyRooms.find() check needed; server fires ADULT_GATE if needed.
  const joinRoom = useCallback((targetRoomId, ageConfirmed = false) => {
    posthog.capture('room_joined', {
      source: window.location.hash ? 'invite_link' : 'matchmaking',
    });
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      roomId: targetRoomId,
      ageConfirmed,
      user: { name, goal: 500, genre, displayMode: 'numbers', shareMyLog }
    }));
  }, [name, genre, shareMyLog]);

  const reconfigureBreak = () => {
    ws.send(JSON.stringify({ type: 'RECONFIGURE_BREAK', duration: draftBreakDuration }));
    setShowBreakSettings(false);
  };

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
      setKickedNotice(false);
      setRoomState(data);
      setDraftDuration(data.duration);
      setDraftBreakDuration(data.breakDuration ?? 5);
      setDraftShareLog(data.shareLog);
      setDraftIsPrivate(data.isPrivate ?? false);
      setDraftIsAdult(data.isAdult ?? false);
      if ((data.status === 'active' || data.status === 'break') && data.endTime) {
        setTimeLeft(prev => prev ?? Math.max(0, data.endTime - Date.now()));
      }
      setAppView('room');
      window.location.hash = data.roomId;
    }

    if (data.type === 'KICKED') {
      setKickedNotice(true);
      setRoomState(null);
      window.location.hash = '';
      joinLobby();
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
      setKeepWriting(false);
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
        posthog.capture('multiple_sprints_completed', { sprint_number: data.sprintNumber });
      }
    }

    if (data.type === 'BREAK_ENDED') {
      setTimeLeft(null);
    }

    // Server couldn't let them in — show the age gate modal
    if (data.type === 'ADULT_GATE') {
      setAdultConfirmPending(data.roomId);
    }

    if (data.type === 'CLEAR_TEXT') {
      setMyText('');
      setTimeLeft(null);
      setActivePane('write');
      setKeepWriting(false);
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
    posthog.capture('room_created', { genre, is_private: isPrivate, is_adult: isAdult });
    ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      user: { name, goal: 500, genre, displayMode: 'numbers', shareMyLog, isPrivate, isAdult }
    }));
  };

  const leaveRoom = () => {
    if (roomState?.status === 'active') {
      posthog.capture('left_during_sprint', { duration_min: roomState.duration });
    }
    if (roomState?.users?.length === 1) {
      posthog.capture('room_empty', { sprint_count: roomState.sprintCount ?? 0 });
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
    ws.send(JSON.stringify({
      type: 'UPDATE_SETTINGS',
      duration: draftDuration,
      breakDuration: draftBreakDuration,
      shareLog: draftShareLog,
      isPrivate: draftIsPrivate,
      isAdult: draftIsAdult,
    }));
    setShowSettings(false);
  };

  const handleEditorInput = () => {
    const text = editorRef.current?.innerText || '';
    const html = editorRef.current?.innerHTML || '';
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    setMyText(text);
    ws.send(JSON.stringify({ type: 'UPDATE_PROGRESS', wordCount, text: html }));

    const updatedTotal = sprintStartWordsRef.current + wordCount;
    setManuscriptWords(updatedTotal);
    updateManuscript(updatedTotal, manuscriptGoal);
  };

  const handleEditorKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentCurrentLine();
      } else {
        document.execCommand('insertText', false, '\t');
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertText', false, '\n' + getLineIndent());
    }
  };

  const getLineIndent = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return '';
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(editorRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const textBefore = pre.toString();
    const lineStart = textBefore.slice(textBefore.lastIndexOf('\n') + 1);
    return lineStart.match(/^[\t ]*/)?.[0] ?? '';
  };

  const outdentCurrentLine = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(editorRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const textBefore = pre.toString();
    const lastNL = textBefore.lastIndexOf('\n');
    if (!textBefore.slice(lastNL + 1).startsWith('\t')) return;

    const targetIndex = lastNL + 1;
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    let seen = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (seen + node.textContent.length > targetIndex) {
        const off = targetIndex - seen;
        if (node.textContent[off] === '\t') {
          const del = document.createRange();
          del.setStart(node, off);
          del.setEnd(node, off + 1);
          del.deleteContents();
        }
        break;
      }
      seen += node.textContent.length;
    }
  };

  const exportSprint = (sprintNumber, entry) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SprintR — Sprint ${sprintNumber}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 3rem auto;
           padding: 0 2rem; color: #111; background: #fff; }
    h1 { font-size: 1.4rem; font-weight: 800; color: #111; margin-bottom: 0.25rem; }
    .meta { font-size: 0.85rem; color: #888; margin-bottom: 3rem; }
  </style>
</head>
<body>
  <h1>Sprint ${sprintNumber}</h1>
  <p class="meta">Exported from SprintR · ${new Date().toLocaleDateString()}</p>
  <div style="font-family:Georgia,serif;font-size:1.05rem;line-height:1.8;
              color:#111;white-space:pre-wrap">${entry.text}</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sprint-${sprintNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const format = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const updateManuscript = (currentWords, goal) => {
    const current = parseInt(currentWords) || 0;
    const target = parseInt(goal) || 0;

    if (target > 0 && !goalSetRef.current) {
      goalSetRef.current = true;
      posthog.capture('manuscript_goal_set', { goal: target });
    }
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
              maxLength={30}
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
                <label>Content Rating</label>
                <div className="toggle-group">
                  <button className={!isAdult ? 'active' : ''} onClick={() => setIsAdult(false)}>All Ages</button>
                  <button className={isAdult ? 'active' : ''} onClick={() => setIsAdult(true)}>18+</button>
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
          {kickedNotice && (
            <div className="kicked-notice">
              <span>⚠️ You were removed from that room by the host.</span>
              <button className="kicked-dismiss" onClick={() => setKickedNotice(false)}>✕</button>
            </div>
          )}
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
              lobbyRooms
                .filter(room => !room.isAdult || isAdult)
                .map(room => (
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
                      {room.isAdult && <span className="room-tag adult-tag">18+</span>}
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

        {/* 18+ confirmation modal — fires from server ADULT_GATE or lobby click */}
        {adultConfirmPending && (
          <div className="modal-overlay">
            <div className="modal-card">
              <h2>18+ Room</h2>
              <p>This room has been marked as containing adult content. Please confirm you are 18 or older to continue.</p>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setAdultConfirmPending(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => {
                  const id = adultConfirmPending;
                  setAdultConfirmPending(null);
                  joinRoom(id, true);
                }}>I'm 18 or older →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (appView === 'room' && roomState) {
    const isHost = roomState.isHost;
    const status = roomState.status;
    const myWordCount = myText.trim() === '' ? 0 : myText.trim().split(/\s+/).length;
    const editorActive = status === 'active' || keepWriting;

    return (
      <div className="view room-view">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <h1 className="logo" style={{ textAlign: 'center' }}>SprintR</h1>
            <DarkToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
          </div>

          <div className="room-info-block">
            <p className="room-id-label">Room</p>
            <p className="room-id-value">{roomState.roomId}</p>
            {roomState.isPrivate && <span className="room-tag privacy-tag">Private</span>}
            {roomState.isAdult && <span className="room-tag adult-tag">18+</span>}
            <button
              className="btn-ghost small"
              onClick={() => navigator.clipboard.writeText(window.location.href)}
            >
              Copy Invite Link
            </button>
          </div>

          <div className="participants">
            <h3>Writers</h3>
            {roomState.users.map(u => (
              <div key={u.id} className="participant-row">
                <div className="participant-info">
                  <span className="participant-name">
                    {u.id === roomState.hostId && <span className="host-crown" title="Host">👑</span>}
                    {u.name}
                  </span>
                  <div className="participant-right">
                    <span className="participant-sprint-words">
                      {(status === 'active' || status === 'finished') && `+${u.sprintWords.toLocaleString()} this sprint`}
                    </span>
                    {isHost && u.id !== roomState.hostId && (
                      <button
                        className="btn-kick"
                        title="Remove from room"
                        onClick={() => ws.send(JSON.stringify({ type: 'KICK_USER', userId: u.id }))}
                      >✕</button>
                    )}
                  </div>
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
            ))}
          </div>

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
              <input type="checkbox" checked={showWordCounts} onChange={e => setShowWordCounts(e.target.checked)} />
            </label>

            <label className="inline-toggle">
              <span>Share my log</span>
              <input type="checkbox" checked={shareMyLog} onChange={toggleShareMyLog} />
            </label>
          </div>

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
                      <label>Sprint duration (min)
                        <input
                          type="number"
                          value={draftDuration}
                          min={1}
                          max={120}
                          onChange={e => setDraftDuration(parseInt(e.target.value) || 1)}
                        />
                      </label>
                      <label>Auto-break duration (min)
                        <input
                          type="number"
                          value={draftBreakDuration}
                          min={1}
                          max={60}
                          onChange={e => setDraftBreakDuration(parseInt(e.target.value) || 1)}
                        />
                      </label>
                      <label className="inline-toggle">
                        <span>Share logs at end</span>
                        <input type="checkbox" checked={draftShareLog} onChange={e => setDraftShareLog(e.target.checked)} />
                      </label>
                      <label className="inline-toggle">
                        <span>Private room</span>
                        <input type="checkbox" checked={draftIsPrivate} onChange={e => setDraftIsPrivate(e.target.checked)} />
                      </label>
                      <label className="inline-toggle">
                        <span>18+ content</span>
                        <input type="checkbox" checked={draftIsAdult} onChange={e => setDraftIsAdult(e.target.checked)} />
                      </label>
                      <button className="btn-primary small" onClick={saveSettings}>Save</button>
                    </div>
                  )}
                </>
              )}

              {status === 'finished' && (
                <p className="break-starting-notice">Break starting…</p>
              )}

              {status === 'break' && (
                <div className="post-sprint-controls">
                  <button
                    className="btn-ghost full settings-btn"
                    onClick={() => setShowBreakSettings(s => !s)}
                  >
                    ⚙ Reconfigure Break
                  </button>
                  {showBreakSettings && (
                    <div className="settings-panel">
                      <label>Break duration (min)
                        <input
                          type="number"
                          value={draftBreakDuration}
                          min={1}
                          max={60}
                          onChange={e => setDraftBreakDuration(parseInt(e.target.value) || 1)}
                        />
                      </label>
                      <button className="btn-secondary small" onClick={reconfigureBreak}>
                        Restart Break
                      </button>
                    </div>
                  )}
                  <button className="btn-primary full" onClick={setupNewSprint}>
                    ▶ Skip Break → New Sprint
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="sidebar-footer">
            <ColorPicker colorTheme={colorTheme} setColorTheme={setColorTheme} />
            <button className="btn-danger" onClick={leaveRoom}>← Leave Room</button>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <main className="room-main">

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

            {(status === 'finished' || status === 'break') && !keepWriting && (
              <button className="btn-ghost small" onClick={() => setKeepWriting(true)}>
                ✍ Keep Writing
              </button>
            )}

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

          <div style={{ display: activePane === 'write' ? 'contents' : 'none' }}>
            <div className={`editor-toolbar ${!editorActive ? 'toolbar-disabled' : ''}`}>
              <div className="toolbar-group">
                <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); format('bold'); }} title="Bold"><b>B</b></button>
                <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); format('italic'); }} title="Italic"><i>I</i></button>
                <button className="toolbar-btn" onMouseDown={e => { e.preventDefault(); format('underline'); }} title="Underline"><u>U</u></button>
              </div>
              <div className="toolbar-divider" />
              <div className="toolbar-group">
                <select className="toolbar-select" defaultValue="" onChange={e => { format('fontName', e.target.value); editorRef.current?.focus(); }} title="Font">
                  <option value="" disabled>Font</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Palatino Linotype">Palatino</option>
                  <option value="Courier New">Courier</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                </select>
                <select className="toolbar-select" defaultValue="" onChange={e => { format('fontSize', e.target.value); editorRef.current?.focus(); }} title="Size">
                  <option value="" disabled>Size</option>
                  <option value="1">Small</option>
                  <option value="3">Normal</option>
                  <option value="4">Large</option>
                  <option value="5">XL</option>
                  <option value="6">XXL</option>
                </select>
              </div>
            </div>

            <div
              ref={editorRef}
              className="writing-area rich-editor"
              contentEditable={editorActive}
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
              data-placeholder={
                keepWriting ? 'Keep writing…' :
                  status === 'waiting' ? 'Waiting for the host to start the sprint…' :
                    status === 'active' ? 'Time to write…' :
                      status === 'break' ? 'On a break — or keep writing above.' :
                        'Sprint complete.'
              }
            />
          </div>

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
                            <span className="read-author">
                              {l.name}
                              {l.isMe && <span className="read-author-you">you</span>}
                            </span>
                            {l.isMe && (
                              <button
                                className="btn-ghost small read-export-btn"
                                onClick={e => { e.preventDefault(); exportSprint(log.sprintNumber, l); }}
                              >
                                ↓ Export
                              </button>
                            )}
                          </summary>
                          <div className="read-text" dangerouslySetInnerHTML={{ __html: l.text }} />
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

  return <div className="view"><p>Connecting…</p></div>;
}

export default App;