import { UserService } from '../services/user.service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  it('should be defined', () => {
    expect(userService).toBeDefined();
  });

  // ... test các hàm chính khác
}); 