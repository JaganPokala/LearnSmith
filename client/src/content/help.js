export const helpSections = [
  {
    id: "getting-started",
    title: "Getting started",
    questions: [
      [
        "What happens when I create a course?",
        "Enter a topic, with any context about your experience or goals. LearnSmith creates an outline of modules and lessons. It does not generate every lesson at once. Choose a lesson and explicitly generate it when you’re ready.",
      ],
      [
        "Can I try without signing in?",
        "Yes, within the guest daily allowance. Keep your guest course link and open it in the same browser. Guest access depends on this browser’s cookie; losing it loses access. My learning lists account courses only. Guest courses do not automatically transfer when you sign in. Sign in before creating a course if you want it in your account library.",
      ],
      [
        "Are the lessons always correct?",
        "No. AI-generated explanations can contain mistakes. Check important information against reliable sources. A course or quiz result is not a certification.",
      ],
    ],
  },
  {
    id: "learning",
    title: "Lessons & progress",
    questions: [
      [
        "What does Continue restore?",
        "Continue returns to your last-opened lesson, including a lesson you have not generated yet. It does not restore your scroll position.",
      ],
      [
        "Does a quiz score complete a lesson?",
        "No. Mark a lesson complete yourself using its completion control. Quiz attempts and completion are saved separately.",
      ],
      [
        "How do I save a lesson as PDF?",
        "Open a generated lesson, choose Save as PDF, then select the PDF destination in your browser’s print dialog. Review the print preview before saving.",
      ],
    ],
  },
  {
    id: "allowances",
    title: "Usage & daily limits",
    questions: [
      [
        "Does reopening a lesson use my allowance?",
        "No. Reading saved lessons and replaying saved audio use no generation allowance. Creating outlines, generating lesson content and generating narration are separate actions.",
      ],
      [
        "Do failed attempts count?",
        "Admitted generation attempts count even when they fail. If a request fails, check the page status before retrying. Saved content remains available when your daily allowance is exhausted.",
      ],
      [
        "When do limits reset?",
        "At midnight UTC each day. The detailed usage panel shows the reset time in your local time zone. Unused allowances do not carry over, and upgrading keeps the usage already recorded today.",
      ],
    ],
  },
  {
    id: "subscriptions",
    title: "Plans & billing",
    questions: [
      [
        "What changes with Pro?",
        "Pro increases daily generation allowances. Free and Pro accounts share saved courses, learning progress, practice quizzes and PDF export. See Pricing for current server-supplied prices and limits.",
      ],
      [
        "What happens if I cancel renewal?",
        "Future renewals stop. Any verified time already paid for remains available until its expiry. Use Plan & billing to cancel renewal or refresh subscription status. The paid-access expiry is not a guaranteed next charge date.",
      ],
      [
        "How long does a subscription renew?",
        "Subscriptions renew monthly until cancelled or the configured final billing cycle. Pricing and Plan & billing show the current maximum number of cycles.",
      ],
    ],
  },
];
