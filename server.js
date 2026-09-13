const http = require("http");
const WebSocket = require("ws");

const MAX_USERS = 5;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Chat server is running");
});

const wss = new WebSocket.Server({ server });

const clients = new Set();

let chatName = "Simple P2P Chat";

function broadcast(data, excludeSocket = null) {
  for (const client of clients) {
    if (
      client !== excludeSocket &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(JSON.stringify(data));
    }
  }
}

wss.on("connection", (socket) => {

  // Reject users after the limit is reached
  if (clients.size >= MAX_USERS) {
    socket.send(
      JSON.stringify({
        type: "full",
        message: "This chat already has 5 people."
      })
    );

    socket.close();
    return;
  }

  clients.add(socket);

  // Tell the new user the current chat information
  socket.send(
    JSON.stringify({
      type: "chatInfo",
      chatName: chatName,
      userCount: clients.size,
      maxUsers: MAX_USERS
    })
  );

  // Tell everyone how many users are connected
  broadcast({
    type: "userCount",
    userCount: clients.size,
    maxUsers: MAX_USERS
  });

  socket.on("message", (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    // Change chat name
    if (message.type === "setChatName") {
      const newName = String(message.chatName || "").trim();

      if (!newName) return;

      chatName = newName.slice(0, 50);

      broadcast({
        type: "chatInfo",
        chatName: chatName,
        userCount: clients.size,
        maxUsers: MAX_USERS
      });

      return;
    }

    // Regular chat message
    if (message.type === "message") {
      const cleanMessage = {
        type: "message",
        username: String(message.username || "Anonymous").slice(0, 30),
        text: String(message.text || "").slice(0, 1000)
      };

      broadcast(cleanMessage, socket);
    }
  });

  socket.on("close", () => {
    clients.delete(socket);

    broadcast({
      type: "userCount",
      userCount: clients.size,
      maxUsers: MAX_USERS
    });
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
