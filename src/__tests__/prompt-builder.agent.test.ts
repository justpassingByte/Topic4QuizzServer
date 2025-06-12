import { PromptBuilderAgent } from '../agents/prompt-builder.agent';

describe('PromptBuilderAgent', () => {
  let agent: PromptBuilderAgent;

  beforeEach(() => {
    const mockModelAdapter = {} as any;
    const mockModelConfig = {} as any;
    agent = new PromptBuilderAgent(mockModelAdapter, mockModelConfig);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  // ... test các hàm chính khác
}); 