import { AbsoluteFill } from "remotion";
import type { FrameState } from "../engine/compile";
import { easeOutBack } from "../engine/easing";
import { clamp, clamp01 } from "../engine/math";
import { makeProjector } from "./project";

const FONT = "'Arial Rounded MT Bold', 'Nunito', 'Helvetica Neue', Arial, sans-serif";
const INK = "#1d1b26";

/** Pop in with overshoot, fade out at the end. */
const popScale = (t: number, start: number, end: number) => {
  const appear = easeOutBack(clamp01((t - start) / 0.35));
  const vanish = clamp01((end - t) / 0.25);
  return appear * (0.6 + 0.4 * vanish);
};
const fadeOpacity = (t: number, end: number) => clamp01((end - t) / 0.25);

export const Overlays = ({ frame, width, height }: { frame: FrameState; width: number; height: number }) => {
  const project = makeProjector(frame.camera, width, height);
  const unit = Math.min(width, height) / 1080;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, pointerEvents: "none" }}>
      {frame.bubbles.map((bubble) => {
        const anchor = project(bubble.head);
        if (!anchor.nearScreen) return null;
        const scale = popScale(frame.t, bubble.start, bubble.end);
        const x = clamp(anchor.x, 220 * unit, width - 220 * unit);
        const y = clamp(anchor.y, 160 * unit, height - 40 * unit);
        return (
          <SpeechBubble key={`${bubble.actor}-${bubble.start}`} text={bubble.text} x={x} y={y} scale={scale}
            opacity={fadeOpacity(frame.t, bubble.end)} unit={unit} style={bubble.style} t={frame.t} />
        );
      })}
      {frame.words.map((word) => {
        const anchor = project(word.point);
        if (!anchor.visible) return null;
        return <ComicWord key={`${word.text}-${word.start}`} word={word} x={anchor.x} y={anchor.y} t={frame.t} unit={unit} />;
      })}
      {frame.captions.map((caption) => (
        <CaptionCard key={`${caption.start}-${caption.text}`} caption={caption} t={frame.t} unit={unit} height={height} />
      ))}
    </AbsoluteFill>
  );
};

/** Speech bubble. "shout" (angry) is red, bigger and shakes; "shaky" (scared) wobbles. */
const SpeechBubble = ({ text, x, y, scale, opacity, unit, style, t }: {
  text: string; x: number; y: number; scale: number; opacity: number; unit: number; style: "normal" | "shout" | "shaky"; t: number;
}) => {
  const shout = style === "shout";
  const jitterAmount = shout ? 4 : style === "shaky" ? 2.5 : 0;
  const jitterX = Math.sin(t * 53) * jitterAmount * unit;
  const jitterY = Math.cos(t * 47) * jitterAmount * unit;
  const borderColor = shout ? "#c1121f" : INK;
  return (
    <div
      style={{
        position: "absolute", left: x + jitterX, top: y + jitterY, transform: `translate(-50%, -100%) scale(${scale})`, transformOrigin: "50% 100%",
        opacity, display: "flex", flexDirection: "column", alignItems: "center",
      }}
    >
      <div
        style={{
          background: shout ? "#fff1f0" : "#ffffff", color: shout ? "#9d0208" : INK, border: `${(shout ? 8 : 6) * unit}px solid ${borderColor}`,
          borderRadius: (shout ? 18 : 36) * unit, padding: `${18 * unit}px ${30 * unit}px`, fontSize: (shout ? 54 : 46) * unit, fontWeight: 900,
          maxWidth: 600 * unit, textAlign: "center", lineHeight: 1.15, whiteSpace: "pre-wrap",
          transform: shout ? `rotate(${Math.sin(t * 9) * 2}deg)` : undefined,
        }}
      >
        {text}
      </div>
      <div style={{ width: 0, height: 0, borderLeft: `${18 * unit}px solid transparent`, borderRight: `${18 * unit}px solid transparent`, borderTop: `${26 * unit}px solid ${borderColor}`, marginTop: -2 }} />
    </div>
  );
};

/** Comic-book sound word ("CRASH!", "HONK!") that pops at a point in the scene. */
const ComicWord = ({ word, x, y, t, unit }: { word: FrameState["words"][number]; x: number; y: number; t: number; unit: number }) => {
  const isCrash = word.style === "crash" || word.style === "splat";
  const isSplat = word.style === "splat";
  const scale = popScale(t, word.start, word.end) * (isCrash ? 1 : 0.8);
  const wobble = Math.sin((t - word.start) * 30) * (isCrash ? 3 : 2) * Math.max(0, 1 - (t - word.start) * 2);
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, transform: `translate(-50%, -100%) scale(${scale}) rotate(${(isCrash ? -8 : 6) + wobble}deg)`,
        fontSize: (isCrash ? 130 : 70) * unit, fontWeight: 900, fontStyle: "italic", letterSpacing: 2 * unit,
        color: isSplat ? "#b07a3c" : isCrash ? "#ffd60a" : "#ffffff", WebkitTextStroke: `${(isCrash ? 9 : 6) * unit}px ${INK}`, paintOrder: "stroke fill",
        textShadow: `${8 * unit}px ${8 * unit}px 0 ${isSplat ? "#4e3319" : isCrash ? "#e63946" : INK}`, whiteSpace: "nowrap", opacity: fadeOpacity(t, word.end),
      }}
    >
      {word.text}
    </div>
  );
};

