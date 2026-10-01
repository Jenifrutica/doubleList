const NS = "http://www.w3.org/2000/svg";
const SLOT = 322;
const PAD = 150;
const STAGE_H = 470;
const CY = 232;
const OUT = 142;
const IN = 124;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scene = document.getElementById("scene");
const stageScroll = document.getElementById("stage-scroll");
const legend = document.getElementById("legend");
const metricsEl = document.getElementById("metrics");
const logEl = document.getElementById("log");
const railNote = document.getElementById("rail-note");
const pointerToggle = document.getElementById("pointer-toggle");
const labelToggle = document.getElementById("label-toggle");
const overlay = document.getElementById("overlay");
const selName = document.getElementById("sel-name");
const selMeta = document.getElementById("sel-meta");
const renameInput = document.getElementById("rename-input");
const renameBtn = document.getElementById("rename-btn");
const newName = document.getElementById("new-name");
const circleKey = document.getElementById("circle-key");
const circleSub = document.getElementById("circle-sub");
const demoKey = document.getElementById("demo-key");
const stepEls = [document.getElementById("step-1"), document.getElementById("step-2"), document.getElementById("step-3")];

let current = null;
let busy = false;
let demoRunning = false;
let selectedOnce = false;
let firedOnce = false;
let refs = { groups: new Map(), x: new Map(), pad: PAD, slot: SLOT, offset: 0, viewWidth: 1, count: 0, scale: 1 };
let drag = null;
let comet = null;
const particles = [];

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
  return node;
}

function defs() {
  return `
  <defs>
    <pattern id="nissl" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="1.6" cy="1.6" r="1" fill="#10488f" opacity="0.5"/>
      <circle cx="5" cy="4.6" r="0.8" fill="#10488f" opacity="0.4"/>
    </pattern>
    <pattern id="myelin" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#10488f" stroke-width="1" opacity="0.55"/>
    </pattern>
    <pattern id="refractory" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#3a5878" stroke-width="1.4" opacity="0.5"/>
    </pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#1c6fd6"/>
    </marker>
  </defs>`;
}

