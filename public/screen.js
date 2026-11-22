import { api, id } from "./api.js";
import { groups, ordinal, rank, summary, votes } from "./rank.js";

const $ = selector => document.querySelector(selector);
const phaseLabel = $("#phase");
const reveal = $("#reveal");
const lobby = $("#lobby");
const curtain = $("#curtain");
const board = $("#board");
const podium = $("#podium");
const rest = $("#rest");
const quiet = $("#quiet");
const announce = $("#announce");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let poll;
let revealed = false;
let timer;

const wait = ms => new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : ms));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Lobby and curtain ----------

// Long poll titles (up to 80 characters) step down in size so they never push the layout off screen.
function setTitle(node, text) {
  node.textContent = text;
  node.dataset.length = text.length > 52 ? "xlong" : text.length > 28 ? "long" : "short";
}

function renderLobby() {
  const { phase } = poll;
  document.title = `Screen: ${poll.title}`;
  document.body.dataset.phase = phase;

  const closed = phase === "closed";
  lobby.hidden = closed;
  curtain.hidden = !closed;

  if (closed) {
    setTitle($("#curtain-title"), poll.title);
    if (document.activeElement === document.body) reveal.focus();
    return;
  }

  setTitle($("#title"), poll.title);
  phaseLabel.dataset.phase = phase;
  phaseLabel.textContent = phase === "open" ? "Voting is open" : "Voting opens soon";
  $("#steps").hidden = false;
  $("#instructions").textContent = phase === "open"
    ? "Each code votes once."
    : "Scan now to open the ballot. Voting starts after the demos.";
  $("#qr-frame").hidden = false;
}

async function refresh() {
  try {
    poll = await api(`/${id}`);
    if (!revealed) renderLobby();
    if (poll.phase === "closed") clearInterval(timer);
  } catch (error) {
    if (!poll) phaseLabel.textContent = error.message;
  }
}

// ---------- Podium model ----------

// The podium always has room for 1st, 2nd and 3rd, keyed by place. A place
// skipped by a tie above it (1, 1, 3 or 1, 2, 2, 4) gets a marked empty step.
// A place with no votes, or that does not exist, is left off.
// Most names a step can hold before the tie goes to the list instead.
const MAX_NAMES = { 1: 6, 2: 3, 3: 3 };

function podiumModel(rows) {
  const scored = groups(rows).filter(group => group.votes > 0);
  const spots = [];
  for (const place of [1, 2, 3]) {
    const group = scored.find(item => item.place === place);
    if (group) {
      spots.push({ place, group, crowded: group.rows.length > MAX_NAMES[place] });
      continue;
    }
    const cover = scored.find(item => item.place < place && item.place + item.rows.length - 1 >= place);
    if (cover) spots.push({ place, cover });
  }
  const named = new Set(spots.filter(spot => spot.group && !spot.crowded).flatMap(spot => spot.group.rows));
  const others = rows.filter(row => !named.has(row) && row.votes > 0);
  const zero = rows.filter(row => row.votes === 0);
  return { spots, others, zero };
}

