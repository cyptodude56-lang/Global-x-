// ---------------------------------------------------------------------------
// Hallmark — login page background animation.
//
// Purely decorative canvas layer behind the (persistent, transparent)
// login card. Sequence: fast rippling chain of diagonal trapezium panels
// -> panels settle into an "H" mark -> mark transitions into the
// "HALLMARK FINANCIAL BANK" wordmark, held at full visibility -> panels
// keep rippling behind it, now slow, as if floating. Loops forever.
//
// Self-contained IIFE, no globals, no dependency on Supabase or login.js —
// safe to load on any page, in any order.
// ---------------------------------------------------------------------------

(function () {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width, height;
  let animationFrame;
  const startTime = Date.now();
  let phase = "rattle"; // 'rattle' -> 'logo' -> 'text' -> 'float'

  // Hallmark palette (mirrors styles.css :root — canvas can't read CSS
  // custom properties, so the hex values are duplicated here on purpose).
  const INK = "10, 21, 31";
  const INK_PANEL = "22, 29, 46";
  const GOLD = "201, 162, 39";
  const GOLD_DARK = "166, 132, 30";
  const GOLD_SOFT = "233, 217, 168";

  const RATTLE_DURATION = 3200; // fast ripple + chain movement
  const LOGO_DURATION = 2000; // "H" mark phase
  const TEXT_DURATION = 2200; // wordmark reveal phase
  const FLOAT_HOLD_DURATION = 4500; // slow float, wordmark held, before looping
  const TOTAL_CYCLE = RATTLE_DURATION + LOGO_DURATION + TEXT_DURATION + FLOAT_HOLD_DURATION;

  const PANEL_COUNT = 11;
  let panels = [];

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    buildPanels();
  }

  function buildPanels() {
    panels = [];
    const midX = width / 2;
    const midY = height / 2;
    const baseW = Math.min(width * 0.85, 1400);
    const panelHeight = height * 0.22;
    const gap = height * 0.012;
    const totalHeight = PANEL_COUNT * (panelHeight + gap) - gap;
    const startY = midY - totalHeight / 2;

    for (let i = 0; i < PANEL_COUNT; i++) {
      const y = startY + i * (panelHeight + gap);
      const widthFactor = 0.75 + 0.25 * Math.sin(i * 0.9);
      const panelWidth = baseW * 0.65 * widthFactor;
      const zigzag = Math.sin(i * 1.8) * baseW * 0.12;
      const xOffset = (i - (PANEL_COUNT - 1) / 2) * baseW * 0.07 + zigzag;
      const centerX = midX + xOffset;
      const topWidth = panelWidth * 0.7;
      const bottomWidth = panelWidth * 1.0;
      const invert = i % 3 === 0;

      panels.push({
        index: i,
        x: centerX,
        y,
        height: panelHeight,
        topWidth: invert ? bottomWidth : topWidth,
        bottomWidth: invert ? topWidth : bottomWidth,
        phaseOffset: i * 0.9,
      });
    }
  }

  function drawPanel(panel, time, rattleIntensity, colorAlpha) {
    const { x, y, height, topWidth, bottomWidth } = panel;

    const rattleOffsetX = Math.sin(time * 0.03 + panel.phaseOffset * 2) * rattleIntensity * 12;
    const rattleOffsetY = Math.cos(time * 0.025 + panel.phaseOffset * 1.5) * rattleIntensity * 6;
    const dynamicSkew = Math.sin(time * 0.02 + panel.phaseOffset) * rattleIntensity * 0.08;

    const centerX = x + rattleOffsetX;
    const centerY = y + rattleOffsetY;

    const halfTop = topWidth / 2;
    const halfBottom = bottomWidth / 2;
    const skewTop = dynamicSkew * 15;
    const skewBottom = -dynamicSkew * 15;

    const p1 = { x: centerX - halfTop + skewTop, y: centerY - height / 2 };
    const p2 = { x: centerX + halfTop + skewTop, y: centerY - height / 2 };
    const p3 = { x: centerX + halfBottom + skewBottom, y: centerY + height / 2 };
    const p4 = { x: centerX - halfBottom + skewBottom, y: centerY + height / 2 };

    const grad = ctx.createLinearGradient(p1.x, p1.y, p3.x, p3.y);
    const ink1 = `rgba(${INK}, ${colorAlpha})`;
    const ink2 = `rgba(${INK_PANEL}, ${colorAlpha * 0.9})`;
    const gold1 = `rgba(${GOLD}, ${colorAlpha * 0.85})`;
    const gold2 = `rgba(${GOLD_DARK}, ${colorAlpha * 0.7})`;

    if (panel.index % 2 === 0) {
      grad.addColorStop(0, gold1);
      grad.addColorStop(0.4, ink1);
      grad.addColorStop(0.8, ink2);
      grad.addColorStop(1, gold2);
    } else {
      grad.addColorStop(0, ink1);
      grad.addColorStop(0.5, gold2);
      grad.addColorStop(1, ink2);
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();

    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = `rgba(${GOLD}, ${colorAlpha * 0.5})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.shadowColor = `rgba(${GOLD}, ${colorAlpha * 0.3})`;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawTrapezium(cx, cy, topW, bottomW, h, color, alpha) {
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, cy - h / 2);
    ctx.lineTo(cx + topW / 2, cy - h / 2);
    ctx.lineTo(cx + bottomW / 2, cy + h / 2);
    ctx.lineTo(cx - bottomW / 2, cy + h / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = `rgba(${GOLD_SOFT}, ${alpha * 0.7})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawHLogo(progress) {
    const alpha = Math.min(1, progress * 1.5);
    const anchorX = width > 760 ? width * 0.72 : width / 2;
    const centerX = anchorX;
    const centerY = height / 2;
    const hWidth = Math.min(width * 0.35, 300);
    const hHeight = Math.min(height * 0.3, 250);
    const barWidth = hWidth * 0.22;

    const leftX = centerX - hWidth / 2 + barWidth / 2;
    const rightX = centerX + hWidth / 2 - barWidth / 2;
    const crossHeight = hHeight * 0.22;
    const crossLeftX = centerX - hWidth / 2 + barWidth * 0.8;
    const crossRightX = centerX + hWidth / 2 - barWidth * 0.8;
    const crossTopWidth = (crossRightX - crossLeftX) * 0.9;
    const crossBottomWidth = (crossRightX - crossLeftX) * 1.1;

    const goldGrad = ctx.createLinearGradient(centerX - hWidth / 2, centerY - hHeight / 2, centerX + hWidth / 2, centerY + hHeight / 2);
    goldGrad.addColorStop(0, `rgba(${GOLD_SOFT}, ${alpha})`);
    goldGrad.addColorStop(0.4, `rgba(${GOLD}, ${alpha})`);
    goldGrad.addColorStop(0.8, `rgba(${GOLD_DARK}, ${alpha})`);

    ctx.shadowColor = `rgba(${GOLD}, ${alpha * 0.6})`;
    ctx.shadowBlur = 30;

    drawTrapezium(leftX, centerY, barWidth * 0.85, barWidth * 1.15, hHeight, goldGrad, alpha);
    drawTrapezium(rightX, centerY, barWidth * 0.85, barWidth * 1.15, hHeight, goldGrad, alpha);
    drawTrapezium(centerX, centerY, crossTopWidth, crossBottomWidth, crossHeight, goldGrad, alpha);

    ctx.shadowBlur = 0;
  }

  function drawLetterSpacedText(text, cx, cy, spacing) {
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = `${spacing}px`;
      ctx.fillText(text, cx, cy);
    } else {
      const widths = [];
      let totalWidth = -spacing;
      for (const ch of text) {
        const w = ctx.measureText(ch).width;
        widths.push(w);
        totalWidth += w + spacing;
      }
      let x = cx - totalWidth / 2;
      let i = 0;
      for (const ch of text) {
        const w = widths[i++];
        ctx.fillText(ch, x + w / 2, cy);
        x += w + spacing;
      }
    }
  }

  function drawBankText(progress) {
    const alpha = Math.min(1, progress * 1.8);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Right-anchored on wide screens (matches the H mark's position above,
    // and stays clear of the login panel anchored to the left); centered
    // on narrow screens where there's no spare width to place it aside.
    const anchorX = width > 760 ? width * 0.72 : width / 2;
    const centerY = height / 2;

    const titleSize = Math.min(width * 0.06, 64);
    const subSize = Math.min(width * 0.024, 26);
    const lineGap = titleSize * 0.78;

    const grad = ctx.createLinearGradient(anchorX - 220, centerY - 70, anchorX + 220, centerY + 70);
    grad.addColorStop(0, `rgba(${GOLD_SOFT}, ${alpha})`);
    grad.addColorStop(0.5, `rgba(${GOLD}, ${alpha})`);
    grad.addColorStop(1, `rgba(${GOLD_DARK}, ${alpha})`);

    ctx.shadowColor = `rgba(${GOLD}, ${alpha * 0.55})`;
    ctx.shadowBlur = 26;
    ctx.fillStyle = grad;

    // Line 1: HALLMARK — larger, the primary mark
    ctx.font = `600 ${titleSize}px 'IBM Plex Sans', sans-serif`;
    drawLetterSpacedText("HALLMARK", anchorX, centerY - lineGap / 2, 8);

    // Line 2: FINANCIAL BANK — smaller subtitle beneath it
    ctx.font = `500 ${subSize}px 'IBM Plex Sans', sans-serif`;
    drawLetterSpacedText("FINANCIAL BANK", anchorX, centerY + lineGap / 2, 5);

    ctx.restore();
  }

  function render() {
    const now = Date.now();
    // Looping clock: wraps back to 0 (restarting the rattle) after one full
    // cycle, rather than settling into "float" forever. Panel jitter below
    // still uses the raw, non-wrapped `now` so the ripple itself stays
    // continuous across the loop boundary — only the phase timing loops.
    const elapsed = (now - startTime) % TOTAL_CYCLE;

    let rattleIntensity = 0;
    let panelAlpha = 0.55;

    if (elapsed < RATTLE_DURATION) {
      phase = "rattle";
      rattleIntensity = 0.8 + 0.5 * Math.sin(elapsed * 0.02);
      panelAlpha = 0.6 + 0.2 * Math.sin(elapsed * 0.01);
    } else if (elapsed < RATTLE_DURATION + LOGO_DURATION) {
      phase = "logo";
      const t = (elapsed - RATTLE_DURATION) / LOGO_DURATION;
      rattleIntensity = Math.max(0, 0.9 * (1 - t * 2));
      panelAlpha = 0.5 * (1 - t * 0.8);
    } else if (elapsed < RATTLE_DURATION + LOGO_DURATION + TEXT_DURATION) {
      phase = "text";
      const t = (elapsed - RATTLE_DURATION - LOGO_DURATION) / TEXT_DURATION;
      rattleIntensity = 0;
      panelAlpha = 0.4 * (1 - t * 0.5);
    } else {
      phase = "float";
      rattleIntensity = 0.18 + 0.08 * Math.sin(elapsed * 0.003);
      panelAlpha = 0.45 + 0.05 * Math.sin(elapsed * 0.002);
    }

    ctx.clearRect(0, 0, width, height);

    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.8);
    bgGrad.addColorStop(0, "#161d2e");
    bgGrad.addColorStop(1, "#0a1119");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    panels.forEach((panel) => {
      let alphaMultiplier = 1;
      if (phase === "logo") alphaMultiplier = 0.5;
      else if (phase === "text") alphaMultiplier = 0.3;
      else if (phase === "float") alphaMultiplier = 0.8;
      drawPanel(panel, now * 0.2, rattleIntensity, panelAlpha * alphaMultiplier);
    });

    if (phase === "logo") {
      const t = Math.min(1, (elapsed - RATTLE_DURATION) / LOGO_DURATION);
      drawHLogo(t);
    } else if (phase === "text") {
      const t = Math.min(1, (elapsed - RATTLE_DURATION - LOGO_DURATION) / TEXT_DURATION);
      drawBankText(t);
    } else if (phase === "float") {
      drawBankText(1);
    }

    animationFrame = requestAnimationFrame(render);
  }

  function init() {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    render();
  }

  window.addEventListener("beforeunload", () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });

  init();
})();