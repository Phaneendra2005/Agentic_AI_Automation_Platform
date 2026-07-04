const { Router } = require('express');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

const router = Router();
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, notifications });
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { read: true },
      { new: true }
    );
    res.json({ success: true, notification: n });
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ owner: req.user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
