```js
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const MAX_USERS_PER_CHAT = 5;
const MAX_DRAWING_SIZE = 2 * 1024 * 1024; // 2 MB


// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Chat server is running.");
});


// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss = new WebSocket.Server({
  server: server
});


// ============================================================
// ROOMS
// ============================================================
//
// rooms looks like:
//
// rooms = {
//   "room-name": Set<WebSocket>
// }
//
// Each WebSocket also stores:
//
// ws.room
// ws.checkerColor
//

const rooms = new Map();


// ============================================================
// CREATE / GET ROOM
// ============================================================

function getRoom(roomName) {

  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }

  return rooms.get(roomName);
}


// ============================================================
// SEND JSON
// ============================================================

function sendJSON(ws, data) {

  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {

    ws.send(
      JSON.stringify(data)
    );

  }

}


// ============================================================
// BROADCAST TO ROOM
// ============================================================

function broadcastToRoom(
  roomName,
  data,
  excludeSocket = null
) {

  const room = rooms.get(roomName);

  if (!room) {
    return;
  }

  room.forEach(ws => {

    if (
      ws !== excludeSocket &&
      ws.readyState === WebSocket.OPEN
    ) {

      sendJSON(ws, data);

    }

  });

}


// ============================================================
// SEND USER COUNT
// ============================================================

function sendUserCount(roomName) {

  const room = rooms.get(roomName);

  if (!room) {
    return;
  }

  const count = room.size;

  room.forEach(ws => {

    sendJSON(ws, {
      type: "userCount",
      count: count
    });

  });

}


// ============================================================
// NORMALIZE ROOM NAME
// ============================================================

function normalizeRoomName(roomName) {

  if (
    typeof roomName !== "string"
  ) {

    return "";

  }

  return roomName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 40);

}


// ============================================================
// CHECKERS COLORS
// ============================================================
//
// Maximum of two players can play checkers.
//
// Player 1 = red
// Player 2 = black
//
// Additional users can still be in the chat room,
// but they cannot control either checker side.
// ============================================================

function assignCheckerColor(ws, room) {

  /*
   * If someone already has red, try black.
   */

  let redTaken = false;
  let blackTaken = false;

  room.forEach(client => {

    if (client.checkerColor === "red") {
      redTaken = true;
    }

    if (client.checkerColor === "black") {
      blackTaken = true;
    }

  });


  if (!redTaken) {

    ws.checkerColor = "red";

    return "red";

  }


  if (!blackTaken) {

    ws.checkerColor = "black";

    return "black";

  }


  ws.checkerColor = null;

  return null;

}


// ============================================================
// CHECKERS GAME STATE
// ============================================================
//
// The server maintains the authoritative game state.
//
// This prevents a browser from simply telling the server:
// "I moved an opponent's piece."
//

function createInitialCheckersBoard() {

  const board = [];

  for (let row = 0; row < 8; row++) {

    board[row] = [];

    for (let col = 0; col < 8; col++) {

      board[row][col] = null;


      // Black starts at the top.

      if (
        row < 3 &&
        (row + col) % 2 === 1
      ) {

        board[row][col] = "black";

      }


      // Red starts at the bottom.

      if (
        row > 4 &&
        (row + col) % 2 === 1
      ) {

        board[row][col] = "red";

      }

    }

  }

  return board;

}


function createCheckersGame() {

  return {

    board: createInitialCheckersBoard(),

    turn: "red",

    gameOver: false

  };

}


// ============================================================
// CHECKERS GAME STATE PER ROOM
// ============================================================

const checkersGames = new Map();


// ============================================================
// GET CHECKERS GAME
// ============================================================

function getCheckersGame(roomName) {

  if (!checkersGames.has(roomName)) {

    checkersGames.set(
      roomName,
      createCheckersGame()
    );

  }

  return checkersGames.get(roomName);

}


// ============================================================
// CHECKERS HELPERS
// ============================================================

function getPieceColor(piece) {

  if (
    piece === "red" ||
    piece === "redKing"
  ) {

    return "red";

  }

  if (
    piece === "black" ||
    piece === "blackKing"
  ) {

    return "black";

  }

  return null;

}


function isKing(piece) {

  return (
    piece === "redKing" ||
    piece === "blackKing"
  );

}


// ============================================================
// VALIDATE CHECKERS MOVE
// ============================================================

function isValidCheckersMove(
  game,
  fromRow,
  fromCol,
  toRow,
  toCol,
  playerColor
) {

  const board = game.board;


  // Coordinates must be valid.

  if (
    fromRow < 0 ||
    fromRow > 7 ||
    fromCol < 0 ||
    fromCol > 7 ||
    toRow < 0 ||
    toRow > 7 ||
    toCol < 0 ||
    toCol > 7
  ) {

    return false;

  }


  // Destination must be empty.

  if (board[toRow][toCol]) {

    return false;

  }


  const piece =
    board[fromRow][fromCol];


  if (!piece) {

    return false;

  }


  // Player must own the piece.

  if (
    getPieceColor(piece) !== playerColor
  ) {

    return false;

  }


  // It must be that player's turn.

  if (
    game.turn !== playerColor
  ) {

    return false;

  }


  // Destination must be a dark square.

  if (
    (toRow + toCol) % 2 === 0
  ) {

    return false;

  }


  const rowDifference =
    toRow - fromRow;

  const colDifference =
    toCol - fromCol;


  const absRow =
    Math.abs(rowDifference);

  const absCol =
    Math.abs(colDifference);


  // ----------------------------------------------------------
  // NORMAL MOVE
  // ----------------------------------------------------------

  if (
    absRow === 1 &&
    absCol === 1
  ) {

    if (isKing(piece)) {

      return true;

    }


    if (playerColor === "red") {

      return rowDifference === -1;

    }


    if (playerColor === "black") {

      return rowDifference === 1;

    }

  }


  // ----------------------------------------------------------
  // CAPTURE
  // ----------------------------------------------------------

  if (
    absRow === 2 &&
    absCol === 2
  ) {

    const middleRow =
      fromRow +
      rowDifference / 2;

    const middleCol =
      fromCol +
      colDifference / 2;


    const middlePiece =
      board[middleRow][middleCol];


    if (!middlePiece) {

      return false;

    }


    /*
     * Cannot capture your own piece.
     */

    if (
      getPieceColor(
        middlePiece
      ) === playerColor
    ) {

      return false;

    }


    /*
     * Kings can capture in either direction.
     */

    if (isKing(piece)) {

      return true;

    }


    /*
     * Red moves upward.
     */

    if (playerColor === "red") {

      return rowDifference === -2;

    }


    /*
     * Black moves downward.
     */

    if (playerColor === "black") {

      return rowDifference === 2;

    }

  }


  return false;

}


// ============================================================
// APPLY CHECKERS MOVE
// ============================================================

function applyCheckersMove(
  game,
  move,
  playerColor
) {

  if (
    !move ||
    typeof move !== "object"
  ) {

    return {
      success: false,
      reason: "Invalid move."
    };

  }


  const fromRow =
    Number(move.fromRow);

  const fromCol =
    Number(move.fromCol);

  const toRow =
    Number(move.toRow);

  const toCol =
    Number(move.toCol);


  if (
    !Number.isInteger(fromRow) ||
    !Number.isInteger(fromCol) ||
    !Number.isInteger(toRow) ||
    !Number.isInteger(toCol)
  ) {

    return {
      success: false,
      reason: "Invalid coordinates."
    };

  }


  if (
    !isValidCheckersMove(
      game,
      fromRow,
      fromCol,
      toRow,
      toCol,
      playerColor
    )
  ) {

    return {
      success: false,
      reason: "Illegal move."
    };

  }


  const board = game.board;

  const piece =
    board[fromRow][fromCol];


  const rowDifference =
    toRow - fromRow;

  const colDifference =
    toCol - fromCol;


  /*
   * Capture.
   */

  let captured = null;

  if (
    Math.abs(rowDifference) === 2 &&
    Math.abs(colDifference) === 2
  ) {

    const middleRow =
      fromRow +
      rowDifference / 2;

    const middleCol =
      fromCol +
      colDifference / 2;


    captured = {
      row: middleRow,
      col: middleCol
    };


    board[middleRow][middleCol] =
      null;

  }


  /*
   * Move piece.
   */

  board[fromRow][fromCol] =
    null;


  let newPiece = piece;


  /*
   * Promote red.
   */

  if (
    piece === "red" &&
    toRow === 0
  ) {

    newPiece = "redKing";

  }


  /*
   * Promote black.
   */

  if (
    piece === "black" &&
    toRow === 7
  ) {

    newPiece = "blackKing";

  }


  board[toRow][toCol] =
    newPiece;


  /*
   * Switch turns.
   */

  game.turn =
    game.turn === "red"
      ? "black"
      : "red";


  /*
   * Check for winner.
   */

  let redPieces = 0;
  let blackPieces = 0;


  for (let row = 0; row < 8; row++) {

    for (let col = 0; col < 8; col++) {

      const currentPiece =
        board[row][col];


      if (!currentPiece) {
        continue;
      }


      if (
        getPieceColor(
          currentPiece
        ) === "red"
      ) {

        redPieces++;

      } else {

        blackPieces++;

      }

    }

  }


  let winner = null;


  if (redPieces === 0) {

    winner = "black";

    game.gameOver = true;

  }


  if (blackPieces === 0) {

    winner = "red";

    game.gameOver = true;

  }


  return {

    success: true,

    move: {

      fromRow,
      fromCol,

      toRow,
      toCol,

      captured

    },

    turn: game.turn,

    winner: winner

  };

}


// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

wss.on(
  "connection",
  ws => {

    /*
     * Store connection information.
     */

    ws.room = null;

    ws.checkerColor = null;


    console.log(
      "New WebSocket connection."
    );


    // --------------------------------------------------------
    // MESSAGE
    // --------------------------------------------------------

    ws.on(
      "message",
      rawData => {

        let data;

        try {

          data =
            JSON.parse(
              rawData.toString()
            );

        } catch (error) {

          sendJSON(ws, {
            type: "error",
            message: "Invalid message format."
          });

          return;

        }


        if (
          !data ||
          typeof data !== "object"
        ) {

          return;

        }


        // ====================================================
        // JOIN ROOM
        // ====================================================

        if (data.type === "join") {

          const roomName =
            normalizeRoomName(
              data.room
            );


          if (!roomName) {

            sendJSON(ws, {
              type: "error",
              message: "Invalid room name."
            });

            return;

          }


          /*
           * If already in a room, don't join again.
           */

          if (ws.room) {

            return;

          }


          const room =
            getRoom(roomName);


          /*
           * Enforce five-user limit.
           */

          if (
            room.size >= MAX_USERS_PER_CHAT
          ) {

            sendJSON(ws, {
              type: "error",
              message:
                "This chat room is full. Maximum 5 users."
            });

            return;

          }


          /*
           * Add the client to the room.
           */

          room.add(ws);

          ws.room = roomName;


          /*
           * Assign a checker color if available.
           */

          const checkerColor =
            assignCheckerColor(
              ws,
              room
            );


          /*
           * Create game if needed.
           */

          const game =
            getCheckersGame(
              roomName
            );


          /*
           * Tell the joining player
           * what checker color they have.
           */

          sendJSON(ws, {

            type: "joined",

            room: roomName,

            checkerColor:
              checkerColor

          });


          /*
           * Send current game state.
           */

          sendJSON(ws, {

            type: "checkersState",

            state: {

              board: game.board,

              turn: game.turn,

              gameOver:
                game.gameOver

            }

          });


          /*
           * Tell everyone the room count.
           */

          sendUserCount(
            roomName
          );


          /*
           * Notify existing users.
           */

          broadcastToRoom(
            roomName,
            {
              type: "system",
              message:
                "A user joined the room."
            },
            ws
          );


          return;

        }


        // ====================================================
        // CHAT
        // ====================================================

        if (data.type === "chat") {

          if (!ws.room) {

            return;

          }


          let message =
            typeof data.message === "string"
              ? data.message.trim()
              : "";


          if (!message) {

            return;

          }


          /*
           * Prevent enormous chat messages.
           */

          message =
            message.slice(0, 1000);


          broadcastToRoom(
            ws.room,
            {

              type: "chat",

              message: message

            }
          );


          return;

        }


        // ====================================================
        // CHECKERS MOVE
        // ====================================================

        if (
          data.type === "checkersMove"
        ) {

          if (!ws.room) {

            return;

          }


          /*
           * A player needs an assigned
           * checker color.
           */

          if (!ws.checkerColor) {

            sendJSON(ws, {

              type: "error",

              message:
                "You are not one of the two checkers players."

            });

            return;

          }


          const game =
            getCheckersGame(
              ws.room
            );


          if (game.gameOver) {

            return;

          }


          /*
           * Server validates the move.
           */

          const result =
            applyCheckersMove(
              game,
              data.move,
              ws.checkerColor
            );


          if (!result.success) {

            sendJSON(ws, {

              type: "error",

              message: result.reason

            });

            return;

          }


          /*
           * Send the validated move to everyone.
           */

          broadcastToRoom(
            ws.room,
            {

              type: "checkersMove",

              move: result.move,

              turn: result.turn,

              winner: result.winner

            }
          );


          return;

        }


        // ====================================================
        // CHECKERS RESET
        // ====================================================

        if (
          data.type === "checkersReset"
        ) {

          if (!ws.room) {

            return;

          }


          /*
           * Only one of the two players needs
           * to request a new game.
           */

          const game =
            createCheckersGame();


          checkersGames.set(
            ws.room,
            game
          );


          /*
           * Send the reset to everyone.
           */

          broadcastToRoom(
            ws.room,
            {

              type: "checkersReset",

              state: {

                board: game.board,

                turn: game.turn,

                gameOver:
                  game.gameOver

              }

            }
          );


          return;

        }


      }
    );


    // --------------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------------

    ws.on(
      "close",
      () => {

        const roomName =
          ws.room;


        if (!roomName) {
          return;
        }


        const room =
          rooms.get(roomName);


        if (!room) {
          return;
        }


        /*
         * Remove this user.
         */

        room.delete(ws);


        /*
         * Free their checker color.
         */

        ws.checkerColor = null;


        /*
         * Notify remaining users.
         */

        broadcastToRoom(
          roomName,
          {

            type: "system",

            message:
              "A user left the room."

          }
        );


        /*
         * Update user count.
         */

        sendUserCount(
          roomName
        );


        /*
         * If the room is empty,
         * remove the room and game.
         */

        if (room.size === 0) {

          rooms.delete(
            roomName
          );

          checkersGames.delete(
            roomName
          );

        }

      }
    );


    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    ws.on(
      "error",
      error => {

        console.error(
          "WebSocket error:",
          error
        );

      }
    );

  }
);


// ============================================================
// START SERVER
// ============================================================

server.listen(
  PORT,
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);
```
