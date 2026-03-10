import { serve } from "bun";

const adjs = [
    "Ancient", "Angry", "Arcane", "Azure", "Bold", "Brave", "Bright", "Broken", "Burning", "Calm", "Clever", "Cold", "Crimson", "Crystal",
    "Curious", "Dark", "Daring", "Dazzling", "Deep", "Divine", "Dreadful", "Eager", "Electric", "Emerald", "Endless", "Enigmatic",
    "Fading", "Fierce", "Flaming", "Flying", "Frozen", "Gentle", "Ghostly", "Golden", "Grand", "Grim", "Hidden", "Hollow", "Holy",
    "Icy", "Iron", "Ivory", "Jagged", "Jolly", "Kind", "Lively", "Lonely", "Lost", "Luminous", "Lucky", "Massive", "Midnight", "Mighty",
    "Misty", "Mystic", "Nimble", "Noble", "Noisy", "Obsidian", "Old", "Pale", "Peaceful", "Phantom", "Playful", "Proud", "Quiet",
    "Radiant", "Rapid", "Restless", "Rising", "Royal", "Rugged", "Sacred", "Scarlet", "Secret", "Shady", "Sharp", "Shimmering",
    "Silent", "Silver", "Sleeping", "Slow", "Small", "Solar", "Spicy", "Spiral", "Stormy", "Stubborn", "Swift", "Tender", "Thunderous",
    "Tiny", "Twilight", "Valiant", "Velvet", "Vibrant", "Vicious", "Wandering", "Warm", "Wild", "Wise", "Young"
];

const nouns = [
    "Anchor", "Angel", "Apple", "Arrow", "Ash", "Bear", "Beacon", "Blade", "Bloom", "Boulder", "Branch", "Breeze", "Brook", "Castle",
    "Cavern", "Cedar", "Champion", "Cliff", "Cloud", "Comet", "Crown", "Crystal", "Dagger", "Dawn", "Desert", "Dragon", "Dream",
    "Drift", "Eagle", "Echo", "Ember", "Falcon", "Feather", "Field", "Fire", "Flame", "Flower", "Forest", "Fortress", "Fountain",
    "Fox", "Galaxy", "Garden", "Ghost", "Glade", "Grove", "Harbor", "Hawk", "Heart", "Hill", "Horizon", "Island", "Jungle", "Knight",
    "Lake", "Leaf", "Lion", "Lotus", "Marble", "Meadow", "Meteor", "Mist", "Moon", "Mountain", "Ocean", "Oak", "Orb", "Owl", "Palace",
    "Path", "Peak", "Phoenix", "Pillar", "Pine", "Planet", "Pond", "Portal", "Prairie", "Prince", "Queen", "Rain", "River", "Rock",
    "Rose", "Saber", "Sage", "Sand", "Shadow", "Shield", "Shore", "Sky", "Snow", "Spark", "Spirit", "Spring", "Star", "Stone", "Storm",
    "Sun", "Temple", "Throne", "Tiger", "Tower", "Tree", "Valley", "Voyager", "Water", "Wave", "Whale", "Wind", "Wolf", "World"
];

const verbs = [
    "Adapts", "Ascends", "Awakens", "Battles", "Becomes", "Blazes", "Blooms", "Builds", "Burns", "Calls", "Charges", "Climbs",
    "Conquers", "Creates", "Dances", "Defends", "Discovers", "Drifts", "Echoes", "Emerges", "Endures", "Explores", "Falls", "Fights",
    "Flows", "Flourishes", "Flies", "Forms", "Gathers", "Glides", "Glows", "Grows", "Guards", "Guides", "Hunts", "Ignites", "Journeys",
    "Leads", "Leaps", "Lingers", "Listens", "Marches", "Moves", "Observes", "Overcomes", "Protects", "Pursues", "Races", "Rests",
    "Rises", "Roams", "Runs", "Sails", "Searches", "Shines", "Sleeps", "Soars", "Speaks", "Spins", "Spreads", "Stands", "Strikes",
    "Surges", "Swims", "Thinks", "Travels", "Turns", "Unfolds", "Waits", "Wanders", "Watches", "Whispers", "Wins"
];

const genId = () => `${adjs[Math.floor(Math.random() * adjs.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${verbs[Math.floor(Math.random() * verbs.length)]}`;

const rooms = new Map();

// eslint-disable-next-line no-undef
const port = Bun.env.PORT || 3001;

function broadcastRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

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
            shareLog: room.shareLog, // The Host's master toggle
            status: room.status, 
            users: usersList,
            chat: room.chat
        }));
    }
}

serve({
    port: port,
    hostname: "0.0.0.0",
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
                        sprintCount: 0,
                        users: new Map(),
                        chat:[],
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
                    shareMyLog: data.user.shareMyLog, // Track individual choice
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

            // NEW: Let an individual user update their privacy setting mid-sprint
            if (data.type === 'UPDATE_SHARE_PREF') {
                const user = room.users.get(ws);
                if (user) {
                    user.shareMyLog = data.shareMyLog;
                }
            }

            if (data.type === 'START_SPRINT' && room.hostId === ws.data.id) {
                if (room.timeoutId) clearTimeout(room.timeoutId);
                room.status = 'active';
                room.sprintCount += 1;
                const endTime = Date.now() + (room.duration * 60 * 1000);

                for (const w of room.users.keys()) {
                    w.send(JSON.stringify({ type: 'SPRINT_STARTED', endTime }));
                }

                room.timeoutId = setTimeout(() => {
                    room.status = 'finished';
                    let logs =[];
                    // Only run logic if Host enabled the room-wide sharing
                    if (room.shareLog) {
                        logs = Array.from(room.users.values())
                            .filter(u => u.shareMyLog) // Only grab text from users who opted-in!
                            .map(u => ({ name: u.name, text: u.text }));
                    }
                    for (const w of room.users.keys()) {
                        w.send(JSON.stringify({ type: 'SPRINT_ENDED', logs, sprintNumber: room.sprintCount }));
                    }
                    broadcastRoomState(ws.data.roomId);
                }, room.duration * 60 * 1000);

                broadcastRoomState(ws.data.roomId);
            }

            if (data.type === 'START_BREAK' && room.hostId === ws.data.id) {
                room.status = 'break';
                const endTime = Date.now() + (data.duration * 60 * 1000);
                for (const w of room.users.keys()) {
                    w.send(JSON.stringify({ type: 'BREAK_STARTED', endTime }));
                }
                broadcastRoomState(ws.data.roomId);
            }

            if (data.type === 'SETUP_NEW_SPRINT' && room.hostId === ws.data.id) {
                if (room.timeoutId) clearTimeout(room.timeoutId);
                room.status = 'waiting';
                
                for (const user of room.users.values()) {
                    user.currentWords = 0;
                    user.text = "";
                }
                
                for (const w of room.users.keys()) {
                    w.send(JSON.stringify({ type: 'CLEAR_TEXT' }));
                }
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