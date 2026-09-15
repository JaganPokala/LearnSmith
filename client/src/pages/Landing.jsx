import { Link } from 'react-router-dom';
import PromptForm from '../components/PromptForm.jsx';
import { useAuth, AUTH_ENABLED } from '../lib/auth.js';
import { useFeatures } from '../hooks/useFeatures.js';

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

/**
 * The Hinglish sample, shown rather than described. It is a real round trip
 * through the translator's own rules: Roman script, code-mixed, and every
 * technical term left in English because that is how they are said out loud.
 */
const HINGLISH_SAMPLE = {
  en: 'The engine converts chemical energy into thrust.',
  hi: 'Engine chemical energy ko thrust mein convert karta hai.',
};

/**
 * A still waveform for the mock player. Hard-coded rather than random: a
 * re-render must not reshuffle it, and a decorative strip is not worth a seeded
 * PRNG. Bars before PLAYED are drawn in accent and the rest muted, so it reads
 * as audio mid-playback at a glance instead of as a bar chart.
 */
const WAVE = [
  26, 44, 32, 60, 76, 50, 38, 64, 86, 69, 47, 31, 56, 78,
  93, 72, 53, 36, 45, 66, 84, 60, 42, 28, 50, 71, 39, 25,
];

const PLAYED = 0.42;

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
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth();

  // The same flag the lesson page gates AudioPlayer on. Narration needs an
  // OpenAI key on the server, so a deployment without one must not be sold
  // narration — every mention of Hinglish on this page hangs off this.
  const features = useFeatures();

  // The two capabilities nobody expects are the two worth linking: a chip that
  // scrolls to the panel demonstrating it beats a sentence claiming it.
  const chips = [
    { label: 'no signup to try' },
    { label: 'outline in ~7s' },
    ...(features.tts ? [{ label: '▶ hinglish audio', href: '#capabilities' }] : []),
    { label: '⇩ save as pdf', href: '#capabilities' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0c0f] text-[#c9d1da]">
      {/* ───────────────────── NAV ───────────────────── */}
      <nav className="flex items-center gap-4 border-b border-[#191f26] px-5 py-4 sm:gap-6 sm:px-8">
        <span className="font-mono text-[15px] font-bold tracking-[-0.03em] text-glow">
          text-to-learn
        </span>

        {/* Section links start at sm. A phone loses nothing by them being
            absent — the form they point past is the first thing on the page —
            and the auth control is what that space is for instead.

            All three sit at sm rather than one of them waiting for md: the old
            "Generate a course" CTA was ~150px of the bar, and without it a
            640px nav fits the wordmark, three links and a button with room
            over. */}
        <a href="#how" className="hidden text-[14.5px] text-[#8b95a1] hover:text-white sm:block">
          How it works
        </a>

        <a
          href="#capabilities"
          className="hidden text-[14.5px] text-[#8b95a1] hover:text-white sm:block"
        >
          Features
        </a>

        <Link
          to="/courses"
          className="hidden text-[14.5px] text-[#8b95a1] hover:text-white sm:block"
        >
          My courses
        </Link>

        <span className="flex-1" />

        {/* Never hidden at any width. Sign out used to be sm:block, which on a
            phone left a signed-in reader with no way out of the account at all.

            The two states are weighted differently on purpose. Signed out, this
            is the only action in the bar, so it is a button — but a bordered one
            rather than a filled one, because the page promises "no signup to
            try" three lines below and a loud Sign in would contradict it.
            Signed in, it is bookkeeping, so it goes quiet. */}
        {AUTH_ENABLED && !isLoading && (
          isAuthenticated ? (
            <button
              type="button"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              title={user?.email ?? ''}
              className="shrink-0 text-[14.5px] text-[#8b95a1] hover:text-white"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => loginWithRedirect()}
              className="shrink-0 border border-accent-line bg-accent-bg px-[14px] py-[7px] text-[14px] font-semibold text-glow hover:border-glow hover:bg-raised"
            >
              Sign in
            </button>
          )
        )}
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
            code where it helps, and quizzes that explain their answers.{' '}
            {features.tts
              ? 'Listen to any lesson in Hinglish, or save it as a PDF and read it on paper.'
              : 'Save any lesson as a PDF and read it on paper.'}
          </p>

          {/* The real form. No id and no scroll-mt any more: both existed only
              for the nav CTA that used to scroll down to this, and the form is
              now the first thing on the page regardless. */}
          <div className="mx-auto max-w-[520px] text-left">
            <PromptForm variant="hero" />
          </div>

          <div className="mt-[18px] flex flex-wrap items-center justify-center gap-2">
            {chips.map(({ label, href }) =>
              href ? (
                <a
                  key={label}
                  href={href}
                  className="border border-[#1e2730] bg-[#0d1116] px-[11px] py-[5px] font-mono text-[12px] text-[#93a0ad] hover:border-accent hover:text-glow"
                >
                  {label}
                </a>
              ) : (
                <span
                  key={label}
                  className="border border-[#161c23] px-[11px] py-[5px] font-mono text-[12px] text-[#5c6773]"
                >
                  {label}
                </span>
              ),
            )}
          </div>

          <p className="mt-5 text-[14.5px] text-[#8b95a1]">
            Already made some?{' '}
            <Link to="/courses" className="text-glow underline underline-offset-4 hover:text-white">
              Open your library
            </Link>
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
      <section
        id="features"
        className="scroll-mt-16 border-b border-[#191f26] px-5 py-14 sm:px-8 sm:py-[62px]"
      >
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

      {/* ───────────────────── CAPABILITIES ─────────────────────
          Two panels, not two more cards in the grid above. Both of these act on
          a lesson that already exists, both are the reason to pick this over a
          chat window, and neither survives being compressed into three lines
          beside five siblings.

          Each panel is copy on top and a mock of the real interface below. The
          mocks are aria-hidden: they are pictures of a UI, and a screen reader
          reading out a fake waveform helps nobody. */}
      <section
        id="capabilities"
        className="scroll-mt-16 border-b border-[#191f26] px-5 py-14 sm:px-8 sm:py-[62px]"
      >
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-glow">
          Once a lesson is written
        </p>
        <h2 className="m-0 mb-[10px] text-[32px] font-bold tracking-[-0.028em] text-[#f2f6f9]">
          {features.tts ? 'Hear it. Or take it with you.' : 'Take it with you.'}
        </h2>
        <p className="m-0 mb-8 max-w-[58ch] text-[16.5px] leading-[1.6] text-[#8b95a1]">
          A written lesson is not the end of it.{' '}
          {features.tts
            ? 'Any lesson can be narrated in Hinglish or saved as a PDF'
            : 'Any lesson can be saved as a PDF'}{' '}
          — no plugin, no export queue, no second tool.
        </p>

        {/* One column when narration is off, so a lone panel is not stranded at
            half width beside an empty cell. */}
        <div
          className={`grid gap-px border border-[#191f26] bg-[#191f26] ${
            features.tts ? 'lg:grid-cols-2' : ''
          }`}
        >
          {features.tts && (
            <div className="bg-[#0d1116] px-5 py-[26px] sm:px-7">
              <div className="mb-3 font-mono text-[12px] uppercase tracking-[0.13em] text-glow">
                listen · hinglish
              </div>

              <h3 className="m-0 mb-[10px] text-[21px] font-semibold tracking-[-0.02em] text-[#e8edf2]">
                Explained the way it would be said out loud
              </h3>

              <p className="m-0 mb-5 text-[15.5px] leading-[1.62] text-[#87919d]">
                The lesson is translated into spoken Hinglish — Roman script, code-mixed, the
                register an Indian teacher actually uses with one student. Technical terms stay
                in English, because nobody says them any other way.
              </p>

              {/* One line of English and the line it becomes. That pair is the
                  entire pitch, and no paragraph about it lands as hard. */}
              <div aria-hidden="true" className="mb-4 border border-[#1b222a] bg-[#0a0d11]">
                <div className="border-b border-[#1b222a] px-[13px] py-[10px]">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#5c6773]">
                    lesson
                  </span>
                  <p className="m-0 mt-[5px] text-[14px] leading-[1.5] text-[#7c8894]">
                    {HINGLISH_SAMPLE.en}
                  </p>
                </div>

                <div className="px-[13px] py-[10px]">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-glow">
                    narration
                  </span>
                  <p className="m-0 mt-[5px] text-[14px] leading-[1.5] text-[#dce4ec]">
                    {HINGLISH_SAMPLE.hi}
                  </p>
                </div>
              </div>

              {/* The player, mid-playback. */}
              <div
                aria-hidden="true"
                className="flex items-center gap-3 border border-[#1b222a] bg-[#0a0d11] px-[13px] py-[11px]"
              >
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center bg-glow text-[10px] text-[#0a0c0f]">
                  ▶
                </span>

                <span className="flex h-[30px] min-w-0 flex-1 items-center gap-[2px]">
                  {WAVE.map((h, i) => (
                    <span
                      key={i}
                      className={`flex-1 ${i / WAVE.length < PLAYED ? 'bg-glow' : 'bg-[#2a343e]'}`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </span>

                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#5c6773]">
                  1:04
                </span>
              </div>

              <p className="m-0 mt-[11px] font-mono text-[11.5px] leading-[1.55] text-[#5c6773]">
                recorded once in ~25s, then saved · every replay after that is instant
              </p>
            </div>
          )}

          <div className="bg-[#0d1116] px-5 py-[26px] sm:px-7">
            <div className="mb-3 font-mono text-[12px] uppercase tracking-[0.13em] text-glow">
              export · pdf
            </div>

            <h3 className="m-0 mb-[10px] text-[21px] font-semibold tracking-[-0.02em] text-[#e8edf2]">
              A lesson that survives leaving the browser
            </h3>

            <p className="m-0 mb-5 text-[15.5px] leading-[1.62] text-[#87919d]">
              One click hands the lesson to your print dialog already typeset for paper — the
              dark theme swapped for ink on white, the rail and the player gone. Choose
              “Save as PDF” and you get real selectable, searchable text, not a screenshot of
              a web page.
            </p>

            {/* Actual paper against the dark panel. The inversion IS the
                feature, so the mock is the argument. */}
            <div
              aria-hidden="true"
              className="mb-4 bg-white px-[18px] py-[16px] text-[#0d1114] shadow-[0_18px_44px_rgba(0,0,0,.5)]"
            >
              <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#626c76]">
                Rocket Propulsion / Module 2 / lesson 3 of 5
              </div>

              <div className="mb-[10px] mt-[7px] text-[15px] font-bold tracking-[-0.02em]">
                How a Rocket Engine Makes Thrust
              </div>

              <p className="m-0 mb-[10px] text-[9px] leading-[1.7] text-[#232c34]">
                A rocket engine burns propellant in a combustion chamber and accelerates the
                resulting gas through a nozzle. The engine pushes the gas backwards, and the gas
                pushes the engine forwards by exactly as much.
              </p>

              <div className="mb-[10px] border-l-2 border-[#a8d4de] bg-[#f1fafc] px-[8px] py-[6px] font-mono text-[8px] leading-[1.6] text-[#0a5163]">
                thrust = mass_flow × exhaust_velocity
              </div>

              <div className="flex flex-col gap-[5px]">
                <span className="h-[3px] w-full bg-[#e3e7eb]" />
                <span className="h-[3px] w-full bg-[#e3e7eb]" />
                <span className="h-[3px] w-[62%] bg-[#e3e7eb]" />
              </div>

              <div className="mt-[13px] border-t border-[#d7dce2] pt-[6px] text-right font-mono text-[7.5px] text-[#626c76]">
                1 / 2
              </div>
            </div>

            <p className="m-0 font-mono text-[11.5px] leading-[1.55] text-[#5c6773]">
              headings never strand at a page foot · code blocks are never cut in half
            </p>
          </div>
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/courses" className="font-mono text-[12px] text-[#8b95a1] hover:text-glow sm:text-[13px]">
              my courses
            </Link>
            <a
              href="#capabilities"
              className="font-mono text-[12px] text-[#8b95a1] hover:text-glow sm:text-[13px]"
            >
              hinglish &amp; pdf
            </a>
            <a href="#how" className="font-mono text-[12px] text-[#8b95a1] hover:text-glow sm:text-[13px]">
              how it works
            </a>
            <span className="font-mono text-[12px] text-[#5d6b7a] sm:text-[13px]">
              generated on demand · verify before you rely on them
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
