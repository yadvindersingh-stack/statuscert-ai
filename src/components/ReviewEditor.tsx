"use client";

import { useEffect, useState } from "react";

export default function ReviewEditor({
  reviewId,
  initialText
}: {
  reviewId: string;
  initialText: string;
}) {
  const [reviewText, setReviewText] = useState<string>(initialText || "");
  const [status, setStatus] = useState<string>("Idle");

  useEffect(() => {
    // Product decision: always replace editor content with latest generated draft.
    setReviewText(initialText || "");
    setStatus("Draft updated");
  }, [initialText]);

  async function save() {
    setStatus("Saving...");
    const res = await fetch("/api/statuscert/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, reviewText })
    });
    const data = await res.json();
    setStatus(data.ok ? "Saved" : data.error || "Error");
  }

  function resetUnsaved() {
    setReviewText(initialText || "");
    setStatus("Reset");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-semibold">Review Draft</h2>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary" onClick={resetUnsaved}>Reset Unsaved</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
      <textarea
        className="w-full min-h-[680px] rounded-2xl border border-[#DDD6CA] bg-white p-4 text-sm leading-relaxed"
        value={reviewText}
        onChange={(event) => setReviewText(event.target.value)}
      />
      <p className="text-xs text-slate">{status}</p>
    </div>
  );
}
