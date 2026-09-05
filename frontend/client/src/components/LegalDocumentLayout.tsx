import type { ReactNode } from "react";
import { Link } from "wouter";
import { PageHead } from "@/components/PageHead";

type LegalDocumentLayoutProps = {
  title: string;
  children: ReactNode;
};

export function LegalDocumentLayout({ title, children }: LegalDocumentLayoutProps) {
  return (
    <>
      <PageHead title={title} noIndex />
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl px-5 pt-12 pb-24 sm:px-8 sm:pb-28">
          <Link href="/" className="text-sm text-muted-foreground transition hover:text-foreground">
            ← Back
          </Link>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-[2.5rem]">{title}</h1>
          <div className="prose prose-invert mt-10 max-w-none space-y-6 text-base leading-7 text-muted-foreground">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
