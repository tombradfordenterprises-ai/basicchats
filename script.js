// 🔌 Connect to backend
// IMPORTANT: replace with your Render URL
const socket = io("https://YOUR-BACKEND.onrender.com");

// App state
let chats = [];
let currentChat = null;

// Elements
const chatListEl = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");

// ==========================
// SOCKET EVENTS
// ==========================

// Receive full chat list
socket.on("chatList", (data) => {
  chats = data;
  renderChats();
});

// Receive new message
socket.on("newMessage", (message) => {
  if (!currentChat) return;

  const div = document.createElement("div");
  div.className = "message";
  div.textContent = message;
  messagesEl.appendChild(div);

  messagesEl.scrollTop = messagesEl.scrollHeight;
});

// ==========================
// UI FUNCTIONS
// ==========================

function renderChats() {
  chatListEl.innerHTML = "";

  chats.forEach((chat) => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.textContent = chat.name;

    div.onclick = () => joinChat(chat);
    chatListEl.appendChild(div);
  });
}

function showCreate() {
  document.getElementById("chatList").classList.add("hidden");
  document.getElementById("create").classList.remove("hidden");
}

function goHome() {
  document.getElementById("create").classList.add("hidden");
  document.getElementById("chatRoom").classList.add("hidden");
  document.getElementById("chatList").classList.remove("hidden");
}

// ==========================
// CHAT LOGIC
// ==========================

function createChat() {
  const name = document.getElementById("chatName").value.trim();
  const rules = document.getElementById("chatRules").value.trim();

  if (!name) {
    alert("Chat name is required");
    return;
  }

  socket.emit("createChat", {
    id: Date.now().toString(),
    name,
    rules
  });

  document.getElementById("chatName").value = "";
  document.getElementById("chatRules").value = "";

  goHome();
}

function joinChat(chat) {
  currentChat = chat;

  socket.emit("joinChat", chat.id);

  document.getElementById("roomTitle").textContent = chat.name;
  document.getElementById("roomRules").textContent =
    chat.rules || "No rules provided.";

  messagesEl.innerHTML = "";

  document.getElementById("chatList").classList.add("hidden");
  document.getElementById("create").classList.add("hidden");
  document.getElementById("chatRoom").classList.remove("hidden");
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if (!text || !currentChat) return;

  socket.emit("sendMessage", {
    chatId: currentChat.id,
    message: text
  });

  input.value = "";
}
