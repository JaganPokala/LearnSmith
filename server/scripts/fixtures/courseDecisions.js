const course = {
  title: 'Introduction to SQL',
  description: 'Learn to query a relational database.',
  tags: ['SQL'],
  modules: Array.from({ length: 3 }, (_, module) => ({
    title: `Topic ${module + 1}`,
    lessons: Array.from({ length: 3 }, (_, lesson) => ({ title: `Lesson ${lesson + 1}` })),
  })),
};

export const ready = { status: 'ready', reasonCode: 'valid', course, message: '', suggestions: [] };
export const clarify = {
  status: 'needs_clarification', reasonCode: 'ambiguous', course: null,
  message: 'Which Mercury would you like to learn about?',
  suggestions: ['The planet Mercury', 'The chemical element mercury'],
};
export const rejected = {
  status: 'rejected', reasonCode: 'meaningless', course: null,
  message: 'Enter a recognizable subject, such as SQL.', suggestions: [],
};