function neuronMarkup(n, index, cx) {
  const classes = ["neuron"];
  if (n.state === "recovering") classes.push("is-recovering");
  if (n.state === "excited") classes.push("is-excited");
  if (n.state === "inhibited") classes.push("is-inhibited");
  const isCursor = current && current.metrics.cursor_uid === n.uid;
  if (isCursor) classes.push("is-cursor");

  const axon = n.myelinated
    ? `<path class="fiber" d="M48 0 H ${OUT}"/>
       <path class="sheath" d="M58 -9 h17 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-17 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z"/>
       <path class="sheath-hatch" d="M58 -9 h17 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-17 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z"/>
       <path class="sheath" d="M84 -9 h17 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-17 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z"/>
       <path class="sheath-hatch" d="M84 -9 h17 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-17 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z"/>
       <path class="sheath" d="M110 -9 h16 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z"/>
       <path class="sheath-hatch" d="M110 -9 h16 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z"/>
       <line class="ranvier" x1="81" y1="-10" x2="81" y2="10"/>
       <line class="ranvier" x1="107" y1="-10" x2="107" y2="10"/>`
    : `<path class="fiber-thin" d="M50 0 H ${OUT}"/>`;

  const callouts = isCursor
    ? `<g class="callout-group">
        <path class="callout" d="M-100 -96 L-92 -56"/>
        <text class="callout-label" x="-104" y="-102" text-anchor="middle">dendrites</text>
        <path class="callout" d="M92 -96 L94 -4"/>
        <text class="callout-label" x="92" y="-102" text-anchor="middle">axon</text>
        <path class="callout" d="M-78 112 L-24 36"/>
        <text class="callout-label" x="-80" y="124" text-anchor="middle">soma</text>
        <path class="callout" d="M58 112 L66 12"/>
        <text class="callout-label" x="58" y="124" text-anchor="middle">myelin sheath</text>
        <path class="callout" d="M136 96 L144 14"/>
        <text class="callout-label" x="136" y="108" text-anchor="middle">terminal</text>
      </g>`
    : "";

  return `<g class="${classes.join(" ")}" data-uid="${n.uid}">
    <g class="body">
      <circle class="seed-ring" r="40" cx="0" cy="0"/>
      <g class="fiber dendrite">
        <path d="M-24 -14 C -52 -22 -70 -36 -88 -54"/>
        <path d="M-88 -54 C -98 -64 -104 -70 -114 -76"/>
        <path d="M-88 -54 C -96 -46 -102 -40 -112 -34"/>
        <path d="M-20 -22 C -42 -40 -54 -56 -64 -76"/>
        <path d="M-64 -76 C -71 -88 -75 -94 -82 -102"/>
        <path d="M-24 14 C -52 22 -70 36 -88 54"/>
        <path d="M-88 54 C -98 64 -104 70 -114 76"/>
        <path d="M-88 54 C -96 46 -102 40 -112 34"/>
        <path d="M-20 22 C -42 40 -54 56 -64 76"/>
        <path d="M-64 76 C -71 88 -75 94 -82 102"/>
        <path d="M-26 0 C -56 0 -80 0 -106 0"/>
        <path d="M-106 0 C -112 0 -116 0 -122 0"/>
      </g>
      <g class="bouton">
        <circle cx="-114" cy="-76" r="2.2"/><circle cx="-112" cy="-34" r="2.2"/>
        <circle cx="-82" cy="-102" r="2.2"/>
        <circle cx="-114" cy="76" r="2.2"/><circle cx="-112" cy="34" r="2.2"/>
        <circle cx="-82" cy="102" r="2.2"/>
        <circle cx="-122" cy="0" r="2.2"/>
        <circle cx="-58" cy="-30" r="1.7"/><circle cx="-58" cy="30" r="1.7"/>
        <circle cx="-40" cy="-46" r="1.7"/><circle cx="-40" cy="46" r="1.7"/>
      </g>
      <path class="soma" d="M-32 0 C -34 -26 -14 -40 8 -38 C 30 -36 40 -18 38 4 C 36 26 18 40 -4 40 C -22 40 -34 24 -32 0 Z"/>
      <path class="soma-shade" d="M-32 0 C -34 -26 -14 -40 8 -38 C 30 -36 40 -18 38 4 C 36 26 18 40 -4 40 C -22 40 -34 24 -32 0 Z"/>
      <ellipse class="nucleus" cx="-2" cy="0" rx="14" ry="16"/>
      <circle class="nucleolus" cx="1" cy="-2" r="4.6"/>
      <path class="hillock" d="M36 -12 L52 -6 L52 6 L36 12 Z"/>
      ${axon}
      <g class="fiber">
        <path d="M${OUT} 0 l12 -16"/>
        <path d="M${OUT} 0 l17 -5"/>
        <path d="M${OUT} 0 l17 5"/>
        <path d="M${OUT} 0 l12 16"/>
      </g>
      <g class="bouton">
        <circle cx="${OUT + 12}" cy="-16" r="3"/><circle cx="${OUT + 17}" cy="-5" r="3"/>
        <circle cx="${OUT + 17}" cy="5" r="3"/><circle cx="${OUT + 12}" cy="16" r="3"/>
      </g>
      <ellipse class="refractory-mask" cx="-2" cy="0" rx="36" ry="40"/>
      <circle class="cursor-ring" r="48" cx="0" cy="0"/>
      <path class="cursor-flag" d="M0 -62 l-7 -13 h14 z"/>
      <text class="fig" x="0" y="-150" text-anchor="middle">FIG. ${index + 1}</text>
      <text class="name" x="0" y="62" text-anchor="middle">${esc(n.name)}</text>
      <text class="state" x="0" y="80" text-anchor="middle">${esc(n.state)}${n.myelinated ? " · myelinated" : ""}</text>
      ${callouts}
    </g>
  </g>`;
}

