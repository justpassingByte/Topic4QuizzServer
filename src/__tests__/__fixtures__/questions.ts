import { Question } from '../../interfaces/quiz.interface';

export const sampleQuestions: Question[] = [
  {
    id: 'q1',
    type: 'multiple-choice',
    question: 'What is the output of console.log(typeof null) in JavaScript?',
    options: ['null', 'undefined', 'object', 'number'],
    correctAnswer: 'object',
    explanation: 'In JavaScript, typeof null returns "object", which is considered a historical bug.',
    difficulty: 'intermediate',
    topics: ['javascript', 'types'],
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  },
  {
    id: 'q2',
    type: 'true-false',
    question: 'JavaScript is a statically typed language.',
    options: ['True', 'False'],
    correctAnswer: 'False',
    explanation: 'JavaScript is a dynamically typed language, meaning variable types are determined at runtime.',
    difficulty: 'beginner',
    topics: ['javascript', 'programming-basics'],
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  },
  {
    id: 'q3',
    type: 'coding',
    question: 'Write a function that reverses a string without using the built-in reverse() method.',
    correctAnswer: `function reverseString(str) {
  return str.split('').reduce((rev, char) => char + rev, '');
}`,
    difficulty: 'intermediate',
    topics: ['javascript', 'algorithms', 'strings'],
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  }
]; 