const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Chat server is running");
});

const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on("connection", (socket) => {
  clients.add(socket);

  socket.on("message", (data) => {
    for (const client of clients) {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});

