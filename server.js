const http = require("http");
const WebSocket = require("ws");

const MAX_USERS_PER_CHAT = 5;
const MAX_DRAWING_SIZE = 2 * 1024 * 1024; // 2 MB


// =========================
// HTTP SERVER
// =========================

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Chat server is running");
});


// =========================
// WEBSOCKET SERVER
// =========================

const wss = new WebSocket.Server({
  server
});


// =========================
// CHAT ROOMS
// =========================

const chats = new Map();


// =========================
// CLEAN INPUT
// =========================

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


// =========================
// SEND TO ONE USER
// =========================

function send(socket, data) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}


// =========================
// BROADCAST TO CHAT
// =========================

function broadcastToChat(
  chat,
  data,
  excludeSocket = null
) {
  for (const client of chat.users) {

    if (
      client !== excludeSocket &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(JSON.stringify(data));
    }

  }
}


// =========================
// USER COUNT
// =========================

function sendUserCount(chat) {

  broadcastToChat(chat, {
    type: "userCount",
    userCount: chat.users.size,
    maxUsers: MAX_USERS_PER_CHAT
  });

}


// =========================
// NEW WEBSOCKET CONNECTION
// =========================

wss.on("connection", (socket) => {

  console.log("New WebSocket connection.");

  let joined = false;
  let chat = null;
  let username = "";


  // =========================
  // MESSAGE RECEIVED
  // =========================

  socket.on("message", (data) => {

    let message;

    try {

      message = JSON.parse(data.toString());

    } catch (error) {

      console.error("Invalid JSON received.");

      send(socket, {
        type: "error",
        message: "Invalid request."
      });

      return;
    }


    // =========================
    // JOIN CHAT
    // =========================

    if (
      !joined &&
      message.type === "join"
    ) {

      username = cleanUsername(
        message.username
      );

      const chatName = cleanChatName(
        message.chatName
      );


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


      const chatKey =
        chatName.toLowerCase();


      chat = chats.get(chatKey);


      // =========================
      // CREATE CHAT
      // =========================

      if (!chat) {

        chat = {
          name: chatName,
          users: new Set()
        };

        chats.set(
          chatKey,
          chat
        );
      }


      // =========================
      // CHAT FULL
      // =========================

      if (
        chat.users.size >=
        MAX_USERS_PER_CHAT
      ) {

        send(socket, {
          type: "joinError",
          message:
            "This chat is full. A chat can only have 5 people."
        });

        return;
      }


      // =========================
      // ADD USER
      // =========================

      chat.users.add(socket);

      socket.chatKey = chatKey;

      joined = true;


      console.log(
        `${username} joined "${chat.name}".`
      );


      // =========================
      // CONFIRM JOIN
      // =========================

      send(socket, {
        type: "joined",
        chatName: chat.name,
        userCount: chat.users.size,
        maxUsers: MAX_USERS_PER_CHAT,
        username: username
      });


      // =========================
      // TELL OTHER USERS
      // =========================

      broadcastToChat(
        chat,
        {
          type: "system",
          message:
            `${username} joined the chat.`
        },
        socket
      );


      sendUserCount(chat);

      return;
    }


    // =========================
    // NORMAL MESSAGE
    // =========================

    if (
      joined &&
      message.type === "message"
    ) {

      const text =
        cleanMessage(
          message.text
        );


      if (!text) {
        return;
      }


      console.log(
        `${username} sent a message in "${chat.name}".`
      );


      broadcastToChat(
        chat,
        {
          type: "message",
          username: username,
          text: text
        }
      );

      return;
    }


    // =========================
    // DRAWING
    // =========================

    if (
      joined &&
      message.type === "drawing"
    ) {

      console.log(
        `${username} is sending a drawing.`
      );


      const image =
        String(
          message.image || ""
        );


      // =========================
      // CHECK IMAGE EXISTS
      // =========================

      if (!image) {

        console.log(
          "Drawing rejected: no image."
        );

        send(socket, {
          type: "error",
          message:
            "No drawing was received."
        });

        return;
      }


      // =========================
      // CHECK IMAGE FORMAT
      // =========================

      if (
        !image.startsWith(
          "data:image/png;base64,"
        )
      ) {

        console.log(
          "Drawing rejected: invalid image format."
        );

        send(socket, {
          type: "error",
          message:
            "Invalid drawing format."
        });

        return;
      }


      // =========================
      // CHECK SIZE
      // =========================

      const drawingSize =
        Buffer.byteLength(
          image,
          "utf8"
        );


      console.log(
        `Drawing size: ${drawingSize} bytes`
      );


      if (
        drawingSize >
        MAX_DRAWING_SIZE
      ) {

        console.log(
          "Drawing rejected: too large."
        );

        send(socket, {
          type: "error",
          message:
            "That drawing is too large."
        });

        return;
      }


      // =========================
      // SEND DRAWING
      // =========================

      console.log(
        `Broadcasting drawing from ${username}.`
      );


      broadcastToChat(
        chat,
        {
          type: "drawing",
          username: username,
          image: image
        }
      );


      return;
    }


    // =========================
    // UNKNOWN MESSAGE
    // =========================

    if (joined) {

      console.log(
        "Unknown message type:",
        message.type
      );

    }

  });


  // =========================
  // WEBSOCKET ERROR
  // =========================

  socket.on("error", (error) => {

    console.error(
      "WebSocket error:",
      error
    );

  });


  // =========================
  // USER DISCONNECTS
  // =========================

  socket.on("close", () => {

    console.log(
      `${username || "Unknown user"} disconnected.`
    );


    if (
      !joined ||
      !chat
    ) {
      return;
    }


    chat.users.delete(socket);


    broadcastToChat(
      chat,
      {
        type: "system",
        message:
          `${username} left the chat.`
      }
    );


    sendUserCount(chat);


    if (
      chat.users.size === 0
    ) {

      chats.delete(
        socket.chatKey
      );

    }

  });

});


// =========================
// START SERVER
// =========================

const PORT =
  process.env.PORT || 3000;


server.listen(
  PORT,
  () => {

    console.log(
      `Listening on ${PORT}`
    );

  }
);
