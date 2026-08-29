"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ftccMainNav } from "@/lib/site";
import { Logo } from "../site/logo";

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 md:px-10 lg:px-12">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          {ftccMainNav.map((item) => (
            <Link
              key={item.href}
              href={`/${item.href}`}
              className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA Button */}
        <Link
          href="/register"
          className="hidden md:inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium whitespace-nowrap text-primary-foreground transition hover:bg-primary/90"
        >
          Choose Our Facility Now!
        </Link>

        {/* Mobile Menu Button */}
        <button
          onClick={toggleMenu}
          className="md:hidden p-2 text-slate-600 hover:text-slate-950"
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-white/60 bg-white/80 backdrop-blur-xl">
          <div className="flex flex-col px-6 py-4 space-y-4">
            {ftccMainNav.map((item) => (
              <Link
                key={item.href}
                href={`/#${item.href}`}
                onClick={toggleMenu}
                className="text-sm font-medium text-slate-600 transition hover:text-slate-950 py-2"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/docs"
              onClick={toggleMenu}
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium whitespace-nowrap text-primary-foreground transition hover:bg-primary/90 w-full"
            >
              Open UI Docs
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
