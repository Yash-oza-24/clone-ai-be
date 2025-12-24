const express = require('express');
const router = express.Router();
const {
  getAllConversations,
  getConversation,
  deleteConversation,
  createConversation
} = require('../controllers/conversationController');

router.get('/', getAllConversations);
router.get('/:id', getConversation);
router.delete('/:id', deleteConversation);
router.post('/', createConversation);

module.exports = router;