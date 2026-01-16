"use client";

import Draggable from "react-draggable";
import { useCallback, useEffect, useMemo, useState, useRef, type DragEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Upload, Copy, Wand2 } from "lucide-react";

import type { ToolDTO, SeriesDTO, CategoryDTO } from "@/lib/types";
// ✅ 按你项目的实际 API 名称对齐：
// - createItem: 你已有 /items 上传
// - createSeries: 你已有 /series 创建
import { createItem, createSeries, friendlyError } from "@/lib/api";

type SeriesMode = "existing" | "new" | "none";

function parseTags(text: string) {
    return text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function mediaTypeFromFile(f: File | null): "image" | "video" | "" {
    if (!f) return "";
    if (f.type.startsWith("video/")) return "video";
    if (f.type.startsWith("image/")) return "image";
    return "";
}

async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("已复制");
}

export function AddItemDialog({
    open,
    onOpenChange,
    tools,
    seriesList,
    categories,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    tools: ToolDTO[];
    seriesList: SeriesDTO[];
    categories: CategoryDTO[];
    onCreated: () => void;
}) {
    const dragRef = useRef<HTMLDivElement>(null);
    const dragCounter = useRef(0);

    // media
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);

    // basic
    const [title, setTitle] = useState("");
    const [toolId, setToolId] = useState<string>("");
    const [categoryId, setCategoryId] = useState<string>("");

    // prompt/tags
    const [prompt, setPrompt] = useState("");
    const [tagsText, setTagsText] = useState("");

    // series
    const [seriesMode, setSeriesMode] = useState<SeriesMode>("none");
    const [seriesId, setSeriesId] = useState<string>("");

    const [newSeriesName, setNewSeriesName] = useState("");
    const [newSeriesDelimiter, setNewSeriesDelimiter] = useState("｜");
    const [newSeriesTags, setNewSeriesTags] = useState("");

    const [busy, setBusy] = useState(false);

    const mtype = useMemo(() => mediaTypeFromFile(file), [file]);

    const previewUrl = useMemo(() => {
        if (!file) return "";
        return URL.createObjectURL(file);
    }, [file]);

    useEffect(() => {
        return () => {
            // cleanup
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const pickedSeries = useMemo(() => {
        if (seriesMode !== "existing") return null;
        return seriesList.find((s) => s.id === seriesId) || null;
    }, [seriesMode, seriesId, seriesList]);

    const displayName = useMemo(() => {
        if (!title.trim()) return "";
        if (seriesMode === "existing" && pickedSeries) {
            return `${pickedSeries.name}${pickedSeries.delimiter}${title.trim()}`;
        }
        if (seriesMode === "new" && newSeriesName.trim()) {
            return `${newSeriesName.trim()}${(newSeriesDelimiter || "｜")}${title.trim()}`;
        }
        return title.trim();
    }, [title, seriesMode, pickedSeries, newSeriesName, newSeriesDelimiter]);

    const canSave = useMemo(() => {
        if (!file) return false;
        if (!title.trim()) return false;
        if (!toolId) return false;
        if (!prompt.trim()) return false;
        if (seriesMode === "existing" && !seriesId) return false;
        if (seriesMode === "new" && !newSeriesName.trim()) return false;
        return true;
    }, [file, title, toolId, prompt, seriesMode, seriesId, newSeriesName]);

    function resetAll() {
        setFile(null);
        setTitle("");
        setToolId("");
        setCategoryId("");
        setPrompt("");
        setTagsText("");
        setSeriesMode("none");
        setSeriesId("");
        setNewSeriesName("");
        setNewSeriesDelimiter("｜");
        setNewSeriesTags("");
        setBusy(false);
    }

    const pickFile = useCallback((f: File | null) => {
        if (!f) return;
        const t = mediaTypeFromFile(f);
        if (!t) {
            toast.error("仅支持图片或视频文件");
            return;
        }
        setFile(f);
    }, []);

    useEffect(() => {
        if (!open) return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items || !items.length) return;
            const fileItem = Array.from(items).find((it) => it.kind === "file");
            if (!fileItem) return;
            const f = fileItem.getAsFile();
            if (!f) return;
            e.preventDefault();
            setDragActive(false);
            pickFile(f);
            toast.success("已从剪贴板导入");
        };
        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [open, pickFile]);

    function handleDragEnter(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (!dragActive) setDragActive(true);
    }

    function handleDragOver(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        if (!dragActive) setDragActive(true);
    }

    function handleDragLeave(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setDragActive(false);
        }
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setDragActive(false);
        const f = e.dataTransfer.files?.[0] || null;
        pickFile(f);
    }

    async function submit() {
        if (!canSave || !file) return;

        setBusy(true);
        try {
            let finalSeriesId: string | undefined = undefined;

            if (seriesMode === "existing") {
                finalSeriesId = seriesId;
            } else if (seriesMode === "new") {
                const s = await createSeries({
                    name: newSeriesName.trim(),
                    delimiter: (newSeriesDelimiter || "｜").trim(),
                    base_prompt_blob: "", // 这里保持空；系列基础提示词建议在 /series 管理页维护
                    tags: parseTags(newSeriesTags),
                });
                finalSeriesId = s.id;
            } else {
                finalSeriesId = undefined;
            }

            const meta = {
                title: title.trim(),
                tool_id: toolId,
                prompt_blob: prompt,
                tags: parseTags(tagsText),
                series_id: finalSeriesId || undefined,
                category_id: categoryId || undefined,
            };

            await createItem(file, meta);

            toast.success("已添加");
            onOpenChange(false);
            resetAll();
            onCreated();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    // title helpers
    function extractTitleFromDisplay() {
        const t = title.trim();
        if (!t) return;

        const delim =
            (seriesMode === "existing" && pickedSeries?.delimiter) ||
            (seriesMode === "new" && (newSeriesDelimiter || "｜")) ||
            "｜";

        // 如果用户把"系列｜条目名"整段填进 title，这里提取条目名
        if (!t.includes(delim)) return;

        const parts = t.split(delim).map((x) => x.trim()).filter(Boolean);
        if (parts.length >= 2) {
            setTitle(parts.slice(1).join(delim));
            toast.success("已提取条目名");
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                onOpenChange(v);
                if (!v) resetAll();
            }}
        >
            <DialogPortal>
                <DialogOverlay />
                <DialogPrimitive.Content
                    className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
                >
                    <Draggable handle=".drag-handle" nodeRef={dragRef}>
                        <div ref={dragRef} className="w-[min(96vw,1100px)] rounded-3xl bg-white shadow-2xl outline-none pointer-events-auto">
                            {/* 顶部拖动条 */}
                            <div className="drag-handle flex cursor-move items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-yellow-50 to-white">
                                <DialogPrimitive.Title className="text-base font-semibold">添加条目</DialogPrimitive.Title>
                                <button
                                    type="button"
                                    className="rounded-full p-2 hover:bg-gray-100 transition"
                                    onClick={() => onOpenChange(false)}
                                    aria-label="close"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="px-6 pb-6">
                                <div className="grid gap-4 md:grid-cols-[360px_1fr] mt-4">
                                    {/* Left: Media */}
                                    <div
                                        className="rounded-3xl border border-gray-200 bg-gray-50 p-4"
                                        onDragEnter={handleDragEnter}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <div className="flex items-center gap-2 border-l-4 border-yellow-300 pl-3 text-xs font-semibold text-gray-800">
                                            <span>① 上传媒体 *</span>
                                            <span
                                                className="rounded-full border bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600"
                                                title="支持直接粘贴图片/视频（Ctrl/Cmd+V）"
                                            >
                                                支持粘贴
                                            </span>
                                            <span
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border bg-white text-[10px] font-semibold text-gray-500"
                                                title="打开弹窗后，直接在页面按 Ctrl/Cmd+V 即可从剪贴板导入媒体文件。"
                                            >
                                                ?
                                            </span>
                                        </div>
                                        <div className="mt-3 rounded-2xl border bg-white p-3">
                                            <label
                                                className={[
                                                    "flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-3 py-3 text-sm transition",
                                                    dragActive
                                                        ? "border-yellow-300 bg-yellow-50 text-yellow-900"
                                                        : "bg-gray-50 text-gray-700 hover:bg-gray-100",
                                                ].join(" ")}
                                            >
                                                <Upload className="h-4 w-4" />
                                                <span>{file ? "更换文件" : "选择图片/视频（支持拖拽/粘贴）"}</span>
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*,video/*"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0] || null;
                                                        pickFile(f);
                                                    }}
                                                />
                                            </label>

                                            {file ? (
                                                <div className="mt-2 rounded-2xl border bg-gray-50 px-3 py-2 text-xs text-gray-700">
                                                    {file.name} · {(file.size / 1024).toFixed(0)} KB · {file.type}
                                                </div>
                                            ) : null}

                                            <div className="mt-3 overflow-hidden rounded-2xl border bg-gray-100 aspect-[4/5]">
                                                {file ? (
                                                    mtype === "video" ? (
                                                        <video
                                                            className="h-full w-full object-cover"
                                                            src={previewUrl}
                                                            controls
                                                        />
                                                    ) : (
                                                        <img
                                                            className="h-full w-full object-cover"
                                                            src={previewUrl}
                                                            alt="preview"
                                                        />
                                                    )
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                                                        未选择文件
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-3 rounded-2xl border bg-yellow-50 p-2 text-xs text-gray-600">
                                                保存后将自动生成缩略图，并执行自动分类（低置信度会归为"未分类"，可在详情页快速改分类）。
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Form */}
                                    <div className="rounded-3xl border border-gray-200 bg-white p-4 relative">
                                        {/* 可滚动内容区 */}
                                        <div className="max-h-[78vh] overflow-auto pr-2 pb-24 space-y-4">
                                            {/* 基本信息 */}
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="border-l-4 border-yellow-300 pl-3 text-xs font-semibold text-gray-800 flex items-center justify-between">
                                                    <span>② 基本信息</span>
                                                    {!tools.length ? (
                                                        <span className="text-xs text-red-600 border-l-0">
                                                            工具列表为空：请确认 /tools 可用
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="grid gap-3 md:grid-cols-[1fr_260px] mt-3">
                                                    <div className="space-y-2">
                                                        <div className="text-xs font-semibold text-gray-700">标题（条目名） *</div>
                                                        <Input
                                                            value={title}
                                                            onChange={(e) => setTitle(e.target.value)}
                                                            placeholder="例如：海边逆光"
                                                            className="rounded-2xl"
                                                        />
                                                        <div className="text-xs text-gray-500">
                                                            显示名预览：{displayName ? <span className="font-semibold text-gray-700">{displayName}</span> : "—"}
                                                        </div>

                                                        <div className="flex flex-wrap gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="h-9 rounded-full"
                                                                onClick={extractTitleFromDisplay}
                                                                disabled={!title.trim()}
                                                            >
                                                                <Wand2 className="mr-2 h-4 w-4" />
                                                                从"系列｜条目"提取条目名
                                                            </Button>

                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="h-9 rounded-full"
                                                                onClick={() => displayName && copyText(displayName)}
                                                                disabled={!displayName}
                                                            >
                                                                <Copy className="mr-2 h-4 w-4" />
                                                                复制显示名
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="text-xs font-semibold text-gray-700">工具 *</div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {tools.map((t) => {
                                                                const active = toolId === t.id;
                                                                return (
                                                                    <button
                                                                        key={t.id}
                                                                        type="button"
                                                                        onClick={() => setToolId(t.id)}
                                                                        className={[
                                                                            "rounded-2xl border px-3 py-2 text-sm transition h-11",
                                                                            active
                                                                                ? "border-yellow-400 bg-yellow-200 text-yellow-950"
                                                                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                                                                        ].join(" ")}
                                                                    >
                                                                        {t.label}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2 md:col-span-2">
                                                    <div className="text-xs font-semibold text-gray-700">分类（可选）</div>
                                                    <select
                                                        className="w-full rounded-2xl border px-3 py-2 text-sm bg-white"
                                                        value={categoryId}
                                                        onChange={(e) => setCategoryId(e.target.value)}
                                                    >
                                                        <option value="">（自动分类）</option>
                                                        {categories.map((c) => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="text-xs text-gray-500">
                                                        手动选择分类后，该分类将被锁定，不会被自动分类覆盖。
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 组织归档 */}
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="border-l-4 border-yellow-300 pl-3 text-xs font-semibold text-gray-800">③ 组织归档（系列）</div>
                                                <div className="mt-3">
                                                    <Tabs value={seriesMode} onValueChange={(v) => setSeriesMode(v as SeriesMode)}>
                                                        <TabsList className="w-full bg-white rounded-2xl p-1 border">
                                                            <TabsTrigger value="none" className="flex-1">无系列</TabsTrigger>
                                                            <TabsTrigger value="existing" className="flex-1">选择已有</TabsTrigger>
                                                            <TabsTrigger value="new" className="flex-1">新建系列</TabsTrigger>
                                                        </TabsList>

                                                        <TabsContent value="none" className="mt-3">
                                                            <div className="rounded-2xl border bg-white p-3 text-sm text-gray-700">
                                                                不归入任何系列（显示名仅为标题本身）。
                                                            </div>
                                                        </TabsContent>

                                                        <TabsContent value="existing" className="mt-3 space-y-2">
                                                            <div className="text-xs font-semibold text-gray-700">选择系列 *</div>
                                                            <select
                                                                className="w-full rounded-2xl border px-3 py-2 text-sm bg-white"
                                                                value={seriesId}
                                                                onChange={(e) => setSeriesId(e.target.value)}
                                                            >
                                                                <option value="">（请选择）</option>
                                                                {seriesList.map((s) => (
                                                                    <option key={s.id} value={s.id}>
                                                                        {s.name}（v{s.current_version.v}）
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <div className="text-xs text-gray-500">
                                                                建议在「系列」页面维护系列 Base Prompt；这里仅负责挂接。
                                                            </div>
                                                        </TabsContent>

                                                        <TabsContent value="new" className="mt-3 grid gap-3 md:grid-cols-[1fr_120px]">
                                                            <div className="space-y-2">
                                                                <div className="text-xs font-semibold text-gray-700">系列名 *</div>
                                                                <Input
                                                                    value={newSeriesName}
                                                                    onChange={(e) => setNewSeriesName(e.target.value)}
                                                                    placeholder="例如：女子海边电影风格肖像"
                                                                    className="rounded-2xl"
                                                                />
                                                                <div className="text-xs text-gray-500">
                                                                    新建系列后会自动挂接到该条目。
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="text-xs font-semibold text-gray-700">分隔符</div>
                                                                <Input
                                                                    value={newSeriesDelimiter}
                                                                    onChange={(e) => setNewSeriesDelimiter(e.target.value)}
                                                                    placeholder="｜"
                                                                    className="rounded-2xl"
                                                                />
                                                            </div>

                                                            <div className="space-y-2 md:col-span-2">
                                                                <div className="text-xs font-semibold text-gray-700">系列 Tags（可选，逗号分隔）</div>
                                                                <Input
                                                                    value={newSeriesTags}
                                                                    onChange={(e) => setNewSeriesTags(e.target.value)}
                                                                    placeholder="portrait, cinematic"
                                                                    className="rounded-2xl"
                                                                />
                                                            </div>
                                                        </TabsContent>
                                                    </Tabs>
                                                </div>
                                            </div>

                                            {/* Prompt */}
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="border-l-4 border-yellow-300 pl-3 text-xs font-semibold text-gray-800">④ 提示词（单文本块） *</div>
                                                <div className="mt-3">
                                                    <textarea
                                                        className="min-h-[220px] w-full rounded-2xl border px-3 py-2 text-sm bg-white"
                                                        value={prompt}
                                                        onChange={(e) => setPrompt(e.target.value)}
                                                        placeholder="把完整 prompt 原样粘贴进来（可包含参数/反向词/备注等）"
                                                    />
                                                </div>

                                                <div className="space-y-2 mt-3">
                                                    <div className="text-xs font-semibold text-gray-700">Tags（可选，逗号分隔）</div>
                                                    <Input
                                                        value={tagsText}
                                                        onChange={(e) => setTagsText(e.target.value)}
                                                        placeholder="portrait, cinematic, test"
                                                        className="rounded-2xl"
                                                    />
                                                </div>
                                            </div>

                                            {!canSave ? (
                                                <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
                                                    必填：媒体、标题、工具、提示词；若选择"已有系列/新建系列"，系列信息也为必填。
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* 固定底栏 */}
                                        <div className="absolute bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur p-4 rounded-b-3xl">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    className="h-11 rounded-full px-6"
                                                    onClick={() => onOpenChange(false)}
                                                    disabled={busy}
                                                >
                                                    取消
                                                </Button>
                                                <Button
                                                    className="h-11 rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200 px-6"
                                                    onClick={submit}
                                                    disabled={!canSave || busy}
                                                    title={!canSave ? "请先完成必填项：媒体/标题/工具/提示词/系列(若选择了)" : ""}
                                                >
                                                    {busy ? "保存中…" : "保存"}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Draggable>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
