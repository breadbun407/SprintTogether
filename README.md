# SprintR

SprintR is a communal, browser-based writing room where people can host or join a live room and write together in real time. Built around a Bun WebSocket server and a React frontend, it supports shared writing sprints, room matchmaking, chat, goal tracking, and timed breaks.

## Overview

The app creates a lightweight collaborative writing experience similar to a shared focus room:

- Users can join a lobby and discover public rooms
- A host can create a room or share an invite link
- Members join the same room and see live room state
- Writing sessions run as timed sprints with synchronized countdowns
- Participants can chat, track word counts, and view progress updates
- Hosts can manage settings such as duration, break length, privacy, and age restrictions

## Key features

- Real-time room membership and live updates via WebSocket
- Public lobby with room discovery and matching by genre/goal preferences
- Host-managed writing rooms with private or public visibility
- Timed drafting sprints and breaks
- Shared chat and inline status updates
- Word-count tracking and manuscript goals
- Dark mode and customizable color themes
- Sprint exports for later review or publishing

## Tech stack

- Frontend: React + Vite
- Backend: Bun native WebSocket server
- State management: in-memory server-side room registry
- Styling: custom CSS with light/dark theme support

## Project structure

- `server.js` — WebSocket server that manages rooms, lobby state, timing, chat, and user events
- `src/App.jsx` — main frontend UI and client-side behavior
- `src/App.css` — styling for layout, editor, lobby, and room interface
- `public/` — static assets
- `index.html` — app entry point

## Local development

Install dependencies:

```bash
bun install
```

Start the WebSocket server:

```bash
bun run start
```

Then start the Vite frontend in another terminal:

```bash
bun run dev
```

Open the app in a browser at:

```text
http://localhost:5173/
```

The client connects to the local WebSocket server at:

```text
ws://localhost:3001
```

## Available scripts

```bash
bun run dev      # start the Vite dev server
bun run build    # build the production bundle
bun run preview  # preview the production build
bun run start    # run the Bun WebSocket server
bun run lint     # run ESLint
```

## How the room flow works

1. A user enters a display name and joins the lobby.
2. The lobby shows available public rooms based on matching preferences.
3. A host creates a room or another user joins by room ID or invite link.
4. The room shares a synchronized live state, including active users and room settings.
5. The host starts a sprint; all members receive the same timer and writing context.
6. Participants type in the shared collaborative editor while word counts and progress updates are streamed.
7. When the sprint ends, logs are generated and the writing session can be reviewed or exported.

## Notes

This project is designed as a lightweight collaborative writing tool for small communities, writing groups, or creative sprints rather than a large-scale production chat platform. The server keeps active room state in memory, which is ideal for local demos and small-group sessions.
