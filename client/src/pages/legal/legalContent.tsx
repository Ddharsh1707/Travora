import type { ReactNode } from "react";
import { Link } from "wouter";
import { LEGAL_DETAILS, mailto, privacyContactEmail, type LegalSlug } from "./legalInfo";

/**
 * The text of the six legal and information pages.
 *
 * Every statement here describes how Trapple works today, checked against the
 * database schema (supabase/migrations), the Edge Functions and the browser code.
 * When the app changes what it collects or who can see it, change this file too.
 * Company details come from LEGAL_DETAILS in legalInfo.ts; open decisions are
 * listed in docs/LEGAL.md.
 */

export type LegalSection = { id: string; heading: string; body: ReactNode };

const D = LEGAL_DETAILS;

function Email({ address, subject }: { address: string | null; subject?: string }) {
  const href = mailto(address, subject);
  return href && address ? <a href={href}>{address}</a> : <>your company&apos;s Travel Desk</>;
}

function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href}>{children}</Link>;
}

/** "Contact the Travel Desk at x" or, without an address, the internal route. */
function ContactLine({ subject }: { subject: string }) {
  const email = privacyContactEmail();
  return email ? (
    <>
      write to <Email address={email} subject={subject} /> with &ldquo;{subject}&rdquo; in the subject line, or speak to the
      Travel Desk at {D.companyShortName}
    </>
  ) : (
    <>speak to the Travel Desk at {D.companyShortName}</>
  );
}

type DataRow = { title: string; what: ReactNode; why: ReactNode; where: ReactNode; who: ReactNode };

function DataCard({ row }: { row: DataRow }) {
  return (
    <div className="legal-data-card">
      <h3>{row.title}</h3>
      <dl>
        <div><dt>What</dt><dd>{row.what}</dd></div>
        <div><dt>Why</dt><dd>{row.why}</dd></div>
        <div><dt>Where it is used</dt><dd>{row.where}</dd></div>
        <div><dt>Who can see it</dt><dd>{row.who}</dd></div>
      </dl>
    </div>
  );
}

const ROLES_TABLE = (
  <div className="responsive-table legal-table">
    <table>
      <thead>
        <tr><th>Role in Trapple</th><th>What it can see</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>Employee</strong></td><td>Their own profile, travel requests, trips, tickets and documents, and any expenses recorded for them.</td></tr>
        <tr><td><strong>Approver</strong></td><td>Their own information, plus the requests, trips and expenses of the people who report to them or whose requests are sent to them.</td></tr>
        <tr><td><strong>Booking assistant</strong></td><td>The company&apos;s travel requests, trips, tickets and bookings, so they can make and record bookings. They can view the temporary workforce list but not change it.</td></tr>
        <tr><td><strong>Travel Desk</strong></td><td>Everything in Trapple for the company, including people, uploads, expenses, reports and the temporary workforce.</td></tr>
        <tr><td><strong>Director</strong></td><td>The same as the Travel Desk, with the Director dashboard.</td></tr>
      </tbody>
    </table>
  </div>
);

const DRAFT_NOTE = (
  <p>
    This page explains how Trapple works today. It is not legal advice. Where a decision belongs to {D.companyShortName} (for example how long
    records are kept or how refunds are paid), the page says so rather than making a promise on the company&apos;s behalf.
  </p>
);

