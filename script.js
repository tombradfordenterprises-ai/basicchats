// ----------------------
// CONNECT TO SOCKET.IO
// ----------------------
// Replace with your Render URL
const socket = io("https://chat-backend-9rd5.onrender.com");

// ----------------------
// ELEMENTS
// ----------------------
const chatListEl = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");
const chatNameInput = document.getElementById("chatName");
const chatRulesInput = document.getElementById("chatRules");
const messageInput = document.getElementById("messageInput");

const createBtn = document.getElementById("createBtn");
const createChatBtn = document.getElementById("createChatBtn");
const sendMsgBtn = document.getElementById("sendMsgBtn");
const backBtn = document.getElementById("backBtn");

let chats = [];
let currentChat = null;

// ----------------------
// SOCKET EVENTS
// ----------------------
socket.on("chatList", (data) => {
  chats = data;
  renderChats();
});

socket.on("newMessage", (msg) => {
  if (!currentChat) return;

  const div = document.createElement("div");
  div.textContent = msg;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

// ----------------------
// EVENT LISTENERS
// ----------------------
createBtn.addEventListener("click", showCreate);
createChatBtn.addEventListener("click", createChat);
sendMsgBtn.addEventListener("click", sendMessage);
backBtn.addEventListener("click", goHome);

// ----------------------
// FUNCTIONS
// ----------------------
function renderChats() {
  chatListEl.innerHTML = "";
  chats.forEach((chat) => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.textContent = chat.name;
    div.addEventListener("click", () => joinChat(chat));
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

function createChat() {
  const name = chatNameInput.value.trim();
  const rules = chatRulesInput.value.trim();

  if (!name) {
    alert("Chat name is required");
    return;
  }

  const chat = {
    id: Date.now().toString(),
    name,
    rules
  };

  socket.emit("createChat", chat);

  // Clear inputs
  chatNameInput.value = "";
  chatRulesInput.value = "";

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
  const text = messageInput.value.trim();
  if (!text || !currentChat) return;

  socket.emit("sendMessage", {
    chatId: currentChat.id,
    message: text
  });

  messageInput.value = "";
}