function pointerMarkup(neurons, xOf) {
  let out = `<g class="pointer-group">`;
  for (let i = 0; i < neurons.length - 1; i += 1) {
    const ax = xOf(i);
    const bx = xOf(i + 1);
    const mid = (ax + bx) / 2;
    out += `<path class="pointer" d="M${ax} ${CY - 104} C ${ax} ${CY - 152}, ${bx} ${CY - 152}, ${bx} ${CY - 104}" marker-end="url(#arrow)"/>`;
    out += `<text class="pointer-label" x="${mid}" y="${CY - 160}" text-anchor="middle">next</text>`;
    out += `<path class="pointer" d="M${bx} ${CY + 104} C ${bx} ${CY + 152}, ${ax} ${CY + 152}, ${ax} ${CY + 104}" marker-end="url(#arrow)"/>`;
    out += `<text class="pointer-label" x="${mid}" y="${CY + 172}" text-anchor="middle">prev</text>`;
  }
  if (neurons.length > 1 && current && current.metrics.circular) {
    const ax = xOf(0);
    const bx = xOf(neurons.length - 1);
    out += `<path class="pointer loop" d="M${bx} ${CY - 104} C ${bx} ${CY - 210}, ${ax} ${CY - 210}, ${ax} ${CY - 104}" marker-end="url(#arrow)"/>`;
    out += `<text class="pointer-label" x="${(ax + bx) / 2}" y="${CY - 218}" text-anchor="middle">next · the reflex arc closes on the head</text>`;
  }
  out += `</g>`;
  return out;
}