const CaptionCard = ({ caption, t, unit, height }: { caption: FrameState["captions"][number]; t: number; unit: number; height: number }) => {
  const scale = popScale(t, caption.start, caption.end);
  const isTitle = caption.size === "title";
  const verticalPosition = { top: height * 0.1, center: height * 0.42, bottom: height * 0.8 }[caption.position];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: verticalPosition, display: "flex", justifyContent: "center", opacity: fadeOpacity(t, caption.end) }}>
      <div
        style={{
          transform: `scale(${scale}) rotate(${isTitle ? -2 : 0}deg)`,
          background: isTitle ? "#ffd60a" : "rgba(29, 27, 38, 0.82)",
          color: isTitle ? INK : "#ffffff",
          border: isTitle ? `${7 * unit}px solid ${INK}` : "none",
          borderRadius: 28 * unit,
          padding: `${20 * unit}px ${36 * unit}px`,
          fontSize: (isTitle ? 84 : 52) * unit,
          fontWeight: 900,
          maxWidth: "86%",
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: isTitle ? `${10 * unit}px ${10 * unit}px 0 ${INK}` : "none",
        }}
      >
        {caption.text}
      </div>
    </div>
  );
};

/** Debug HUD for contact sheets: time, camera, and a name tag + ground coordinates on every actor. */
export const DebugHud = ({ frame, width, height, fps }: { frame: FrameState; width: number; height: number; fps: number }) => {
  const project = makeProjector(frame.camera, width, height);
  const unit = Math.min(width, height) / 1080;
  const tags = [
    ...Object.entries(frame.cars).filter(([id]) => !frame.offstage.includes(id)).map(([id, car]) => ({ id, point: [car.pos[0], 2.4 + car.lift, car.pos[1]] as const, pos: car.pos })),
    ...Object.entries(frame.characters).filter(([id]) => !frame.offstage.includes(id)).map(([id, person]) => ({ id, point: [person.pos[0], person.pos[1] + 2.1, person.pos[2]] as const, pos: [person.pos[0], person.pos[2]] as const })),
  ];
  const cam = frame.camera.position.map((n) => n.toFixed(1)).join(", ");
  return (
    <AbsoluteFill style={{ fontFamily: "Menlo, monospace", pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 44 * unit, padding: 16 * unit }}>
        t={frame.t.toFixed(2)}s  f={Math.round(frame.t * fps)}  cam=({cam})
      </div>
      {tags.map((tag) => {
        const screen = project([tag.point[0], tag.point[1], tag.point[2]]);
        if (!screen.visible) return null;
        return (
          <div key={tag.id} style={{ position: "absolute", left: screen.x, top: screen.y, transform: "translate(-50%, -100%)", background: "#ff006e", color: "#fff", fontSize: 34 * unit, padding: `${4 * unit}px ${10 * unit}px`, borderRadius: 8 * unit, whiteSpace: "nowrap" }}>
            {tag.id} ({tag.pos[0].toFixed(1)}, {tag.pos[1].toFixed(1)})
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Dashcam footage look: REC dot, timestamp, speed, scanlines, vignette and a frame like a phone screen. */
export const DashcamOverlay = ({ replay, width, height }: { replay: NonNullable<FrameState["replay"]>; width: number; height: number }) => {
  const unit = Math.min(width, height) / 1080;
  const seconds = 8 * 3600 + 42 * 60 + 5 + replay.sourceTime;
  const clock = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)].map((n) => String(n).padStart(2, "0")).join(":");
  const recording = replay.sourceTime % 1 < 0.6;
  const fadeIn = clamp01(replay.progress * 12);
  return (
    <AbsoluteFill style={{ fontFamily: "Menlo, 'Courier New', monospace", pointerEvents: "none", opacity: fadeIn }}>
      <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 2px, transparent 2px, transparent 5px)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
      <AbsoluteFill style={{ border: `${14 * unit}px solid #111`, borderRadius: 40 * unit }} />
      <div style={{ position: "absolute", top: 70 * unit, left: 60 * unit, display: "flex", alignItems: "center", gap: 14 * unit, color: "#fff", fontSize: 46 * unit, fontWeight: 700, textShadow: "0 0 6px #000" }}>
        <div style={{ width: 30 * unit, height: 30 * unit, borderRadius: "50%", background: recording ? "#ff1744" : "transparent", boxShadow: recording ? "0 0 12px #ff1744" : "none" }} />
        REC
      </div>
      <div style={{ position: "absolute", top: 70 * unit, right: 60 * unit, color: "#fff", fontSize: 40 * unit, textShadow: "0 0 6px #000" }}>DASHCAM · FRONT</div>
      <div style={{ position: "absolute", bottom: 80 * unit, left: 60 * unit, color: "#fff", fontSize: 40 * unit, lineHeight: 1.4, textShadow: "0 0 6px #000" }}>
        2026-10-23&nbsp;&nbsp;{clock}
      </div>
    </AbsoluteFill>
  );
};
