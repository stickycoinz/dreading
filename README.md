# DREADING multiplayer

Online runtime only: two opposing RTS/FPS commanders, read-only spectators, army selection and the autumn Carentan map. Local editors, backups and development tests are excluded.

## Run

Install Node.js, run `npm ci --omit=dev`, then `npm start`. Default address: http://127.0.0.1:8780/. Invitation keys are generated into the ignored `session-private.json` file. Open `/#HOST_KEY` for Commander 1, `/#GUEST_KEY` for Commander 2, or `/#SPECTATOR_KEY` to watch. Commander 1 keeps the browser open to simulate the match.

For friends over the internet, expose the running server through your existing tunnel and use that public address for invitations. GitHub stores this runtime; GitHub Pages does not run its Node/WebSocket server. Set HOST=0.0.0.0 and PORT for a separate server host if desired.

Never commit session-private.json or invitation links. Model, audio and other third-party license notices remain with their assets.
