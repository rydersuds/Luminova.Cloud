import { Link } from "wouter"

const effectiveDate = "September 9, 2026"

type LegalSection = {
  title: string
  paragraphs: string[]
  items?: string[]
}

const termsSections: LegalSection[] = [
  {
    title: "1. About these terms",
    paragraphs: [
      "These Terms & Conditions govern access to Luminova Construction PM, a construction project-management service for coordinating projects, trades, documents, invoices, quotes, photographs, and related field information.",
      "Luminova Construction operates the service for its construction and project-operations teams and approved project collaborators. By using the service, you confirm that you are authorized to act for your organization and agree to follow these terms. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "2. Accounts and authorized use",
    paragraphs: [
      "You must provide accurate account information, protect your credentials, and promptly report suspected unauthorized access. Your organization is responsible for deciding who may access its workspace and for removing access when it is no longer appropriate.",
      "You may use the service only for lawful construction and business operations. You must not interfere with the service, bypass access controls, upload malicious material, use another person’s account, or use project information for an unrelated purpose.",
    ],
  },
  {
    title: "3. Project content and permissions",
    paragraphs: [
      "Your organization retains ownership of the project information it submits. You grant the service provider a limited permission to host, process, transmit, back up, and display that information only as needed to operate, secure, support, and improve the service.",
      "You are responsible for ensuring that you have the rights and permissions needed to upload drawings, site photographs, personal information, quotes, invoices, and other content.",
      "Workspace administrators control invitations, roles, project access, and shared records on behalf of their organization. Do not upload information that a person or organization has asked you not to disclose.",
    ],
  },
  {
    title: "4. Construction decisions and records",
    paragraphs: [
      "The service is an administrative collaboration tool. It does not provide engineering, architectural, safety, accounting, legal, scheduling, inspection, or code-compliance advice.",
      "Users must independently verify dimensions, pricing, scope, approvals, safety requirements, site conditions, and official project records before relying on information shown in the service. The service is not a substitute for required permits, inspections, signed contracts, or professional judgment.",
      "AI-assisted document extraction, quote classification, invoice matching, photo analysis, and search are provided as productivity features. AI results may be incomplete or incorrect and must be checked against the original document, contract, site condition, or other authoritative record before anyone acts on them.",
    ],
  },
  {
    title: "5. Availability and changes",
    paragraphs: [
      "The service may be changed, maintained, suspended, or discontinued. Reasonable efforts may be made to preserve availability and data, but uninterrupted operation and permanent retention are not guaranteed. Your organization should maintain copies of records it is legally or operationally required to keep.",
    ],
  },
  {
    title: "6. Files, site media, and acceptable use",
    paragraphs: [
      "The service supports project files, plans, invoices, quotes, site photographs, panoramas, and related operational records. You must follow applicable privacy, copyright, employment, workplace-safety, surveillance, and site-access requirements when collecting or sharing them.",
      "Luminova Construction may remove content or restrict access when reasonably necessary to protect a project, person, workspace, system, or legal right. If the service is provided under a separate construction, employment, vendor, or commercial agreement, that agreement continues to govern the underlying project relationship.",
    ],
  },
  {
    title: "7. Availability, fees, and termination",
    paragraphs: [
      "Luminova Construction may change, maintain, suspend, or discontinue the service. Reasonable efforts may be made to preserve availability and data, but uninterrupted operation and permanent retention are not guaranteed. Organizations should maintain copies of records they are legally or operationally required to keep.",
      "Any fees, payment terms, service levels, export commitments, or termination rights that apply to a customer are governed by that customer’s written agreement with Luminova Construction. If no written commercial terms apply, access may be ended by Luminova Construction or the workspace administrator when reasonably necessary.",
    ],
  },
  {
    title: "8. Disclaimers and limits",
    paragraphs: [
      "To the maximum extent permitted by law, the service is provided on an “as available” basis without a promise that every record, calculation, extraction, notification, integration, or result will be complete, current, uninterrupted, or error-free. Nothing in these terms limits a right or remedy that cannot lawfully be limited.",
      "To the maximum extent permitted by law, Luminova Construction will not be responsible for indirect, incidental, special, consequential, exemplary, or punitive loss, or for loss caused by a user’s instructions, inaccurate project content, unauthorized access resulting from failure to protect credentials, or reliance on an unverified AI result. These limits do not replace the terms of a separate written commercial agreement.",
    ],
  },
  {
    title: "9. Governing law",
    paragraphs: [
      "These terms are intended to be interpreted under the laws of Alberta, Canada, unless mandatory law requires otherwise. Any dispute that cannot be resolved through the applicable customer or project agreement will be brought in the courts of Alberta, subject to any mandatory rights available to the parties.",
    ],
  },
  {
    title: "10. Changes and contact",
    paragraphs: [
      "Luminova Construction may update these terms when the service, project operations, or legal requirements change. Material changes will be communicated through the service, account notices, or another reasonable channel. Continued use after the effective date of an update means the updated terms apply.",
      "For account, project, access, or privacy questions, contact your Luminova Construction workspace administrator or use the support channel provided with your organization’s Luminova service. Please do not include passwords, access codes, or other credentials in a support request.",
    ],
  },
]

const privacySections: LegalSection[] = [
  {
    title: "1. Scope",
    paragraphs: [
      "This Privacy Policy explains how information is handled when people use Luminova Construction PM. It applies to account holders, invited team members, trade partners, and other people whose information is entered into a project workspace.",
      "For workspace information supplied by a construction company or project owner, Luminova Construction generally handles that information to provide the workspace on that organization’s instructions. The organization that controls the workspace remains responsible for deciding what project information is collected and who can see it.",
    ],
  },
  {
    title: "2. Information collected",
    paragraphs: ["Depending on how the service is used, information may include:"],
    items: [
      "Account and profile details, such as name, email address, role, and authentication records.",
      "Project and business records, including project names, locations, contacts, trades, quotes, invoices, schedules, messages, files, and activity.",
      "Site media and document contents, including photographs, panoramas, plans, and metadata that users choose to upload.",
      "AI-processing inputs and results, such as extracted text, document classifications, invoice or quote fields, visual descriptions, and search tags generated from uploaded project material.",
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
      "Run bounded AI-assisted extraction and visual analysis requested by the organization, and return results to authorized workspace users.",
      "Communicate about accounts, service notices, and support requests.",
      "Meet legal obligations and establish, exercise, or defend legal claims.",
      "Analyze and improve performance using appropriately limited data.",
    ],
  },
  {
    title: "4. Sharing and service providers",
    paragraphs: [
      "Information may be visible to authorized members of the workspace and to people with whom users intentionally share project records. It may also be processed by hosting, authentication, storage, monitoring, communications, and support providers acting under contractual restrictions.",
      "Information may be disclosed when required by law, to protect rights and safety, during a corporate transaction, or with the organization’s direction or consent. Luminova Construction does not sell project records or personal information for advertising.",
      "Depending on the enabled service features, providers may include Clerk for authentication, Replit or other infrastructure providers for application hosting and storage, and an AI processing provider for bounded document or image analysis. Providers receive only the information needed for the enabled feature and are expected to protect it under their applicable terms.",
    ],
  },
  {
    title: "5. Retention and security",
    paragraphs: [
      "Reasonable administrative, technical, and organizational safeguards are used to protect information. No system can guarantee absolute security.",
      "Information is retained while needed to provide the service, meet contractual and legal duties, resolve disputes, maintain security and backups, and follow the workspace organization’s instructions. When a workspace is closed, deletion and export timing may depend on the organization’s agreement, active legal obligations, and backup cycles.",
      "Users must report suspected account compromise, accidental disclosure, or an incorrectly shared project file promptly to the workspace administrator so access can be reviewed and restricted.",
    ],
  },
  {
    title: "6. Privacy choices and rights",
    paragraphs: [
      "Users may update certain account information through the service and may ask their organization’s administrator about workspace records. Depending on location, individuals may have rights to access, correct, delete, restrict, object to, or obtain a copy of personal information.",
      "To make a request, contact your Luminova Construction workspace administrator or the support channel provided with your organization’s service. Luminova Construction may need to verify identity and coordinate with the workspace organization before responding. Requests are handled within the time required by applicable law.",
    ],
  },
  {
    title: "7. Children and sensitive site information",
    paragraphs: [
      "The service is intended for business users and is not directed to children. Users should avoid uploading unnecessary sensitive personal information and should follow workplace, site-notice, surveillance, and consent requirements when capturing people or locations in photographs and panoramas.",
      "Do not use the service to collect health information, government identification numbers, financial-account credentials, passwords, or other highly sensitive information unless it is necessary for a documented project or legal purpose and the workspace organization has authorized it.",
    ],
  },
  {
    title: "8. Changes and contact",
    paragraphs: [
      "This policy may be updated as the service and legal requirements change. Material updates will be communicated through the service, account notices, or another reasonable channel.",
      "For privacy questions, access requests, correction requests, deletion requests, or concerns about a project record, contact your Luminova Construction workspace administrator or use the support channel provided with your organization’s Luminova service. Please do not send passwords or access codes.",
    ],
  },
]

export function TermsPage() {
  return <LegalDocument title="Terms & Conditions" summary="Terms for using Luminova Construction PM to coordinate construction projects, field records, and project teams." sections={termsSections} />
}

export function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" summary="How Luminova Construction PM handles account, project, field-media, document, and AI-assisted analysis information." sections={privacySections} />
}