const privacy: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    body: (
      <>
        <p>
          Trapple is the travel desk system of <strong>{D.companyName}</strong> (&ldquo;{D.companyShortName}&rdquo;, &ldquo;we&rdquo;), based in {D.city}.
          Employees use it to ask for work travel, and the company&apos;s Travel Desk and Director use it to approve, book and report on that travel.
        </p>
        <p>
          {D.companyShortName} decides why and how this information is used. Under India&apos;s Digital Personal Data Protection Act, 2023, that makes
          the company the <em>data fiduciary</em> for the personal data in Trapple, and you the <em>data principal</em> for your own data.
        </p>
        {DRAFT_NOTE}
      </>
    ),
  },
  {
    id: "what-we-collect",
    heading: "What personal information Trapple holds",
    body: (
      <>
        <p>Trapple only holds information that the company&apos;s travel work needs. In short:</p>
        <ul>
          <li><strong>Your account:</strong> your work email address and a password (stored by our sign-in provider as a one-way hash, never in readable form).</li>
          <li><strong>Your employee record:</strong> full name, employee ID, department, designation, role in Trapple, who you report to, and whether you are a current employee.</li>
          <li><strong>Temporary and contract workers:</strong> people who travel for the company but are not on its payroll may have a record with their name, the kind of worker they are (temporary, contract or outsourced), their contractor, project, work location and, when given, a contact phone number. These records usually have no login.</li>
          <li><strong>Travel requests:</strong> route, dates, preferred times, project, purpose, hotel needs, notes and the contact phone number you enter for the trip.</li>
          <li><strong>Trips and bookings:</strong> PNR or booking reference, ticket number, carrier, fare and other charges, booking status and cancellations.</li>
          <li><strong>Uploaded files:</strong> tickets, receipts and travel spreadsheets, and the details read from them.</li>
          <li><strong>Expenses:</strong> date, category, description, amount, how it was paid, the receipt and the review decision.</li>
          <li><strong>Assistant chats:</strong> the questions you ask the Trapple assistant and its answers.</li>
          <li><strong>Activity records:</strong> an audit log of important actions (for example approving a request or changing someone&apos;s role), with who did it and when.</li>
        </ul>
        <p>
          The full list, with why each item is needed and who can see it, is on <PageLink href="/data-we-collect">Data We Collect</PageLink>.
          Trapple does not ask for bank details, card numbers, government ID numbers, health information or your home address.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    heading: "How the information is used",
    body: (
      <>
        <ul>
          <li>To let you sign in and to show each person only what their role allows.</li>
          <li>To send travel requests for a decision, record the decision and its reason, and show it to the employee.</li>
          <li>To book travel, attach tickets to the right person and keep a record of every trip.</li>
          <li>To record, review and track reimbursement of expenses.</li>
          <li>To produce the company&apos;s travel reports: spend by project, person, kind of worker, contractor and period.</li>
          <li>To read details from uploaded tickets and spreadsheets so they do not have to be typed in by hand.</li>
          <li>To answer questions asked in the Trapple assistant.</li>
          <li>To keep the system secure, investigate problems and keep an audit trail of changes.</li>
        </ul>
        <p>Trapple does not sell personal information, and does not use it for advertising.</p>
      </>
    ),
  },
  {
    id: "storage-and-security",
    heading: "How it is stored and protected",
    body: (
      <>
        <ul>
          <li>The database, sign-in service and uploaded files are hosted by <strong>Supabase</strong>, in its {D.dataRegion} region. The website itself is served by <strong>Amazon Web Services (AWS Amplify)</strong>.</li>
          <li>All traffic between your browser and Trapple is encrypted (HTTPS).</li>
          <li>Every read and write is checked by rules inside the database itself (row-level security), not only by the screens. Hiding a button is never the only protection.</li>
          <li>Uploaded files are kept in private storage. They can only be opened by someone allowed to see that person&apos;s records, using a short-lived link.</li>
          <li>Changing a person&apos;s role, login or status is limited to the Director and the Travel Desk, and important changes are written to an audit log.</li>
          <li>Your signed-in session is kept only in the browser tab you used, and ends when you close it or sign out.</li>
        </ul>
        <p>No system is perfectly secure. If you think your account has been misused, tell the Travel Desk straight away.</p>
      </>
    ),
  },
  {
    id: "who-can-see",
    heading: "Who can see your information",
    body: (
      <>
        <p>What each person sees depends on their role in Trapple. The database enforces this:</p>
        {ROLES_TABLE}
        <p>
          The assistant follows the same rules: it can only look up what the person asking is already allowed to see.
        </p>
      </>
    ),
  },
  {
    id: "company-data",
    heading: "Company data and separation",
    body: (
      <>
        <p>
          Trapple is currently run for one organisation, {D.companyShortName}. Its records are tagged with the company they belong to, so that
          if more companies are added later, each company&apos;s people and travel stay separate. Within the company, the role rules above decide who
          sees what.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    heading: "Service providers we use",
    body: (
      <>
        <p>Trapple uses a small number of service providers to run. They process information only to provide their service to us:</p>
        <ul>
          <li><strong>Supabase</strong>: database, sign-in, file storage and server functions ({D.dataRegion}).</li>
          <li><strong>Amazon Web Services (AWS Amplify)</strong>: delivers the website&apos;s pages to your browser.</li>
          <li>
            <strong>AI providers</strong>: when a ticket or receipt is scanned, its text (or, for photos and scans, the image) is sent to an AI service to read out
            the travel details. When you ask the Trapple assistant a question, your question and the trip details needed to answer it are sent too.
            Trapple currently uses <strong>Groq</strong> for this. The software can also use <strong>Google (Gemini)</strong> or{" "}
            <strong>Anthropic (Claude)</strong> if the company switches them on. These providers may process data outside India. Nothing read by AI
            becomes a trip until a person checks and confirms it.
          </li>
          <li><strong>Google Fonts</strong>: the typefaces on the website are loaded from Google, which means your browser contacts Google&apos;s servers when a page loads.</li>
          <li><strong>Email</strong>: account invitations and password-reset emails are sent through the sign-in service.</li>
        </ul>
        <p>
          Some of these providers store or process data outside India (for example, the database is in {D.dataRegion}). Transfers are made to run Trapple,
          and only to the extent Indian law allows.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "How long information is kept",
    body: (
      <>
        <p>
          Trapple does not delete records automatically after a fixed period. Travel, booking and expense records are kept as the company&apos;s business
          records until the Director or Travel Desk removes them. When someone leaves, they can be marked as a past employee and their login switched off;
          their past trips stay in the company&apos;s records.
        </p>
        <p>
          The Director and the Travel Desk can delete a person&apos;s records or reset data from inside Trapple. The audit log of important actions is
          kept so that changes can be traced.
        </p>
        <p>
          How long the company keeps travel and expense records (for example for tax and accounting purposes) is a decision for {D.companyShortName}.
          Ask the Travel Desk if you need to know the period that applies to you.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "Your rights",
    body: (
      <>
        <p>Under the Digital Personal Data Protection Act, 2023 you can ask the company:</p>
        <ul>
          <li>for a summary of the personal data it holds about you and how it is used;</li>
          <li>to correct, complete or update information that is wrong or out of date;</li>
          <li>to erase information that is no longer needed, unless the law or a legitimate business record requires it to be kept;</li>
          <li>to name a person who can act for you if you are unable to;</li>
          <li>to deal with a complaint about how your information has been handled.</li>
        </ul>
        <p>
          You can see most of your own information yourself in Trapple, under your requests, trips, documents and expenses. For anything else,{" "}
          <ContactLine subject="Privacy request" />. If you are not satisfied with the response, you may complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        When Trapple changes what it collects or how it uses information, this page is updated and the date at the top changes. Significant changes
        will also be shared with employees by the company.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact about privacy",
    body: (
      <p>
        For privacy questions, requests or complaints, <ContactLine subject="Privacy" />. More ways to reach us are on the{" "}
        <PageLink href="/contact">Contact Us</PageLink> page.
      </p>
    ),
  },
];

const terms: LegalSection[] = [
  {
    id: "acceptance",
    heading: "Accepting these terms",
    body: (
      <>
        <p>
          Trapple is provided by {D.companyName} for its employees, its temporary and contract workforce, and the staff who manage their travel. By
          signing in or using Trapple you agree to these terms, to the <PageLink href="/privacy-policy">Privacy Policy</PageLink>, and to the
          company&apos;s own travel and expense policies, which decide what travel is allowed.
        </p>
        {DRAFT_NOTE}
      </>
    ),
  },
  {
    id: "the-platform",
    heading: "What Trapple is for",
    body: (
      <>
        <p>
          Trapple is used to request work travel, decide on requests, record bookings and tickets, record and review expenses, and report on travel
          spend. It is a record-keeping and workflow tool. Trapple does not sell tickets or take payments: bookings are made with airlines, railways,
          bus operators, hotels and agents, and paid for under the company&apos;s arrangements.
        </p>
        <p>Accounts are created by the company. Trapple is not open for public sign-up.</p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "Your account and its security",
    body: (
      <ul>
        <li>Use only your own account. Do not share your password or let anyone else sign in as you.</li>
        <li>Choose a strong password and keep it private. Sign out on shared computers.</li>
        <li>Keep your details correct. If your name, department or manager changes, ask the Travel Desk to update them.</li>
        <li>Tell the Travel Desk straight away if you think someone else has used your account.</li>
        <li>The company can switch off an account at any time, for example when someone leaves.</li>
      </ul>
    ),
  },
  {
    id: "responsibilities",
    heading: "Responsibilities by role",
    body: (
      <>
        <h3>Employees</h3>
        <ul>
          <li>Ask only for travel that is needed for work, and give an honest route, dates, project and purpose.</li>
          <li>Cancel a request in Trapple as soon as the trip is no longer needed.</li>
          <li>Give accurate expense details, with a genuine receipt where one is required.</li>
        </ul>
        <h3>Approvers (managers)</h3>
        <ul>
          <li>Decide requests fairly and promptly, and give a reason when rejecting.</li>
          <li>Use what you see about your team only for managing their travel.</li>
        </ul>
        <h3>Booking assistants</h3>
        <ul>
          <li>Book only approved travel, and record booking references, fares and tickets correctly.</li>
          <li>Record cancellations and their charges when they happen.</li>
        </ul>
        <h3>Travel Desk (company administrators)</h3>
        <ul>
          <li>Give each person the right role and remove access when someone leaves or changes job.</li>
          <li>Check uploaded spreadsheets, scanned tickets and name matches before confirming them.</li>
          <li>Handle personal data only for the company&apos;s travel work, and answer privacy requests.</li>
        </ul>
        <h3>Director (platform administrator)</h3>
        <ul>
          <li>Has the same powers as the Travel Desk, and is responsible for who holds administrator roles.</li>
          <li>Uses delete and reset actions carefully: some of them cannot be undone.</li>
        </ul>
      </>
    ),
  },
  {
    id: "requests-and-approvals",
    heading: "Travel requests, approvals and rejections",
    body: (
      <>
        <p>
          A request starts as <em>pending</em>. The Director and the Travel Desk see it at the same time, and the first decision counts. A request is
          then <em>approved</em> or <em>rejected</em> (with a reason), and an approved request becomes <em>booked</em> once a ticket is added. An
          employee can cancel their own request while it is still pending.
        </p>
        <p>Approval in Trapple means the trip is authorised by the company. It does not guarantee a seat, a fare or availability.</p>
      </>
    ),
  },
  {
    id: "bookings-and-cancellations",
    heading: "Bookings and cancellations",
    body: (
      <p>
        Bookings are made outside Trapple and recorded in it. Changes and cancellations follow the rules of the airline, railway, bus operator, hotel or
        agent concerned. See the <PageLink href="/cancellation-and-refund-policy">Cancellation &amp; Refund Policy</PageLink> for how these are recorded
        and who decides refunds.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>Use Trapple only for the company&apos;s travel work. You must not:</p>
        <ul>
          <li>try to see, change or download information your role does not allow, or get around the security checks;</li>
          <li>upload false, altered or someone else&apos;s documents, or files containing malware;</li>
          <li>enter false requests, bookings or expenses;</li>
          <li>copy personal information out of Trapple for purposes unrelated to travel work;</li>
          <li>overload the service, scrape it automatically or try to break it;</li>
          <li>use the assistant to try to get information you are not allowed to see.</li>
        </ul>
        <p>Misuse can lead to the account being switched off and to action under the company&apos;s policies and the law.</p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    heading: "Intellectual property",
    body: (
      <p>
        The Trapple name, design and software are owned by or licensed to {D.companyShortName}. The travel information in Trapple belongs to the
        company. You may use Trapple and its reports for your work, but not copy, resell or reuse the software or its design.
      </p>
    ),
  },
  {
    id: "availability",
    heading: "Availability and limitations",
    body: (
      <ul>
        <li>We aim to keep Trapple available, but it may be paused for maintenance or affected by problems with our service providers.</li>
        <li>Details read automatically from tickets and spreadsheets can be wrong. A person must check them before they are confirmed.</li>
        <li>Answers from the assistant are based on the records in Trapple and can be incomplete. Check important figures in the reports.</li>
        <li>Reports are only as complete as the records entered. Missing fares are shown as missing, not as zero.</li>
      </ul>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <p>
        Trapple is provided as a work tool &ldquo;as is&rdquo;. To the extent the law allows, {D.companyShortName} is not responsible for losses caused by
        the actions of airlines, railways, hotels or agents, by information entered incorrectly, or by interruptions to the service. Nothing in these
        terms limits rights that cannot be limited under Indian law, or the company&apos;s duties to its employees under their terms of employment.
      </p>
    ),
  },
  {
    id: "disputes",
    heading: "Questions and disputes",
    body: (
      <p>
        Raise any problem with a request, booking or expense with the Travel Desk first. Most issues can be settled there. These terms are governed by
        the laws of India.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: <p>We may update these terms as Trapple changes. The date at the top shows the latest version. Continuing to use Trapple means you accept the update.</p>,
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <p>
        Questions about these terms: <ContactLine subject="Terms" />. See <PageLink href="/contact">Contact Us</PageLink>.
      </p>
    ),
  },
];

const cookies: LegalSection[] = [
  {
    id: "summary",
    heading: "The short version",
    body: (
      <>
        <p>
          <strong>Trapple does not set any cookies.</strong> It has no advertising, analytics or tracking tools. To work, it keeps a few small items in
          your browser&apos;s own storage, listed below. None of them are used to follow you around the web.
        </p>
        <p>Because nothing optional is stored, there is no cookie banner to accept or decline.</p>
      </>
    ),
  },
  {
    id: "essential",
    heading: "Essential: keeping you signed in",
    body: (
      <>
        <div className="responsive-table legal-table">
          <table>
            <thead><tr><th>Name</th><th>Where</th><th>Purpose</th><th>How long</th></tr></thead>
            <tbody>
              <tr>
                <td><code>trapple-auth</code></td>
                <td>Session storage</td>
                <td>Your signed-in session from our sign-in provider (Supabase), so each page knows who you are.</td>
                <td>Until you sign out or close the browser tab.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          This is needed for Trapple to work. If your browser blocks it, you will not be able to stay signed in. Clearing it signs you out.
        </p>
      </>
    ),
  },
  {
    id: "functional",
    heading: "Functional: remembering your choices",
    body: (
      <>
        <div className="responsive-table legal-table">
          <table>
            <thead><tr><th>Name</th><th>Where</th><th>Purpose</th><th>How long</th></tr></thead>
            <tbody>
              <tr><td><code>trapple_theme</code></td><td>Local storage</td><td>Whether you chose the light or dark theme.</td><td>Until you clear it.</td></tr>
              <tr><td><code>trapple_sidebar_collapsed</code></td><td>Local storage</td><td>Whether the side menu is collapsed (older menu layout only).</td><td>Until you clear it.</td></tr>
              <tr><td><code>trapple-ai-launcher-hidden</code></td><td>Local storage</td><td>Whether you hid the assistant button.</td><td>Until you clear it.</td></tr>
              <tr><td><code>trapple-bi-filters</code></td><td>Session storage</td><td>The filters you picked on the reports pages.</td><td>Until you close the tab.</td></tr>
            </tbody>
          </table>
        </div>
        <p>These hold settings only, not personal details. If they are blocked or cleared, Trapple still works and simply forgets the setting.</p>
      </>
    ),
  },
  {
    id: "analytics",
    heading: "Analytics and advertising",
    body: <p>None. Trapple does not use analytics, advertising, social media or tracking cookies or scripts.</p>,
  },
  {
    id: "third-party",
    heading: "Requests to other services",
    body: (
      <p>
        When a page loads, your browser fetches the website&apos;s typefaces from Google Fonts, and talks to Supabase for sign-in and data. Like any web
        request, these services receive your IP address and browser details. Trapple does not ask them to set cookies.
      </p>
    ),
  },
  {
    id: "control",
    heading: "Controlling browser storage",
    body: (
      <p>
        You can clear site data at any time in your browser&apos;s settings (look for &ldquo;cookies and site data&rdquo;). Clearing it signs you out and
        resets your theme and menu choices. If Trapple ever adds optional cookies or analytics, this page will be updated first and you will be asked
        before they are used.
      </p>
    ),
  },
];

const dataRows: DataRow[] = [
  {
    title: "Account information",
    what: "Work email address, password (stored only as a one-way hash by the sign-in provider), your role in Trapple and when you last signed in.",
    why: "To let you sign in securely and to give you the right access.",
    where: "Sign-in, password reset, account invitations and the Employees page.",
    who: "You, and the Director and Travel Desk who manage logins.",
  },
  {
    title: "Employee information",
    what: "Full name, employee ID, department, designation, manager, and whether you are a current or past employee.",
    why: "To attach requests and trips to the right person, send requests to the right approver and report spend by person and department.",
    where: "Your profile, travel requests, approvals, the Employees page, reports and the assistant.",
    who: "You; your approver for their team; booking assistants, the Travel Desk and the Director.",
  },
  {
    title: "Temporary and contract workforce",
    what: "Name and other names the person appears under in uploads, kind of worker (temporary, contract, outsourced), contractor, project, work location, contact phone when given, and whether the record has been checked.",
    why: "Site teams travel on company tickets without being on the payroll. This lets their travel be recorded against the right person, contractor and project without creating duplicates.",
    where: "Uploads, the Temporary Workforce pages and workforce spend reports.",
    who: "The Travel Desk and the Director (who can change these records), and booking assistants (view only). Approvers and employees cannot see this list.",
  },
  {
    title: "Company information",
    what: "Company name, base currency, projects and their other spellings, contractors.",
    why: "To group travel by project and contractor and report spend in the company's currency.",
    where: "Uploads, project and finance reports.",
    who: "Staff who see reports; the Travel Desk and Director maintain it.",
  },
  {
    title: "Travel and itinerary information",
    what: "Origin, destination, travel dates, one-way or return, preferred times, travel mode, project, purpose, hotel city and dates, notes and a contact phone number for the trip.",
    why: "To decide on, book and keep a record of work travel.",
    where: "Travel requests, approvals, trip history, the travel map and reports.",
    who: "You; your approver; booking assistants, the Travel Desk and the Director.",
  },
  {
    title: "Booking and cancellation information",
    what: "PNR or booking reference, ticket number, carrier or provider, fares, extra charges, cancellation fees, credits, payment mode, booking status, group bookings and who made the booking.",
    why: "To show travellers their tickets, keep the company's travel records and report what was spent and what was cancelled.",
    where: "Your requests and trips, bulk and group bookings, finance reports.",
    who: "You for your own trips; your approver; booking assistants, the Travel Desk and the Director.",
  },
  {
    title: "Uploaded files and documents",
    what: "Tickets, receipts and travel spreadsheets (PDF, image, CSV or Excel, up to 10 MB each), their file name, and the details read from them, such as passenger names, PNR, route and fare.",
    why: "To keep the original ticket or receipt with the trip or expense, and to save typing by reading the details out automatically.",
    where: "Tickets & documents, Upload anything, upload reports and expenses.",
    who: "You for documents filed under your name; your approver; booking assistants, the Travel Desk and the Director.",
  },
  {
    title: "Expenses",
    what: "Date, category, description, amount, payment method, receipt, review status and note, and reimbursement date.",
    why: "To review and reimburse work expenses.",
    where: "My expenses and the expenses review page.",
    who: "The person the expense belongs to; their approver; the Travel Desk and the Director.",
  },
  {
    title: "Technical and usage information",
    what: "An audit log of important actions (who, what and when), questions asked in the assistant and their answers, and usage counts that limit how often the assistant and scanner can be called. Our hosting providers also keep standard server logs, such as IP address, browser type and time of each request.",
    why: "To keep Trapple secure, trace changes, prevent abuse and fix problems.",
    where: "Behind the scenes; the assistant shows you your own conversations.",
    who: "Your assistant chats: you. The audit log: the Director and Travel Desk. Server logs: the people who run the service.",
  },
];

const dataWeCollect: LegalSection[] = [
  {
    id: "overview",
    heading: "Overview",
    body: (
      <>
        <p>
          This page lists every kind of information in Trapple, based on what the app actually stores. For how it is protected and your rights, see the{" "}
          <PageLink href="/privacy-policy">Privacy Policy</PageLink>.
        </p>
        <p>
          Trapple does <strong>not</strong> collect bank or card details, Aadhaar, PAN or passport numbers, health information, home addresses, your
          location, or information about you from other websites.
        </p>
      </>
    ),
  },
  {
    id: "categories",
    heading: "Information by category",
    body: (
      <div className="legal-data-grid">
        {dataRows.map((row) => <DataCard key={row.title} row={row} />)}
      </div>
    ),
  },
  {
    id: "roles",
    heading: "Roles at a glance",
    body: ROLES_TABLE,
  },
  {
    id: "sources",
    heading: "Where the information comes from",
    body: (
      <ul>
        <li>From you, when you submit a request, an expense or a document.</li>
        <li>From the Travel Desk, when they create your record, book your travel or upload the company&apos;s travel spreadsheets and tickets.</li>
        <li>Read automatically from uploaded tickets and spreadsheets, and then checked by a person before it is saved.</li>
      </ul>
    ),
  },
];

const refunds: LegalSection[] = [
  {
    id: "platform-vs-vendor",
    heading: "Trapple records cancellations; it does not issue refunds",
    body: (
      <>
        <p>
          Trapple is a workflow and record-keeping tool. It does not sell tickets and does not take or hold payments, so there is no fee for using
          Trapple and nothing to refund for it.
        </p>
        <p>Three different parties are involved when travel is cancelled:</p>
        <ul>
          <li><strong>Trapple</strong> records the cancellation, any charge and any credit, so the company&apos;s travel records stay accurate.</li>
          <li><strong>The airline, railway, bus operator, hotel or agent</strong> decides whether a refund is due, how much, and when, under their own rules.</li>
          <li><strong>{D.companyShortName}</strong> decides who bears a cancellation charge and how expenses are reimbursed, under its travel and expense policies.</li>
        </ul>
        {DRAFT_NOTE}
      </>
    ),
  },
  {
    id: "request-cancellation",
    heading: "Cancelling a travel request",
    body: (
      <p>
        You can cancel your own travel request in Trapple while it is still <em>pending</em>. Nothing has been booked at that point, so there is no
        charge. Once a request has been approved or booked, ask the Travel Desk to cancel it.
      </p>
    ),
  },
  {
    id: "booking-cancellation",
    heading: "Cancelling a booking",
    body: (
      <>
        <p>
          Booked travel is cancelled by the Travel Desk or a booking assistant with the airline, railway, bus operator, hotel or agent. They then mark the
          booking as cancelled in Trapple. A group booking can be cancelled as a whole, or one traveller can be taken off it, which cancels that traveller's trip.
        </p>
        <p>Cancelled trips are kept and shown separately in reports, so they do not count as travel spend.</p>
      </>
    ),
  },
  {
    id: "charges",
    heading: "Cancellation charges",
    body: (
      <p>
        Cancellation fees, change fees and reissue charges are set by the provider, not by Trapple. When they are known, they are recorded against the
        trip so that the company&apos;s reports show the real cost of the cancellation.
      </p>
    ),
  },
  {
    id: "vendor-refunds",
    heading: "Refunds from airlines and other providers",
    body: (
      <p>
        Whether a refund is due, its amount and how long it takes are decided by the provider and by the fare or ticket rules (for example,
        non-refundable fares, IRCTC cancellation rules or a hotel&apos;s cancellation window). Refunds go back to whoever paid for the booking, usually the
        company or its travel agent. Trapple cannot speed up or guarantee a refund. When the company records a credit or refund, it appears against the
        trip in Trapple&apos;s reports.
      </p>
    ),
  },
  {
    id: "company-reimbursement",
    heading: "Company and employee reimbursements",
    body: (
      <>
        <p>
          If you paid for something yourself, it is recorded as an expense in Trapple with the receipt (staff record their own; others can ask the
          Travel Desk). It is then reviewed by the Director or Travel Desk and marked approved, rejected or reimbursed. The payment itself is made by the company outside Trapple, under its expense policy.
        </p>
        <p>
          If a cancellation was your choice and not needed for work, the company&apos;s travel policy decides whether you bear any charge. Ask the Travel
          Desk if you are unsure.
        </p>
      </>
    ),
  },
  {
    id: "limitations",
    heading: "What Trapple cannot do",
    body: (
      <ul>
        <li>Trapple does not promise any refund amount or timeline.</li>
        <li>Trapple does not process payments, refunds or reimbursements; it records them.</li>
        <li>Reports only show refunds and credits that have been entered or uploaded.</li>
      </ul>
    ),
  },
  {
    id: "questions",
    heading: "Questions",
    body: (
      <p>
        For a specific booking or refund, <ContactLine subject="Cancellation" />. See <PageLink href="/contact">Contact Us</PageLink>.
      </p>
    ),
  },
];

function ContactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal-contact-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

const support = D.supportEmail;
const privacyEmail = privacyContactEmail();

const contact: LegalSection[] = [
  {
    id: "contacts",
    heading: "How to reach us",
    body: (
      <div className="legal-contact-grid">
        <ContactCard title="Travel desk support">
          <p>Help with requests, bookings, tickets, expenses or your account.</p>
          {support ? <p><Email address={support} subject="Trapple support" /></p> : <p>Contact the Travel Desk through your usual internal channel.</p>}
          {D.supportPhone && <p><a href={`tel:${D.supportPhone.replace(/[^0-9+]/g, "")}`}>{D.supportPhone}</a></p>}
        </ContactCard>
        <ContactCard title="Privacy">
          <p>Questions about your personal data, or a request to see, correct or erase it.</p>
          {privacyEmail ? (
            <p><Email address={privacyEmail} subject="Privacy request" />{!D.privacyEmail && <> with &ldquo;Privacy&rdquo; in the subject line</>}</p>
          ) : (
            <p>Speak to the Travel Desk.</p>
          )}
        </ContactCard>
        <ContactCard title="Complaints and grievances">
          {D.grievanceOfficer ? (
            <p>
              {D.grievanceOfficer.name}, {D.grievanceOfficer.role}
              <br />
              <Email address={D.grievanceOfficer.email} subject="Grievance" />
            </p>
          ) : (
            <p>
              Raise it with the Travel Desk first{privacyEmail ? <> at <Email address={privacyEmail} subject="Grievance" /></> : null}. If a privacy
              complaint is not resolved, you may approach the Data Protection Board of India.
            </p>
          )}
        </ContactCard>
      </div>
    ),
  },
  {
    id: "company",
    heading: "Company",
    body: (
      <dl className="legal-facts">
        <div><dt>Company</dt><dd>{D.companyName}</dd></div>
        <div><dt>Location</dt><dd>{D.registeredAddress ?? D.city}</dd></div>
        {D.cin && <div><dt>CIN</dt><dd>{D.cin}</dd></div>}
        <div><dt>Service</dt><dd>Trapple, the company&apos;s employee travel desk system</dd></div>
      </dl>
    ),
  },
  {
    id: "before-you-write",
    heading: "Before you write",
    body: (
      <ul>
        <li>For a trip or booking, include the route, travel date and PNR or booking reference if you have it.</li>
        <li>Never send your password. The Travel Desk will never ask for it.</li>
        <li>Forgotten your password? Use &ldquo;Forgot password&rdquo; on the <PageLink href="/login">sign-in page</PageLink>.</li>
      </ul>
    ),
  },
];

export const LEGAL_CONTENT: Record<LegalSlug, LegalSection[]> = {
  "privacy-policy": privacy,
  "terms-and-conditions": terms,
  "cookie-policy": cookies,
  "data-we-collect": dataWeCollect,
  "cancellation-and-refund-policy": refunds,
  contact,
};
