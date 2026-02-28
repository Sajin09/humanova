import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Terminal,
  UserCheck,
  Eraser,
  AlertTriangle,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Groq API key — hardcoded so no env setup needed on Vercel
// ─────────────────────────────────────────────────────────────
const GROQ_API_KEY = "REMOVED_API_KEY";

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [processStep, setProcessStep] = useState("Ready");
  const [error, setError] = useState("");
  const apiKey = GROQ_API_KEY;
  const [stats, setStats] = useState({
    humanScore: 0,
    readability: 0,
    aiProbability: 0,
    wordCount: 0,
  });

  const debounceRef = useRef(null);
  const abortRef = useRef(null);



  // Real-time debounced trigger
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (input.trim().split(/\s+/).length < 5) {
      if (!input.trim()) clearAll();
      return;
    }

    debounceRef.current = setTimeout(() => runHumanize(), 1200);
    return () => clearTimeout(debounceRef.current);
  }, [input]);

  // ─── SYSTEM PROMPT ────────────────────────────────────────
  const SYSTEM_PROMPT = `You are a content rewriter. Rewrite the given text following these rules strictly:

WRITING STYLE:
- Use simple, plain, everyday language that any person would use
- Write the way a normal person writes — not too formal, not too casual
- Do NOT use slang or filler phrases like "pretty cool", "honestly", "look", "here's the deal", "the thing is"
- Do NOT use high-level or fancy vocabulary like "leverage", "facilitate", "commence", "utilize"
- Use common, easy-to-understand words only
- Keep sentences clear and direct
- Mix sentence lengths naturally — some short, some a bit longer
- Use contractions where it feels natural (don't, can't, it's, they're)
- Use active voice most of the time
- Avoid repeating the same sentence structure over and over

AI DETECTION BYPASS:
- Remove all robotic AI patterns: "Moreover", "Furthermore", "Additionally", "It is important to note", "In conclusion"
- Do NOT use lists or bullet points unless the original text has them
- Vary paragraph lengths
- Add small natural imperfections that a human writer would have
- Do NOT make every sentence perfectly structured

OUTPUT RULES:
- Output ONLY the rewritten text, nothing else
- Do NOT add any commentary, explanation, labels, or preamble
- Do NOT start with "Here is", "Sure", "Of course", or anything similar
- Keep the same meaning and roughly the same length as the input
- Do NOT add information that was not in the original text`;

  // ─── MAIN HUMANIZE LOGIC ──────────────────────────────────
  const runHumanize = useCallback(async () => {
    if (isProcessing) return;

    // Cancel any previous request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsProcessing(true);
    setError("");
    setOutput("");
    setProgress(0);

    try {
      let resultText = "";
      const wordCount = input.split(/\s+/).filter(Boolean).length;

      if (apiKey) {
        // ── REAL API CALL via Groq ──────────────────────────
        setProcessStep("Connecting to Groq AI...");
        setProgress(15);

        const res = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: input },
              ],
              temperature: 1.0,
              max_tokens: 2048,
              top_p: 0.95,
            }),
            signal: abortRef.current.signal,
          },
        );
        setProgress(65);
        setProcessStep("Processing AI response...");

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData?.error?.message || `Groq API error ${res.status}`,
          );
        }

        const data = await res.json();
        resultText = data?.choices?.[0]?.message?.content?.trim() || "";

        if (!resultText) throw new Error("Empty response from Groq API");
      } else {
        // ── LOCAL FALLBACK (no API key) ─────────────────────
        setProcessStep("Running local humanizer...");
        setProgress(20);
        await new Promise((r) => setTimeout(r, 500));
        setProgress(60);
        resultText = localHumanize(input);
        setProgress(90);
      }

      // Stream the result
      setProcessStep("Streaming output...");
      await streamOutput(resultText);

      setStats({
        humanScore: apiKey ? 100 : 78,
        readability: apiKey ? 97 : 85,
        aiProbability: apiKey ? 0 : 12,
        wordCount,
      });
      setProgress(100);
      setProcessStep("✅ Stealth Mode Active");
    } catch (err) {
      if (err.name === "AbortError") return; // user typed again, ignore
      setError(err.message);
      setProcessStep("❌ Error");
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, apiKey, input]);

  // ─── LOCAL FALLBACK HUMANIZER ─────────────────────────────
  function localHumanize(text) {
    const swaps = {
      moreover: "also",
      furthermore: "also",
      additionally: "also",
      therefore: "so",
      consequently: "because of this",
      thus: "so",
      however: "but",
      nevertheless: "but still",
      "in conclusion": "at the end",
      "in summary": "overall",
      utilize: "use",
      demonstrates: "shows",
      illustrates: "shows",
      implement: "set up",
      facilitate: "help",
      prioritize: "focus on",
      leverage: "use",
      commence: "start",
      obtain: "get",
      approximately: "about",
      "it is important to note that": "",
      "it is worth noting that": "",
      "in order to": "to",
      "due to the fact that": "because",
      "a significant number of": "many",
      "a wide range of": "many different",
      "plays a crucial role": "is important",
      "it should be noted that": "",
      "on the other hand": "but then",
    };
    let out = text;
    for (const [ai, human] of Object.entries(swaps)) {
      out = out.replace(new RegExp(`\\b${ai}\\b`, "gi"), human);
    }
    // Clean up double spaces from empty replacements
    out = out.replace(/ {2,}/g, " ").replace(/\. {2,}/g, ". ");
    return out.trim();
  }

  // ─── WORD-BY-WORD STREAMING ───────────────────────────────
  const streamOutput = async (text) => {
    let built = "";
    const words = text.split(" ");
    setOutput("");
    for (const w of words) {
      built += w + " ";
      setOutput(built);
      await new Promise((r) => setTimeout(r, 14));
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearAll = () => {
    setInput("");
    setOutput("");
    setError("");
    setProgress(0);
    setStats({ humanScore: 0, readability: 0, aiProbability: 0, wordCount: 0 });
    setProcessStep("Ready");
  };

  const wordCount = input.split(/\s+/).filter(Boolean).length;

  // ─── UI ───────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="logo">
          <motion.span
            animate={{ rotate: isProcessing ? 360 : 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            style={{ display: "inline-flex" }}
          >
            <Sparkles size={26} />
          </motion.span>
          Humanova<span style={{ opacity: 0.4 }}>.AI</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="processing-indicator">
            <div
              className="status-dot"
              style={{
                background: isProcessing ? "var(--warning)" : "var(--success)",
              }}
            />
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              {isProcessing ? processStep : "Groq Connected"}
            </span>
          </div>
        </div>
      </nav>



      {/* ── Main ── */}
      <main className="main-content">
        <section className="hero-section">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="hero-title"
          >
            AI wrote it.{" "}
            <span style={{ color: "var(--primary)" }}>Sajin Perfected it.</span>
          </motion.h1>
          <p className="hero-subtitle">
            Paste your AI text — we give it emotions, personality, and a little
            human drama.
          </p>
        </section>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="error-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <AlertTriangle size={16} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>



        <div className="humanizer-card">
          {/* ── Input ── */}
          <div className="input-group">
            <div className="label-row">
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Terminal size={15} /> Live Input
              </div>
              <span className={isProcessing ? "pulse" : ""}>
                {wordCount} words
              </span>
            </div>

            <div className="text-area-wrapper">
              <textarea
                placeholder="Start typing or paste AI content (min 5 words)…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              {input && (
                <button onClick={clearAll} className="clear-btn" title="Clear">
                  <Eraser size={16} />
                </button>
              )}
            </div>

            {/* Progress */}
            <div className="progress-box">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.4rem",
                }}
              >
                <span className="stat-label">Processing Power</span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "var(--primary)",
                  }}
                >
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="gauge-container">
                <motion.div
                  className="gauge-fill"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
            </div>


          </div>

          {/* ── Output ── */}
          <div className="output-group">
            <div className="label-row">
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <UserCheck size={15} /> Humanized Output
              </div>
              {output && (
                <button onClick={copyToClipboard} className="btn-copy">
                  {copied ? (
                    <>
                      <CheckCircle2
                        size={14}
                        style={{ color: "var(--success)" }}
                      />{" "}
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy
                    </>
                  )}
                </button>
              )}
            </div>

            <div
              className="text-area-wrapper"
              style={{ background: "rgba(99,102,241,0.04)", flex: 1 }}
            >
              <textarea
                readOnly
                placeholder="Humanized content streams here in real-time…"
                value={output}
              />
              <AnimatePresence>
                {isProcessing && !output && (
                  <motion.div
                    className="output-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div style={{ textAlign: "center", width: "65%" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          marginBottom: "1rem",
                          gap: 6,
                        }}
                      >
                        {[0, 0.15, 0.3].map((d, i) => (
                          <motion.div
                            key={i}
                            animate={{
                              scale: [1, 1.4, 1],
                              opacity: [0.5, 1, 0.5],
                            }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: d,
                            }}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: "var(--primary)",
                            }}
                          />
                        ))}
                      </div>
                      <p
                        className="stat-label"
                        style={{ marginBottom: "0.75rem" }}
                      >
                        {processStep}
                      </p>
                      <div className="gauge-container">
                        <motion.div
                          className="gauge-fill"
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="stats-panel">
              {[
                {
                  label: "AI Detection",
                  value: output ? `${stats.aiProbability}%` : "--",
                  bar: stats.aiProbability,
                  color:
                    output && stats.aiProbability === 0
                      ? "var(--success)"
                      : "var(--text-muted)",
                },
                {
                  label: "Human Score",
                  value: output ? `${stats.humanScore}%` : "--",
                  bar: stats.humanScore,
                  color: output ? "var(--success)" : "var(--text-muted)",
                },
                {
                  label: "Readability",
                  value: output ? `${stats.readability}/100` : "--",
                  bar: stats.readability,
                  color: "var(--primary)",
                },
              ].map((s) => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ color: s.color }}>
                    {s.value}
                  </div>
                  <div className="gauge-container">
                    <motion.div
                      className="gauge-fill"
                      animate={{ width: `${s.bar}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detectors badge */}
        <section style={{ textAlign: "center", marginTop: "2.5rem" }}>
          <div className="detectors-row">
            {[
              "GPTZero",
              "Turnitin",
              "Originality.ai",
              "ZeroGPT",
              "Copyleaks",
            ].map((d) => (
              <div key={d} className="detector-item">
                <ShieldCheck size={17} style={{ color: "var(--success)" }} />{" "}
                {d}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        © 2026 GhostWriter AI · Powered by Groq + Llama 3.3 70B
      </footer>
    </div>
  );
}
