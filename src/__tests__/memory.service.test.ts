import { MemoryService } from '../services/memory.service';

describe('MemoryService', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    memoryService = new MemoryService();
  });

  it('should be defined', () => {
    expect(memoryService).toBeDefined();
  });

  // ... test các hàm chính khác
}); 