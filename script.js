const socket = io();

let chats = [];
let currentChat = null;

const chatList = document.getElementById("chatList");

socket.on("chatList", data => {
  chats = data;
  renderChats();
});

socket.on("newMessage", msg => {
  const div = document.createElement("div");
  div.textContent = msg;
  document.getElementById("messages").appendChild(div);
});

function renderChats() {
  chatList.innerHTML = "";
  chats.forEach(chat => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.textContent = chat.name;
    div.onclick = () => joinChat(chat);
    chatList.appendChild(div);
  });
}

function showCreate() {
  document.getElementById("create").classList.toggle("hidden");
}

function createChat() {
  const name = chatName.value;
  const rules = chatRules.value;

  if (!name) return;

  socket.emit("createChat", {
    id: Date.now().toString(),
    name,
    rules
  });
}

function joinChat(chat) {
  currentChat = chat;
  socket.emit("joinChat", chat.id);

  document.getElementById("roomTitle").textContent = chat.name;
  document.getElementById("roomRules").textContent = chat.rules || "";
  document.getElementById("messages").innerHTML = "";

  show("chatRoom");
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("sendMessage", {
    chatId: currentChat.id,
    message: msg
  });

  input.value = "";
}

function goHome() {
  show();
}

function show(id) {
  ["chatRoom", "create"].forEach(x =>
    document.getElementById(x).classList.add("hidden")
  );
  if (id) document.getElementById(id).classList.remove("hidden");
}