function render(state) {
  current = state;
  const before = new Map(refs.x);
  const neurons = state.neurons;
  const count = neurons.length;

  const available = stageScroll.clientWidth || 900;
  const contentWidth = PAD * 2 + Math.max(0, count - 1) * SLOT + OUT + IN;
  const scale = count > 1 ? Math.min(1, Math.max(0.58, available / contentWidth)) : 1;
  const scaledWidth = contentWidth * scale;
  const svgWidth = Math.max(available, scaledWidth);
  const viewWidth = svgWidth / scale;
  const offset = (viewWidth - contentWidth) / 2;
  const xOf = (i) => PAD + i * SLOT + offset;

  let body = defs();
  if (count === 0) {
    body += `<text x="${viewWidth / 2}" y="${CY}" text-anchor="middle" class="state" style="font-size:15px">The pathway is empty. Create a neuron to begin.</text>`;
  } else {
    const spineStart = xOf(0) - IN;
    const spineEnd = xOf(count - 1) + OUT;
    body += `<line class="spine" x1="${spineStart}" y1="${CY}" x2="${spineEnd}" y2="${CY}"/>`;
    body += `<line class="spine-glow" id="spine-glow" x1="${spineStart}" y1="${CY}" x2="${spineStart}" y2="${CY}"/>`;
    for (let i = 0; i < count; i += 1) body += neuronMarkup(neurons[i], i, xOf(i));
    body += pointerMarkup(neurons, xOf);
  }

  scene.setAttribute("width", svgWidth);
  scene.setAttribute("height", STAGE_H * scale);
  scene.setAttribute("viewBox", `0 0 ${viewWidth} ${STAGE_H}`);
  scene.setAttribute("data-pointers", pointerToggle.getAttribute("aria-pressed") === "true" ? "on" : "off");
  scene.setAttribute("data-labels", labelToggle.getAttribute("aria-pressed") === "true" ? "on" : "off");
  scene.innerHTML = body;

  refs = { groups: new Map(), x: new Map(), pad: PAD, slot: SLOT, offset, viewWidth, count, scale };
  neurons.forEach((n, i) => {
    const group = scene.querySelector(`.neuron[data-uid="${n.uid}"]`);
    refs.groups.set(n.uid, group);
    refs.x.set(n.uid, xOf(i));
  });

  refs.groups.forEach((group, uid) => {
    const newX = refs.x.get(uid);
    const oldX = before.has(uid) ? before.get(uid) : newX;
    group.style.transition = "none";
    group.style.transform = `translate(${oldX}px, ${CY}px)`;
  });
  void scene.getBoundingClientRect();
  refs.groups.forEach((group, uid) => {
    group.style.transition = "";
    group.style.transform = `translate(${refs.x.get(uid)}px, ${CY}px)`;
  });

  renderSelection(state.metrics);
  renderLegend(neurons);
  renderMetrics(state.metrics);
  renderLog(state.log);
  updateSteps();
  updateCircleKey(state.metrics.circular);

  const cursorEl = refs.groups.get(state.metrics.cursor_uid);
  if (cursorEl && count > 4) cursorEl.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

function renderSelection(m) {
  if (!m.cursor_name) { selName.textContent = "—"; selMeta.textContent = ""; return; }
  selName.textContent = m.cursor_name;
  selMeta.textContent = `No. ${m.cursor_index + 1} · ${m.potential} mV · ${m.circular ? "circular" : "linear"}`;
}

function renderLegend(neurons) {
  legend.innerHTML = neurons.map((n, i) => {
    const cls = current.metrics.cursor_uid === n.uid ? "is-cursor" : "";
    return `<li class="${cls}" data-uid="${n.uid}">
      <span class="legend-fig">${String(i + 1).padStart(2, "0")}</span>
      <span class="legend-name">${esc(n.name)}
        <span class="legend-state">${esc(n.state)}${n.myelinated ? " · myelinated" : ""} · ${n.potential} mV</span>
      </span>
    </li>`;
  }).join("");
}

function renderMetrics(m) {
  const rows = [
    ["Neurons", m.length],
    ["Cursor", m.cursor_name ? `${m.cursor_name} (No. ${m.cursor_index + 1})` : "—"],
    ["Membrane", m.potential === null ? "—" : `${m.potential} mV`],
    ["Myelinated", `${m.myelinated_count} of ${m.length}`],
    ["Conduction", `${m.velocity} m/s`],
    ["Total delay", `${m.total_delay} ms`],
    ["Loop", m.circular ? "closed (reflex arc)" : "open (linear)"],
    ["Last volley", m.last_run.length ? `${m.last_run.length} neurons` : "—", true],
  ];
  metricsEl.innerHTML = rows.map(([label, value, signal]) =>
    `<div><dt>${label}</dt><dd class="${signal ? "is-signal" : ""}">${esc(value)}</dd></div>`
  ).join("");
}

function renderLog(entries) {
  logEl.innerHTML = entries.slice().reverse().map((e) => `<li data-tick="${e.tick}">${esc(e.text)}</li>`).join("");
}

function updateSteps() {
  stepEls.forEach((element) => element.classList.remove("is-active", "is-done"));
  if (!selectedOnce) {
    stepEls[0].classList.add("is-active");
  } else if (!firedOnce) {
    stepEls[0].classList.add("is-done");
    stepEls[1].classList.add("is-active");
  } else {
    stepEls[0].classList.add("is-done");
    stepEls[1].classList.add("is-done");
    stepEls[2].classList.add("is-active");
  }
}

function updateCircleKey(circular) {
  circleKey.classList.toggle("is-on", !!circular);
  circleSub.textContent = circular ? "open the loop" : "close the loop";
}

/* ---------- particles, shockwaves, comet ---------- */

function spawnShock(x, y) {
  if (REDUCED) return;
  const group = el("g", { transform: `translate(${x} ${y})` });
  const ring = el("circle", { class: "shock", r: "12", cx: "0", cy: "0" });
  group.appendChild(ring);
  scene.appendChild(group);
  group.addEventListener("animationend", () => group.remove());
}

function spawnSparks(x, y, count) {
  if (REDUCED) return;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    const node = el("circle", { class: "spark", r: (1.4 + Math.random() * 1.6).toFixed(1) });
    scene.appendChild(node);
    particles.push({
      node, x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      life: 0,
      ttl: 0.45 + Math.random() * 0.5,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.ttl) { p.node.remove(); particles.splice(i, 1); continue; }
    p.vy += 140 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = 1 - p.life / p.ttl;
    p.node.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    p.node.setAttribute("opacity", (k * 0.9).toFixed(2));
  }
}

let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (comet) updateComet(now);
  updateParticles(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function flashNode(uid) {
  const group = refs.groups.get(uid);
  if (!group) return;
  group.classList.add("is-flash");
  setTimeout(() => group.classList.remove("is-flash"), 340);
}

function animateFire(run, direction, finalState) {
  if (!run || !run.length || REDUCED) { render(finalState || current); return; }
  const order = direction >= 0 ? run.slice() : run.slice().reverse();
  const centers = order.map((uid) => refs.x.get(uid)).filter((v) => v !== undefined);
  if (!centers.length) return;
  const dirSign = direction >= 0 ? 1 : -1;
  const from = centers[0] - dirSign * 60;
  const to = centers[centers.length - 1] + dirSign * 60;
  const duration = Math.max(620, Math.min(2800, Math.abs(to - from) * 0.75));

  const cometGroup = el("g", { id: "comet", class: "comet" });
  cometGroup.appendChild(el("circle", { class: "comet-halo", r: "17" }));
  cometGroup.appendChild(el("circle", { class: "comet-core", r: "6.5" }));
  scene.appendChild(cometGroup);

  const trail = [];
  for (let i = 0; i < 7; i += 1) {
    const dot = el("circle", { class: "comet-core", r: (5.4 - i * 0.6).toFixed(1), opacity: "0" });
    scene.appendChild(dot);
    trail.push(dot);
  }
  const trailPts = [];

  const glow = document.getElementById("spine-glow");
  if (glow) {
    glow.setAttribute("x1", Math.min(from, to));
    glow.setAttribute("x2", Math.max(from, to));
    glow.classList.add("on");
  }

  const crossings = order.map((uid) => ({ uid, x: refs.x.get(uid) }));
  let touched = 0;
  const start = performance.now();

  comet = {
    frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2.4);
      const x = from + (to - from) * eased;
      const y = CY + Math.sin(t * Math.PI * order.length) * 5;
      cometGroup.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      trailPts.unshift([x, y]);
      if (trailPts.length > trail.length) trailPts.pop();
      trail.forEach((dot, i) => {
        const point = trailPts[i];
        if (!point) { dot.setAttribute("opacity", "0"); return; }
        dot.setAttribute("transform", `translate(${point[0].toFixed(2)} ${point[1].toFixed(2)})`);
        dot.setAttribute("opacity", (0.5 * (1 - i / trail.length)).toFixed(2));
      });
      while (touched < crossings.length && Math.abs(x - crossings[touched].x) < 30) {
        const { uid, x: cx } = crossings[touched];
        flashNode(uid);
        spawnShock(cx, CY);
        spawnSparks(cx, CY, 7);
        if (touched > 0) spawnSparks((cx + crossings[touched - 1].x) / 2, CY, 3);
        touched += 1;
      }
      if (t >= 1) {
        cometGroup.remove();
        trail.forEach((dot) => dot.remove());
        if (glow) setTimeout(() => glow.classList.remove("on"), 220);
        comet = null;
        render(finalState || current);
      }
    },
  };
}

