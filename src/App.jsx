import React, { useEffect, useState } from "react";
import {
  Upload,
  FileText,
  Settings2,
  Copy,
  Download,
  Trash2,
  Moon,
  Sun,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Sparkles,
  Github,
  Linkedin,
  Clock,
} from "lucide-react";

// --- CONFIGURATION & CONSTANTS ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

const TONES = ["Professional", "Academic", "Casual", "Concise"];
const LENGTHS = [
  { id: "short", label: "Short", desc: "5-7 Bullet points" },
  { id: "medium", label: "Medium", desc: "Detailed paragraphs" },
  { id: "detailed", label: "Detailed", desc: "Sections & Action items" },
];

// --- APP COMPONENT ---
export default function App() {
  // UI State
  const [darkMode, setDarkMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");

  // Data State
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);

  // Preferences
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("medium");
  const [language, setLanguage] = useState("English");

  // ------------------------------------------------------------
  // INIT: Load history + theme
  // ------------------------------------------------------------
  useEffect(() => {
    // History
    const saved = localStorage.getItem("summarize_ai_history");
    if (saved) setHistory(JSON.parse(saved));

    // Theme
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setDarkMode(savedTheme === "dark");
    } else {
      // fallback to system preference
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      setDarkMode(!!prefersDark);
    }
  }, []);

  // ------------------------------------------------------------
  // THEME: Apply theme to <html> and <body>, and save it
  // ------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem("theme", darkMode ? "dark" : "light");

    const html = document.documentElement;
    const body = document.body;

    if (darkMode) {
      html.classList.add("dark");
      body.style.backgroundColor = "#020617"; // slate-950
      body.style.color = "#e2e8f0"; // slate-200
    } else {
      html.classList.remove("dark");
      body.style.backgroundColor = "#f8fafc"; // slate-50
      body.style.color = "#0f172a"; // slate-900
    }
  }, [darkMode]);

  // ------------------------------------------------------------
  // Save history safely (no stale state)
  // ------------------------------------------------------------
  const saveToHistory = (item) => {
    setHistory((prev) => {
      const newHistory = [item, ...prev].slice(0, 10);
      localStorage.setItem("summarize_ai_history", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  // ------------------------------------------------------------
  // PDF PARSING LOGIC (pdf.js)
  // ------------------------------------------------------------
  const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => resolve(window.pdfjsLib);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile || uploadedFile.type !== "application/pdf") {
      alert("Please upload a valid PDF file.");
      return;
    }

    setFile(uploadedFile);
    setIsUploading(true);

    try {
      const pdfjsLib = await loadPdfJs();
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      const arrayBuffer = await uploadedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str);
        fullText += strings.join(" ") + "\n";
      }

      if (fullText.trim().length < 50) {
        throw new Error("PDF seems to be empty or an image-based scan. OCR is not supported yet.");
      }

      setExtractedText(fullText);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to parse PDF. Please try again.");
      setFile(null);
      setExtractedText("");
    } finally {
      setIsUploading(false);
    }
  };

  // ------------------------------------------------------------
  // AI SUMMARIZATION LOGIC
  // ------------------------------------------------------------
  const generateSummary = async () => {
    if (!extractedText) return;

    if (!apiKey) {
      alert("Missing API Key. Please add VITE_GEMINI_API_KEY in your .env and restart npm run dev.");
      return;
    }

    setIsSummarizing(true);

    const lengthPrompt = {
      short: "Provide a concise 5-7 bullet point summary of the main arguments.",
      medium: "Provide a comprehensive summary in 3-4 well-structured paragraphs.",
      detailed:
        "Provide a multi-section summary including key findings, methodologies (if applicable), and actionable takeaways.",
    };

    const systemPrompt = `You are an expert document analyst.
Summarize the following text in ${language} with a ${tone} tone.
Format your response using clean Markdown.
${lengthPrompt[length]}
Include a 'Key Terms' section at the end.`;

    try {
      let retryCount = 0;
      const maxRetries = 5;
      let responseJson = null;

      while (retryCount < maxRetries) {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `Text to summarize: ${extractedText.substring(0, 25000)}` }],
              },
            ],
            systemInstruction: { parts: [{ text: systemPrompt }] },
          }),
        });

        if (res.ok) {
          responseJson = await res.json();
          break;
        }

        retryCount++;
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise((r) => setTimeout(r, waitTime));
      }

      const text = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Could not generate summary.");

      const newSummary = {
        id: Date.now(),
        title: file?.name || "Document",
        content: text,
        date: new Date().toLocaleDateString(),
        originalSize: extractedText.split(/\s+/).length,
        summarySize: text.split(/\s+/).length,
      };

      setSummary(newSummary);
      saveToHistory(newSummary);
    } catch (err) {
      console.error(err);
      alert("AI Service failed. Please check your connection / API key and try again.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(summary?.content || "");
      alert("Copied to clipboard!");
    } catch {
      alert("Copy failed. Please try again.");
    }
  };

  const downloadSummary = () => {
    if (!summary) return;
    const element = document.createElement("a");
    const fileBlob = new Blob([summary.content], { type: "text/markdown" });
    element.href = URL.createObjectURL(fileBlob);
    element.download = `${summary.title.replace(/\.pdf$/i, "")}_Summary.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 font-sans">
      {/* --- HEADER --- */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent leading-none">
                SummarizeAI
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                by Chit Ko Ko
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab(activeTab === "upload" ? "history" : "upload")}
              className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              {activeTab === "upload" ? <Clock className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              <span className="hidden sm:inline">{activeTab === "upload" ? "History" : "New Summary"}</span>
            </button>

            <button
              onClick={() => setDarkMode((v) => !v)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === "upload" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT: SETTINGS */}
            <div className="lg:col-span-4 space-y-6">
              <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                <h3 className="flex items-center gap-2 font-semibold mb-6 text-slate-800 dark:text-slate-100">
                  <Settings2 className="w-4 h-4 text-indigo-500" /> Summary Settings
                </h3>

                <div className="space-y-6">
                  {/* Language */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400 dark:text-slate-500">
                      Output Language
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option>English</option>
                      <option>Burmese</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                    </select>
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400 dark:text-slate-500">
                      Tone
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {TONES.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTone(t)}
                          className={`p-2.5 text-xs font-medium rounded-lg border transition-all ${
                            tone === t
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-800 dark:text-indigo-300"
                              : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Length */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400 dark:text-slate-500">
                      Summary Depth
                    </label>
                    <div className="space-y-2">
                      {LENGTHS.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => setLength(l.id)}
                          className={`w-full p-3.5 text-left rounded-xl border transition-all flex items-center justify-between group ${
                            length === l.id
                              ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/40 dark:border-indigo-800 shadow-sm"
                              : "bg-transparent border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                          }`}
                        >
                          <div>
                            <div
                              className={`text-sm font-bold ${
                                length === l.id ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"
                              }`}
                            >
                              {l.label}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{l.desc}</div>
                          </div>
                          {length === l.id && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: UPLOAD & RESULTS */}
            <div className="lg:col-span-8 space-y-6">
              {!summary ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 min-h-[450px] transition-all">
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-5">
                      <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                      <div className="text-center">
                        <p className="text-slate-800 dark:text-slate-100 font-bold text-lg">Processing Document</p>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 animate-pulse">
                          Extracting text for AI analysis...
                        </p>
                      </div>
                    </div>
                  ) : file ? (
                    <div className="flex flex-col items-center gap-8 text-center">
                      <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-900/20 rounded-3xl flex items-center justify-center border border-emerald-100 dark:border-emerald-800 shadow-inner">
                        <FileText className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white px-4">{file.name}</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">Ready to be summarized</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                        <button
                          onClick={generateSummary}
                          disabled={isSummarizing}
                          className="flex-1 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                        >
                          {isSummarizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                          {isSummarizing ? "Thinking..." : "Start AI Summary"}
                        </button>
                        <button
                          onClick={() => {
                            setFile(null);
                            setExtractedText("");
                          }}
                          className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-8 text-center max-w-sm px-6">
                      <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center shadow-sm">
                        <Upload className="w-10 h-10 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">Smart PDF Summarizer</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 font-medium leading-relaxed">
                          Drag and drop your research paper, report, or notes here for an instant AI-powered digest.
                        </p>
                      </div>
                      <label className="cursor-pointer group relative">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-2xl blur opacity-25 group-hover:opacity-60 transition duration-300"></div>
                        <div className="relative px-10 py-4 bg-slate-950 dark:bg-slate-50 text-white dark:text-slate-900 rounded-2xl font-bold text-base hover:scale-105 transition-transform">
                          Select PDF File
                        </div>
                        <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
                      </label>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em]">
                        <CheckCircle2 className="w-3 h-3" /> Secure & Private
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-10 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row items-start justify-between mb-10 gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                          Generated Summary
                        </div>
                        <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                          {tone}
                        </div>
                      </div>
                      <h2 className="text-3xl font-black text-slate-900 dark:text-slate-50 leading-tight truncate">
                        {summary.title}
                      </h2>
                      <div className="flex flex-wrap gap-4 mt-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                          <FileText className="w-4 h-4" /> {summary.originalSize.toLocaleString()} source words
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold">
                          <Sparkles className="w-4 h-4" />{" "}
                          {Math.round((summary.summarySize / summary.originalSize) * 100)}% of original
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-200 text-sm font-bold transition-all border border-slate-100 dark:border-slate-700"
                      >
                        <Copy className="w-4 h-4" /> Copy
                      </button>
                      <button
                        onClick={downloadSummary}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                      >
                        <Download className="w-4 h-4" /> Export
                      </button>
                    </div>
                  </div>

                  <div className="prose prose-slate dark:prose-invert max-w-none prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-li:text-slate-600 dark:prose-li:text-slate-300 prose-strong:text-indigo-600 dark:prose-strong:text-indigo-400">
                    {summary.content.split("\n").map((line, i) => {
                      if (line.startsWith("#"))
                        return (
                          <h3
                            key={i}
                            className="text-xl font-black mt-8 mb-4 border-l-4 border-indigo-500 dark:border-indigo-600 pl-4"
                          >
                            {line.replace(/#/g, "").trim()}
                          </h3>
                        );
                      if (line.startsWith("*") || line.startsWith("-")) {
                        return (
                          <li key={i} className="mb-2 list-none flex items-start gap-3">
                            <span className="text-indigo-500 dark:text-indigo-400 font-bold mt-1.5">•</span>
                            <span>{line.replace(/^[\*-]\s+/, "").trim()}</span>
                          </li>
                        );
                      }
                      if (line.trim() === "") return <div key={i} className="h-2" />;
                      return (
                        <p key={i} className="mb-5 leading-relaxed text-lg">
                          {line}
                        </p>
                      );
                    })}
                  </div>

                  <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setSummary(null);
                        setFile(null);
                        setExtractedText("");
                      }}
                      className="group text-sm font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <span className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-full group-hover:translate-x-1 transition-transform">
                        <ChevronRight className="w-5 h-5" />
                      </span>
                      Analyze another document
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // HISTORY TAB
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-black text-slate-900 dark:text-slate-50">History</h2>
              <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">Last 10 summaries saved locally</p>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-slate-800 dark:text-slate-200">No history yet</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Upload your first PDF and the summary will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group"
                  >
                    <div className="flex items-center gap-5 overflow-hidden">
                      <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400 shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="truncate">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 truncate pr-4">{item.title}</h4>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1.5">
                          <span>{item.date}</span>
                          <span className="w-1.5 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"></span>
                          <span>{item.summarySize} words</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setSummary(item);
                          setActiveTab("upload");
                        }}
                        className="px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-black hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
                      >
                        View
                      </button>
                      <button
                        onClick={() => {
                          setHistory((prev) => {
                            const newHistory = prev.filter((h) => h.id !== item.id);
                            localStorage.setItem("summarize_ai_history", JSON.stringify(newHistory));
                            return newHistory;
                          });
                        }}
                        className="p-2.5 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- FOOTER --- */}
      <footer className="mt-32 border-t border-slate-100 dark:border-slate-800 py-16 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12 items-center text-center md:text-left">
          <div>
            <div className="flex items-center justify-center md:justify-start gap-3 mb-6">
              <div className="p-1.5 bg-indigo-600 rounded-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-black text-2xl tracking-tight text-slate-900 dark:text-slate-50">SummarizeAI</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-base max-w-sm mx-auto md:mx-0 font-medium leading-relaxed">
              A high-performance AI document analyzer designed to turn hours of reading into minutes of insight.
            </p>
            <p className="mt-8 text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
              Built by Chit Ko Ko • CS Portfolio Project
            </p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex gap-8 text-slate-400 dark:text-slate-500">
              <a
                href="https://github.com/chitko84"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center gap-2 text-sm font-bold"
              >
                <Github className="w-5 h-5" /> GitHub
              </a>
              <a
                href="https://my.linkedin.com/in/chit-ko-ko-0b30a3299"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center gap-2 text-sm font-bold"
              >
                <Linkedin className="w-5 h-5" /> LinkedIn
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
