```js
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const MAX_USERS_PER_CHAT = 5;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_ROOM_NAME_LENGTH = 40;


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
  server
});


// ============================================================
// ROOM STORAGE
// ============================================================

/*
  rooms:

  Map {
    "room-name" => Set<WebSocket>
  }
*/

const rooms = new Map();


/*
  checkersGames:

  Map {
    "room-name" => {
      board: [...],
      turn: "red" | "black",
      gameOver: false,
      winner: null
    }
  }
*/

const checkersGames = new Map();


// ============================================================
// GENERAL HELPERS
// ============================================================

function sendJSON(ws, data) {
  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    ws.send(JSON.stringify(data));
  }
}


function broadcastToRoom(roomName, data) {
  const room = rooms.get(roomName);

  if (!room) {
    return;
  }

  room.forEach(client => {
    sendJSON(client, data);
  });
}


function normalizeRoomName(name) {
  if (typeof name !== "string") {
    return "";
  }

  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_ROOM_NAME_LENGTH);
}


function getRoom(roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }

  return rooms.get(roomName);
}


function sendUserCount(roomName) {
  const room = rooms.get(roomName);

  if (!room) {
    return;
  }

  broadcastToRoom(roomName, {
    type: "userCount",
    count: room.size
  });
}


// ============================================================
// CHECKERS
// ============================================================

function createInitialCheckersBoard() {
  const board = [];

  for (let row = 0; row < 8; row++) {
    board[row] = [];

    for (let col = 0; col < 8; col++) {
      board[row][col] = null;

      /*
        Black starts at the top.
      */

      if (
        row < 3 &&
        (row + col) % 2 === 1
      ) {
        board[row][col] = "black";
      }

      /*
        Red starts at the bottom.
      */

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
    gameOver: false,
    winner: null
  };
}


function getCheckersGame(roomName) {
  if (!checkersGames.has(roomName)) {
    checkersGames.set(
      roomName,
      createCheckersGame()
    );
  }

  return checkersGames.get(roomName);
}


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
// CHECKERS MOVE VALIDATION
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

  /*
    Bounds.
  */

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

  /*
    Destination must be empty.
  */

  if (board[toRow][toCol] !== null) {
    return false;
  }

  /*
    There must be a piece at the starting position.
  */

  const piece = board[fromRow][fromCol];

  if (!piece) {
    return false;
  }

  /*
    Player must own the piece.
  */

  if (
    getPieceColor(piece) !== playerColor
  ) {
    return false;
  }

  /*
    It must be that player's turn.
  */

  if (game.turn !== playerColor) {
    return false;
  }

  /*
    Only dark squares can contain pieces.
  */

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
    /*
      Kings may move either direction.
    */

    if (isKing(piece)) {
      return true;
    }

    /*
      Red moves upward.
    */

    if (playerColor === "red") {
      return rowDifference === -1;
    }

    /*
      Black moves downward.
    */

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

    /*
      There must be an opponent piece
      between the two squares.
    */

    if (!middlePiece) {
      return false;
    }

    if (
      getPieceColor(middlePiece) ===
      playerColor
    ) {
      return false;
    }

    /*
      Kings can capture either direction.
    */

    if (isKing(piece)) {
      return true;
    }

    /*
      Red captures upward.
    */

    if (playerColor === "red") {
      return rowDifference === -2;
    }

    /*
      Black captures downward.
    */

    if (playerColor === "black") {
      return rowDifference === 2;
    }
  }

  return false;
}


// ============================================================
// CHECK FOR AVAILABLE MOVES
// ============================================================

function playerHasAnyLegalMove(
  game,
  playerColor
) {
  const board = game.board;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {

      const piece =
        board[row][col];

      if (!piece) {
        continue;
      }

      if (
        getPieceColor(piece) !==
        playerColor
      ) {
        continue;
      }

      /*
        Try every possible destination.
      */

      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {

          if (
            isValidCheckersMove(
              game,
              row,
              col,
              toRow,
              toCol,
              playerColor
            )
          ) {
            return true;
          }

        }
      }

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
  if (!move) {
    return {
      success: false,
      reason: "Missing move."
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
      reason: "Invalid move coordinates."
    };
  }


  if (game.gameOver) {
    return {
      success: false,
      reason: "The game is over."
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


  const board =
    game.board;

  const piece =
    board[fromRow][fromCol];


  const rowDifference =
    toRow - fromRow;

  const colDifference =
    toCol - fromCol;


  let captured = null;


  /*
    Capture.
  */

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
      col: middleCol,
      piece: board[middleRow][middleCol]
    };

    board[middleRow][middleCol] =
      null;
  }


  /*
    Move piece.
  */

  board[fromRow][fromCol] =
    null;


  let newPiece =
    piece;


  /*
    Promote red.
  */

  if (
    piece === "red" &&
    toRow === 0
  ) {
    newPiece = "redKing";
  }


  /*
    Promote black.
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
    Check whether the opponent still has pieces.
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
        getPieceColor(currentPiece) ===
        "red"
      ) {
        redPieces++;
      }

      if (
        getPieceColor(currentPiece) ===
        "black"
      ) {
        blackPieces++;
      }
    }
  }


  let winner = null;


  if (redPieces === 0) {
    winner = "black";
  }

  if (blackPieces === 0) {
    winner = "red";
  }


  /*
    Switch turn.
  */

  game.turn =
    game.turn === "red"
      ? "black"
      : "red";


  /*
    If the next player has no legal moves,
    the current player wins.
  */

  if (
    !winner &&
    !playerHasAnyLegalMove(
      game,
      game.turn
    )
  ) {
    winner =
      game.turn === "red"
        ? "black"
        : "red";
  }


  if (winner) {
    game.gameOver = true;
    game.winner = winner;
  }


  return {
    success: true,

    move: {
      fromRow,
      fromCol,
      toRow,
      toCol,
      captured,
      piece: newPiece
    },

    turn: game.turn,

    gameOver:
      game.gameOver,

    winner:
      game.winner
  };
}


// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

wss.on("connection", ws => {

  ws.room = null;
  ws.checkerColor = null;


  console.log(
    "New WebSocket connection."
  );


  // ==========================================================
  // MESSAGE
  // ==========================================================

  ws.on("message", rawData => {

    let data;

    try {
      data =
        JSON.parse(
          rawData.toString()
        );
    } catch (error) {

      sendJSON(ws, {
        type: "error",
        message:
          "Invalid message format."
      });

      return;
    }


    if (
      !data ||
      typeof data !== "object"
    ) {
      return;
    }


    // ========================================================
    // JOIN
    // ========================================================

    if (data.type === "join") {

      /*
        Don't allow the same connection
        to join multiple rooms.
      */

      if (ws.room) {

        sendJSON(ws, {
          type: "error",
          message:
            "You are already in a room."
        });

        return;
      }


      const roomName =
        normalizeRoomName(
          data.room
        );


      if (!roomName) {

        sendJSON(ws, {
          type: "error",
          message:
            "Please enter a valid room name."
        });

        return;
      }


      const room =
        getRoom(roomName);


      /*
        Enforce five-user maximum.
      */

      if (
        room.size >=
        MAX_USERS_PER_CHAT
      ) {

        sendJSON(ws, {
          type: "roomFull",
          message:
            "This room is full. Maximum 5 users."
        });

        return;
      }


      /*
        Add user.
      */

      room.add(ws);

      ws.room =
        roomName;


      /*
        Assign checkers player color.

        First player = red
        Second player = black
        Remaining users = spectator
      */

      let redTaken = false;
      let blackTaken = false;

      room.forEach(client => {

        if (
          client.checkerColor ===
          "red"
        ) {
          redTaken = true;
        }

        if (
          client.checkerColor ===
          "black"
        ) {
          blackTaken = true;
        }

      });


      if (!redTaken) {

        ws.checkerColor =
          "red";

      } else if (!blackTaken) {

        ws.checkerColor =
          "black";

      } else {

        ws.checkerColor =
          null;

      }


      /*
        Make sure the game exists.
      */

      const game =
        getCheckersGame(
          roomName
        );


      /*
        Tell the player they joined.
      */

      sendJSON(ws, {

        type: "joined",

        room:
          roomName,

        checkerColor:
          ws.checkerColor,

        userCount:
          room.size

      });


      /*
        Send current checkers state.
      */

      sendJSON(ws, {

        type: "checkersState",

        state: {
          board:
            game.board,

          turn:
            game.turn,

          gameOver:
            game.gameOver,

          winner:
            game.winner
        }

      });


      /*
        Update everyone.
      */

      sendUserCount(
        roomName
      );


      /*
        Tell existing users.
      */

      broadcastToRoom(
        roomName,
        {
          type: "system",
          message:
            "A user joined the room."
        }
      );


      return;
    }


    // ========================================================
    // CHAT
    // ========================================================

    if (data.type === "chat") {

      if (!ws.room) {
        return;
      }


      if (
        typeof data.message !==
        "string"
      ) {
        return;
      }


      let message =
        data.message.trim();


      if (!message) {
        return;
      }


      message =
        message.slice(
          0,
          MAX_MESSAGE_LENGTH
        );


      broadcastToRoom(
        ws.room,
        {
          type: "chat",
          message
        }
      );


      return;
    }


    // ========================================================
    // CHECKERS MOVE
    // ========================================================

    if (
      data.type ===
      "checkersMove"
    ) {

      if (!ws.room) {
        return;
      }


      /*
        Spectators cannot move.
      */

      if (!ws.checkerColor) {

        sendJSON(ws, {
          type: "error",
          message:
            "You are watching this game. Only the two assigned players can move."
        });

        return;
      }


      const game =
        getCheckersGame(
          ws.room
        );


      const result =
        applyCheckersMove(
          game,
          data.move,
          ws.checkerColor
        );


      if (!result.success) {

        sendJSON(ws, {
          type: "error",
          message:
            result.reason
        });

        return;
      }


      /*
        Broadcast the validated move.
      */

      broadcastToRoom(
        ws.room,
        {
          type: "checkersMove",

          move:
            result.move,

          turn:
            result.turn,

          gameOver:
            result.gameOver,

          winner:
            result.winner
        }
      );


      return;
    }


    // ========================================================
    // CHECKERS RESET
    // ========================================================

    if (
      data.type ===
      "checkersReset"
    ) {

      if (!ws.room) {
        return;
      }


      /*
        Anyone in the room may request
        a new game.
      */

      const newGame =
        createCheckersGame();


      checkersGames.set(
        ws.room,
        newGame
      );


      broadcastToRoom(
        ws.room,
        {
          type: "checkersState",

          state: {
            board:
              newGame.board,

            turn:
              newGame.turn,

            gameOver:
              newGame.gameOver,

            winner:
              newGame.winner
          }
        }
      );


      return;
    }

  });


  // ==========================================================
  // DISCONNECT
  // ==========================================================

  ws.on("close", () => {

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
      Remove user.
    */

    room.delete(ws);


    /*
      Free checker position.

      Important:
      The remaining player keeps their color.
      A new user can take the vacant color.
    */

    ws.checkerColor =
      null;


    /*
      Tell remaining users.
    */

    if (room.size > 0) {

      broadcastToRoom(
        roomName,
        {
          type: "system",
          message:
            "A user left the room."
        }
      );

      sendUserCount(
        roomName
      );

    }


    /*
      If nobody remains,
      destroy the room and game.
    */

    if (room.size === 0) {

      rooms.delete(
        roomName
      );

      checkersGames.delete(
        roomName
      );

    }

  });


  // ==========================================================
  // ERROR
  // ==========================================================

  ws.on("error", error => {

    console.error(
      "WebSocket error:",
      error
    );

  });

});


// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```
