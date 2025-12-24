const Conversation = require('../models/Conversation');

exports.getAllConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .sort({ updatedAt: -1 })
      .select('title createdAt updatedAt');
    
    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    await Conversation.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Conversation deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const conversation = new Conversation({
      title: req.body.title || 'New Chat'
    });
    
    await conversation.save();
    
    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};