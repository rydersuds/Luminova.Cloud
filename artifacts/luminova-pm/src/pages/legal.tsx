import { Link } from "wouter"

const effectiveDate = "September 8, 2026"

type LegalSection = {
  title: string
  paragraphs: string[]
  items?: string[]
}

const termsSections: LegalSection[] = [
  {
    title: "1. About these terms",
    paragraphs: [
      "These Terms & Conditions govern access to Luminova Construction PM, a construction project-management service for coordinating projects, trades, messages, documents, invoices, quotes, photographs, and related field information.",
      "By using the service, you confirm that you are authorized to act for your organization and agree to follow these terms. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "2. Accounts and authorized use",
    paragraphs: [
      "You must provide accurate account information, protect your credentials, and promptly report suspected unauthorized access. Your organization is responsible for deciding who may access its workspace and for removing access when it is no longer appropriate.",
      "You may use the service only for lawful construction and business operations. You must not interfere with the service, bypass access controls, upload malicious material, or use another person’s account.",
    ],
  },
  {
    title: "3. Project content and permissions",
    paragraphs: [
      "Your organization retains ownership of the project information it submits. You grant the service provider a limited permission to host, process, transmit, back up, and display that information only as needed to operate, secure, support, and improve the service.",
      "You are responsible for ensuring that you have the rights and permissions needed to upload drawings, site photographs, personal information, quotes, invoices, messages, and other content.",
    ],
  },
  {
    title: "4. Construction decisions and records",
    paragraphs: [
      "The service is an administrative collaboration tool. It does not provide engineering, architectural, safety, accounting, legal, scheduling, inspection, or code-compliance advice.",
      "Users must independently verify dimensions, pricing, scope, approvals, safety requirements, site conditions, and official project records before relying on information shown in the service. The service is not a substitute for required permits, inspections, signed contracts, or professional judgment.",
    ],
  },
  {
    title: "5. Availability and changes",
    paragraphs: [
      "The service may be changed, maintained, suspended, or discontinued. Reasonable efforts may be made to preserve availability and data, but uninterrupted operation and permanent retention are not guaranteed. Your organization should maintain copies of records it is legally or operationally required to keep.",
    ],
  },
  {
    title: "6. Fees, suspension, and termination",
    paragraphs: [
      "[PLACEHOLDER — LEGAL REVIEW REQUIRED: Confirm subscription fees, billing terms, refund rules, suspension rights, termination notice, and data-export or deletion periods before production use.]",
    ],
  },
  {
    title: "7. Warranties and liability",
    paragraphs: [
      "[PLACEHOLDER — LEGAL REVIEW REQUIRED: Add jurisdiction-appropriate warranty disclaimers, liability limitations, indemnity terms, and exclusions. These provisions must be reviewed by qualified legal counsel.]",
    ],
  },
  {
    title: "8. Governing law and disputes",
    paragraphs: [
      "[PLACEHOLDER — LEGAL REVIEW REQUIRED: Insert the governing law, courts or dispute-resolution process, notice procedure, and any mandatory local consumer rights.]",
    ],
  },
  {
    title: "9. Contact",
    paragraphs: [
      "[BUSINESS PLACEHOLDER — LEGAL REVIEW REQUIRED: Insert the legal business name, registered address, support email, legal-notice email, and telephone number.]",
    ],
  },
]

const privacySections: LegalSection[] = [
  {
    title: "1. Scope",
    paragraphs: [
      "This Privacy Policy explains how information is handled when people use Luminova Construction PM. It applies to account holders, invited team members, trade partners, and other people whose information is entered into a project workspace.",
      "[BUSINESS PLACEHOLDER — LEGAL REVIEW REQUIRED: Identify the legal entity responsible for personal information and whether it acts as controller, processor, service provider, or an equivalent role in each applicable jurisdiction.]",
    ],
  },
  {
    title: "2. Information collected",
    paragraphs: ["Depending on how the service is used, information may include:"],
    items: [
      "Account and profile details, such as name, email address, role, and authentication records.",
      "Project and business records, including project names, locations, contacts, trades, quotes, invoices, schedules, messages, files, and activity.",
      "Site media and document contents, including photographs, panoramas, plans, and metadata that users choose to upload.",
      "Device, browser, diagnostic, security, and usage information needed to operate and protect the service.",
      "Support communications and feedback.",
    ],
  },
  {
    title: "3. How information is used",
    paragraphs: ["Information may be used to:"],
    items: [
      "Provide, secure, troubleshoot, and maintain the project-management service.",
      "Authenticate users, enforce workspace permissions, and prevent abuse.",
      "Process project records and enable collaboration requested by the organization.",
      "Communicate about accounts, service notices, and support requests.",
      "Meet legal obligations and establish, exercise, or defend legal claims.",
      "Analyze and improve performance using appropriately limited data.",
    ],
  },
  {
    title: "4. Sharing and service providers",
    paragraphs: [
      "Information may be visible to authorized members of the workspace and to people with whom users intentionally share project records. It may also be processed by hosting, authentication, storage, monitoring, communications, and support providers acting under contractual restrictions.",
      "Information may be disclosed when required by law, to protect rights and safety, during a corporate transaction, or with the organization’s direction or consent. Personal information is not sold as that term is ordinarily understood.",
      "[PLACEHOLDER — LEGAL REVIEW REQUIRED: Confirm all provider categories, international transfers, and any statutory definitions of sale, sharing, targeted advertising, or cross-context behavioral advertising.]",
    ],
  },
  {
    title: "5. Retention and security",
    paragraphs: [
      "Reasonable administrative, technical, and organizational safeguards are used to protect information. No system can guarantee absolute security.",
      "Information is retained while needed to provide the service, meet contractual and legal duties, resolve disputes, and maintain security and backups.",
      "[PLACEHOLDER — LEGAL REVIEW REQUIRED: Specify production retention schedules, backup deletion windows, incident contacts, and organization-specific data export and deletion commitments.]",
    ],
  },
  {
    title: "6. Privacy choices and rights",
    paragraphs: [
      "Users may update certain account information through the service and may ask their organization’s administrator about workspace records. Depending on location, individuals may have rights to access, correct, delete, restrict, object to, or obtain a copy of personal information.",
      "[PLACEHOLDER — LEGAL REVIEW REQUIRED: Insert the verified privacy-request method, identity-verification process, appeal process, response timelines, and jurisdiction-specific disclosures before production use.]",
    ],
  },
  {
    title: "7. Children and sensitive site information",
    paragraphs: [
      "The service is intended for business users and is not directed to children. Users should avoid uploading unnecessary sensitive personal information and should follow workplace, site-notice, surveillance, and consent requirements when capturing people or locations in photographs and panoramas.",
    ],
  },
  {
    title: "8. Changes and contact",
    paragraphs: [
      "This draft may be updated as the service and legal requirements change. Material updates should be communicated through an appropriate notice.",
      "[BUSINESS PLACEHOLDER — LEGAL REVIEW REQUIRED: Insert legal business name, privacy officer or contact, mailing address, privacy email, and any applicable representative or data-protection officer details.]",
    ],
  },
]

export function TermsPage() {
  return <LegalDocument title="Terms & Conditions" summary="Draft terms for using the Luminova Construction PM service." sections={termsSections} />
}

export function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" summary="Draft information-handling practices for the Luminova Construction PM service." sections={privacySections} />
}

