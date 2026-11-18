# 🏝️ Castaway Co-op

A 3D browser survival game for two players. Crash on an island, gather, build a home, hunt, fish, cook, survive
the nights, and escape on a raft (or survive 30 days). Built with **Three.js** + **Node.js / Socket.IO**.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

Open the page, enter a name and press **Create island**. You get a code like `ISLE-4821` (optionally protected by a
password). Your partner opens the same site (any phone, laptop or monitor), picks **Join island**, and enters the code.
Share an invite link with the code filled in from ☰ Menu.

## Saved progress

The server saves each island to `data/ISLE-XXXX.json` every 15 s and whenever someone leaves. Rejoin any time with the
**same code and your original name** (from any device) and you continue exactly where you left off: position, inventory,
tools, buildings, chest, stats, time of day and chopped trees. Time only passes while someone is online.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Move | WASD / arrows | left-side floating joystick |
| Look | drag mouse | drag anywhere else |
| Zoom | mouse wheel | pinch |
| Interact (chop, mine, pick, hunt, drink, cook, sleep, open chest) | E / Space (hold to repeat) | big round button |
| Fish (face the sea, needs rod) | F | 🎣 button |
| Craft & build | B | 🔨 |
| Bag / eat | I | 🎒 |
| Chat | Enter | 💬 |
| Sprint | Shift | 🏃 |
| Placing a building | R rotate, Enter/E place, Esc cancel | on-screen bar |

The canvas, HUD and controls adapt to the window size (phone portrait/landscape, laptop, ultrawide monitor).

## Gameplay

- Stats: ❤️ health, 🍖 hunger, 💧 thirst, ⚡ energy, 🔥 warmth. Drink at the pond, eat, sleep, and stay near fire at night.
- Gather wood (palms), stone (rocks), fiber (grass, bushes), coconuts, berries.
- Craft: stone axe, spear, fishing rod. Build: campfire, shelter hut, shared chest, fences, escape raft.
- Hunt deer, boars and (at night) wolves for meat; cook raw food on a campfire. Fire and huts scare animals, fences block them.
- If every online player sleeps in a hut at night, the night passes quickly.
- Win by building the ⛵ raft on the shoreline, or surviving 30 days. You can keep playing afterwards.

## Deploy online (so friends can join from anywhere)

It is a single Node service that serves both the game and the websocket.

- **Render / Railway / Fly.io**: create a Web Service from this folder, build `npm install`, start `npm start`.
- **Keep saves**: free tiers wipe the disk on redeploy/sleep. Attach a persistent disk and set `DATA_DIR` to its mount
  path (e.g. `DATA_DIR=/data`). Without it, islands are lost when the host restarts.
- Use HTTPS (the hosts above do this automatically). `PORT` is read from the environment.

## Project layout

```
server.js            rooms, codes/passwords, persistence, survival + animal simulation (server-authoritative)
public/index.html    UI shell      public/style.css   responsive HUD
public/js/main.js    3D client (scene, input, networking, panels)
public/js/models.js  low-poly models      public/js/world.js  shared terrain + game data
test/smoke.js        end-to-end test (npm test): rooms, passwords, gameplay, sleep, wolves, save/resume
```

Passwords are hashed with scrypt, wrong guesses are rate-limited per IP, and movement/building/crafting are
validated on the server.
