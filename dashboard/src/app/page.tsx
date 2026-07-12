"use client";

import { useState, useEffect } from "react";

interface Clip {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  reason: string;
  file_path: string | null;
  status: string;
  error: string | null;
}

interface Job {
  id: string;
  youtube_url: string;
  callback_url: string | null;
  transcription_provider?: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  clips: Clip[];
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [transcriptionProvider, setTranscriptionProvider] = useState("deepgram");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptMap, setTranscriptMap] = useState<Record<string, string>>({});

  const API_BASE = "/api-server";

  // Fetch all jobs
  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data);
    } catch (err: any) {
      console.error(err);
      setError("Failed to connect to ClipForge API server. Make sure the API service is running.");
    }
  };

  // Poll active jobs if there are any jobs processing/downloading/etc.
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => {
      const hasRunningJobs = jobs.some(
        (job) =>
          job.status !== "done" &&
          job.status !== "failed"
      );
      if (hasRunningJobs || jobs.length === 0) {
        fetchJobs();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobs.length]);

  // Load transcript if a job is selected
  const fetchTranscript = async (jobId: string) => {
    if (transcriptMap[jobId]) return;
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      // We will look for transcription file locally or fetch if returned.
      // Fastify has a relative file static server. Let's try to fetch transcript.json
      const transRes = await fetch(`${API_BASE}/storage/${jobId}/transcript.json`);
      if (transRes.ok) {
        const transData = await transRes.json();
        setTranscriptMap((prev) => ({
          ...prev,
          [jobId]: transData.fullText || "",
        }));
      }
    } catch (err) {
      console.error("Could not fetch transcript", err);
    }
  };

  useEffect(() => {
    if (selectedJobId) {
      fetchTranscript(selectedJobId);
    }
  }, [selectedJobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          youtube_url: youtubeUrl,
          callback_url: callbackUrl || undefined,
          transcription_provider: transcriptionProvider,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to submit job");
      }

      const data = await res.json();
      setYoutubeUrl("");
      setCallbackUrl("");
      await fetchJobs();
      setSelectedJobId(data.job_id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!confirm("Are you sure you want to delete this clip? This will delete the video file from the server and remove it from the database.")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/clips/${clipId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete clip");
      }

      await fetchJobs();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "badge-pending";
      case "downloading":
        return "badge-downloading";
      case "transcribing":
        return "badge-transcribing";
      case "analyzing":
        return "badge-analyzing";
      case "cutting":
      case "captioning":
        return "badge-cutting";
      case "done":
        return "badge-done";
      case "failed":
        return "badge-failed";
      default:
        return "";
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <h1 className="logo">
          Clip<span>Forge</span>
        </h1>
        <div className="system-status">
          <span className="status-dot"></span>
          System Online
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Side: Submit Job & Job List */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Submit Card */}
          <div className="card">
            <h2 className="card-title">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Clipper Job
            </h2>
            {error && (
              <div
                style={{
                  background: "rgba(231, 76, 60, 0.1)",
                  border: "1px solid rgba(231, 76, 60, 0.2)",
                  color: "var(--status-failed)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  marginBottom: "1rem",
                  lineHeight: "1.4",
                }}
              >
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="youtubeUrl">
                  YouTube Podcast URL
                </label>
                <input
                  id="youtubeUrl"
                  className="form-input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="transcriptionProvider">
                  Transcription Provider
                </label>
                <select
                  id="transcriptionProvider"
                  className="form-input"
                  value={transcriptionProvider}
                  onChange={(e) => setTranscriptionProvider(e.target.value)}
                  disabled={isSubmitting}
                  style={{ background: "rgba(20, 20, 20, 0.8)", color: "white", cursor: "pointer", outline: "none" }}
                >
                  <option value="deepgram">Deepgram Nova-3 (Cloud)</option>
                  <option value="groq">Groq Whisper-large-v3 (Free Cloud)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="callbackUrl">
                  Callback Webhook URL (Optional)
                </label>
                <input
                  id="callbackUrl"
                  className="form-input"
                  type="url"
                  placeholder="https://n8n.yourdomain.com/webhook/..."
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <button className="btn" type="submit" disabled={isSubmitting || !youtubeUrl}>
                {isSubmitting ? (
                  <>
                    <svg
                      style={{ animation: "spin 1s linear infinite" }}
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    Creating...
                  </>
                ) : (
                  "Start Auto Clipper"
                )}
              </button>
            </form>
          </div>

          {/* Job List Card */}
          <div className="card">
            <h2 className="card-title">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9M3 20v-8a2 2 0 0 1 2-2h4M3 12h6M12 4h9M12 8h9M12 12h9" />
              </svg>
              Recent Jobs
            </h2>
            {jobs.length === 0 ? (
              <div className="empty-state">No jobs submitted yet.</div>
            ) : (
              <div className="job-list">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`job-item ${selectedJobId === job.id ? "active" : ""}`}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <div className="job-item-header">
                      <span className="job-url" title={job.youtube_url}>
                        {job.youtube_url}
                      </span>
                      <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                    <div className="job-date">
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right Side: Detailed Clips View */}
        <main className="card" style={{ minHeight: "600px" }}>
          {selectedJob ? (
            <div className="details-area">
              <div className="detail-header">
                <div>
                  <h2 className="detail-title-url">{selectedJob.youtube_url}</h2>
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--muted)", flexWrap: "wrap" }}>
                    <span>Job ID: {selectedJob.id}</span>
                    <span>•</span>
                    <span>Created: {new Date(selectedJob.created_at).toLocaleString()}</span>
                    {selectedJob.transcription_provider && (
                      <>
                        <span>•</span>
                        <span style={{ textTransform: "capitalize" }}>Provider: {selectedJob.transcription_provider}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`badge ${getStatusBadgeClass(selectedJob.status)}`} style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
                  {selectedJob.status}
                </span>
              </div>

              {/* Error Box if job failed */}
              {selectedJob.status === "failed" && (
                <div
                  style={{
                    background: "rgba(231, 76, 60, 0.1)",
                    border: "1px solid rgba(231, 76, 60, 0.2)",
                    color: "var(--status-failed)",
                    padding: "1rem",
                    borderRadius: "8px",
                  }}
                >
                  <h4 style={{ fontWeight: 700, marginBottom: "0.25rem" }}>Job Failed</h4>
                  <p style={{ fontSize: "0.9rem" }}>{selectedJob.error || "An unknown pipeline error occurred."}</p>
                </div>
              )}

              {/* Transcript Preview Section */}
              {transcriptMap[selectedJob.id] && (
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>Full Transcript Preview</h3>
                  <div className="transcript-box">{transcriptMap[selectedJob.id]}</div>
                </div>
              )}

              {/* Clips Section */}
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>
                  Generated Clips ({selectedJob.clips.length})
                </h3>

                {selectedJob.clips.length === 0 ? (
                  <div className="empty-state" style={{ background: "rgba(255,255,255,0.01)", borderRadius: "8px" }}>
                    {selectedJob.status === "done"
                      ? "LLM did not detect any clip segments for this video."
                      : "Clips will be generated and shown here once the job reaches the cutting phase."}
                  </div>
                ) : (
                  <div className="clips-grid">
                    {selectedJob.clips.map((clip) => {
                      const videoUrl = `${API_BASE}/storage/${selectedJob.id}/clip_${clip.id}.mp4`;
                      return (
                        <div key={clip.id} className="clip-card">
                          <div className="clip-player-wrapper">
                            {clip.status === "done" ? (
                              <video className="clip-player" controls preload="metadata">
                                <source src={videoUrl} type="video/mp4" />
                                Your browser does not support the video tag.
                              </video>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  height: "100%",
                                  color: "var(--muted)",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {clip.status === "processing" ? (
                                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                    <svg
                                      style={{ animation: "spin 1s linear infinite" }}
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                    </svg>
                                    Rendering subtitles & cutting...
                                  </div>
                                ) : clip.status === "failed" ? (
                                  <span style={{ color: "var(--status-failed)" }}>Rendering failed: {clip.error || "unknown"}</span>
                                ) : (
                                  "Waiting..."
                                )}
                              </div>
                            )}
                          </div>
                          <div className="clip-info">
                            <h4 className="clip-title">{clip.title}</h4>
                            <div className="clip-metadata">
                              <span>
                                Time: {formatSeconds(clip.start_time)} - {formatSeconds(clip.end_time)}
                              </span>
                              <span>Duration: {Math.round(clip.end_time - clip.start_time)}s</span>
                            </div>
                            <div className="clip-reason">{clip.reason}</div>
                            {(clip.status === "done" || clip.status === "failed") && (
                              <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", width: "100%" }}>
                                {clip.status === "done" && (
                                  <a
                                    href={videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn"
                                    style={{ background: "rgba(255,255,255,0.08)", color: "white", flex: 1, marginTop: 0 }}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                    </svg>
                                    Open
                                  </a>
                                )}
                                <button
                                  onClick={() => handleDeleteClip(clip.id)}
                                  className="btn"
                                  style={{
                                    background: "rgba(231, 76, 60, 0.15)",
                                    color: "var(--status-failed)",
                                    border: "1px solid rgba(231, 76, 60, 0.2)",
                                    flex: clip.status === "done" ? "0 0 45px" : "1",
                                    marginTop: 0,
                                    padding: "0.75rem",
                                  }}
                                  title="Delete Clip"
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                  </svg>
                                  {clip.status !== "done" && " Delete Clip"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="no-job-selected">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 7a2 2 0 0 0-2-2h-4l-3-3H7a2 2 0 0 0-2 2v2H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7Z" />
                <path d="M12 10v6M9 13h6" />
              </svg>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>No Job Selected</h3>
                <p style={{ fontSize: "0.9rem" }}>Select a job from the list or create a new one to begin.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
