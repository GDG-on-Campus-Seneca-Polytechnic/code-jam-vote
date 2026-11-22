import { api, id } from "./api.js";
import { rank, renderList, summary } from "./rank.js";

const $ = selector => document.querySelector(selector);
const create = $("#create");
const key = $("#key");
const phaseLabel = $("#phase");
const message = $("#message");
const open = $("#open");
const close = $("#close");
const projectForm = $("#projects");
const entries = $("#entries");
const codeForm = $("#codes");
const codeList = $("#code-list");
let poll;

// Each poll has its own host key. This browser remembers it per poll so a reload stays signed in.
const storageName = pollId => `code-jam-vote:host-key:${pollId}`;
const validKey = text => /^[0-9a-f]{64}$/.test(text);

function rememberKey(pollId, value) {
  try {
    localStorage.setItem(storageName(pollId), value);
  } catch {
    // Private windows can refuse storage; the key still works for this visit.
  }
}

function recallKey(pollId) {
  try {
    return localStorage.getItem(storageName(pollId)) || "";
  } catch {
    return "";
  }
}

// A host link carries the key after "#", which browsers never send to the server.
function takeKeyFromLink() {
  const fromLink = new URLSearchParams(location.hash.slice(1)).get("key") || "";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  return validKey(fromLink) ? fromLink : "";
}

function showHostLink() {
  const value = key.value.trim();
  const known = Boolean(id && validKey(value));
  $("#key-field").hidden = !id || known;
  $("#host-link-box").hidden = !known;
  if (known) $("#host-link").value = `${location.origin}/host.html?poll=${id}#key=${value}`;
}

function setStep(name, state) {
  $(`#step-${name}`).dataset.state = state;
}

function say(text, tone) {
  message.textContent = text || "";
  message.dataset.tone = tone || "";
}

function render() {
  const { phase } = poll;
  $("#title").textContent = poll.title;
  document.title = `Host: ${poll.title}`;
  phaseLabel.hidden = false;
  phaseLabel.dataset.phase = phase;
  phaseLabel.textContent = { ready: "Setting up", open: "Voting open", closed: "Voting closed" }[phase];

  const saved = poll.projects.length >= 2;
  const ready = phase === "ready";
  setStep("create", "done");
  setStep("codes", ready ? (codeList.value ? "done" : "current") : "done");
  setStep("projects", ready ? (saved ? "done" : "current") : "done");
  setStep("open", ready ? (saved ? "current" : "todo") : "done");
  setStep("close", phase === "open" ? "current" : phase === "closed" ? "done" : "todo");

  codeForm.hidden = phase === "closed";
  entries.readOnly = !ready;
  projectForm.querySelector("button").hidden = !ready;
  open.hidden = !ready;
  close.hidden = phase !== "open";
  $("#close-note").hidden = phase === "closed";

  if (phase === "closed") {
    const rows = rank(poll.projects, poll.results);
    $("#result-summary").textContent = `${summary(rows)} Select Reveal results on the projector screen to show the room.`;
    renderList($("#results"), rows);
    $("#host-results").hidden = false;
  }
}

async function run(button, action) {
  button.disabled = true;
  say("Working…");
  try {
    const result = await action();
    if (typeof result === "string") say(result, "ok");
    else if (Array.isArray(result)) say(result[0], "error");
    else say("");
  } catch (error) {
    say(error.message, "error");
  } finally {
    button.disabled = false;
    if (poll) render();
  }
}

function post(path, data) {
  return api(path, { method: "POST", key: key.value.trim(), data });
}

create.addEventListener("submit", event => {
  event.preventDefault();
  run(create.querySelector("button"), async () => {
    const created = await post("", { title: $("#name").value });
    rememberKey(created.id, created.key);
    location.replace(`/host.html?poll=${created.id}`);
  });
});

projectForm.addEventListener("submit", event => {
  event.preventDefault();
  run(projectForm.querySelector("button"), async () => {
    const projects = entries.value.split("\n").map(line => line.trim()).filter(Boolean);
    poll = await post(`/${id}/projects`, { projects });
    entries.value = poll.projects.join("\n");
    return `Saved ${poll.projects.length} projects.`;
  });
});

codeForm.addEventListener("submit", event => {
  event.preventDefault();
  run(codeForm.querySelector("button"), async () => {
    const count = Number($("#count").value);
    const { codes } = await post(`/${id}/codes`, { count });
    codeList.value += (codeList.value ? "\n" : "") + codes.join("\n");
    $("#batch").hidden = false;
    const total = codeList.value.split("\n").length;
    return `Generated ${codes.length} ${codes.length === 1 ? "code" : "codes"} (${total} this session). Download them before you leave this page.`;
  });
});

$("#download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([codeList.value + "\n"], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendee-codes-${id}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

open.addEventListener("click", () => run(open, async () => {
  if (entries.value.trim() !== poll.projects.join("\n")) {
    return ["Save your project list before opening voting."];
  }
  poll = await post(`/${id}/open`);
  return "Voting is open.";
}));

close.addEventListener("click", () => {
  if (!confirm("Close voting now? No more votes can be cast, and the results become available. This cannot be undone.")) return;
  run(close, async () => {
    poll = await post(`/${id}/close`);
    return "Voting is closed. Reveal the results on the projector screen.";
  });
});

key.addEventListener("input", () => {
  const value = key.value.trim();
  if (id && validKey(value)) {
    rememberKey(id, value);
    showHostLink();
  }
});

$("#copy-host-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#host-link").value);
    say("Host link copied. Keep it private.", "ok");
  } catch {
    $("#host-link").select();
    say("Select the link and copy it.", "error");
  }
});

addEventListener("beforeunload", event => {
  if (codeList.value) event.preventDefault();
});

if (id) {
  const linked = takeKeyFromLink();
  if (linked) rememberKey(id, linked);
  key.value = linked || recallKey(id);
}
showHostLink();

if (id) {
  try {
    poll = await api(`/${id}`);
    const qr = `/api/polls/${id}/qr`;
    $("#qr").src = qr;
    $("#qr-link").href = qr;
    $("#voter-link").href = `/?poll=${id}`;
    $("#screen-link").href = `/screen.html?poll=${id}`;
    $("#share").hidden = false;
    create.hidden = true;
    $("#created").hidden = false;
    entries.value = poll.projects.join("\n");
    render();
  } catch (error) {
    say(error.message, "error");
  }
}
