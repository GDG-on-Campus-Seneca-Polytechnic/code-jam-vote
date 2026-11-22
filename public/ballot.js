import { api, id } from "./api.js";
import { rank, renderList, summary } from "./rank.js";

const title = document.querySelector("#title");
const status = document.querySelector("#status");
const ballot = document.querySelector("#ballot");
const choices = document.querySelector("#choices");
const projects = document.querySelector("#projects");
const code = document.querySelector("#code");
const codeError = document.querySelector("#code-error");
const projectError = document.querySelector("#project-error");
const message = document.querySelector("#message");
const submit = document.querySelector("#submit");
const done = document.querySelector("#done");
const closed = document.querySelector("#closed");
const codePattern = /^[A-HJ-NP-Z2-9]{12}$/;
let phase;
let names = [];
let voted = false;

function setStatus(text, tone) {
  status.textContent = text;
  if (tone) status.dataset.tone = tone;
  else delete status.dataset.tone;
}

function showError(element, input, text) {
  element.textContent = text;
  element.hidden = !text;
  if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
}

function clearErrors() {
  showError(codeError, code, "");
  showError(projectError, null, "");
  message.textContent = "";
}

function selected() {
  const value = new FormData(ballot).get("project");
  return value === null ? null : Number(value);
}

function updateButton() {
  const choice = selected();
  submit.textContent = choice === null ? "Cast my vote" : `Vote for ${names[choice]}`;
}

function render(poll) {
  // Only re-render on a forward phase change, so polling never wipes a
  // selection, a typed code or the success message.
  if (phase === "closed" || phase === poll.phase || (phase === "open" && poll.phase === "ready")) return;
  phase = poll.phase;
  title.textContent = poll.title;
  document.title = `${poll.title}: Code Jam Vote`;
  ballot.hidden = phase !== "open" || voted;
  closed.hidden = phase !== "closed";

  if (phase === "ready") {
    setStatus("Voting opens after the demos. Keep this page open and it will update on its own.", "wait");
  } else if (phase === "open") {
    setStatus(voted ? "Voting is open." : "Voting is open. Enter your code, pick one project, then cast your vote.", "open");
    names = poll.projects;
    choices.replaceChildren(...names.map((name, index) => {
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "project";
      radio.value = index;
      const label = document.createElement("label");
      label.className = "choice";
      const text = document.createElement("span");
      text.textContent = name;
      label.append(radio, text);
      return label;
    }));
  } else {
    setStatus("Voting is closed.", "closed");
    const rows = rank(poll.projects, poll.results);
    document.querySelector("#result-summary").textContent = summary(rows);
    renderList(document.querySelector("#results"), rows);
  }
}

async function refresh() {
  try {
    render(await api(`/${id}`));
  } catch (error) {
    if (!phase) setStatus(error.message);
  }
}

code.addEventListener("input", () => {
  const raw = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const formatted = raw.match(/.{1,4}/g)?.join("-") ?? "";
  if (formatted !== code.value) code.value = formatted;
  if (!codeError.hidden && codePattern.test(raw)) showError(codeError, code, "");
});

choices.addEventListener("change", () => {
  showError(projectError, null, "");
  message.textContent = "";
  updateButton();
});

ballot.addEventListener("submit", async event => {
  event.preventDefault();
  clearErrors();
  const raw = code.value.replace(/-/g, "");
  const project = selected();
  let invalid = false;
  if (!codePattern.test(raw)) {
    showError(codeError, code, raw.length === 12
      ? "Codes use letters and the digits 2 to 9, never I, O, 0 or 1. Check your slip."
      : "Enter all 12 characters of your code.");
    invalid = true;
  }
  if (project === null) {
    showError(projectError, null, "Pick the project you want to vote for.");
    invalid = true;
  }
  if (invalid) {
    (codeError.hidden ? choices.querySelector("input") : code).focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = "Casting your vote…";
  try {
    await api(`/${id}/vote`, { method: "POST", data: { project, code: raw } });
    voted = true;
    document.querySelector("#done-choice").textContent = names[project];
    ballot.hidden = true;
    done.hidden = false;
    setStatus("Voting is open.", "open");
    done.focus();
  } catch (error) {
    submit.disabled = false;
    updateButton();
    if (/code/i.test(error.message)) {
      showError(codeError, code, error.message);
      code.focus();
    } else if (/project/i.test(error.message)) {
      showError(projectError, null, error.message);
    } else {
      message.textContent = error.message;
    }
    refresh();
  }
});

if (id) {
  refresh();
  const timer = setInterval(() => {
    if (phase === "closed") clearInterval(timer);
    else if (!document.hidden) refresh();
  }, 3000);
} else {
  setStatus("Scan the QR code on the big screen, or open the ballot link your host shared.");
}
