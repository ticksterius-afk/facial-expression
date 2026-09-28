import type { EmotionEngine, EngineEvent, FrameResult, SlotExplanation, Tier } from "../engine/index.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const PRIMARY_COLORS: Record<string, string> = {
  neutral: "#6f7886",
  happiness: "#f5c542",
  sadness: "#4a90e2",
  surprise: "#b36bff",
  fear: "#3fc1b0",
  anger: "#ff5a5f",
  disgust: "#7bc043",
  contempt: "#ff9f1c",
};

const NEUTRAL = { id: "neutral", name: "Neutral", emoji: "😐", gloss: "No expression stands out from your baseline.", tier: "primary" as Tier };
const TIER_ORDER: Tier[] = ["primary", "compound", "social", "cognitive", "physical"];
const REGION_ORDER = ["brows", "eyes", "cheeks", "nose", "mouth", "chin", "jaw", "head", "gaze"];

interface Row {
  root: HTMLElement;
  bar: HTMLElement;
  value: HTMLElement;
}

export class UI {
  private readonly engine: EmotionEngine;
  private readonly exprRows = new Map<string, Row>();
  private readonly auRows = new Map<string, Row>();
  private readonly stats: Record<string, HTMLElement> = {};
  private whySelected: string | "auto" = "auto";
  private lastWhyRender = 0;
  private readonly timeline: { t: number; id: string }[] = [];
  private readonly events: { t: number; html: string }[] = [];
  private lastPrimary = "";
  private sessionStart = performance.now();
  onSelectExpression?: (id: string) => void;

  constructor(engine: EmotionEngine) {
    this.engine = engine;
    this.buildTabs();
    this.buildEmotions();
    this.buildFace();
    this.buildLog();
  }

  private get model() {
    return this.engine.cm.model;
  }

  private exprMeta(id: string) {
    if (id === "neutral") return NEUTRAL;
    const e = this.engine.cm.byId.get(id)!;
    return { id, name: e.name, emoji: e.emoji, gloss: e.gloss, tier: e.tier };
  }

  /** Human label for a feature such as "AU12", "AU14U", "GAZE_DOWN" or "PERCLOS". */
  featureLabel(f: string): { code: string; name: string } {
    const m = /^(AU\d+)([LRUB])?$/.exec(f);
    if (m) {
      const au = this.model.aus[m[1]];
      const suffix = { L: " (left)", R: " (right)", U: " (one-sided)", B: " (both sides)" }[m[2] ?? ""] ?? "";
      return { code: m[1], name: (au?.name ?? m[1]) + suffix };
    }
    if (this.model.aus[f]) return { code: "gaze", name: this.model.aus[f].name };
    if (this.model.temporal[f]) return { code: f === "PERCLOS" ? "PERCLOS" : "time", name: this.model.temporal[f].name };
    return { code: f, name: f };
  }

  // ---------------------------------------------------------------- build
  private buildTabs(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>(".tabs button");
    for (const b of tabs) {
      b.addEventListener("click", () => this.selectTab(b.dataset.tab!));
    }
  }

