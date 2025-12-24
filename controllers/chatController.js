const Groq = require('groq-sdk');
const Conversation = require('../models/Conversation');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

exports.sendMessage = async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Find or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
    } else {
      conversation = new Conversation({
        title: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message
    });

    // Build messages for Groq
    const messages = conversation.messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));

    console.log('Sending request to Groq...');

    // Generate response with Groq
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // Fast and powerful
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 1,
      stream: false
    });

    const aiResponse = completion.choices[0].message.content;

    console.log('Response received from Groq');

    // Add AI response
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse
    });

    conversation.updatedAt = Date.now();
    await conversation.save();

    res.json({
      success: true,
      conversationId: conversation._id,
      message: aiResponse,
      conversation: conversation
    });

  } catch (error) {
    console.error('Groq Error:', error);
    
    let errorMessage = 'An error occurred while processing your request';
    
    if (error.message?.includes('api_key')) {
      errorMessage = 'Invalid Groq API key. Please check your .env file';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};