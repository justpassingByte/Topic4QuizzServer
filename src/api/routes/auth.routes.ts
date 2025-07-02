import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../../services/user.service';

const router = Router();
// Giả sử UserController có phương thức loginUser
const userController = new UserController(new UserService());

router.post('/login', userController.loginUser);

export default router; 