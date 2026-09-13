const http = require("http");
const WebSocket = require("ws");

const MAX_USERS_PER_CHAT = 5;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Chat server is running");
});

const wss = new WebSocket.Server({ server });

// Each chat has its own Set of connected users.
// Example:
// "gaming night" -> Set of users in that chat
const chats = new Map();

function cleanChatName(name) {
  return String(name || "")
    .trim()
    .slice(0, 50);
}

function cleanUsername(name) {
  return String(name || "")
    .trim()
    .slice(0, 30);
}

function cleanMessage(text) {
  return String(text || "")
    .trim()
    .slice(0, 1000);
}

function send(socket, data) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function broadcastToChat(chat, data, excludeSocket = null) {
  for (const client of chat.users) {
    if (
      client !== excludeSocket &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(JSON.stringify(data));
    }
  }
}

function sendUserCount(chat) {
  broadcastToChat(chat, {
    type: "userCount",
    userCount: chat.users.size,
    maxUsers: MAX_USERS_PER_CHAT
  });
}

wss.on("connection", (socket) => {

  // The user must tell us which chat they want to join.
  // We wait for the first message before putting them into a room.

  let joined = false;
  let chat = null;
  let username = "";

  socket.on("message", (data) => {

    let message;

    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      send(socket, {
        type: "error",
        message: "Invalid request."
      });

      return;
    }


    // =========================
    // JOIN CHAT
    // =========================

    if (!joined && message.type === "join") {

      username = cleanUsername(message.username);
      const chatName = cleanChatName(message.chatName);


      if (!username) {
        send(socket, {
          type: "joinError",
          message: "Please enter your name."
        });

        return;
      }


      if (!chatName) {
        send(socket, {
          type: "joinError",
          message: "Please enter a chat name."
        });

        return;
      }


      // Use lowercase as the room key so that
      // "Gaming Night" and "gaming night"
      // are treated as the same chat.

      const chatKey = chatName.toLowerCase();


      // Find existing chat

      chat = chats.get(chatKey);


      // If the chat doesn't exist yet,
      // create it.

      if (!chat) {

        chat = {
          name: chatName,
          users: new Set()
        };

        chats.set(chatKey, chat);
      }


      // Check the 5-person limit

      if (chat.users.size >= MAX_USERS_PER_CHAT) {

        send(socket, {
          type: "joinError",
          message: "This chat is full. A chat can only have 5 people."
        });

        // If we created an empty chat but somehow
        // it is full, remove it.

        if (chat.users.size === 0) {
          chats.delete(chatKey);
        }

        return;
      }


      // Add user to the chat

      chat.users.add(socket);

      socket.chatKey = chatKey;

      joined = true;


      // Tell the user they successfully joined

      send(socket, {
        type: "joined",
        chatName: chat.name,
        userCount: chat.users.size,
        maxUsers: MAX_USERS_PER_CHAT,
        username: username
      });


      // Tell everyone else in the room

      broadcastToChat(
        chat,
        {
          type: "system",
          message: `${username} joined the chat.`
        },
        socket
      );


      // Update user count

      sendUserCount(chat);

      return;
    }


    // =========================
    // NORMAL CHAT MESSAGE
    // =========================

    if (joined && message.type === "message") {

      const text = cleanMessage(message.text);

      if (!text) {
        return;
      }


      broadcastToChat(
        chat,
        {
          type: "message",
          username: username,
          text: text
        },
        socket
      );

      return;
    }

  });


  // =========================
  // USER DISCONNECTS
  // =========================

  socket.on("close", () => {

    if (!joined || !chat) {
      return;
    }


    chat.users.delete(socket);


    // Tell remaining users

    broadcastToChat(chat, {
      type: "system",
      message: `${username} left the chat.`
    });


    // Update user count

    sendUserCount(chat);


    // Delete the chat when nobody is inside it.
    // This means an empty chat disappears.

    if (chat.users.size === 0) {
      chats.delete(socket.chatKey);
    }

  });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
