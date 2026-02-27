"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#f1f5f9",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: "28rem",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#94a3b8", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
            An unexpected error occurred. You can try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#0f172a",
              background: "#34d399",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
