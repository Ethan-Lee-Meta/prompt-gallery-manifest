"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
    { label: "首页", href: "/" },
    { label: "系列", href: "/series" },
    { label: "素材", href: "/library" },
    { label: "重复项", href: "/duplicates" },
    { label: "维护", href: "/maintenance" },
];

function isActive(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
}

export function Topbar() {
    const pathname = usePathname();

    const active = useMemo(() => {
        return NAV.map((x) => ({ ...x, active: isActive(pathname, x.href) }));
    }, [pathname]);

    return (
        <div className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
            <div className="h-1 w-full bg-yellow-300" />

            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
                <div className="flex items-center gap-3">
                    <Link href="/" className="text-sm font-semibold text-gray-900">
                        提示词库
                    </Link>

                    <div className="hidden h-6 w-px bg-gray-200 md:block" />

                    <nav className="hidden items-center gap-1 md:flex">
                        {active.map((x) => (
                            <Link
                                key={x.href}
                                href={x.href}
                                className={[
                                    "rounded-full px-4 py-2 text-sm transition",
                                    x.active
                                        ? "bg-yellow-200 text-yellow-950"
                                        : "text-gray-700 hover:bg-gray-50",
                                ].join(" ")}
                            >
                                {x.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-2">{/* 右侧预留 */}</div>
            </div>

            {/* mobile nav */}
            <div className="border-t bg-white md:hidden">
                <div className="mx-auto flex max-w-7xl items-center gap-1 px-2 py-2">
                    {active.map((x) => (
                        <Link
                            key={x.href}
                            href={x.href}
                            className={[
                                "flex-1 rounded-2xl px-3 py-2 text-center text-sm transition",
                                x.active
                                    ? "bg-yellow-200 text-yellow-950"
                                    : "text-gray-700 hover:bg-gray-50",
                            ].join(" ")}
                        >
                            {x.label}
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
