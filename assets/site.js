/* =====================================================================
   Haoxuan Sun: site behaviour
   - Detector: toy H → ZZ* → 4ℓ event display (hero canvas)
   - Spectrum: m4ℓ histogram built by scroll (pinned section)
   - Path:     education trajectory drawn by scroll
   - Palette:  ⌘K navigation dialog
   No dependencies. Everything degrades to a readable static page.
   ===================================================================== */

(() => {
    "use strict";

    window.__siteReady = true;

    const root = document.documentElement;
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
    const TAU = Math.PI * 2;
    const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => reduceMQ.matches;

    /* ---------------------------------------------------------------
       Colours: canvases read the same tokens as the CSS
       --------------------------------------------------------------- */

    const hexRGB = (value) => {
        let h = value.replace("#", "").trim();
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
    };

    const readPalette = () => {
        const cs = getComputedStyle(root);
        const get = (name) => hexRGB(cs.getPropertyValue(name));
        return {
            bg: get("--bg"),
            ink: get("--ink"),
            muted: get("--muted"),
            signal: get("--signal"),
            signal2: get("--signal-2"),
            e: get("--electron"),
            mu: get("--muon")
        };
    };

    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
    let PAL = readPalette();
    const themeHooks = [];

    /* ---------------------------------------------------------------
       Colour mode
       --------------------------------------------------------------- */

    const modeButtons = $$(".mode button");
    const themeMeta = $('meta[name="theme-color"]');

    function setTheme(mode, persist) {
        root.dataset.theme = mode;
        modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
        if (themeMeta) themeMeta.content = mode === "paper" ? "#f3f1ea" : "#07080b";
        if (persist) {
            try {
                localStorage.setItem("theme", mode);
            } catch (e) {
                /* storage unavailable */
            }
        }
        PAL = readPalette();
        themeHooks.forEach((fn) => fn());
    }

    setTheme(root.dataset.theme === "paper" ? "paper" : "display", false);
    modeButtons.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.mode, true)));

    /* ---------------------------------------------------------------
       Toast + clipboard
       --------------------------------------------------------------- */

    const toastEl = $("#toast");
    let toastTimer;

    function toast(message) {
        toastEl.textContent = message;
        toastEl.classList.add("is-on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 2000);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;top:0;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try {
                ok = document.execCommand("copy");
            } catch (err) {
                ok = false;
            }
            ta.remove();
            return ok;
        }
    }

    /* ===============================================================
       DETECTOR: toy event display in the transverse plane
       =============================================================== */

    const Detector = (() => {
        const wrap = $("#eventDisplay");
        const canvas = $("#detector");
        if (!wrap || !canvas || !canvas.getContext) return null;

        const ctx = canvas.getContext("2d");
        const tip = $("#detTip");
        const tipTitle = tip ? tip.querySelector("b") : null;
        const tipBody = tip ? tip.querySelector("span") : null;
        const ro = {
            evt: $("#roEvt"),
            chan: $("#roChan"),
            mass: $("#roMass"),
            pt: $("#roPt"),
            trk: $("#roTrk"),
            pause: $("#roPause"),
            next: $("#roNext")
        };

        /* geometry in units of the outer radius (compressed, not to scale) */
        const G = {
            beam: 0.012,
            pix: [0.025, 0.04, 0.055, 0.07],
            sct: [0.1, 0.13, 0.16, 0.19],
            trt: [0.21, 0.29],
            sol: 0.305,
            em: [0.33, 0.35, 0.4, 0.43],
            had: [0.45, 0.52, 0.6, 0.64],
            mu: [0.7, 0.82, 0.95],
            coil: [0.66, 0.985],
            cells: 64
        };

        const ZONES = [
            [0, 0.017, "Beam pipe"],
            [0.017, 0.085, "Pixel detector"],
            [0.085, 0.2, "Silicon strip tracker"],
            [0.2, 0.297, "Transition radiation tracker"],
            [0.297, 0.315, "Solenoid magnet · 2 T"],
            [0.315, 0.44, "LAr electromagnetic calorimeter"],
            [0.44, 0.65, "Tile hadronic calorimeter"],
            [0.65, 0.76, "Muon spectrometer · inner"],
            [0.76, 0.885, "Muon spectrometer · middle"],
            [0.885, 1.0, "Muon spectrometer · outer"]
        ];

        /* display radius → approximate real radius in metres */
        const RMAP = [
            [0, 0], [0.012, 0.03], [0.025, 0.033], [0.07, 0.122], [0.1, 0.3], [0.19, 0.51],
            [0.21, 0.56], [0.29, 1.08], [0.305, 1.2], [0.33, 1.5], [0.43, 2.0], [0.45, 2.28],
            [0.64, 4.25], [0.7, 5.0], [0.82, 7.5], [0.95, 10.0], [1.0, 11.0]
        ];

        const toMetres = (r) => {
            for (let i = 1; i < RMAP.length; i++) {
                if (r <= RMAP[i][0]) {
                    const [r0, m0] = RMAP[i - 1];
                    const [r1, m1] = RMAP[i];
                    return m0 + ((m1 - m0) * (r - r0)) / (r1 - r0);
                }
            }
            return 11;
        };

        const SPEED = 1.25; /* outer radii per second */
        const SETTLE = 2.4; /* after this, nothing moves until the fade */
        const HOLD = 6.2;
        const FADE = 0.55;

        let dpr = 1;
        let px = 0;
        let R = 0;
        let C = 0;
        let layer = null;
        let ev = null;
        let t0 = 0;
        let raf = 0;
        let onScreen = true;
        let paused = false;
        let pausedAt = 0;
        let count = 0;
        let hover = null;
        let dirty = true;
        let readoutDone = false;

        const now = () => performance.now();
        const elapsed = () => (ev ? ((paused ? pausedAt : now()) - t0) / 1000 : 0);

        /* ---------- toy kinematics ---------- */

        const rnd = (a, b) => a + Math.random() * (b - a);
        const gauss = () => {
            let u = 0;
            let v = 0;
            while (!u) u = Math.random();
            while (!v) v = Math.random();
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        };
        const KB = 0.35; /* curvature radius per GeV of pT, in display units */
        const STEP = 0.005;

        /* helix in the solenoid (an arc through the origin), then a straight line */
        function trackPath(phi0, q, pT, rArc, rEnd) {
            const rc = KB * pT;
            const looper = 2 * rc < rArc;
            const sMax = looper ? 1.75 * Math.PI * rc : 2 * rc * Math.asin(Math.min(1, rArc / (2 * rc)));
            const pts = [0, 0];
            let x = 0;
            let y = 0;
            const n = Math.max(2, Math.ceil(sMax / STEP));

            for (let i = 1; i <= n; i++) {
                const s = (sMax * i) / n;
                const a = phi0 + (q * s) / rc;
                x = q * rc * (Math.sin(a) - Math.sin(phi0));
                y = -q * rc * (Math.cos(a) - Math.cos(phi0));
                pts.push(x, y);
            }

            if (!looper && rEnd > rArc + 1e-6) {
                const dir = phi0 + (q * sMax) / rc;
                const dx = Math.cos(dir);
                const dy = Math.sin(dir);
                const b = x * dx + y * dy;
                const c = x * x + y * y - rEnd * rEnd;
                const tEnd = -b + Math.sqrt(Math.max(0, b * b - c));
                const m = Math.max(1, Math.ceil(tEnd / (STEP * 3)));
                for (let i = 1; i <= m; i++) {
                    const t = (tEnd * i) / m;
                    pts.push(x + dx * t, y + dy * t);
                }
            }

            const P = new Float32Array(pts);
            const N = P.length / 2;
            const len = new Float32Array(N);
            for (let i = 1; i < N; i++) {
                len[i] = len[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
            }
            return { P, len, total: len[N - 1] };
        }

        function atRadius(track, r) {
            const { P, len } = track;
            for (let i = 0; i < len.length; i++) {
                if (Math.hypot(P[2 * i], P[2 * i + 1]) >= r) return { s: len[i], x: P[2 * i], y: P[2 * i + 1] };
            }
            return null;
        }

        const norm = (phi) => ((phi % TAU) + TAU) % TAU;
        const cellOf = (phi) => Math.floor((norm(phi) / TAU) * G.cells) % G.cells;
        const sign = (q) => (q > 0 ? "⁺" : "⁻");

        function makeEvent() {
            const tracks = [];
            const cells = [];
            const hits = [];
            const labels = [];

            /* pile-up and underlying event: soft, curly, grey */
            const nPU = Math.round(rnd(24, 44));
            for (let i = 0; i < nPU; i++) {
                const pT = 0.2 - Math.log(1 - Math.random()) * 0.7;
                tracks.push({ kind: "pu", ...trackPath(rnd(0, TAU), Math.random() < 0.5 ? 1 : -1, pT, G.trt[1], G.trt[1]) });
            }

            /* zero to two jets */
            const nJets = Math.random() < 0.6 ? (Math.random() < 0.6 ? 1 : 2) : 0;
            for (let j = 0; j < nJets; j++) {
                const phiJ = rnd(0, TAU);
                const E = rnd(0.45, 1);
                const nT = Math.round(rnd(5, 11));
                for (let k = 0; k < nT; k++) {
                    const pT = 0.9 - Math.log(1 - Math.random()) * 3.5;
                    tracks.push({ kind: "jet", ...trackPath(phiJ + gauss() * 0.08, Math.random() < 0.5 ? 1 : -1, pT, G.sol, G.had[0]) });
                }
                const c0 = cellOf(phiJ);
                for (let d = -3; d <= 3; d++) {
                    const f = Math.exp(-(d * d) / 2.2) * E;
                    const c = (c0 + d + G.cells) % G.cells;
                    cells.push({ cal: "had", cell: c, depth: 0, e: f * 0.9, kind: "jet", tA: 0.42 });
                    cells.push({ cal: "had", cell: c, depth: 1, e: f * 0.65, kind: "jet", tA: 0.46 });
                    cells.push({ cal: "had", cell: c, depth: 2, e: f * 0.3, kind: "jet", tA: 0.5 });
                    if (Math.abs(d) <= 1) cells.push({ cal: "em", cell: c, depth: 1, e: f * 0.35, kind: "jet", tA: 0.36 });
                }
            }

            /* four leptons from H → ZZ* */
            const u = Math.random();
            const chan = u < 0.5 ? "2e2μ" : u < 0.75 ? "4μ" : "4e";
            const flav = chan === "4μ" ? ["mu", "mu", "mu", "mu"] : chan === "4e" ? ["e", "e", "e", "e"] : ["e", "e", "mu", "mu"];
            const phiZ1 = rnd(0, TAU);
            const phiZ2 = phiZ1 + Math.PI + gauss() * 0.6;
            const o1 = rnd(0.5, 2.3);
            const o2 = rnd(0.6, 2.6);
            const phis = [phiZ1 - o1 / 2, phiZ1 + o1 / 2, phiZ2 - o2 / 2, phiZ2 + o2 / 2];
            const pTs = [rnd(30, 58), rnd(20, 36), rnd(11, 25), rnd(7, 16)];
            for (let i = pTs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pTs[i], pTs[j]] = [pTs[j], pTs[i]];
            }
            const charges = [1, -1, 1, -1];

            for (let i = 0; i < 4; i++) {
                const kind = flav[i];
                const q = charges[i];
                const pT = pTs[i];
                const isE = kind === "e";
                const t = { kind, ...trackPath(phis[i], q, pT, G.sol, isE ? G.em[0] : 1.0) };
                tracks.push(t);

                if (isE) {
                    const ex = t.P[t.P.length - 2];
                    const ey = t.P[t.P.length - 1];
                    const c0 = cellOf(Math.atan2(ey, ex));
                    const tA = t.total / SPEED;
                    const e = clamp(pT / 45, 0.45, 1);
                    for (let d = -1; d <= 1; d++) {
                        const c = (c0 + d + G.cells) % G.cells;
                        const w = d === 0 ? 1 : 0.32;
                        cells.push({ cal: "em", cell: c, depth: 0, e: e * w * 0.55, kind: "e", tA });
                        cells.push({ cal: "em", cell: c, depth: 1, e: e * w, kind: "e", tA: tA + 0.03 });
                        cells.push({ cal: "em", cell: c, depth: 2, e: e * w * 0.25, kind: "e", tA: tA + 0.06 });
                    }
                    labels.push({ phi: Math.atan2(ey, ex), r: 0.47, kind: "e", text: `e${sign(q)} ${pT.toFixed(1)} GeV`, tA: tA + 0.3 });
                } else {
                    for (const [cal, depth, rr] of [["em", 1, 0.375], ["had", 0, 0.485], ["had", 1, 0.56], ["had", 2, 0.62]]) {
                        const h = atRadius(t, rr);
                        if (h) cells.push({ cal, cell: cellOf(Math.atan2(h.y, h.x)), depth, e: 0.24, kind: "mu", tA: h.s / SPEED });
                    }
                    G.mu.forEach((rs, station) => {
                        const probe = atRadius(t, rs);
                        if (!probe) return;
                        const sector = Math.round(norm(Math.atan2(probe.y, probe.x)) / (TAU / 16)) % 16;
                        const rChamber = rs + (sector % 2 ? 0.018 : 0);
                        const h = atRadius(t, rChamber) || probe;
                        hits.push({ x: h.x, y: h.y, station, sector, tA: h.s / SPEED });
                    });
                    const h = atRadius(t, 0.665);
                    if (h) labels.push({ phi: Math.atan2(h.y, h.x), r: 0.675, kind: "mu", text: `μ${sign(q)} ${pT.toFixed(1)} GeV`, tA: h.s / SPEED + 0.2 });
                }
            }

            return {
                tracks,
                cells,
                hits,
                labels,
                chan,
                mass: clamp(125.1 + gauss() * 1.6, 120.5, 129.5),
                leptonPts: pTs.slice().sort((a, b) => b - a),
                nTracks: tracks.length
            };
        }

        /* ---------- drawing helpers ---------- */

        const lw = () => Math.max(1, dpr);
        const sx = (x) => C + x * R;
        const sy = (y) => C - y * R;

        function rbox(g, phi, rMid, halfRad, halfTan, stroke, fill, width) {
            g.save();
            g.translate(C, C);
            g.rotate(-phi);
            g.beginPath();
            g.rect((rMid - halfRad) * R, -halfTan * R, 2 * halfRad * R, 2 * halfTan * R);
            if (fill) {
                g.fillStyle = fill;
                g.fill();
            }
            if (stroke) {
                g.strokeStyle = stroke;
                g.lineWidth = width || lw();
                g.stroke();
            }
            g.restore();
        }

        const chamberHalf = (station, sector) => {
            const small = sector % 2 === 1;
            const rs = G.mu[station] + (small ? 0.018 : 0);
            return { rs, half: rs * Math.tan(Math.PI / 16) * (small ? 0.62 : 0.9) };
        };

        function buildLayer() {
            layer = document.createElement("canvas");
            layer.width = layer.height = px;
            const g = layer.getContext("2d");
            const ink = PAL.ink;

            const ring = (r, a, w) => {
                g.beginPath();
                g.arc(C, C, r * R, 0, TAU);
                g.strokeStyle = rgba(ink, a);
                g.lineWidth = w || lw();
                g.stroke();
            };
            const annulus = (r0, r1, a) => {
                g.beginPath();
                g.arc(C, C, r1 * R, 0, TAU);
                g.arc(C, C, r0 * R, 0, TAU, true);
                g.fillStyle = rgba(ink, a);
                g.fill();
            };
            const spokes = (r0, r1, n, a) => {
                g.beginPath();
                for (let i = 0; i < n; i++) {
                    const t = (i / n) * TAU;
                    g.moveTo(C + Math.cos(t) * r0 * R, C + Math.sin(t) * r0 * R);
                    g.lineTo(C + Math.cos(t) * r1 * R, C + Math.sin(t) * r1 * R);
                }
                g.strokeStyle = rgba(ink, a);
                g.lineWidth = lw() * 0.75;
                g.stroke();
            };

            /* reference axes and φ scale */
            g.save();
            g.setLineDash([2 * dpr, 6 * dpr]);
            g.beginPath();
            g.moveTo(C - 1.05 * R, C);
            g.lineTo(C + 1.05 * R, C);
            g.moveTo(C, C - 1.05 * R);
            g.lineTo(C, C + 1.05 * R);
            g.strokeStyle = rgba(ink, 0.08);
            g.lineWidth = lw();
            g.stroke();
            g.restore();

            for (let d = 0; d < 360; d += 5) {
                const t = (d * Math.PI) / 180;
                const major = d % 45 === 0;
                const r1 = major ? 1.035 : 1.017;
                g.beginPath();
                g.moveTo(sx(Math.cos(t)), sy(Math.sin(t)));
                g.lineTo(sx(Math.cos(t) * r1), sy(Math.sin(t) * r1));
                g.strokeStyle = rgba(ink, major ? 0.38 : 0.14);
                g.lineWidth = lw();
                g.stroke();
            }

            g.font = `${10 * dpr}px ${MONO}`;
            g.fillStyle = rgba(ink, 0.42);
            g.textAlign = "center";
            g.textBaseline = "middle";
            [[0, "φ 0"], [90, "π/2"], [180, "π"], [270, "3π/2"]].forEach(([d, label]) => {
                const t = (d * Math.PI) / 180;
                g.fillText(label, sx(Math.cos(t) * 1.08), sy(Math.sin(t) * 1.08));
            });
            ring(1.0, 0.1);

            /* inner detector */
            ring(G.beam, 0.55);
            G.pix.forEach((r) => ring(r, 0.34));
            G.sct.forEach((r) => ring(r, 0.25));
            annulus(G.trt[0], G.trt[1], 0.035);
            for (let i = 0; i <= 7; i++) ring(G.trt[0] + ((G.trt[1] - G.trt[0]) * i) / 7, 0.07);
            ring(G.sol, 0.45, 2.4 * lw());

            /* LAr EM calorimeter */
            annulus(G.em[0], G.em[3], 0.03);
            ring(G.em[0], 0.34);
            ring(G.em[3], 0.34);
            ring(G.em[1], 0.12);
            ring(G.em[2], 0.12);
            spokes(G.em[0], G.em[3], G.cells, 0.1);

            /* Tile hadronic calorimeter */
            annulus(G.had[0], G.had[3], 0.022);
            ring(G.had[0], 0.3);
            ring(G.had[3], 0.3);
            ring(G.had[1], 0.1);
            ring(G.had[2], 0.1);
            spokes(G.had[0], G.had[3], G.cells, 0.08);

            /* barrel toroid coils, eight of them, in the small sectors */
            for (let k = 0; k < 8; k++) {
                rbox(g, ((k + 0.5) * TAU) / 8, (G.coil[0] + G.coil[1]) / 2, (G.coil[1] - G.coil[0]) / 2, 0.007, rgba(ink, 0.2), rgba(ink, 0.035));
            }

            /* muon chambers: three stations, sixteen sectors */
            for (let s = 0; s < 3; s++) {
                for (let k = 0; k < 16; k++) {
                    const { rs, half } = chamberHalf(s, k);
                    rbox(g, (k * TAU) / 16, rs, 0.011, half, rgba(ink, 0.24), rgba(ink, 0.03));
                }
            }
        }

        function wedge(r0, r1, cell, fill) {
            const a0 = (cell / G.cells) * TAU;
            const a1 = ((cell + 1) / G.cells) * TAU;
            ctx.beginPath();
            ctx.arc(C, C, r1 * R, -a0, -a1, true);
            ctx.arc(C, C, r0 * R, -a1, -a0, false);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
        }

        function drawTrack(tr, L) {
            const { P, len } = tr;
            const N = len.length;
            const lim = Math.min(L, tr.total);
            if (lim <= 0) return;

            ctx.beginPath();
            ctx.moveTo(C, C);
            let i = 1;
            for (; i < N && len[i] <= lim; i++) ctx.lineTo(sx(P[2 * i]), sy(P[2 * i + 1]));
            if (i < N) {
                const f = (lim - len[i - 1]) / (len[i] - len[i - 1] || 1);
                ctx.lineTo(sx(P[2 * i - 2] + (P[2 * i] - P[2 * i - 2]) * f), sy(P[2 * i - 1] + (P[2 * i + 1] - P[2 * i - 1]) * f));
            }

            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            if (tr.kind === "pu") {
                ctx.strokeStyle = rgba(PAL.ink, 0.26);
                ctx.lineWidth = lw();
                ctx.stroke();
            } else if (tr.kind === "jet") {
                ctx.strokeStyle = rgba(PAL.ink, 0.52);
                ctx.lineWidth = 1.15 * dpr;
                ctx.stroke();
            } else {
                const col = tr.kind === "e" ? PAL.e : PAL.mu;
                ctx.strokeStyle = rgba(col, 0.2);
                ctx.lineWidth = 7 * dpr;
                ctx.stroke();
                ctx.strokeStyle = rgba(col, 1);
                ctx.lineWidth = 2.1 * dpr;
                ctx.stroke();
            }
        }

        function render(t) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, px, px);
            if (!layer) return;

            if (hover) {
                ctx.beginPath();
                ctx.arc(C, C, hover[1] * R, 0, TAU);
                ctx.arc(C, C, hover[0] * R, 0, TAU, true);
                ctx.fillStyle = rgba(PAL.ink, 0.09);
                ctx.fill();
            }

            ctx.drawImage(layer, 0, 0);
            if (!ev) return;

            const fade = t > HOLD ? clamp(1 - (t - HOLD) / FADE) : 1;
            ctx.globalAlpha = fade;

            /* collision flash */
            if (t < 0.45) {
                const k = t / 0.45;
                ctx.beginPath();
                ctx.arc(C, C, (0.01 + 0.09 * k) * R, 0, TAU);
                ctx.fillStyle = rgba(PAL.signal, 0.55 * (1 - k));
                ctx.fill();
            }

            /* calorimeter energy */
            for (const c of ev.cells) {
                const a = clamp((t - c.tA) / 0.3);
                if (a <= 0) continue;
                const col = c.kind === "e" ? PAL.e : c.kind === "mu" ? PAL.mu : PAL.ink;
                const radii = c.cal === "em" ? G.em : G.had;
                const alpha = (c.kind === "jet" ? 0.46 : 0.85) * c.e * a;
                wedge(radii[c.depth], radii[c.depth + 1], c.cell, rgba(col, alpha));
            }

            /* tracks */
            const L = Math.max(0, (t - 0.06) * SPEED);
            for (const tr of ev.tracks) drawTrack(tr, L);

            /* muon chambers that fired */
            for (const h of ev.hits) {
                const a = clamp((t - h.tA) / 0.2);
                if (a <= 0) continue;
                const { rs, half } = chamberHalf(h.station, h.sector);
                rbox(ctx, (h.sector * TAU) / 16, rs, 0.011, half, rgba(PAL.mu, 0.9 * a), rgba(PAL.mu, 0.14 * a), 1.4 * dpr);
                const s = 3.2 * dpr;
                ctx.fillStyle = rgba(PAL.mu, a);
                ctx.fillRect(sx(h.x) - s, sy(h.y) - s, 2 * s, 2 * s);
            }

            /* lepton labels */
            ctx.font = `500 ${11 * dpr}px ${MONO}`;
            ctx.textBaseline = "middle";
            for (const lb of ev.labels) {
                const a = clamp((t - lb.tA) / 0.35);
                if (a <= 0) continue;
                const x = sx(Math.cos(lb.phi) * lb.r);
                const y = sy(Math.sin(lb.phi) * lb.r);
                ctx.textAlign = Math.cos(lb.phi) >= 0 ? "left" : "right";
                ctx.globalAlpha = fade * a;
                ctx.lineWidth = 4 * dpr;
                ctx.strokeStyle = rgba(PAL.bg, 0.9);
                ctx.strokeText(lb.text, x, y);
                ctx.fillStyle = rgba(lb.kind === "e" ? PAL.e : PAL.mu, 1);
                ctx.fillText(lb.text, x, y);
            }
            ctx.globalAlpha = 1;

            /* interaction point */
            ctx.beginPath();
            ctx.arc(C, C, 2.4 * dpr, 0, TAU);
            ctx.fillStyle = rgba(PAL.signal, 1);
            ctx.fill();
        }

        /* ---------- readout ---------- */

        const readoutFields = () => [ro.chan, ro.mass, ro.pt, ro.trk].map((el) => el && el.closest("dd"));

        function readoutPending() {
            readoutDone = false;
            if (ro.evt) ro.evt.textContent = String(count).padStart(4, "0");
            readoutFields().forEach((dd) => dd && dd.classList.add("is-pending"));
        }

        function readoutFill() {
            readoutDone = true;
            if (!ev) return;
            if (ro.chan) ro.chan.textContent = `H → ZZ* → ${ev.chan}`;
            if (ro.mass) ro.mass.textContent = ev.mass.toFixed(1);
            if (ro.pt) ro.pt.textContent = ev.leptonPts.map((v) => v.toFixed(0)).join(" · ") + " GeV";
            if (ro.trk) ro.trk.textContent = String(ev.nTracks);
            readoutFields().forEach((dd) => dd && dd.classList.remove("is-pending"));
        }

        /* ---------- loop ---------- */

        function startEvent(showComplete) {
            ev = makeEvent();
            count += 1;
            if (showComplete) {
                t0 = now() - SETTLE * 1000;
                pausedAt = now();
                render(elapsed());
                if (ro.evt) ro.evt.textContent = String(count).padStart(4, "0");
                readoutFill();
            } else {
                t0 = now();
                if (paused) pausedAt = t0;
                readoutPending();
            }
            dirty = true;
        }

        function tick() {
            raf = 0;
            if (!onScreen || document.hidden || reduced()) return;

            let t = elapsed();
            if (!paused && t > HOLD + FADE) {
                startEvent(false);
                t = 0;
            }
            if (!readoutDone && t > 0.9) readoutFill();

            const moving = !paused && (t < SETTLE || t > HOLD);
            if (moving || dirty) {
                render(t);
                dirty = false;
            }
            raf = requestAnimationFrame(tick);
        }

        function start() {
            if (!raf && onScreen && !document.hidden && !reduced()) raf = requestAnimationFrame(tick);
        }

        function stop() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }

        function newEvent() {
            const still = reduced() || paused;
            startEvent(still);
            if (!still) start();
        }

        function redraw() {
            dirty = true;
            if (!raf) render(elapsed());
        }

        function resize() {
            const w = wrap.clientWidth;
            if (!w) return;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            px = Math.round(w * dpr);
            canvas.width = canvas.height = px;
            C = px / 2;
            R = px * 0.46;
            buildLayer();
            redraw();
        }

        function setPaused(value) {
            if (value === paused) return;
            paused = value;
            if (paused) {
                pausedAt = now();
            } else {
                t0 += now() - pausedAt;
                start();
            }
            if (ro.pause) {
                ro.pause.setAttribute("aria-pressed", String(paused));
                ro.pause.textContent = paused ? "Resume" : "Pause";
            }
        }

        /* ---------- hover readout (mouse only) ---------- */

        function hideTip() {
            if (tip) tip.hidden = true;
            if (hover) {
                hover = null;
                redraw();
            }
        }

        canvas.addEventListener("pointermove", (e) => {
            if (e.pointerType !== "mouse" || !tip) return;
            const rect = canvas.getBoundingClientRect();
            const scale = px / rect.width;
            const x = (e.clientX - rect.left) * scale - C;
            const y = C - (e.clientY - rect.top) * scale;
            const r = Math.hypot(x, y) / R;
            const zone = ZONES.find((z) => r >= z[0] && r < z[1]);
            if (!zone) {
                hideTip();
                return;
            }
            let phi = Math.atan2(y, x);
            if (phi < 0) phi += TAU;
            tipTitle.textContent = zone[2];
            tipBody.textContent = `r ≈ ${toMetres(r).toFixed(2)} m · φ = ${phi.toFixed(2)} rad`;
            tip.hidden = false;

            const wrect = wrap.getBoundingClientRect();
            let lx = e.clientX - wrect.left + 16;
            const ly = e.clientY - wrect.top + 18;
            if (e.clientX + 16 + tip.offsetWidth > window.innerWidth - 8) lx = e.clientX - wrect.left - tip.offsetWidth - 12;
            tip.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;

            if (hover !== zone) {
                hover = zone;
                redraw();
            }
        });

        canvas.addEventListener("pointerleave", hideTip);
        canvas.addEventListener("click", newEvent);
        if (ro.next) ro.next.addEventListener("click", newEvent);
        if (ro.pause) ro.pause.addEventListener("click", () => setPaused(!paused));

        /* ---------- lifecycle ---------- */

        if ("IntersectionObserver" in window) {
            new IntersectionObserver((entries) => {
                onScreen = entries[entries.length - 1].isIntersecting;
                if (onScreen) start();
                else stop();
            }).observe(wrap);
        }

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) stop();
            else start();
        });

        const applyMotionPreference = () => {
            if (ro.pause) ro.pause.hidden = reduced();
            if (reduced()) {
                stop();
                if (ev) {
                    t0 = now() - SETTLE * 1000;
                    pausedAt = now();
                    readoutFill();
                    redraw();
                }
            } else {
                start();
            }
        };

        if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", applyMotionPreference);

        if ("ResizeObserver" in window) new ResizeObserver(resize).observe(wrap);
        else window.addEventListener("resize", resize);

        resize();
        startEvent(reduced());
        applyMotionPreference();

        return {
            newEvent,
            onTheme() {
                if (!px) return;
                buildLayer();
                redraw();
            }
        };
    })();

    if (Detector) themeHooks.push(Detector.onTheme);

    /* ===============================================================
       SPECTRUM: m4ℓ histogram, scrubbed by scroll
       =============================================================== */

    const Spectrum = (() => {
        const pin = $("#pin");
        const canvas = $("#spectrum");
        if (!pin || !canvas || !canvas.getContext) return null;

        const box = canvas.parentElement;
        const ctx = canvas.getContext("2d");
        const steps = $$(".step", pin);
        const gotos = $$("[data-goto]", pin);
        const bar = $("#pinBar");
        const legend = $$(".plot-legend li", pin);

        const M0 = 68.75; /* bin edges chosen so 125 GeV sits at a bin centre */
        const M1 = 201.25;
        const BW = 2.5;
        const NB = Math.round((M1 - M0) / BW);
        const YMAX = 27;
        const TARGETS = [0.2, 0.45, 0.7, 0.96];

        /* deterministic pseudo-data: the same "toy" every visit */
        let seed = 20260924;
        const rand = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const poisson = (lambda) => {
            const L = Math.exp(-lambda);
            let k = 0;
            let p = 1;
            do {
                k += 1;
                p *= rand();
            } while (p > L);
            return k - 1;
        };
        const gau = (m, mu, s) => Math.exp(-0.5 * ((m - mu) / s) ** 2);
        const sigm = (x) => 1 / (1 + Math.exp(-x));

        const bins = [];
        for (let i = 0; i < NB; i++) {
            const m = M0 + (i + 0.5) * BW;
            bins.push({
                m,
                zz: 17 * gau(m, 91.2, 2.3) + 1.1 + 0.9 * sigm((m - 108) / 7) + 12.5 * sigm((m - 181) / 2.4) * Math.exp(-Math.max(0, m - 189) / 45),
                red: 2.4 * Math.exp(-(m - 68.75) / 55) + 0.45,
                h: 14.5 * gau(m, 125, 2.0),
                lag: rand()
            });
        }
        bins.forEach((b) => {
            b.data = poisson(b.zz + b.red * 0.45 + b.h);
        });

        /* H → 4ℓ final states, for the decay-level split */
        const SPLIT = [
            ["mu", 0.31],
            ["signal", 0.23],
            ["signal2", 0.22],
            ["e", 0.24]
        ];

        let W = 0;
        let H = 0;
        let dpr = 1;
        let p = 0;
        let lastP = -1;
        let stepIdx = -1;

        function draw() {
            if (!W || !H) return;
            const P = PAL;
            const narrow = W / dpr < 520;
            const fs = (narrow ? 9.5 : 11) * dpr;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, W, H);

            const x0 = 46 * dpr;
            const x1 = W - 16 * dpr;
            const y0 = 10 * dpr;
            const y1 = H - 36 * dpr;
            const X = (m) => x0 + ((m - M0) / (M1 - M0)) * (x1 - x0);
            const Y = (v) => y1 - (v / YMAX) * (y1 - y0);

            const s1 = clamp(p / 0.15);
            const s2 = clamp((p - 0.25) / 0.15);
            const s3 = clamp((p - 0.5) / 0.15);
            const s4 = clamp((p - 0.75) / 0.15);
            const redScale = 1 - 0.55 * s2;

            const rect = (xa, v0, v1, w, fill) => {
                if (v1 - v0 <= 0.0005) return;
                ctx.fillStyle = fill;
                ctx.fillRect(xa, Y(v1), w, Y(v0) - Y(v1));
            };

            /* stacked histogram */
            const tops = [];
            for (const b of bins) {
                const fill = clamp(s1 * 1.35 - b.lag * 0.35);
                const xa = X(b.m - BW / 2);
                const w = X(b.m + BW / 2) - xa + 0.6;
                const red = b.red * redScale * fill;
                const zz = b.zz * fill;
                const h = b.h * s3;
                rect(xa, 0, red, w, rgba(P.ink, 0.17));
                rect(xa, red, red + zz, w, rgba(P.ink, 0.38));
                let base = red + zz;
                if (h > 0.001) {
                    if (s4 < 1) rect(xa, base, base + h, w, rgba(P.signal, 0.92 * (1 - s4)));
                    if (s4 > 0) {
                        for (const [key, frac] of SPLIT) {
                            rect(xa, base, base + h * frac, w, rgba(P[key], 0.92 * s4));
                            base += h * frac;
                        }
                    }
                }
                tops.push(red + zz + h);
            }

            /* outline of the stack */
            if (s1 > 0) {
                ctx.beginPath();
                bins.forEach((b, i) => {
                    const xa = X(b.m - BW / 2);
                    const xb = X(b.m + BW / 2);
                    if (i === 0) ctx.moveTo(xa, Y(tops[i]));
                    else ctx.lineTo(xa, Y(tops[i]));
                    ctx.lineTo(xb, Y(tops[i]));
                });
                ctx.strokeStyle = rgba(P.ink, 0.6);
                ctx.lineWidth = dpr;
                ctx.stroke();
            }

            /* step 2: dashed ghost of the background before better electron ID */
            const ghost = s2 * (1 - s3);
            if (ghost > 0) {
                ctx.save();
                ctx.setLineDash([3 * dpr, 3 * dpr]);
                ctx.beginPath();
                bins.forEach((b, i) => {
                    const fill = clamp(s1 * 1.35 - b.lag * 0.35);
                    const v = (b.red + b.zz) * fill;
                    const xa = X(b.m - BW / 2);
                    if (i === 0) ctx.moveTo(xa, Y(v));
                    else ctx.lineTo(xa, Y(v));
                    ctx.lineTo(X(b.m + BW / 2), Y(v));
                });
                ctx.strokeStyle = rgba(P.ink, 0.75 * ghost);
                ctx.lineWidth = dpr;
                ctx.stroke();
                ctx.restore();
            }

            /* SMEFT variation (toy): signal scaled up, dashed */
            if (s4 > 0) {
                ctx.save();
                ctx.setLineDash([5 * dpr, 4 * dpr]);
                ctx.beginPath();
                let started = false;
                bins.forEach((b, i) => {
                    if (b.m < 113 || b.m > 137) return;
                    const v = tops[i] + b.h * 0.38;
                    const xa = X(b.m - BW / 2);
                    const xb = X(b.m + BW / 2);
                    if (!started) {
                        ctx.moveTo(xa, Y(tops[i]));
                        started = true;
                    }
                    ctx.lineTo(xa, Y(v));
                    ctx.lineTo(xb, Y(v));
                });
                ctx.strokeStyle = rgba(P.ink, 0.9 * s4);
                ctx.lineWidth = 1.5 * dpr;
                ctx.stroke();
                ctx.restore();
            }

            /* pseudo-data */
            if (s3 > 0) {
                ctx.fillStyle = rgba(P.ink, s3);
                ctx.strokeStyle = rgba(P.ink, s3);
                ctx.lineWidth = dpr;
                for (const b of bins) {
                    if (!b.data) continue;
                    const x = X(b.m);
                    const err = Math.sqrt(b.data);
                    ctx.beginPath();
                    ctx.moveTo(x, Y(b.data - err));
                    ctx.lineTo(x, Y(Math.min(YMAX, b.data + err)));
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(x, Y(b.data), 2.6 * dpr, 0, TAU);
                    ctx.fill();
                }
            }

            /* frame with inward ticks, HEP style */
            ctx.strokeStyle = rgba(P.ink, 0.7);
            ctx.lineWidth = dpr;
            ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
            ctx.beginPath();
            for (let m = Math.ceil(M0 / 5) * 5; m <= M1; m += 5) {
                const x = X(m);
                const major = m % 10 === 0;
                const len = (major ? 8 : 4) * dpr;
                ctx.moveTo(x, y1);
                ctx.lineTo(x, y1 - len);
                ctx.moveTo(x, y0);
                ctx.lineTo(x, y0 + len);
            }
            for (let v = 0; v <= YMAX; v += 1) {
                const y = Y(v);
                const len = (v % 5 === 0 ? 8 : 4) * dpr;
                ctx.moveTo(x0, y);
                ctx.lineTo(x0 + len, y);
                ctx.moveTo(x1, y);
                ctx.lineTo(x1 - len, y);
            }
            ctx.stroke();

            ctx.font = `${fs}px ${MONO}`;
            ctx.fillStyle = rgba(P.muted, 1);
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            for (let m = 80; m <= M1; m += 20) ctx.fillText(String(m), X(m), y1 + 6 * dpr);
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            for (let v = 0; v <= 25; v += 5) ctx.fillText(String(v), x0 - 6 * dpr, Y(v));

            ctx.fillStyle = rgba(P.ink, 0.9);
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText("m₄ℓ [GeV]", x1, y1 + 21 * dpr);
            ctx.save();
            ctx.translate(12 * dpr, y0);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText("Events / 2.5 GeV", 0, 0);
            ctx.restore();

            /* annotations */
            const note = (text, m, v, alpha, align = "center") => {
                if (alpha <= 0) return;
                ctx.textAlign = align;
                ctx.textBaseline = "bottom";
                ctx.lineWidth = 4 * dpr;
                ctx.strokeStyle = rgba(P.bg, 0.85 * alpha);
                ctx.strokeText(text, X(m), Y(v));
                ctx.fillStyle = rgba(P.ink, alpha);
                ctx.fillText(text, X(m), Y(v));
            };

            note("Z → 4ℓ", 91.2, 21, clamp((s1 - 0.6) / 0.4));
            note("on-shell ZZ →", 176, 12.5, clamp((s1 - 0.8) / 0.2), "right");
            note(narrow ? "┄ before ID" : "┄ before better ID   ─ after", 101, 6.4, ghost, "left");

            if (s3 > 0) {
                ctx.save();
                ctx.setLineDash([2 * dpr, 4 * dpr]);
                ctx.beginPath();
                ctx.moveTo(X(125), y1);
                ctx.lineTo(X(125), Y(23.5));
                ctx.strokeStyle = rgba(P.signal, 0.8 * s3);
                ctx.lineWidth = dpr;
                ctx.stroke();
                ctx.restore();
                note("mH = 125 GeV", 123.2, 24, s3, "right");
            }
            const peak = bins.reduce((a, b) => (Math.abs(b.m - 125) < Math.abs(a.m - 125) ? b : a));
            const peakTop = (peak.red * redScale + peak.zz) * clamp(s1 * 1.35 - peak.lag * 0.35) + peak.h * 1.38;
            note("SMEFT (toy)", 129.5, peakTop - 1.2, s4, "left");

            if (s1 < 0.3) {
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = rgba(P.muted, 1 - s1 / 0.3);
                ctx.fillText("scroll to collect events ↓", (x0 + x1) / 2, (y0 + y1) / 2);
            }
        }

        function setStep(idx) {
            if (idx === stepIdx) return;
            stepIdx = idx;
            steps.forEach((s, i) => s.classList.toggle("is-active", i === idx));
            gotos.forEach((b, i) => {
                if (i === idx) b.setAttribute("aria-current", "step");
                else b.removeAttribute("aria-current");
            });
            legend.forEach((li) => li.classList.toggle("is-on", idx >= Number(li.dataset.from)));
        }

        function update() {
            const rect = pin.getBoundingClientRect();
            const span = pin.offsetHeight - window.innerHeight;
            p = span > 0 ? clamp(-rect.top / span) : 1;
            if (Math.abs(p - lastP) < 0.0004) return;
            lastP = p;
            setStep(Math.min(3, Math.floor(p * 4)));
            if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
            draw();
        }

        function resize() {
            const r = box.getBoundingClientRect();
            if (!r.width) return;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = Math.round(r.width * dpr);
            H = Math.round(r.height * dpr);
            canvas.width = W;
            canvas.height = H;
            draw();
        }

        gotos.forEach((btn) => {
            btn.addEventListener("click", () => {
                const i = Number(btn.dataset.goto);
                const span = pin.offsetHeight - window.innerHeight;
                const top = window.scrollY + pin.getBoundingClientRect().top + span * TARGETS[i];
                window.scrollTo({ top, behavior: reduced() ? "auto" : "smooth" });
            });
        });

        if ("ResizeObserver" in window) new ResizeObserver(resize).observe(box);
        else window.addEventListener("resize", resize);

        resize();
        setStep(0);
        update();

        return { update, draw };
    })();

    if (Spectrum) themeHooks.push(Spectrum.draw);

    /* ===============================================================
       PATH: education trajectory, drawn with scroll
       =============================================================== */

    const Path = (() => {
        const svg = $("#pathSvg");
        const track = svg && $("#pathTrack", svg);
        if (!track || typeof track.getTotalLength !== "function") return null;

        const items = $$(".edu-item");
        const O = { x: 60, y: 540 };
        const L = track.getTotalLength();

        const marks = $$(".hit", svg).map((g) => {
            const r = Number(g.dataset.r);
            let lo = 0;
            let hi = L;
            for (let k = 0; k < 32; k++) {
                const mid = (lo + hi) / 2;
                const pt = track.getPointAtLength(mid);
                if (Math.hypot(pt.x - O.x, pt.y - O.y) < r) lo = mid;
                else hi = mid;
            }
            const pt = track.getPointAtLength(hi);
            g.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
            return { g, len: hi };
        });

        track.style.strokeDasharray = `${L} ${L}`;
        track.style.strokeDashoffset = String(L);
        let last = -1;

        function update() {
            const r = svg.getBoundingClientRect();
            const vh = window.innerHeight;
            const q = clamp((vh * 0.88 - r.top) / (r.height * 0.95));
            if (Math.abs(q - last) < 0.001) return;
            last = q;
            track.style.strokeDashoffset = String(L * (1 - q));
            marks.forEach((mk, i) => {
                const on = q * L >= mk.len - 1;
                mk.g.classList.toggle("is-on", on);
                const item = items[items.length - 1 - i];
                if (item) item.classList.toggle("is-on", on);
            });
        }

        update();
        return { update };
    })();

    /* ===============================================================
       Reveals: rules draw across, titles rise from a mask. Once.
       =============================================================== */

    const revealEls = $$(".rule, .split");
    if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    /* the top check catches elements skipped by a jump or a fast scroll */
                    if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
                        entry.target.classList.add("is-in");
                        io.unobserve(entry.target);
                    }
                }
            },
            { rootMargin: "0px 0px -8% 0px" }
        );
        revealEls.forEach((el) => io.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add("is-in"));
    }

    /* ===============================================================
       Scroll: bar state, current section, scrubbed figures
       =============================================================== */

    const bar = $("#bar");
    const navLinks = $$(".bar-nav a");
    const navTargets = navLinks.map((a) => $(a.getAttribute("href")));
    let currentNav = null;
    let ticking = false;

    function onScroll() {
        ticking = false;
        const y = window.scrollY;
        bar.classList.toggle("is-scrolled", y > 8);

        const line = window.innerHeight * 0.35;
        let current = null;
        navTargets.forEach((sec, i) => {
            if (sec && sec.getBoundingClientRect().top <= line) current = navLinks[i];
        });
        if (current !== currentNav) {
            navLinks.forEach((a) => a.removeAttribute("aria-current"));
            if (current) current.setAttribute("aria-current", "true");
            currentNav = current;
        }

        if (Spectrum) Spectrum.update();
        if (Path) Path.update();
    }

    const requestScroll = () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(onScroll);
        }
    };

    window.addEventListener("scroll", requestScroll, { passive: true });
    window.addEventListener("resize", requestScroll);
    onScroll();

    /* canvases use JetBrains Mono: repaint once the font is really there */
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => themeHooks.forEach((fn) => fn()));
    }

    /* ===============================================================
       Papers: copy citation, citation ledger filter
       =============================================================== */

    $$(".copy-cite").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const cite = btn.closest(".paper").dataset.cite;
            toast((await copyText(cite)) ? "Citation copied" : "Copy failed");
        });
    });

    const ledgerButtons = $$(".ledger-filters button");
    const ledgerRows = $$(".ledger tbody tr");
    const ledgerEmpty = $("#ledgerEmpty");

    ledgerButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const src = btn.dataset.src;
            ledgerButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
            let shown = 0;
            ledgerRows.forEach((row) => {
                const srcs = row.dataset.src.split(" ");
                const show = src === "all" || (src === "overlap" ? srcs.length > 1 : srcs.includes(src));
                row.hidden = !show;
                if (show) shown += 1;
            });
            if (ledgerEmpty) ledgerEmpty.hidden = shown > 0;
        });
    });

    /* ===============================================================
       Contact: copy email
       =============================================================== */

    const copyMail = async (address) => {
        toast((await copyText(address)) ? "Email address copied" : "Copy failed");
    };

    $$(".copy-mail").forEach((btn) => btn.addEventListener("click", () => copyMail(btn.dataset.mail)));

    /* ===============================================================
       Palette: ⌘K / Ctrl-K / "/" navigation
       =============================================================== */

    (() => {
        const dlg = $("#palette");
        const openBtn = $("#paletteOpen");
        if (!dlg || typeof dlg.showModal !== "function") {
            if (openBtn) openBtn.addEventListener("click", () => $("#physics").scrollIntoView());
            return;
        }

        const input = $("#palInput");
        const list = $("#palList");
        const external = (href) => () => window.open(href, "_blank", "noopener,noreferrer");
        const goto = (selector) => () => {
            const el = $(selector);
            if (el) el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
        };
        const download = (href) => () => {
            const a = document.createElement("a");
            a.href = href;
            a.download = "";
            document.body.appendChild(a);
            a.click();
            a.remove();
        };

        const ITEMS = [
            { l: "Research: signal from noise", d: "§ 01", run: goto("#physics") },
            { l: "Projects: the logbook", d: "§ 02", run: goto("#logbook") },
            { l: "Papers & talks", d: "§ 03", run: goto("#papers") },
            { l: "Citation ledger", d: "§ 03", run: goto(".ledger-filters") },
            { l: "Education, teaching & honors", d: "§ 04", run: goto("#path") },
            { l: "Contact", d: "§ 05", run: goto("#contact") },
            { l: "Abstract", d: "§ 00", run: goto("#abstract") },
            { l: "Download CV", d: "PDF", run: download("Haoxuan_Sun_CV.pdf") },
            { l: "Email hsunbl@connect.ust.hk", d: "Mail", run: () => { window.location.href = "mailto:hsunbl@connect.ust.hk"; } },
            { l: "Copy email address", d: "Action", run: () => copyMail("hsunbl@connect.ust.hk") },
            { l: "Fire a new collision", d: "Toy MC", run: () => { goto("#top")(); if (Detector) Detector.newEvent(); } },
            { l: "Switch to Paper mode", d: "Mode", when: () => root.dataset.theme !== "paper", run: () => setTheme("paper", true) },
            { l: "Switch to Display mode", d: "Mode", when: () => root.dataset.theme === "paper", run: () => setTheme("display", true) },
            { l: "Impact of Initial Composition on Massive Star Evolution", d: "ApJ 2025", run: external("https://iopscience.iop.org/article/10.3847/1538-4357/add68f") },
            { l: "Tianlai–WIYN North Celestial Cap Redshift Survey", d: "arXiv 2025", run: external("https://arxiv.org/abs/2512.23899") },
            { l: "Renormalizable Cosmology from Gauss–Bonnet with Torsion", d: "arXiv 2024", run: external("https://arxiv.org/abs/2403.07250") },
            { l: "ML Refinements to Metallicity-Dependent Isotopic Abundances", d: "MJPA 2023", run: external("https://digitalcommons.macalester.edu/mjpa/vol11/iss1/14") },
            { l: "Google Scholar", d: "Profile ↗", run: external("https://scholar.google.com/citations?hl=en&user=hYP0soIAAAAJ") },
            { l: "INSPIRE-HEP", d: "Author ↗", run: external("https://inspirehep.net/authors/2957887") },
            { l: "ORCID", d: "0009-0007-5390-7852 ↗", run: external("https://orcid.org/0009-0007-5390-7852") },
            { l: "GitHub", d: "FrankSun0616 ↗", run: external("https://github.com/FrankSun0616/") },
            { l: "GitLab at CERN", d: "haoxuan ↗", run: external("https://gitlab.cern.ch/haoxuan") }
        ];

        let results = [];
        let sel = 0;

        function render() {
            const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            results = ITEMS.filter((it) => (!it.when || it.when()) && words.every((w) => `${it.l} ${it.d}`.toLowerCase().includes(w)));
            sel = Math.min(sel, Math.max(0, results.length - 1));
            list.innerHTML = "";
            if (!results.length) {
                const li = document.createElement("li");
                li.className = "pal-empty";
                li.textContent = "Nothing matches. Try “papers” or “cv”.";
                list.appendChild(li);
                return;
            }
            results.forEach((it, i) => {
                const li = document.createElement("li");
                li.setAttribute("role", "option");
                li.setAttribute("aria-selected", String(i === sel));
                li.dataset.i = String(i);
                const l = document.createElement("span");
                l.className = "pal-l";
                l.textContent = it.l;
                const d = document.createElement("span");
                d.className = "pal-d";
                d.textContent = it.d;
                li.append(l, d);
                list.appendChild(li);
            });
        }

        function select(i) {
            sel = i;
            $$("[role=option]", list).forEach((li, k) => li.setAttribute("aria-selected", String(k === sel)));
            const el = list.children[sel];
            if (el) el.scrollIntoView({ block: "nearest" });
        }

        function choose(i) {
            const it = results[i];
            if (!it) return;
            dlg.close();
            it.run();
        }

        function open() {
            if (dlg.open) return;
            input.value = "";
            sel = 0;
            render();
            dlg.showModal();
            input.focus();
        }

        openBtn.addEventListener("click", open);
        input.addEventListener("input", () => {
            sel = 0;
            render();
        });
        input.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (results.length) select((sel + 1) % results.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (results.length) select((sel - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
                e.preventDefault();
                choose(sel);
            }
        });
        list.addEventListener("click", (e) => {
            const li = e.target.closest("[role=option]");
            if (li) choose(Number(li.dataset.i));
        });
        list.addEventListener("mousemove", (e) => {
            const li = e.target.closest("[role=option]");
            if (li && Number(li.dataset.i) !== sel) select(Number(li.dataset.i));
        });
        dlg.addEventListener("click", (e) => {
            if (e.target === dlg) dlg.close();
        });

        document.addEventListener("keydown", (e) => {
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                if (dlg.open) dlg.close();
                else open();
            } else if (e.key === "/" && !typing && !dlg.open) {
                e.preventDefault();
                open();
            }
        });
    })();
})();
