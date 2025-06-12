export interface ContextData {
  id: string;
  topic: string;
  subtopics: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  learningObjectives: string[];
  keyTerms: { term: string; definition: string }[];
  created: Date;
  updated: Date;
}

export const sampleContextData: ContextData[] = [
  {
    id: 'ctx1',
    topic: 'JavaScript Fundamentals',
    subtopics: ['Data Types', 'Variables', 'Functions', 'Control Flow'],
    difficulty: 'beginner',
    prerequisites: ['Basic Computer Knowledge', 'HTML Basics'],
    learningObjectives: [
      'Understand basic JavaScript syntax',
      'Work with different data types',
      'Create and use functions',
      'Implement control flow statements'
    ],
    keyTerms: [
      {
        term: 'Variable',
        definition: 'A container for storing data values'
      },
      {
        term: 'Function',
        definition: 'A reusable block of code that performs a specific task'
      },
      {
        term: 'Control Flow',
        definition: 'The order in which individual statements are executed'
      }
    ],
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  },
  {
    id: 'ctx2',
    topic: 'Advanced JavaScript Concepts',
    subtopics: ['Closures', 'Prototypes', 'Async Programming', 'Design Patterns'],
    difficulty: 'advanced',
    prerequisites: ['JavaScript Fundamentals', 'ES6 Features'],
    learningObjectives: [
      'Understand closure scope and implementation',
      'Work with prototype inheritance',
      'Master asynchronous programming concepts',
      'Implement common design patterns'
    ],
    keyTerms: [
      {
        term: 'Closure',
        definition: 'A function that has access to variables in its outer scope'
      },
      {
        term: 'Prototype',
        definition: 'The mechanism by which JavaScript objects inherit features from one another'
      },
      {
        term: 'Promise',
        definition: 'An object representing the eventual completion of an asynchronous operation'
      }
    ],
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  }
]; 