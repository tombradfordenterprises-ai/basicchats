```js
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


const wss = new WebSocket.Server({
  server
});


// =========================
// CHAT ROOMS
// =========================

// Each chat has its own Set of connected users.
//
// Example:
//
// "gaming night"
//      -> user 1
//      -> user 2
//      -> user 3
//
// "movie night"
//      -> user 4
//      -> user 5

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

  if (
    socket.readyState ===
    WebSocket.OPEN
  ) {

    socket.send(
      JSON.stringify(data)
    );

  }

}


// =========================
// BROADCAST TO CHAT
// =========================
//
// Sends a message to everyone
// in the same chat.
//
// excludeSocket can be used to
// prevent the sender from receiving
// the message back.

function broadcastToChat(
  chat,
  data,
  excludeSocket = null
) {

  for (
    const client of chat.users
  ) {

    if (
      client !== excludeSocket &&
      client.readyState ===
        WebSocket.OPEN
    ) {

      client.send(
        JSON.stringify(data)
      );

    }

  }

}


// =========================
// USER COUNT
// =========================

function sendUserCount(chat) {

  broadcastToChat(
    chat,
    {
      type: "userCount",

      userCount:
        chat.users.size,

      maxUsers:
        MAX_USERS_PER_CHAT
    }
  );

}


// =========================
// WEBSOCKET CONNECTION
// =========================

wss.on("connection", (socket) => {


  let joined = false;

  let chat = null;

  let username = "";


  // =========================
  // MESSAGE RECEIVED
  // =========================

  socket.on("message", (data) => {

    let message;


    // =========================
    // PARSE MESSAGE
    // =========================

    try {

      message =
        JSON.parse(
          data.toString()
        );

    } catch (error) {

      send(
        socket,
        {
          type: "error",

          message:
            "Invalid request."
        }
      );

      return;

    }


    // =========================
    // JOIN CHAT
    // =========================

    if (
      !joined &&
      message.type === "join"
    ) {

      username =
        cleanUsername(
          message.username
        );


      const chatName =
        cleanChatName(
          message.chatName
        );


      // =========================
      // VALIDATE USERNAME
      // =========================

      if (!username) {

        send(
          socket,
          {
            type: "joinError",

            message:
              "Please enter your name."
          }
        );

        return;

      }


      // =========================
      // VALIDATE CHAT NAME
      // =========================

      if (!chatName) {

        send(
          socket,
          {
            type: "joinError",

            message:
              "Please enter a chat name."
          }
        );

        return;

      }


      // =========================
      // CHAT ROOM KEY
      // =========================
      //
      // "Gaming Night"
      // "gaming night"
      //
      // are treated as the same room.

      const chatKey =
        chatName.toLowerCase();


      // =========================
      // FIND EXISTING CHAT
      // =========================

      chat =
        chats.get(chatKey);


      // =========================
      // CREATE CHAT
      // =========================

      if (!chat) {

        chat = {

          name:
            chatName,

          users:
            new Set()

        };


        chats.set(
          chatKey,
          chat
        );

      }


      // =========================
      // CHECK CHAT CAPACITY
      // =========================

      if (
        chat.users.size >=
        MAX_USERS_PER_CHAT
      ) {

        send(
          socket,
          {
            type: "joinError",

            message:
              "This chat is full. A chat can only have 5 people."
          }
        );


        /*
         * Remove an empty chat
         * if necessary.
         */

        if (
          chat.users.size === 0
        ) {

          chats.delete(
            chatKey
          );

        }


        return;

      }


      // =========================
      // ADD USER
      // =========================

      chat.users.add(
        socket
      );


      socket.chatKey =
        chatKey;


      joined = true;


      // =========================
      // TELL USER THEY JOINED
      // =========================

      send(
        socket,
        {
          type: "joined",

          chatName:
            chat.name,

          userCount:
            chat.users.size,

          maxUsers:
            MAX_USERS_PER_CHAT,

          username:
            username
        }
      );


      // =========================
      // TELL EVERYONE ELSE
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


      // =========================
      // UPDATE USER COUNT
      // =========================

      sendUserCount(
        chat
      );


      return;

    }


    // =========================
    // NORMAL CHAT MESSAGE
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


      /*
       * Send the message to
       * everyone in the room,
       * INCLUDING the sender.
       *
       * This is intentional because
       * the HTML client waits for the
       * server to display messages.
       */

      broadcastToChat(
        chat,
        {
          type: "message",

          username:
            username,

          text:
            text
        }
      );


      return;

    }


    // =========================
    // DRAWING MESSAGE
    // =========================

    if (
      joined &&
      message.type === "drawing"
    ) {

      const image =
        String(
          message.image || ""
        );


      // =========================
      // MAKE SURE AN IMAGE EXISTS
      // =========================

      if (!image) {

        return;

      }


      // =========================
      // VERIFY IMAGE TYPE
      // =========================

      if (
        !image.startsWith(
          "data:image/png;base64,"
        )
      ) {

        send(
          socket,
          {
            type: "error",

            message:
              "Invalid drawing."
          }
        );

        return;

      }


      // =========================
      // DRAWING SIZE LIMIT
      // =========================

      if (
        Buffer.byteLength(
          image,
          "utf8"
        ) > MAX_DRAWING_SIZE
      ) {

        send(
          socket,
          {
            type: "error",

            message:
              "That drawing is too large."
          }
        );

        return;

      }


      // =========================
      // BROADCAST DRAWING
      // =========================
      //
      // Send the drawing to
      // everyone in this chat.
      //
      // The sender also receives it,
      // which means their own drawing
      // appears in their chat.

      broadcastToChat(
        chat,
        {
          type: "drawing",

          username:
            username,

          image:
            image
        }
      );


      return;

    }

  });


  // =========================
  // USER DISCONNECTS
  // =========================

  socket.on("close", () => {

    if (
      !joined ||
      !chat
    ) {

      return;

    }


    // =========================
    // REMOVE USER
    // =========================

    chat.users.delete(
      socket
    );


    // =========================
    // TELL REMAINING USERS
    // =========================

    broadcastToChat(
      chat,
      {
        type: "system",

        message:
          `${username} left the chat.`
      }
    );


    // =========================
    // UPDATE USER COUNT
    // =========================

    sendUserCount(
      chat
    );


    // =========================
    // DELETE EMPTY CHAT
    // =========================

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
```