function updateComet(now) { if (comet) comet.frame(now); }

function markEnter(previousUids) {
  const previous = new Set(previousUids);
  [...refs.groups.keys()].forEach((uid) => {
    if (previous.has(uid)) return;
    const group = refs.groups.get(uid);
    if (!group) return;
    group.querySelectorAll("path, ellipse, circle").forEach((node) => {
      if (node.classList.contains("fiber-thin") || node.classList.contains("bouton") ||
          node.classList.contains("sheath-hatch") || node.classList.contains("soma-shade") ||
          node.classList.contains("nucleolus") || node.classList.contains("refractory-mask") ||
          node.classList.contains("seed-ring") || node.classList.contains("nissl")) return;
      node.setAttribute("pathLength", "1");
      node.style.strokeDasharray = "1";
    });
    group.classList.add("enter");
    group.addEventListener("animationend", () => {
      group.classList.remove("enter");
      group.querySelectorAll("[pathLength]").forEach((node) => {
        node.removeAttribute("pathLength");
        node.style.strokeDasharray = "";
      });
    }, { once: true });
  });
}

/* ---------- drag and drop ---------- */

function toSvgX(clientX) {
  const rect = scene.getBoundingClientRect();
  return (clientX - rect.left) * (refs.viewWidth / rect.width);
}

