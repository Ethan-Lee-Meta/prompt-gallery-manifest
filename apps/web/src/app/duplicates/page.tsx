"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import type { DuplicateGroupDTO, DuplicateItemLiteDTO, CategoryDTO } from "@/lib/types";
import { listDuplicates, bulkTrash, getCategories, friendlyError } from "@/lib/api";
import { fileUrl } from "@/lib/files";
import { ItemDetailDialog } from "@/components/ItemDetailDialog";

function shortSha(s: string) {
    return s ? `${s.slice(0, 10)}…${s.slice(-6)}` : "";
}

async function copyText(t: string) {
    await navigator.clipboard.writeText(t);
    toast.success("已复制");
}

export default function DuplicatesPage() {
    const [scope, setScope] = useState<"media_sha256" | "media_sha256_tool">("media_sha256");
    const [includeDeleted, setIncludeDeleted] = useState(false);
    const [minCount, setMinCount] = useState(2);
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [strategy, setStrategy] = useState<"newest" | "oldest" | "file_exists" | "active_first">("newest");

    const [groups, setGroups] = useState<DuplicateGroupDTO[]>([]);
    const [totalGroups, setTotalGroups] = useState(0);
    const [busy, setBusy] = useState(false);

    // detail dialog
    const [cats, setCats] = useState<CategoryDTO[]>([]);
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);

    // per-group keep selection
    const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});

    useEffect(() => {
        (async () => {
            try {
                const c = await getCategories();
                setCats(c.items);
            } catch {
                setCats([]);
            }
        })();
    }, []);

    async function refresh(nextPage = page) {
        setBusy(true);
        try {
            const data = await listDuplicates({
                scope,
                include_deleted: includeDeleted ? 1 : 0,
                min_count: minCount,
                page: nextPage,
                page_size: pageSize,
                q: q.trim() || undefined,
            });
            setGroups(data.groups);
            setTotalGroups(data.total_groups);
            setPage(data.page);

            // default keep: newest (first item) if not set
            setKeepByGroup((prev) => {
                const next = { ...prev };
                for (const g of data.groups) {
                    if (!next[g.key] && g.items?.[0]?.id) next[g.key] = g.items[0].id;
                }
                return next;
            });
        } catch (e: any) {
            toast.error(friendlyError(e));
            setGroups([]);
            setTotalGroups(0);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        refresh(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, includeDeleted, minCount]);

    useEffect(() => {
        const t = setTimeout(() => refresh(1), 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    const canPrev = page > 1 && !busy;
    const canNext = !busy && page * pageSize < totalGroups;

    async function trashOthers(g: DuplicateGroupDTO) {
        const keepId = keepByGroup[g.key];
        if (!keepId) return toast.error("请先选择要保留的条目");
        const others = g.items.map((x) => x.id).filter((id) => id !== keepId);
        if (!others.length) return toast.message("该组无可移入回收站的条目");

        try {
            setBusy(true);
            const res = await bulkTrash(others);
            toast.success(`已移入回收站：${res.trashed}`);
            await refresh(page);
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-7xl px-4 py-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-lg font-semibold text-gray-900">Duplicates（重复项）</div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="rounded-full" onClick={() => (window.location.href = "/")}>
                            返回首页
                        </Button>
                    </div>
                </div>

                {/* controls */}
                <div className="mt-4 grid gap-3 rounded-3xl border bg-white p-4 shadow-sm md:grid-cols-5">
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">分组范围 scope</div>
                        <select
                            className="w-full rounded-2xl border px-3 py-2 text-sm"
                            value={scope}
                            onChange={(e) => setScope(e.target.value as any)}
                        >
                            <option value="media_sha256">media_sha256（跨工具）</option>
                            <option value="media_sha256_tool">media_sha256_tool（同工具内）</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">min_count</div>
                        <Input type="number" value={minCount} onChange={(e) => setMinCount(Math.max(2, Number(e.target.value || 2)))} />
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">sha 过滤（可选）</div>
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="sha 子串/前缀" />
                    </div>

                    <div className="space-y-2 text-center md:text-left">
                        <div className="text-xs font-semibold text-gray-700">包含回收站</div>
                        <label className="flex h-10 items-center justify-center gap-2 text-sm md:justify-start">
                            <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
                            include_deleted
                        </label>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">自动策略</div>
                        <select
                            className="w-full rounded-2xl border px-3 py-2 text-sm"
                            value={strategy}
                            onChange={(e) => setStrategy(e.target.value as any)}
                        >
                            <option value="newest">保留最新（默认）</option>
                            <option value="oldest">保留最早</option>
                            <option value="file_exists">文件存在优先 (media/thumb/poster)</option>
                            <option value="active_first">未删除优先 (含回收站时)</option>
                        </select>

                        <Button
                            className="mt-2 w-full rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                            disabled={busy || groups.length === 0}
                            onClick={async () => {
                                // gather all to trash
                                const allToTrash: string[] = [];
                                const keepMap: Record<string, string> = {};

                                const pickKeep = (g: DuplicateGroupDTO): string | null => {
                                    if (!g.items?.length) return null;

                                    if (strategy === "newest") return g.items[0].id;
                                    if (strategy === "oldest") return g.items[g.items.length - 1].id;

                                    if (strategy === "active_first") {
                                        const active = g.items.find((x) => !x.is_deleted);
                                        return active?.id || g.items[0].id;
                                    }

                                    // file_exists
                                    const score = (x: DuplicateItemLiteDTO) => {
                                        let s = 0;
                                        if (x.media_exists) s += 10;
                                        if (x.thumb_exists) s += 3;
                                        if (x.media_type === "video" && x.poster_exists) s += 2;
                                        if (!x.is_deleted) s += 1;
                                        return s;
                                    };
                                    let best = g.items[0];
                                    let bestScore = score(best);
                                    for (const x of g.items) {
                                        const sc = score(x);
                                        if (sc > bestScore) {
                                            best = x;
                                            bestScore = sc;
                                        }
                                    }
                                    return best.id;
                                };

                                for (const g of groups) {
                                    const keepId = pickKeep(g);
                                    if (!keepId) continue;
                                    keepMap[g.key] = keepId;
                                    for (const it of g.items) {
                                        if (it.id !== keepId) allToTrash.push(it.id);
                                    }
                                }

                                setKeepByGroup((prev) => ({ ...prev, ...keepMap }));

                                const uniq = Array.from(new Set(allToTrash));
                                if (!uniq.length) return toast.message("没有可移入回收站的条目");

                                const chunk = 500;
                                try {
                                    setBusy(true);
                                    let totalTrashed = 0;
                                    for (let i = 0; i < uniq.length; i += chunk) {
                                        const part = uniq.slice(i, i + chunk);
                                        const res = await bulkTrash(part);
                                        totalTrashed += res.trashed || 0;
                                    }
                                    toast.success(`已按策略处理本页：移入回收站 ${totalTrashed} 条`);
                                    await refresh(page);
                                } catch (e: any) {
                                    toast.error(friendlyError(e));
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            对本页所有组执行
                        </Button>
                    </div>
                </div>

                <div className="mt-4 text-sm text-gray-600">
                    {busy ? "加载中…" : `共 ${totalGroups} 组重复项`}
                </div>

                {/* groups */}
                <div className="mt-4 space-y-4">
                    {groups.map((g) => {
                        const keepId = keepByGroup[g.key];
                        return (
                            <div key={g.key} className="rounded-3xl border bg-white p-4 shadow-sm">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="secondary" className="rounded-full">count: {g.count}</Badge>
                                            <Badge variant="outline" className="rounded-full">sha: {shortSha(g.media_sha256)}</Badge>
                                            {g.tool_label ? <Badge variant="secondary" className="rounded-full">tool: {g.tool_label}</Badge> : null}
                                            <Button
                                                variant="outline"
                                                className="h-8 rounded-full px-3"
                                                onClick={() => copyText(g.media_sha256)}
                                            >
                                                <Copy className="mr-2 h-4 w-4" />复制 sha
                                            </Button>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            key: {g.key}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            className="rounded-full"
                                            disabled={busy}
                                            onClick={async () => {
                                                const missingIds = g.items
                                                    .filter(it =>
                                                        !it.media_exists || !it.thumb_exists || (it.media_type === "video" && it.poster_exists === false)
                                                    )
                                                    .map(it => it.id);

                                                const uniq = Array.from(new Set(missingIds));
                                                if (!uniq.length) return toast.message("本组无缺失文件条目");

                                                try {
                                                    setBusy(true);
                                                    const res = await bulkTrash(uniq);
                                                    toast.success(`已移入回收站（缺失文件）：${res.trashed}`);
                                                    await refresh(page);
                                                } catch (e: any) {
                                                    toast.error(friendlyError(e));
                                                } finally {
                                                    setBusy(false);
                                                }
                                            }}
                                        >
                                            缺失文件 → 回收站
                                        </Button>
                                        <Button
                                            className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                            onClick={() => trashOthers(g)}
                                            disabled={busy}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />保留 1 条，其余移入回收站
                                        </Button>
                                    </div>
                                </div>

                                {/* items */}
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {g.items.map((it) => {
                                        const checked = keepId === it.id;
                                        return (
                                            <div key={it.id} className={`rounded-3xl border p-3 ${checked ? "border-yellow-400 bg-yellow-50" : "bg-white"}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="flex items-center gap-2 text-sm">
                                                        <input
                                                            type="radio"
                                                            name={`keep-${g.key}`}
                                                            checked={checked}
                                                            onChange={() => setKeepByGroup((prev) => ({ ...prev, [g.key]: it.id }))}
                                                        />
                                                        保留
                                                    </label>
                                                    <Badge variant="secondary" className="rounded-full">{it.tool_label}</Badge>
                                                </div>

                                                <button
                                                    className="mt-2 block w-full overflow-hidden rounded-2xl border"
                                                    onClick={() => { setDetailId(it.id); setDetailOpen(true); }}
                                                >
                                                    {it.media_type === "video" ? (
                                                        <video
                                                            className="h-36 w-full object-cover"
                                                            src={fileUrl(it.media_url)}
                                                            poster={fileUrl(it.thumb_url || "") || undefined}
                                                            preload="metadata"
                                                            muted
                                                            playsInline
                                                            onLoadedMetadata={(e) => {
                                                                const v = e.currentTarget;
                                                                const dur = Number.isFinite(v.duration) ? v.duration : 0;
                                                                if (dur > 0.1) {
                                                                    try { v.currentTime = Math.min(0.1, dur - 0.05); } catch { }
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <img
                                                            src={fileUrl(it.thumb_url)}
                                                            alt={it.title}
                                                            className="h-36 w-full object-cover"
                                                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = fileUrl(it.media_url); }}
                                                        />
                                                    )}
                                                </button>

                                                <div className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">{it.title}</div>
                                                <div className="mt-1 text-xs text-gray-500">{it.created_at}</div>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {it.is_deleted ? <Badge variant="outline" className="rounded-full">deleted</Badge> : null}
                                                    {!it.media_exists || !it.thumb_exists || (it.media_type === "video" && it.poster_exists === false) ? (
                                                        <Badge variant="outline" className="rounded-full text-red-600 border-red-200">missing_file</Badge>
                                                    ) : null}
                                                    <Button
                                                        variant="outline"
                                                        className="h-8 rounded-full px-3"
                                                        onClick={() => { setDetailId(it.id); setDetailOpen(true); }}
                                                    >
                                                        <ExternalLink className="mr-2 h-4 w-4" />详情
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {g.items.length < g.count ? (
                                    <div className="mt-2 text-xs text-gray-600">
                                        仅展示前 {g.items.length} 条（items_limit）。如需更多，可提高 items_limit 或缩小筛选范围。
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {/* pagination */}
                <div className="mt-6 flex items-center justify-center gap-2">
                    <Button variant="outline" disabled={!canPrev} onClick={() => refresh(page - 1)}>上一页</Button>
                    <div className="text-sm text-gray-600">第 {page} 页</div>
                    <Button variant="outline" disabled={!canNext} onClick={() => refresh(page + 1)}>下一页</Button>
                </div>

                {/* item detail */}
                <ItemDetailDialog
                    open={detailOpen}
                    onOpenChange={setDetailOpen}
                    itemId={detailId}
                    categories={cats}
                    onUpdated={() => refresh(page)}
                />
            </div>
        </div>
    );
}
