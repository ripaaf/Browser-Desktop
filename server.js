const express = require('express');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Store sessions by sessionId
const sessions = new Map();

wss.on('connection', (ws) => {
    let currentSessionId = null;
    let currentClient = ws;

    ws.on('message', (msg) => {
        try {
            const parsed = JSON.parse(msg);

            if (parsed.type === 'init') {
                currentSessionId = parsed.sessionId;

                let session = sessions.get(currentSessionId);
                if (!session) {
                    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
                    const ptyProcess = pty.spawn(shell, [], {
                        name: 'xterm-color',
                        cols: 80,
                        rows: 30,
                        cwd: process.env.HOME,
                        env: process.env,
                    });

                    session = {
                        pty: ptyProcess,
                        logs: [],
                        clients: [],
                    };

                    ptyProcess.on('data', (data) => {
                        session.logs.push(data);
                        session.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'data', data }));
                            }
                        });
                    });

                    sessions.set(currentSessionId, session);
                }
                if (session._cleanupTimeout) {
                    clearTimeout(session._cleanupTimeout);
                    delete session._cleanupTimeout;
                }

                // Send full log to new client
                session.logs.forEach(data => {
                    ws.send(JSON.stringify({ type: 'data', data }));
                });

                session.clients.push(ws);
            }

            if (parsed.type === 'input') {
                const session = sessions.get(currentSessionId);
                if (session?.pty) {
                    session.pty.write(parsed.data);
                }
            }
        } catch (err) {
            console.error('WebSocket error:', err);
        }
    });

    ws.on('close', () => {
        if (currentSessionId && sessions.has(currentSessionId)) {
            const session = sessions.get(currentSessionId);
            session.clients = session.clients.filter(client => client !== ws);
    
            // Keep session alive for 120 minutes after last disconnect
            if (session.clients.length === 0) {
                session._cleanupTimeout = setTimeout(() => {
                    if (session.clients.length === 0) {
                        session.pty.kill();
                        sessions.delete(currentSessionId);
                    }
                }, 120 * 60 * 1000); // 120 minutes
            }
        }
    });
    
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