function previewOrder(draggedUid, target) {
  const order = current.neurons.map((n) => n.uid).filter((u) => u !== draggedUid);
  order.splice(target, 0, draggedUid);
  return order;
}

scene.addEventListener("pointerdown", (event) => {
  const group = event.target.closest(".neuron");
  if (!group || busy) return;
  event.preventDefault();
  const uid = Number(group.dataset.uid);
  drag = {
    uid, group,
    startClientX: event.clientX,
    startX: refs.x.get(uid),
    moved: false,
    target: current.metrics.cursor_index,
    pointerId: event.pointerId,
  };
  try { scene.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
});

scene.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = (event.clientX - drag.startClientX) * (refs.viewWidth / scene.getBoundingClientRect().width);
  if (!drag.moved) {
    if (Math.abs(event.clientX - drag.startClientX) < 6) return;
    drag.moved = true;
    drag.group.classList.add("is-drag");
    scene.appendChild(drag.group);
    scene.dataset.dragging = "on";
  }
  const cx = drag.startX + dx;
  drag.group.style.transition = "none";
  drag.group.style.transform = `translate(${cx}px, ${CY}px)`;
  const raw = (cx - refs.pad - refs.offset) / refs.slot;
  const target = Math.max(0, Math.min(refs.count - 1, Math.round(raw)));
  drag.target = target;
  previewOrder(drag.uid, target).forEach((uid, i) => {
    if (uid === drag.uid) return;
    const node = refs.groups.get(uid);
    if (!node) return;
    node.style.transform = `translate(${refs.pad + i * refs.slot + refs.offset}px, ${CY}px)`;
  });
});

function endDrag(event) {
  if (!drag) return;
  const d = drag;
  drag = null;
  try { scene.releasePointerCapture(d.pointerId); } catch (error) { /* ignore */ }
  if (!d.moved) {
    run({ op: "focus", uid: d.uid }, { message: "Cursor placed. Operate on it, or fire the signal." });
    return;
  }
  d.group.classList.remove("is-drag");
  scene.dataset.dragging = "off";
  const original = current.neurons.map((n) => n.uid).indexOf(d.uid);
  if (d.target === original) { render(current); return; }
  const order = previewOrder(d.uid, d.target);
  order.forEach((uid, i) => refs.x.set(uid, refs.pad + i * refs.slot + refs.offset));
  run({ op: "reorder", uid: d.uid, to_index: d.target }, { message: `“${current.metrics.cursor_name || ""}” dragged to a new position.` });
}
scene.addEventListener("pointerup", endDrag);
scene.addEventListener("pointercancel", endDrag);
scene.addEventListener("dblclick", (event) => {
  const group = event.target.closest(".neuron");
  if (!group) return;
  run({ op: "focus", uid: Number(group.dataset.uid) }, { message: "Cursor placed." }).then(startRename);
});

/* ---------- rename ---------- */

function startRename() {
  if (!current || !current.metrics.cursor_uid) return;
  renameInput.value = selName.textContent;
  selName.hidden = true;
  renameInput.hidden = false;
  renameInput.focus();
  renameInput.select();
}

function commitRename() {
  const name = renameInput.value.trim();
  renameInput.hidden = true;
  selName.hidden = false;
  if (name && current && current.metrics.cursor_name !== name) {
    run({ op: "rename", uid: current.metrics.cursor_uid, name }, { message: `Renamed to “${name}”.` });
  }
}

