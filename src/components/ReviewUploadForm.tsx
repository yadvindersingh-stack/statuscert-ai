"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ReviewUploadForm({ firmId, reviewId }: { firmId: string; reviewId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>("Ready");
  const [uploadedCount, setUploadedCount] = useState<number>(0);

  async function handleUpload() {
    if (!files.length) return;
    setStatus("Uploading package...");
    setUploadedCount(0);
    const supabase = createBrowserSupabaseClient();
    const uploaded: { path: string; name: string; size: number }[] = [];

    for (const file of files) {
      const path = `${firmId}/${reviewId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file, {
        upsert: true,
        metadata: { firm_id: firmId, review_id: reviewId }
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      uploaded.push({ path, name: file.name, size: file.size });
      setUploadedCount((current) => current + 1);
    }

    await fetch(`/api/statuscert/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, documents: uploaded })
    });

    setStatus("Upload complete");
    window.location.href = `/app/reviews/${reviewId}`;
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs uppercase tracking-[0.14em] text-slate">PDF Package</span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="form-input"
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
        />
      </label>
      <button className="btn btn-primary" type="button" onClick={handleUpload}>
        Upload PDF package
      </button>
      {files.length ? <p className="text-xs text-slate">{files.length} file(s) selected</p> : null}
      {status === "Uploading package..." ? (
        <div className="space-y-2">
          <p className="text-xs text-slate">Uploaded {uploadedCount} of {files.length}</p>
          <div className="h-2 w-full rounded-full bg-[#E6E2D9]">
            <div
              className="h-2 rounded-full bg-ink transition-all"
              style={{ width: `${files.length ? Math.floor((uploadedCount / files.length) * 100) : 0}%` }}
            />
          </div>
        </div>
      ) : null}
      <p className="text-xs text-slate">{status}</p>
    </div>
  );
}
