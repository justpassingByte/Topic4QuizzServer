import { ContextAnalyzer } from '../agents/context-analyzer.agent';

describe('ContextAnalyzer', () => {
  let agent: ContextAnalyzer;

  beforeEach(() => {
    const mockModelConfig = {} as any;
    const mockModelAdapter = {} as any;
    agent = new ContextAnalyzer(mockModelConfig, mockModelAdapter);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  // ... test các hàm chính khác
}); 