function cancelRename() {
  renameInput.hidden = true;
  selName.hidden = false;
}

renameBtn.addEventListener("click", startRename);
renameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); commitRename(); }
  else if (event.key === "Escape") { event.preventDefault(); cancelRename(); }
});
renameInput.addEventListener("blur", commitRename);

/* ---------- transport ---------- */

async function post(payload) {
  const response = await fetch("/api/op", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function note(text) { railNote.textContent = text; }

async function run(payload, options) {
  while (busy) { await new Promise((resolve) => setTimeout(resolve, 40)); }
  busy = true;
  const previousUids = current ? current.neurons.map((n) => n.uid) : [];
  try {
    const state = await post(payload);
    if (payload.op === "fire") { selectedOnce = true; firedOnce = true; }
    else if (payload.op !== "reset" && payload.op !== "rest") selectedOnce = true;
    if (payload.op === "fire") {
      const calm = {
        ...state,
        neurons: state.neurons.map((n) => (n.state === "recovering" ? { ...n, state: "resting", refractory: 0 } : n)),
      };
      render(calm);
      animateFire(state.metrics.last_run, state.metrics.last_direction, state);
    } else {
      render(state);
      markEnter(previousUids);
    }
    if (options && options.message) note(options.message);
  } catch (error) {
    note("The instrument did not respond. Is the server still running?");
  } finally {
    busy = false;
  }
}

function describe(payload) {
  switch (payload.op) {
    case "move": return "Cursor moved.";
    case "reorder": return "Neuron dragged to a new position in the chain.";
    case "create": return "A neuron is drawn into the pathway; its links are rewired.";
    case "delete": return "Neuron lesioned; its neighbours rejoined.";
    case "excite": return "Membrane depolarised toward threshold.";
    case "inhibit": return "Membrane hyperpolarised; the neuron is suppressed.";
    case "toggle_myelin": return "Myelin toggled: conduction speed changed.";
    case "reverse": return "Every prev/next pair swapped: the pathway runs backward.";
    case "circle": return "Reflex arc toggled between linear and circular.";
    case "rest": return "Pathway at rest; membranes recover.";
    case "reset": return "Pathway reset to the reflex arc.";
    case "focus": return "Cursor placed.";
    case "rename": return "Neuron renamed.";
    default: return "Done.";
  }
}

document.querySelectorAll(".key[data-op]").forEach((button) => {
  button.addEventListener("click", () => {
    const op = button.dataset.op;
    if (op === "create") {
      const name = newName.value.trim();
      newName.value = "";
      run({ op: "create", position: button.dataset.position, name }, { message: describe({ op: "create" }) });
      return;
    }
    if (op === "delete") {
      const uid = current && current.metrics.cursor_uid;
      const group = uid !== undefined && uid !== null ? refs.groups.get(uid) : null;
      if (group && !REDUCED) {
        group.classList.add("is-exit");
        spawnSparks(refs.x.get(uid), CY, 10);
        setTimeout(() => run({ op: "delete" }, { message: describe({ op: "delete" }) }), 240);
      } else {
        run({ op: "delete" }, { message: describe({ op: "delete" }) });
      }
      return;
    }
    const payload = { op };
    if (button.dataset.direction) payload.direction = Number(button.dataset.direction);
    if (op === "circle") payload.value = !(current && current.metrics.circular);
    run(payload, { message: describe(payload) });
  });
});

legend.addEventListener("click", (event) => {
  const item = event.target.closest("li[data-uid]");
  if (!item) return;
  run({ op: "focus", uid: Number(item.dataset.uid) }, { message: "Cursor placed." });
});

pointerToggle.addEventListener("click", () => {
  const next = pointerToggle.getAttribute("aria-pressed") !== "true";
  pointerToggle.setAttribute("aria-pressed", String(next));
  scene.setAttribute("data-pointers", next ? "on" : "off");
});
labelToggle.addEventListener("click", () => {
  const next = labelToggle.getAttribute("aria-pressed") !== "true";
  labelToggle.setAttribute("aria-pressed", String(next));
  scene.setAttribute("data-labels", next ? "on" : "off");
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;
  const lower = event.key.toLowerCase();
  if (lower === "arrowright" || lower === "arrowleft") {
    event.preventDefault();
    const dir = lower === "arrowright" ? 1 : -1;
    const payload = event.shiftKey ? { op: "fire", direction: dir } : { op: "move", direction: dir };
    run(payload, { message: describe(payload) });
    return;
  }
  if (event.shiftKey) return;
  const quick = { o: "before", i: "after", a: "end", d: "delete", m: "toggle_myelin", e: "excite", n: "inhibit", r: "reverse", c: "circle" };
  if (quick[lower]) {
    if (["before", "after", "end"].includes(quick[lower])) {
      const name = newName.value.trim();
      newName.value = "";
      run({ op: "create", position: quick[lower], name }, { message: describe({ op: "create" }) });
    } else if (quick[lower] === "delete") {
      run({ op: "delete" }, { message: describe({ op: "delete" }) });
    } else {
      const payload = { op: quick[lower] };
      if (quick[lower] === "circle") payload.value = !(current && current.metrics.circular);
      run(payload, { message: describe(payload) });
    }
  } else if (event.key === " ") {
    event.preventDefault();
    run({ op: "rest" }, { message: describe({ op: "rest" }) });
  }
});

/* ---------- intro + demo ---------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openIntro() { overlay.hidden = false; }
function closeIntro() { overlay.hidden = true; try { sessionStorage.setItem("nodus-intro-seen", "1"); } catch (error) { /* ignore */ } }

