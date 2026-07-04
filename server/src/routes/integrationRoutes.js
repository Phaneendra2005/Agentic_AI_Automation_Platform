const { Router } = require('express');
const integrationController = require('../controllers/integrationController');
const auth = require('../middleware/auth');

const router = Router();

// Public — these two routes are hit by the OAuth provider's browser redirect;
// there is no JWT in those requests by design.
router.get('/oauth/:provider/callback', integrationController.oauthCallback);
router.get('/oauth/error', integrationController.oauthError);

// Everything below requires a valid JWT.
router.use(auth);

router.get('/', integrationController.list);
router.get('/status', integrationController.getStatus);
router.get('/oauth/:provider/start', integrationController.oauthStart);
router.post('/', integrationController.upsert);
router.delete('/:provider', integrationController.disconnect);

module.exports = router;