function tieWord(count) {
  return { 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six" }[count] || String(count);
}

function buildSpot(spot) {
  const column = element("div", "spot pending");
  column.dataset.place = spot.place;
  const block = element("div", "block");
  column.append(block);

  if (spot.cover) {
    column.dataset.ghost = "";
    const count = spot.cover.rows.length;
    block.append(
      element("p", "ghost-title", `No ${ordinal(spot.place)} place`),
      element("p", "ghost-note", `${count > 2 ? `${tieWord(count)}-way tie` : "Tie"} for ${ordinal(spot.cover.place)}`),
    );
    return column;
  }

  const { group } = spot;
  const tied = group.rows.length > 1;
  column.dataset.names = spot.crowded ? 1 : group.rows.length;

  const head = element("div", "plate-head");
  const label = ordinal(spot.place);
  const place = element("p", "ordinal");
  place.append(label.slice(0, -2), element("span", "suffix", label.slice(-2)));
  const count = element("p", "count");
  count.append(element("span", "count-n", group.votes), ` ${group.votes === 1 ? "vote" : "votes"}${tied ? " each" : ""}`);
  head.append(place, count);

  const names = element("div", "plate-names");
  const inner = element("div", "plate-fit");
  if (spot.crowded) {
    inner.append(element("p", "plate-name", `${tieWord(group.rows.length)}-way tie`));
  } else {
    inner.append(...group.rows.map(row => element("p", "plate-name", row.name)));
  }
  names.append(inner);
  block.append(head, names);
  if (tied) {
    block.append(element("p", "plate-tie", spot.crowded
      ? "See the list"
      : `${tieWord(group.rows.length)}-way tie`));
  }
  return column;
}

function buildRow(row, max) {
  const item = element("li", "pending");
  item.dataset.place = row.place;
  item.style.setProperty("--share", row.votes / max);
  item.append(
    element("span", "place", row.place),
    element("span", "name", row.name),
    element("span", "count", row.votes),
  );
  if (row.tied) item.querySelector(".name").append(" ", element("span", "tie", "tie"));
  return item;
}

function buildBoard(rows) {
  const { spots, others, zero } = podiumModel(rows);
  const max = rows[0]?.votes || 1;
  const order = [2, 1, 3];
  const sorted = [...spots].sort((a, b) => order.indexOf(a.place) - order.indexOf(b.place));
  podium.replaceChildren(...sorted.map(buildSpot));
  podium.dataset.spots = spots.length;
  board.toggleAttribute("data-empty", spots.length === 0);

  // Split a long list into two columns that read top to bottom.
  const lists = others.length > 14
    ? [others.slice(0, Math.ceil(others.length / 2)), others.slice(Math.ceil(others.length / 2))]
    : [others];
  rest.replaceChildren(...lists.filter(list => list.length).map(list => {
    const ol = element("ol", "rest-list");
    const head = element("li", "rest-head");
    head.setAttribute("aria-hidden", "true");
    head.append(element("span"), element("span"), element("span", "count", "Votes"));
    ol.append(head, ...list.map(row => buildRow(row, max)));
    return ol;
  }));
  rest.hidden = others.length === 0;

  $("#quiet-names").replaceChildren(...zero.map(row => element("li", "", row.name)));
  quiet.hidden = zero.length === 0;
  quiet.classList.add("pending");

  const standings = $("#standings");
  standings.hidden = others.length === 0 && zero.length === 0;
  standings.dataset.columns = lists.length;
  standings.style.setProperty("--rows", Math.max(1, ...lists.map(list => list.length)));
  standings.style.setProperty("--quiet", zero.length ? Math.ceil(zero.length / (lists.length > 1 ? 4 : 2)) : 0);
  board.toggleAttribute("data-solo", standings.hidden);
  return spots;
}

// Shrink each name plate's text until every name fits its block without clipping.
function overflows(names) {
  const inner = names.firstElementChild;
  // Layout sizes, not getBoundingClientRect: the steps are scaled to 0 until revealed.
  if (inner.offsetHeight > names.clientHeight + 1) return true;
  return [...inner.children].some(name => name.scrollWidth > names.clientWidth + 1);
}

// Shrinks a plate to fit. Below `floor` a single long word is allowed to break instead, so
// one unusual name never shrinks the whole plate to nothing.
function fitPlate(names, max, floor, min) {
  names.classList.remove("break");
  let size = max;
  const step = limit => {
    while (size > limit && overflows(names)) {
      size = Math.max(limit, size * .94);
      names.style.setProperty("--fit", `${size}rem`);
    }
  };
  names.style.setProperty("--fit", `${size}rem`);
  step(floor);
  if (overflows(names)) {
    names.classList.add("break");
    step(min);
  }
  return size;
}

// The winner's step is fitted first. 2nd and 3rd are capped well below it so 1st is always the biggest name.
function fitNames() {
  const plate = place => podium.querySelector(`.spot[data-place="${place}"] .plate-names`);
  const shared = place => Number(plate(place)?.closest(".spot").dataset.names) || 1;
  const start = (max, place) => shared(place) > 3 ? max * .5 : shared(place) > 1 ? max * .7 : max;
  let winner = 6;
  if (plate(1)) winner = fitPlate(plate(1), start(6.5, 1), shared(1) > 3 ? 1.4 : 2.4, 1.1);
  for (const place of [2, 3]) {
    if (!plate(place)) continue;
    const max = Math.max(Math.min(start(3.2, place), winner * .6), 1.2);
    fitPlate(plate(place), max, Math.min(max, 1.4), 1);
  }
}

// ---------- Celebration ----------

function celebrate() {
  if (reducedMotion.matches) return;
  const canvas = $("#confetti");
  const context = canvas.getContext("2d");
  const ratio = devicePixelRatio || 1;
  const width = innerWidth;
  const height = innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);

  const colors = ["#4285F4", "#EA4335", "#F9AB00", "#34A853", "#F0F0F0"];
  const unit = Math.max(6, width / 240);
  const pieces = [];
  const burst = (x, y, angle, spread, speed, count, delay) => {
    for (let index = 0; index < count; index++) {
      const direction = angle + (Math.random() - .5) * spread;
      const velocity = speed * (.55 + Math.random() * .6);
      pieces.push({
        x, y, delay: delay + Math.random() * 120,
        vx: Math.cos(direction) * velocity,
        vy: Math.sin(direction) * velocity,
        spin: (Math.random() - .5) * .3,
        turn: Math.random() * Math.PI * 2,
        flutter: Math.random() * Math.PI * 2,
        size: unit * (.7 + Math.random() * .8),
        round: Math.random() < .3,
        color: colors[index % colors.length],
      });
    }
  };
  const speed = height / 38;
  burst(0, height, -Math.PI * .32, .5, speed, 110, 0);
  burst(width, height, -Math.PI * .68, .5, speed, 110, 0);
  burst(width * .5, -20, Math.PI / 2, 1.6, speed * .25, 120, 600);

  const start = performance.now();
  const frame = now => {
    const elapsed = now - start;
    context.clearRect(0, 0, width, height);
    let alive = 0;
    for (const piece of pieces) {
      if (elapsed < piece.delay) { alive++; continue; }
      piece.vy = Math.min(piece.vy + height / 2600, height / 260);
      piece.vx *= .985;
      piece.x += piece.vx + Math.sin(piece.flutter) * .8;
      piece.y += piece.vy;
      piece.turn += piece.spin;
      piece.flutter += .12;
      if (piece.y > height + 40) continue;
      alive++;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.turn);
      context.scale(1, Math.cos(piece.flutter));
      context.fillStyle = piece.color;
      if (piece.round) {
        context.beginPath();
        context.arc(0, 0, piece.size * .45, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      }
      context.restore();
    }
    if (alive && elapsed < 9000) requestAnimationFrame(frame);
    else context.clearRect(0, 0, width, height);
  };
  requestAnimationFrame(frame);
}