async function playDemo() {
  if (demoRunning) return;
  demoRunning = true;
  demoKey.disabled = true;
  await run({ op: "reset" }, { message: "Demo: start from the reflex arc." });
  await wait(700);
  await run({ op: "focus", index: 1 }, { message: "Demo: cursor placed on the interneuron (blue ring)." });
  await wait(800);
  await run({ op: "create", position: "after", name: "Interneuron β" }, { message: "Demo: a named neuron is drawn in after the cursor." });
  await wait(1200);
  await run({ op: "toggle_myelin" }, { message: "Demo: myelin added — the signal will travel faster here." });
  await wait(800);
  await run({ op: "fire", direction: 1 }, { message: "Demo: firing forward (orthodromic)." });
  await wait(2000);
  await run({ op: "circle", value: true }, { message: "Demo: the tail now links back to the head." });
  await wait(1000);
  await run({ op: "fire", direction: 1 }, { message: "Demo: firing again around the closed loop." });
  await wait(2000);
  note("Demo complete. Try dragging a neuron to reorder the chain.");
  demoRunning = false;
  demoKey.disabled = false;
}

document.getElementById("help-open").addEventListener("click", openIntro);
document.getElementById("intro-explore").addEventListener("click", closeIntro);
document.getElementById("intro-demo").addEventListener("click", () => { closeIntro(); playDemo(); });
demoKey.addEventListener("click", playDemo);
overlay.addEventListener("click", (event) => { if (event.target === overlay) closeIntro(); });

async function boot() {
  try {
    const response = await fetch("/api/state");
    render(await response.json());
    note("Ready. Select a neuron, drag to reorder, then fire the signal.");
  } catch (error) {
    note("Could not reach the server.");
  }
  const params = new URLSearchParams(location.search);
  let seen = false;
  try { seen = sessionStorage.getItem("nodus-intro-seen") === "1"; } catch (error) { seen = false; }
  if (!params.has("nointro") && !seen) openIntro();
  if (params.has("auto")) {
    const what = params.get("auto");
    await wait(120);
    if (what === "fire") { firedOnce = true; run({ op: "fire", direction: 1 }, { message: "Firing forward." }); }
    else if (what === "demo") playDemo();
    else if (what === "circle") run({ op: "circle", value: true });
  }
}

window.addEventListener("resize", () => { if (current) render(current); });
boot();
