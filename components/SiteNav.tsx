import Link from "next/link";

const LINKS = [
  { href: "/", label: "対局" },
  { href: "/learn/yaku", label: "役一覧" },
  { href: "/learn/fu", label: "符計算ドリル" },
];

export function SiteNav() {
  return (
    <header className="flex h-11 items-center gap-1 border-b border-white/10 px-3" style={{ background: "rgba(0,0,0,0.25)" }}>
      <span className="mr-3 font-bold tracking-wide" style={{ fontFamily: "var(--font-tile)" }}>
        学生麻雀 練習卓
      </span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1 text-sm hover:bg-white/10">
          {l.label}
        </Link>
      ))}
    </header>
  );
}
