export interface User {
  id: string;
  username: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  created: Date;
  updated: Date;
  preferences?: {
    language: string;
    notifications: boolean;
    timezone: string;
  };
}

export const sampleUsers: User[] = [
  {
    id: 'user1',
    username: 'john_doe',
    email: 'john@example.com',
    role: 'student',
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01'),
    preferences: {
      language: 'en',
      notifications: true,
      timezone: 'UTC'
    }
  },
  {
    id: 'user2',
    username: 'jane_smith',
    email: 'jane@example.com',
    role: 'teacher',
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01'),
    preferences: {
      language: 'en',
      notifications: true,
      timezone: 'UTC+7'
    }
  },
  {
    id: 'user3',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  }
]; 