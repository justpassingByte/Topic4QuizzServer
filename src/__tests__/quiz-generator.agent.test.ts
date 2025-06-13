import { QuizGeneratorAgent } from '../agents/quiz-generator.agent';

describe('QuizGeneratorAgent', () => {
  let agent: QuizGeneratorAgent;

  beforeEach(() => {
    const mockModelAdapter = {} as any;
    const mockModelConfig = {} as any;
    agent = new QuizGeneratorAgent(mockModelAdapter, mockModelConfig);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  // ... test các hàm chính khác
}); 