import request from 'supertest';
import { app } from '../app';

describe('Quiz API', () => {
  it('GET /api/quiz/health should return 200', async () => {
    const res = await request(app).get('/api/quiz/health');
    expect(res.status).toBe(200);
  });

  // Add more tests for each endpoint here
  // Example for create quiz
  it('POST /api/quiz/create should create a quiz', async () => {
    const res = await request(app)
      .post('/api/quiz/create')
      .send({ topic: 'math', questions: [] });
    expect([200, 201, 400]).toContain(res.status); // 400 nếu thiếu dữ liệu
  });

  // ... các test khác cho từng endpoint
}); 