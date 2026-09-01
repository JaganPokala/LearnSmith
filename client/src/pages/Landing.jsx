import PromptForm from '../components/PromptForm.jsx';

/**
 * The public landing page — the "Console" direction, dark throughout.
 *
 * No data and no hooks. The only working element is the hero PromptForm, the
 * same component the library uses, so the double-submit guard and the
 * navigate-on-success live in one place.
 *
 * Rendered OUTSIDE AppLayout (main.jsx), so there is no rail and this page owns
 * the full viewport.
 *
 * All copy lives in the arrays below. Editing words should never mean editing
 * markup.
 */

/** Measured, not claimed. Every number here is one we have actually seen. */
const PROOF = [
  ['3–6', 'modules per course'],
  ['~7s', 'to full outline'],
  ['~10s', 'per lesson body'],
  ['0', 'invented video links'],
];

const FEATURES = [
  {
    title: 'Ordered by dependency',
    body: 'Modules are planned so no lesson relies on an idea you have not met yet. Foundations first, applications last.',
  },
  {
    title: 'Lessons written on open',
    body: 'Outlines arrive in seconds. A lesson body is written the first time you open it, then saved — no four-minute wait for twenty lessons you will not read.',
  },
  {
    title: 'Code where code helps',
    body: 'Examples in the language the lesson is actually about, with the language named. A copyright course gets none, and that is correct.',
  },
  {
    title: 'Quizzes that explain',
    body: 'Every question ends with why the right answer is right. Wrong options are plausible enough to be worth ruling out.',
  },
  {
    title: 'Searches, not invented links',
    body: 'The model writes the words you would type into YouTube. It never invents a video id that does not exist.',
  },
  {
    title: 'Checked before it is saved',
    body: 'Module counts, empty titles, duplicated sections, answers that index nothing. A failing outline is generated again rather than shown to you.',
  },
];

const STEPS = [
  {
    title: 'Name a topic',
    body: '“Intro to React Hooks”. “Basics of copyright law”. “How to bake sourdough”. Anything you would search for.',
  },
  {
    title: 'Read the outline',
    body: 'Modules and lesson titles come back in about seven seconds, already ordered so you can start at the top.',
  },
  {
    title: 'Open what you need',
    body: 'Click a lesson and its body is written for you. Come back and it loads instantly.',
  },
];

/** The cyan bloom behind the headline. */
const GLOW = {
  background:
    'radial-gradient(ellipse at center, rgba(34,211,238,.20) 0%, rgba(14,116,144,.07) 42%, transparent 70%)',
};

/**
 * The faint grid, faded at the edges by a radial mask so it never ends on a
 * hard line. Both spellings: Safari still wants -webkit-mask-image.
 */
const GRID = {
  backgroundImage:
    'linear-gradient(#141a21 1px, transparent 1px), linear-gradient(90deg, #141a21 1px, transparent 1px)',
  backgroundSize: '52px 52px',
  maskImage: 'radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 75%)',
};

/** Two shadows: a tight bloom and a wide halo. Either alone reads as a blur. */
const HEADLINE_GLOW = {
  textShadow: '0 0 44px rgba(34,211,238,.42), 0 0 96px rgba(34,211,238,.16)',
};

