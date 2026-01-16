/* eslint-disable */
import { ASSET_KIND } from "./data";

const DEFAULT_UMK_BASE_URL = "http://127.0.0.1:7000";
export const UMK_BASE_URL =
    (typeof process !== "undefined" && process?.env?.NEXT_PUBLIC_API_BASE) ||
    (typeof process !== "undefined" && process?.env?.NEXT_PUBLIC_UMK_BASE_URL) ||
    DEFAULT_UMK_BASE_URL;

async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
}

export const api = {
    // Local Ops
    ping: () => fetchJson(`${UMK_BASE_URL}/local/ping`),
    getRefsFolder: (personId: string) => fetchJson(`${UMK_BASE_URL}/local/people/${encodeURIComponent(personId)}/refs-folder`),
    openRefsFolder: (personId: string, prepare: boolean) => fetchJson(`${UMK_BASE_URL}/local/people/${encodeURIComponent(personId)}/refs:open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepare, reveal: true }),
    }),

    // Assets
    listAssets: (kind?: string) => {
        const url = new URL(`${UMK_BASE_URL}/assets`);
        if (kind && kind !== "all") url.searchParams.set("kind", kind);
        return fetchJson(url.toString());
    },
    uploadAsset: async (file: File) => {
        const fd = new FormData();
        fd.append("file", file);
        // Simple logic to guess kind based on file type for now, or let backend default
        // Backend default is "unknown".
        return fetchJson(`${UMK_BASE_URL}/assets/upload`, {
            method: "POST",
            body: fd,
        });
    },

    // People
    listPeople: (status?: string) => {
        const url = new URL(`${UMK_BASE_URL}/people`);
        if (status) url.searchParams.set("status", status);
        return fetchJson(url.toString());
    },
    getPerson: (id: string) => fetchJson(`${UMK_BASE_URL}/people/${encodeURIComponent(id)}`),
};
