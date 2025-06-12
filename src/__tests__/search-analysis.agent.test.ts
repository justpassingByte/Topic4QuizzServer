import { SearchAnalysisAgent } from '../agents/search-analysis.agent';

describe('SearchAnalysisAgent', () => {
  let agent: SearchAnalysisAgent;

  beforeEach(() => {
    const mockModelConfig = {} as any;
    const mockModelAdapter = {} as any;
    agent = new SearchAnalysisAgent(mockModelConfig, mockModelAdapter, '');
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  // ... test các hàm chính khác
}); 