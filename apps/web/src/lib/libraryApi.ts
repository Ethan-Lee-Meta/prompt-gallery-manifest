/**
 * Library API client for frontend
 */

const LIBRARY_API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export type Asset = {
    id: string;
    kind: string;
    filename: string;
    source?: string;
    storage_path: string;
    thumb_path?: string;
    created_at: number;
    people?: string[];
    tags?: string[];
};

export type Person = {
    id: string;
    name: string;
    status: string;
    confidence: number;
    faces_count: number;
    assets_count: number;
    coverage: Record<string, boolean>;
    refs: Record<string, string>;
    tags?: string[];
};

export type Face = {
    id: string;
    asset_id: string;
    person_id?: string;
    yaw?: number;
    pitch?: number;
    roll?: number;
    quality?: number;
    bucket?: string;
    excluded: boolean;
    pinned: boolean;
    crop_path?: string;
};

// Assets API
export async function listAssets(params: {
    kind?: string;
    q?: string;
    page?: number;
    page_size?: number;
}) {
    const query = new URLSearchParams();
    if (params.kind) query.set("kind", params.kind);
    if (params.q) query.set("q", params.q);
    if (params.page) query.set("page", params.page.toString());
    if (params.page_size) query.set("page_size", params.page_size.toString());

    const res = await fetch(`${LIBRARY_API_BASE}/library/assets?${query}`);
    if (!res.ok) throw new Error(`Failed to list assets: ${res.statusText}`);
    return res.json();
}

export async function uploadAsset(file: File, kind?: string, source?: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (kind) formData.append("kind", kind);
    if (source) formData.append("source", source);

    const res = await fetch(`${LIBRARY_API_BASE}/library/assets/upload`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error(`Failed to upload asset: ${res.statusText}`);
    return res.json();
}

export async function getAsset(assetId: string) {
    const res = await fetch(`${LIBRARY_API_BASE}/library/assets/${assetId}`);
    if (!res.ok) throw new Error(`Failed to get asset: ${res.statusText}`);
    return res.json();
}

// People API
export async function listPeople(params: {
    status?: string;
    q?: string;
    page?: number;
    page_size?: number;
}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.q) query.set("q", params.q);
    if (params.page) query.set("page", params.page.toString());
    if (params.page_size) query.set("page_size", params.page_size.toString());

    const res = await fetch(`${LIBRARY_API_BASE}/library/people?${query}`);
    if (!res.ok) throw new Error(`Failed to list people: ${res.statusText}`);
    return res.json();
}

export async function getPerson(personId: string) {
    const res = await fetch(`${LIBRARY_API_BASE}/library/people/${personId}`);
    if (!res.ok) throw new Error(`Failed to get person: ${res.statusText}`);
    return res.json();
}

export async function verifyPerson(personId: string) {
    const res = await fetch(`${LIBRARY_API_BASE}/library/people/${personId}/verify`, {
        method: "POST",
    });
    if (!res.ok) throw new Error(`Failed to verify person: ${res.statusText}`);
    return res.json();
}

// Faces API
export async function pinFace(faceId: string, pinned: boolean) {
    const res = await fetch(`${LIBRARY_API_BASE}/library/faces/${faceId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
    });
    if (!res.ok) throw new Error(`Failed to pin face: ${res.statusText}`);
    return res.json();
}

export async function excludeFace(faceId: string, excluded: boolean) {
    const res = await fetch(`${LIBRARY_API_BASE}/library/faces/${faceId}/exclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded }),
    });
    if (!res.ok) throw new Error(`Failed to exclude face: ${res.statusText}`);
    return res.json();
}

export async function setPersonRef(personId: string, bucket: string, faceId: string) {
    const res = await fetch(`${LIBRARY_API_BASE}/library/faces/people/${personId}/refs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, face_id: faceId }),
    });
    if (!res.ok) throw new Error(`Failed to set ref: ${res.statusText}`);
    return res.json();
}

// Local Agent API
export async function pingLocalAgent() {
    const res = await fetch(`${LIBRARY_API_BASE}/local/ping`);
    if (!res.ok) throw new Error(`Failed to ping agent: ${res.statusText}`);
    return res.json();
}

export async function getRefsFolder(personId: string) {
    const res = await fetch(`${LIBRARY_API_BASE}/local/people/${personId}/refs-folder`);
    if (!res.ok) throw new Error(`Failed to get refs folder: ${res.statusText}`);
    return res.json();
}

export async function openRefsFolder(personId: string, prepare = true, reveal = true) {
    const res = await fetch(`${LIBRARY_API_BASE}/local/people/${personId}/refs:open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepare, reveal }),
    });
    if (!res.ok) throw new Error(`Failed to open refs folder: ${res.statusText}`);
    return res.json();
}
