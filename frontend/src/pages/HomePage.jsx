import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

/* ─── Constants ─────────────────────────────────────────────── */
const COMPANY = 'GetAiPilot';
const PRODUCT = 'GAP FlowPilot';
const DOMAIN = 'getaipilot.in';
const SUPPORT_EMAIL = 'getaipilott@gmail.com';

/* ─── Inline SVG Icon Component ────────────────────────────── */
const Icon = ({ d, size = 24, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const icons = {
  flow: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.636 5.636l2.121 2.121m8.486 8.486l2.121 2.121M5.636 18.364l2.121-2.121m8.486-8.486l2.121-2.121',
  message: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  bot: 'M12 8V4H8M12 4h4m-4 0v4m-6 4v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4a4 4 0 0 0-4-4h-4a4 4 0 0 0-4 4zm3 2h.01M15 14h.01',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  broadcast: 'M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z',
  contacts: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  check: 'M20 6L9 17l-5-5',
  arrow: 'M5 12h14m-7-7l7 7-7 7',
  globe: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  template: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8m8 4H8m2-8H8',
  users: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
};

/* ─── Simple Section Wrapper (No hiding elements) ──────────── */
function SectionBlock({ children, className = '' }) {
  return <div className={`hp-section-block ${className}`}>{children}</div>;
}

/* ─── Home Page Component ───────────────────────────────────── */
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = `${PRODUCT} | WhatsApp Automation & Google Calendar Platform`;
    
    // Ensure body and html overflow allows natural scrolling on this page
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';

    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
    };
  }, []);

  return (
    <div className="hp-root">
      {/* ── Header / Navigation ── */}
      <nav className={`hp-nav ${scrolled ? 'hp-nav--scrolled' : ''}`}>
        <div className="hp-container hp-nav__inner">
          <Link to="/" className="hp-nav__brand">
            <img src="/logo.png" alt={`${PRODUCT} Logo`} className="hp-nav__logo" />
            <span className="hp-nav__name">{PRODUCT}</span>
          </Link>

          <div className="hp-nav__actions-only">
            <Link to="/login" className="hp-btn hp-btn--ghost">Log In</Link>
            <Link to="/login" className="hp-btn hp-btn--primary">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="hp-hero">
        <div className="hp-hero__glow" aria-hidden="true" />
        <div className="hp-container hp-hero__grid">
          <div className="hp-hero__content">
            <div className="hp-hero__badge">
              <Icon d={icons.zap} size={15} /> Enterprise WhatsApp Cloud API & Integration Suite
            </div>
            <h1 className="hp-hero__title">
              Complete WhatsApp Business Automation & Google Calendar Scheduling
            </h1>
            <p className="hp-hero__sub">
              {PRODUCT} bridges Meta's WhatsApp Cloud API with business operations. Build complex conversational workflows, manage customer live chats with multi-agent teams, broadcast bulk notifications, and schedule meetings directly into Google Calendar.
            </p>
            <div className="hp-hero__ctas">
              <Link to="/login" className="hp-btn hp-btn--primary hp-btn--lg">Log In to Platform</Link>
              <Link to="/login" className="hp-btn hp-btn--outline hp-btn--lg">Sign Up Free</Link>
            </div>
          </div>
          <div className="hp-hero__visual">
            <img
              src="/images/hero-dashboard.png"
              alt={`${PRODUCT} SaaS Dashboard Interface`}
              className="hp-hero__img"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ── Tech Stack Strip ── */}
      <section className="hp-trust">
        <div className="hp-container">
          <p className="hp-trust__label">Built on Official Enterprise APIs</p>
          <div className="hp-trust__logos">
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/whatsapp/25D366" alt="WhatsApp Business" width="30" height="30" />
              <span>WhatsApp Cloud API</span>
            </div>
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/googlecalendar/4285F4" alt="Google Calendar" width="30" height="30" />
              <span>Google Calendar API</span>
            </div>
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/meta/0081FB" alt="Meta Platforms" width="30" height="30" />
              <span>Meta Business Platform</span>
            </div>
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/supabase/3ECF8E" alt="Supabase" width="30" height="30" />
              <span>Supabase Enterprise DB</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Core Platform Modules ── */}
      <section className="hp-features">
        <div className="hp-container">
          <SectionBlock>
            <h2 className="hp-section-title">Core Platform Architecture & Modules</h2>
            <p className="hp-section-sub">
              {PRODUCT} delivers a comprehensive software solution for automating customer communication and scheduling.
            </p>
          </SectionBlock>

          <div className="hp-features__grid">
            {[
              {
                icon: icons.flow,
                title: 'Interactive Flow Engine',
                desc: 'Construct visual decision trees. Process user button clicks, message lists, keyword triggers, and condition branches in real-time.',
              },
              {
                icon: icons.calendar,
                title: 'Google Calendar Sync',
                desc: 'Expose live calendar free/busy slots via WhatsApp. Customers pick a slot, and an event is booked to Google Calendar with exact timezone offsets.',
              },
              {
                icon: icons.message,
                title: 'Multi-Agent Shared Inbox',
                desc: 'A team chat portal allowing multiple agents to respond to customer WhatsApp messages, transfer chats, add tags, and review history.',
              },
              {
                icon: icons.broadcast,
                title: 'Template Broadcast Manager',
                desc: 'Create, approve, and send targeted WhatsApp message broadcasts. Upload recipient CSV lists and view deliverability analytics.',
              },
              {
                icon: icons.bot,
                title: 'AI Conversational Agents',
                desc: 'Train specialized AI chatbots on custom knowledge bases to address repetitive customer inquiries before handing off to human agents.',
              },
              {
                icon: icons.contacts,
                title: 'Customer Contact Database',
                desc: 'Centralized CRM database storing contact phone numbers, conversation session state, custom flow variables, and profile pictures.',
              },
              {
                icon: icons.template,
                title: 'Meta Template Wizard',
                desc: 'Draft and submit WhatsApp message templates (Utility, Marketing, Authentication) directly to Meta for rapid approval.',
              },
              {
                icon: icons.chart,
                title: 'Live Metrics & Reporting',
                desc: 'Detailed dashboards tracking message throughput, session completion rates, agent response latency, and appointment bookings.',
              },
            ].map((f) => (
              <SectionBlock key={f.title} className="hp-feature-card">
                <div className="hp-feature-card__icon">
                  <Icon d={f.icon} size={22} />
                </div>
                <h3 className="hp-feature-card__title">{f.title}</h3>
                <p className="hp-feature-card__desc">{f.desc}</p>
              </SectionBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ── Deep Dive: Flow Automation & Inbox ── */}
      <section className="hp-deep-dive">
        <div className="hp-container">
          <SectionBlock>
            <h2 className="hp-section-title">In-Depth Application Overview</h2>
            <p className="hp-section-sub">
              Detailed breakdown of how {PRODUCT} powers end-to-end business communication and integration flows.
            </p>
          </SectionBlock>

          {/* Module 1: Flow Builder */}
          <div className="hp-deep-dive__block">
            <SectionBlock className="hp-deep-dive__content">
              <h3 className="hp-deep-dive__title">1. Drag-and-Drop WhatsApp Flow Engine</h3>
              <p className="hp-deep-dive__desc">
                The flow builder allows administrators to map complex interactive messaging journeys without code. Incoming messages trigger node executions that evaluate conditions, request user inputs, or call external API webhooks.
              </p>
              <ul className="hp-deep-dive__bullets">
                <li><Icon d={icons.check} size={18} className="hp-deep-dive__icon" /> <strong>Trigger Management:</strong> Start flows via inbound keyword matches, WhatsApp link clicks, or webhook events.</li>
                <li><Icon d={icons.check} size={18} className="hp-deep-dive__icon" /> <strong>Interactive Messaging:</strong> Send native WhatsApp button choices, multi-item pickers, and dynamic media documents.</li>
                <li><Icon d={icons.check} size={18} className="hp-deep-dive__icon" /> <strong>Session State Storage:</strong> Save customer selections directly into flow session state data for downstream processing.</li>
              </ul>
            </SectionBlock>
            <SectionBlock className="hp-deep-dive__visual">
              <img src="/images/feature-flow-builder.png" alt="Visual WhatsApp Flow Builder Canvas" className="hp-deep-dive__img" />
            </SectionBlock>
          </div>

          {/* Module 2: Team Collaboration */}
          <div className="hp-deep-dive__block hp-deep-dive__block--reverse">
            <SectionBlock className="hp-deep-dive__content">
              <h3 className="hp-deep-dive__title">2. Unified Live Chat & Agent Desk</h3>
              <p className="hp-deep-dive__desc">
                When automated flows reach human hand-off nodes, conversations seamlessly route to the multi-agent inbox. Team members can step in, answer questions, and manage customer relations.
              </p>
              <ul className="hp-deep-dive__bullets">
                <li><Icon d={icons.check} size={18} className="hp-deep-dive__icon" /> <strong>Agent Assignment:</strong> Route incoming WhatsApp chats automatically or manually to designated team agents.</li>
                <li><Icon d={icons.check} size={18} className="hp-deep-dive__icon" /> <strong>Internal Workspace Notes:</strong> Collaborate behind the scenes with internal agent notes before replying.</li>
                <li><Icon d={icons.check} size={18} className="hp-deep-dive__icon" /> <strong>Real-time Socket Sync:</strong> Instant web socket updates ensure messages display across agent screens instantly.</li>
              </ul>
            </SectionBlock>
            <SectionBlock className="hp-deep-dive__visual">
              <img src="/images/hero-dashboard.png" alt="Multi-Agent Live Chat Workspace" className="hp-deep-dive__img" />
            </SectionBlock>
          </div>
        </div>
      </section>

      {/* ── Comprehensive Google Calendar Integration Section ── */}
      <section className="hp-gcal">
        <div className="hp-container hp-gcal__inner">
          <SectionBlock>
            <div className="hp-gcal__badge">
              <img src="https://cdn.simpleicons.org/googlecalendar/4285F4" alt="" width="18" height="18" />
              <span>Official Google API Integration Specification</span>
            </div>
            <h2 className="hp-gcal__title">Google Calendar API Usage & OAuth Compliance</h2>
            <p className="hp-gcal__desc">
              {PRODUCT} integrates with the Google Calendar API to allow businesses to offer direct meeting scheduling inside WhatsApp. Below is the precise operational specification for Google OAuth verification compliance.
            </p>
          </SectionBlock>

          <div className="hp-gcal__grid">
            <SectionBlock className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">1. Purpose & Core Value</h4>
              <p className="hp-gcal__card-desc">
                The Google Calendar integration lets workspace owners connect their primary calendar. When a customer uses a WhatsApp flow to request a demo, consultation, or meeting, {PRODUCT} queries free/busy availability and creates the event automatically.
              </p>
            </SectionBlock>

            <SectionBlock className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">2. Requested OAuth Scopes</h4>
              <p className="hp-gcal__card-desc">
                We request scope access to:
                <br />• <code>userinfo.email</code> (identifies the connected Google account display name)
                <br />• <code>calendar.events</code> (creates, fetches, and deletes appointment events)
                <br />• <code>calendar.readonly</code> (inspects busy slots to prevent booking conflicts)
              </p>
            </SectionBlock>

            <SectionBlock className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">3. Timezone Offset Calculation</h4>
              <p className="hp-gcal__card-desc">
                Events are created using exact local ISO string timestamps (e.g. <code>2026-07-25T11:00:00+05:30</code> for IST). The system resolves the calendar's primary timezone setting to ensure events land on the accurate local hour.
              </p>
            </SectionBlock>

            <SectionBlock className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">4. Token Storage & Encryption</h4>
              <p className="hp-gcal__card-desc">
                Google OAuth access tokens and refresh tokens are encrypted using AES-256-CBC cipher prior to being stored in our Supabase database. Tokens are never exposed to client-side scripts.
              </p>
            </SectionBlock>

            <SectionBlock className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">5. Event Deletion & Management</h4>
              <p className="hp-gcal__card-desc">
                If an appointment is cancelled or deleted within the {PRODUCT} Scheduled Meetings portal, the application issues a <code>DELETE</code> request to the Google Calendar API to immediately remove the event.
              </p>
            </SectionBlock>

            <SectionBlock className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">6. Data Privacy & Non-Disclosure</h4>
              <p className="hp-gcal__card-desc">
                Google user data is strictly used to provide appointment scheduling features. We do not sell, rent, or share Google Calendar data with third-party advertising networks or data brokers.
              </p>
            </SectionBlock>
          </div>
        </div>
      </section>

      {/* ── Security & Infrastructure ── */}
      <section className="hp-security">
        <div className="hp-container">
          <SectionBlock>
            <h2 className="hp-section-title">Infrastructure, Security & Compliance</h2>
            <p className="hp-section-sub">
              Designed with enterprise safeguards to manage high-volume messaging and sensitive API tokens securely.
            </p>
          </SectionBlock>

          <div className="hp-security__grid">
            {[
              { icon: icons.lock, title: 'AES-256 Token Encryption', desc: 'All third-party credentials (Meta tokens, Google OAuth refresh tokens) are encrypted at rest using AES-256-CBC encryption.' },
              { icon: icons.shield, title: 'Meta & Google API Guidelines', desc: 'Full compliance with Meta Cloud API Policies and Google API Services User Data Policy, including Limited Use requirements.' },
              { icon: icons.globe, title: 'DPDP & GDPR Compliance', desc: 'Strict compliance with India’s Digital Personal Data Protection Act, 2023 (DPDP) and EU GDPR standards.' },
              { icon: icons.users, title: 'Multi-Tenant Isolation', desc: 'Complete organization level data segregation ensuring workspaces access only their authorized accounts and contacts.' },
            ].map((s) => (
              <SectionBlock key={s.title} className="hp-security-card">
                <div className="hp-security-card__icon"><Icon d={s.icon} size={22} /></div>
                <h3 className="hp-security-card__title">{s.title}</h3>
                <p className="hp-security-card__desc">{s.desc}</p>
              </SectionBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow Steps ── */}
      <section className="hp-steps">
        <div className="hp-container">
          <SectionBlock>
            <h2 className="hp-section-title">Workflow Execution Steps</h2>
            <p className="hp-section-sub">How businesses set up and operate {PRODUCT} for daily operations.</p>
          </SectionBlock>

          <div className="hp-steps__grid">
            {[
              { num: '01', title: 'Connect WhatsApp & Google', desc: 'Authenticate your WhatsApp Phone Number ID via Meta and connect Google Calendar via secure OAuth 2.0.' },
              { num: '02', title: 'Design Flow & Slot Rules', desc: 'Define your messaging logic, add interactive appointment nodes, and set meeting duration buffer rules.' },
              { num: '03', title: 'Automate & Manage Support', desc: 'Flows automate lead capture and appointment creation 24/7 while your team handles live chats from one place.' },
            ].map((s) => (
              <SectionBlock key={s.num} className="hp-step">
                <div className="hp-step__num">{s.num}</div>
                <h3 className="hp-step__title">{s.title}</h3>
                <p className="hp-step__desc">{s.desc}</p>
              </SectionBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ── Call To Action Section ── */}
      <section className="hp-cta">
        <div className="hp-container hp-cta__inner">
          <SectionBlock>
            <h2 className="hp-cta__title">Access {PRODUCT} Workspace</h2>
            <p className="hp-cta__desc">
              Log in to configure your WhatsApp Cloud API connections, build interactive flows, and manage scheduled meetings.
            </p>
            <Link to="/login" className="hp-btn hp-btn--primary hp-btn--lg">Log In to Application</Link>
          </SectionBlock>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="hp-footer">
        <div className="hp-container hp-footer__inner">
          <div className="hp-footer__brand">
            <img src="/logo.png" alt={`${PRODUCT} logo`} width="36" height="36" />
            <span className="hp-footer__name">{PRODUCT}</span>
            <p className="hp-footer__tagline">Enterprise WhatsApp Automation & Integration Platform by {COMPANY}</p>
          </div>

          <div className="hp-footer__cols">
            <div className="hp-footer__col">
              <h4 className="hp-footer__col-title">Platform</h4>
              <Link to="/login">Flow Builder</Link>
              <Link to="/login">Live Chat Inbox</Link>
              <Link to="/login">Google Calendar Sync</Link>
              <Link to="/login">Broadcast Campaigns</Link>
            </div>
            <div className="hp-footer__col">
              <h4 className="hp-footer__col-title">Compliance & Legal</h4>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy-policy">Privacy Policy</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`}>Support Inquiry ({SUPPORT_EMAIL})</a>
            </div>
            <div className="hp-footer__col">
              <h4 className="hp-footer__col-title">Authentication</h4>
              <Link to="/login">User Login</Link>
              <Link to="/agent-login">Agent Login</Link>
              <Link to="/login">Register Workspace</Link>
            </div>
          </div>
        </div>

        <div className="hp-container hp-footer__bottom">
          <p>&copy; {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
          <p>{DOMAIN}</p>
        </div>
      </footer>
    </div>
  );
}