function LegalDocument({ title, summary, sections }: { title: string; summary: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-[100dvh] bg-[#f7f6f1] px-4 py-8 text-[#202020] sm:px-6 sm:py-12">
      <article className="mx-auto max-w-3xl overflow-hidden border border-black/10 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
        <header className="border-b border-black/10 bg-[#171717] px-5 py-7 text-white sm:px-10 sm:py-10">
          <img src={`${import.meta.env.BASE_URL}luminova-logo.png`} alt="Luminova Construction" className="h-16 w-44 object-contain object-left" />
          <p className="mt-6 font-mono text-xs uppercase tracking-[.2em] text-[#c8ae4b]">Draft — legal review required</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{summary}</p>
          <p className="mt-4 text-sm font-semibold">Effective date: {effectiveDate}</p>
        </header>

        <div className="px-5 py-7 sm:px-10 sm:py-10">
          <aside role="note" className="border-l-4 border-[#b59c3f] bg-[#f5f0dc] p-4 text-sm leading-6">
            <strong>Important draft notice:</strong> This document is a practical starting point, not legal advice.
            Every bracketed business, contact, jurisdiction, retention, and liability placeholder must be completed and
            the full document reviewed by qualified legal counsel before production use.
          </aside>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title} aria-labelledby={section.title.replaceAll(" ", "-").toLowerCase()}>
                <h2 id={section.title.replaceAll(" ", "-").toLowerCase()} className="text-xl font-bold">{section.title}</h2>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-black/75">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.items && <ul className="list-disc space-y-2 pl-6">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                </div>
              </section>
            ))}
          </div>

          <Link href="/sign-in" className="mt-10 inline-flex min-h-11 items-center border border-black/20 px-5 font-semibold text-black underline-offset-4 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a752a]">
            Back to sign in
          </Link>
        </div>
      </article>
    </main>
  )
}