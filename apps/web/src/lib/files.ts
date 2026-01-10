const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export function fileUrl(path: string) {
    if (!path) return path;
    if (path.startsWith("/files/")) return `${API_BASE}${path}`;
    return path;
}
