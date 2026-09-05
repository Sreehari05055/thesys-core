import { LegalDocumentLayout } from "@/components/LegalDocumentLayout";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, siteNameForCopy } from "@/lib/siteMeta";

export function TermsOfServicePage() {
  return (
    <LegalDocumentLayout title="Terms of Service">
      <section>
        <h2 className="text-lg font-semibold text-foreground">1. Acceptance</h2>
        <p className="mt-4">
          By creating an account or using {siteNameForCopy()}, you agree to these Terms. If you
          don&apos;t agree, don&apos;t use the service. We may update these Terms; material changes will be
          announced via email to active accounts with reasonable notice before they take effect.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">2. What the service does</h2>
        <p className="mt-4">
          {siteNameForCopy()} is a research workspace that helps you work with academic PDFs and get answers grounded in
          your sources. Depending on how you use the product, the service may:
        </p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            Help you search and explore open-access research papers, where available, and upload papers you are
            permitted to use (for example, PDFs) into a personal library associated with your account.
          </li>
          <li>
            Let you ask questions about papers in your library and receive responses that reference passages
            from those documents, including cited excerpts you can review in context.
          </li>
          <li>
            Provide features such as document summaries, citation formatting, and a reader view to inspect
            source material alongside answers.
          </li>
          <li>
            Store uploaded files, conversation history, and related metadata on our systems (and trusted
            infrastructure providers) so the service can run, sync across sessions, and enforce usage limits.
          </li>
          <li>
            Send your questions, uploaded content, and relevant context to artificial-intelligence systems to
            generate responses. Those systems process data according to their own terms and policies as well
            as ours.
          </li>
        </ul>
        <p className="mt-5">
          The service is in early access. Features, limits, and availability may change without notice. Outputs
          are generated automatically and may be incomplete or incorrect. You are responsible for verifying
          anything you rely on for academic, professional, or legal purposes.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">3. Eligibility</h2>
        <p className="mt-4">To use {siteNameForCopy()}, you must:</p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            Be at least 18 years old, or the age of majority in your jurisdiction, whichever is higher.
          </li>
          <li>
            Register with accurate, current contact information and keep your account credentials secure. You are
            responsible for all activity under your account.
          </li>
          <li>
            Use the service only for lawful research, study, or related personal or professional purposes—not for
            spam, abuse, automated scraping of the service itself, or any activity that violates applicable law.
          </li>
          <li>
            Upload and query only content you have the right to use (for example, open-access works, your own
            materials, or copies you are permitted to hold). Do not upload confidential, pirated, or
            rights-restricted material you are not authorized to share with us or our processors.
          </li>
          <li>
            Comply with any usage limits, early access invitations, or access restrictions we apply to your account or
            region.
          </li>
        </ul>
        <p className="mt-5">
          We may refuse, suspend, or terminate access if we reasonably believe you do not meet these requirements
          or if your use poses risk to the service, other users, or third parties.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">
          4. AI-generated content and acceptable use
        </h2>

        <h3 className="mt-6 text-base font-semibold text-foreground">AI-generated content</h3>
        <p className="mt-4">
          Answers, summaries, citations, and other outputs from {siteNameForCopy()} are produced automatically by AI. They
          are provided for assistance only and are not professional, legal, medical, or financial advice.
        </p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            Outputs may be wrong, incomplete, or out of date. Even when they include quotes or references, always
            check responses against the underlying sources and your own judgment before citing, publishing, or
            making decisions.
          </li>
          <li>
            The service may misidentify sources, pages, or passages. You are responsible for confirming that any
            citation or excerpt is accurate and appropriate for your work.
          </li>
          <li>
            We do not guarantee that AI outputs are unique, free of bias, or fit for any particular purpose. You
            assume all risk from how you use, share, or rely on generated content.
          </li>
        </ul>

        <h3 className="mt-8 text-base font-semibold text-foreground">Acceptable use</h3>
        <p className="mt-4">You agree not to:</p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            Use the service in any way that violates law, infringes intellectual property or privacy rights, or
            breaches obligations to your employer, institution, or collaborators.
          </li>
          <li>
            Upload malware, attempt unauthorized access, probe or stress-test our systems, circumvent usage limits,
            or interfere with other users&apos; access.
          </li>
          <li>
            Use automated means to scrape or bulk-query the service except as we expressly allow.
          </li>
          <li>
            Misrepresent AI-generated text as solely your own original scholarship or work where your institution
            or publisher requires disclosure of AI assistance—follow your own integrity and disclosure rules.
          </li>
          <li>
            Harass, threaten, or submit content that is hateful, exploitative, or intended to deceive others in
            harmful ways.
          </li>
        </ul>
        <p className="mt-5">
          We may monitor use for security and abuse prevention, remove content, throttle or block requests, and
          suspend or terminate accounts that violate this section or put the service at risk.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">5. No guarantee</h2>
        <p className="mt-4">
          {siteNameForCopy()} is provided on an &quot;as is&quot; and &quot;as available&quot; basis, especially during early
          access. To the fullest extent permitted by law, we make no guarantees or warranties of any kind, whether
          express, implied, or statutory, including:
        </p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            That the service will be uninterrupted, secure, error-free, or free of harmful components.
          </li>
          <li>
            That AI outputs, citations, summaries, or search results will be accurate, complete, current, or fit for
            your purpose.
          </li>
          <li>
            That the service will meet your requirements or that defects will be corrected within any particular
            timeframe.
          </li>
        </ul>
        <p className="mt-5">
          You use the service at your own risk. Some jurisdictions do not allow certain warranty exclusions; in
          those cases, our disclaimers apply only to the maximum extent allowed.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">6. Service availability</h2>
        <p className="mt-4">
          We aim to keep {siteNameForCopy()} running smoothly, but we do not guarantee continuous uptime or availability.
          During early access, the service may be slow, limited, or unavailable while we deploy updates, fix issues, or
          respond to incidents.
        </p>
        <ul className="mt-5 list-disc space-y-3.5 pl-6">
          <li>
            Scheduled or emergency maintenance may occur without advance notice when reasonably necessary.
          </li>
          <li>
            Features may be added, changed, or removed; we may impose or adjust usage limits at any time.
          </li>
          <li>
            Outages caused by third-party providers (hosting, authentication, AI, or network services) are outside
            our direct control.
          </li>
        </ul>
        <p className="mt-5">
          We are not liable for loss or inconvenience resulting from downtime, degraded performance, or temporary
          loss of access to your data, except where applicable law requires otherwise.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
        <p className="mt-4">
          Questions about these Terms, the service, or your account? Email us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          . We will try to respond within a reasonable time, but we do not guarantee a particular response time
          during early access.
        </p>
      </section>

      <p className="mt-14 text-sm text-muted-foreground/80">Last updated: {LEGAL_LAST_UPDATED}</p>
    </LegalDocumentLayout>
  );
}
