"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Upload, Grid3X3, List, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listAssets, uploadAsset, deleteAsset, type Asset } from "@/lib/libraryApi";

function hashColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const a = 30 + (h % 60);
    const b = 30 + ((h >>> 8) % 60);
    const c = 30 + ((h >>> 16) % 60);
    return `hsl(${a}, ${b}%, ${c}%)`;
}

function PhotoStub({ seed, label }: { seed: string; label?: string }) {
    const bg = hashColor(seed);
    return (
        <div
            className="relative overflow-hidden ring-1 ring-black/5 bg-muted/20 w-full h-full"
            style={{ background: `linear-gradient(135deg, ${bg}, rgba(0,0,0,0))` }}
        >
            <div className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.65),transparent_55%)]" />
            {label && (
                <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-xl bg-background/70 ring-1 ring-black/5">
                    {label}
                </div>
            )}
        </div>
    );
}

export function AssetsView() {
    const [query, setQuery] = useState("");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [kindFilter, setKindFilter] = useState("all");
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [lightboxAsset, setLightboxAsset] = useState<Asset | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load assets from API
    const loadAssets = async () => {
        setLoading(true);
        try {
            const data = await listAssets({
                kind: kindFilter === "all" ? undefined : kindFilter,
                q: query || undefined,
                page,
                page_size: 20,
            });
            setAssets(data.items);
            setTotal(data.total);
        } catch (error: any) {
            toast.error(error.message || "Failed to load assets");
            setAssets([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAssets();
    }, [kindFilter, page]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (page === 1) {
                loadAssets();
            } else {
                setPage(1); // Reset to page 1, which triggers loadAssets
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            await uploadAsset(file, undefined, "Web Upload");
            toast.success(`已上传: ${file.name}`);
            loadAssets(); // Reload list
        } catch (error: any) {
            toast.error(error.message || "Upload failed");
        } finally {
            setLoading(false);
            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDelete = async (assetId: string, filename: string) => {
        if (!confirm(`确定要删除 "${filename}" 吗？`)) return;

        setLoading(true);
        try {
            await deleteAsset(assetId);
            toast.success('已删除');
            loadAssets(); // Reload list
        } catch (error: any) {
            toast.error(error.message || '删除失败');
        } finally {
            setLoading(false);
        }
    };

    const kinds = ["all", "person", "landscape", "architecture", "film", "product", "document"];

    return (
        <div>
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleUpload}
            />

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
                <div className="relative flex-1 w-full sm:w-auto">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索资产、标签…"
                        className="pl-9 rounded-full h-11"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        className="rounded-full h-11 bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        上传素材
                    </Button>
                    <div className="flex rounded-full border border-gray-200 bg-white">
                        <button
                            onClick={() => setView("grid")}
                            className={`p-2 rounded-full ${view === "grid" ? "bg-yellow-200 text-yellow-950" : "text-gray-600"
                                }`}
                        >
                            <Grid3X3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setView("list")}
                            className={`p-2 rounded-full ${view === "list" ? "bg-yellow-200 text-yellow-950" : "text-gray-600"
                                }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Kind filters */}
            <div className="flex flex-wrap gap-2 mb-4">
                {kinds.map((k) => (
                    <button
                        key={k}
                        onClick={() => setKindFilter(k)}
                        className={`rounded-full border px-4 py-2 text-sm transition ${kindFilter === k
                            ? "border-yellow-400 bg-yellow-200 text-yellow-950"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                    >
                        {k === "all" ? "全部" : k}
                    </button>
                ))}
            </div>

            {/* Assets grid/list */}
            <div className="text-sm text-gray-600 mb-4">
                {loading ? "加载中..." : `共 ${total} 个资产`}
            </div>

            {view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {assets.map((asset) => (
                        <div
                            key={asset.id}
                            className="group"
                        >
                            <Card className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-150">
                                <div className="p-0">
                                    {/* Media area - matches homepage */}
                                    <div
                                        className="relative w-full aspect-[9/16] bg-white cursor-pointer overflow-hidden"
                                        onClick={() => setLightboxAsset(asset)}
                                    >
                                        <img
                                            src={`${process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'}${asset.thumb_path || asset.storage_path}`}
                                            alt={asset.filename}
                                            className="absolute inset-0 w-full h-full object-contain"
                                            loading="lazy"
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.style.display = 'none';
                                                const parent = target.parentElement;
                                                if (parent && !parent.querySelector('.fallback')) {
                                                    const fallback = document.createElement('div');
                                                    fallback.className = 'fallback absolute inset-0 flex items-center justify-center text-gray-400 text-sm font-medium';
                                                    fallback.textContent = asset.kind || 'Image';
                                                    parent.appendChild(fallback);
                                                }
                                            }}
                                        />

                                        {/* Delete button - always visible on mobile, hover on desktop */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(asset.id, asset.filename);
                                            }}
                                            className="absolute top-2 right-2 p-2 rounded-full bg-white/90 text-gray-700 shadow-md sm:opacity-0 sm:group-hover:opacity-100 transition hover:bg-red-50 hover:text-red-600"
                                            title="删除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Content area */}
                                    <div className="p-3">
                                        <div className="text-sm font-medium truncate">{asset.filename}</div>
                                        <div className="text-xs text-gray-500 truncate mt-0.5">{asset.source || "Unknown"}</div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <Badge variant="secondary" className="rounded-full text-xs px-2 py-0.5">
                                                {asset.kind}
                                            </Badge>
                                            {asset.people?.length ? (
                                                <Badge variant="secondary" className="rounded-full text-xs px-2 py-0.5">
                                                    {asset.people.length} 人
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {assets.map((asset) => (
                        <button
                            key={asset.id}
                            className="w-full rounded-2xl ring-1 ring-black/5 bg-white hover:bg-gray-50 transition px-3 py-2 text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-black/5 flex-shrink-0 relative bg-gray-100">
                                    <img
                                        src={`${process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'}${asset.thumb_path || asset.storage_path}`}
                                        alt={asset.filename}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                        }}
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">{asset.filename}</div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {asset.id} • {asset.source || "Unknown"} • {asset.kind}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="rounded-xl text-xs">
                                        {asset.kind}
                                    </Badge>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Lightbox */}
            {lightboxAsset && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setLightboxAsset(null)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                        onClick={() => setLightboxAsset(null)}
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <div className="max-w-6xl max-h-full" onClick={(e) => e.stopPropagation()}>
                        {lightboxAsset.kind === 'video' ? (
                            <video
                                src={`${process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'}${lightboxAsset.storage_path}`}
                                controls
                                autoPlay
                                className="max-w-full max-h-[90vh] object-contain"
                            />
                        ) : (
                            <img
                                src={`${process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'}${lightboxAsset.storage_path}`}
                                alt={lightboxAsset.filename}
                                className="max-w-full max-h-[90vh] object-contain"
                            />
                        )}
                        <div className="mt-4 text-white text-center">
                            <div className="font-medium">{lightboxAsset.filename}</div>
                            <div className="text-sm text-gray-400 mt-1">{lightboxAsset.source || "Unknown"} • {lightboxAsset.kind}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