// ---------- The reveal ----------

async function runReveal() {
  if (revealed || poll?.phase !== "closed") return;
  revealed = true;
  clearInterval(timer);
  const rows = rank(poll.projects, poll.results);
  setTitle($("#board-title"), poll.title);
  const spots = buildBoard(rows);
  curtain.hidden = true;
  lobby.hidden = true;
  board.hidden = false;
  document.body.dataset.phase = "revealed";
  fitNames();
  document.fonts?.ready.then(fitNames);
  board.classList.add("revealing");

  if (!spots.length) {
    $(".quiet-title").textContent = "Projects in this poll";
    announce.textContent = summary(rows);
    $("#result").textContent = summary(rows);
    for (const item of board.querySelectorAll(".pending")) item.classList.remove("pending");
    board.classList.replace("revealing", "revealed");
    return;
  }

  // The rest of the list first, from the bottom up, then 3rd, 2nd and 1st.
  announce.textContent = "Here are the results";
  await wait(900);
  const items = [...rest.querySelectorAll("li.pending")].filter(item => item.dataset.place > 3).reverse();
  quiet.classList.remove("pending");
  for (const item of items) {
    item.classList.remove("pending");
    await wait(Math.max(70, 900 / items.length));
  }

  const byPlace = place => podium.querySelector(`.spot[data-place="${place}"]`);
  for (const place of [3, 2]) {
    const column = byPlace(place);
    if (!column) continue;
    await wait(1300);
    announce.textContent = column.hasAttribute("data-ghost")
      ? `No ${ordinal(place)} place`
      : `In ${ordinal(place)} place`;
    await wait(500);
    column.classList.remove("pending");
    for (const item of rest.querySelectorAll(`li.pending[data-place="${place}"]`)) item.classList.remove("pending");
  }

  await wait(1500);
  const first = rows.filter(row => row.place === 1);
  announce.textContent = first.length > 1 ? "And it's a tie for 1st" : "And the winner is";
  board.classList.add("drumroll");
  await wait(2200);
  board.classList.remove("drumroll");
  byPlace(1).classList.remove("pending");
  for (const item of rest.querySelectorAll("li.pending")) item.classList.remove("pending");
  board.classList.replace("revealing", "revealed");
  await wait(350);
  celebrate();
  announce.textContent = first.length > 1 ? `It's a ${first.length > 2 ? `${tieWord(first.length).toLowerCase()}-way ` : ""}tie for 1st` : "Congratulations!";
  $("#result").textContent = summary(rows);
}

reveal.addEventListener("click", runReveal);

// ---------- Controls ----------

function toggleTheme() {
  const light = document.documentElement.dataset.theme !== "light";
  if (light) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  $("#theme").textContent = light ? "Dark background" : "Light background";
  try { localStorage.setItem("screen-theme", light ? "light" : "dark"); } catch {}
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

$("#theme").addEventListener("click", toggleTheme);
$("#fullscreen").addEventListener("click", toggleFullscreen);
addEventListener("keydown", event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  const onButton = event.target.closest?.("button");
  if (key === "f") toggleFullscreen();
  else if (key === "t") toggleTheme();
  else if ((key === " " || key === "enter") && !onButton && !curtain.hidden) {
    event.preventDefault();
    runReveal();
  }
});

let resizeFrame;
addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { if (!board.hidden) fitNames(); });
});

try {
  if (localStorage.getItem("screen-theme") === "light") toggleTheme();
} catch {}

if (id) {
  $("#qr").src = `/api/polls/${id}/qr`;
  $("#join-link").textContent = `${location.host}/?poll=${id}`;
  refresh();
  timer = setInterval(() => { if (!document.hidden) refresh(); }, 3000);
} else {
  phaseLabel.textContent = "No poll selected";
  $("#instructions").textContent = "Open this screen from the host page with Open the projector screen.";
}
