const { Router } = require('express');
const executionController = require('../controllers/executionController');
const auth = require('../middleware/auth');

const router = Router();
router.use(auth);

router.get('/', executionController.list);
router.get('/:id', executionController.get);
router.get('/:id/timeline', executionController.getTimeline);
router.post('/:id/pause', executionController.pause);
router.post('/:id/resume', executionController.resume);
router.post('/:id/cancel', executionController.cancel);

module.exports = router;
