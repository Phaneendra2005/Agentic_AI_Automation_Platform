const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

router.get('/me', auth, authController.getMe);

module.exports = router;
