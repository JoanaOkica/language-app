import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { submitFredTurn } from "../lib/api";
import { useSession } from "../lib/session";
import { isDemo } from "../lib/supabase";
import type { FredTurnResult } from "../lib/types";

interface Turn {
  who: "fred" | "me";
  text: string;
}

const OPENING = "¡Hola! ¿Qué te gustaría pedir hoy?";
const MAX_SECONDS = 60;

export default function FredPage() {
  const { refresh } = useSession();
  const [params] = useSearchParams();
  const challengeId = params.get("challenge");

  const [turns, setTurns] = useState<Turn[]>([{ who: "fred", text: OPENING }]);
  const [prompt, setPrompt] = useState(OPENING);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<FredTurnResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function startRecording() {
    setError(null);
    setResult(null);

    // Demo mode has no backend to send audio to, so skip the microphone
    // entirely rather than asking for a permission we don't need.
    if (isDemo) {
      setRecording(true);
      timerRef.current = window.setTimeout(() => void finish(new Blob()), 1500);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void finish(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = window.setTimeout(stopRecording, MAX_SECONDS * 1000);
    } catch {
      setError("Microphone access is required for speaking practice.");
    }
  }

  function stopRecording() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setRecording(false);
    if (isDemo) return;
    recorderRef.current?.stop();
  }

  async function finish(audio: Blob) {
    setRecording(false);
    setStatus("Transcribing and analysing…");
    try {
      const res = await submitFredTurn(audio, prompt, challengeId);
      setTurns((t) => [...t, { who: "me", text: res.transcript }]);
      setResult(res);
      setStatus(null);
      await refresh();

      if (res.nextPrompt) {
        window.setTimeout(() => {
          setTurns((t) => [...t, { who: "fred", text: res.nextPrompt }]);
          setPrompt(res.nextPrompt);
          setResult(null);
        }, 2600);
      }
    } catch (err) {
      setStatus(null);
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>🎙️ FRED</h1>
      <p className="sub">
        Your speaking coach{challengeId ? " · challenge session" : ""}. Answer out loud — he'll score
        pronunciation, grammar and fluency.
      </p>

      {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      <div style={{ marginTop: 18 }}>
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.who}`}>
            {t.who === "fred" && <strong>FRED: </strong>}
            {t.text}
          </div>
        ))}
      </div>

      <button className={`mic ${recording ? "rec" : "ghost"}`}
              aria-label={recording ? "Stop recording" : "Start recording"}
              onClick={recording ? stopRecording : () => void startRecording()}
              disabled={Boolean(status)}>
        {recording ? "⏹" : "🎤"}
      </button>
      <p className="spinner">
        {recording ? "Recording… tap to stop" : status ?? "Tap the microphone to answer"}
      </p>

      {result && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="score">{result.score}<span> / 100</span></div>
          <p className="sub" style={{ textAlign: "center" }}>+{result.starsAwarded} ⭐ Star Points</p>

          <div className="breakdown">
            {([
              ["Pronunciation", result.breakdown.pronunciation],
              ["Grammar", result.breakdown.grammar],
              ["Fluency", result.breakdown.fluency],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <span>{label}<b>{value}</b></span>
                <div className="meter"><i style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 13.5, marginTop: 14 }}>{result.analysis}</p>
        </div>
      )}
    </>
  );
}
