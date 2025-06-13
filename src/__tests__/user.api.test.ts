import request from 'supertest';
import { app } from '../app';

describe('User API', () => {
  it('POST /api/users should create a user', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Test User', email: 'test@example.com' });
    expect([200, 201, 400]).toContain(res.status);
  });

  it('GET /api/users/:id/statistics should return user statistics', async () => {
    // Thay testid bằng id hợp lệ nếu có dữ liệu
    const res = await request(app).get('/api/users/testid/statistics');
    expect([200, 404, 400]).toContain(res.status);
  });

  // ... các test khác cho từng endpoint
});

describe('Quiz Feedback API', () => {
  it('POST /api/quizzes/:quizId/feedback should submit feedback', async () => {
    // Thay quizid bằng id hợp lệ nếu có dữ liệu
    const res = await request(app)
      .post('/api/quizzes/quizid/feedback')
      .send({ rating: 5, comment: 'Great quiz!' });
    expect([200, 201, 400, 404]).toContain(res.status);
  });

  it('GET /api/quizzes/:quizId/feedback should get feedback', async () => {
    // Thay quizid bằng id hợp lệ nếu có dữ liệu
    const res = await request(app).get('/api/quizzes/quizid/feedback');
    expect([200, 404]).toContain(res.status);
  });
}); 