// Turns the closed poll's tally into a ranking. Tied projects share a place
// (1, 2, 2, 4) and are listed alphabetically within the tie.
export function rank(projects, results) {
  const rows = projects.map((name, index) => ({ name, index, votes: results?.[index] ?? 0 }));
  rows.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  let place = 0;
  rows.forEach((row, position) => {
    if (position === 0 || row.votes !== rows[position - 1].votes) place = position + 1;
    row.place = place;
  });
  for (const row of rows) row.tied = rows.some(other => other !== row && other.place === row.place);
  return rows;
}

// Groups rows that share a place.
export function groups(rows) {
  const list = [];
  for (const row of rows) {
    const last = list.at(-1);
    if (last && last.place === row.place) last.rows.push(row);
    else list.push({ place: row.place, votes: row.votes, rows: [row] });
  }
  return list;
}

export function votes(count) {
  return `${count} ${count === 1 ? "vote" : "votes"}`;
}

export function ordinal(place) {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${{ 1: "st", 2: "nd", 3: "rd" }[place % 10] || "th"}`;
}

// Fills an <ol> with a plain, accessible ranked list.
export function renderList(list, rows) {
  list.replaceChildren(...rows.map(row => {
    const item = document.createElement("li");
    item.dataset.place = row.place;
    const place = document.createElement("span");
    place.className = "place";
    place.textContent = row.place;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.name;
    const count = document.createElement("span");
    count.className = "votes";
    count.textContent = votes(row.votes) + (row.tied && row.votes ? ", tied" : "");
    item.append(place, name, count);
    return item;
  }));
}

export function summary(rows) {
  if (!rows.length || rows[0].votes === 0) return "No ballots were cast.";
  const leaders = rows.filter(row => row.place === 1);
  if (leaders.length > 1) {
    return `Tie for 1st between ${leaders.map(row => row.name).join(" and ")}, with ${votes(leaders[0].votes)} each.`;
  }
  return `${leaders[0].name} wins with ${votes(leaders[0].votes)}.`;
}
