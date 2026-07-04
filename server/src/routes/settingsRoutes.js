const { Router } = require('express');
const { body } = require('express-validator');
const settingsController = require('../controllers/settingsController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = Router();
router.use(auth);

router.get('/', settingsController.getSettings);
router.put(
  '/profile',
  [
    body('name').trim().notEmpty().withMessage('Full name is required').isLength({ max: 100 }),
    body('avatarData').optional({ nullable: true }).isString(),
  ],
  validate,
  settingsController.updateProfile
);
router.put(
  '/password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').notEmpty().withMessage('New password is required'),
    body('confirmPassword').notEmpty().withMessage('Confirm password is required'),
  ],
  validate,
  settingsController.updatePassword
);
router.put('/theme', [body('theme').isIn(['dark', 'light', 'system'])], validate, settingsController.updateTheme);
router.put('/notifications', settingsController.updateNotifications);
router.post('/logout-all', settingsController.logoutAll);
router.get('/health', settingsController.getHealth);
router.get('/api-keys', settingsController.getApiKeys);
router.get('/integrations', settingsController.getIntegrations);
router.post('/integrations/:provider/disconnect', settingsController.disconnectIntegration);
router.post('/integrations/:provider/reconnect', settingsController.reconnectIntegration);
router.post('/integrations/:provider/test', settingsController.testIntegration);

module.exports = router;