  selectTab(name: string): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    for (const body of document.querySelectorAll<HTMLElement>(".tab-body")) body.hidden = body.dataset.body !== name;
    if (name === "why") this.lastWhyRender = 0;
  }

  private buildEmotions(): void {
    const host = $("#tab-emotions");
    for (const tier of TIER_ORDER) {
      host.append(el("div", "group-title", this.model.tiers[tier]));
      const ids = [...(tier === "primary" ? ["neutral"] : []), ...this.engine.cm.expressions.filter((e) => e.tier === tier).map((e) => e.id)];
      for (const id of ids) {
        const meta = this.exprMeta(id);
        const root = el("button", "row dim");
        root.setAttribute("type", "button");
        const name = el("span", "n", meta.name);
        name.append(el("small", undefined, meta.gloss));
        const bar = el("span");
        const barWrap = el("span", "bar");
        barWrap.append(bar);
        if (tier === "primary") bar.style.background = PRIMARY_COLORS[id] ?? "";
        const value = el("span", "v", "0%");
        root.append(el("span", "e", meta.emoji), name, barWrap, value);
        root.addEventListener("click", () => {
          this.whySelected = id;
          this.selectTab("why");
          this.onSelectExpression?.(id);
        });
        host.append(root);
        this.exprRows.set(id, { root, bar, value });
      }
    }
  }

  private buildFace(): void {
    const host = $("#tab-face");
    const stats = el("div", "stats");
    for (const [key, label] of [["pose", "head pitch / yaw / roll"], ["blinks", "blinks per minute"], ["perclos", "eyelid closure (PERCLOS)"], ["pspi", "pain index (PSPI, 0–16)"], ["fps", "frames per second"], ["base", "baseline"]] as const) {
      const s = el("div", "stat");
      const b = el("b", undefined, "–");
      s.append(b, el("span", undefined, label));
      stats.append(s);
      this.stats[key] = b;
    }
    host.append(stats);
    const byRegion = new Map<string, string[]>();
    for (const [id, au] of Object.entries(this.model.aus)) {
      if (!this.engine.cm.channels.some((c) => c.au === id)) continue;
      if (!byRegion.has(au.region)) byRegion.set(au.region, []);
      byRegion.get(au.region)!.push(id);
    }
    for (const region of REGION_ORDER) {
      const ids = byRegion.get(region);
      if (!ids) continue;
      host.append(el("div", "group-title", this.model.regions[region]));
      for (const id of ids) {
        const au = this.model.aus[id];
        const root = el("div", "row au dim");
        root.title = au.look;
        const name = el("span", "n", au.name);
        name.append(el("small", undefined, au.muscles));
        const bar = el("span");
        const barWrap = el("span", "bar");
        barWrap.append(bar);
        const value = el("span", "v", "0");
        root.append(el("span", "code", id.startsWith("AU") ? id : "gaze"), name, barWrap, value);
        host.append(root);
        this.auRows.set(id, { root, bar, value });
      }
    }
  }

  private buildLog(): void {
    const host = $("#tab-log");
    host.append(el("div", "group-title", "Last 60 seconds"));
    const canvas = document.createElement("canvas");
    canvas.id = "timeline";
    host.append(canvas);
    const legend = el("div", "legend");
    for (const [id, color] of Object.entries(PRIMARY_COLORS)) {
      const item = el("span");
      const sw = el("i");
      sw.style.background = color;
      item.append(sw, document.createTextNode(this.exprMeta(id).name));
      legend.append(item);
    }
    host.append(legend);
    host.append(el("div", "group-title", "Brief expressions & events"));
    const list = el("ul", "events");
    list.id = "events";
    host.append(list);
    host.append(el("p", "fine", "Brief expressions are emotional configurations that flash on and off within half a second (Ekman's micro-expressions last 1/25–1/5 s; Yan et al. 2013 put the upper bound near 500 ms). A phone camera at 30–60 fps catches the slower ones."));
    this.renderEvents();
  }

  // ---------------------------------------------------------------- update
  update(out: FrameResult, fps: number): void {
    const meta = this.exprMeta(out.primary.id);
    $("#primary-emoji").textContent = out.face ? meta.emoji : "🙈";
    $("#primary-name").textContent = out.face ? meta.name : "No face";
    $("#primary-pct").textContent = out.face && out.primary.id !== "neutral" ? pct(out.primary.score) : "";
    const bar = $("#primary-bar");
    bar.style.width = out.face ? pct(out.primary.id === "neutral" ? 0 : out.primary.score) : "0%";
    bar.style.background = PRIMARY_COLORS[out.primary.id] ?? "";
    $("#primary-gloss").textContent = out.face ? meta.gloss : "Point the camera at a face.";
    $("#noface").hidden = out.face;

    const chips = $("#complex");
    chips.replaceChildren(
      ...out.complex.map((c) => {
        const m = this.exprMeta(c.id);
        const chip = el("span", `c tier-${m.tier}`);
        chip.append(document.createTextNode(`${m.emoji} ${m.name} `), el("small", undefined, pct(c.score)));
        return chip;
      }),
    );

    // Emotions tab
    const active = new Set([out.primary.id, ...out.complex.map((c) => c.id)]);
    for (const [id, row] of this.exprRows) {
      const v = id === "neutral" ? out.neutral : out.scores[id] ?? 0;
      row.bar.style.width = pct(v);
      row.value.textContent = pct(v);
      row.root.classList.toggle("dim", v < 0.15);
      row.root.classList.toggle("on", active.has(id));
    }

    // Face tab
    for (const [id, row] of this.auRows) {
      const v = out.aus[id] ?? 0;
      row.bar.style.width = pct(v);
      row.value.textContent = String(Math.round(v * 100));
      row.root.classList.toggle("dim", v < 0.1);
    }
    this.stats.pose.textContent = out.face ? `${Math.round(out.pose.pitch)}° ${Math.round(out.pose.yaw)}° ${Math.round(out.pose.roll)}°` : "–";
    this.stats.blinks.textContent = String(out.blinkRate);
    this.stats.perclos.textContent = pct(out.perclos);
    this.stats.pspi.textContent = out.pspi.toFixed(1);
    this.stats.fps.textContent = fps.toFixed(0);
    this.stats.base.textContent = out.calibrated ? "calibrated" : "learning";

    // Why tab (re-rendered at most 4×/s to keep it readable)
    const now = performance.now();
    if (!$("#tab-why").hidden && now - this.lastWhyRender > 250) {
      this.lastWhyRender = now;
      this.renderWhy(out);
    }

    // Log
    this.timeline.push({ t: now, id: out.face ? out.primary.id : "" });
    while (this.timeline.length && now - this.timeline[0].t > 60000) this.timeline.shift();
    if (!$("#tab-log").hidden) this.drawTimeline(now);
    if (out.face && out.primary.id !== this.lastPrimary && out.primary.id !== "neutral") this.announce(meta.name);
    this.lastPrimary = out.primary.id;
  }

  private announce(name: string): void {
    const r = $("#readout");
    r.setAttribute("aria-label", `Expression: ${name}`);
  }

  addEvents(events: EngineEvent[]): void {
    let changed = false;
    for (const ev of events) {
      if (ev.type === "blink") continue;
      const time = this.clock(performance.now());
      if (ev.type === "micro") {
        const m = this.exprMeta(ev.id);
        this.events.unshift({ t: ev.t, html: `<time>${time}</time><span>${m.emoji} Brief ${m.name.toLowerCase()}</span><small>${Math.round(ev.durationMs)} ms · peak ${pct(ev.peak)}</small>` });
      } else if (ev.type === "yawn") {
        this.events.unshift({ t: ev.t, html: `<time>${time}</time><span>🥱 Yawn</span><small>${(ev.durationMs / 1000).toFixed(1)} s</small>` });
      }
      changed = true;
    }
    if (changed) {
      this.events.length = Math.min(this.events.length, 60);
      this.renderEvents();
    }
  }

  private clock(now: number): string {
    const s = Math.floor((now - this.sessionStart) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  private renderEvents(): void {
    const list = $("#events");
    if (!this.events.length) {
      list.replaceChildren(el("li", "empty", "Nothing yet. Brief expressions and yawns will appear here."));
      return;
    }
    list.innerHTML = this.events.map((e) => `<li>${e.html}</li>`).join("");
  }

  private drawTimeline(now: number): void {
    const c = document.getElementById("timeline") as HTMLCanvasElement | null;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < this.timeline.length - 1; i++) {
      const a = this.timeline[i];
      const b = this.timeline[i + 1];
      if (!a.id) continue;
      const x0 = w - ((now - a.t) / 60000) * w;
      const x1 = w - ((now - b.t) / 60000) * w;
      ctx.fillStyle = PRIMARY_COLORS[a.id] ?? "#556";
      const tall = a.id === "neutral" ? 0.3 : 1;
      ctx.fillRect(x0, h * (1 - tall), Math.max(1, x1 - x0 + 0.5), h * tall);
    }
  }

  // ---------------------------------------------------------------- why
  private renderWhy(out: FrameResult): void {
    const host = $("#tab-why");
    const auto = out.primary.id !== "neutral" ? out.primary.id : out.complex[0]?.id ?? "neutral";
    const id = this.whySelected === "auto" ? auto : this.whySelected;
    const meta = this.exprMeta(id);

    const pick = el("div", "why-pick");
    const choices = ["auto", ...new Set([out.primary.id, ...out.complex.map((c) => c.id)].filter((x) => x !== "neutral"))];
    if (this.whySelected !== "auto" && !choices.includes(this.whySelected)) choices.push(this.whySelected);
    for (const c of choices) {
      const b = el("button", undefined, c === "auto" ? "Follow live" : `${this.exprMeta(c).emoji} ${this.exprMeta(c).name}`);
      b.setAttribute("type", "button");
      b.setAttribute("aria-pressed", String(this.whySelected === c));
      b.addEventListener("click", () => { this.whySelected = c; this.lastWhyRender = 0; this.renderWhy(out); });
      pick.append(b);
    }

    const head = el("div", "why-head");
    const txt = el("div");
    txt.append(el("h3", undefined, `${meta.name}${id !== "neutral" ? ` · ${pct(out.scores[id] ?? 0)}` : ""}`), el("p", undefined, meta.gloss));
    head.append(el("span", "emoji", meta.emoji), txt);
    const parts: HTMLElement[] = [pick, head];

    if (id === "neutral") {
      parts.push(el("div", "why-cues", "No configuration of facial actions stands out from your baseline. Muscle actions that are active are listed on the Face tab."));
      host.replaceChildren(...parts);
      return;
    }
    const e = this.engine.cm.byId.get(id)!;
    parts.push(el("div", "group-title", this.model.tiers[e.tier]));
    parts.push(el("div", "why-cues", e.cues));
    const { variant, slots } = this.engine.explain(id);
    if (variant) parts.push(el("div", "fine", `Best-matching configuration: ${variant}`));
    const section = (title: string, kind: SlotExplanation["kind"], mark: string) => {
      const list = slots.filter((s) => s.kind === kind);
      if (!list.length) return;
      parts.push(el("div", "group-title", title));
      for (const s of list) {
        const row = el("div", `slot ${kind}`);
        const lab = this.featureLabel(s.best);
        const name = el("span", undefined, `${lab.code.startsWith("AU") ? lab.code + " " : ""}${lab.name}`);
        if (s.features.length > 1) name.append(el("small", undefined, `any of ${s.features.map((f) => this.featureLabel(f).code).join(", ")}`));
        const bar = el("span");
        bar.style.width = pct(s.evidence);
        const barWrap = el("span", "bar");
        barWrap.append(bar);
        row.append(el("span", "k", s.evidence >= 0.5 ? mark : "·"), name, barWrap, el("span", "v", pct(s.value)));
        parts.push(row);
      }
    };
    section("Defining actions", "core", "✓");
    section("Supporting actions", "support", "+");
    section("Actions that argue against it", "inhibit", "✗");
    parts.push(el("div", "group-title", "Research"));
    const refs = el("ol", "refs");
    for (const r of e.refs) refs.append(el("li", undefined, this.model.references[r]));
    parts.push(refs);
    host.replaceChildren(...parts);
  }

  resetSession(): void {
    this.sessionStart = performance.now();
    this.events.length = 0;
    this.timeline.length = 0;
    this.renderEvents();
  }
}
