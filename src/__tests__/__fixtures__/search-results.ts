export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
  source: string;
  timestamp: Date;
}

export const sampleSearchResults: SearchResult[] = [
  {
    id: 'sr1',
    title: 'JavaScript Type Coercion Explained',
    url: 'https://example.com/js-types',
    snippet: 'Type coercion is the automatic conversion of values from one data type to another. In JavaScript, type coercion happens when...',
    relevanceScore: 0.95,
    source: 'MDN Web Docs',
    timestamp: new Date('2024-01-01')
  },
  {
    id: 'sr2',
    title: 'Understanding JavaScript Data Types',
    url: 'https://example.com/js-data-types',
    snippet: 'JavaScript has 8 basic data types: number, string, boolean, null, undefined, object, symbol, and bigint...',
    relevanceScore: 0.88,
    source: 'JavaScript.info',
    timestamp: new Date('2024-01-01')
  },
  {
    id: 'sr3',
    title: 'Common JavaScript Interview Questions',
    url: 'https://example.com/js-interview',
    snippet: 'Top JavaScript interview questions covering topics like closures, hoisting, prototypes, and common coding challenges...',
    relevanceScore: 0.75,
    source: 'Dev.to',
    timestamp: new Date('2024-01-01')
  }
]; 