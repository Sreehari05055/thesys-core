import { Link } from "wouter";
import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { isExternalLegalUrl, termsHref } from "@/lib/legalLinks";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, siteNameForCopy } from "@/lib/siteMeta";

function LegalLink({ href, label }: { href: string; label: string }) {
  const className = "text-primary underline-offset-2 hover:underline";
  if (isExternalLegalUrl(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout title="Privacy Policy">
      <p className="text-base text-muted-foreground/90">
        This policy explains who operates {siteNameForCopy()}, what information we collect when you use{" "}
        {siteNameForCopy()}, and how we handle it. It should be read together with our{" "}
        <LegalLink href={termsHref()} label="Terms of Service" />
        .
      </p>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">1. Who we are</h2>
        <p className="mt-4">
          {siteNameForCopy()} is a research workspace (currently in early access) that helps you explore academic papers,
          upload PDFs to a personal library, and ask questions with cited, source-grounded answers.
        </p>
        <p className="mt-5">
          The service is operated by the team behind {siteNameForCopy()}. For privacy questions or requests, contact
          us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">2. What we collect</h2>
        <p className="mt-4">
          We collect only what we need to run {siteNameForCopy()}, keep your account secure, and enforce usage limits:
        </p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            <strong className="font-medium text-foreground">Account</strong> — email, sign-in details (via
            Supabase), and session tokens.
          </li>
          <li>
            <strong className="font-medium text-foreground">Papers</strong> — uploads, extracted text, and
            which documents you use in chats.
          </li>
          <li>
            <strong className="font-medium text-foreground">Activity</strong> — questions, AI responses,
            citations, summaries, and conversation history.
          </li>
          <li>
            <strong className="font-medium text-foreground">Usage</strong> — message, upload, and summary
            counts and quotas.
          </li>
          <li>
            <strong className="font-medium text-foreground">Technical</strong> — basic logs, IP address, and
            cookies for security and operation.
          </li>
        </ul>
        <p className="mt-5">
          Do not upload content you are not permitted to share with us or our providers (Supabase, OpenAI,
          Cohere, Resend).
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">3. How we use your information</h2>
        <ul className="mt-2 list-disc space-y-3.5 pl-6">
          <li>Provide, maintain, and secure the service, including sign-in, uploads, chat, and summaries.</li>
          <li>Process your content with AI systems to generate answers, citations, and summaries grounded in your sources.</li>
          <li>Enforce usage limits, prevent fraud or abuse, and comply with law where required.</li>
          <li>Send service-related emails (for example account, security, or material policy changes).</li>
          <li>Improve reliability and features during early access, including aggregated or de-identified analytics where possible.</li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">4. Who we share data with</h2>
        <p className="mt-4">
          We do not sell your personal information. To operate {siteNameForCopy()}, we share data with trusted
          third-party providers under contracts or terms that require appropriate protection. Our main
          subprocessors are:
        </p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            <strong className="font-medium text-foreground">Supabase</strong> — sign-in, account records,
            session management, and application data stored on their platform.
          </li>
          <li>
            <strong className="font-medium text-foreground">OpenAI</strong> — your questions, prompts, document
            context, and related content used to generate chat answers, summaries, and other model outputs.
          </li>
          <li>
            <strong className="font-medium text-foreground">Cohere</strong> — text from your uploads and queries
            used for embeddings, search, and retrieval that ground answers in your sources.
          </li>
          <li>
            <strong className="font-medium text-foreground">Resend</strong> — your email address and message
            content used to send service-related emails (for example account, security, or policy updates).
          </li>
        </ul>
        <p className="mt-5">We may also share data with:</p>
        <ul className="mt-2 list-disc space-y-3.5 pl-6">
          <li>Authorities or advisers when required by law or to protect rights, safety, and security.</li>
        </ul>
        <p className="mt-5">
          When you use the product, account and library data may be processed by Supabase; AI features may send
          relevant portions of your questions and source material to OpenAI and Cohere; service emails may be
          sent via Resend. See each provider&apos;s privacy policy for how they handle data.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">5. Retention and deletion</h2>
        <p className="mt-4">
          We keep information for as long as your account is active or as needed to provide the service,
          enforce limits, resolve disputes, and meet legal obligations. You may delete uploaded files and
          conversations in the product where those controls exist. You can request account deletion or other
          privacy requests by emailing{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          . We will respond within a reasonable time, subject to backups and legal retention requirements.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">6. Contact</h2>
        <p className="mt-4">
          Privacy questions, access requests, or concerns:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>

      <p className="mt-14 text-sm text-muted-foreground/80">Last updated: {LEGAL_LAST_UPDATED}</p>
    </LegalDocumentLayout>
  );
}
