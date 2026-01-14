const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // later you can restrict this
  }
});

let chats = [];

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.emit("chatList", chats);

  socket.on("createChat", chat => {
    chats.push(chat);
    io.emit("chatList", chats);
  });

  socket.on("joinChat", chatId => {
    socket.join(chatId);
  });

  socket.on("sendMessage", ({ chatId, message }) => {
    io.to(chatId).emit("newMessage", message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