const ACCENT_GLOW = { textShadow: '0 0 34px rgba(34,211,238,.72)' };

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0c0f] text-[#c9d1da]">
      {/* ───────────────────── NAV ───────────────────── */}
      <nav className="flex items-center gap-6 border-b border-[#191f26] px-5 py-4 sm:px-8">
        <span className="font-mono text-[15px] font-bold tracking-[-0.03em] text-glow">
          text-to-learn
        </span>

        {/* Hidden on a phone: three items in a 375px bar leaves no room for the
            one that matters. */}
        <a href="#how" className="hidden text-[14.5px] text-[#8b95a1] hover:text-white sm:block">
          How it works
        </a>

        <span className="flex-1" />

        <a href="#generate" className="bg-glow px-4 py-2 text-[14px] font-semibold text-[#0a0c0f]">
          Generate a course
        </a>
      </nav>

      {/* ───────────────────── HERO ───────────────────── */}
      <div className="relative overflow-hidden px-5 pb-14 pt-16 text-center sm:px-8 sm:pb-[62px] sm:pt-[78px]">
        {/* Decoration only: absolute, pointer-events-none, behind everything.
            The content below carries `relative` so it stacks above them without
            needing a z-index race. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[140px] left-1/2 h-[420px] w-[820px] -translate-x-1/2"
          style={GLOW}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={GRID} />

        <div className="relative">
          <p className="mb-5 font-mono text-[11.5px] uppercase tracking-[0.16em] text-glow">
            AI course generator
          </p>

          <h1
            className="m-0 mb-5 text-[clamp(2.25rem,5.6vw,3.75rem)] font-extrabold leading-[1.03] tracking-[-0.04em] text-[#f2f6f9]"
            style={HEADLINE_GLOW}
          >
            Type a topic.
            <br />
            Get a{' '}
            <span className="text-glow" style={ACCENT_GLOW}>
              course
            </span>
            .
          </h1>

          <p className="mx-auto mb-8 max-w-[56ch] text-[17px] leading-[1.6] text-[#93a0ad]">
            One line of text becomes a structured syllabus — ordered modules, written lessons,
            code where it helps, and quizzes that explain their answers.
          </p>

          {/* The real form. `id` is what the nav button scrolls to. */}
          <div id="generate" className="mx-auto max-w-[520px] scroll-mt-20 text-left">
            <PromptForm variant="hero" />
          </div>

          <p className="mt-4 font-mono text-[12px] text-[#5c6773]">
            no signup to try · outline in ~7s
          </p>
        </div>
      </div>

      {/* ───────────────────── PROOF STRIP ─────────────────────
          Two columns on a phone, four from md up. The artifact drops to two at
          820px and stays there; four 26px numbers do not fit 375px.

          Centred inside each cell. At two columns a cell is half the viewport,
          and left-aligned content strands its number against the divider with a
          third of the strip empty beside it — directly under a centred hero. */}
      <div className="grid grid-cols-2 border-y border-[#191f26] md:grid-cols-4">
        {PROOF.map(([value, label]) => (
          <div
            key={label}
            className="border-b border-r border-[#191f26] px-6 py-5 text-center last:border-r-0 md:border-b-0"
          >
            <div className="text-[26px] font-bold tracking-[-0.03em] tabular-nums text-[#f2f6f9]">
              {value}
            </div>
            <div className="mt-[5px] font-mono text-[11px] uppercase tracking-[0.12em] text-[#69737f]">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ───────────────────── FEATURES ───────────────────── */}
      <section className="border-b border-[#191f26] px-5 py-14 sm:px-8 sm:py-[62px]">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-glow">
          What you get
        </p>
        <h2 className="m-0 mb-[10px] text-[32px] font-bold tracking-[-0.028em] text-[#f2f6f9]">
          A syllabus, not a wall of text
        </h2>
        <p className="m-0 mb-8 max-w-[58ch] text-[16.5px] leading-[1.6] text-[#8b95a1]">
          Every course is checked against a contract before it is saved. If it fails, it is
          generated again — you never see a broken one.
        </p>

        {/* gap-px over a lighter background draws the hairlines between cells
            without a border on each one doubling up. */}
        <div className="grid gap-px border border-[#191f26] bg-[#191f26] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <div key={feature.title} className="bg-[#0d1116] px-5 py-[22px]">
              <div className="mb-3 font-mono text-[12px] text-accent">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="m-0 mb-[7px] text-[17px] font-semibold tracking-[-0.01em] text-[#e8edf2]">
                {feature.title}
              </h3>
              <p className="m-0 text-[15px] leading-[1.62] text-[#87919d]">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────── STEPS ───────────────────── */}
      <section id="how" className="border-b border-[#191f26] px-5 py-14 sm:px-8 sm:py-[62px]">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-glow">
          How it works
        </p>
        <h2 className="m-0 mb-8 text-[32px] font-bold tracking-[-0.028em] text-[#f2f6f9]">
          Three steps, no configuration
        </h2>

        <div className="grid gap-[22px] sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="border-t-2 border-accent pt-[14px]">
              <div className="mb-2 font-mono text-[12px] text-glow">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="m-0 mb-[6px] text-[17px] font-semibold text-[#e8edf2]">
                {step.title}
              </h3>
              <p className="m-0 text-[15px] leading-[1.6] text-[#87919d]">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────── FOOTER — kept from the previous version ───── */}
      <footer className="px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span className="font-mono text-[15px] font-bold tracking-[-0.03em] text-glow">
            text-to-learn
          </span>
          <span className="font-mono text-[12px] text-[#5d6b7a] sm:text-[13px]">
            all courses generated on demand · verify before you rely on them
          </span>
        </div>
      </footer>
    </div>
  );
}
