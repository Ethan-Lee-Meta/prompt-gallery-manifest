export type ToolDTO = { id: string; key: string; label: string };
export type CategoryDTO = { id: string; name: string };
export type AutoCandidateDTO = { category: CategoryDTO; score: number };

export type ItemVersionDTO = {
    id: string; v: number; prompt_blob: string; note?: string | null; created_at: string;
};

export type SeriesVersionDTO = {
    id: string; v: number; base_prompt_blob: string; note?: string | null; created_at: string;
};

export type SeriesDTO = {
    id: string;
    name: string;
    delimiter: string;
    tags: string[];
    current_version: SeriesVersionDTO;
    created_at: string;
    updated_at: string;
};

export type ItemDTO = {
    id: string;
    title: string;
    tool: ToolDTO;
    media_type: "image" | "video";
    media_url: string;
    thumb_url: string;
    poster_url?: string | null;
    series: { id?: string | null; name_snapshot?: string | null; delimiter_snapshot?: string | null };
    category: CategoryDTO;
    auto_category?: { category: CategoryDTO; confidence?: number | null } | null;
    tags: string[];
    auto_candidates?: AutoCandidateDTO[];
    current_version: ItemVersionDTO;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    deleted_at?: string | null;
};

export type PageDTO<T> = { items: T[]; page: number; page_size: number; total: number };


export type DuplicateItemLiteDTO = {
    id: string;
    title: string;
    media_type: "image" | "video";
    thumb_url: string;
    media_url: string;
    tool_label: string;
    created_at: string;
    is_deleted: boolean;
    media_exists: boolean;
    thumb_exists: boolean;
    poster_exists?: boolean | null;
};

export type DuplicateGroupDTO = {
    key: string;
    media_sha256: string;
    tool_id?: string | null;
    tool_label?: string | null;
    count: number;
    items: DuplicateItemLiteDTO[];
};

export type DuplicatePageDTO = {
    page: number;
    page_size: number;
    total_groups: number;
    groups: DuplicateGroupDTO[];
};