function LegalDocument({ title, summary, sections }: { title: string; summary: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-[100dvh] bg-[hsl(214_28%_95%)] px-4 py-8 text-[hsl(222_27%_15%)] sm:px-6 sm:py-12">
      <article className="mx-auto max-w-3xl overflow-hidden border border-[hsl(214_21%_82%)] bg-[hsl(210_35%_99%)] shadow-[0_22px_60px_hsl(222_30%_8%/0.14)]">
        <header className="relative overflow-hidden border-b border-[hsl(220_19%_24%)] bg-[hsl(222_27%_12%)] px-5 py-7 text-[hsl(211_28%_94%)] sm:px-10 sm:py-10">
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,hsl(188_52%_75%/.12),transparent_68%)]" />
          <img src={`${import.meta.env.BASE_URL}luminova-logo.png`} alt="Luminova Construction" className="h-16 w-44 object-contain object-left" />
          <p className="mt-6 font-mono text-xs uppercase tracking-[.2em] text-[hsl(43_76%_57%)]">Luminova Construction · Legal</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[hsl(211_28%_94%/.7)]">{summary}</p>
          <p className="mt-4 text-sm font-semibold">Effective date: {effectiveDate}</p>
        </header>

        <div className="px-5 py-7 sm:px-10 sm:py-10">
           <aside role="note" className="border-l-4 border-[hsl(43_76%_51%)] bg-[hsl(43_76%_51%/.12)] p-4 text-sm leading-6">
             <strong>Important:</strong> This policy describes Luminova Construction PM and is intended to be read
             together with any written agreement that governs your organization’s construction project or service.
             If the two conflict, the written agreement controls to the extent of the conflict.
           </aside>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.title} aria-labelledby={section.title.replaceAll(" ", "-").toLowerCase()}>
                <h2 id={section.title.replaceAll(" ", "-").toLowerCase()} className="text-xl font-bold">{section.title}</h2>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-[hsl(222_27%_15%/.74)]">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.items && <ul className="list-disc space-y-2 pl-6">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                </div>
              </section>
            ))}
          </div>

           <Link href="/sign-in" className="tech-clip mt-10 inline-flex min-h-11 items-center border border-[hsl(214_21%_72%)] px-5 font-semibold text-[hsl(222_27%_15%)] underline-offset-4 hover:bg-[hsl(43_76%_51%/.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(43_76%_51%)]">
            Back to sign in
          </Link>
        </div>
      </article>
    </main>
  )
}