const { Router } = require('express');
const { body } = require('express-validator');
const wfController = require('../controllers/workflowController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = Router();

router.use(auth);

router.get('/dashboard', wfController.getDashboard);
router.get('/dashboard/active-debug', wfController.getDashboardActiveDebug);
router.post(
  '/generate',
  [body('prompt').trim().notEmpty().withMessage('Prompt is required')],
  validate,
  wfController.generate
);
router.get('/', wfController.list);
router.post(
  '/',
  [body('name').trim().notEmpty().withMessage('Workflow name is required')],
  validate,
  wfController.create
);
router.get('/:id', wfController.get);
router.put('/:id', wfController.update);
router.post('/:id/restore', wfController.restoreVersion);
router.post('/:id/duplicate', wfController.duplicate);
router.post('/:id/execute', wfController.execute);
router.delete('/:id', wfController.remove);

module.exports = router;
