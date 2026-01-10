import type {
    PageDTO, ItemDTO, ToolDTO, CategoryDTO,
    ItemVersionDTO, SeriesDTO, SeriesVersionDTO
} from "./types";

import type { DuplicatePageDTO } from "./types";

async function apiFetch<T>(path: string, init?: RequestInit) {
    const res = await fetch(`/api_proxy${path}`, { ...init });
    const rid = res.headers.get("x-request-id");
    if (!res.ok) {
        let payload: any = null;
        try { payload = await res.json(); } catch { }
        const msg = payload?.error?.message || `HTTP ${res.status}`;
        const code = payload?.error?.code || "HTTP_ERROR";
        throw new Error(`${code}: ${msg}${rid ? ` (request_id=${rid})` : ""}`);
    }
    return (await res.json()) as T;
}

export function friendlyError(e: any) {
    return e?.message || String(e);
}

export function listItems(params: Record<string, any>) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
        else sp.set(k, String(v));
    });
    return apiFetch<PageDTO<ItemDTO>>(`/items?${sp.toString()}`);
}

export function getItem(itemId: string) {
    return apiFetch<ItemDTO>(`/items/${itemId}`);
}

export function patchItem(itemId: string, body: any) {
    return apiFetch<ItemDTO>(`/items/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function listItemVersions(itemId: string) {
    return apiFetch<ItemVersionDTO[]>(`/items/${itemId}/versions`);
}

export function createItemVersion(itemId: string, body: { prompt_blob: string; note?: string }) {
    return apiFetch<ItemDTO>(`/items/${itemId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function getTools() {
    return apiFetch<{ items: ToolDTO[] }>(`/tools`);
}

export function getCategories() {
    return apiFetch<{ items: CategoryDTO[] }>(`/categories`);
}

export function listSeries(
    q?: string,
    opts?: { include_deleted?: number; only_deleted?: number }
) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (opts?.include_deleted !== undefined) sp.set("include_deleted", String(opts.include_deleted));
    if (opts?.only_deleted !== undefined) sp.set("only_deleted", String(opts.only_deleted));
    return apiFetch<SeriesDTO[]>(`/series${sp.toString() ? `?${sp}` : ""}`);
}

export function createSeries(body: { name: string; delimiter: string; base_prompt_blob: string; tags: string[] }) {
    return apiFetch<SeriesDTO>(`/series`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

// 追加：series versions + patch + create version
export function listSeriesVersions(seriesId: string) {
    return apiFetch<SeriesVersionDTO[]>(`/series/${seriesId}/versions`);
}

export function patchSeries(seriesId: string, body: { name?: string; delimiter?: string; tags?: string[] }) {
    return apiFetch<SeriesDTO>(`/series/${seriesId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function deleteSeries(seriesId: string) {
    return apiFetch<{ status: string; deleted?: boolean; already_deleted?: boolean }>(`/series/${seriesId}`, {
        method: "DELETE",
    });
}

export function restoreSeries(seriesId: string) {
    return apiFetch<{ status: string; restored?: boolean; already_active?: boolean }>(`/series/${seriesId}/restore`, {
        method: "POST",
    });
}

export function purgeSeries(seriesId: string) {
    return apiFetch<{ status: string; deleted?: any }>(`/series/${seriesId}/purge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "PURGE" }),
    });
}

export function purgeDeletedSeries(limit: number = 2000) {
    return apiFetch<{ status: string; deleted?: any }>(`/series/purge_deleted`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "PURGE", limit }),
    });
}

export function createSeriesVersion(seriesId: string, body: { base_prompt_blob: string; note?: string }) {
    return apiFetch<SeriesDTO>(`/series/${seriesId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function createItem(file: File, meta: any) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("meta", JSON.stringify(meta));
    return apiFetch<ItemDTO>(`/items`, { method: "POST", body: fd });
}


export function bulkPatchItems(body: any) {
    return apiFetch<{ status: string; requested: number; updated: number; missing_item_ids: string[] }>(
        `/items/bulk_patch`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }
    );
}


export function trashItem(itemId: string) {
    return apiFetch<{ status: string; deleted: boolean }>(`/items/${itemId}`, { method: "DELETE" });
}

export function restoreItem(itemId: string) {
    return apiFetch<{ status: string; restored: boolean }>(`/items/${itemId}/restore`, { method: "POST" });
}

export function bulkTrash(itemIds: string[]) {
    return apiFetch<{ status: string; requested: number; trashed: number }>(`/items/bulk_trash`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_ids: itemIds }),
    });
}

export function bulkRestore(itemIds: string[]) {
    return apiFetch<{ status: string; requested: number; restored: number }>(`/items/bulk_restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_ids: itemIds }),
    });
}


export function purgeDeleted(body: { confirm: "PURGE"; limit: number; purge_files: boolean }) {
    return apiFetch<any>(`/_maintenance/purge_deleted`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
export function bulkPurge(itemIds: string[], purge_files: boolean) {
    return apiFetch<any>(`/items/bulk_purge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "PURGE", item_ids: itemIds, purge_files }),
    });
}



export function listDuplicates(params: Record<string, any>) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        sp.set(k, String(v));
    });
    return apiFetch<DuplicatePageDTO>(`/items/duplicates?${sp.toString()}`);
}



export function getMaintenanceConfig() {
    return apiFetch<any>(`/_maintenance/config`);
}
