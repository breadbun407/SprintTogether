// server.js
import { serve } from "bun";

// Helper to generate human-readable URLs (e.g., pizza-waves-tree)
const adjs = ["pizza", "happy", "quiet", "fast", "clever", "blue", "brave"];
const nouns = ["waves", "tree", "cat", "moon", "river", "bird", "mountain"];
const verbs = ["jumps", "sleeps", "runs", "flies", "thinks", "glows", "spins"];
const genId = () => `${adjs[Math.floor(Math.random() * adjs.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${verbs[Math.floor(Math.random() * verbs.length)]}`;

// Store active rooms
const rooms = new Map();

const port = Bun.env.PORT || 3001;

function broadcastRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    // Anonymize user data before broadcasting
    const usersList = Array.from(room.users.values()).map(u => {
        let displayProgress = "0";
        if (u.displayMode === 'percentage') {
            const pct = Math.min(100, Math.floor((u.currentWords / u.goal) * 100));
            displayProgress = `${pct}%`;
        } else {
            displayProgress = `${u.currentWords} / ${u.goal}`;
        }
        return { id: u.id, name: u.name, displayProgress };
    });

    for (const [ws, userData] of room.users.entries()) {
        ws.send(JSON.stringify({
            type: 'ROOM_STATE',
            roomId,
            isHost: room.hostId === userData.id,
            duration: room.duration,
            shareLog: room.shareLog,
            status: room.status, // 'waiting', 'active', 'finished'
            users: usersList,
            chat: room.chat
        }));
    }
}

serve({
    port: port,
    hostname: "0.0.0.0", // Cloud hosting hostname
    fetch(req, server) {
        if (server.upgrade(req)) return;
        return new Response("Expected WebSocket", { status: 400 });
    },
    websocket: {
        open(ws) {
            ws.data = { id: crypto.randomUUID(), roomId: null };
        },
        message(ws, message) {
            const data = JSON.parse(message);

            if (data.type === 'CREATE_ROOM' || data.type === 'JOIN_ROOM') {
                let roomId = data.roomId;
                if (data.type === 'CREATE_ROOM') {
                    roomId = genId();
                    rooms.set(roomId, {
                        hostId: ws.data.id,
                        duration: 15,
                        shareLog: true,
                        status: 'waiting',
                        users: new Map(),
                        chat: [],
                        timeoutId: null
                    });
                }

                const room = rooms.get(roomId);
                if (!room) return ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));

                ws.data.roomId = roomId;
                room.users.set(ws, {
                    id: ws.data.id,
                    name: data.user.name,
                    goal: parseInt(data.user.goal) || 500,
                    displayMode: data.user.displayMode,
                    currentWords: 0,
                    text: ""
                });

                broadcastRoomState(roomId);
            }

            const room = rooms.get(ws.data.roomId);
            if (!room) return;

            if (data.type === 'CHAT') {
                const user = room.users.get(ws);
                room.chat.push({ name: user.name, text: data.text });
                broadcastRoomState(ws.data.roomId);
            }

            if (data.type === 'UPDATE_SETTINGS' && room.hostId === ws.data.id) {
                room.duration = data.duration;
                room.shareLog = data.shareLog;
                broadcastRoomState(ws.data.roomId);
            }

            if (data.type === 'START_SPRINT' && room.hostId === ws.data.id) {
                room.status = 'active';
                const endTime = Date.now() + (room.duration * 60 * 1000);

                for (const w of room.users.keys()) {
                    w.send(JSON.stringify({ type: 'SPRINT_STARTED', endTime }));
                }

                room.timeoutId = setTimeout(() => {
                    room.status = 'finished';
                    let logs = [];
                    if (room.shareLog) {
                        logs = Array.from(room.users.values()).map(u => ({ name: u.name, text: u.text }));
                    }
                    for (const w of room.users.keys()) {
                        w.send(JSON.stringify({ type: 'SPRINT_ENDED', logs }));
                    }
                    broadcastRoomState(ws.data.roomId);
                }, room.duration * 60 * 1000);

                broadcastRoomState(ws.data.roomId);
            }

            if (data.type === 'UPDATE_PROGRESS') {
                const user = room.users.get(ws);
                if (user) {
                    user.currentWords = data.wordCount;
                    user.text = data.text;
                    broadcastRoomState(ws.data.roomId);
                }
            }
        },
        close(ws) {
            if (!ws.data.roomId) return;
            const room = rooms.get(ws.data.roomId);
            if (room) {
                room.users.delete(ws);
                // If empty, delete room. Else, reassign host if host left.
                if (room.users.size === 0) {
                    if (room.timeoutId) clearTimeout(room.timeoutId);
                    rooms.delete(ws.data.roomId);
                } else if (room.hostId === ws.data.id) {
                    room.hostId = Array.from(room.users.values())[0].id;
                    broadcastRoomState(ws.data.roomId);
                } else {
                    broadcastRoomState(ws.data.roomId);
                }
            }
        }
    }
});

console.log(`WebSocket server running`);