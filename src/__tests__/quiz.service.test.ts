import { QuizService } from '../services/quiz.service';

describe('QuizService', () => {
  let quizService: QuizService;

  beforeEach(() => {
    quizService = new QuizService();
  });

  it('should be defined', () => {
    expect(quizService).toBeDefined();
  });

  // ... test các hàm chính khác
}); 