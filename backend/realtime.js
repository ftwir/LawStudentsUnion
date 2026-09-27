const { WebSocketServer } = require('ws');
const { query } = require('./db');
const { getToken, hash } = require('./security');

function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();
  const byConversation = new Map();

  function broadcast(payload, filter = () => true) {
    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.ws.readyState === 1 && filter(client)) client.ws.send(message);
    }
  }

  async function authenticate(request) {
    const token = getToken(request);
    if (!token) return null;
    const result = await query(`SELECT u.id,u.full_name,u.role,u.is_active,s.session_type
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=TRUE LIMIT 1`, [hash(token)]);
    return result.rows[0] || null;
  }

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') return;
    if (!request.headers.cookie && url.searchParams.get('token')) request.headers.authorization = 'Bearer ' + url.searchParams.get('token');
    try {
      const user = await authenticate(request);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request, user));
    } catch (error) {
      console.error('websocket auth error:', error.message);
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request, user) => {
    const client = { ws, userId: Number(user.id), conversations: new Set() };
    clients.add(client);

    ws.on('message', async raw => {
      try {
        const payload = JSON.parse(String(raw || '{}'));
        const type = String(payload.type || '');
        const conversationId = Number(payload.conversationId || 0);
        if (type === 'join' && conversationId) {
          const member = await query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conversationId, client.userId]);
          if (!member.rowCount) return;
          client.conversations.add(conversationId);
          if (!byConversation.has(conversationId)) byConversation.set(conversationId, new Set());
          byConversation.get(conversationId).add(client);
          ws.send(JSON.stringify({ type:'joined', conversationId }));
        } else if (type === 'leave' && conversationId) {
          client.conversations.delete(conversationId);
          byConversation.get(conversationId)?.delete(client);
        } else if (type === 'typing' && conversationId && client.conversations.has(conversationId)) {
          const group = byConversation.get(conversationId) || new Set();
          broadcast({ type:'typing', conversationId, userId:client.userId, active:Boolean(payload.active) }, x => x !== client && group.has(x));
        }
      } catch (error) {
        console.error('websocket message error:', error.message);
      }
    });

    ws.on('close', () => {
      clients.delete(client);
      for (const id of client.conversations) byConversation.get(id)?.delete(client);
    });
  });

  const listener = query('SELECT pg_notify($1,$2)', ['lsu_realtime_ready', 'ok']).catch(() => {});
  listener.then(async () => {
    const { Client } = require('pg');
    const subscriber = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false });
    try {
      await subscriber.connect();
      await subscriber.query('LISTEN lsu_events');
      subscriber.on('notification', message => {
        try {
          const data = JSON.parse(message.payload || '{}');
          if (data.kind === 'chat_message') {
            const group = byConversation.get(Number(data.conversation_id)) || new Set();
            broadcast(data, x => group.has(x));
          } else if (data.kind === 'notification') {
            broadcast(data, x => x.userId === Number(data.recipient_id));
          } else if (data.kind === 'post_created') {
            broadcast(data);
          }
        } catch (error) { console.error('realtime event parse error:', error.message); }
      });
    } catch (error) {
      console.error('realtime LISTEN error:', error.message);
    }
  });

  return { wss };
}

module.exports = { attachRealtime };
